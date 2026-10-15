import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TICK_DAUER_S } from '../gemeinsam/konstanten.js';
import { AKTIONEN, ADMIN_BEFEHLE } from '../gemeinsam/protokoll.js';
import { UNBEWAFFNET } from '../server/spiel/konfiguration/gegenstaende.js';
import { strahlGegenWaende, sichtlinieFrei } from '../gemeinsam/physik/strahl.js';
import { erstelleKonfiguration } from '../server/spiel/konfiguration/spielKonfiguration.js';
import { SpielWelt } from '../server/spiel/spielWelt.js';
import { erzeugeGegenstand } from '../server/spiel/entitaeten/gegenstand.js';
import { erzeugeZombie, waehleZombieVariante } from '../server/spiel/entitaeten/zombie.js';
import { findePfad } from '../server/spiel/systeme/pfadfindung.js';
import { wendeEingabeAn } from '../gemeinsam/physik/bewegung.js';
import { Zufall } from '../server/spiel/zufall.js';
import { tageszeit } from '../gemeinsam/tageszeit.js';

// Kachel = 32 px. Wand in Spalte 5 (Zeilen 3–5) trennt links/rechts teilweise.
const TESTKARTE = {
  id: 'test',
  name: 'Testraum',
  kacheln: [
    '##############',
    '#S...........#',
    '#............#',
    '#....#.......#',
    '#....#.......#',
    '#....#.......#',
    '#............#',
    '##############',
  ],
  raeume: {},
};
const K = 32;
const mitte = (t) => t * K + K / 2;

function neueWelt(ueberschreibungen = {}) {
  const konfiguration = erstelleKonfiguration({ server: { zufallsStartwert: 7 }, ...ueberschreibungen });
  const welt = new SpielWelt(konfiguration, { kartenDefinition: TESTKARTE });
  const spieler = welt.spielerBetrittWelt('Tester');
  return { welt, spieler, konfiguration };
}

function ticks(welt, anzahl) {
  for (let i = 0; i < anzahl; i++) welt.aktualisiere(TICK_DAUER_S);
}

function platziere(entitaet, tx, ty) {
  entitaet.x = mitte(tx);
  entitaet.y = mitte(ty);
}

function zombieBei(welt, tx, ty) {
  return welt.hinzufuegen(erzeugeZombie({ id: welt.neueId(), x: mitte(tx), y: mitte(ty), konfiguration: welt.konfiguration, blick: 0 }));
}

function gegenstandBei(welt, defId, x, y, extra = {}) {
  return welt.hinzufuegen(erzeugeGegenstand({ id: welt.neueId(), defId, x, y, ...extra }));
}

// ---------------------------------------------------------------------------
// Strahlen & Pfade

test('Strahl stoppt an der Wand', () => {
  const { welt } = neueWelt();
  const treffer = strahlGegenWaende(welt.welt, mitte(2), mitte(4), 0, 1000);
  assert.ok(treffer.getroffen);
  assert.equal(Math.round(treffer.x), 5 * K);
  assert.equal(sichtlinieFrei(welt.welt, mitte(2), mitte(4), mitte(8), mitte(4)), false);
  assert.equal(sichtlinieFrei(welt.welt, mitte(2), mitte(1), mitte(8), mitte(1)), true);
});

test('A* findet den Weg um die Wand herum', () => {
  const { welt } = neueWelt();
  const pfad = findePfad(welt.welt, mitte(3), mitte(4), mitte(8), mitte(4));
  assert.ok(pfad && pfad.length > 0);
  for (const p of pfad) assert.equal(welt.welt.istBlockiert(Math.floor(p.x / K), Math.floor(p.y / K)), false);
  assert.deepEqual(pfad.at(-1), { x: mitte(8), y: mitte(4) });
});

// ---------------------------------------------------------------------------
// Inventar

test('Aufheben: Waffe landet im Inventar und wird automatisch ausgerüstet', () => {
  const { welt, spieler } = neueWelt();
  platziere(spieler, 3, 2);
  gegenstandBei(welt, 'pistole', spieler.x + 10, spieler.y, { magazin: 4 });
  spieler.aktionsPuffer.push({ art: AKTIONEN.AUFHEBEN, slot: null });
  ticks(welt, 1);
  assert.deepEqual(spieler.inventar[0], { defId: 'pistole', menge: 1, magazin: 4 });
  assert.equal(spieler.ausgeruestet, 0);
  assert.equal(spieler.ausruestung, 'pistole');
  assert.equal(welt.anzahlVomTyp('gegenstand'), 0);
});

test('Aufheben: zu weit weg → nichts passiert', () => {
  const { welt, spieler } = neueWelt();
  platziere(spieler, 2, 2);
  gegenstandBei(welt, 'apfel', spieler.x + 200, spieler.y);
  spieler.aktionsPuffer.push({ art: AKTIONEN.AUFHEBEN, slot: null });
  ticks(welt, 1);
  assert.equal(spieler.inventar[0], null);
});

test('Munition wird gestapelt, volles Inventar wird gemeldet', () => {
  const { welt, spieler } = neueWelt();
  platziere(spieler, 3, 2);
  gegenstandBei(welt, 'munition_9mm', spieler.x, spieler.y, { menge: 20 });
  spieler.aktionsPuffer.push({ art: AKTIONEN.AUFHEBEN });
  ticks(welt, 1);
  gegenstandBei(welt, 'munition_9mm', spieler.x, spieler.y, { menge: 25 });
  spieler.aktionsPuffer.push({ art: AKTIONEN.AUFHEBEN });
  ticks(welt, 1);
  assert.deepEqual(spieler.inventar[0], { defId: 'munition_9mm', menge: 45 });
  assert.equal(spieler.inventar[1], null);

  for (let i = 1; i < 8; i++) spieler.inventar[i] = { defId: 'hammer', menge: 1 };
  gegenstandBei(welt, 'machete', spieler.x, spieler.y);
  spieler.aktionsPuffer.push({ art: AKTIONEN.AUFHEBEN });
  welt.aktualisiere(TICK_DAUER_S);
  assert.ok(welt.meldungen.some((m) => m.text === 'Inventar voll'));
});

test('Essen, Trinken und Medizin wirken und werden verbraucht', () => {
  const { welt, spieler } = neueWelt();
  spieler.hunger = 40;
  spieler.durst = 40;
  spieler.leben = 50;
  spieler.inventar[0] = { defId: 'konservendose', menge: 2 };
  spieler.inventar[1] = { defId: 'wasserflasche', menge: 1 };
  spieler.inventar[2] = { defId: 'verband', menge: 1 };
  for (const slot of [0, 1, 2]) spieler.aktionsPuffer.push({ art: AKTIONEN.BENUTZEN, slot });
  ticks(welt, 1);
  assert.ok(spieler.hunger > 74);
  assert.ok(spieler.durst > 79);
  assert.ok(spieler.leben >= 65);
  assert.equal(spieler.inventar[0].menge, 1);
  assert.equal(spieler.inventar[1], null);
  assert.equal(spieler.inventar[2], null);
});

test('Nachladen füllt das Magazin aus der Munition im Inventar', () => {
  const { welt, spieler } = neueWelt();
  spieler.inventar[0] = { defId: 'pistole', menge: 1, magazin: 0 };
  spieler.inventar[1] = { defId: 'munition_9mm', menge: 20 };
  spieler.ausgeruestet = 0;
  spieler.aktionsPuffer.push({ art: AKTIONEN.NACHLADEN });
  ticks(welt, 1);
  assert.ok(spieler.nachladenRest > 0);
  ticks(welt, Math.ceil(1.2 / TICK_DAUER_S));
  assert.equal(spieler.inventar[0].magazin, 15);
  assert.equal(spieler.inventar[1].menge, 5);
});

// ---------------------------------------------------------------------------
// Kampf

function bewaffne(spieler, magazin = 15) {
  spieler.inventar[0] = { defId: 'pistole', menge: 1, magazin };
  spieler.ausgeruestet = 0;
  spieler.ausruestung = 'pistole';
}

test('Schuss trifft Zombie in Schusslinie', () => {
  const { welt, spieler } = neueWelt();
  welt.konfiguration.zombie.aggroRadius = 0; // Zombie soll stillhalten
  platziere(spieler, 2, 1);
  const zombie = zombieBei(welt, 9, 1);
  bewaffne(spieler);
  spieler.blick = 0;
  spieler.angriff = true;
  welt.aktualisiere(TICK_DAUER_S);
  assert.equal(zombie.leben, 60 - 25);
  assert.equal(spieler.inventar[0].magazin, 14);
  assert.ok(welt.ereignisse.some((e) => e.typ === 'schuss'));
  assert.ok(welt.ereignisse.some((e) => e.typ === 'treffer'));
});

test('Wände halten Kugeln auf', () => {
  const { welt, spieler } = neueWelt();
  platziere(spieler, 3, 4);
  const zombie = zombieBei(welt, 8, 4);
  bewaffne(spieler);
  spieler.blick = 0;
  spieler.angriff = true;
  welt.aktualisiere(TICK_DAUER_S);
  assert.equal(zombie.leben, 60);
});

test('Zombie stirbt, verschwindet und wird zum Respawn vorgemerkt', () => {
  const { welt, spieler } = neueWelt();
  welt.konfiguration.zombie.aggroRadius = 0;
  platziere(spieler, 2, 1);
  const zombie = zombieBei(welt, 9, 1);
  zombie.spawnIndex = 0;
  bewaffne(spieler);
  spieler.blick = 0;
  spieler.angriff = true;
  ticks(welt, Math.ceil(1.2 / TICK_DAUER_S));
  assert.equal(welt.holen(zombie.id), undefined);
  assert.equal(welt.zombieRespawns.length, 1);
});

test('Nahkampf trifft nur im Kegel vor dem Spieler', () => {
  const { welt, spieler } = neueWelt();
  welt.konfiguration.zombie.aggroRadius = 0;
  platziere(spieler, 6, 1);
  const vorne = zombieBei(welt, 7, 1);
  const hinten = zombieBei(welt, 5, 1);
  vorne.x -= 4; // Abstand ~28 px
  spieler.blick = 0;
  spieler.angriff = true;
  welt.aktualisiere(TICK_DAUER_S);
  assert.equal(vorne.leben, 60 - UNBEWAFFNET.schaden);
  assert.equal(hinten.leben, 60);
});

test('Leeres Magazin ohne Munition → "leer"-Klick statt Schuss', () => {
  const { welt, spieler } = neueWelt();
  bewaffne(spieler, 0);
  spieler.angriff = true;
  welt.aktualisiere(TICK_DAUER_S);
  assert.ok(welt.ereignisse.some((e) => e.typ === 'leer'));
  assert.ok(!welt.ereignisse.some((e) => e.typ === 'schuss'));
});

// ---------------------------------------------------------------------------
// Zombie-KI

test('Zombie bemerkt Spieler in Sichtweite, läuft hin und beißt', () => {
  const { welt, spieler } = neueWelt();
  platziere(spieler, 2, 1);
  const zombie = zombieBei(welt, 8, 1);
  const startAbstand = zombie.x - spieler.x;
  ticks(welt, 10);
  assert.equal(zombie.zustand, 'verfolgend');
  assert.ok(zombie.x - spieler.x < startAbstand);
  ticks(welt, 90);
  assert.ok(spieler.leben < 100, 'Spieler sollte gebissen worden sein');
});

test('Zombie hinter Wand sieht Spieler nicht – hört aber Schüsse', () => {
  const { welt, spieler } = neueWelt();
  platziere(spieler, 3, 4);
  const zombie = zombieBei(welt, 7, 4);
  ticks(welt, 10);
  assert.equal(zombie.zustand, 'ruhend');

  bewaffne(spieler);
  spieler.blick = Math.PI; // in die andere Richtung schießen
  spieler.angriff = true;
  welt.aktualisiere(TICK_DAUER_S);
  spieler.angriff = false;
  ticks(welt, 60);
  assert.equal(zombie.zustand === 'verfolgend' || zombie.zustand === 'angreifend', true);
  assert.ok(Math.hypot(zombie.x - spieler.x, zombie.y - spieler.y) < 4 * K - 10, 'Zombie sollte um die Wand herumgelaufen sein');
});

// ---------------------------------------------------------------------------
// Überleben, Tod & Respawn

test('Verhungern kostet Leben, Tod lässt Inventar fallen, danach Respawn', () => {
  const { welt, spieler, konfiguration } = neueWelt();
  welt.konfiguration.zombie.aggroRadius = 0;
  spieler.hunger = 0;
  spieler.leben = 1;
  spieler.inventar[0] = { defId: 'apfel', menge: 3 };
  spieler.inventar[3] = { defId: 'machete', menge: 1 };
  ticks(welt, Math.ceil(2.5 / TICK_DAUER_S));
  assert.equal(spieler.tot, true);
  assert.deepEqual(spieler.inventar.filter(Boolean), []);
  assert.equal(welt.anzahlVomTyp('gegenstand'), 2);

  ticks(welt, Math.ceil((konfiguration.spieler.respawnZeit + 0.5) / TICK_DAUER_S));
  assert.equal(spieler.tot, false);
  assert.equal(spieler.leben, spieler.maxLeben);
});

test('Satt und getränkt regeneriert Leben', () => {
  const { welt, spieler } = neueWelt();
  welt.konfiguration.zombie.aggroRadius = 0;
  spieler.hunger = 100;
  spieler.durst = 100;
  spieler.leben = 50;
  ticks(welt, Math.ceil(4 / TICK_DAUER_S));
  assert.ok(spieler.leben > 50.5);
});

test('Zombie läuft um ein Möbelstück herum, statt dagegen zu laufen', () => {
  // Spieler unten, Zombie oben, dazwischen ein "Auto" (blockierendes Objekt) – Sicht frei, Weg nicht
  const karte = {
    ...TESTKARTE,
    objekte: [{ typ: 'auto_rot', x: 4, y: 3, b: 5, h: 2, blockiert: true }],
  };
  const konfiguration = erstelleKonfiguration({ server: { zufallsStartwert: 7 } });
  const welt = new SpielWelt(konfiguration, { kartenDefinition: karte });
  const spieler = welt.spielerBetrittWelt('Tester');
  platziere(spieler, 7, 6);
  const zombie = zombieBei(welt, 7, 1);
  ticks(welt, Math.ceil(6 / TICK_DAUER_S));
  assert.ok(Math.hypot(zombie.x - spieler.x, zombie.y - spieler.y) < 45, `Zombie hängt bei ${Math.round(zombie.x)}|${Math.round(zombie.y)}`);
  assert.ok(spieler.leben < 100);
});

// ---------------------------------------------------------------------------
// Sprinten, Zombie-Varianten, Umherschlurfen

test('Sprinten ist schneller, verbraucht Ausdauer und erschöpft', () => {
  const { welt } = neueWelt();
  const p = welt.physikParameter();
  const gehend = { x: mitte(2), y: mitte(1), blick: 0 };
  const rennend = { x: mitte(2), y: mitte(1), blick: 0 };
  for (let i = 0; i < 10; i++) {
    wendeEingabeAn(gehend, { x: 1, y: 0 }, welt.welt, p, TICK_DAUER_S);
    wendeEingabeAn(rennend, { x: 1, y: 0, sprint: true }, welt.welt, p, TICK_DAUER_S);
  }
  assert.ok(rennend.x - gehend.x > 20, 'Sprinter sollte deutlich weiter sein');
  assert.ok(rennend.ausdauer < p.ausdauerMax);

  // Bis zur Erschöpfung sprinten → danach nur noch normales Tempo
  const k = { x: mitte(2), y: mitte(1), blick: 0, ausdauer: 1, erschoepft: false };
  for (let i = 0; i < 5; i++) wendeEingabeAn(k, { x: 0, y: 1, sprint: true }, welt.welt, p, TICK_DAUER_S);
  assert.equal(k.erschoepft, true);
  const vorher = k.y;
  wendeEingabeAn(k, { x: 0, y: 1, sprint: true }, welt.welt, p, TICK_DAUER_S);
  assert.ok(Math.abs(k.y - vorher - p.geschwindigkeit * TICK_DAUER_S) < 0.001, 'Erschöpft: nur normales Tempo');
});

test('Server und Client rechnen Sprint identisch (Vorhersage bleibt synchron)', () => {
  const { welt } = neueWelt();
  const p = welt.physikParameter();
  const server = { x: mitte(2), y: mitte(2), blick: 0 };
  const client = { x: mitte(2), y: mitte(2), blick: 0 };
  const eingaben = Array.from({ length: 200 }, (_, i) => ({ x: Math.sin(i / 7), y: Math.cos(i / 11), sprint: i % 40 < 30 }));
  for (const e of eingaben) wendeEingabeAn(server, e, welt.welt, p, TICK_DAUER_S);
  for (const e of eingaben) wendeEingabeAn(client, e, welt.welt, p, TICK_DAUER_S);
  assert.deepEqual(client, server);
});

test('Sprinten lockt Zombies in der Nähe an – auch hinter der Wand', () => {
  const { welt, spieler } = neueWelt();
  platziere(spieler, 3, 4);
  const zombie = zombieBei(welt, 7, 4);
  for (let i = 0; i < 5; i++) spieler.eingabePuffer.push({ seq: i + 1, x: 0, y: -1, blick: 0, sprint: true });
  ticks(welt, 1);
  assert.equal(zombie.zielId, spieler.id);
});

test('Zombie-Varianten: Läufer schnell & schwach, Brocken langsam & zäh', () => {
  const { welt } = neueWelt();
  const k = welt.konfiguration;
  const laeufer = erzeugeZombie({ id: 1, x: 0, y: 0, konfiguration: k, variante: 'laeufer' });
  const brocken = erzeugeZombie({ id: 2, x: 0, y: 0, konfiguration: k, variante: 'brocken' });
  const normal = erzeugeZombie({ id: 3, x: 0, y: 0, konfiguration: k });
  assert.ok(laeufer.jagdGeschwindigkeit > normal.jagdGeschwindigkeit && laeufer.maxLeben < normal.maxLeben);
  assert.ok(brocken.jagdGeschwindigkeit < normal.jagdGeschwindigkeit && brocken.maxLeben > normal.maxLeben);
  assert.ok(brocken.radius <= 15, 'Brocken muss durch 1 Kachel breite Lücken passen');

  const zaehler = { normal: 0, laeufer: 0, brocken: 0 };
  const zufall = new Zufall(1);
  for (let i = 0; i < 900; i++) zaehler[waehleZombieVariante(zufall, k)]++;
  assert.ok(zaehler.normal > zaehler.laeufer && zaehler.laeufer > zaehler.brocken && zaehler.brocken > 0);
});

test('Ruhende Zombies schlurfen herum, bleiben aber in der Nähe ihres Spawns', () => {
  const { welt, spieler } = neueWelt();
  platziere(spieler, 1, 6);
  welt.konfiguration.zombie.aggroRadius = 0;
  const zombie = zombieBei(welt, 9, 2);
  zombie.wanderTimer = 0;
  let maxAbstand = 0;
  let bewegt = false;
  for (let i = 0; i < Math.ceil(30 / TICK_DAUER_S); i++) {
    const vorher = zombie.x + zombie.y;
    welt.aktualisiere(TICK_DAUER_S);
    if (zombie.x + zombie.y !== vorher) bewegt = true;
    maxAbstand = Math.max(maxAbstand, Math.hypot(zombie.x - zombie.spawnX, zombie.y - zombie.spawnY));
  }
  assert.ok(bewegt, 'Zombie sollte sich bewegt haben');
  assert.equal(zombie.zustand, 'ruhend');
  assert.ok(maxAbstand <= welt.konfiguration.zombie.wanderRadius + 5);
});

// ---------------------------------------------------------------------------
// Faust, Taschenlampe, Wiederbeleben, Admin

test('Faust macht wenig Schaden – deutlich weniger als jede Nahkampfwaffe', () => {
  assert.equal(UNBEWAFFNET.name, 'Faust');
  assert.ok(UNBEWAFFNET.schaden <= 6);
});

test('Nachts mit Taschenlampe aus → Zombie bemerkt den Spieler erst aus der Nähe', () => {
  const { welt, spieler, konfiguration } = neueWelt();
  welt.zeit = konfiguration.welt.tagSekunden + 10; // Nacht
  platziere(spieler, 1, 1);
  const zombie = zombieBei(welt, 6, 1); // 160 px: innerhalb aggroRadius, außerhalb aggroRadius × dunkelFaktor
  assert.ok(160 < konfiguration.zombie.aggroRadius && 160 > konfiguration.zombie.aggroRadius * konfiguration.zombie.dunkelFaktor);
  welt.aktualisiere(TICK_DAUER_S);
  assert.equal(welt.istNacht, true);
  zombie.zielId = null;
  spieler.aktionsPuffer.push({ art: AKTIONEN.LICHT, slot: null });
  welt.aktualisiere(TICK_DAUER_S);
  assert.equal(spieler.lichtAn, false);
  assert.equal(zombie.zielId, null, 'im Dunkeln unbemerkt');
  spieler.aktionsPuffer.push({ art: AKTIONEN.LICHT, slot: null });
  welt.aktualisiere(TICK_DAUER_S);
  assert.equal(spieler.lichtAn, true);
  assert.equal(zombie.zielId, spieler.id, 'mit Licht sofort gesehen');
});

test('Tot → Wiederbeleben-Knopf spawnt sofort, lebend passiert nichts', () => {
  const { welt, spieler } = neueWelt();
  platziere(spieler, 8, 4);
  spieler.aktionsPuffer.push({ art: AKTIONEN.WIEDERBELEBEN, slot: null });
  welt.aktualisiere(TICK_DAUER_S);
  assert.equal(spieler.x, mitte(8), 'lebend: kein Teleport');
  spieler.leben = 1;
  zombieBei(welt, 9, 4).blick = Math.PI;
  ticks(welt, 3);
  assert.equal(spieler.tot, true);
  spieler.aktionsPuffer.push({ art: AKTIONEN.WIEDERBELEBEN, slot: null });
  welt.aktualisiere(TICK_DAUER_S);
  assert.equal(spieler.tot, false);
  assert.equal(spieler.leben, spieler.maxLeben);
});

test('Admin-Befehle nur mit Admin-Recht; Gottmodus verhindert Schaden und Hunger', () => {
  const { welt, spieler } = neueWelt();
  const admin = (befehl, s = spieler) => s.aktionsPuffer.push({ art: AKTIONEN.ADMIN, slot: null, befehl });
  admin(ADMIN_BEFEHLE.GOTTMODUS);
  welt.aktualisiere(TICK_DAUER_S);
  assert.equal(spieler.gottmodus, false, 'ohne Admin-Recht wirkungslos');

  spieler.admin = true;
  admin(ADMIN_BEFEHLE.GOTTMODUS);
  platziere(spieler, 8, 4);
  const hunger = spieler.hunger;
  zombieBei(welt, 9, 4).blick = Math.PI;
  ticks(welt, Math.ceil(3 / TICK_DAUER_S));
  assert.equal(spieler.gottmodus, true);
  assert.equal(spieler.leben, spieler.maxLeben);
  assert.equal(spieler.hunger, hunger);

  admin(ADMIN_BEFEHLE.ZOMBIES_TOETEN);
  admin(ADMIN_BEFEHLE.AUSRUESTEN);
  welt.aktualisiere(TICK_DAUER_S);
  assert.equal([...welt.alleVomTyp('zombie')].length, 0);
  assert.ok(spieler.inventar.some((e) => e?.defId === 'pistole'));

  admin(ADMIN_BEFEHLE.ZOMBIE_SPAWNEN);
  welt.aktualisiere(TICK_DAUER_S);
  assert.equal([...welt.alleVomTyp('zombie')].length, 1);
});

test('Unsichtbare Admins werden von Zombies ignoriert', () => {
  const { welt, spieler } = neueWelt();
  spieler.admin = true;
  platziere(spieler, 2, 1);
  const zombie = zombieBei(welt, 4, 1);
  welt.aktualisiere(TICK_DAUER_S);
  assert.equal(zombie.zielId, spieler.id);
  spieler.aktionsPuffer.push({ art: AKTIONEN.ADMIN, slot: null, befehl: ADMIN_BEFEHLE.UNSICHTBAR });
  ticks(welt, 2);
  assert.equal(zombie.zielId, null);
});

// ---------------------------------------------------------------------------
// Türen

const TUERKARTE = {
  id: 'tuertest',
  name: 'Türtest',
  kacheln: [
    '###########',
    '#S...#....#',
    '#....T....#',
    '#....#....#',
    '###TT######',
    '#.........#',
    '###########',
  ],
  raeume: {},
};

function tuerWelt() {
  const konfiguration = erstelleKonfiguration({ server: { zufallsStartwert: 3 } });
  const welt = new SpielWelt(konfiguration, { kartenDefinition: TUERKARTE });
  const spieler = welt.spielerBetrittWelt('Tester');
  return { welt, spieler };
}

test('Türen: nebeneinanderliegende T-Kacheln sind eine Doppeltür, Start = alle zu', () => {
  const { welt } = tuerWelt();
  assert.equal(welt.welt.tueren.length, 2);
  const [einzeln, doppel] = welt.welt.tueren;
  assert.equal(einzeln.senkrecht, true);
  assert.equal(doppel.kacheln.length, 2);
  assert.equal(doppel.senkrecht, false);
  assert.deepEqual(welt.welt.offeneTueren(), []);
  assert.equal(welt.welt.istBlockiert(5, 2), true);
  assert.equal(sichtlinieFrei(welt.welt, mitte(4), mitte(2), mitte(6), mitte(2)), false, 'geschlossene Tür blockiert Sicht');
});

test('Tür öffnen, durchgehen, schließen – nicht schließbar, wenn jemand drinsteht', () => {
  const { welt, spieler } = tuerWelt();
  platziere(spieler, 4, 2);
  spieler.aktionsPuffer.push({ art: AKTIONEN.TUER, slot: null });
  welt.aktualisiere(TICK_DAUER_S);
  assert.equal(welt.welt.istTuerOffen(0), true);
  assert.ok(welt.ereignisse.some((e) => e.typ === 'tuer' && e.offen));
  assert.equal(welt.welt.istBlockiert(5, 2), false);

  platziere(spieler, 5, 2); // in der Tür
  spieler.aktionsPuffer.push({ art: AKTIONEN.TUER, slot: null });
  welt.aktualisiere(TICK_DAUER_S);
  assert.equal(welt.welt.istTuerOffen(0), true, 'blockiert → bleibt offen');

  platziere(spieler, 6, 2);
  spieler.aktionsPuffer.push({ art: AKTIONEN.TUER, slot: null });
  welt.aktualisiere(TICK_DAUER_S);
  assert.equal(welt.welt.istTuerOffen(0), false);
});

test('Zombie bricht eine geschlossene Tür auf, um an den Spieler zu kommen', () => {
  const { welt, spieler } = tuerWelt();
  platziere(spieler, 2, 2);
  const zombie = zombieBei(welt, 8, 2);
  // Zombie hat den Spieler gehört → läuft zur letzten Position, der Weg führt durch die Tür
  Object.assign(zombie, { zielId: spieler.id, zustand: 'verfolgend', letztesZielX: spieler.x, letztesZielY: spieler.y });
  let geschlagen = false;
  for (let i = 0; i < Math.ceil(30 / TICK_DAUER_S) && !welt.welt.istTuerOffen(0); i++) {
    welt.aktualisiere(TICK_DAUER_S);
    if (welt.ereignisse.some((e) => e.typ === 'tuerSchlag')) geschlagen = true;
  }
  assert.ok(geschlagen, 'Zombie hat gegen die Tür geschlagen');
  assert.equal(welt.welt.istTuerOffen(0), true, 'Tür ist aufgebrochen');
});

// ---------------------------------------------------------------------------
// Tag & Nacht

test('Tageszeit: 10 min Tag (06–21 Uhr), 5 min Nacht, Helligkeit', () => {
  const dauer = { tagSekunden: 600, nachtSekunden: 300 };
  assert.equal(tageszeit(0, dauer).uhrzeit, '06:00');
  assert.equal(tageszeit(300, dauer).uhrzeit, '13:30');
  assert.equal(tageszeit(300, dauer).helligkeit, 1);
  assert.equal(tageszeit(600, dauer).uhrzeit, '21:00');
  assert.equal(tageszeit(600, dauer).istNacht, true);
  assert.equal(tageszeit(750, dauer).uhrzeit, '01:30');
  assert.equal(tageszeit(750, dauer).helligkeit, 0);
  assert.equal(tageszeit(900, dauer).uhrzeit, '06:00');
});

test('Nachts kommt eine Horde, morgens zieht sie ab', () => {
  const konfiguration = erstelleKonfiguration({ server: { zufallsStartwert: 5 } });
  const welt = new SpielWelt(konfiguration); // Standardkarte mit Zombie-Spawns
  const spieler = welt.spielerBetrittWelt('Tester');
  const vorher = [...welt.alleVomTyp('zombie')].length;
  welt.zeit = konfiguration.welt.tagSekunden - TICK_DAUER_S / 2;
  welt.aktualisiere(TICK_DAUER_S);
  assert.equal(welt.istNacht, true);
  assert.equal([...welt.alleVomTyp('zombie')].length, vorher + konfiguration.zombie.nachtHorde);
  assert.ok(welt.meldungen.some((m) => m.spielerId === spieler.id && m.text.includes('Nacht')));

  welt.zeit = konfiguration.welt.tagSekunden + konfiguration.welt.nachtSekunden - TICK_DAUER_S / 2;
  welt.aktualisiere(TICK_DAUER_S);
  assert.equal(welt.istNacht, false);
  assert.equal(welt.tag, 2);
  assert.equal([...welt.alleVomTyp('zombie')].filter((z) => z.nacht).length, 0);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TICK_DAUER_S } from '../gemeinsam/konstanten.js';
import { AKTIONEN } from '../gemeinsam/protokoll.js';
import { strahlGegenWaende, sichtlinieFrei } from '../gemeinsam/physik/strahl.js';
import { erstelleKonfiguration } from '../server/spiel/konfiguration/spielKonfiguration.js';
import { SpielWelt } from '../server/spiel/spielWelt.js';
import { erzeugeGegenstand } from '../server/spiel/entitaeten/gegenstand.js';
import { erzeugeZombie } from '../server/spiel/entitaeten/zombie.js';
import { findePfad } from '../server/spiel/systeme/pfadfindung.js';

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
  assert.equal(vorne.leben, 50);
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

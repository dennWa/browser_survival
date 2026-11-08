/**
 * Runde 42: Lagerplatz-Startzone (neue Charaktere starten dort), ewiges Lagerfeuer, Lichterketten, Sitzen auf Stühlen/Bänken.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ladeKarte, KARTEN } from '../server/spiel/karten/kartenLader.js';
import { SpielWelt } from '../server/spiel/spielWelt.js';
import { SpielServer } from '../server/spiel/spielServer.js';
import { erstelleKonfiguration } from '../server/spiel/konfiguration/spielKonfiguration.js';
import { GastAuthentifizierung } from '../server/spiel/authentifizierung/gastAuthentifizierung.js';
import { ArbeitsspeicherSpeicher } from '../server/spiel/speicher/arbeitsspeicherSpeicher.js';
import { erstelleSpeicherKanalPaar } from '../server/spiel/netz/speicherKanal.js';
import { NACHRICHT, kodiere, dekodiere, AKTIONEN } from '../gemeinsam/protokoll.js';
import { PROTOKOLL_VERSION, TICK_DAUER_S } from '../gemeinsam/konstanten.js';
import { sitzHoeheFuer, sitzPlaetze, sitzBlick, findeSitz } from '../gemeinsam/welt/sitze.js';
import { Welt } from '../gemeinsam/welt/welt.js';

const stillerLog = { info() {}, warn() {}, error() {} };
const warte = (ms = 5) => new Promise((r) => setTimeout(r, ms));
const g = 32;

function lagerWelt() {
  const welt = new SpielWelt(erstelleKonfiguration({ server: { zufallsStartwert: 3 } }), { kartenDefinition: KARTEN.lager });
  welt.wetter = { art: 'klar', rest: 9999 };
  return welt;
}

test('Sitze: Höhe aus Typ/Modellname, lange Bänke haben mehrere Plätze, Blick aus der Drehung', () => {
  assert.equal(sitzHoeheFuer('stuhl'), 0.46);
  assert.equal(sitzHoeheFuer('werkbank'), 0, 'Werkbank ist kein Sitz');
  assert.equal(sitzHoeheFuer('sf_x', { glbDatei: 'assets/eigene/wooden-chair.glb' }), 0.46);
  assert.equal(sitzHoeheFuer('sf_x', { glbDatei: 'assets/eigene/park-bench.glb' }), 0.42);
  assert.equal(sitzHoeheFuer('sf_x', { glbDatei: 'assets/eigene/nk-log-stack-large.glb' }), 0, 'Holzstapel nicht');
  assert.equal(sitzHoeheFuer('sf_x', { glbDatei: 'assets/eigene/table-big.glb' }), 0, 'Tisch nicht');
  assert.equal(sitzHoeheFuer('sf_x', { glbDatei: 'assets/eigene/rock.glb', sitz: 0.5 }), 0.5, 'ausdrückliches sitz gewinnt');
  assert.equal(sitzHoeheFuer('sf_x', { glbDatei: 'assets/eigene/chair.glb', sitz: 0 }), 0, 'sitz 0 = kein Sitz');
  assert.ok(Math.abs(sitzBlick(0) - Math.PI / 2) < 1e-9, '0 = Blick nach Süden');
  assert.ok(Math.abs(sitzBlick(90) - Math.PI) < 1e-9, '90 = Blick nach Westen');
  // Bank 1,8 m quer zur Blickrichtung → 2 Plätze nebeneinander (x verschieden, y gleich)
  const plaetze = sitzPlaetze({ typ: 'bank', x: 10, y: 10, b: 1.8, h: 0.5, drehung: 0 }, null, g);
  assert.equal(plaetze.length, 2);
  assert.notEqual(Math.round(plaetze[0].x), Math.round(plaetze[1].x));
  assert.equal(Math.round(plaetze[0].y), Math.round(plaetze[1].y));
  // um 90° gedreht: Plätze untereinander
  const gedreht = sitzPlaetze({ typ: 'bank', x: 10, y: 10, b: 0.5, h: 1.8, drehung: 90 }, null, g);
  assert.equal(gedreht.length, 2);
  assert.equal(Math.round(gedreht[0].x), Math.round(gedreht[1].x));
  // findeSitz: nur in Reichweite, belegte Plätze werden übersprungen
  const welt = new Welt({ id: 't', breite: 20, hoehe: 20, kachelGroesse: g, kacheln: Array(20).fill(','.repeat(20)), objekte: [{ typ: 'stuhl', x: 5, y: 5, b: 1, h: 1, drehung: 0 }] });
  assert.ok(findeSitz(welt, 5.5 * g, 6.6 * g));
  assert.equal(findeSitz(welt, 12 * g, 12 * g), null, 'zu weit weg');
  assert.equal(findeSitz(welt, 5.5 * g, 6.6 * g, () => true), null, 'belegt');
});

test('Lagerplatz: kleine Karte, ewiges Lagerfeuer, Lichterketten, Sitz-Typen, Übergang zum Stadtrand', () => {
  const karte = ladeKarte('lager');
  assert.ok(karte.daten.breite <= 100 && karte.daten.hoehe <= 100, 'klein (Runde 44: mit breitem Waldring)');
  assert.equal(karte.zombieSpawns.length, 0, 'keine Zombies');
  assert.ok(karte.lootPunkte.every((p) => p.spawnPunkt?.buffet), 'kein Loot – nur das Buffet (Runde 44)');
  assert.ok(karte.spielerStarts.length >= 4);
  const feuer = karte.bauwerke.find((b) => b.typ === 'lagerfeuer');
  assert.equal(feuer?.ewig, true);
  assert.ok(karte.daten.lichterketten.length >= 6, 'Lichterketten');
  for (const k of karte.daten.lichterketten) assert.ok(k.birnen >= 2 && k.hoehe > 2);
  assert.ok(karte.daten.objekte.some((o) => o.typ === 'licht' && o.hoehe > 2), 'Licht unter den Leinen (mit Höhe)');
  const sitze = karte.daten.objekte.filter((o) => sitzHoeheFuer(o.typ, karte.daten.typen?.[o.typ]) > 0);
  assert.ok(sitze.length >= 15, `genug Sitzplätze (${sitze.length})`);
  assert.ok(Object.values(karte.daten.typen).some((t) => t.sitz > 0), 'sitz bleibt im Typ erhalten');
  assert.deepEqual(karte.daten.uebergaenge.map((u) => [u.ziel, u.ankunft]), [['stadtrand', 'lager']]);
  assert.ok(ladeKarte('stadtrand').daten.uebergaenge.some((u) => u.ziel === 'lager' && u.ankunft === 'ost'));
});

test('Lagerfeuer `ewig`: brennt von Anfang an, auch nach langer Zeit und im Regen; F löscht es nicht', () => {
  const welt = lagerWelt();
  const feuer = [...welt.welt.bauwerke.values()].find((b) => b.typ === 'lagerfeuer');
  assert.ok(feuer.brennt && feuer.ewig);
  welt.wetter = { art: 'regen', rest: 9999 };
  for (let i = 0; i < 400; i++) welt.aktualisiere(1); // 400 s (> brennDauer)
  assert.equal(feuer.brennt, true, 'brennt immer noch');
  const spieler = welt.spielerBetrittWelt('Tester');
  spieler.x = (feuer.tx + 0.5) * g;
  spieler.y = (feuer.ty + 1.6) * g;
  spieler.aktionsPuffer.push({ art: AKTIONEN.FEUER, slot: null });
  welt.aktualisiere(TICK_DAUER_S);
  assert.equal(feuer.brennt, true, 'F löscht nicht');
  // Weltstand: bleibt ewig und an
  const neu = lagerWelt();
  assert.equal(neu.uebernimmWeltzustand(JSON.parse(JSON.stringify(welt.weltzustand()))), true);
  const f2 = [...neu.welt.bauwerke.values()].find((b) => b.typ === 'lagerfeuer');
  assert.ok(f2.ewig && f2.brennt);
});

test('Sitzen auf der Bank am Feuer: Sitzplatz + Blick zum Feuer + Feuer-Bonus; zweiter Spieler bekommt einen anderen Platz', () => {
  const welt = lagerWelt();
  const feuer = [...welt.welt.bauwerke.values()].find((b) => b.typ === 'lagerfeuer');
  const a = welt.spielerBetrittWelt('A');
  const b = welt.spielerBetrittWelt('B');
  for (const s of [a, b]) {
    s.x = (feuer.tx + 0.5) * g;
    s.y = (feuer.ty - 3.9) * g; // nördlich der Nordbank
    s.aktionsPuffer.push({ art: AKTIONEN.SITZEN, slot: null });
    welt.aktualisiere(TICK_DAUER_S);
  }
  assert.equal(a.arbeit?.art, 'sitzen');
  assert.equal(a.arbeit.ort?.sitz, true, 'auf einem Sitz');
  assert.ok(a.arbeit.ort.hoehe > 10, 'Sitzhöhe in px');
  assert.ok(Math.cos(a.arbeit.ort.blick - Math.PI / 2) > 0.999, 'Nordbank: Blick nach Süden zum Feuer');
  assert.equal(a.arbeit.bauwerkId, feuer.id, 'zählt als „am Feuer“');
  assert.equal(b.arbeit?.ort?.sitz, true);
  assert.ok(a.arbeit.ort.x !== b.arbeit.ort.x || a.arbeit.ort.y !== b.arbeit.ort.y, 'nicht derselbe Platz');
  // Position selbst bleibt (keine Kollision mit dem Möbel), Aufstehen per Ä
  assert.ok(Math.abs(a.y - (feuer.ty - 3.9) * g) < 1);
  a.aktionsPuffer.push({ art: AKTIONEN.SITZEN, slot: null });
  welt.aktualisiere(TICK_DAUER_S);
  assert.equal(a.arbeit, null);
  // ohne Sitz in der Nähe: wie bisher auf den Boden
  a.x = 3 * g;
  a.y = 30 * g;
  a.aktionsPuffer.push({ art: AKTIONEN.SITZEN, slot: null });
  welt.aktualisiere(TICK_DAUER_S);
  assert.equal(a.arbeit?.art, 'sitzen');
  assert.equal(a.arbeit.ort, undefined);
});

async function login(server, nachricht) {
  const { clientSeite, serverSeite } = erstelleSpeicherKanalPaar();
  const empfangen = [];
  clientSeite.beiNachricht((t) => empfangen.push(dekodiere(t)));
  server.verbindungHinzufuegen(serverSeite);
  clientSeite.senden(kodiere({ typ: NACHRICHT.ANMELDEN, passwort: '', protokoll: PROTOKOLL_VERSION, ...nachricht }));
  for (let i = 0; i < 2000 && !empfangen.some((n) => n.typ === NACHRICHT.ANMELDUNG_OK); i++) await warte();
  return { ok: empfangen.find((n) => n.typ === NACHRICHT.ANMELDUNG_OK), empfangen, kanal: clientSeite };
}

test('Neuer Charakter startet am Lagerplatz (welt.ankunftsKarte); mit Spielstand weiter in der alten Zone', async (t) => {
  const speicher = new ArbeitsspeicherSpeicher();
  const server = new SpielServer({ authentifizierung: new GastAuthentifizierung(), speicher, konfiguration: { welt: { ankunftsKarte: 'lager' } }, protokoll: stillerLog });
  t.after(() => server.stoppen());
  const a = await login(server, { benutzername: 'Neu1' });
  assert.equal(a.ok.karte.id, 'lager');
  assert.equal(server.weltVon('Neu1').karte.daten.id, 'lager');
  // gespeicherter Stand (nach dem Ausloggen) in der Stadt → dort weiter, nicht wieder am Lagerplatz
  a.kanal.trennen('weg');
  for (let i = 0; i < 400 && server.spielerAnzahl > 0; i++) await warte();
  await Promise.all([...server.ausstehendeSpeicherungen]);
  const stand = await speicher.laden('Neu1');
  assert.equal(stand.karte, 'lager');
  await speicher.speichern('Neu1', { ...stand, karte: 'stadtrand' });
  const b = await login(server, { benutzername: 'Neu1' });
  assert.equal(b.ok.karte.id, 'stadtrand');
  // Standard (Tests, eigene Karten): Startzone bleibt
  const ohne = new SpielServer({ authentifizierung: new GastAuthentifizierung(), konfiguration: {}, protokoll: stillerLog });
  t.after(() => ohne.stoppen());
  assert.equal((await login(ohne, { benutzername: 'Xaver' })).ok.karte.id, 'stadtrand');
});

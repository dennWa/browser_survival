import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SpielServer } from '../server/spiel/spielServer.js';
import { GastAuthentifizierung } from '../server/spiel/authentifizierung/gastAuthentifizierung.js';
import { erstelleSpeicherKanalPaar } from '../server/spiel/netz/speicherKanal.js';
import { ArbeitsspeicherSpeicher } from '../server/spiel/speicher/arbeitsspeicherSpeicher.js';
import { NACHRICHT, kodiere, dekodiere } from '../gemeinsam/protokoll.js';
import { PROTOKOLL_VERSION, TICK_RATE } from '../gemeinsam/konstanten.js';
import { AUSSEHEN, pruefeAussehen, CHARAKTERNAME_MUSTER } from '../gemeinsam/spieler/aussehen.js';
import { GEGENSTAENDE } from '../server/spiel/konfiguration/gegenstaende.js';

// Browser-Speicher (localStorage) für die Slot-Tests nachbilden – VOR dem Import der Client-Module
const speicherDaten = new Map();
globalThis.localStorage = {
  getItem: (k) => (speicherDaten.has(k) ? speicherDaten.get(k) : null),
  setItem: (k, v) => speicherDaten.set(k, String(v)),
  removeItem: (k) => speicherDaten.delete(k),
  key: (i) => [...speicherDaten.keys()][i] ?? null,
  get length() {
    return speicherDaten.size;
  },
};
const { BrowserSpeicher } = await import('../client/netzwerk/browserSpeicher.js');
const slots = await import('../client/netzwerk/spielstandSlots.js');

const stillerLog = { info() {}, warn() {}, error() {} };
const warte = (ms = 5) => new Promise((r) => setTimeout(r, ms));
async function warteAuf(bedingung, beschreibung) {
  for (let i = 0; i < 300; i++) {
    if (bedingung()) return;
    await warte();
  }
  assert.fail(`Zeitüberschreitung: ${beschreibung}`);
}

function neuerServer(speicher = new ArbeitsspeicherSpeicher(), konfiguration = {}) {
  return new SpielServer({ authentifizierung: new GastAuthentifizierung(), speicher, konfiguration: { server: { zufallsStartwert: 7, ...konfiguration } }, protokoll: stillerLog });
}

async function login(server, nachricht) {
  const { clientSeite, serverSeite } = erstelleSpeicherKanalPaar();
  const empfangen = [];
  clientSeite.beiNachricht((t) => empfangen.push(dekodiere(t)));
  server.verbindungHinzufuegen(serverSeite);
  clientSeite.senden(kodiere({ typ: NACHRICHT.ANMELDEN, passwort: '', protokoll: PROTOKOLL_VERSION, ...nachricht }));
  await warteAuf(() => empfangen.some((n) => n.typ === NACHRICHT.ANMELDUNG_OK), 'ANMELDUNG_OK');
  return { ok: empfangen.find((n) => n.typ === NACHRICHT.ANMELDUNG_OK), empfangen, kanal: clientSeite };
}

test('Aussehen: neue Merkmale (Frisur, Haarfarbe, Oberteil, Hose, Schuhe) – für Mann und Frau gleich, Unbekanntes → Standard', () => {
  const a = pruefeAussehen({ koerper: 'frau', haare: 'zopf', haarfarbe: 'blond', oberteil: 'hoodie_rot', hose: 'jeans', schuhe: 'stiefel', kleidung: 'quatsch' });
  assert.deepEqual([a.koerper, a.haare, a.haarfarbe, a.oberteil, a.hose, a.schuhe], ['frau', 'zopf', 'blond', 'hoodie_rot', 'jeans', 'stiefel']);
  assert.equal(pruefeAussehen({ oberteil: 'gibtsnicht' }).oberteil, AUSSEHEN.oberteil.standard);
  for (const m of ['haare', 'haarfarbe', 'oberteil', 'hose', 'schuhe']) assert.ok(AUSSEHEN[m].aktiv, m);
  // keine Emojis mehr in den Optionsnamen
  for (const def of Object.values(AUSSEHEN)) for (const o of Object.values(def.optionen)) assert.ok(!/\p{Extended_Pictographic}/u.test(o.name), o.name);
  assert.ok(CHARAKTERNAME_MUSTER.test('Jörg_99') && !CHARAKTERNAME_MUSTER.test('a') && !CHARAKTERNAME_MUSTER.test('mit Leerzeichen'));
});

test('Kleidungs-Items haben eine Form (Schicht über dem Körper)', () => {
  const formen = new Set(['shirt', 'pulli', 'hoodie', 'jacke', 'mantel', 'weste', 'hose', 'schuh', 'stiefel', 'handschuh', 'muetze', 'helm', 'motorradhelm']);
  for (const [id, def] of Object.entries(GEGENSTAENDE)) if (def.kategorie === 'kleidung') assert.ok(formen.has(def.form), `${id}: form ${def.form}`);
});

test('Login: Charaktername wird angezeigt + gespeichert, „neuer Charakter“ ersetzt den alten Stand', async (t) => {
  const speicher = new ArbeitsspeicherSpeicher();
  const server = neuerServer(speicher);
  t.after(() => server.stoppen());
  const a = await login(server, { benutzername: 'Konto1', aussehen: { koerper: 'frau', oberteil: 'hoodie_oliv' }, charakterName: 'Wolfine' });
  assert.equal(a.ok.charakter.name, 'Wolfine');
  assert.equal(a.ok.charakter.aussehen.oberteil, 'hoodie_oliv');
  const spieler = server.spielWelt.holen(a.ok.spielerId);
  spieler.inventar[10] = { defId: 'holz', menge: 7 };
  server.tickAusfuehren();
  await warteAuf(() => a.empfangen.some((n) => n.typ === NACHRICHT.ZUSTAND), 'Schnappschuss');
  const ich = a.empfangen.filter((n) => n.typ === NACHRICHT.ZUSTAND).at(-1).entitaeten.find((e) => e.id === a.ok.spielerId);
  assert.equal(ich.anzeige, 'Wolfine', 'Anzeigename im Schnappschuss');
  a.kanal.trennen('weg');
  await warteAuf(() => server.spielerAnzahl === 0, 'abgemeldet');
  await Promise.all([...server.ausstehendeSpeicherungen]);
  const stand = await speicher.laden('Konto1');
  assert.equal(stand.charakterName, 'Wolfine');

  // erneut einloggen ohne Namen → alter Charakter (Name + Holz) ist wieder da
  const b = await login(server, { benutzername: 'Konto1' });
  assert.equal(b.ok.charakter.name, 'Wolfine');
  assert.equal(server.spielWelt.holen(b.ok.spielerId).inventar[10]?.defId, 'holz');
  b.kanal.trennen('weg');
  await warteAuf(() => server.spielerAnzahl === 0, 'abgemeldet');
  await Promise.all([...server.ausstehendeSpeicherungen]);

  // neuer Charakter → frischer Stand
  const c = await login(server, { benutzername: 'Konto1', neuerCharakter: true, charakterName: 'Neuling', aussehen: { koerper: 'mann' } });
  assert.equal(c.ok.charakter.name, 'Neuling');
  assert.equal(c.ok.charakter.neu, true);
  assert.notEqual(server.spielWelt.holen(c.ok.spielerId).inventar[10]?.defId, 'holz');
});

test('Autosave: alle autosaveSekunden, gestaffelt (ein Auftrag je Tick)', async (t) => {
  const aufrufe = [];
  const speicher = new ArbeitsspeicherSpeicher();
  const original = speicher.speichern.bind(speicher);
  speicher.speichern = (name, stand) => {
    aufrufe.push(name);
    return original(name, stand);
  };
  const server = neuerServer(speicher, { autosaveSekunden: 1 });
  t.after(() => server.stoppen());
  await login(server, { benutzername: 'A1' });
  await login(server, { benutzername: 'A2' });
  aufrufe.length = 0;
  for (let i = 0; i < TICK_RATE - 1; i++) server.tickAusfuehren();
  await warte(10);
  assert.equal(aufrufe.length, 0, 'vor Ablauf nichts gespeichert');
  server.tickAusfuehren(); // Autosave fällig → erster Auftrag
  await warte(10);
  assert.equal(aufrufe.length, 1, 'nur ein Auftrag im selben Tick');
  server.tickAusfuehren();
  server.tickAusfuehren();
  await warte(10);
  assert.ok(aufrufe.length >= 3, `weitere Aufträge in den Folgeticks (${aufrufe.join(',')})`);
  assert.ok(aufrufe.includes('A1') && aufrufe.includes('A2') && aufrufe.some((n) => n.startsWith('welt:')));
});

test('Singleplayer-Slots: getrennte Speicher, Kopfdaten, Löschen, Schreiben im Leerlauf + leeren()', async () => {
  speicherDaten.clear();
  const gespielt = [];
  const s1 = new BrowserSpeicher({ praefix: slots.slotPraefix(1), beiSpielerGespeichert: (n) => gespielt.push(n) });
  const s2 = new BrowserSpeicher({ praefix: slots.slotPraefix(2) });
  slots.speichereSlotMeta(1, { name: 'Anna', aussehen: { koerper: 'frau' }, erstellt: '2026-11-01T10:00:00.000Z', zuletzt: '2026-11-01T10:00:00.000Z' });
  await s1.speichern('Anna', { leben: 50 });
  await s1.speichern('welt:stadtrand', { zeit: 1 });
  await s2.speichern('Anna', { leben: 99 });
  assert.deepEqual(await s1.laden('Anna'), { leben: 50 }, 'noch nicht geschrieben, aber ladbar');
  s1.leeren();
  s2.leeren();
  assert.equal(JSON.parse(speicherDaten.get('browserSurvival.slot1.anna')).leben, 50);
  assert.equal(JSON.parse(speicherDaten.get('browserSurvival.slot2.anna')).leben, 99, 'Slot 2 überschreibt Slot 1 nicht');
  assert.deepEqual(gespielt, ['Anna'], 'Welt-Stände zählen nicht als „gespielt“');
  const liste = slots.ladeSlots();
  assert.equal(liste.length, slots.SLOT_ANZAHL);
  assert.equal(liste[0].name, 'Anna');
  assert.equal(liste[1], null);
  slots.slotGespielt(1, { aussehen: { koerper: 'frau', haare: 'zopf' } });
  assert.equal(slots.slotMeta(1).aussehen.haare, 'zopf');
  assert.notEqual(slots.slotMeta(1).zuletzt, '2026-11-01T10:00:00.000Z');
  slots.loescheSlot(1);
  assert.equal(slots.slotMeta(1), null);
  assert.ok(!speicherDaten.has('browserSurvival.slot1.anna') && !speicherDaten.has('browserSurvival.slot1.welt:stadtrand'));
  assert.ok(speicherDaten.has('browserSurvival.slot2.anna'), 'anderer Slot bleibt');
  // Leerlauf-Schreiben (ohne requestIdleCallback → setTimeout)
  await s2.speichern('Anna', { leben: 12 });
  await warteAuf(() => JSON.parse(speicherDaten.get('browserSurvival.slot2.anna')).leben === 12, 'im Leerlauf geschrieben');
});

test('Alter Lokal-Spielstand wandert einmalig in Slot 1; Multiplayer-Charaktere je Server getrennt', () => {
  speicherDaten.clear();
  speicherDaten.set('browserSurvival.spielstand.gast-4711', JSON.stringify({ leben: 80, aussehen: { koerper: 'frau' }, gespeichert: '2026-10-01T12:00:00.000Z' }));
  speicherDaten.set('browserSurvival.spielstand.welt:stadtrand', JSON.stringify({ zeit: 5 }));
  assert.equal(slots.migriereAltenSpielstand(), true);
  assert.equal(slots.slotMeta(1).name, 'Gast-4711');
  assert.ok(speicherDaten.has('browserSurvival.slot1.gast-4711') && speicherDaten.has('browserSurvival.slot1.welt:stadtrand'));
  assert.ok(![...speicherDaten.keys()].some((k) => k.startsWith('browserSurvival.spielstand.')), 'alte Schlüssel entfernt');
  assert.equal(slots.migriereAltenSpielstand(), false, 'nur einmal');

  slots.speichereMpCharakter('online', { name: 'Rex', aussehen: { koerper: 'mann' }, konto: 'rex' });
  slots.speichereMpCharakter('eigene:wss://x/ws', { name: 'Ida', aussehen: { koerper: 'frau' }, gast: 'Gast-1234' });
  assert.equal(slots.ladeMpCharakter('online').name, 'Rex');
  assert.equal(slots.ladeMpCharakter('eigene:wss://x/ws').gast, 'Gast-1234');
  assert.equal(slots.ladeMpCharakter('andere'), null);
  assert.equal(slots.slotMeta(1).name, 'Gast-4711', 'Multiplayer berührt die Singleplayer-Slots nicht');
});

// ======================================================================================= Teil B (Handy-/Gameplay-Punkte)
import { TICK_DAUER_S } from '../gemeinsam/konstanten.js';
import { AKTIONEN, ADMIN_BEFEHLE } from '../gemeinsam/protokoll.js';
import { erstelleKonfiguration } from '../server/spiel/konfiguration/spielKonfiguration.js';
import { SpielWelt } from '../server/spiel/spielWelt.js';
import { setzeWetter } from '../server/spiel/systeme/wetterSystem.js';
import { nachTreffer, naesseStufe } from '../server/spiel/systeme/gesundheitSystem.js';
import { spielerDatenPrivat, spielerZuNetzwerk } from '../server/spiel/entitaeten/spieler.js';
import { REZEPTE } from '../server/spiel/konfiguration/rezepte.js';
import { wendeEingabeAn } from '../gemeinsam/physik/bewegung.js';
import { Welt } from '../gemeinsam/welt/welt.js';
import { verarbeiteKarte } from '../server/spiel/karten/kartenLader.js';

const FELD = {
  id: 'runde28',
  name: 'Runde 28',
  kacheln: [
    '####################',
    '#S,,,,,,,,,,,,,,,,,#',
    '#,,,,,,,,,,,,,,,,,,#',
    '#,,,,,,,,#####,,,,,#',
    '#,,,,,,,,#...#,,,,,#',
    '#,,,,,,,,#...T,,,,,#',
    '#,,,,,,,,#####,,,,,#',
    '#,,,,,,,,,,,,,,,,,,#',
    '####################',
  ],
  raeume: {},
  objekte: [
    { typ: 'mein_kamin', x: 10, y: 4, b: 1.9, h: 0.7, blockiert: true },
    { typ: 'auto_rot', x: 2, y: 5.2, b: 5.5, h: 3, drehung: 90, blockiert: true },
  ],
  typen: { mein_kamin: { name: 'Kamin', glbDatei: 'assets/eigene/fireplace.glb', b: 1.9, h: 0.7, blockiert: true } },
};
const m = (t) => t * 32 + 16;
function feld(extra = {}) {
  const konfiguration = erstelleKonfiguration({ server: { zufallsStartwert: 3 }, tiere: { hasenProTausend: 0 }, wetter: { aktiv: false }, ziele: { aktiv: false }, ...extra, spieler: { startInventar: [], ...extra.spieler } });
  const welt = new SpielWelt(konfiguration, { kartenDefinition: FELD });
  for (const z of [...welt.alleVomTyp('zombie')]) welt.entfernen(z.id);
  const spieler = welt.spielerBetrittWelt('Held');
  spieler.gottmodus = false;
  spieler.x = m(15);
  spieler.y = m(2);
  return { welt, spieler, konfiguration };
}
const laufe = (welt, n) => {
  for (let i = 0; i < n; i++) welt.aktualisiere(TICK_DAUER_S);
};

test('Nässe: im Regen draußen 5 Stufen, drinnen 1 Stufe pro Minute trocknen, HUD bekommt die Stufe', () => {
  const { welt, spieler, konfiguration } = feld({ wetter: { aktiv: true } });
  setzeWetter(welt, 'regen', 99999);
  laufe(welt, 30 * 40);
  assert.equal(naesseStufe(spieler.naesse), 2, `nach 40 s feucht (${spieler.naesse})`);
  laufe(welt, 30 * 150);
  assert.equal(naesseStufe(spieler.naesse), 5, 'klatschnass');
  assert.equal(spielerDatenPrivat(spieler, konfiguration, welt).naesse, 5);
  // rein ins Haus (Innenboden '.') → pro Minute eine Stufe besser
  spieler.x = m(11);
  spieler.y = m(4);
  laufe(welt, 30 * 61);
  assert.equal(naesseStufe(spieler.naesse), 4, 'nach 1 min: sehr nass');
  laufe(welt, 30 * 60);
  assert.equal(naesseStufe(spieler.naesse), 3, 'nach 2 min: nass');
});

test('Erkältung: 5 min mindestens feucht → erkältet; wird schlimmer (Husten, Sprint 80 %, ab 50 % Schaden), Antibiotika heilt', () => {
  const { welt, spieler, konfiguration } = feld({ wetter: { aktiv: true } });
  setzeWetter(welt, 'regen', 99999);
  spieler.naesse = 2.5; // feucht
  spieler.hunger = spieler.durst = 100;
  laufe(welt, 30 * 200);
  assert.ok(!spieler.zustand.erkaeltung, 'noch nicht nach 3 min');
  laufe(welt, 30 * 120);
  assert.ok(spieler.zustand.erkaeltung > 0, 'nach 5 min feucht erkältet');
  // schneller Verlauf testen
  spieler.zustand.erkaeltung = 29;
  let husten = 0;
  for (let i = 0; i < 30 * 60; i++) {
    welt.aktualisiere(TICK_DAUER_S);
    husten += welt.ereignisse.filter((e) => e.typ === 'husten' && e.von === spieler.id).length;
  }
  assert.ok(husten >= 1, `hustet (${husten})`);
  assert.ok(spieler.zustand.erkaeltung > 30);
  assert.equal(spieler.sprintMalus, 0.8, 'Sprint auf 80 %');
  assert.equal(spielerDatenPrivat(spieler, konfiguration, welt).sprintMalus, 0.8);
  // Physik: Sprinttempo × 0,8 (gilt auch für die Client-Vorhersage)
  const w = new Welt({ id: 'p', breite: 20, hoehe: 3, kachelGroesse: 32, kacheln: ['....................', '....................', '....................'], raeume: [] });
  const a = { x: 40, y: 48, ausdauer: 100, erschoepft: false };
  const b = { x: 40, y: 48, ausdauer: 100, erschoepft: false, sprintMalus: 0.8 };
  const p = welt.physikParameter();
  for (let i = 0; i < 10; i++) {
    wendeEingabeAn(a, { x: 1, y: 0, sprint: true }, w, p, TICK_DAUER_S);
    wendeEingabeAn(b, { x: 1, y: 0, sprint: true }, w, p, TICK_DAUER_S);
  }
  assert.ok(Math.abs((b.x - 40) / (a.x - 40) - 0.8) < 0.02, `Sprintweg ${a.x} vs ${b.x}`);
  // ab 50 %: Leben sinkt langsam, keine Regeneration
  spieler.zustand.erkaeltung = 60;
  spieler.leben = 50;
  setzeWetter(welt, 'klar', 99999);
  laufe(welt, 30 * 10);
  assert.ok(spieler.leben < 50 && spieler.leben > 48, `sanfter Schaden (${spieler.leben})`);
  spieler.inventar[3] = { defId: 'antibiotika', menge: 1 };
  spieler.aktionsPuffer.push({ art: AKTIONEN.KONSUMIEREN, slot: 3 });
  welt.aktualisiere(TICK_DAUER_S);
  assert.equal(spieler.zustand.erkaeltung, 0, 'Antibiotika kuriert');
});

test('Blutung: Schuss immer, Schlag mit 20 %, Blutflecken jede Sekunde; Verband aus 2 Stofffetzen', () => {
  const { welt, spieler } = feld();
  nachTreffer(welt, spieler, 10, { typ: 'spieler', id: 99 }, { schuss: true });
  assert.equal(spieler.zustand.blutung, true, 'Schuss blutet immer');
  laufe(welt, 30 * 3);
  // Blutflecken als Ereignisse (über 3 s mindestens 2)
  let flecken = 0;
  for (let i = 0; i < 30 * 3; i++) {
    welt.aktualisiere(TICK_DAUER_S);
    flecken += welt.ereignisse.filter((e) => e.typ === 'blutfleck').length;
  }
  assert.ok(flecken >= 2 && flecken <= 4, `≈ 1 Fleck/s (${flecken})`);
  // Schläge: ~20 %
  let blutet = 0;
  for (let i = 0; i < 2000; i++) {
    spieler.zustand.blutung = false;
    nachTreffer(welt, spieler, 5, { typ: 'zombie', id: 1 });
    if (spieler.zustand.blutung) blutet++;
  }
  assert.ok(blutet > 300 && blutet < 500, `Schlag-Quote ${blutet / 2000}`);
  assert.equal(welt.konfiguration.gesundheit.blutungChance, 0.2);
  assert.deepEqual(REZEPTE.verband_stofffetzen.zutaten, { stoff: 2 });
  assert.equal(REZEPTE.verband_stofffetzen.ort, 'inventar');
  assert.equal(REZEPTE.verband_stofffetzen.ergebnis, 'verband');
});

test('Regeneration erst ab 80 % Essen UND Trinken', () => {
  const { welt, spieler } = feld();
  spieler.leben = 50;
  spieler.hunger = 79;
  spieler.durst = 100;
  laufe(welt, 30 * 2);
  assert.ok(spieler.leben <= 50, 'Essen 79 % → keine Heilung');
  spieler.hunger = 95;
  spieler.durst = 95;
  laufe(welt, 30 * 4);
  assert.ok(spieler.leben > 50.5, `heilt (${spieler.leben})`);
});

test('Kamin-Modell auf der Karte (fireplace.glb) ist anzündbar; Türzarge am Haus zählt als „unter Dach“', () => {
  const { welt, spieler } = feld();
  const kamin = [...welt.welt.bauwerke.values()].find((b) => b.typ === 'kamin');
  assert.ok(kamin?.karteObjekt, 'kartenfester Kamin aus dem Modell');
  assert.equal(kamin.tx, 10);
  spieler.inventar[0] = { defId: 'feuerzeug', menge: 1 };
  spieler.x = m(11);
  spieler.y = m(5);
  spieler.aktionsPuffer.push({ art: AKTIONEN.BAUWERK, slot: null });
  welt.aktualisiere(TICK_DAUER_S);
  assert.equal(kamin.brennt, true, 'Kamin brennt');
  // gespeicherter Weltzustand behält den Kamin (Platz gehört dem Modell)
  const stand = JSON.parse(JSON.stringify(welt.weltzustand()));
  const neu = new SpielWelt(welt.konfiguration, { kartenDefinition: FELD });
  assert.equal(neu.uebernimmWeltzustand(stand), true);
  assert.equal([...neu.welt.bauwerke.values()].filter((b) => b.typ === 'kamin' && b.brennt).length, 1);
  // Türzarge 'T' (13,5) grenzt an Innenraum → unter Dach; freie Wiese nicht
  assert.equal(welt.welt.istUnterDach(m(13), m(5)), true);
  assert.equal(welt.welt.istInnen(m(13), m(5)), false);
  assert.equal(welt.welt.istUnterDach(m(16), m(5)), false);
  assert.ok(verarbeiteKarte(FELD).bauwerke.some((b) => b.typ === 'kamin' && b.karteObjekt));
});

test('Fahrzeug: erster Spieler fährt, zweiter wird Beifahrer (folgt dem Auto, sicher vor Bissen), aussteigen', async () => {
  const { welt, spieler } = feld();
  const auto = [...welt.alleVomTyp('fahrzeug')][0];
  const zwei = welt.spielerBetrittWelt('Mitfahrer');
  for (const s of [spieler, zwei]) {
    s.x = auto.x;
    s.y = auto.y - auto.breite / 2 - 20;
  }
  spieler.aktionsPuffer.push({ art: AKTIONEN.FAHRZEUG, slot: null });
  welt.aktualisiere(TICK_DAUER_S);
  assert.equal(auto.fahrerId, spieler.id);
  zwei.aktionsPuffer.push({ art: AKTIONEN.FAHRZEUG, slot: null });
  welt.aktualisiere(TICK_DAUER_S);
  assert.equal(auto.beifahrerId, zwei.id, 'Zweiter = Beifahrer');
  assert.equal(zwei.mitfahrt, auto);
  assert.equal(spielerZuNetzwerk(zwei).mitfahrt, auto.id);
  // fahren: Beifahrer fährt mit
  for (let i = 0; i < 30; i++) {
    spieler.eingabePuffer.push({ seq: i + 1, x: 0, y: -1, blick: 0 });
    zwei.eingabePuffer.push({ seq: i + 1, x: 1, y: 0, blick: 0 }); // Beifahrer-Eingaben steuern nichts
    welt.aktualisiere(TICK_DAUER_S);
  }
  assert.ok(Math.hypot(zwei.x - auto.x, zwei.y - auto.y) < 14, 'sitzt im Auto');
  const leben = zwei.leben;
  const z = { typ: 'zombie', id: 5, angriffsSchaden: welt.konfiguration.zombie.angriffsSchaden };
  const fuegeSchadenZu = (await import('../server/spiel/systeme/kampfSystem.js')).fuegeSchadenZu;
  fuegeSchadenZu(welt, zwei, 10, z);
  assert.equal(zwei.leben, leben, 'Biss trifft das Auto, nicht den Beifahrer');
  zwei.aktionsPuffer.push({ art: AKTIONEN.FAHRZEUG, slot: null });
  welt.aktualisiere(TICK_DAUER_S);
  assert.equal(zwei.mitfahrt, null);
  assert.equal(auto.beifahrerId, null);
  assert.ok(Math.hypot(zwei.x - auto.x, zwei.y - auto.y) > 20, 'neben dem Auto ausgestiegen');
});

test('Admin: einzelne Waffe aus der Liste mit Munition; Doppelklick-Verbrauch scheitert nicht mehr an der Angriffs-Abklingzeit', () => {
  const { welt, spieler } = feld();
  spieler.admin = true;
  spieler.aktionsPuffer.push({ art: AKTIONEN.ADMIN, befehl: ADMIN_BEFEHLE.WAFFE_GEBEN, wert: 'gewehr', slot: null });
  welt.aktualisiere(TICK_DAUER_S);
  const gewehr = spieler.inventar.find((e) => e?.defId === 'gewehr');
  assert.ok(gewehr && gewehr.magazin === GEGENSTAENDE.gewehr.magazin, 'Gewehr mit vollem Magazin');
  assert.ok(spieler.inventar.find((e) => e?.defId === 'munition_gewehr')?.menge >= 20, 'reichlich Munition');
  // gerade geschossen (Abklingzeit läuft) → Verband per Doppelklick wirkt trotzdem
  spieler.zustand.blutung = true;
  spieler.angriffsAbklingzeit = 1;
  spieler.inventar[5] = { defId: 'verband', menge: 1 };
  spieler.aktionsPuffer.push({ art: AKTIONEN.KONSUMIEREN, slot: 5 });
  welt.aktualisiere(TICK_DAUER_S);
  assert.equal(spieler.zustand.blutung, false, 'Verband wirkt sofort');
});

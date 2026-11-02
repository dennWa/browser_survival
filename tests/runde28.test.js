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

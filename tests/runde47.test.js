import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SpielServer } from '../server/spiel/spielServer.js';
import { SpielWelt } from '../server/spiel/spielWelt.js';
import { GastAuthentifizierung } from '../server/spiel/authentifizierung/gastAuthentifizierung.js';
import { erstelleSpeicherKanalPaar } from '../server/spiel/netz/speicherKanal.js';
import { erstelleKonfiguration } from '../server/spiel/konfiguration/spielKonfiguration.js';
import { wendeSpielstandAn, erstelleSpielstand } from '../server/spiel/spielstand.js';
import { AKTIONEN, NACHRICHT, kodiere, dekodiere } from '../gemeinsam/protokoll.js';
import { PROTOKOLL_VERSION } from '../gemeinsam/konstanten.js';
import { STANDARD_TASTEN, TASTEN, ladeBelegung, setzeTaste, setzeZurueck, aktionenFuer } from '../client/kern/tastenBelegung.js';

/**
 * Runde 47 – Mit Freunden spielen: Tastenbelegung, Funkgerät (… weitere Teile folgen in dieser Datei).
 */
const SOFORT = { welt: { uebergangSekunden: 0 } };
const stillerLog = { info() {}, warn() {}, error() {} };
const warte = (ms = 5) => new Promise((r) => setTimeout(r, ms));
async function warteAuf(bedingung, beschreibung) {
  for (let i = 0; i < 300; i++) {
    if (bedingung()) return;
    await warte();
  }
  assert.fail(`Zeitüberschreitung: ${beschreibung}`);
}
function verbinde(server, name) {
  const { clientSeite, serverSeite } = erstelleSpeicherKanalPaar();
  const empfangen = [];
  clientSeite.beiNachricht((t) => empfangen.push(dekodiere(t)));
  server.verbindungHinzufuegen(serverSeite);
  clientSeite.senden(kodiere({ typ: NACHRICHT.ANMELDEN, benutzername: name, protokoll: PROTOKOLL_VERSION }));
  return { empfangen, kanal: clientSeite, aktion: (a) => clientSeite.senden(kodiere({ typ: NACHRICHT.AKTION, ...a })) };
}
const letzte = (empfangen, typ) => empfangen.findLast((n) => n?.typ === typ);
/** Ticken, bis die Bedingung stimmt (Nachrichten über den Speicher-Kanal kommen asynchron an). */
async function tickBis(server, bedingung, beschreibung) {
  for (let i = 0; i < 100; i++) {
    server.tickAusfuehren();
    await warte(2);
    if (bedingung()) return;
  }
  assert.fail(`Zeitüberschreitung: ${beschreibung}`);
}
const spielerVon = (server, name) => [...server.weltVon(name).alleVomTyp('spieler')].find((s) => s.name === name);

async function gehDurchUebergang(server, name, empfangen) {
  const welt = server.weltVon(name);
  const spieler = spielerVon(server, name);
  const u = welt.karte.daten.uebergaenge[0];
  spieler.x = (u.px.x0 + u.px.x1) / 2;
  spieler.y = (u.px.y0 + u.px.y1) / 2;
  const vorher = empfangen.filter((n) => n.typ === NACHRICHT.ZONE_WECHSEL).length;
  server.tickAusfuehren();
  await warteAuf(() => empfangen.filter((n) => n.typ === NACHRICHT.ZONE_WECHSEL).length > vorher, 'ZONE_WECHSEL');
}

// ---------------------------------------------------------------------------------------------- Tastenbelegung

test('Tastenbelegung: keine Taste doppelt, Umbelegen nimmt sie der alten Aktion weg, Reset stellt alles her', () => {
  ladeBelegung({});
  const gesehen = new Map();
  for (const [aktion, codes] of Object.entries(STANDARD_TASTEN)) {
    for (const code of codes) {
      assert.ok(!gesehen.has(code), `${code} liegt doppelt: ${gesehen.get(code)} und ${aktion}`);
      gesehen.set(code, aktion);
    }
  }
  assert.deepEqual(aktionenFuer('KeyC'), ['ego'], 'C ist nur noch die Ego-Ansicht (vorher zugleich Sprachchat)');
  const r = setzeTaste('funken', 0, 'KeyV');
  assert.equal(r.verdraengt, 'sprechen');
  assert.deepEqual(TASTEN.funken, ['KeyV']);
  assert.deepEqual(TASTEN.sprechen, []);
  assert.equal(setzeTaste('funken', 0, 'Escape').ok, false, 'Esc bleibt fest');
  assert.equal(setzeTaste('funken', 1, 'Maus3').ok, true, 'Seitentaste der Maus geht');
  assert.deepEqual(TASTEN.funken, ['KeyV', 'Maus3']);
  setzeZurueck();
  assert.deepEqual(TASTEN.funken, STANDARD_TASTEN.funken);
  assert.deepEqual(TASTEN.sprechen, STANDARD_TASTEN.sprechen);
  // Kaputte gespeicherte Belegung: Unbekanntes/Reserviertes fliegt raus, eigene Taste gewinnt gegen den Standard
  ladeBelegung({ funken: ['KeyE', 'F3', 'unsinn!'], quatsch: ['KeyQ'] });
  assert.deepEqual(TASTEN.funken, ['KeyE']);
  assert.deepEqual(TASTEN.aufheben, [], 'E gehört jetzt dem Funk');
  assert.equal(TASTEN.quatsch, undefined);
  ladeBelegung({});
});

// ---------------------------------------------------------------------------------------------- Funkgerät

test('Funkgerät: Startausrüstung, an/aus, Frequenz – Partner hören sich auch über Zonen hinweg', async (t) => {
  const server = new SpielServer({ authentifizierung: new GastAuthentifizierung(), protokoll: stillerLog, konfiguration: SOFORT });
  t.after(() => server.stoppen());
  const a = verbinde(server, 'Anna');
  const b = verbinde(server, 'Bert');
  await warteAuf(() => letzte(a.empfangen, NACHRICHT.ANMELDUNG_OK) && letzte(b.empfangen, NACHRICHT.ANMELDUNG_OK), 'Logins');
  const okA = letzte(a.empfangen, NACHRICHT.ANMELDUNG_OK);
  assert.ok(okA.spielerDaten.inventar.some((e) => e?.defId === 'funkgeraet'), 'Jeder startet mit Funkgerät');
  assert.ok(Number.isInteger(okA.sid) && okA.sid > 0, 'eigene Sprachchat-Adresse (sid)');
  const sidA = okA.sid;

  await gehDurchUebergang(server, 'Bert', b.empfangen);
  const sidB = letzte(b.empfangen, NACHRICHT.ZONE_WECHSEL).sid;
  assert.ok(sidB && sidB !== sidA, 'sid bleibt über den Zonenwechsel (eigene Adresse)');
  assert.notEqual(server.weltVon('Anna'), server.weltVon('Bert'), 'verschiedene Zonen');

  // Signal zwischen verschiedenen Zonen ohne Funk: wird verworfen
  a.kanal.senden(kodiere({ typ: NACHRICHT.STIMME, an: sidB, signal: { sdp: { type: 'offer', sdp: 'v=0' } } }));
  await warte(20);
  assert.equal(letzte(b.empfangen, NACHRICHT.STIMME), undefined, 'ohne Funk kein Sprachchat über Zonen');

  a.aktion({ art: AKTIONEN.FUNK, was: 'an' });
  b.aktion({ art: AKTIONEN.FUNK, was: 'an' });
  await tickBis(server, () => letzte(a.empfangen, NACHRICHT.FUNK)?.partner?.length === 1, 'Funkpartner');
  const lage = letzte(a.empfangen, NACHRICHT.FUNK);
  assert.equal(lage.bereit, true);
  assert.equal(lage.frequenz, 1000);
  assert.deepEqual(lage.partner, [{ sid: sidB, name: 'Bert', funkt: false }]);

  // Jetzt geht das Signal über die Zonengrenze
  a.kanal.senden(kodiere({ typ: NACHRICHT.STIMME, an: sidB, signal: { sdp: { type: 'offer', sdp: 'v=0' } } }));
  await warteAuf(() => letzte(b.empfangen, NACHRICHT.STIMME), 'Funk-Signal');
  assert.equal(letzte(b.empfangen, NACHRICHT.STIMME).von, sidA);

  // Senden: Bert sieht, dass Anna funkt
  a.aktion({ art: AKTIONEN.FUNK, was: 'senden', wert: true });
  await tickBis(server, () => letzte(b.empfangen, NACHRICHT.FUNK)?.partner?.[0]?.funkt === true, 'Anna funkt');
  assert.equal(spielerVon(server, 'Anna').funkt, true);

  // Andere Frequenz → keine Partner mehr; ungültige Frequenz wird schon am Server verworfen
  b.aktion({ art: AKTIONEN.FUNK, was: 'frequenz', wert: 5 });
  b.aktion({ art: AKTIONEN.FUNK, was: 'frequenz', wert: 1015 });
  await tickBis(server, () => letzte(b.empfangen, NACHRICHT.FUNK)?.frequenz === 1015, 'Frequenz 101,5');
  assert.equal(letzte(b.empfangen, NACHRICHT.FUNK).partner.length, 0);
  assert.equal(letzte(a.empfangen, NACHRICHT.FUNK).partner.length, 0);

  // Ohne Funkgerät im Inventar ist das Gerät tot – senden geht nicht mehr
  const anna = spielerVon(server, 'Anna');
  anna.inventar = anna.inventar.map((e) => (e?.defId === 'funkgeraet' ? null : e));
  await tickBis(server, () => letzte(a.empfangen, NACHRICHT.FUNK)?.geraet === false, 'kein Gerät');
  assert.equal(anna.funkt, false);
  assert.equal(letzte(a.empfangen, NACHRICHT.FUNK).bereit, false);
});

test('Funkgerät: Zustand im Spielstand, alte Stände bekommen das Gerät einmalig nachgeliefert', () => {
  const konfiguration = erstelleKonfiguration({});
  const welt = new SpielWelt(konfiguration);
  const alt = welt.spielerBetrittWelt('Oldie');
  const stand = erstelleSpielstand(alt, welt.karte.daten.id);
  delete stand.funk; // Stand von vor Runde 47
  stand.inventar = stand.inventar.map((e) => (e?.defId === 'funkgeraet' ? null : e));
  const neu = welt.spielerBetrittWelt('Oldie2');
  wendeSpielstandAn(neu, stand, welt);
  assert.equal(neu.inventar.filter((e) => e?.defId === 'funkgeraet').length, 1, 'Gerät nachgeliefert');

  neu.funk = { an: true, frequenz: 912 };
  neu.inventar = neu.inventar.map((e) => (e?.defId === 'funkgeraet' ? null : e)); // weggeworfen
  const stand2 = erstelleSpielstand(neu, welt.karte.daten.id);
  const wieder = welt.spielerBetrittWelt('Oldie3');
  wendeSpielstandAn(wieder, stand2, welt);
  assert.deepEqual(wieder.funk, { an: true, frequenz: 912 }, 'Frequenz + an bleiben');
  assert.equal(wieder.inventar.some((e) => e?.defId === 'funkgeraet'), false, 'weggeworfenes Gerät kommt nicht wieder');
});

// ---------------------------------------------------------------------------------------------- Emotes

test('Emotes: Ereignis an die Zone, kurze Sperre gegen Dauerfeuer, Server verwirft ungültige Indizes', async (t) => {
  const { SpielWelt: Welt } = await import('../server/spiel/spielWelt.js');
  const { TICK_DAUER_S } = await import('../gemeinsam/konstanten.js');
  const { EMOTES } = await import('../gemeinsam/spieler/emotes.js');
  const welt = new Welt(erstelleKonfiguration({}));
  const s = welt.spielerBetrittWelt('Ella');
  s.aktionsPuffer.push({ art: AKTIONEN.EMOTE, wert: 3 }, { art: AKTIONEN.EMOTE, wert: 4 });
  welt.aktualisiere(TICK_DAUER_S);
  const emotes = welt.ereignisse.filter((e) => e.typ === 'emote');
  assert.deepEqual(emotes, [{ typ: 'emote', id: s.id, e: 3 }], 'zweites Emote im selben Moment wird verschluckt');
  for (let i = 0; i < 30; i++) welt.aktualisiere(TICK_DAUER_S);
  s.aktionsPuffer.push({ art: AKTIONEN.EMOTE, wert: 4 });
  welt.aktualisiere(TICK_DAUER_S);
  assert.deepEqual(welt.ereignisse.filter((e) => e.typ === 'emote'), [{ typ: 'emote', id: s.id, e: 4 }], 'nach der Pause geht es wieder');
  assert.equal(EMOTES.length, 16);

  // Über den Server: kaputter Index kommt gar nicht erst in den Puffer
  const server = new SpielServer({ authentifizierung: new GastAuthentifizierung(), protokoll: stillerLog });
  t.after(() => server.stoppen());
  const c = verbinde(server, 'Emil');
  await warteAuf(() => letzte(c.empfangen, NACHRICHT.ANMELDUNG_OK), 'Login');
  c.aktion({ art: AKTIONEN.EMOTE, wert: 99 });
  c.aktion({ art: AKTIONEN.EMOTE, wert: '1' });
  await warte(20);
  assert.equal(spielerVon(server, 'Emil').aktionsPuffer.length, 0);
});

// ---------------------------------------------------------------------------------------------- Kartenmarker

test('Kartenmarker: setzen, ändern, löschen, Text gesäubert, Grenzen, Spielstand', async () => {
  const { markerAktion, markerText, pruefeMarker, MARKER_MAX } = await import('../server/spiel/systeme/markerSystem.js');
  const welt = new SpielWelt(erstelleKonfiguration({}));
  const s = welt.spielerBetrittWelt('Mara');
  markerAktion(welt, s, { was: 'setzen', x: 100.4, y: 200.6, text: '  Treffpunkt\n\u0007 hier  ', sicht: 'alle' });
  assert.deepEqual(s.marker, [{ id: 1, karte: welt.karte.daten.id, x: 100, y: 201, text: 'Treffpunkt hier', sicht: 'alle' }]);
  markerAktion(welt, s, { was: 'setzen', x: -5, y: 10, text: 'draußen', sicht: 'ich' });
  assert.equal(s.marker.length, 1, 'außerhalb der Karte → verworfen');
  markerAktion(welt, s, { was: 'setzen', x: 0, y: 0, text: 'x', sicht: 'hacker', id: 1 });
  assert.deepEqual([s.marker[0].text, s.marker[0].sicht, s.marker[0].x], ['x', 'ich', 100], 'ändern behält die Position, unbekannte Sicht → ich');
  assert.equal(markerText(''), '📍');
  assert.equal([...markerText('a'.repeat(100))].length, 40);
  for (let i = 0; i < MARKER_MAX + 5; i++) markerAktion(welt, s, { was: 'setzen', x: 50, y: 50, text: `m${i}`, sicht: 'ich' });
  assert.equal(s.marker.length, MARKER_MAX);
  markerAktion(welt, s, { was: 'entfernen', id: 1 });
  assert.equal(s.marker.some((m) => m.id === 1), false);
  // Spielstand
  const stand = erstelleSpielstand(s, welt.karte.daten.id);
  stand.marker.push({ id: 999, karte: '../böse', x: 1, y: 1, text: 'x' }, { id: 2, karte: 'lager', x: 1, y: 1, text: 'doppelt' });
  const neu = welt.spielerBetrittWelt('Mara2');
  wendeSpielstandAn(neu, stand, welt);
  assert.equal(neu.marker.length, MARKER_MAX - 1);
  assert.deepEqual(pruefeMarker('kaputt'), []);
});

test('Kartenmarker: Sichtbarkeit – nur ich / Gruppe / alle (auch über Zonen)', async (t) => {
  const { markerLagen } = await import('../server/spiel/systeme/markerSystem.js');
  const a = { name: 'Anna', marker: [{ id: 1, karte: 'lager', x: 1, y: 1, text: 'geheim', sicht: 'ich' }, { id: 2, karte: 'lager', x: 1, y: 1, text: 'Basis', sicht: 'gruppe' }, { id: 3, karte: 'stadtrand', x: 1, y: 1, text: 'Treff', sicht: 'alle' }] };
  const b = { name: 'Bert', marker: [] };
  const c = { name: 'Cleo', marker: [] };
  const gruppe = new Set(['Anna', 'Bert']);
  const lagen = markerLagen([a, b, c], (n) => (gruppe.has(n) ? gruppe : undefined));
  assert.deepEqual(lagen.get(a).map((m) => m.text), ['geheim', 'Basis', 'Treff']);
  assert.ok(lagen.get(a).every((m) => m.eigen));
  assert.deepEqual(lagen.get(b).map((m) => m.text), ['Basis', 'Treff'], 'Gruppe sieht Gruppe + alle');
  assert.deepEqual(lagen.get(c).map((m) => m.text), ['Treff'], 'Fremde sehen nur „alle“');
  assert.equal(lagen.get(c)[0].von, 'Anna');

  // Über den Server: NACHRICHT.MARKER kommt beim anderen an
  const server = new SpielServer({ authentifizierung: new GastAuthentifizierung(), protokoll: stillerLog });
  t.after(() => server.stoppen());
  const ca = verbinde(server, 'Anna');
  const cb = verbinde(server, 'Bert');
  await warteAuf(() => letzte(ca.empfangen, NACHRICHT.ANMELDUNG_OK) && letzte(cb.empfangen, NACHRICHT.ANMELDUNG_OK), 'Logins');
  ca.aktion({ art: AKTIONEN.MARKER, was: 'setzen', x: 300, y: 300, text: 'Hier!', sicht: 'alle' });
  ca.aktion({ art: AKTIONEN.MARKER, was: 'setzen', x: 300, y: 300, text: 'Nur für mich', sicht: 'ich' });
  await tickBis(server, () => letzte(cb.empfangen, NACHRICHT.MARKER)?.liste?.length === 1, 'Bert sieht Annas Marker');
  assert.deepEqual(letzte(cb.empfangen, NACHRICHT.MARKER).liste.map((m) => [m.text, m.von, m.eigen]), [['Hier!', 'Anna', false]]);
  assert.equal(letzte(ca.empfangen, NACHRICHT.MARKER).liste.length, 2);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KARTEN, ladeKarte, verarbeiteKarte } from '../server/spiel/karten/kartenLader.js';
import { Welt } from '../gemeinsam/welt/welt.js';
import { SpielServer } from '../server/spiel/spielServer.js';
import { SpielWelt } from '../server/spiel/spielWelt.js';
import { GastAuthentifizierung } from '../server/spiel/authentifizierung/gastAuthentifizierung.js';
import { ArbeitsspeicherSpeicher } from '../server/spiel/speicher/arbeitsspeicherSpeicher.js';
import { erstelleSpeicherKanalPaar } from '../server/spiel/netz/speicherKanal.js';
import { erstelleKonfiguration } from '../server/spiel/konfiguration/spielKonfiguration.js';
import { holeZeitNach } from '../server/spiel/systeme/arbeitSystem.js';
import { NACHRICHT, kodiere, dekodiere } from '../gemeinsam/protokoll.js';
import { PROTOKOLL_VERSION, TICK_DAUER_S } from '../gemeinsam/konstanten.js';

const stillerLog = { info() {}, warn() {}, error() {} };
const warte = (ms = 5) => new Promise((r) => setTimeout(r, ms));
async function warteAuf(bedingung, beschreibung) {
  for (let i = 0; i < 200; i++) {
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
  return { empfangen, kanal: clientSeite };
}
const letzte = (empfangen, typ) => empfangen.findLast((n) => n.typ === typ);

/** Spieler in den ersten Übergang seiner Zone stellen und ticken, bis der Wechsel durch ist. */
async function gehDurchUebergang(server, name, empfangen) {
  const welt = server.weltVon(name);
  const spieler = [...welt.alleVomTyp('spieler')].find((s) => s.name === name);
  const u = welt.karte.daten.uebergaenge[0];
  spieler.x = (u.px.x0 + u.px.x1) / 2;
  spieler.y = (u.px.y0 + u.px.y1) / 2;
  const vorher = empfangen.filter((n) => n.typ === NACHRICHT.ZONE_WECHSEL).length;
  server.tickAusfuehren();
  await warteAuf(() => empfangen.filter((n) => n.typ === NACHRICHT.ZONE_WECHSEL).length > vorher, 'ZONE_WECHSEL');
  return { u, alt: welt };
}

test('Zonen: jeder Übergang führt zu einer echten Karte und einem freien Ankunftspunkt (und zurück)', () => {
  for (const [id, definition] of Object.entries(KARTEN)) {
    const karte = ladeKarte(id);
    assert.equal(definition.id, id, `KARTEN.${id} hat id "${definition.id}"`);
    for (const u of karte.daten.uebergaenge) {
      assert.ok(KARTEN[u.ziel], `${id}: Übergang nach unbekannter Zone "${u.ziel}"`);
      const ziel = ladeKarte(u.ziel);
      const punkt = ziel.ankuenfte[u.ankunft];
      assert.ok(punkt, `${id} → ${u.ziel}: Ankunft "${u.ankunft}" fehlt`);
      const welt = new Welt(ziel.daten);
      const g = welt.kachelGroesse;
      assert.equal(welt.istBlockiert(Math.floor(punkt.x / g), Math.floor(punkt.y / g)), false, `${u.ziel}: Ankunft "${u.ankunft}" blockiert`);
      // Ankunft darf nicht selbst in einem Übergang liegen (sonst Ping-Pong) …
      for (const v of ziel.daten.uebergaenge) {
        assert.ok(!(punkt.x >= v.px.x0 && punkt.x < v.px.x1 && punkt.y >= v.px.y0 && punkt.y < v.px.y1), `${u.ziel}: Ankunft im Übergang`);
      }
      // … und es gibt einen Weg zurück
      assert.ok(ziel.daten.uebergaenge.some((v) => v.ziel === id), `${u.ziel} hat keinen Übergang zurück nach ${id}`);
    }
  }
});

test('Kartenlader prüft Übergänge und Ankünfte', () => {
  const basis = { id: 't', kacheln: ['S...', '....', '.#..'], raeume: {} };
  assert.throws(() => verarbeiteKarte({ ...basis, uebergaenge: [{ x: 3, y: 0, b: 2, h: 1, ziel: 'x', ankunft: 'a' }] }), /Übergang #0/);
  assert.throws(() => verarbeiteKarte({ ...basis, ankuenfte: { a: { x: 1, y: 2 } } }), /Wand/);
  const ok = verarbeiteKarte({ ...basis, uebergaenge: [{ x: 0, y: 0, b: 4, h: 1, ziel: 'x', ankunft: 'a' }], ankuenfte: { a: { x: 2, y: 1 } } });
  assert.deepEqual(ok.daten.uebergaenge[0].px, { x0: 0, y0: 0, x1: 128, y1: 32 });
  assert.deepEqual(ok.ankuenfte.a, { x: 80, y: 48 });
});

test('Zonenwechsel: Übergang betreten → neue Zone, Inventar & Level bleiben, Eingaben zählen weiter', async (t) => {
  const server = new SpielServer({ authentifizierung: new GastAuthentifizierung(), protokoll: stillerLog });
  t.after(() => server.stoppen());
  const { empfangen, kanal } = verbinde(server, 'Wanderer');
  await warteAuf(() => letzte(empfangen, NACHRICHT.ANMELDUNG_OK), 'Login');
  const start = server.weltVon('Wanderer');
  assert.equal(start.karte.daten.id, 'stadtrand');
  const ich = [...start.alleVomTyp('spieler')][0];
  ich.inventar[3] = { defId: 'eisenerz', menge: 4 };
  ich.level = 3;
  ich.letzteEmpfangeneSeq = 77;

  const { u } = await gehDurchUebergang(server, 'Wanderer', empfangen);
  const wechsel = letzte(empfangen, NACHRICHT.ZONE_WECHSEL);
  assert.equal(wechsel.karte.id, u.ziel);
  assert.equal(wechsel.zone, 'Waldweg');
  const wald = server.weltVon('Wanderer');
  assert.equal(wald.karte.daten.id, 'waldweg');
  assert.equal(start.anzahlVomTyp('spieler'), 0, 'aus der alten Zone raus');
  const neu = wald.holen(wechsel.spielerId);
  assert.deepEqual(neu.inventar[3], { defId: 'eisenerz', menge: 4 });
  assert.equal(neu.level, 3);
  assert.deepEqual({ x: neu.x, y: neu.y }, wald.karte.ankuenfte[u.ankunft]);
  assert.deepEqual(wechsel.start, { x: neu.x, y: neu.y });

  // Client zählt weiter: seq 78 wird angenommen, alte Nummern nicht
  kanal.senden(kodiere({ typ: NACHRICHT.EINGABE, seq: 78, x: 0, y: -1, blick: 0 }));
  kanal.senden(kodiere({ typ: NACHRICHT.EINGABE, seq: 5, x: 0, y: -1, blick: 0 }));
  await warte(10);
  assert.equal(neu.eingabePuffer.length, 1);
  server.tickAusfuehren();
  assert.ok(neu.y < wald.karte.ankuenfte[u.ankunft].y, 'läuft in der neuen Zone');
  // Schnappschüsse kommen jetzt aus der neuen Zone (mit dem neuen Spieler)
  await warteAuf(() => letzte(empfangen, NACHRICHT.ZUSTAND)?.entitaeten.some((e) => e.id === neu.id && e.typ === 'spieler'), 'ZUSTAND der neuen Zone');
  assert.ok(empfangen.some((n) => n.typ === NACHRICHT.MELDUNG && /Waldweg/.test(n.text)));
});

test('Zonenwechsel: Spielstand merkt die Zone, Login landet wieder dort; Erkundung pro Zone', async (t) => {
  const speicher = new ArbeitsspeicherSpeicher();
  const server = new SpielServer({ authentifizierung: new GastAuthentifizierung(), speicher, protokoll: stillerLog });
  t.after(() => server.stoppen());
  const erster = verbinde(server, 'Pendler');
  await warteAuf(() => letzte(erster.empfangen, NACHRICHT.ANMELDUNG_OK), 'Login');
  server.tickAusfuehren(); // markiert erkundete Kacheln im Stadtrand
  await gehDurchUebergang(server, 'Pendler', erster.empfangen);
  server.tickAusfuehren();
  erster.kanal.trennen('weg');
  await warteAuf(() => server.spielerAnzahl === 0, 'Logout');
  await warte(10);
  const stand = await speicher.laden('pendler');
  assert.equal(stand.karte, 'waldweg');
  assert.ok(stand.erkundet.stadtrand && stand.erkundet.waldweg, 'Erkundung beider Zonen gespeichert');

  const zweiter = verbinde(server, 'Pendler');
  await warteAuf(() => letzte(zweiter.empfangen, NACHRICHT.ANMELDUNG_OK), 'zweiter Login');
  const ok = letzte(zweiter.empfangen, NACHRICHT.ANMELDUNG_OK);
  assert.equal(ok.karte.id, 'waldweg');
  assert.equal(ok.erkundet, stand.erkundet.waldweg);
  // zurück in den Stadtrand: dessen Erkundung ist noch da
  await gehDurchUebergang(server, 'Pendler', zweiter.empfangen);
  const zurueck = letzte(zweiter.empfangen, NACHRICHT.ZONE_WECHSEL);
  assert.equal(zurueck.karte.id, 'stadtrand');
  assert.equal(zurueck.erkundet, stand.erkundet.stadtrand);
});

test('Zonen: alter Spielstand (erkundet als { karte, daten }) und unbekannte Zone → Startzone', async (t) => {
  const speicher = new ArbeitsspeicherSpeicher();
  const server = new SpielServer({ authentifizierung: new GastAuthentifizierung(), speicher, protokoll: stillerLog });
  t.after(() => server.stoppen());
  await speicher.speichern('altspieler', { version: 1, karte: 'gibtsnicht', x: 1, y: 1, leben: 50, hunger: 50, durst: 50, inventar: [], erkundet: { karte: 'stadtrand', daten: 'AQ==' } });
  const { empfangen } = verbinde(server, 'Altspieler');
  await warteAuf(() => letzte(empfangen, NACHRICHT.ANMELDUNG_OK), 'Login');
  assert.equal(letzte(empfangen, NACHRICHT.ANMELDUNG_OK).karte.id, 'stadtrand');
  assert.equal(server.weltVon('Altspieler').holen(letzte(empfangen, NACHRICHT.ANMELDUNG_OK).spielerId).erkundet[0], 1, 'altes Format übernommen');
});

test('Zonen: unbekanntes Ziel → "versperrt", Spieler bleibt', async (t) => {
  const definition = { id: 'insel', name: 'Insel', kacheln: ['S.....', '......'], raeume: {}, uebergaenge: [{ x: 5, y: 0, b: 1, h: 2, ziel: 'atlantis', ankunft: 'x', name: 'Atlantis' }] };
  const server = new SpielServer({ authentifizierung: new GastAuthentifizierung(), protokoll: stillerLog, kartenDefinition: definition });
  t.after(() => server.stoppen());
  const { empfangen } = verbinde(server, 'Kapitaen');
  await warteAuf(() => letzte(empfangen, NACHRICHT.ANMELDUNG_OK), 'Login');
  const ich = [...server.spielWelt.alleVomTyp('spieler')][0];
  ich.x = 5.5 * 32;
  server.tickAusfuehren();
  server.tickAusfuehren(); // zweimal: darf nicht dauernd melden
  await warteAuf(() => empfangen.some((n) => n.typ === NACHRICHT.MELDUNG && /versperrt/.test(n.text)), 'Meldung');
  assert.equal(empfangen.filter((n) => n.typ === NACHRICHT.MELDUNG && /versperrt/.test(n.text)).length, 1);
  assert.equal(server.spielWelt.holen(ich.id), ich);
});

test('Zonen: pausierte Zone holt beim Betreten Zeit nach (Pflanzen wachsen weiter)', () => {
  const konfiguration = erstelleKonfiguration({ server: { zufallsStartwert: 3 } });
  const welt = new SpielWelt(konfiguration, { kartenDefinition: KARTEN.waldweg });
  const { tagSekunden, nachtSekunden } = welt.tageszeitDauer();
  welt.welt.setzeBauwerk({ id: 1, typ: 'beet', tx: 30, ty: 30, pflanze: 'tomate', wachstum: 0, besitzer: '' });
  holeZeitNach(welt, welt.zeit, 1 + konfiguration.bauen.wachstumsTage); // ein ganzer Wachstumszeitraum später
  assert.equal(welt.tag, 1 + konfiguration.bauen.wachstumsTage);
  assert.ok(welt.welt.bauwerke.get(1).wachstum >= 1, 'reif');
  holeZeitNach(welt, 10, 1); // Zone liegt vorne → nur Uhr stellen
  assert.equal(welt.zeit, 10);
  assert.ok(tagSekunden + nachtSekunden > 0);
});

test('Schlafen zonenübergreifend: Zeit läuft nur, wenn auch die Spieler der anderen Zonen schlafen', () => {
  const konfiguration = erstelleKonfiguration({ server: { zufallsStartwert: 4 } });
  const welt = new SpielWelt(konfiguration);
  for (const z of [...welt.alleVomTyp('zombie')]) welt.entfernen(z.id);
  const schlaefer = welt.spielerBetrittWelt('Murmel');
  const schlafen = () => ({ art: 'schlafen', dauer: 1, rest: TICK_DAUER_S / 2, x: schlaefer.x, y: schlaefer.y, ort: null });
  let andere = [{ tot: false, arbeit: null }]; // in einer anderen Zone ist jemand wach
  welt.spielerAndererZonen = () => andere;
  const zeit = welt.zeit;
  schlaefer.arbeit = schlafen();
  welt.aktualisiere(TICK_DAUER_S);
  assert.equal(schlaefer.arbeit, null, 'wacht auf');
  assert.ok(welt.zeit - zeit < 1, 'keine Zeit vorgespult');
  assert.equal(welt.zeitSprung, 0);

  andere = [{ tot: false, arbeit: { art: 'schlafen', fertig: true } }];
  schlaefer.arbeit = schlafen();
  welt.aktualisiere(TICK_DAUER_S);
  assert.equal(welt.zeitSprung, konfiguration.schlafen.stunden, 'Server soll die anderen Zonen mitziehen');
});

test('Zonenwechsel: Toter zieht nicht um; derselbe Account kann sich währenddessen nicht doppelt einloggen', async (t) => {
  const server = new SpielServer({ authentifizierung: new GastAuthentifizierung(), protokoll: stillerLog });
  t.after(() => server.stoppen());
  const { empfangen } = verbinde(server, 'Doppelt');
  await warteAuf(() => letzte(empfangen, NACHRICHT.ANMELDUNG_OK), 'Login');
  const ich = [...server.spielWelt.alleVomTyp('spieler')][0];
  ich.zonenwechsel = { ziel: 'waldweg', ankunft: 'sued', name: 'Waldweg' };
  ich.tot = true;
  ich.respawnRest = 100;
  server.tickAusfuehren();
  await warte(20);
  assert.equal(server.weltVon('Doppelt').karte.daten.id, 'stadtrand', 'Toter bleibt in der Zone');
  ich.tot = false;
  const zweiter = verbinde(server, 'Doppelt');
  await warteAuf(() => letzte(zweiter.empfangen, NACHRICHT.ANMELDUNG_FEHLER), 'zweiter Login abgelehnt');
});

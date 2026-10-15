import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SpielServer } from '../server/spiel/spielServer.js';
import { GastAuthentifizierung } from '../server/spiel/authentifizierung/gastAuthentifizierung.js';
import { erstelleSpeicherKanalPaar } from '../server/spiel/netz/speicherKanal.js';
import { NACHRICHT, kodiere, dekodiere } from '../gemeinsam/protokoll.js';
import { PROTOKOLL_VERSION } from '../gemeinsam/konstanten.js';

const stillerLog = { info() {}, warn() {}, error() {} };
const warte = (ms = 5) => new Promise((r) => setTimeout(r, ms));

/** Wartet, bis bedingung() wahr ist (max. 1 s) – robuster als feste Wartezeiten. */
async function warteAuf(bedingung, beschreibung) {
  for (let i = 0; i < 200; i++) {
    if (bedingung()) return;
    await warte();
  }
  assert.fail(`Zeitüberschreitung: ${beschreibung}`);
}

function neuerServer(authentifizierung = new GastAuthentifizierung()) {
  return new SpielServer({ authentifizierung, konfiguration: { server: { zufallsStartwert: 42 } }, protokoll: stillerLog });
}

function verbinde(server) {
  const { clientSeite, serverSeite } = erstelleSpeicherKanalPaar();
  const empfangen = [];
  clientSeite.beiNachricht((t) => empfangen.push(dekodiere(t)));
  server.verbindungHinzufuegen(serverSeite);
  return { senden: (n) => clientSeite.senden(kodiere(n)), empfangen, kanal: clientSeite };
}

test('Login, Eingabe, Bewegung – kompletter Ablauf über den Kanal', async (t) => {
  const server = neuerServer();
  t.after(() => server.stoppen());
  const client = verbinde(server);

  client.senden({ typ: NACHRICHT.ANMELDEN, benutzername: 'Tester', passwort: '', protokoll: PROTOKOLL_VERSION });
  await warteAuf(() => client.empfangen.some((n) => n.typ === NACHRICHT.ANMELDUNG_OK), 'ANMELDUNG_OK');
  const ok = client.empfangen.find((n) => n.typ === NACHRICHT.ANMELDUNG_OK);
  assert.equal(ok.karte.id, 'stadtrand');
  assert.ok(ok.gegenstaende.length > 0, 'Loot sollte verteilt sein');

  // 10 Ticks nach oben laufen
  for (let seq = 1; seq <= 10; seq++) client.senden({ typ: NACHRICHT.EINGABE, seq, x: 0, y: -1, blick: 0 });
  const spieler = server.spielWelt.holen(ok.spielerId);
  await warteAuf(() => spieler.letzteEmpfangeneSeq === 10, 'alle Eingaben empfangen');
  for (let i = 0; i < 3; i++) server.tickAusfuehren();
  const anzahlVorher = client.empfangen.length;
  await warteAuf(() => client.empfangen.length >= anzahlVorher + 3, 'Schnappschüsse');

  const zustand = client.empfangen.filter((n) => n.typ === NACHRICHT.ZUSTAND).at(-1);
  const ich = zustand.entitaeten.find((e) => e.id === ok.spielerId);
  assert.equal(ich.seq, 8, 'Eingabepuffer ist auf 8 begrenzt');
  assert.ok(ich.y < ok.start.y, 'Spieler hat sich nach oben bewegt');
  assert.ok(zustand.entitaeten.some((e) => e.typ === 'zombie'), 'Zombies im Schnappschuss');
});

test('Falsche Protokollversion und ungültiger Name werden abgelehnt', async (t) => {
  const server = neuerServer();
  t.after(() => server.stoppen());
  const client = verbinde(server);
  client.senden({ typ: NACHRICHT.ANMELDEN, benutzername: 'Tester', protokoll: -1 });
  client.senden({ typ: NACHRICHT.ANMELDEN, benutzername: 'x', protokoll: PROTOKOLL_VERSION });
  await warteAuf(() => client.empfangen.length >= 2, 'zwei Antworten');
  const fehler = client.empfangen.filter((n) => n.typ === NACHRICHT.ANMELDUNG_FEHLER);
  assert.equal(fehler.length, 2);
});

test('Gleicher Account kann nicht doppelt eingeloggt sein', async (t) => {
  const server = neuerServer();
  t.after(() => server.stoppen());
  const a = verbinde(server);
  const b = verbinde(server);
  a.senden({ typ: NACHRICHT.ANMELDEN, benutzername: 'Doppelt', protokoll: PROTOKOLL_VERSION });
  await warteAuf(() => server.spielerAnzahl === 1, 'erster Login');
  b.senden({ typ: NACHRICHT.ANMELDEN, benutzername: 'doppelt', protokoll: PROTOKOLL_VERSION });
  await warteAuf(() => b.empfangen.length > 0, 'Antwort an zweiten Client');
  assert.ok(b.empfangen.some((n) => n.typ === NACHRICHT.ANMELDUNG_FEHLER));
  assert.equal(server.spielerAnzahl, 1);
});

test('Trennung entfernt den Spieler aus der Welt', async (t) => {
  const server = neuerServer();
  t.after(() => server.stoppen());
  const client = verbinde(server);
  client.senden({ typ: NACHRICHT.ANMELDEN, benutzername: 'Weg', protokoll: PROTOKOLL_VERSION });
  await warteAuf(() => server.spielerAnzahl === 1, 'Login');
  assert.equal(server.spielWelt.anzahlVomTyp('spieler'), 1);
  client.kanal.trennen('tschüss');
  assert.equal(server.spielWelt.anzahlVomTyp('spieler'), 0);
});

test('Kaputte Nachrichten bringen den Server nicht zum Absturz', async (t) => {
  const server = neuerServer();
  t.after(() => server.stoppen());
  const client = verbinde(server);
  client.kanal.senden('{kein json');
  client.kanal.senden('null');
  client.senden({ typ: 'gibtsNicht' });
  client.senden({ typ: NACHRICHT.EINGABE, seq: 'a' });
  await warte();
  server.tickAusfuehren();
});

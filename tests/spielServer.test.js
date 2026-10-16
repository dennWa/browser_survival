import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SpielServer } from '../server/spiel/spielServer.js';
import { GastAuthentifizierung } from '../server/spiel/authentifizierung/gastAuthentifizierung.js';
import { erstelleSpeicherKanalPaar } from '../server/spiel/netz/speicherKanal.js';
import { NACHRICHT, kodiere, dekodiere } from '../gemeinsam/protokoll.js';
import { PROTOKOLL_VERSION } from '../gemeinsam/konstanten.js';
import { GEGENSTAENDE } from '../server/spiel/konfiguration/gegenstaende.js';

const PISTOLE_SCHADEN = GEGENSTAENDE.pistole.schaden;

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

test('Developer-Modus: nur Admins dürfen Werte ändern – wirkt sofort und wird gespeichert', async (t) => {
  const gespeichert = [];
  const server = new SpielServer({
    authentifizierung: { pruefe: async (name) => ({ ok: true, benutzername: name, admin: name === 'Chef' }) },
    konfiguration: { server: { zufallsStartwert: 42, name: 'Testserver' } },
    protokoll: stillerLog,
    einstellungsSpeicher: { speichern: (o) => gespeichert.push(o) },
  });
  t.after(() => {
    server.stoppen();
    // Item-Werte sind global → wieder auf Standard
    GEGENSTAENDE.pistole.schaden = PISTOLE_SCHADEN;
  });
  const anmelden = async (name) => {
    const c = verbinde(server);
    c.senden({ typ: NACHRICHT.ANMELDEN, benutzername: name, passwort: '', protokoll: PROTOKOLL_VERSION });
    await warteAuf(() => c.empfangen.some((n) => n?.typ === NACHRICHT.ANMELDUNG_OK), `Login ${name}`);
    return c;
  };
  const gast = await anmelden('Gast');
  const chef = await anmelden('Chef');

  gast.senden({ typ: NACHRICHT.DEV_SETZEN, werte: { 'spieler.geschwindigkeit': 300 } });
  await warte(20);
  assert.equal(server.konfiguration.spieler.geschwindigkeit, 150, 'Nicht-Admin: keine Wirkung');

  chef.senden({ typ: NACHRICHT.DEV_SETZEN, werte: { 'spieler.geschwindigkeit': 220, 'gegenstaende.pistole.schaden': 99, 'zombie.leben': 99999 } });
  await warteAuf(() => chef.empfangen.some((n) => n?.typ === NACHRICHT.DEV_WERTE), 'DEV_WERTE');
  assert.equal(server.konfiguration.spieler.geschwindigkeit, 220);
  assert.equal(server.spielWelt.physikParameter().geschwindigkeit, 220);
  assert.equal(GEGENSTAENDE.pistole.schaden, 99);
  assert.equal(server.konfiguration.zombie.leben, 1000, 'auf max begrenzt');
  assert.ok(gast.empfangen.some((n) => n?.typ === NACHRICHT.EINSTELLUNGEN && n.physik.geschwindigkeit === 220), 'alle bekommen neue Physik');
  await warteAuf(() => gespeichert.length > 0, 'gespeichert');
  assert.equal(gespeichert.at(-1).spieler.geschwindigkeit, 220);
  assert.equal(gespeichert.at(-1).gegenstaende.pistole.schaden, 99);
  assert.equal(gespeichert.at(-1).server.name, 'Testserver', 'andere Einstellungen bleiben erhalten');

  chef.senden({ typ: NACHRICHT.DEV_ZURUECKSETZEN });
  await warteAuf(() => GEGENSTAENDE.pistole.schaden === PISTOLE_SCHADEN, 'zurückgesetzt');
  assert.equal(server.konfiguration.spieler.geschwindigkeit, 150);
  assert.equal(gespeichert.at(-1).spieler?.geschwindigkeit, undefined);
});

test('Chat: Nachricht geht an alle, wird bereinigt, Spam wird gebremst, Beitritt wird angesagt', async (t) => {
  const server = neuerServer();
  t.after(() => server.stoppen());
  const anmelden = async (name) => {
    const c = verbinde(server);
    c.senden({ typ: NACHRICHT.ANMELDEN, benutzername: name, passwort: '', protokoll: PROTOKOLL_VERSION });
    await warteAuf(() => c.empfangen.some((n) => n?.typ === NACHRICHT.ANMELDUNG_OK), `Login ${name}`);
    return c;
  };
  const anna = await anmelden('Anna');
  const ben = await anmelden('Ben');
  await warteAuf(() => anna.empfangen.some((n) => n?.typ === NACHRICHT.CHAT && n.system && n.text.includes('Ben')), 'Beitritt angesagt');

  ben.senden({ typ: NACHRICHT.CHAT, text: '  Hallo\n   zusammen!  ' });
  ben.senden({ typ: NACHRICHT.CHAT, text: 'Spam' });
  await warteAuf(() => anna.empfangen.some((n) => n?.typ === NACHRICHT.CHAT && n.von === 'Ben'), 'Chat angekommen');
  await warte(20);
  const nachrichten = anna.empfangen.filter((n) => n?.typ === NACHRICHT.CHAT && n.von === 'Ben');
  assert.equal(nachrichten.length, 1, 'zweite Nachricht zu schnell → verworfen');
  assert.equal(nachrichten[0].text, 'Hallo zusammen!');
});

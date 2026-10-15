import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { SpielServer } from '../server/spiel/spielServer.js';
import { GastAuthentifizierung } from '../server/spiel/authentifizierung/gastAuthentifizierung.js';
import { ArbeitsspeicherSpeicher } from '../server/spiel/speicher/arbeitsspeicherSpeicher.js';
import { erstelleSpeicherKanalPaar } from '../server/spiel/netz/speicherKanal.js';
import { erstelleKonfiguration } from '../server/spiel/konfiguration/spielKonfiguration.js';
import { SpielWelt } from '../server/spiel/spielWelt.js';
import { wendeSpielstandAn, erstelleSpielstand } from '../server/spiel/spielstand.js';
import { DateiSpeicher } from '../server/node/dateiSpeicher.js';
import { NACHRICHT, kodiere, dekodiere } from '../gemeinsam/protokoll.js';
import { PROTOKOLL_VERSION } from '../gemeinsam/konstanten.js';

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

test('Ausloggen und wieder einloggen: Inventar, Werte und Position bleiben erhalten', async (t) => {
  const speicher = new ArbeitsspeicherSpeicher();
  const server = new SpielServer({ authentifizierung: new GastAuthentifizierung(), speicher, protokoll: stillerLog });
  t.after(() => server.stoppen());

  const erster = verbinde(server, 'Sammler');
  await warteAuf(() => server.spielerAnzahl === 1, 'Login');
  const spieler = [...server.spielWelt.alleVomTyp('spieler')][0];
  spieler.inventar[0] = { defId: 'pistole', menge: 1, magazin: 7 };
  spieler.inventar[2] = { defId: 'konservendose', menge: 3 };
  spieler.ausgeruestet = 0;
  spieler.hunger = 42;
  spieler.leben = 66;
  spieler.x += 32;
  const position = { x: spieler.x, y: spieler.y };

  erster.kanal.trennen('weg');
  await server.speichereAlle();
  assert.equal(server.spielerAnzahl, 0);

  const zweiter = verbinde(server, 'sammler'); // Groß-/Kleinschreibung egal
  await warteAuf(() => zweiter.empfangen.some((n) => n?.typ === NACHRICHT.ANMELDUNG_OK), 'zweiter Login');
  const ok = zweiter.empfangen.find((n) => n.typ === NACHRICHT.ANMELDUNG_OK);
  assert.deepEqual(ok.spielerDaten.inventar[0], { defId: 'pistole', menge: 1, magazin: 7 });
  assert.deepEqual(ok.spielerDaten.inventar[2], { defId: 'konservendose', menge: 3 });
  assert.equal(ok.spielerDaten.ausgeruestet, 0);
  assert.equal(ok.spielerDaten.hunger, 42);
  assert.equal(ok.spielerDaten.leben, 66);
  assert.deepEqual(ok.start, position);

  server.tickAusfuehren();
  await warteAuf(() => zweiter.empfangen.some((n) => n?.typ === NACHRICHT.MELDUNG && n.text === 'Spielstand geladen'), 'Meldung');
});

test('Kaputte oder manipulierte Spielstände werden bereinigt', () => {
  const konfiguration = erstelleKonfiguration({ server: { zufallsStartwert: 1 } });
  const welt = new SpielWelt(konfiguration);
  const spieler = welt.spielerBetrittWelt('Schummler');
  const start = { x: spieler.x, y: spieler.y };
  const geladen = wendeSpielstandAn(
    spieler,
    {
      version: 1,
      karte: 'stadtrand',
      x: 32 * 32 + 16, // Wand! (Krankenhaus-Außenwand)
      y: 10 * 32 + 16,
      leben: 99999,
      hunger: -50,
      durst: 'viel',
      inventar: [
        { defId: 'raketenwerfer', menge: 1 },
        { defId: 'munition_9mm', menge: 100000 },
        { defId: 'pistole', menge: 5, magazin: 999 },
        { defId: 'apfel', menge: -3 },
      ],
      ausgeruestet: 1, // Munition ist keine Waffe
    },
    welt,
  );
  assert.equal(geladen, true);
  assert.deepEqual({ x: spieler.x, y: spieler.y }, start, 'Position in der Wand wird ignoriert');
  assert.equal(spieler.leben, spieler.maxLeben);
  assert.equal(spieler.hunger, 0);
  assert.equal(spieler.inventar[0], null);
  assert.deepEqual(spieler.inventar[1], { defId: 'munition_9mm', menge: 60 });
  assert.deepEqual(spieler.inventar[2], { defId: 'pistole', menge: 1, magazin: 15 });
  assert.equal(spieler.inventar[3], null);
  assert.equal(spieler.ausgeruestet, null);
});

test('Toter Spielstand → frischer Start; falsche Version wird ignoriert', () => {
  const welt = new SpielWelt(erstelleKonfiguration({}));
  const spieler = welt.spielerBetrittWelt('Neu');
  const stand = erstelleSpielstand(spieler, 'stadtrand');
  assert.equal(wendeSpielstandAn(spieler, { ...stand, leben: 0 }, welt), false);
  assert.equal(wendeSpielstandAn(spieler, { ...stand, version: 999 }, welt), false);
  assert.equal(wendeSpielstandAn(spieler, null, welt), false);
});

test('DateiSpeicher: schreibt atomar, liest zurück, verkraftet kaputte Dateien', async (t) => {
  const ordner = await mkdtemp(path.join(tmpdir(), 'spielstaende-'));
  t.after(() => rm(ordner, { recursive: true, force: true }));
  const speicher = new DateiSpeicher(ordner);
  assert.equal(await speicher.laden('Niemand'), null);
  await speicher.speichern('Anna', { version: 1, leben: 50 });
  assert.deepEqual(await speicher.laden('anna'), { version: 1, leben: 50 });
  assert.deepEqual(await readdir(ordner), ['anna.json'], 'keine Temp-Dateien übrig');
  await writeFile(path.join(ordner, 'kaputt.json'), '{halb');
  assert.equal(await speicher.laden('kaputt'), null);
});

test('Server-Stopp speichert alle eingeloggten Spieler', async () => {
  const speicher = new ArbeitsspeicherSpeicher();
  const server = new SpielServer({ authentifizierung: new GastAuthentifizierung(), speicher, protokoll: stillerLog });
  verbinde(server, 'Bleiber');
  await warteAuf(() => server.spielerAnzahl === 1, 'Login');
  [...server.spielWelt.alleVomTyp('spieler')][0].inventar[5] = { defId: 'machete', menge: 1 };
  await server.stoppen();
  const stand = await speicher.laden('bleiber');
  assert.deepEqual(stand.inventar[5], { defId: 'machete', menge: 1 });
});

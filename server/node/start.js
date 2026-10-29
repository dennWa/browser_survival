import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { SpielServer } from '../spiel/spielServer.js';
import { GastAuthentifizierung } from '../spiel/authentifizierung/gastAuthentifizierung.js';
import { KontenAuthentifizierung } from './kontenAuthentifizierung.js';
import { DateiSpeicher } from './dateiSpeicher.js';
import { dateiEinstellungsSpeicher, ladeEinstellungen } from './einstellungenLaden.js';
import { erstelleStatischenServer } from './statischerServer.js';
import { bindeWebsocketServer } from './websocketAnbindung.js';

/**
 * Einstiegspunkt des Mehrspieler-Servers:  npm start
 *
 * Umgebungsvariablen:
 *   PORT=8080        HTTP/WebSocket-Port
 *   GAST_MODUS=1     Login ohne Account (nur zum Testen!) – alternativ: npm run start:gast
 *   DATEN_ORDNER=…   Ordner für Spielstände + Developer-Einstellungen (Standard: server/daten) – beim Hoster
 *                    auf die dauerhafte Festplatte zeigen lassen, z. B. /var/data
 *   SPIELSTAENDE=…   nur der Spielstand-Ordner (Standard: <DATEN_ORDNER>/spielstaende)
 *   KONTEN_DATEI=…   Pfad zur Konten-Datei (Standard: /etc/secrets/konten.json falls vorhanden – Render
 *                    "Secret File" –, sonst server/daten/konten.json). Vorlage: server/daten/konten.beispiel.json
 *   KONTEN_JSON=…    Accounts direkt als JSON-Text (Alternative zur Datei)
 *   GAESTE=0         "Als Gast spielen" abschalten (Standard: Gäste erlaubt)
 *   SERVER_NAME=…    Name in der Spielerliste/Statuszeile
 */
const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DATEN = path.join(WURZEL, 'server/daten');
const SCHREIBBAR = process.env.DATEN_ORDNER || DATEN;
const PORT = Number(process.env.PORT ?? 8080);
const RENDER_SECRET = '/etc/secrets/konten.json';
const KONTEN_DATEI = process.env.KONTEN_DATEI || (existsSync(RENDER_SECRET) ? RENDER_SECRET : path.join(DATEN, 'konten.json'));

const gastModus = process.env.GAST_MODUS === '1' || process.argv.includes('--gast');
const authentifizierung = gastModus
  ? new GastAuthentifizierung()
  : new KontenAuthentifizierung(KONTEN_DATEI, { kontenJson: process.env.KONTEN_JSON || null });

const spielServer = new SpielServer({
  authentifizierung,
  speicher: new DateiSpeicher(process.env.SPIELSTAENDE || path.join(SCHREIBBAR, 'spielstaende')),
  konfiguration: { bots: { proKarte: Number(process.env.BOTS ?? 2) }, ...mitUmgebung(ladeEinstellungen(path.join(SCHREIBBAR, 'einstellungen.json'))) }, // Runde 23: 2 Test-Bots je Zone (BOTS=0 = aus)
  // Developer-Modus speichert Änderungen dorthin zurück
  einstellungsSpeicher: dateiEinstellungsSpeicher(path.join(SCHREIBBAR, 'einstellungen.json')),
});

/** Umgebungsvariablen (GAESTE, SERVER_NAME) über die gespeicherten Einstellungen legen. */
function mitUmgebung(einstellungen) {
  const server = { ...einstellungen.server };
  if (process.env.GAESTE === '0') server.gaeste = false;
  if (process.env.SERVER_NAME) server.name = process.env.SERVER_NAME.slice(0, 40);
  return { ...einstellungen, server };
}

const httpServer = erstelleStatischenServer(WURZEL);
bindeWebsocketServer(httpServer, spielServer);

spielServer.starten();
httpServer.listen(PORT, () => {
  console.info(`[Server] Spiel erreichbar unter http://localhost:${PORT}`);
  if (gastModus) console.warn('[Server] GAST_MODUS aktiv – jeder kann sich ohne Passwort einloggen!');
  else if (!existsSync(KONTEN_DATEI) && !process.env.KONTEN_JSON) {
    console.warn(`[Server] Keine Accounts (${KONTEN_DATEI}). Vorlage kopieren: server/daten/konten.beispiel.json → konten.json`);
  } else console.info(`[Server] Accounts aus ${process.env.KONTEN_JSON ? 'KONTEN_JSON' : KONTEN_DATEI}`);
  if (process.env.GAESTE === '0') console.info('[Server] Gäste abgeschaltet (GAESTE=0)');
});

async function beenden() {
  console.info('[Server] Fahre herunter, speichere Spielstände …');
  setTimeout(() => process.exit(1), 5000).unref(); // Notbremse
  await spielServer.stoppen('Server wird neu gestartet');
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000).unref();
}
process.on('SIGINT', beenden);
process.on('SIGTERM', beenden);

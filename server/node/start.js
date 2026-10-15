import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { SpielServer } from '../spiel/spielServer.js';
import { GastAuthentifizierung } from '../spiel/authentifizierung/gastAuthentifizierung.js';
import { KontenAuthentifizierung } from './kontenAuthentifizierung.js';
import { ladeEinstellungen } from './einstellungenLaden.js';
import { erstelleStatischenServer } from './statischerServer.js';
import { bindeWebsocketServer } from './websocketAnbindung.js';

/**
 * Einstiegspunkt des Mehrspieler-Servers:  npm start
 *
 * Umgebungsvariablen:
 *   PORT=8080        HTTP/WebSocket-Port
 *   GAST_MODUS=1     Login ohne Account (nur zum Testen!) – alternativ: npm run start:gast
 */
const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DATEN = path.join(WURZEL, 'server/daten');
const PORT = Number(process.env.PORT ?? 8080);
const KONTEN_DATEI = path.join(DATEN, 'konten.json');

const gastModus = process.env.GAST_MODUS === '1' || process.argv.includes('--gast');
const authentifizierung = gastModus ? new GastAuthentifizierung() : new KontenAuthentifizierung(KONTEN_DATEI);

const spielServer = new SpielServer({
  authentifizierung,
  konfiguration: ladeEinstellungen(path.join(DATEN, 'einstellungen.json')),
});

const httpServer = erstelleStatischenServer(WURZEL);
bindeWebsocketServer(httpServer, spielServer);

spielServer.starten();
httpServer.listen(PORT, () => {
  console.info(`[Server] Spiel erreichbar unter http://localhost:${PORT}`);
  if (gastModus) console.warn('[Server] GAST_MODUS aktiv – jeder kann sich ohne Passwort einloggen!');
  else if (!existsSync(KONTEN_DATEI)) {
    console.warn('[Server] Keine Accounts vorhanden. Anlegen mit: npm run konto -- <name> <passwort>');
  }
});

function beenden() {
  console.info('[Server] Fahre herunter …');
  spielServer.stoppen('Server wird neu gestartet');
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on('SIGINT', beenden);
process.on('SIGTERM', beenden);

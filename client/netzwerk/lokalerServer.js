import { SpielServer } from '../../server/spiel/spielServer.js';
import { GastAuthentifizierung } from '../../server/spiel/authentifizierung/gastAuthentifizierung.js';
import { erstelleSpeicherKanalPaar } from '../../server/spiel/netz/speicherKanal.js';
import { BrowserSpeicher } from './browserSpeicher.js';
import { LOKALE_LATENZ_MS } from '../konfiguration.js';

/**
 * Lokal-Modus: Der ECHTE SpielServer läuft hier im Browser-Tab.
 * Client und Server reden trotzdem nur über einen (Speicher-)Kanal miteinander –
 * dadurch verhält sich der Lokal-Modus genau wie der Mehrspieler-Modus.
 */
let server = null;
const EINSTELLUNGEN_SCHLUESSEL = 'browser-survival-einstellungen';

/** Developer-Änderungen im Lokal-Modus: im Browser gespeichert (wie einstellungen.json beim Node-Server). */
function ladeLokaleEinstellungen() {
  try {
    const gespeichert = JSON.parse(localStorage.getItem(EINSTELLUNGEN_SCHLUESSEL) ?? '{}');
    return gespeichert && typeof gespeichert === 'object' ? gespeichert : {};
  } catch {
    return {};
  }
}

const lokalerEinstellungsSpeicher = {
  speichern(ueberschreibungen) {
    localStorage.setItem(EINSTELLUNGEN_SCHLUESSEL, JSON.stringify(ueberschreibungen));
  },
};

/** Der im Tab laufende Server (für Konsole/Developer-Werkzeuge) – null, solange keiner läuft. */
export function lokalerServer() {
  return server;
}

export function oeffneLokalenKanal() {
  if (!server) {
    server = new SpielServer({
      authentifizierung: new GastAuthentifizierung({ admin: true }), // lokal = eigenes Spiel → Admin-Menü frei
      konfiguration: { ...ladeLokaleEinstellungen(), server: { name: 'Lokaler Server' } },
      speicher: new BrowserSpeicher(),
      einstellungsSpeicher: lokalerEinstellungsSpeicher,
    });
    server.starten();
    // Tab wird geschlossen/neu geladen → Spielstand sichern (localStorage schreibt sofort)
    window.addEventListener('pagehide', () => server.speichereAlle());
  }
  const { clientSeite, serverSeite } = erstelleSpeicherKanalPaar({ latenzMs: LOKALE_LATENZ_MS });
  server.verbindungHinzufuegen(serverSeite, { adresse: 'lokal' });
  return clientSeite;
}

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

/** Der im Tab laufende Server (für Konsole/Developer-Werkzeuge) – null, solange keiner läuft. */
export function lokalerServer() {
  return server;
}

export function oeffneLokalenKanal() {
  if (!server) {
    server = new SpielServer({
      authentifizierung: new GastAuthentifizierung({ admin: true }), // lokal = eigenes Spiel → Admin-Menü frei
      konfiguration: { server: { name: 'Lokaler Server' } },
      speicher: new BrowserSpeicher(),
    });
    server.starten();
    // Tab wird geschlossen/neu geladen → Spielstand sichern (localStorage schreibt sofort)
    window.addEventListener('pagehide', () => server.speichereAlle());
  }
  const { clientSeite, serverSeite } = erstelleSpeicherKanalPaar({ latenzMs: LOKALE_LATENZ_MS });
  server.verbindungHinzufuegen(serverSeite, { adresse: 'lokal' });
  return clientSeite;
}

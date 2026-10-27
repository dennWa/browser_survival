import { SpielServer } from '../../server/spiel/spielServer.js';
import { GastAuthentifizierung } from '../../server/spiel/authentifizierung/gastAuthentifizierung.js';
import { erstelleSpeicherKanalPaar } from '../../server/spiel/netz/speicherKanal.js';
import { BrowserSpeicher } from './browserSpeicher.js';
import { ArbeitsspeicherSpeicher } from '../../server/spiel/speicher/arbeitsspeicherSpeicher.js';
import { LOKALE_LATENZ_MS } from '../konfiguration.js';
import { TUTORIAL } from '../../server/spiel/karten/tutorial.js';

/**
 * Lokal-Modus: Der ECHTE SpielServer läuft hier im Browser-Tab.
 * Client und Server reden trotzdem nur über einen (Speicher-)Kanal miteinander –
 * dadurch verhält sich der Lokal-Modus genau wie der Mehrspieler-Modus.
 */
let server = null;
const EINSTELLUNGEN_SCHLUESSEL = 'browser-survival-einstellungen';
/** Map-Editor-Test: { start, karten: { id: Kartendefinition } } – dann laufen genau diese Karten (zur Laufzeit registriert) */
let testKarten = null;

/**
 * Testmodus des Map-Editors (client/?editorTest=1): Entwürfe als Zonen registrieren, OHNE Repo-Code zu ändern.
 * Spielstände & Welt laufen dann nur im Arbeitsspeicher (der echte Lokal-Spielstand bleibt unberührt).
 */
export function setzeTestKarten(karten) {
  testKarten = karten;
}

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
      konfiguration: { ...ladeLokaleEinstellungen(), server: { name: testKarten ? 'Editor-Test' : 'Lokaler Server' } },
      speicher: testKarten ? new ArbeitsspeicherSpeicher() : new BrowserSpeicher(),
      einstellungsSpeicher: lokalerEinstellungsSpeicher,
      ...(testKarten ? { kartenDefinition: testKarten.karten[testKarten.start], kartenDefinitionen: testKarten.karten } : {}),
    });
    server.starten();
    // Tab wird geschlossen/neu geladen → Spielstand sichern (localStorage schreibt sofort)
    window.addEventListener('pagehide', () => server.speichereAlle());
  }
  const { clientSeite, serverSeite } = erstelleSpeicherKanalPaar({ latenzMs: LOKALE_LATENZ_MS });
  server.verbindungHinzufuegen(serverSeite, { adresse: 'lokal' });
  return clientSeite;
}

/** Tutorial (TUTORIAL_KONZEPT.md): eigener, wegwerfbarer Server nur mit der Tutorial-Zone – Spielstand nur im Arbeitsspeicher. */
let tutorialServer = null;

export function oeffneTutorialKanal() {
  beendeTutorial();
  tutorialServer = new SpielServer({
    authentifizierung: new GastAuthentifizierung({ admin: false }),
    konfiguration: { server: { name: 'Tutorial' } },
    speicher: new ArbeitsspeicherSpeicher(),
    kartenDefinition: TUTORIAL,
  });
  tutorialServer.starten();
  const { clientSeite, serverSeite } = erstelleSpeicherKanalPaar({ latenzMs: 0 });
  tutorialServer.verbindungHinzufuegen(serverSeite, { adresse: 'tutorial' });
  return clientSeite;
}

/** Tutorial-Server stoppen (Ende, Abbruch) – nichts wird gespeichert. */
export function beendeTutorial() {
  if (!tutorialServer) return;
  const s = tutorialServer;
  tutorialServer = null;
  s.taktgeber.stoppen();
  s.gestoppt = true;
  for (const sitzung of s.sitzungen) sitzung.kanal.trennen('Tutorial beendet');
}

/** Der Tutorial-Server (Konsole/Tests) oder null. */
export function tutorialServerInstanz() {
  return tutorialServer;
}

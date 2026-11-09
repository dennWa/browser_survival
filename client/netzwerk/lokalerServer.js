import { SpielServer } from '../../server/spiel/spielServer.js';
import { GastAuthentifizierung } from '../../server/spiel/authentifizierung/gastAuthentifizierung.js';
import { erstelleSpeicherKanalPaar } from '../../server/spiel/netz/speicherKanal.js';
import { BrowserSpeicher } from './browserSpeicher.js';
import { ArbeitsspeicherSpeicher } from '../../server/spiel/speicher/arbeitsspeicherSpeicher.js';
import { LOKALE_LATENZ_MS } from '../konfiguration.js';
import { TUTORIAL } from '../../server/spiel/karten/tutorial.js';
import { slotPraefix, slotGespielt } from './spielstandSlots.js';
import { Host } from './p2p.js';
import { hostPraefix, aktualisiereHostWelt } from './hostWelten.js';
import { workerPlaner } from './workerTakt.js';

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

/** Runde 28: Singleplayer-Slot des laufenden Servers (jeder Slot = eigener Server mit eigenem Speicher-Präfix) */
let serverSlot = null;
let serverSpeicher = null;

/** Alles sofort sichern (Verlassen/Hintergrund): Spieler + Welten erfassen, dann synchron schreiben. */
export function lokalSichern() {
  if (!server) return Promise.resolve();
  const s = server;
  const sp = serverSpeicher;
  const fertig = s.speichereAlle().then(() => sp?.leeren?.());
  sp?.leeren?.(); // was schon erfasst ist, sofort (falls die Seite gleich weg ist)
  return fertig;
}

/** Laufenden Lokal-Server sauber beenden (Slot-Wechsel, zurück ins Hauptmenü): speichern, trennen, Takt stoppen. */
export async function stoppeLokal() {
  if (!server) return;
  const alt = server;
  const sp = serverSpeicher;
  server = null;
  serverSlot = null;
  serverSpeicher = null;
  host?.stoppen(); // Runde 47: Freunde werden getrennt, Vermittler abgemeldet
  host = null;
  hostWeltId = null;
  await alt.stoppen('Der Host hat das Spiel beendet');
  sp?.leeren?.();
}

/** Runde 47: laufendes Hosting (p2p.js Host) – für das Einladen-Fenster im Spiel; null = kein Hosting. */
let host = null;
let hostWeltId = null;
export function laufenderHost() {
  return host;
}

/**
 * Runde 47: „Server hosten“ – eigener SpielServer im Tab mit den Einstellungen des Hosts (PvP, Max. Spieler, Name), Speicher je Welt
 * (alles beim Host), Freunde kommen über p2p.Host (Einladungscode) dazu. Admin ist nur der Host selbst (sein Gastname).
 * @returns Text-Kanal für den eigenen Client
 */
export async function oeffneHostKanal(welt, { hostName, beiStatus = null } = {}) {
  if (server && hostWeltId !== welt.id) await stoppeLokal();
  if (!server) {
    serverSpeicher = new BrowserSpeicher({ praefix: hostPraefix(welt.id) });
    serverSlot = null;
    hostWeltId = welt.id;
    const lokal = ladeLokaleEinstellungen();
    server = new SpielServer({
      authentifizierung: {
        pruefe: async () => ({ ok: false, grund: 'Auf diesem Server spielt man als Gast' }),
        pruefeGast: async (name) => ({ ok: true, benutzername: name, admin: name === hostName }),
      },
      konfiguration: {
        bots: { proKarte: 0 },
        ...lokal,
        welt: { ankunftsKarte: 'lager', ...lokal.welt },
        kampf: { ...lokal.kampf, pvp: welt.pvp === true },
        server: { name: welt.name, maxSpieler: welt.maxSpieler },
      },
      speicher: serverSpeicher,
      einstellungsSpeicher: lokalerEinstellungsSpeicher,
      planer: workerPlaner(), // Hintergrund-Tab: Takt bleibt bei 30/s (sonst gedrosselt)
    });
    server.starten();
    host = new Host({ server, code: welt.code, passwort: welt.passwort, maxGaeste: Math.max(1, welt.maxSpieler - 1), beiStatus });
    host.starten().catch(() => {}); // Status (auch Fehler) meldet beiStatus – allein spielen geht trotzdem
    aktualisiereHostWelt(welt.id, { zuletzt: new Date().toISOString() });
  } else if (host) host.beiStatus = beiStatus;
  const { clientSeite, serverSeite } = erstelleSpeicherKanalPaar({ latenzMs: LOKALE_LATENZ_MS });
  server.verbindungHinzufuegen(serverSeite, { adresse: 'host' });
  return clientSeite;
}

window.addEventListener('pagehide', () => lokalSichern());
// Handy: App-Wechsel/Sperrbildschirm feuert oft kein pagehide → beim Verstecken sichern
document.addEventListener('visibilitychange', () => document.hidden && lokalSichern());

/**
 * @param slot  Singleplayer-Slot (1…3); null = Editor-Test / ohne Slot (alter Präfix)
 */
export async function oeffneLokalenKanal(slot = null) {
  if (server && serverSlot !== slot) await stoppeLokal();
  if (!server) {
    serverSpeicher = testKarten
      ? new ArbeitsspeicherSpeicher()
      : new BrowserSpeicher(slot ? { praefix: slotPraefix(slot), beiSpielerGespeichert: (_name, stand) => slotGespielt(slot, stand) } : {});
    serverSlot = slot;
    const lokal = ladeLokaleEinstellungen();
    server = new SpielServer({
      authentifizierung: new GastAuthentifizierung({ admin: true }), // lokal = eigenes Spiel → Admin-Menü frei
      // Runde 23: 2 Test-Bots je Zone; Runde 42: neue Charaktere starten am Lagerplatz
      konfiguration: { bots: { proKarte: testKarten ? 0 : 2 }, ...lokal, welt: { ankunftsKarte: 'lager', ...lokal.welt }, server: { name: testKarten ? 'Editor-Test' : 'Lokaler Server' } },
      speicher: serverSpeicher,
      einstellungsSpeicher: lokalerEinstellungsSpeicher,
      ...(testKarten ? { kartenDefinition: testKarten.karten[testKarten.start], kartenDefinitionen: testKarten.karten } : {}),
    });
    server.starten();
  }
  const { clientSeite, serverSeite } = erstelleSpeicherKanalPaar({ latenzMs: LOKALE_LATENZ_MS });
  server.verbindungHinzufuegen(serverSeite, { adresse: 'lokal' });
  return clientSeite;
}

/** Tutorial (docs/konzepte/TUTORIAL_KONZEPT.md): eigener, wegwerfbarer Server nur mit der Tutorial-Zone – Spielstand nur im Arbeitsspeicher. */
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

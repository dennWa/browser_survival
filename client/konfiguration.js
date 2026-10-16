/**
 * Client-Einstellungen. Hier werden Server für die Auswahl im Login eingetragen.
 */

function adresseDiesesServers() {
  const protokoll = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protokoll}//${location.host}/ws`;
}

/**
 * Serverliste im Login-Bildschirm.
 *   typ 'lokal'      → Server läuft direkt im Browser-Tab (Einzelspieler/Test, Gastmodus)
 *   typ 'websocket'  → echter Mehrspieler-Server (adresse: null = Eingabefeld anzeigen)
 */
/**
 * Adresse DEINES Online-Servers, z. B. 'wss://browser-survival.onrender.com/ws'.
 * Eingetragen → erscheint auch in der GitHub-Pages-Version als "Online-Server" (dort gibt es keinen eigenen
 * Spielserver). Leer lassen, solange es keinen gibt.
 */
export const ONLINE_SERVER = '';

/** Statisch gehostet (GitHub Pages, Datei) → kein Spielserver unter derselben Adresse */
const OHNE_SPIELSERVER = location.hostname.endsWith('github.io') || location.protocol === 'file:';

export const SERVER_LISTE = [
  ...(ONLINE_SERVER && !ONLINE_SERVER.includes(location.host) ? [{ id: 'online', name: 'Online-Server (Mehrspieler)', typ: 'websocket', adresse: ONLINE_SERVER }] : []),
  { id: 'lokal', name: 'Lokal (im Browser, ohne Account)', typ: 'lokal' },
  ...(OHNE_SPIELSERVER ? [] : [{ id: 'dieser', name: 'Dieser Server (Mehrspieler)', typ: 'websocket', adresse: adresseDiesesServers() }]),
  { id: 'eigene', name: 'Andere Serveradresse …', typ: 'websocket', adresse: null },
];

/** Andere Spieler/Zombies werden so weit "in der Vergangenheit" gezeichnet → flüssige Interpolation. */
export const INTERPOLATIONS_VERZOEGERUNG_MS = 100;

export const PING_INTERVALL_MS = 2000;

/** Künstliche Verzögerung im Lokal-Modus (ms), um Netzwerk-Lag zu simulieren. 0 = aus. */
export const LOKALE_LATENZ_MS = 0;

/** Debug-Overlay (Taste F3) beim Start anzeigen. */
export const DEBUG_START = false;

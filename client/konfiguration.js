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
export const SERVER_LISTE = [
  { id: 'lokal', name: 'Lokal (im Browser, ohne Account)', typ: 'lokal' },
  { id: 'dieser', name: 'Dieser Server (Mehrspieler)', typ: 'websocket', adresse: adresseDiesesServers() },
  { id: 'eigene', name: 'Andere Serveradresse …', typ: 'websocket', adresse: null },
];

/** Andere Spieler/Zombies werden so weit "in der Vergangenheit" gezeichnet → flüssige Interpolation. */
export const INTERPOLATIONS_VERZOEGERUNG_MS = 100;

export const PING_INTERVALL_MS = 2000;

/**
 * Kamera-Zoom passt sich der Bildschirmgröße an: zoom = √(Breite × Höhe) / KAMERA_SICHTFELD.
 * Größerer Wert = mehr Überblick. Begrenzung durch ZOOM_MIN/ZOOM_MAX.
 */
export const KAMERA_SICHTFELD = 760;
export const ZOOM_MIN = 0.65;
export const ZOOM_MAX = 2.4;

/** Künstliche Verzögerung im Lokal-Modus (ms), um Netzwerk-Lag zu simulieren. 0 = aus. */
export const LOKALE_LATENZ_MS = 0;

/** Debug-Overlay (Taste F3) beim Start anzeigen. */
export const DEBUG_START = false;

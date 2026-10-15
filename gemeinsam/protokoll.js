/**
 * Netzwerkprotokoll: alle Nachrichtentypen zwischen Client und Server.
 *
 * Format jeder Nachricht: { typ: string, ...daten } – serialisiert als JSON.
 * Der Transport (WebSocket oder lokaler Speicher-Kanal) überträgt nur Text.
 *
 * Grundprinzip "Server-Autorität": Der Client schickt NUR Eingaben (Tasten, Blickrichtung).
 * Positionen, Treffer, Schaden und Loot bestimmt ausschließlich der Server.
 */

export const NACHRICHT = Object.freeze({
  // ---- Client → Server ----
  /** { benutzername, passwort, protokoll } */
  ANMELDEN: 'anmelden',
  /** { seq, x, y, blick } – x/y: Bewegungsrichtung -1..1, blick: Winkel in Radiant */
  EINGABE: 'eingabe',
  /** { t } – Zeitstempel des Clients, kommt als PONG zurück */
  PING: 'ping',

  // ---- Server → Client ----
  /** { spielerId, serverName, tickRate, karte, physik, gegenstaende } */
  ANMELDUNG_OK: 'anmeldungOk',
  /** { grund } */
  ANMELDUNG_FEHLER: 'anmeldungFehler',
  /** { tick, entitaeten: [...] } – Schnappschuss (Snapshot) aller dynamischen Entitäten, jeden Tick */
  ZUSTAND: 'zustand',
  /** { gegenstaende: [...] } – komplette Item-Liste, nur wenn sie sich geändert hat */
  GEGENSTAENDE: 'gegenstaende',
  /** { t } */
  PONG: 'pong',
  /** { text } – Hinweise vom Server (z. B. "Server startet neu") */
  SYSTEM: 'system',
});

/** Objekt → Text für den Transport. */
export function kodiere(nachricht) {
  return JSON.stringify(nachricht);
}

/** Text → Objekt. Gibt null zurück, wenn die Nachricht kaputt oder ungültig ist. */
export function dekodiere(text) {
  if (typeof text !== 'string') return null;
  try {
    const nachricht = JSON.parse(text);
    if (nachricht && typeof nachricht === 'object' && typeof nachricht.typ === 'string') return nachricht;
  } catch {
    // ungültiges JSON → ignorieren
  }
  return null;
}

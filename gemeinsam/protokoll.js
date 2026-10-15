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
  /** { seq, x, y, blick, angriff, sprint } – x/y: Bewegungsrichtung -1..1, blick: Winkel (Radiant), angriff/sprint: Taste gehalten */
  EINGABE: 'eingabe',
  /** { art, slot? } – einmalige Aktion: 'aufheben' | 'benutzen' | 'ablegen' | 'nachladen' (siehe AKTIONEN) */
  AKTION: 'aktion',
  /** { t } – Zeitstempel des Clients, kommt als PONG zurück */
  PING: 'ping',

  // ---- Server → Client ----
  /** { spielerId, serverName, tickRate, karte, physik, start, gegenstaende, itemDefinitionen, spielerDaten } */
  ANMELDUNG_OK: 'anmeldungOk',
  /** { grund } */
  ANMELDUNG_FEHLER: 'anmeldungFehler',
  /** { tick, entitaeten: [...], ereignisse: [...] } – Schnappschuss aller dynamischen Entitäten + Ereignisse dieses Ticks */
  ZUSTAND: 'zustand',
  /** { leben, maxLeben, hunger, durst, inventar, ausgeruestet, nachladen, tot, respawnIn } – nur an den eigenen Spieler, bei Änderung */
  SPIELER_DATEN: 'spielerDaten',
  /** { text } – kurze Info nur für diesen Spieler (z. B. "Inventar voll") */
  MELDUNG: 'meldung',
  /** { gegenstaende: [...] } – komplette Item-Liste, nur wenn sie sich geändert hat */
  GEGENSTAENDE: 'gegenstaende',
  /** { t } */
  PONG: 'pong',
  /** { text } – Hinweise vom Server (z. B. "Server startet neu") */
  SYSTEM: 'system',
});

/** Erlaubte Aktionen (Nachricht AKTION). slot = Inventarplatz 0..INVENTAR_PLAETZE-1 */
export const AKTIONEN = Object.freeze({
  AUFHEBEN: 'aufheben', // nächsten Gegenstand in Reichweite aufheben
  BENUTZEN: 'benutzen', // Essen/Trinken/Medizin verbrauchen, Waffe aus-/abrüsten
  ABLEGEN: 'ablegen', // ganzen Stapel auf den Boden legen
  NACHLADEN: 'nachladen', // ausgerüstete Schusswaffe nachladen
});

/**
 * Ereignistypen in ZUSTAND.ereignisse (für Effekte im Client – rein optisch):
 *   schuss    { von, x, y, zx, zy }        Schuss von (x,y) bis Einschlag (zx,zy)
 *   treffer   { x, y, winkel, ziel }        ziel: 'zombie' | 'spieler'
 *   tod       { id, x, y, ziel }
 *   nahkampf  { von, x, y, winkel }
 *   leer      { von }                        Klick – Magazin leer
 */

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

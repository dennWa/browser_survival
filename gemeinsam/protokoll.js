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
  /** { art, slot?, befehl? } – einmalige Aktion (siehe AKTIONEN); befehl nur bei art 'admin' (siehe ADMIN_BEFEHLE) */
  AKTION: 'aktion',
  /** { t } – Zeitstempel des Clients, kommt als PONG zurück */
  PING: 'ping',

  // ---- Server → Client ----
  /** { spielerId, serverName, tickRate, karte, physik, start, gegenstaende, itemDefinitionen, spielerDaten,
   *    tueren (IDs offener Türen), tageszeit { tagSekunden, nachtSekunden }, zeit, tag } */
  ANMELDUNG_OK: 'anmeldungOk',
  /** { grund } */
  ANMELDUNG_FEHLER: 'anmeldungFehler',
  /** { tick, zeit, tag, entitaeten: [...], ereignisse: [...] } – Schnappschuss aller dynamischen Entitäten + Ereignisse dieses Ticks
   *  zeit = Sekunden seit Tagesbeginn (gemeinsam/tageszeit.js), tag = Tageszähler */
  ZUSTAND: 'zustand',
  /** { leben, maxLeben, hunger, durst, inventar, ausgeruestet, nachladen, tot, respawnIn, admin } – nur an den eigenen Spieler, bei Änderung */
  SPIELER_DATEN: 'spielerDaten',
  /** { text } – kurze Info nur für diesen Spieler (z. B. "Inventar voll") */
  MELDUNG: 'meldung',
  /** { gegenstaende: [...] } – komplette Item-Liste, nur wenn sie sich geändert hat */
  GEGENSTAENDE: 'gegenstaende',
  /** { offen: [Tür-IDs] } – Türzustand, nur wenn er sich geändert hat (IDs: Welt.tueren) */
  TUEREN: 'tueren',
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
  TUER: 'tuer', // nächste Tür in Reichweite öffnen/schließen
  LICHT: 'licht', // Taschenlampe an/aus (aus = Zombies bemerken einen erst aus der Nähe)
  WIEDERBELEBEN: 'wiederbeleben', // tot → sofort am Startpunkt neu spawnen (statt Countdown abzuwarten)
  ADMIN: 'admin', // Admin-Befehl (nur für Accounts mit Admin-Recht, prüft der Server)
});

/** Admin-Befehle (AKTION { art: 'admin', befehl }). Der Server prüft das Admin-Recht des Spielers. */
export const ADMIN_BEFEHLE = Object.freeze({
  GOTTMODUS: 'gottmodus', // an/aus: kein Schaden, kein Hunger/Durst
  UNSICHTBAR: 'unsichtbar', // an/aus: Zombies ignorieren einen
  HEILEN: 'heilen', // Leben, Hunger, Durst, Ausdauer voll
  AUSRUESTEN: 'ausruesten', // Waffen + Munition ins Inventar
  ZOMBIE_SPAWNEN: 'zombieSpawnen', // Zombie vor einem erscheinen lassen
  ZOMBIES_TOETEN: 'zombiesToeten', // alle Zombies umfallen lassen (sie respawnen normal)
  ZEIT_SPRINGEN: 'zeitSpringen', // tagsüber → gleich Abend, nachts → gleich Morgen
});

/**
 * Ereignistypen in ZUSTAND.ereignisse (für Effekte im Client – rein optisch):
 *   feuer     { von, x, y, winkel, waffe }   ein Abzug (Knall, Mündungsfeuer); waffe = Ausrüstungsname
 *   schuss    { von, x, y, zx, zy }        ein Projektil von (x,y) bis Einschlag (zx,zy) – Schrotflinte: mehrere
 *   treffer   { x, y, winkel, ziel }        ziel: 'zombie' | 'spieler'
 *   tod       { id, x, y, ziel }
 *   nahkampf  { von, x, y, winkel }
 *   leer      { von }                        Klick – Magazin leer
 *   tuer      { id, offen, aufgebrochen, x, y }  Tür geht auf/zu (aufgebrochen = von Zombies)
 *   tuerSchlag { id, x, y }                  Zombie hämmert gegen eine Tür
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

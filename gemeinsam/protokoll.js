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
  /**
   * { benutzername, passwort, protokoll, gast?, aussehen? } – gast: true = ohne Account (benutzername muss GAST_MUSTER sein);
   * aussehen = gewählte Figur (gemeinsam/spieler/aussehen.js), wird geprüft und im Spielstand gemerkt
   */
  ANMELDEN: 'anmelden',
  /** { seq, x, y, blick, angriff, sprint } – x/y: Bewegungsrichtung -1..1, blick: Winkel (Radiant), angriff/sprint: Taste gehalten */
  EINGABE: 'eingabe',
  /** { art, slot?, befehl?, rezept? } – einmalige Aktion (siehe AKTIONEN); befehl bei 'admin', rezept bei 'herstellen' */
  AKTION: 'aktion',
  /** { t } – Zeitstempel des Clients, kommt als PONG zurück */
  PING: 'ping',
  /** { text } – Chatnachricht an alle (max. CHAT_MAX_LAENGE Zeichen) */
  CHAT: 'chat',
  /** {} – Developer-Modus: aktuelle Werte anfordern (nur Admins) */
  DEV_ABFRAGEN: 'devAbfragen',
  /** { werte: { pfad: zahl } } – Developer-Modus: Werte setzen (nur Admins; Pfade aus entwicklerFelder.js) */
  DEV_SETZEN: 'devSetzen',
  /** {} – Developer-Modus: alles auf Standard */
  DEV_ZURUECKSETZEN: 'devZuruecksetzen',

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
  /** { abgebaut: [Ressourcen-IDs] } – gefällte Bäume / abgebaute Steine, nur bei Änderung (IDs: Welt.ressourcen) */
  RESSOURCEN: 'ressourcen',
  /** { liste: [Bauwerke] } – alle gebauten Dinge (gemeinsam/welt/bauwerke.js), nur bei Änderung */
  BAUWERKE: 'bauwerke',
  /** { t } */
  PONG: 'pong',
  /** { von, text, admin, system } – Chatnachricht (system = Server-Hinweis wie "X ist beigetreten"); Typ wie CHAT */
  /** { felder: [{ pfad, name, gruppe, min, max, schritt, einheit, wert, standard }], ueberschreibungen } – nur an Admins */
  DEV_WERTE: 'devWerte',
  /** { physik, tageszeit, itemDefinitionen } – nach Developer-Änderungen an alle (Vorhersage, Uhr, HUD) */
  EINSTELLUNGEN: 'einstellungen',
  /** { text } – Hinweise vom Server (z. B. "Server startet neu") */
  SYSTEM: 'system',
});

/** Erlaubte Aktionen (Nachricht AKTION). slot/ziel = Inventarplatz 0..(Inventargröße-1), Schnellleiste = 0..7 */
export const AKTIONEN = Object.freeze({
  AUFHEBEN: 'aufheben', // nächsten Gegenstand in Reichweite aufheben
  BENUTZEN: 'benutzen', // Essen/Trinken/Medizin verbrauchen, Waffe aus-/abrüsten
  ABLEGEN: 'ablegen', // ganzen Stapel auf den Boden legen
  TAUSCHEN: 'tauschen', // { slot, ziel } Inventarplätze tauschen bzw. gleiche Stapel zusammenlegen (Drag & Drop)
  RUCKSACK_ABLEGEN: 'rucksackAblegen', // Rucksack auf den Boden legen (Inhalt wandert ins Inventar oder fällt mit)
  PLATZIEREN: 'platzieren', // { slot, tx, ty } Bauwerk-Item (oder Hacke → Beet) auf Kachel tx/ty aufstellen
  FEUER: 'feuer', // F: nächstes Lagerfeuer anzünden (Feuerzeug nötig) / löschen – sonst wie 'tuer'
  BAUWERK: 'bauwerk', // E am nächsten Bauwerk: Falle aufnehmen/spannen, kochen, pflanzen, ernten
  SKILL: 'skill', // { skill } einen Skillpunkt verteilen (gemeinsam/spieler/skills.js)
  NACHLADEN: 'nachladen', // ausgerüstete Schusswaffe nachladen
  TUER: 'tuer', // nächste Tür in Reichweite öffnen/schließen
  ABBAUEN: 'abbauen', // nächsten Baum/Stein abbauen (Axt/Spitzhacke nötig, dauert)
  SCHLAFEN: 'schlafen', // in ein Bett in Reichweite legen (heilt)
  HERSTELLEN: 'herstellen', // { rezept } an einer Werkbank in Reichweite (siehe server/spiel/konfiguration/rezepte.js)
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
 *   tuerVerstaerkt { id, x, y }              Bretter an eine Tür genagelt
 *   hack      { art, x, y }                  ein Axt-/Spitzhackenschlag (art: 'holz' | 'stein')
 *   abgebaut  { art, x, y }                  Baum fällt / Stein zerbricht
 *   hergestellt { von, rezept }              an der Werkbank gebaut
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

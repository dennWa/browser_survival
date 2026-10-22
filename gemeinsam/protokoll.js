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
   *    tueren (IDs offener Türen), abgebaut, bauwerke, erkundet (base64), rezepte,
   *    tageszeit { tagSekunden, nachtSekunden }, zeit, tag } – karte = Daten der Zone, in der man startet */
  ANMELDUNG_OK: 'anmeldungOk',
  /** wie ANMELDUNG_OK (+ zone: Name) – man hat einen Übergang betreten und ist jetzt in einer anderen Zone (neue spielerId!).
   *  Client baut die Welt neu auf (Ladebildschirm) und zählt seq einfach weiter. */
  ZONE_WECHSEL: 'zoneWechsel',
  /** { grund } */
  ANMELDUNG_FEHLER: 'anmeldungFehler',
  /** { tick, zeit, tag, entitaeten: [...], ereignisse: [...] } – Schnappschuss aller dynamischen Entitäten + Ereignisse dieses Ticks
   *  zeit = Sekunden seit Tagesbeginn (gemeinsam/tageszeit.js), tag = Tageszähler */
  ZUSTAND: 'zustand',
  /** { leben, maxLeben, hunger, durst, inventar, ausgeruestet, nachladen, tot, respawnIn, admin, flagge, spawn } – nur an den eigenen Spieler, bei Änderung
   *  flagge = { tx, ty, radius } | null (eigenes Baugebiet, nur der Besitzer erfährt es), spawn = { karte, tx, ty } | null (Bett) */
  SPIELER_DATEN: 'spielerDaten',
  /** { text } – kurze Info nur für diesen Spieler (z. B. "Inventar voll") */
  MELDUNG: 'meldung',
  /** { gegenstaende: [...] } – komplette Item-Liste, nur wenn sie sich geändert hat */
  GEGENSTAENDE: 'gegenstaende',
  /** { offen: [Tür-IDs] } – Türzustand, nur wenn er sich geändert hat (IDs: Welt.tueren) */
  TUEREN: 'tueren',
  /** { abgebaut: [Ressourcen-IDs], laternen: [Laternen-IDs] } – gefällte Bäume / abgebaute Steine / umgefahrene Straßenlaternen, nur bei Änderung (IDs: Welt.ressourcen bzw. Welt.laternen) */
  RESSOURCEN: 'ressourcen',
  /** { liste: [Bauwerke] } – alle gebauten Dinge (gemeinsam/welt/bauwerke.js), nur bei Änderung */
  BAUWERKE: 'bauwerke',
  /** { gesetzt: [Bauwerke], entfernt: [IDs] } – nur die Änderungen seit dem letzten Paket (Basisbau: sonst ginge bei jedem Hammerschlag die ganze Basis raus) */
  BAUWERKE_AENDERUNG: 'bauwerkeAenderung',
  /** { id, inhalt: [16 Plätze] | null } – Inhalt der geöffneten Lagerkiste (null = geschlossen). Nur an den, der sie geöffnet hat. */
  KISTE: 'kiste',
  /** { id, art, plaetze:[{defId,menge,zeit,dauer,verbrennt}|null], brennt, brennRest, brennstoff? } – Ansicht der geöffneten Station (Lagerfeuer-Koch-UI, Schmelzofen); nur an den Öffner, ca. 2×/s; plaetze null = geschlossen */
  STATION: 'station',
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

/** Erlaubte Aktionen (Nachricht AKTION). slot/ziel = Inventarplatz 0..(Inventargröße-1), Schnellleiste = 0..9 */
export const AKTIONEN = Object.freeze({
  AUFHEBEN: 'aufheben', // nächsten Gegenstand in Reichweite aufheben
  BENUTZEN: 'benutzen', // Item in die Hand nehmen/wegstecken (Waffe, Essen, Holz, Samen, Hacke …); Linksklick verbraucht bzw. nutzt es
  KONSUMIEREN: 'konsumieren', // { slot } Essen/Trinken/Medizin direkt aus dem Inventar verbrauchen (Doppelklick), ohne es in die Hand zu nehmen
  ABLEGEN: 'ablegen', // { slot, einzeln? } ganzen Stapel (einzeln: nur 1 Stück) auf den Boden legen
  TAUSCHEN: 'tauschen', // { slot, ziel } Inventarplätze tauschen bzw. gleiche Stapel zusammenlegen (Drag & Drop)
  RUCKSACK_ABLEGEN: 'rucksackAblegen', // Rucksack auf den Boden legen (Inhalt wandert ins Inventar oder fällt mit)
  PLATZIEREN: 'platzieren', // { slot, tx, ty } Bauwerk-Item (oder Hacke → Beet) auf Kachel tx/ty aufstellen
  FEUER: 'feuer', // F: nächstes Lagerfeuer anzünden (Feuerzeug nötig) / löschen – sonst wie 'tuer'
  BAUWERK: 'bauwerk', // E am nächsten Bauwerk: Falle aufnehmen/spannen, Feuer-/Ofen-Menü öffnen, pflanzen, ernten
  BAUEN: 'bauen', // { teil, tx, ty, drehung? } Basisbau: Bauteil (gemeinsam/basisbau/teile.js) setzen, auch die Basis-Flagge; Hammer in der Hand nötig
  ABREISSEN: 'abreissen', // { tx, ty, ebene? } mit dem Hammer ein eigenes Bauteil abreißen (75 % der Kosten zurück)
  FELD: 'feld', // { tx, ty } mit der Hacke in der Hand (Taste G) ein quadratisches Erdfeld um die Kachel anlegen
  KISTE_LEGEN: 'kisteLegen', // { slot } Stapel aus dem Inventar in die geöffnete Lagerkiste legen
  KISTE_NEHMEN: 'kisteNehmen', // { slot } Stapel aus der geöffneten Kiste (Kistenplatz 0..15) ins Inventar nehmen
  KISTE_SCHLIESSEN: 'kisteSchliessen', // geöffnete Kiste schließen
  STATION_LEGEN: 'stationLegen', // { slot } 1 Stück aus dem Inventar in die geöffnete Station (Koch-Slot, Ofen; Holz im Ofen = Brennstoff)
  STATION_NEHMEN: 'stationNehmen', // { slot } Koch-/Ofenplatz leeren (Item ins Inventar); slot = -1… nicht erlaubt, Platz 0..
  STATION_SCHLIESSEN: 'stationSchliessen', // geöffnete Station schließen
  STATION_SITZEN: 'stationSitzen', // am geöffneten (brennenden) Lagerfeuer hinsetzen
  SITZEN: 'sitzen', // Taste Ä: überall hinsetzen bzw. wieder aufstehen; am brennenden Lagerfeuer = Feuer-Sitzen (heilt, Zombies übersehen einen)
  KOFFERRAUM: 'kofferraum', // G: Kofferraum des nächsten Autos (oder des eigenen, wenn man drin sitzt) öffnen – danach kisteLegen/kisteNehmen/kisteSchliessen
  FELD_ENTFERNEN: 'feldEntfernen', // { tx, ty } mit der Hacke in der Hand ein Ackerfeld (Beet) wieder zu Rasen machen (Rechtsklick)
  SKILL: 'skill', // { skill } einen Skillpunkt verteilen (gemeinsam/spieler/skills.js)
  FAHRZEUG: 'fahrzeug', // ins nächste freie Auto einsteigen bzw. aussteigen
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
  WETTER: 'wetter', // klar → Regen → Nebel → klar (zum Testen)
  FLIEGEN: 'fliegen', // an/aus: Flugmodus – schnell und ohne Kollision über die Karte gleiten (Umschalt+B)
  UNENDLICH_MUNITION: 'unendlichMunition', // an/aus: Schusswaffen verbrauchen keine Munition (kein Nachladen)
  UNENDLICH_AUSDAUER: 'unendlichAusdauer', // an/aus: Sprinten kostet keine Ausdauer
  ZEIT_VORSTELLEN: 'zeitVor12', // Uhr um 12 Spielstunden vorstellen (Pflanzen wachsen mit) – zum Testen von Wachstum und Tag/Nacht
  FLAGGE_ENTFERNEN: 'flaggeEntfernen', // eigene Basis-Flagge zurücknehmen (Bauteile bleiben stehen, gehören aber niemandem mehr)
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
 *   abgebaut  { art, x, y, id, sx, sy, fahrzeug? }  Baum fällt / Stein zerbricht (fahrzeug: vom Auto umgefahren)
 *   hergestellt { von, rezept }              an der Werkbank gebaut
 *   fahrzeugSchaden { id, x, y, leben }      Zombie-Schlag/überfahrener Zombie/Aufprall auf ein Auto
 *   laterneUmgefahren { id, x, y, sx, sy }   Straßenlaterne von einem Fahrzeug (≥ 10 km/h) umgefahren; sx/sy = Fahrzeug (Fallrichtung weg davon)
 *   fahrzeugKaputt { id, x, y }              Auto zerstört → Wrack
 *   angelWurf / angelBiss / gefangen { von, x, y, anzahl? }  Angeln (Pose ausgeworfen / Biss / Fang)
 *   bossBeute { x, y }                       Boss-Zombie hat Waffe + Munition fallen lassen
 *   gebaut { bauwerk, x, y, von } / abgerissen { bauwerk, x, y, von } / tuerBau { offen, x, y }   Basisbau
 * ZUSTAND.wetter = 'klar' | 'regen' | 'schnee' | 'nebel'; Entität typ 'tier' (art 'hase').
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

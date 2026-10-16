/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║  DEVELOPER-MODUS: welche Werte man ingame ändern kann                        ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 *
 * Jeder Eintrag erscheint im Developer-Fenster (Admin-Menü → 🛠 Developer).
 *
 *   pfad    → wo der Wert steht:
 *               'spieler.leben'          = konfiguration.spieler.leben  (spielKonfiguration.js)
 *               'gegenstaende.pistole.schaden' = Item-Wert             (gegenstaende.js)
 *   name    → Beschriftung im Fenster
 *   gruppe  → Reiter im Fenster
 *   min/max/schritt → erlaubter Bereich (der Server begrenzt darauf)
 *   einheit → wird hinter dem Eingabefeld angezeigt (optional)
 *
 * Neuen Wert hinzufügen: einfach eine Zeile ergänzen – mehr ist nicht nötig.
 */
export const ENTWICKLER_FELDER = [
  // --- Spieler ---
  { pfad: 'spieler.leben', name: 'Lebenspunkte', gruppe: 'Spieler', min: 10, max: 1000, schritt: 10 },
  { pfad: 'spieler.geschwindigkeit', name: 'Laufgeschwindigkeit', gruppe: 'Spieler', min: 50, max: 400, schritt: 5, einheit: 'px/s' },
  { pfad: 'spieler.sprintFaktor', name: 'Sprint-Faktor', gruppe: 'Spieler', min: 1, max: 3, schritt: 0.1, einheit: '×' },
  { pfad: 'spieler.ausdauerMax', name: 'Ausdauer', gruppe: 'Spieler', min: 20, max: 500, schritt: 10 },
  { pfad: 'spieler.ausdauerVerbrauch', name: 'Ausdauer-Verbrauch', gruppe: 'Spieler', min: 0, max: 100, schritt: 1, einheit: '/s' },
  { pfad: 'spieler.hungerProMinute', name: 'Hunger pro Minute', gruppe: 'Spieler', min: 0, max: 50, schritt: 0.5 },
  { pfad: 'spieler.durstProMinute', name: 'Durst pro Minute', gruppe: 'Spieler', min: 0, max: 50, schritt: 0.5 },
  { pfad: 'spieler.regenerationProSekunde', name: 'Heilung (satt & getränkt)', gruppe: 'Spieler', min: 0, max: 10, schritt: 0.05, einheit: '/s' },
  { pfad: 'spieler.respawnZeit', name: 'Wiederbelebung nach', gruppe: 'Spieler', min: 0, max: 60, schritt: 1, einheit: 's' },
  { pfad: 'schlafen.heilung', name: 'Heilung pro Schlaf', gruppe: 'Spieler', min: 0, max: 200, schritt: 5, einheit: 'LP' },
  { pfad: 'schlafen.dauer', name: 'Schlafdauer', gruppe: 'Spieler', min: 1, max: 60, schritt: 1, einheit: 's' },
  { pfad: 'schlafen.stunden', name: 'Schlaf spult vor', gruppe: 'Welt', min: 0, max: 23, schritt: 1, einheit: 'h' },
  { pfad: 'zombie.varianten.laeufer.xp', name: 'XP pro Läufer', gruppe: 'Spieler', min: 0, max: 500, schritt: 1, einheit: 'XP' },
  { pfad: 'zombie.varianten.brocken.xp', name: 'XP pro Brocken', gruppe: 'Spieler', min: 0, max: 500, schritt: 1, einheit: 'XP' },
  { pfad: 'spieler.todesZombieRadius', name: 'Zombies weg beim Tod (Radius)', gruppe: 'Spieler', min: 0, max: 2000, schritt: 20, einheit: 'px' },
  { pfad: 'zombie.varianten.normal.xp', name: 'XP pro Zombie (normal)', gruppe: 'Spieler', min: 0, max: 500, schritt: 1, einheit: 'XP' },
  { pfad: 'level.ersteStufe', name: 'XP für Level 2', gruppe: 'Spieler', min: 1, max: 5000, schritt: 5, einheit: 'XP' },
  { pfad: 'level.zuwachs', name: 'XP mehr pro Level', gruppe: 'Spieler', min: 0, max: 5000, schritt: 5, einheit: 'XP' },

  // --- Zombies ---
  { pfad: 'zombie.leben', name: 'Leben (normal)', gruppe: 'Zombies', min: 1, max: 1000, schritt: 5 },
  { pfad: 'zombie.jagdGeschwindigkeit', name: 'Tempo beim Jagen (normal)', gruppe: 'Zombies', min: 10, max: 300, schritt: 5, einheit: 'px/s' },
  { pfad: 'zombie.angriffsSchaden', name: 'Schaden (normal)', gruppe: 'Zombies', min: 0, max: 100, schritt: 1 },
  { pfad: 'zombie.varianten.laeufer.jagdGeschwindigkeit', name: 'Tempo Läufer', gruppe: 'Zombies', min: 10, max: 300, schritt: 5, einheit: 'px/s' },
  { pfad: 'zombie.varianten.laeufer.leben', name: 'Leben Läufer', gruppe: 'Zombies', min: 1, max: 1000, schritt: 5 },
  { pfad: 'zombie.varianten.brocken.jagdGeschwindigkeit', name: 'Tempo Brocken', gruppe: 'Zombies', min: 10, max: 300, schritt: 5, einheit: 'px/s' },
  { pfad: 'zombie.varianten.brocken.leben', name: 'Leben Brocken', gruppe: 'Zombies', min: 1, max: 2000, schritt: 10 },
  { pfad: 'zombie.varianten.brocken.angriffsSchaden', name: 'Schaden Brocken', gruppe: 'Zombies', min: 0, max: 200, schritt: 1 },
  { pfad: 'zombie.aggroRadius', name: 'Sichtweite', gruppe: 'Zombies', min: 0, max: 1000, schritt: 10, einheit: 'px' },
  { pfad: 'zombie.hoerRadius', name: 'Hören von Schüssen', gruppe: 'Zombies', min: 0, max: 2000, schritt: 20, einheit: 'px' },
  { pfad: 'zombie.respawnZeit', name: 'Respawn nach', gruppe: 'Zombies', min: 5, max: 1200, schritt: 5, einheit: 's' },
  { pfad: 'zombie.nachtHorde', name: 'Größe der Nacht-Horde', gruppe: 'Zombies', min: 0, max: 40, schritt: 1 },
  { pfad: 'zombie.nachtTempoFaktor', name: 'Nachts schneller', gruppe: 'Zombies', min: 0.5, max: 3, schritt: 0.05, einheit: '×' },

  // --- Waffen ---
  { pfad: 'gegenstaende.pistole.schaden', name: 'Pistole: Schaden', gruppe: 'Waffen', min: 0, max: 500, schritt: 1 },
  { pfad: 'gegenstaende.pistole.magazin', name: 'Pistole: Magazin', gruppe: 'Waffen', min: 1, max: 100, schritt: 1 },
  { pfad: 'gegenstaende.schrotflinte.schaden', name: 'Schrotflinte: Schaden pro Kugel', gruppe: 'Waffen', min: 0, max: 200, schritt: 1 },
  { pfad: 'gegenstaende.schrotflinte.magazin', name: 'Schrotflinte: Magazin', gruppe: 'Waffen', min: 1, max: 50, schritt: 1 },
  { pfad: 'gegenstaende.axt.schaden', name: 'Axt: Schaden', gruppe: 'Waffen', min: 0, max: 200, schritt: 1 },
  { pfad: 'gegenstaende.hammer.schaden', name: 'Hammer: Schaden', gruppe: 'Waffen', min: 0, max: 200, schritt: 1 },
  { pfad: 'gegenstaende.machete.schaden', name: 'Machete: Schaden', gruppe: 'Waffen', min: 0, max: 200, schritt: 1 },
  { pfad: 'gegenstaende.feuerwehrbeil.schaden', name: 'Beil: Schaden', gruppe: 'Waffen', min: 0, max: 300, schritt: 1 },
  { pfad: 'gegenstaende.kuechenmesser.reichweite', name: 'Messer: Reichweite', gruppe: 'Waffen', min: 10, max: 150, schritt: 2, einheit: 'px' },
  { pfad: 'gegenstaende.axt.reichweite', name: 'Axt: Reichweite', gruppe: 'Waffen', min: 10, max: 150, schritt: 2, einheit: 'px' },
  { pfad: 'gegenstaende.hammer.reichweite', name: 'Hammer: Reichweite', gruppe: 'Waffen', min: 10, max: 150, schritt: 2, einheit: 'px' },
  { pfad: 'gegenstaende.machete.reichweite', name: 'Machete: Reichweite', gruppe: 'Waffen', min: 10, max: 150, schritt: 2, einheit: 'px' },

  // --- Welt ---
  { pfad: 'welt.tagSekunden', name: 'Länge eines Tages', gruppe: 'Welt', min: 30, max: 3600, schritt: 10, einheit: 's' },
  { pfad: 'welt.nachtSekunden', name: 'Länge einer Nacht', gruppe: 'Welt', min: 30, max: 3600, schritt: 10, einheit: 's' },
  { pfad: 'welt.tuerLeben', name: 'Haltbarkeit einer Tür', gruppe: 'Welt', min: 1, max: 2000, schritt: 10 },
  { pfad: 'ressourcen.holz.menge', name: 'Holz pro Baum', gruppe: 'Welt', min: 1, max: 50, schritt: 1 },
  { pfad: 'ressourcen.holz.dauer', name: 'Baum fällen dauert', gruppe: 'Welt', min: 0.5, max: 60, schritt: 0.5, einheit: 's' },
  { pfad: 'ressourcen.stein.menge', name: 'Stein pro Felsen', gruppe: 'Welt', min: 1, max: 50, schritt: 1 },
  { pfad: 'ressourcen.stein.dauer', name: 'Stein abbauen dauert', gruppe: 'Welt', min: 0.5, max: 60, schritt: 0.5, einheit: 's' },
  { pfad: 'loot.spawnChance', name: 'Loot-Wahrscheinlichkeit', gruppe: 'Welt', min: 0, max: 1, schritt: 0.05 },
  { pfad: 'loot.respawnZeit', name: 'Loot kommt wieder nach', gruppe: 'Welt', min: 10, max: 3600, schritt: 10, einheit: 's' },
  { pfad: 'loot.todesVerfall', name: 'Todes-Loot liegt', gruppe: 'Welt', min: 10, max: 3600, schritt: 10, einheit: 's' },
];

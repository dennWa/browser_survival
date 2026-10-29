/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║  CRAFTING-REZEPTE  –  was man an der Werkbank herstellen kann               ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 *
 * So ist ein Rezept aufgebaut (einfach kopieren und anpassen):
 *
 *   rezeptName: {                         ← interner Name, nur Kleinbuchstaben/Unterstrich, muss eindeutig sein
 *     name: 'Axt',                        ← so heißt es im Werkbank-Menü
 *     kategorie: 'Werkzeuge',             ← Gruppe im Menü (z. B. Werkzeuge, Waffen, Bauen, Munition)
 *     beschreibung: 'Zum Bäume fällen.',  ← kurzer Hilfetext im Menü
 *     zutaten: { holz: 3, stein: 2 },     ← was verbraucht wird: Item-Name → Anzahl
 *     ergebnis: 'axt',                    ← welches Item man bekommt
 *     menge: 1,                           ← wie viele davon (optional, Standard 1)
 *     ort: 'inventar',                    ← optional: ohne Werkbank, direkt im Inventar (I) baubar
 *     level: 3,                           ← optional: erst ab diesem Spieler-Level herstellbar (Standard 1 = von Anfang an)
 *   },
 *
 * Item-Namen (für zutaten und ergebnis) stehen in server/spiel/konfiguration/gegenstaende.js,
 * z. B. holz, stein, bretter, axt, spitzhacke, hammer, machete, feuerwehrbeil, munition_9mm, munition_12, verband …
 *
 * Neues Rezept → einfach einen Block ergänzen, Server/Seite neu laden, fertig. Ein Test prüft,
 * dass alle Item-Namen existieren (npm test).
 */
export const REZEPTE = {
  // --- Ohne Werkbank (im Inventar-Fenster unter "Bauen") ---
  werkbank: {
    name: 'Werkbank',
    kategorie: 'Bauen',
    ort: 'inventar',
    beschreibung: 'Zum Aufstellen in der Welt – dort baust du Werkzeug, Waffen und Fallen.',
    zutaten: { holz: 4 },
    ergebnis: 'werkbank',
  },
  lagerfeuer: {
    name: 'Lagerfeuer',
    kategorie: 'Bauen',
    ort: 'inventar',
    beschreibung: 'Draußen aufstellen, mit F anzünden (Feuerzeug nötig) und Gemüse braten.',
    zutaten: { holz: 3 },
    ergebnis: 'lagerfeuer',
  },

  // --- Werkzeuge ---
  axt: {
    name: 'Axt',
    kategorie: 'Werkzeuge',
    beschreibung: 'Zum Bäume fällen. Taugt notfalls auch als Waffe.',
    zutaten: { holz: 3, stein: 2 },
    ergebnis: 'axt',
  },
  angel: {
    name: 'Angel',
    kategorie: 'Werkzeuge',
    beschreibung: 'Am See Linksklick: auswerfen, bei Biss nochmal klicken. Muss nur im Inventar liegen.',
    zutaten: { holz: 2, stein: 1 },
    ergebnis: 'angel',
  },
  spitzhacke: {
    name: 'Spitzhacke',
    kategorie: 'Werkzeuge',
    beschreibung: 'Zum Steine abbauen.',
    zutaten: { holz: 3, stein: 3 },
    ergebnis: 'spitzhacke',
  },

  hacke: {
    name: 'Hacke',
    kategorie: 'Werkzeuge',
    beschreibung: 'Zum Anlegen von Erdfeldern (in die Hand nehmen, dann G).',
    zutaten: { holz: 3, stein: 2 },
    ergebnis: 'hacke',
  },

  // --- Waffen ---
  hammer: {
    name: 'Hammer',
    kategorie: 'Waffen',
    ort: 'inventar', // ohne Werkbank baubar – der Hammer ist das Werkzeug fürs Bauen (BUILD) und Abreißen
    beschreibung: 'Solider Nahkampf: 30 Schaden. Außerdem dein Bauwerkzeug (BUILD).',
    zutaten: { holz: 2, stein: 2 },
    ergebnis: 'hammer',
  },
  machete: {
    name: 'Steinmachete',
    kategorie: 'Waffen',
    beschreibung: 'Lange Klinge aus geschliffenem Stein: 40 Schaden, große Reichweite.',
    zutaten: { holz: 2, stein: 8 },
    ergebnis: 'machete',
    level: 2,
  },
  feuerwehrbeil: {
    name: 'Kampfbeil',
    kategorie: 'Waffen',
    beschreibung: 'Der stärkste Nahkampf: 50 Schaden, aber langsam.',
    zutaten: { holz: 5, stein: 6 },
    ergebnis: 'feuerwehrbeil',
    level: 3,
  },

  // Runde 24: Nahkampf-Arsenal (alle nutzen sich ab – an der Werkbank reparieren)
  baseballschlaeger: {
    name: 'Baseballschläger',
    kategorie: 'Waffen',
    beschreibung: 'Wuchtiger Schläger: 26 Schaden, stößt Zombies weit zurück.',
    zutaten: { holz: 4 },
    ergebnis: 'baseballschlaeger',
  },
  speer: {
    name: 'Speer',
    kategorie: 'Waffen',
    beschreibung: 'Große Reichweite (Abstand halten!), schmaler Stoß: 32 Schaden.',
    zutaten: { holz: 3, stein: 1 },
    ergebnis: 'speer',
  },
  brecheisen: {
    name: 'Brecheisen',
    kategorie: 'Waffen',
    beschreibung: 'Aus Eisen geschmiedet: hält ewig und knackt Panzerung.',
    zutaten: { eisenbarren: 2 },
    ergebnis: 'brecheisen',
    level: 2,
  },
  bogen: {
    name: 'Bogen',
    kategorie: 'Waffen',
    beschreibung: 'Leise Fernwaffe – Zombies hören dich kaum. Braucht Pfeile.',
    zutaten: { holz: 5, stoff: 2 },
    ergebnis: 'bogen',
    level: 2,
  },
  armbrust: {
    name: 'Armbrust',
    kategorie: 'Waffen',
    beschreibung: 'Leise und durchschlagend (65 Schaden), langsames Spannen. Braucht Bolzen.',
    zutaten: { holz: 4, eisenbarren: 2, stoff: 1 },
    ergebnis: 'armbrust',
    level: 3,
  },
  mod_zielfernrohr: {
    name: 'Zielfernrohr',
    kategorie: 'Aufsätze',
    beschreibung: 'Für Gewehr und Armbrust: +50 % Reichweite, viel genauer. Auf die Waffe ziehen.',
    zutaten: { eisenbarren: 1, stein: 2 },
    ergebnis: 'mod_zielfernrohr',
    level: 3,
  },
  mod_magazin: {
    name: 'Erweitertes Magazin',
    kategorie: 'Aufsätze',
    beschreibung: 'Für Pistole, Gewehr, Schrotflinte: +60 % Schuss pro Magazin.',
    zutaten: { eisenbarren: 2 },
    ergebnis: 'mod_magazin',
    level: 2,
  },
  mod_schalldaempfer: {
    name: 'Schalldämpfer',
    kategorie: 'Aufsätze',
    beschreibung: 'Für Pistole und Gewehr: Schüsse locken kaum noch Zombies an.',
    zutaten: { eisenbarren: 2, stoff: 1 },
    ergebnis: 'mod_schalldaempfer',
    level: 3,
  },

  // --- Bauen ---
  bretter: {
    name: 'Bretter',
    kategorie: 'Bauen',
    beschreibung: 'Vor einer geschlossenen Tür benutzen: Zombies brauchen viel länger zum Aufbrechen.',
    zutaten: { holz: 4 },
    ergebnis: 'bretter',
    menge: 2,
  },
  falle: {
    name: 'Bärenfalle',
    kategorie: 'Bauen',
    beschreibung: 'Auf den Boden legen: Ein Zombie, der hineintritt, ist sofort tot. Danach neu spannen (E).',
    zutaten: { eisenerz: 3, holz: 1 },
    ergebnis: 'falle',
    level: 2,
  },

  // --- Munition ---
  munition_9mm: {
    name: 'Selbstgegossene 9-mm-Patronen',
    kategorie: 'Munition',
    beschreibung: '6 Schuss für die Pistole.',
    zutaten: { stein: 3, holz: 1 },
    ergebnis: 'munition_9mm',
    menge: 6,
  },
  pfeil: {
    name: 'Pfeile',
    kategorie: 'Munition',
    beschreibung: '5 Pfeile für den Bogen.',
    zutaten: { holz: 2, stein: 1 },
    ergebnis: 'pfeil',
    menge: 5,
  },
  bolzen: {
    name: 'Armbrustbolzen',
    kategorie: 'Munition',
    beschreibung: '4 Bolzen mit Eisenspitze.',
    zutaten: { holz: 1, eisenbarren: 1 },
    ergebnis: 'bolzen',
    menge: 4,
    level: 2,
  },
  munition_gewehr: {
    name: 'Gewehrpatronen',
    kategorie: 'Munition',
    beschreibung: '4 Patronen für das Jagdgewehr.',
    zutaten: { stein: 3, eisenbarren: 1 },
    ergebnis: 'munition_gewehr',
    menge: 4,
    level: 3,
  },
  munition_12: {
    name: 'Schrotpatronen',
    kategorie: 'Munition',
    beschreibung: '3 Patronen für die Schrotflinte.',
    zutaten: { stein: 3, holz: 2 },
    ergebnis: 'munition_12',
    menge: 3,
    level: 2,
  },
};

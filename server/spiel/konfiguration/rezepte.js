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
  spitzhacke: {
    name: 'Spitzhacke',
    kategorie: 'Werkzeuge',
    beschreibung: 'Zum Steine abbauen.',
    zutaten: { holz: 3, stein: 3 },
    ergebnis: 'spitzhacke',
  },

  // --- Waffen ---
  hammer: {
    name: 'Hammer',
    kategorie: 'Waffen',
    beschreibung: 'Solider Nahkampf: 30 Schaden.',
    zutaten: { holz: 2, stein: 2 },
    ergebnis: 'hammer',
  },
  machete: {
    name: 'Steinmachete',
    kategorie: 'Waffen',
    beschreibung: 'Lange Klinge aus geschliffenem Stein: 40 Schaden, große Reichweite.',
    zutaten: { holz: 2, stein: 8 },
    ergebnis: 'machete',
  },
  feuerwehrbeil: {
    name: 'Kampfbeil',
    kategorie: 'Waffen',
    beschreibung: 'Der stärkste Nahkampf: 50 Schaden, aber langsam.',
    zutaten: { holz: 5, stein: 6 },
    ergebnis: 'feuerwehrbeil',
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
  munition_12: {
    name: 'Schrotpatronen',
    kategorie: 'Munition',
    beschreibung: '3 Patronen für die Schrotflinte.',
    zutaten: { stein: 3, holz: 2 },
    ergebnis: 'munition_12',
    menge: 3,
  },
};

/**
 * Gegenstands-Definitionen (Item-Datenbank).
 * Schlüssel = defId (muss zu einem Icon in client/assets/atlas.json → items.icons passen; ein Test prüft das).
 * Kategorien: nahrung, getraenk, medizin, nahkampf, fernkampf, munition, material.
 *
 * ausruestung = Haltung/Waffenart (taschenlampe | messer | pistole | schrotflinte)
 * werkzeug    = Werkzeug zum Abbauen (Axt → Bäume, Spitzhacke → Steine; siehe gemeinsam/welt/ressourcen.js)
 *
 * Werte lassen sich ingame im Developer-Modus ändern (Admin-Menü → Developer).
 * Neue Items: Icon in werkzeuge/assets/baue_assets.py (ITEMS) eintragen.
 */
export const GEGENSTAENDE = Object.freeze({
  // --- Essen ---
  konservendose: { name: 'Konservendose', kategorie: 'nahrung', naehrwert: 35, stapelbar: 5 },
  marmelade: { name: 'Glas Marmelade', kategorie: 'nahrung', naehrwert: 20, stapelbar: 5 },
  apfel: { name: 'Äpfel', kategorie: 'nahrung', naehrwert: 12, stapelbar: 5 },
  broetchen: { name: 'Brötchen', kategorie: 'nahrung', naehrwert: 15, stapelbar: 5 },
  kaese: { name: 'Käse', kategorie: 'nahrung', naehrwert: 20, stapelbar: 5 },
  muesliriegel: { name: 'Müsliriegel', kategorie: 'nahrung', naehrwert: 15, stapelbar: 10 },
  sandwich: { name: 'Sandwich', kategorie: 'nahrung', naehrwert: 30, stapelbar: 3 },
  // --- Trinken ---
  wasserflasche: { name: 'Wasserflasche', kategorie: 'getraenk', durstwert: 40, stapelbar: 5 },
  energydrink: { name: 'Energydrink', kategorie: 'getraenk', durstwert: 20, stapelbar: 5 },
  milch: { name: 'Milch', kategorie: 'getraenk', durstwert: 30, stapelbar: 3 },
  kaffee: { name: 'Kaffee', kategorie: 'getraenk', durstwert: 10, stapelbar: 3 },
  // --- Medizin ---
  verband: { name: 'Verband', kategorie: 'medizin', heilung: 15, stapelbar: 10 },
  schmerzmittel: { name: 'Schmerzmittel', kategorie: 'medizin', heilung: 25, stapelbar: 10 },
  erste_hilfe_kasten: { name: 'Erste-Hilfe-Kasten', kategorie: 'medizin', heilung: 60, stapelbar: 1 },
  // --- Nahkampf ---
  skalpell: { name: 'Skalpell', kategorie: 'nahkampf', ausruestung: 'messer', schaden: 15, reichweite: 28, abklingzeit: 0.35 },
  kuechenmesser: { name: 'Küchenmesser', kategorie: 'nahkampf', ausruestung: 'messer', schaden: 20, reichweite: 30, abklingzeit: 0.4 },
  hammer: { name: 'Hammer', kategorie: 'nahkampf', ausruestung: 'messer', schaden: 30, reichweite: 32, abklingzeit: 0.7 },
  machete: { name: 'Machete', kategorie: 'nahkampf', ausruestung: 'messer', schaden: 40, reichweite: 40, abklingzeit: 0.8 },
  feuerwehrbeil: { name: 'Feuerwehrbeil', kategorie: 'nahkampf', ausruestung: 'messer', schaden: 50, reichweite: 40, abklingzeit: 1.0 },
  // --- Werkzeuge (auch als schwache Waffen nutzbar) ---
  axt: { name: 'Axt', kategorie: 'nahkampf', ausruestung: 'messer', werkzeug: true, schaden: 18, reichweite: 32, abklingzeit: 0.7 },
  spitzhacke: { name: 'Spitzhacke', kategorie: 'nahkampf', ausruestung: 'messer', werkzeug: true, schaden: 16, reichweite: 32, abklingzeit: 0.75 },
  // --- Fernkampf ---
  pistole: { name: 'Pistole (9 mm)', kategorie: 'fernkampf', ausruestung: 'pistole', schaden: 25, munition: 'munition_9mm', magazin: 15, abklingzeit: 0.28, reichweite: 520, streuung: 0.03, nachladezeit: 1.1 },
  schrotflinte: { name: 'Schrotflinte (Kal. 12)', kategorie: 'fernkampf', ausruestung: 'schrotflinte', schaden: 16, projektile: 7, munition: 'munition_12', magazin: 5, abklingzeit: 0.85, reichweite: 280, streuung: 0.2, nachladezeit: 1.8 },
  // --- Munition ---
  munition_9mm: { name: 'Munition 9 mm', kategorie: 'munition', stapelbar: 60, mengeBeimFund: [5, 15] },
  munition_12: { name: 'Schrotpatronen Kal. 12', kategorie: 'munition', stapelbar: 30, mengeBeimFund: [2, 6] },
  // --- Material (Abbau & Crafting) ---
  holz: { name: 'Holz', kategorie: 'material', stapelbar: 50 },
  stein: { name: 'Stein', kategorie: 'material', stapelbar: 50 },
  bretter: { name: 'Bretter', kategorie: 'material', stapelbar: 10, beschreibung: 'Vor einer geschlossenen Tür benutzen: verstärkt sie' },
});

/** Ausrüstung ohne Waffe in der Hand. */
export const STANDARD_AUSRUESTUNG = 'taschenlampe';

/** Angriff ohne ausgerüstete Waffe: Faustschlag – geht immer, macht aber kaum Schaden (Notlösung!). */
export const UNBEWAFFNET = Object.freeze({
  name: 'Faust', kategorie: 'nahkampf', ausruestung: STANDARD_AUSRUESTUNG, schaden: 5, reichweite: 28, abklingzeit: 0.5,
});

/** Öffnungswinkel (± Radiant) des Nahkampf-Trefferkegels vor der Figur. */
export const NAHKAMPF_KEGEL = 1.0;

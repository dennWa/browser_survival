/**
 * Gegenstands-Definitionen (Item-Datenbank).
 * Schlüssel = defId. Kategorien: nahrung, getraenk, medizin, nahkampf, fernkampf, munition.
 *
 * Werte sind Platzhalter fürs Balancing – Verwendung ab Phase 2 (Aufsammeln, Inventar, Kampf).
 */
export const GEGENSTAENDE = Object.freeze({
  // --- Essen ---
  konservendose: { name: 'Konservendose (Bohnen)', kategorie: 'nahrung', naehrwert: 35, stapelbar: 5 },
  muesliriegel: { name: 'Müsliriegel', kategorie: 'nahrung', naehrwert: 15, stapelbar: 10 },
  zwieback: { name: 'Zwieback', kategorie: 'nahrung', naehrwert: 10, stapelbar: 10 },
  apfel: { name: 'Apfel', kategorie: 'nahrung', naehrwert: 12, stapelbar: 5 },
  // --- Trinken ---
  wasserflasche: { name: 'Wasserflasche (0,5 l)', kategorie: 'getraenk', durstwert: 40, stapelbar: 5 },
  apfelsaft: { name: 'Apfelsaft (Tetrapak)', kategorie: 'getraenk', durstwert: 30, stapelbar: 5 },
  energydrink: { name: 'Energydrink', kategorie: 'getraenk', durstwert: 20, stapelbar: 5 },
  // --- Medizin ---
  verband: { name: 'Verband', kategorie: 'medizin', heilung: 15, stapelbar: 10 },
  schmerzmittel: { name: 'Schmerzmittel', kategorie: 'medizin', heilung: 25, stapelbar: 10 },
  // --- Nahkampf ---
  skalpell: { name: 'Skalpell', kategorie: 'nahkampf', schaden: 15, reichweite: 28, abklingzeit: 0.35 },
  schlagstock: { name: 'Schlagstock', kategorie: 'nahkampf', schaden: 25, reichweite: 38, abklingzeit: 0.6 },
  brecheisen: { name: 'Brecheisen', kategorie: 'nahkampf', schaden: 35, reichweite: 40, abklingzeit: 0.8 },
  feuerwehraxt: { name: 'Feuerwehraxt', kategorie: 'nahkampf', schaden: 50, reichweite: 44, abklingzeit: 1.1 },
  // --- Fernkampf ---
  pistole: { name: 'Pistole (9 mm)', kategorie: 'fernkampf', schaden: 30, munition: 'munition_9mm', magazin: 15, abklingzeit: 0.3, reichweite: 500 },
  schrotflinte: { name: 'Schrotflinte (Kal. 12)', kategorie: 'fernkampf', schaden: 18, projektile: 6, munition: 'munition_12', magazin: 5, abklingzeit: 0.9, reichweite: 260 },
  // --- Munition ---
  munition_9mm: { name: 'Munition 9 mm', kategorie: 'munition', stapelbar: 60, mengeBeimFund: [5, 15] },
  munition_12: { name: 'Schrotpatronen Kal. 12', kategorie: 'munition', stapelbar: 30, mengeBeimFund: [2, 6] },
});

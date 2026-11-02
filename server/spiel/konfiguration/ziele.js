/**
 * Überlebens-Tagebuch (Studio-Konzept Phase 4.15): Kapitel mit Zielen, die man nacheinander abhakt – das „Ich will etwas
 * erreichen“-Gefühl. Anders als Level/Skills bleibt der Fortschritt über den Tod hinaus (Spielstand `ziele`).
 * Zähler (systeme/zielSystem.js zählt sie aus den Ereignissen der Zone):
 *   abbau_<art> (holz|stein|eisenerz …) · hergestellt · gebaut · gebaut_<bauwerk> · fisch · gepflanzt · geerntet · repariert
 *   zombie · boss (Brocken) · naechte (überlebte Nächte) · blutmond · level (höchstes Level, Wert) · zonen (besuchte Zonen, Wert)
 * Ziel = { id, text, zaehler, ziel, xp }. Kapitel = { id, titel, rang (Titel nach dem Abschluss), bonusXp, ziele }.
 */
export const KAPITEL = Object.freeze([
  {
    id: 'erste_schritte',
    titel: 'Erste Schritte',
    rang: 'Gestrandet',
    bonusXp: 20,
    ziele: [
      { id: 'holz5', text: 'Sammle 5× Holz (Baum fällen)', zaehler: 'abbau_holz', ziel: 5, xp: 10 },
      { id: 'stein3', text: 'Schlage 3× Stein', zaehler: 'abbau_stein', ziel: 3, xp: 10 },
      { id: 'craft1', text: 'Stelle etwas her (Tab → Herstellen)', zaehler: 'hergestellt', ziel: 1, xp: 10 },
      { id: 'zombie1', text: 'Erledige deinen ersten Zombie', zaehler: 'zombie', ziel: 1, xp: 15 },
    ],
  },
  {
    id: 'erste_nacht',
    titel: 'Die erste Nacht',
    rang: 'Überlebende:r',
    bonusXp: 40,
    ziele: [
      { id: 'feuer', text: 'Baue ein Lagerfeuer', zaehler: 'gebaut_lagerfeuer', ziel: 1, xp: 15 },
      { id: 'nacht1', text: 'Überlebe eine Nacht', zaehler: 'naechte', ziel: 1, xp: 30 },
      { id: 'pflanzen', text: 'Pflanze etwas an (Beet/Erdfeld)', zaehler: 'gepflanzt', ziel: 1, xp: 15 },
      { id: 'zombie10', text: 'Erledige 10 Zombies', zaehler: 'zombie', ziel: 10, xp: 25 },
    ],
  },
  {
    id: 'sicherer_ort',
    titel: 'Ein sicherer Ort',
    rang: 'Siedler:in',
    bonusXp: 60,
    ziele: [
      { id: 'flagge', text: 'Stecke eine Flagge (eigenes Baugebiet)', zaehler: 'gebaut_flagge', ziel: 1, xp: 25 },
      { id: 'bauen15', text: 'Baue 15 Teile (Wände, Böden, Möbel …)', zaehler: 'gebaut', ziel: 15, xp: 30 },
      { id: 'ernte', text: 'Ernte selbst Angebautes', zaehler: 'geerntet', ziel: 1, xp: 25 },
      { id: 'fisch', text: 'Fang einen Fisch', zaehler: 'fisch', ziel: 1, xp: 20 },
    ],
  },
  {
    id: 'ueberlebender',
    titel: 'Gegen die Dunkelheit',
    rang: 'Wegfinder:in',
    bonusXp: 90,
    ziele: [
      { id: 'nacht3', text: 'Überlebe 3 Nächte', zaehler: 'naechte', ziel: 3, xp: 40 },
      { id: 'zonen2', text: 'Erkunde eine zweite Zone', zaehler: 'zonen', ziel: 2, xp: 40 },
      { id: 'erz5', text: 'Baue 5× Eisenerz ab', zaehler: 'abbau_eisenerz', ziel: 5, xp: 30 },
      { id: 'level5', text: 'Erreiche Level 5', zaehler: 'level', ziel: 5, xp: 40 },
      { id: 'zombie50', text: 'Erledige 50 Zombies', zaehler: 'zombie', ziel: 50, xp: 50 },
    ],
  },
  {
    id: 'legende',
    titel: 'Legende der Ödnis',
    rang: 'Legende',
    bonusXp: 200,
    ziele: [
      { id: 'boss', text: 'Besiege einen Brocken (Boss)', zaehler: 'boss', ziel: 1, xp: 80 },
      { id: 'blutmond', text: 'Überlebe einen Blutmond', zaehler: 'blutmond', ziel: 1, xp: 80 },
      { id: 'nacht7', text: 'Überlebe 7 Nächte', zaehler: 'naechte', ziel: 7, xp: 80 },
      { id: 'craft30', text: 'Stelle 30 Dinge her', zaehler: 'hergestellt', ziel: 30, xp: 50 },
      { id: 'zombie200', text: 'Erledige 200 Zombies', zaehler: 'zombie', ziel: 200, xp: 100 },
    ],
  },
]);

/** Zähler, die einen Zustand spiegeln (Maximum statt Summe) */
export const WERT_ZAEHLER = new Set(['level', 'zonen']);

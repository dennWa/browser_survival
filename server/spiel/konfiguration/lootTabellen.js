/**
 * Loot-Tabellen: welche Gegenstände in welchem Raumtyp spawnen.
 * gewicht = relative Häufigkeit innerhalb der Tabelle (höher = häufiger).
 * Welcher Raum welche Tabelle nutzt, steht in der jeweiligen Kartendatei (raeume → lootTabelle).
 */
export const LOOT_TABELLEN = Object.freeze({
  apotheke: [
    { id: 'verband', gewicht: 5 },
    { id: 'schmerzmittel', gewicht: 4 },
    { id: 'erste_hilfe_kasten', gewicht: 1 },
    { id: 'wasserflasche', gewicht: 1 },
  ],
  op: [
    { id: 'skalpell', gewicht: 4 },
    { id: 'verband', gewicht: 3 },
    { id: 'erste_hilfe_kasten', gewicht: 1 },
  ],
  labor: [
    { id: 'schmerzmittel', gewicht: 2 },
    { id: 'wasserflasche', gewicht: 2 },
    { id: 'kaffee', gewicht: 2 },
    { id: 'skalpell', gewicht: 1 },
  ],
  lager: [
    { id: 'konservendose', gewicht: 4 },
    { id: 'wasserflasche', gewicht: 4 },
    { id: 'marmelade', gewicht: 2 },
    { id: 'hammer', gewicht: 2 },
    { id: 'machete', gewicht: 1 },
    { id: 'feuerwehrbeil', gewicht: 1 },
  ],
  patientenzimmer: [
    { id: 'apfel', gewicht: 3 },
    { id: 'milch', gewicht: 2 },
    { id: 'broetchen', gewicht: 2 },
    { id: 'schmerzmittel', gewicht: 1 },
  ],
  kantine: [
    { id: 'konservendose', gewicht: 3 },
    { id: 'sandwich', gewicht: 3 },
    { id: 'kaese', gewicht: 2 },
    { id: 'broetchen', gewicht: 2 },
    { id: 'kuechenmesser', gewicht: 2 },
    { id: 'kaffee', gewicht: 2 },
    { id: 'milch', gewicht: 2 },
  ],
  sicherheit: [
    { id: 'munition_9mm', gewicht: 4 },
    { id: 'pistole', gewicht: 2 },
    { id: 'munition_12', gewicht: 2 },
    { id: 'schrotflinte', gewicht: 1 },
    { id: 'energydrink', gewicht: 2 },
  ],
  eingangshalle: [
    { id: 'energydrink', gewicht: 3 },
    { id: 'muesliriegel', gewicht: 3 },
    { id: 'wasserflasche', gewicht: 2 },
  ],
  notaufnahme: [
    { id: 'verband', gewicht: 4 },
    { id: 'erste_hilfe_kasten', gewicht: 1 },
    { id: 'feuerwehrbeil', gewicht: 1 },
    { id: 'schmerzmittel', gewicht: 2 },
  ],
  // Was getötete Zombies manchmal fallen lassen
  zombie: [
    { id: 'munition_9mm', gewicht: 3 },
    { id: 'munition_12', gewicht: 2 },
    { id: 'verband', gewicht: 2 },
    { id: 'muesliriegel', gewicht: 2 },
    { id: 'energydrink', gewicht: 1 },
  ],
  verwaltung: [
    { id: 'kaffee', gewicht: 2 },
    { id: 'muesliriegel', gewicht: 2 },
    { id: 'energydrink', gewicht: 1 },
    { id: 'munition_9mm', gewicht: 1 },
  ],
  kueche: [
    { id: 'kuechenmesser', gewicht: 3 },
    { id: 'konservendose', gewicht: 3 },
    { id: 'kaese', gewicht: 2 },
    { id: 'milch', gewicht: 2 },
    { id: 'hammer', gewicht: 1 },
  ],
  wohnung: [
    { id: 'apfel', gewicht: 3 },
    { id: 'broetchen', gewicht: 2 },
    { id: 'wasserflasche', gewicht: 3 },
    { id: 'kuechenmesser', gewicht: 2 },
    { id: 'schmerzmittel', gewicht: 1 },
    { id: 'hammer', gewicht: 1 },
    { id: 'marmelade', gewicht: 1 },
  ],
  tankstelle: [
    { id: 'energydrink', gewicht: 4 },
    { id: 'muesliriegel', gewicht: 4 },
    { id: 'wasserflasche', gewicht: 3 },
    { id: 'sandwich', gewicht: 2 },
    { id: 'kaffee', gewicht: 2 },
  ],
  werkstatt: [
    { id: 'hammer', gewicht: 4 },
    { id: 'feuerwehrbeil', gewicht: 1 },
    { id: 'machete', gewicht: 1 },
    { id: 'wasserflasche', gewicht: 2 },
  ],
  supermarkt: [
    { id: 'konservendose', gewicht: 4 },
    { id: 'wasserflasche', gewicht: 4 },
    { id: 'broetchen', gewicht: 3 },
    { id: 'kaese', gewicht: 2 },
    { id: 'apfel', gewicht: 3 },
    { id: 'milch', gewicht: 2 },
    { id: 'marmelade', gewicht: 2 },
    { id: 'kuechenmesser', gewicht: 1 },
  ],
  polizei: [
    { id: 'munition_9mm', gewicht: 4 },
    { id: 'verband', gewicht: 2 },
    { id: 'kaffee', gewicht: 2 },
    { id: 'pistole', gewicht: 1 },
  ],
  waffenkammer: [
    { id: 'munition_9mm', gewicht: 4 },
    { id: 'munition_12', gewicht: 4 },
    { id: 'pistole', gewicht: 2 },
    { id: 'schrotflinte', gewicht: 2 },
  ],
  kiosk: [
    { id: 'energydrink', gewicht: 3 },
    { id: 'muesliriegel', gewicht: 3 },
    { id: 'sandwich', gewicht: 2 },
    { id: 'wasserflasche', gewicht: 2 },
  ],
});

/**
 * Farben für Prozedurales (Bodentextur: Asphalt, Gehweg, Markierungen, Türschwellen; Beschriftungen)
 * und Ersatzfarben, falls eine Grafik aus dem Atlas fehlt.
 */
export const KACHEL_FARBEN = {
  gras: '#3d6b35',
  schnee: '#dde8f2',
  asphalt: '#4b4e53',
  strasse: '#36383c',
  gehweg: '#86888c',
  fliesen: '#e6e6e2',
  beton: '#a9c0c4',
  holz: '#c9925a',
  tuer: '#8a5a33',
  wand: '#3b4048',
  wandBoden: '#24272c', // Boden unter Wänden (sichtbar, wenn die Wand ausgeblendet ist)
  fenster: '#3b4048',
  wasser: '#2d78b0',
  rasen: '#4f7d36',
  wiese: '#6b7d3e',
  erde: '#7a5e3f',
  kies: '#8a8a86',
  pflaster: '#8e8a80',
  waldboden: '#6e5232',
  sand: '#bba27a',
};

export const FARBEN = {
  wandKante: '#5f6773',
  tuerschwelle: 'rgba(95, 62, 34, 0.55)',
  markierung: 'rgba(235, 235, 220, 0.85)',
  moebelErsatz: '#8b6b4a',
  // Beschriftungen
  name: '#ffffff',
  lebenHintergrund: 'rgba(0, 0, 0, 0.6)',
  lebenVoll: '#4caf50',
  lebenNiedrig: '#e53935',
};

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

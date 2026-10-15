/**
 * Farben für alles, was prozedural gezeichnet wird (Wände, Asphalt, UI-Elemente im Spiel)
 * und Ersatzfarben, falls eine Grafik aus dem Atlas fehlt.
 */
export const KACHEL_FARBEN = {
  gras: '#3d6b35',
  asphalt: '#4b4e53',
  strasse: '#36383c',
  gehweg: '#86888c',
  fliesen: '#e6e6e2',
  beton: '#a9c0c4',
  holz: '#c9925a',
  tuer: '#8a5a33',
  wand: '#3b4048',
  fenster: '#3b4048',
};

export const FARBEN = {
  hintergrund: '#0d0f12',
  wand: '#363b43',
  wandKante: '#5f6773',
  glas: '#8cc8e2',
  glasGlanz: 'rgba(235, 250, 255, 0.85)',
  tuerschwelle: 'rgba(95, 62, 34, 0.55)',
  markierung: 'rgba(235, 235, 220, 0.85)',
  moebelErsatz: '#8b6b4a',
  schatten: 'rgba(0, 0, 0, 0.35)',
  // Platzhalter-Figuren (nur ohne Grafiken)
  eigenerSpieler: '#3fa7ff',
  andererSpieler: '#f2c14e',
  zombie: '#6f8f3a',
  zombieAggro: '#a33a2a',
  blickLinie: 'rgba(255, 255, 255, 0.8)',
  // Beschriftungen
  name: '#ffffff',
  lebenHintergrund: 'rgba(0, 0, 0, 0.6)',
  lebenVoll: '#4caf50',
  lebenNiedrig: '#e53935',
  itemLeuchten: 'rgba(255, 244, 200, 0.75)',
};

export const GEGENSTAND_FARBEN = {
  nahrung: '#e08e2b',
  getraenk: '#2ba3e0',
  medizin: '#ffffff',
  nahkampf: '#9e9e9e',
  fernkampf: '#303030',
  munition: '#d4af37',
};

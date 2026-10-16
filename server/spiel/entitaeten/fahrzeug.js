/**
 * Fahrzeug-Entität (Autos, Transporter). Physik: gemeinsam/physik/fahrzeug.js, Verhalten: systeme/fahrzeugSystem.js.
 * Fährt jemand, hängt dasselbe Objekt auch am Spieler (spieler.fahrzeug) – die Bewegungsphysik bewegt es direkt.
 */
export function erzeugeFahrzeug({ id, modell, x, y, winkel, laenge, breite }) {
  return { id, typ: 'fahrzeug', modell, x, y, winkel, tempo: 0, laenge, breite, fahrerId: null, letzteKacheln: '', treffer: new Map() };
}

/** Gerundet wie Zombies – die genauen Fahrwerte für die eigene Vorhersage stehen beim Fahrer (spielerZuNetzwerk). */
export function fahrzeugZuNetzwerk(f) {
  const r = (v, n = 100) => Math.round(v * n) / n;
  return { id: f.id, typ: f.typ, modell: f.modell, x: r(f.x), y: r(f.y), winkel: r(f.winkel, 1000), tempo: r(f.tempo, 10), laenge: r(f.laenge), breite: r(f.breite), fahrerId: f.fahrerId };
}

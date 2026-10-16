/**
 * Fahrzeug-Entität (Autos, Transporter). Physik: gemeinsam/physik/fahrzeug.js, Verhalten: systeme/fahrzeugSystem.js.
 * Fährt jemand, hängt dasselbe Objekt auch am Spieler (spieler.fahrzeug) – die Bewegungsphysik bewegt es direkt.
 */
export function erzeugeFahrzeug({ id, modell, x, y, winkel, laenge, breite }) {
  return { id, typ: 'fahrzeug', modell, x, y, winkel, tempo: 0, laenge, breite, fahrerId: null, letzteKacheln: '', treffer: new Map() };
}

export function fahrzeugZuNetzwerk(f) {
  return { id: f.id, typ: f.typ, modell: f.modell, x: f.x, y: f.y, winkel: f.winkel, tempo: f.tempo, laenge: f.laenge, breite: f.breite, fahrerId: f.fahrerId };
}

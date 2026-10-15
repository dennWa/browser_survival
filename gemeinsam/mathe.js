/** Kleine Mathe-Helfer für Client und Server. */

export function begrenze(wert, min, max) {
  return wert < min ? min : wert > max ? max : wert;
}

/** Lineare Interpolation zwischen a und b (t = 0..1). */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Interpoliert Winkel über den kürzesten Weg (z. B. 350° → 10° geht über 0°). */
export function lerpWinkel(a, b, t) {
  let differenz = (b - a) % (Math.PI * 2);
  if (differenz > Math.PI) differenz -= Math.PI * 2;
  if (differenz < -Math.PI) differenz += Math.PI * 2;
  return a + differenz * t;
}

export function abstand(ax, ay, bx, by) {
  return Math.hypot(bx - ax, by - ay);
}

/** Normalisiert einen Vektor auf Länge ≤ 1 (diagonal also nicht schneller). */
export function normalisiere(x, y) {
  const laenge = Math.hypot(x, y);
  if (laenge <= 1 || laenge === 0) return { x, y };
  return { x: x / laenge, y: y / laenge };
}

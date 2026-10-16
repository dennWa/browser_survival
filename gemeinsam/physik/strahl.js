/**
 * Strahlen (Raycasts): Schüsse, Sichtlinien. Läuft auf Kacheln mit dem DDA-Verfahren
 * (Amanatides & Woo): springt von Kachelgrenze zu Kachelgrenze → exakt und schnell.
 */

/**
 * Verfolgt einen Strahl ab (x, y) in Richtung `winkel`, bis er eine Wand trifft oder maxLaenge erreicht.
 * @param blockiert (tx, ty) → boolean; Standard: Sicht-Blockade (Wände/Fenster, keine Möbel)
 * @returns {{ x, y, laenge, getroffen }}  Endpunkt; getroffen = true, wenn eine Wand im Weg war
 */
export function strahlGegenWaende(welt, x, y, winkel, maxLaenge, blockiert = (tx, ty) => welt.istSichtBlockiert(tx, ty)) {
  const g = welt.kachelGroesse;
  const dx = Math.cos(winkel);
  const dy = Math.sin(winkel);
  let tx = Math.floor(x / g);
  let ty = Math.floor(y / g);
  if (blockiert(tx, ty)) return { x, y, laenge: 0, getroffen: true };

  const schrittX = dx > 0 ? 1 : -1;
  const schrittY = dy > 0 ? 1 : -1;
  const deltaX = dx !== 0 ? Math.abs(g / dx) : Infinity;
  const deltaY = dy !== 0 ? Math.abs(g / dy) : Infinity;
  let naechstesX = dx > 0 ? ((tx + 1) * g - x) / dx : dx < 0 ? (tx * g - x) / dx : Infinity;
  let naechstesY = dy > 0 ? ((ty + 1) * g - y) / dy : dy < 0 ? (ty * g - y) / dy : Infinity;

  for (;;) {
    let t;
    if (naechstesX < naechstesY) {
      t = naechstesX;
      naechstesX += deltaX;
      tx += schrittX;
    } else {
      t = naechstesY;
      naechstesY += deltaY;
      ty += schrittY;
    }
    if (t >= maxLaenge) return { x: x + dx * maxLaenge, y: y + dy * maxLaenge, laenge: maxLaenge, getroffen: false };
    if (blockiert(tx, ty)) return { x: x + dx * t, y: y + dy * t, laenge: t, getroffen: true };
  }
}

/** Freie Sicht von A nach B (keine Wand dazwischen)? */
export function sichtlinieFrei(welt, ax, ay, bx, by) {
  const laenge = Math.hypot(bx - ax, by - ay);
  if (laenge < 1) return true;
  return !strahlGegenWaende(welt, ax, ay, Math.atan2(by - ay, bx - ax), laenge).getroffen;
}

/**
 * Kann ein Körper mit `radius` geradlinig von A nach B laufen (Wände UND Möbel)?
 * Prüft drei parallele Strahlen: Mitte und beide Körperränder.
 */
export function wegFrei(welt, ax, ay, bx, by, radius) {
  const laenge = Math.hypot(bx - ax, by - ay);
  if (laenge < 1) return true;
  const winkel = Math.atan2(by - ay, bx - ax);
  const nx = -Math.sin(winkel) * radius;
  const ny = Math.cos(winkel) * radius;
  const begehbar = (tx, ty) => welt.istBlockiert(tx, ty);
  for (const seite of [0, 1, -1]) {
    if (strahlGegenWaende(welt, ax + nx * seite, ay + ny * seite, winkel, laenge, begehbar).getroffen) return false;
  }
  return true;
}

/**
 * Schnittpunkt Strahl ↔ Kreis.
 * @param dx, dy  normierte Richtung
 * @returns Abstand t ≥ 0 bis zum Eintritt in den Kreis, oder null
 */
export function strahlTrifftKreis(ox, oy, dx, dy, kx, ky, radius) {
  const fx = ox - kx;
  const fy = oy - ky;
  const b = fx * dx + fy * dy;
  const c = fx * fx + fy * fy - radius * radius;
  const diskriminante = b * b - c;
  if (diskriminante < 0) return null;
  const wurzel = Math.sqrt(diskriminante);
  let t = -b - wurzel;
  if (t < 0) t = -b + wurzel;
  return t < 0 ? null : t;
}

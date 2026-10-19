/**
 * Texturen & Malen in der Modell-Werkstatt (Editor 2.0, Schritt 5.2) – umgebungsfreie Rechnungen (tests/werkstatt.test.js).
 * UV-Konvention wie glTF: (0,0) = linke obere Ecke des Bilds (Texturen mit flipY = false) → Pixel = (u·B, v·H).
 *   malGroesse      – Leinwandgröße für eine Mal-Textur (Seitenverhältnis bleibt, höchstens MAL_MAX)
 *   pinselSchritte  – Zwischenpunkte eines Pinselstrichs in UV (kein Verbinden über UV-Nähte = große Sprünge)
 *   aufkleberGroesse – Projektionsquader eines Aufklebers (Breite in m, Höhe nach Bild-Seitenverhältnis)
 */
export const MAL_MAX = 1024;
export const MAL_STANDARD = 512;
/** UV-Sprung, ab dem zwei Pinselpunkte als getrennt gelten (Naht im UV-Layout) */
export const NAHT = 0.25;

export function malGroesse(bildB, bildH, max = MAL_MAX) {
  if (!(bildB > 0 && bildH > 0)) return { b: MAL_STANDARD, h: MAL_STANDARD };
  const f = Math.min(1, max / Math.max(bildB, bildH));
  return { b: Math.max(16, Math.round(bildB * f)), h: Math.max(16, Math.round(bildH * f)) };
}

/**
 * Punkte von a nach b (UV) im Abstand ≤ schritt (UV-Einheiten); a = null oder Naht → nur b.
 * @returns [{u, v}] ohne a, mit b
 */
export function pinselSchritte(a, b, schritt) {
  if (!a) return [b];
  const du = b.u - a.u;
  const dv = b.v - a.v;
  const d = Math.hypot(du, dv);
  if (d > NAHT || !(schritt > 0)) return [b];
  const n = Math.max(1, Math.ceil(d / schritt));
  return Array.from({ length: n }, (_, i) => ({ u: a.u + (du * (i + 1)) / n, v: a.v + (dv * (i + 1)) / n }));
}

/** Projektionsquader eines Aufklebers: Breite (m), Höhe aus dem Bild, Tiefe = größere Seite (greift auch an Rundungen) */
export function aufkleberGroesse(breite, bildB = 1, bildH = 1) {
  const x = Math.max(0.01, breite);
  const y = Math.max(0.01, (x * (bildH || 1)) / (bildB || 1));
  return { x, y, z: Math.max(x, y) };
}

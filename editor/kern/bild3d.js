/**
 * Bild → 3D (Phase 10), erster einfacher Schritt: EXTRUSION nach Alpha-Maske. Jeder deckende Pixel des (verkleinerten)
 * Bildes wird ein Quader in seiner Farbe; das Bild steht aufrecht (Pixel-y → Höhe), Tiefe = `tiefe`.
 * Alternative: BILLBOARD (Bild als Sprite, immer zur Kamera) – das macht die 3D-Ansicht direkt mit der Bildtextur.
 * Eine KI-basierte Umwandlung (echtes 3D aus einem Foto) ist bewusst NICHT eingebaut – optional, später ergänzbar,
 * im Dialog als „KI (später)“ gekennzeichnet.
 * Reine Funktion (kein DOM, kein Three.js) → in node:test prüfbar; ui/bild3d.js baut daraus die Geometrie.
 */
export const MAX_PIXEL = 32;
export const ALPHA_SCHWELLE = 128;

/** Deckende Pixel: [{ x, y, r, g, b }] (y = 0 oben) */
export function alphaMaske({ breite, hoehe, rgba }, schwelle = ALPHA_SCHWELLE) {
  const liste = [];
  for (let y = 0; y < hoehe; y++)
    for (let x = 0; x < breite; x++) {
      const i = (y * breite + x) * 4;
      if (rgba[i + 3] >= schwelle) liste.push({ x, y, r: rgba[i], g: rgba[i + 1], b: rgba[i + 2] });
    }
  return liste;
}

/** Würfel-Vorlage (36 Ecken, je 6 Flächen) mit Normalen: Einheitswürfel 0..1 */
const FLAECHEN = [
  [[1, 0, 0], [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]]],
  [[-1, 0, 0], [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]]],
  [[0, 1, 0], [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]]],
  [[0, -1, 0], [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]]],
  [[0, 0, 1], [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]]],
  [[0, 0, -1], [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]]],
];

/**
 * Extrusion als Ecken-Listen (für THREE.BufferGeometry, nicht indiziert).
 * @param bild { breite, hoehe, rgba } (schon verkleinert)
 * @returns {{ positionen: Float32Array, normalen: Float32Array, farben: Float32Array, pixel: number }}
 *   Maße: Breite = `breite` (Einheiten), Höhe = breite × Seitenverhältnis, Tiefe = `tiefe`; Fuß bei y = 0, mittig in x/z.
 */
export function extrusion(bild, { breite = 1, tiefe = 0.3, schwelle = ALPHA_SCHWELLE } = {}) {
  const pixel = alphaMaske(bild, schwelle);
  const s = breite / bild.breite;
  const n = pixel.length * 36;
  const positionen = new Float32Array(n * 3);
  const normalen = new Float32Array(n * 3);
  const farben = new Float32Array(n * 3);
  let i = 0;
  for (const p of pixel) {
    const x0 = -breite / 2 + p.x * s;
    const y0 = (bild.hoehe - 1 - p.y) * s;
    const z0 = -tiefe / 2;
    for (const [normale, ecken] of FLAECHEN) {
      for (const e of [0, 1, 2, 0, 2, 3]) {
        const [ex, ey, ez] = ecken[e];
        positionen.set([x0 + ex * s, y0 + ey * s, z0 + ez * tiefe], i * 3);
        normalen.set(normale, i * 3);
        farben.set([(p.r / 255) ** 2.2, (p.g / 255) ** 2.2, (p.b / 255) ** 2.2], i * 3); // sRGB → linear
        i++;
      }
    }
  }
  return { positionen, normalen, farben, pixel: pixel.length };
}

/** Zielgröße beim Verkleinern (längste Seite ≤ MAX_PIXEL) */
export function verkleinerteGroesse(b, h, max = MAX_PIXEL) {
  const f = Math.min(1, max / Math.max(b, h));
  return { breite: Math.max(1, Math.round(b * f)), hoehe: Math.max(1, Math.round(h * f)) };
}

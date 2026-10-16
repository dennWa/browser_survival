import * as THREE from 'three';
import { vereineGeometrien, matrixAus } from './geometrie.js';

/**
 * Prozedurale Cartoon-Bäume und -Büsche (kein Bild-Asset nötig): Stamm mit Wurzelansatz und Ästen,
 * Krone aus mehreren runden "Wolken" in zwei Grüntönen, dazu ein schwarzer Umriss (Inverted Hull).
 * Gezeichnet mit Toon-Material → harte Licht-Stufen wie im Comic.
 *
 * Maße in Weltpixeln für einen Baum mit 112 px Grundfläche (3,5 Kacheln); kartenModell skaliert passend.
 * Die Krone sitzt komplett ÜBER dem Stamm (Stamm endet in der Krone) – nichts ragt oben heraus.
 */
export const BAUM_GRUNDFLAECHE = 112;
export const BUSCH_GRUNDFLAECHE = 48;
const UMRISS = 1.6; // Dicke des schwarzen Umrisses

const STAMM = new THREE.Color(0x7a4a26);
const STAMM_DUNKEL = new THREE.Color(0x5c3519);

const FARBEN = {
  baum: [0x5cab2f, 0x438a24, 0x6fc23a],
  baum_herbst: [0xe0892c, 0xc0602a, 0xe8b23c],
  busch: [0x4f9c2c, 0x3d8124, 0x63b336],
};

/** Krone: [x, y, z, radius, farbIndex] */
const BAUM_KRONE = [
  [0, 84, 0, 34, 0],
  [-27, 72, 6, 25, 1],
  [26, 74, 4, 25, 1],
  [2, 72, -27, 24, 1],
  [-4, 76, 26, 23, 0],
  [12, 102, 8, 24, 2],
  [-15, 98, -10, 22, 0],
  [20, 88, -18, 19, 2],
];
const BUSCH_KRONE = [
  [0, 13, 0, 15, 0],
  [-11, 10, 5, 10, 1],
  [10, 10, -4, 11, 1],
  [3, 19, 4, 9, 2],
];

/**
 * @returns {{ koerper: THREE.BufferGeometry, umriss: THREE.BufferGeometry }} beide mit Vertexfarbe (umriss ohne)
 */
export function baueBaum(typ) {
  const istBusch = typ === 'busch';
  const farben = (FARBEN[typ] ?? FARBEN.baum).map((f) => new THREE.Color(f));
  const teile = [];

  if (!istBusch) {
    // Stamm (endet bei 80 – mitten in der Krone), Wurzelansatz, drei Äste
    teile.push({ geometrie: new THREE.CylinderGeometry(6, 9, 80, 9, 1), matrix: matrixAus(0, 40, 0), farbe: STAMM });
    teile.push({ geometrie: new THREE.CylinderGeometry(9, 14, 8, 9, 1), matrix: matrixAus(0, 4, 0), farbe: STAMM_DUNKEL });
    for (const [winkel, hoehe, laenge] of [[0.3, 46, 30], [2.4, 52, 28], [4.3, 42, 26]]) {
      const ast = new THREE.CylinderGeometry(2.4, 3.6, laenge, 6, 1).translate(0, laenge / 2, 0);
      const m = new THREE.Matrix4()
        .makeTranslation(0, hoehe, 0)
        .multiply(new THREE.Matrix4().makeRotationY(winkel))
        .multiply(new THREE.Matrix4().makeRotationZ(-0.85));
      teile.push({ geometrie: ast, matrix: m, farbe: STAMM });
    }
  }
  for (const [x, y, z, r, f] of istBusch ? BUSCH_KRONE : BAUM_KRONE) {
    teile.push({ geometrie: new THREE.IcosahedronGeometry(r, 1), matrix: matrixAus(x, y, z), farbe: farben[f] });
  }

  const koerper = vereineGeometrien(teile, { mitFarbe: true });
  // Leichte Aufhellung nach oben (Sonnenseite) – macht die Kronen-Wolken plastischer
  const n = koerper.attributes.normal.array;
  const c = koerper.attributes.color.array;
  for (let i = 0; i < c.length; i += 3) {
    const faktor = 0.9 + 0.18 * n[i + 1];
    c[i] *= faktor;
    c[i + 1] *= faktor;
    c[i + 2] *= faktor;
  }

  // Umriss: dieselben Teile, entlang der Normalen aufgeblasen; wird mit BackSide schwarz gezeichnet
  const umriss = vereineGeometrien(teile);
  const p = umriss.attributes.position.array;
  const un = umriss.attributes.normal.array;
  for (let i = 0; i < p.length; i++) p[i] += un[i] * UMRISS;
  umriss.deleteAttribute('uv');
  umriss.computeBoundingSphere();
  return { koerper, umriss, grundflaeche: istBusch ? BUSCH_GRUNDFLAECHE : BAUM_GRUNDFLAECHE };
}

/** Stumpf eines gefällten Baums: Stamm-Rest mit heller Schnittfläche (Jahresringe angedeutet). */
export function baueStumpf() {
  const teile = [
    { geometrie: new THREE.CylinderGeometry(8, 10, 10, 10, 1), matrix: matrixAus(0, 5, 0), farbe: STAMM },
    { geometrie: new THREE.CylinderGeometry(10, 15, 5, 10, 1), matrix: matrixAus(0, 2.5, 0), farbe: STAMM_DUNKEL },
    { geometrie: new THREE.CylinderGeometry(7, 7, 0.6, 10, 1), matrix: matrixAus(0, 10.3, 0), farbe: new THREE.Color(0xd9b07a) },
    { geometrie: new THREE.CylinderGeometry(3.5, 3.5, 0.6, 8, 1), matrix: matrixAus(0, 10.5, 0), farbe: new THREE.Color(0xb88a52) },
  ];
  return vereineGeometrien(teile, { mitFarbe: true });
}

let toonVerlauf = null;
/** 3-stufiger Licht-Verlauf für MeshToonMaterial */
export function toonMaterial(eigenschaften = {}) {
  if (!toonVerlauf) {
    toonVerlauf = new THREE.DataTexture(new Uint8Array([90, 170, 255]), 3, 1, THREE.RedFormat);
    toonVerlauf.minFilter = toonVerlauf.magFilter = THREE.NearestFilter;
    toonVerlauf.needsUpdate = true;
  }
  return new THREE.MeshToonMaterial({ gradientMap: toonVerlauf, ...eigenschaften });
}

import * as THREE from 'three';
import { vereineGeometrien, matrixAus } from './geometrie.js';
import { erzeugeWaffe, WAFFEN_NAMEN } from './waffenModelle.js';

/**
 * 3D-Modelle für Gegenstände am Boden – prozedural aus einfachen Körpern, jeweils zu EINER Geometrie mit
 * Vertexfarben zusammengefasst (1 Draw-Call pro Item, alle teilen sich ein Material).
 *
 * Neues Modell? → In BAUPLAENE eine Funktion `defId: () => [teil(...), ...]` ergänzen.
 * Waffen & Werkzeuge kommen automatisch aus waffenModelle.js (liegen flach auf der Seite).
 * Ohne Bauplan zeigt der Renderer weiter das flache Icon (Fallback).
 *
 * Maße: 1 Einheit = 1 Weltpixel, vor ITEM_SKALA. Der Boden ist y = 0, Modelle werden automatisch draufgestellt.
 */
const ITEM_SKALA = 2.6; // Items etwas größer als "echt", sonst sieht man sie von oben kaum
const WAFFEN_SKALA = 1.6; // Waffen sind (mit SICHTBARKEIT aus waffenModelle.js) schon größer

const f = (hex) => new THREE.Color(hex);
const box = (b, h, t, farbe, x = 0, y = 0, z = 0, drehY = 0) => ({ geometrie: new THREE.BoxGeometry(b, h, t), matrix: matrixAus(x, y, z, drehY), farbe: f(farbe) });
const zyl = (r, h, farbe, x = 0, y = 0, z = 0, segmente = 12, r2 = r) => ({ geometrie: new THREE.CylinderGeometry(r, r2, h, segmente), matrix: matrixAus(x, y, z), farbe: f(farbe) });
/** liegender Zylinder (entlang x) */
const rolle = (r, l, farbe, x = 0, y = 0, z = 0, drehY = 0) => ({
  geometrie: new THREE.CylinderGeometry(r, r, l, 10).rotateZ(Math.PI / 2),
  matrix: matrixAus(x, y, z, drehY),
  farbe: f(farbe),
});
const kugel = (r, farbe, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) => ({
  geometrie: new THREE.SphereGeometry(r, 10, 8),
  matrix: new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz)),
  farbe: f(farbe),
});

const BAUPLAENE = {
  // Essen
  konservendose: () => [zyl(3.4, 6, 0xb8bcc2), zyl(3.5, 3.4, 0xc0392b), zyl(3.1, 0.3, 0x8e949b, 0, 3.1, 0)],
  marmelade: () => [zyl(3, 4.4, 0x6c2a5e), zyl(3.2, 1.2, 0xd4a72c, 0, 2.7, 0), zyl(3.05, 1.6, 0xf3eedf, 0, -0.2, 0)],
  apfel: () => [kugel(3, 0xc0281f, 0, 0, 0, 1, 0.9, 1), zyl(0.3, 1.6, 0x5a3a1c, 0, 3, 0), box(1.6, 0.3, 0.9, 0x4f9a2a, 0.8, 2.9, 0, 0.5)],
  broetchen: () => [kugel(3.6, 0xd39b55, 0, 0, 0, 1.15, 0.6, 0.9), box(4, 0.4, 0.5, 0xb07a3a, 0, 1.9, 0, 0.2)],
  kaese: () => [{ geometrie: new THREE.CylinderGeometry(4, 4, 3, 3, 1, false, 0, Math.PI / 2.2), matrix: matrixAus(0, 0, 0), farbe: f(0xf2c94c) }],
  muesliriegel: () => [box(7, 1.4, 2.6, 0x8a5a2b), box(7.4, 1.5, 1.2, 0x2d7dd2)],
  sandwich: () => [box(6, 1, 6, 0xe6c28a, 0, -1, 0), box(6.4, 0.7, 6.4, 0x58a83a), box(6, 1, 6, 0xe6c28a, 0, 1, 0)],
  // Getränke
  wasserflasche: () => [zyl(2.2, 8, 0x9fd3f0), zyl(2.25, 3, 0x2d7dd2, 0, 0.5, 0), zyl(1, 2, 0x9fd3f0, 0, 5, 0), zyl(1.1, 1, 0x1f5fa8, 0, 6.4, 0)],
  energydrink: () => [zyl(1.9, 6, 0x1d1d1d), zyl(1.95, 2.4, 0x7bd23a), zyl(1.6, 0.3, 0xb8bcc2, 0, 3.1, 0)],
  milch: () => [box(4, 7, 4, 0xf7f7f2), box(4.1, 2.4, 4.1, 0x2d7dd2, 0, -1.5, 0), box(4, 1.6, 2, 0xe9e9e2, 0, 4.2, 0)],
  kaffee: () => [zyl(2.6, 4, 0xf3eedf, 0, 0, 0, 12, 2.1), zyl(2.3, 0.3, 0x3b2414, 0, 1.9, 0), box(1, 2.2, 0.6, 0xf3eedf, 3, 0.2, 0)],
  // Medizin
  verband: () => [rolle(2.4, 3.4, 0xf4f1ea), rolle(1, 3.5, 0xd8d2c4)],
  schmerzmittel: () => [zyl(1.8, 4.2, 0xe67e22), zyl(1.9, 1.2, 0xf7f7f2, 0, 2.6, 0)],
  erste_hilfe_kasten: () => [box(9, 4.5, 6.5, 0xc0392b), box(1.4, 0.3, 4, 0xffffff, 0, 2.35, 0), box(4, 0.3, 1.4, 0xffffff, 0, 2.35, 0), box(3, 0.8, 0.8, 0x7a1d14, 0, 2.6, -3.2)],
  // Munition
  munition_9mm: () => [box(6, 3.4, 4, 0x55602e), box(6.1, 0.9, 4.1, 0xd4a72c, 0, 0.6, 0)],
  munition_12: () => [box(6.4, 4, 5, 0xa3231a), ...[-1.8, 0, 1.8].map((x) => zyl(0.8, 1, 0xd4a72c, x, 2.4, 0))],
  // Material
  holz: () => [rolle(1.8, 10, 0x8a5a2b, 0, 0, -2), rolle(1.8, 10, 0x7a4f26, 0, 0, 2), rolle(1.8, 10, 0x936234, 0, 3, 0)],
  stein: () => [{ geometrie: new THREE.DodecahedronGeometry(3.6, 0), matrix: new THREE.Matrix4().compose(new THREE.Vector3(), new THREE.Quaternion(), new THREE.Vector3(1.2, 0.75, 1)), farbe: f(0x8a8d91) }],
  bretter: () => [box(12, 0.9, 2.6, 0xb98a55, 0, 0, -1.6), box(12, 0.9, 2.6, 0xa77a48, 0.6, 0, 1.4), box(12, 0.9, 2.6, 0xc49663, -0.3, 0.9, 0, 0.12)],
  eisenerz: () => [
    { geometrie: new THREE.DodecahedronGeometry(3.6, 0), matrix: new THREE.Matrix4().compose(new THREE.Vector3(), new THREE.Quaternion(), new THREE.Vector3(1.2, 0.75, 1)), farbe: f(0x6e5a4e) },
    { geometrie: new THREE.OctahedronGeometry(1.4, 0), matrix: matrixAus(1.6, 1.8, 0.8), farbe: f(0xd9772e) },
    { geometrie: new THREE.OctahedronGeometry(1.1, 0), matrix: matrixAus(-1.4, 1.4, -1), farbe: f(0xd9772e) },
  ],
  // Rucksäcke liegen auf dem Rücken; Größe & Farbe je nach Variante
  rucksack: () => rucksackLiegend(1, null),
  rucksack_klein: () => rucksackLiegend(0.8, 0x9a7a3a),
  rucksack_gross: () => rucksackLiegend(1.18, 0x2f4a6a),
  // Garten & Ernte
  tomate: () => [kugel(2.6, 0xd8392b, 0, 0, 0, 1, 0.85, 1), box(1.6, 0.4, 1.6, 0x3f7a22, 0, 2.2, 0, 0.6)],
  gurke: () => [kugel(1.4, 0x3f8a2a, 0, 0, 0, 3.4, 1, 1)],
  kartoffel: () => [kugel(2.2, 0xc9a26a, 0, 0, 0, 1.4, 0.9, 1), kugel(1.6, 0xb98f58, 2.6, -0.3, 1, 1.2, 0.85, 1)],
  tomate_gebraten: () => [kugel(2.5, 0x8a2a1a, 0, 0, 0, 1, 0.7, 1), box(4, 0.5, 4, 0x6b6b6b, 0, -1.6, 0)],
  gurke_gebraten: () => [kugel(1.4, 0x7a6a2a, 0, 0, 0, 3.4, 0.9, 1), box(6, 0.5, 3, 0x6b6b6b, 0, -1.2, 0)],
  ofenkartoffel: () => [kugel(2.6, 0x8a6a3a, 0, 0, 0, 1.4, 0.9, 1), box(1.6, 0.6, 3.6, 0xf3eedf, 0, 2.2, 0)],
  samen_tomate: () => samentuete(0xd84a3a),
  samen_gurke: () => samentuete(0x5aa83a),
  samen_kartoffel: () => samentuete(0xb98a4a),
  hacke: () => [rolle(0.8, 16, 0x8a5a2b), box(1, 4, 5, 0x9aa0a6, 8.4, 0, 0)],
  feuerzeug: () => [box(2, 4.4, 1.2, 0xc0392b), box(2.1, 1.2, 1.3, 0xb8bcc2, 0, 2.6, 0)],
  // Bauwerke als Pakete
  falle: () => {
    const teile = [zyl(5, 0.8, 0x5d6168)];
    for (let i = 0; i < 8; i++) {
      const w = (i / 8) * Math.PI * 2;
      teile.push({ geometrie: new THREE.ConeGeometry(0.7, 2, 4), matrix: matrixAus(Math.cos(w) * 4.6, 1, Math.sin(w) * 4.6), farbe: f(0xd6dade) });
    }
    return teile;
  },
  lagerfeuer: () => [rolle(1.6, 11, 0x6b4424, 0, 0, -1.8), rolle(1.6, 11, 0x7a4f26, 0, 0, 1.8), rolle(1.6, 11, 0x6b4424, 0, 2.6, 0), kugel(1.6, 0x84868a, 5, -0.6, 4), kugel(1.4, 0x84868a, -5, -0.6, 4)],
  werkbank: () => [box(14, 1, 9, 0xb98a55, 0, 0, 0), box(14, 1, 9, 0xa77a48, 0.5, 1.1, 0.4, 0.06), box(13, 0.8, 1.6, 0x4a3018, 0, 2, 0, 0.3), box(3, 2, 2, 0x5b6168, 4, 2.6, -2)],
};

function rucksackLiegend(groesse, farbe) {
  return rucksackTeile().map((t, i) => ({
    ...t,
    farbe: farbe !== null && i === 0 ? f(farbe) : t.farbe,
    matrix: new THREE.Matrix4().makeScale(groesse, groesse, groesse).multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2)).multiply(t.matrix),
  }));
}

function samentuete(farbe) {
  return [box(5, 0.6, 7, 0xece0ba), box(5.1, 0.7, 1.6, 0xc4aa78, 0, 0, -2.8), zyl(1.5, 0.3, farbe, 0, 0.45, 0.6)];
}

/** Rucksack-Teile (aufrecht, Gurte zeigen nach +z) – auch für den Rucksack auf dem Rücken der Figur. */
export function rucksackTeile() {
  return [
    box(15, 17, 7, 0x6b4b2a),
    box(15.6, 6, 7.6, 0x3f2c18, 0, 6, 0.2), // Deckel
    box(11, 7, 3, 0x3f2c18, 0, -3, -4.6), // Außentasche
    box(2.4, 18, 1.4, 0x2a2a2a, -4.5, 0, 4),
    box(2.4, 18, 1.4, 0x2a2a2a, 4.5, 0, 4),
  ];
}

export const ITEM_MATERIAL = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.65, metalness: 0.1 });

const cache = new Map();

/** Geometrie fürs Item (gecacht) oder null, wenn es kein Modell gibt. */
export function itemGeometrie(defId) {
  if (cache.has(defId)) return cache.get(defId);
  let geometrie = null;
  if (BAUPLAENE[defId]) {
    geometrie = vereineGeometrien(BAUPLAENE[defId](), { mitFarbe: true });
    const skala = defId.startsWith('rucksack') ? 1 : ITEM_SKALA; // Rucksäcke sind schon in Weltgröße gebaut
    geometrie.scale(skala, skala, skala);
  } else if (WAFFEN_NAMEN.includes(defId)) {
    geometrie = ausWaffe(defId);
  }
  if (geometrie) aufDenBoden(geometrie);
  cache.set(defId, geometrie);
  return geometrie;
}

/** Waffenmodell aus der Hand → flach auf die Seite gelegt, Farben aus den Materialien übernommen. */
function ausWaffe(name) {
  const modell = erzeugeWaffe(name);
  modell.scale.multiplyScalar(WAFFEN_SKALA);
  modell.rotation.z = Math.PI / 2; // auf die Seite legen
  modell.updateMatrixWorld(true);
  const teile = [];
  modell.traverse((o) => {
    if (o.isMesh) teile.push({ geometrie: o.geometry, matrix: o.matrixWorld.clone(), farbe: o.material.color.clone() });
  });
  return vereineGeometrien(teile, { mitFarbe: true });
}

/** Mittelpunkt auf (0, ·, 0) und Unterkante auf y = 0.3 (kein Flackern mit dem Boden). */
function aufDenBoden(geometrie) {
  geometrie.computeBoundingBox();
  const b = geometrie.boundingBox;
  geometrie.translate(-(b.min.x + b.max.x) / 2, 0.3 - b.min.y, -(b.min.z + b.max.z) / 2);
  geometrie.computeBoundingSphere();
}

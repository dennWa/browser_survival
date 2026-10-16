import * as THREE from 'three';
import { vereineGeometrien, matrixAus } from './geometrie.js';
import { FAHRZEUG_MODELLE } from '../../gemeinsam/physik/fahrzeug.js';

/**
 * Low-Poly-Autos (prozedural): Karosserie, Kabine mit Scheiben, Räder, Scheinwerfer & Rücklichter.
 * Ein Mesh pro Auto (alles in einer Geometrie mit Vertexfarben, pro Modell & Größe gecacht).
 * Lokal: Front zeigt nach +z, Breite entlang x, Boden y = 0.
 */
const MATERIAL = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.25 });
const cache = new Map();

export function erzeugeFahrzeugModell(modell, laenge, breite) {
  const schluessel = `${modell}|${Math.round(laenge)}|${Math.round(breite)}`;
  if (!cache.has(schluessel)) cache.set(schluessel, baueGeometrie(modell, laenge, breite));
  const mesh = new THREE.Mesh(cache.get(schluessel), MATERIAL);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const gruppe = new THREE.Group();
  gruppe.add(mesh);
  return gruppe;
}

function baueGeometrie(modell, L, B) {
  const def = FAHRZEUG_MODELLE[modell] ?? FAHRZEUG_MODELLE.auto_schwarz;
  const lack = new THREE.Color(def.farbe);
  const dunkler = lack.clone().multiplyScalar(0.75);
  const glas = new THREE.Color(0x1c2733);
  const reifen = new THREE.Color(0x18181a);
  const felge = new THREE.Color(0x9aa0a6);
  const box = (b, h, t, farbe, x, y, z) => ({ geometrie: new THREE.BoxGeometry(b, h, t), matrix: matrixAus(x, y, z), farbe });
  const teile = [];
  const radR = Math.min(9, B * 0.17);
  // Karosserie (unten) + Stoßstangen
  teile.push(box(B, 15, L * 0.96, lack, 0, radR + 5, 0));
  teile.push(box(B * 0.96, 5, 3, new THREE.Color(0x2a2a2a), 0, radR + 1, L * 0.48));
  teile.push(box(B * 0.96, 5, 3, new THREE.Color(0x2a2a2a), 0, radR + 1, -L * 0.48));
  if (def.transporter) {
    // Kastenwagen: hoher Aufbau fast über die ganze Länge, kurze Schnauze
    teile.push(box(B * 0.94, 30, L * 0.72, lack, 0, radR + 27, -L * 0.1));
    teile.push(box(B * 0.95, 12, 2, glas, 0, radR + 30, L * 0.265)); // Frontscheibe
    teile.push(box(B * 0.96, 9, L * 0.2, glas, 0, radR + 31, L * 0.16)); // Seitenfenster vorne
  } else {
    // PKW: Kabine mit Scheiben ringsum, Dach in Wagenfarbe
    teile.push(box(B * 0.84, 13, L * 0.48, glas, 0, radR + 18.5, -L * 0.04));
    teile.push(box(B * 0.86, 2.5, L * 0.44, dunkler, 0, radR + 26, -L * 0.05));
  }
  // Scheinwerfer & Rücklichter
  for (const s of [-1, 1]) {
    teile.push(box(B * 0.2, 4, 1.5, new THREE.Color(0xfff2c0), s * B * 0.32, radR + 8, L * 0.485));
    teile.push(box(B * 0.18, 4, 1.5, new THREE.Color(0xc0281f), s * B * 0.33, radR + 8, -L * 0.485));
  }
  // Räder
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const rad = new THREE.CylinderGeometry(radR, radR, 6, 12).rotateZ(Math.PI / 2);
      teile.push({ geometrie: rad, matrix: matrixAus(sx * (B / 2 - 2), radR, sz * L * 0.32), farbe: reifen });
      const nabe = new THREE.CylinderGeometry(radR * 0.5, radR * 0.5, 6.4, 8).rotateZ(Math.PI / 2);
      teile.push({ geometrie: nabe, matrix: matrixAus(sx * (B / 2 - 2), radR, sz * L * 0.32), farbe: felge });
    }
  }
  return vereineGeometrien(teile, { mitFarbe: true });
}

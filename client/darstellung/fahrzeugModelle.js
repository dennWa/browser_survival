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

// ---------------------------------------------------------------------------
// Wrack (Auto kaputt, siehe server fahrzeugSystem.schlageFahrzeug): verkohlt, schief, qualmt

const WRACK_MATERIAL = new THREE.MeshStandardMaterial({ vertexColors: true, color: 0x4a423c, roughness: 1, metalness: 0 });

/** Macht aus einem Auto-Modell ein Wrack (einmalig; erkennt man an gruppe.userData.wrack). */
export function macheWrack(gruppe) {
  gruppe.userData.wrack = true;
  const mesh = gruppe.children[0];
  mesh.material = WRACK_MATERIAL;
  mesh.rotation.z = 0.07;
  mesh.position.y = -1.5;
  const rauch = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const wolke = new THREE.Mesh(
      new THREE.SphereGeometry(7, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0x4d4a47, transparent: true, opacity: 0.4, depthWrite: false }),
    );
    wolke.userData.versatz = i / 4;
    wolke.position.x = (i - 1.5) * 8;
    rauch.add(wolke);
  }
  rauch.position.y = 32;
  gruppe.add(rauch);
  gruppe.userData.rauch = rauch;
}

/** Rauch steigt aus dem Wrack auf. */
export function animiereWrack(gruppe, jetzt) {
  for (const wolke of gruppe.userData.rauch.children) {
    const t = ((jetzt / 3200 + wolke.userData.versatz) % 1 + 1) % 1;
    wolke.position.y = t * 55;
    wolke.scale.setScalar(0.5 + t * 1.4);
    wolke.material.opacity = 0.42 * (1 - t);
  }
}

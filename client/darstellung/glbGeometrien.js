import * as THREE from 'three';
import { GLTFLoader } from '../vendor/three/addons.js';

/**
 * Runde 32: Geometrien aus Sammel-GLBs (client/assets/eigene/r32_*.glb, gebaut von werkzeuge/assets/r32/baue_r32.py).
 * Jede Datei enthält benannte Meshes (z. B. r32_steine.glb: stein_0 … stein_5; r32_essen.glb: je Item-ID ein Mesh).
 * `ladeGlbGeometrien(datei)` → Promise<Map<name, { geometrie, material|null }>>: Weltmatrix eingerechnet, Vertexfarben bleiben
 * (Attribut `color`), texturierte Meshes behalten UV + ihr Material (`material`, sonst null = Vertexfarben-Material des Aufrufers).
 * Fehlt die Datei → leere Map (Aufrufer behält den alten Ersatz).
 */
const lader = new GLTFLoader();
const cache = new Map();

export function ladeGlbGeometrien(datei) {
  if (!cache.has(datei)) {
    const url = new URL(`../assets/eigene/${datei}`, import.meta.url).href;
    cache.set(
      datei,
      lader.loadAsync(url).then(
        (gltf) => {
          gltf.scene.updateMatrixWorld(true);
          const aus = new Map();
          gltf.scene.traverse((o) => {
            if (!o.isMesh) return;
            const geometrie = o.geometry.clone().applyMatrix4(o.matrixWorld);
            if (!geometrie.attributes.normal) geometrie.computeVertexNormals(); // nicht indiziert → flache Normalen
            geometrie.computeBoundingBox();
            geometrie.computeBoundingSphere();
            const texturiert = !!o.material?.map;
            if (texturiert) o.material.map.colorSpace = THREE.SRGBColorSpace;
            aus.set(o.name, { geometrie, material: texturiert ? o.material : null });
          });
          return aus;
        },
        () => new Map(),
      ),
    );
  }
  return cache.get(datei);
}

/** Geometrie: Mitte x/z auf 0, Unterkante y = boden, größte Ausdehnung = groesse (Weltpixel). Gibt eine Kopie zurück. */
export function einpassen(geometrie, groesse, boden = 0) {
  const g = geometrie.clone();
  g.computeBoundingBox();
  const b = g.boundingBox;
  const s = groesse / Math.max(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z, 1e-6);
  g.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
  g.scale(s, s, s);
  g.translate(0, boden, 0);
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

/** Vertexfarben-Material (geteilt) für r32-Modelle ohne Textur. */
export const R32_MATERIAL = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.05 });

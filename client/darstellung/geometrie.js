import * as THREE from 'three';

/**
 * Fügt viele Geometrien zu EINER zusammen (ein Draw-Call statt hunderte).
 * Alle Teile werden vorher mit ihrer Matrix in Weltkoordinaten gebracht.
 * Unterstützt position, normal, uv und optional eine einheitliche Farbe pro Teil (Attribut color).
 *
 * @param teile [{ geometrie, matrix, farbe? }]
 */
export function vereineGeometrien(teile, { mitFarbe = false } = {}) {
  const flach = teile.map(({ geometrie, matrix }) => {
    const g = geometrie.index ? geometrie.toNonIndexed() : geometrie.clone();
    g.applyMatrix4(matrix);
    return g;
  });
  const anzahl = flach.reduce((s, g) => s + g.attributes.position.count, 0);
  const position = new Float32Array(anzahl * 3);
  const normal = new Float32Array(anzahl * 3);
  const uv = new Float32Array(anzahl * 2);
  const farbe = mitFarbe ? new Float32Array(anzahl * 3) : null;
  let versatz = 0;
  flach.forEach((g, i) => {
    const n = g.attributes.position.count;
    position.set(g.attributes.position.array, versatz * 3);
    normal.set(g.attributes.normal.array, versatz * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, versatz * 2);
    if (farbe) {
      const c = teile[i].farbe ?? new THREE.Color(1, 1, 1);
      for (let k = 0; k < n; k++) farbe.set([c.r, c.g, c.b], (versatz + k) * 3);
    }
    versatz += n;
    g.dispose();
  });
  const ergebnis = new THREE.BufferGeometry();
  ergebnis.setAttribute('position', new THREE.BufferAttribute(position, 3));
  ergebnis.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  ergebnis.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (farbe) ergebnis.setAttribute('color', new THREE.BufferAttribute(farbe, 3));
  ergebnis.computeBoundingSphere();
  return ergebnis;
}

/** Matrix aus Position, Drehung um y und Skalierung. */
export function matrixAus(x, y, z, drehungY = 0, skalierung = 1) {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), drehungY);
  const s = typeof skalierung === 'number' ? new THREE.Vector3(skalierung, skalierung, skalierung) : skalierung;
  return m.compose(new THREE.Vector3(x, y, z), q, s);
}

/** Objekt-Baum einfrieren: Matrizen einmal berechnen, danach nie wieder (spart CPU pro Frame). */
export function einfrieren(objekt) {
  objekt.updateMatrixWorld(true);
  objekt.traverse((o) => {
    o.matrixAutoUpdate = false;
    o.matrixWorldAutoUpdate = false;
  });
}

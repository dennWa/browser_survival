import * as THREE from 'three';

/**
 * Runde 28: Blutspur – bei aktiver Blutung schickt der Server etwa jede Sekunde ein Ereignis 'blutfleck' { x, y }
 * (gesundheitSystem). Jeder Fleck bleibt LEBENSDAUER_MS liegen und verblasst am Ende; so sieht man, wo ein Verletzter war.
 * Alles in EINEM InstancedMesh (1 Draw-Call), Deckkraft je Fleck als Instanz-Attribut (wie fussspuren.js).
 */
const LEBENSDAUER_MS = 60000;
const AUSBLENDEN_MS = 8000;
const MAX = 256;
const DECKKRAFT = 0.8;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _y = new THREE.Vector3(0, 1, 0);

export class Blutspuren {
  #flecken = []; // { x, y, h, winkel, groesse, zeit }

  /** @param hoeheBei (x, y) → Bodenhöhe (Gelände) */
  constructor(szene, hoeheBei = () => 0) {
    this.hoeheBei = hoeheBei;
    // unregelmäßiger Klecks: Kreis mit zufällig gezackten Rändern (einmal gebaut, je Fleck gedreht/skaliert)
    const form = new THREE.Shape();
    const ecken = 14;
    for (let i = 0; i <= ecken; i++) {
      const w = (i / ecken) * Math.PI * 2;
      const r = 3.2 * (0.75 + 0.35 * Math.abs(Math.sin(i * 2.7) + Math.cos(i * 1.3)) / 2);
      if (i === 0) form.moveTo(Math.cos(w) * r, Math.sin(w) * r);
      else form.lineTo(Math.cos(w) * r, Math.sin(w) * r);
    }
    const geometrie = new THREE.ShapeGeometry(form).rotateX(-Math.PI / 2);
    this.alpha = new THREE.InstancedBufferAttribute(new Float32Array(MAX), 1);
    geometrie.setAttribute('aAlpha', this.alpha);
    const material = new THREE.MeshBasicMaterial({ color: 0x5e0b0b, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aAlpha;\nvarying float vAlpha;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAlpha = aAlpha;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vAlpha;')
        .replace('#include <opaque_fragment>', `diffuseColor.a *= vAlpha * ${DECKKRAFT.toFixed(2)};\n#include <opaque_fragment>`);
    };
    material.customProgramCacheKey = () => 'blutspuren';
    this.mesh = new THREE.InstancedMesh(geometrie, material, MAX);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    szene.add(this.mesh);
  }

  /** Neuer Fleck (leicht versetzt, damit eine stehende Figur eine kleine Lache statt eines Punkts bildet). */
  fleck(x, y, jetzt = performance.now()) {
    if (this.#flecken.length >= MAX) this.#flecken.shift();
    const versatz = () => (Math.random() - 0.5) * 6;
    const fx = x + versatz();
    const fy = y + versatz();
    this.#flecken.push({ x: fx, y: fy, h: this.hoeheBei(fx, fy), winkel: Math.random() * Math.PI * 2, groesse: 0.7 + Math.random() * 0.7, zeit: jetzt });
    this.#neu = true;
  }

  #neu = false;
  #letzte = 0;

  /** Pro Bild: Alte Flecken entfernen, Deckkraft (4×/s reicht) aktualisieren. */
  aktualisiere(jetzt) {
    while (this.#flecken.length && jetzt - this.#flecken[0].zeit > LEBENSDAUER_MS) {
      this.#flecken.shift();
      this.#neu = true;
    }
    if (!this.#neu && jetzt - this.#letzte < 250) return;
    this.#letzte = jetzt;
    this.#neu = false;
    this.#flecken.forEach((f, i) => {
      _q.setFromAxisAngle(_y, f.winkel);
      _p.set(f.x, 0.35 + f.h, f.y);
      _s.set(f.groesse, 1, f.groesse);
      this.mesh.setMatrixAt(i, _m.compose(_p, _q, _s));
      const rest = LEBENSDAUER_MS - (jetzt - f.zeit);
      this.alpha.setX(i, Math.max(0, Math.min(1, rest / AUSBLENDEN_MS)));
    });
    this.mesh.count = this.#flecken.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.alpha.needsUpdate = true;
  }

  /** Zonenwechsel/Neustart: alles weg */
  leeren() {
    this.#flecken.length = 0;
    this.mesh.count = 0;
  }
}

import * as THREE from 'three';

/**
 * Fußspuren: Spieler hinterlassen abwechselnd linke/rechte Abdrücke, die nach hinten auslaufen.
 * Pro Spieler nur die letzten SPUR_LAENGE Abdrücke (≈ 8–9 m Spur), ältere verblassen zusätzlich mit der Zeit.
 *
 * Alles in EINEM InstancedMesh (1 Draw-Call); die Deckkraft pro Abdruck kommt über ein Instanz-Attribut
 * in den Shader (onBeforeCompile).
 */
const SCHRITT = 17; // px zwischen zwei Abdrücken
const SEITE = 4.5; // px Versatz links/rechts von der Laufrichtung
const SPUR_LAENGE = 18; // Abdrücke pro Spieler (18 × 17 px ≈ 300 px ≈ 8,5 m bei 64 px ≈ 1,8 m)
const LEBENSDAUER_MS = 40000;
const MAX = 512;
const DECKKRAFT = 0.55;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);
const _y = new THREE.Vector3(0, 1, 0);

export class Fussspuren {
  #spieler = new Map(); // id → { x, y, weg, links, abdruecke: [{ x, y, winkel, zeit }] }
  #geaendert = false;
  #letzteAktualisierung = 0;

  constructor(szene) {
    // Schuhsohle: Ellipse, Ferse etwas schmaler
    const form = new THREE.Shape();
    form.ellipse(0, 0, 2.8, 5.2, 0, Math.PI * 2);
    const geometrie = new THREE.ShapeGeometry(form, 10).rotateX(-Math.PI / 2);
    this.alpha = new THREE.InstancedBufferAttribute(new Float32Array(MAX), 1);
    geometrie.setAttribute('aAlpha', this.alpha);
    const material = new THREE.MeshBasicMaterial({ color: 0x1b140d, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aAlpha;\nvarying float vAlpha;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAlpha = aAlpha;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vAlpha;')
        .replace('#include <opaque_fragment>', `diffuseColor.a *= vAlpha * ${DECKKRAFT.toFixed(2)};\n#include <opaque_fragment>`);
    };
    material.customProgramCacheKey = () => 'fussspuren';
    this.mesh = new THREE.InstancedMesh(geometrie, material, MAX);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    szene.add(this.mesh);
  }

  /** Pro Frame mit allen Entitäten (interpoliert) aufrufen. */
  aktualisiere(entitaeten, jetzt) {
    const gesehen = new Set();
    for (const e of entitaeten) {
      if (e.typ !== 'spieler') continue;
      gesehen.add(e.id);
      let s = this.#spieler.get(e.id);
      if (!s) {
        s = { x: e.x, y: e.y, weg: 0, links: false, abdruecke: [] };
        this.#spieler.set(e.id, s);
      }
      const dx = e.x - s.x;
      const dy = e.y - s.y;
      const strecke = Math.hypot(dx, dy);
      s.x = e.x;
      s.y = e.y;
      // Teleport/Respawn oder tot/schlafend → keine Spur dazwischen
      if (strecke > 60 || e.tot || e.arbeit === 'schlafen' || e.fahrzeug || e.fahrzeugId) {
        s.weg = 0;
        continue;
      }
      s.weg += strecke;
      if (s.weg < SCHRITT || strecke < 0.01) continue;
      s.weg = 0;
      s.links = !s.links;
      const winkel = Math.atan2(dy, dx);
      const seite = s.links ? -SEITE : SEITE;
      s.abdruecke.push({ x: e.x - Math.sin(winkel) * seite, y: e.y + Math.cos(winkel) * seite, winkel, zeit: jetzt });
      if (s.abdruecke.length > SPUR_LAENGE) s.abdruecke.shift();
      this.#geaendert = true;
    }
    for (const id of this.#spieler.keys()) if (!gesehen.has(id)) this.#spieler.delete(id);
    // Ausblenden braucht keine 60 Updates pro Sekunde
    if (this.#geaendert || jetzt - this.#letzteAktualisierung > 250) this.#schreibeInstanzen(jetzt);
  }

  #schreibeInstanzen(jetzt) {
    this.#geaendert = false;
    this.#letzteAktualisierung = jetzt;
    let i = 0;
    for (const s of this.#spieler.values()) {
      const n = s.abdruecke.length;
      for (let k = 0; k < n && i < MAX; k++) {
        const a = s.abdruecke[k];
        const zeitFaktor = 1 - (jetzt - a.zeit) / LEBENSDAUER_MS;
        if (zeitFaktor <= 0) continue;
        const spurFaktor = (k + 1) / n; // neueste (hinten im Array) = kräftig, älteste = blass
        _q.setFromAxisAngle(_y, Math.PI / 2 - a.winkel);
        _p.set(a.x, 0.35, a.y);
        this.mesh.setMatrixAt(i, _m.compose(_p, _q, _s));
        this.alpha.array[i] = Math.min(spurFaktor, zeitFaktor);
        i++;
      }
    }
    this.mesh.count = i;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.alpha.needsUpdate = true;
  }
}

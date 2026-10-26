import * as THREE from 'three';
import { KACHELN } from '../../gemeinsam/welt/kacheln.js';

/**
 * Reifenspuren (Runde 20): Autos ziehen auf weichem Boden (Gras, Schnee) zwei Spuren der Hinterräder hinter sich her.
 * Die Spur läuft nach hinten aus (höchstens SPUR_LAENGE Stücke je Rad) und verblasst nach LEBENSDAUER_MS.
 * Nur Optik (Client). Alles in EINEM InstancedMesh (1 Draw-Call), Deckkraft je Stück über ein Instanz-Attribut (wie fussspuren.js).
 */
const STUECK = 9; // px Fahrweg je Spurstück
const SPUR_LAENGE = 90; // Stücke je Rad (≈ 800 px ≈ 25 m)
const LEBENSDAUER_MS = 90000;
const MAX = 1400;
const BREITE = 5.5; // px Reifenbreite
const WEICH = new Set(['gras', 'schnee']);
const VERSCHNEIT = new Set(['asphalt', 'strasse', 'gehweg']);
const FARBE = { gras: new THREE.Color(0x2b2217), schnee: new THREE.Color(0x58606e) };
const DECKKRAFT = { gras: 0.45, schnee: 0.6 };

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _y = new THREE.Vector3(0, 1, 0);

export class Reifenspuren {
  #autos = new Map(); // id → { raeder: [{ x, y } | null, …], weg, stuecke: [{ x, y, winkel, laenge, zeit, boden }] }
  #geaendert = false;
  #letzteAktualisierung = 0;

  /** @param hoehe (x, y) → Geländehöhe in px */
  constructor(szene, hoehe = () => 0) {
    this.hoehe = hoehe;
    this.welt = null;
    const geometrie = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.alpha = new THREE.InstancedBufferAttribute(new Float32Array(MAX), 1);
    geometrie.setAttribute('aAlpha', this.alpha);
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aAlpha;\nvarying float vAlpha;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAlpha = aAlpha;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vAlpha;')
        .replace('#include <opaque_fragment>', 'diffuseColor.a *= vAlpha;\n#include <opaque_fragment>');
    };
    material.customProgramCacheKey = () => 'reifenspuren';
    this.mesh = new THREE.InstancedMesh(geometrie, material, MAX);
    this.mesh.setColorAt(0, FARBE.gras); // legt instanceColor an (feste Shader-Variante)
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    szene.add(this.mesh);
  }

  /** Neue Zone: alte Spuren weg */
  setzeWelt(welt) {
    this.welt = welt;
    this.#autos.clear();
    this.mesh.count = 0;
  }

  #boden(x, y) {
    const w = this.welt;
    if (!w) return null;
    const name = KACHELN[w.kachelAn(Math.floor(x / w.kachelGroesse), Math.floor(y / w.kachelGroesse))]?.name;
    if (w.schnee) return WEICH.has(name) || VERSCHNEIT.has(name) ? 'schnee' : null; // Schneezone: auch Straßen liegen unter Schnee
    return WEICH.has(name) ? name : null;
  }

  /** Pro Frame mit allen (interpolierten) Entitäten. */
  aktualisiere(entitaeten, jetzt) {
    for (const e of entitaeten) {
      if (e.typ !== 'fahrzeug' || e.kaputt) continue;
      let a = this.#autos.get(e.id);
      if (!a) {
        a = { x: e.x, y: e.y, weg: 0, raeder: [null, null], stuecke: [] };
        this.#autos.set(e.id, a);
      }
      const strecke = Math.hypot(e.x - a.x, e.y - a.y);
      a.x = e.x;
      a.y = e.y;
      a.zuletzt = jetzt;
      if (strecke > 80) {
        a.raeder = [null, null]; // Sprung (Zonenwechsel, Korrektur) → Spur unterbrechen
        continue;
      }
      a.weg += strecke;
      if (a.weg < STUECK) continue;
      a.weg = 0;
      const fx = Math.cos(e.winkel);
      const fy = Math.sin(e.winkel);
      const hinten = e.laenge * 0.32;
      const seite = e.breite / 2 - 3;
      for (let i = 0; i < 2; i++) {
        const s = i === 0 ? -seite : seite;
        const x = e.x - fx * hinten - fy * s;
        const y = e.y - fy * hinten + fx * s;
        const vorher = a.raeder[i];
        a.raeder[i] = { x, y };
        const boden = this.#boden(x, y);
        if (!vorher || !boden) continue;
        const dx = x - vorher.x;
        const dy = y - vorher.y;
        a.stuecke.push({ x: (x + vorher.x) / 2, y: (y + vorher.y) / 2, winkel: Math.atan2(dy, dx), laenge: Math.hypot(dx, dy) + 1, zeit: jetzt, boden });
        if (a.stuecke.length > SPUR_LAENGE * 2) a.stuecke.shift();
        this.#geaendert = true;
      }
    }
    if (this.#geaendert || jetzt - this.#letzteAktualisierung > 500) this.#schreibeInstanzen(jetzt);
  }

  #schreibeInstanzen(jetzt) {
    this.#geaendert = false;
    this.#letzteAktualisierung = jetzt;
    let i = 0;
    for (const [id, a] of this.#autos) {
      while (a.stuecke.length && jetzt - a.stuecke[0].zeit > LEBENSDAUER_MS) a.stuecke.shift();
      if (!a.stuecke.length && jetzt - (a.zuletzt ?? jetzt) > LEBENSDAUER_MS) this.#autos.delete(id);
      const n = a.stuecke.length;
      for (let k = 0; k < n && i < MAX; k++) {
        const st = a.stuecke[k];
        const zeitFaktor = 1 - (jetzt - st.zeit) / LEBENSDAUER_MS;
        const spurFaktor = Math.min(1, ((k + 1) / n) * 2.5); // ganz hinten läuft die Spur aus
        _q.setFromAxisAngle(_y, -st.winkel);
        _p.set(st.x, this.hoehe(st.x, st.y) + 0.3, st.y);
        _s.set(st.laenge, 1, BREITE);
        this.mesh.setMatrixAt(i, _m.compose(_p, _q, _s));
        this.mesh.setColorAt(i, FARBE[st.boden]);
        this.alpha.array[i] = Math.min(spurFaktor, zeitFaktor) * DECKKRAFT[st.boden];
        i++;
      }
    }
    this.mesh.count = i;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.alpha.needsUpdate = true;
  }
}

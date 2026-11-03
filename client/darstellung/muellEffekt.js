import * as THREE from 'three';
import { KACHELN } from '../../gemeinsam/welt/kacheln.js';

/**
 * Runde 29: Bei starkem Regen/Wind fliegt Müll (Papier, Plastik, Dosen-Blech) über die Straßen – man soll den Wind sehen.
 * Ein InstancedMesh mit festem Pool (wie blaetterEffekt.js), nur Optik. Start auf Straßenkacheln um die Kamera, die Teile fliegen
 * längs der Straße (Achse mit mehr Straße) und hüpfen dicht über den Boden; an Wänden ist Schluss. `staerke` 0..1 (Renderer) = Menge und Tempo.
 */
const POOL = 36;
const REICHWEITE = 620; // px um den Fokus
const STRASSEN = new Set(['strasse', 'asphalt', 'gehweg', 'pflaster']);
const FARBEN = [0xe8e4d8, 0xcfc9b8, 0xb9c4cf, 0x8fa3b5, 0xc9b48a, 0x9aa08e];

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);
const _farbe = new THREE.Color();

export class MuellEffekt {
  constructor(szene, welt) {
    this.szene = szene;
    this.welt = welt;
    const material = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(7, 5).rotateX(-Math.PI / 2), material, POOL);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.teile = Array.from({ length: POOL }, () => ({ aktiv: false }));
    this.warte = 0;
    szene.add(this.mesh);
  }

  entfernen() {
    this.szene.remove(this.mesh);
    this.mesh.dispose();
  }

  #kachel(x, z) {
    const g = this.welt.kachelGroesse;
    return KACHELN[this.welt.kachelAn(Math.floor(x / g), Math.floor(z / g))];
  }

  #istStrasse(x, z) {
    return STRASSEN.has(this.#kachel(x, z)?.name);
  }

  aktualisiere(dt, fokus, staerke = 0) {
    this.warte -= dt;
    if (staerke > 0.05 && this.warte <= 0) {
      this.warte = (0.12 + Math.random() * 0.3) / staerke;
      this.#neuesTeil(fokus, staerke);
    }
    let n = 0;
    for (const t of this.teile) {
      if (!t.aktiv) continue;
      t.x += t.vx * dt;
      t.z += t.vz * dt;
      t.phase += dt * t.tempo;
      const k = this.#kachel(t.x, t.z);
      if (!k || (k.blockiert && !k.sichtFrei) || k.innen || Math.abs(t.x - fokus.x) > REICHWEITE || Math.abs(t.z - fokus.y) > REICHWEITE) {
        t.aktiv = false;
        continue;
      }
      _p.set(t.x, 2.5 + Math.abs(Math.sin(t.phase * 0.7)) * t.hoehe, t.z);
      _e.set(t.phase * 1.7, t.phase * 0.9, t.phase * 1.2);
      this.mesh.setMatrixAt(n, _m.compose(_p, _q.setFromEuler(_e), _s));
      this.mesh.setColorAt(n, _farbe.setHex(t.farbe));
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  #neuesTeil(fokus, staerke) {
    const frei = this.teile.find((t) => !t.aktiv);
    if (!frei) return;
    for (let versuch = 0; versuch < 8; versuch++) {
      const x = fokus.x + (Math.random() - 0.5) * 900;
      const z = fokus.y + (Math.random() - 0.5) * 760;
      if (!this.#istStrasse(x, z)) continue;
      const g = this.welt.kachelGroesse;
      let laengsX = 0;
      let laengsZ = 0;
      for (let i = 1; i <= 5; i++) {
        for (const s of [-1, 1]) {
          if (this.#istStrasse(x + s * i * g, z)) laengsX++;
          if (this.#istStrasse(x, z + s * i * g)) laengsZ++;
        }
      }
      const tempo = 170 + Math.random() * 120 + 240 * staerke;
      const quer = (Math.random() - 0.5) * 70;
      const ueberX = laengsX >= laengsZ;
      Object.assign(frei, { aktiv: true, x, z, vx: ueberX ? tempo : quer, vz: ueberX ? quer : tempo, phase: Math.random() * 6.28, tempo: 5 + Math.random() * 7, hoehe: 5 + Math.random() * 22 * staerke, farbe: FARBEN[(Math.random() * FARBEN.length) | 0] });
      return;
    }
  }
}

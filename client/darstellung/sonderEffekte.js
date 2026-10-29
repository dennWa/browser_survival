import * as THREE from 'three';

/**
 * Runde 24: 3D-Darstellung für Sonder-Zombie-Effekte (Daten aus effekte.js `spucken` / `explosionen`):
 *   Spucke    – grünlich leuchtende Kugel im Bogen vom Spucker zum Zielpunkt (Pool, max. MAX_SPUCKE).
 *   Explosion – Feuerball (wächst, wird dunkler, verblasst) + Rauchring; Licht kommt über die Mündungslichter (effekte.feuer).
 * `wackeln` (0..1) = Kamerawackeln der letzten Explosion in der Nähe (Renderer liest es).
 */
const MAX_SPUCKE = 12;
const MAX_EXPLOSIONEN = 6;
const BOGEN_HOEHE = 70;

export class SonderEffekte {
  constructor(szene) {
    this.wackeln = 0;
    const kugel = new THREE.SphereGeometry(5, 10, 8);
    const spuckMaterial = new THREE.MeshStandardMaterial({ color: 0x9be04a, emissive: 0x5aa020, emissiveIntensity: 1.2, roughness: 0.3 });
    this.spucke = Array.from({ length: MAX_SPUCKE }, () => {
      const m = new THREE.Mesh(kugel, spuckMaterial);
      m.visible = false;
      szene.add(m);
      return m;
    });
    const ball = new THREE.SphereGeometry(1, 16, 12);
    this.baelle = Array.from({ length: MAX_EXPLOSIONEN }, () => {
      const feuer = new THREE.Mesh(ball, new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, depthWrite: false }));
      const rauch = new THREE.Mesh(ball, new THREE.MeshStandardMaterial({ color: 0x3a3532, transparent: true, depthWrite: false, roughness: 1 }));
      feuer.visible = rauch.visible = false;
      szene.add(feuer, rauch);
      return { feuer, rauch };
    });
    this.gesehen = new WeakSet();
    const schaft = new THREE.CylinderGeometry(0.5, 0.5, 22, 5);
    schaft.rotateZ(Math.PI / 2);
    const pfeilMaterial = new THREE.MeshStandardMaterial({ color: 0xb98a55, roughness: 0.7 });
    this.pfeile = Array.from({ length: MAX_SPUCKE }, () => {
      const m = new THREE.Mesh(schaft, pfeilMaterial);
      m.visible = false;
      szene.add(m);
      return m;
    });
  }

  /** Runde 24: Pfeile/Bolzen im Flug (effekte.pfeile) */
  pfeileZeigen(pfeile, hy) {
    this.pfeile.forEach((m, i) => {
      const p = pfeile[i];
      m.visible = !!p;
      if (!p) return;
      const t = Math.min(1, p.alter / p.dauer);
      const x = p.x + (p.zx - p.x) * t;
      const y = p.y + (p.zy - p.y) * t;
      m.position.set(x, 34 + hy(x, y), y);
      m.rotation.set(0, -p.winkel, 0);
    });
  }

  /** @param fokus { x, y } – für das Wackeln (nahe Explosionen wackeln stärker) */
  aktualisiere(spucken, explosionen, hy, fokus = null) {
    this.spucke.forEach((m, i) => {
      const s = spucken[i];
      m.visible = !!s;
      if (!s) return;
      const t = Math.min(1, s.alter / s.dauer);
      const x = s.x + (s.zx - s.x) * t;
      const y = s.y + (s.zy - s.y) * t;
      m.position.set(x, 30 * (1 - t) + 4 + Math.sin(t * Math.PI) * BOGEN_HOEHE + hy(x, y), y);
    });
    this.wackeln = Math.max(0, this.wackeln * 0.9 - 0.004);
    this.baelle.forEach(({ feuer, rauch }, i) => {
      const e = explosionen[i];
      feuer.visible = rauch.visible = !!e;
      if (!e) return;
      if (!this.gesehen.has(e)) {
        this.gesehen.add(e);
        const d = fokus ? Math.hypot(e.x - fokus.x, e.y - fokus.y) : 0;
        this.wackeln = Math.max(this.wackeln, Math.max(0, 1 - d / 700));
      }
      const t = e.alter / e.dauer;
      const boden = hy(e.x, e.y);
      const r = e.radius * (0.25 + 0.55 * Math.min(1, t * 3));
      feuer.scale.setScalar(r * (1 - t * 0.3));
      feuer.position.set(e.x, boden + r * 0.5, e.y);
      feuer.material.opacity = Math.max(0, 1 - t * 2.2);
      feuer.material.color.setHSL(0.08 - t * 0.06, 1, 0.6 - t * 0.3);
      rauch.scale.setScalar(e.radius * (0.3 + t * 0.9));
      rauch.position.set(e.x, boden + 10 + t * 70, e.y);
      rauch.material.opacity = Math.max(0, 0.75 * Math.min(1, t * 4) * (1 - t));
    });
  }
}

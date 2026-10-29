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
    this.szene = szene;
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

  /** Runde 24: geworfene Rohrbomben/Molotows (Bogen) und brennende Flächen (zuckende Flammenkegel) */
  wuerfeUndBraende(wuerfe, braende, hy, jetzt) {
    this.wurfMeshes ??= Array.from({ length: 8 }, () => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 7, 8), new THREE.MeshStandardMaterial({ color: 0x55603f, roughness: 0.5 }));
      m.visible = false;
      m.castShadow = true;
      this.szene.add(m);
      return m;
    });
    this.wurfMeshes.forEach((m, i) => {
      const w = wuerfe[i];
      m.visible = !!w;
      if (!w) return;
      const t = Math.min(1, w.alter / w.dauer);
      const x = w.x + (w.zx - w.x) * t;
      const y = w.y + (w.zy - w.y) * t;
      m.material.color.setHex(w.art === 'molotow' ? 0x6aa04a : 0x55603f);
      m.position.set(x, 34 * (1 - t) + 4 + Math.sin(t * Math.PI) * 90 + hy(x, y), y);
      m.rotation.set(t * 14, 0, t * 9);
    });
    this.brandGruppen ??= [];
    while (this.brandGruppen.length < braende.length && this.brandGruppen.length < 6) {
      const gruppe = new THREE.Group();
      const flamme = new THREE.ConeGeometry(5, 18, 6).translate(0, 9, 0);
      for (let i = 0; i < 14; i++) {
        const m = new THREE.Mesh(flamme, new THREE.MeshBasicMaterial({ color: i % 3 ? 0xff7a1a : 0xffd070, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
        m.userData.w = Math.random() * Math.PI * 2;
        m.userData.r = Math.sqrt(Math.random());
        gruppe.add(m);
      }
      this.szene.add(gruppe);
      this.brandGruppen.push(gruppe);
    }
    this.brandGruppen.forEach((gruppe, i) => {
      const b = braende[i];
      gruppe.visible = !!b;
      if (!b) return;
      gruppe.position.set(b.x, hy(b.x, b.y), b.y);
      const rest = 1 - b.alter / b.dauer;
      gruppe.children.forEach((m, k) => {
        const t = jetzt / 1000 + k * 0.77;
        m.position.set(Math.cos(m.userData.w) * m.userData.r * b.radius * 0.85, 0, Math.sin(m.userData.w) * m.userData.r * b.radius * 0.85);
        m.scale.set(1, (0.6 + 0.5 * Math.abs(Math.sin(t * 7.3)) + 0.2 * Math.sin(t * 17)) * Math.min(1, rest * 3), 1);
        m.material.opacity = 0.75 * Math.min(1, rest * 3);
      });
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

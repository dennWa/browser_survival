import * as THREE from 'three';

/**
 * Wetter (Darstellung): Regen = fallende Striche rund um den Spieler, Nebel = dichterer Nebel + graue Stimmung.
 * Der Server schickt nur die Art ('klar' | 'regen' | 'nebel', ZUSTAND.wetter); hier blenden sich die Werte weich
 * über (regen/nebel 0..1 → Renderer: Nebelweite, Lichtstärke, Himmelsfarbe, Regen-Ton).
 */
const TROPFEN = 900;
const RADIUS = 760; // px um den Fokus, in denen es regnet (Kamera sieht ~±900 px)
const HOEHE = 520;
const LAENGE = 15;
const BLENDE_PRO_SEKUNDE = 0.35;

export class WetterEffekt {
  constructor(szene) {
    this.art = 'klar';
    this.regen = 0;
    this.nebel = 0;
    const positionen = new Float32Array(TROPFEN * 6);
    this.tropfen = Array.from({ length: TROPFEN }, () => ({ x: (Math.random() * 2 - 1) * RADIUS, z: (Math.random() * 2 - 1) * RADIUS, y: Math.random() * HOEHE, v: 620 + Math.random() * 380 }));
    this.geo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(positionen, 3));
    this.material = new THREE.LineBasicMaterial({ color: 0xb4c8e4, transparent: true, opacity: 0, depthWrite: false, fog: false });
    this.linien = new THREE.LineSegments(this.geo, this.material);
    this.linien.frustumCulled = false;
    this.linien.visible = false;
    this.linien.renderOrder = 5;
    szene.add(this.linien);
  }

  setzeArt(art) {
    this.art = art === 'regen' || art === 'nebel' ? art : 'klar';
  }

  /** Stärke des Wetters für Ton & Licht (0 = klar … 1 = voll). */
  get stimmung() {
    return Math.max(this.regen, this.nebel);
  }

  aktualisiere(dt, fokusX, fokusY) {
    const zielRegen = this.art === 'regen' ? 1 : 0;
    const zielNebel = this.art === 'nebel' ? 1 : this.art === 'regen' ? 0.3 : 0;
    const schritt = BLENDE_PRO_SEKUNDE * dt;
    this.regen += Math.max(-schritt, Math.min(schritt, zielRegen - this.regen));
    this.nebel += Math.max(-schritt, Math.min(schritt, zielNebel - this.nebel));
    const sichtbar = this.regen > 0.01;
    this.linien.visible = sichtbar;
    if (!sichtbar) return;
    this.material.opacity = 0.5 * this.regen;
    const p = this.geo.attributes.position;
    const anzahl = Math.floor(TROPFEN * Math.min(1, this.regen + 0.1));
    for (let i = 0; i < TROPFEN; i++) {
      const t = this.tropfen[i];
      if (i >= anzahl) {
        p.setXYZ(i * 2, 0, -1000, 0);
        p.setXYZ(i * 2 + 1, 0, -1000, 0);
        continue;
      }
      t.y -= t.v * dt;
      if (t.y < 0) {
        t.y += HOEHE;
        t.x = (Math.random() * 2 - 1) * RADIUS;
        t.z = (Math.random() * 2 - 1) * RADIUS;
      }
      const x = fokusX + t.x;
      const z = fokusY + t.z;
      p.setXYZ(i * 2, x, t.y, z);
      p.setXYZ(i * 2 + 1, x - 2, t.y + LAENGE, z - 1);
    }
    p.needsUpdate = true;
  }
}

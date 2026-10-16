import * as THREE from 'three';

/**
 * Fallende Blätter: Bäume in der Nähe der Kamera lassen ab und zu ein Blatt los, das sich langsam drehend und
 * hin und her schwingend zu Boden senkt (grün bei normalen Bäumen, orange/rot bei Herbstbäumen).
 * Ein InstancedMesh mit festem Pool – kostet keine Lichter/Shader-Wechsel und läuft auch auf Handys.
 * Nur Optik, keine Spiellogik. Gefällte Bäume (welt.istRessourceDa) lassen nichts mehr fallen.
 */
const POOL = 40;
const REICHWEITE = 520; // px um den Fokus, in denen Bäume Blätter verlieren
const FALL_TEMPO = 15; // px/s
const BODEN = 0.6;
const GRUEN = [0x6fae3a, 0x84be45, 0x5a9a30, 0x9ac24e];
const HERBST = [0xd9822b, 0xc2552a, 0xe0a63a, 0xa8421f];

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);
const _farbe = new THREE.Color();

export class BlaetterEffekt {
  /** @param welt Welt (gemeinsam/welt/welt.js) – die Baum-Ressourcen liefern die Startpunkte */
  constructor(szene, welt) {
    this.szene = szene;
    this.welt = welt;
    this.baeume = welt.ressourcen.filter((r) => r.typ === 'baum' || r.typ === 'baum_herbst');
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, transparent: true, opacity: 0.92, depthWrite: false });
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(4.6, 3.2).rotateX(-Math.PI / 2), material, POOL);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.blaetter = Array.from({ length: POOL }, () => ({ aktiv: false }));
    this.warte = 0;
    szene.add(this.mesh);
  }

  entfernen() {
    this.szene.remove(this.mesh);
    this.mesh.dispose();
  }

  /** @param dunkel 0 (Tag) .. 1 (Nacht): nachts sind Blätter kaum zu sehen */
  aktualisiere(dt, fokus, jetzt, dunkel = 0) {
    if (this.baeume.length === 0) return;
    this.mesh.material.opacity = 0.92 * (1 - dunkel * 0.6);
    this.warte -= dt;
    if (this.warte <= 0) {
      this.warte = 0.12 + Math.random() * 0.25;
      this.#neuesBlatt(fokus);
    }
    let n = 0;
    for (let i = 0; i < POOL; i++) {
      const b = this.blaetter[i];
      if (!b.aktiv) continue;
      b.y -= FALL_TEMPO * dt * (0.8 + 0.4 * Math.sin(b.phase * 0.7));
      b.phase += dt * b.tempo;
      b.x += Math.cos(b.phase) * 14 * dt + b.wind * dt;
      b.z += Math.sin(b.phase * 0.8) * 10 * dt;
      if (b.y <= BODEN) {
        b.aktiv = false;
        continue;
      }
      _p.set(b.x, b.y, b.z);
      _e.set(Math.sin(b.phase) * 0.9, b.phase * 0.6, Math.cos(b.phase * 1.3) * 0.9);
      _q.setFromEuler(_e);
      this.mesh.setMatrixAt(n, _m.compose(_p, _q, _s));
      this.mesh.setColorAt(n, _farbe.setHex(b.farbe));
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  #neuesBlatt(fokus) {
    const frei = this.blaetter.find((b) => !b.aktiv);
    if (!frei) return;
    // Zufälligen Baum in Reichweite wählen (ein paar Versuche reichen, die Liste ist nach Karte sortiert, nicht nach Nähe)
    for (let versuch = 0; versuch < 12; versuch++) {
      const baum = this.baeume[(Math.random() * this.baeume.length) | 0];
      if (Math.abs(baum.x - fokus.x) > REICHWEITE || Math.abs(baum.y - fokus.y) > REICHWEITE) continue;
      if (!this.welt.istRessourceDa(baum.id)) continue;
      const farben = baum.typ === 'baum_herbst' ? HERBST : GRUEN;
      Object.assign(frei, {
        aktiv: true,
        x: baum.x + (Math.random() - 0.5) * 44,
        y: 62 + Math.random() * 34,
        z: baum.y + (Math.random() - 0.5) * 44,
        phase: Math.random() * 6.28,
        tempo: 1.4 + Math.random() * 1.6,
        wind: 3 + Math.random() * 5,
        farbe: farben[(Math.random() * farben.length) | 0],
      });
      return;
    }
  }
}

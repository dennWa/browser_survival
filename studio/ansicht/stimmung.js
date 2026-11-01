import * as THREE from 'three';

/**
 * Tageszeit- und Wetter-Vorschau der Studio-Ansicht (nur Optik, ändert die Karte nicht):
 *   tageszeit  tag | abend | nacht   → Himmel-/Sonnenlicht, Hintergrund; nachts leuchten die Lampen der Zone (Punktlicht-Pool
 *                                       an den nächsten Lampen zur Kamera, wie im Spiel nur eine begrenzte Zahl)
 *   wetter     klar | nebel | regen | schnee → Nebelweite, Teilchen um die Kamera (laufen nur, solange sichtbar)
 * Lampen kommen aus der Karte (Objekte typ 'licht': radius, farbe, staerke, mast) – passt zu Platzhaltern UND Spiel-Optik.
 */
const LICHTER = 12;
const ZEITEN = {
  tag: { himmel: [0xe3ecff, 0x40362a, 1.35], sonne: [0xfff4e0, 1.7], hg: 0x14171c, dunkel: 0 },
  abend: { himmel: [0xffc89a, 0x3a2a30, 0.8], sonne: [0xff9a5a, 1.0], hg: 0x2a1f24, dunkel: 0.45 },
  nacht: { himmel: [0x5a6fa8, 0x10121a, 0.28], sonne: [0x8fa6ff, 0.18], hg: 0x07090f, dunkel: 0.9 },
};

export class Stimmung {
  constructor(viewport) {
    this.v = viewport;
    this.tageszeit = 'tag';
    this.wetter = 'klar';
    this.lichter = Array.from({ length: LICHTER }, () => {
      const l = new THREE.PointLight(0xffd9a0, 0, 10, 1.6);
      l.visible = false;
      viewport.szene.add(l);
      return l;
    });
    this.teilchen = null;
    viewport.vorBild = () => this.#vorBild();
  }

  setze({ tageszeit = this.tageszeit, wetter = this.wetter } = {}) {
    this.tageszeit = tageszeit;
    this.wetter = wetter;
    const z = ZEITEN[tageszeit];
    const v = this.v;
    v.himmel.color.setHex(z.himmel[0]);
    v.himmel.groundColor.setHex(z.himmel[1]);
    v.himmel.intensity = z.himmel[2] * (wetter === 'klar' ? 1 : 0.8);
    v.sonne.color.setHex(z.sonne[0]);
    v.sonne.intensity = z.sonne[1] * (wetter === 'klar' ? 1 : wetter === 'nebel' ? 0.45 : 0.6);
    const hg = new THREE.Color(z.hg);
    if (wetter !== 'klar') hg.lerp(new THREE.Color(wetter === 'schnee' ? 0x9aa4b0 : 0x55606c), tageszeit === 'nacht' ? 0.12 : 0.45);
    v.szene.background = hg;
    v.szene.fog.color.copy(hg);
    v.nebelFaktor = wetter === 'nebel' ? 0.22 : wetter === 'klar' ? 1 : 0.55;
    v.dunkel = z.dunkel;
    v.spielOptik?.aktualisiere(z.dunkel);
    this.#teilchen(wetter === 'regen' || wetter === 'schnee' ? wetter : null);
    v.anfordern();
  }

  #teilchen(art) {
    if (this.teilchen) {
      this.v.szene.remove(this.teilchen.punkte);
      this.teilchen.punkte.geometry.dispose();
      this.teilchen = null;
    }
    if (!art) return;
    const n = art === 'regen' ? 5000 : 3000;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n * 3; i++) pos[i] = Math.random();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const punkte = new THREE.Points(geo, new THREE.PointsMaterial({ color: art === 'regen' ? 0x9fc4ff : 0xffffff, size: art === 'regen' ? 0.06 : 0.14, transparent: true, opacity: art === 'regen' ? 0.55 : 0.9, depthWrite: false }));
    punkte.frustumCulled = false;
    this.v.szene.add(punkte);
    this.teilchen = { art, punkte, basis: pos.slice(), zeit: performance.now() };
    const schleife = () => {
      if (!this.teilchen || this.teilchen.punkte !== punkte) return;
      this.v.anfordern();
      requestAnimationFrame(schleife);
    };
    requestAnimationFrame(schleife);
  }

  #vorBild() {
    const v = this.v;
    // Teilchen: Würfel um das Kamera-Ziel, fallen und wiederholen sich
    if (this.teilchen) {
      const { punkte, basis, art } = this.teilchen;
      const t = (performance.now() - this.teilchen.zeit) / 1000;
      const groesse = Math.min(120, Math.max(30, v.abstand * 1.4));
      const hoehe = 30;
      const a = punkte.geometry.attributes.position;
      const fall = art === 'regen' ? 18 : 2.2;
      for (let i = 0; i < a.count; i++) {
        const bx = basis[i * 3];
        const by = basis[i * 3 + 1];
        const bz = basis[i * 3 + 2];
        const y = (((by * hoehe - t * fall * (0.8 + bx * 0.4)) % hoehe) + hoehe) % hoehe;
        const drift = art === 'schnee' ? Math.sin(t * 0.8 + by * 20) * 0.6 : t * 1.2;
        a.setXYZ(i, v.ziel.x + (bx - 0.5) * groesse + drift, v.ziel.y + y, v.ziel.z + (bz - 0.5) * groesse);
      }
      a.needsUpdate = true;
    }
    // Nachtlicht: nächste Lampen zur Kamera
    const k = v.karte;
    const an = v.dunkel > 0.1 && k;
    if (!an) {
      for (const l of this.lichter) l.visible = false;
      return;
    }
    const lampen = [];
    for (const o of k.s('objekte').values()) {
      if (o.typ !== 'licht') continue;
      const x = o.x + 0.5;
      const z = o.y + 0.5;
      lampen.push({ x, z, d: (x - v.ziel.x) ** 2 + (z - v.ziel.z) ** 2, o });
    }
    lampen.sort((p, q) => p.d - q.d);
    this.lichter.forEach((l, i) => {
      const e = lampen[i];
      l.visible = !!e;
      if (!e) return;
      l.color.set(e.o.farbe ?? '#ffd9a0');
      l.distance = (e.o.radius ?? 4) * 2.2 * (e.o.mast ? 1.6 : 1);
      l.intensity = (e.o.staerke ?? 0.85) * v.dunkel * (e.o.mast ? 9 : 5);
      l.position.set(e.x, v.hoeheBei(e.x, e.z) + (e.o.mast ? 3.6 : 1.6), e.z);
    });
  }
}

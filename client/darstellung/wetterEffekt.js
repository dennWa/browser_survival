import * as THREE from 'three';

/**
 * Wetter (Darstellung): Regen = fallende Striche rund um den Spieler, Nebel = dichterer Nebel + graue Stimmung.
 * Der Server schickt nur die Art ('klar' | 'regen' | 'nebel', ZUSTAND.wetter); hier blenden sich die Werte weich
 * über (regen/nebel 0..1 → Renderer: Nebelweite, Lichtstärke, Himmelsfarbe, Regen-Ton).
 */
const TROPFEN = 650;
const RADIUS = 760; // px um den Fokus, in denen es regnet (Kamera sieht ~±900 px)
const HOEHE = 520;
const LAENGE = 15;
const BLENDE_PRO_SEKUNDE = 0.35;

// Der Regen fällt komplett auf der Grafikkarte (Position aus Zeit + Zufallswerten): kein Puffer-Upload, keine Schleife pro Frame.
const VERTEX = `
  attribute vec4 tropfen; // x, z (Versatz), y0 (Starthöhe), v (Fallgeschwindigkeit)
  attribute float ende;   // 0 = Tropfenfuß, 1 = Tropfenkopf
  uniform vec3 uFokus;
  uniform float uZeit;
  uniform float uAnteil;
  void main() {
    float y = mod(tropfen.z - uZeit * tropfen.w, ${HOEHE.toFixed(1)});
    vec3 p = vec3(uFokus.x + tropfen.x, y, uFokus.z + tropfen.y) + ende * vec3(-2.0, ${LAENGE.toFixed(1)}, -1.0);
    // Anteil: Bei leichtem Regen werden Tropfen mit hoher Kennung weggeklappt
    if (fract(tropfen.z * 0.01731 + tropfen.x * 0.00317) > uAnteil) p.y = -1000.0;
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }`;
const FRAGMENT = `
  uniform float uDeckkraft;
  void main() { gl_FragColor = vec4(0.706, 0.784, 0.894, uDeckkraft); }`;

export class WetterEffekt {
  constructor(szene) {
    this.art = 'klar';
    this.regen = 0;
    this.nebel = 0;
    this.zeit = 0;
    const tropfen = new Float32Array(TROPFEN * 2 * 4);
    const ende = new Float32Array(TROPFEN * 2);
    const position = new Float32Array(TROPFEN * 2 * 3); // wird nie genutzt, three.js braucht das Attribut für die Zählung
    for (let i = 0; i < TROPFEN; i++) {
      const werte = [(Math.random() * 2 - 1) * RADIUS, (Math.random() * 2 - 1) * RADIUS, Math.random() * HOEHE, 620 + Math.random() * 380];
      tropfen.set(werte, i * 8);
      tropfen.set(werte, i * 8 + 4);
      ende[i * 2 + 1] = 1;
    }
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(position, 3));
    this.geo.setAttribute('tropfen', new THREE.BufferAttribute(tropfen, 4));
    this.geo.setAttribute('ende', new THREE.BufferAttribute(ende, 1));
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: { uFokus: { value: new THREE.Vector3() }, uZeit: { value: 0 }, uAnteil: { value: 1 }, uDeckkraft: { value: 0 } },
      transparent: true,
      depthWrite: false,
    });
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
    this.zeit += dt;
    const u = this.material.uniforms;
    u.uZeit.value = this.zeit;
    u.uFokus.value.set(fokusX, 0, fokusY);
    u.uAnteil.value = Math.min(1, this.regen + 0.1);
    u.uDeckkraft.value = 0.5 * this.regen;
  }
}

import * as THREE from 'three';

/**
 * Wetter (Darstellung): Regen = fallende Striche rund um den Spieler, Schnee = langsam taumelnde Flocken (nur Schneezonen,
 * lautlos), Nebel = dichterer Nebel + graue Stimmung.
 * Der Server schickt nur die Art ('klar' | 'regen' | 'gewitter' | 'sturm' | 'nebel' | 'schnee' | 'schneesturm', ZUSTAND.wetter);
 * hier blenden sich die Werte weich über (regen/nebel/schnee/sturm/gewitter 0..1 → Renderer: Nebelweite, Lichtstärke,
 * Himmelsfarbe, Ton). Runde 23: Gewitter = dichter, schräger Regen + Blitze (`blitz` 0..1, Haken `beiBlitz(staerke, nah)` →
 * Donner im clientSpiel), Sturm = starker Wind (Bäume, schräger Niederschlag), Schneesturm = dichter, waagerecht treibender Schnee.
 * Runde 24: `grundWind` (0..1, Server ZUSTAND.wind) + Böen-Kurve `boe` → `windStufe` (0..3). Dieselbe Stufe steuert
 * Bäume/Gras (BAUM_WIND), Blätter und den Windton (clientSpiel #atmosphaereSchichten) – man hört die Böe, wenn sich die Bäume biegen.
 * Runde 25: Innen-Maske (`setzeInnenMaske(welt)`, DataTexture 1 Texel/Kachel) – kein Regen/Schnee über Innenräumen und Dächern;
 * steht der Spieler drinnen (`aktualisiere(…, drinnen)`), blendet der Niederschlag ganz aus (Ton/Licht bleiben).
 * Runde 26: aktualisiere repariert NaN-Zustände und ignoriert negatives/NaN-dt.
 */
const TROPFEN = 1200; // bei normalem Regen nur ~55 % sichtbar (uAnteil), bei Gewitter alle
const RADIUS = 760; // px um den Fokus, in denen es regnet (Kamera sieht ~±900 px)
const HOEHE = 520;
const LAENGE = 15;
const BLENDE_PRO_SEKUNDE = 0.35;
const FLOCKEN = 1700; // normaler Schneefall ~50 %, Schneesturm alle
const FLOCKEN_HOEHE = 480;

// Runde 25: Innen-Maske (1 Texel je Kachel, rot 1 = drinnen) – über Innenräumen/Dächern fällt kein Regen/Schnee,
// sonst regnet es im Haus vor der Kamera. Draußen sieht man ihn weiter durch Türen und Fenster.
const MASKE = `
  uniform sampler2D uMaske;
  uniform vec2 uKartenPx; // Kartengröße in px (0 = keine Maske)
  float drinnen(vec2 xz) {
    if (uKartenPx.x <= 0.0) return 0.0;
    vec2 uv = xz / uKartenPx;
    if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 0.0;
    return step(0.5, texture2D(uMaske, uv).r);
  }`;

// Der Regen fällt komplett auf der Grafikkarte (Position aus Zeit + Zufallswerten): kein Puffer-Upload, keine Schleife pro Frame.
const VERTEX = `
  attribute vec4 tropfen; // x, z (Versatz), y0 (Starthöhe), v (Fallgeschwindigkeit)
  attribute float ende;   // 0 = Tropfenfuß, 1 = Tropfenkopf
  uniform vec3 uFokus;
  uniform float uZeit;
  uniform float uAnteil;
  uniform float uWind; // seitliche Neigung (Sturm/Gewitter)
  ${MASKE}
  void main() {
    float y = mod(tropfen.z - uZeit * tropfen.w, ${HOEHE.toFixed(1)});
    float schraeg = (${HOEHE.toFixed(1)} - y) * uWind * 0.45;
    vec3 fuss = vec3(uFokus.x + tropfen.x + schraeg, y, uFokus.z + tropfen.y);
    vec3 p = fuss + ende * vec3(-2.0 - uWind * ${(LAENGE * 0.45).toFixed(1)}, ${LAENGE.toFixed(1)}, -1.0);
    // Anteil: Bei leichtem Regen werden Tropfen mit hoher Kennung weggeklappt; über Innenräumen gar keine
    if (fract(tropfen.z * 0.01731 + tropfen.x * 0.00317) > uAnteil || drinnen(fuss.xz) > 0.5) p.y = -1000.0;
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }`;
const FRAGMENT = `
  uniform float uDeckkraft;
  void main() { gl_FragColor = vec4(0.706, 0.784, 0.894, uDeckkraft); }`;

// Schnee: ebenfalls komplett auf der Grafikkarte. Flocke = Punktsprite, fällt langsam (60–110 px/s) und schwankt seitlich.
const SCHNEE_VERTEX = `
  attribute vec4 flocke; // x, z (Versatz), y0 (Starthöhe), v (Fallgeschwindigkeit)
  attribute float groesse;
  uniform vec3 uFokus;
  uniform float uZeit;
  uniform float uAnteil;
  uniform float uSkala;
  uniform float uWind; // Schneesturm: Flocken treiben fast waagerecht
  varying float vAlpha;
  ${MASKE}
  void main() {
    float y = mod(flocke.z - uZeit * flocke.w * (1.0 + uWind * 0.8), ${FLOCKEN_HOEHE.toFixed(1)});
    float phase = flocke.x * 0.037 + flocke.y * 0.021;
    // Weltfest: Flocken liegen auf einem Gitter, das mit dem Fokus mitwandert (Spieler läuft durch den Schnee, nicht mit ihm)
    float bx = uFokus.x + mod(flocke.x - uFokus.x + ${RADIUS.toFixed(1)}, ${(RADIUS * 2).toFixed(1)}) - ${RADIUS.toFixed(1)};
    float bz = uFokus.z + mod(flocke.y - uFokus.z + ${RADIUS.toFixed(1)}, ${(RADIUS * 2).toFixed(1)}) - ${RADIUS.toFixed(1)};
    float drift = mod((${FLOCKEN_HOEHE.toFixed(1)} - y) * uWind * 2.2 + ${RADIUS.toFixed(1)}, ${(RADIUS * 2).toFixed(1)}) - ${RADIUS.toFixed(1)};
    vec3 p = vec3(bx + sin(uZeit * 0.8 + phase) * 22.0 + drift * step(0.01, uWind), y, bz + cos(uZeit * 0.6 + phase * 1.7) * 16.0);
    // Anteil: bei leichtem Schneefall bleiben Flocken mit hoher Kennung weg
    vAlpha = fract(flocke.z * 0.01731 + flocke.x * 0.00317) > uAnteil || drinnen(p.xz) > 0.5 ? 0.0 : 1.0;
    vec4 mv = viewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = groesse * uSkala * clamp(780.0 / max(-mv.z, 1.0), 0.5, 1.4);
  }`;
const SCHNEE_FRAGMENT = `
  uniform float uDeckkraft;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0 || vAlpha < 0.5) discard;
    gl_FragColor = vec4(0.97, 0.985, 1.0, uDeckkraft * (1.0 - d * d));
  }`;

export class WetterEffekt {
  constructor(szene) {
    this.art = 'klar';
    this.regen = 0;
    this.nebel = 0;
    this.schnee = 0;
    this.zeit = 0;
    this.schneeZeit = 0;
    this.windZeit = 0;
    this.windStufe = 1; // 0 windstill … 3 stark (fließend), steuert das Baum-Schwanken und den Windton
    this.grundWind = 0.35; // 0..1 vom Server (ZUSTAND.wind)
    this.boe = 0; // 0..1 aktuelle Böe (für Ton und Blätter)
    this.sturm = 0; // 0..1 Sturmstärke (Sturm, Gewitter, Schneesturm)
    this.gewitter = 0; // 0..1
    this.blitz = 0; // 0..1 aktuelle Helligkeit eines Blitzes (Renderer hellt Licht/Himmel auf)
    this.naechsterBlitz = 4;
    this.blitzFolge = []; // Zeitpunkte (s) der Nachblitze
    /** Haken: (staerke 0..1, nah true/false) bei jedem Blitz – clientSpiel spielt den Donner (verzögert) */
    this.beiBlitz = null;
    // Innen-Maske (setzeInnenMaske): von Regen- und Schnee-Shader geteilt
    this.maske = { uMaske: { value: null }, uKartenPx: { value: new THREE.Vector2(0, 0) } };
    this.maskeVersion = null;
    this.aussen = 1; // 1 = Spieler draußen, 0 = drinnen (weich überblendet)
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
      uniforms: { uFokus: { value: new THREE.Vector3() }, uZeit: { value: 0 }, uAnteil: { value: 1 }, uDeckkraft: { value: 0 }, uWind: { value: 0 }, ...this.maske },
      transparent: true,
      depthWrite: false,
    });
    this.linien = new THREE.LineSegments(this.geo, this.material);
    this.linien.frustumCulled = false;
    this.linien.visible = false;
    this.linien.renderOrder = 5;
    szene.add(this.linien);

    const flocken = new Float32Array(FLOCKEN * 4);
    const groessen = new Float32Array(FLOCKEN);
    for (let i = 0; i < FLOCKEN; i++) {
      flocken.set([(Math.random() * 2 - 1) * RADIUS, (Math.random() * 2 - 1) * RADIUS, Math.random() * FLOCKEN_HOEHE, 55 + Math.random() * 55], i * 4);
      groessen[i] = 2 + Math.random() * 3;
    }
    this.schneeGeo = new THREE.BufferGeometry();
    this.schneeGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(FLOCKEN * 3), 3)); // wird nie genutzt (Zählung)
    this.schneeGeo.setAttribute('flocke', new THREE.BufferAttribute(flocken, 4));
    this.schneeGeo.setAttribute('groesse', new THREE.BufferAttribute(groessen, 1));
    this.schneeMaterial = new THREE.ShaderMaterial({
      vertexShader: SCHNEE_VERTEX,
      fragmentShader: SCHNEE_FRAGMENT,
      uniforms: { uFokus: { value: new THREE.Vector3() }, uZeit: { value: 0 }, uAnteil: { value: 1 }, uSkala: { value: Math.min(2, globalThis.devicePixelRatio || 1) }, uDeckkraft: { value: 0 }, uWind: { value: 0 }, ...this.maske },
      transparent: true,
      depthWrite: false,
    });
    this.schneeFlocken = new THREE.Points(this.schneeGeo, this.schneeMaterial);
    this.schneeFlocken.frustumCulled = false;
    this.schneeFlocken.visible = false;
    this.schneeFlocken.renderOrder = 5;
    szene.add(this.schneeFlocken);
  }

  /**
   * Innen-Maske aus der Welt (Innenböden + selbstgebaute Dächer). Nur neu, wenn sich die Bauwerke geändert haben und es
   * gerade überhaupt regnet/schneit (welt.bauwerkeVersion). Ein Texel je Kachel → winzig, auch bei großen Karten.
   */
  setzeInnenMaske(welt) {
    if (!welt || (this.regen <= 0.01 && this.schnee <= 0.01)) return;
    const version = `${welt.breite}x${welt.hoehe}:${welt.bauwerkeVersion ?? 0}`;
    if (this.maskeVersion === version && this.maskeWelt === welt) return;
    this.maskeVersion = version;
    this.maskeWelt = welt;
    const { breite, hoehe, kachelGroesse: g } = welt;
    const daten = new Uint8Array(breite * hoehe);
    for (let ty = 0; ty < hoehe; ty++) for (let tx = 0; tx < breite; tx++) if (welt.istInnen((tx + 0.5) * g, (ty + 0.5) * g)) daten[ty * breite + tx] = 255;
    this.maske.uMaske.value?.dispose();
    const textur = new THREE.DataTexture(daten, breite, hoehe, THREE.RedFormat, THREE.UnsignedByteType);
    textur.magFilter = textur.minFilter = THREE.NearestFilter;
    textur.unpackAlignment = 1; // Kartenbreite muss kein Vielfaches von 4 sein
    textur.needsUpdate = true;
    this.maske.uMaske.value = textur;
    this.maske.uKartenPx.value.set(breite * g, hoehe * g);
  }

  setzeArt(art) {
    this.art = ['regen', 'gewitter', 'sturm', 'nebel', 'schnee', 'schneesturm'].includes(art) ? art : 'klar';
  }

  /** Stärke des Wetters für Ton & Licht (0 = klar … 1 = voll). */
  get stimmung() {
    return Math.max(this.regen, this.nebel, this.schnee * 0.6, this.sturm * 0.35);
  }

  /** @param drinnen  Spieler steht im Haus → Regen/Schnee blenden ganz aus (sonst fallen Tropfen von draußen optisch ins Zimmer) */
  aktualisiere(dt, fokusX, fokusY, drinnen = false) {
    if (!Number.isFinite(dt) || dt < 0) dt = 0;
    // Runde 26: einmal NaN = für immer NaN (Nebel/Himmel kaputt) → Zustände reparieren
    for (const k of ['regen', 'nebel', 'schnee', 'sturm', 'gewitter', 'boe', 'windZeit', 'aussen']) if (!Number.isFinite(this[k])) this[k] = k === 'aussen' ? 1 : 0;
    if (!Number.isFinite(this.windStufe)) this.windStufe = 1;
    const a = this.art;
    const zielRegen = a === 'regen' || a === 'gewitter' ? 1 : 0;
    const zielSchnee = a === 'schnee' || a === 'schneesturm' ? 1 : 0;
    const zielNebel = { nebel: 1, regen: 0.3, gewitter: 0.5, schnee: 0.4, schneesturm: 0.85, sturm: 0.12 }[a] ?? 0;
    const zielSturm = { sturm: 1, gewitter: 0.6, schneesturm: 1 }[a] ?? 0;
    const zielGewitter = a === 'gewitter' ? 1 : 0;
    const schritt = BLENDE_PRO_SEKUNDE * dt;
    const blende = (wert, ziel) => wert + Math.max(-schritt, Math.min(schritt, ziel - wert));
    this.regen = blende(this.regen, zielRegen);
    this.nebel = blende(this.nebel, zielNebel);
    this.schnee = blende(this.schnee, zielSchnee);
    this.sturm = blende(this.sturm, zielSturm);
    this.gewitter = blende(this.gewitter, zielGewitter);
    // Wind passt sich dem Wetter an: Nebel = fast windstill, klar = leicht (mit Böen), Regen = mittel, Sturm = stark mit Böen
    this.windZeit += dt;
    const boeSchnell = 0.5 + 0.5 * Math.sin(this.windZeit * 0.9) * Math.sin(this.windZeit * 0.37 + 2);
    // Böen: zwei langsame, gegeneinander verschobene Wellen, nur die Spitzen zählen (kurze Stöße statt Dauerwabern)
    const welle = Math.sin(this.windZeit * 0.23) * 0.6 + Math.sin(this.windZeit * 0.071 + 1.3) * 0.4;
    const boeZiel = Math.max(0, welle) ** 1.5 * (0.7 + 0.3 * boeSchnell);
    this.boe += (boeZiel - this.boe) * Math.min(1, dt * 1.5);
    const g = Math.max(0, Math.min(1, this.grundWind));
    const grundWind = a === 'nebel' ? Math.min(0.2, g * 3) : g * 3 * (0.8 + (0.25 + 0.5 * g) * this.boe);
    const zielWind = Math.max(grundWind * (1 - this.sturm), this.sturm * (2.4 + 0.6 * boeSchnell));
    this.windStufe += (zielWind - this.windStufe) * Math.min(1, dt * 0.9);
    const windSchraeg = this.sturm * (0.55 + 0.45 * boeSchnell);
    this.#blitze(dt);
    this.aussen += ((drinnen ? 0 : 1) - this.aussen) * Math.min(1, dt * 4);
    const schneit = this.schnee > 0.01 && this.aussen > 0.01;
    this.schneeFlocken.visible = schneit;
    if (schneit) {
      this.schneeZeit += dt;
      const s = this.schneeMaterial.uniforms;
      s.uZeit.value = this.schneeZeit;
      s.uFokus.value.set(fokusX, 0, fokusY);
      s.uAnteil.value = Math.min(1, this.schnee * (0.5 + 0.5 * this.sturm) + 0.05);
      s.uDeckkraft.value = 0.85 * this.schnee * this.aussen;
      s.uWind.value = windSchraeg;
    }
    const sichtbar = this.regen > 0.01 && this.aussen > 0.01;
    this.linien.visible = sichtbar;
    if (!sichtbar) return;
    this.zeit += dt;
    const u = this.material.uniforms;
    u.uZeit.value = this.zeit;
    u.uFokus.value.set(fokusX, 0, fokusY);
    u.uAnteil.value = Math.min(1, this.regen * (0.55 + 0.45 * this.gewitter) + 0.05);
    u.uDeckkraft.value = (0.5 + 0.12 * this.gewitter) * this.regen * this.aussen;
    u.uWind.value = windSchraeg;
  }

  /** Gewitter: in unregelmäßigen Abständen 1–3 kurze Blitze (Helligkeit klingt schnell ab), dazu der Donner-Haken. */
  #blitze(dt) {
    this.blitz = Math.max(0, this.blitz - dt * 5.5);
    while (this.blitzFolge.length && this.blitzFolge[0] <= this.windZeit) {
      this.blitzFolge.shift();
      this.blitz = Math.max(this.blitz, 0.55 + Math.random() * 0.45);
    }
    if (this.gewitter < 0.6) return;
    this.naechsterBlitz -= dt;
    if (this.naechsterBlitz > 0) return;
    this.naechsterBlitz = 7 + Math.random() * 16;
    const nah = Math.random() < 0.35;
    const staerke = nah ? 1 : 0.45 + Math.random() * 0.35;
    this.blitz = staerke;
    const nach = 1 + Math.floor(Math.random() * 2.5);
    for (let i = 0; i < nach; i++) this.blitzFolge.push(this.windZeit + 0.09 + i * (0.07 + Math.random() * 0.12));
    this.beiBlitz?.(staerke, nah);
  }
}

import * as THREE from 'three';

/**
 * Dynamischer Himmel als Bildschirm-Hintergrund (ein Vollbild-Dreieck, ein Draw-Call, kein Depth-Write).
 *
 * Die Kamera schaut schräg nach unten – der echte Horizont liegt nie im Bild. Darum zeigt der Renderer den Himmel dort, wo die
 * Welt per Kamera-Ferne (camera.far) endet: oberer Bildrand, die Welt verblasst per Nebel in die Horizontfarbe (= Nebelfarbe),
 * darüber läuft der Himmel nach oben zur Zenitfarbe. Tag: blau mit wenigen Wolken · Regen: dunkelgrau, dicht bewölkt ·
 * Nacht: dunkel mit Sternen (bei Regen verdecken Wolken sie).
 *
 * Gesteuert über Uniforms (Renderer.#tageslicht): Farben, Sterne (0–1), Wolkenbedeckung (0–1), Schnittlinie (Bildhöhe 0–1, ab hier
 * beginnt der Himmel).
 */
const VERTEX = /* glsl */ `
  void main() {
    gl_Position = vec4(position.xy, 1.0, 1.0); // ganz hinten
  }
`;

const FRAGMENT = /* glsl */ `
  uniform vec3 uHorizont;
  uniform vec3 uZenit;
  uniform vec3 uWolkenFarbe;
  uniform float uSterne;
  uniform float uWolken;
  uniform float uSchnitt;
  uniform float uZeit;
  uniform vec2 uAufloesung;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float rauschen(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float wolke(vec2 p) {
    float s = 0.0;
    float a = 0.55;
    for (int i = 0; i < 4; i++) {
      s += a * rauschen(p);
      p = p * 2.03 + vec2(17.0, 9.0);
      a *= 0.5;
    }
    return s;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / uAufloesung;
    float hoehe = clamp((uv.y - uSchnitt) / max(0.05, 1.0 - uSchnitt), 0.0, 1.0);
    vec3 farbe = mix(uHorizont, uZenit, pow(hoehe, 0.7));

    // Sterne: Zellen-Raster, wenige helle Punkte mit Flimmern; nach unten (zum Horizont) ausgeblendet
    if (uSterne > 0.01) {
      vec2 raster = gl_FragCoord.xy / 5.0;
      vec2 zelle = floor(raster);
      float z = hash(zelle);
      if (z > 0.955) {
        vec2 mitte = vec2(0.3 + 0.4 * hash(zelle + 3.1), 0.3 + 0.4 * hash(zelle + 7.7));
        float d = length(fract(raster) - mitte);
        float helligkeit = smoothstep(0.4, 0.0, d) * (0.55 + 0.45 * hash(zelle + 1.7));
        helligkeit *= 0.75 + 0.25 * sin(uZeit * (1.5 + 3.0 * hash(zelle + 9.0)) + z * 40.0);
        farbe += vec3(0.85, 0.9, 1.0) * helligkeit * uSterne * smoothstep(0.0, 0.5, hoehe) * (1.0 - uWolken * 0.9);
      }
    }

    // Wolken: langsam ziehende Schwaden, Bedeckung steuert, wie viel vom Rauschen sichtbar wird
    if (uWolken > 0.01 && hoehe > 0.0) {
      vec2 p = vec2(uv.x * uAufloesung.x / uAufloesung.y * 2.6 + uZeit * 0.012, uv.y * 5.0 - uZeit * 0.004);
      float n = wolke(p);
      float schwelle = 1.0 - uWolken * 0.85;
      float dichte = smoothstep(schwelle, schwelle + 0.22, n) * smoothstep(0.0, 0.18, hoehe);
      farbe = mix(farbe, uWolkenFarbe * (0.75 + 0.25 * n), dichte * (0.55 + 0.45 * uWolken));
    }
    gl_FragColor = vec4(farbe, 1.0);
    #include <colorspace_fragment>
  }
`;

export class Himmel {
  constructor(szene) {
    this.uniforms = {
      uHorizont: { value: new THREE.Color(0x9cc3e4) },
      uZenit: { value: new THREE.Color(0x3b7fd8) },
      uWolkenFarbe: { value: new THREE.Color(0xffffff) },
      uSterne: { value: 0 },
      uWolken: { value: 0 },
      uSchnitt: { value: 0.85 },
      uZeit: { value: 0 },
      uAufloesung: { value: new THREE.Vector2(1, 1) },
    };
    const geometrie = new THREE.BufferGeometry();
    // ein Dreieck, das den ganzen Bildschirm abdeckt
    geometrie.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    this.mesh = new THREE.Mesh(
      geometrie,
      new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: VERTEX, fragmentShader: FRAGMENT, depthTest: false, depthWrite: false, fog: false }),
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
    szene.add(this.mesh);
  }

  /**
   * @param horizont  Farbe am Horizont (= Nebelfarbe, damit die Welt nahtlos hineinverblasst)
   * @param zenit     Farbe am oberen Bildrand
   * @param sterne    0–1 Sternenhimmel
   * @param wolken    0–1 Wolkenbedeckung (0,15 = ein paar Schleier, 1 = dicht bewölkt)
   * @param wolkenFarbe  Farbe der Wolken
   * @param schnitt   Bildhöhe (0 unten … 1 oben), ab der der Himmel beginnt
   */
  setze({ horizont, zenit, sterne, wolken, wolkenFarbe, schnitt, zeit, breite, hoehe }) {
    const u = this.uniforms;
    u.uHorizont.value.copy(horizont);
    u.uZenit.value.copy(zenit);
    u.uWolkenFarbe.value.copy(wolkenFarbe);
    u.uSterne.value = sterne;
    u.uWolken.value = wolken;
    u.uSchnitt.value = schnitt;
    u.uZeit.value = zeit;
    u.uAufloesung.value.set(breite, hoehe);
  }

  set sichtbar(an) {
    this.mesh.visible = an;
  }
}

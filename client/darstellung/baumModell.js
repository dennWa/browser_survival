import * as THREE from 'three';
import { vereineGeometrien, matrixAus } from './geometrie.js';
import { BAUM_DATEN } from '../assets/3d/baumDaten.js';

/**
 * Prozedurale Cartoon-Bäume und -Büsche (kein Bild-Asset nötig): Stamm mit Wurzelansatz und Ästen,
 * Krone aus mehreren runden "Wolken" in zwei Grüntönen, dazu ein schwarzer Umriss (Inverted Hull).
 * Gezeichnet mit Toon-Material → harte Licht-Stufen wie im Comic.
 *
 * Bäume ('baum', 'baum_herbst') nutzen das Nutzer-Modell tree.glb (statische Ruhepose, siehe werkzeuge/assets/baue_baum.py);
 * Attribut `kronenMaske` (1 = Laub) erlaubt pro Instanz eine Laubfarb-Variation (BAUM_LAUB_TOENE). Büsche bleiben prozedural.
 * Maße in Weltpixeln für einen Baum mit 112 px Grundfläche (3,5 Kacheln); kartenModell skaliert passend.
 * Die Krone sitzt komplett ÜBER dem Stamm (Stamm endet in der Krone) – nichts ragt oben heraus.
 */
export const BAUM_GRUNDFLAECHE = 112;
export const BUSCH_GRUNDFLAECHE = 48;
const UMRISS = 1.6;
const BAUM_MASSSTAB = 0.5; // tree.glb ist ~254 hoch → ~127 (wie der alte Cartoon-Baum) // Dicke des schwarzen Umrisses

const STAMM = new THREE.Color(0x7a4a26);
const STAMM_DUNKEL = new THREE.Color(0x5c3519);

const FARBEN = {
  baum: [0x5cab2f, 0x438a24, 0x6fc23a],
  baum_herbst: [0xe0892c, 0xc0602a, 0xe8b23c],
  busch: [0x4f9c2c, 0x3d8124, 0x63b336],
};

/** Laub-Farbtöne je Baumtyp (Faktoren auf das Palettengrün, linear); kartenModell wählt per Zufall einen Ton. */
export const BAUM_LAUB_TOENE = {
  baum: [[1, 1, 1], [0.85, 1.05, 0.8], [1.2, 1.12, 0.7], [0.8, 0.95, 1.1], [1.1, 1.2, 0.85], [0.9, 0.9, 0.75]],
  baum_herbst: [[2.6, 1.15, 0.25], [2.2, 0.8, 0.3], [2.4, 1.5, 0.3], [1.9, 1.0, 0.4]],
};

const base64Zu = (text, Typ) => {
  const roh = atob(text);
  const bytes = new Uint8Array(roh.length);
  for (let i = 0; i < roh.length; i++) bytes[i] = roh.charCodeAt(i);
  return new Typ(bytes.buffer);
};

/**
 * Wind (aus den 4 Animationen des Modells vorberechnet): DataTexture, Reihe = Stufe·Frames + Frame, Spalte = Vertex, RGB = Verschiebung (Weltpixel).
 * Uniforms gemeinsam für alle Bäume: uWindZeit (Sekunden, mod 600), uWindStufe (0 keiner … 3 stark, fließend). Setzt der Renderer pro Bild.
 */
export const BAUM_WIND = { uWindZeit: { value: 0 }, uWindStufe: { value: 1 }, uWindTex: { value: null } };
function baueWindTextur() {
  const roh = base64Zu(BAUM_DATEN.wind, Int16Array);
  const anzahl = BAUM_DATEN.position.length ? roh.length / 3 / (4 * BAUM_DATEN.windFrames) : 0;
  const daten = new Float32Array((roh.length / 3) * 4);
  const faktor = (BAUM_DATEN.windGrenze / 32767) * BAUM_MASSSTAB;
  for (let i = 0; i < roh.length / 3; i++) for (let a = 0; a < 3; a++) daten[i * 4 + a] = roh[i * 3 + a] * faktor;
  const tex = new THREE.DataTexture(daten, anzahl, 4 * BAUM_DATEN.windFrames, THREE.RGBAFormat, THREE.FloatType);
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

/** Baum aus tree.glb: Körper mit Vertexfarben + kronenMaske, Umriss aus verschweißten (geglätteten) Normalen. */
function baueModellBaum() {
  const position = base64Zu(BAUM_DATEN.position, Float32Array).map((v) => v * BAUM_MASSSTAB);
  const normale = base64Zu(BAUM_DATEN.normale, Float32Array);
  const koerper = new THREE.BufferGeometry();
  koerper.setAttribute('position', new THREE.BufferAttribute(position, 3));
  koerper.setAttribute('normal', new THREE.BufferAttribute(normale, 3));
  koerper.setAttribute('color', new THREE.BufferAttribute(base64Zu(BAUM_DATEN.farbe, Float32Array), 3));
  koerper.setAttribute('kronenMaske', new THREE.BufferAttribute(base64Zu(BAUM_DATEN.maske, Float32Array), 1));
  koerper.setIndex(new THREE.BufferAttribute(base64Zu(BAUM_DATEN.index, Uint16Array), 1));
  const anzahl = position.length / 3;
  const vertexNr = new THREE.BufferAttribute(Float32Array.from({ length: anzahl }, (_, i) => i), 1);
  koerper.setAttribute('vertexNr', vertexNr);
  koerper.computeBoundingSphere();

  // Umriss: Eckpunkte gleicher Position teilen sich eine gemittelte Normale, sonst reißt der aufgeblasene Rand an Kanten auf
  const glatt = new Map();
  const schluessel = (i) => `${position[i * 3].toFixed(2)},${position[i * 3 + 1].toFixed(2)},${position[i * 3 + 2].toFixed(2)}`;
  for (let i = 0; i < position.length / 3; i++) {
    const k = schluessel(i);
    const n = glatt.get(k) ?? [0, 0, 0];
    for (let a = 0; a < 3; a++) n[a] += normale[i * 3 + a];
    glatt.set(k, n);
  }
  const umrissPosition = position.slice();
  for (let i = 0; i < position.length / 3; i++) {
    const n = glatt.get(schluessel(i));
    const laenge = Math.hypot(n[0], n[1], n[2]) || 1;
    for (let a = 0; a < 3; a++) umrissPosition[i * 3 + a] += (n[a] / laenge) * UMRISS;
  }
  const umriss = new THREE.BufferGeometry();
  umriss.setAttribute('position', new THREE.BufferAttribute(umrissPosition, 3));
  umriss.setIndex(koerper.index);
  umriss.setAttribute('vertexNr', vertexNr);
  umriss.computeBoundingSphere();
  return { koerper, umriss, grundflaeche: BAUM_GRUNDFLAECHE };
}

/** Krone: [x, y, z, radius, farbIndex] */
const BAUM_KRONE = [
  [0, 84, 0, 34, 0],
  [-27, 72, 6, 25, 1],
  [26, 74, 4, 25, 1],
  [2, 72, -27, 24, 1],
  [-4, 76, 26, 23, 0],
  [12, 102, 8, 24, 2],
  [-15, 98, -10, 22, 0],
  [20, 88, -18, 19, 2],
];
const BUSCH_KRONE = [
  [0, 13, 0, 15, 0],
  [-11, 10, 5, 10, 1],
  [10, 10, -4, 11, 1],
  [3, 19, 4, 9, 2],
];

/**
 * @returns {{ koerper: THREE.BufferGeometry, umriss: THREE.BufferGeometry }} beide mit Vertexfarbe (umriss ohne)
 */
export function baueBaum(typ) {
  if (typ !== 'busch') return baueModellBaum();
  const istBusch = true;
  const farben = (FARBEN[typ] ?? FARBEN.baum).map((f) => new THREE.Color(f));
  const teile = [];

  if (!istBusch) {
    // Stamm (endet bei 80 – mitten in der Krone), Wurzelansatz, drei Äste
    teile.push({ geometrie: new THREE.CylinderGeometry(6, 9, 80, 9, 1), matrix: matrixAus(0, 40, 0), farbe: STAMM });
    teile.push({ geometrie: new THREE.CylinderGeometry(9, 14, 8, 9, 1), matrix: matrixAus(0, 4, 0), farbe: STAMM_DUNKEL });
    for (const [winkel, hoehe, laenge] of [[0.3, 46, 30], [2.4, 52, 28], [4.3, 42, 26]]) {
      const ast = new THREE.CylinderGeometry(2.4, 3.6, laenge, 6, 1).translate(0, laenge / 2, 0);
      const m = new THREE.Matrix4()
        .makeTranslation(0, hoehe, 0)
        .multiply(new THREE.Matrix4().makeRotationY(winkel))
        .multiply(new THREE.Matrix4().makeRotationZ(-0.85));
      teile.push({ geometrie: ast, matrix: m, farbe: STAMM });
    }
  }
  for (const [x, y, z, r, f] of istBusch ? BUSCH_KRONE : BAUM_KRONE) {
    teile.push({ geometrie: new THREE.IcosahedronGeometry(r, 1), matrix: matrixAus(x, y, z), farbe: farben[f] });
  }

  const koerper = vereineGeometrien(teile, { mitFarbe: true });
  // Leichte Aufhellung nach oben (Sonnenseite) – macht die Kronen-Wolken plastischer
  const n = koerper.attributes.normal.array;
  const c = koerper.attributes.color.array;
  for (let i = 0; i < c.length; i += 3) {
    const faktor = 0.9 + 0.18 * n[i + 1];
    c[i] *= faktor;
    c[i + 1] *= faktor;
    c[i + 2] *= faktor;
  }

  // Umriss: dieselben Teile, entlang der Normalen aufgeblasen; wird mit BackSide schwarz gezeichnet
  const umriss = vereineGeometrien(teile);
  const p = umriss.attributes.position.array;
  const un = umriss.attributes.normal.array;
  for (let i = 0; i < p.length; i++) p[i] += un[i] * UMRISS;
  umriss.deleteAttribute('uv');
  umriss.computeBoundingSphere();
  return { koerper, umriss, grundflaeche: istBusch ? BUSCH_GRUNDFLAECHE : BAUM_GRUNDFLAECHE };
}

/**
 * Baum-Material: Wind-Schwanken per Vertex-Shader (BAUM_WIND, je Baum zeitversetzt) und – mit `laub` – die Instanzfarbe (instanceColor)
 * nur auf das Laub (kronenMaske = 1), der Stamm behält seine Farbe. Muss NACH #mitSchnitt aufgerufen werden (verkettet dessen onBeforeCompile).
 */
export function baumMaterial(material, { laub = true } = {}) {
  BAUM_WIND.uWindTex.value ??= baueWindTextur();
  const vorher = material.onBeforeCompile;
  const frames = BAUM_DATEN.windFrames;
  material.onBeforeCompile = (shader, renderer) => {
    vorher?.(shader, renderer);
    Object.assign(shader.uniforms, BAUM_WIND);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute float vertexNr;
attribute float kronenMaske;
uniform sampler2D uWindTex;
uniform float uWindZeit;
uniform float uWindStufe;
const float WIND_PERIODE[4] = float[4](${BAUM_DATEN.windPerioden.map((p) => p.toFixed(3)).join(', ')});
vec3 windAnim(int s, float t, float nr) {
  float ph = fract(t / WIND_PERIODE[s]) * ${frames}.0;
  int a = int(floor(ph));
  int b = (a + 1) % ${frames};
  return mix(texelFetch(uWindTex, ivec2(int(nr), s * ${frames} + a), 0).xyz, texelFetch(uWindTex, ivec2(int(nr), s * ${frames} + b), 0).xyz, ph - floor(ph));
}`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
#ifdef USE_INSTANCING
  float windStufe = clamp(uWindStufe, 0.0, 3.0);
  int windS0 = int(floor(windStufe));
  int windS1 = min(windS0 + 1, 3);
  float windT = uWindZeit + fract(sin(instanceMatrix[3].x * 0.0131 + instanceMatrix[3].z * 0.0317) * 43758.5453) * 15.0;
  transformed += mix(windAnim(windS0, windT, vertexNr), windAnim(windS1, windT, vertexNr), windStufe - float(windS0));
#endif`,
      );
    if (laub) {
      shader.vertexShader = shader.vertexShader.replace(
        '#include <color_vertex>',
        '#include <color_vertex>\n#ifdef USE_INSTANCING_COLOR\n  vColor.xyz = mix(color.xyz, color.xyz * instanceColor.xyz, kronenMaske);\n#endif',
      );
    }
  };
  material.customProgramCacheKey = () => (laub ? 'schnitt_baum_laub' : 'schnitt_baum');
  return material;
}

/** Stumpf eines gefällten Baums: Stamm-Rest mit heller Schnittfläche (Jahresringe angedeutet). */
export function baueStumpf() {
  const teile = [
    { geometrie: new THREE.CylinderGeometry(8, 10, 10, 10, 1), matrix: matrixAus(0, 5, 0), farbe: STAMM },
    { geometrie: new THREE.CylinderGeometry(10, 15, 5, 10, 1), matrix: matrixAus(0, 2.5, 0), farbe: STAMM_DUNKEL },
    { geometrie: new THREE.CylinderGeometry(7, 7, 0.6, 10, 1), matrix: matrixAus(0, 10.3, 0), farbe: new THREE.Color(0xd9b07a) },
    { geometrie: new THREE.CylinderGeometry(3.5, 3.5, 0.6, 8, 1), matrix: matrixAus(0, 10.5, 0), farbe: new THREE.Color(0xb88a52) },
  ];
  return vereineGeometrien(teile, { mitFarbe: true });
}

let toonVerlauf = null;
/** 3-stufiger Licht-Verlauf für MeshToonMaterial */
export function toonMaterial(eigenschaften = {}) {
  if (!toonVerlauf) {
    toonVerlauf = new THREE.DataTexture(new Uint8Array([90, 170, 255]), 3, 1, THREE.RedFormat);
    toonVerlauf.minFilter = toonVerlauf.magFilter = THREE.NearestFilter;
    toonVerlauf.needsUpdate = true;
  }
  return new THREE.MeshToonMaterial({ gradientMap: toonVerlauf, ...eigenschaften });
}

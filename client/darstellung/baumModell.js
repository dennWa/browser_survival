import * as THREE from 'three';
import { vereineGeometrien, matrixAus } from './geometrie.js';
import { ladeEigenesModell } from './eigeneModelle.js';

/**
 * Bäume und Büsche für die Karte.
 *
 * Runde 25 – Bäume ('baum', 'baum_herbst') sind echte Low-Poly-Modelle aus dem Quaternius „Stylized Nature MegaKit“ (CC0),
 * aufbereitet von werkzeuge/assets/baue_baeume.py → client/assets/3d/baeume/<variante>.glb (Rinde mit Vertexfarben,
 * Laub als 256-px-Alpha-Cutout). Je Karte eine eigene Mischung (`baumVarianten(typ, kartenId)`): Stadtrand = Laubbäume,
 * Waldweg = Laubbäume + Kiefern (+ vereinzelt tote Bäume im Herbstwald). Herbst = dieselben Laubbäume, Laub per Instanzfarbe
 * getönt (BAUM_LAUB_TOENE). Wind: Shader-Schwanken (`baumWindMaterial`, BAUM_WIND), stärker nach oben, Laub flattert zusätzlich.
 * `ladeBaumVariante(name)` liefert { rinde, laub, laubTextur } in Weltpixeln (Stammfuß = Ursprung, Grundfläche BAUM_GRUNDFLAECHE).
 * Die alten Rig-Bäume (baumDaten.js / baue_baum.py) sind entfernt.
 *
 * Büsche bleiben prozedural (Cartoon-Wolken + schwarzer Umriss, Toon-Material).
 * Tanne ('tanne', Schneezonen): Modell client/assets/eigene/tanne_schnee.glb (Pine Tree with Snow, Chris Lee, CC-BY – siehe credits.json);
 * `baueBaum('tanne')` liefert sofort eine prozedurale Ersatz-Tanne, `ladeTanneAusGlb()` die Geometrie aus der Datei
 * (Materialfarben → Vertexfarben, auf `TANNE_BREITE` × `TANNE_HOEHE` eingepasst) – kartenModell tauscht sie nach dem Laden ein.
 */
export const BAUM_GRUNDFLAECHE = 112;
export const BUSCH_GRUNDFLAECHE = 48;
export const TANNE_BREITE = 100; // Grundfläche der Tanne in Weltpixeln (Instanz-Skalierung: Objektbreite / TANNE_BREITE)
export const TANNE_HOEHE = 190;
export const TANNE_GLB = new URL('../assets/eigene/tanne_schnee.glb', import.meta.url).href;
const UMRISS = 1.6; // Dicke des schwarzen Umrisses (Busch, Tanne)
/** Weltpixel je Modell-Meter für die Baum-Modelle (Kachel = 32 px = 1 m; Bäume bewusst etwas kleiner, damit die Kamera nicht im Laub hängt) */
const BAUM_PX_JE_METER = 19;

/** Baum-Mischung je Karte (Gewichte = Häufigkeit). Unbekannte Karten (Editor, Tutorial) → `standard`. */
const BAUM_MISCHUNG = {
  standard: { baum: { laubbaum_a: 3, laubbaum_b: 2, laubbaum_c: 2, laubbaum_d: 3 }, baum_herbst: { laubbaum_a: 3, laubbaum_b: 2, laubbaum_c: 2, laubbaum_d: 3 } },
  waldweg: {
    baum: { laubbaum_a: 2, laubbaum_d: 2, laubbaum_c: 1, kiefer_a: 2, kiefer_b: 2, kiefer_c: 2 },
    baum_herbst: { laubbaum_a: 3, laubbaum_b: 2, laubbaum_d: 3, totbaum_a: 1 },
  },
};

/** Je Variante: Größenfaktor und eigene Laub-Töne (statt BAUM_LAUB_TOENE des Typs; null = ungetönt). */
export const BAUM_VARIANTE_INFO = {
  kiefer_a: { toene: [[1.25, 1.45, 1.3], [1.1, 1.35, 1.35], [1.35, 1.5, 1.15]] },
  kiefer_b: { toene: [[1.25, 1.45, 1.3], [1.1, 1.35, 1.35], [1.35, 1.5, 1.15]], massstab: 0.9 },
  kiefer_c: { toene: [[1.25, 1.45, 1.3], [1.1, 1.35, 1.35], [1.35, 1.5, 1.15]] },
  totbaum_a: { toene: null, massstab: 0.62 },
};

/** Liste [[variante, gewicht], …] für einen Baumtyp auf einer Karte – null, wenn der Typ kein Modellbaum ist (Busch, Tanne). */
export function baumVarianten(typ, kartenId) {
  const mischung = BAUM_MISCHUNG[kartenId]?.[typ] ?? BAUM_MISCHUNG.standard[typ];
  return mischung ? Object.entries(mischung) : null;
}

/** Wählt per Zufallswert 0..1 eine Variante (gewichtet). */
export function waehleBaumVariante(varianten, zufall) {
  const summe = varianten.reduce((s, [, g]) => s + g, 0);
  let rest = zufall * summe;
  for (const [name, gewicht] of varianten) if ((rest -= gewicht) < 0) return name;
  return varianten[varianten.length - 1][0];
}

const baumCache = new Map();
/**
 * Lädt eine Baum-Variante (einmal je Name). Geometrien in Weltpixeln, Stammfuß im Ursprung.
 * @returns {Promise<{ rinde: THREE.BufferGeometry, laub: THREE.BufferGeometry | null, laubTextur: THREE.Texture | null } | null>}
 */
export function ladeBaumVariante(name) {
  if (!baumCache.has(name)) {
    const url = new URL(`../assets/3d/baeume/${name}.glb`, import.meta.url).href;
    baumCache.set(
      name,
      ladeEigenesModell(url).then(
        (szene) => {
          szene.updateMatrixWorld(true);
          const ergebnis = { rinde: null, laub: null, laubTextur: null };
          szene.traverse((t) => {
            if (!t.isMesh) return;
            const geometrie = t.geometry.clone().applyMatrix4(t.matrixWorld).scale(BAUM_PX_JE_METER, BAUM_PX_JE_METER, BAUM_PX_JE_METER);
            geometrie.computeBoundingSphere();
            if (t.material?.name === 'laub') {
              ergebnis.laub = geometrie;
              ergebnis.laubTextur = t.material.map;
            } else ergebnis.rinde = geometrie;
          });
          return ergebnis.rinde ? ergebnis : null;
        },
        () => null,
      ),
    );
  }
  return baumCache.get(name);
}

/** Leere Geometrie (bis das Baum-Modell geladen ist – zeichnet nichts). */
export function leereBaumGeometrie() {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
  return g;
}

let platzhalterTextur = null;
/** Material fürs Laub: Toon + Blatt-Textur (Alpha-Cutout, doppelseitig) + Vertexfarbe; Textur wird nach dem Laden gesetzt. */
export function laubMaterial() {
  platzhalterTextur ??= Object.assign(new THREE.DataTexture(new Uint8Array([90, 140, 60, 255]), 1, 1), { needsUpdate: true });
  return toonMaterial({ vertexColors: true, map: platzhalterTextur, alphaTest: 0.5, side: THREE.DoubleSide });
}

const STAMM = new THREE.Color(0x7a4a26);
const STAMM_DUNKEL = new THREE.Color(0x5c3519);

const FARBEN = {
  busch: [0x4f9c2c, 0x3d8124, 0x63b336],
};

/** Laub-Farbtöne je Baumtyp (Faktoren auf das Grün der Blatt-Textur, linear); kartenModell wählt per Zufall einen Ton. */
export const BAUM_LAUB_TOENE = {
  baum: [[1.15, 1.18, 1.05], [0.95, 1.15, 0.9], [1.3, 1.25, 0.8], [0.9, 1.1, 1.15], [1.2, 1.3, 0.95], [1.0, 1.0, 0.8]],
  baum_herbst: [[8.0, 1.4, 0.6], [6.8, 0.8, 0.5], [7.5, 2.0, 0.5], [5.4, 1.2, 0.7], [8.5, 2.5, 0.4]],
};

const BUSCH_KRONE = [
  [0, 13, 0, 15, 0],
  [-11, 10, 5, 10, 1],
  [10, 10, -4, 11, 1],
  [3, 19, 4, 9, 2],
];

const TANNE_NADEL = new THREE.Color().setRGB(0, 0.31, 0.25, THREE.LinearSRGBColorSpace);
const TANNE_SCHNEE = new THREE.Color().setRGB(0.95, 0.97, 1, THREE.LinearSRGBColorSpace);
const TANNE_RINDE = new THREE.Color().setRGB(0.19, 0.09, 0.06, THREE.LinearSRGBColorSpace);

/** Umriss (Inverted Hull) zu einer Geometrie ohne Index: Eckpunkte gleicher Position teilen sich eine gemittelte Normale. */
function umrissVon(koerper) {
  const position = koerper.attributes.position.array;
  const normale = koerper.attributes.normal.array;
  const schluessel = (i) => `${position[i * 3].toFixed(1)},${position[i * 3 + 1].toFixed(1)},${position[i * 3 + 2].toFixed(1)}`;
  const glatt = new Map();
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
  umriss.computeBoundingSphere();
  return umriss;
}

/** Ersatz-Tanne (bis die .glb geladen ist bzw. falls sie fehlt): Stamm + 4 Kegel-Etagen, Schneehauben auf jeder Etage. */
function baueErsatzTanne() {
  const teile = [{ geometrie: new THREE.CylinderGeometry(5, 8, 36, 7, 1), matrix: matrixAus(0, 18, 0), farbe: TANNE_RINDE }];
  for (const [radius, hoehe, y] of [[46, 74, 62], [38, 64, 100], [29, 56, 136], [19, 48, 168]]) {
    teile.push({ geometrie: new THREE.ConeGeometry(radius, hoehe, 9, 1), matrix: matrixAus(0, y, 0), farbe: TANNE_NADEL });
    teile.push({ geometrie: new THREE.ConeGeometry(radius * 0.7, hoehe * 0.55, 9, 1), matrix: matrixAus(0, y + hoehe * 0.2, 0), farbe: TANNE_SCHNEE });
  }
  const koerper = vereineGeometrien(teile, { mitFarbe: true });
  return { koerper, umriss: umrissVon(koerper), grundflaeche: TANNE_BREITE };
}

/**
 * Tanne aus der .glb: alle Meshes zusammenfassen, Materialfarbe → Vertexfarbe, Unterkante auf y = 0, Breite TANNE_BREITE,
 * Höhe TANNE_HOEHE. @returns {Promise<{ koerper, umriss } | null>} null, wenn die Datei fehlt/unlesbar ist
 */
export async function ladeTanneAusGlb(url = TANNE_GLB) {
  let szene;
  try {
    szene = await ladeEigenesModell(url);
  } catch {
    return null;
  }
  szene.updateMatrixWorld(true);
  const teile = [];
  szene.traverse((t) => {
    if (!t.isMesh || !t.geometry?.attributes?.position) return;
    const material = Array.isArray(t.material) ? t.material[0] : t.material;
    const geometrie = t.geometry.clone();
    if (!geometrie.attributes.normal) geometrie.computeVertexNormals();
    teile.push({ geometrie, matrix: t.matrixWorld, farbe: material?.color ?? TANNE_NADEL });
  });
  if (!teile.length) return null;
  const koerper = vereineGeometrien(teile, { mitFarbe: true });
  const box = new THREE.Box3().setFromBufferAttribute(koerper.attributes.position);
  const groesse = box.getSize(new THREE.Vector3());
  const faktor = Math.min(TANNE_BREITE / (Math.max(groesse.x, groesse.z) || 1), TANNE_HOEHE / (groesse.y || 1));
  koerper.translate(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
  koerper.scale(faktor, faktor, faktor);
  koerper.computeBoundingSphere();
  return { koerper, umriss: umrissVon(koerper) };
}

/**
 * @returns {{ koerper: THREE.BufferGeometry, umriss: THREE.BufferGeometry }} beide mit Vertexfarbe (umriss ohne)
 */
export function baueBaum(typ) {
  if (typ === 'tanne') return baueErsatzTanne();
  // Busch (und Rückfall für unbekannte Typen): prozedurale Cartoon-Krone
  const farben = (FARBEN[typ] ?? FARBEN.busch).map((f) => new THREE.Color(f));
  const teile = [];

  for (const [x, y, z, r, f] of BUSCH_KRONE) {
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
  return { koerper, umriss, grundflaeche: BUSCH_GRUNDFLAECHE };
}

/** Wind-Uniforms für Bäume und Gras (naturModell). Setzt der Renderer pro Bild: uWindZeit (s, mod 600), uWindStufe (0 … 3, fließend). */
export const BAUM_WIND = { uWindZeit: { value: 0 }, uWindStufe: { value: 1 } };

/**
 * Wind für die Modell-Bäume: ganzer Baum neigt sich (∝ Höhe², je Baum zeitversetzt über die Instanzposition), Laub flattert
 * zusätzlich. Muss NACH #mitSchnitt aufgerufen werden (verkettet dessen onBeforeCompile).
 */
export function baumWindMaterial(material, { laub = false } = {}) {
  const vorher = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    vorher?.(shader, renderer);
    Object.assign(shader.uniforms, BAUM_WIND);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWindZeit;\nuniform float uWindStufe;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
#ifdef USE_INSTANCING
  float windStufe = clamp(uWindStufe, 0.0, 3.0);
  float windPhase = fract(sin(instanceMatrix[3].x * 0.0131 + instanceMatrix[3].z * 0.0317) * 43758.5453) * 6.2832;
  float windH = max(position.y, 0.0) / 170.0;
  float windSchwung = sin(uWindZeit * (0.8 + 0.25 * windStufe) + windPhase) * (0.65 + 0.35 * sin(uWindZeit * 2.1 + windPhase * 1.7));
  transformed.xz += vec2(0.94, 0.34) * (windSchwung * (1.0 + 4.5 * windStufe) + windStufe * 3.0) * windH * windH;
  ${laub ? 'transformed += vec3(sin(uWindZeit * 5.3 + position.x * 0.11 + windPhase), sin(uWindZeit * 4.1 + position.z * 0.09) * 0.5, cos(uWindZeit * 6.1 + position.z * 0.13 + windPhase)) * windH * (0.4 + 0.9 * windStufe);' : ''}
#endif`,
      );
  };
  material.customProgramCacheKey = () => (laub ? 'schnitt_baum_laub2' : 'schnitt_baum_rinde2');
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

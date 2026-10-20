import * as THREE from 'three';
import { GLTFLoader } from '../vendor/three/addons.js';
import { KACHELN } from '../../gemeinsam/welt/kacheln.js';
import { BAUM_WIND } from './baumModell.js';
import { STREUUNG, ZONEN, NATUR_SICHTWEITE, NATUR_SICHTWEITE_EGO, HANDY_DICHTE, NATUR_BLOCK } from './naturKonfiguration.js';

/**
 * Natur-Schicht: streut 3D-Modelle (Gras u. a., Konfiguration in naturKonfiguration.js) auf den Untergrund der Karte – anstelle der
 * früheren flachen Rasen-Optik (der Boden selbst bleibt als ruhige Grundfarbe darunter).
 *
 * Performance: je Modellart und Block (NATUR_BLOCK² Kacheln) ein InstancedMesh mit festem boundingSphere; pro Frame werden nur
 * Blöcke innerhalb NATUR_SICHTWEITE um die Kamera eingeschaltet (die anderen kosten nichts). Die Platzierung ist deterministisch
 * (Hash der Kachel) – alle Spieler sehen dasselbe Gras. Kachel belegt (Bauwerk, Möbel, Gebäude) = Büschel dort ausgeblendet.
 * Wind: gleiche Uniforms wie die Bäume (BAUM_WIND), Schwanken nur an der Spitze.
 */
const ASSETS = new URL('../assets/3d/natur/', import.meta.url);
const lader = new GLTFLoader();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _achse = new THREE.Vector3(0, 1, 0);
const _farbe = new THREE.Color();
const NULL_MATRIX = new THREE.Matrix4().makeScale(0, 0, 0);

/** Zufall aus Kachel + Kanal (0..1), deterministisch */
function streu(tx, ty, kanal) {
  let h = Math.imul(tx, 374761393) ^ Math.imul(ty, 668265263) ^ Math.imul(kanal + 1, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

let katalogCache = null;
/** Lädt natur.json + alle Modelle einmal (Geometrie, eine geteilte Textur). Fehlt etwas, ist die Natur-Schicht einfach aus. */
export async function ladeNaturModelle() {
  if (katalogCache) return katalogCache;
  katalogCache = (async () => {
    const modelle = new Map();
    try {
      const index = await (await fetch(new URL('natur.json', ASSETS))).json();
      let textur = null;
      for (const [name, info] of Object.entries(index.arten ?? {})) {
        const gltf = await lader.loadAsync(new URL(info.datei, ASSETS).href);
        let geometrie = null;
        gltf.scene.traverse((o) => {
          if (!o.isMesh || geometrie) return;
          o.updateWorldMatrix(true, false);
          geometrie = o.geometry.clone().applyMatrix4(o.matrixWorld);
          if (!textur) textur = o.material.map;
          else o.material.map?.dispose(); // alle Gräser teilen sich dieselbe Farbpalette
        });
        if (!geometrie) continue;
        geometrie.computeBoundingBox();
        const hoehe = geometrie.boundingBox.max.y - Math.min(0, geometrie.boundingBox.min.y);
        geometrie.translate(0, -Math.min(0, geometrie.boundingBox.min.y), 0);
        hebeNormalen(geometrie);
        modelle.set(name, { geometrie, hoehe, radius: info.radius ?? 0.5 });
      }
      if (textur) {
        textur.colorSpace = THREE.SRGBColorSpace;
        textur.anisotropy = 2;
      }
      return { modelle, textur };
    } catch (fehler) {
      console.warn('Natur-Modelle nicht geladen:', fehler);
      return { modelle: new Map(), textur: null };
    }
  })();
  return katalogCache;
}

/**
 * Gras-Normalen nach oben ziehen (wie der Boden beleuchtet): sonst sind Halme je nach Orientierung/Modell-Normalen schwarz –
 * dünne Doppelseiten-Karten haben keine sinnvolle Beleuchtung.
 */
function hebeNormalen(geometrie) {
  const n = geometrie.getAttribute('normal');
  if (!n) return;
  for (let i = 0; i < n.count; i++) {
    _v.set(n.getX(i) * 0.25, 1, n.getZ(i) * 0.25).normalize();
    n.setXYZ(i, _v.x, _v.y, _v.z);
  }
  n.needsUpdate = true;
}

/** Windschwanken für Gras: Spitze schwingt (Quadrat der Höhe), Phase je Büschel aus der Position. */
function grasMaterial(textur, hoehe) {
  const material = new THREE.MeshStandardMaterial({ map: textur, roughness: 1, metalness: 0, side: THREE.DoubleSide });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWindZeit = BAUM_WIND.uWindZeit;
    shader.uniforms.uWindStufe = BAUM_WIND.uWindStufe;
    shader.uniforms.uGrasHoehe = { value: hoehe };
    // Rückseiten nicht anders beleuchten (three dreht dort die Normale um → bei nach oben gezogenen Normalen schwarze Halme)
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n#ifndef FLAT_SHADED\n  normal = normalize(vNormal);\n#endif');
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWindZeit;\nuniform float uWindStufe;\nuniform float uGrasHoehe;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         float gh = clamp(position.y / uGrasHoehe, 0.0, 1.0);
         float phase = uWindZeit * (1.6 + 0.5 * uWindStufe) + instanceMatrix[3].x * 0.043 + instanceMatrix[3].z * 0.057;
         float staerke = (0.05 + 0.075 * clamp(uWindStufe, 0.0, 3.0)) * gh * gh;
         transformed.x += sin(phase) * staerke * uGrasHoehe;
         transformed.z += cos(phase * 0.83 + 1.3) * staerke * 0.6 * uGrasHoehe;`,
      );
  };
  material.customProgramCacheKey = () => 'natur-gras';
  return material;
}

export class NaturSchicht {
  /**
   * @param welt  Spielwelt der Zone (id, kachelAn, objekte, ebenenAnKachel)
   * @param modelle  Ergebnis von ladeNaturModelle()
   * @param hy  Geländehöhe an (x, z)
   * @returns NaturSchicht oder null (Karte nicht aktiviert / keine Modelle)
   */
  static erzeuge(welt, { modelle, textur }, hy, istHandy) {
    const eintrag = ZONEN[welt.id];
    if (!eintrag || modelle.size === 0 || !textur) return null;
    return new NaturSchicht(welt, modelle, textur, hy, eintrag === true ? STREUUNG : eintrag, istHandy);
  }

  constructor(welt, modelle, textur, hy, streuung, istHandy) {
    this.welt = welt;
    this.gruppe = new THREE.Group();
    this.bloecke = []; // { gruppe, x, z, sichtbar }
    this.anKachel = new Map(); // Kachelindex → [{ mesh, index, matrix }]
    this.belegt = new Set(); // aktuell ausgeblendete Kacheln
    const g = welt.kachelGroesse;
    const dichte = istHandy ? HANDY_DICHTE : 1;
    const materialien = new Map();
    const belegtVonKarte = this.#belegteKacheln();
    // Pro Block und Art sammeln
    const sammlung = new Map(); // `${bx},${by},${art}` → [{ matrix, farbe, tx, ty }]
    for (let ty = 0; ty < welt.hoehe; ty++) {
      for (let tx = 0; tx < welt.breite; tx++) {
        const liste = streuung[KACHELN[welt.kachelAn(tx, ty)]?.name];
        if (!liste || belegtVonKarte.has(ty * welt.breite + tx)) continue;
        liste.forEach((e, nr) => {
          const modell = modelle.get(e.art);
          if (!modell) return;
          // proKachel kann > 1 sein: ganzzahliger Teil sicher, Rest als Wahrscheinlichkeit
          const soll = e.proKachel * dichte;
          let anzahl = Math.floor(soll);
          if (streu(tx, ty, nr * 11 + 1) < soll - anzahl) anzahl++;
          for (let i = 0; i < anzahl; i++) {
            const k = nr * 31 + i * 7;
            const x = (tx + streu(tx, ty, k + 2)) * g;
            const z = (ty + streu(tx, ty, k + 3)) * g;
            const hoehe = e.hoehe[0] + (e.hoehe[1] - e.hoehe[0]) * streu(tx, ty, k + 4);
            const skala = hoehe / modell.hoehe;
            const breit = skala * (0.85 + 0.35 * streu(tx, ty, k + 5));
            _q.setFromAxisAngle(_achse, streu(tx, ty, k + 6) * Math.PI * 2);
            _m.compose(_v.set(x, hy(x, z), z), _q, _s.set(breit, skala, breit));
            const [h0, h1] = e.farbe ?? [0.85, 1.15];
            const hell = h0 + (h1 - h0) * streu(tx, ty, k + 7);
            const schluessel = `${Math.floor(tx / NATUR_BLOCK)},${Math.floor(ty / NATUR_BLOCK)},${e.art}`;
            if (!sammlung.has(schluessel)) sammlung.set(schluessel, []);
            sammlung.get(schluessel).push({ matrix: _m.clone(), farbe: hell, tx, ty, wind: e.wind ?? 1, hoehe: modell.hoehe });
          }
        });
      }
    }
    // Blöcke bauen
    const blockGruppen = new Map();
    for (const [schluessel, instanzen] of sammlung) {
      const [bx, by, art] = schluessel.split(',');
      const modell = modelle.get(art);
      let material = materialien.get(art);
      if (!material) {
        material = grasMaterial(textur, modell.hoehe);
        materialien.set(art, material);
      }
      const mesh = new THREE.InstancedMesh(modell.geometrie, material, instanzen.length);
      mesh.receiveShadow = false; // dünne Halme: Schattenkarte würde nur Streifen (Akne) erzeugen und kostet Leistung
      mesh.castShadow = false;
      instanzen.forEach((inst, i) => {
        mesh.setMatrixAt(i, inst.matrix);
        mesh.setColorAt(i, _farbe.setScalar(inst.farbe));
        const idx = inst.ty * welt.breite + inst.tx;
        if (!this.anKachel.has(idx)) this.anKachel.set(idx, []);
        this.anKachel.get(idx).push({ mesh, index: i, matrix: inst.matrix });
      });
      mesh.instanceMatrix.needsUpdate = true;
      // fester Hüllkörper des Blocks (inkl. Gras-Höhe) fürs Frustum-Culling
      mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3((Number(bx) + 0.5) * NATUR_BLOCK * g, 10, (Number(by) + 0.5) * NATUR_BLOCK * g), NATUR_BLOCK * g * 0.75 + 20);
      let b = blockGruppen.get(`${bx},${by}`);
      if (!b) {
        b = { gruppe: new THREE.Group(), x: (Number(bx) + 0.5) * NATUR_BLOCK * g, z: (Number(by) + 0.5) * NATUR_BLOCK * g, sichtbar: true };
        blockGruppen.set(`${bx},${by}`, b);
        this.gruppe.add(b.gruppe);
      }
      b.gruppe.add(mesh);
    }
    this.bloecke = [...blockGruppen.values()];
    this.blockRadius2 = (NATUR_SICHTWEITE + NATUR_BLOCK * g * 0.75) ** 2;
    this.blockRadiusEgo2 = (NATUR_SICHTWEITE_EGO + NATUR_BLOCK * g * 0.75) ** 2;
    this.bauwerkeStand = null;
  }

  /** Kacheln, auf denen die Karte selbst etwas Festes hat (Möbel, Bauten): dort wächst nichts. */
  #belegteKacheln() {
    const welt = this.welt;
    const belegt = new Set();
    for (const o of welt.objekte) {
      if (o.typ === 'licht' || o.typ === 'markierung' || o.ebene === 'oben' || o.ebene === 'unsichtbar' || o.ebene === 'boden') continue;
      const x0 = Math.floor(o.x);
      const y0 = Math.floor(o.y);
      for (let y = y0; y < Math.ceil(o.y + (o.h ?? 1)); y++) for (let x = x0; x < Math.ceil(o.x + (o.b ?? 1)); x++) belegt.add(y * welt.breite + x);
    }
    return belegt;
  }

  /** Pro Frame: nur Blöcke in Sichtweite zeichnen; bei neuen/entfernten Spielerbauten Büschel darunter ausblenden. */
  aktualisiere(fokus, bauwerkeVersion, ego = false) {
    const radius2 = ego ? this.blockRadiusEgo2 : this.blockRadius2;
    for (const b of this.bloecke) {
      const sichtbar = (b.x - fokus.x) ** 2 + (b.z - fokus.y) ** 2 < radius2;
      if (sichtbar !== b.sichtbar) {
        b.sichtbar = sichtbar;
        b.gruppe.visible = sichtbar;
      }
    }
    if (bauwerkeVersion !== this.bauwerkeStand) {
      this.bauwerkeStand = bauwerkeVersion;
      this.#belegungAnpassen();
    }
  }

  #belegungAnpassen() {
    const jetzt = new Set(this.welt.ebenenAnKachel.keys());
    const geaendert = new Set();
    for (const idx of this.belegt) if (!jetzt.has(idx)) geaendert.add(idx);
    for (const idx of jetzt) if (!this.belegt.has(idx)) geaendert.add(idx);
    for (const idx of geaendert) {
      const an = jetzt.has(idx);
      for (const inst of this.anKachel.get(idx) ?? []) {
        inst.mesh.setMatrixAt(inst.index, an ? NULL_MATRIX : inst.matrix);
        inst.mesh.instanceMatrix.needsUpdate = true;
      }
    }
    this.belegt = jetzt;
  }

  freigeben() {
    this.gruppe.traverse((o) => o.isInstancedMesh && o.dispose());
  }

  get anzahl() {
    let n = 0;
    for (const e of this.anKachel.values()) n += e.length;
    return n;
  }
}

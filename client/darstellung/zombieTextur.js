import * as THREE from 'three';

/**
 * Zombie-Textur (Runde 29): zieht den realistischen UV-Atlas `assets/3d/skins/zombieAtlas.webp` über die Quaternius-Zombie-GLBs.
 * Deren eigene UVs zeigen nur auf eine Farbpalette – darum werden die UVs hier neu berechnet:
 * Geometrie entindizieren (eine Ecke je Dreieck), jedem Dreieck per Skelett-Gewicht ein Körperteil zuordnen
 * (Kopf, Torso, Arm L/R, Bein L/R) und je Teil auf die passende Insel des Atlas projizieren (Zylinder/Planar).
 * Inseln in Atlas-Pixeln (Original 2576×1438) – siehe INSELN. Nur Darstellung; keine Spiellogik.
 */
const ATLAS_B = 2576;
const ATLAS_H = 1438;
const HELLER = 1.5;

/** Inseln im Atlas: [x0, y0, x1, y1] in Original-Pixeln (y nach unten) */
const INSELN = {
  kopf: { mitteX: 940, halbX: 190, y0: 70, y1: 440 }, // Gesicht frontal, Ohren bei ±190
  torsoVorn: [1360, 250, 1700, 800],
  torsoHinten: [815, 615, 1100, 875],
  armL: [622, 575, 758, 1400],
  armR: [1196, 757, 1322, 1375],
  beinL: [1432, 890, 1566, 1385],
  beinR: [1628, 890, 1760, 1385],
  fleisch: [1615, 118], // rotes Fleisch (Zunge)
  haut: [1035, 155], // graue Haut (Augenlider)
};

const KOPF_MESH = /face|eyelid|tongue|teeth|eye/i;
const KOERPERTEIL_NACH_KNOCHEN = [
  [/head|neck|eyelid|tongue/i, 'kopf'],
  [/arm|hand|pinky|index|middle|thumb|ring|fist|finger/i, 'arm'],
  [/leg|foot|toe/i, 'bein'],
];

function teilFuerKnochen(name) {
  for (const [muster, teil] of KOERPERTEIL_NACH_KNOCHEN) {
    if (!muster.test(name)) continue;
    if (teil === 'kopf') return 'kopf';
    // ⚠ GLTFLoader entfernt Punkte aus Knochennamen: „UpperArm.R“ → „UpperArmR“, „Thumb2.R_end“ → „Thumb2R_end“
    const seite = /[a-z0-9]R(_end)?$|\.R\b|right/.test(name) ? 'R' : 'L';
    return teil === 'arm' ? `arm${seite}` : `bein${seite}`;
  }
  return 'torso';
}

const grenzen = () => ({ min: new THREE.Vector3(Infinity, Infinity, Infinity), max: new THREE.Vector3(-Infinity, -Infinity, -Infinity) });
const norm = (wert, min, max) => (max - min > 1e-6 ? THREE.MathUtils.clamp((wert - min) / (max - min), 0, 1) : 0.5);

/**
 * UVs neu berechnen. mesh: SkinnedMesh (Rest-Pose). Gibt true zurück, wenn umgebaut wurde.
 * Ersetzt mesh.geometry durch eine entindizierte Kopie (Ecken je Dreieck).
 */
function projiziereMesh(mesh) {
  const quelle = mesh.geometry;
  const geo = quelle.index ? quelle.toNonIndexed() : quelle.clone();
  const pos = geo.getAttribute('position');
  const nor = geo.getAttribute('normal');
  const idx = geo.getAttribute('skinIndex');
  const gew = geo.getAttribute('skinWeight');
  const knochen = mesh.skeleton?.bones;
  if (!pos || !idx || !gew || !knochen) return false;
  const dreiecke = pos.count / 3;
  // ⚠ Die Geometrie liegt im Blender-Raum (Z oben, vorn = −Y); erst die Welt-Matrix des Mesh-Knotens (enthält die Drehung)
  // bringt sie in den three-Raum (Y oben, vorn = +Z). Alle Projektionen unten rechnen mit diesen Weltwerten (wp/wn).
  // (Die Bind-Matrix taugt nicht: GLTFLoader bindet vor dem Aktualisieren der Welt-Matrizen → Einheitsmatrix.)
  mesh.updateWorldMatrix(true, false);
  const bind = mesh.matrixWorld;
  const wp = new Float32Array(pos.count * 3);
  const wn = new Float32Array(pos.count * 3);
  const tmp = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    tmp.fromBufferAttribute(pos, i).applyMatrix4(bind);
    wp.set([tmp.x, tmp.y, tmp.z], i * 3);
    if (nor) {
      tmp.fromBufferAttribute(nor, i).transformDirection(bind);
      wn.set([tmp.x, tmp.y, tmp.z], i * 3);
    }
  }

  // 1. Körperteil je Dreieck (Summe der Skelett-Gewichte)
  const teilJeDreieck = new Array(dreiecke);
  const mitte = new Array(dreiecke);
  const grenzenJeTeil = {};
  for (let d = 0; d < dreiecke; d++) {
    const summe = {};
    const m = new THREE.Vector3();
    for (let e = 0; e < 3; e++) {
      const i = d * 3 + e;
      m.x += wp[i * 3] / 3;
      m.y += wp[i * 3 + 1] / 3;
      m.z += wp[i * 3 + 2] / 3;
      for (let k = 0; k < 4; k++) {
        const w = gew.getComponent(i, k);
        if (w <= 0) continue;
        const teil = teilFuerKnochen(knochen[idx.getComponent(i, k)]?.name ?? '');
        summe[teil] = (summe[teil] ?? 0) + w;
      }
    }
    // Gesichts-Meshes (Face/Lider/Zunge) gehören komplett zum Kopf, egal an welchem Knochen sie hängen
    const teil = KOPF_MESH.test(mesh.name ?? '') ? 'kopf' : (Object.entries(summe).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'torso');
    teilJeDreieck[d] = teil;
    mitte[d] = m;
    const g = (grenzenJeTeil[teil] ??= grenzen());
    g.min.min(m);
    g.max.max(m);
  }

  // 2. Arme: Achse (längste Ausdehnung) und Schulterende (näher am Torso) je Arm
  const torsoMitte = grenzenJeTeil.torso ? grenzenJeTeil.torso.min.clone().add(grenzenJeTeil.torso.max).multiplyScalar(0.5) : new THREE.Vector3();
  const armInfo = {};
  for (const seite of ['armL', 'armR']) {
    const g = grenzenJeTeil[seite];
    if (!g) continue;
    const ausd = g.max.clone().sub(g.min);
    const achse = ausd.x >= ausd.y ? 'x' : 'y';
    const quer = achse === 'x' ? 'z' : 'x';
    const mitteAchse = (g.min[achse] + g.max[achse]) / 2;
    // Schulter = Ende der Achse, das dem Torso näher liegt
    const schulterBeiMax = Math.abs(g.max[achse] - torsoMitte[achse]) < Math.abs(g.min[achse] - torsoMitte[achse]);
    armInfo[seite] = { achse, quer, schulterBeiMax, mitteAchse };
  }

  // 3. UV je Ecke
  const uv = new Float32Array(pos.count * 2);
  const setze = (i, px, py) => {
    uv[i * 2] = px / ATLAS_B;
    uv[i * 2 + 1] = 1 - py / ATLAS_H;
  };
  const p = new THREE.Vector3();
  for (let d = 0; d < dreiecke; d++) {
    const teil = teilJeDreieck[d];
    const g = grenzenJeTeil[teil];
    // Dreiecks-Normale (Vorn/Hinten beim Torso)
    let nz = 0;
    if (nor) for (let e = 0; e < 3; e++) nz += wn[(d * 3 + e) * 3 + 2];
    for (let e = 0; e < 3; e++) {
      const i = d * 3 + e;
      p.set(wp[i * 3], wp[i * 3 + 1], wp[i * 3 + 2]);
      if (mesh.name && /eyelid/i.test(mesh.name)) {
        setze(i, INSELN.haut[0], INSELN.haut[1]);
      } else if (mesh.name && /tongue/i.test(mesh.name)) {
        setze(i, INSELN.fleisch[0], INSELN.fleisch[1]);
      } else if (teil === 'kopf') {
        const mx = (g.min.x + g.max.x) / 2;
        const mz = (g.min.z + g.max.z) / 2;
        const winkel = Math.atan2(p.x - mx, p.z - mz);
        const t = norm(p.y, g.min.y, g.max.y);
        // bis ±90° (Ohren) linear über das Gesicht, dahinter schmal auf die Schläfen-/Nackenhaut (Hinterkopf gibt der Atlas nicht her)
        const a = Math.abs(winkel);
        const seite = Math.sign(winkel) || 1;
        const dx = a <= Math.PI / 2 ? (a / (Math.PI / 2)) * INSELN.kopf.halbX : INSELN.kopf.halbX + ((a - Math.PI / 2) / (Math.PI / 2)) * 100;
        setze(i, INSELN.kopf.mitteX + seite * dx, INSELN.kopf.y1 - t * (INSELN.kopf.y1 - INSELN.kopf.y0));
      } else if (teil === 'armL' || teil === 'armR') {
        const a = armInfo[teil];
        const ins = INSELN[teil];
        let t = norm(p[a.achse], g.min[a.achse], g.max[a.achse]);
        if (a.schulterBeiMax) t = 1 - t; // t = 0 an der Schulter
        const u = norm(p[a.quer], g.min[a.quer], g.max[a.quer]);
        setze(i, ins[0] + u * (ins[2] - ins[0]), ins[1] + t * (ins[3] - ins[1]));
      } else if (teil === 'beinL' || teil === 'beinR') {
        const ins = INSELN[teil];
        const t = norm(p.y, g.min.y, g.max.y);
        const u = norm(p.x, g.min.x, g.max.x);
        setze(i, ins[0] + u * (ins[2] - ins[0]), ins[3] - t * (ins[3] - ins[1]));
      } else {
        const ins = nz >= 0 ? INSELN.torsoVorn : INSELN.torsoHinten;
        const u = norm(p.x, g.min.x, g.max.x);
        const t = norm(p.y, g.min.y, g.max.y);
        setze(i, nz >= 0 ? ins[0] + u * (ins[2] - ins[0]) : ins[2] - u * (ins[2] - ins[0]), ins[3] - t * (ins[3] - ins[1]));
      }
    }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  mesh.geometry = geo;
  return true;
}

/** Gemeinsames Material mit dem Atlas (Cache je Textur + Tönung) */
const MATERIALIEN = new Map();
export function zombieMaterial(textur, farbe = null, leuchten = null) {
  const schluessel = `${farbe?.join(',') ?? ''}|${leuchten?.join(',') ?? ''}`;
  let m = MATERIALIEN.get(schluessel);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ map: textur, roughness: 0.92, metalness: 0 });
    // Atlas ist dunkel → Grundton aufhellen (Multiplikator > 1 ist in three erlaubt)
    m.color.setScalar(HELLER);
    if (farbe) m.color.setRGB(farbe[0] * HELLER, farbe[1] * HELLER, farbe[2] * HELLER);
    if (leuchten) {
      m.emissive.setRGB(leuchten[0], leuchten[1], leuchten[2]);
      m.emissiveIntensity = 0.3; // nur ein Hauch, sonst frisst das Glühen die Textur
    }
    MATERIALIEN.set(schluessel, m);
  }
  return m;
}

/**
 * Ganzes GLB-Modell (gltf.scene) mit Atlas versehen: UVs neu projizieren, Material setzen.
 * Fehler (fehlende Attribute …) lassen das Modell unverändert.
 */
export function texturiereZombie(modell, textur) {
  const material = zombieMaterial(textur);
  modell.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    try {
      if (projiziereMesh(o)) o.material = material;
    } catch (fehler) {
      console.warn('Zombie-Textur: Mesh übersprungen', o.name, fehler);
    }
  });
  return modell;
}

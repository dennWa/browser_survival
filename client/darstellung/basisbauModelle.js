import * as THREE from 'three';
import { vereineGeometrien, matrixAus } from './geometrie.js';
import { ebeneVon } from '../../gemeinsam/welt/bauwerke.js';

/**
 * 3D-Darstellung des Basisbaus (gemeinsam/basisbau/teile.js): Modelle der Bauteile, die instanzierte Schicht für
 * Böden/Wände/Dächer (ein Draw-Call je Teiltyp, egal wie groß die Basis ist), der rote Baugebiet-Ring und die Flagge
 * fürs Hologramm. Einzelstücke mit Zustand (Tür, Kiste, Bett) erzeugt bauwerkModelle.erzeugeBauwerk aus diesen Geometrien.
 *
 * Neues Bauteil: Geometrie in GEO_BAUPLAN eintragen (Ursprung = Kachelmitte am Boden, 32 × 32 px), bei vielen gleichen
 * Teilen (Wände, Böden …) zusätzlich in INSTANZ_TYPEN – sonst reicht ein Einzelmodell in bauwerkModelle.js.
 */
const f = (hex) => new THREE.Color(hex);
const teil = (geometrie, matrix, farbe) => ({ geometrie, matrix, farbe: f(farbe) });
const kasten = (b, h, t, x, y, z, farbe) => teil(new THREE.BoxGeometry(b, h, t), matrixAus(x, y, z), farbe);

export const WAND_HOEHE = 64;
const DACH_HOEHE = 5;

/** Material für alle Basisbau-Teile (Vertexfarben). Der Renderer hängt den Wand-Schnitt an (initialisiereBasisbauModelle). */
export const BASIS_MATERIAL = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88 });

/** Typen, die als InstancedMesh gezeichnet werden (viele gleiche Teile): Bauwerk-Typ → { oriented, schatten } */
export const INSTANZ_TYPEN = Object.freeze({
  holzboden: { ausrichtung: false, wirftSchatten: false },
  holzwand: { ausrichtung: false, wirftSchatten: true },
  holzwand_fenster: { ausrichtung: true, wirftSchatten: true },
  holzwand_tuer: { ausrichtung: true, wirftSchatten: true },
  holzdach: { ausrichtung: false, wirftSchatten: true },
});

/** Hat der Typ eine Richtung (Rotation um y = drehung × 90°)? */
export const IST_AUSGERICHTET = new Set(['holzwand_fenster', 'holzwand_tuer', 'holztuer', 'bett']);

export function initialisiereBasisbauModelle({ mitSchnitt }) {
  mitSchnitt(BASIS_MATERIAL);
}

/** Bretterwand aus übereinander gestapelten Planken (Ursprung unten Mitte, 32 breit/tief). */
function plankenWand(von = 0, bis = WAND_HOEHE, breite = 32, tiefe = 32, x = 0) {
  const teile = [];
  const planken = 8;
  const h = WAND_HOEHE / planken;
  for (let i = 0; i < planken; i++) {
    const unten = i * h;
    if (unten + h <= von || unten >= bis) continue;
    const y0 = Math.max(unten, von);
    const y1 = Math.min(unten + h, bis);
    teile.push(kasten(breite, y1 - y0 - 0.4, tiefe, x, (y0 + y1) / 2, 0, i % 2 ? 0x8f6334 : 0x9f7040));
  }
  return teile;
}

const GEO_BAUPLAN = {
  holzboden: () => {
    const teile = [];
    for (let i = 0; i < 4; i++) teile.push(kasten(7.8, 2, 32, -12 + i * 8, 1, 0, i % 2 ? 0xb98650 : 0xc79a62));
    return teile;
  },
  holzwand: () => [...plankenWand(), kasten(32, 1.5, 32, 0, WAND_HOEHE + 0.2, 0, 0x5f4122)],
  // Fensteröffnung quer durch die Wand (drehung 0: Wand läuft Ost-West, man schaut in z-Richtung hindurch)
  holzwand_fenster: () => [
    ...plankenWand(0, 22),
    ...plankenWand(46, WAND_HOEHE),
    kasten(7, 24.2, 32, -12.5, 34, 0, 0x8f6334),
    kasten(7, 24.2, 32, 12.5, 34, 0, 0x8f6334),
    kasten(32, 1.8, 36, 0, 22.4, 0, 0x5f4122), // Fensterbank
    kasten(32, 1.5, 32, 0, WAND_HOEHE + 0.2, 0, 0x5f4122),
  ],
  // Türrahmen: zwei schmale Pfosten + Sturz; der Durchgang bleibt breit genug für die Figur
  holzwand_tuer: () => [
    kasten(3, WAND_HOEHE, 30, -14.5, WAND_HOEHE / 2, 0, 0x7a5028),
    kasten(3, WAND_HOEHE, 30, 14.5, WAND_HOEHE / 2, 0, 0x7a5028),
    ...plankenWand(50, WAND_HOEHE, 26, 32, 0),
    kasten(32, 1.5, 32, 0, WAND_HOEHE + 0.2, 0, 0x5f4122),
  ],
  holzdach: () => [
    kasten(33, DACH_HOEHE, 33, 0, WAND_HOEHE + DACH_HOEHE / 2 + 1, 0, 0xa04a30),
    kasten(33.4, 1.4, 33.4, 0, WAND_HOEHE + DACH_HOEHE + 1.5, 0, 0x7a3624),
    kasten(33.2, 1, 3, 0, WAND_HOEHE + DACH_HOEHE + 1.2, -10, 0x8a4029),
    kasten(33.2, 1, 3, 0, WAND_HOEHE + DACH_HOEHE + 1.2, 10, 0x8a4029),
  ],
  // Türblatt: Scharnier am Ursprung (Pfosten bei x = -13), geschlossen liegt es in der Wandebene
  holztuer: () => [
    kasten(25.5, 49, 2.6, 12.8, 24.6, 0, 0x8a5a2e),
    kasten(25.5, 2.4, 3.4, 12.8, 14, 0, 0x5f4122),
    kasten(25.5, 2.4, 3.4, 12.8, 36, 0, 0x5f4122),
    kasten(3, 3, 4.4, 22, 26, 0, 0xc9ccd1), // Klinke
  ],
  bett: () => [
    kasten(30, 7, 30, 0, 3.5, 0, 0x8a5a2e), // Rahmen
    kasten(26, 6, 26, 1, 9.5, 0, 0xe4dccb), // Matratze
    kasten(26, 2.2, 14, 3.5, 12.6, 0, 0x6f8fc4), // Decke
    kasten(8, 4, 18, -9, 12.5, 0, 0xf7f3e8), // Kissen
    kasten(2.4, 15, 30, -14.5, 7.5, 0, 0x6b4424), // Kopfteil
  ],
  flagge: () => {
    const teile = [teil(new THREE.CylinderGeometry(1.1, 1.4, 62, 8), matrixAus(0, 31, 0), 0x8a8d91)];
    teile.push(kasten(24, 15, 1, 12, 53, 0, 0xc83a2c));
    teile.push(teil(new THREE.CylinderGeometry(7, 9, 2, 12), matrixAus(0, 1, 0), 0x6b5a46));
    return teile;
  },
};

const GEO_CACHE = new Map();
/** Geometrie (alles in einer, Vertexfarben) für einen Bauwerk-Typ des Basisbaus – null, wenn es keine gibt. */
export function bauteilGeometrie(typ) {
  if (!GEO_BAUPLAN[typ]) return null;
  if (!GEO_CACHE.has(typ)) GEO_CACHE.set(typ, vereineGeometrien(GEO_BAUPLAN[typ](), { mitFarbe: true }));
  return GEO_CACHE.get(typ);
}

const NULL_MATRIX = new THREE.Matrix4().makeScale(0, 0, 0);
const HILFS = new THREE.Matrix4();
const HILFS_Q = new THREE.Quaternion();
const HILFS_P = new THREE.Vector3();
const HILFS_S = new THREE.Vector3(1, 1, 1);
const ACHSE_Y = new THREE.Vector3(0, 1, 0);

/**
 * Alle Böden, Wände, Fenster, Türrahmen und Dächer einer Welt: je Typ ein InstancedMesh. Neu aufgebaut wird nur, wenn sich
 * welt.bauwerkeVersion ändert (ein Durchlauf über die Bauwerke). Dächer verschwinden über dem Gebäude, in dem man steht.
 */
export class BasisbauSchicht {
  constructor(szene) {
    this.szene = szene;
    this.meshes = new Map(); // Typ → { mesh, kapazitaet }
    this.version = -1;
    this.fokusKachel = -1;
    this.dachListe = []; // [{ tx, ty }] in Instanz-Reihenfolge
    this.dachIndex = new Map(); // Kachelindex → Instanz-Nr.
    this.versteckteDaecher = new Set();
  }

  leeren() {
    for (const { mesh } of this.meshes.values()) {
      this.szene.remove(mesh);
      mesh.dispose();
    }
    this.meshes.clear();
    this.version = -1;
    this.fokusKachel = -1;
    this.dachListe = [];
    this.dachIndex.clear();
    this.versteckteDaecher.clear();
  }

  /** @param fokus { x, y } Weltpixel der eigenen Figur */
  aktualisiere(welt, fokus) {
    const g = welt.kachelGroesse;
    const fokusKachel = Math.floor(fokus.y / g) * welt.breite + Math.floor(fokus.x / g);
    const neu = welt.bauwerkeVersion !== this.version;
    if (neu) {
      this.version = welt.bauwerkeVersion;
      this.#baueInstanzen(welt);
    }
    if (neu || fokusKachel !== this.fokusKachel) {
      this.fokusKachel = fokusKachel;
      this.#aktualisiereDaecher(welt, Math.floor(fokus.x / g), Math.floor(fokus.y / g));
    }
  }

  #baueInstanzen(welt) {
    const g = welt.kachelGroesse;
    const listen = new Map(Object.keys(INSTANZ_TYPEN).map((t) => [t, []]));
    for (const b of welt.bauwerke.values()) listen.get(b.typ)?.push(b);
    this.dachListe = listen.get('holzdach').map((b) => ({ tx: b.tx, ty: b.ty }));
    this.dachIndex = new Map(this.dachListe.map((d, i) => [d.ty * welt.breite + d.tx, i]));
    for (const [typ, liste] of listen) {
      let eintrag = this.meshes.get(typ);
      if (liste.length === 0) {
        if (eintrag) eintrag.mesh.count = 0;
        continue;
      }
      if (!eintrag || eintrag.kapazitaet < liste.length) {
        if (eintrag) {
          this.szene.remove(eintrag.mesh);
          eintrag.mesh.dispose();
        }
        const kapazitaet = Math.max(32, 2 ** Math.ceil(Math.log2(liste.length)));
        const mesh = new THREE.InstancedMesh(bauteilGeometrie(typ), BASIS_MATERIAL, kapazitaet);
        mesh.frustumCulled = false; // Instanzen liegen überall – die Hülle der Basisgeometrie passt nicht
        mesh.castShadow = INSTANZ_TYPEN[typ].wirftSchatten;
        mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false;
        this.szene.add(mesh);
        eintrag = { mesh, kapazitaet };
        this.meshes.set(typ, eintrag);
      }
      const { mesh } = eintrag;
      mesh.count = liste.length;
      liste.forEach((b, i) => {
        HILFS_P.set((b.tx + 0.5) * g, 0, (b.ty + 0.5) * g);
        HILFS_Q.setFromAxisAngle(ACHSE_Y, INSTANZ_TYPEN[typ].ausrichtung ? (b.drehung ?? 0) * (Math.PI / 2) : 0);
        mesh.setMatrixAt(i, HILFS.compose(HILFS_P, HILFS_Q, HILFS_S));
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
    this.versteckteDaecher.clear();
  }

  /** Steht man unter einem Dach, werden alle zusammenhängenden Dachkacheln unsichtbar (wie bei einem aufgeklappten Puppenhaus). */
  #aktualisiereDaecher(welt, tx, ty) {
    const eintrag = this.meshes.get('holzdach');
    if (!eintrag || this.dachListe.length === 0) return;
    const soll = new Set();
    const start = this.dachIndex.get(ty * welt.breite + tx);
    if (start !== undefined) {
      const warteschlange = [[tx, ty]];
      soll.add(start);
      while (warteschlange.length > 0 && soll.size < 600) {
        const [x, y] = warteschlange.pop();
        for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
          const i = this.dachIndex.get((y + dy) * welt.breite + (x + dx));
          if (i === undefined || soll.has(i)) continue;
          soll.add(i);
          warteschlange.push([x + dx, y + dy]);
        }
      }
    }
    // Nur Instanzen anfassen, deren Zustand sich geändert hat
    const g = welt.kachelGroesse;
    let geaendert = false;
    for (const i of new Set([...this.versteckteDaecher, ...soll])) {
      if (this.versteckteDaecher.has(i) === soll.has(i)) continue;
      const d = this.dachListe[i];
      if (soll.has(i)) eintrag.mesh.setMatrixAt(i, NULL_MATRIX);
      else eintrag.mesh.setMatrixAt(i, HILFS.makeTranslation((d.tx + 0.5) * g, 0, (d.ty + 0.5) * g));
      geaendert = true;
    }
    this.versteckteDaecher = soll;
    if (geaendert) eintrag.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------
// Baugebiet-Ring (nur dem Besitzer gezeigt) und Flaggen-Modell fürs Hologramm

let ringTextur = null;
function ringTexturErzeugen() {
  if (ringTextur) return ringTextur;
  const groesse = 512;
  const leinwand = document.createElement('canvas');
  leinwand.width = leinwand.height = groesse;
  const c = leinwand.getContext('2d');
  const mitte = groesse / 2;
  // zarte Füllung, nach außen dichter
  const verlauf = c.createRadialGradient(mitte, mitte, mitte * 0.55, mitte, mitte, mitte);
  verlauf.addColorStop(0, 'rgba(255,255,255,0)');
  verlauf.addColorStop(1, 'rgba(255,255,255,0.16)');
  c.fillStyle = verlauf;
  c.beginPath();
  c.arc(mitte, mitte, mitte - 2, 0, Math.PI * 2);
  c.fill();
  // gestrichelter Rand
  c.strokeStyle = 'rgba(255,255,255,0.95)';
  c.lineWidth = 7;
  c.lineCap = 'round';
  const striche = 64;
  for (let i = 0; i < striche; i++) {
    const a0 = (i / striche) * Math.PI * 2;
    c.beginPath();
    c.arc(mitte, mitte, mitte - 7, a0, a0 + (Math.PI * 2) / striche * 0.6);
    c.stroke();
  }
  ringTextur = new THREE.CanvasTexture(leinwand);
  ringTextur.colorSpace = THREE.SRGBColorSpace;
  return ringTextur;
}

/** Flacher Kreis mit gestricheltem Rand auf dem Boden. setze() verschiebt/skaliert/färbt ihn; animiere() lässt die Striche wandern. */
export function erzeugeGebietRing(farbe = 0xff3b30) {
  const material = new THREE.MeshBasicMaterial({ map: ringTexturErzeugen(), color: farbe, transparent: true, opacity: 0.9, depthWrite: false, fog: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), material);
  mesh.visible = false;
  mesh.renderOrder = 2;
  mesh.frustumCulled = false;
  return {
    mesh,
    /** @param mitteX,mitteZ Weltpixel · radiusPx Kreisradius */
    setze(mitteX, mitteZ, radiusPx, farbeNeu = null) {
      mesh.position.set(mitteX, 0.45, mitteZ);
      mesh.scale.set(radiusPx * 2, 1, radiusPx * 2);
      if (farbeNeu !== null) material.color.setHex(farbeNeu);
      mesh.visible = true;
    },
    verstecke() {
      mesh.visible = false;
    },
    animiere(jetzt) {
      mesh.rotation.y = jetzt / 12000;
    },
  };
}

/** Typ aus dem Bauwerk (Ebene egal) – kleine Hilfe für Renderer-Auswahl: wird dieses Bauwerk instanziert gezeichnet? */
export const wirdInstanziert = (typ) => Object.hasOwn(INSTANZ_TYPEN, typ);

/** Höhe der Abriss-Markierung je Ebene (px). */
export function markierungsHoehe(typ) {
  switch (ebeneVon(typ)) {
    case 'boden':
      return 4;
    case 'dach':
      return WAND_HOEHE + DACH_HOEHE + 4;
    case 'objekt':
      return 22;
    default:
      return WAND_HOEHE + 2;
  }
}

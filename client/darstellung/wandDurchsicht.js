import * as THREE from 'three';
import { wendeWandTexturAn } from './wandTexturen.js';

/**
 * Wand-Durchsicht (Runde 18): Steht man in einem Raum (Innenboden, den Türen begrenzen – `Daecher.raumBei`), werden NUR die
 * Wände dieses Raums durchsichtig, die die Figur verdecken können: Wandkacheln der Raumhülle (`Daecher.huelleVonRaum`), die
 * zwischen Kamera und Figur liegen – die Kamera schaut von Süden, also v. a. die Südwand – und nahe an der Figur sind
 * (`DURCHSICHT_NAH`, `verdecktFigur`). Läuft man durch den Raum, blenden die Kacheln einzeln weich auf und zu.
 * Draußen, in fremden Räumen und weiter entfernte Wände bleiben dicht.
 *
 * Technik (Performance!): Die Wände der Karte sind EIN InstancedMesh. Durchsichtige Kacheln werden dort auf Maßstab 0 gesetzt
 * und stattdessen als kleines, zusammengefasstes Mesh gezeichnet (nur sichtbare Außenflächen – sonst scheinen Innenflächen
 * aneinanderstoßender Quader doppelt durch), Material transparent, `depthWrite: false` (Figuren/Möbel dahinter bleiben
 * unverdeckt). Deckkraft je Kachel über Vertex-Alpha (Farbattribut mit 4 Werten), blendet exponentiell; ist eine Kachel wieder
 * dicht, gehen ihre Instanzen zurück ins große Mesh. Aus im Ego-Modus. Die Schatten bleiben (das Mesh wirft sie wie die Wand).
 */
export const DURCHSICHT_SEITE = 0.27; // Deckkraft der Wandseiten, wenn ganz durchsichtig
export const DURCHSICHT_OBEN = 0.62; // Wandoberkante bleibt kräftiger → Grundriss bleibt lesbar
const BLEND_TEMPO = 6; // 1/s: Annäherung an den Zielwert (e-Funktion)
const NULL_MATRIX = new THREE.Matrix4().makeScale(0, 0, 0);
const _m = new THREE.Matrix4();

/**
 * Sichtbare Flächen einer Menge von Wandstücken (Quader der Grundfläche g × g).
 * Seitenflächen, an denen ein gleich hohes Stück derselben Menge anschließt, fallen weg; Unterseiten gibt es nicht.
 * @param teile  [{ x, z, unten, hoehe }] (x/z = Mitte)
 * @param nachbarn  Stücke, die Seitenflächen verdecken (Standard: dieselbe Menge; Teilmengen für Eckbereiche je Kachel)
 * @returns { seite: { pos, nor }, oben: { pos, nor } } (Float32Array, 3 Zahlen je Ecke, Dreiecke gegen den Uhrzeigersinn von außen)
 */
export function durchsichtFlaechen(teile, g, nachbarn = teile) {
  const schluessel = (x, z, u, h) => `${Math.round(x)},${Math.round(z)},${Math.round(u * 10)},${Math.round(h * 10)}`;
  const da = new Set(nachbarn.map((t) => schluessel(t.x, t.z, t.unten, t.hoehe)));
  const seite = { pos: [], nor: [] };
  const oben = { pos: [], nor: [] };
  const flaeche = (ziel, ecken, n) => {
    for (const i of [0, 1, 2, 0, 2, 3]) ziel.pos.push(...ecken[i]);
    for (let i = 0; i < 6; i++) ziel.nor.push(...n);
  };
  const h = g / 2;
  for (const t of teile) {
    const x0 = t.x - h;
    const x1 = t.x + h;
    const z0 = t.z - h;
    const z1 = t.z + h;
    const y0 = t.unten;
    const y1 = t.unten + t.hoehe;
    flaeche(oben, [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], [0, 1, 0]);
    if (!da.has(schluessel(t.x + g, t.z, t.unten, t.hoehe))) flaeche(seite, [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0]);
    if (!da.has(schluessel(t.x - g, t.z, t.unten, t.hoehe))) flaeche(seite, [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0]);
    if (!da.has(schluessel(t.x, t.z + g, t.unten, t.hoehe))) flaeche(seite, [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1]);
    if (!da.has(schluessel(t.x, t.z - g, t.unten, t.hoehe))) flaeche(seite, [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1]);
  }
  const fertig = (f) => ({ pos: new Float32Array(f.pos), nor: new Float32Array(f.nor) });
  return { seite: fertig(seite), oben: fertig(oben) };
}

/** Deckkraft (Seite, Oberkante) bei Durchsichtigkeit `anteil` 0..1 */
export function durchsichtDeckkraft(anteil) {
  return { seite: 1 - anteil * (1 - DURCHSICHT_SEITE), oben: 1 - anteil * (1 - DURCHSICHT_OBEN) };
}

/** So nah (Kacheln) an der Figur werden verdeckende Wände durchsichtig: vorn = Richtung Kamera (Süden), seitlich = quer dazu. */
export const DURCHSICHT_NAH = { vorn: 4, seitlich: 3 };

/**
 * Kann eine Wandkachel mit Versatz (dtx, dty) zur Kachel der Figur die Figur verdecken? Die Kamera schaut von Süden (+y) schräg
 * herab → nur Wände südlich der Figur (dty ≥ 1), nicht weiter als `vorn`, seitlich höchstens `seitlich` (+1 je zwei Reihen
 * weiter vorn, weil der Blickkegel dort breiter ist).
 */
export function verdecktFigur(dtx, dty, nah = DURCHSICHT_NAH) {
  if (dty < 1 || dty > nah.vorn) return false;
  return Math.abs(dtx) <= nah.seitlich + Math.floor((dty - 1) / 2);
}

export class WandDurchsicht {
  /**
   * @param wand  das große Wand-InstancedMesh der Karte
   * @param teile  [{ x, z, unten, hoehe }] – Instanz i von `wand` ist teile[i]
   * @param instanzVon  Map Kachelindex → [Instanz-Nummern] der Wand/Fenster/Tür-Teile dieser Kachel
   * @param daecher  `Daecher` (raumBei, huelleVonRaum) oder null
   * @param breite  Kartenbreite in Kacheln (Kachelindex = ty * breite + tx)
   * @param seite,oben  Wandmaterialien (werden geklont)
   */
  constructor({ wand, teile, instanzVon, daecher, g, breite, seite, oben, mitSchnitt = (m) => m }) {
    this.wand = wand;
    this.teile = teile;
    this.instanzVon = instanzVon;
    this.daecher = daecher;
    this.g = g;
    this.breite = breite;
    this.mitSchnitt = mitSchnitt;
    this.original = wand.instanceMatrix.array.slice(); // Ausgangsmatrizen zum Zurückstellen
    this.gruppe = new THREE.Group();
    this.matSeite = this.#material(seite);
    this.matOben = this.#material(oben);
    this.aktiv = new Map(); // Kachelindex → { anteil 0..1, ziel 0|1 } – Kacheln, die gerade im Durchsicht-Mesh liegen
    this.mesh = null;
    this.bereiche = []; // [{ idx, seite:[start, anzahl], oben:[start, anzahl] }] Ecken je Kachel im Mesh (für die Deckkraft)
    this.raum = -1;
    this.kachel = -1;
  }

  /** Pro Frame. an = false (Ego-Modus u. ä.) → alles zu. @param x,y Weltpixel der eigenen Figur */
  aktualisiere(dt, x, y, an = true) {
    const raum = an && this.daecher ? this.daecher.raumBei(x, y) : -1;
    const tx = Math.floor(x / this.g);
    const ty = Math.floor(y / this.g);
    const kachel = raum >= 0 ? ty * this.breite + tx : -1;
    let neuBauen = false;
    if (raum !== this.raum || kachel !== this.kachel) {
      this.raum = raum;
      this.kachel = kachel;
      const soll = new Set();
      if (raum >= 0) {
        for (const idx of this.daecher.huelleVonRaum[raum]) {
          if (!this.instanzVon.has(idx)) continue;
          if (verdecktFigur((idx % this.breite) - tx, Math.floor(idx / this.breite) - ty)) soll.add(idx);
        }
      }
      for (const [idx, k] of this.aktiv) if (!soll.has(idx)) k.ziel = 0;
      for (const idx of soll) {
        const k = this.aktiv.get(idx);
        if (k) k.ziel = 1;
        else {
          this.aktiv.set(idx, { anteil: 0, ziel: 1 });
          for (const i of this.instanzVon.get(idx)) this.wand.setMatrixAt(i, NULL_MATRIX);
          this.wand.instanceMatrix.needsUpdate = true;
          neuBauen = true;
        }
      }
    }
    let alpha = false;
    const schritt = Math.min(1, dt * BLEND_TEMPO);
    for (const [idx, k] of this.aktiv) {
      if (k.anteil === k.ziel) continue;
      k.anteil += (k.ziel - k.anteil) * schritt;
      if (Math.abs(k.ziel - k.anteil) < 0.012) k.anteil = k.ziel;
      alpha = true;
      if (k.ziel === 0 && k.anteil === 0) {
        this.#zurueck(idx);
        this.aktiv.delete(idx);
        neuBauen = true;
      }
    }
    if (neuBauen) this.#baueMesh();
    else if (alpha) this.#setzeDeckkraft();
  }

  /** Wände sofort zurück ins große Mesh (z. B. beim Abbau) */
  zuruecksetzen() {
    for (const idx of this.aktiv.keys()) this.#zurueck(idx);
    this.aktiv.clear();
    this.#baueMesh();
    this.raum = -1;
    this.kachel = -1;
  }

  #zurueck(idx) {
    for (const i of this.instanzVon.get(idx)) {
      _m.fromArray(this.original, i * 16);
      this.wand.setMatrixAt(i, _m);
    }
    this.wand.instanceMatrix.needsUpdate = true;
  }

  #material(vorlage) {
    const m = vorlage.clone();
    if (vorlage.userData.wandTextur) wendeWandTexturAn(m, vorlage.userData.wandTextur); // onBeforeCompile geht beim Klonen verloren
    m.transparent = true;
    m.depthWrite = false;
    m.vertexColors = true; // Farbattribut mit Alpha = Deckkraft je Kachel
    return this.mitSchnitt(m);
  }

  #entferneMesh() {
    if (!this.mesh) return;
    this.gruppe.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh = null;
  }

  #baueMesh() {
    this.#entferneMesh();
    this.bereiche = [];
    if (this.aktiv.size === 0) return;
    // Alle aktiven Kacheln zusammen betrachten (Innenflächen zwischen Nachbarn fallen weg), aber je Kachel ein eigener Eckbereich
    const alle = [];
    for (const idx of this.aktiv.keys()) for (const i of this.instanzVon.get(idx)) alle.push(this.teile[i]);
    const seitePos = [];
    const seiteNor = [];
    const obenPos = [];
    const obenNor = [];
    for (const idx of this.aktiv.keys()) {
      const eigene = this.instanzVon.get(idx).map((i) => this.teile[i]);
      const f = durchsichtFlaechen(eigene, this.g, alle);
      this.bereiche.push({ idx, seite: [seitePos.length / 3, f.seite.pos.length / 3], oben: [obenPos.length / 3, f.oben.pos.length / 3] });
      for (const v of f.seite.pos) seitePos.push(v);
      for (const v of f.seite.nor) seiteNor.push(v);
      for (const v of f.oben.pos) obenPos.push(v);
      for (const v of f.oben.nor) obenNor.push(v);
    }
    const anzahlSeite = seitePos.length / 3;
    const pos = new Float32Array(seitePos.length + obenPos.length);
    const nor = new Float32Array(pos.length);
    pos.set(seitePos);
    pos.set(obenPos, seitePos.length);
    nor.set(seiteNor);
    nor.set(obenNor, seiteNor.length);
    for (const b of this.bereiche) b.oben[0] += anzahlSeite;
    const geometrie = new THREE.BufferGeometry();
    geometrie.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geometrie.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geometrie.setAttribute('color', new THREE.BufferAttribute(new Float32Array((pos.length / 3) * 4).fill(1), 4));
    geometrie.addGroup(0, anzahlSeite, 0);
    geometrie.addGroup(anzahlSeite, obenPos.length / 3, 1);
    geometrie.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometrie, [this.matSeite, this.matOben]);
    mesh.castShadow = true; // Schatten wie die Wand davor (Tiefenmaterial ignoriert Durchsichtigkeit)
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.matrixWorldAutoUpdate = false;
    mesh.renderOrder = 2; // nach Boden/Wasser (depthWrite aus)
    this.mesh = mesh;
    this.gruppe.add(mesh);
    this.#setzeDeckkraft();
  }

  #setzeDeckkraft() {
    if (!this.mesh) return;
    const farbe = this.mesh.geometry.attributes.color;
    const a = farbe.array;
    for (const b of this.bereiche) {
      const deck = durchsichtDeckkraft(this.aktiv.get(b.idx)?.anteil ?? 0);
      for (const [art, wert] of [['seite', deck.seite], ['oben', deck.oben]]) {
        const [start, anzahl] = b[art];
        for (let e = start; e < start + anzahl; e++) a[e * 4 + 3] = wert;
      }
    }
    farbe.needsUpdate = true;
  }
}

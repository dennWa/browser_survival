import * as THREE from 'three';

/**
 * Wand-Durchsicht: Steht man in einem Raum (Innenboden, den Türen begrenzen – `Daecher.raumBei`), werden genau die Wände
 * dieses Raums (`Daecher.huelleVonRaum`: Wand/Fenster/Tür-Sturz am Innenboden) weich durchsichtig. Andere Räume und
 * Außenwände fremder Gebäude bleiben dicht. Beim Verlassen/Raumwechsel blenden sie wieder zu.
 *
 * Technik (Performance!): Die Wände der Karte sind EIN InstancedMesh. Beim Betreten werden die Instanzen des Raums dort auf
 * Maßstab 0 gesetzt und stattdessen als kleines, zusammengefasstes „Platte“-Mesh gezeichnet (nur sichtbare Außenflächen –
 * sonst scheinen Innenflächen aneinanderstoßender Quader doppelt durch), Material transparent, `depthWrite: false`
 * (Figuren/Möbel dahinter bleiben unverdeckt). Deckkraft blendet exponentiell; ist die Platte wieder dicht, gehen die
 * Instanzen zurück ins große Mesh. Aus im Ego-Modus. Die Schatten bleiben unverändert (Platte wirft sie wie die Wand).
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
 * @returns { seite: { pos, nor }, oben: { pos, nor } } (Float32Array, 3 Zahlen je Ecke, Dreiecke gegen den Uhrzeigersinn von außen)
 */
export function durchsichtFlaechen(teile, g) {
  const schluessel = (x, z, u, h) => `${Math.round(x)},${Math.round(z)},${Math.round(u * 10)},${Math.round(h * 10)}`;
  const da = new Set(teile.map((t) => schluessel(t.x, t.z, t.unten, t.hoehe)));
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

export class WandDurchsicht {
  /**
   * @param wand  das große Wand-InstancedMesh der Karte
   * @param teile  [{ x, z, unten, hoehe }] – Instanz i von `wand` ist teile[i]
   * @param instanzVon  Map Kachelindex → [Instanz-Nummern] der Wand/Fenster/Tür-Teile dieser Kachel
   * @param daecher  `Daecher` (raumBei, huelleVonRaum) oder null
   * @param seite,oben  Wandmaterialien (werden geklont)
   */
  constructor({ wand, teile, instanzVon, daecher, g, seite, oben, mitSchnitt = (m) => m }) {
    this.wand = wand;
    this.teile = teile;
    this.instanzVon = instanzVon;
    this.daecher = daecher;
    this.g = g;
    this.vorlage = { seite, oben };
    this.mitSchnitt = mitSchnitt;
    this.original = wand.instanceMatrix.array.slice(); // Ausgangsmatrizen zum Zurückstellen
    this.gruppe = new THREE.Group();
    this.platten = []; // aktive Platten: { raum, kacheln:Set, mesh, matSeite, matOben, anteil, ziel }
    this.eigner = new Map(); // Kachelindex → Platte, die diese Wand gerade zeigt
    this.raum = -1;
  }

  /** Pro Frame. an = false (Ego-Modus u. ä.) → alles zu. @param x,y Weltpixel der eigenen Figur */
  aktualisiere(dt, x, y, an = true) {
    const raum = an && this.daecher ? this.daecher.raumBei(x, y) : -1;
    if (raum !== this.raum) {
      this.raum = raum;
      for (const p of this.platten) p.ziel = 0;
      if (raum >= 0) this.#oeffne(raum);
    }
    for (let i = this.platten.length - 1; i >= 0; i--) {
      const p = this.platten[i];
      const k = Math.min(1, dt * BLEND_TEMPO);
      p.anteil += (p.ziel - p.anteil) * k;
      if (Math.abs(p.ziel - p.anteil) < 0.012) p.anteil = p.ziel;
      const deck = durchsichtDeckkraft(p.anteil);
      p.matSeite.opacity = deck.seite;
      p.matOben.opacity = deck.oben;
      if (p.ziel === 0 && p.anteil === 0) this.#schliesse(p, i);
    }
  }

  /** Wände aller Platten sofort zurück ins große Mesh (z. B. beim Abbau) */
  zuruecksetzen() {
    for (let i = this.platten.length - 1; i >= 0; i--) this.#schliesse(this.platten[i], i);
    this.raum = -1;
  }

  #oeffne(raum) {
    let platte = this.platten.find((p) => p.raum === raum);
    if (!platte) {
      platte = { raum, kacheln: new Set(), mesh: null, matSeite: this.#material(this.vorlage.seite), matOben: this.#material(this.vorlage.oben), anteil: 0, ziel: 1 };
      this.platten.push(platte);
    }
    platte.ziel = 1;
    let geaendert = false;
    for (const idx of this.daecher.huelleVonRaum[raum]) {
      if (platte.kacheln.has(idx) || !this.instanzVon.has(idx)) continue;
      const alt = this.eigner.get(idx);
      if (alt && alt !== platte) {
        alt.kacheln.delete(idx);
        this.#baueMesh(alt);
        if (alt.kacheln.size === 0) alt.ziel = 0;
      } else {
        for (const i of this.instanzVon.get(idx)) this.wand.setMatrixAt(i, NULL_MATRIX);
        geaendert = true;
      }
      platte.kacheln.add(idx);
      this.eigner.set(idx, platte);
    }
    if (geaendert) this.wand.instanceMatrix.needsUpdate = true;
    this.#baueMesh(platte);
  }

  #schliesse(platte, index) {
    for (const idx of platte.kacheln) {
      for (const i of this.instanzVon.get(idx)) {
        _m.fromArray(this.original, i * 16);
        this.wand.setMatrixAt(i, _m);
      }
      this.eigner.delete(idx);
    }
    if (platte.kacheln.size) this.wand.instanceMatrix.needsUpdate = true;
    this.#entferneMesh(platte);
    platte.matSeite.dispose();
    platte.matOben.dispose();
    this.platten.splice(index, 1);
  }

  #material(vorlage) {
    const m = vorlage.clone();
    m.transparent = true;
    m.depthWrite = false;
    return this.mitSchnitt(m);
  }

  #entferneMesh(platte) {
    if (!platte.mesh) return;
    this.gruppe.remove(platte.mesh);
    platte.mesh.geometry.dispose();
    platte.mesh = null;
  }

  #baueMesh(platte) {
    this.#entferneMesh(platte);
    if (platte.kacheln.size === 0) return;
    const teile = [];
    for (const idx of platte.kacheln) for (const i of this.instanzVon.get(idx)) teile.push(this.teile[i]);
    const f = durchsichtFlaechen(teile, this.g);
    const pos = new Float32Array(f.seite.pos.length + f.oben.pos.length);
    const nor = new Float32Array(pos.length);
    pos.set(f.seite.pos);
    pos.set(f.oben.pos, f.seite.pos.length);
    nor.set(f.seite.nor);
    nor.set(f.oben.nor, f.seite.nor.length);
    const geometrie = new THREE.BufferGeometry();
    geometrie.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geometrie.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geometrie.addGroup(0, f.seite.pos.length / 3, 0);
    geometrie.addGroup(f.seite.pos.length / 3, f.oben.pos.length / 3, 1);
    geometrie.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometrie, [platte.matSeite, platte.matOben]);
    mesh.castShadow = true; // Schatten wie die Wand davor (Tiefenmaterial ignoriert Durchsichtigkeit)
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.matrixWorldAutoUpdate = false;
    mesh.renderOrder = 2; // nach Boden/Wasser, vor Silhouetten-Effekten ist unkritisch (depthWrite aus)
    platte.mesh = mesh;
    this.gruppe.add(mesh);
  }
}

import * as THREE from 'three';

/**
 * Render-Culling für die Karte (Runde 18, 4.1):
 *   - BlockInstanzen: viele gleiche Teile (Wände, Glas, Laternen …) als ein InstancedMesh JE RÄUMLICHEM BLOCK statt eines
 *     einzigen Meshes über die ganze Karte (das wurde jedes Bild – auch im Schattendurchgang – komplett gezeichnet).
 *     Nach außen verhält es sich wie EIN InstancedMesh: setMatrixAt/setColorAt mit der globalen Instanz-Nummer,
 *     instanceMatrix.array (Ausgangsmatrizen), instanceMatrix/instanceColor.needsUpdate, material, visible.
 *   - Sichtweite: Blöcke weiter als Nebelweite + Puffer von der Kamera werden ausgeblendet (KartenModell.kulle).
 */

/** Kantenlänge der Blöcke (Kacheln) für Wände, Laternenmasten und Möbel. Gemessen (Runde 18): 16/32 kosteten +50–100 % Draw-Calls bei kaum
 * weniger Dreiecken; 64 = Stadtrand ±0–15 % Calls, −8–10 % Dreiecke, an der Zonengrenze −17 % Dreiecke (Nachbarkarte); große Editor-Karten profitieren am meisten. */
export const BLOCK_KACHELN = 64;
/** Zusätzlich zur Nebelweite (px): Blöcke knapp dahinter bleiben sichtbar (kein Aufploppen am Nebelrand) */
export const SICHT_PUFFER = 256;

/** Box mit nur ZWEI Materialgruppen (0 = Seiten, 1 = Deckel/Boden) statt sechs → 2 statt 6 Draw-Calls je Block. */
export function boxZweiGruppen(b, h, t) {
  const box = new THREE.BoxGeometry(b, h, t);
  const index = box.index.array;
  const seiten = [];
  const deckel = [];
  for (const gr of box.groups) {
    const ziel = gr.materialIndex === 2 || gr.materialIndex === 3 ? deckel : seiten;
    for (let i = gr.start; i < gr.start + gr.count; i++) ziel.push(index[i]);
  }
  box.setIndex([...seiten, ...deckel]);
  box.clearGroups();
  box.addGroup(0, seiten.length, 0);
  box.addGroup(seiten.length, deckel.length, 1);
  return box;
}

export class BlockInstanzen extends THREE.Group {
  /**
   * @param geometrie  geteilte Geometrie
   * @param material   Material (oder Array passend zu den Gruppen)
   * @param matrizen   Matrix4 je Instanz (Position bestimmt den Block)
   * @param o.blockPx  Kantenlänge eines Blocks in Pixeln
   * @param o.farben   optional Color je Instanz
   */
  constructor(geometrie, material, matrizen, { blockPx, farben = null } = {}) {
    super();
    this._material = material;
    const n = matrizen.length;
    this.anzahl = n;
    this.blockNr = new Int32Array(n);
    this.lokal = new Int32Array(n);
    const bloecke = new Map(); // Schlüssel → [globale Nummern]
    matrizen.forEach((m, i) => {
      const k = `${Math.floor(m.elements[12] / blockPx)},${Math.floor(m.elements[14] / blockPx)}`;
      if (!bloecke.has(k)) bloecke.set(k, []);
      bloecke.get(k).push(i);
    });
    this.meshes = [];
    const alle = new Float32Array(n * 16);
    for (const nummern of bloecke.values()) {
      const mesh = new THREE.InstancedMesh(geometrie, material, nummern.length);
      nummern.forEach((i, l) => {
        mesh.setMatrixAt(l, matrizen[i]);
        if (farben) mesh.setColorAt(l, farben[i]);
        matrizen[i].toArray(alle, i * 16);
        this.blockNr[i] = this.meshes.length;
        this.lokal[i] = l;
      });
      mesh.computeBoundingSphere(); // fest: ausgeblendete Instanzen (Nullmatrix) ändern die Kugel nicht mehr
      mesh.frustumCulled = true;
      this.meshes.push(mesh);
      this.add(mesh);
    }
    const geaendert = new Set();
    const farbeGeaendert = new Set();
    this._geaendert = geaendert;
    this._farbeGeaendert = farbeGeaendert;
    this.instanceMatrix = {
      array: alle, // Ausgangsmatrizen (WandDurchsicht stellt damit zurück)
      set needsUpdate(_) {
        for (const mesh of geaendert) mesh.instanceMatrix.needsUpdate = true;
        geaendert.clear();
      },
    };
    this.instanceColor = {
      set needsUpdate(_) {
        for (const mesh of farbeGeaendert) if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        farbeGeaendert.clear();
      },
    };
  }

  get material() {
    return this._material;
  }

  get count() {
    return this.anzahl;
  }

  /** Schatten werfen/empfangen für alle Blöcke */
  schatten(werfen, empfangen = werfen) {
    for (const m of this.meshes) {
      m.castShadow = werfen;
      m.receiveShadow = empfangen;
    }
    return this;
  }

  setMatrixAt(i, matrix) {
    const mesh = this.meshes[this.blockNr[i]];
    mesh.setMatrixAt(this.lokal[i], matrix);
    this._geaendert.add(mesh);
  }

  getMatrixAt(i, matrix) {
    return this.meshes[this.blockNr[i]].getMatrixAt(this.lokal[i], matrix);
  }

  setColorAt(i, farbe) {
    const mesh = this.meshes[this.blockNr[i]];
    mesh.setColorAt(this.lokal[i], farbe);
    this._farbeGeaendert.add(mesh);
  }

  /** Einträge für das Sichtweiten-Culling: [{ objekt, x, y, z, r }] (Modell-Koordinaten) */
  kulEintraege() {
    return this.meshes.map((m) => kulEintrag(m, m.boundingSphere));
  }
}

/** Eintrag fürs Sichtweiten-Culling aus einer Kugel (Modell-Koordinaten). */
export function kulEintrag(objekt, kugel) {
  return { objekt, x: kugel.center.x, y: kugel.center.y, z: kugel.center.z, r: kugel.radius, sichtbar: true };
}

/**
 * Sichtweiten-Culling: Einträge weiter als `weite` (+ ihr Radius) von der Kamera (Modell-Koordinaten) → visible = false.
 * Setzt nur bei Änderung (kein Aufwand für three.js). @returns Anzahl sichtbarer Einträge
 */
export function kulleNachWeite(eintraege, kx, ky, kz, weite) {
  let n = 0;
  for (const e of eintraege) {
    const d = Math.hypot(e.x - kx, e.y - ky, e.z - kz) - e.r;
    const sichtbar = d < weite;
    if (sichtbar !== e.sichtbar) {
      e.sichtbar = sichtbar;
      e.objekt.visible = sichtbar;
    }
    if (sichtbar) n++;
  }
  return n;
}

import * as THREE from 'three';
import { EditorKarte, markerSchluessel } from '../../editor/kern/karte.js';
import { nachDefinition } from '../../editor/kern/format.js';
import { verarbeiteKarte } from '../../server/spiel/karten/kartenLader.js';
import { Welt } from '../../gemeinsam/welt/welt.js';
import { KartenModell } from '../../client/darstellung/kartenModell.js';
import { ladeAssets } from '../../client/darstellung/assets.js';
import { eigeneGroesse } from '../../gemeinsam/welt/drehung.js';
import { erzeugeFahrzeugModell } from '../../client/darstellung/fahrzeugModelle.js';
import { FAHRZEUG_MODELLE, fahrzeugAusObjekt } from '../../gemeinsam/physik/fahrzeug.js';

/**
 * „Echte Modelle“ der Studio-Schnellansicht: jedes Objekt sieht aus wie im Spiel statt als Platzhalter-Klotz.
 * Je Objekt-Art (Typ + Grundfläche + Skalierung + Farbe) wird EINMAL eine Mini-Zone mit genau diesem Objekt gebaut –
 * mit dem echten Kartenmodell (client/darstellung/kartenModell.js, wie Spiel-Optik und Vorschaubilder) – und daraus die
 * Teil-Meshes (ohne Boden) als Vorlage gemerkt: [{ quelle: Mesh, matrix, farbe? }] in Kacheln, Ursprung = Objektmitte am Boden,
 * Drehung 0. Die Ansicht stellt sie dann als InstancedMesh je Teil auf (viewport.js #baueObjekte) und nutzt sie als
 * Platzier-Geist (setzeGeist). Gebaut wird nacheinander im Hintergrund; `beiFertig()` meldet neue Vorlagen.
 * Bäume/Möbel-GLBs laden im Spiel asynchron nach (Geometrie wird am Mesh getauscht) → Vorlage liest `quelle.geometry`
 * immer frisch, und nach dem Bau wird ein paar Mal `beiFertig` erneut gerufen.
 */
const PX = 32; // Weltpixel je Kachel (Spiel)
const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;

export class EchteModelle {
  constructor(renderer) {
    this.renderer = renderer;
    this.vorlagen = new Map(); // schlüssel → Vorlage | null (keine echte Form → Platzhalter)
    this.warte = new Map(); // schlüssel → { o, typDef }
    this.laeuft = false;
    this.beiFertig = null;
  }

  static schluessel(o) {
    const e = eigeneGroesse(o);
    return `${o.typ}|${r2(e.b)}|${r2(e.h)}|${r2(o.skalierung ?? 1)}|${o.farbe ?? ''}|${o.mast ? 1 : 0}`;
  }

  /** Vorlage für Objekt `o` (Karte für eigene Typen) – undefined = noch nicht gebaut (wird eingeplant), null = keine */
  hole(o, karte) {
    const s = EchteModelle.schluessel(o);
    if (this.vorlagen.has(s)) return this.vorlagen.get(s);
    if (!this.warte.has(s)) this.warte.set(s, { o, typDef: karte?.s('typen').get(o.typ) ?? null });
    this.#lauf();
    return undefined;
  }

  leeren() {
    this.vorlagen.clear();
  }

  async #lauf() {
    if (this.laeuft) return;
    this.laeuft = true;
    try {
      this.assets ??= await ladeAssets().catch(() => null);
      let neu = 0;
      let start = performance.now();
      while (this.warte.size) {
        const [s, { o, typDef }] = this.warte.entries().next().value;
        this.warte.delete(s);
        let v = null;
        try {
          v = this.#baue(o, typDef);
        } catch (f) {
          console.warn('Echtes Modell', o.typ, f.message);
        }
        this.vorlagen.set(s, v);
        neu++;
        // Seite bedienbar halten: nach ~40 ms Bauzeit kurz abgeben und schon mal zeigen, was fertig ist
        if (performance.now() - start > 40) {
          this.beiFertig?.();
          await new Promise((r) => setTimeout(r, 0));
          start = performance.now();
        }
      }
      if (neu) {
        this.beiFertig?.();
        for (const ms of [600, 1500, 3000]) setTimeout(() => this.beiFertig?.(), ms); // nachgeladene GLB-Geometrien
      }
    } finally {
      this.laeuft = false;
    }
  }

  #baue(o, typDef) {
    const e = eigeneGroesse(o);
    if (FAHRZEUG_MODELLE[o.typ]) {
      // Autos sind im Spiel Fahrzeuge (renderer.js), keine Kartenobjekte → Fahrzeug-Modell wie dort ausrichten
      const fz = fahrzeugAusObjekt({ ...o, x: 0, y: 0, b: e.b, h: e.h, drehung: undefined }, PX);
      const g = erzeugeFahrzeugModell(o.typ, fz.laenge, fz.breite);
      g.rotation.y = Math.PI / 2 - fz.winkel;
      const gruppe = new THREE.Group();
      gruppe.add(g);
      gruppe.updateMatrixWorld(true);
      return this.#sammle(gruppe, new THREE.Matrix4().makeScale(1 / PX, 1 / PX, 1 / PX), Infinity);
    }
    const b = Math.ceil(e.b);
    const h = Math.ceil(e.h);
    const rand = 2;
    const k = new EditorKarte({ id: 'echt', name: 'Echt', breite: b + rand * 2, hoehe: h + rand * 2 });
    if (typDef) k.anwenden([{ s: 'typen', k: o.typ, neu: typDef }]);
    const neu = { ...o, x: rand, y: rand, b: e.b, h: e.h };
    delete neu.drehung;
    delete neu.klang;
    k.anwenden([{ s: 'objekte', k: k.naechsteId, neu }]);
    k.anwenden([{ s: 'marker', k: markerSchluessel(0, 0), neu: { art: 'start' } }]);
    const { daten } = verarbeiteKarte(nachDefinition(k));
    const welt = new Welt(daten);
    const bauer = KartenModell.baueSchrittweise({ welt, assets: this.assets, gl: this.renderer, mitSchnitt: (m) => m, bodenMassstab: 0.25 });
    let schritt = bauer.next();
    while (!schritt.done) schritt = bauer.next();
    const modell = schritt.value;
    const gruppe = new THREE.Group();
    gruppe.add(modell.statisch, modell.beweglich);
    gruppe.traverse((t) => (t.matrixWorldAutoUpdate = true));
    modell.kulle(new THREE.Vector3(), Infinity);
    modell.aktualisiere(0, 0);
    gruppe.updateMatrixWorld(true);
    // Ursprung: Objektmitte am Boden, Einheit Kacheln
    const zuKachel = new THREE.Matrix4().makeScale(1 / PX, 1 / PX, 1 / PX).premultiply(new THREE.Matrix4().makeTranslation(-(rand + e.b / 2), 0, -(rand + e.h / 2)));
    const zone = Math.min(b, h) * PX + PX * 1.5; // breiter als das Objekt (+Rand) = Boden/Gelände der Mini-Zone → weg
    const v = this.#sammle(gruppe, zuKachel, zone);
    for (const t of modell.bodenTexturen ?? []) t.dispose();
    return v;
  }

  /** Alle sichtbaren Meshes (Instanzen einzeln) → Vorlage; Teile breiter als `zone` (Weltpixel) = Boden → weg */
  #sammle(gruppe, zuKachel, zone) {
    const teile = [];
    const mi = new THREE.Matrix4();
    const box = new THREE.Box3();
    gruppe.traverse((t) => {
      if (!t.isMesh || !t.visible || !t.geometry) return;
      const liste = [];
      if (t.isInstancedMesh) {
        for (let i = 0; i < t.count; i++) {
          t.getMatrixAt(i, mi);
          if (Math.abs(mi.determinant()) < 1e-9) continue; // ausgeblendete Instanz (Nullmatrix)
          const farbe = t.instanceColor ? new THREE.Color() : null;
          if (farbe) t.getColorAt(i, farbe);
          liste.push({ m: t.matrixWorld.clone().multiply(mi), farbe });
        }
      } else liste.push({ m: t.matrixWorld.clone(), farbe: null });
      if (!t.geometry.boundingBox) t.geometry.computeBoundingBox();
      for (const { m, farbe } of liste) {
        const gb = t.geometry.boundingBox.isEmpty() ? null : t.geometry.boundingBox.clone().applyMatrix4(m);
        if (gb && (gb.max.x - gb.min.x > zone || gb.max.z - gb.min.z > zone)) continue;
        teile.push({ quelle: t, matrix: m.premultiply(zuKachel), farbe });
        if (gb) box.union(gb.applyMatrix4(zuKachel));
      }
    });
    if (!teile.length) return null;
    return { teile, box };
  }
}

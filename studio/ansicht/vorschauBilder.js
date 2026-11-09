import * as THREE from 'three';
import { EditorKarte, markerSchluessel } from '../../editor/kern/karte.js';
import { nachDefinition } from '../../editor/kern/format.js';
import { verarbeiteKarte } from '../../server/spiel/karten/kartenLader.js';
import { Welt } from '../../gemeinsam/welt/welt.js';
import { KartenModell } from '../../client/darstellung/kartenModell.js';
import { ladeAssets } from '../../client/darstellung/assets.js';
import { erzeugeBauwerk, bauwerkDrehungY } from '../../client/darstellung/bauwerkModelle.js';
import { BASIS_MATERIAL, bauteilGeometrie, wirdInstanziert } from '../../client/darstellung/basisbauModelle.js';
import { itemGeometrie, ITEM_MATERIAL } from '../../client/darstellung/itemModelle.js';
import { erzeugeFahrzeugModell } from '../../client/darstellung/fahrzeugModelle.js';
import { FAHRZEUG_MODELLE, fahrzeugAusObjekt } from '../../gemeinsam/physik/fahrzeug.js';
import { objektOps } from '../kern/aktionen.js';
import { objektHoehe } from './viewport.js';

/**
 * Vorschaubilder der Bausteine (Phase 4.4): jedes Objekt/Bauwerk/Item wird mit dem ECHTEN Spiel-Modell gerendert –
 *   objekt:<typ>   Mini-Zone (EditorKarte → nachDefinition → verarbeiteKarte → KartenModell, wie Spiel-Optik), Kamera schräg
 *   bauwerk:<typ>  client/darstellung/bauwerkModelle.erzeugeBauwerk · Fahrzeuge: fahrzeugModelle.erzeugeFahrzeugModell
 *   item:<id>      client/darstellung/itemModelle.itemGeometrie
 * Ein Bild je Baustein, einmal erzeugt und in <Spielordner>/.studio/vorschau/<schlüssel>.png abgelegt (IPC vorschau.*) –
 * nichts landet unter client/assets (Regel 6). Erzeugt wird nacheinander im Hintergrund (Warteschlange), fertige Bilder
 * tauschen die Platzhalter im Asset-Panel direkt aus (`<img data-vorschau="id">`). „Vorschaubilder neu“ löscht den Cache.
 */
const GROESSE = 160;
const VERSION = 'v3';
const schluessel = (id) => `${VERSION}_${id.replace(/[^a-z0-9_-]+/gi, '_')}`.slice(0, 120);

export class VorschauBilder {
  constructor(nativ) {
    this.nativ = nativ;
    this.urls = new Map(); // id → data-URL | null (keins möglich)
    this.warte = [];
    this.laeuft = false;
    this.beiFertig = null; // (id, url)
  }

  /** Data-URL, wenn schon da – sonst null und (einmal) in die Warteschlange */
  url(asset) {
    const id = asset.id;
    if (this.urls.has(id)) return this.urls.get(id);
    if (!this.warte.some((a) => a.id === id)) this.warte.push(asset);
    this.#lauf();
    return null;
  }

  /**
   * Alle Bausteine auf einmal vorbereiten (Knopf „Alle Icons laden“): stellt jedes Asset ohne Bild in die Warteschlange.
   * beiFortschritt(fertig, gesamt) meldet den Stand; Promise endet, wenn alles erzeugt ist.
   */
  ladeAlle(liste, beiFortschritt) {
    const ids = new Set();
    const neu = liste.filter((a) => !this.urls.has(a.id) && !this.warte.some((w) => w.id === a.id) && !ids.has(a.id) && ids.add(a.id));
    this.fortschritt = { gesamt: neu.length, fertig: 0, melde: beiFortschritt };
    this.warte.unshift(...neu);
    beiFortschritt?.(0, neu.length);
    if (!neu.length) return Promise.resolve(0);
    return new Promise((ok) => {
      this.fortschritt.ende = () => ok(neu.length);
      this.#lauf();
    });
  }

  async loescheCache() {
    this.urls.clear();
    await this.nativ.aufruf('vorschau.leeren').catch(() => {});
  }

  async #lauf() {
    if (this.laeuft) return;
    this.laeuft = true;
    try {
      while (this.warte.length) {
        const a = this.warte.shift();
        if (this.urls.has(a.id)) continue;
        let url = null;
        try {
          const gespeichert = await this.nativ.aufruf('vorschau.lesen', { schluessel: schluessel(a.id) });
          if (gespeichert) url = `data:image/png;base64,${gespeichert}`;
          else {
            url = await this.#rendere(a);
            if (url) await this.nativ.aufruf('vorschau.schreiben', { schluessel: schluessel(a.id), png: url.split(',')[1] });
          }
        } catch (f) {
          console.warn('Vorschaubild', a.id, f.message);
        }
        this.urls.set(a.id, url);
        if (url) this.beiFertig?.(a.id, url);
        const f = this.fortschritt;
        if (f && f.fertig < f.gesamt) {
          f.fertig++;
          f.melde?.(f.fertig, f.gesamt);
          if (f.fertig >= f.gesamt) {
            this.fortschritt = null;
            f.ende?.();
          }
        }
        await new Promise((r) => setTimeout(r, 0)); // Seite bleibt bedienbar
      }
    } finally {
      this.laeuft = false;
    }
  }

  #renderer() {
    if (!this.r) {
      this.r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      this.r.setSize(GROESSE, GROESSE);
      this.r.outputColorSpace = THREE.SRGBColorSpace;
    }
    return this.r;
  }

  /** Objekt (Spiel-Einheiten = Weltpixel) mit Licht und Schrägkamera auf den Kasten `box` rendern */
  #foto(inhalt, box) {
    const s = new THREE.Scene();
    s.add(new THREE.HemisphereLight(0xeef3ff, 0x4a4036, 2.1));
    const sonne = new THREE.DirectionalLight(0xfff2e0, 2.2);
    sonne.position.set(-0.6, 1, 0.5);
    s.add(sonne, inhalt);
    const g = box.getSize(new THREE.Vector3());
    const c = box.getCenter(new THREE.Vector3());
    const d = Math.max(g.x, g.y, g.z, 8) * 1.75;
    const k = new THREE.PerspectiveCamera(32, 1, d / 100, d * 20);
    k.position.set(c.x + d * 0.62, c.y + d * 0.62, c.z + d * 0.85);
    k.lookAt(c);
    const r = this.#renderer();
    r.setClearColor(0x1b1e24, 1);
    r.render(s, k);
    return r.domElement.toDataURL('image/png');
  }

  /** Inventar-Icon aus dem Item-Atlas (wie hud.zeichneIcon) */
  async #icon(defId) {
    this.assets ??= await ladeAssets().catch(() => null);
    const rahmen = this.assets?.item(defId);
    const bild = this.assets?.itemBild;
    if (!rahmen || !bild) return null;
    const c = document.createElement('canvas');
    c.width = c.height = GROESSE;
    const g = c.getContext('2d');
    g.fillStyle = '#1b1e24';
    g.fillRect(0, 0, GROESSE, GROESSE);
    const f = (GROESSE * 0.7) / Math.max(rahmen.b, rahmen.h);
    g.drawImage(bild, rahmen.x, rahmen.y, rahmen.b, rahmen.h, (GROESSE - rahmen.b * f) / 2, (GROESSE - rahmen.h * f) / 2, rahmen.b * f, rahmen.h * f);
    return c.toDataURL('image/png');
  }

  async #rendere(a) {
    if (a.art === 'item') {
      const geo = itemGeometrie(a.id);
      if (!geo) return this.#icon(a.id); // ohne 3D-Modell: das Inventar-Icon des Spiels
      const m = new THREE.Mesh(geo, ITEM_MATERIAL);
      return this.#foto(m, new THREE.Box3().setFromObject(m));
    }
    if (a.art === 'bauwerk') {
      const typ = a.typ ?? a.id.replace(/^bauwerk:/, '');
      const g = new THREE.Group();
      const zustand = { id: 0, typ, tx: 0, ty: 0, drehung: 0, brennt: true, gespannt: true, pflanze: 'tomate', wachstum: 1, an: true };
      if (wirdInstanziert(typ)) {
        const geo = bauteilGeometrie(typ);
        if (!geo) return null;
        g.add(new THREE.Mesh(geo, BASIS_MATERIAL));
      } else {
        const b = erzeugeBauwerk(zustand);
        b.aktualisiere?.(zustand, 0, true);
        g.add(b.gruppe);
        g.rotation.y = bauwerkDrehungY(zustand);
        await new Promise((r) => setTimeout(r, 900)); // Möbel-GLB nachladen lassen
      }
      return this.#foto(g, new THREE.Box3().setFromObject(g));
    }
    if (a.art !== 'objekt') return null;
    const typ = a.typ ?? a.id.replace(/^objekt:/, '');
    if (FAHRZEUG_MODELLE[typ]) {
      const fz = fahrzeugAusObjekt({ typ, x: 0, y: 0, b: a.b ?? 2, h: a.h ?? 4, drehung: 90 }, 32);
      const m = erzeugeFahrzeugModell(typ, fz.laenge, fz.breite);
      m.rotation.y = -0.6;
      return this.#foto(m, new THREE.Box3().setFromObject(m));
    }
    return this.#objekt(a);
  }

  /** Objekt in einer Mini-Zone mit dem echten Kartenmodell (wie die Spiel-Optik) */
  async #objekt(a) {
    this.assets ??= await ladeAssets().catch(() => null);
    const typ = a.typ ?? a.id.replace(/^objekt:/, '');
    const b = Math.ceil(a.b ?? 1);
    const h = Math.ceil(a.h ?? 1);
    const k = new EditorKarte({ id: 'vorschau', name: 'Vorschau', breite: b + 4, hoehe: h + 4 });
    const { ops, id } = objektOps(k, a.id, 2, 2);
    k.anwenden(ops);
    k.anwenden([{ s: 'marker', k: markerSchluessel(0, 0), neu: { art: 'start' } }]);
    const o = k.s('objekte').get(id);
    const { daten } = verarbeiteKarte(nachDefinition(k));
    const welt = new Welt(daten);
    const bauer = KartenModell.baueSchrittweise({ welt, assets: this.assets, gl: this.#renderer(), mitSchnitt: (m) => m, bodenMassstab: 0.5 });
    let schritt = bauer.next();
    while (!schritt.done) schritt = bauer.next();
    const modell = schritt.value;
    modell.bodenHochladen(0, 0, Infinity);
    if (modell.daecher) modell.daecher.gruppe.visible = false;
    const gruppe = new THREE.Group();
    gruppe.add(modell.statisch, modell.beweglich);
    gruppe.traverse((t) => (t.matrixWorldAutoUpdate = true));
    modell.kulle(new THREE.Vector3(), Infinity);
    modell.aktualisiere(0, 0);
    // GLB-Modelle (eigene Typen, Behälter) und Bäume (Baum-GLBs, baumModell.ladeBaumVariante) kommen asynchron
    const baum = /baum|tanne|busch/.test(typ);
    if (baum || (welt.typen && Object.values(welt.typen).some((t) => t.glbDatei || t.glb))) await new Promise((r) => setTimeout(r, baum ? 2500 : 1200));
    // Kamera auf die echten Modell-Teile (alles außer Boden/Ebenen, die über die ganze Mini-Zone reichen)
    gruppe.updateMatrixWorld(true);
    const zone = (b + 4) * 32 * 0.8;
    const box = new THREE.Box3();
    gruppe.traverse((t) => {
      if (!t.isMesh || !t.visible) return;
      const tb = new THREE.Box3().setFromObject(t, true);
      if (tb.isEmpty() || tb.max.x - tb.min.x > zone || tb.max.z - tb.min.z > zone) return;
      box.union(tb);
    });
    if (box.isEmpty()) {
      const hoehe = (o ? objektHoehe(o, k) : 1) * 32;
      box.set(new THREE.Vector3(2 * 32, 0, 2 * 32), new THREE.Vector3((2 + (o?.b ?? 1)) * 32, Math.max(8, hoehe), (2 + (o?.h ?? 1)) * 32));
    }
    const url = this.#foto(gruppe, box);
    for (const teil of [modell.statisch, modell.beweglich]) teil.traverse((t) => t.geometry?.dispose());
    for (const t of modell.bodenTexturen ?? []) t.dispose();
    return url;
  }
}

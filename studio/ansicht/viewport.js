import * as THREE from 'three';
import { TransformControls } from '../../client/vendor/three/addons.js';
import { KACHELN, istWandKachel } from '../../gemeinsam/welt/kacheln.js';
import { katalog, objektInfo } from '../../editor/kern/katalog.js';
import { eigeneGroesse } from '../../gemeinsam/welt/drehung.js';
import { BEHAELTER_TYPEN } from '../../gemeinsam/welt/behaelter.js';
import { BAUWERKE } from '../../gemeinsam/welt/bauwerke.js';
import { eigenesModellUrl, ladeEigenesModell, eigenesModellInhalt } from '../../client/darstellung/eigeneModelle.js';
import { ausSchluessel } from '../../editor/kern/karte.js';
import { ebeneVon, ebeneFrei } from '../../editor/kern/ebenen.js';
import { itemGeometrie, ITEM_MATERIAL } from '../../client/darstellung/itemModelle.js';
import { erzeugeBauwerk, bauwerkDrehungY } from '../../client/darstellung/bauwerkModelle.js';
import { BASIS_MATERIAL, bauteilGeometrie, wirdInstanziert } from '../../client/darstellung/basisbauModelle.js';
import { festesItem } from '../kern/lootVorschau.js';
import { entpacke, MAL_AUFLOESUNG } from '../../gemeinsam/welt/bodenMalerei.js';
import { maleSchichten } from '../../client/darstellung/malSchicht.js';

/**
 * Ansicht des Studios (Three.js): dieselbe Szene als 3D (Perspektive, Orbit wie Unity) oder 2D (Draufsicht, orthografisch).
 * 1 Kachel = 1 Einheit, x → X, y → Z, Höhe in Metern (Terrain-Höhen direkt). Schnell auch bei großen Zonen:
 *   Boden       Sektoren à SEKTOR × SEKTOR Kacheln: je ein Gitter-Mesh (Geländehöhen) + Canvas-Textur (Farbe/Foto/Bemalung).
 *               Nur Sektoren, deren Kacheln/Höhen/Bemalung sich ändern, werden neu gebaut.
 *   Wände       je Sektor InstancedMesh pro Bauteil (Wand, Fensterbrüstung/-sturz, Glas, Türbalken, Türblatt). „Wände niedrig“.
 *   Objekte     Platzhalter als InstancedMesh je Form (Kasten, Fläche, Baum, Tanne, Busch, Stein, Licht) mit Instanzfarbe;
 *               Typen mit 3D-Modell (Spielordner/Behälter) als echtes .glb (Spiel-Code client/darstellung/eigeneModelle.js).
 *   Overlays    Bereiche, Übergänge (mit Ziel-Beschriftung), Klänge, Spawnpunkte, Marker, Ankünfte – anklickbar (userData {s,k}).
 *               Phase 3.1: Spawnpunkte mit festem Item zeigen das ECHTE Item-Modell des Spiels (client/darstellung/itemModelle.js),
 *               Bauwerke (Kamin, Sofa, Werkbank …) das echte Bauwerk-Modell (bauwerkModelle.js) – Spiel-Geometrie in Weltpixeln,
 *               hier ×1/32. Geteilte Geometrie/Materialien tragen userData.geteilt (werden beim Neubau NICHT entsorgt).
 *               Treffer suchen userData {s,k} auch bei den Eltern (nachgeladene GLB-Teile der Möbel haben selbst keins).
 *   Loot-Vorschau  setzeLootVorschau(liste) – Beispiel-Items aus studio/kern/lootVorschau.js an allen Loot-Punkten (nicht anklickbar).
 *   Gizmo       TransformControls (Bewegen W / Drehen E / Skalieren R) an einem Griff; beim Loslassen → beiGizmo(art, wert).
 * Steuerung: Rechte Maustaste = drehen (3D) · Mitte/Leertaste+Links = schieben · Rad = Zoom · RMT + WASD/QE = fliegen ·
 * F = Auswahl zeigen. Linke Maustaste geht an das aktive Werkzeug (beiZeiger.unten/bewege/oben/schweben).
 * Gezeichnet wird nur bei Bedarf (anfordern).
 */
export const SEKTOR = 32;
const PX = 16; // Bodentextur: Pixel je Kachel
export const WAND_HOEHE = 84 / 32;
const TUER_HOEHE = 70 / 32;
const MOEBEL_HOEHE = {
  bett: 18, bett_orange: 18, tisch: 24, tisch_rund: 24, stuhl: 14, sessel: 18, sessel_blau: 18, sofa: 18, sofa_dunkel: 18,
  kiste: 26, kiste_klein: 16, pflanze: 30, kueche_theke: 30, kueche_herd: 30, kueche_spuele: 30, kueche_kochfeld: 30,
  auto_schwarz: 38, auto_blau: 38, auto_rot: 38, auto_gruen: 38, auto_gelb: 38, transporter: 46, fass: 28, pylone: 18, werkbank: 26,
};
const FOTO_BODEN = { rasen: 'rasen', wiese: 'wiese', erde: 'erde', kies: 'kies', pflaster: 'pflaster', waldboden: 'waldboden', wildwald: 'wildwald', sand: 'sand' };
const FORMEN = ['kasten', 'flach', 'stamm', 'krone', 'tanne', 'busch', 'stein', 'licht', 'mast'];
const UEBERLAGERUNGEN = ['zombieBereiche', 'lootZonen', 'raumFlaechen', 'tierBereiche', 'uebergaenge', 'klaenge', 'spawnpunkte', 'marker', 'ankuenfte', 'bauwerke', 'notizen'];
const BAUM_TYPEN = new Set(['baum', 'baum_herbst']);
const WELT_PX = 1 / 32;
/** Schnellansicht: Farbe je Wandart (Spiel-Optik zeigt die echten Texturen) */
const WAND_FARBE = { ziegel: new THREE.Color(0xc29a86), holz: new THREE.Color(0xa07b55), putz: new THREE.Color(0xe7e1d4), beton: new THREE.Color(0x9a9c9f), quader: new THREE.Color(0x8c8f95), blech: new THREE.Color(0x9fa7b0) }; // Spiel-Modelle (Weltpixel) → Kacheln
const geteilt = (o) => o.traverse((t) => (t.userData.geteilt = true));
const r3 = (v) => Math.round(v * 1000) / 1000;

/** Sichtbare Höhe eines Objekts in Kacheln/Metern (für „auf Möbel legen“ und Platzhalter) */
export function objektHoehe(o, karte) {
  const s = o.skalierung ?? 1;
  const typ = karte?.s('typen').get(o.typ);
  if (typ?.hoehe3d) return typ.hoehe3d * s;
  if (BEHAELTER_TYPEN[o.typ]) return BEHAELTER_TYPEN[o.typ].hoehe3d * s;
  if (o.ebene === 'boden') return 0.02;
  if (BAUM_TYPEN.has(o.typ) || o.typ === 'tanne') return Math.min(o.b, o.h) * 1.9;
  if (o.typ === 'busch') return Math.min(o.b, o.h) * 0.8;
  if (o.typ === 'licht') return o.mast ? 3.6 : 0.4;
  return ((MOEBEL_HOEHE[o.typ] ?? 20) / 32) * s;
}

const KACHEL_FARBE = (() => {
  const f = {};
  for (const e of katalog()) if (e.art === 'kachel') f[e.zeichen] = e.farbe;
  return f;
})();

/** Runde 41: Kachelname → Zeichen (Farbe für gemalte Böden ohne Foto) */
const ZEICHEN_VON = Object.fromEntries(Object.entries(KACHELN).map(([z, k]) => [k.name, z]).reverse());

function streu(x, y) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

export class Viewport {
  constructor(leinwand, { basis = '..' } = {}) {
    this.leinwand = leinwand;
    this.basis = basis;
    this.renderer = new THREE.WebGLRenderer({ canvas: leinwand, antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.szene = new THREE.Scene();
    this.szene.background = new THREE.Color(0x14171c);
    this.szene.fog = new THREE.Fog(0x14171c, 200, 700);
    this.himmel = new THREE.HemisphereLight(0xe3ecff, 0x40362a, 1.35);
    this.szene.add(this.himmel);
    this.dunkel = 0;
    this.vorBild = null; // (Stimmung) vor jedem Bild: Lampen-Lichter, Wetter-Teilchen
    this.sonne = new THREE.DirectionalLight(0xfff4e0, 1.7);
    this.sonne.position.set(-60, 120, 40);
    this.szene.add(this.sonne);
    this.kameraP = new THREE.PerspectiveCamera(50, 1, 0.1, 3000);
    this.kameraO = new THREE.OrthographicCamera(-10, 10, 10, -10, -500, 1000);
    this.modus = '3d';
    this.ziel = new THREE.Vector3(20, 0, 15);
    this.abstand = 45;
    this.gier = -0.6;
    this.neigung = 0.95;
    this.gruppen = Object.fromEntries(['boden', 'waende', 'objekte', 'modelle', 'overlays', 'lootVorschau', 'auswahl', 'geist', 'hilfe'].map((n) => [n, new THREE.Group()]));
    for (const g of Object.values(this.gruppen)) this.szene.add(g);
    this.gruppen.lootVorschau.visible = false;
    this.karte = null;
    this.sektoren = new Map();
    this.schmutzig = new Set();
    this.objekteSchmutzig = false;
    this.overlaysSchmutzig = false;
    this.wandNiedrig = false;
    this.ebenen = { objekte: true, overlays: true, raster: true };
    this.auswahl = [];
    this.instanzen = new Map(); // Form → { mesh, schluessel[] }
    this.modelle = new Map(); // Objekt-ID → { gruppe, sig }
    this.fotos = new Map();
    this.beiZeiger = null;
    this.ebenenZustand = null; // Dokument.ebenen (sichtbar/gesperrt je Ebene)
    this.beiGizmo = null;
    this.beiKamera = null;
    this.#baueFormen();
    this.#baueHilfen();
    this.#baueGizmo();
    this.#steuerung();
    this.#ladeFotos();
    new ResizeObserver(() => this.#groesse()).observe(leinwand.parentElement);
    this.#groesse();
    this.anfordern();
  }

  get kamera() {
    return this.modus === '2d' ? this.kameraO : this.kameraP;
  }

  anfordern() {
    if (this.wartet) return;
    this.wartet = true;
    requestAnimationFrame(() => {
      this.wartet = false;
      this.#bild();
    });
  }

  // ---------- Karte ----------
  setzeKarte(karte, { kameraZuruecksetzen = true } = {}) {
    this.karte = karte;
    this.malCache = null; // Runde 41: Malschicht neu entpacken
    for (const s of this.sektoren.values()) this.#entsorgeSektor(s);
    this.sektoren.clear();
    for (const m of this.modelle.values()) this.gruppen.modelle.remove(m.gruppe);
    this.modelle.clear();
    this.auswahl = [];
    this.transform.detach();
    if (!karte) return this.anfordern();
    for (let sy = 0; sy < Math.ceil(karte.hoehe / SEKTOR); sy++) for (let sx = 0; sx < Math.ceil(karte.breite / SEKTOR); sx++) this.schmutzig.add(`${sx},${sy}`);
    this.objekteSchmutzig = true;
    this.overlaysSchmutzig = true;
    this.#raster();
    if (kameraZuruecksetzen) {
      this.ziel.set(karte.breite / 2, 0, karte.hoehe / 2);
      this.abstand = Math.max(30, Math.max(karte.breite, karte.hoehe) * 0.75);
    }
    this.anfordern();
  }

  /** Nach Kartenänderung: nur Betroffenes neu bauen */
  beiAenderung(ops) {
    const k = this.karte;
    if (!k) return;
    const sektorVon = (x, y) => `${Math.floor(x / SEKTOR)},${Math.floor(y / SEKTOR)}`;
    for (const op of ops) {
      if (op.s === 'kachel' || op.s === 'hoehe') {
        const x = op.i % k.breite;
        const y = Math.floor(op.i / k.breite);
        this.schmutzig.add(sektorVon(x, y));
        if (op.s === 'hoehe') for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1]]) if (k.imFeld(x + dx, y + dy)) this.schmutzig.add(sektorVon(x + dx, y + dy));
        if (op.s === 'hoehe') {
          this.objekteSchmutzig = true;
          this.overlaysSchmutzig = true;
        }
      } else if (op.s === 'wert' && op.pfad?.startsWith('bodenMalerei')) {
        // Runde 41: weicher Pinsel – Masken neu entpacken, alle Sektoren neu zeichnen
        this.malCache = null;
        for (const sk of this.sektoren.keys()) this.schmutzig.add(sk);
      } else if (op.s === 'bemalung') {
        const [x, y] = ausSchluessel(op.k);
        this.schmutzig.add(sektorVon(x, y));
      } else if (op.s === 'raster') return this.setzeKarte(k, { kameraZuruecksetzen: false });
      else if (op.s === 'objekte' || op.s === 'typen') this.objekteSchmutzig = true;
      else this.overlaysSchmutzig = true;
    }
    this.anfordern();
  }

  hoeheBei(x, y) {
    const k = this.karte;
    if (!k) return 0;
    return k.hoeheAn(Math.min(k.breite - 1, Math.max(0, Math.floor(x))), Math.min(k.hoehe - 1, Math.max(0, Math.floor(y)))) || 0;
  }

  // ---------- Kamera ----------
  setzeModus(modus) {
    this.modus = modus === '2d' ? '2d' : '3d';
    this.transform.camera = this.kamera;
    this.#groesse();
    this.anfordern();
    this.beiKamera?.();
  }

  zeige(x, y, sichtweite = null) {
    this.ziel.set(x, this.hoeheBei(x, y), y);
    if (sichtweite) this.abstand = Math.max(6, Math.min(800, sichtweite));
    this.anfordern();
  }

  zeigeAuswahl() {
    const b = this.#auswahlBox();
    if (!b) return;
    const c = b.getCenter(new THREE.Vector3());
    const s = b.getSize(new THREE.Vector3());
    this.ziel.copy(c);
    this.abstand = Math.max(8, Math.max(s.x, s.z) * 2.2);
    this.anfordern();
  }

  #kameraSetzen() {
    const a = this.abstand;
    if (this.laufen) {
      const l = this.laufen;
      const auge = this.hoeheBei(l.x, l.y) + 1.6;
      this.kameraP.position.set(l.x, auge, l.y);
      this.kameraP.lookAt(l.x + Math.sin(l.blick) * Math.cos(l.neigung), auge + Math.sin(l.neigung), l.y + Math.cos(l.blick) * Math.cos(l.neigung));
      this.kameraP.near = 0.05;
      this.kameraP.updateProjectionMatrix();
      this.szene.fog.near = 30 * (this.nebelFaktor ?? 1);
      this.szene.fog.far = 140 * (this.nebelFaktor ?? 1);
      return;
    }
    this.kameraP.near = 0.1;
    if (this.modus === '3d') {
      const ce = Math.cos(this.neigung);
      this.kameraP.position.set(this.ziel.x + a * ce * Math.sin(this.gier), this.ziel.y + a * Math.sin(this.neigung), this.ziel.z + a * ce * Math.cos(this.gier));
      this.kameraP.lookAt(this.ziel);
      this.kameraP.far = Math.max(1000, a * 8);
      this.kameraP.updateProjectionMatrix();
      this.szene.fog.near = a * 2.5 * (this.nebelFaktor ?? 1);
      this.szene.fog.far = a * 9 * (this.nebelFaktor ?? 1);
    } else {
      const asp = this.leinwand.clientWidth / Math.max(1, this.leinwand.clientHeight);
      const h = a * 0.55;
      Object.assign(this.kameraO, { left: -h * asp, right: h * asp, top: h, bottom: -h });
      this.kameraO.position.set(this.ziel.x, 400, this.ziel.z);
      this.kameraO.up.set(0, 0, -1);
      this.kameraO.lookAt(this.ziel.x, 0, this.ziel.z);
      this.kameraO.updateProjectionMatrix();
      this.szene.fog.near = 1e5;
      this.szene.fog.far = 1e5 + 1;
    }
  }

  #groesse() {
    const el = this.leinwand.parentElement;
    const b = Math.max(1, el.clientWidth);
    const h = Math.max(1, el.clientHeight);
    this.renderer.setSize(b, h, false);
    this.kameraP.aspect = b / h;
    this.kameraP.updateProjectionMatrix();
    this.anfordern();
  }

  // ---------- Bild ----------
  #bild() {
    if (this.karte) {
      for (const s of this.schmutzig) this.#baueSektor(s);
      this.schmutzig.clear();
      if (this.objekteSchmutzig) this.#baueObjekte();
      if (this.overlaysSchmutzig) this.#baueOverlays();
      this.objekteSchmutzig = false;
      this.overlaysSchmutzig = false;
    }
    this.gruppen.objekte.visible = this.gruppen.modelle.visible = this.ebenen.objekte && !this.spielOptikAn;
    this.gruppen.overlays.visible = this.ebenen.overlays;
    this.rasterHelfer.visible = this.ebenen.raster && !!this.karte;
    this.#kameraSetzen();
    this.vorBild?.();
    this.renderer.render(this.szene, this.kamera);
  }

  /** PNG (base64, ohne Kopf) der aktuellen Ansicht */
  bildAlsPng() {
    this.#bild();
    return this.renderer.domElement.toDataURL('image/png').split(',')[1];
  }

  // ---------- Boden & Wände ----------
  #ladeFotos() {
    for (const name of Object.values(FOTO_BODEN)) {
      const bild = new Image();
      bild.onload = () => {
        this.fotos.set(name, bild);
        if (this.karte) for (const k of this.sektoren.keys()) this.schmutzig.add(k);
        this.anfordern();
      };
      bild.src = `${this.basis}/client/assets/boden/${name}.jpg`;
    }
  }

  #entsorgeSektor(s) {
    for (const o of [s.boden, ...s.waende]) {
      if (!o) continue;
      o.parent?.remove(o);
      o.geometry?.dispose();
      if (o.material?.map) o.material.map.dispose();
      if (o.isInstancedMesh) o.dispose();
    }
  }

  #baueSektor(schluessel) {
    const k = this.karte;
    const [sx, sy] = schluessel.split(',').map(Number);
    const x0 = sx * SEKTOR;
    const y0 = sy * SEKTOR;
    const b = Math.min(SEKTOR, k.breite - x0);
    const h = Math.min(SEKTOR, k.hoehe - y0);
    if (b <= 0 || h <= 0) return;
    const alt = this.sektoren.get(schluessel);
    if (alt) this.#entsorgeSektor(alt);
    // Gitter mit Höhen (Ecke = Mittel der angrenzenden Kacheln)
    const geo = new THREE.PlaneGeometry(b, h, b, h).rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const vx = Math.round(pos.getX(i) + b / 2) + x0;
      const vy = Math.round(pos.getZ(i) + h / 2) + y0;
      let summe = 0;
      let n = 0;
      for (const [dx, dy] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
        if (k.imFeld(vx + dx, vy + dy)) {
          summe += k.hoeheAn(vx + dx, vy + dy);
          n++;
        }
      }
      pos.setY(i, n ? summe / n : 0);
    }
    geo.computeVertexNormals();
    const leinwand = document.createElement('canvas');
    leinwand.width = b * PX;
    leinwand.height = h * PX;
    const ctx = leinwand.getContext('2d');
    for (let y = 0; y < h; y++)
      for (let x = 0; x < b; x++) {
        const z = k.kachelAn(x0 + x, y0 + y);
        const name = KACHELN[z]?.name;
        const foto = this.fotos.get(FOTO_BODEN[name]);
        if (foto) {
          const kacheln = 4; // ein Foto deckt 4 × 4 Kacheln
          const t = foto.width / kacheln;
          ctx.drawImage(foto, ((x0 + x) % kacheln) * t, ((y0 + y) % kacheln) * t, t, t, x * PX, y * PX, PX, PX);
        } else {
          const c = new THREE.Color(KACHEL_FARBE[z] ?? '#777');
          if (KACHELN[z]?.blockiert && !KACHELN[z]?.wasser) c.multiplyScalar(0.55);
          c.offsetHSL(0, 0, (streu(x0 + x, y0 + y) - 0.5) * 0.022);
          ctx.fillStyle = `#${c.getHexString()}`;
          ctx.fillRect(x * PX, y * PX, PX, PX);
        }
        const farbe = k.farbeAn(x0 + x, y0 + y);
        if (farbe) {
          ctx.globalAlpha = 0.62;
          ctx.fillStyle = farbe;
          ctx.fillRect(x * PX, y * PX, PX, PX);
          ctx.globalAlpha = 1;
        }
      }
    this.#maleMalschicht(ctx, x0, y0, b, h);
    const tex = new THREE.CanvasTexture(leinwand);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.magFilter = THREE.LinearFilter;
    const boden = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex }));
    boden.position.set(x0 + b / 2, 0, y0 + h / 2);
    boden.userData.boden = true;
    this.gruppen.boden.add(boden);
    const waende = this.#baueWaende(x0, y0, b, h);
    this.sektoren.set(schluessel, { boden, waende });
  }

  /** Runde 41: Masken der weichen Boden-Malschicht (Cache; während eines Pinselstrichs ersetzt `malVorschau` eine Schicht) */
  malMasken() {
    const k = this.karte;
    const m = k?.werte?.bodenMalerei;
    if (!m?.schichten) return this.malVorschau ? new Map([[this.malVorschau.name, this.malVorschau.maske]]) : new Map();
    this.malCache ??= entpacke(m, k.breite, k.hoehe);
    if (!this.malVorschau) return this.malCache;
    const mit = new Map(this.malCache);
    mit.set(this.malVorschau.name, this.malVorschau.maske);
    return mit;
  }

  /** Runde 41: Kacheln x0..x0+b neu zeichnen lassen (Pinsel-Vorschau) */
  bodenNeu(x0, y0, x1, y1) {
    if (!this.karte) return;
    for (let sy = Math.floor(Math.max(0, y0 - 1) / SEKTOR); sy <= Math.floor(Math.min(this.karte.hoehe - 1, y1) / SEKTOR); sy++)
      for (let sx = Math.floor(Math.max(0, x0 - 1) / SEKTOR); sx <= Math.floor(Math.min(this.karte.breite - 1, x1) / SEKTOR); sx++) this.schmutzig.add(`${sx},${sy}`);
    this.anfordern();
  }

  #maleMalschicht(ctx, x0, y0, b, h) {
    const k = this.karte;
    const masken = this.malMasken();
    if (!masken.size) return;
    const aufloesung = k.werte?.bodenMalerei?.aufloesung ?? MAL_AUFLOESUNG;
    maleSchichten(ctx, masken, { breite: k.breite, hoehe: k.hoehe, aufloesung }, { x0, y0, x1: x0 + b, y1: y0 + h }, PX, (hctx, name) => {
      const foto = this.fotos.get(FOTO_BODEN[name]);
      for (let y = 0; y < h; y++)
        for (let x = 0; x < b; x++) {
          if (foto) {
            const t = foto.width / 4;
            hctx.drawImage(foto, ((x0 + x) % 4) * t, ((y0 + y) % 4) * t, t, t, x * PX, y * PX, PX, PX);
          } else {
            const c = new THREE.Color(KACHEL_FARBE[ZEICHEN_VON[name]] ?? '#777');
            c.offsetHSL(0, 0, (streu(x0 + x, y0 + y) - 0.5) * 0.022);
            hctx.fillStyle = `#${c.getHexString()}`;
            hctx.fillRect(x * PX, y * PX, PX, PX);
          }
        }
    });
  }

  #baueWaende(x0, y0, b, h) {
    const k = this.karte;
    const teile = { wand: [], unten: [], oben: [], glas: [], balken: [], blatt: [] };
    const hoch = this.wandNiedrig ? 0.35 : 1;
    for (let y = y0; y < y0 + h; y++)
      for (let x = x0; x < x0 + b; x++) {
        const z = k.kachelAn(x, y);
        const boden = k.hoeheAn(x, y);
        if (istWandKachel(z)) teile.wand.push([x, y, boden, WAND_HOEHE * hoch, 0, KACHELN[z].wand]);
        else if (z === 'F') {
          teile.unten.push([x, y, boden, 0.95 * hoch, 0]);
          if (!this.wandNiedrig) {
            teile.oben.push([x, y, boden + 2.05, WAND_HOEHE - 2.05, 0]);
            teile.glas.push([x, y, boden + 0.95, 1.1, 0.25]);
          }
        } else if (z === 'T') {
          if (!this.wandNiedrig) teile.balken.push([x, y, boden + TUER_HOEHE, WAND_HOEHE - TUER_HOEHE, 0]);
          teile.blatt.push([x, y, boden, TUER_HOEHE * hoch, 0.15]);
        }
      }
    const mats = this.wandMaterialien;
    const ergebnis = [];
    const m = new THREE.Matrix4();
    for (const [teil, liste] of Object.entries(teile)) {
      if (!liste.length) continue;
      const mesh = new THREE.InstancedMesh(this.einheitsKasten, mats[teil], liste.length);
      liste.forEach(([x, y, unten, hoehe, duenn, art], i) => {
        if (art) mesh.setColorAt(i, WAND_FARBE[art] ?? WAND_FARBE.ziegel); // Phase 4.12: Wandart in der Schnellansicht
        const tief = duenn ? 1 - duenn * 4 : 1;
        // dünne Teile (Glas, Türblatt) quer zur Wand: Ausrichtung nach Nachbarwänden
        const bau = (zz) => istWandKachel(zz) || zz === 'F' || zz === 'T';
        const quer = duenn && (bau(k.kachelAn(x, y - 1)) || bau(k.kachelAn(x, y + 1))) && !bau(k.kachelAn(x - 1, y));
        m.makeScale(quer ? tief : 1, hoehe, quer ? 1 : tief).setPosition(x + 0.5, unten + hoehe / 2, y + 0.5);
        mesh.setMatrixAt(i, m);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      this.gruppen.waende.add(mesh);
      ergebnis.push(mesh);
    }
    return ergebnis;
  }

  setzeWandNiedrig(an) {
    this.wandNiedrig = an;
    for (const k of this.sektoren.keys()) this.schmutzig.add(k);
    this.anfordern();
  }

  // ---------- Objekte ----------
  #baueFormen() {
    this.einheitsKasten = new THREE.BoxGeometry(1, 1, 1);
    const std = (farbe, extra = {}) => new THREE.MeshLambertMaterial({ color: farbe, ...extra });
    this.wandMaterialien = {
      wand: std(0xffffff), // Instanzfarbe = Wandart
      unten: std(0xbdb5a6),
      oben: std(0xbdb5a6),
      glas: new THREE.MeshLambertMaterial({ color: 0x8fc8ff, transparent: true, opacity: 0.35, depthWrite: false }),
      balken: std(0xbdb5a6),
      blatt: new THREE.MeshLambertMaterial({ color: 0x7a5232, transparent: true, opacity: 0.85 }),
    };
    this.formGeo = {
      kasten: new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
      flach: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0.02, 0),
      stamm: new THREE.CylinderGeometry(0.09, 0.13, 1, 6).translate(0, 0.5, 0),
      krone: new THREE.IcosahedronGeometry(0.5, 0).translate(0, 0.5, 0),
      tanne: new THREE.ConeGeometry(0.5, 1, 7).translate(0, 0.5, 0),
      busch: new THREE.IcosahedronGeometry(0.5, 0).translate(0, 0.42, 0),
      stein: new THREE.DodecahedronGeometry(0.5, 0).translate(0, 0.32, 0),
      licht: new THREE.SphereGeometry(0.18, 10, 8),
      mast: new THREE.CylinderGeometry(0.05, 0.06, 1, 6).translate(0, 0.5, 0),
    };
    this.formMat = {
      kasten: std(0xffffff),
      flach: std(0xffffff, { transparent: true, opacity: 0.9, depthWrite: false }),
      stamm: std(0x6b4a2f),
      krone: std(0xffffff, { flatShading: true }),
      tanne: std(0xffffff, { flatShading: true }),
      busch: std(0xffffff, { flatShading: true }),
      stein: std(0xffffff, { flatShading: true }),
      licht: new THREE.MeshBasicMaterial({ color: 0xffd9a0 }),
      mast: std(0x3a3f47),
    };
  }

  #modellTyp(o) {
    const typ = this.karte.s('typen').get(o.typ);
    if (typ && eigenesModellUrl(typ)) return typ;
    if (BEHAELTER_TYPEN[o.typ]) return BEHAELTER_TYPEN[o.typ];
    return null;
  }

  #baueObjekte() {
    const k = this.karte;
    const jeForm = Object.fromEntries(FORMEN.map((f) => [f, []]));
    const genutzt = new Set();
    const mat = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const achse = new THREE.Vector3(0, 1, 0);
    const setze = (form, schl, x, y, z, sx, sy, sz, dreh, farbe) => {
      q.setFromAxisAngle(achse, dreh);
      mat.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sy, sz));
      jeForm[form].push({ schl, matrix: mat.clone(), farbe });
    };
    const objekteAn = !this.ebenenZustand || this.ebenenZustand.objekte?.sichtbar !== false;
    for (const [id, o] of k.s('objekte')) {
      if (o.ebene === 'unsichtbar' || !objekteAn) continue;
      const cx = o.x + o.b / 2;
      const cz = o.y + o.h / 2;
      const boden = this.hoeheBei(cx, cz);
      const dreh = (-(o.drehung ?? 0) * Math.PI) / 180;
      const eigen = eigeneGroesse(o);
      const info = objektInfo(o.typ, k);
      const farbe = new THREE.Color(o.farbe ?? info?.farbe ?? '#8b6b4a');
      const schl = { s: 'objekte', k: id };
      const mt = this.#modellTyp(o);
      if (mt) {
        genutzt.add(id);
        this.#modellObjekt(id, o, mt, cx, boden, cz, dreh, eigen);
        continue;
      }
      const z = streu(o.x, o.y);
      if (BAUM_TYPEN.has(o.typ) || o.typ === 'tanne') {
        const g = Math.min(o.b, o.h);
        const hoehe = g * (1.6 + z * 0.5);
        setze('stamm', schl, cx, boden, cz, g * 0.9, hoehe * 0.45, g * 0.9, 0, null);
        if (o.typ === 'tanne') setze('tanne', schl, cx, boden + hoehe * 0.2, cz, g * 0.8, hoehe * 0.85, g * 0.8, z * 6, new THREE.Color(0x2d5f4c).offsetHSL(0, 0, (z - 0.5) * 0.08));
        else setze('krone', schl, cx, boden + hoehe * 0.35, cz, g * 0.85, hoehe * 0.7, g * 0.85, z * 6, new THREE.Color(o.typ === 'baum_herbst' ? 0xb8742a : 0x3f7d34).offsetHSL((z - 0.5) * 0.03, 0, (z - 0.5) * 0.1));
      } else if (o.typ === 'busch') setze('busch', schl, cx, boden, cz, o.b * 0.9, Math.min(o.b, o.h) * 0.8, o.h * 0.9, z * 6, new THREE.Color(0x467f38));
      else if (o.typ === 'stein' || o.typ === 'eisenerz') setze('stein', schl, cx, boden, cz, o.b * 0.9, o.b * 0.6 * (o.skalierung ?? 1), o.h * 0.9, z * 6, new THREE.Color(o.typ === 'eisenerz' ? 0x9a5b3c : 0x8d8f93));
      else if (o.typ === 'licht') {
        const hoehe = o.mast ? 3.6 : 0.4;
        if (o.mast) setze('mast', schl, cx, boden, cz, 1, hoehe, 1, 0, null);
        setze('licht', schl, cx, boden + hoehe, cz, 1, 1, 1, 0, null);
      } else if (o.ebene === 'boden') setze('flach', schl, cx, boden, cz, eigen.b, 1, eigen.h, dreh, farbe);
      else setze('kasten', schl, cx, boden, cz, eigen.b, objektHoehe(o, k), eigen.h, dreh, farbe);
    }
    // Modelle, die es nicht mehr gibt, entfernen
    for (const [id, m] of this.modelle) {
      if (genutzt.has(id)) continue;
      this.gruppen.modelle.remove(m.gruppe);
      this.modelle.delete(id);
    }
    for (const form of FORMEN) {
      const liste = jeForm[form];
      let eintrag = this.instanzen.get(form);
      if (!eintrag || eintrag.mesh.instanceMatrix.count < liste.length) {
        if (eintrag) {
          this.gruppen.objekte.remove(eintrag.mesh);
          eintrag.mesh.dispose();
        }
        const mesh = new THREE.InstancedMesh(this.formGeo[form], this.formMat[form], Math.max(16, Math.ceil(liste.length * 1.5)));
        mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(mesh.instanceMatrix.count * 3).fill(1), 3);
        mesh.userData.form = form;
        this.gruppen.objekte.add(mesh);
        eintrag = { mesh, schluessel: [] };
        this.instanzen.set(form, eintrag);
      }
      const { mesh } = eintrag;
      eintrag.schluessel = liste.map((l) => l.schl);
      liste.forEach((l, i) => {
        mesh.setMatrixAt(i, l.matrix);
        if (l.farbe) mesh.setColorAt(i, l.farbe);
      });
      mesh.count = liste.length;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.computeBoundingBox?.();
    }
    this.#zeichneAuswahl();
  }

  #modellObjekt(id, o, typ, cx, boden, cz, dreh, eigen) {
    const url = eigenesModellUrl(typ.glbDatei ? { glbDatei: typ.glbDatei } : typ);
    const hoehe = (typ.hoehe3d ?? 1) * (o.skalierung ?? 1);
    const sig = JSON.stringify([url, eigen.b, eigen.h, hoehe]);
    let m = this.modelle.get(id);
    if (!m) {
      m = { gruppe: new THREE.Group(), sig: null };
      m.gruppe.userData = { s: 'objekte', k: id };
      this.gruppen.modelle.add(m.gruppe);
      this.modelle.set(id, m);
    }
    m.gruppe.position.set(cx, boden, cz);
    m.gruppe.rotation.y = dreh;
    if (m.sig === sig) return;
    m.sig = sig;
    m.gruppe.clear();
    ladeEigenesModell(url)
      .then((szene) => {
        if (m.sig !== sig) return;
        const inhalt = eigenesModellInhalt(szene, { b: eigen.b, h: eigen.h, hoehe, einheit: 1 });
        inhalt.traverse((t) => (t.userData = { s: 'objekte', k: id }));
        m.gruppe.add(inhalt);
        this.anfordern();
      })
      .catch(() => {
        const ersatz = new THREE.Mesh(this.formGeo.kasten, new THREE.MeshLambertMaterial({ color: 0xc080ff }));
        ersatz.scale.set(eigen.b, hoehe, eigen.h);
        ersatz.userData = { s: 'objekte', k: id };
        m.gruppe.add(ersatz);
        this.anfordern();
      });
  }

  // ---------- Overlays ----------
  #rechteck(x, y, b, h, farbe, { hoehe = 0, deck = 0.16, schl = null, wand = 0 } = {}) {
    const g = new THREE.Group();
    const y0 = Math.max(this.hoeheBei(x + b / 2, y + h / 2), 0) + 0.04 + hoehe;
    const flaeche = new THREE.Mesh(new THREE.PlaneGeometry(b, h).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: farbe, transparent: true, opacity: deck, depthWrite: false }));
    flaeche.position.set(x + b / 2, y0, y + h / 2);
    flaeche.renderOrder = 2;
    const rand = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(b, wand || 0.001, h)), new THREE.LineBasicMaterial({ color: farbe, transparent: true, opacity: 0.9 }));
    rand.position.set(x + b / 2, y0 + (wand ? wand / 2 : 0), y + h / 2);
    g.add(flaeche, rand);
    if (wand) {
      const huelle = new THREE.Mesh(new THREE.BoxGeometry(b, wand, h), new THREE.MeshBasicMaterial({ color: farbe, transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide }));
      huelle.position.copy(rand.position);
      g.add(huelle);
    }
    if (schl) g.traverse((t) => (t.userData = { ...schl, flaeche: true }));
    return g;
  }

  #punkt(x, y, farbe, form = 'kugel', { hoehe = 0, schl = null, groesse = 0.35 } = {}) {
    const geo = form === 'raute' ? new THREE.OctahedronGeometry(groesse) : form === 'saeule' ? new THREE.CylinderGeometry(groesse * 0.7, groesse * 0.7, 1.7, 12).translate(0, 0.85, 0) : form === 'kasten' ? new THREE.BoxGeometry(groesse, groesse, groesse) : new THREE.SphereGeometry(groesse, 14, 10);
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: farbe, emissive: farbe, emissiveIntensity: 0.35 }));
    mesh.position.set(x, this.hoeheBei(x, y) + hoehe + (form === 'saeule' ? 0 : groesse + 0.05), y);
    if (schl) mesh.userData = { ...schl };
    return mesh;
  }

  #schrift(text, x, y, z, farbe = '#ffffff') {
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d');
    ctx.font = '600 44px Segoe UI, system-ui, sans-serif';
    const b = Math.ceil(ctx.measureText(text).width) + 36;
    c.width = b;
    c.height = 68;
    ctx.font = '600 44px Segoe UI, system-ui, sans-serif';
    ctx.fillStyle = 'rgba(14,16,20,0.82)';
    ctx.beginPath();
    ctx.roundRect(0, 0, b, 68, 14);
    ctx.fill();
    ctx.fillStyle = farbe;
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 18, 36);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, sizeAttenuation: false }));
    sprite.scale.set((b / 68) * 0.034, 0.034, 1); // feste Bildschirmgröße
    sprite.position.set(x, z, y);
    sprite.renderOrder = 10;
    return sprite;
  }

  /** Gruppe leeren; eigene Geometrie/Materialien freigeben, geteilte (Spiel-Modelle) nicht */
  #entsorge(g) {
    g.traverse((t) => {
      if (t.userData.geteilt) return;
      t.geometry?.dispose();
      t.material?.map?.dispose();
      t.material?.dispose?.();
    });
    g.clear();
  }

  /** Echtes Item-Modell des Spiels (x/y Kacheln, h = Ablagehöhe). Ohne Bauplan: kleiner Kasten. ring = Farbe des Bodenrings */
  #itemModell(defId, x, y, h, { schl = null, ring = null, vorschau = false } = {}) {
    const g = new THREE.Group();
    const geo = itemGeometrie(defId);
    if (geo) {
      const m = new THREE.Mesh(geo, ITEM_MATERIAL);
      m.userData.geteilt = true;
      m.scale.setScalar(WELT_PX);
      m.rotation.y = streu(x * 3.1, y * 1.7) * Math.PI * 2; // jedes Item liegt etwas anders (wie im Spiel)
      g.add(m);
    } else {
      const m = new THREE.Mesh(this.formGeo.kasten, new THREE.MeshLambertMaterial({ color: 0xd8c690 }));
      m.scale.set(0.22, 0.12, 0.16);
      g.add(m);
    }
    if (ring !== null) {
      const r = new THREE.Mesh(new THREE.RingGeometry(0.26, 0.33, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: ring, transparent: true, opacity: vorschau ? 0.45 : 0.85, depthWrite: false }));
      r.position.y = 0.03;
      r.renderOrder = 3;
      g.add(r);
    }
    g.position.set(x, this.hoeheBei(x, y) + h, y);
    if (schl) g.traverse((t) => Object.assign(t.userData, schl));
    return g;
  }

  /** Echtes Bauwerk-Modell (Kamin, Möbel, Werkbank, Holzwand …) wie im Spiel (renderer.js #aktualisiereBauwerke) */
  #bauwerkModell(w, schl) {
    const aussen = new THREE.Group();
    const innen = new THREE.Group();
    const zustand = { id: 0, typ: w.typ, tx: w.tx, ty: w.ty, drehung: w.drehung ?? 0, brennt: false, gespannt: false, pflanze: null, wachstum: 0, an: false };
    try {
      if (wirdInstanziert(w.typ)) {
        const geo = bauteilGeometrie(w.typ);
        if (geo) innen.add(new THREE.Mesh(geo, BASIS_MATERIAL));
      } else {
        const b = erzeugeBauwerk(zustand);
        b.aktualisiere?.(zustand, 0, false);
        innen.add(b.gruppe);
      }
    } catch {
      // unbekanntes Bauwerk → Kasten unten
    }
    if (innen.children.length) {
      geteilt(innen);
      innen.scale.setScalar(WELT_PX);
      innen.rotation.y = bauwerkDrehungY(zustand);
      aussen.add(innen);
      this.#nachladen(); // Möbel-GLBs kommen asynchron (moebelModelle.js) → ein paar Mal neu zeichnen
    } else {
      const hoch = ['wand', 'tuer'].includes(BAUWERKE[w.typ]?.ebene) ? WAND_HOEHE : 0.7;
      const m = new THREE.Mesh(this.formGeo.kasten, new THREE.MeshLambertMaterial({ color: 0xa0784a }));
      m.scale.set(0.95, hoch, 0.95);
      aussen.add(m);
    }
    aussen.position.set(w.tx + 0.5, this.hoeheBei(w.tx, w.ty), w.ty + 0.5);
    aussen.traverse((t) => Object.assign(t.userData, schl));
    return aussen;
  }

  /** Flacher, anklickbarer Ring am Boden (Loot-Marker bei aktiver Loot-Vorschau) */
  #bodenRing(x, y, farbe, schl) {
    const r = new THREE.Mesh(new THREE.CircleGeometry(0.34, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: farbe, transparent: true, opacity: 0.35, depthWrite: false }));
    r.position.set(x, this.hoeheBei(x, y) + 0.025, y);
    r.renderOrder = 2;
    r.userData = { ...schl };
    return r;
  }

  #nachladen() {
    if (this.nachladenLaeuft) return;
    this.nachladenLaeuft = true;
    for (const ms of [300, 900, 2000, 4500]) setTimeout(() => this.anfordern(), ms);
    setTimeout(() => (this.nachladenLaeuft = false), 4600);
  }

  /** Loot-Vorschau: [{ x, y, hoehe, defId, sicher }] (studio/kern/lootVorschau.js) oder null = aus */
  setzeLootVorschau(liste) {
    const g = this.gruppen.lootVorschau;
    this.#entsorge(g);
    for (const e of liste ?? []) g.add(this.#itemModell(e.defId, e.x, e.y, e.hoehe ?? 0, { ring: e.sicher ? 0x46c27a : 0xf2c14e, vorschau: !e.sicher }));
    if (g.visible !== !!liste) this.overlaysSchmutzig = true; // Loot-Marker: Kasten ⇄ Bodenring
    g.visible = !!liste;
    this.anfordern();
  }

  #baueOverlays() {
    const g = this.gruppen.overlays;
    this.#entsorge(g);
    const k = this.karte;
    const sichtbar = (s) => !this.ebenenZustand || this.ebenenZustand[ebeneVon(s)]?.sichtbar !== false;
    for (const s of UEBERLAGERUNGEN) {
      if (!sichtbar(s)) continue;
      for (const [id, w] of k.s(s)) {
        const schl = { s, k: id };
        if (s === 'lootZonen') g.add(this.#rechteck(w.x, w.y, w.b, w.h, 0xf2c14e, { schl }));
        else if (s === 'zombieBereiche') {
          g.add(this.#rechteck(w.x, w.y, w.b, w.h, 0xef5d5d, { schl, deck: 0.14 }));
          g.add(this.#schrift(`Zombies ×${w.anzahl}${w.tageszeit === 'nacht' ? ' · nachts' : w.tageszeit === 'tag' ? ' · tagsüber' : ''}${w.route ? ' · Route' : ''}`, w.x + w.b / 2, w.y + w.h / 2, this.hoeheBei(w.x, w.y) + 2.4, '#ff9a9a'));
          if (w.route?.length >= 2) {
            const pos = [...w.route, w.route[0]].map((p) => new THREE.Vector3(p.x, this.hoeheBei(p.x, p.y) + 0.25, p.y));
            const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pos), new THREE.LineDashedMaterial({ color: 0xef5d5d, dashSize: 0.8, gapSize: 0.5, depthTest: false }));
            l.computeLineDistances();
            l.renderOrder = 15;
            g.add(l);
          }
        }
        else if (s === 'raumFlaechen') g.add(this.#rechteck(w.x, w.y, w.b, w.h, 0xff9a4d, { schl, deck: 0.1 }));
        else if (s === 'tierBereiche') g.add(this.#rechteck(w.x, w.y, w.b, w.h, 0xc8a27a, { schl }));
        else if (s === 'uebergaenge') {
          g.add(this.#rechteck(w.x, w.y, w.b, w.h, 0x4aa3ff, { schl, deck: 0.22, wand: 2.2 }));
          g.add(this.#schrift(`→ ${w.ziel}${w.ankunft ? ` · ${w.ankunft}` : ''}`, w.x + w.b / 2, w.y + w.h / 2, this.hoeheBei(w.x, w.y) + 3, '#9fd0ff'));
        } else if (s === 'klaenge') {
          if (w.art === 'bereich') g.add(this.#rechteck(w.x, w.y, w.b, w.h, 0xb57cff, { schl, deck: 0.12 }));
          else if (w.art === 'punkt') {
            g.add(this.#punkt(w.x, w.y, 0xb57cff, 'kugel', { schl, hoehe: 0.6, groesse: 0.3 }));
            for (const [r, d] of [[w.innen, 0.9], [w.aussen, 0.35]]) {
              const ring = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 48 }, (_, i) => new THREE.Vector3(Math.cos((i / 48) * Math.PI * 2) * r, 0, Math.sin((i / 48) * Math.PI * 2) * r))), new THREE.LineBasicMaterial({ color: 0xb57cff, transparent: true, opacity: d }));
              ring.position.set(w.x, this.hoeheBei(w.x, w.y) + 0.06, w.y);
              g.add(ring);
            }
          }
        } else if (s === 'spawnpunkte') {
          const item = festesItem(w.inhalt);
          g.add(item ? this.#itemModell(item, w.x, w.y, w.hoehe ?? 0, { schl, ring: 0x46c27a }) : this.#punkt(w.x, w.y, 0x46c27a, 'raute', { schl, hoehe: w.hoehe ?? 0, groesse: 0.22 }));
        }
        else if (s === 'marker') {
          const [x, y] = ausSchluessel(id);
          const farbe = w.art === 'start' ? 0x46c27a : w.art === 'loot' ? 0xf2c14e : w.horde ? 0x9b5cff : 0xef5d5d;
          if (w.art === 'loot' && this.gruppen.lootVorschau.visible) g.add(this.#bodenRing(x + 0.5, y + 0.5, farbe, schl)); // Beispiel-Item liegt drauf
          else g.add(this.#punkt(x + 0.5, y + 0.5, farbe, w.art === 'loot' ? 'kasten' : 'saeule', { schl, groesse: 0.3 }));
        } else if (s === 'ankuenfte') {
          g.add(this.#punkt(w.x + 0.5, w.y + 0.5, 0x4aa3ff, 'saeule', { schl, groesse: 0.28 }));
          g.add(this.#schrift(`◉ ${id}`, w.x + 0.5, w.y + 0.5, this.hoeheBei(w.x, w.y) + 2.4, '#9fd0ff'));
        } else if (s === 'notizen') {
          const pin = this.#punkt(w.x, w.y, w.erledigt ? 0x6c7380 : 0xffd23f, 'raute', { schl, hoehe: 1.6, groesse: 0.3 });
          g.add(pin);
          g.add(this.#schrift(`${w.erledigt ? '✓ ' : '✎ '}${w.text.length > 38 ? `${w.text.slice(0, 36)}…` : w.text}`, w.x, w.y, this.hoeheBei(w.x, w.y) + 2.6, w.erledigt ? '#9aa1ad' : '#ffe08a'));
        } else if (s === 'bauwerke') g.add(this.#bauwerkModell(w, schl));
      }
    }
    // Verknüpfte Vorlagen-Kopien: gestrichelter Rahmen + Name
    for (const i of k.werte.vorlagenInstanzen ?? []) {
      const r = this.#rechteck(i.x, i.y, i.b, i.h, 0xb57cff, { deck: 0.03 });
      g.add(r);
      g.add(this.#schrift(`⧉ ${this.vorlagenName?.(i.vorlage) ?? i.vorlage}`, i.x + i.b / 2, i.y, this.hoeheBei(i.x, i.y) + 3.6, '#d7b8ff'));
    }
    // Hilfslinien (werte.hilfslinien = { x: [...], y: [...] })
    const hl = k.werte.hilfslinien ?? {};
    const linien = [];
    for (const x of hl.x ?? []) linien.push(x, 0.12, 0, x, 0.12, k.hoehe);
    for (const y of hl.y ?? []) linien.push(0, 0.12, y, k.breite, 0.12, y);
    if (linien.length) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(linien, 3));
      const l = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x3fd7ff, transparent: true, opacity: 0.85, depthTest: false }));
      l.renderOrder = 14;
      g.add(l);
    }
    // Raumnamen
    for (const [buchstabe, r] of k.s('raeume')) {
      const flaechen = [...k.s('raumFlaechen').values()].filter((f) => f.raum === buchstabe);
      if (!flaechen.length) continue;
      const f = flaechen[0];
      g.add(this.#schrift(r.name ?? buchstabe, f.x + f.b / 2, f.y + f.h / 2, this.hoeheBei(f.x, f.y) + 3.2, '#ffc58f'));
    }
    this.#zeichneAuswahl();
  }

  /** Vergleichs-Markierungen (Versionen): [{ x, y, b, h, art: 'neu'|'weg'|'geaendert' }] – null = aus */
  setzeMarkierungen(liste) {
    if (!this.markierGruppe) {
      this.markierGruppe = new THREE.Group();
      this.szene.add(this.markierGruppe);
    }
    const g = this.markierGruppe;
    g.traverse((t) => {
      t.geometry?.dispose();
      t.material?.dispose?.();
    });
    g.clear();
    const farbe = { neu: 0x46c27a, weg: 0xef5d5d, geaendert: 0xf2c14e };
    for (const m of (liste ?? []).slice(0, 3000)) g.add(this.#rechteck(m.x, m.y, Math.max(0.5, m.b), Math.max(0.5, m.h), farbe[m.art] ?? 0xffffff, { deck: 0.35, hoehe: 0.05 }));
    this.anfordern();
  }

  /** Loot-Heatmap: Gitter 0..1 je Kachel (null = aus) – durchsichtige Farbfläche über dem Boden */
  setzeHeatmap(gitter) {
    if (this.heatmap) {
      this.szene.remove(this.heatmap);
      this.heatmap.geometry.dispose();
      this.heatmap.material.map.dispose();
      this.heatmap.material.dispose();
      this.heatmap = null;
    }
    const k = this.karte;
    if (gitter && k) {
      const daten = new Uint8Array(k.breite * k.hoehe * 4);
      const farbe = new THREE.Color();
      for (let i = 0; i < gitter.length; i++) {
        const w = gitter[i];
        if (w <= 0.01) continue;
        farbe.setHSL(0.33 - w * 0.33, 0.9, 0.5);
        // Textur-Zeile 0 liegt unten (v = 0) → Kartenzeile spiegeln
        const zeile = k.hoehe - 1 - Math.floor(i / k.breite);
        daten.set([farbe.r * 255, farbe.g * 255, farbe.b * 255, 60 + w * 150], (zeile * k.breite + (i % k.breite)) * 4);
      }
      const tex = new THREE.DataTexture(daten, k.breite, k.hoehe);
      tex.magFilter = THREE.LinearFilter;
      tex.needsUpdate = true;
      this.heatmap = new THREE.Mesh(new THREE.PlaneGeometry(k.breite, k.hoehe).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
      this.heatmap.position.set(k.breite / 2, 0.15, k.hoehe / 2);
      this.heatmap.renderOrder = 3;
      this.szene.add(this.heatmap);
    }
    this.anfordern();
  }

  /** Maßband: Punkte [{x,y}] + optional Vorschau-Punkt; zeigt Linien und Längen (1 Kachel = 1 m) */
  setzeMessung(punkte, vorschau = null, info = null) {
    if (!this.messGruppe) {
      this.messGruppe = new THREE.Group();
      this.szene.add(this.messGruppe);
    }
    const g = this.messGruppe;
    g.traverse((t) => {
      t.geometry?.dispose();
      t.material?.map?.dispose();
      t.material?.dispose?.();
    });
    g.clear();
    const alle = vorschau ? [...punkte, vorschau] : punkte;
    if (alle.length >= 1) {
      const pos = alle.map((p) => new THREE.Vector3(p.x, this.hoeheBei(p.x, p.y) + 0.2, p.y));
      if (pos.length >= 2) {
        const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pos), new THREE.LineBasicMaterial({ color: 0xffe14d, depthTest: false }));
        l.renderOrder = 16;
        g.add(l);
      }
      for (const p of pos) {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe14d, depthTest: false }));
        m.position.copy(p);
        m.renderOrder = 16;
        g.add(m);
      }
      (info?.segmente ?? []).forEach((s, i) => {
        const a = alle[i];
        const b = alle[i + 1];
        g.add(this.#schrift(`${s.laenge} m`, (a.x + b.x) / 2, (a.y + b.y) / 2, this.hoeheBei(a.x, a.y) + 0.9, '#ffe14d'));
      });
      if (info && info.segmente.length > 1) {
        const e = alle.at(-1);
        g.add(this.#schrift(`Σ ${info.gesamt} m`, e.x, e.y, this.hoeheBei(e.x, e.y) + 1.8, '#ffffff'));
      }
    }
    this.anfordern();
  }

  // ---------- Laufmodus (Spieler-Perspektive) ----------
  /**
   * Durch die Zone laufen wie ein Spieler: Augenhöhe 1,6 m, Maus schaut (Zeiger gefangen), W A S D laufen, Umschalt rennt,
   * Kollision wie im Spiel über `istFrei(x, y)` (Kacheln + blockierende Möbel). Esc beendet.
   */
  starteLaufen(x, y, istFrei, beiEnde) {
    this.laufen = { x, y, blick: this.gier + Math.PI, neigung: 0, tasten: new Set(), istFrei, beiEnde, letzte: performance.now() };
    this.modusVorher = this.modus;
    this.modus = '3d';
    this.leinwand.requestPointerLock?.();
    const bewege = (e) => {
      if (document.pointerLockElement !== this.leinwand) return;
      this.laufen.blick -= e.movementX * 0.0025;
      this.laufen.neigung = Math.max(-1.2, Math.min(1.2, this.laufen.neigung - e.movementY * 0.0025));
    };
    const runter = (e) => {
      if (e.key === 'Escape') return this.beendeLaufen();
      this.laufen.tasten.add(e.key.toLowerCase());
      e.stopPropagation();
      e.preventDefault();
    };
    const hoch = (e) => this.laufen?.tasten.delete(e.key.toLowerCase());
    const klick = () => this.leinwand.requestPointerLock?.();
    document.addEventListener('mousemove', bewege);
    document.addEventListener('keydown', runter, true);
    document.addEventListener('keyup', hoch, true);
    this.leinwand.addEventListener('click', klick);
    this.laufen.aufraeumen = () => {
      document.removeEventListener('mousemove', bewege);
      document.removeEventListener('keydown', runter, true);
      document.removeEventListener('keyup', hoch, true);
      this.leinwand.removeEventListener('click', klick);
    };
    const schritt = (jetzt) => {
      const l = this.laufen;
      if (!l) return;
      const dt = Math.min(0.05, (jetzt - l.letzte) / 1000);
      l.letzte = jetzt;
      const tempo = (l.tasten.has('shift') ? 7 : 4.2) * dt;
      const vx = Math.sin(l.blick);
      const vz = Math.cos(l.blick);
      let dx = 0;
      let dz = 0;
      if (l.tasten.has('w')) [dx, dz] = [dx + vx, dz + vz];
      if (l.tasten.has('s')) [dx, dz] = [dx - vx, dz - vz];
      if (l.tasten.has('a')) [dx, dz] = [dx + vz, dz - vx];
      if (l.tasten.has('d')) [dx, dz] = [dx - vz, dz + vx];
      const n = Math.hypot(dx, dz);
      if (n) {
        const nx = l.x + (dx / n) * tempo;
        const ny = l.y + (dz / n) * tempo;
        // Achsen getrennt prüfen → an Wänden entlang rutschen
        if (l.istFrei(nx, l.y)) l.x = nx;
        if (l.istFrei(l.x, ny)) l.y = ny;
      }
      this.anfordern();
      requestAnimationFrame(schritt);
    };
    requestAnimationFrame(schritt);
    this.anfordern();
  }

  beendeLaufen() {
    const l = this.laufen;
    if (!l) return;
    l.aufraeumen();
    this.laufen = null;
    if (document.pointerLockElement === this.leinwand) document.exitPointerLock();
    this.ziel.set(l.x, this.hoeheBei(l.x, l.y), l.y);
    this.modus = this.modusVorher ?? '3d';
    l.beiEnde?.();
    this.anfordern();
  }

  // ---------- Auswahl & Gizmo ----------
  setzeAuswahl(eintraege) {
    this.auswahl = eintraege;
    this.#zeichneAuswahl();
    this.anfordern();
  }

  /** Box (Welt) eines Eintrags */
  boxVon({ s, k }) {
    const w = this.karte?.s(s)?.get(k);
    if (!w) return null;
    const box = new THREE.Box3();
    if (s === 'objekte') {
      const h = objektHoehe(w, this.karte);
      const y = this.hoeheBei(w.x + w.b / 2, w.y + w.h / 2);
      box.set(new THREE.Vector3(w.x, y, w.y), new THREE.Vector3(w.x + w.b, y + Math.max(0.05, h), w.y + w.h));
    } else if (s === 'marker') {
      const [x, y] = ausSchluessel(k);
      const z = this.hoeheBei(x, y);
      box.set(new THREE.Vector3(x, z, y), new THREE.Vector3(x + 1, z + 1.8, y + 1));
    } else if (s === 'ankuenfte') {
      const z = this.hoeheBei(w.x, w.y);
      box.set(new THREE.Vector3(w.x, z, w.y), new THREE.Vector3(w.x + 1, z + 1.8, w.y + 1));
    } else if (s === 'bauwerke') {
      const z = this.hoeheBei(w.tx, w.ty);
      box.set(new THREE.Vector3(w.tx, z, w.ty), new THREE.Vector3(w.tx + 1, z + 1, w.ty + 1));
    } else if (s === 'spawnpunkte' || (s === 'klaenge' && w.art === 'punkt')) {
      const z = this.hoeheBei(w.x, w.y) + (w.hoehe ?? 0);
      box.set(new THREE.Vector3(w.x - 0.35, z, w.y - 0.35), new THREE.Vector3(w.x + 0.35, z + 0.8, w.y + 0.35));
    } else if ('b' in w) {
      const z = this.hoeheBei(w.x, w.y);
      box.set(new THREE.Vector3(w.x, z, w.y), new THREE.Vector3(w.x + w.b, z + (s === 'uebergaenge' ? 2.2 : 0.1), w.y + w.h));
    } else return null;
    return box;
  }

  #auswahlBox() {
    let gesamt = null;
    for (const e of this.auswahl) {
      const b = this.boxVon(e);
      if (b) gesamt = gesamt ? gesamt.union(b) : b;
    }
    return gesamt;
  }

  #zeichneAuswahl() {
    const g = this.gruppen.auswahl;
    g.traverse((t) => t.geometry?.dispose());
    g.clear();
    for (const e of this.auswahl) {
      const b = this.boxVon(e);
      if (!b) continue;
      const s = b.getSize(new THREE.Vector3());
      const linie = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(s.x + 0.06, s.y + 0.06, s.z + 0.06)), new THREE.LineBasicMaterial({ color: 0xff8a3d, depthTest: false, transparent: true }));
      linie.position.copy(b.getCenter(new THREE.Vector3()));
      linie.renderOrder = 20;
      g.add(linie);
    }
    this.#griffSetzen();
  }

  #baueGizmo() {
    this.griff = new THREE.Object3D();
    this.szene.add(this.griff);
    this.transform = new TransformControls(this.kameraP, this.leinwand);
    this.transform.setSize(0.9);
    this.transform.setRotationSnap(THREE.MathUtils.degToRad(15));
    this.transform.setTranslationSnap(null);
    this.transformHelfer = this.transform.getHelper();
    this.szene.add(this.transformHelfer);
    this.gizmoModus = null;
    this.transform.addEventListener('change', () => this.anfordern());
    this.transform.addEventListener('objectChange', () => {
      // Vorschau: Auswahlrahmen folgt dem Griff
      const g = this.gruppen.auswahl;
      g.position.copy(this.griff.position).sub(this.griffStart.position);
      g.rotation.y = this.griff.rotation.y - this.griffStart.rotation.y;
      const f = this.griff.scale.x;
      g.scale.setScalar(f);
      if (this.gizmoModus !== 'translate') {
        // um die Griffmitte drehen/skalieren
        const m = new THREE.Matrix4().makeTranslation(this.griff.position.x, 0, this.griff.position.z).multiply(new THREE.Matrix4().makeRotationY(g.rotation.y)).multiply(new THREE.Matrix4().makeScale(f, f, f)).multiply(new THREE.Matrix4().makeTranslation(-this.griffStart.position.x, 0, -this.griffStart.position.z));
        g.position.set(0, 0, 0);
        g.rotation.set(0, 0, 0);
        g.scale.set(1, 1, 1);
        g.matrixAutoUpdate = false;
        g.matrix.copy(m);
      }
      this.anfordern();
    });
    this.transform.addEventListener('dragging-changed', (e) => {
      if (e.value) {
        this.griffStart = { position: this.griff.position.clone(), rotation: this.griff.rotation.clone() };
        return;
      }
      const g = this.gruppen.auswahl;
      g.matrixAutoUpdate = true;
      g.position.set(0, 0, 0);
      g.rotation.set(0, 0, 0);
      g.scale.set(1, 1, 1);
      const start = this.griffStart;
      if (!start) return;
      if (this.gizmoModus === 'translate') this.beiGizmo?.('bewegen', { dx: r3(this.griff.position.x - start.position.x), dy: r3(this.griff.position.z - start.position.z), dz: r3(this.griff.position.y - start.position.y) });
      else if (this.gizmoModus === 'rotate') this.beiGizmo?.('drehen', { grad: Math.round(THREE.MathUtils.radToDeg(-(this.griff.rotation.y - start.rotation.y))) });
      else if (this.gizmoModus === 'scale') this.beiGizmo?.('skalieren', { faktor: r3(this.griff.scale.x) });
      this.griff.rotation.set(0, 0, 0);
      this.griff.scale.set(1, 1, 1);
      this.griffStart = null;
    });
  }

  /** Gizmo-Art: null | 'translate' | 'rotate' | 'scale' */
  setzeGizmo(art) {
    this.gizmoModus = art;
    if (art) this.transform.setMode(art);
    this.transform.showX = true;
    this.transform.showZ = true;
    this.transform.showY = art !== 'translate' || this.auswahl.some((a) => a.s === 'spawnpunkte');
    if (art === 'rotate') {
      this.transform.showX = false;
      this.transform.showZ = false;
      this.transform.showY = true;
    }
    if (art === 'scale') {
      this.transform.showY = false;
      this.transform.showZ = false;
    }
    this.#griffSetzen();
    this.anfordern();
  }

  #griffSetzen() {
    const b = this.auswahl.length && this.gizmoModus ? this.#auswahlBox() : null;
    if (!b) {
      this.transform.detach();
      return;
    }
    const c = b.getCenter(new THREE.Vector3());
    this.griff.position.set(c.x, b.min.y, c.z);
    this.griff.rotation.set(0, 0, 0);
    this.griff.scale.set(1, 1, 1);
    if (this.transform.object !== this.griff) this.transform.attach(this.griff);
  }

  // ---------- Hilfen (Raster, Schwebe-Kachel, Geist) ----------
  #baueHilfen() {
    this.rasterHelfer = new THREE.Group();
    this.gruppen.hilfe.add(this.rasterHelfer);
    this.schwebe = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 0.001, 1)), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthTest: false }));
    this.schwebe.renderOrder = 15;
    this.schwebe.visible = false;
    this.gruppen.hilfe.add(this.schwebe);
  }

  #raster() {
    const g = this.rasterHelfer;
    g.traverse((t) => t.geometry?.dispose());
    g.clear();
    const k = this.karte;
    if (!k) return;
    const punkte = [];
    for (let x = 0; x <= k.breite; x++) punkte.push(x, 0.03, 0, x, 0.03, k.hoehe);
    for (let y = 0; y <= k.hoehe; y++) punkte.push(0, 0.03, y, k.breite, 0.03, y);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(punkte, 3));
    g.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.06, depthWrite: false })));
    const rand = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(k.breite, 0.001, k.hoehe)), new THREE.LineBasicMaterial({ color: 0xff8a3d, transparent: true, opacity: 0.55 }));
    rand.position.set(k.breite / 2, 0.05, k.hoehe / 2);
    g.add(rand);
  }

  setzeSchwebe(x, y, b = 1, h = 1) {
    if (x === null) this.schwebe.visible = false;
    else {
      this.schwebe.visible = true;
      this.schwebe.scale.set(b, 1, h);
      this.schwebe.position.set(x + b / 2, this.hoeheBei(x, y) + 0.06, y + h / 2);
    }
    this.anfordern();
  }

  /**
   * Platzier-Vorschau: [{ x, y, b, h, hoehe?, dreh?, unten? }] als Kästen, gueltig → grün/rot. null = aus.
   */
  setzeGeist(liste, gueltig = true) {
    const g = this.gruppen.geist;
    g.traverse((t) => t.geometry?.dispose());
    g.clear();
    if (!liste?.length) return this.anfordern();
    const farbe = gueltig ? 0x46c27a : 0xef5d5d;
    for (const e of liste.slice(0, 4000)) {
      const hoehe = Math.max(0.05, e.hoehe ?? 0.1);
      const m = new THREE.Mesh(this.formGeo.kasten, new THREE.MeshBasicMaterial({ color: farbe, transparent: true, opacity: 0.32, depthWrite: false }));
      m.scale.set(e.b, hoehe, e.h);
      m.rotation.y = e.dreh ?? 0;
      m.position.set(e.x + (e.mitte ? 0 : e.b / 2), this.hoeheBei(e.x, e.y) + (e.unten ?? 0), e.y + (e.mitte ? 0 : e.h / 2));
      m.renderOrder = 12;
      g.add(m);
    }
    this.anfordern();
  }

  // ---------- Treffer ----------
  /** Bildschirmpunkt → { x, y (Kacheln, Bruch), tx, ty, treffer: {s,k}|null, punkt (Welt) } */
  treffe(clientX, clientY, { nurBoden = false } = {}) {
    const r = this.leinwand.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    const strahl = new THREE.Raycaster();
    this.#kameraSetzen();
    strahl.setFromCamera(ndc, this.kamera);
    let treffer = null;
    let fl = null;
    if (!nurBoden) {
      const ziele = [];
      if (this.ebenen.objekte) ziele.push(...[...this.instanzen.values()].map((i) => i.mesh), this.gruppen.modelle);
      if (this.ebenen.overlays) ziele.push(this.gruppen.overlays);
      for (const t of strahl.intersectObjects(ziele, true)) {
        if (t.object.isInstancedMesh) {
          const e = [...this.instanzen.values()].find((i) => i.mesh === t.object);
          const schl = e?.schluessel[t.instanceId];
          if (schl) {
            treffer = schl;
            break;
          }
        } else {
          let o = t.object;
          while (o && !o.userData?.s && o.parent && o.parent !== this.gruppen.overlays && o.parent !== this.gruppen.modelle) o = o.parent; // nachgeladene Teile erben vom Eltern-Knoten
          const u = o?.userData;
          if (!u?.s) continue;
          if (u.flaeche) {
            fl ??= { s: u.s, k: u.k };
            continue;
          }
          treffer = { s: u.s, k: u.k };
          break;
        }
      }
    }
    const boden = strahl.intersectObjects(this.gruppen.boden.children, false)[0];
    let punkt = boden?.point;
    if (!punkt) {
      punkt = new THREE.Vector3();
      if (!strahl.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), punkt)) punkt = null;
    }
    if (!punkt) return null;
    let t = treffer ?? fl;
    if (t && this.ebenenZustand && !ebeneFrei(this.ebenenZustand, ebeneVon(t.s))) t = null; // ausgeblendet/gesperrt → nicht anklickbar
    return { x: punkt.x, y: punkt.z, tx: Math.floor(punkt.x), ty: Math.floor(punkt.z), treffer: t, punkt };
  }

  // ---------- Steuerung ----------
  #steuerung() {
    const el = this.leinwand;
    let ziehen = null;
    const tasten = new Set();
    let leertaste = false;
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('pointerdown', (e) => {
      el.focus();
      if (this.transform.dragging || this.transform.axis) return; // Gizmo hat Vorrang
      const kamera = e.button === 2 || e.button === 1 || (e.button === 0 && (e.altKey || leertaste));
      if (kamera) {
        ziehen = { art: e.button === 1 || leertaste || (this.modus === '2d' && e.button === 2) ? 'schieben' : 'drehen', x: e.clientX, y: e.clientY, bewegt: false, taste: e.button };
        el.setPointerCapture(e.pointerId);
        return;
      }
      if (e.button === 0) {
        ziehen = { art: 'werkzeug' };
        el.setPointerCapture(e.pointerId);
        this.beiZeiger?.unten?.(e);
      }
    });
    el.addEventListener('pointermove', (e) => {
      if (ziehen?.art === 'drehen' || ziehen?.art === 'schieben') {
        const dx = e.clientX - ziehen.x;
        const dy = e.clientY - ziehen.y;
        ziehen.x = e.clientX;
        ziehen.y = e.clientY;
        if (Math.abs(dx) + Math.abs(dy) > 1) ziehen.bewegt = true;
        if (ziehen.art === 'drehen') {
          this.gier -= dx * 0.006;
          this.neigung = Math.min(1.52, Math.max(0.12, this.neigung + dy * 0.005));
        } else {
          const f = (this.abstand / el.clientHeight) * (this.modus === '2d' ? 1.1 : 1.15);
          const vor = new THREE.Vector3(Math.sin(this.gier), 0, Math.cos(this.gier));
          const rechts = new THREE.Vector3(vor.z, 0, -vor.x);
          if (this.modus === '2d') this.ziel.add(new THREE.Vector3(-dx * f, 0, -dy * f));
          else this.ziel.addScaledVector(rechts, -dx * f).addScaledVector(vor, -dy * f);
        }
        this.anfordern();
        this.beiKamera?.();
        return;
      }
      if (ziehen?.art === 'werkzeug') this.beiZeiger?.bewege?.(e);
      else this.beiZeiger?.schweben?.(e);
    });
    const ende = (e) => {
      if (ziehen?.art === 'werkzeug') this.beiZeiger?.oben?.(e);
      else if (ziehen && !ziehen.bewegt && ziehen.taste === 2) this.beiZeiger?.kontext?.(e);
      ziehen = null;
    };
    el.addEventListener('pointerup', ende);
    el.addEventListener('pointercancel', ende);
    el.addEventListener('pointerleave', () => this.beiZeiger?.verlassen?.());
    el.addEventListener('dblclick', (e) => this.beiZeiger?.doppel?.(e));
    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        if (this.beiZeiger?.rad?.(e)) return;
        const f = Math.exp(Math.sign(e.deltaY) * Math.min(0.4, Math.abs(e.deltaY) * 0.0016));
        // zum Mauszeiger hin zoomen
        const t = this.treffe(e.clientX, e.clientY, { nurBoden: true });
        const neu = Math.max(4, Math.min(900, this.abstand * f));
        if (t) {
          const anteil = 1 - neu / this.abstand;
          this.ziel.x += (t.punkt.x - this.ziel.x) * anteil;
          this.ziel.z += (t.punkt.z - this.ziel.z) * anteil;
        }
        this.abstand = neu;
        this.anfordern();
        this.beiKamera?.();
      },
      { passive: false },
    );
    el.addEventListener('keydown', (e) => {
      if (e.key === ' ') {
        leertaste = true;
        e.preventDefault();
      }
      if (ziehen?.art === 'drehen' && 'wasdqe'.includes(e.key.toLowerCase())) {
        tasten.add(e.key.toLowerCase());
        e.preventDefault();
        e.stopPropagation();
        this.#flug(tasten);
      }
    });
    el.addEventListener('keyup', (e) => {
      if (e.key === ' ') leertaste = false;
      tasten.delete(e.key.toLowerCase());
    });
    this.istKameraZiehen = () => ziehen?.art === 'drehen' || ziehen?.art === 'schieben';
  }

  #flug(tasten) {
    if (this.fliegt) return;
    this.fliegt = true;
    let letzte = performance.now();
    const schritt = (jetzt) => {
      if (!tasten.size) {
        this.fliegt = false;
        return;
      }
      const dt = Math.min(0.05, (jetzt - letzte) / 1000);
      letzte = jetzt;
      const tempo = this.abstand * 1.2 * dt;
      const vor = new THREE.Vector3(-Math.sin(this.gier), 0, -Math.cos(this.gier));
      const rechts = new THREE.Vector3(-vor.z, 0, vor.x);
      if (tasten.has('w')) this.ziel.addScaledVector(vor, tempo);
      if (tasten.has('s')) this.ziel.addScaledVector(vor, -tempo);
      if (tasten.has('d')) this.ziel.addScaledVector(rechts, tempo);
      if (tasten.has('a')) this.ziel.addScaledVector(rechts, -tempo);
      if (tasten.has('e')) this.abstand = Math.max(4, this.abstand * (1 - dt));
      if (tasten.has('q')) this.abstand = Math.min(900, this.abstand * (1 + dt));
      this.anfordern();
      requestAnimationFrame(schritt);
    };
    requestAnimationFrame(schritt);
  }
}

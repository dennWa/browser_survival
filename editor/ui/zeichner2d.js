import { streckenInfo } from '../kern/messen.js';
import { eintragAnzeige } from '../kern/zonenManager.js';
import { lootVorschau, lootDichte } from '../kern/lootZonenEditor.js';
import { KACHELN } from '../../gemeinsam/welt/kacheln.js';
import { ausSchluessel } from '../kern/karte.js';
import { kachelInfo, objektInfo } from '../kern/katalog.js';
import { istSteil } from '../kern/terrain.js';
import { BAUWERKE } from '../../gemeinsam/welt/bauwerke.js';
import { drehLage, ecken } from '../../gemeinsam/welt/drehung.js';
import { drehGriff } from '../kern/bearbeiten.js';

/**
 * 2D-Draufsicht (Canvas). Kamera in Kachelkoordinaten (Mitte des Bilds) + Zoom (Pixel pro Kachel).
 * Oben und links laufen Lineale mit Kachelnummern (LINEAL px breit) – Koordinaten überall.
 * Kacheln liegen in 1-Pixel-pro-Kachel-Bildern, aufgeteilt in Stücke à STUECK Kacheln (6.4: nur sichtbare Stücke werden gebaut,
 * geänderte Kacheln nur nachgemalt) und ohne Glättung hochskaliert → scharf und schnell, auch bei 10 000 × 10 000.
 * Bemalung/Gelände genauso stückweise (geändertes Stück = neu bauen). `kachelBild` (Nachbarn, Weltkarte) rechnet große
 * Zonen auf höchstens KACHELBILD_MAX px herunter.
 * 6.4/7.2: `weltZonen` (alle anderen Zonen relativ zur aktiven, von ui/zonenUi.js) als Umrisse beim Zone-Werkzeug,
 * „Neue Zone aufziehen“ und KI-Markieren; `zonenLage` = Vorschau beim Verschieben der Zone; zustand.kiBereich = KI-Bereich.
 * Ebenen (zustand.ebenen, kern/ebenen.js): ausgeblendete werden nicht gezeichnet, gesperrte ausgegraut (`this.dimm`).
 * Frei gedrehte Objekte (5.5): Grundfläche als gedrehtes Polygon (gemeinsam/welt/drehung.js), im Free-Modus Drehgriff am
 * einzeln gewählten Objekt (kern/bearbeiten.drehGriff); Vorschau ebenfalls gedreht.
 * Klänge (Phase 4, #zeichneKlaenge): Punkt mit Kreisen voll/Hörweite (+ Griffe), Ambiente-Rechteck mit Rand, Global als Hinweis.
 * Touch (7.6, gesetzt von ui/touchBauen.js): `fadenkreuz` {px,py} über dem Finger, `griffQuelle()` → große Griffe
 * [{x,y,symbol,id}] in Bildpunkten, `nachZeichnen()` danach (Lupe kopiert aus der fertigen Leinwand).
 */
export const LINEAL = 24;
const MIN_ZOOM = 2;
const MAX_ZOOM = 96;
/** Kachel-Puffer-Stück (Kacheln je Seite) – nur sichtbare Stücke entstehen */
const STUECK = 256;
/** größte Kantenlänge (px) der verkleinerten Zonen-Bilder (Nachbarn, Weltkarte) */
const KACHELBILD_MAX = 1024;

/** '#rrggbb' → [r, g, b] (Kachelfarben sind Hex) */
const farbeRgb = (f) => {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(String(f ?? ''));
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [255, 0, 255];
};
const RGB_PUFFER = new Map();
const kachelRgb = (z) => {
  if (!RGB_PUFFER.has(z)) RGB_PUFFER.set(z, farbeRgb(kachelInfo(z).farbe));
  return RGB_PUFFER.get(z);
};

export class Zeichner2D {
  constructor(leinwand, zustand) {
    this.leinwand = leinwand;
    this.ctx = leinwand.getContext('2d');
    this.zustand = zustand;
    this.kamera = { x: 20, y: 15 };
    this.zoom = 16;
    this.cache = null; // { karte, breite, hoehe, bild, terrain }
    this.atlas = null; // { daten, bild } – Möbel-Draufsichten aus client/assets (optional)
    this.vorschau = null; // von den Werkzeugen gesetzt
    this.neuRechteck = null; // Zone neu aufziehen
    this.massband = null; // 7.3: { punkte: [{x,y}], fertig }
    this.fangLinien = null; // 7.3: [{ achse, wert }] beim Einrasten
    this.hilfslinieZiehen = null; // 7.3: { achse, wert } beim Ziehen aus dem Lineal
    this.fadenkreuz = null; // 7.6: { px, py } Touch-Fadenkreuz über dem Finger
    this.griffQuelle = null; // 7.6: () => [{ x, y, symbol, id, aktiv? }] Touch-Griffe in Bildpunkten
    this.nachZeichnen = null; // 7.6: Lupe nachziehen
    this.zonenGriffe = false;
    this.zonenVorschau = null; // { x, y, b, h } beim Größe ändern
    this.nachbarn = []; // [{ karte, dx, dy }] Nachbarzonen relativ (Phase 7)
    this.weltZonen = []; // 6.4: alle anderen Zonen relativ zur aktiven [{ id, name, x, y, b, h }] (ui/zonenUi.js)
    this.weltZonenZeigen = false; // 6.4: Umrisse auch außerhalb des Zone-Werkzeugs (Neue Zone aufziehen)
    this.schutzVorschau = null; // Runde 19: geschützte Fläche beim Aufziehen (Werkzeug kiSchutz)
    this.zonenLage = null; // 6.4: Vorschau beim Verschieben der Zone { dx, dy, konflikte: [] }
    this.innen = null; // Uint8Array, gesetzt von außen (Spiel-Berechnung)
    /** Hervorhebungen über allem (KI-Diff, Prüf-Fehler): [{ rechteck, farbe, gestrichelt?, text? }] */
    this.ueberlagerungen = [];
    /** Deckkraft der gerade gezeichneten Ebene (1 = normal, gesperrt = ausgegraut) – alle globalAlpha damit malnehmen */
    this.dimm = 1;
    this.#angefragt = false;
    zustand.bei('karte', (ops) => this.#aufOps(ops));
    zustand.bei('zone', () => {
      this.cache = null;
      this.anfordern();
    });
    zustand.bei('auswahl', () => this.anfordern());
    zustand.bei('ebenen', () => this.anfordern());
    zustand.bei('werkzeug', () => {
      this.vorschau = null; // alte Platzier-Vorschau nicht kleben lassen
      this.anfordern();
    });
    new ResizeObserver(() => this.anfordern()).observe(leinwand);
  }

  #angefragt;

  anfordern() {
    if (this.#angefragt) return;
    this.#angefragt = true;
    requestAnimationFrame(() => {
      this.#angefragt = false;
      this.zeichne();
    });
  }

  // --- Koordinaten -----------------------------------------------------------
  get groesse() {
    return { b: this.leinwand.clientWidth, h: this.leinwand.clientHeight };
  }

  /** Kachelkoordinate (Bruch) → Bildpunkt */
  zuBild(x, y) {
    const { b, h } = this.groesse;
    return { x: (x - this.kamera.x) * this.zoom + (b + LINEAL) / 2, y: (y - this.kamera.y) * this.zoom + (h + LINEAL) / 2 };
  }

  /** Bildpunkt → Kachelkoordinate (Bruch) */
  zuWelt(px, py) {
    const { b, h } = this.groesse;
    return { x: (px - (b + LINEAL) / 2) / this.zoom + this.kamera.x, y: (py - (h + LINEAL) / 2) / this.zoom + this.kamera.y };
  }

  zoomen(faktor, umPx = null, umPy = null) {
    const { b, h } = this.groesse;
    const px = umPx ?? (b + LINEAL) / 2;
    const py = umPy ?? (h + LINEAL) / 2;
    const vorher = this.zuWelt(px, py);
    this.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, this.zoom * faktor));
    const nachher = this.zuWelt(px, py);
    this.kamera.x += vorher.x - nachher.x;
    this.kamera.y += vorher.y - nachher.y;
    this.anfordern();
  }

  schwenken(dpx, dpy) {
    this.kamera.x -= dpx / this.zoom;
    this.kamera.y -= dpy / this.zoom;
    this.anfordern();
  }

  einpassen() {
    const k = this.zustand.karte;
    if (!k) return;
    const { b, h } = this.groesse;
    this.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.min((b - LINEAL - 30) / k.breite, (h - LINEAL - 30) / k.hoehe)));
    this.kamera = { x: k.breite / 2, y: k.hoehe / 2 };
    this.anfordern();
  }

  /** Ansicht so wählen, dass die aktive Zone und die genannten anderen Zonen (Weltanordnung) ganz zu sehen sind */
  einpassenMit(ids) {
    const k = this.zustand.karte;
    const p = this.zustand.layout[this.zustand.aktivId];
    if (!k || !p) return this.einpassen();
    let x0 = 0, y0 = 0, x1 = k.breite, y1 = k.hoehe;
    for (const id of ids) {
      const l = this.zustand.layout[id];
      const z = this.zustand.zonen.get(id)?.karte;
      if (!l || !z) continue;
      x0 = Math.min(x0, l.x - p.x);
      y0 = Math.min(y0, l.y - p.y);
      x1 = Math.max(x1, l.x - p.x + z.breite);
      y1 = Math.max(y1, l.y - p.y + z.hoehe);
    }
    const { b, h } = this.groesse;
    this.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.min((b - LINEAL - 30) / (x1 - x0), (h - LINEAL - 30) / (y1 - y0))));
    this.kamera = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
    this.anfordern();
  }

  springeZu(x, y, zoom = Math.max(this.zoom, 20)) {
    this.zoom = zoom;
    this.kamera = { x: x + 0.5, y: y + 0.5 };
    this.anfordern();
  }

  // --- Kachel-Cache (stückweise, 6.4) --------------------------------------------------
  // cache = { karte, breite, hoehe, stuecke: Map("sx,sy" → { boden, farbe|null, terrain|null, farbeAlt, terrainAlt }),
  //           mitFarbe, mitTerrain } – Stücke entstehen erst, wenn sie sichtbar sind
  #aufOps(ops) {
    const k = this.zustand.karte;
    if (!this.cache || this.cache.karte !== k) this.cache = null;
    else
      for (const op of ops) {
        if (op.s === 'raster') {
          this.cache = null;
          break;
        }
        if (op.s === 'kachel') this.#maleKachel(op.i);
        else if (op.s === 'hoehe') {
          this.cache.mitTerrain = true;
          // Schummerung hängt an den Nachbarn → auch angrenzende Stücke
          const x = op.i % k.breite;
          const y = Math.floor(op.i / k.breite);
          for (const [dx, dy] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]) this.#stueckAlt(x + dx, y + dy, 'terrainAlt');
        } else if (op.s === 'bemalung') {
          this.cache.mitFarbe = true;
          const [x, y] = ausSchluessel(op.k);
          this.#stueckAlt(x, y, 'farbeAlt');
        }
      }
    this.anfordern();
  }

  #stueckAlt(x, y, feld) {
    const s = this.cache.stuecke.get(`${Math.floor(x / STUECK)},${Math.floor(y / STUECK)}`);
    if (s) s[feld] = true;
  }

  #baueCache() {
    const k = this.zustand.karte;
    // Gelände/Bemalung nur, wenn es sie gibt (einmal prüfen; danach schalten Ops sie an)
    let mitTerrain = false;
    for (let i = 0; i < k.hoehen.length && !mitTerrain; i++) if (k.hoehen[i] !== 0) mitTerrain = true;
    this.cache = { karte: k, breite: k.breite, hoehe: k.hoehe, stuecke: new Map(), mitFarbe: k.s('bemalung').size > 0, mitTerrain };
  }

  /** Stück (sx, sy) holen und fehlende/veraltete Teile bauen */
  #stueck(sx, sy) {
    const c = this.cache;
    const schl = `${sx},${sy}`;
    let s = c.stuecke.get(schl);
    if (!s) {
      const x0 = sx * STUECK;
      const y0 = sy * STUECK;
      const b = Math.min(STUECK, c.breite - x0);
      const h = Math.min(STUECK, c.hoehe - y0);
      s = { x0, y0, b, h, boden: new OffscreenCanvas(b, h), farbe: null, terrain: null, farbeAlt: true, terrainAlt: true };
      s.ctx = s.boden.getContext('2d');
      const daten = s.ctx.createImageData(b, h);
      const k = c.karte;
      for (let y = 0; y < h; y++)
        for (let x = 0; x < b; x++) {
          const [r, g, bl] = kachelRgb(k.zellen[(y0 + y) * k.breite + x0 + x]);
          const p = (y * b + x) * 4;
          daten.data[p] = r;
          daten.data[p + 1] = g;
          daten.data[p + 2] = bl;
          daten.data[p + 3] = 255;
        }
      s.ctx.putImageData(daten, 0, 0);
      c.stuecke.set(schl, s);
    }
    if (s.farbeAlt) this.#baueFarbe(s);
    if (s.terrainAlt) this.#baueTerrain(s);
    return s;
  }

  #maleKachel(i) {
    const k = this.cache.karte;
    const x = i % k.breite;
    const y = Math.floor(i / k.breite);
    const s = this.cache.stuecke.get(`${Math.floor(x / STUECK)},${Math.floor(y / STUECK)}`);
    if (!s) return; // noch nie sichtbar → entsteht später frisch
    s.ctx.fillStyle = kachelInfo(k.zellen[i]).farbe;
    s.ctx.fillRect(x - s.x0, y - s.y0, 1, 1);
  }

  /** Bemalung (Phase 10) des Stücks als 1-px-pro-Kachel-Bild – dieselben Farben zeigt die 3D-Ansicht und das Spiel */
  #baueFarbe(s) {
    const k = this.cache.karte;
    s.farbeAlt = false;
    s.farbe = null;
    if (!this.cache.mitFarbe || !k.s('bemalung').size) return;
    let c = null;
    for (const [schl, f] of k.s('bemalung')) {
      const [x, y] = ausSchluessel(schl);
      if (x < s.x0 || y < s.y0 || x >= s.x0 + s.b || y >= s.y0 + s.h) continue;
      if (!c) {
        s.farbe = new OffscreenCanvas(s.b, s.h);
        c = s.farbe.getContext('2d');
      }
      c.fillStyle = f;
      c.fillRect(x - s.x0, y - s.y0, 1, 1);
    }
  }

  #baueTerrain(s) {
    const k = this.cache.karte;
    s.terrainAlt = false;
    s.terrain = null;
    if (!this.cache.mitTerrain) return;
    let etwas = false;
    const bild = new OffscreenCanvas(s.b, s.h);
    const ctx = bild.getContext('2d');
    const daten = ctx.createImageData(s.b, s.h);
    for (let y = s.y0; y < s.y0 + s.h; y++)
      for (let x = s.x0; x < s.x0 + s.b; x++) {
        const h = k.hoeheAn(x, y);
        // Schummerung: Licht von links oben
        const neigung = (k.hoeheAn(x - 1, y) - k.hoeheAn(x + 1, y) + k.hoeheAn(x, y - 1) - k.hoeheAn(x, y + 1)) * 0.5;
        if (h === 0 && neigung === 0) continue;
        etwas = true;
        const p = ((y - s.y0) * s.b + (x - s.x0)) * 4;
        const hell = Math.max(0, Math.min(255, 128 + neigung * 50 + h * 6));
        daten.data[p] = daten.data[p + 1] = daten.data[p + 2] = hell;
        daten.data[p + 3] = 90;
      }
    if (!etwas) return;
    ctx.putImageData(daten, 0, 0);
    s.terrain = bild;
  }

  /** Sichtbare Stücke (gebaut) */
  #sichtbareStuecke(k) {
    const f = this.#sichtFenster(k);
    if (f.x1 < f.x0 || f.y1 < f.y0) return [];
    const liste = [];
    for (let sy = Math.floor(f.y0 / STUECK); sy <= Math.floor(f.y1 / STUECK); sy++) for (let sx = Math.floor(f.x0 / STUECK); sx <= Math.floor(f.x1 / STUECK); sx++) liste.push(this.#stueck(sx, sy));
    return liste;
  }

  // --- Zeichnen --------------------------------------------------------------
  zeichne() {
    const ctx = this.ctx;
    const dpr = window.devicePixelRatio || 1;
    const { b, h } = this.groesse;
    if (this.leinwand.width !== Math.round(b * dpr) || this.leinwand.height !== Math.round(h * dpr)) {
      this.leinwand.width = Math.round(b * dpr);
      this.leinwand.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0d0f12';
    ctx.fillRect(0, 0, b, h);
    const k = this.zustand.karte;
    if (k) {
      if (!this.cache || this.cache.karte !== k || this.cache.breite !== k.breite || this.cache.hoehe !== k.hoehe) this.#baueCache();
      this.#zeichneNachbarn(ctx);
      const o = this.zuBild(0, 0);
      const b = k.breite * this.zoom;
      const hh = k.hoehe * this.zoom;
      const stuecke = this.#sichtbareStuecke(k);
      const male = (s, bild) => {
        const p = this.zuBild(s.x0, s.y0);
        ctx.drawImage(bild, p.x, p.y, s.b * this.zoom, s.h * this.zoom);
      };
      ctx.imageSmoothingEnabled = false;
      if (this.zustand.sichtbar('boden')) this.#ebene(ctx, 'boden', () => stuecke.forEach((s) => male(s, s.boden)));
      else {
        ctx.fillStyle = '#2a2f37';
        ctx.fillRect(o.x, o.y, b, hh);
      }
      if (stuecke.some((s) => s.farbe))
        this.#ebene(ctx, 'bemalung', () => {
          ctx.globalAlpha = 0.6 * this.dimm;
          stuecke.forEach((s) => s.farbe && male(s, s.farbe));
        });
      if (stuecke.some((s) => s.terrain))
        this.#ebene(ctx, 'terrain', () => {
          ctx.imageSmoothingEnabled = true;
          stuecke.forEach((s) => s.terrain && male(s, s.terrain));
          this.#zeichneHoehen(ctx, k);
        });
      if (this.zustand.sichtbar('boden')) this.#ebene(ctx, 'boden', () => this.#zeichneKachelDetails(ctx, k));
      if (this.zustand.sichtbar('innen')) this.#zeichneInnen(ctx, k);
      if (this.zustand.sichtbar('steil')) this.#zeichneSteil(ctx, k);
      this.#ebene(ctx, 'bereiche', () => this.#zeichneBereiche(ctx, k));
      this.#ebene(ctx, 'objekte', () => this.#zeichneObjekte(ctx, k));
      this.#ebene(ctx, 'bauwerke', () => this.#zeichneBauwerke(ctx, k));
      this.#ebene(ctx, 'marker', () => this.#zeichneMarker(ctx, k));
      this.#ebene(ctx, 'uebergaenge', () => this.#zeichneUebergaenge(ctx, k));
      this.#ebene(ctx, 'klaenge', () => this.#zeichneKlaenge(ctx, k));
      this.#zeichneAuswahlRechteck(ctx);
      this.#zeichneUeberlagerungen(ctx);
      if (this.zustand.sichtbar('lootDichte')) this.#zeichneLootDichte(ctx, k);
      this.#zeichneVorschau(ctx);
      const w = this.zustand.werkzeug;
      if (w === 'zone' || w === 'kiMarkieren' || w === 'kiSchutz' || this.weltZonenZeigen) this.#zeichneWeltZonen(ctx);
      this.#zeichneKiBereich(ctx);
      this.#zeichneZonenRand(ctx, k);
      this.#zeichneMessen(ctx, k);
      this.#zeichneTouch(ctx);
    }
    if (this.neuRechteck) this.#rahmen(ctx, this.neuRechteck, '#4caf50', `${this.neuRechteck.b} × ${this.neuRechteck.h}`, true);
    this.#zeichneLineale(ctx);
    this.nachZeichnen?.();
  }

  /** 7.6: große Touch-Griffe um die Auswahl + Fadenkreuz über dem Finger */
  #zeichneTouch(ctx) {
    const griffe = this.griffQuelle?.() ?? [];
    ctx.save();
    for (const g of griffe) {
      ctx.beginPath();
      ctx.arc(g.x, g.y, 20, 0, Math.PI * 2);
      ctx.fillStyle = g.aktiv ? 'rgba(255,193,7,0.95)' : 'rgba(20,23,28,0.82)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ffc107';
      ctx.stroke();
      ctx.fillStyle = g.aktiv ? '#111' : '#fff';
      ctx.font = 'bold 20px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(g.symbol, g.x, g.y + 1);
    }
    const f = this.fadenkreuz;
    if (f) {
      for (const [farbe, breite] of [['rgba(0,0,0,0.7)', 4], ['#fff', 1.5]]) {
        ctx.strokeStyle = farbe;
        ctx.lineWidth = breite;
        ctx.beginPath();
        ctx.moveTo(f.px - 18, f.py);
        ctx.lineTo(f.px - 5, f.py);
        ctx.moveTo(f.px + 5, f.py);
        ctx.lineTo(f.px + 18, f.py);
        ctx.moveTo(f.px, f.py - 18);
        ctx.lineTo(f.px, f.py - 5);
        ctx.moveTo(f.px, f.py + 5);
        ctx.lineTo(f.px, f.py + 18);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(f.px, f.py, 11, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /** Ebene zeichnen: ausgeblendet = gar nicht, gesperrt = ausgegraut */
  #ebene(ctx, id, zeichne) {
    if (!this.zustand.sichtbar(id)) return;
    this.dimm = this.zustand.ebenen[id]?.gesperrt ? 0.35 : 1;
    ctx.save();
    ctx.globalAlpha = this.dimm;
    zeichne();
    ctx.restore();
    this.dimm = 1;
  }

  #rechteckBild(x, y, bb, hh) {
    const a = this.zuBild(x, y);
    return { x: a.x, y: a.y, b: bb * this.zoom, h: hh * this.zoom };
  }

  #sichtbar(r) {
    const { b, h } = this.groesse;
    return r.x + r.b >= LINEAL && r.y + r.h >= LINEAL && r.x <= b && r.y <= h;
  }

  /** Sichtbarer Kachelbereich (inklusive, auf die Karte begrenzt) */
  #sichtFenster(k) {
    const { b, h } = this.groesse;
    const a = this.zuWelt(LINEAL, LINEAL);
    const e = this.zuWelt(b, h);
    return { x0: Math.max(0, Math.floor(a.x)), y0: Math.max(0, Math.floor(a.y)), x1: Math.min(k.breite - 1, Math.floor(e.x)), y1: Math.min(k.hoehe - 1, Math.floor(e.y)) };
  }

  #zeichneKachelDetails(ctx, k) {
    const z = this.zoom;
    if (z < 6) return;
    const f = this.#sichtFenster(k);
    ctx.save();
    // Raster
    // Raster (7.3: Weite + Hauptlinien einstellbar)
    const w = this.zustand.rasterWeite ?? 1;
    const haupt = (this.zustand.hauptlinien ?? 10) * w;
    if (this.zustand.sichtbar('raster') && z * w >= 8) {
      for (const hauptLauf of [false, true]) {
        ctx.strokeStyle = hauptLauf ? 'rgba(0,0,0,0.38)' : 'rgba(0,0,0,0.18)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        const istHaupt = (v) => Math.abs(v / haupt - Math.round(v / haupt)) < 1e-6;
        for (let x = Math.floor(f.x0 / w) * w; x <= f.x1 + 1; x += w) {
          if (istHaupt(x) !== hauptLauf) continue;
          const p = this.zuBild(x, f.y0);
          ctx.moveTo(Math.round(p.x) + 0.5, p.y);
          ctx.lineTo(Math.round(p.x) + 0.5, this.zuBild(x, f.y1 + 1).y);
        }
        for (let y = Math.floor(f.y0 / w) * w; y <= f.y1 + 1; y += w) {
          if (istHaupt(y) !== hauptLauf) continue;
          const p = this.zuBild(f.x0, y);
          ctx.moveTo(p.x, Math.round(p.y) + 0.5);
          ctx.lineTo(this.zuBild(f.x1 + 1, y).x, Math.round(p.y) + 0.5);
        }
        ctx.stroke();
      }
    }
    // Türen & Fenster erkennbar machen
    for (let y = f.y0; y <= f.y1; y++)
      for (let x = f.x0; x <= f.x1; x++) {
        const c = k.zellen[y * k.breite + x];
        if (c !== 'T' && c !== 'F' && c !== '#') continue;
        const p = this.zuBild(x, y);
        if (c === 'T') {
          ctx.fillStyle = '#d9a35f';
          ctx.fillRect(p.x + z * 0.2, p.y + z * 0.2, z * 0.6, z * 0.6);
        } else if (c === 'F') {
          ctx.fillStyle = '#8cc8e2';
          ctx.fillRect(p.x + z * 0.15, p.y + z * 0.35, z * 0.7, z * 0.3);
        } else {
          ctx.strokeStyle = '#5f6773';
          ctx.strokeRect(p.x + 0.5, p.y + 0.5, z - 1, z - 1);
        }
      }
    ctx.restore();
  }

  /** Höhenlinien (je volle 1 m) und – nah herangezoomt – die Höhe je Kachel */
  #zeichneHoehen(ctx, k) {
    const z = this.zoom;
    if (z < 6) return;
    const f = this.#sichtFenster(k);
    const stufe = (x, y) => Math.floor(k.hoeheAn(x, y) + 1e-6);
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let y = f.y0; y <= f.y1; y++)
      for (let x = f.x0; x <= f.x1; x++) {
        const s = stufe(x, y);
        const p = this.zuBild(x, y);
        if (x + 1 < k.breite && stufe(x + 1, y) !== s) {
          ctx.moveTo(p.x + z, p.y);
          ctx.lineTo(p.x + z, p.y + z);
        }
        if (y + 1 < k.hoehe && stufe(x, y + 1) !== s) {
          ctx.moveTo(p.x, p.y + z);
          ctx.lineTo(p.x + z, p.y + z);
        }
      }
    ctx.stroke();
    if (z >= 26) {
      ctx.font = '600 10px system-ui';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (let y = f.y0; y <= f.y1; y++)
        for (let x = f.x0; x <= f.x1; x++) {
          const h = k.hoeheAn(x, y);
          if (!h) continue;
          const p = this.zuBild(x, y);
          ctx.fillText(String(Math.round(h * 10) / 10).replace('.', ','), p.x + z - 2, p.y + z - 1);
        }
    }
    ctx.restore();
  }

  #zeichneInnen(ctx, k) {
    const f = this.#sichtFenster(k);
    ctx.fillStyle = 'rgba(80,160,255,0.28)';
    for (let y = f.y0; y <= f.y1; y++)
      for (let x = f.x0; x <= f.x1; x++) {
        const innen = this.innen ? this.innen[y * k.breite + x] : KACHELN[k.zellen[y * k.breite + x]]?.innen;
        if (!innen) continue;
        const p = this.zuBild(x, y);
        ctx.fillRect(p.x, p.y, this.zoom, this.zoom);
      }
  }

  #zeichneSteil(ctx, k) {
    if (!k.hoehen.some((h) => h !== 0)) return;
    const f = this.#sichtFenster(k);
    ctx.strokeStyle = 'rgba(255,60,60,0.7)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let y = f.y0; y <= f.y1; y++)
      for (let x = f.x0; x <= f.x1; x++) {
        if (!istSteil(k, x, y)) continue;
        const p = this.zuBild(x, y);
        ctx.moveTo(p.x, p.y + this.zoom);
        ctx.lineTo(p.x + this.zoom, p.y);
      }
    ctx.stroke();
  }

  #zeichneBereiche(ctx, k) {
    ctx.save();
    for (const [id, r] of k.s('raumFlaechen')) {
      const rb = this.#rechteckBild(r.x, r.y, r.b, r.h);
      const a = eintragAnzeige(k, 'raumFlaechen', id);
      if (a.aus || !this.#sichtbar(rb)) continue;
      ctx.globalAlpha = this.dimm * (a.sperre ? 0.35 : 1);
      ctx.fillStyle = `${a.farbe ?? '#ffb84d'}${this.zustand.istGewaehlt('raumFlaechen', id) ? '73' : '2e'}`;
      ctx.fillRect(rb.x, rb.y, rb.b, rb.h);
    }
    ctx.globalAlpha = this.dimm;
    // Raumnamen: einmal je Raum (Mitte der Flächen)
    const raeume = new Map();
    for (const [id, r] of k.s('raumFlaechen')) {
      if (eintragAnzeige(k, 'raumFlaechen', id).aus) continue;
      const e = raeume.get(r.raum) ?? { x: 0, y: 0, n: 0 };
      e.x += (r.x + r.b / 2) * r.b * r.h;
      e.y += (r.y + r.h / 2) * r.b * r.h;
      e.n += r.b * r.h;
      raeume.set(r.raum, e);
    }
    if (this.zoom >= 6)
      for (const [raum, e] of raeume) {
        const p = this.zuBild(e.x / e.n, e.y / e.n);
        this.#text(ctx, `${raum}: ${k.s('raeume').get(raum)?.name ?? '?'}`, p.x, p.y, '#ffd9a0');
      }
    for (const [id, t] of k.s('tierBereiche')) {
      const a = eintragAnzeige(k, 'tierBereiche', id);
      if (a.aus) continue;
      ctx.globalAlpha = this.dimm * (a.sperre ? 0.35 : 1);
      const rb = this.#rechteckBild(t.x, t.y, t.b, t.h);
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = this.zustand.istGewaehlt('tierBereiche', id) ? '#fff' : (a.farbe ?? '#c8a27a');
      ctx.lineWidth = 2;
      ctx.strokeRect(rb.x, rb.y, rb.b, rb.h);
      ctx.setLineDash([]);
      if (this.zoom >= 5) this.#text(ctx, `🐇 ×${t.anzahl}`, rb.x + rb.b / 2, rb.y + 10, '#f3dcc0');
    }
    // Loot-Zonen (6.2): gold gestrichelt; gewählt = Vorschau der Punkte (gleiche Regel wie das Spiel)
    for (const [id, z] of k.s('lootZonen')) {
      const a = eintragAnzeige(k, 'lootZonen', id);
      if (a.aus || !this.zustand.sichtbar('loot')) continue;
      const gew = this.zustand.istGewaehlt('lootZonen', id);
      const farbe = a.farbe ?? '#ffd23f';
      ctx.globalAlpha = this.dimm * (a.sperre ? 0.35 : 1);
      const rb = this.#rechteckBild(z.x, z.y, z.b, z.h);
      ctx.fillStyle = `${farbe}${gew ? '30' : '14'}`;
      ctx.fillRect(rb.x, rb.y, rb.b, rb.h);
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = gew ? '#fff' : farbe;
      ctx.lineWidth = 2;
      ctx.strokeRect(rb.x, rb.y, rb.b, rb.h);
      ctx.setLineDash([]);
      if (gew) {
        const v = lootVorschau(k, id);
        ctx.fillStyle = farbe;
        for (const [x, y] of v.punkte) {
          const p = this.zuBild(x + 0.5, y + 0.5);
          ctx.beginPath();
          ctx.arc(p.x, p.y, Math.max(2.5, this.zoom * 0.18), 0, Math.PI * 2);
          ctx.fill();
        }
      }
      if (this.zoom >= 5) this.#text(ctx, `🎁 ${z.name ?? 'Loot'} · ${z.punkte ?? '?'} Punkte`, rb.x + rb.b / 2, rb.y + 10, '#ffe9a0');
    }
    ctx.restore();
  }

  /**
   * Klänge (Phase 4): Punkt = 🔊 + Kreis „voll bis“ (innen, gefüllt) + gestrichelte Hörweite (außen); gewählt mit Griffen
   * auf beiden Kreisen (ziehen = Radius, ui/werkzeuge.js). Ambiente = Rechteck mit Übergangszone. Global = Hinweis oben links.
   */
  #zeichneKlaenge(ctx, k) {
    const z = this.zoom;
    const globale = [];
    for (const [id, c] of k.s('klaenge')) {
      const a = eintragAnzeige(k, 'klaenge', id);
      if (a.aus) continue;
      const gew = this.zustand.istGewaehlt('klaenge', id);
      const farbe = gew ? '#ffffff' : (a.farbe ?? '#7fd6ff');
      if (c.art === 'global') {
        globale.push(c);
        continue;
      }
      ctx.save();
      ctx.globalAlpha = this.dimm * (a.sperre ? 0.35 : 1);
      if (c.art === 'punkt') {
        const p = this.zuBild(c.x, c.y);
        ctx.fillStyle = 'rgba(127,214,255,0.13)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, c.innen * z, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = farbe;
        ctx.lineWidth = gew ? 2 : 1.2;
        ctx.stroke();
        ctx.setLineDash([6, 5]);
        ctx.beginPath();
        ctx.arc(p.x, p.y, c.aussen * z, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        if (gew)
          for (const r of [c.innen, c.aussen]) {
            if (r <= 0) continue;
            ctx.fillStyle = '#fff';
            ctx.fillRect(p.x + r * z - 4, p.y - 4, 8, 8);
          }
        this.#text(ctx, '🔊', p.x, p.y, '#fff', Math.max(11, Math.min(20, z * 0.8)));
        if (z >= 8) this.#text(ctx, c.name, p.x, p.y + Math.max(14, z * 0.9), farbe, 11);
      } else {
        const rb = this.#rechteckBild(c.x, c.y, c.b, c.h);
        ctx.fillStyle = 'rgba(127,214,255,0.08)';
        ctx.fillRect(rb.x, rb.y, rb.b, rb.h);
        ctx.strokeStyle = farbe;
        ctx.lineWidth = gew ? 2 : 1.2;
        ctx.setLineDash([8, 4]);
        ctx.strokeRect(rb.x, rb.y, rb.b, rb.h);
        const r = Math.min(c.rand, c.b / 2, c.h / 2) * z;
        if (r > 2) {
          ctx.setLineDash([2, 4]);
          ctx.strokeRect(rb.x + r, rb.y + r, rb.b - 2 * r, rb.h - 2 * r);
        }
        ctx.setLineDash([]);
        if (z >= 5) this.#text(ctx, `🔊 ${c.name}`, rb.x + rb.b / 2, rb.y + 12, farbe, 11);
      }
      ctx.restore();
    }
    if (globale.length) {
      const t = `🌐 ${globale.map((c) => c.name).join(' · ')}`;
      ctx.font = '600 12px system-ui';
      this.#text(ctx, t, LINEAL + 10 + ctx.measureText(t).width / 2, LINEAL + 14, '#7fd6ff', 12);
    }
  }

  #zeichneObjekte(ctx, k) {
    const z = this.zoom;
    // Reihenfolge: Boden → Möbel → Licht → Kronen (wie im Spiel)
    const rang = (o) => (o.ebene === 'boden' ? 0 : o.ebene === 'oben' ? 3 : o.ebene === 'licht' ? 2 : 1);
    const liste = [...k.s('objekte')].sort((a, b) => rang(a[1]) - rang(b[1]));
    for (const [id, o] of liste) {
      const r = this.#rechteckBild(o.x, o.y, o.b, o.h);
      if (!this.#sichtbar(r)) continue;
      const info = objektInfo(o.typ, k);
      const farbe = o.farbe && o.typ !== 'licht' ? o.farbe : (k.s('texturen').get(o.typ)?.farbe ?? info.farbe);
      ctx.save();
      if (o.ebene === 'oben') {
        ctx.globalAlpha = 0.72 * this.dimm;
        ctx.fillStyle = farbe;
        ctx.beginPath();
        ctx.ellipse(r.x + r.b / 2, r.y + r.h / 2, r.b / 2, r.h / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = this.dimm;
        ctx.strokeStyle = 'rgba(10,25,8,0.8)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = '#5a3a1e';
        ctx.beginPath();
        ctx.arc(r.x + r.b / 2, r.y + r.h / 2, Math.max(1.5, z * 0.18), 0, Math.PI * 2);
        ctx.fill();
      } else if (o.typ === 'licht') {
        ctx.fillStyle = 'rgba(255,217,160,0.12)';
        ctx.beginPath();
        const mx = r.x + r.b / 2;
        const my = r.y + r.h / 2;
        if (o.art === 'kegel') {
          // Kegel-Lampe: Lichtkegel in Leuchtrichtung (0° = Osten, 90° = Süden)
          const w = ((o.richtung ?? 90) * Math.PI) / 180;
          const halb = (((o.oeffnung ?? 60) / 2) * Math.PI) / 180;
          ctx.moveTo(mx, my);
          ctx.arc(mx, my, (o.radius ?? 6) * 1.6 * z, w - halb, w + halb);
          ctx.closePath();
          ctx.fillStyle = 'rgba(255,240,200,0.18)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,240,200,0.5)';
          ctx.stroke();
        } else {
          ctx.arc(mx, my, (o.radius ?? 4) * z, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = o.farbe ?? '#ffd9a0';
        ctx.beginPath();
        ctx.arc(r.x + r.b / 2, r.y + r.h / 2, Math.max(2, z * 0.3), 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.globalAlpha = (o.ebene === 'boden' ? 0.7 : 1) * this.dimm;
        const sprite = !o.farbe && this.#sprite(o.typ);
        const gedreht = !!drehLage(o.drehung).rest;
        if (sprite && z >= 6) this.#zeichneSprite(ctx, sprite, r, o.drehung ?? 0);
        else {
          ctx.fillStyle = farbe;
          if (gedreht) (this.#polygon(ctx, ecken(o)), ctx.fill());
          else ctx.fillRect(r.x, r.y, r.b, r.h);
        }
        if (o.ebene !== 'boden') {
          ctx.strokeStyle = o.blockiert ? 'rgba(0,0,0,0.75)' : 'rgba(255,255,255,0.45)';
          ctx.lineWidth = 1;
          if (gedreht) (this.#polygon(ctx, ecken(o)), ctx.stroke());
          else ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.b - 1, r.h - 1);
        }
        if (info.bild && this.#bild(info.bild)) ctx.drawImage(this.#bild(info.bild), r.x, r.y, r.b, r.h);
        if (!sprite && z >= 14 && r.b >= 14 && r.h >= 14) {
          ctx.globalAlpha = this.dimm;
          ctx.font = `${Math.min(r.b, r.h, z) * 0.6}px system-ui`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(info.symbol, r.x + r.b / 2, r.y + r.h / 2);
        }
        // Drehung anzeigen (Pfeil)
        if ((o.drehung ?? 0) !== 0 && z >= 10) {
          ctx.globalAlpha = 0.9 * this.dimm;
          ctx.strokeStyle = '#fff';
          ctx.translate(r.x + r.b / 2, r.y + r.h / 2);
          ctx.rotate(((o.drehung ?? 0) * Math.PI) / 180);
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(0, -Math.min(r.b, r.h) * 0.4);
          ctx.stroke();
        }
      }
      ctx.restore();
      if (this.zustand.istGewaehlt('objekte', id)) {
        if (drehLage(o.drehung).rest) this.#markiere(ctx, null, ecken(o));
        else this.#markiere(ctx, r);
        if (this.zustand.frei && this.zustand.auswahl.size === 1 && this.zustand.werkzeug === 'auswahl') this.#zeichneDrehGriff(ctx, o);
      }
    }
  }

  /** Pfad durch Eckpunkte (Kacheln) */
  #polygon(ctx, punkte) {
    ctx.beginPath();
    punkte.forEach(([x, y], i) => {
      const q = this.zuBild(x, y);
      if (i) ctx.lineTo(q.x, q.y);
      else ctx.moveTo(q.x, q.y);
    });
    ctx.closePath();
  }

  /** Drehgriff (Free-Modus): Linie von der Mitte + runder Griff über der Oberkante */
  #zeichneDrehGriff(ctx, o) {
    const g = drehGriff(o);
    const m = this.zuBild(g.cx, g.cy);
    const p = this.zuBild(g.x, g.y);
    ctx.save();
    ctx.strokeStyle = '#4fc3ff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(m.x, m.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  #zeichneBauwerke(ctx, k) {
    const z = this.zoom;
    for (const [id, b] of k.s('bauwerke')) {
      const r = this.#rechteckBild(b.tx, b.ty, 1, 1);
      if (!this.#sichtbar(r)) continue;
      const ebene = BAUWERKE[b.typ]?.ebene ?? 'objekt';
      ctx.fillStyle = ebene === 'wand' ? '#8a6a46' : ebene === 'boden' ? 'rgba(160,110,60,0.6)' : ebene === 'dach' ? 'rgba(120,70,40,0.35)' : '#b48a5a';
      const rand = ebene === 'wand' && (b.typ === 'zaun' || b.typ === 'zauntor') ? z * 0.35 : 0;
      ctx.fillRect(r.x + rand, r.y + rand, r.b - rand * 2, r.h - rand * 2);
      if (z >= 14) this.#text(ctx, b.typ === 'zaun' ? '' : (b.typ[0] ?? '').toUpperCase(), r.x + r.b / 2, r.y + r.h / 2, '#fff');
      if (this.zustand.istGewaehlt('bauwerke', id)) this.#markiere(ctx, r);
    }
  }

  /** Loot-Dichte als Heatmap (6.4): gelb (wenig) → rot (viel), relativ zum Maximum der Zone; Ergebnis je Kartenversion zwischengespeichert */
  #zeichneLootDichte(ctx, k) {
    if (this.dichtePuffer?.version !== k.version || this.dichtePuffer?.karte !== k) this.dichtePuffer = { version: k.version, karte: k, ...lootDichte(k) };
    const { zellen, max } = this.dichtePuffer;
    if (!max) return;
    ctx.save();
    for (const [schl, w] of zellen) {
      const [x, y] = ausSchluessel(schl);
      const t = Math.min(1, w / max);
      const rb = this.#rechteckBild(x, y, 1, 1);
      if (!this.#sichtbar(rb)) continue;
      ctx.fillStyle = `hsla(${Math.round(55 - 55 * t)}, 95%, 50%, ${(0.15 + 0.5 * t).toFixed(2)})`;
      ctx.fillRect(rb.x, rb.y, rb.b + 0.5, rb.h + 0.5);
    }
    ctx.restore();
  }

  #zeichneMarker(ctx, k) {
    const z = this.zoom;
    const lootSichtbar = this.zustand.sichtbar('loot');
    for (const [schl, m] of k.s('marker')) {
      if (m.art === 'loot' && !lootSichtbar) continue; // Schalter 🎁 (Taste O)
      const [x, y] = ausSchluessel(schl);
      const p = this.zuBild(x + 0.5, y + 0.5);
      if (p.x < LINEAL - z || p.y < LINEAL - z) continue;
      const farbe = m.art === 'start' ? '#38d16a' : m.art === 'zombie' ? (m.horde ? '#8a2be2' : '#d13838') : '#ffd23f';
      ctx.fillStyle = farbe;
      ctx.strokeStyle = '#000';
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(3, z * 0.42), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (z >= 9) {
        const t = m.art === 'start' ? 'S' : m.art === 'zombie' ? (m.anzahl > 1 ? `Z${m.anzahl}` : 'Z') : m.raum;
        this.#text(ctx, t, p.x, p.y, m.art === 'loot' ? '#000' : '#fff', z * 0.5);
      }
      if (this.zustand.istGewaehlt('marker', schl)) this.#markiere(ctx, this.#rechteckBild(x, y, 1, 1));
    }
    for (const [name, a] of k.s('ankuenfte')) {
      const p = this.zuBild(a.x + 0.5, a.y + 0.5);
      ctx.fillStyle = '#2b8cff';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y + z * 0.45);
      ctx.arc(p.x, p.y - z * 0.1, Math.max(3, z * 0.32), Math.PI * 0.8, Math.PI * 2.2);
      ctx.closePath();
      ctx.fill();
      if (z >= 6) this.#text(ctx, `📍${name}`, p.x, p.y - z * 0.8, '#9cc9ff');
      if (this.zustand.istGewaehlt('ankuenfte', name)) this.#markiere(ctx, this.#rechteckBild(a.x, a.y, 1, 1));
    }
  }

  #zeichneUebergaenge(ctx, k) {
    for (const [id, u] of k.s('uebergaenge')) {
      const a = eintragAnzeige(k, 'uebergaenge', id);
      if (a.aus) continue;
      ctx.save();
      ctx.globalAlpha = this.dimm * (a.sperre ? 0.35 : 1);
      const r = this.#rechteckBild(u.x, u.y, u.b, u.h);
      ctx.fillStyle = `${a.farbe ?? '#2b8cff'}4d`;
      ctx.fillRect(r.x, r.y, r.b, r.h);
      ctx.strokeStyle = this.zustand.istGewaehlt('uebergaenge', id) ? '#fff' : (a.farbe ?? '#2b8cff');
      ctx.lineWidth = 2;
      ctx.strokeRect(r.x + 1, r.y + 1, r.b - 2, r.h - 2);
      this.#text(ctx, `→ ${u.ziel || '?'} (${u.ankunft || '?'})`, r.x + r.b / 2, r.y + r.h / 2, '#cfe4ff');
      ctx.restore();
    }
  }

  #zeichneUeberlagerungen(ctx) {
    for (const u of this.ueberlagerungen) {
      const r = this.#rechteckBild(u.rechteck.x, u.rechteck.y, u.rechteck.b, u.rechteck.h);
      if (!this.#sichtbar(r)) continue;
      ctx.save();
      ctx.fillStyle = `${u.farbe}55`;
      ctx.fillRect(r.x, r.y, r.b, r.h);
      if (u.gestrichelt) ctx.setLineDash([5, 3]);
      ctx.strokeStyle = u.farbe;
      ctx.lineWidth = 2;
      ctx.strokeRect(r.x + 1, r.y + 1, Math.max(2, r.b - 2), Math.max(2, r.h - 2));
      ctx.restore();
      if (u.text && this.zoom >= 10) this.#text(ctx, u.text, r.x + r.b / 2, r.y - 8, u.farbe, 11);
    }
  }

  #zeichneAuswahlRechteck(ctx) {
    const a = this.zustand.auswahlRechteck;
    if (!a) return;
    this.#rahmen(ctx, a, '#4fc3ff', `x ${a.x}–${a.x + a.b - 1}, y ${a.y}–${a.y + a.h - 1}`, false, true);
  }

  #zeichneVorschau(ctx) {
    const v = this.vorschau;
    if (!v) return;
    const farbe = v.gueltig === false ? 'rgba(229,72,77,' : 'rgba(76,175,80,';
    ctx.save();
    for (const r of v.rechtecke ?? []) {
      const rb = this.#rechteckBild(r.x, r.y, r.b, r.h);
      ctx.fillStyle = `${farbe}0.35)`;
      ctx.strokeStyle = `${farbe}0.95)`;
      ctx.lineWidth = 2;
      if (drehLage(r.drehung).rest) {
        this.#polygon(ctx, ecken(r));
        ctx.fill();
        ctx.stroke();
        continue;
      }
      ctx.fillRect(rb.x, rb.y, rb.b, rb.h);
      ctx.strokeRect(rb.x + 1, rb.y + 1, rb.b - 2, rb.h - 2);
    }
    if (v.kacheln?.length) {
      ctx.fillStyle = v.farbe ? v.farbe : `${farbe}0.45)`;
      ctx.globalAlpha = v.farbe ? 0.75 : 1;
      for (const { x, y } of v.kacheln) {
        const p = this.zuBild(x, y);
        ctx.fillRect(p.x, p.y, this.zoom, this.zoom);
      }
      ctx.globalAlpha = 1;
    }
    // Wand-Vorschau: ungültige Kacheln rot
    if (v.rot?.length) {
      ctx.fillStyle = 'rgba(229,72,77,0.55)';
      for (const { x, y } of v.rot) {
        const p = this.zuBild(x, y);
        ctx.fillRect(p.x, p.y, this.zoom, this.zoom);
      }
    }
    if (v.kreis) {
      const p = this.zuBild(v.kreis.x, v.kreis.y);
      ctx.strokeStyle = '#fff';
      ctx.beginPath();
      ctx.arc(p.x, p.y, v.kreis.r * this.zoom, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (v.text) {
      const p = this.zuBild(v.textX ?? 0, v.textY ?? 0);
      this.#text(ctx, v.text, p.x, p.y - 14, v.gueltig === false ? '#ff9a9a' : '#c8ffc8');
    }
    ctx.restore();
  }

  #zeichneZonenRand(ctx, k) {
    const r = this.#rechteckBild(0, 0, k.breite, k.hoehe);
    ctx.strokeStyle = '#ffffffcc';
    ctx.lineWidth = 2;
    ctx.strokeRect(r.x - 1, r.y - 1, r.b + 2, r.h + 2);
    if (this.zonenVorschau) {
      const v = this.zonenVorschau;
      this.#rahmen(ctx, v, v.konflikte?.length ? '#e5484d' : v.verkleinert ? '#f5b83d' : '#4caf50', `${v.b} × ${v.h}${v.konflikte?.length ? ` – überlappt ${v.konflikte.join(', ')}` : ''}`, false, true);
    }
    // 6.4: Zone verschieben – Umriss an der neuen Stelle (rot = überlappt)
    if (this.zonenLage) {
      const l = this.zonenLage;
      const rot = l.konflikte?.length;
      this.#rahmen(ctx, { x: l.dx, y: l.dy, b: k.breite, h: k.hoehe }, rot ? '#e5484d' : '#4fc3ff', `✥ ${l.dx >= 0 ? '+' : ''}${l.dx} | ${l.dy >= 0 ? '+' : ''}${l.dy}${rot ? ` – überlappt ${l.konflikte.join(', ')}` : ''}`, true, true);
    }
    if (this.zonenGriffe) for (const g of this.griffe(k)) {
      const p = this.zuBild(g.x, g.y);
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#000';
      ctx.fillRect(p.x - 6, p.y - 6, 12, 12);
      ctx.strokeRect(p.x - 6, p.y - 6, 12, 12);
    }
  }

  /** Griffe zum Größe-Ändern (Ecken + Kantenmitten) in Kachelkoordinaten */
  griffe(k = this.zustand.karte) {
    const v = this.zonenVorschau ?? { x: 0, y: 0, b: k.breite, h: k.hoehe };
    const x0 = v.x;
    const y0 = v.y;
    const x1 = v.x + v.b;
    const y1 = v.y + v.h;
    const xm = (x0 + x1) / 2;
    const ym = (y0 + y1) / 2;
    return [
      { id: 'lo', x: x0, y: y0 }, { id: 'o', x: xm, y: y0 }, { id: 'ro', x: x1, y: y0 },
      { id: 'l', x: x0, y: ym }, { id: 'r', x: x1, y: ym },
      { id: 'lu', x: x0, y: y1 }, { id: 'u', x: xm, y: y1 }, { id: 'ru', x: x1, y: y1 },
    ];
  }

  /** 6.4: alle anderen Zonen der Weltanordnung als Umriss + Name (relativ zur aktiven Zone) */
  #zeichneWeltZonen(ctx) {
    for (const z of this.weltZonen) {
      const r = this.#rechteckBild(z.x, z.y, z.b, z.h);
      if (!this.#sichtbar(r)) continue;
      ctx.save();
      ctx.fillStyle = 'rgba(120,140,170,0.10)';
      ctx.fillRect(r.x, r.y, r.b, r.h);
      ctx.setLineDash([8, 5]);
      ctx.strokeStyle = 'rgba(190,205,230,0.75)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(r.x, r.y, r.b, r.h);
      ctx.restore();
      this.#text(ctx, `${z.name} (${z.b} × ${z.h})`, r.x + r.b / 2, r.y + Math.min(r.h / 2, 18), '#c9d6ea', 12);
    }
  }

  /** 7.2: Bereich für die KI (zustand.kiBereich, darf über die Zone hinausragen) + Runde 19: geschützte Flächen (rot schraffiert) */
  #zeichneKiBereich(ctx) {
    for (const sch of [...this.zustand.kiSchutz, ...(this.schutzVorschau ? [this.schutzVorschau] : [])]) {
      const rb = this.#rechteckBild(sch.x, sch.y, sch.b, sch.h);
      ctx.save();
      ctx.beginPath();
      ctx.rect(rb.x, rb.y, rb.b, rb.h);
      ctx.clip();
      ctx.strokeStyle = 'rgba(255,80,80,0.45)';
      ctx.lineWidth = 2;
      for (let d = -rb.h; d < rb.b; d += 12) {
        ctx.beginPath();
        ctx.moveTo(rb.x + d, rb.y + rb.h);
        ctx.lineTo(rb.x + d + rb.h, rb.y);
        ctx.stroke();
      }
      ctx.restore();
      this.#rahmen(ctx, sch, '#ff5050', null);
      this.#text(ctx, '🛡 geschützt', rb.x + rb.b / 2, rb.y + rb.h / 2, '#ff8080', 12);
    }
    const r = this.zustand.kiBereich;
    if (!r) return;
    const k = this.zustand.karte;
    const aussen = k && (r.x < 0 || r.y < 0 || r.x + r.b > k.breite || r.y + r.h > k.hoehe);
    this.#rahmen(ctx, r, '#b388ff', `🤖 KI-Bereich ${r.b} × ${r.h}${aussen ? ' (ragt aus der Zone)' : ''}`, true, true);
  }

  #zeichneNachbarn(ctx) {
    if (!this.zustand.sichtbar('nachbarn')) return;
    for (const n of this.nachbarn) {
      const k = n.karte;
      const bild = kachelBild(k);
      const o = this.zuBild(n.dx, n.dy);
      ctx.save();
      ctx.globalAlpha = 0.4;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(bild, o.x, o.y, k.breite * this.zoom, k.hoehe * this.zoom);
      ctx.globalAlpha = 1;
      for (const [, u] of k.s('uebergaenge')) {
        const r = this.#rechteckBild(n.dx + u.x, n.dy + u.y, u.b, u.h);
        ctx.strokeStyle = '#2b8cff';
        ctx.strokeRect(r.x, r.y, r.b, r.h);
      }
      const m = this.zuBild(n.dx + k.breite / 2, n.dy + k.hoehe / 2);
      this.#text(ctx, `Zone: ${k.name} (${k.id}) – Klick = bearbeiten`, m.x, m.y, '#ddd', 16);
      ctx.restore();
    }
  }

  #rahmen(ctx, r, farbe, text, fuellen = false, gestrichelt = false) {
    const rb = this.#rechteckBild(r.x, r.y, r.b, r.h);
    ctx.save();
    if (fuellen) {
      ctx.fillStyle = `${farbe}33`;
      ctx.fillRect(rb.x, rb.y, rb.b, rb.h);
    }
    if (gestrichelt) ctx.setLineDash([6, 4]);
    ctx.strokeStyle = farbe;
    ctx.lineWidth = 2;
    ctx.strokeRect(rb.x, rb.y, rb.b, rb.h);
    ctx.restore();
    if (text) this.#text(ctx, text, rb.x + rb.b / 2, rb.y - 10, farbe);
  }

  /** Auswahl-Rahmen; punkte = Ecken einer gedrehten Grundfläche (Kacheln) statt Rechteck */
  #markiere(ctx, r, punkte = null) {
    ctx.save();
    ctx.strokeStyle = '#4fc3ff';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    if (punkte) (this.#polygon(ctx, punkte), ctx.stroke());
    else ctx.strokeRect(r.x - 2, r.y - 2, r.b + 4, r.h + 4);
    ctx.restore();
  }

  #text(ctx, text, x, y, farbe = '#fff', groesse = 12) {
    if (!text) return;
    ctx.save();
    ctx.font = `600 ${Math.max(9, Math.min(18, groesse))}px system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = farbe;
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  /** 7.3: Hilfslinien (cyan, gestrichelt), Fang-Linien (magenta), Maßband (gelb, mit Längen) */
  #zeichneMessen(ctx, k) {
    const { b, h } = this.groesse;
    const senkrecht = (x, farbe, strich) => {
      const p = this.zuBild(x, 0);
      ctx.strokeStyle = farbe;
      ctx.setLineDash(strich);
      ctx.beginPath();
      ctx.moveTo(Math.round(p.x) + 0.5, LINEAL);
      ctx.lineTo(Math.round(p.x) + 0.5, h);
      ctx.stroke();
    };
    const waagerecht = (y, farbe, strich) => {
      const p = this.zuBild(0, y);
      ctx.strokeStyle = farbe;
      ctx.setLineDash(strich);
      ctx.beginPath();
      ctx.moveTo(LINEAL, Math.round(p.y) + 0.5);
      ctx.lineTo(b, Math.round(p.y) + 0.5);
      ctx.stroke();
    };
    const linie = (a, w, farbe, strich) => (a === 'x' ? senkrecht : waagerecht)(w, farbe, strich);
    ctx.save();
    ctx.lineWidth = 1;
    if (this.zustand.sichtbar('hilfslinien')) {
      const hl = k.werte.hilfslinien ?? {};
      for (const a of ['x', 'y']) for (const w of hl[a] ?? []) linie(a, w, 'rgba(0,229,255,0.8)', [6, 4]);
    }
    if (this.hilfslinieZiehen) linie(this.hilfslinieZiehen.achse, this.hilfslinieZiehen.wert, '#00e5ff', []);
    for (const l of this.fangLinien ?? []) linie(l.achse, l.wert, '#ff4fd8', []);
    ctx.setLineDash([]);
    const m = this.massband;
    if (m?.punkte.length) {
      const pkt = m.punkte.map((q) => this.zuBild(q.x, q.y));
      if (!m.fertig && this.hover && this.zustand.werkzeug === 'messen') pkt.push(this.zuBild(this.hover.x + 0.5, this.hover.y + 0.5));
      ctx.strokeStyle = '#ffd54f';
      ctx.lineWidth = 2;
      ctx.beginPath();
      pkt.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
      ctx.stroke();
      ctx.fillStyle = '#ffd54f';
      for (const q of pkt.slice(0, m.punkte.length)) ctx.fillRect(q.x - 3, q.y - 3, 6, 6);
      const info = streckenInfo(m.punkte);
      info.segmente.forEach((sg, i) => this.#text(ctx, `${sg.laenge} m · ${sg.winkel}°`, (pkt[i].x + pkt[i + 1].x) / 2, (pkt[i].y + pkt[i + 1].y) / 2 - 8, '#ffd54f', 11));
      if (info.segmente.length > 1) this.#text(ctx, `Σ ${info.gesamt} m`, pkt[m.punkte.length - 1].x, pkt[m.punkte.length - 1].y + 16, '#ffd54f', 12);
    }
    ctx.restore();
  }

  /** Lineale oben/links mit Kachelnummern + Markierung der Kachel unter der Maus */
  #zeichneLineale(ctx) {
    const { b, h } = this.groesse;
    const z = this.zoom;
    const schritt = [1, 2, 5, 10, 20, 50, 100].find((s) => s * z >= 28) ?? 100;
    ctx.save();
    ctx.fillStyle = '#1d2128';
    ctx.fillRect(0, 0, b, LINEAL);
    ctx.fillRect(0, 0, LINEAL, h);
    ctx.fillStyle = '#9aa3b2';
    ctx.strokeStyle = '#4a5160';
    ctx.font = '10px system-ui';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    const a = this.zuWelt(LINEAL, LINEAL);
    const e = this.zuWelt(b, h);
    ctx.beginPath();
    for (let x = Math.floor(a.x / schritt) * schritt; x <= e.x; x += schritt) {
      const p = this.zuBild(x + 0.5, 0);
      if (p.x < LINEAL) continue;
      ctx.moveTo(this.zuBild(x, 0).x, LINEAL - 6);
      ctx.lineTo(this.zuBild(x, 0).x, LINEAL);
      ctx.fillText(String(x), p.x, LINEAL / 2 - 2);
    }
    for (let y = Math.floor(a.y / schritt) * schritt; y <= e.y; y += schritt) {
      const p = this.zuBild(0, y + 0.5);
      if (p.y < LINEAL) continue;
      ctx.moveTo(LINEAL - 6, this.zuBild(0, y).y);
      ctx.lineTo(LINEAL, this.zuBild(0, y).y);
      ctx.save();
      ctx.translate(LINEAL / 2 - 2, p.y);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(String(y), 0, 0);
      ctx.restore();
    }
    ctx.stroke();
    // Hover-Kachel im Lineal
    if (this.hover) {
      ctx.fillStyle = 'rgba(79,195,255,0.45)';
      const p = this.zuBild(this.hover.x, this.hover.y);
      ctx.fillRect(Math.max(LINEAL, p.x), 0, z, LINEAL);
      ctx.fillRect(0, Math.max(LINEAL, p.y), LINEAL, z);
    }
    ctx.fillStyle = '#262b34';
    ctx.fillRect(0, 0, LINEAL, LINEAL);
    ctx.restore();
  }

  // --- Möbel-Sprites aus dem Spiel-Atlas -------------------------------------
  #sprite(typ) {
    return this.atlas?.bild ? (this.atlas.daten.umgebung.objekte[typ] ?? null) : null;
  }

  #zeichneSprite(ctx, s, r, drehung) {
    const quer = drehLage(drehung).quer; // eigene Maße vor dem Drehen (Viertel stecken in b/h)
    const bb = quer ? r.h : r.b;
    const hh = quer ? r.b : r.h;
    ctx.translate(r.x + r.b / 2, r.y + r.h / 2);
    ctx.rotate((drehung * Math.PI) / 180);
    ctx.drawImage(this.atlas.bild, s.x, s.y, s.b, s.h, -bb / 2, -hh / 2, bb, hh);
    ctx.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0);
  }

  #bilder = new Map();
  #bild(dataUrl) {
    if (!this.#bilder.has(dataUrl)) {
      const img = new Image();
      img.onload = () => this.anfordern();
      img.src = dataUrl;
      this.#bilder.set(dataUrl, img);
    }
    const img = this.#bilder.get(dataUrl);
    return img.complete && img.naturalWidth ? img : null;
  }

  async ladeAtlas() {
    try {
      const basis = new URL('../../client/assets/', import.meta.url);
      const daten = await (await fetch(new URL('atlas.json', basis))).json();
      const bild = new Image();
      bild.src = new URL(daten.umgebung.bild, basis).href;
      await bild.decode();
      this.atlas = { daten, bild };
      this.anfordern();
    } catch {
      // ohne Atlas: Farbflächen
    }
  }
}

/**
 * Kachelbild (1 px je Kachel) einer Karte – gepuffert je Kartenversion (Nachbarzonen, Weltkarte). Große Zonen (6.4) werden
 * auf höchstens KACHELBILD_MAX px Kantenlänge heruntergerechnet (jede n-te Kachel) – das Bild wird ohnehin skaliert gezeichnet.
 */
const bildPuffer = new WeakMap();
export function kachelBild(k) {
  const alt = bildPuffer.get(k);
  if (alt && alt.version === k.version && alt.breite === k.breite && alt.hoehe === k.hoehe) return alt.bild;
  const schritt = Math.max(1, Math.ceil(Math.max(k.breite, k.hoehe) / KACHELBILD_MAX));
  const b = Math.ceil(k.breite / schritt);
  const h = Math.ceil(k.hoehe / schritt);
  const bild = new OffscreenCanvas(b, h);
  const c = bild.getContext('2d');
  const daten = c.createImageData(b, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < b; x++) {
      const [r, g, bl] = kachelRgb(k.zellen[Math.min(k.hoehe - 1, y * schritt) * k.breite + Math.min(k.breite - 1, x * schritt)]);
      const p = (y * b + x) * 4;
      daten.data[p] = r;
      daten.data[p + 1] = g;
      daten.data[p + 2] = bl;
      daten.data[p + 3] = 255;
    }
  c.putImageData(daten, 0, 0);
  bildPuffer.set(k, { version: k.version, breite: k.breite, hoehe: k.hoehe, bild });
  return bild;
}

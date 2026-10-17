import { KACHELN } from '../../gemeinsam/welt/kacheln.js';
import { ausSchluessel } from '../kern/karte.js';
import { kachelInfo, objektInfo } from '../kern/katalog.js';
import { istSteil } from '../kern/terrain.js';
import { BAUWERKE } from '../../gemeinsam/welt/bauwerke.js';

/**
 * 2D-Draufsicht (Canvas). Kamera in Kachelkoordinaten (Mitte des Bilds) + Zoom (Pixel pro Kachel).
 * Oben und links laufen Lineale mit Kachelnummern (LINEAL px breit) – Koordinaten überall.
 * Kacheln liegen in einem 1-Pixel-pro-Kachel-Bild (wird nur an geänderten Stellen nachgemalt) und werden ohne Glättung
 * hochskaliert → scharf und schnell, auch bei 160 × 120.
 */
export const LINEAL = 24;
const MIN_ZOOM = 2;
const MAX_ZOOM = 96;

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
    this.zonenGriffe = false;
    this.zonenVorschau = null; // { x, y, b, h } beim Größe ändern
    this.nachbarn = []; // [{ karte, dx, dy }] Nachbarzonen relativ (Phase 7)
    this.innen = null; // Uint8Array, gesetzt von außen (Spiel-Berechnung)
    this.#angefragt = false;
    zustand.bei('karte', (ops) => this.#aufOps(ops));
    zustand.bei('zone', () => {
      this.cache = null;
      this.anfordern();
    });
    zustand.bei('auswahl', () => this.anfordern());
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

  springeZu(x, y, zoom = Math.max(this.zoom, 20)) {
    this.zoom = zoom;
    this.kamera = { x: x + 0.5, y: y + 0.5 };
    this.anfordern();
  }

  // --- Kachel-Cache ----------------------------------------------------------
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
        if (op.s === 'hoehe') this.cache.terrainAlt = true;
      }
    this.anfordern();
  }

  #baueCache() {
    const k = this.zustand.karte;
    const bild = new OffscreenCanvas(k.breite, k.hoehe);
    this.cache = { karte: k, breite: k.breite, hoehe: k.hoehe, bild, ctx: bild.getContext('2d'), terrain: null, terrainAlt: true };
    for (let i = 0; i < k.zellen.length; i++) this.#maleKachel(i);
  }

  #maleKachel(i) {
    const k = this.cache.karte;
    this.cache.ctx.fillStyle = kachelInfo(k.zellen[i]).farbe;
    this.cache.ctx.fillRect(i % k.breite, Math.floor(i / k.breite), 1, 1);
  }

  #baueTerrain() {
    const k = this.cache.karte;
    this.cache.terrainAlt = false;
    if (!k.hoehen.some((h) => h !== 0)) {
      this.cache.terrain = null;
      return;
    }
    const bild = new OffscreenCanvas(k.breite, k.hoehe);
    const ctx = bild.getContext('2d');
    const daten = ctx.createImageData(k.breite, k.hoehe);
    for (let y = 0; y < k.hoehe; y++)
      for (let x = 0; x < k.breite; x++) {
        const h = k.hoeheAn(x, y);
        // Schummerung: Licht von links oben
        const neigung = (k.hoeheAn(x - 1, y) - k.hoeheAn(x + 1, y) + k.hoeheAn(x, y - 1) - k.hoeheAn(x, y + 1)) * 0.5;
        const p = (y * k.breite + x) * 4;
        const hell = Math.max(0, Math.min(255, 128 + neigung * 50 + h * 6));
        daten.data[p] = daten.data[p + 1] = daten.data[p + 2] = hell;
        daten.data[p + 3] = h === 0 && neigung === 0 ? 0 : 90;
      }
    ctx.putImageData(daten, 0, 0);
    this.cache.terrain = bild;
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
      if (this.cache.terrainAlt) this.#baueTerrain();
      this.#zeichneNachbarn(ctx);
      const o = this.zuBild(0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(this.cache.bild, o.x, o.y, k.breite * this.zoom, k.hoehe * this.zoom);
      if (this.cache.terrain) {
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(this.cache.terrain, o.x, o.y, k.breite * this.zoom, k.hoehe * this.zoom);
      }
      this.#zeichneKachelDetails(ctx, k);
      if (this.zustand.overlays.innen) this.#zeichneInnen(ctx, k);
      if (this.zustand.overlays.steil) this.#zeichneSteil(ctx, k);
      if (this.zustand.overlays.bereiche) this.#zeichneBereiche(ctx, k);
      this.#zeichneObjekte(ctx, k);
      this.#zeichneBauwerke(ctx, k);
      this.#zeichneMarker(ctx, k);
      this.#zeichneUebergaenge(ctx, k);
      this.#zeichneAuswahlRechteck(ctx);
      this.#zeichneVorschau(ctx);
      this.#zeichneZonenRand(ctx, k);
    }
    if (this.neuRechteck) this.#rahmen(ctx, this.neuRechteck, '#4caf50', `${this.neuRechteck.b} × ${this.neuRechteck.h}`, true);
    this.#zeichneLineale(ctx);
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
    if (this.zustand.overlays.raster && z >= 8) {
      ctx.strokeStyle = 'rgba(0,0,0,0.18)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = f.x0; x <= f.x1 + 1; x++) {
        const p = this.zuBild(x, f.y0);
        ctx.moveTo(Math.round(p.x) + 0.5, p.y);
        ctx.lineTo(Math.round(p.x) + 0.5, this.zuBild(x, f.y1 + 1).y);
      }
      for (let y = f.y0; y <= f.y1 + 1; y++) {
        const p = this.zuBild(f.x0, y);
        ctx.moveTo(p.x, Math.round(p.y) + 0.5);
        ctx.lineTo(this.zuBild(f.x1 + 1, y).x, Math.round(p.y) + 0.5);
      }
      ctx.stroke();
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
      if (!this.#sichtbar(rb)) continue;
      ctx.fillStyle = this.zustand.istGewaehlt('raumFlaechen', id) ? 'rgba(255,184,77,0.45)' : 'rgba(255,184,77,0.18)';
      ctx.fillRect(rb.x, rb.y, rb.b, rb.h);
    }
    // Raumnamen: einmal je Raum (Mitte der Flächen)
    const raeume = new Map();
    for (const [, r] of k.s('raumFlaechen')) {
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
      const rb = this.#rechteckBild(t.x, t.y, t.b, t.h);
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = this.zustand.istGewaehlt('tierBereiche', id) ? '#fff' : '#c8a27a';
      ctx.lineWidth = 2;
      ctx.strokeRect(rb.x, rb.y, rb.b, rb.h);
      ctx.setLineDash([]);
      if (this.zoom >= 5) this.#text(ctx, `🐇 ×${t.anzahl}`, rb.x + rb.b / 2, rb.y + 10, '#f3dcc0');
    }
    ctx.restore();
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
        ctx.globalAlpha = 0.72;
        ctx.fillStyle = farbe;
        ctx.beginPath();
        ctx.ellipse(r.x + r.b / 2, r.y + r.h / 2, r.b / 2, r.h / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
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
        ctx.arc(r.x + r.b / 2, r.y + r.h / 2, (o.radius ?? 4) * z, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = o.farbe ?? '#ffd9a0';
        ctx.beginPath();
        ctx.arc(r.x + r.b / 2, r.y + r.h / 2, Math.max(2, z * 0.3), 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.globalAlpha = o.ebene === 'boden' ? 0.7 : 1;
        const sprite = !o.farbe && this.#sprite(o.typ);
        if (sprite && z >= 6) this.#zeichneSprite(ctx, sprite, r, o.drehung ?? 0);
        else {
          ctx.fillStyle = farbe;
          ctx.fillRect(r.x, r.y, r.b, r.h);
        }
        if (o.ebene !== 'boden') {
          ctx.strokeStyle = o.blockiert ? 'rgba(0,0,0,0.75)' : 'rgba(255,255,255,0.45)';
          ctx.lineWidth = 1;
          ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.b - 1, r.h - 1);
        }
        if (info.bild && this.#bild(info.bild)) ctx.drawImage(this.#bild(info.bild), r.x, r.y, r.b, r.h);
        if (!sprite && z >= 14 && r.b >= 14 && r.h >= 14) {
          ctx.globalAlpha = 1;
          ctx.font = `${Math.min(r.b, r.h, z) * 0.6}px system-ui`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(info.symbol, r.x + r.b / 2, r.y + r.h / 2);
        }
        // Drehung anzeigen (Pfeil)
        if ((o.drehung ?? 0) !== 0 && z >= 10) {
          ctx.globalAlpha = 0.9;
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
      if (this.zustand.istGewaehlt('objekte', id)) this.#markiere(ctx, r);
    }
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

  #zeichneMarker(ctx, k) {
    const z = this.zoom;
    for (const [schl, m] of k.s('marker')) {
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
      const r = this.#rechteckBild(u.x, u.y, u.b, u.h);
      ctx.fillStyle = 'rgba(43,140,255,0.3)';
      ctx.fillRect(r.x, r.y, r.b, r.h);
      ctx.strokeStyle = this.zustand.istGewaehlt('uebergaenge', id) ? '#fff' : '#2b8cff';
      ctx.lineWidth = 2;
      ctx.strokeRect(r.x + 1, r.y + 1, r.b - 2, r.h - 2);
      this.#text(ctx, `→ ${u.ziel || '?'} (${u.ankunft || '?'})`, r.x + r.b / 2, r.y + r.h / 2, '#cfe4ff');
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
      ctx.fillRect(rb.x, rb.y, rb.b, rb.h);
      ctx.strokeStyle = `${farbe}0.95)`;
      ctx.lineWidth = 2;
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
      this.#rahmen(ctx, v, v.verkleinert ? '#f5b83d' : '#4caf50', `${v.b} × ${v.h}`, false, true);
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

  #zeichneNachbarn(ctx) {
    if (!this.zustand.overlays.nachbarn) return;
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
      this.#text(ctx, `Nachbarzone: ${k.name} (${k.id})`, m.x, m.y, '#ddd', 16);
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

  #markiere(ctx, r) {
    ctx.save();
    ctx.strokeStyle = '#4fc3ff';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(r.x - 2, r.y - 2, r.b + 4, r.h + 4);
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
    const quer = drehung % 180 !== 0;
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

/** Kachelbild (1 px je Kachel) einer Karte – gepuffert je Kartenversion (Nachbarzonen, Weltkarte) */
const bildPuffer = new WeakMap();
export function kachelBild(k) {
  const alt = bildPuffer.get(k);
  if (alt && alt.version === k.version && alt.bild.width === k.breite && alt.bild.height === k.hoehe) return alt.bild;
  const bild = new OffscreenCanvas(k.breite, k.hoehe);
  const c = bild.getContext('2d');
  for (let i = 0; i < k.zellen.length; i++) {
    c.fillStyle = kachelInfo(k.zellen[i]).farbe;
    c.fillRect(i % k.breite, Math.floor(i / k.breite), 1, 1);
  }
  bildPuffer.set(k, { version: k.version, bild });
  return bild;
}

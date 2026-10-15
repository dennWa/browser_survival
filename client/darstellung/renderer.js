import { Kamera } from './kamera.js';
import { FARBEN } from './farben.js';
import { rendereWeltBild } from './weltZeichner.js';
import { ZEICHNER, zeichneGegenstand } from './entitaetZeichner.js';
import { KAMERA_ZOOM } from '../konfiguration.js';

/** Zeichenreihenfolge (Ebenen): Gegenstände liegen unten, Spieler oben. */
const EBENEN = { zombie: 1, spieler: 2 };
const CULLING_RAND = 64;

/**
 * Zeichnet eine komplette Szene ins Canvas. Kennt KEINE Spiellogik – bekommt fertige Daten.
 * Kümmert sich um Fenstergröße und hochauflösende Displays (devicePixelRatio).
 */
export class Renderer {
  constructor(leinwand) {
    this.leinwand = leinwand;
    this.ctx = leinwand.getContext('2d');
    this.kamera = new Kamera(KAMERA_ZOOM);
    this.weltBild = null;
    this.pixelVerhaeltnis = 1;
    this.#groesseAnpassen();
    window.addEventListener('resize', () => this.#groesseAnpassen());
  }

  setzeWelt(welt) {
    this.weltBild = rendereWeltBild(welt);
  }

  #groesseAnpassen() {
    this.pixelVerhaeltnis = window.devicePixelRatio || 1;
    const breite = window.innerWidth;
    const hoehe = window.innerHeight;
    this.leinwand.width = Math.round(breite * this.pixelVerhaeltnis);
    this.leinwand.height = Math.round(hoehe * this.pixelVerhaeltnis);
    this.kamera.setzeBildschirm(breite, hoehe);
  }

  /** Leerer Hintergrund (z. B. hinter dem Login). */
  leeren() {
    const { ctx } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = FARBEN.hintergrund;
    ctx.fillRect(0, 0, this.leinwand.width, this.leinwand.height);
  }

  /** @param szene { fokus: {x,y}, entitaeten: [], gegenstaende: [] } */
  zeichne({ fokus, entitaeten, gegenstaende }) {
    const { ctx, kamera } = this;
    this.leeren();

    kamera.folge(fokus.x, fokus.y);
    kamera.anwenden(ctx, this.pixelVerhaeltnis);
    ctx.imageSmoothingEnabled = false;

    const sicht = kamera.sichtbereich();
    if (this.weltBild) {
      const qx = Math.max(0, Math.floor(sicht.links));
      const qy = Math.max(0, Math.floor(sicht.oben));
      const qb = Math.min(this.weltBild.width, Math.ceil(sicht.rechts)) - qx;
      const qh = Math.min(this.weltBild.height, Math.ceil(sicht.unten)) - qy;
      if (qb > 0 && qh > 0) ctx.drawImage(this.weltBild, qx, qy, qb, qh, qx, qy, qb, qh);
    }

    const sichtbar = (e) =>
      e.x > sicht.links - CULLING_RAND && e.x < sicht.rechts + CULLING_RAND && e.y > sicht.oben - CULLING_RAND && e.y < sicht.unten + CULLING_RAND;

    for (const g of gegenstaende) if (sichtbar(g)) zeichneGegenstand(ctx, g);

    const sortiert = entitaeten.filter(sichtbar).sort((a, b) => (EBENEN[a.typ] ?? 0) - (EBENEN[b.typ] ?? 0));
    for (const e of sortiert) ZEICHNER[e.typ]?.(ctx, e);
  }
}

import { Kamera } from './kamera.js';
import { FARBEN } from './farben.js';
import { WeltZeichner } from './weltZeichner.js';
import { Animationen } from './animationen.js';
import { ZEICHNER, zeichneBeschriftung, zeichneGegenstand } from './entitaetZeichner.js';
import { KAMERA_SICHTFELD, ZOOM_MIN, ZOOM_MAX } from '../konfiguration.js';

/** Zeichenreihenfolge (Ebenen): Zombies unter Spielern. */
const EBENEN = { zombie: 1, spieler: 2 };
const CULLING_RAND = 80;

/**
 * Zeichnet eine komplette Szene ins Canvas. Kennt KEINE Spiellogik – bekommt fertige Daten.
 *
 * Ebenen pro Frame:
 *   Welt (Böden, Möbel, Wände – vorgerendert) → Gegenstände → Figuren → Baumkronen
 *   → Namen/Lebensbalken → Vignette (Bildschirmrand abdunkeln)
 */
export class Renderer {
  constructor(leinwand) {
    this.leinwand = leinwand;
    this.ctx = leinwand.getContext('2d');
    this.kamera = new Kamera(1);
    this.assets = null;
    this.weltZeichner = null;
    this.animationen = new Animationen();
    this.pixelVerhaeltnis = 1;
    this.vignette = null;
    this.letzteZeit = 0;
    this.#groesseAnpassen();
    window.addEventListener('resize', () => this.#groesseAnpassen());
    // Handy: Adressleiste ein/aus ändert den sichtbaren Bereich, ohne immer 'resize' auszulösen
    window.visualViewport?.addEventListener('resize', () => this.#groesseAnpassen());
  }

  setzeAssets(assets) {
    this.assets = assets;
  }

  setzeWelt(welt) {
    this.weltZeichner = new WeltZeichner(welt, this.assets);
  }

  /** Zoom passt sich der Bildschirmgröße an: ähnlich viel Spielwelt auf Handy und Monitor. */
  #groesseAnpassen() {
    this.pixelVerhaeltnis = Math.min(window.devicePixelRatio || 1, 3);
    const breite = window.innerWidth;
    const hoehe = window.innerHeight;
    this.leinwand.width = Math.round(breite * this.pixelVerhaeltnis);
    this.leinwand.height = Math.round(hoehe * this.pixelVerhaeltnis);
    this.kamera.setzeBildschirm(breite, hoehe);
    this.kamera.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.sqrt(breite * hoehe) / KAMERA_SICHTFELD));
    this.vignette = erstelleVignette(this.leinwand.width, this.leinwand.height);
  }

  leeren() {
    const { ctx } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = FARBEN.hintergrund;
    ctx.fillRect(0, 0, this.leinwand.width, this.leinwand.height);
  }

  /**
   * @param szene { fokus: {x,y}, entitaeten: [], gegenstaende: [], jetzt: ms, effekte?: Effekte, markiertId?: number }
   *              markiertId = Gegenstand, der gerade aufgehoben werden kann (leuchtet stärker)
   */
  zeichne({ fokus, entitaeten, gegenstaende, jetzt, effekte = null, markiertId = null }) {
    const { ctx, kamera } = this;
    const dt = this.letzteZeit ? Math.min(0.1, (jetzt - this.letzteZeit) / 1000) : 0;
    this.letzteZeit = jetzt;
    this.leeren();

    kamera.folge(fokus.x, fokus.y);
    kamera.anwenden(ctx, this.pixelVerhaeltnis);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const sicht = kamera.sichtbereich();
    const aufloesung = Math.min(3, Math.max(1, Math.round(kamera.zoom * this.pixelVerhaeltnis * 2) / 2));
    this.weltZeichner?.zeichne(ctx, sicht, aufloesung);

    const sichtbar = (e) =>
      e.x > sicht.links - CULLING_RAND && e.x < sicht.rechts + CULLING_RAND && e.y > sicht.oben - CULLING_RAND && e.y < sicht.unten + CULLING_RAND;

    effekte?.aktualisiere(dt, jetzt);
    effekte?.zeichneBoden(ctx, this.assets);
    for (const g of gegenstaende) if (sichtbar(g)) zeichneGegenstand(ctx, g, this.assets, jetzt, g.id === markiertId);

    const kontext = { assets: this.assets, animationen: this.animationen, dt, jetzt };
    const figuren = entitaeten.filter(sichtbar).sort((a, b) => (EBENEN[a.typ] ?? 0) - (EBENEN[b.typ] ?? 0));
    for (const e of figuren) ZEICHNER[e.typ]?.(ctx, e, kontext);
    effekte?.zeichneOben(ctx);

    this.weltZeichner?.zeichneObereEbene(ctx, sicht, fokus);
    for (const e of figuren) zeichneBeschriftung(ctx, e);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.vignette, 0, 0);
    effekte?.zeichneBildschirm(ctx, this.leinwand.width, this.leinwand.height);
    this.animationen.aufraeumen(jetzt);
  }
}

function erstelleVignette(breite, hoehe) {
  const canvas = document.createElement('canvas');
  canvas.width = breite;
  canvas.height = hoehe;
  const ctx = canvas.getContext('2d');
  const radius = Math.hypot(breite, hoehe) / 2;
  const verlauf = ctx.createRadialGradient(breite / 2, hoehe / 2, radius * 0.45, breite / 2, hoehe / 2, radius);
  verlauf.addColorStop(0, 'rgba(0, 0, 0, 0)');
  verlauf.addColorStop(1, 'rgba(0, 0, 0, 0.55)');
  ctx.fillStyle = verlauf;
  ctx.fillRect(0, 0, breite, hoehe);
  return canvas;
}

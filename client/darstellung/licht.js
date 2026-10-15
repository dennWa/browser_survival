import { KACHELN } from '../../gemeinsam/welt/kacheln.js';
import { strahlGegenWaende } from '../../gemeinsam/physik/strahl.js';
import { LICHT } from '../konfiguration.js';

/**
 * Licht & Dunkelheit (rein optisch).
 *
 * Funktionsweise:
 *   1. Eine Dunkelheitsebene (halbe Auflösung, wird weich hochskaliert) wird über die Szene gelegt.
 *      Grunddunkelheit pro Kachel: drinnen fast schwarz, draußen Mondlicht → vorberechnete "Dunkelkarte".
 *   2. Lichtquellen STANZEN Löcher in die Dunkelheit ('destination-out'):
 *      - Taschenlampen-Kegel jedes Spielers als Sichtpolygon: Strahlen bis zur nächsten Wand → Wände werfen Schatten
 *      - schwacher Schein um jeden Spieler
 *      - Lampen der Karte (Objekte vom Typ 'licht'), Mündungsfeuer
 *   3. Farbiges Glühen der Lampen wird additiv ('lighter') auf die Szene gemalt.
 */
const AUFLOESUNG = 0.5; // Lichtebene in halber Bildschirmauflösung (Licht ist ohnehin weich)
const KEGEL_STRAHLEN = 48;

export class Licht {
  constructor(welt) {
    this.welt = welt;
    this.dunkelkarte = erstelleDunkelkarte(welt);
    this.lampen = welt.objekte.filter((o) => o.typ === 'licht');
    this.ebene = document.createElement('canvas');
    this.ctx = this.ebene.getContext('2d');
  }

  /**
   * @param ctx      Haupt-Canvas (Kamera-Transformation ist gesetzt)
   * @param kamera   für Welt → Bildschirm
   * @param figuren  sichtbare Entitäten (Spieler bekommen Taschenlampen)
   * @param blitze   [{ x, y, staerke }] Mündungsfeuer o. Ä.
   */
  zeichne(ctx, kamera, pixelVerhaeltnis, figuren, blitze, jetzt) {
    const breite = Math.max(1, Math.round(kamera.breite * AUFLOESUNG));
    const hoehe = Math.max(1, Math.round(kamera.hoehe * AUFLOESUNG));
    if (this.ebene.width !== breite || this.ebene.height !== hoehe) {
      this.ebene.width = breite;
      this.ebene.height = hoehe;
    }
    const l = this.ctx;
    const g = this.welt.kachelGroesse;
    const s = kamera.zoom * AUFLOESUNG;

    // 1. Grunddunkelheit (Dunkelkarte: 1 Pixel pro Kachel, weich skaliert)
    l.globalCompositeOperation = 'source-over';
    l.setTransform(1, 0, 0, 1, 0, 0);
    l.clearRect(0, 0, breite, hoehe);
    l.fillStyle = LICHT.farbe;
    l.globalAlpha = LICHT.dunkelheitAussen; // außerhalb der Karte
    l.fillRect(0, 0, breite, hoehe);
    l.globalAlpha = 1;
    l.setTransform(s, 0, 0, s, breite / 2 - kamera.x * s, hoehe / 2 - kamera.y * s);
    l.imageSmoothingEnabled = true;
    l.clearRect(0, 0, this.welt.pixelBreite, this.welt.pixelHoehe);
    l.drawImage(this.dunkelkarte, 0, 0, this.welt.pixelBreite, this.welt.pixelHoehe);

    // 2. Lichter ausstanzen
    l.globalCompositeOperation = 'destination-out';
    for (const e of figuren) {
      if (e.typ !== 'spieler' || e.tot) continue;
      this.#schein(l, e.x, e.y, LICHT.scheinRadius, LICHT.scheinStaerke);
      this.#taschenlampe(l, e);
    }
    for (const lampe of this.lampen) {
      const staerke = lampe.staerke ?? 0.85;
      this.#schein(l, (lampe.x + 0.5) * g, (lampe.y + 0.5) * g, lampe.radius * g, staerke * flackern(lampe, jetzt));
    }
    for (const b of blitze) this.#schein(l, b.x, b.y, 150, b.staerke);

    // Dunkelheit über die Szene legen (Bildschirmkoordinaten)
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.ebene, 0, 0, kamera.breite * pixelVerhaeltnis, kamera.hoehe * pixelVerhaeltnis);
    ctx.restore();

    // 3. Farbiges Glühen der Lampen
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const lampe of this.lampen) {
      const x = (lampe.x + 0.5) * g;
      const y = (lampe.y + 0.5) * g;
      const r = lampe.radius * g * 0.8;
      if (!kamera.istSichtbar(x, y, r)) continue;
      const verlauf = ctx.createRadialGradient(x, y, 0, x, y, r);
      verlauf.addColorStop(0, farbeMitAlpha(lampe.farbe ?? '#ffd9a0', 0.22 * flackern(lampe, jetzt)));
      verlauf.addColorStop(1, farbeMitAlpha(lampe.farbe ?? '#ffd9a0', 0));
      ctx.fillStyle = verlauf;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.restore();
  }

  #schein(l, x, y, radius, staerke) {
    const verlauf = l.createRadialGradient(x, y, 0, x, y, radius);
    verlauf.addColorStop(0, `rgba(0, 0, 0, ${staerke})`);
    verlauf.addColorStop(1, 'rgba(0, 0, 0, 0)');
    l.fillStyle = verlauf;
    l.beginPath();
    l.arc(x, y, radius, 0, Math.PI * 2);
    l.fill();
  }

  /** Lichtkegel als Sichtpolygon: Strahlen stoppen an Wänden → realistische Schatten. */
  #taschenlampe(l, s) {
    const { reichweite, halbwinkel } = LICHT.taschenlampe;
    l.beginPath();
    l.moveTo(s.x, s.y);
    for (let i = 0; i <= KEGEL_STRAHLEN; i++) {
      const w = s.blick - halbwinkel + (2 * halbwinkel * i) / KEGEL_STRAHLEN;
      const treffer = strahlGegenWaende(this.welt, s.x, s.y, w, reichweite);
      // ein paar Pixel weiter, damit die getroffene Wandkante beleuchtet ist
      const extra = treffer.getroffen ? 6 : 0;
      l.lineTo(treffer.x + Math.cos(w) * extra, treffer.y + Math.sin(w) * extra);
    }
    l.closePath();
    const verlauf = l.createRadialGradient(s.x, s.y, 10, s.x, s.y, reichweite);
    verlauf.addColorStop(0, 'rgba(0, 0, 0, 1)');
    verlauf.addColorStop(0.6, 'rgba(0, 0, 0, 0.85)');
    verlauf.addColorStop(1, 'rgba(0, 0, 0, 0)');
    l.fillStyle = verlauf;
    l.fill();
  }
}

/** 1 Pixel pro Kachel: Deckkraft der Dunkelheit (drinnen dunkler als draußen). */
function erstelleDunkelkarte(welt) {
  const canvas = document.createElement('canvas');
  canvas.width = welt.breite;
  canvas.height = welt.hoehe;
  const ctx = canvas.getContext('2d');
  const daten = ctx.createImageData(welt.breite, welt.hoehe);
  const [r, g, b] = hexZuRgb(LICHT.farbe);
  for (let ty = 0; ty < welt.hoehe; ty++) {
    for (let tx = 0; tx < welt.breite; tx++) {
      const i = (ty * welt.breite + tx) * 4;
      daten.data[i] = r;
      daten.data[i + 1] = g;
      daten.data[i + 2] = b;
      daten.data[i + 3] = Math.round(255 * (istDrinnen(welt, tx, ty) ? LICHT.dunkelheitInnen : LICHT.dunkelheitAussen));
    }
  }
  ctx.putImageData(daten, 0, 0);
  return canvas;
}

function istDrinnen(welt, tx, ty) {
  const kachel = KACHELN[welt.kachelAn(tx, ty)];
  return !!kachel && (kachel.innen || kachel.blockiert || kachel.name === 'tuer');
}

/** Manche Lampen flackern (Notstrom!). Deterministisch pro Lampe, ohne Zufallszahlen pro Frame. */
function flackern(lampe, jetzt) {
  if (!lampe.flackern) return 1;
  const t = jetzt / 1000 + lampe.x * 7.3 + lampe.y * 3.1;
  const welle = Math.sin(t * 13) * Math.sin(t * 7.7) * Math.sin(t * 2.3);
  return welle > 0.55 ? 0.15 : 0.85 + 0.15 * Math.sin(t * 31);
}

function hexZuRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function farbeMitAlpha(hex, alpha) {
  const [r, g, b] = hexZuRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

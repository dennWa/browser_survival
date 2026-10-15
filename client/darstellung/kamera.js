/**
 * Kamera: folgt dem eigenen Spieler und rechnet zwischen Welt- und Bildschirmkoordinaten um.
 * (x, y) = Weltpunkt in der Bildschirmmitte.
 */
export class Kamera {
  constructor(zoom = 1) {
    this.x = 0;
    this.y = 0;
    this.zoom = zoom;
    this.breite = 0; // Bildschirmgröße in CSS-Pixeln
    this.hoehe = 0;
  }

  folge(x, y) {
    this.x = x;
    this.y = y;
  }

  setzeBildschirm(breite, hoehe) {
    this.breite = breite;
    this.hoehe = hoehe;
  }

  bildschirmZuWelt(sx, sy) {
    return { x: (sx - this.breite / 2) / this.zoom + this.x, y: (sy - this.hoehe / 2) / this.zoom + this.y };
  }

  /** Sichtbarer Weltausschnitt (für Culling: nur Sichtbares zeichnen). */
  sichtbereich() {
    const halbB = this.breite / 2 / this.zoom;
    const halbH = this.hoehe / 2 / this.zoom;
    return { links: this.x - halbB, oben: this.y - halbH, rechts: this.x + halbB, unten: this.y + halbH };
  }

  /** Setzt die Canvas-Transformation, sodass danach in Weltkoordinaten gezeichnet werden kann. */
  anwenden(ctx, pixelVerhaeltnis) {
    const s = this.zoom * pixelVerhaeltnis;
    ctx.setTransform(s, 0, 0, s, (this.breite / 2) * pixelVerhaeltnis - this.x * s, (this.hoehe / 2) * pixelVerhaeltnis - this.y * s);
  }
}

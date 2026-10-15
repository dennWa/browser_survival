import { KACHELN } from './kacheln.js';

/**
 * Laufzeit-Abbild einer Karte: Kachelabfragen und Kollision.
 * Wird auf dem Server (autoritativ) und im Client (Vorhersage + Darstellung) aus denselben
 * Kartendaten erzeugt – deshalb liefern beide identische Ergebnisse.
 *
 * Kartendaten-Format (vom Server beim Login geschickt):
 *   { id, name, breite, hoehe, kachelGroesse, kacheln: string[], raeume: [{ id, name, x, y }] }
 */
export class Welt {
  constructor(kartenDaten) {
    this.id = kartenDaten.id;
    this.name = kartenDaten.name;
    this.breite = kartenDaten.breite;
    this.hoehe = kartenDaten.hoehe;
    this.kachelGroesse = kartenDaten.kachelGroesse;
    this.zeilen = kartenDaten.kacheln;
    this.raeume = kartenDaten.raeume ?? [];
  }

  get pixelBreite() {
    return this.breite * this.kachelGroesse;
  }

  get pixelHoehe() {
    return this.hoehe * this.kachelGroesse;
  }

  /** Zeichen der Kachel an Kachelkoordinate (tx, ty) oder null außerhalb der Karte. */
  kachelAn(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= this.breite || ty >= this.hoehe) return null;
    return this.zeilen[ty][tx];
  }

  /** Außerhalb der Karte gilt alles als blockiert (unsichtbare Grenze). */
  istBlockiert(tx, ty) {
    const zeichen = this.kachelAn(tx, ty);
    if (zeichen === null) return true;
    return KACHELN[zeichen]?.blockiert ?? true;
  }

  /** Prüft, ob ein Rechteck (Weltpixel) irgendeine blockierte Kachel berührt. */
  istBereichBlockiert(links, oben, rechts, unten) {
    const g = this.kachelGroesse;
    const tx0 = Math.floor(links / g);
    const tx1 = Math.floor(rechts / g);
    const ty0 = Math.floor(oben / g);
    const ty1 = Math.floor(unten / g);
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        if (this.istBlockiert(tx, ty)) return true;
      }
    }
    return false;
  }
}

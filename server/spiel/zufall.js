/**
 * Zufallsgenerator mit Startwert (Seed), damit Loot-Verteilungen reproduzierbar sind
 * (wichtig für Tests und Fehlersuche). Algorithmus: mulberry32.
 */
export class Zufall {
  constructor(startwert = Math.floor(Math.random() * 2 ** 32)) {
    this.startwert = startwert >>> 0;
    this.zustand = this.startwert;
  }

  /** Zahl in [0, 1) */
  zahl() {
    let t = (this.zustand = (this.zustand + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Ganzzahl in [min, max] */
  ganzzahl(min, max) {
    return min + Math.floor(this.zahl() * (max - min + 1));
  }

  auswahl(liste) {
    return liste[Math.floor(this.zahl() * liste.length)];
  }

  /** Wählt aus [{ ..., gewicht }] gewichtet ein Element. */
  gewichteteAuswahl(eintraege) {
    const summe = eintraege.reduce((s, e) => s + e.gewicht, 0);
    let wurf = this.zahl() * summe;
    for (const eintrag of eintraege) {
      wurf -= eintrag.gewicht;
      if (wurf < 0) return eintrag;
    }
    return eintraege[eintraege.length - 1];
  }
}

/**
 * A*-Pfadfindung auf dem Kachelraster (für Zombies).
 * 8 Richtungen; diagonal nur, wenn beide angrenzenden geraden Kacheln frei sind (keine Ecken schneiden).
 * Blockiert ist, was auch die Bewegung blockiert (Wände, Fenster, Möbel, geschlossene Türen).
 * Mit `tuerKosten` gelten geschlossene Türen als passierbar, aber teuer – so planen Zombies den Weg
 * durch eine Tür und brechen sie unterwegs auf (zombieSystem).
 */
const WURZEL_2 = Math.SQRT2;
const RICHTUNGEN = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, WURZEL_2], [1, -1, WURZEL_2], [-1, 1, WURZEL_2], [-1, -1, WURZEL_2],
];

/**
 * @returns {Array<{x, y}> | null}  Wegpunkte (Kachelmitten in Weltpixeln) ohne Startkachel, oder null
 */
export function findePfad(welt, startX, startY, zielX, zielY, { maxKnoten = 8000, tuerKosten = null } = {}) {
  const g = welt.kachelGroesse;
  const breite = welt.breite;
  const sx = Math.floor(startX / g);
  const sy = Math.floor(startY / g);
  const zx = Math.floor(zielX / g);
  const zy = Math.floor(zielY / g);
  const durchTuer = (tx, ty) => tuerKosten !== null && welt.istGeschlosseneTuer(tx, ty);
  if (welt.istBlockiert(zx, zy) && !durchTuer(zx, zy)) return null;
  if (sx === zx && sy === zy) return [];

  const start = sy * breite + sx;
  const ziel = zy * breite + zx;
  const kosten = new Map([[start, 0]]);
  const herkunft = new Map();
  const offen = new MinHeap();
  offen.einfuegen(start, schaetzung(sx, sy, zx, zy));
  const geschlossen = new Set();

  while (offen.groesse > 0) {
    const aktuell = offen.entnehmen();
    if (aktuell === ziel) return rekonstruiere(herkunft, ziel, breite, g);
    if (geschlossen.has(aktuell)) continue;
    geschlossen.add(aktuell);
    if (geschlossen.size > maxKnoten) return null;

    const ax = aktuell % breite;
    const ay = (aktuell - ax) / breite;
    for (const [dx, dy, schrittKosten] of RICHTUNGEN) {
      const nx = ax + dx;
      const ny = ay + dy;
      let extra = 0;
      if (welt.istBlockiert(nx, ny)) {
        // Geschlossene Tür: nur gerade hindurch, kostet extra (Aufbrechen dauert)
        if (dx !== 0 && dy !== 0 || !durchTuer(nx, ny)) continue;
        extra = tuerKosten;
      }
      if (dx !== 0 && dy !== 0 && (welt.istBlockiert(ax + dx, ay) || welt.istBlockiert(ax, ay + dy))) continue;
      const nachbar = ny * breite + nx;
      const neueKosten = kosten.get(aktuell) + schrittKosten + extra;
      if (neueKosten < (kosten.get(nachbar) ?? Infinity)) {
        kosten.set(nachbar, neueKosten);
        herkunft.set(nachbar, aktuell);
        offen.einfuegen(nachbar, neueKosten + schaetzung(nx, ny, zx, zy));
      }
    }
  }
  return null;
}

/** Oktil-Distanz: exakte Schätzung bei 8 Richtungen ohne Hindernisse. */
function schaetzung(ax, ay, bx, by) {
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  return Math.max(dx, dy) + (WURZEL_2 - 1) * Math.min(dx, dy);
}

function rekonstruiere(herkunft, ziel, breite, g) {
  const pfad = [];
  for (let k = ziel; herkunft.has(k); k = herkunft.get(k)) {
    const x = k % breite;
    pfad.push({ x: x * g + g / 2, y: ((k - x) / breite) * g + g / 2 });
  }
  return pfad.reverse();
}

/** Kleiner Binär-Heap (Prioritätswarteschlange) für A*. */
class MinHeap {
  #werte = [];
  #prioritaeten = [];

  get groesse() {
    return this.#werte.length;
  }

  einfuegen(wert, prioritaet) {
    this.#werte.push(wert);
    this.#prioritaeten.push(prioritaet);
    let i = this.#werte.length - 1;
    while (i > 0) {
      const eltern = (i - 1) >> 1;
      if (this.#prioritaeten[eltern] <= this.#prioritaeten[i]) break;
      this.#tausche(i, eltern);
      i = eltern;
    }
  }

  entnehmen() {
    const oben = this.#werte[0];
    const letzterWert = this.#werte.pop();
    const letztePrioritaet = this.#prioritaeten.pop();
    if (this.#werte.length > 0) {
      this.#werte[0] = letzterWert;
      this.#prioritaeten[0] = letztePrioritaet;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let kleinster = i;
        if (l < this.#werte.length && this.#prioritaeten[l] < this.#prioritaeten[kleinster]) kleinster = l;
        if (r < this.#werte.length && this.#prioritaeten[r] < this.#prioritaeten[kleinster]) kleinster = r;
        if (kleinster === i) break;
        this.#tausche(i, kleinster);
        i = kleinster;
      }
    }
    return oben;
  }

  #tausche(a, b) {
    [this.#werte[a], this.#werte[b]] = [this.#werte[b], this.#werte[a]];
    [this.#prioritaeten[a], this.#prioritaeten[b]] = [this.#prioritaeten[b], this.#prioritaeten[a]];
  }
}

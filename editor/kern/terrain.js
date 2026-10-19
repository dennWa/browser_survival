import { KLIPPE, HOEHE_MIN, HOEHE_MAX, klippenFuesse } from '../../gemeinsam/welt/gelaende.js';

/**
 * Terrain: eine Höhe je Kachel (Meter, + = Hügel, − = Senke). Seit Editor 2.0 (Schritt 2.3/2.4) zeigt das Spiel die Höhen in 3D
 * und man kann darauf laufen. Gesperrt ist nur der FUSS einer Klippe (Nachbar > KLIPPE höher, gemeinsam/welt/gelaende.js) –
 * Plateaus sind oben begehbar, Rampen/Stufen verbinden Ebenen.
 * Reine Funktionen: liefern Operationen ({ s: 'hoehe', i, neu }) für EditorKarte.anwenden.
 */
export const STEIL_SCHWELLE = KLIPPE;
export { HOEHE_MIN, HOEHE_MAX };

const begrenze = (h) => Math.round(Math.max(HOEHE_MIN, Math.min(HOEHE_MAX, h)) * 100) / 100;

/** Kacheln im Pinsel (Kreis) mit Gewicht 1 (Mitte) … 0 (Rand). */
export function pinselKacheln(karte, cx, cy, radius) {
  const liste = [];
  const r = Math.max(0.5, radius);
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      if (!karte.imFeld(x, y)) continue;
      const d = Math.hypot(x - cx, y - cy);
      if (d > r) continue;
      liste.push({ x, y, gewicht: r <= 0.5 ? 1 : 1 - d / (r + 0.5) });
    }
  }
  return liste;
}

/** Heben (staerke > 0) oder senken (< 0). */
export function terrainHeben(karte, cx, cy, radius, staerke) {
  return pinselKacheln(karte, cx, cy, radius).map(({ x, y, gewicht }) => {
    const i = karte.index(x, y);
    return { s: 'hoehe', i, neu: begrenze(karte.hoehen[i] + staerke * gewicht) };
  });
}

/** Glätten: Richtung Mittelwert der Nachbarn. */
export function terrainGlaetten(karte, cx, cy, radius, staerke = 0.5) {
  return pinselKacheln(karte, cx, cy, radius).map(({ x, y, gewicht }) => {
    let summe = 0;
    let n = 0;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!karte.imFeld(x + dx, y + dy)) continue;
        summe += karte.hoeheAn(x + dx, y + dy);
        n++;
      }
    const i = karte.index(x, y);
    const ziel = summe / n;
    return { s: 'hoehe', i, neu: begrenze(karte.hoehen[i] + (ziel - karte.hoehen[i]) * Math.min(1, staerke * gewicht)) };
  });
}

/** Auf feste Höhe setzen (Plateau) */
export function terrainEbnen(karte, cx, cy, radius, hoehe = 0) {
  return pinselKacheln(karte, cx, cy, radius).map(({ x, y }) => ({ s: 'hoehe', i: karte.index(x, y), neu: begrenze(hoehe) }));
}

/** Fuß einer Klippe (gesperrt im Spiel)? */
export function istSteil(karte, x, y) {
  const h = karte.hoeheAn(x, y);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    if (!karte.imFeld(x + dx, y + dy)) continue;
    if (karte.hoeheAn(x + dx, y + dy) - h > STEIL_SCHWELLE) return true;
  }
  return false;
}

/** [[x, y], …] aller Klippen-Füße (→ Export terrain.steil, nur Info: das Spiel rechnet es selbst aus den Höhen) */
export function steileKacheln(karte) {
  return klippenFuesse(karte.hoehen, karte.breite, karte.hoehe);
}

/** Plateau: Pinselfläche auf eine feste Zielhöhe setzen */
export function terrainPlateau(karte, cx, cy, radius, ziel) {
  return terrainEbnen(karte, cx, cy, radius, ziel);
}

/** Rechteck auf eine Höhe setzen (Bereich markieren → Höhe) */
export function bereichHoehe(karte, r, hoehe) {
  const ops = [];
  for (let y = Math.max(0, r.y); y < Math.min(karte.hoehe, r.y + r.h); y++)
    for (let x = Math.max(0, r.x); x < Math.min(karte.breite, r.x + r.b); x++) ops.push({ s: 'hoehe', i: karte.index(x, y), neu: begrenze(hoehe) });
  return ops;
}

/**
 * Rampe (oder mit stufe > 0: Treppe) von a nach b: Höhe läuft gleichmäßig von der Höhe bei a zur Höhe bei b,
 * breite = Kacheln quer zur Richtung. Stufen runden auf Vielfache von `stufe` (z. B. 0,5 m).
 */
export function rampe(karte, a, b, { breite = 3, stufe = 0, von = null, bis = null } = {}) {
  const h0 = von ?? karte.hoeheAn(a.x, a.y);
  const h1 = bis ?? karte.hoeheAn(b.x, b.y);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const laenge = Math.hypot(dx, dy);
  if (laenge < 0.5) return [];
  const ux = dx / laenge;
  const uy = dy / laenge;
  const halb = breite / 2;
  const ops = [];
  const x0 = Math.floor(Math.min(a.x, b.x) - halb - 1);
  const x1 = Math.ceil(Math.max(a.x, b.x) + halb + 1);
  const y0 = Math.floor(Math.min(a.y, b.y) - halb - 1);
  const y1 = Math.ceil(Math.max(a.y, b.y) + halb + 1);
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      if (!karte.imFeld(x, y)) continue;
      const px = x - a.x;
      const py = y - a.y;
      const t = (px * ux + py * uy) / laenge; // 0 … 1 entlang der Rampe
      const quer = Math.abs(px * -uy + py * ux);
      if (t < -0.001 || t > 1.001 || quer > halb) continue;
      let h = h0 + (h1 - h0) * Math.max(0, Math.min(1, t));
      if (stufe > 0) h = Math.round(h / stufe) * stufe;
      ops.push({ s: 'hoehe', i: karte.index(x, y), neu: begrenze(h) });
    }
  return ops;
}

/** Höchster Höhenunterschied je Kachel einer Rampe (zum Prüfen: ≤ KLIPPE = begehbar) */
export function steigung(karte, x, y) {
  let max = 0;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (karte.imFeld(x + dx, y + dy)) max = Math.max(max, Math.abs(karte.hoeheAn(x + dx, y + dy) - karte.hoeheAn(x, y)));
  return max;
}

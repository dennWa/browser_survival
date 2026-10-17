/**
 * Terrain (Phase 10): eine Höhe je Kachel (Meter, + = Hügel, − = Senke). Entscheidung (siehe editor/LIESMICH.md):
 *   - Höhen sind vorerst NUR Darstellung (Editor-3D). Das Gameplay bleibt flach (2D).
 *   - Steile Kacheln (Höhenunterschied zu einem Nachbarn > STEIL_SCHWELLE) gelten als blockiert: der Export schreibt sie in
 *     `terrain.steil`, der Spiel-Lader macht daraus unsichtbare Hindernisse. Weitere Gameplay-Wirkung wird separat entschieden.
 * Reine Funktionen: liefern Operationen ({ s: 'hoehe', i, neu }) für EditorKarte.anwenden.
 */
export const STEIL_SCHWELLE = 1.5;
export const HOEHE_MIN = -10;
export const HOEHE_MAX = 10;

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

export function istSteil(karte, x, y) {
  const h = karte.hoeheAn(x, y);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    if (!karte.imFeld(x + dx, y + dy)) continue;
    if (Math.abs(karte.hoeheAn(x + dx, y + dy) - h) > STEIL_SCHWELLE) return true;
  }
  return false;
}

/** [[x, y], …] aller steilen Kacheln (→ Export terrain.steil) */
export function steileKacheln(karte) {
  const liste = [];
  if (!karte.hoehen.some((h) => h !== 0)) return liste;
  for (let y = 0; y < karte.hoehe; y++) for (let x = 0; x < karte.breite; x++) if (istSteil(karte, x, y)) liste.push([x, y]);
  return liste;
}

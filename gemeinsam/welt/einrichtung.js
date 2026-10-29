/**
 * Runde 24 (Cozy): Einrichtung, Licht und Strom – Regeln für Server UND Client (umgebungsfrei).
 *   Möbel/Deko: BAUWERKE mit `moebel: true` (gemeinsam/welt/bauwerke.js), Kosten/Menü in gemeinsam/basisbau/teile.js (Kategorie „Einrichtung“).
 *   LICHTER: Bauwerk-Typ → Lichtwerte (Renderer: Lampen-Pool) und `strom` (leuchtet nur mit laufendem Generator in STROM_RADIUS).
 *   Schalter: b.an (Standard an) – E schaltet; Kamin brennt (b.brennt/brennRest), Generator läuft (b.laeuft/brennRest).
 *   Gemütlichkeit: drinnen + (brennender Kamin in GEMUETLICH_KAMIN_RADIUS oder ≥ GEMUETLICH_DEKO Deko-Teile in GEMUETLICH_RADIUS).
 */
export const STROM_RADIUS = 14; // Kacheln um einen laufenden Generator
export const GEMUETLICH_RADIUS = 6; // Kacheln
export const GEMUETLICH_KAMIN_RADIUS = 7;
export const GEMUETLICH_DEKO = 3;

/** Lichtquellen: farbe (hex), reichweite (px), staerke, hoehe (px über Boden), strom (braucht Generator) */
export const LICHTER = Object.freeze({
  kamin: { farbe: 0xff8a3a, reichweite: 340, staerke: 360, hoehe: 26, flackern: true },
  kerze: { farbe: 0xffb060, reichweite: 160, staerke: 90, hoehe: 22, flackern: true },
  oellampe: { farbe: 0xffc070, reichweite: 230, staerke: 160, hoehe: 28, flackern: true },
  stehlampe: { farbe: 0xffe0b0, reichweite: 300, staerke: 260, hoehe: 64, strom: true },
  lichterkette: { farbe: 0xffd28a, reichweite: 220, staerke: 150, hoehe: 40, strom: true },
});

/** Leuchtet dieses Bauwerk gerade? */
export function leuchtet(welt, b) {
  const l = LICHTER[b.typ];
  if (!l) return false;
  if (b.typ === 'kamin') return b.brennt === true;
  if (b.an === false) return false;
  return !l.strom || hatStrom(welt, b.tx, b.ty);
}

/** Läuft ein Generator im STROM_RADIUS um die Kachel? */
export function hatStrom(welt, tx, ty) {
  for (const b of welt.bauwerke.values()) {
    if (b.typ !== 'generator' || !b.laeuft) continue;
    if (Math.hypot(b.tx - tx, b.ty - ty) <= STROM_RADIUS) return true;
  }
  return false;
}

/** Gemütlich am Ort (Weltpixel)? `innen` = welt.istInnen-Ergebnis (der Aufrufer prüft es, Client und Server gleich). */
export function istGemuetlich(welt, x, y, innen) {
  if (!innen) return false;
  const g = welt.kachelGroesse;
  const tx = x / g - 0.5;
  const ty = y / g - 0.5;
  let deko = 0;
  for (const b of welt.bauwerke.values()) {
    const d = Math.hypot(b.tx - tx, b.ty - ty);
    if (b.typ === 'kamin' && b.brennt && d <= GEMUETLICH_KAMIN_RADIUS) return true;
    if (d <= GEMUETLICH_RADIUS && (b.moebel || MOEBEL_TYPEN.has(b.typ))) deko++;
  }
  return deko >= GEMUETLICH_DEKO;
}

/** Alle Möbel-/Deko-Typen (zählen für die Gemütlichkeit). Lichter zählen mit. */
export const MOEBEL_TYPEN = new Set(['sofa', 'sessel', 'stuhl', 'tisch', 'esstisch', 'regal', 'teppich', 'bild', 'pflanze', 'vorhang', 'kerze', 'oellampe', 'stehlampe', 'lichterkette', 'kamin', 'radio', 'plattenspieler']);

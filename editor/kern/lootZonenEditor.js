import { KACHELN } from '../../gemeinsam/welt/kacheln.js';
import { pruefeLootZone, punkteDerZone, kandidaten } from '../../server/spiel/karten/lootZonen.js';
import { steileKacheln } from './terrain.js';

/**
 * Loot-Zonen im Editor (Schritt 6.2) – umgebungsfrei. Dieselbe Verteilregel wie der Spiel-Lader (server/spiel/karten/lootZonen.js):
 * freie Kachel = begehbar, kein Wasser, kein blockierendes Möbel (außer Kronen), kein Klippenfuß; innen laut Kachel.
 * Die Zonen-Nummer (fester Zufall) = Position in der Sammlung (= Reihenfolge im Export).
 */
export function kachelPruefer(karte) {
  const steil = new Set(steileKacheln(karte).map(([x, y]) => `${x},${y}`));
  const objekte = [...karte.s('objekte').values()].filter((o) => o.blockiert && o.ebene !== 'oben');
  return (x, y) => {
    const k = KACHELN[karte.kachelAn(x, y)];
    const belegt = steil.has(`${x},${y}`) || objekte.some((o) => x + 0.5 > o.x && x + 0.5 < o.x + o.b && y + 0.5 > o.y && y + 0.5 < o.y + o.h);
    return { frei: !!k && !k.blockiert && !k.wasser && !belegt, innen: !!k?.innen };
  };
}

/** Vorschau einer Zone: { zone (geprüft), punkte: [[x, y]], frei (Anzahl möglicher Kacheln), fehler } */
export function lootVorschau(karte, id, kachel = kachelPruefer(karte)) {
  const roh = karte.s('lootZonen').get(id);
  const nr = [...karte.s('lootZonen').keys()].indexOf(id);
  const { zone, fehler } = pruefeLootZone(roh, { breite: karte.breite, hoehe: karte.hoehe });
  if (!zone) return { zone: null, punkte: [], frei: 0, fehler };
  return { zone, punkte: punkteDerZone(zone, kachel, nr), frei: kandidaten(zone, kachel, nr).length, fehler };
}

/**
 * Loot-Dichte für die Heatmap (Schritt 6.4): je Kachel die erwartete Zahl Gegenstände je Befüllung, weich verteilt
 * (Radius `radius` Kacheln, linear abfallend). Quellen: Loot-Punkte der Räume (Chance je Raum, sonst `standardChance`) und
 * Punkte der Loot-Zonen (1 − „nichts“). @returns { zellen: Map "x,y" → wert, max }
 */
export function lootDichte(karte, { standardChance = 0.7, radius = 3 } = {}) {
  const quellen = [];
  for (const [schl, m] of karte.s('marker')) {
    if (m.art !== 'loot') continue;
    const [x, y] = schl.split(',').map(Number);
    quellen.push([x, y, karte.s('raeume').get(m.raum)?.spawnChance ?? standardChance]);
  }
  if (karte.s('lootZonen').size) {
    const kachel = kachelPruefer(karte);
    for (const id of karte.s('lootZonen').keys()) {
      const v = lootVorschau(karte, id, kachel);
      if (!v.zone) continue;
      const p = v.zone.modus === 'chance' ? Math.min(1, v.zone.eintraege.reduce((s, e) => s + e.chance, 0) / 100) : (v.zone.spawnChance ?? standardChance);
      for (const [x, y] of v.punkte) quellen.push([x, y, p]);
    }
  }
  const zellen = new Map();
  let max = 0;
  for (const [qx, qy, p] of quellen)
    for (let dy = -radius; dy <= radius; dy++)
      for (let dx = -radius; dx <= radius; dx++) {
        const x = qx + dx;
        const y = qy + dy;
        const d = Math.hypot(dx, dy);
        if (d > radius || !karte.imFeld(x, y)) continue;
        const k = `${x},${y}`;
        const w = (zellen.get(k) ?? 0) + p * (1 - d / (radius + 1));
        zellen.set(k, w);
        if (w > max) max = w;
      }
  return { zellen, max, quellen: quellen.length };
}

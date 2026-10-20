import { GEGENSTAENDE } from '../konfiguration/gegenstaende.js';
import { LOOT_TABELLEN } from '../konfiguration/lootTabellen.js';

/**
 * Loot-Zonen (Editor 2.0, Schritt 6.2) – umgebungsfrei: Kartenlader, lootSystem und Map-Editor (Inspektor, Prüfung,
 * Vorschau der Punkte) benutzen dieselben Regeln. Tests: tests/lootZonen.test.js.
 *
 * Kartenformat `lootZonen: [ … ]` (Kacheln):
 *   { name, x, y, b, h,                       Rechteck
 *     modus: 'gewicht' | 'chance',            gewicht = relative Häufigkeit (+ spawnChance je Punkt);
 *                                             chance  = exakte Wahrscheinlichkeit je Item in % (Rest = nichts)
 *     eintraege: [{ id, gewicht?, chance?, menge?: [min, max] }],   menge fehlt = Standard des Items (mengeBeimFund)
 *     punkte,                                 Anzahl Loot-Punkte (1–200), werden auf begehbaren Kacheln verteilt
 *     ort: 'alle' | 'innen' | 'aussen',       nur Innenräume / nur draußen
 *     spawnChance?, respawnZeit?, max? }      max = höchstens so viele Gegenstände der Zone gleichzeitig am Boden
 * Punkte: deterministisch (fester Zufall aus Zone + Kachel) → gleiche Karte = gleiche Punkte (Editor-Vorschau = Spiel).
 */
export const LOOT_MODI = Object.freeze(['gewicht', 'chance']);
export const LOOT_ORTE = Object.freeze({ alle: 'überall', innen: 'nur innen', aussen: 'nur außen' });
export const MAX_PUNKTE = 200;

const zahl = (w, min, max, std) => (Number.isFinite(Number(w)) && w !== null && w !== '' ? Math.min(max, Math.max(min, Number(w))) : std);
const rund = (w, n = 100) => Math.round(w * n) / n;

/** Standard-Menge eines Items (wie beim normalen Loot) */
export function standardMenge(id) {
  const s = GEGENSTAENDE[id]?.mengeBeimFund;
  return Array.isArray(s) ? [s[0], s[1]] : [1, 1];
}

/** Neue Zone (Editor): aus einer vorhandenen Loot-Tabelle als Startliste */
export function neueLootZone(rechteck, { tabelle = 'lager', name = 'Loot-Zone' } = {}) {
  const t = LOOT_TABELLEN[tabelle] ?? [];
  return { name, ...rechteck, modus: 'gewicht', eintraege: t.map((e) => ({ id: e.id, gewicht: e.gewicht })), punkte: Math.max(1, Math.min(12, Math.round((rechteck.b * rechteck.h) / 12))), ort: 'alle' };
}

/**
 * Zone prüfen/säubern (Lader). Unbekannte Items fallen weg, Zahlen werden begrenzt.
 * @returns { zone, fehler: [text] } – zone null, wenn unbrauchbar (kein Rechteck, keine Items)
 */
export function pruefeLootZone(roh, { breite = 1e4, hoehe = 1e4 } = {}) {
  const fehler = [];
  if (!roh || typeof roh !== 'object') return { zone: null, fehler: ['keine Zone'] };
  const x = Math.round(zahl(roh.x, 0, breite - 1, 0));
  const y = Math.round(zahl(roh.y, 0, hoehe - 1, 0));
  const zone = {
    name: typeof roh.name === 'string' ? roh.name.slice(0, 60) : 'Loot-Zone',
    x,
    y,
    b: Math.round(zahl(roh.b, 1, breite - x, 1)),
    h: Math.round(zahl(roh.h, 1, hoehe - y, 1)),
    modus: LOOT_MODI.includes(roh.modus) ? roh.modus : 'gewicht',
    punkte: Math.round(zahl(roh.punkte, 1, MAX_PUNKTE, 4)),
    ort: Object.hasOwn(LOOT_ORTE, roh.ort) ? roh.ort : 'alle',
    eintraege: [],
  };
  if (roh.spawnChance !== undefined && roh.spawnChance !== null) zone.spawnChance = rund(zahl(roh.spawnChance, 0, 1, 0.7));
  if (roh.respawnZeit > 0) zone.respawnZeit = Math.round(zahl(roh.respawnZeit, 1, 86400, 300));
  if (roh.max > 0) zone.max = Math.round(zahl(roh.max, 1, MAX_PUNKTE, MAX_PUNKTE));
  for (const e of Array.isArray(roh.eintraege) ? roh.eintraege : []) {
    if (!GEGENSTAENDE[e?.id]) {
      fehler.push(`unbekanntes Item „${e?.id}“`);
      continue;
    }
    const aus = { id: e.id };
    if (zone.modus === 'chance') aus.chance = rund(zahl(e.chance, 0, 100, 0));
    else aus.gewicht = rund(zahl(e.gewicht, 0, 1000, 1));
    if (Array.isArray(e.menge)) {
      const a = Math.round(zahl(e.menge[0], 1, 999, 1));
      aus.menge = [a, Math.round(Math.max(a, zahl(e.menge[1], 1, 999, a)))];
    }
    if ((aus.chance ?? aus.gewicht) > 0) zone.eintraege.push(aus);
  }
  const summe = zone.eintraege.reduce((s, e) => s + (e.chance ?? 0), 0);
  if (zone.modus === 'chance' && summe > 100 + 1e-9) fehler.push(`Chancen ergeben zusammen ${rund(summe)} % (max. 100)`);
  if (!zone.eintraege.length) fehler.push('keine Items');
  return { zone: zone.eintraege.length ? zone : null, fehler };
}

/** Fester Zufall 0..1 aus Zahlen (für stabile Punkte) */
function streu(...n) {
  let h = 2166136261;
  for (const v of n) {
    h ^= Math.round(v * 1000) | 0;
    h = Math.imul(h, 16777619) >>> 0;
  }
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995) >>> 0;
  return (h >>> 0) / 4294967296;
}

/**
 * Kacheln der Zone, auf denen Loot liegen darf. kachel(x, y) → { frei, innen } (frei = begehbar, nicht zugestellt).
 * @returns [[x, y], …] in fester, gemischter Reihenfolge
 */
export function kandidaten(zone, kachel, nr = 0) {
  const liste = [];
  for (let y = zone.y; y < zone.y + zone.h; y++)
    for (let x = zone.x; x < zone.x + zone.b; x++) {
      const k = kachel(x, y);
      if (!k?.frei) continue;
      if (zone.ort === 'innen' && !k.innen) continue;
      if (zone.ort === 'aussen' && k.innen) continue;
      liste.push([x, y, streu(nr, x, y)]);
    }
  return liste.sort((a, b) => a[2] - b[2]).map(([x, y]) => [x, y]);
}

/** Loot-Punkte der Zone (Kacheln) – höchstens so viele wie freie Kacheln */
export function punkteDerZone(zone, kachel, nr = 0) {
  return kandidaten(zone, kachel, nr).slice(0, zone.punkte);
}

/**
 * Ein Item für einen Punkt würfeln. zufall: { zahl() → [0,1), ganzzahl(a, b) }, standardChance = konfiguration.loot.spawnChance.
 * @returns { id, menge } oder null (nichts)
 */
export function wuerfleAusZone(zone, zufall, standardChance = 0.7) {
  let wahl = null;
  if (zone.modus === 'chance') {
    let r = zufall.zahl() * 100;
    for (const e of zone.eintraege) {
      if (r < e.chance) {
        wahl = e;
        break;
      }
      r -= e.chance;
    }
  } else {
    if (zufall.zahl() >= (zone.spawnChance ?? standardChance)) return null;
    const summe = zone.eintraege.reduce((s, e) => s + e.gewicht, 0);
    let r = zufall.zahl() * summe;
    for (const e of zone.eintraege) {
      if (r < e.gewicht) {
        wahl = e;
        break;
      }
      r -= e.gewicht;
    }
    wahl ??= zone.eintraege.at(-1);
  }
  if (!wahl) return null;
  const [a, b] = wahl.menge ?? standardMenge(wahl.id);
  return { id: wahl.id, menge: zufall.ganzzahl(a, b) };
}

/**
 * Erwartete Ausbeute je Befüllung (alle Punkte einmal gewürfelt): [{ id, name, wahrscheinlichkeit (je Punkt), stueck (Erwartung) }]
 * + leer (Wahrscheinlichkeit „nichts“ je Punkt).
 */
export function erwarteteAusbeute(zone, standardChance = 0.7, punkte = zone.punkte) {
  const liste = [];
  let leer;
  if (zone.modus === 'chance') {
    const summe = zone.eintraege.reduce((s, e) => s + (e.chance ?? 0), 0);
    leer = Math.max(0, 1 - summe / 100);
    for (const e of zone.eintraege) liste.push({ id: e.id, p: (e.chance ?? 0) / 100, menge: e.menge ?? standardMenge(e.id) });
  } else {
    const chance = zone.spawnChance ?? standardChance;
    const summe = zone.eintraege.reduce((s, e) => s + (e.gewicht ?? 0), 0) || 1;
    leer = 1 - chance;
    for (const e of zone.eintraege) liste.push({ id: e.id, p: (chance * (e.gewicht ?? 0)) / summe, menge: e.menge ?? standardMenge(e.id) });
  }
  return {
    leer: rund(leer, 1000),
    eintraege: liste.map((e) => ({ id: e.id, name: GEGENSTAENDE[e.id]?.name ?? e.id, wahrscheinlichkeit: rund(e.p, 1000), stueck: rund(e.p * punkte * ((e.menge[0] + e.menge[1]) / 2)) })),
  };
}

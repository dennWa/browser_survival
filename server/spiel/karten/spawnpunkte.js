import { GEGENSTAENDE } from '../konfiguration/gegenstaende.js';
import { LOOT_TABELLEN } from '../konfiguration/lootTabellen.js';

/**
 * Item-Spawnpunkte (Studio Phase 1, Konzept docs/konzepte/STUDIO_KONZEPT.md §6.5) – umgebungsfrei: Kartenlader, lootSystem
 * und Studio benutzen dieselben Regeln. Tests: tests/spawnpunkte.test.js.
 *
 * Kartenformat `spawnpunkte: [ … ]` (Kacheleinheiten, Brüche erlaubt – 12.5 = Mitte der Kachel 12):
 *   { x, y,                         Punkt auf der Karte
 *     inhalt: 'konserve' | 'tabelle:kueche',   ein Item (GEGENSTAENDE) oder eine Loot-Tabelle (LOOT_TABELLEN)
 *     chance: 0–100,                Wahrscheinlichkeit je Versuch in %
 *     intervall: 0,5–1440,          alle wie viele Minuten (Echtzeit) ein neuer Versuch, solange der Punkt leer ist
 *     menge?: [min, max],           nur bei einem Item (fehlt = Standard des Items)
 *     hoehe?: 0–5,                  Ablagehöhe in Kacheln (Item liegt sichtbar auf einem Möbel; Spiel-Logik bleibt 2D)
 *     name? }
 * Ablauf: Beim Start ein Versuch; wird das Item aufgehoben (oder misslingt der Wurf), startet der Timer `intervall` neu.
 * Ein Punkt hält höchstens ein Item.
 */
export const SPAWN_INTERVALL_MIN = 0.5;
export const SPAWN_INTERVALL_MAX = 1440;
export const SPAWN_HOEHE_MAX = 5;
export const TABELLEN_PRAEFIX = 'tabelle:';

const zahl = (w) => (w === null || w === '' || w === undefined ? NaN : Number(w));
const begrenzt = (w, min, max, std) => (Number.isFinite(zahl(w)) ? Math.min(max, Math.max(min, zahl(w))) : std);

/** Ist `inhalt` ein bekanntes Item oder eine Loot-Tabelle? */
export function istGueltigerInhalt(inhalt) {
  if (typeof inhalt !== 'string') return false;
  if (inhalt.startsWith(TABELLEN_PRAEFIX)) return Object.hasOwn(LOOT_TABELLEN, inhalt.slice(TABELLEN_PRAEFIX.length));
  return Object.hasOwn(GEGENSTAENDE, inhalt);
}

/**
 * Prüft und normalisiert einen Spawnpunkt.
 * @returns {{ punkt: object|null, fehler: string|null }}
 */
export function pruefeSpawnpunkt(roh, { breite = Infinity, hoehe = Infinity } = {}) {
  if (!roh || typeof roh !== 'object') return { punkt: null, fehler: 'kein Objekt' };
  const x = zahl(roh.x);
  const y = zahl(roh.y);
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x >= breite || y >= hoehe) return { punkt: null, fehler: 'liegt außerhalb der Karte' };
  if (!istGueltigerInhalt(roh.inhalt)) return { punkt: null, fehler: `unbekannter Inhalt „${roh.inhalt}“` };
  const punkt = {
    x: Math.round(x * 100) / 100,
    y: Math.round(y * 100) / 100,
    inhalt: roh.inhalt,
    chance: begrenzt(roh.chance, 0, 100, 50),
    intervall: begrenzt(roh.intervall, SPAWN_INTERVALL_MIN, SPAWN_INTERVALL_MAX, 10),
  };
  if (!roh.inhalt.startsWith(TABELLEN_PRAEFIX) && Array.isArray(roh.menge) && roh.menge.length === 2) {
    const a = Math.max(1, Math.round(begrenzt(roh.menge[0], 1, 999, 1)));
    const b = Math.max(a, Math.round(begrenzt(roh.menge[1], 1, 999, a)));
    punkt.menge = [a, b];
  }
  const h = begrenzt(roh.hoehe, 0, SPAWN_HOEHE_MAX, 0);
  if (h > 0) punkt.hoehe = Math.round(h * 100) / 100;
  if (typeof roh.name === 'string' && roh.name.trim()) punkt.name = roh.name.trim().slice(0, 60);
  return { punkt, fehler: null };
}

/**
 * Würfelt einen Spawnpunkt aus. @returns { id, menge } | null (Wurf misslungen)
 * @param zufall  { zahl(): 0..1, ganzzahl(a, b), gewichteteAuswahl(liste) } (spielWelt.zufall)
 */
export function wuerfleSpawnpunkt(punkt, zufall) {
  if (zufall.zahl() * 100 >= punkt.chance) return null;
  let id = punkt.inhalt;
  if (id.startsWith(TABELLEN_PRAEFIX)) id = zufall.gewichteteAuswahl(LOOT_TABELLEN[id.slice(TABELLEN_PRAEFIX.length)]).id;
  const spanne = punkt.menge ?? GEGENSTAENDE[id]?.mengeBeimFund ?? [1, 1];
  return { id, menge: zufall.ganzzahl(spanne[0], spanne[1]) };
}

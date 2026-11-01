/**
 * Zombie-Bereiche (Studio Phase 1.16, 🎮) – umgebungsfrei: Kartenlader, SpielWelt/zombieSystem und Studio nutzen dieselben Regeln.
 * Tests: tests/zombieBereiche.test.js.
 *
 * Kartenformat `zombieBereiche: [ … ]` (Kacheln):
 *   { name?, x, y, b, h,                 Rechteck, in dem die Zombies (auf freien Kacheln, fest verteilt) entstehen
 *     anzahl: 1–60,                      so viele gleichzeitig (jeder hat seinen eigenen Spawnpunkt + Respawn)
 *     varianten?: { normal: 6, laeufer: 2, … }   Mischung nach Gewicht (fehlt = Standard-Mischung des Spiels)
 *     tageszeit?: 'immer' | 'tag' | 'nacht',     erscheinen nur zu dieser Tageszeit (später als geplant = sobald sie passt)
 *     respawnZeit?: Sekunden,
 *     route?: [{ x, y }, …] }            Patrouille (2–30 Punkte): ruhende Zombies laufen die Punkte reihum ab (Horden-Route)
 */
export const TAGESZEITEN = Object.freeze(['immer', 'tag', 'nacht']);
/** = Schlüssel von konfiguration.zombie.varianten (Test prüft die Übereinstimmung) */
export const ZOMBIE_VARIANTEN_NAMEN = Object.freeze(['normal', 'laeufer', 'halb', 'sprinter', 'spucker', 'gepanzert', 'explosiv', 'brocken']);
export const MAX_ANZAHL = 60;

const zahl = (w) => (w === null || w === '' || w === undefined ? NaN : Number(w));

/** @returns {{ bereich: object|null, fehler: string|null }} */
export function pruefeZombieBereich(roh, { breite = Infinity, hoehe = Infinity } = {}) {
  if (!roh || typeof roh !== 'object') return { bereich: null, fehler: 'kein Objekt' };
  const [x, y, b, h] = [roh.x, roh.y, roh.b, roh.h].map((w) => Math.round(zahl(w)));
  if (![x, y, b, h].every(Number.isFinite) || b < 1 || h < 1 || x < 0 || y < 0 || x + b > breite || y + h > hoehe) return { bereich: null, fehler: 'Rechteck liegt außerhalb der Zone' };
  const anzahl = Math.max(1, Math.min(MAX_ANZAHL, Math.round(zahl(roh.anzahl)) || 3));
  const bereich = { x, y, b, h, anzahl, tageszeit: TAGESZEITEN.includes(roh.tageszeit) ? roh.tageszeit : 'immer' };
  if (typeof roh.name === 'string' && roh.name.trim()) bereich.name = roh.name.trim().slice(0, 40);
  if (roh.varianten && typeof roh.varianten === 'object') {
    const v = {};
    for (const [name, g] of Object.entries(roh.varianten)) if (ZOMBIE_VARIANTEN_NAMEN.includes(name) && zahl(g) > 0) v[name] = Math.min(100, zahl(g));
    if (Object.keys(v).length) bereich.varianten = v;
  }
  if (zahl(roh.respawnZeit) > 0) bereich.respawnZeit = Math.min(7200, zahl(roh.respawnZeit));
  if (Array.isArray(roh.route)) {
    const route = roh.route.map((p) => ({ x: Math.round(zahl(p?.x) * 100) / 100, y: Math.round(zahl(p?.y) * 100) / 100 })).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.y >= 0 && p.x < breite && p.y < hoehe).slice(0, 30);
    if (route.length >= 2) bereich.route = route;
  }
  return { bereich, fehler: null };
}

function streuwert(x, y, salz) {
  const n = Math.sin(x * 127.1 + y * 311.7 + salz * 74.7) * 43758.5453;
  return n - Math.floor(n);
}

/**
 * Feste Spawn-Kacheln eines Bereichs (gleiche Karte = gleiche Punkte). frei(x, y) → begehbar?
 * @returns [[x, y], …] (höchstens `anzahl`; doppelt, wenn zu wenig Platz)
 */
export function punkteImBereich(bereich, frei, nr = 0) {
  const kandidaten = [];
  for (let y = bereich.y; y < bereich.y + bereich.h; y++) for (let x = bereich.x; x < bereich.x + bereich.b; x++) if (frei(x, y)) kandidaten.push([x, y, streuwert(x, y, nr + 11)]);
  if (!kandidaten.length) return [];
  kandidaten.sort((a, b) => a[2] - b[2]);
  return Array.from({ length: bereich.anzahl }, (_, i) => kandidaten[i % kandidaten.length].slice(0, 2));
}

/** Passt die Tageszeit des Spawns? */
export function passtTageszeit(spawn, istNacht) {
  return !spawn?.tageszeit || spawn.tageszeit === 'immer' || (spawn.tageszeit === 'nacht') === !!istNacht;
}

/** Variante aus der Mischung des Bereichs (zufall.gewichteteAuswahl) – null = Standard des Spiels */
export function varianteAusMischung(spawn, zufall) {
  if (!spawn?.varianten) return null;
  return zufall.gewichteteAuswahl(Object.entries(spawn.varianten).map(([name, gewicht]) => ({ name, gewicht }))).name;
}

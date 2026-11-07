/**
 * Kleintier-Entität: Hase (Runde 41: auch Wild reh|hirsch|fuchs, konfiguration.tiere.wild) (Verhalten systeme/tierSystem.js) – Runde 24: Hund, Katze, Huhn (systeme/haustierSystem.js).
 * zustand: 'ruhend' (hoppelt gemütlich umher) | 'flucht' (ein Spieler ist zu nah) | Haustier: 'folgen' | 'bleib' | 'angriff' | 'schlaeft'
 * besitzer/name: gezähmtes Haustier
 */
export function erzeugeTier({ id, art = 'hase', x, y, konfiguration }) {
  const k = konfiguration.tiere;
  const h = konfiguration.haustiere?.arten?.[art] ?? k.wild?.[art]; // Runde 24: Hund, Katze, Huhn · Runde 41: Reh, Hirsch, Fuchs
  return {
    id,
    typ: 'tier',
    art,
    x,
    y,
    blick: Math.random() * Math.PI * 2,
    leben: h?.leben ?? k.hasenLeben,
    maxLeben: h?.leben ?? k.hasenLeben,
    radius: h?.radius ?? 8,
    trefferRadius: Math.max(17, (h?.radius ?? 8) + 9), // Schüsse/Schläge treffen großzügiger als der Körper breit ist (Top-Down: Mausziel liegt wegen der Höhe knapp daneben)
    zustand: 'ruhend',
    // [intern]
    wanderZiel: null,
    wanderTimer: 1 + Math.random() * 3,
    pause: 0,
  };
}

export function tierZuNetzwerk(t) {
  return {
    id: t.id,
    typ: t.typ,
    art: t.art,
    x: Math.round(t.x * 100) / 100,
    y: Math.round(t.y * 100) / 100,
    blick: Math.round(t.blick * 1000) / 1000,
    leben: Math.round(t.leben * 10) / 10,
    maxLeben: t.maxLeben,
    zustand: t.zustand,
    ...(t.besitzer ? { besitzer: t.besitzer, name: t.name } : {}),
    ...(t.aktion ? { aktion: t.aktion } : {}),
  };
}

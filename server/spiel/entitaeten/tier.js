/**
 * Kleintier-Entität (bisher nur Hasen). Verhalten: systeme/tierSystem.js.
 * zustand: 'ruhend' (hoppelt gemütlich umher) | 'flucht' (ein Spieler ist zu nah)
 */
export function erzeugeTier({ id, art = 'hase', x, y, konfiguration }) {
  const k = konfiguration.tiere;
  return {
    id,
    typ: 'tier',
    art,
    x,
    y,
    blick: Math.random() * Math.PI * 2,
    leben: k.hasenLeben,
    maxLeben: k.hasenLeben,
    radius: 8,
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
  };
}

/**
 * Zombie-Entität. Verhalten (Aggro, Verfolgen, Angriff) → server/spiel/systeme/zombieSystem.js
 *
 * zustand: 'ruhend' | 'verfolgend' | 'angreifend'
 */
export function erzeugeZombie({ id, x, y, konfiguration, spawnIndex = null, blick = Math.random() * Math.PI * 2 }) {
  return {
    id,
    typ: 'zombie',
    x,
    y,
    blick,
    leben: konfiguration.zombie.leben,
    maxLeben: konfiguration.zombie.leben,
    zustand: 'ruhend',
    aktion: null, // 'angriff' während der Angriffsanimation
    aktionTick: 0,
    aktionDauer: 0,
    // [intern]
    spawnIndex,
    zielId: null,
    angriffsAbklingzeit: 0,
    pfad: null, // [{ x, y }] Wegpunkte (Kachelmitten)
    pfadTimer: 0,
    letztesZielX: 0, // wohin zuletzt gehört/gesehen
    letztesZielY: 0,
  };
}

export function zombieZuNetzwerk(z) {
  return {
    id: z.id,
    typ: z.typ,
    x: z.x,
    y: z.y,
    blick: z.blick,
    leben: z.leben,
    maxLeben: z.maxLeben,
    zustand: z.zustand,
    aktion: z.aktion,
    aktionTick: z.aktionTick,
    aktionDauer: z.aktionDauer,
  };
}

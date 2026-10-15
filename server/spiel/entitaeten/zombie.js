/**
 * Zombie-Entität. Verhalten (Aggro, Verfolgen, Angriff) → server/spiel/systeme/zombieSystem.js
 *
 * zustand: 'ruhend' | 'verfolgend' | 'angreifend'
 */
export function erzeugeZombie({ id, x, y, konfiguration }) {
  return {
    id,
    typ: 'zombie',
    x,
    y,
    blick: Math.random() * Math.PI * 2,
    leben: konfiguration.zombie.leben,
    maxLeben: konfiguration.zombie.leben,
    zustand: 'ruhend',
    // [intern]
    spawnX: x,
    spawnY: y,
    zielId: null,
    angriffsAbklingzeit: 0,
  };
}

export function zombieZuNetzwerk(z) {
  return { id: z.id, typ: z.typ, x: z.x, y: z.y, blick: z.blick, leben: z.leben, maxLeben: z.maxLeben, zustand: z.zustand };
}

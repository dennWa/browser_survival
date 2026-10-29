/**
 * Zombie-Entität. Verhalten (Aggro, Verfolgen, Angriff, Umherschlurfen) → server/spiel/systeme/zombieSystem.js
 *
 * zustand:  'ruhend' | 'verfolgend' | 'angreifend'
 * variante: 'normal' | 'laeufer' | 'brocken' | 'halb' | Runde 24: 'sprinter' | 'spucker' | 'gepanzert' | 'explosiv'
 *           (Werte aus konfiguration.zombie.varianten; `abTag` = erst ab diesem Spieltag, Verhalten → systeme/sonderZombieSystem.js)
 */
export function erzeugeZombie({ id, x, y, konfiguration, spawnIndex = null, blick = Math.random() * Math.PI * 2, variante = 'normal' }) {
  const k = konfiguration.zombie;
  // for…in statt Spread: Zonen-Konfigurationen erben per Prototyp (zonenEinstellungen/Tutorial) – Spread sähe nur eigene Felder
  const v = {};
  for (const feld in k) v[feld] = k[feld];
  Object.assign(v, k.varianten?.[variante] ?? {});
  return {
    id,
    typ: 'zombie',
    variante,
    x,
    y,
    blick,
    leben: v.leben,
    maxLeben: v.leben,
    groesse: v.groesse ?? 1,
    zustand: 'ruhend',
    aktion: null, // 'angriff' während der Angriffsanimation
    aktionTick: 0,
    aktionDauer: 0,
    // [intern] – Werte der Variante
    radius: v.radius,
    jagdGeschwindigkeit: v.jagdGeschwindigkeit,
    wanderGeschwindigkeit: v.geschwindigkeit * 0.45,
    angriffsSchaden: v.angriffsSchaden,
    angriffsAbklingzeitMax: v.angriffsAbklingzeit,
    rueckstossFaktor: v.rueckstossFaktor ?? 1,
    panzer: v.panzer ?? 0, // Anteil Schaden, den die Panzerung schluckt (gepanzert)
    // [intern] – Zustand
    spawnIndex,
    spawnX: x,
    spawnY: y,
    zielId: null,
    angriffsAbklingzeit: 0,
    pfad: null, // [{ x, y }] Wegpunkte (Kachelmitten)
    pfadTimer: 0,
    letztesZielX: 0, // wohin zuletzt gehört/gesehen
    letztesZielY: 0,
    wanderZiel: null,
    wanderTimer: 2 + Math.random() * 4,
  };
}

/**
 * Zufällige Variante nach Gewicht (konfiguration.zombie.varianten). Runde 24: `tag` = Spieltag der Zone – Varianten mit
 * `abTag` kommen erst ab diesem Tag dazu (ohne Tag nur die Grundvarianten). `extra` = {variante: Zusatzgewicht} (Horden).
 */
export function waehleZombieVariante(zufall, konfiguration, tag = 1, extra = {}) {
  const eintraege = Object.entries(konfiguration.zombie.varianten ?? { normal: { gewicht: 1 } })
    .filter(([, v]) => (v.abTag ?? 1) <= tag)
    .map(([name, v]) => ({ name, gewicht: (v.gewicht ?? 1) + (extra[name] ?? 0) }));
  return zufall.gewichteteAuswahl(eintraege).name;
}

/** Gerundet (Hundertstel-Pixel, Tausendstel-Radiant) – spart ~40 % Bytes pro Schnappschuss, sieht niemand. */
export function zombieZuNetzwerk(z) {
  return {
    id: z.id,
    typ: z.typ,
    variante: z.variante,
    groesse: z.groesse,
    x: Math.round(z.x * 100) / 100,
    y: Math.round(z.y * 100) / 100,
    blick: Math.round(z.blick * 1000) / 1000,
    leben: Math.round(z.leben * 10) / 10,
    maxLeben: z.maxLeben,
    zustand: z.zustand,
    ...(z.zuendung !== undefined ? { zuendet: 1 } : {}),
    aktion: z.aktion,
    aktionTick: z.aktionTick,
    aktionDauer: z.aktionDauer,
  };
}

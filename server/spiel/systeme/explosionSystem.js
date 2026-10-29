import { strahlGegenWaende } from '../../../gemeinsam/physik/strahl.js';
import { fuegeSchadenZu, alarmiereZombies } from './kampfSystem.js';
import { verbrauche } from './inventarSystem.js';

/**
 * Runde 24: Explosionen, Wurfwaffen und Brandflächen.
 *   explosion(welt, x, y, { radius, schaden, kachelRadius, quelle, ohneId }) – Schaden mit Abfall zum Rand (min. 40 %),
 *     zerstört Spieler-Bauwerke im `kachelRadius` (0 = keine), lockt Zombies (Knall). Ereignis 'explosion' {x,y,radius}.
 *     Genutzt von Explosiv-Zombie (sonderZombieSystem), Granate, Sprengfalle (fallenSystem).
 *   werfe(welt, spieler, slot, def) – Item mit `wurf` ('granate' | 'molotow') fliegt Richtung Blick, Weite = Mausabstand
 *     (spieler.zielAbstand, geklemmt auf def.wurfweite, vor Wänden kürzer). spielWelt.wuerfe; Ereignis 'wurf' {art,x,y,zx,zy,dauer}.
 *   Granate: landet, zündet nach def.zuender s → explosion. Molotow: zerspringt → Brandfläche (spielWelt.braende) `brandDauer` s,
 *     Schaden `brandSchaden`/s an allem darin (auch an Spielern!). Ereignisse 'molotow' {x,y}, 'brand' {x,y,radius,dauer}.
 */
const BRAND_TICK = 0.5;

/** Ohne PvP verletzen Granaten/Molotows anderer Spieler niemanden außer den Werfer selbst. */
function verschont(spielWelt, e, quelle) {
  return e.typ === 'spieler' && quelle?.typ === 'spieler' && e.id !== quelle.id && !spielWelt.konfiguration.kampf.pvp;
}

export function explosion(spielWelt, x, y, { radius = 90, schaden = 45, kachelRadius = 0, quelle = null, ohneId = null } = {}) {
  spielWelt.ereignis({ typ: 'explosion', x, y, radius });
  for (const e of [...spielWelt.alleVomTyp('spieler'), ...spielWelt.alleVomTyp('zombie'), ...spielWelt.alleVomTyp('tier')]) {
    if (e.id === ohneId || e.tot || verschont(spielWelt, e, quelle)) continue;
    const d = Math.hypot(e.x - x, e.y - y);
    if (d > radius) continue;
    // Wände schützen: keine Sichtlinie → nur halber Schaden
    const frei = strahlGegenWaende(spielWelt.welt, x, y, Math.atan2(e.y - y, e.x - x), d).laenge >= d - 4;
    fuegeSchadenZu(spielWelt, e, schaden * (1 - (d / radius) * 0.6) * (frei ? 1 : 0.5), quelle ?? { typ: 'explosion', id: -1 }, Math.atan2(e.y - y, e.x - x), { explosion: true });
  }
  if (kachelRadius > 0) {
    const welt = spielWelt.welt;
    const g = welt.kachelGroesse;
    const mx = Math.floor(x / g);
    const my = Math.floor(y / g);
    const weg = new Set();
    const r = Math.ceil(kachelRadius);
    for (let ty = my - r; ty <= my + r; ty++) {
      for (let tx = mx - r; tx <= mx + r; tx++) {
        if (Math.hypot(tx + 0.5 - x / g, ty + 0.5 - y / g) > kachelRadius + 0.5) continue;
        for (const b of welt.bauwerkeAn(tx, ty)) if (b.besitzer != null && b.typ !== 'erdfeld') weg.add(b.id);
      }
    }
    for (const id of weg) welt.entferneBauwerk(id);
  }
  if (quelle?.typ === 'spieler') alarmiereZombies(spielWelt, x, y, spielWelt.konfiguration.zombie.hoerRadius * 1.4, quelle.id);
}

/** Wurfwaffe aus der Hand werfen. @returns true, wenn geworfen */
export function werfe(spielWelt, spieler, slot, def) {
  const maxWeite = def.wurfweite ?? 300;
  const wunsch = Math.max(60, Math.min(maxWeite, spieler.zielAbstand ?? maxWeite * 0.7));
  const wand = strahlGegenWaende(spielWelt.welt, spieler.x, spieler.y, spieler.blick, wunsch).laenge;
  const weite = Math.max(20, wand - 10);
  const zx = spieler.x + Math.cos(spieler.blick) * weite;
  const zy = spieler.y + Math.sin(spieler.blick) * weite;
  const dauer = 0.35 + weite / 650;
  spielWelt.wuerfe.push({ art: def.wurf, x: zx, y: zy, rest: dauer, zuender: def.zuender ?? 0, gelandet: false, def, von: spieler.id });
  spielWelt.ereignis({ typ: 'wurf', art: def.wurf, von: spieler.id, x: spieler.x, y: spieler.y, zx, zy, dauer });
  spielWelt.setzeAktion(spieler, 'nahkampf', 0.4);
  verbrauche(spieler, slot);
  return true;
}

/** Pro Tick: Würfe fliegen/landen/zünden, Brandflächen brennen. */
export function aktualisiereWuerfe(spielWelt, dt) {
  const wuerfe = spielWelt.wuerfe;
  for (let i = wuerfe.length - 1; i >= 0; i--) {
    const w = wuerfe[i];
    w.rest -= dt;
    if (w.rest > 0) continue;
    const quelle = spielWelt.holen(w.von) ?? null;
    if (w.art === 'granate') {
      if (!w.gelandet) {
        w.gelandet = true;
        w.rest = w.zuender;
        continue;
      }
      explosion(spielWelt, w.x, w.y, { radius: w.def.sprengRadius ?? 100, schaden: w.def.sprengSchaden ?? 75, quelle });
    } else if (w.art === 'molotow') {
      const radius = w.def.brandRadius ?? 64;
      const dauer = w.def.brandDauer ?? 9;
      spielWelt.braende.push({ x: w.x, y: w.y, radius, rest: dauer, takt: 0, schaden: w.def.brandSchaden ?? 14, von: w.von });
      spielWelt.ereignis({ typ: 'molotow', x: w.x, y: w.y });
      spielWelt.ereignis({ typ: 'brand', x: w.x, y: w.y, radius, dauer });
      if (quelle) alarmiereZombies(spielWelt, w.x, w.y, 220, quelle.id);
    }
    wuerfe.splice(i, 1);
  }
  const braende = spielWelt.braende;
  for (let i = braende.length - 1; i >= 0; i--) {
    const b = braende[i];
    b.rest -= dt;
    b.takt -= dt;
    if (b.takt <= 0) {
      b.takt = BRAND_TICK;
      const quelle = spielWelt.holen(b.von) ?? { typ: 'feuer', id: -1 };
      for (const e of [...spielWelt.alleVomTyp('zombie'), ...spielWelt.alleVomTyp('spieler'), ...spielWelt.alleVomTyp('tier')]) {
        if (e.tot || e.fahrzeug || verschont(spielWelt, e, quelle) || Math.hypot(e.x - b.x, e.y - b.y) > b.radius) continue;
        fuegeSchadenZu(spielWelt, e, b.schaden * BRAND_TICK, quelle, 0, { feuer: true, rueckstoss: 0 });
      }
    }
    if (b.rest <= 0) braende.splice(i, 1);
  }
}

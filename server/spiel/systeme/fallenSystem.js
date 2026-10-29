import { fuegeSchadenZu } from './kampfSystem.js';
import { explosion } from './explosionSystem.js';

/**
 * Runde 24: Fallen für die Basis (Bauwerke aus Items, aufgestellt wie die Bärenfalle; Werte konfiguration.fallen):
 *   sprengfalle  – Zombie im `sprengAusloeser`-Radius → Explosion (keine Bauwerk-Schäden), Falle weg.
 *   stacheldraht – Zombies auf der Kachel: langsam (`drahtBremse`) + `drahtSchaden`/s; nutzt sich ab (b.rest Sekunden), dann weg.
 *   fallgrube    – Zombie tritt hinein (b.bereit): steckt `grubeFest` s fest (z.gefangen), `grubeSchaden`; danach `grubeLaden` s leer.
 *   dosenalarm   – Zombie in der Nähe: Dosen klappern (Ereignis 'dosenalarm'), Besitzer bekommt eine Meldung; `alarmPause` s Ruhe.
 * Rein zombie-seitig: Spieler lösen keine Fallen aus. Pro Tick aus bauSystem.aktualisiereBauwerke (FALLEN_TYPEN).
 */
export const FALLEN_TYPEN = new Set(['sprengfalle', 'stacheldraht', 'fallgrube', 'dosenalarm']);

/** Startwerte neuer Fallen (bauSystem.neuesBauwerk) */
export function neueFallenWerte(typ, k) {
  if (typ === 'stacheldraht') return { rest: k.drahtHaltbarkeit };
  if (typ === 'fallgrube') return { bereit: true };
  return {};
}

export function aktualisiereFalle(spielWelt, b, dt) {
  const k = spielWelt.konfiguration.fallen;
  const g = spielWelt.welt.kachelGroesse;
  const x = (b.tx + 0.5) * g;
  const y = (b.ty + 0.5) * g;
  const nah = (r) => [...spielWelt.alleVomTyp('zombie')].filter((z) => Math.hypot(z.x - x, z.y - y) <= r + z.radius * 0.5);
  const besitzer = () => [...spielWelt.alleVomTyp('spieler')].find((s) => s.name === b.besitzer && !s.tot) ?? null;
  switch (b.typ) {
    case 'sprengfalle': {
      if (!nah(k.sprengAusloeser).length) return;
      spielWelt.welt.entferneBauwerk(b.id);
      explosion(spielWelt, x, y, { radius: k.sprengRadius, schaden: k.sprengSchaden, quelle: besitzer() });
      return;
    }
    case 'stacheldraht': {
      const drin = nah(g * 0.55);
      if (!drin.length) return;
      for (const z of drin) {
        z.bremse = Math.max(z.bremse ?? 0, 0.25);
        fuegeSchadenZu(spielWelt, z, k.drahtSchaden * dt, besitzer() ?? { typ: 'falle', id: -1 }, 0, { rueckstoss: 0 });
      }
      b.rest -= dt * drin.length;
      if (b.rest <= 0) {
        spielWelt.welt.entferneBauwerk(b.id);
        spielWelt.ereignis({ typ: 'falle', gespannt: false, x, y });
      }
      return;
    }
    case 'fallgrube': {
      if (!b.bereit) {
        b.laden = (b.laden ?? k.grubeLaden) - dt;
        if (b.laden <= 0) {
          b.bereit = true;
          b.laden = undefined;
          spielWelt.welt.setzeBauwerk(b);
        }
        return;
      }
      const z = nah(12)[0];
      if (!z) return;
      b.bereit = false;
      b.laden = k.grubeLaden;
      spielWelt.welt.setzeBauwerk(b);
      Object.assign(z, { gefangen: k.grubeFest, x, y, zustand: 'ruhend' });
      spielWelt.ereignis({ typ: 'grube', x, y });
      fuegeSchadenZu(spielWelt, z, k.grubeSchaden, besitzer() ?? { typ: 'falle', id: -1 }, 0, { rueckstoss: 0 });
      return;
    }
    case 'dosenalarm': {
      b.pause = Math.max(0, (b.pause ?? 0) - dt);
      if (b.pause > 0 || !nah(g * 1.2).length) return;
      b.pause = k.alarmPause;
      spielWelt.ereignis({ typ: 'dosenalarm', x, y });
      const s = besitzer();
      if (s) spielWelt.melde(s.id, '🥫 Dosenalarm! Etwas schleicht um deine Basis.');
      return;
    }
  }
}

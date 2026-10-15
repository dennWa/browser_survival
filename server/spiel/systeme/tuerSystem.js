import { TUER_REICHWEITE } from '../../../gemeinsam/konstanten.js';

/**
 * Türen: öffnen/schließen (AKTION 'tuer') und Aufbrechen durch Zombies.
 * Der Zustand liegt in der gemeinsamen Welt (welt.geschlosseneTueren) – Kollision, Sicht und Schüsse
 * berücksichtigen ihn automatisch. Jede Änderung erhöht spielWelt.tuerenVersion → Server schickt TUEREN.
 */

export function benutzeTuer(spielWelt, spieler) {
  const welt = spielWelt.welt;
  const tuer = welt.naechsteTuer(spieler.x, spieler.y, TUER_REICHWEITE);
  if (!tuer) return;
  const offen = welt.istTuerOffen(tuer.id);
  if (offen && tuerBelegt(spielWelt, tuer)) {
    spielWelt.melde(spieler.id, 'Da steht etwas in der Tür');
    return;
  }
  setzeTuer(spielWelt, tuer, !offen);
}

/** Zombie schlägt gegen eine geschlossene Tür; bei 0 Lebenspunkten fliegt sie auf. */
export function schlageTuer(spielWelt, zombie, tuer) {
  const k = spielWelt.konfiguration.welt;
  const rest = (spielWelt.tuerLeben.get(tuer.id) ?? k.tuerLeben) - zombie.angriffsSchaden;
  spielWelt.ereignis({ typ: 'tuerSchlag', id: tuer.id, x: tuer.x, y: tuer.y });
  if (rest > 0) {
    spielWelt.tuerLeben.set(tuer.id, rest);
    return;
  }
  spielWelt.tuerLeben.delete(tuer.id);
  setzeTuer(spielWelt, tuer, true, true);
}

export function setzeTuer(spielWelt, tuer, offen, aufgebrochen = false) {
  spielWelt.welt.setzeTuer(tuer.id, offen);
  spielWelt.tuerenVersion++;
  spielWelt.ereignis({ typ: 'tuer', id: tuer.id, offen, aufgebrochen, x: tuer.x, y: tuer.y });
}

/** Steht ein Spieler oder Zombie (auch nur teilweise) in der Tür? Dann lässt sie sich nicht schließen. */
function tuerBelegt(spielWelt, tuer) {
  const g = spielWelt.welt.kachelGroesse;
  const spielerRadius = spielWelt.konfiguration.spieler.radius;
  for (const e of spielWelt.entitaeten.values()) {
    if ((e.typ !== 'spieler' && e.typ !== 'zombie') || e.tot) continue;
    const r = e.typ === 'spieler' ? spielerRadius : e.radius;
    for (const { tx, ty } of tuer.kacheln) {
      const nx = Math.max(tx * g, Math.min(e.x, (tx + 1) * g));
      const ny = Math.max(ty * g, Math.min(e.y, (ty + 1) * g));
      if (Math.hypot(e.x - nx, e.y - ny) < r) return true;
    }
  }
  return false;
}

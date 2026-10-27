import { tuerGesperrt } from './tutorialSystem.js';
import { TUER_AUTO_OEFFNEN, TUER_AUTO_SCHLIESSEN, TUER_BRUCH_OFFEN, TUER_REICHWEITE } from '../../../gemeinsam/konstanten.js';

/**
 * Türen: automatisches Öffnen/Schließen (aktualisiereTueren) und Aufbrechen durch Zombies.
 * Der Zustand liegt in der gemeinsamen Welt (welt.geschlosseneTueren) – Kollision, Sicht und Schüsse
 * berücksichtigen ihn automatisch. Jede Änderung erhöht spielWelt.tuerenVersion → Server schickt TUEREN.
 */

/**
 * Automatiktüren: Eine Tür öffnet sich, sobald ein lebender Spieler (nicht im Auto) näher als TUER_AUTO_OEFFNEN
 * kommt, und schließt sich wieder, wenn alle weiter als TUER_AUTO_SCHLIESSEN weg sind (Hysterese gegen Flackern)
 * und niemand in der Tür steht. Zombies öffnen nichts – sie müssen eine geschlossene Tür aufbrechen und
 * bleiben danach TUER_BRUCH_OFFEN Sekunden offen, damit die Horde hindurchkommt.
 */
export function aktualisiereTueren(spielWelt, dt) {
  const welt = spielWelt.welt;
  const haltOffen = spielWelt.tuerHaltOffen;
  for (const [id, rest] of haltOffen) {
    if (rest - dt <= 0) haltOffen.delete(id);
    else haltOffen.set(id, rest - dt);
  }
  const spieler = [];
  for (const e of spielWelt.entitaeten.values()) if (e.typ === 'spieler' && !e.tot && !e.fahrzeug) spieler.push(e);
  for (const tuer of welt.tueren) {
    const offen = welt.istTuerOffen(tuer.id);
    const grenze = offen ? TUER_AUTO_SCHLIESSEN : TUER_AUTO_OEFFNEN;
    const naehe = spieler.some((s) => abstandZurTuer(welt, tuer, s.x, s.y) <= grenze);
    if (tuerGesperrt(spielWelt, tuer.id)) {
      if (offen && !tuerBelegt(spielWelt, tuer)) setzeTuer(spielWelt, tuer, false); // Tutorial-Gate: zu und bleibt zu
    } else if (!offen && naehe) {
      setzeTuer(spielWelt, tuer, true);
    } else if (offen && !naehe && !haltOffen.has(tuer.id) && !tuerBelegt(spielWelt, tuer)) {
      setzeTuer(spielWelt, tuer, false);
    }
  }
}

function abstandZurTuer(welt, tuer, x, y) {
  const g = welt.kachelGroesse;
  let beste = Infinity;
  for (const { tx, ty } of tuer.kacheln) {
    const nx = Math.max(tx * g, Math.min(x, (tx + 1) * g));
    const ny = Math.max(ty * g, Math.min(y, (ty + 1) * g));
    beste = Math.min(beste, Math.hypot(x - nx, y - ny));
  }
  return beste;
}

/**
 * Bretter an die nächste geschlossene Tür nageln: +welt.tuerVerstaerkung Lebenspunkte (bis zum Vierfachen).
 * @returns true, wenn verstärkt wurde (dann wird ein Brett verbraucht)
 */
export function verstaerkeTuer(spielWelt, spieler) {
  const k = spielWelt.konfiguration.welt;
  const tuer = spielWelt.welt.naechsteTuer(spieler.x, spieler.y, TUER_REICHWEITE);
  if (!tuer) {
    spielWelt.melde(spieler.id, 'Stell dich vor eine Tür');
    return false;
  }
  const leben = spielWelt.tuerLeben.get(tuer.id) ?? k.tuerLeben;
  const maximum = k.tuerLeben * 4;
  if (leben >= maximum) {
    spielWelt.melde(spieler.id, 'Die Tür ist schon voll verstärkt');
    return false;
  }
  spielWelt.tuerLeben.set(tuer.id, Math.min(maximum, leben + k.tuerVerstaerkung));
  spielWelt.ereignis({ typ: 'tuerVerstaerkt', id: tuer.id, x: tuer.x, y: tuer.y });
  spielWelt.melde(spieler.id, `Tür verstärkt (${Math.round((Math.min(maximum, leben + k.tuerVerstaerkung) / k.tuerLeben) * 100)} %)`);
  return true;
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
  spielWelt.tuerHaltOffen.set(tuer.id, TUER_BRUCH_OFFEN);
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

import { GEGENSTAENDE, MODS } from '../konfiguration/gegenstaende.js';
import { REZEPTE } from '../konfiguration/rezepte.js';
import { naeheWerkbank } from './craftingSystem.js';
import { reparaturKostenFuer } from '../../../gemeinsam/spieler/reparatur.js';
import { entferneItems, fuegeZumInventarHinzu, legeAufBoden } from './inventarSystem.js';

/**
 * Runde 24: Waffen-Mods und Reparatur.
 *   Mods     – AKTION benutzen auf ein Mod-Item (Waffe in der Hand) oder tauschen Mod → Waffe (Ziehen im Inventar) = anbringen;
 *              AKTION modsAbnehmen { slot } legt alle Mods der Waffe zurück ins Inventar. Gespeichert als `eintrag.mods = ['magazin', …]`
 *              (wandert mit auf den Boden, in Kisten und in den Spielstand). Werte: gegenstaende.js `MODS` / `waffenWerte`.
 *   Reparatur – AKTION reparieren { slot } an einer Werkbank: volle Haltbarkeit gegen `def.reparatur` (sonst halbes Rezept, mind. 1 Holz).
 */

/** Kosten, um ein Item zu reparieren (null = nicht reparierbar). */
export function reparaturKosten(defId) {
  return reparaturKostenFuer(defId, GEGENSTAENDE, REZEPTE);
}

export function repariere(spielWelt, spieler, slot) {
  const eintrag = spieler.inventar[slot];
  const def = GEGENSTAENDE[eintrag?.defId];
  const kosten = eintrag && reparaturKosten(eintrag.defId);
  if (!kosten) return false;
  if ((eintrag.haltbarkeit ?? def.haltbarkeit) >= def.haltbarkeit) {
    spielWelt.melde(spieler.id, `${def.name} ist heil`);
    return false;
  }
  if (!naeheWerkbank(spielWelt.welt, spieler.x, spieler.y)) {
    spielWelt.melde(spieler.id, 'Reparieren geht nur an einer Werkbank');
    return false;
  }
  const fehlt = Object.entries(kosten).filter(([id, n]) => zaehle(spieler, id) < n);
  if (fehlt.length) {
    spielWelt.melde(spieler.id, `Zum Reparieren fehlt: ${fehlt.map(([id, n]) => `${n - zaehle(spieler, id)}× ${GEGENSTAENDE[id]?.name ?? id}`).join(', ')}`);
    return false;
  }
  for (const [id, n] of Object.entries(kosten)) entferneItems(spieler, id, n);
  delete eintrag.haltbarkeit; // fehlt = voll
  spielWelt.ereignis({ typ: 'repariert', von: spieler.id, x: spieler.x, y: spieler.y });
  spielWelt.melde(spieler.id, `🔧 ${def.name} repariert`);
  return true;
}

/** Passt der Mod (Item-Eintrag) an die Waffe (Item-Eintrag)? → Mod-Name oder null */
export function passenderMod(modEintrag, waffenEintrag) {
  const mod = GEGENSTAENDE[modEintrag?.defId]?.mod;
  const waffe = GEGENSTAENDE[waffenEintrag?.defId];
  if (!mod || !waffe?.mods?.includes(mod) || waffenEintrag.mods?.includes(mod)) return null;
  return mod;
}

/** Mod aus Platz `modSlot` an die Waffe in Platz `waffenSlot` bauen. @returns true bei Erfolg */
export function bringeModAn(spielWelt, spieler, modSlot, waffenSlot) {
  const modEintrag = spieler.inventar[modSlot];
  const waffe = waffenSlot === null || waffenSlot === undefined ? null : spieler.inventar[waffenSlot];
  const modDef = GEGENSTAENDE[modEintrag?.defId];
  if (modDef?.kategorie !== 'mod') return false;
  if (!waffe || GEGENSTAENDE[waffe.defId]?.kategorie !== 'fernkampf') {
    spielWelt.melde(spieler.id, `${modDef.name}: erst die Waffe in die Hand nehmen (oder den Aufsatz auf sie ziehen)`);
    return false;
  }
  if (waffe.mods?.includes(modDef.mod)) {
    spielWelt.melde(spieler.id, `${GEGENSTAENDE[waffe.defId].name} hat schon ein${modDef.mod === 'magazin' ? ' erweitertes Magazin' : 'en Aufsatz dieser Art'}`);
    return false;
  }
  if (!passenderMod(modEintrag, waffe)) {
    spielWelt.melde(spieler.id, `${modDef.name} passt nicht an ${GEGENSTAENDE[waffe.defId].name}`);
    return false;
  }
  waffe.mods = [...(waffe.mods ?? []), modDef.mod];
  spieler.inventar[modSlot] = null;
  spielWelt.ereignis({ typ: 'modAngebracht', von: spieler.id, x: spieler.x, y: spieler.y });
  spielWelt.melde(spieler.id, `🔧 ${modDef.name} an ${GEGENSTAENDE[waffe.defId].name} angebracht`);
  return true;
}

/** Alle Mods der Waffe in Platz `slot` abnehmen (ins Inventar, sonst auf den Boden). Magazin wird auf die neue Größe gekürzt. */
export function nimmModsAb(spielWelt, spieler, slot) {
  const waffe = spieler.inventar[slot];
  if (!waffe?.mods?.length) return false;
  const mods = waffe.mods;
  delete waffe.mods;
  const def = GEGENSTAENDE[waffe.defId];
  if (Number.isInteger(waffe.magazin) && waffe.magazin > def.magazin) {
    const zuviel = waffe.magazin - def.magazin;
    waffe.magazin = def.magazin;
    if (def.munition) {
      const rest = fuegeZumInventarHinzu(spieler, def.munition, zuviel);
      if (rest > 0) legeAufBoden(spielWelt, { defId: def.munition, menge: rest }, spieler.x, spieler.y);
    }
  }
  for (const mod of mods) {
    const item = MODS[mod]?.item;
    if (!item) continue;
    if (fuegeZumInventarHinzu(spieler, item, 1) > 0) legeAufBoden(spielWelt, { defId: item, menge: 1 }, spieler.x, spieler.y);
  }
  spielWelt.melde(spieler.id, `Aufsätze von ${def.name} abgenommen`);
  return true;
}

/** Nur gültige Mods eines gespeicherten Eintrags behalten (Spielstand/Kiste). */
export function pruefeMods(defId, mods) {
  const erlaubt = GEGENSTAENDE[defId]?.mods ?? [];
  if (!Array.isArray(mods)) return undefined;
  const ok = [...new Set(mods.filter((m) => typeof m === 'string' && erlaubt.includes(m)))];
  return ok.length ? ok : undefined;
}

function zaehle(spieler, defId) {
  return spieler.inventar.reduce((s, e) => s + (e?.defId === defId ? e.menge : 0), 0);
}

import { GEGENSTAENDE } from '../konfiguration/gegenstaende.js';
import { LOOT_TABELLEN } from '../konfiguration/lootTabellen.js';
import { erzeugeGegenstand } from '../entitaeten/gegenstand.js';

/**
 * Verteilt beim Serverstart Gegenstände auf die Loot-Punkte der Karte.
 * Phase 2: Aufsammeln, Respawn-Timer, Begrenzung pro Raum.
 */
export function verteileStartLoot(spielWelt) {
  const { zufall, konfiguration } = spielWelt;
  for (const punkt of spielWelt.karte.lootPunkte) {
    if (zufall.zahl() >= konfiguration.loot.spawnChance) continue;
    const tabelle = LOOT_TABELLEN[punkt.lootTabelle];
    if (!tabelle) throw new Error(`Unbekannte Loot-Tabelle: "${punkt.lootTabelle}"`);
    const { id: defId } = zufall.gewichteteAuswahl(tabelle);
    const spanne = GEGENSTAENDE[defId].mengeBeimFund;
    const menge = spanne ? zufall.ganzzahl(spanne[0], spanne[1]) : 1;
    spielWelt.hinzufuegen(erzeugeGegenstand({ id: spielWelt.neueId(), defId, x: punkt.x, y: punkt.y, menge }));
  }
}

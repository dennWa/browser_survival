import { GEGENSTAENDE } from '../konfiguration/gegenstaende.js';
import { LOOT_TABELLEN } from '../konfiguration/lootTabellen.js';
import { erzeugeGegenstand } from '../entitaeten/gegenstand.js';

/**
 * Loot: Startverteilung auf die Loot-Punkte der Karte, Nachschub an geplünderten Punkten,
 * Beute von getöteten Zombies.
 */
const RESPAWN_SPERRABSTAND = 260; // nicht vor den Augen eines Spielers nachlegen

export function verteileStartLoot(spielWelt) {
  spielWelt.lootZustand = spielWelt.karte.lootPunkte.map(() => ({ gegenstandId: null, rest: 0 }));
  spielWelt.karte.lootPunkte.forEach((punkt, i) => wuerfleLoot(spielWelt, punkt, i));
}

export function aktualisiereLoot(spielWelt, dt) {
  // Liegengelassenes Inventar von Toten verschwindet nach loot.todesVerfall Sekunden
  for (const g of [...spielWelt.alleVomTyp('gegenstand')]) {
    if (g.verfallRest === undefined) continue;
    g.verfallRest -= dt;
    if (g.verfallRest <= 0) spielWelt.entfernen(g.id);
  }
  const standardRespawn = spielWelt.konfiguration.loot.respawnZeit;
  spielWelt.karte.lootPunkte.forEach((punkt, i) => {
    const zustand = spielWelt.lootZustand[i];
    const respawnZeit = punkt.respawnZeit ?? standardRespawn; // je Raum einstellbar (Map-Editor)
    if (zustand.gegenstandId !== null) {
      if (spielWelt.holen(zustand.gegenstandId)) return; // liegt noch da
      zustand.gegenstandId = null; // wurde aufgehoben → Timer starten
      zustand.rest = respawnZeit;
      return;
    }
    zustand.rest -= dt;
    if (zustand.rest > 0) return;
    const spielerNah = [...spielWelt.alleVomTyp('spieler')].some(
      (s) => Math.hypot(s.x - punkt.x, s.y - punkt.y) < RESPAWN_SPERRABSTAND,
    );
    if (spielerNah) {
      zustand.rest = 10;
      return;
    }
    if (!wuerfleLoot(spielWelt, punkt, i)) zustand.rest = respawnZeit;
  });
}

/** Getötete Zombies lassen manchmal etwas fallen (Tabelle "zombie"). */
export function lasseZombieLootFallen(spielWelt, x, y) {
  if (spielWelt.zufall.zahl() >= spielWelt.konfiguration.zombie.lootChance) return;
  erzeugeAusTabelle(spielWelt, 'zombie', x, y);
}

/**
 * Boss-Beute: eine Waffe aus der Tabelle "boss" – Schusswaffen kommen geladen und mit Munition (eigener Stapel daneben).
 */
export function lasseBossLootFallen(spielWelt, x, y) {
  const { zufall } = spielWelt;
  const { id: defId } = zufall.gewichteteAuswahl(LOOT_TABELLEN.boss);
  const def = GEGENSTAENDE[defId];
  const waffe = erzeugeGegenstand({ id: spielWelt.neueId(), defId, x, y, menge: 1, magazin: def.kategorie === 'fernkampf' ? def.magazin : undefined });
  spielWelt.hinzufuegen(waffe);
  if (def.kategorie === 'fernkampf') {
    const munition = GEGENSTAENDE[def.munition];
    const menge = zufall.ganzzahl(munition.mengeBeimFund[0] * 2, munition.mengeBeimFund[1] * 2);
    spielWelt.hinzufuegen(erzeugeGegenstand({ id: spielWelt.neueId(), defId: def.munition, x: x + 14, y: y + 6, menge }));
  }
  spielWelt.ereignis({ typ: 'bossBeute', x, y });
}

/** @returns true, wenn ein Gegenstand erzeugt wurde */
function wuerfleLoot(spielWelt, punkt, index) {
  if (spielWelt.zufall.zahl() >= (punkt.spawnChance ?? spielWelt.konfiguration.loot.spawnChance)) return false;
  const gegenstand = erzeugeAusTabelle(spielWelt, punkt.lootTabelle, punkt.x, punkt.y);
  spielWelt.lootZustand[index].gegenstandId = gegenstand.id;
  return true;
}

function erzeugeAusTabelle(spielWelt, tabellenName, x, y) {
  const { zufall } = spielWelt;
  const tabelle = LOOT_TABELLEN[tabellenName];
  if (!tabelle) throw new Error(`Unbekannte Loot-Tabelle: "${tabellenName}"`);
  const { id: defId } = zufall.gewichteteAuswahl(tabelle);
  const def = GEGENSTAENDE[defId];
  const spanne = def.mengeBeimFund;
  const menge = spanne ? zufall.ganzzahl(spanne[0], spanne[1]) : 1;
  // Gefundene Schusswaffen sind teilweise geladen
  const magazin = def.kategorie === 'fernkampf' ? zufall.ganzzahl(0, Math.ceil(def.magazin / 2)) : undefined;
  return spielWelt.hinzufuegen(erzeugeGegenstand({ id: spielWelt.neueId(), defId, x, y, menge, magazin }));
}

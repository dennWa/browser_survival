import { GEGENSTAENDE } from '../konfiguration/gegenstaende.js';

/**
 * Gegenstand, der in der Welt liegt (Loot). Im Inventar wird nur { defId, menge, magazin?, haltbarkeit?, mods? } gespeichert.
 * magazin: Patronen in einer abgelegten/gefundenen Schusswaffe.
 */
export function erzeugeGegenstand({ id, defId, x, y, menge = 1, magazin, verfall = null, haltbarkeit, mods }) {
  if (!GEGENSTAENDE[defId]) throw new Error(`Unbekannter Gegenstand: "${defId}"`);
  const g = { id, typ: 'gegenstand', defId, x, y, menge };
  if (magazin !== undefined) g.magazin = magazin;
  if (Number.isFinite(haltbarkeit)) g.haltbarkeit = haltbarkeit; // Runde 24: abgenutzte Waffe bleibt abgenutzt
  if (mods?.length) g.mods = [...mods]; // Runde 24: Aufsätze wandern mit
  if (verfall !== null) g.verfallRest = verfall; // Sekunden, bis er verschwindet (z. B. Inventar eines Toten)
  return g;
}

export function gegenstandZuNetzwerk(g) {
  const def = GEGENSTAENDE[g.defId];
  return { id: g.id, defId: g.defId, name: def.name, kategorie: def.kategorie, x: g.x, y: g.y, menge: g.menge };
}

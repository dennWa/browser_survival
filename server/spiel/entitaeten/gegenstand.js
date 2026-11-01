import { GEGENSTAENDE } from '../konfiguration/gegenstaende.js';

/**
 * Gegenstand, der in der Welt liegt (Loot). Im Inventar wird nur { defId, menge, magazin?, haltbarkeit?, mods? } gespeichert.
 * magazin: Patronen in einer abgelegten/gefundenen Schusswaffe.
 * hoehe: Ablagehöhe in Weltpixeln (Studio-Spawnpunkt auf einem Möbel) – nur Optik, der Client hebt das Modell an.
 */
export function erzeugeGegenstand({ id, defId, x, y, menge = 1, magazin, verfall = null, haltbarkeit, mods, hoehe }) {
  if (!GEGENSTAENDE[defId]) throw new Error(`Unbekannter Gegenstand: "${defId}"`);
  const g = { id, typ: 'gegenstand', defId, x, y, menge };
  if (magazin !== undefined) g.magazin = magazin;
  if (Number.isFinite(haltbarkeit)) g.haltbarkeit = haltbarkeit; // Runde 24: abgenutzte Waffe bleibt abgenutzt
  if (mods?.length) g.mods = [...mods]; // Runde 24: Aufsätze wandern mit
  if (hoehe > 0) g.hoehe = hoehe;
  if (verfall !== null) g.verfallRest = verfall; // Sekunden, bis er verschwindet (z. B. Inventar eines Toten)
  return g;
}

export function gegenstandZuNetzwerk(g) {
  const def = GEGENSTAENDE[g.defId];
  const n = { id: g.id, defId: g.defId, name: def.name, kategorie: def.kategorie, x: g.x, y: g.y, menge: g.menge };
  if (g.hoehe > 0) n.hoehe = g.hoehe;
  return n;
}

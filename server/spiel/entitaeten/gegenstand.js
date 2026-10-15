import { GEGENSTAENDE } from '../konfiguration/gegenstaende.js';

/**
 * Gegenstand, der in der Welt liegt (Loot). Im Inventar wird später nur { defId, menge } gespeichert.
 */
export function erzeugeGegenstand({ id, defId, x, y, menge = 1 }) {
  if (!GEGENSTAENDE[defId]) throw new Error(`Unbekannter Gegenstand: "${defId}"`);
  return { id, typ: 'gegenstand', defId, x, y, menge };
}

export function gegenstandZuNetzwerk(g) {
  const def = GEGENSTAENDE[g.defId];
  return { id: g.id, defId: g.defId, name: def.name, kategorie: def.kategorie, x: g.x, y: g.y, menge: g.menge };
}

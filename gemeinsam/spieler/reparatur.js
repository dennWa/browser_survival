/**
 * Runde 24: Reparaturkosten eines Items (Server: waffenSystem.repariere, Client: Werkbank-Reiter „Reparieren“).
 * Nur Items mit `haltbarkeit`. Eigene Kosten (`def.reparatur`) gehen vor, sonst halbes Rezept (aufgerundet), ohne Rezept 1 Holz.
 * @param defs  Item-Definitionen (GEGENSTAENDE bzw. itemDefinitionen)  @param rezepte  REZEPTE
 */
export function reparaturKostenFuer(defId, defs, rezepte) {
  const def = defs?.[defId];
  if (!def?.haltbarkeit) return null;
  if (def.reparatur) return def.reparatur;
  const rezept = Object.values(rezepte ?? {}).find((r) => r.ergebnis === defId);
  if (!rezept) return { holz: 1 };
  return Object.fromEntries(Object.entries(rezept.zutaten).map(([id, n]) => [id, Math.max(1, Math.ceil(n / 2))]));
}

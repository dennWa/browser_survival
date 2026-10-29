import { WERKBANK_REICHWEITE } from '../konstanten.js';

/**
 * Runde 24 (P12/P13): Handwerks-Orte für Rezepte (server/spiel/konfiguration/rezepte.js → `ort`) – Server UND Client.
 *   ort fehlt = 'werkbank' · 'inventar' = überall · 'amboss' | 'webstuhl' | 'chemie' = gebaute Station (Bau-Menü „Handwerk“)
 *   'feuer' = Kochstelle: brennendes Lagerfeuer oder brennender Kamin in Reichweite.
 * Der Client zeigt an einer Station nur deren Rezepte (Werkbank zusätzlich die Inventar-Rezepte).
 */
export const HANDWERK_ORTE = Object.freeze({
  werkbank: { name: 'Werkbank', symbol: '🔨', objekt: 'werkbank', bauwerke: ['werkbank'], reparieren: true },
  amboss: { name: 'Amboss', symbol: '⚒', bauwerke: ['amboss'], reparieren: true },
  webstuhl: { name: 'Webstuhl', symbol: '🧵', bauwerke: ['webstuhl'] },
  chemie: { name: 'Chemie-Tisch', symbol: '⚗', bauwerke: ['chemietisch'] },
  feuer: { name: 'Kochstelle', symbol: '🍲', bauwerke: ['lagerfeuer', 'kamin'], brennt: true, hinweis: 'ein brennendes Lagerfeuer oder einen Kamin' },
});

export const ortVon = (rezept) => rezept.ort ?? 'werkbank';

/** Ist man an (x, y) nah genug am Handwerks-Ort `ort`? */
export function naheHandwerk(welt, x, y, ort) {
  if (ort === 'inventar') return true;
  const def = HANDWERK_ORTE[ort];
  if (!def) return false;
  if (def.objekt && welt.naechstesObjekt(x, y, WERKBANK_REICHWEITE, (o) => o.typ === def.objekt) !== null) return true;
  return welt.naechstesBauwerk(x, y, WERKBANK_REICHWEITE + 8, (b) => def.bauwerke.includes(b.typ) && (!def.brennt || b.brennt === true)) !== null;
}

/** Rezepte, die an diesem Ort angezeigt werden ({ name: rezept }). */
export function rezepteFuerOrt(rezepte, ort) {
  return Object.fromEntries(Object.entries(rezepte ?? {}).filter(([, r]) => ortVon(r) === ort || (ort === 'werkbank' && r.ort === 'inventar')));
}

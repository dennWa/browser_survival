/**
 * Ebenen des Editors (Editor 2.0, Schritt 1.4) – umgebungsfrei, getestet in tests/editorBearbeiten.test.js.
 * Jede Kartenänderung (Operation { s, … }) gehört zu einer Ebene. Eine Ebene ist
 *   sichtbar   – wird gezeichnet und ist anklickbar
 *   gesperrt   – wird ausgegraut gezeichnet, ist nicht anklickbar und Änderungen an ihr werden ausgelassen
 * Dazu reine Anzeigen (Raster, Innen/Außen, steile Hänge, Nachbarzonen) – nur sichtbar/unsichtbar.
 * Zonen-Werte, Räume (Name/Tabelle), eigene Typen und Texturen gehören zu keiner Ebene (immer änderbar).
 */
export const EBENEN = Object.freeze([
  { id: 'boden', name: 'Boden (Kacheln)', symbol: '▦' },
  { id: 'bemalung', name: 'Bemalung', symbol: '🎨' },
  { id: 'terrain', name: 'Gelände-Höhen', symbol: '⛰' },
  { id: 'bereiche', name: 'Räume & Bereiche', symbol: '▭' },
  { id: 'objekte', name: 'Objekte', symbol: '🪑' },
  { id: 'bauwerke', name: 'Bauwerke', symbol: '🧱' },
  { id: 'marker', name: 'Spawns, Loot & Ankünfte', symbol: '📍' },
  { id: 'uebergaenge', name: 'Übergänge', symbol: '🚪' },
  { id: 'klaenge', name: 'Klänge', symbol: '🔊' },
]);

export const ANZEIGEN = Object.freeze([
  { id: 'raster', name: 'Raster', standard: true },
  { id: 'innen', name: 'Innen/Außen (blau = innen, wie im Spiel)', standard: false },
  { id: 'steil', name: 'Steile Hänge (rot schraffiert)', standard: true },
  { id: 'nachbarn', name: 'Nachbarzonen am Rand', standard: true },
  { id: 'loot', name: 'Loot anzeigen (Punkte & Loot-Zonen)', kurz: 'Loot', symbol: '🎁', kuerzel: ['O'], standard: true },
  { id: 'hilfslinien', name: 'Hilfslinien (aus dem Lineal ziehen)', kurz: 'Hilfsl.', symbol: '┼', kuerzel: ['Umschalt+H'], standard: true },
  { id: 'lootDichte', name: 'Loot-Dichte (Heatmap)', kurz: 'Dichte', symbol: '🔥', kuerzel: ['Umschalt+O'], standard: false },
]);

const SAMMLUNG_EBENE = {
  kachel: 'boden',
  bemalung: 'bemalung',
  hoehe: 'terrain',
  objekte: 'objekte',
  bauwerke: 'bauwerke',
  marker: 'marker',
  ankuenfte: 'marker',
  raumFlaechen: 'bereiche',
  tierBereiche: 'bereiche',
  uebergaenge: 'uebergaenge',
  klaenge: 'klaenge',
  lootZonen: 'marker',
};

/** Ebene einer Sammlung bzw. Operationsart ('kachel', 'objekte' …) oder null */
export function ebeneVon(s) {
  return SAMMLUNG_EBENE[s] ?? null;
}

export function standardEbenen() {
  const e = {};
  for (const { id } of EBENEN) e[id] = { sichtbar: true, gesperrt: false };
  for (const { id, standard } of ANZEIGEN) e[id] = { sichtbar: standard };
  return e;
}

/** Gespeicherte Ebenen-Einstellung zusammenführen (unbekannte Schlüssel weg, fehlende = Standard) */
export function ebenenAus(gespeichert) {
  const e = standardEbenen();
  if (gespeichert && typeof gespeichert === 'object')
    for (const id of Object.keys(e)) {
      const g = gespeichert[id];
      if (!g || typeof g !== 'object') continue;
      if (typeof g.sichtbar === 'boolean') e[id].sichtbar = g.sichtbar;
      if ('gesperrt' in e[id] && typeof g.gesperrt === 'boolean') e[id].gesperrt = g.gesperrt;
    }
  return e;
}

/** Ist die Ebene bearbeitbar (sichtbar und nicht gesperrt)? null-Ebene = immer */
export function ebeneFrei(ebenen, id) {
  if (!id) return true;
  const e = ebenen[id];
  return !e || (e.sichtbar && !e.gesperrt);
}

/**
 * Operationen an gesperrten/ausgeblendeten Ebenen herausnehmen.
 * @returns { ops, ausgelassen: { ebenenId: anzahl } }
 */
export function filtereGesperrt(ebenen, ops) {
  const ausgelassen = {};
  const frei = ops.filter((op) => {
    const id = ebeneVon(op.s);
    if (ebeneFrei(ebenen, id)) return true;
    ausgelassen[id] = (ausgelassen[id] ?? 0) + 1;
    return false;
  });
  return { ops: frei, ausgelassen };
}

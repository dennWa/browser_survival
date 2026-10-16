/**
 * Kacheltypen (Tiles) der Karten. Jedes Zeichen in einer Kartendatei steht für eine Kachel.
 * Neue Bodenarten/Wände hier eintragen – Darstellung in client/darstellung/weltZeichner.js
 * (Textur aus dem Asset-Atlas oder Ersatzfarbe in farben.js).
 * innen: true = Innenraumboden (Türen übernehmen diesen Boden).
 */
export const KACHELN = Object.freeze({
  ',': { name: 'gras', blockiert: false },
  '_': { name: 'asphalt', blockiert: false },
  '=': { name: 'strasse', blockiert: false },
  '-': { name: 'gehweg', blockiert: false },
  '.': { name: 'fliesen', blockiert: false, innen: true },
  ':': { name: 'beton', blockiert: false, innen: true },
  '+': { name: 'holz', blockiert: false, innen: true },
  'T': { name: 'tuer', blockiert: false },
  '#': { name: 'wand', blockiert: true },
  'F': { name: 'fenster', blockiert: true },
  '~': { name: 'wasser', blockiert: true, sichtFrei: true, wasser: true }, // See: nicht begehbar, aber Sicht & Schüsse gehen drüber; hier wird geangelt
});

/**
 * Marker-Zeichen in Kartendateien. Sie werden beim Laden durch den Untergrund ersetzt
 * und als Spawnpunkte gespeichert.
 *   S       = Spieler-Startpunkt
 *   Z       = Zombie-Spawn
 *   a … z   = Loot-Punkt, gehört zum Raum mit diesem Buchstaben (siehe Kartendatei)
 */
export const MARKER = Object.freeze({
  SPIELER_START: 'S',
  ZOMBIE: 'Z',
});

export function istLootMarker(zeichen) {
  return zeichen >= 'a' && zeichen <= 'z';
}

export function istKachel(zeichen) {
  return Object.hasOwn(KACHELN, zeichen);
}

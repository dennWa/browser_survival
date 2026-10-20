import { KACHELN } from '../../gemeinsam/welt/kacheln.js';
import { pruefeLootZone, punkteDerZone, kandidaten } from '../../server/spiel/karten/lootZonen.js';
import { steileKacheln } from './terrain.js';

/**
 * Loot-Zonen im Editor (Schritt 6.2) – umgebungsfrei. Dieselbe Verteilregel wie der Spiel-Lader (server/spiel/karten/lootZonen.js):
 * freie Kachel = begehbar, kein Wasser, kein blockierendes Möbel (außer Kronen), kein Klippenfuß; innen laut Kachel.
 * Die Zonen-Nummer (fester Zufall) = Position in der Sammlung (= Reihenfolge im Export).
 */
export function kachelPruefer(karte) {
  const steil = new Set(steileKacheln(karte).map(([x, y]) => `${x},${y}`));
  const objekte = [...karte.s('objekte').values()].filter((o) => o.blockiert && o.ebene !== 'oben');
  return (x, y) => {
    const k = KACHELN[karte.kachelAn(x, y)];
    const belegt = steil.has(`${x},${y}`) || objekte.some((o) => x + 0.5 > o.x && x + 0.5 < o.x + o.b && y + 0.5 > o.y && y + 0.5 < o.y + o.h);
    return { frei: !!k && !k.blockiert && !k.wasser && !belegt, innen: !!k?.innen };
  };
}

/** Vorschau einer Zone: { zone (geprüft), punkte: [[x, y]], frei (Anzahl möglicher Kacheln), fehler } */
export function lootVorschau(karte, id, kachel = kachelPruefer(karte)) {
  const roh = karte.s('lootZonen').get(id);
  const nr = [...karte.s('lootZonen').keys()].indexOf(id);
  const { zone, fehler } = pruefeLootZone(roh, { breite: karte.breite, hoehe: karte.hoehe });
  if (!zone) return { zone: null, punkte: [], frei: 0, fehler };
  return { zone, punkte: punkteDerZone(zone, kachel, nr), frei: kandidaten(zone, kachel, nr).length, fehler };
}

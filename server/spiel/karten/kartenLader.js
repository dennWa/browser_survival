import { KACHEL_GROESSE } from '../../../gemeinsam/konstanten.js';
import { KACHELN, MARKER, istKachel, istLootMarker } from '../../../gemeinsam/welt/kacheln.js';
import { KRANKENHAUS } from './krankenhaus.js';

/** Registrierte Karten. Neue Karte: Datei in diesem Ordner anlegen und hier eintragen. */
export const KARTEN = Object.freeze({
  krankenhaus: KRANKENHAUS,
});

/**
 * Wandelt eine Kartendefinition (ASCII) in nutzbare Daten um.
 * @returns {{ daten, spielerStarts, zombieSpawns, lootPunkte }}
 *   daten        → geht an Client und Welt (nur Kacheln + Raumnamen, keine Spawns/Loot-Infos)
 *   spielerStarts/zombieSpawns/lootPunkte → bleiben auf dem Server (Pixelkoordinaten, Kachelmitte)
 */
export function ladeKarte(id) {
  const definition = KARTEN[id];
  if (!definition) throw new Error(`Unbekannte Karte: "${id}"`);
  return verarbeiteKarte(definition);
}

export function verarbeiteKarte(definition, kachelGroesse = KACHEL_GROESSE) {
  const roh = definition.kacheln;
  const hoehe = roh.length;
  const breite = roh[0]?.length ?? 0;
  if (hoehe === 0 || breite === 0) throw new Error(`Karte "${definition.id}" ist leer`);

  roh.forEach((zeile, y) => {
    if (zeile.length !== breite) {
      throw new Error(`Karte "${definition.id}", Zeile ${y}: Länge ${zeile.length} statt ${breite}`);
    }
  });

  const mitte = (t) => t * kachelGroesse + kachelGroesse / 2;
  const spielerStarts = [];
  const zombieSpawns = [];
  const lootPunkte = [];
  const raumMarker = new Map(); // Raumbuchstabe → [{x, y}]

  const kacheln = roh.map((zeile, y) => {
    let neueZeile = '';
    for (let x = 0; x < breite; x++) {
      const zeichen = zeile[x];
      if (istKachel(zeichen)) {
        neueZeile += zeichen;
        continue;
      }
      if (zeichen === MARKER.SPIELER_START) {
        spielerStarts.push({ x: mitte(x), y: mitte(y) });
      } else if (zeichen === MARKER.ZOMBIE) {
        zombieSpawns.push({ x: mitte(x), y: mitte(y) });
      } else if (istLootMarker(zeichen)) {
        const raum = definition.raeume?.[zeichen];
        if (!raum) throw new Error(`Karte "${definition.id}": Loot-Marker "${zeichen}" (${x}|${y}) ohne Raumdefinition`);
        lootPunkte.push({ x: mitte(x), y: mitte(y), raum: zeichen, lootTabelle: raum.lootTabelle });
        if (!raumMarker.has(zeichen)) raumMarker.set(zeichen, []);
        raumMarker.get(zeichen).push({ x: mitte(x), y: mitte(y) });
      } else {
        throw new Error(`Karte "${definition.id}": unbekanntes Zeichen "${zeichen}" bei ${x}|${y}`);
      }
      neueZeile += ermittleUntergrund(roh, x, y);
    }
    return neueZeile;
  });

  if (spielerStarts.length === 0) throw new Error(`Karte "${definition.id}" hat keinen Spieler-Start (S)`);

  // Raum-Beschriftung: Mittelpunkt aller Loot-Punkte eines Raums
  const raeume = [...raumMarker.entries()].map(([id, punkte]) => ({
    id,
    name: definition.raeume[id].name,
    x: punkte.reduce((s, p) => s + p.x, 0) / punkte.length,
    y: punkte.reduce((s, p) => s + p.y, 0) / punkte.length,
  }));

  const objekte = (definition.objekte ?? []).map((o, i) => {
    if (!o.typ || ![o.x, o.y, o.b, o.h].every(Number.isFinite)) {
      throw new Error(`Karte "${definition.id}": Objekt #${i} unvollständig (typ, x, y, b, h nötig)`);
    }
    const objekt = { typ: o.typ, x: o.x, y: o.y, b: o.b, h: o.h, blockiert: !!o.blockiert, ebene: o.ebene ?? 'moebel', drehung: o.drehung ?? 0 };
    // Lampen: Radius (Kacheln), Farbe, Stärke 0..1, Flackern
    if (o.typ === 'licht') Object.assign(objekt, { ebene: 'licht', radius: o.radius ?? 4, farbe: o.farbe ?? '#ffd9a0', staerke: o.staerke ?? 0.85, flackern: !!o.flackern });
    return objekt;
  });

  return {
    daten: { id: definition.id, name: definition.name, breite, hoehe, kachelGroesse, kacheln, raeume, objekte },
    spielerStarts,
    zombieSpawns,
    lootPunkte,
  };
}

/**
 * Unter einem Marker liegt die Kachel des ersten begehbaren Nachbarn (links, rechts, oben, unten) –
 * nie eine Wand, sonst stünde der Spawn in der Mauer.
 */
function ermittleUntergrund(zeilen, x, y) {
  const nachbarn = [zeilen[y][x - 1], zeilen[y][x + 1], zeilen[y - 1]?.[x], zeilen[y + 1]?.[x]];
  return nachbarn.find((z) => z !== undefined && istKachel(z) && !KACHELN[z].blockiert) ?? '.';
}

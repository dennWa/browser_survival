import { KACHEL_GROESSE } from '../../../gemeinsam/konstanten.js';
import { KACHELN, MARKER, istKachel, istLootMarker } from '../../../gemeinsam/welt/kacheln.js';
import { STADTRAND } from './stadtrand.js';
import { WALDWEG } from './waldweg.js';

/**
 * Registrierte Karten (= Zonen der offenen Welt). Neue Karte: Datei in diesem Ordner anlegen (von Hand, per
 * Generator in werkzeuge/karten/ oder aus Tiled: `npm run karte:import -- datei.tmj`) und hier eintragen.
 * Zonen sind über `uebergaenge` (Kachel-Rechteck am Rand → Zielzone + Ankunftspunkt) verbunden.
 */
export const KARTEN = Object.freeze({
  stadtrand: STADTRAND,
  waldweg: WALDWEG,
});

/**
 * Wandelt eine Kartendefinition (ASCII) in nutzbare Daten um.
 * @returns {{ daten, spielerStarts, zombieSpawns, lootPunkte, ankuenfte }}
 *   daten        → geht an Client und Welt (Kacheln, Raumnamen, Objekte, Übergänge – keine Spawns/Loot-Infos)
 *   spielerStarts/zombieSpawns/lootPunkte → bleiben auf dem Server (Pixelkoordinaten, Kachelmitte)
 *   ankuenfte    → { name: {x, y} } (Pixel, Kachelmitte): wo man ankommt, wenn man aus einer anderen Zone kommt
 *
 * Übergänge (definition.uebergaenge): [{ x, y, b, h, ziel, ankunft, name }] in Kacheln – wer das Rechteck betritt,
 * wechselt in Zone `ziel` und landet dort bei `ankuenfte[ankunft]`. In daten.uebergaenge zusätzlich in Pixeln (px).
 */
export function ladeKarte(id) {
  const definition = KARTEN[id];
  if (!definition) throw new Error(`Unbekannte Karte: "${id}"`);
  // Die großen Karten sind zu dicht bewaldet: beim Laden wird ein Teil der Bäume weggelassen (Testkarten nicht)
  return verarbeiteKarte(definition, KACHEL_GROESSE, { ausduennen: true });
}

export function verarbeiteKarte(definition, kachelGroesse = KACHEL_GROESSE, { ausduennen = false } = {}) {
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

  const objekte = (definition.objekte ?? []).filter((o) => !(ausduennen && (o.typ === 'baum' || o.typ === 'baum_herbst') && streuwert(o.x, o.y, 1) < BAUM_AUSDUENNUNG)).map((o, i) => {
    if (!o.typ || ![o.x, o.y, o.b, o.h].every(Number.isFinite)) {
      throw new Error(`Karte "${definition.id}": Objekt #${i} unvollständig (typ, x, y, b, h nötig)`);
    }
    const objekt = { typ: o.typ, x: o.x, y: o.y, b: o.b, h: o.h, blockiert: !!o.blockiert, ebene: o.ebene ?? 'moebel', drehung: o.drehung ?? 0 };
    // Bäume & Steine: klein (1 Holz/Stein) oder groß (2) – feste Zufallsverteilung nach Position, kein Eintrag in der Karte nötig
    if (GROESSEN_TYPEN.includes(o.typ)) objekt.groesse = streuwert(o.x, o.y, 2) < ANTEIL_GROSS ? 'gross' : 'klein';
    // Lampen: Radius (Kacheln), Farbe, Stärke 0..1, Flackern
    if (o.typ === 'licht') Object.assign(objekt, { ebene: 'licht', radius: o.radius ?? 4, farbe: o.farbe ?? '#ffd9a0', staerke: o.staerke ?? 0.85, flackern: !!o.flackern, mast: !!o.mast });
    return objekt;
  });

  const imFeld = (x, y) => Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < breite && y < hoehe;
  const ankuenfte = {};
  for (const [name, p] of Object.entries(definition.ankuenfte ?? {})) {
    if (!imFeld(p?.x, p?.y)) throw new Error(`Karte "${definition.id}": Ankunft "${name}" außerhalb der Karte`);
    if (KACHELN[kacheln[p.y][p.x]]?.blockiert) throw new Error(`Karte "${definition.id}": Ankunft "${name}" (${p.x}|${p.y}) steht in einer Wand`);
    ankuenfte[name] = { x: mitte(p.x), y: mitte(p.y) };
  }
  const uebergaenge = (definition.uebergaenge ?? []).map((u, i) => {
    const ok = imFeld(u.x, u.y) && Number.isInteger(u.b) && Number.isInteger(u.h) && u.b > 0 && u.h > 0 && imFeld(u.x + u.b - 1, u.y + u.h - 1);
    if (!ok || typeof u.ziel !== 'string' || typeof u.ankunft !== 'string') {
      throw new Error(`Karte "${definition.id}": Übergang #${i} ungültig (x, y, b, h in der Karte, ziel, ankunft nötig)`);
    }
    const px = { x0: u.x * kachelGroesse, y0: u.y * kachelGroesse, x1: (u.x + u.b) * kachelGroesse, y1: (u.y + u.h) * kachelGroesse };
    return { x: u.x, y: u.y, b: u.b, h: u.h, ziel: u.ziel, ankunft: u.ankunft, name: u.name ?? u.ziel, px };
  });

  return {
    daten: { id: definition.id, name: definition.name, breite, hoehe, kachelGroesse, kacheln, raeume, objekte, uebergaenge },
    spielerStarts,
    zombieSpawns,
    lootPunkte,
    ankuenfte,
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

/** Anteil der Bäume, der beim Laden weggelassen wird (Karten sind sonst zu dicht bewaldet). */
const BAUM_AUSDUENNUNG = 0.35;
const ANTEIL_GROSS = 0.4;
const GROESSEN_TYPEN = ['baum', 'baum_herbst', 'stein'];

/** Fester Pseudo-Zufallswert 0..1 aus einer Position (gleiche Karte → gleiche Auswahl, auf Server und Client). */
function streuwert(x, y, salz) {
  const n = Math.sin(x * 127.1 + y * 311.7 + salz * 74.7) * 43758.5453;
  return n - Math.floor(n);
}

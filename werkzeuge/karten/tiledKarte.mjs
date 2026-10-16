/**
 * Umwandlung Tiled (https://www.mapeditor.org, Format .tmj = JSON) ⇄ Kartendefinition des Spiels
 * (server/spiel/karten/*.js). Reine Funktionen – CLI drumherum: werkzeuge/karten/tiled.mjs.
 *
 * Aufbau einer Tiled-Karte (orthogonal, feste Größe, Kachel 32 × 32):
 *   Kachel-Ebene "boden"   Tileset "kacheln" (eingebettet); jede Kachel hat die Eigenschaft `zeichen` (',', '#', 'T' …)
 *   Objekt-Ebenen (Name egal), Objekt-Klasse (Tiled ≥ 1.9 "Klasse", älter "Typ") entscheidet:
 *     start | zombie        Punkt → Spieler-Start (S) / Zombie-Spawn (Z)
 *     loot                  Punkt + Eigenschaft `raum` ('a'–'z') → Loot-Punkt dieses Raums
 *     uebergang             Rechteck + `ziel` (Karten-ID), `ankunft` (Name), Objektname = Anzeigename
 *     ankunft               Punkt, Objektname = Name der Ankunft (z. B. "nord")
 *     alles andere          Rechteck → Kartenobjekt, Klasse = typ (bett, baum, licht …); weitere
 *                           Eigenschaften 1:1 (blockiert, ebene, drehung, radius, farbe …)
 *   Karten-Eigenschaften   id, name, raeume (JSON: { "a": { "name": "Apotheke", "lootTabelle": "apotheke" } })
 * Drehung von Möbeln bitte über die Eigenschaft `drehung` (0/90/180/270), nicht über Tiled-Rotation.
 */
import { KACHELN, MARKER, istKachel, istLootMarker } from '../../gemeinsam/welt/kacheln.js';

/** Farben fürs Tileset-Bild (nur für die Anzeige in Tiled). Reihenfolge = Kachel-ID im Tileset. */
export const TILESET_FARBEN = Object.freeze({
  ',': [79, 154, 62],
  _: [61, 64, 70],
  '=': [47, 49, 54],
  '-': [154, 154, 150],
  '.': [216, 221, 224],
  ':': [163, 166, 168],
  '+': [168, 116, 63],
  T: [199, 140, 60],
  '#': [34, 37, 43],
  F: [127, 182, 207],
});
const ZEICHEN = Object.keys(KACHELN);
const RESERVIERT = new Set(['start', 'zombie', 'loot', 'uebergang', 'ankunft']);
const FLIP_MASKE = 0x1fffffff; // obere Bits = Spiegeln/Drehen in Tiled → ignorieren

/** Tiled-Eigenschaften [{ name, type, value }] → { name: value } */
function eigenschaften(liste) {
  const ergebnis = {};
  for (const e of liste ?? []) ergebnis[e.name] = e.value;
  return ergebnis;
}

function alsEigenschaften(objekt) {
  return Object.entries(objekt).map(([name, value]) => ({
    name,
    type: typeof value === 'boolean' ? 'bool' : typeof value === 'number' ? (Number.isInteger(value) ? 'int' : 'float') : 'string',
    value,
  }));
}

const runde = (v) => Math.round(v * 1000) / 1000;

/** Kachel-Ebene lesen (Array oder Base64 ohne Kompression). */
function kachelDaten(ebene) {
  if (Array.isArray(ebene.data)) return ebene.data;
  if (ebene.encoding === 'base64' && !ebene.compression) {
    const bytes = Uint8Array.from(atob(ebene.data), (c) => c.charCodeAt(0));
    return Array.from({ length: bytes.length / 4 }, (_, i) => new DataView(bytes.buffer).getUint32(i * 4, true));
  }
  throw new Error('Kachel-Ebene: bitte als CSV speichern (Karte → Karteneigenschaften → Kachelebenen-Format: CSV)');
}

/**
 * Tiled-Karte (geparstes .tmj) → Kartendefinition. Wirft verständliche Fehler bei allem, was nicht passt.
 * @param optionen.id / .name  überschreiben die Karten-Eigenschaften
 */
export function ausTiled(tmj, { id, name } = {}) {
  if (tmj?.type !== 'map') throw new Error('Keine Tiled-Karte (.tmj, JSON-Format)');
  if (tmj.orientation !== 'orthogonal') throw new Error(`Nur orthogonale Karten (ist: ${tmj.orientation})`);
  if (tmj.infinite) throw new Error('Unendliche Karten gehen nicht – in den Karteneigenschaften "Unendlich" ausschalten');
  const tw = tmj.tilewidth;
  const th = tmj.tileheight;
  const props = eigenschaften(tmj.properties);

  const zeichenVonGid = new Map();
  for (const ts of tmj.tilesets ?? []) {
    if (ts.source) throw new Error(`Externes Tileset "${ts.source}" – bitte einbetten (Tileset-Knopf "Tileset einbetten")`);
    for (const t of ts.tiles ?? []) {
      const z = eigenschaften(t.properties).zeichen;
      if (typeof z === 'string' && istKachel(z)) zeichenVonGid.set(ts.firstgid + t.id, z);
    }
  }
  const ebenen = tmj.layers ?? [];
  const boden = ebenen.find((l) => l.type === 'tilelayer' && l.name === 'boden') ?? ebenen.find((l) => l.type === 'tilelayer');
  if (!boden) throw new Error('Keine Kachel-Ebene ("boden") gefunden');
  const daten = kachelDaten(boden);
  const raster = [];
  for (let y = 0; y < tmj.height; y++) {
    const zeile = [];
    for (let x = 0; x < tmj.width; x++) {
      const gid = daten[y * tmj.width + x] & FLIP_MASKE;
      if (gid === 0) {
        zeile.push(',');
        continue;
      }
      const z = zeichenVonGid.get(gid);
      if (!z) throw new Error(`Kachel ${x}|${y}: unbekannte Kachel (gid ${gid}) – jede Tileset-Kachel braucht die Eigenschaft "zeichen"`);
      zeile.push(z);
    }
    raster.push(zeile);
  }

  const objekte = [];
  const uebergaenge = [];
  const ankuenfte = {};
  const kachelVon = (o) => {
    const cx = o.point ? o.x : o.x + (o.width ?? 0) / 2;
    const cy = o.point ? o.y : o.y + (o.height ?? 0) / 2;
    const x = Math.floor(cx / tw);
    const y = Math.floor(cy / th);
    if (x < 0 || y < 0 || x >= tmj.width || y >= tmj.height) throw new Error(`Objekt #${o.id} liegt außerhalb der Karte`);
    return { x, y };
  };
  for (const ebene of ebenen) {
    if (ebene.type !== 'objectgroup') continue;
    for (const o of ebene.objects ?? []) {
      const klasse = String(o.class ?? o.type ?? '').trim();
      const p = eigenschaften(o.properties);
      if (!klasse) throw new Error(`Objekt #${o.id} (${ebene.name}) hat keine Klasse/Typ`);
      if (klasse === 'start' || klasse === 'zombie' || klasse === 'loot') {
        const { x, y } = kachelVon(o);
        const zeichen = klasse === 'start' ? MARKER.SPIELER_START : klasse === 'zombie' ? MARKER.ZOMBIE : p.raum;
        if (klasse === 'loot' && !(typeof zeichen === 'string' && zeichen.length === 1 && istLootMarker(zeichen))) {
          throw new Error(`Loot-Punkt #${o.id}: Eigenschaft "raum" muss ein Buchstabe a–z sein`);
        }
        raster[y][x] = zeichen;
      } else if (klasse === 'uebergang') {
        uebergaenge.push({ x: Math.round(o.x / tw), y: Math.round(o.y / th), b: Math.round(o.width / tw), h: Math.round(o.height / th), ziel: p.ziel, ankunft: p.ankunft, name: o.name || p.ziel });
      } else if (klasse === 'ankunft') {
        if (!o.name) throw new Error(`Ankunft #${o.id} braucht einen Namen (z. B. "nord")`);
        ankuenfte[o.name] = kachelVon(o);
      } else {
        if (o.point || !(o.width > 0 && o.height > 0)) throw new Error(`Objekt #${o.id} (${klasse}) muss ein Rechteck sein`);
        objekte.push({ typ: klasse, x: runde(o.x / tw), y: runde(o.y / th), b: runde(o.width / tw), h: runde(o.height / th), ...p });
      }
    }
  }

  const kartenId = id ?? props.id ?? '';
  if (!/^[a-z0-9_]{1,40}$/.test(kartenId)) throw new Error(`Karten-ID "${kartenId}" ungültig (Kleinbuchstaben/Ziffern/_; Karten-Eigenschaft "id" oder --id)`);
  const definition = {
    id: kartenId,
    name: name ?? props.name ?? kartenId,
    kacheln: raster.map((z) => z.join('')),
    raeume: props.raeume ? JSON.parse(props.raeume) : {},
    objekte,
  };
  if (uebergaenge.length) definition.uebergaenge = uebergaenge;
  if (Object.keys(ankuenfte).length) definition.ankuenfte = ankuenfte;
  return definition;
}

/** Untergrund unter einem Marker: erster begehbarer Nachbar (wie im Kartenlader). */
function untergrund(zeilen, x, y) {
  const nachbarn = [zeilen[y][x - 1], zeilen[y][x + 1], zeilen[y - 1]?.[x], zeilen[y + 1]?.[x]];
  return nachbarn.find((z) => z !== undefined && istKachel(z) && !KACHELN[z].blockiert) ?? '.';
}

/**
 * Kartendefinition → Tiled-Karte (.tmj-Objekt). Tileset ist eingebettet und zeigt auf `tilesetBild`
 * (relativ zur .tmj-Datei, Bild erzeugt erzeugeTilesetPng()).
 */
export function nachTiled(definition, { tilesetBild = 'kacheln.png', kachel = 32 } = {}) {
  const zeilen = definition.kacheln;
  const hoehe = zeilen.length;
  const breite = zeilen[0].length;
  let objektId = 1;
  const marker = [];
  const daten = [];
  for (let y = 0; y < hoehe; y++) {
    for (let x = 0; x < breite; x++) {
      let z = zeilen[y][x];
      if (!istKachel(z)) {
        const punkt = { id: objektId++, name: '', point: true, x: (x + 0.5) * kachel, y: (y + 0.5) * kachel, width: 0, height: 0, rotation: 0, visible: true };
        if (z === MARKER.SPIELER_START) marker.push({ ...punkt, type: 'start' });
        else if (z === MARKER.ZOMBIE) marker.push({ ...punkt, type: 'zombie' });
        else marker.push({ ...punkt, type: 'loot', properties: alsEigenschaften({ raum: z }) });
        z = untergrund(zeilen, x, y);
      }
      daten.push(ZEICHEN.indexOf(z) + 1);
    }
  }
  const objekte = (definition.objekte ?? []).map(({ typ, x, y, b, h, ...rest }) => ({
    id: objektId++,
    name: '',
    type: typ,
    x: x * kachel,
    y: y * kachel,
    width: b * kachel,
    height: h * kachel,
    rotation: 0,
    visible: true,
    ...(Object.keys(rest).length ? { properties: alsEigenschaften(rest) } : {}),
  }));
  const uebergaenge = (definition.uebergaenge ?? []).map((u) => ({
    id: objektId++,
    name: u.name ?? '',
    type: 'uebergang',
    x: u.x * kachel,
    y: u.y * kachel,
    width: u.b * kachel,
    height: u.h * kachel,
    rotation: 0,
    visible: true,
    properties: alsEigenschaften({ ziel: u.ziel, ankunft: u.ankunft }),
  }));
  const ankuenfte = Object.entries(definition.ankuenfte ?? {}).map(([name, p]) => ({
    id: objektId++,
    name,
    type: 'ankunft',
    point: true,
    x: (p.x + 0.5) * kachel,
    y: (p.y + 0.5) * kachel,
    width: 0,
    height: 0,
    rotation: 0,
    visible: true,
  }));
  const objektEbene = (id, name, objects) => ({ id, name, type: 'objectgroup', draworder: 'topdown', opacity: 1, visible: true, x: 0, y: 0, objects });
  return {
    type: 'map',
    version: '1.10',
    tiledversion: '1.10.2',
    orientation: 'orthogonal',
    renderorder: 'right-down',
    width: breite,
    height: hoehe,
    tilewidth: kachel,
    tileheight: kachel,
    infinite: false,
    compressionlevel: -1,
    nextlayerid: 6,
    nextobjectid: objektId,
    properties: alsEigenschaften({ id: definition.id, name: definition.name, raeume: JSON.stringify(definition.raeume ?? {}) }),
    tilesets: [
      {
        firstgid: 1,
        name: 'kacheln',
        tilewidth: kachel,
        tileheight: kachel,
        tilecount: ZEICHEN.length,
        columns: ZEICHEN.length,
        margin: 0,
        spacing: 0,
        image: tilesetBild,
        imagewidth: kachel * ZEICHEN.length,
        imageheight: kachel,
        tiles: ZEICHEN.map((z, i) => ({ id: i, properties: alsEigenschaften({ zeichen: z, name: KACHELN[z].name }) })),
      },
    ],
    layers: [
      { id: 1, name: 'boden', type: 'tilelayer', width: breite, height: hoehe, x: 0, y: 0, opacity: 1, visible: true, data: daten },
      objektEbene(2, 'objekte', objekte),
      objektEbene(3, 'marker', marker),
      objektEbene(4, 'uebergaenge', uebergaenge),
      objektEbene(5, 'ankuenfte', ankuenfte),
    ],
  };
}

/** Kartendefinition → Quelltext einer Kartendatei (server/spiel/karten/<id>.js), im Stil der vorhandenen Karten. */
export function alsJsModul(definition, { quelle = 'Tiled' } = {}) {
  const wert = (v) => (typeof v === 'string' ? `'${v.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'` : String(v));
  const inline = (o) => {
    const teile = [];
    for (const [k, v] of Object.entries(o)) {
      if (k === 'blockiert' && v === true) continue;
      teile.push(`${/^[a-zA-Z_]\w*$/.test(k) ? k : wert(k)}: ${v && typeof v === 'object' ? inline(v) : wert(v)}`);
    }
    if (o.blockiert === true) teile.push('...M');
    return `{ ${teile.join(', ')} }`;
  };
  const name = definition.id.toUpperCase();
  const zeilen = [
    '/**',
    ` * Karte "${definition.name}" – importiert aus ${quelle} (werkzeuge/karten/tiled.mjs).`,
    ' * Nicht von Hand ändern: in Tiled bearbeiten und neu importieren (npm run karte:import -- datei.tmj).',
    ' * Legende & Felder: siehe stadtrand.js.',
    ' */',
    'const M = { blockiert: true };',
    '',
    `export const ${name} = {`,
    `  id: ${wert(definition.id)},`,
    `  name: ${wert(definition.name)},`,
    '  kacheln: [',
    ...definition.kacheln.map((z) => `    ${wert(z)},`),
    '  ],',
    '  raeume: {',
    ...Object.entries(definition.raeume ?? {}).map(([k, r]) => `    ${k}: ${inline(r)},`),
    '  },',
    '  objekte: [',
    ...(definition.objekte ?? []).map((o) => `    ${inline(o)},`),
    '  ],',
  ];
  if (definition.uebergaenge?.length) zeilen.push('  uebergaenge: [', ...definition.uebergaenge.map((u) => `    ${inline(u)},`), '  ],');
  if (definition.ankuenfte) zeilen.push('  ankuenfte: {', ...Object.entries(definition.ankuenfte).map(([k, p]) => `    ${k}: ${inline(p)},`), '  },');
  zeilen.push('};', '');
  return zeilen.join('\n');
}

import { ausDefinition } from './format.js';
import { kopiere } from './auswahl.js';

/**
 * Prefabs (Phase 6) = gespeicherte Vorlagen (siehe auswahl.js: Kacheln, Objekte, Marker, Bauwerke, Räume relativ zur Ecke).
 * Eigene Prefabs: Auswahl → „Als Prefab“ (lokal gespeichert, als Datei austauschbar). Eingebaute stehen hier als kleine
 * Kartendefinitionen im Spielformat (gleiche Regeln wie echte Karten) und werden beim ersten Gebrauch umgewandelt.
 */
const M = { blockiert: true };

const EINGEBAUT = [
  {
    name: 'Wohnhaus',
    beschreibung: 'Haus mit Schlafzimmer, Küche, Wohnzimmer – Loot „wohnung“',
    definition: {
      kacheln: [
        '##F####F###',
        '#++++#a+++#',
        '#a+++#++++#',
        '#++++T++++#',
        '##T###....F',
        'F+++++....#',
        '#+++a+..a.#',
        '#+++++....#',
        '####TT#####',
      ],
      raeume: { a: { name: 'Wohnhaus', lootTabelle: 'wohnung' } },
      objekte: [
        { typ: 'bett_orange', x: 2, y: 1, b: 1, h: 2, ...M },
        { typ: 'kiste_klein', x: 4, y: 1, b: 1, h: 1, ...M },
        { typ: 'bett', x: 8, y: 1, b: 2, h: 2, ...M, drehung: 90 },
        { typ: 'kueche_theke', x: 6, y: 4, b: 4, h: 1, ...M },
        { typ: 'kueche_herd', x: 9, y: 5, b: 1, h: 1, ...M, drehung: 270 },
        { typ: 'tisch', x: 7, y: 6, b: 1, h: 1, ...M },
        { typ: 'sofa', x: 1, y: 7, b: 3, h: 1, ...M },
        { typ: 'teppich', x: 1, y: 5, b: 3, h: 2, ebene: 'boden' },
        { typ: 'pflanze', x: 5, y: 7, b: 1, h: 1, ...M },
        { typ: 'licht', x: 3, y: 6, b: 1, h: 1, radius: 4, farbe: '#ffd9a0', staerke: 0.85 },
      ],
    },
  },
  {
    name: 'Werkstatt',
    beschreibung: 'Betonhalle mit Werkbank, Kisten, Fässern – Loot „werkstatt“',
    definition: {
      kacheln: ['##F####F##', '#::::::::#', '#:a::::a:#', '#::::::::#', '#::::::::#', '#::::::::#', '###TT#####'],
      raeume: { a: { name: 'Werkstatt', lootTabelle: 'werkstatt' } },
      objekte: [
        { typ: 'werkbank', x: 4, y: 1, b: 2, h: 1, ...M },
        { typ: 'kiste', x: 1, y: 4, b: 1, h: 1, ...M },
        { typ: 'kiste', x: 1, y: 5, b: 1, h: 1, ...M },
        { typ: 'fass', x: 8, y: 4, b: 0.9, h: 0.9, ...M },
        { typ: 'fass', x: 8, y: 5, b: 0.9, h: 0.9, ...M },
        { typ: 'oelfleck', x: 5, y: 3, b: 1.6, h: 1.4, ebene: 'boden' },
        { typ: 'licht', x: 4, y: 3, b: 1, h: 1, radius: 5, farbe: '#e8f0ff', staerke: 0.8 },
      ],
    },
  },
  {
    name: 'Hütte',
    beschreibung: 'Kleine Holzhütte im Wald – Loot „huette“',
    definition: {
      kacheln: ['#F##F#', '#++++#', '#+a++#', '#++++#', '##T###'],
      raeume: { a: { name: 'Hütte', lootTabelle: 'huette' } },
      objekte: [
        { typ: 'bett_orange', x: 4, y: 1, b: 1, h: 2, ...M },
        { typ: 'kiste_klein', x: 1, y: 1, b: 1, h: 1, ...M },
      ],
    },
  },
  {
    name: 'Garten mit Zaun',
    beschreibung: 'Rasenfläche mit Zaun, Tor, Beeten und Lagerfeuer (kartenfeste Bauwerke)',
    definition: {
      kacheln: [',,,,,,,,', ',,,,,,,,', ',,,,,,,,', ',,,,,,,,', ',,,,,,,,', ',,,,,,,,'],
      raeume: {},
      objekte: [],
      bauwerke: [
        ...[0, 1, 2, 4, 5, 6, 7].map((x) => ({ typ: 'zaun', tx: x, ty: 0 })),
        { typ: 'zauntor', tx: 3, ty: 0 },
        ...[0, 1, 2, 3, 4, 5, 6, 7].map((x) => ({ typ: 'zaun', tx: x, ty: 5 })),
        ...[1, 2, 3, 4].flatMap((y) => [{ typ: 'zaun', tx: 0, ty: y }, { typ: 'zaun', tx: 7, ty: y }]),
        ...[2, 3, 4, 5].map((x) => ({ typ: 'beet', tx: x, ty: 3 })),
        { typ: 'lagerfeuer', tx: 2, ty: 1 },
      ],
    },
  },
  {
    name: 'Parkplatz',
    beschreibung: 'Asphalt mit Markierungen und zwei Autos (fahrbar)',
    definition: {
      kacheln: ['__________', '__________', '__________', '__________', '__________', '__________', '__________'],
      raeume: {},
      objekte: [
        ...[0, 3, 6, 9].map((x) => ({ typ: 'markierung', x: x + 0.44, y: 0.2, b: 0.12, h: 3.4, ebene: 'boden' })),
        { typ: 'auto_blau', x: 0.75, y: 0.3, b: 2.6, h: 5.5, ...M, drehung: 0 },
        { typ: 'auto_rot', x: 6.75, y: 0.3, b: 2.6, h: 5.5, ...M, drehung: 0 },
        { typ: 'licht', x: 4.5, y: 5, b: 1, h: 1, radius: 3, farbe: '#ffcf87', staerke: 0.6, mast: true },
      ],
    },
  },
];

let cache = null;

/** Eingebaute Prefabs als Vorlagen: [{ name, beschreibung, vorlage, eingebaut: true }] */
export function eingebautePrefabs() {
  if (cache) return cache;
  cache = EINGEBAUT.map(({ name, beschreibung, definition }) => {
    const { karte } = ausDefinition({ id: 'prefab', name, ...definition });
    const vorlage = kopiere(karte, { x: 0, y: 0, b: karte.breite, h: karte.hoehe }, { name });
    return { name, beschreibung, vorlage, eingebaut: true };
  });
  return cache;
}

/** Prefab-Datei (zum Austauschen): { format, formatVersion, name, vorlage } */
export const PREFAB_FORMAT = 'browser-survival-prefab';

export function prefabDatei(name, vorlage) {
  return { format: PREFAB_FORMAT, formatVersion: 1, name, vorlage };
}

export function ladePrefabDatei(text) {
  const j = typeof text === 'string' ? JSON.parse(text) : text;
  if (j?.format !== PREFAB_FORMAT) throw new Error('Keine Prefab-Datei');
  if (j.formatVersion > 1) throw new Error('Prefab-Datei ist neuer als dieser Editor');
  const v = j.vorlage;
  if (!v || !Number.isInteger(v.b) || !Number.isInteger(v.h) || !Array.isArray(v.zellen) || v.zellen.length !== v.b * v.h) throw new Error('Prefab beschädigt');
  return { name: String(j.name ?? 'Prefab'), vorlage: v };
}

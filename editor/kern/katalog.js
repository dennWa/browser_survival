import { KACHELN } from '../../gemeinsam/welt/kacheln.js';
import { BAUWERKE, ebeneVon } from '../../gemeinsam/welt/bauwerke.js';
import { RESSOURCEN_OBJEKTE } from '../../gemeinsam/welt/ressourcen.js';
import { FAHRZEUG_MODELLE } from '../../gemeinsam/physik/fahrzeug.js';
import { KACHEL_FARBEN } from '../../client/darstellung/farben.js';

/**
 * Objektkatalog des Editors = Bauleiste. Grundlage: editor/BESTANDSAUFNAHME.md (Phase 0).
 * Kacheln, Bauwerke, Ressourcen und Fahrzeuge kommen direkt aus den Spiel-Registries; Möbel/Deko (die es nur als
 * Kartenobjekte gibt) stehen in OBJEKT_TYPEN mit Standardgröße, Kollision und Ebene wie in den Spielkarten.
 *
 * Eintrag: { id, name, kategorie, art, symbol, farbe, … }
 *   art 'kachel'   → zeichen (malt Kacheln)
 *   art 'objekt'   → typ, b, h, blockiert, ebene, extra (Standardfelder, z. B. Licht)
 *   art 'bauwerk'  → typ (BAUWERKE), drehbar
 *   art 'marker'   → marker: 'start' | 'zombie' | 'loot' | 'ankunft' (+ horde)
 *   art 'bereich'  → sammlung (tierBereiche | raumFlaechen | uebergaenge)
 *   art 'werkzeug' → werkzeug (terrain-heben …, wetter-panel)
 */
export const KATEGORIEN = Object.freeze(['Wege', 'Mauern', 'Böden', 'Umwelt', 'Gebäude', 'Ressourcen', 'Möbel', 'Fahrzeuge', 'Spawns', 'Loot', 'Tiere', 'Wetter', 'Terrain', 'Farbe', 'Räume', 'Zonen', 'Eigene']);

/** Gruppen des Asset-Browsers (Editor 2.0): jede Kategorie gehört zu genau einer Gruppe (Test prüft das). */
export const GRUPPEN = Object.freeze([
  { name: 'Gelände', symbol: '⛰', kategorien: ['Böden', 'Wege', 'Terrain', 'Farbe'] },
  { name: 'Bauen', symbol: '🧱', kategorien: ['Mauern', 'Gebäude'] },
  { name: 'Natur', symbol: '🌳', kategorien: ['Ressourcen', 'Umwelt'] },
  { name: 'Einrichtung', symbol: '🛋', kategorien: ['Möbel', 'Fahrzeuge'] },
  { name: 'Gameplay', symbol: '🎮', kategorien: ['Spawns', 'Loot', 'Tiere', 'Wetter'] },
  { name: 'Zonen & Logik', symbol: '🗺', kategorien: ['Räume', 'Zonen'] },
  { name: 'Eigene', symbol: '✦', kategorien: ['Eigene'] },
]);

/** Gruppe einer Kategorie (unbekannte Kategorien eigener Typen → „Eigene“) */
export function gruppeVon(kategorie) {
  return GRUPPEN.find((g) => g.kategorien.includes(kategorie)) ?? GRUPPEN.at(-1);
}

/** Suchtext normalisieren (klein, ohne Umlaute/Akzente) – für die Suche im Asset-Browser */
export function suchNormal(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/** Passt ein Katalog-Eintrag zur Suche? (alle Wörter müssen in Name, Typ, Kategorie oder Gruppe vorkommen) */
export function passtZurSuche(e, suche) {
  const woerter = suchNormal(suche).split(/\s+/).filter(Boolean);
  if (!woerter.length) return true;
  const heu = suchNormal(`${e.name} ${e.typ ?? ''} ${e.zeichen ?? ''} ${e.kategorie} ${gruppeVon(e.kategorie).name} ${(e.tags ?? []).join(' ')}`);
  return woerter.every((w) => heu.includes(w));
}

/** Kacheln → Kategorie (+ Anzeigename) */
const KACHEL_KATEGORIE = {
  '_': ['Wege', 'Asphalt'],
  '=': ['Wege', 'Straße'],
  '-': ['Wege', 'Gehweg'],
  '#': ['Mauern', 'Wand'],
  F: ['Mauern', 'Fenster'],
  T: ['Mauern', 'Tür'],
  ',': ['Böden', 'Rasen'],
  '.': ['Böden', 'Fliesen (innen)'],
  ':': ['Böden', 'Beton (innen)'],
  '+': ['Böden', 'Holzboden (innen)'],
  '~': ['Umwelt', 'Wasser (See)'],
};
const KACHEL_SYMBOL = { ',': '🌱', _: '⬛', '=': '🛣', '-': '▦', '.': '⬜', ':': '◻', '+': '🟫', T: '🚪', '#': '🧱', F: '🪟', '~': '🌊' };

const M = { blockiert: true };
/** Kartenobjekte (Möbel, Deko, Natur) mit Standardwerten wie in stadtrand/waldweg. */
export const OBJEKT_TYPEN = Object.freeze({
  // Umwelt / Ressourcen
  baum: { name: 'Baum (Holz)', kategorie: 'Ressourcen', b: 3.5, h: 3.5, ebene: 'oben', symbol: '🌳', farbe: '#2f6b2a', auch: ['Umwelt'] },
  baum_herbst: { name: 'Herbstbaum (Holz)', kategorie: 'Ressourcen', b: 3.5, h: 3.5, ebene: 'oben', symbol: '🍂', farbe: '#a8641f', auch: ['Umwelt'] },
  stein: { name: 'Stein', kategorie: 'Ressourcen', b: 1, h: 1, ...M, symbol: '🪨', farbe: '#8d8f93', auch: ['Umwelt'] },
  eisenerz: { name: 'Eisenerz', kategorie: 'Ressourcen', b: 1, h: 1, ...M, symbol: '⛏', farbe: '#9a5b3c', auch: ['Umwelt'] },
  busch: { name: 'Busch', kategorie: 'Umwelt', b: 1.5, h: 1.5, ebene: 'oben', symbol: '🌿', farbe: '#3f7d32' },
  // Gebäude
  licht: { name: 'Lampe', kategorie: 'Gebäude', b: 1, h: 1, ebene: 'licht', symbol: '💡', farbe: '#ffd9a0', extra: { radius: 4, farbe: '#ffd9a0', staerke: 0.85, flackern: false } },
  laterne: { typ: 'licht', name: 'Straßenlaterne', kategorie: 'Wege', b: 1, h: 1, ebene: 'licht', symbol: '🏮', farbe: '#ffcf87', extra: { radius: 3, farbe: '#ffcf87', staerke: 0.6, flackern: false, mast: true } },
  // Kegel-Licht (Editor 2.0, 2.1): leuchtet in eine Richtung (0° = Osten, 90° = Süden); R dreht die Richtung
  scheinwerfer: { typ: 'licht', name: 'Scheinwerfer (Kegel)', kategorie: 'Gebäude', b: 1, h: 1, ebene: 'licht', symbol: '🔦', farbe: '#fff2d0', extra: { radius: 6, farbe: '#fff2d0', staerke: 0.9, flackern: false, art: 'kegel', richtung: 90, oeffnung: 60 } },
  werkbank: { name: 'Werkbank (Crafting)', kategorie: 'Gebäude', b: 2, h: 1, ...M, symbol: '🔨', farbe: '#7a5532' },
  // Möbel
  bett: { name: 'Bett', kategorie: 'Möbel', b: 2, h: 4, ...M, symbol: '🛏', farbe: '#d9d9e8' },
  bett_orange: { name: 'Bett (orange)', kategorie: 'Möbel', b: 1, h: 2, ...M, symbol: '🛏', farbe: '#e08a3c' },
  tisch: { name: 'Tisch', kategorie: 'Möbel', b: 2, h: 1, ...M, symbol: '🪵', farbe: '#9b7047' },
  tisch_rund: { name: 'Runder Tisch', kategorie: 'Möbel', b: 1, h: 1, ...M, symbol: '⚪', farbe: '#a87a4f' },
  stuhl: { name: 'Stuhl', kategorie: 'Möbel', b: 1, h: 1, symbol: '🪑', farbe: '#8a6440' },
  sessel: { name: 'Sessel', kategorie: 'Möbel', b: 1, h: 1, ...M, symbol: '🛋', farbe: '#8c4a3b' },
  sessel_blau: { name: 'Sessel (blau)', kategorie: 'Möbel', b: 1, h: 1, ...M, symbol: '🛋', farbe: '#3b5f8c' },
  sofa: { name: 'Sofa', kategorie: 'Möbel', b: 3, h: 1, ...M, symbol: '🛋', farbe: '#7a5a8c' },
  sofa_dunkel: { name: 'Sofa (dunkel)', kategorie: 'Möbel', b: 3, h: 1, ...M, symbol: '🛋', farbe: '#3d3d46' },
  kiste: { name: 'Kiste', kategorie: 'Möbel', b: 1, h: 1, ...M, symbol: '📦', farbe: '#a07840' },
  kiste_klein: { name: 'Kiste (klein)', kategorie: 'Möbel', b: 1, h: 1, ...M, symbol: '📦', farbe: '#b08850' },
  pflanze: { name: 'Topfpflanze', kategorie: 'Möbel', b: 1, h: 1, ...M, symbol: '🪴', farbe: '#3c8a3c' },
  kueche_theke: { name: 'Küchentheke', kategorie: 'Möbel', b: 3, h: 1, ...M, symbol: '🍽', farbe: '#c7c2b8' },
  kueche_herd: { name: 'Herd', kategorie: 'Möbel', b: 1, h: 1, ...M, symbol: '🍳', farbe: '#555' },
  kueche_spuele: { name: 'Spüle', kategorie: 'Möbel', b: 1, h: 1, ...M, symbol: '🚰', farbe: '#aab' },
  kueche_kochfeld: { name: 'Kochfeld', kategorie: 'Möbel', b: 1, h: 1, ...M, symbol: '♨', farbe: '#444' },
  fass: { name: 'Fass', kategorie: 'Möbel', b: 0.9, h: 0.9, ...M, symbol: '🛢', farbe: '#7a4a2a' },
  // Wege / Böden (Deko)
  pylone: { name: 'Pylone', kategorie: 'Wege', b: 0.8, h: 0.8, symbol: '🔺', farbe: '#ff7a1a' },
  markierung: { name: 'Fahrbahnmarkierung', kategorie: 'Wege', b: 0.12, h: 3.4, ebene: 'boden', symbol: '┃', farbe: '#eeeedc' },
  teppich: { name: 'Teppich', kategorie: 'Böden', b: 4, h: 3, ebene: 'boden', symbol: '🟥', farbe: '#9c3a3a' },
  teppich_gruen: { name: 'Teppich (grün)', kategorie: 'Böden', b: 4, h: 3, ebene: 'boden', symbol: '🟩', farbe: '#3a7a4a' },
  blutfleck: { name: 'Blutfleck', kategorie: 'Böden', b: 1.2, h: 1.2, ebene: 'boden', symbol: '🩸', farbe: '#7a1010' },
  blutlache: { name: 'Blutlache', kategorie: 'Böden', b: 1.6, h: 1.6, ebene: 'boden', symbol: '🩸', farbe: '#600808' },
  oelfleck: { name: 'Ölfleck', kategorie: 'Böden', b: 1.6, h: 1.4, ebene: 'boden', symbol: '⚫', farbe: '#1c1c1c' },
});

const FAHRZEUG_FARBE = (f) => `#${f.toString(16).padStart(6, '0')}`;

let katalogCache = null;

/** Alle Einträge der Bauleiste (fest, ohne eigene Typen der Karte). */
export function katalog() {
  if (katalogCache) return katalogCache;
  const liste = [];
  for (const [zeichen, k] of Object.entries(KACHELN)) {
    const [kategorie, name] = KACHEL_KATEGORIE[zeichen] ?? ['Böden', k.name];
    liste.push({ id: `kachel:${zeichen}`, art: 'kachel', zeichen, name, kategorie, symbol: KACHEL_SYMBOL[zeichen] ?? '▪', farbe: KACHEL_FARBEN[k.name] ?? '#888', blockiert: !!k.blockiert, innen: !!k.innen });
  }
  for (const [id, t] of Object.entries(OBJEKT_TYPEN)) {
    const eintrag = objektEintrag(t.typ ?? id, t, `objekt:${id}`);
    liste.push(eintrag);
    for (const k of t.auch ?? []) liste.push({ ...eintrag, id: `${eintrag.id}@${k}`, kategorie: k });
  }
  for (const [typ, f] of Object.entries(FAHRZEUG_MODELLE)) {
    liste.push(objektEintrag(typ, { name: `${f.name} (${typ.replace('auto_', '')})`, kategorie: 'Fahrzeuge', b: 5.5, h: 3, blockiert: true, drehung: 90, symbol: f.transporter ? '🚐' : '🚗', farbe: FAHRZEUG_FARBE(f.farbe) }, `objekt:${typ}`));
  }
  const BAUWERK_KATEGORIE = { werkbank: 'Gebäude', lagerfeuer: 'Gebäude', schmelzofen: 'Gebäude', falle: 'Gebäude', beet: 'Umwelt', kiste: 'Möbel', bett: 'Möbel', zaun: 'Mauern', zauntor: 'Mauern', holzwand: 'Mauern', holzwand_fenster: 'Mauern', holzwand_tuer: 'Mauern', holztuer: 'Mauern', holzboden: 'Böden' };
  const BAUWERK_SYMBOL = { werkbank: '🔨', lagerfeuer: '🔥', schmelzofen: '🏭', falle: '🪤', beet: '🌱', holzboden: '🟫', holzwand: '🧱', holzwand_fenster: '🪟', holzwand_tuer: '🚪', holztuer: '🚪', holzdach: '🛖', zaun: '🚧', zauntor: '⛩', kiste: '📦', bett: '🛏' };
  for (const [typ, b] of Object.entries(BAUWERKE)) {
    liste.push({
      id: `bauwerk:${typ}`,
      art: 'bauwerk',
      typ,
      name: `${b.name} (Bauwerk)`,
      kategorie: BAUWERK_KATEGORIE[typ] ?? 'Gebäude',
      symbol: BAUWERK_SYMBOL[typ] ?? '🏗',
      farbe: '#b48a5a',
      blockiert: !!b.blockiert,
      ebene: ebeneVon(typ),
      b: 1,
      h: 1,
    });
  }
  liste.push(
    { id: 'marker:start', art: 'marker', marker: 'start', name: 'Spieler-Start', kategorie: 'Spawns', symbol: '🧍', farbe: '#38d16a' },
    { id: 'marker:zombie', art: 'marker', marker: 'zombie', name: 'Zombie-Spawn', kategorie: 'Spawns', symbol: '🧟', farbe: '#d13838' },
    { id: 'marker:horde', art: 'marker', marker: 'zombie', horde: true, name: 'Horden-Spawnpunkt (nachts)', kategorie: 'Spawns', symbol: '🌙', farbe: '#8a2be2' },
    { id: 'marker:ankunft', art: 'marker', marker: 'ankunft', name: 'Ankunftspunkt', kategorie: 'Zonen', symbol: '📍', farbe: '#2b8cff' },
    { id: 'marker:loot', art: 'marker', marker: 'loot', name: 'Loot-Punkt (Raum wählen)', kategorie: 'Loot', symbol: '🎁', farbe: '#ffd23f' },
    { id: 'bereich:tier', art: 'bereich', sammlung: 'tierBereiche', name: 'Hasen-Bereich', kategorie: 'Tiere', symbol: '🐇', farbe: '#c8a27a' },
    { id: 'bereich:raum', art: 'bereich', sammlung: 'raumFlaechen', name: 'Raum markieren (Rechteck)', kategorie: 'Räume', symbol: '▭', farbe: '#ffb84d' },
    { id: 'werkzeug:raumfuellen', art: 'werkzeug', werkzeug: 'raumFuellen', name: 'Raum markieren (Füllen)', kategorie: 'Räume', symbol: '🪣', farbe: '#ffb84d' },
    { id: 'bereich:uebergang', art: 'bereich', sammlung: 'uebergaenge', name: 'Übergang (am Rand)', kategorie: 'Zonen', symbol: '🚪', farbe: '#2b8cff' },
    { id: 'werkzeug:wetter', art: 'werkzeug', werkzeug: 'wetter', name: 'Wetter dieser Zone', kategorie: 'Wetter', symbol: '🌦', farbe: '#7fb3d5' },
    { id: 'werkzeug:musik', art: 'werkzeug', werkzeug: 'musik', name: 'Musik-Ordner', kategorie: 'Wetter', symbol: '🎵', farbe: '#7fb3d5' },
    { id: 'werkzeug:terrain-heben', art: 'werkzeug', werkzeug: 'terrainHeben', name: 'Gelände heben', kategorie: 'Terrain', symbol: '⛰', farbe: '#8a7a5a' },
    { id: 'werkzeug:terrain-senken', art: 'werkzeug', werkzeug: 'terrainSenken', name: 'Gelände senken', kategorie: 'Terrain', symbol: '🕳', farbe: '#5a4a3a' },
    { id: 'werkzeug:terrain-glaetten', art: 'werkzeug', werkzeug: 'terrainGlaetten', name: 'Glätten', kategorie: 'Terrain', symbol: '〰', farbe: '#7a7a6a' },
    { id: 'werkzeug:terrain-ebnen', art: 'werkzeug', werkzeug: 'terrainEbnen', name: 'Einebnen (0)', kategorie: 'Terrain', symbol: '▬', farbe: '#6a6a6a' },
    { id: 'werkzeug:farbe-pinsel', art: 'werkzeug', werkzeug: 'farbePinsel', name: 'Farbe malen (Pinsel)', kategorie: 'Farbe', symbol: '🖌', farbe: '#d06b3a' },
    { id: 'werkzeug:farbe-fuellen', art: 'werkzeug', werkzeug: 'farbeFuellen', name: 'Farbe füllen', kategorie: 'Farbe', symbol: '🪣', farbe: '#d06b3a' },
    { id: 'werkzeug:farbe-entfernen', art: 'werkzeug', werkzeug: 'farbeEntfernen', name: 'Farbe entfernen', kategorie: 'Farbe', symbol: '🧽', farbe: '#888' },
  );
  katalogCache = Object.freeze(liste);
  return katalogCache;
}

function objektEintrag(typ, t, id) {
  return {
    id,
    art: 'objekt',
    typ,
    name: t.name,
    kategorie: t.kategorie,
    symbol: t.symbol ?? '▪',
    farbe: t.farbe ?? '#8b6b4a',
    b: t.b,
    h: t.h,
    blockiert: !!t.blockiert,
    ebene: t.ebene ?? null,
    drehung: t.drehung ?? 0,
    extra: t.extra ?? null,
    ressource: !!RESSOURCEN_OBJEKTE[typ],
  };
}

/** Einträge einer Kategorie (inkl. eigener Typen der Karte unter 'Eigene' bzw. ihrer Kategorie) */
export function eintraegeDerKategorie(kategorie, karte = null) {
  const fest = katalog().filter((e) => e.kategorie === kategorie);
  const eigene = karte ? eigeneEintraege(karte).filter((e) => e.kategorie === kategorie || (kategorie === 'Eigene' && !KATEGORIEN.includes(e.kategorie))) : [];
  return [...fest, ...eigene];
}

/** Eigene Objekttypen der Karte (Sammlung typen) als Katalog-Einträge */
export function eigeneEintraege(karte) {
  return [...karte.s('typen')].map(([typ, t]) => ({
    ...objektEintrag(typ, { ...t, kategorie: t.kategorie || 'Eigene', symbol: t.bild ? '🖼' : '✦' }, `eigen:${typ}`),
    eigen: true,
    bild: t.bild ?? null,
  }));
}

export function katalogEintrag(id, karte = null) {
  return katalog().find((e) => e.id === id) ?? (karte ? eigeneEintraege(karte).find((e) => e.id === id) : null) ?? null;
}

/** Infos zu einem Objekttyp (für Zeichnen/Panel) – auch für Typen, die nicht im Katalog stehen. */
export function objektInfo(typ, karte = null) {
  const eigen = karte?.s('typen').get(typ);
  if (eigen) return { typ, name: eigen.name ?? typ, farbe: eigen.farbe ?? '#c080ff', symbol: '✦', kategorie: eigen.kategorie ?? 'Eigene', bekannt: true, eigen: true, bild: eigen.bild ?? null };
  const t = OBJEKT_TYPEN[typ];
  if (t) return { typ, name: t.name, farbe: t.farbe, symbol: t.symbol, kategorie: t.kategorie, bekannt: true };
  const f = FAHRZEUG_MODELLE[typ];
  if (f) return { typ, name: f.name, farbe: FAHRZEUG_FARBE(f.farbe), symbol: '🚗', kategorie: 'Fahrzeuge', bekannt: true };
  if (typ === 'hang') return { typ, name: 'Steiler Hang (unsichtbar)', farbe: '#000', symbol: '⛰', kategorie: 'Terrain', bekannt: true };
  return { typ, name: typ, farbe: '#ff00ff', symbol: '?', kategorie: 'Eigene', bekannt: false };
}

/** Ist dieser Objekttyp dem Spiel bekannt (Möbel-Sprite, Ressource, Fahrzeug, Licht, prozedural)? */
export function istBekannterTyp(typ, karte = null) {
  return objektInfo(typ, karte).bekannt;
}

/** Kachel-Infos zum Zeichen */
export function kachelInfo(zeichen) {
  const k = KACHELN[zeichen];
  return { zeichen, name: KACHEL_KATEGORIE[zeichen]?.[1] ?? k?.name ?? '?', farbe: KACHEL_FARBEN[k?.name] ?? '#f0f', blockiert: !!k?.blockiert, innen: !!k?.innen };
}

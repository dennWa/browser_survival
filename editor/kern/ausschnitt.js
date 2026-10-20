import { ausSchluessel, kopie } from './karte.js';
import { markerZeichen } from './format.js';
import { objektInfo } from './katalog.js';
import { bedeckteKacheln } from './platzierung.js';
import { KACHELN } from '../../gemeinsam/welt/kacheln.js';

/**
 * Ausschnitt-Export für KIs (Phase 8): ein markierter Bereich (wie in Excel) als JSON + lesbarer Text.
 *   bereich   { x0, x1, y0, y1 } inklusive, Text "x 20–40, y 10–25"
 *   raster    ASCII mit Achsen (Spaltennummern oben, Zeilennummern links) – Kacheln + Marker (S, Z, a–z)
 *   belegung  zweites Raster: welche Kachel von welchem Objekt belegt ist (Symbol je Typ, Legende dabei)
 *   objekte   [{ id, typ, x, y, b, h, … }] – id = Editor-ID (stabil im Entwurf) → KI kann gezielt ändern/entfernen
 *   marker, bauwerke, uebergaenge, ankuenfte, tierBereiche, raumFlaechen, raeume (nur benutzte)
 *   pruefsumme  Hash des Bereichs beim Export → der Import warnt, wenn sich dort inzwischen etwas geändert hat
 * Antwort der KI: Aktionsliste (siehe AKTIONEN_ANLEITUNG, kern/kiImport.js).
 */
export const FORMAT_AUSSCHNITT = 'browser-survival-ausschnitt';
export const AUSSCHNITT_VERSION = 1;

export const AKTIONEN_ANLEITUNG = [
  'Antworte mit einer JSON-Liste von Aktionen (nur Koordinaten INNERHALB des Bereichs sind erlaubt). Beispiele:',
  '{"aktion":"setze","typ":"baum","x":23,"y":14}  – Objekt setzen (typ aus objektTypen; Größe/Kollision kommen aus dem Katalog, b/h/drehung/blockiert optional)',
  '{"aktion":"entferne","id":17}  oder  {"aktion":"entferne","typ":"stein","x":30,"y":12}  – Objekt entfernen',
  '{"aktion":"aendere","id":17,"x":24,"y":15,"drehung":90}  – Objekt verschieben/drehen/Eigenschaften ändern',
  '{"aktion":"kachel","x":20,"y":10,"zeichen":"="}  oder mit "b"/"h" für ein Rechteck – Boden setzen (Zeichen siehe legende)',
  '{"aktion":"linie","von":[20,10],"bis":[30,10],"zeichen":"#"}  – Kachel-Linie (z. B. Mauer)',
  '{"aktion":"marker","art":"zombie","x":25,"y":20}  (art: start | zombie | loot + "raum":"a"; zombie optional "anzahl","horde":true)',
  '{"aktion":"entferne","marker":"zombie","x":25,"y":20}  – Marker entfernen',
  '{"aktion":"bauwerk","typ":"zaun","x":21,"y":11}  – kartenfestes Bauwerk (zaun, zauntor, kiste, bett, werkbank, lagerfeuer, beet …)',
  '{"aktion":"raum","buchstabe":"d","name":"Scheune","lootTabelle":"werkstatt"}  – Raum für Loot-Punkte anlegen/ändern',
  '{"aktion":"aendere","id":17,"farbe":"#8b5a2b","textur":"holz"}  – Farbe/Muster EINES Objekts (muster: holz, stein, metall, stoff, gras, streifen, punkte)',
  '{"aktion":"typtextur","typ":"baum","farbe":"#3a6b35","muster":"gras"}  – Farbe/Muster für ALLE Objekte dieses Typs in der Zone (null = Standard)',
  '{"aktion":"bemale","x":20,"y":10,"b":6,"h":4,"farbe":"#7a6a4f"}  – Bodenfarbe (Bemalung) für ein Rechteck; "farbe":null entfernt sie',
  '{"aktion":"wert","pfad":"wetter.regenAnteil","wert":0.8}  – Zonen-Wert (wetter.*, zombie.*, tiere.*, loot.* wie im Inspektor, oder "musik"); "wert":null = Standard',
  '{"aktion":"lootzone","x":20,"y":10,"b":5,"h":4,"name":"Lager","modus":"chance","items":[{"id":"konserve","chance":30,"menge":[1,2]}],"punkte":4,"ort":"innen"}  – Loot-Zone (oder "tabelle":"lager" als Startliste)',
  '{"aktion":"name","ziel":"raum","buchstabe":"a","name":"Scheune"}  – Namen für zone | raum | objekt/uebergang/lootzone (mit "id")',
  '{"aktion":"bodenton","zeichen":",","farbe":"#e8eef2"}  – ALLE Kacheln dieses Zeichens in der Zone einfärben (Thema, z. B. Schnee); null = entfernen',
  '{"aktion":"prefab","name":"Wohnhaus","x":20,"y":10}  – Prefab einsetzen (linke obere Ecke); Namen siehe "prefabs" im Kontext',
  'Zombies nur draußen (nicht auf Innenböden . : +). Türen T nicht zustellen. Jede Aktion wird vor dem Übernehmen geprüft und als Vorschau gezeigt.',
];

/** FNV-1a über einen Text → kurze Hex-Prüfsumme */
export function pruefsumme(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

const imBereich = (b, x, y) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1;
const mitteIm = (b, o) => imBereich(b, Math.floor(o.x + (o.b ?? 1) / 2 - 1e-9), Math.floor(o.y + (o.h ?? 1) / 2 - 1e-9));

/** Bereich aus Rechteck { x, y, b, h } (auf die Zone begrenzt) */
export function bereichAus(karte, r) {
  const x0 = Math.max(0, r.x);
  const y0 = Math.max(0, r.y);
  const x1 = Math.min(karte.breite - 1, r.x + r.b - 1);
  const y1 = Math.min(karte.hoehe - 1, r.y + r.h - 1);
  if (x1 < x0 || y1 < y0) throw new Error('Bereich liegt außerhalb der Zone');
  return { x0, x1, y0, y1 };
}

export const bereichText = (b) => `x ${b.x0}–${b.x1}, y ${b.y0}–${b.y1}`;

/** Inhalt des Bereichs (für Prüfsumme und Export) */
export function inhaltDesBereichs(karte, b) {
  const objekte = [...karte.s('objekte')].filter(([, o]) => mitteIm(b, o)).map(([id, o]) => ({ id, ...kopie(o) }));
  const marker = [...karte.s('marker')]
    .map(([k, m]) => [ausSchluessel(k), m])
    .filter(([[x, y]]) => imBereich(b, x, y))
    .map(([[x, y], m]) => ({ x, y, ...kopie(m) }));
  const bauwerke = [...karte.s('bauwerke')].filter(([, w]) => imBereich(b, w.tx, w.ty)).map(([id, w]) => ({ id, ...kopie(w) }));
  const bereiche = (s) => [...karte.s(s)].filter(([, r]) => r.x <= b.x1 && r.x + r.b - 1 >= b.x0 && r.y <= b.y1 && r.y + r.h - 1 >= b.y0).map(([id, r]) => ({ id, ...kopie(r) }));
  const zeilen = [];
  for (let y = b.y0; y <= b.y1; y++) zeilen.push(karte.zellen.slice(y * karte.breite + b.x0, y * karte.breite + b.x1 + 1).join(''));
  const hoehen = [];
  for (let y = b.y0; y <= b.y1; y++) hoehen.push(karte.hoehen.slice(y * karte.breite + b.x0, y * karte.breite + b.x1 + 1));
  return { zeilen, hoehen, objekte, marker, bauwerke, uebergaenge: bereiche('uebergaenge'), tierBereiche: bereiche('tierBereiche'), raumFlaechen: bereiche('raumFlaechen'), ankuenfte: [...karte.s('ankuenfte')].filter(([, p]) => imBereich(b, p.x, p.y)).map(([name, p]) => ({ name, ...p })) };
}

export function bereichsPruefsumme(karte, b) {
  return pruefsumme(JSON.stringify(inhaltDesBereichs(karte, b)));
}

/** ASCII-Raster mit Achsen: Spaltennummern (Hunderter/Zehner/Einer) oben, Zeilennummern links */
export function rasterMitAchsen(b, zeileAn) {
  const breite = String(b.y1).length;
  const rand = ' '.repeat(breite + 1);
  const spalten = [];
  for (let x = b.x0; x <= b.x1; x++) spalten.push(String(x).padStart(String(b.x1).length, ' '));
  const kopf = [];
  for (let stelle = 0; stelle < String(b.x1).length; stelle++) kopf.push(`${rand}${spalten.map((s) => s[stelle]).join('')}`);
  const zeilen = [];
  for (let y = b.y0; y <= b.y1; y++) zeilen.push(`${String(y).padStart(breite, ' ')} ${zeileAn(y)}`);
  return [...kopf, ...zeilen];
}

const SYMBOLE = 'ABCDEFGHIJKLMNOPQRUVWXYabcdefghijklmnopqrstuvwxyz0123456789@$%&*!?';

/** Ausschnitt als JSON-Objekt */
export function ausschnitt(karte, rechteck, { jetzt = new Date().toISOString() } = {}) {
  const b = bereichAus(karte, rechteck);
  const inhalt = inhaltDesBereichs(karte, b);
  const markerAn = new Map(inhalt.marker.map((m) => [`${m.x},${m.y}`, m]));
  const raster = rasterMitAchsen(b, (y) => {
    let z = '';
    for (let x = b.x0; x <= b.x1; x++) {
      const m = markerAn.get(`${x},${y}`);
      z += m ? markerZeichen(m) : karte.zellen[y * karte.breite + x];
    }
    return z;
  });
  // Belegung: welches Objekt deckt welche Kachel (Kronen nur in der Mitte, damit Wälder lesbar bleiben)
  const symbolFuer = new Map();
  const belegt = new Map();
  for (const o of inhalt.objekte) {
    if (!symbolFuer.has(o.typ)) symbolFuer.set(o.typ, SYMBOLE[symbolFuer.size % SYMBOLE.length]);
    const kacheln = o.ebene === 'oben' || !(o.blockiert || o.ebene === 'boden') ? [{ x: Math.floor(o.x + o.b / 2), y: Math.floor(o.y + o.h / 2) }] : bedeckteKacheln(o);
    for (const { x, y } of kacheln.length ? kacheln : [{ x: Math.floor(o.x), y: Math.floor(o.y) }]) if (imBereich(b, x, y)) belegt.set(`${x},${y}`, symbolFuer.get(o.typ));
  }
  for (const w of inhalt.bauwerke) {
    const k = `bauwerk:${w.typ}`;
    if (!symbolFuer.has(k)) symbolFuer.set(k, SYMBOLE[symbolFuer.size % SYMBOLE.length]);
    belegt.set(`${w.tx},${w.ty}`, symbolFuer.get(k));
  }
  const belegung = rasterMitAchsen(b, (y) => {
    let z = '';
    for (let x = b.x0; x <= b.x1; x++) z += belegt.get(`${x},${y}`) ?? '·';
    return z;
  });
  const raeume = {};
  for (const r of [...inhalt.marker.map((m) => m.raum), ...inhalt.raumFlaechen.map((f) => f.raum)]) if (r && karte.s('raeume').has(r)) raeume[r] = kopie(karte.s('raeume').get(r));
  const ergebnis = {
    format: FORMAT_AUSSCHNITT,
    formatVersion: AUSSCHNITT_VERSION,
    exportiert: jetzt,
    zone: { id: karte.id, name: karte.name, breite: karte.breite, hoehe: karte.hoehe },
    bereich: { ...b, text: bereichText(b) },
    pruefsumme: pruefsumme(JSON.stringify(inhalt)),
    legende: {
      kacheln: Object.fromEntries(Object.keys(KACHELN).map((z) => [z, `${KACHELN[z].name}${KACHELN[z].blockiert ? ' (blockiert)' : ''}${KACHELN[z].innen ? ' (innen)' : ''}`])),
      marker: { S: 'Spieler-Start', Z: 'Zombie-Spawn', 'a-z': 'Loot-Punkt des Raums (siehe raeume)' },
      belegung: Object.fromEntries([...symbolFuer].map(([typ, sym]) => [sym, typ.startsWith('bauwerk:') ? `Bauwerk ${typ.slice(8)}` : `${typ} (${objektInfo(typ, karte).name})`])),
    },
    raster,
    belegung,
    objekte: inhalt.objekte,
    marker: inhalt.marker,
    bauwerke: inhalt.bauwerke,
    uebergaenge: inhalt.uebergaenge,
    ankuenfte: inhalt.ankuenfte,
    tierBereiche: inhalt.tierBereiche,
    raumFlaechen: inhalt.raumFlaechen,
    raeume,
    anleitung: AKTIONEN_ANLEITUNG,
  };
  if (inhalt.hoehen.some((z) => z.some((h) => h !== 0))) ergebnis.hoehen = inhalt.hoehen.map((z) => z.join(' '));
  return ergebnis;
}

/** Derselbe Ausschnitt als Text (Markdown) zum Einfügen in einen KI-Chat */
export function ausschnittText(a) {
  const liste = (titel, eintraege, f) => (eintraege.length ? [`## ${titel}`, ...eintraege.map(f), ''] : []);
  return [
    `# Ausschnitt „${a.zone.name}“ (${a.zone.id}) – ${a.bereich.text}`,
    `Zone ${a.zone.breite} × ${a.zone.hoehe} Kacheln, Format ${a.format} v${a.formatVersion}, Prüfsumme ${a.pruefsumme}.`,
    'Koordinaten = Kacheln (1 Kachel = 1 m), x nach rechts, y nach unten.',
    '',
    '## Kacheln (Spaltennummern oben senkrecht lesen, Zeilennummern links)',
    '```',
    ...a.raster,
    '```',
    `Legende: ${Object.entries(a.legende.kacheln).map(([z, n]) => `${z} ${n}`).join(' · ')} · S Start · Z Zombie · a–z Loot`,
    '',
    '## Belegung durch Objekte (· = frei)',
    '```',
    ...a.belegung,
    '```',
    `Legende: ${Object.entries(a.legende.belegung).map(([s, n]) => `${s} ${n}`).join(' · ') || '–'}`,
    '',
    ...liste('Objekte', a.objekte, (o) => `- id ${o.id}: ${JSON.stringify(Object.fromEntries(Object.entries(o).filter(([k]) => k !== 'id')))}`),
    ...liste('Marker', a.marker, (m) => `- ${JSON.stringify(m)}`),
    ...liste('Bauwerke', a.bauwerke, (w) => `- id ${w.id}: ${JSON.stringify(w)}`),
    ...liste('Übergänge', a.uebergaenge, (u) => `- ${JSON.stringify(u)}`),
    ...liste('Ankünfte', a.ankuenfte, (p) => `- ${JSON.stringify(p)}`),
    ...liste('Hasen-Bereiche', a.tierBereiche, (t) => `- ${JSON.stringify(t)}`),
    ...liste('Räume', Object.entries(a.raeume), ([k, r]) => `- ${k}: ${JSON.stringify(r)}`),
    '## So antwortest du',
    ...a.anleitung.map((z) => `- ${z}`),
    `- Gib als erste Aktion {"aktion":"bereich","zone":"${a.zone.id}","x0":${a.bereich.x0},"x1":${a.bereich.x1},"y0":${a.bereich.y0},"y1":${a.bereich.y1},"pruefsumme":"${a.pruefsumme}"} an.`,
    '',
  ].join('\n');
}

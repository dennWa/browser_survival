import { KACHELN, MARKER, istKachel, istLootMarker } from '../../gemeinsam/welt/kacheln.js';
import { EditorKarte, markerSchluessel, ausSchluessel, kopie } from './karte.js';
import { Verlauf } from './verlauf.js';
import { steileKacheln } from './terrain.js';
import { alsRechtecke } from './raster.js';
import { mitModell, mitAudio } from './bibliothek.js';
import { pruefeKlang } from '../../gemeinsam/audio/klanglandschaft.js';

/** Farbe im Format #rrggbb */
export const FARBE = /^#[0-9a-fA-F]{6}$/;

/**
 * Dateiformate des Editors (alle JSON, alle mit Versionsnummer → ältere Stände werden erkannt):
 *
 *  1. Karten-Export  { format: 'browser-survival-karte', formatVersion, _liesmich: [...], …Kartendefinition }
 *     = genau das Spielformat (server/spiel/karten/*.js, kartenLader.verarbeiteKarte) + optionale Erweiterungen.
 *     Der Spiel-Lader ignoriert unbekannte Felder → abwärtskompatibel. Für Menschen UND KIs (Felder in LIESMICH_TEXT).
 *  2. Entwurf        { format: 'browser-survival-entwurf', formatVersion, karte: EditorKarte.alsJson(), verlauf, meta }
 *     = Arbeitsstand mit internen IDs + Rückgängig-Verlauf (über Sitzungen hinweg).
 *  3. Rohe Kartendefinition (ohne format-Feld) – z. B. aus einer Spieldatei kopiert – wird wie 1. gelesen.
 *
 * Erweiterungen (alle optional, Kachelkoordinaten):
 *   zombieSpawns  [{ x, y, anzahl?, respawnZeit?, horde? }]  Eigenschaften zu 'Z'-Markern an dieser Stelle
 *   bauwerke      [{ typ, tx, ty, drehung? }]                 kartenfeste Bauwerke (BAUWERKE: zaun, kiste, bett …)
 *   tierBereiche  [{ x, y, b, h, art: 'hase', anzahl, respawnZeit? }]  Hasen nur dort (sonst überall auf Gras)
 *   raumFlaechen  [{ raum, x, y, b, h }]                      markierte Raumflächen (raum = Buchstabe in raeume)
 *   raeume.X      + spawnChance?, respawnZeit?                Loot-Häufigkeit je Raum
 *   einstellungen { wetter:{…}, zombie:{…}, tiere:{…}, loot:{…} }  Zonen-Werte, überschreiben konfiguration (nur gesetzte)
 *   musik         'ordner'                                    Musik-Ordner (client/musik/<ordner>/), Standard = id
 *   terrain       { hoehen: ["0 0 1 …", …], steil: [[x,y],…] } Höhen je Kachel (m); Klippenfüße blockiert (gemeinsam/welt/gelaende.js)
 *   typen         { typId: { name, kategorie, b, h, blockiert, ebene, farbe?, bild?, modus?, asset?, glb? } }  eigene Objekttypen
 *                 (asset = ID in der Projekt-Bibliothek, kern/bibliothek.js; Export bettet das Modell als glb ein)
 *   klaenge       [{ id, name, audio|daten|datei, art, … }]   Klanglandschaft (Phase 4, gemeinsam/audio/klanglandschaft.js)
 *   texturen      { typId: { farbe?, muster? } }              Bemalung pro Typ
 *   bemalung      { '#rrggbb': [[x, y, b, h], …] }           Farbe auf dem Boden (Rechtecke je Farbe)
 */
export const FORMAT_KARTE = 'browser-survival-karte';
export const FORMAT_ENTWURF = 'browser-survival-entwurf';
export const FORMAT_VERSION = 1;

export const LIESMICH_TEXT = [
  'Karte für Browser Survival (Map-Editor-Export). Koordinaten in Kacheln (1 Kachel = 1 m), x nach rechts, y nach unten, (0,0) = oben links.',
  'kacheln: ASCII-Raster, eine Zeichenkette je Zeile (y), alle gleich lang. Zeichen: , Gras  _ Asphalt  = Straße  - Gehweg  . Fliesen(innen)  : Beton(innen)  + Holz(innen)  T Tür  # Wand  F Fenster  ~ Wasser.',
  'Marker im Raster: S = Spieler-Start (mind. 1), Z = Zombie-Spawn (nur draußen), a-z = Loot-Punkt des Raums mit diesem Buchstaben (siehe raeume).',
  'raeume: { buchstabe: { name, lootTabelle, spawnChance?, respawnZeit? } } – lootTabelle aus server/spiel/konfiguration/lootTabellen.js.',
  'objekte: [{ typ, x, y, b, h, blockiert?, ebene?, drehung?, … }] – Rechteck in Kacheln (Brüche erlaubt). ebene: moebel (Standard) | boden (flach, Teppich) | oben (Baumkrone) | licht. drehung in Grad (0/90/180/270).',
  'uebergaenge: [{ x, y, b, h, ziel, ankunft, name }] – Rechteck am Rand; wer es betritt, wechselt in Zone ziel zum Ankunftspunkt ankunft. ankuenfte: { name: { x, y } } (nicht in einem Übergang, nicht in einer Wand).',
  'Erweiterungen (optional): zombieSpawns [{x,y,anzahl,respawnZeit,horde}], bauwerke [{typ,tx,ty,drehung}], tierBereiche [{x,y,b,h,art,anzahl,respawnZeit}], raumFlaechen [{raum,x,y,b,h}], einstellungen {wetter,zombie,tiere,loot}, musik, terrain {hoehen,steil}, typen, texturen, bemalung {"#farbe":[[x,y,b,h]]}.',
  'Änderungen zurückgeben: am besten als Aktionsliste (siehe editor/LIESMICH.md, Abschnitt "KI-Änderungen"), z. B. [{"aktion":"setze","typ":"baum","x":23,"y":14}].',
];

/**
 * Kartendefinition (Spielformat) → EditorKarte.
 * @returns {{ karte: EditorKarte, warnungen: string[] }}
 */
export function ausDefinition(def) {
  const warnungen = [];
  if (!def || !Array.isArray(def.kacheln) || def.kacheln.length === 0) throw new Error('Keine Karte: Feld "kacheln" fehlt oder ist leer');
  const hoehe = def.kacheln.length;
  const breite = def.kacheln[0].length;
  if (breite === 0) throw new Error('Karte ist leer');
  def.kacheln.forEach((z, y) => {
    if (typeof z !== 'string' || z.length !== breite) throw new Error(`Zeile ${y}: Länge ${z?.length} statt ${breite}`);
  });
  const karte = new EditorKarte({ id: String(def.id ?? 'neue_zone'), name: String(def.name ?? def.id ?? 'Neue Zone'), breite, hoehe });
  const marker = karte.s('marker');
  for (let y = 0; y < hoehe; y++) {
    for (let x = 0; x < breite; x++) {
      const z = def.kacheln[y][x];
      if (istKachel(z)) {
        karte.zellen[y * breite + x] = z;
        continue;
      }
      if (z === MARKER.SPIELER_START) marker.set(markerSchluessel(x, y), { art: 'start' });
      else if (z === MARKER.ZOMBIE) marker.set(markerSchluessel(x, y), { art: 'zombie' });
      else if (istLootMarker(z)) marker.set(markerSchluessel(x, y), { art: 'loot', raum: z });
      else warnungen.push(`Unbekanntes Zeichen "${z}" bei ${x}|${y} → Gras`);
      karte.zellen[y * breite + x] = untergrund(def.kacheln, x, y);
    }
  }
  for (const [k, r] of Object.entries(def.raeume ?? {})) {
    if (!istLootMarker(k)) warnungen.push(`Raum "${k}" ist kein Buchstabe a–z – übersprungen`);
    else karte.s('raeume').set(k, kopie(r));
  }
  for (const o of def.objekte ?? []) {
    if (!o?.typ || ![o.x, o.y, o.b, o.h].every(Number.isFinite)) {
      warnungen.push(`Objekt ${JSON.stringify(o)?.slice(0, 60)} unvollständig – übersprungen`);
      continue;
    }
    karte.s('objekte').set(karte.neueId(), kopie(o));
  }
  for (const u of def.uebergaenge ?? []) karte.s('uebergaenge').set(karte.neueId(), kopie(u));
  for (const [n, p] of Object.entries(def.ankuenfte ?? {})) karte.s('ankuenfte').set(n, { x: p.x, y: p.y });
  // --- Erweiterungen ---
  for (const z of def.zombieSpawns ?? []) {
    const m = marker.get(markerSchluessel(z.x, z.y));
    if (m?.art !== 'zombie') {
      warnungen.push(`zombieSpawns: bei ${z.x}|${z.y} ist kein Z-Marker – Z wird gesetzt`);
      if (!Number.isInteger(z.x) || !Number.isInteger(z.y) || !karte.imFeld(z.x, z.y)) continue;
    }
    const { x, y, ...rest } = z;
    marker.set(markerSchluessel(x, y), { art: 'zombie', ...rest });
  }
  for (const b of def.bauwerke ?? []) karte.s('bauwerke').set(karte.neueId(), kopie(b));
  for (const t of def.tierBereiche ?? []) karte.s('tierBereiche').set(karte.neueId(), kopie(t));
  for (const r of def.raumFlaechen ?? []) karte.s('raumFlaechen').set(karte.neueId(), kopie(r));
  for (const roh of Array.isArray(def.klaenge) ? def.klaenge : []) {
    const k = pruefeKlang(roh, { breite: karte.breite, hoehe: karte.hoehe });
    if (!k) {
      warnungen.push(`Klang „${roh?.name ?? '?'}“ ohne gültige Quelle – übersprungen`);
      continue;
    }
    if (roh.audio && !k.audio && /^a_/.test(roh.audio)) k.audio = roh.audio; // Export: daten + audio-ID → Bibliothek erkennt die Datei
    delete k.id;
    karte.s('klaenge').set(karte.neueId(), k);
  }
  for (const [k, t] of Object.entries(def.typen ?? {})) karte.s('typen').set(k, kopie(t));
  for (const [k, t] of Object.entries(def.texturen ?? {})) karte.s('texturen').set(k, kopie(t));
  for (const [farbe, rechtecke] of Object.entries(def.bemalung ?? {})) {
    if (!FARBE.test(farbe) || !Array.isArray(rechtecke)) continue;
    for (const [x0, y0, bb, hh] of rechtecke) for (let y = y0; y < y0 + hh; y++) for (let x = x0; x < x0 + bb; x++) if (karte.imFeld(x, y)) karte.s('bemalung').set(markerSchluessel(x, y), farbe.toLowerCase());
  }
  if (def.einstellungen && typeof def.einstellungen === 'object') karte.werte.einstellungen = kopie(def.einstellungen);
  if (typeof def.musik === 'string') karte.werte.musik = def.musik;
  if (Array.isArray(def.terrain?.hoehen)) {
    def.terrain.hoehen.slice(0, hoehe).forEach((zeile, y) => {
      String(zeile)
        .trim()
        .split(/\s+/)
        .slice(0, breite)
        .forEach((w, x) => (karte.hoehen[y * breite + x] = Number(w) || 0));
    });
  }
  return { karte, warnungen };
}

/** Wie der Spiel-Lader: Untergrund eines Markers = erster begehbarer Nachbar (links, rechts, oben, unten), sonst Fliesen. */
function untergrund(zeilen, x, y) {
  const nachbarn = [zeilen[y][x - 1], zeilen[y][x + 1], zeilen[y - 1]?.[x], zeilen[y + 1]?.[x]];
  return nachbarn.find((z) => z !== undefined && istKachel(z) && !KACHELN[z].blockiert) ?? '.';
}

/** Zeichen, das ein Marker im ASCII-Raster bekommt */
export function markerZeichen(m) {
  return m.art === 'start' ? MARKER.SPIELER_START : m.art === 'zombie' ? MARKER.ZOMBIE : m.raum;
}

/** EditorKarte → Kartendefinition im Spielformat (+ Erweiterungen, nur wenn belegt). */
export function nachDefinition(karte) {
  const { breite, hoehe } = karte;
  const zeilen = [];
  for (let y = 0; y < hoehe; y++) zeilen.push(karte.zellen.slice(y * breite, (y + 1) * breite));
  const zombieSpawns = [];
  const marker = [...karte.s('marker')].map(([k, m]) => [ausSchluessel(k), m]).sort(([[ax, ay]], [[bx, by]]) => ay - by || ax - bx);
  for (const [[x, y], m] of marker) {
    if (!karte.imFeld(x, y)) continue;
    zeilen[y][x] = markerZeichen(m);
    if (m.art === 'zombie') {
      const { art, ...rest } = m;
      if (Object.keys(rest).length) zombieSpawns.push({ x, y, ...rest });
    }
  }
  const sortiert = (map) => [...map].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const def = {
    id: karte.id,
    name: karte.name,
    kacheln: zeilen.map((z) => z.join('')),
    raeume: Object.fromEntries(sortiert(karte.s('raeume')).map(([k, r]) => [k, kopie(r)])),
    objekte: [...karte.s('objekte').values()].map(kopie),
  };
  if (karte.s('uebergaenge').size) def.uebergaenge = [...karte.s('uebergaenge').values()].map(kopie);
  if (karte.s('ankuenfte').size) def.ankuenfte = Object.fromEntries([...karte.s('ankuenfte')].map(([n, p]) => [n, { x: p.x, y: p.y }]));
  if (zombieSpawns.length) def.zombieSpawns = zombieSpawns;
  if (karte.s('bauwerke').size) def.bauwerke = [...karte.s('bauwerke').values()].map(kopie);
  if (karte.s('tierBereiche').size) def.tierBereiche = [...karte.s('tierBereiche').values()].map(kopie);
  if (karte.s('raumFlaechen').size) def.raumFlaechen = [...karte.s('raumFlaechen').values()].map(kopie);
  if (karte.s('klaenge').size) def.klaenge = [...karte.s('klaenge')].map(([id, k]) => mitAudio({ id, ...kopie(k) })); // Bibliotheks-Audio → daten eingebettet
  const einstellungen = bereinigeLeere(kopie(karte.werte.einstellungen ?? {}));
  if (Object.keys(einstellungen).length) def.einstellungen = einstellungen;
  if (karte.werte.musik) def.musik = karte.werte.musik;
  if (karte.hoehen.some((h) => h !== 0)) {
    def.terrain = {
      hoehen: zeilen.map((_, y) => karte.hoehen.slice(y * breite, (y + 1) * breite).map((h) => Math.round(h * 100) / 100).join(' ')),
      steil: steileKacheln(karte),
    };
  }
  if (karte.s('typen').size) def.typen = Object.fromEntries(sortiert(karte.s('typen')).map(([k, t]) => [k, mitModell(kopie(t))])); // Bibliotheks-Modell → glb eingebettet
  if (karte.s('bemalung').size) {
    const jeFarbe = new Map();
    for (const [k, f] of karte.s('bemalung')) {
      const [x, y] = ausSchluessel(k);
      if (!jeFarbe.has(f)) jeFarbe.set(f, []);
      jeFarbe.get(f).push({ x, y });
    }
    def.bemalung = Object.fromEntries([...jeFarbe].sort(([a], [b]) => (a < b ? -1 : 1)).map(([f, punkte]) => [f, alsRechtecke(punkte).map((r) => [r.x, r.y, r.b, r.h])]));
  }
  if (karte.s('texturen').size) def.texturen = Object.fromEntries(sortiert(karte.s('texturen')).map(([k, t]) => [k, kopie(t)]));
  return def;
}

function bereinigeLeere(o) {
  for (const [k, v] of Object.entries(o)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      bereinigeLeere(v);
      if (Object.keys(v).length === 0) delete o[k];
    } else if (v === undefined || v === null) delete o[k];
  }
  return o;
}

/** Karten-Export (für Menschen & KIs): Spielformat + format/Version/Erklärung oben. */
export function exportJson(karte, { jetzt = new Date().toISOString() } = {}) {
  return { format: FORMAT_KARTE, formatVersion: FORMAT_VERSION, exportiert: jetzt, _liesmich: LIESMICH_TEXT, ...nachDefinition(karte) };
}

/** Entwurf (Arbeitsstand + Verlauf) als JSON-Objekt */
export function entwurfJson(karte, verlauf, meta = {}) {
  return { format: FORMAT_ENTWURF, formatVersion: FORMAT_VERSION, meta: { ...meta, gespeichert: meta.gespeichert ?? new Date().toISOString() }, karte: karte.alsJson(), verlauf: verlauf?.alsJson() ?? null };
}

/**
 * Datei-Inhalt (Text oder Objekt) lesen: Entwurf, Karten-Export oder rohe Kartendefinition.
 * @returns {{ art: 'entwurf'|'karte', karte, verlauf, warnungen, meta }}
 */
export function ladeDatei(inhalt) {
  let j = inhalt;
  if (typeof inhalt === 'string') {
    try {
      j = JSON.parse(inhalt);
    } catch (fehler) {
      throw new Error(`Keine gültige JSON-Datei (${fehler.message})`);
    }
  }
  if (!j || typeof j !== 'object') throw new Error('Leere Datei');
  if (j.formatVersion !== undefined && !(Number.isInteger(j.formatVersion) && j.formatVersion >= 1)) throw new Error(`Unbekannte Formatversion "${j.formatVersion}"`);
  if (j.formatVersion > FORMAT_VERSION) throw new Error(`Datei ist neuer (Formatversion ${j.formatVersion}) als dieser Editor (${FORMAT_VERSION}) – bitte Editor aktualisieren`);
  const warnungen = [];
  if (j.formatVersion !== undefined && j.formatVersion < FORMAT_VERSION) warnungen.push(`Älterer Stand (Formatversion ${j.formatVersion}) – wurde umgewandelt`);
  if (j.format === FORMAT_ENTWURF) {
    return { art: 'entwurf', karte: EditorKarte.ausJson(j.karte), verlauf: Verlauf.ausJson(j.verlauf), warnungen, meta: j.meta ?? {} };
  }
  if (j.format && j.format !== FORMAT_KARTE) throw new Error(`Unbekanntes Format "${j.format}"`);
  const { karte, warnungen: w } = ausDefinition(j);
  return { art: 'karte', karte, verlauf: new Verlauf(), warnungen: [...warnungen, ...w], meta: {} };
}

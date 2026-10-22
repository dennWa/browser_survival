import { KACHEL_GROESSE, ZONE_MAX_KACHELN } from '../../../gemeinsam/konstanten.js';
import { KACHELN, MARKER, istKachel, istLootMarker } from '../../../gemeinsam/welt/kacheln.js';
import { BAUWERKE } from '../../../gemeinsam/welt/bauwerke.js';
import { liesHoehen, klippenFuesse } from '../../../gemeinsam/welt/gelaende.js';
import { pruefeKlang } from '../../../gemeinsam/audio/klanglandschaft.js';
import { pruefeLootZone, punkteDerZone } from './lootZonen.js';
import { pruefeZonenEinstellungen } from './zonenEinstellungen.js';
import { STADTRAND } from './stadtrand.js';
import { WALDWEG } from './waldweg.js';
import { SCHNEELAND } from './schneeland.js';

/**
 * Registrierte Karten (= Zonen der offenen Welt). Neue Karte: Datei in diesem Ordner anlegen (von Hand, per
 * Generator in werkzeuge/karten/ oder aus Tiled: `npm run karte:import -- datei.tmj`) und hier eintragen.
 * Zonen sind über `uebergaenge` (Kachel-Rechteck am Rand → Zielzone + Ankunftspunkt) verbunden.
 */
export const KARTEN = Object.freeze({
  stadtrand: STADTRAND,
  waldweg: WALDWEG,
  schneeland: SCHNEELAND,
});

/**
 * Wandelt eine Kartendefinition (ASCII) in nutzbare Daten um.
 * @returns {{ daten, spielerStarts, zombieSpawns, lootPunkte, ankuenfte, einstellungen, bauwerke, tierBereiche }}
 *   daten        → geht an Client und Welt (Kacheln, Raumnamen, Objekte, Übergänge – keine Spawns/Loot-Infos)
 *   spielerStarts/zombieSpawns/lootPunkte → bleiben auf dem Server (Pixelkoordinaten, Kachelmitte)
 *   ankuenfte    → { name: {x, y} } (Pixel, Kachelmitte): wo man ankommt, wenn man aus einer anderen Zone kommt
 *
 * Übergänge (definition.uebergaenge): [{ x, y, b, h, ziel, ankunft, name }] in Kacheln – wer das Rechteck betritt,
 * wechselt in Zone `ziel` und landet dort bei `ankuenfte[ankunft]`. In daten.uebergaenge zusätzlich in Pixeln (px).
 *
 * Erweiterungen (Map-Editor, alle optional – alte Karten ohne sie verhalten sich wie immer; Format: editor/kern/format.js):
 *   zombieSpawns  [{ x, y, anzahl?, respawnZeit?, horde? }] → Eigenschaften der Z-Marker; anzahl × einstellungen.zombie.dichte
 *                 Zombies je Punkt (zombieSpawns-Einträge doppelt), horde = nachts nur an solchen Punkten
 *   raeume.X.spawnChance / .respawnZeit → je Loot-Punkt dieses Raums (lootSystem)
 *   objekte[].groesse 'klein'|'gross' → feste Größe statt Zufall nach Position
 *   terrain.hoehen ["0 0 1.5 …"] → daten.hoehen (Meter je Kachel, Spiel zeigt sie in 3D); Fuß von Klippen (gemeinsam/welt/gelaende.js)
 *   → unsichtbare Hindernisse (Objekt typ 'hang', ebene 'unsichtbar'). Alte Exporte nur mit terrain.steil [[x, y]] gelten weiter.
 *   bauwerke [{ typ, tx, ty, drehung? }] → kartenfeste Bauwerke ohne Besitzer (SpielWelt setzt sie)
 *   tierBereiche [{ x, y, b, h, art, anzahl, respawnZeit? }] → Hasen nur dort (tierSystem)
 *   einstellungen → Zonen-Werte (zonenEinstellungen.js), musik → daten.musik (Client: Musik-Ordner)
 *   klaenge → daten.klaenge (Klanglandschaft, gemeinsam/audio/klanglandschaft.js; nur mit Datei/eingebetteten Daten)
 *   lootZonen → zusätzliche lootPunkte mit `lootZone` (Regeln: lootZonen.js; nur Server, der Client sieht nur die Items)
 *   schnee true → Schneezone (daten.schnee): Schneefall statt Regen, verschneite Straßen, knirschende Schritte (Kachel '*' = Schnee)
 *   bemalung { '#rrggbb': [[x, y, b, h]] } → daten.bemalung (nur Optik: Client malt es in die Bodentextur)
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
  if (breite > ZONE_MAX_KACHELN || hoehe > ZONE_MAX_KACHELN) throw new Error(`Karte "${definition.id}": ${breite} × ${hoehe} ist zu groß (höchstens ${ZONE_MAX_KACHELN} × ${ZONE_MAX_KACHELN})`);

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
        zombieSpawns.push(...zombiePunkte(definition, x, y, mitte));
      } else if (istLootMarker(zeichen)) {
        const raum = definition.raeume?.[zeichen];
        if (!raum) throw new Error(`Karte "${definition.id}": Loot-Marker "${zeichen}" (${x}|${y}) ohne Raumdefinition`);
        const punkt = { x: mitte(x), y: mitte(y), raum: zeichen, lootTabelle: raum.lootTabelle };
        if (raum.spawnChance >= 0 && raum.spawnChance <= 1) punkt.spawnChance = raum.spawnChance;
        if (raum.respawnZeit > 0) punkt.respawnZeit = raum.respawnZeit;
        lootPunkte.push(punkt);
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
    // Bäume & Steine: klein (1 Holz/Stein) oder groß (2) – feste Zufallsverteilung nach Position (oder fest aus der Karte)
    if (GROESSEN_TYPEN.includes(o.typ)) objekt.groesse = o.groesse === 'klein' || o.groesse === 'gross' ? o.groesse : streuwert(o.x, o.y, 2) < ANTEIL_GROSS ? 'gross' : 'klein';
    // Lampen: Radius (Kacheln), Farbe, Stärke 0..1, Flackern; Kegel-Licht (Map-Editor): Richtung ° (0 = Osten, 90 = Süden), Öffnung 10–170°
    if (o.typ === 'licht') {
      Object.assign(objekt, { ebene: 'licht', radius: o.radius ?? 4, farbe: o.farbe ?? '#ffd9a0', staerke: o.staerke ?? 0.85, flackern: !!o.flackern, mast: !!o.mast });
      if (o.art === 'kegel') Object.assign(objekt, { art: 'kegel', richtung: Number.isFinite(o.richtung) ? ((o.richtung % 360) + 360) % 360 : 90, oeffnung: Number.isFinite(o.oeffnung) ? Math.max(10, Math.min(170, o.oeffnung)) : 60 });
    }
    return objekt;
  });
  // Gelände (Map-Editor): Höhen sind maßgeblich – gesperrt ist der Fuß jeder Klippe; ohne Höhen (alter Export) gilt terrain.steil
  const hoehen = liesHoehen(definition.terrain?.hoehen, breite, hoehe);
  const steil = hoehen ? klippenFuesse(hoehen, breite, hoehe) : Array.isArray(definition.terrain?.steil) ? definition.terrain.steil : [];
  for (const [x, y] of steil) {
    if (Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < breite && y < hoehe) objekte.push({ typ: 'hang', x, y, b: 1, h: 1, blockiert: true, ebene: 'unsichtbar', drehung: 0 });
  }

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

  const bauwerke = (Array.isArray(definition.bauwerke) ? definition.bauwerke : [])
    .filter((b) => BAUWERKE[b?.typ] && imFeld(b.tx, b.ty))
    .map((b) => ({ typ: b.typ, tx: b.tx, ty: b.ty, ...(b.drehung === 1 ? { drehung: 1 } : {}) }));
  const tierBereiche = (Array.isArray(definition.tierBereiche) ? definition.tierBereiche : [])
    .filter((t) => imFeld(t?.x, t?.y) && Number.isInteger(t.b) && Number.isInteger(t.h) && t.b > 0 && t.h > 0 && imFeld(t.x + t.b - 1, t.y + t.h - 1) && Number.isInteger(t.anzahl) && t.anzahl >= 0)
    .map((t) => ({ x: t.x, y: t.y, b: t.b, h: t.h, art: 'hase', anzahl: Math.min(t.anzahl, 100), ...(t.respawnZeit > 0 ? { respawnZeit: t.respawnZeit } : {}) }));
  // Loot-Zonen (Map-Editor 6.2): Punkte fest verteilt auf freien Kacheln (keine Wand/Wasser, kein blockierendes Möbel,
  // kein Klippenfuß), je nach Zone nur innen/außen; der Punkt trägt die Zone (lootSystem würfelt daraus)
  (Array.isArray(definition.lootZonen) ? definition.lootZonen : []).forEach((roh, nr) => {
    const { zone } = pruefeLootZone(roh, { breite, hoehe });
    if (!zone) return;
    const belegt = (x, y) => objekte.some((o) => o.blockiert && o.ebene !== 'oben' && x + 0.5 > o.x && x + 0.5 < o.x + o.b && y + 0.5 > o.y && y + 0.5 < o.y + o.h);
    const kachel = (x, y) => {
      const k = KACHELN[kacheln[y]?.[x]];
      return { frei: !!k && !k.blockiert && !k.wasser && !belegt(x, y), innen: !!k?.innen };
    };
    for (const [x, y] of punkteDerZone(zone, kachel, nr)) {
      const punkt = { x: mitte(x), y: mitte(y), lootZone: zone, zoneNr: nr };
      if (zone.respawnZeit) punkt.respawnZeit = zone.respawnZeit;
      lootPunkte.push(punkt);
    }
  });

  const daten = { id: definition.id, name: definition.name, breite, hoehe, kachelGroesse, kacheln, raeume, objekte, uebergaenge };
  if (hoehen) daten.hoehen = hoehen;
  if (definition.schnee === true) daten.schnee = true; // Schneezone: Schneefall statt Regen, Schritte knirschen, Straßen verschneit (Optik)
  const typen = pruefeTypen(definition.typen);
  if (typen) daten.typen = typen;
  if (typeof definition.musik === 'string' && /^[a-z0-9_-]{1,40}$/i.test(definition.musik)) daten.musik = definition.musik;
  const klaenge = (Array.isArray(definition.klaenge) ? definition.klaenge : []).map((k) => pruefeKlang(k, { breite, hoehe })).filter((k) => k && (k.datei || k.daten));
  if (klaenge.length) daten.klaenge = klaenge;
  const bemalung = pruefeBemalung(definition.bemalung, breite, hoehe);
  if (bemalung) daten.bemalung = bemalung;

  return {
    daten,
    spielerStarts,
    zombieSpawns,
    lootPunkte,
    ankuenfte,
    einstellungen: pruefeZonenEinstellungen(definition.einstellungen),
    bauwerke,
    tierBereiche,
  };
}

/**
 * Eigene Objekttypen mit 3D-Modell (Map-Editor). Nur Anzeige: glbDatei = Pfad unter client/assets/eigene/ (karte:editor legt
 * die Datei an), glb = eingebettet (Testlauf im Editor), animation = Leerlauf-Clip (5.3). Typen ohne Modell brauchen den Client
 * nicht → fallen weg.
 */
function pruefeTypen(roh) {
  if (!roh || typeof roh !== 'object') return null;
  const ergebnis = {};
  for (const [id, t] of Object.entries(roh)) {
    if (!/^[a-z0-9_]{1,40}$/.test(id) || !t || typeof t !== 'object') continue;
    const e = {};
    if (typeof t.glbDatei === 'string' && /^assets\/eigene\/[a-z0-9_/-]{1,120}\.glb$/.test(t.glbDatei)) e.glbDatei = t.glbDatei;
    else if (typeof t.glb === 'string' && t.glb.startsWith('data:model/gltf-binary;base64,')) e.glb = t.glb;
    if (!e.glbDatei && !e.glb) continue;
    if (t.hoehe3d > 0 && t.hoehe3d <= 20) e.hoehe3d = t.hoehe3d;
    // Leerlauf-Animation (Map-Editor 5.3): Name eines Clips im Modell, spielt im Spiel als Schleife
    if (typeof t.animation === 'string' && /^[^<>"\\]{1,60}$/.test(t.animation)) e.animation = t.animation;
    ergebnis[id] = e;
  }
  return Object.keys(ergebnis).length ? ergebnis : null;
}

/** Bemalung prüfen: nur #rrggbb-Farben, ganzzahlige Rechtecke in der Karte. @returns Objekt oder null */
function pruefeBemalung(roh, breite, hoehe) {
  if (!roh || typeof roh !== 'object') return null;
  const ergebnis = {};
  for (const [farbe, liste] of Object.entries(roh)) {
    if (!/^#[0-9a-f]{6}$/i.test(farbe) || !Array.isArray(liste)) continue;
    const ok = liste.filter((r) => Array.isArray(r) && r.length === 4 && r.every(Number.isInteger) && r[0] >= 0 && r[1] >= 0 && r[2] > 0 && r[3] > 0 && r[0] + r[2] <= breite && r[1] + r[3] <= hoehe);
    if (ok.length) ergebnis[farbe.toLowerCase()] = ok.map((r) => [...r]);
  }
  return Object.keys(ergebnis).length ? ergebnis : null;
}

/**
 * Zombie-Spawnpunkte eines Z-Markers: anzahl (zombieSpawns-Erweiterung, Standard 1) × Zonen-Dichte, Rest per festem Zufall.
 * Jeder Eintrag ist ein eigener Spawnpunkt (eigener Respawn) an derselben Stelle.
 */
function zombiePunkte(definition, x, y, mitte) {
  const extra = (Array.isArray(definition.zombieSpawns) ? definition.zombieSpawns : []).find((z) => z?.x === x && z?.y === y) ?? {};
  const dichte = pruefeZonenEinstellungen(definition.einstellungen).zombie?.dichte ?? 1;
  const anzahl = (Number.isInteger(extra.anzahl) && extra.anzahl > 0 ? Math.min(extra.anzahl, 20) : 1) * dichte;
  const n = Math.floor(anzahl) + (streuwert(x, y, 3) < anzahl - Math.floor(anzahl) ? 1 : 0);
  const punkt = { x: mitte(x), y: mitte(y) };
  if (extra.respawnZeit > 0) punkt.respawnZeit = extra.respawnZeit;
  if (extra.horde === true) punkt.horde = true;
  return Array.from({ length: n }, () => ({ ...punkt }));
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
const GROESSEN_TYPEN = ['baum', 'baum_herbst', 'tanne', 'stein'];

/** Fester Pseudo-Zufallswert 0..1 aus einer Position (gleiche Karte → gleiche Auswahl, auf Server und Client). */
function streuwert(x, y, salz) {
  const n = Math.sin(x * 127.1 + y * 311.7 + salz * 74.7) * 43758.5453;
  return n - Math.floor(n);
}

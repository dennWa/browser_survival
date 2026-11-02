import { KACHELN, istKachel } from '../../gemeinsam/welt/kacheln.js';
import { linie, rasteEin, pinsel, fuellen, nurImFeld, kachelOps } from '../../editor/kern/raster.js';
import { begrenzeTueren } from '../../editor/kern/wand.js';
import { katalogEintrag, objektInfo, istBekannterTyp } from '../../editor/kern/katalog.js';
import { markerSchluessel, ausSchluessel, kopie } from '../../editor/kern/karte.js';
import { terrainHeben, terrainGlaetten, terrainEbnen } from '../../editor/kern/terrain.js';
import { spielordnerTyp } from '../../editor/kern/spielordner.js';
import { eingebauteVorlagen } from '../../editor/kern/lootVorlagen.js';
import { neuerKlang } from '../../gemeinsam/audio/klanglandschaft.js';
import { pruefeSpawnpunkt } from '../../server/spiel/karten/spawnpunkte.js';
import { kopiere, einfuegeOps, loescheOps as loescheBereichOps } from '../../editor/kern/auswahl.js';

/**
 * Bau-Aktionen des Studios – reine Funktionen (umgebungsfrei, Tests: tests/studio.test.js): Karte + Parameter → Liste von
 * Operationen für EditorKarte.anwenden (editor/kern/karte.js). UI-Werkzeuge, KI-Werkzeuge und MCP benutzen genau diese
 * Funktionen über die Befehlsschicht (studio/kern/dokument.js `aendere`). Koordinaten in Kacheln.
 */
export const SKALIERUNG_MIN = 0.25;
export const SKALIERUNG_MAX = 4;
const r3 = (v) => Math.round(v * 1000) / 1000;
const ganz = (v) => Math.round(Number(v));

/** Rechteck auf die Karte beschneiden; null wenn leer */
export function imFeld(karte, { x, y, b, h }) {
  const x0 = Math.max(0, ganz(x));
  const y0 = Math.max(0, ganz(y));
  const x1 = Math.min(karte.breite, ganz(x) + Math.max(1, ganz(b)));
  const y1 = Math.min(karte.hoehe, ganz(y) + Math.max(1, ganz(h)));
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, b: x1 - x0, h: y1 - y0 } : null;
}

const pruefeZeichen = (z) => {
  if (!istKachel(z)) throw new Error(`Unbekannte Kachel „${z}“`);
  return z;
};

/** Rechteck mit einer Kachel füllen */
export function rechteckOps(karte, r, zeichen) {
  pruefeZeichen(zeichen);
  const rr = imFeld(karte, r);
  if (!rr) return [];
  const ops = [];
  for (let y = rr.y; y < rr.y + rr.h; y++) for (let x = rr.x; x < rr.x + rr.b; x++) ops.push({ s: 'kachel', i: karte.index(x, y), neu: zeichen });
  return ops;
}

/** Pinsel (rund) an einer Stelle */
export function pinselOps(karte, x, y, groesse, zeichen) {
  pruefeZeichen(zeichen);
  return kachelOps(karte, nurImFeld(karte, pinsel(ganz(x), ganz(y), groesse, true)), zeichen);
}

/** Zusammenhängende Fläche gleicher Kacheln füllen */
export function fuellOps(karte, x, y, zeichen) {
  pruefeZeichen(zeichen);
  if (!karte.imFeld(ganz(x), ganz(y))) return [];
  const alt = karte.kachelAn(ganz(x), ganz(y));
  if (alt === zeichen) return [];
  const punkte = fuellen(ganz(x), ganz(y), (px, py) => karte.kachelAn(px, py) === alt);
  return kachelOps(karte, punkte, zeichen);
}

/** Gerade Wand (rastet waagerecht/senkrecht/45° ein). art: wand | fenster | tuer (oder Kachelzeichen) */
export function wandOps(karte, a, b, art = 'wand') {
  const zeichen = { wand: '#', fenster: 'F', tuer: 'T' }[art] ?? art;
  if (!['#', 'F', 'T'].includes(zeichen)) throw new Error('Wand-Art: wand, fenster oder tuer');
  const e = rasteEin(ganz(a.x), ganz(a.y), ganz(b.x), ganz(b.y));
  let punkte = nurImFeld(karte, linie(ganz(a.x), ganz(a.y), e.x, e.y));
  if (zeichen === 'T') punkte = begrenzeTueren(punkte).punkte;
  return kachelOps(karte, punkte, zeichen);
}

/** Nächster freier Raumbuchstabe a–z oder null */
export function freierRaum(karte) {
  for (let c = 97; c <= 122; c++) {
    const r = String.fromCharCode(c);
    if (!karte.s('raeume').has(r)) return r;
  }
  return null;
}

/**
 * Raum bauen: Wände rundum, Innenboden, Tür (Mitte der Seite), optional Loot-Raum (Name + Tabelle → Loot-Punkte im Raum).
 * @returns { ops, raum }
 */
export function raumOps(karte, { x, y, b, h, boden = '.', tuer = 's', name = null, lootTabelle = null, lootPunkte = null }) {
  const r = imFeld(karte, { x, y, b, h });
  if (!r || r.b < 3 || r.h < 3) throw new Error('Raum braucht mindestens 3 × 3 Kacheln');
  pruefeZeichen(boden);
  if (KACHELN[boden].blockiert) throw new Error('Innenboden darf keine Wand sein');
  const ops = [];
  for (let yy = r.y; yy < r.y + r.h; yy++)
    for (let xx = r.x; xx < r.x + r.b; xx++) {
      const rand = xx === r.x || yy === r.y || xx === r.x + r.b - 1 || yy === r.y + r.h - 1;
      ops.push({ s: 'kachel', i: karte.index(xx, yy), neu: rand ? '#' : boden });
    }
  const mx = r.x + Math.floor(r.b / 2);
  const my = r.y + Math.floor(r.h / 2);
  const tuerPunkt = { n: [mx, r.y], s: [mx, r.y + r.h - 1], w: [r.x, my], o: [r.x + r.b - 1, my] }[tuer] ?? null;
  if (tuerPunkt) ops.push({ s: 'kachel', i: karte.index(...tuerPunkt), neu: 'T' });
  let raum = null;
  if (name || lootTabelle) {
    raum = freierRaum(karte);
    if (!raum) throw new Error('Alle 26 Raumbuchstaben sind belegt');
    ops.push({ s: 'raeume', k: raum, neu: { name: String(name || 'Raum').slice(0, 40), lootTabelle: lootTabelle || 'wohnung' } });
    ops.push({ s: 'raumFlaechen', k: karte.naechsteId, neu: { raum, x: r.x + 1, y: r.y + 1, b: r.b - 2, h: r.h - 2 } });
    // Loot-Punkte gleichmäßig auf freien Innenkacheln (nicht vor der Tür)
    const innen = [];
    for (let yy = r.y + 1; yy < r.y + r.h - 1; yy++) for (let xx = r.x + 1; xx < r.x + r.b - 1; xx++) if (!karte.objektBei(xx + 0.5, yy + 0.5)?.[1]?.blockiert) innen.push([xx, yy]);
    const vorTuer = tuerPunkt ? new Set([-1, 0, 1].flatMap((d) => [`${tuerPunkt[0] + d},${tuerPunkt[1]}`, `${tuerPunkt[0]},${tuerPunkt[1] + d}`])) : new Set();
    const frei = innen.filter(([xx, yy]) => !vorTuer.has(`${xx},${yy}`));
    const anzahl = Math.min(frei.length, lootPunkte ?? Math.max(1, Math.min(6, Math.round(frei.length / 8))));
    for (let n = 0; n < anzahl; n++) {
      const [px, py] = frei[Math.floor(((n + 0.5) * frei.length) / anzahl)];
      ops.push({ s: 'marker', k: markerSchluessel(px, py), neu: { art: 'loot', raum } });
    }
  }
  return { ops, raum };
}

/**
 * Objekt aus einer Katalog-ID: objekt:<typ> · modell:<datei ohne .glb> (Spielordner) · bauwerk:<typ>.
 * @returns { ops, id } (id = neue Objekt-ID)
 */
export function objektOps(karte, katalogId, x, y, { drehung = 0, skalierung = 1, felder = {} } = {}) {
  const ops = [];
  let o;
  const s = Math.min(SKALIERUNG_MAX, Math.max(SKALIERUNG_MIN, Number(skalierung) || 1));
  if (katalogId.startsWith('modell:')) {
    const t = spielordnerTyp(katalogId.slice(7));
    if (!t) throw new Error(`Modell „${katalogId.slice(7)}“ nicht im Spielordner`);
    if (!karte.s('typen').has(t.typId)) ops.push({ s: 'typen', k: t.typId, neu: t.typ });
    o = { typ: t.typId, x: 0, y: 0, b: t.b, h: t.h, blockiert: t.typ.blockiert !== false };
    if (t.typ.ebene) o.ebene = t.typ.ebene; // Werkstatt: boden/oben
  } else if (katalogId.startsWith('bauwerk:')) {
    const typ = katalogId.slice(8);
    const id = karte.naechsteId;
    return { ops: [{ s: 'bauwerke', k: id, neu: { typ, tx: ganz(x), ty: ganz(y), ...(Math.round(drehung / 90) % 2 ? { drehung: 1 } : {}) } }], id, sammlung: 'bauwerke' };
  } else {
    const e = katalogEintrag(katalogId.includes(':') ? katalogId : `objekt:${katalogId}`, karte) ?? (!katalogId.includes(':') && istBekannterTyp(katalogId, karte) ? { art: 'objekt', typ: katalogId, ...objektInfo(katalogId, karte) } : null);
    if (!e || e.art !== 'objekt') throw new Error(`Unbekanntes Objekt „${katalogId}“ (siehe katalog)`);
    o = { typ: e.typ, x: 0, y: 0, b: e.b, h: e.h, blockiert: !!e.blockiert };
    if (e.ebene) o.ebene = e.ebene;
    if (e.extra) Object.assign(o, kopie(e.extra));
    if (e.drehung) drehung = (drehung || 0) + e.drehung;
  }
  // Viertel-Drehung tauscht die Grundfläche (Regel gemeinsam/welt/drehung.js)
  const grad = (((Math.round(Number(drehung) || 0) % 360) + 360) % 360);
  const viertel = Math.round(grad / 90) % 4;
  if (viertel % 2 === 1) [o.b, o.h] = [o.h, o.b];
  if (grad) o.drehung = grad;
  if (s !== 1) {
    o.b = r3(o.b * s);
    o.h = r3(o.h * s);
    o.skalierung = r3(s);
  }
  o.x = r3(Number(x));
  o.y = r3(Number(y));
  Object.assign(o, felder);
  const id = karte.naechsteId;
  ops.push({ s: 'objekte', k: id, neu: o });
  return { ops, id, sammlung: 'objekte' };
}

/** Objekt auf neue Skalierung bringen (Mitte bleibt, Grundfläche wächst mit) */
export function skaliertesObjekt(o, neu) {
  const s = Math.min(SKALIERUNG_MAX, Math.max(SKALIERUNG_MIN, Number(neu) || 1));
  const f = s / (o.skalierung ?? 1);
  const b = r3(o.b * f);
  const h = r3(o.h * f);
  const n = { ...kopie(o), b, h, x: r3(o.x + (o.b - b) / 2), y: r3(o.y + (o.h - h) / 2) };
  if (Math.abs(s - 1) < 1e-6) delete n.skalierung;
  else n.skalierung = r3(s);
  return n;
}

/** Objekt drehen auf `grad` (Viertel tauschen b/h, Mitte bleibt) */
export function gedrehtesObjekt(o, grad) {
  const alt = (((o.drehung ?? 0) % 360) + 360) % 360;
  const neu = (((Math.round(grad) % 360) + 360) % 360);
  const n = kopie(o);
  if ((Math.round(alt / 90) + Math.round(neu / 90)) % 2 === 1) {
    n.b = o.h;
    n.h = o.b;
    n.x = r3(o.x + (o.b - o.h) / 2);
    n.y = r3(o.y + (o.h - o.b) / 2);
  }
  if (neu) n.drehung = neu;
  else delete n.drehung;
  return n;
}

/** Marker: start | zombie | horde | ankunft (name) | loot (raum) */
export function markerOps(karte, art, x, y, { name = null, anzahl = null, raum = null } = {}) {
  const px = ganz(x);
  const py = ganz(y);
  if (!karte.imFeld(px, py)) throw new Error('Punkt liegt außerhalb der Zone');
  if (art === 'ankunft') {
    const n = String(name || 'ankunft').trim().slice(0, 40);
    return [{ s: 'ankuenfte', k: n, neu: { x: px, y: py } }];
  }
  const ops = [];
  if (art === 'start') for (const [k, m] of karte.s('marker')) if (m.art === 'start') ops.push({ s: 'marker', k, neu: null }); // nur EIN Start
  const m = art === 'start' ? { art: 'start' } : art === 'loot' ? { art: 'loot', raum } : { art: 'zombie', ...(art === 'horde' ? { horde: true } : {}), ...(anzahl > 1 ? { anzahl: Math.min(20, ganz(anzahl)) } : {}) };
  if (m.art === 'loot' && !karte.s('raeume').has(raum)) throw new Error('Loot-Punkt braucht einen vorhandenen Raum');
  ops.push({ s: 'marker', k: markerSchluessel(px, py), neu: m });
  return ops;
}

/** Item-Spawnpunkt (Regeln: server/spiel/karten/spawnpunkte.js) */
export function spawnpunktOps(karte, felder) {
  const { punkt, fehler } = pruefeSpawnpunkt(felder, { breite: karte.breite, hoehe: karte.hoehe });
  if (!punkt) throw new Error(`Spawnpunkt: ${fehler}`);
  const id = karte.naechsteId;
  return { ops: [{ s: 'spawnpunkte', k: id, neu: punkt }], id };
}

/**
 * Bereich anlegen: loot (tabelle | eintraege) · tiere · uebergang (ziel, ankunft) · klang (datei, lautstaerke) · raum (raum)
 * @returns { ops, id, sammlung }
 */
export function flaecheOps(karte, art, r, o = {}) {
  const rr = imFeld(karte, r);
  if (!rr) throw new Error('Bereich liegt außerhalb der Zone');
  const id = karte.naechsteId;
  const mit = (sammlung, neu) => ({ ops: [{ s: sammlung, k: id, neu }], id, sammlung });
  if (art === 'loot') {
    const vorlage = eingebauteVorlagen()[`spiel:${o.tabelle ?? 'wohnung'}`];
    if (!vorlage && !o.eintraege) throw new Error(`Unbekannte Loot-Tabelle „${o.tabelle}“`);
    return mit('lootZonen', { name: o.name ?? `Loot ${o.tabelle ?? ''}`.trim(), ...rr, modus: o.modus ?? 'gewicht', eintraege: o.eintraege ?? kopie(vorlage.eintraege), punkte: Math.max(1, Math.min(200, ganz(o.punkte ?? Math.ceil((rr.b * rr.h) / 25)))), ort: o.ort ?? 'alle' });
  }
  if (art === 'zombies') return mit('zombieBereiche', { ...rr, anzahl: Math.max(1, Math.min(60, ganz(o.anzahl ?? 5))), tageszeit: ['immer', 'tag', 'nacht'].includes(o.tageszeit) ? o.tageszeit : 'immer', ...(o.varianten ? { varianten: o.varianten } : {}), ...(o.route?.length >= 2 ? { route: o.route } : {}) });
  if (art === 'tiere') return mit('tierBereiche', { ...rr, art: 'hase', anzahl: Math.max(0, Math.min(100, ganz(o.anzahl ?? 4))) });
  if (art === 'uebergang') {
    if (!o.ziel) throw new Error('Übergang braucht eine Zielzone');
    return mit('uebergaenge', { ...rr, ziel: String(o.ziel), ankunft: String(o.ankunft || karte.id), name: String(o.name || o.ziel) });
  }
  if (art === 'klang') return mit('klaenge', neuerKlang('bereich', { name: o.name ?? 'Ambiente', ...rr, rand: o.rand ?? 2, lautstaerke: Math.max(0, Math.min(2, Number(o.lautstaerke ?? 1))), ...(o.datei ? { datei: o.datei } : {}) }));
  if (art === 'raum') {
    if (!karte.s('raeume').has(o.raum)) throw new Error('Raum fehlt');
    return mit('raumFlaechen', { raum: o.raum, ...rr });
  }
  throw new Error(`Unbekannte Bereichsart „${art}“`);
}

/** Punktklang (Radius) */
export function punktKlangOps(karte, x, y, o = {}) {
  const id = karte.naechsteId;
  return { ops: [{ s: 'klaenge', k: id, neu: neuerKlang('punkt', { name: o.name ?? 'Klang', x: r3(x), y: r3(y), innen: o.innen ?? 2, aussen: o.aussen ?? 10, lautstaerke: o.lautstaerke ?? 1, ...(o.datei ? { datei: o.datei } : {}) }) }], id, sammlung: 'klaenge' };
}

/** Gelände-Pinsel */
export function gelaendeOps(karte, modus, x, y, radius = 3, staerke = 0.5) {
  const cx = ganz(x);
  const cy = ganz(y);
  if (modus === 'heben') return terrainHeben(karte, cx, cy, radius, Math.abs(staerke));
  if (modus === 'senken') return terrainHeben(karte, cx, cy, radius, -Math.abs(staerke));
  if (modus === 'glaetten') return terrainGlaetten(karte, cx, cy, radius, 0.5);
  if (modus === 'ebnen') return terrainEbnen(karte, cx, cy, radius, 0);
  throw new Error('Modus: heben, senken, glaetten, ebnen');
}

/** Löschen: [{ s, k }] → ops */
export function loeschOps(eintraege) {
  return eintraege.map(({ s, k }) => ({ s, k, neu: null }));
}

/** Eintrag ändern (Teil-Felder überschreiben; undefined löscht ein Feld) */
export function aenderOps(karte, s, k, felder) {
  const alt = karte.s(s).get(k);
  if (!alt) throw new Error(`Eintrag ${s}/${k} gibt es nicht`);
  const neu = { ...kopie(alt) };
  for (const [f, w] of Object.entries(felder)) {
    if (w === undefined) delete neu[f];
    else neu[f] = w;
  }
  return [{ s, k, neu }];
}

/** Verschieben um (dx, dy) – Objekte/Bereiche/Klänge/Spawnpunkte frei, Marker/Bauwerke ganzzahlig */
export function verschiebeOps(karte, eintraege, dx, dy) {
  const ops = [];
  for (const { s, k } of eintraege) {
    const w = karte.s(s).get(k);
    if (!w) continue;
    if (s === 'marker') {
      const [x, y] = ausSchluessel(k);
      const nx = x + Math.round(dx);
      const ny = y + Math.round(dy);
      if (!karte.imFeld(nx, ny) || (nx === x && ny === y)) continue;
      ops.push({ s, k, neu: null }, { s, k: markerSchluessel(nx, ny), neu: w });
    } else if (s === 'ankuenfte') ops.push({ s, k, neu: { x: w.x + Math.round(dx), y: w.y + Math.round(dy) } });
    else if (s === 'bauwerke') ops.push({ s, k, neu: { ...w, tx: w.tx + Math.round(dx), ty: w.ty + Math.round(dy) } });
    else if ('x' in w) ops.push({ s, k, neu: { ...w, x: r3(w.x + dx), y: r3(w.y + dy) } });
  }
  return ops;
}

/** Duplizieren mit Versatz → { ops, neue: [{s,k}] } */
export function duplizierOps(karte, eintraege, dx = 1, dy = 1) {
  const ops = [];
  const neue = [];
  let id = karte.naechsteId;
  for (const { s, k } of eintraege) {
    const w = karte.s(s).get(k);
    if (!w || typeof k !== 'number') continue;
    const n = s === 'bauwerke' ? { ...kopie(w), tx: w.tx + dx, ty: w.ty + dy } : { ...kopie(w), x: r3(w.x + dx), y: r3(w.y + dy) };
    ops.push({ s, k: id, neu: n });
    neue.push({ s, k: id++ });
  }
  return { ops, neue };
}

// ---------- Vorlagen (Prefabs) ----------

/** Vorlage aus einer ganzen (Vorlagen-)Karte bzw. einem Rechteck – inkl. Spawnpunkte */
export function vorlageAus(karte, r = { x: 0, y: 0, b: karte.breite, h: karte.hoehe }, name = null) {
  const v = kopiere(karte, r, { name });
  if (!v) return null;
  v.spawnpunkte = [...karte.s('spawnpunkte').values()].filter((p) => p.x >= r.x && p.y >= r.y && p.x < r.x + r.b && p.y < r.y + r.h).map((p) => ({ ...kopie(p), x: r3(p.x - r.x), y: r3(p.y - r.y) }));
  v.klaenge = [...karte.s('klaenge').values()].filter((c) => c.art !== 'global' && c.x >= r.x && c.y >= r.y && c.x < r.x + r.b && c.y < r.y + r.h).map((c) => ({ ...kopie(c), x: r3(c.x - r.x), y: r3(c.y - r.y) }));
  return v;
}

/** Vorlage einsetzen (linke obere Ecke x, y) → { ops, weggelassen } */
export function vorlageOps(karte, v, x, y) {
  const { ops, weggelassen } = einfuegeOps(karte, v, ganz(x), ganz(y));
  let id = Math.max(karte.naechsteId, ...ops.filter((o) => typeof o.k === 'number').map((o) => o.k + 1));
  for (const p of v.spawnpunkte ?? []) {
    const nx = r3(p.x + ganz(x));
    const ny = r3(p.y + ganz(y));
    if (nx < 0 || ny < 0 || nx >= karte.breite || ny >= karte.hoehe) continue;
    ops.push({ s: 'spawnpunkte', k: id++, neu: { ...kopie(p), x: nx, y: ny } });
  }
  return { ops, weggelassen };
}

// ---------- Klang am Objekt ----------

/**
 * Objekte mit `klang` ({ datei, lautstaerke, innen, aussen, name }) → Punktklänge in der Spiel-Definition (beim Export).
 * Gekennzeichnet über `vonObjekt` im Namen-Suffix, damit das Studio sie beim Öffnen wieder ans Objekt hängt.
 */
export const OBJEKT_KLANG_SUFFIX = ' ⟐';
export function objektKlaenge(karte) {
  const liste = [];
  for (const o of karte.s('objekte').values()) {
    if (!o.klang?.datei) continue;
    liste.push(neuerKlang('punkt', { name: `${(o.klang.name || o.typ).slice(0, 55)}${OBJEKT_KLANG_SUFFIX}`, x: r3(o.x + o.b / 2), y: r3(o.y + o.h / 2), innen: o.klang.innen ?? 2, aussen: o.klang.aussen ?? 10, lautstaerke: o.klang.lautstaerke ?? 1, datei: o.klang.datei }));
  }
  return liste;
}

/** Beim Öffnen: abgeleitete Objekt-Klänge aus der Sammlung entfernen (sie entstehen beim Export neu) */
export function entferneObjektKlaenge(karte) {
  return [...karte.s('klaenge')].filter(([, c]) => typeof c.name === 'string' && c.name.endsWith(OBJEKT_KLANG_SUFFIX)).map(([k]) => ({ s: 'klaenge', k, neu: null }));
}

// ---------- Verknüpfte Vorlagen (Phase 1.13) ----------

/** Kopien der Vorlagen in dieser Zone: [{ id, vorlage, x, y, b, h }] (werte.vorlagenInstanzen) */
export const vorlagenInstanzen = (karte) => karte.werte.vorlagenInstanzen ?? [];

/** Vorlage einsetzen UND als Kopie merken (für „alle aktualisieren“) */
export function verknuepfteVorlageOps(karte, vorlageId, v, x, y) {
  const { ops, weggelassen } = vorlageOps(karte, v, x, y);
  const liste = vorlagenInstanzen(karte);
  const id = Math.max(0, ...liste.map((i) => i.id)) + 1;
  ops.push({ s: 'wert', pfad: 'vorlagenInstanzen', neu: [...liste, { id, vorlage: vorlageId, x: Math.round(x), y: Math.round(y), b: v.b, h: v.h }] });
  return { ops, weggelassen, id };
}

/** Eine Kopie auf den neuen Stand der Vorlage bringen: Bereich leeren (Elemente + Spawnpunkte), neu einsetzen */
export function aktualisiereInstanzOps(karte, instanz, v) {
  const alt = { x: instanz.x, y: instanz.y, b: instanz.b, h: instanz.h };
  const ops = loescheBereichOps(karte, alt, { fuellung: null });
  for (const [id, p] of karte.s('spawnpunkte')) if (p.x >= alt.x && p.y >= alt.y && p.x < alt.x + alt.b && p.y < alt.y + alt.h) ops.push({ s: 'spawnpunkte', k: id, neu: null });
  const k = karte.klon();
  k.anwenden(ops);
  const neu = vorlageOps(k, v, instanz.x, instanz.y).ops;
  ops.push(...neu);
  ops.push({ s: 'wert', pfad: 'vorlagenInstanzen', neu: vorlagenInstanzen(karte).map((i) => (i.id === instanz.id ? { ...i, b: v.b, h: v.h } : i)) });
  return ops;
}

/** Kopie entkoppeln (bleibt stehen, wird nicht mehr aktualisiert) */
export function entkoppleOps(karte, instanzId) {
  return [{ s: 'wert', pfad: 'vorlagenInstanzen', neu: vorlagenInstanzen(karte).filter((i) => i.id !== instanzId) }];
}

// ---------- Notizen ----------

export function notizOps(karte, x, y, text) {
  const t = String(text ?? '').trim().slice(0, 500);
  if (!t) throw new Error('Notiz ist leer');
  const id = karte.naechsteId;
  return { ops: [{ s: 'notizen', k: id, neu: { x: r3(x), y: r3(y), text: t } }], id };
}

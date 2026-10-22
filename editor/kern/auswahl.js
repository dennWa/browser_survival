import { ID_SAMMLUNGEN, markerSchluessel, ausSchluessel, kopie } from './karte.js';

/**
 * Auswahl-Rechteck: kopieren, ausschneiden, einfügen, löschen, verschieben, drehen – und Prefabs (Phase 6), die
 * dieselbe "Vorlage" benutzen. Vorlage = alles relativ zur linken oberen Ecke:
 *   { b, h, zellen: (Zeichen|null)[], hoehen: number[]|null, objekte: [...], bauwerke, tierBereiche, raumFlaechen,
 *     marker: [[dx, dy, m]], name? }
 * Ein Element gehört zur Auswahl, wenn sein MITTELPUNKT im Rechteck liegt.
 * Feedback 6.5: `kopiereElemente(karte, gewaehlte)` = nur die gewählten Elemente (Objekte, Bauwerke, Marker, Bereiche,
 *   Loot-Zonen, Klänge) OHNE Kacheln → Vorlage mit `nurElemente: true` (alle zellen null); `einfuegeOps` löscht dann im
 *   Zielbereich nichts (kein Stempeln) und überschreibt keinen Boden. Übergänge/Ankünfte (Namen eindeutig) werden übersprungen.
 */
const MIT_RECHTECK = ['objekte', 'tierBereiche', 'raumFlaechen', 'lootZonen'];
/** Sammlungen, die `kopiereElemente` mitnimmt (Rechteck-Elemente mit x/y/b/h) */
const ELEMENT_RECHTECK = ['objekte', 'tierBereiche', 'raumFlaechen', 'lootZonen'];

function mitte(s, o) {
  if (s === 'bauwerke') return { x: o.tx + 0.5, y: o.ty + 0.5 };
  return { x: o.x + (o.b ?? 1) / 2, y: o.y + (o.h ?? 1) / 2 };
}
const imRechteck = (p, r) => p.x >= r.x && p.x < r.x + r.b && p.y >= r.y && p.y < r.y + r.h;

/** Rechteck auf die Karte beschneiden (null, wenn leer) */
export function beschneide(karte, r) {
  const x0 = Math.max(0, r.x);
  const y0 = Math.max(0, r.y);
  const x1 = Math.min(karte.breite, r.x + r.b);
  const y1 = Math.min(karte.hoehe, r.y + r.h);
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, b: x1 - x0, h: y1 - y0 } : null;
}

/** IDs/Schlüssel aller Elemente im Rechteck: { objekte: [id…], …, marker: [schluessel…] } */
export function elementeIn(karte, r) {
  const ergebnis = { marker: [] };
  for (const s of ['objekte', 'bauwerke', 'tierBereiche', 'raumFlaechen']) ergebnis[s] = [...karte.s(s)].filter(([, o]) => imRechteck(mitte(s, o), r)).map(([id]) => id);
  for (const k of karte.s('marker').keys()) {
    const [x, y] = ausSchluessel(k);
    if (imRechteck({ x: x + 0.5, y: y + 0.5 }, r)) ergebnis.marker.push(k);
  }
  return ergebnis;
}

export function kopiere(karte, r, { nurKacheln = false, name = null } = {}) {
  const rr = beschneide(karte, r);
  if (!rr) return null;
  const v = { b: rr.b, h: rr.h, zellen: [], hoehen: [], objekte: [], bauwerke: [], tierBereiche: [], raumFlaechen: [], marker: [] };
  if (name) v.name = name;
  for (let y = 0; y < rr.h; y++)
    for (let x = 0; x < rr.b; x++) {
      v.zellen.push(karte.kachelAn(rr.x + x, rr.y + y));
      v.hoehen.push(karte.hoeheAn(rr.x + x, rr.y + y));
    }
  if (!v.hoehen.some((h) => h !== 0)) v.hoehen = null;
  if (nurKacheln) return v;
  const e = elementeIn(karte, rr);
  for (const s of ['objekte', 'tierBereiche', 'raumFlaechen']) v[s] = e[s].map((id) => ({ ...kopie(karte.s(s).get(id)), x: karte.s(s).get(id).x - rr.x, y: karte.s(s).get(id).y - rr.y }));
  v.bauwerke = e.bauwerke.map((id) => ({ ...kopie(karte.s('bauwerke').get(id)), tx: karte.s('bauwerke').get(id).tx - rr.x, ty: karte.s('bauwerke').get(id).ty - rr.y }));
  v.marker = e.marker.map((k) => {
    const [x, y] = ausSchluessel(k);
    return [x - rr.x, y - rr.y, kopie(karte.s('marker').get(k))];
  });
  v.bemalung = [];
  for (const [k, f] of karte.s('bemalung')) {
    const [x, y] = ausSchluessel(k);
    if (x >= rr.x && y >= rr.y && x < rr.x + rr.b && y < rr.y + rr.h) v.bemalung.push([x - rr.x, y - rr.y, f]);
  }
  v.raeume = {};
  for (const raum of [...v.marker.map(([, , m]) => m.raum), ...v.raumFlaechen.map((r) => r.raum)]) if (raum && karte.s('raeume').has(raum)) v.raeume[raum] = kopie(karte.s('raeume').get(raum));
  return v;
}

/**
 * Nur die gewählten Elemente als Vorlage (Strg+C auf Objekte, 6.5) – ohne Kacheln/Höhen/Bemalung.
 * gewaehlte = [{ s, k, wert }] (zustand.gewaehlte()). Lage relativ zur linken oberen Ecke des Rahmens (ganze Kacheln,
 * Bruch-Positionen im Free-Modus bleiben erhalten). @returns Vorlage | null (nichts Kopierbares) – `uebersprungen` = Anzahl
 */
export function kopiereElemente(karte, gewaehlte, { name = null } = {}) {
  const rahmen = [];
  for (const { s, k, wert: w } of gewaehlte) {
    if (ELEMENT_RECHTECK.includes(s)) rahmen.push({ x: w.x, y: w.y, b: w.b ?? 1, h: w.h ?? 1 });
    else if (s === 'bauwerke') rahmen.push({ x: w.tx, y: w.ty, b: 1, h: 1 });
    else if (s === 'marker') {
      const [x, y] = ausSchluessel(k);
      rahmen.push({ x, y, b: 1, h: 1 });
    } else if (s === 'klaenge' && w.art === 'punkt') rahmen.push({ x: w.x - 0.5, y: w.y - 0.5, b: 1, h: 1 });
    else if (s === 'klaenge' && w.art === 'bereich') rahmen.push({ x: w.x, y: w.y, b: w.b, h: w.h });
  }
  if (!rahmen.length) return null;
  const x0 = Math.floor(Math.min(...rahmen.map((r) => r.x)));
  const y0 = Math.floor(Math.min(...rahmen.map((r) => r.y)));
  const b = Math.max(1, Math.ceil(Math.max(...rahmen.map((r) => r.x + r.b))) - x0);
  const h = Math.max(1, Math.ceil(Math.max(...rahmen.map((r) => r.y + r.h))) - y0);
  const v = { b, h, zellen: new Array(b * h).fill(null), hoehen: null, objekte: [], bauwerke: [], tierBereiche: [], raumFlaechen: [], lootZonen: [], klaenge: [], marker: [], bemalung: [], raeume: {}, nurElemente: true, uebersprungen: 0 };
  if (name) v.name = name;
  const r3 = (z) => Math.round(z * 1000) / 1000;
  for (const { s, k, wert: w } of gewaehlte) {
    if (ELEMENT_RECHTECK.includes(s)) v[s].push({ ...kopie(w), x: r3(w.x - x0), y: r3(w.y - y0) });
    else if (s === 'bauwerke') v.bauwerke.push({ ...kopie(w), tx: w.tx - x0, ty: w.ty - y0 });
    else if (s === 'marker') {
      const [x, y] = ausSchluessel(k);
      v.marker.push([x - x0, y - y0, kopie(w)]);
    } else if (s === 'klaenge' && w.art !== 'global') v.klaenge.push({ ...kopie(w), x: r3(w.x - x0), y: r3(w.y - y0) });
    else v.uebersprungen++;
  }
  for (const raum of [...v.marker.map(([, , m]) => m.raum), ...v.raumFlaechen.map((r) => r.raum)]) if (raum && karte.s('raeume').has(raum)) v.raeume[raum] = kopie(karte.s('raeume').get(raum));
  return v;
}

/** Raum-Buchstaben der Vorlage → Buchstaben der Zielkarte (+ Operationen für neue Räume) */
export function raumZuordnung(karte, raeume = {}) {
  const zuordnung = {};
  const ops = [];
  const belegt = new Set(karte.s('raeume').keys());
  const gleich = (a, b) => a && b && a.name === b.name && a.lootTabelle === b.lootTabelle;
  for (const [alt, raum] of Object.entries(raeume)) {
    if (gleich(karte.s('raeume').get(alt), raum)) {
      zuordnung[alt] = alt;
      continue;
    }
    const vorhanden = [...karte.s('raeume')].find(([, r]) => gleich(r, raum));
    if (vorhanden) {
      zuordnung[alt] = vorhanden[0];
      continue;
    }
    const neu = belegt.has(alt) ? 'abcdefghijklmnopqrstuvwxyz'.split('').find((b) => !belegt.has(b)) : alt;
    if (!neu) continue; // alle 26 vergeben → Loot-Punkte dieses Raums fallen weg (gemeldet über weggelassen)
    belegt.add(neu);
    zuordnung[alt] = neu;
    ops.push({ s: 'raeume', k: neu, neu: kopie(raum) });
  }
  return { zuordnung, ops };
}

/** Löschen: Kacheln → fuellung (null = Kacheln lassen), Elemente im Rechteck entfernen */
export function loescheOps(karte, r, { fuellung = ',', elemente = true } = {}) {
  const rr = beschneide(karte, r);
  if (!rr) return [];
  const ops = [];
  if (fuellung)
    for (let y = rr.y; y < rr.y + rr.h; y++)
      for (let x = rr.x; x < rr.x + rr.b; x++) {
        ops.push({ s: 'kachel', i: karte.index(x, y), neu: fuellung });
        if (karte.farbeAn(x, y)) ops.push({ s: 'bemalung', k: markerSchluessel(x, y), neu: null });
      }
  if (elemente) {
    const e = elementeIn(karte, rr);
    for (const s of ['objekte', 'bauwerke', 'tierBereiche', 'raumFlaechen']) for (const id of e[s]) ops.push({ s, k: id, neu: null });
    for (const k of e.marker) ops.push({ s: 'marker', k, neu: null });
  }
  return ops;
}

/**
 * Vorlage bei (x, y) einfügen (ersetzen = vorhandene Elemente im Zielbereich entfernen). Teile außerhalb der Zone werden
 * weggelassen und gemeldet.
 * @returns {{ ops, weggelassen: number, neueIds: { objekte: [] … } }}
 */
export function einfuegeOps(karte, v, x, y, { ersetzen = true } = {}) {
  const { zuordnung, ops } = raumZuordnung(karte, v.raeume);
  // Stempeln: was im Zielbereich steht (Objekte, Marker, Bauwerke, Bereiche), weicht der Vorlage – nicht bei kopierten
  // Einzel-Elementen (6.5: die kommen dazu, Boden und Nachbarn bleiben)
  if (ersetzen && !v.nurElemente) ops.unshift(...loescheOps(karte, { x, y, b: v.b, h: v.h }, { fuellung: null }));
  const raumNeu = (r) => (r && v.raeume && Object.hasOwn(v.raeume, r) ? (zuordnung[r] ?? null) : r);
  let weggelassen = 0;
  const neueIds = Object.fromEntries([...ID_SAMMLUNGEN, 'marker'].map((s) => [s, []]));
  for (let dy = 0; dy < v.h; dy++)
    for (let dx = 0; dx < v.b; dx++) {
      const z = v.zellen[dy * v.b + dx];
      if (z === null || z === undefined || !karte.imFeld(x + dx, y + dy)) continue;
      ops.push({ s: 'kachel', i: karte.index(x + dx, y + dy), neu: z });
      if (v.hoehen) ops.push({ s: 'hoehe', i: karte.index(x + dx, y + dy), neu: v.hoehen[dy * v.b + dx] });
    }
  const drin = (r) => r.x >= 0 && r.y >= 0 && r.x + r.b <= karte.breite + 1e-9 && r.y + r.h <= karte.hoehe + 1e-9;
  let naechste = karte.naechsteId;
  for (const s of MIT_RECHTECK) {
    for (const o of v[s] ?? []) {
      const neu = { ...kopie(o), x: o.x + x, y: o.y + y };
      if (s === 'raumFlaechen') neu.raum = raumNeu(o.raum);
      if (!drin({ x: neu.x, y: neu.y, b: neu.b ?? 1, h: neu.h ?? 1 }) || (s === 'raumFlaechen' && !neu.raum)) {
        weggelassen++;
        continue;
      }
      neueIds[s].push(naechste);
      ops.push({ s, k: naechste++, neu });
    }
  }
  for (const b of v.bauwerke ?? []) {
    const neu = { ...kopie(b), tx: b.tx + x, ty: b.ty + y };
    if (!karte.imFeld(neu.tx, neu.ty)) {
      weggelassen++;
      continue;
    }
    neueIds.bauwerke.push(naechste);
    ops.push({ s: 'bauwerke', k: naechste++, neu });
  }
  for (const c of v.klaenge ?? []) {
    const neu = { ...kopie(c), x: Math.round((c.x + x) * 1000) / 1000, y: Math.round((c.y + y) * 1000) / 1000 };
    const ok = c.art === 'bereich' ? drin({ x: neu.x, y: neu.y, b: neu.b, h: neu.h }) : neu.x >= 0 && neu.y >= 0 && neu.x <= karte.breite && neu.y <= karte.hoehe;
    if (!ok) {
      weggelassen++;
      continue;
    }
    neueIds.klaenge.push(naechste);
    ops.push({ s: 'klaenge', k: naechste++, neu });
  }
  for (const [dx, dy, f] of v.bemalung ?? []) if (karte.imFeld(x + dx, y + dy)) ops.push({ s: 'bemalung', k: markerSchluessel(x + dx, y + dy), neu: f });
  for (const [dx, dy, m] of v.marker ?? []) {
    const neu = kopie(m);
    if (neu.art === 'loot') neu.raum = raumNeu(m.raum);
    if (!karte.imFeld(x + dx, y + dy) || (neu.art === 'loot' && !neu.raum)) {
      weggelassen++;
      continue;
    }
    ops.push({ s: 'marker', k: markerSchluessel(x + dx, y + dy), neu });
    neueIds.marker.push(markerSchluessel(x + dx, y + dy));
  }
  return { ops, weggelassen, neueIds };
}

/** Vorlage um 90° im Uhrzeigersinn drehen (Kacheln, Objekte mit b/h-Tausch + drehung, Marker, Bauwerke) */
export function dreheVorlage(v) {
  const { b, h } = v;
  const n = { ...v, b: h, h: b, zellen: new Array(b * h), hoehen: v.hoehen ? new Array(b * h) : null };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < b; x++) {
      // (x, y) → (h - 1 - y, x)
      const ni = x * h + (h - 1 - y);
      n.zellen[ni] = v.zellen[y * b + x];
      if (v.hoehen) n.hoehen[ni] = v.hoehen[y * b + x];
    }
  const dreheRechteck = (o) => ({ ...o, x: h - (o.y + (o.h ?? 1)), y: o.x, b: o.h ?? 1, h: o.b ?? 1 });
  n.objekte = (v.objekte ?? []).map((o) => ({ ...dreheRechteck(o), drehung: ((o.drehung ?? 0) + 90) % 360 }));
  n.tierBereiche = (v.tierBereiche ?? []).map(dreheRechteck);
  n.raumFlaechen = (v.raumFlaechen ?? []).map(dreheRechteck);
  if (v.lootZonen) n.lootZonen = v.lootZonen.map(dreheRechteck);
  // Punkt-Klang: (x, y) → (h − y, x); Ambiente-Bereich wie ein Rechteck
  if (v.klaenge) n.klaenge = v.klaenge.map((c) => (c.art === 'bereich' ? dreheRechteck(c) : { ...c, x: Math.round((h - c.y) * 1000) / 1000, y: c.x }));
  n.bauwerke = (v.bauwerke ?? []).map((bw) => ({ ...bw, tx: h - 1 - bw.ty, ty: bw.tx, drehung: bw.drehung ? 0 : 1 })); // Ausrichtung kippt immer (auch ohne gesetztes Feld)
  n.marker = (v.marker ?? []).map(([x, y, m]) => [h - 1 - y, x, m]);
  n.bemalung = (v.bemalung ?? []).map(([x, y, f]) => [h - 1 - y, x, f]);
  return n;
}

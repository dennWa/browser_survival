import { KACHELN } from '../../gemeinsam/welt/kacheln.js';
import { pruefeObjekt } from '../../editor/kern/platzierung.js';
import { kopie } from '../../editor/kern/karte.js';
import { objektOps, raumOps, imFeld, vorlageOps, SKALIERUNG_MIN, SKALIERUNG_MAX } from './aktionen.js';

/**
 * Größere Bau-Hilfen des Studios (Phase 1.12) – reine Funktionen, deterministisch über `saat` (Tests: tests/studio.test.js):
 *   streuOps       Objekte im Kreis „aufsprühen“ (Dichte, Zufallsgröße/-drehung, kein Überlappen, nur auf passendem Boden)
 *   radierOps      gestreute Typen im Kreis wieder entfernen
 *   strassenOps    gerade Straße (waagerecht/senkrecht) mit Gehwegen, Mittelmarkierung und Laternen
 *   ersetzOps      Objekte eines Typs bzw. Kacheln eines Zeichens in einem Rechteck austauschen
 *   generiereWald / generiereDorf   Startpunkte zum Weiterbauen
 */
export const STREU_SETS = Object.freeze({
  wald: { name: 'Wald', typen: ['objekt:baum', 'objekt:baum', 'objekt:baum_herbst', 'objekt:busch'] },
  nadelwald: { name: 'Nadelwald', typen: ['objekt:tanne', 'objekt:tanne', 'objekt:busch'] },
  gebuesch: { name: 'Gebüsch', typen: ['objekt:busch'] },
  felsen: { name: 'Felsen', typen: ['objekt:stein', 'objekt:stein', 'objekt:eisenerz'] },
});
/** Böden, auf denen gestreut werden darf (keine Straßen, Innenräume, Wasser, Wände) */
export const STREU_BOEDEN = new Set([',', '*', '$', '0', '&', ';', '!', '%']);

/** Kleiner deterministischer Zufall (mulberry32) */
export function zufall(saat = 1) {
  let a = saat >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Streuen: im Kreis (cx, cy, radius) etwa `dichte` Objekte je 100 Kacheln. Typen = Katalog-IDs (gleich gewichtet).
 * @returns { ops, anzahl }
 */
export function streuOps(karte, cx, cy, radius, { typen, dichte = 4, groesse = [0.8, 1.25], saat = 1, boeden = STREU_BOEDEN } = {}) {
  if (!typen?.length) throw new Error('Streuen: keine Objekttypen gewählt');
  const r = zufall(saat);
  const flaeche = Math.PI * radius * radius;
  const versuche = Math.max(1, Math.round((flaeche / 100) * dichte));
  // Arbeitskopie: neue Objekte müssen sich auch untereinander ausweichen
  const k = karte.klon();
  const ops = [];
  for (let i = 0; i < versuche * 3 && ops.filter((o) => o.s === 'objekte').length < versuche; i++) {
    const w = r() * Math.PI * 2;
    const d = Math.sqrt(r()) * radius;
    const x = cx + Math.cos(w) * d;
    const y = cy + Math.sin(w) * d;
    if (!boeden.has(k.kachelAn(Math.floor(x), Math.floor(y)))) continue;
    const typ = typen[Math.floor(r() * typen.length)];
    const s = Math.min(SKALIERUNG_MAX, Math.max(SKALIERUNG_MIN, groesse[0] + r() * (groesse[1] - groesse[0])));
    let neu;
    try {
      neu = objektOps(k, typ, 0, 0, { drehung: Math.round(r() * 24) * 15, skalierung: s });
    } catch {
      continue;
    }
    const o = neu.ops.find((op) => op.s === 'objekte').neu;
    o.x = Math.round((x - o.b / 2) * 100) / 100;
    o.y = Math.round((y - o.h / 2) * 100) / 100;
    // Abstand zu anderen Bäumen/Büschen: Mitte nicht in einem anderen Objekt
    if (k.objektBei(x, y)) continue;
    if (!pruefeObjekt(k, o).ok) continue;
    const fertig = neu.ops.map((op) => (op.s === 'objekte' ? { ...op, neu: o } : op));
    k.anwenden(fertig);
    ops.push(...fertig);
  }
  return { ops, anzahl: ops.filter((o) => o.s === 'objekte').length };
}

/** Radierer: Objekte der gestreuten Typen im Kreis entfernen */
export function radierOps(karte, cx, cy, radius, { typen }) {
  const namen = new Set(typen.map((t) => t.replace(/^objekt:/, '')));
  const ops = [];
  for (const [id, o] of karte.s('objekte')) {
    if (!namen.has(o.typ)) continue;
    if ((o.x + o.b / 2 - cx) ** 2 + (o.y + o.h / 2 - cy) ** 2 <= radius * radius) ops.push({ s: 'objekte', k: id, neu: null });
  }
  return ops;
}

/**
 * Gerade Straße von a nach b (rastet auf waagerecht/senkrecht). fahrbahn = Breite der Straße (Kacheln, ohne Gehweg).
 * @returns { ops }
 */
export function strassenOps(karte, a, b, { fahrbahn = 4, gehweg = 1, markierung = true, laternen = 10 } = {}) {
  const waagerecht = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
  const [von, bis] = waagerecht ? [Math.min(a.x, b.x), Math.max(a.x, b.x)] : [Math.min(a.y, b.y), Math.max(a.y, b.y)];
  const mitte = Math.round(waagerecht ? a.y : a.x);
  const halb = Math.floor(fahrbahn / 2);
  const start = mitte - halb - gehweg;
  const gesamt = fahrbahn + 2 * gehweg;
  const ops = [];
  const setze = (laengs, quer, z) => {
    const x = waagerecht ? laengs : quer;
    const y = waagerecht ? quer : laengs;
    if (karte.imFeld(x, y)) ops.push({ s: 'kachel', i: karte.index(x, y), neu: z });
  };
  for (let l = Math.floor(von); l <= Math.floor(bis); l++) for (let q = 0; q < gesamt; q++) setze(l, start + q, q < gehweg || q >= gesamt - gehweg ? '-' : '=');
  // Objekte, die jetzt auf der Fahrbahn stehen, weg (Bäume, Kisten …)
  const r = waagerecht ? { x: von, y: start, b: bis - von + 1, h: gesamt } : { x: start, y: von, b: gesamt, h: bis - von + 1 };
  for (const [id, o] of karte.s('objekte')) {
    const mx = o.x + o.b / 2;
    const my = o.y + o.h / 2;
    if (mx >= r.x && mx < r.x + r.b && my >= r.y && my < r.y + r.h && o.typ !== 'markierung' && o.typ !== 'licht') ops.push({ s: 'objekte', k: id, neu: null });
  }
  let id = karte.naechsteId;
  const neu = (o) => ops.push({ s: 'objekte', k: id++, neu: o });
  if (markierung && fahrbahn >= 2) {
    const q = start + gehweg + fahrbahn / 2 - 0.06;
    for (let l = Math.floor(von) + 1; l + 2 <= bis + 1; l += 3) neu(waagerecht ? { typ: 'markierung', x: l, y: q, b: 1.6, h: 0.12, blockiert: false, ebene: 'boden' } : { typ: 'markierung', x: q, y: l, b: 0.12, h: 1.6, blockiert: false, ebene: 'boden' });
  }
  if (laternen > 0 && gehweg > 0) {
    let seite = 0;
    for (let l = Math.floor(von) + 2; l <= bis; l += laternen) {
      const q = seite++ % 2 ? start + gesamt - 1 : start;
      neu({ typ: 'licht', x: waagerecht ? l : q, y: waagerecht ? q : l, b: 1, h: 1, blockiert: false, ebene: 'licht', radius: 3, farbe: '#ffcf87', staerke: 0.6, flackern: false, mast: true });
    }
  }
  return { ops };
}

/**
 * Ersetzen im Rechteck (ohne Rechteck = ganze Zone): Objekte `vonTyp` → Katalog-ID `zu` (Mitte & Drehung bleiben,
 * Größe zufällig variiert wie vorher), Kacheln `vonZeichen` → `zuZeichen`.
 */
export function ersetzOps(karte, { r = null, vonTyp = null, zu = null, vonZeichen = null, zuZeichen = null }) {
  const rr = r ? imFeld(karte, r) : { x: 0, y: 0, b: karte.breite, h: karte.hoehe };
  if (!rr) return [];
  const drin = (x, y) => x >= rr.x && y >= rr.y && x < rr.x + rr.b && y < rr.y + rr.h;
  const ops = [];
  if (vonTyp && zu) {
    let k = karte;
    for (const [id, o] of karte.s('objekte')) {
      if (o.typ !== vonTyp || !drin(o.x + o.b / 2, o.y + o.h / 2)) continue;
      const neu = objektOps(k, zu, 0, 0, { drehung: o.drehung ?? 0, skalierung: o.skalierung ?? 1 });
      const n = neu.ops.find((op) => op.s === 'objekte').neu;
      n.x = Math.round((o.x + o.b / 2 - n.b / 2) * 1000) / 1000;
      n.y = Math.round((o.y + o.h / 2 - n.h / 2) * 1000) / 1000;
      for (const op of neu.ops) if (op.s === 'typen' && !ops.some((x) => x.s === 'typen' && x.k === op.k)) ops.push(op);
      ops.push({ s: 'objekte', k: id, neu: n });
      k = karte;
    }
  }
  if (vonZeichen && zuZeichen) {
    if (!KACHELN[zuZeichen]) throw new Error(`Unbekannte Kachel „${zuZeichen}“`);
    for (let y = rr.y; y < rr.y + rr.h; y++) for (let x = rr.x; x < rr.x + rr.b; x++) if (karte.kachelAn(x, y) === vonZeichen) ops.push({ s: 'kachel', i: karte.index(x, y), neu: zuZeichen });
  }
  return ops;
}

/** Wald-Generator: Waldboden-Flecken, Bäume/Büsche, optional Lichtung und See */
export function generiereWald(karte, r, { dichte = 5, lichtung = true, see = true, set = 'wald', saat = 7 } = {}) {
  const rr = imFeld(karte, r);
  if (!rr) throw new Error('Bereich liegt außerhalb der Zone');
  const z = zufall(saat);
  const k = karte.klon();
  const ops = [];
  const nimm = (liste) => {
    k.anwenden(liste);
    ops.push(...liste);
  };
  const cx = rr.x + rr.b / 2;
  const cy = rr.y + rr.h / 2;
  // Boden: Waldboden mit Wiese/Erde-Flecken
  const boden = [];
  for (let y = rr.y; y < rr.y + rr.h; y++)
    for (let x = rr.x; x < rr.x + rr.b; x++) {
      if (!STREU_BOEDEN.has(k.kachelAn(x, y))) continue;
      const n = Math.sin(x * 0.31 + saat) * Math.cos(y * 0.27 - saat) + z() * 0.35;
      boden.push({ s: 'kachel', i: k.index(x, y), neu: n > 0.75 ? '0' : n < -0.85 ? '&' : ';' });
    }
  nimm(boden);
  if (see && rr.b >= 20 && rr.h >= 20) {
    const sx = rr.x + rr.b * (0.25 + z() * 0.5);
    const sy = rr.y + rr.h * (0.25 + z() * 0.5);
    const ra = Math.min(rr.b, rr.h) * 0.12;
    const wasser = [];
    for (let y = Math.floor(sy - ra * 1.6); y <= sy + ra * 1.6; y++)
      for (let x = Math.floor(sx - ra * 1.6); x <= sx + ra * 1.6; x++) {
        const d = ((x - sx) / (ra * 1.5)) ** 2 + ((y - sy) / ra) ** 2;
        if (d < 1 && k.imFeld(x, y) && STREU_BOEDEN.has(k.kachelAn(x, y))) wasser.push({ s: 'kachel', i: k.index(x, y), neu: d > 0.75 ? '!' : '~' });
      }
    nimm(wasser);
  }
  const frei = lichtung ? { x: cx + (z() - 0.5) * rr.b * 0.3, y: cy + (z() - 0.5) * rr.h * 0.3, r: Math.min(rr.b, rr.h) * 0.15 } : null;
  // Streuen in Kacheln-Kreisen über die Fläche
  const typen = STREU_SETS[set]?.typen ?? STREU_SETS.wald.typen;
  for (let y = rr.y + 4; y < rr.y + rr.h; y += 8)
    for (let x = rr.x + 4; x < rr.x + rr.b; x += 8) {
      if (frei && (x - frei.x) ** 2 + (y - frei.y) ** 2 < (frei.r + 4) ** 2) continue;
      const { ops: s } = streuOps(k, x, y, 4.6, { typen, dichte, saat: Math.floor(z() * 1e9) });
      nimm(s);
    }
  return { ops, lichtung: frei };
}

/**
 * Dorf-Generator: Straße durch die Mitte, Häuser beidseitig. Häuser aus `vorlagen` (Vorlage-Objekte) oder – ohne
 * Vorlagen – gebaute Räume mit Loot (wohnung). @returns { ops, haeuser }
 */
export function generiereDorf(karte, r, { haeuser = 5, vorlagen = [], saat = 11 } = {}) {
  const rr = imFeld(karte, r);
  if (!rr || rr.b < 20 || rr.h < 20) throw new Error('Dorf braucht mindestens 20 × 20 Kacheln');
  const z = zufall(saat);
  const k = karte.klon();
  const ops = [];
  const nimm = (liste) => {
    k.anwenden(liste);
    ops.push(...liste);
  };
  const waagerecht = rr.b >= rr.h;
  const mitte = waagerecht ? Math.floor(rr.y + rr.h / 2) : Math.floor(rr.x + rr.b / 2);
  nimm(strassenOps(k, waagerecht ? { x: rr.x, y: mitte } : { x: mitte, y: rr.y }, waagerecht ? { x: rr.x + rr.b - 1, y: mitte } : { x: mitte, y: rr.y + rr.h - 1 }, { fahrbahn: 4, gehweg: 1, laternen: 12 }).ops);
  let gebaut = 0;
  const laenge = waagerecht ? rr.b : rr.h;
  const proSeite = Math.ceil(haeuser / 2);
  const schritt = Math.max(12, Math.floor(laenge / proSeite));
  for (let i = 0; i < haeuser; i++) {
    const seite = i % 2 ? 1 : -1;
    const pos = Math.floor(i / 2) * schritt + 2 + Math.floor(z() * 3);
    const v = vorlagen.length ? vorlagen[Math.floor(z() * vorlagen.length)] : null;
    const b = v ? v.b : 8 + Math.floor(z() * 4);
    const h = v ? v.h : 6 + Math.floor(z() * 3);
    const abstand = 2 + 3; // halbe Straße + Gehweg + Vorgarten
    const lx = waagerecht ? rr.x + pos : seite < 0 ? mitte - abstand - b : mitte + abstand;
    const ly = waagerecht ? (seite < 0 ? mitte - abstand - h : mitte + abstand) : rr.y + pos;
    if (lx < rr.x || ly < rr.y || lx + b > rr.x + rr.b || ly + h > rr.y + rr.h) continue;
    try {
      if (v) nimm(vorlageOps(k, v, lx, ly).ops);
      else nimm(raumOps(k, { x: lx, y: ly, b, h, boden: z() < 0.5 ? '+' : '.', tuer: waagerecht ? (seite < 0 ? 's' : 'n') : seite < 0 ? 'o' : 'w', name: `Haus ${gebaut + 1}`, lootTabelle: 'wohnung' }).ops);
      gebaut++;
    } catch {
      // Platz reicht nicht → Haus auslassen
    }
  }
  return { ops, haeuser: gebaut };
}

/** Ops-Liste „verdichten“: je Ziel nur der letzte Wert (für sehr große Generator-Läufe) */
export function verdichte(ops) {
  const letzte = new Map();
  for (const op of ops) letzte.set(op.s === 'kachel' || op.s === 'hoehe' ? `${op.s}:${op.i}` : `${op.s}:${op.k}`, op);
  return [...letzte.values()].map((op) => (op.alt !== undefined ? (({ alt, ...rest }) => rest)(op) : kopie(op)));
}

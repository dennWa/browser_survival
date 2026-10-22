import { ausSchluessel } from './karte.js';

/**
 * KI-Schutz & KI-Bereich außerhalb der Zone (Runde 19, umgebungsfrei).
 *   Geschützte Flächen (Rechtsklick → „🛡 Für die KI schützen“): Rechtecke {x,y,b,h} in Zonen-Koordinaten. Die KI soll die
 *   Umgebung DARAN anpassen (z. B. ein Gebäude), darf darin aber nichts ändern. `opsImSchutz` prüft Editor-Operationen
 *   (vor dem Anwenden auf `karte`): alter UND neuer Ort zählen (Verschieben aus dem Schutz heraus ist auch verboten).
 *   Zonenweite Ops (typen, texturen, raeume, wert, raster) gelten nie als Verstoß.
 *   KI-Bereich über den Zonenrand: `randFuer` → wie viel die Zone wachsen muss; `verschiebeAktionen` rechnet die Aktionen
 *   der KI auf die gewachsene Zone um (links/oben wächst der Ursprung mit).
 */

/** Rechteck (Kacheln, inklusive Ränder) aus {x0,x1,y0,y1} */
export const rechteckAusBereich = (b) => ({ x: b.x0, y: b.y0, b: b.x1 - b.x0 + 1, h: b.y1 - b.y0 + 1 });
export const bereichAusRechteck = (r) => ({ x0: r.x, y0: r.y, x1: r.x + r.b - 1, y1: r.y + r.h - 1 });

/** Überlappen sich zwei Rechtecke {x,y,b,h} (Kacheln, Fläche > 0)? */
export const ueberlappt = (a, c) => a.x < c.x + c.b && c.x < a.x + a.b && a.y < c.y + c.h && c.y < a.y + a.h;

/** Ort eines Sammlungs-Eintrags als Rechteck (Kacheln) oder null (zonenweit/ohne Ort) */
function ortVon(s, k, wert) {
  if (wert === null || wert === undefined) return null;
  if (s === 'marker' || s === 'bemalung') {
    const [x, y] = ausSchluessel(k);
    return { x, y, b: 1, h: 1 };
  }
  if (s === 'ankuenfte') return Number.isFinite(wert.x) ? { x: wert.x, y: wert.y, b: 1, h: 1 } : null;
  if (s === 'bauwerke') return { x: wert.tx, y: wert.ty, b: 1, h: 1 };
  if (['objekte', 'uebergaenge', 'tierBereiche', 'raumFlaechen', 'lootZonen', 'klaenge'].includes(s) && Number.isFinite(wert.x)) {
    // Kronen (ebene 'oben') ragen über Nachbarn – sie zählen nur mit ihrer Mitte
    if (wert.ebene === 'oben') return { x: Math.floor(wert.x + (wert.b ?? 1) / 2), y: Math.floor(wert.y + (wert.h ?? 1) / 2), b: 1, h: 1 };
    return { x: wert.x, y: wert.y, b: Math.max(0.001, wert.b ?? 1), h: Math.max(0.001, wert.h ?? 1) };
  }
  return null;
}

/**
 * Trifft eine Operationsliste eine geschützte Fläche? @returns { x, y } der ersten Stelle oder null
 * `karte` = Stand VOR dem Anwenden (für alte Orte).
 */
export function opsImSchutz(karte, ops, schutz) {
  if (!schutz?.length) return null;
  const imSchutz = (r) => r && schutz.some((sch) => ueberlappt(r, sch));
  for (const op of ops) {
    if (op.s === 'kachel' || op.s === 'hoehe') {
      const r = { x: op.i % karte.breite, y: Math.floor(op.i / karte.breite), b: 1, h: 1 };
      if (imSchutz(r)) return { x: r.x, y: r.y };
      continue;
    }
    if (!karte.sammlungen?.[op.s]) continue;
    for (const r of [ortVon(op.s, op.k, karte.s(op.s).get(op.k)), ortVon(op.s, op.k, op.neu)]) if (imSchutz(r)) return { x: Math.floor(r.x), y: Math.floor(r.y) };
  }
  return null;
}

/** Wie weit ragt das Rechteck r über die Zone? → { links, oben, rechts, unten } (0 = nicht) */
export function randFuer(karte, r) {
  return { links: Math.max(0, -r.x), oben: Math.max(0, -r.y), rechts: Math.max(0, r.x + r.b - karte.breite), unten: Math.max(0, r.y + r.h - karte.hoehe) };
}

const plus = (v, d) => (typeof v === 'number' ? v + d : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) + d : v);

/**
 * KI-Aktionen um (dx, dy) verschieben (Zone ist links/oben gewachsen). Bekannte Ortsfelder: x/y, x0/x1/y0/y1, von/bis.
 * Aktionen mit Objekt-ID (aendere/entferne mit id) behalten die ID, nur ein neuer Ort (x/y) wird verschoben.
 */
export function verschiebeAktionen(aktionen, dx, dy) {
  if (!dx && !dy) return aktionen;
  return aktionen.map((a) => {
    if (!a || typeof a !== 'object' || Array.isArray(a)) return a;
    const n = { ...a };
    if ('x' in n) n.x = plus(n.x, dx);
    if ('y' in n) n.y = plus(n.y, dy);
    if ('x0' in n) n.x0 = plus(n.x0, dx);
    if ('x1' in n) n.x1 = plus(n.x1, dx);
    if ('y0' in n) n.y0 = plus(n.y0, dy);
    if ('y1' in n) n.y1 = plus(n.y1, dy);
    for (const f of ['von', 'bis']) if (Array.isArray(n[f]) && n[f].length >= 2) n[f] = [plus(n[f][0], dx), plus(n[f][1], dy)];
    return n;
  });
}

/** Text für die KI: geschützte Flächen + was darin steht (Objekt-Typen) */
export function schutzText(karte, schutz) {
  if (!schutz?.length) return [];
  const zeilen = ['## 🛡 Geschützte Flächen – NICHT verändern', 'Darin darf sich nichts ändern (keine Kacheln, Objekte, Marker, Bauwerke). Passe die Umgebung so an, dass sie zu diesen Flächen passt (Wege hinführen, Abstand halten, Stil übernehmen).'];
  for (const r of schutz) {
    const typen = new Map();
    for (const [, o] of karte.s('objekte')) {
      const ort = ortVon('objekte', null, o);
      if (ort && ueberlappt(ort, r)) typen.set(o.typ, (typen.get(o.typ) ?? 0) + 1);
    }
    for (const [, w] of karte.s('bauwerke')) if (ueberlappt({ x: w.tx, y: w.ty, b: 1, h: 1 }, r)) typen.set(`bauwerk:${w.typ}`, (typen.get(`bauwerk:${w.typ}`) ?? 0) + 1);
    const inhalt = [...typen].map(([t, n]) => `${n}× ${t}`).join(', ');
    zeilen.push(`- x ${r.x}–${r.x + r.b - 1}, y ${r.y}–${r.y + r.h - 1}${inhalt ? ` (enthält: ${inhalt})` : ''}`);
  }
  zeilen.push('');
  return zeilen;
}

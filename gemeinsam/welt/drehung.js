/**
 * Frei gedrehte Kartenobjekte (Map-Editor 2.0, Schritt 5.5) – gemeinsame Regel für Spiel (Kollision) und Editor (Prüfung, Anzeige).
 * Ein Objekt { x, y, b, h, drehung° } belegt wie bisher die Grundfläche b × h ab (x, y). Vielfache von 90° sind darin schon
 * enthalten (der Editor tauscht b/h beim Vierteldrehen). Nur der REST gegenüber dem nächsten 90°-Schritt (−45° … 45°) dreht die
 * Grundfläche zusätzlich um ihre Mitte (im Uhrzeigersinn, wie Canvas/Renderer). Rest 0 → exakt die alte achsparallele Regel.
 *   drehLage(drehung)        → { grad 0..360, viertel 0..3, rest (−45, 45], quer } (quer = eigene Maße sind h × b)
 *   eigeneGroesse(o)         → { b, h } des Objekts vor dem Drehen (für Modelle/Quader, die um den vollen Winkel gedreht werden)
 *   ecken(o) / huelle(o)     → Eckpunkte bzw. achsparallele Hülle der gedrehten Grundfläche
 *   enthaelt(o, px, py)      → liegt der Punkt (Kacheln) echt innerhalb?
 *   bedeckteKacheln(o, breite) → Kachelindizes, deren Mittelpunkt innerhalb liegt (Kollision, Pfadsuche)
 *   ueberlappen(a, b)        → schneiden sich zwei (gedrehte) Grundflächen? (Trennachsen-Test)
 */
const RAD = Math.PI / 180;

export function drehLage(drehung = 0) {
  const grad = (((Number(drehung) || 0) % 360) + 360) % 360;
  const stufe = Math.ceil(grad / 90 - 0.5) || 0; // 45° → Rest +45 (nicht −45)
  const rest = Math.round((grad - stufe * 90) * 1e9) / 1e9 || 0;
  const viertel = stufe % 4;
  return { grad, viertel, rest, quer: viertel % 2 === 1 };
}

export function eigeneGroesse(o) {
  return drehLage(o.drehung).quer ? { b: o.h, h: o.b } : { b: o.b, h: o.h };
}

export function ecken(o) {
  const { rest } = drehLage(o.drehung);
  const cx = o.x + o.b / 2;
  const cy = o.y + o.h / 2;
  const c = Math.cos(rest * RAD);
  const s = Math.sin(rest * RAD);
  return [
    [-o.b / 2, -o.h / 2],
    [o.b / 2, -o.h / 2],
    [o.b / 2, o.h / 2],
    [-o.b / 2, o.h / 2],
  ].map(([dx, dy]) => [cx + dx * c - dy * s, cy + dx * s + dy * c]);
}

export function huelle(o) {
  if (!drehLage(o.drehung).rest) return { x0: o.x, y0: o.y, x1: o.x + o.b, y1: o.y + o.h };
  const e = ecken(o);
  return { x0: Math.min(...e.map((p) => p[0])), y0: Math.min(...e.map((p) => p[1])), x1: Math.max(...e.map((p) => p[0])), y1: Math.max(...e.map((p) => p[1])) };
}

export function enthaelt(o, px, py) {
  const { rest } = drehLage(o.drehung);
  if (!rest) return px > o.x && px < o.x + o.b && py > o.y && py < o.y + o.h;
  const dx = px - (o.x + o.b / 2);
  const dy = py - (o.y + o.h / 2);
  const c = Math.cos(rest * RAD);
  const s = Math.sin(rest * RAD);
  return Math.abs(dx * c + dy * s) < o.b / 2 && Math.abs(-dx * s + dy * c) < o.h / 2;
}

export function bedeckteKacheln(o, breite) {
  const ergebnis = [];
  const h = huelle(o);
  for (let ty = Math.floor(h.y0); ty < Math.ceil(h.y1); ty++)
    for (let tx = Math.floor(h.x0); tx < Math.ceil(h.x1); tx++) if (enthaelt(o, tx + 0.5, ty + 0.5)) ergebnis.push(ty * breite + tx);
  return ergebnis;
}

/** Trennachsen-Test für zwei Rechtecke (Berührung zählt nicht als Überlappung) */
export function ueberlappen(a, b) {
  const ea = ecken(a);
  const eb = ecken(b);
  for (const e of [ea, eb])
    for (let i = 0; i < 2; i++) {
      const ax = e[i + 1][0] - e[i][0];
      const ay = e[i + 1][1] - e[i][1];
      const proj = (pts) => pts.map((p) => p[0] * ax + p[1] * ay);
      const pa = proj(ea);
      const pb = proj(eb);
      const eps = 1e-9 * (Math.abs(ax) + Math.abs(ay) + 1);
      if (Math.max(...pa) <= Math.min(...pb) + eps || Math.max(...pb) <= Math.min(...pa) + eps) return false;
    }
  return true;
}

/**
 * Weltanordnung der Zonen (Feedback 6.4) – umgebungsfrei, getestet in tests/weltLayout.test.js.
 * layout = { zonenId: { x, y } } (linke obere Ecke in Welt-Kacheln, liegt im Editor-Speicher meta/layout, nicht in der Karte);
 * groessen = Map|Objekt zonenId → { breite, hoehe } (EditorKarten passen direkt).
 * Zonen dürfen sich berühren (Kante an Kante = Nachbarn für Übergänge), aber nicht überlappen. Die Gesamtfläche ist unbegrenzt.
 *   zonenRechteck       { x, y, b, h } einer Zone (oder null)
 *   ueberlappen(a, b)   echte Überlappung (Berühren zählt nicht)
 *   konflikte           Zonen, die eine Zone an einer (gedachten) Stelle überlappen würde
 *   freiePosition       Platz für eine neue Zone b×h: direkt neben `neben` (rechts, unten, links, oben), sonst neben einer
 *                       anderen Zone, sonst rechts von allen – nie überlappend
 *   rasteZoneEin        beim Ziehen an Kanten anderer Zonen einrasten (Abstand ≤ fang)
 *   verschiebeZone      neue Lage prüfen → { ok, layout | konflikte }
 */
const groesseVon = (groessen, id) => (groessen instanceof Map ? groessen.get(id) : groessen?.[id]) ?? null;
const ids = (groessen) => (groessen instanceof Map ? [...groessen.keys()] : Object.keys(groessen ?? {}));

export function zonenRechteck(layout, groessen, id, pos = layout?.[id]) {
  const g = groesseVon(groessen, id);
  if (!g || !pos) return null;
  return { x: pos.x, y: pos.y, b: g.breite, h: g.hoehe };
}

/** Überlappen sich zwei Rechtecke wirklich (gemeinsame Fläche > 0)? Kante an Kante = nein */
export function ueberlappen(a, b) {
  return a.x < b.x + b.b && b.x < a.x + a.b && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** Welche anderen Zonen überlappt `id` an Position `pos` (Standard: aktuelle Lage)? → [ids] */
export function konflikte(layout, groessen, id, pos = layout?.[id], groesse = null) {
  const g = groesse ?? groesseVon(groessen, id);
  if (!g || !pos) return [];
  const r = { x: pos.x, y: pos.y, b: g.breite, h: g.hoehe };
  return ids(groessen).filter((andere) => {
    if (andere === id || !layout?.[andere]) return false;
    const q = zonenRechteck(layout, groessen, andere);
    return q && ueberlappen(r, q);
  });
}

/** Freier Platz für ein neues Rechteck b × h (überlappt nichts). neben = Zonen-ID, an die es bevorzugt anschließt. */
export function freiePosition(layout, groessen, { b, h, neben = null } = {}) {
  const andere = ids(groessen).filter((id) => layout?.[id]).map((id) => ({ id, ...zonenRechteck(layout, groessen, id) }));
  if (!andere.length) return { x: 0, y: 0 };
  const frei = (p) => !andere.some((q) => ueberlappen({ x: p.x, y: p.y, b, h }, q));
  const kandidaten = (q) => [
    { x: q.x + q.b, y: q.y }, // rechts, oben bündig
    { x: q.x, y: q.y + q.h }, // unten, links bündig
    { x: q.x - b, y: q.y }, // links
    { x: q.x, y: q.y - h }, // oben
    { x: q.x + q.b, y: q.y + q.h - h }, // rechts, unten bündig
    { x: q.x + q.b - b, y: q.y + q.h }, // unten, rechts bündig
  ];
  const reihe = [...andere.filter((q) => q.id === neben), ...andere.filter((q) => q.id !== neben)];
  for (const q of reihe) for (const p of kandidaten(q)) if (frei(p)) return p;
  // Notlösung: rechts neben alles
  return { x: Math.max(...andere.map((q) => q.x + q.b)), y: Math.min(...andere.map((q) => q.y)) };
}

/** Ziehen: an Kanten/Bündigkeit anderer Zonen einrasten (wenn näher als `fang` Kacheln) → { x, y } */
export function rasteZoneEin(layout, groessen, id, pos, fang = 2) {
  const g = groesseVon(groessen, id);
  if (!g) return { x: Math.round(pos.x), y: Math.round(pos.y) };
  let x = Math.round(pos.x);
  let y = Math.round(pos.y);
  let bestX = fang + 1;
  let bestY = fang + 1;
  let zx = x;
  let zy = y;
  for (const andere of ids(groessen)) {
    if (andere === id) continue;
    const q = zonenRechteck(layout, groessen, andere);
    if (!q) continue;
    // nur einrasten, wenn die Zonen sich auf der anderen Achse überhaupt nahe kommen
    const nahY = y < q.y + q.h + fang && q.y < y + g.hoehe + fang;
    const nahX = x < q.x + q.b + fang && q.x < x + g.breite + fang;
    if (nahY) for (const [kandidat, ziel] of [[x, q.x + q.b], [x + g.breite, q.x], [x, q.x], [x + g.breite, q.x + q.b]]) {
      const d = Math.abs(kandidat - ziel);
      if (d <= fang && d < bestX) {
        bestX = d;
        zx = x + (ziel - kandidat);
      }
    }
    if (nahX) for (const [kandidat, ziel] of [[y, q.y + q.h], [y + g.hoehe, q.y], [y, q.y], [y + g.hoehe, q.y + q.h]]) {
      const d = Math.abs(kandidat - ziel);
      if (d <= fang && d < bestY) {
        bestY = d;
        zy = y + (ziel - kandidat);
      }
    }
  }
  return { x: zx, y: zy };
}

/** Zone an neue Stelle legen? → { ok: true, layout } (Kopie) oder { ok: false, konflikte } */
export function verschiebeZone(layout, groessen, id, ziel) {
  if (!groesseVon(groessen, id)) return { ok: false, konflikte: [], grund: `Zone „${id}“ unbekannt` };
  const pos = { x: Math.round(ziel.x), y: Math.round(ziel.y) };
  if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y)) return { ok: false, konflikte: [], grund: 'Lage ungültig' };
  const k = konflikte(layout, groessen, id, pos);
  if (k.length) return { ok: false, konflikte: k, grund: `überlappt ${k.join(', ')}` };
  return { ok: true, layout: { ...layout, [id]: pos }, konflikte: [] };
}

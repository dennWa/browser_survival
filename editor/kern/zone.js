import { EditorKarte, ID_SAMMLUNGEN, markerSchluessel, ausSchluessel } from './karte.js';

/**
 * Zone = Rechteck (Phase 2). Neu anlegen (nur Rasen) und Größe ändern (Ränder wachsen/schrumpfen).
 * Alles, was beim Verkleinern ganz oder teilweise herausfällt, wird gemeldet (Warnung + Bestätigung im UI) und entfernt.
 */
export const MIN_GROESSE = 4;
export const MAX_GROESSE = 400;
export const ZONEN_ID_MUSTER = /^[a-z0-9_]{1,40}$/;

export function neueZone({ id = 'neue_zone', name = 'Neue Zone', breite = 40, hoehe = 30 } = {}) {
  const b = Math.max(MIN_GROESSE, Math.min(MAX_GROESSE, Math.round(breite)));
  const h = Math.max(MIN_GROESSE, Math.min(MAX_GROESSE, Math.round(hoehe)));
  return new EditorKarte({ id, name, breite: b, hoehe: h, fuellung: ',' });
}

/** Ein Element (in Kachelkoordinaten) – Rechteck */
function rechteckVon(sammlung, o) {
  if (sammlung === 'bauwerke') return { x: o.tx, y: o.ty, b: 1, h: 1 };
  return { x: o.x, y: o.y, b: o.b ?? 1, h: o.h ?? 1 };
}

const BESCHREIBUNG = { objekte: 'Objekt', uebergaenge: 'Übergang', bauwerke: 'Bauwerk', tierBereiche: 'Tier-Bereich', raumFlaechen: 'Raumfläche' };

/**
 * Größe ändern. Ränder in Kacheln: positiv = wachsen, negativ = schrumpfen.
 * @returns {{ ops, abgeschnitten: [{ art, text, x, y }], breite, hoehe }}
 */
export function groesseAendern(karte, { links = 0, oben = 0, rechts = 0, unten = 0 }, fuellung = ',') {
  const breite = karte.breite + links + rechts;
  const hoehe = karte.hoehe + oben + unten;
  if (breite < MIN_GROESSE || hoehe < MIN_GROESSE) throw new Error(`Zone zu klein (mindestens ${MIN_GROESSE} × ${MIN_GROESSE})`);
  if (breite > MAX_GROESSE || hoehe > MAX_GROESSE) throw new Error(`Zone zu groß (höchstens ${MAX_GROESSE} × ${MAX_GROESSE})`);
  const zellen = new Array(breite * hoehe).fill(fuellung);
  const hoehen = new Array(breite * hoehe).fill(0);
  for (let y = 0; y < hoehe; y++) {
    for (let x = 0; x < breite; x++) {
      const ax = x - links;
      const ay = y - oben;
      if (!karte.imFeld(ax, ay)) continue;
      zellen[y * breite + x] = karte.zellen[karte.index(ax, ay)];
      hoehen[y * breite + x] = karte.hoehen[karte.index(ax, ay)];
    }
  }
  const ops = [{ s: 'raster', neu: { breite, hoehe, zellen, hoehen } }];
  const abgeschnitten = [];
  const drin = (r) => r.x >= 0 && r.y >= 0 && r.x + r.b <= breite + 1e-9 && r.y + r.h <= hoehe + 1e-9;
  for (const s of ID_SAMMLUNGEN) {
    for (const [id, o] of karte.s(s)) {
      const r = rechteckVon(s, o);
      const neu = s === 'bauwerke' ? { ...o, tx: o.tx + links, ty: o.ty + oben } : { ...o, x: o.x + links, y: o.y + oben };
      if (!drin(rechteckVon(s, neu))) {
        abgeschnitten.push({ art: s, text: `${BESCHREIBUNG[s]} ${o.typ ?? o.name ?? o.ziel ?? o.art ?? ''} bei ${r.x}|${r.y}`.trim(), x: r.x, y: r.y });
        ops.push({ s, k: id, neu: null });
      } else if (links || oben) ops.push({ s, k: id, neu });
    }
  }
  for (const [k, m] of karte.s('marker')) {
    const [x, y] = ausSchluessel(k);
    const nx = x + links;
    const ny = y + oben;
    const inZone = nx >= 0 && ny >= 0 && nx < breite && ny < hoehe;
    if (!inZone) abgeschnitten.push({ art: 'marker', text: `Marker ${m.art}${m.raum ? ` (${m.raum})` : ''} bei ${x}|${y}`, x, y });
    if (!inZone || links || oben) ops.push({ s: 'marker', k, neu: null });
  }
  if (links || oben) {
    for (const [k, m] of karte.s('marker')) {
      const [x, y] = ausSchluessel(k);
      const nx = x + links;
      const ny = y + oben;
      if (nx >= 0 && ny >= 0 && nx < breite && ny < hoehe) ops.push({ s: 'marker', k: markerSchluessel(nx, ny), neu: m });
    }
  }
  for (const [k, f] of karte.s('bemalung')) {
    const [x, y] = ausSchluessel(k);
    const nx = x + links;
    const ny = y + oben;
    const inZone = nx >= 0 && ny >= 0 && nx < breite && ny < hoehe;
    if (!inZone || links || oben) ops.push({ s: 'bemalung', k, neu: null });
  }
  if (links || oben) {
    for (const [k, f] of karte.s('bemalung')) {
      const [x, y] = ausSchluessel(k);
      if (x + links >= 0 && y + oben >= 0 && x + links < breite && y + oben < hoehe) ops.push({ s: 'bemalung', k: markerSchluessel(x + links, y + oben), neu: f });
    }
  }
  for (const [n, p] of karte.s('ankuenfte')) {
    const nx = p.x + links;
    const ny = p.y + oben;
    if (nx < 0 || ny < 0 || nx >= breite || ny >= hoehe) {
      abgeschnitten.push({ art: 'ankunft', text: `Ankunft "${n}" bei ${p.x}|${p.y}`, x: p.x, y: p.y });
      ops.push({ s: 'ankuenfte', k: n, neu: null });
    } else if (links || oben) ops.push({ s: 'ankuenfte', k: n, neu: { x: nx, y: ny } });
  }
  return { ops, abgeschnitten, breite, hoehe };
}

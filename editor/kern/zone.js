import { ZONE_MAX_KACHELN } from '../../gemeinsam/konstanten.js';
import { EditorKarte, ID_SAMMLUNGEN, markerSchluessel, ausSchluessel } from './karte.js';

/**
 * Zone = Rechteck (Phase 2). Neu anlegen (nur Rasen) und Größe ändern (Ränder wachsen/schrumpfen).
 * Alles, was beim Verkleinern ganz oder teilweise herausfällt, wird gemeldet (Warnung + Bestätigung im UI) und entfernt.
 * Feedback 6.4: eine Zone darf bis MAX_GROESSE × MAX_GROESSE (= ZONE_MAX_KACHELN, 1500 – das Spiel lädt jede Zone komplett hinter dem Ladebild) groß sein, die Weltfläche (viele Zonen) ist unbegrenzt.
 *   Ab GROSS_KACHELN schaltet der Editor teure Automatiken ab (Live-Prüfung, Innen-Anzeige, 3D vereinfacht), ab
 *   SEHR_GROSS_KACHELN fragt er vor dem Anlegen nach (`groessenHinweis`), Speicher-Schätzung `speicherSchaetzung`.
 *   Die Raster-Operation von `groesseAendern` trägt `versatz` {x: links, y: oben} → zustand verschiebt die Weltlage mit
 *   (sonst rutschte die Zone beim Wachsen nach links/oben in der Weltanordnung weg).
 */
export const MIN_GROESSE = 4;
export const MAX_GROESSE = ZONE_MAX_KACHELN;
/** ab hier (Kacheln) keine Live-Prüfung/Innen-Anzeige, 3D vereinfacht, Autosave seltener */
export const GROSS_KACHELN = 1_000_000;
/** ab hier Rückfrage vor dem Anlegen/Vergrößern */
export const SEHR_GROSS_KACHELN = 1_500_000;
/** grob geschätzter Arbeitsspeicher je Kachel im Editor (Raster, Höhen, Speichern, Puffer) */
export const BYTES_JE_KACHEL = 24;
export const ZONEN_ID_MUSTER = /^[a-z0-9_]{1,40}$/;

/** Ist die Zone so groß, dass der Editor sparsamer arbeitet? */
export const istGrosseZone = (karte) => !!karte && karte.breite * karte.hoehe >= GROSS_KACHELN;

/** Geschätzter Speicherbedarf (Bytes) einer Zone b × h */
export const speicherSchaetzung = (b, h) => b * h * BYTES_JE_KACHEL;

/**
 * Hinweis zur Größe einer (neuen/vergrößerten) Zone → null (unkritisch) | { stufe: 'gross'|'sehr'|'zuviel', text }.
 * heapGrenze (Bytes, optional, z. B. performance.memory.jsHeapSizeLimit) → 'zuviel', wenn die Schätzung > 60 % davon.
 */
export function groessenHinweis(b, h, { heapGrenze = null } = {}) {
  const n = b * h;
  const mb = Math.round(speicherSchaetzung(b, h) / 1048576);
  const mio = (n / 1e6).toLocaleString('de-DE', { maximumFractionDigits: 1 });
  if (heapGrenze && speicherSchaetzung(b, h) > heapGrenze * 0.6) return { stufe: 'zuviel', text: `${b} × ${h} = ${mio} Mio. Kacheln brauchen im Editor etwa ${mb} MB – mehr, als dieser Browser-Tab sicher hat (Absturzgefahr). Bitte kleiner anlegen und mehrere Zonen nebeneinander legen (Weltanordnung, unbegrenzt).` };
  if (n >= SEHR_GROSS_KACHELN) return { stufe: 'sehr', text: `Sehr große Zone: ${mio} Mio. Kacheln (~${mb} MB im Editor). Speichern, Prüfen, 3D und KI werden langsam; das Spiel ist mit so großen Zonen nicht getestet. Empfehlung: mehrere kleinere Zonen nebeneinander (Weltanordnung).` };
  if (n >= GROSS_KACHELN) return { stufe: 'gross', text: `Große Zone (${mio} Mio. Kacheln): Live-Prüfung und Innen-Anzeige laufen nur auf Knopfdruck, 3D zeigt den Boden vereinfacht.` };
  return null;
}

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
  // versatz: um so viel wandert der alte Ursprung im neuen Raster → Weltlage der Zone verschiebt sich um −versatz (zustand.js)
  const ops = [{ s: 'raster', neu: { breite, hoehe, zellen, hoehen, ...(links || oben ? { versatz: { x: links, y: oben } } : {}) } }];
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

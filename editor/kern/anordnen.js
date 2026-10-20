import { ausSchluessel, markerSchluessel, kopie } from './karte.js';

/**
 * Mehrfachauswahl anordnen (Editor 2.0, Schritt 7.2) – umgebungsfrei, getestet in tests/anordnen.test.js.
 * Eingabe wie überall: gewaehlte = [{ s, k, wert }]. Ausgabe: { ops, neueAuswahl } (1 Undo-Schritt beim Aufrufer).
 *   ausrichten: links | rechts | oben | unten | mitteH (waagerechte Mitte) | mitteV – am gemeinsamen Rahmen der Auswahl
 *   verteilen:  'h' | 'v' – erstes und letztes Element bleiben, dazwischen gleiche Lücken (ab 3 Elementen)
 *   spiegeln:   'h' (links ⇄ rechts) | 'v' (oben ⇄ unten) im Rahmen der Auswahl bzw. im markierten Rechteck – inkl. Kacheln,
 *               Höhen und Bemalung im Rechteck, Objekt-Drehung und Lampen-Richtung.
 * Raster: Objekte und Punkt-Klänge dürfen Brüche haben (3 Stellen), alles andere bleibt auf ganzen Kacheln.
 * Globale Klänge haben keinen Ort und bleiben, wie sie sind.
 */
const r3 = (v) => Math.round(v * 1000) / 1000;
const FREI = new Set(['objekte']);

/** Rechteck eines Elements in Kacheln oder null (ohne Ort) */
export function rahmenVon(s, k, w) {
  if (s === 'marker') {
    const [x, y] = ausSchluessel(k);
    return { x, y, b: 1, h: 1 };
  }
  if (s === 'bauwerke') return { x: w.tx, y: w.ty, b: 1, h: 1 };
  if (s === 'ankuenfte') return { x: w.x, y: w.y, b: 1, h: 1 };
  if (s === 'klaenge') return w.art === 'punkt' ? { x: w.x, y: w.y, b: 0, h: 0 } : w.art === 'bereich' ? { x: w.x, y: w.y, b: w.b, h: w.h } : null;
  if (Number.isFinite(w?.x) && Number.isFinite(w?.y)) return { x: w.x, y: w.y, b: w.b ?? 1, h: w.h ?? 1 };
  return null;
}

/** Gemeinsamer Rahmen */
export function gesamtRahmen(liste) {
  const r = liste.map((e) => e.r);
  const x0 = Math.min(...r.map((a) => a.x));
  const y0 = Math.min(...r.map((a) => a.y));
  return { x: x0, y: y0, b: Math.max(...r.map((a) => a.x + a.b)) - x0, h: Math.max(...r.map((a) => a.y + a.h)) - y0 };
}

function elemente(gewaehlte) {
  return gewaehlte.map((e) => ({ ...e, r: rahmenVon(e.s, e.k, e.wert) })).filter((e) => e.r);
}

/** Element an neue linke obere Ecke (x, y) setzen → Ops (Marker = Schlüssel ändern) */
function versetzt(e, x, y, extra = {}) {
  const ganz = !FREI.has(e.s) && !(e.s === 'klaenge' && e.wert.art === 'punkt');
  const nx = ganz ? Math.round(x) : r3(x);
  const ny = ganz ? Math.round(y) : r3(y);
  if (e.s === 'marker') {
    const k = markerSchluessel(nx, ny);
    return { weg: k === e.k ? [] : [{ s: 'marker', k: e.k, neu: null }], neu: [{ s: 'marker', k, neu: { ...e.wert, ...extra } }], auswahl: { s: 'marker', k } };
  }
  const neu = e.s === 'bauwerke' ? { ...e.wert, tx: nx, ty: ny, ...extra } : { ...e.wert, x: nx, y: ny, ...extra };
  return { weg: [], neu: [{ s: e.s, k: e.k, neu }], auswahl: { s: e.s, k: e.k } };
}

function sammle(teile) {
  // erst alle Marker entfernen, dann setzen (sonst löscht ein Marker den gerade dorthin verschobenen)
  return { ops: [...teile.flatMap((t) => t.weg), ...teile.flatMap((t) => t.neu)], neueAuswahl: teile.map((t) => t.auswahl) };
}

export function ausrichtenOps(karte, gewaehlte, wie) {
  const liste = elemente(gewaehlte);
  if (liste.length < 2) return { ops: [], neueAuswahl: gewaehlte.map(({ s, k }) => ({ s, k })), grund: 'Mindestens 2 Elemente mit Ort wählen' };
  const g = gesamtRahmen(liste);
  return sammle(
    liste.map((e) => {
      const { r } = e;
      const x = wie === 'links' ? g.x : wie === 'rechts' ? g.x + g.b - r.b : wie === 'mitteH' ? g.x + g.b / 2 - r.b / 2 : r.x;
      const y = wie === 'oben' ? g.y : wie === 'unten' ? g.y + g.h - r.h : wie === 'mitteV' ? g.y + g.h / 2 - r.h / 2 : r.y;
      return versetzt(e, x, y);
    }),
  );
}

export function verteilenOps(karte, gewaehlte, achse = 'h') {
  const liste = elemente(gewaehlte);
  if (liste.length < 3) return { ops: [], neueAuswahl: gewaehlte.map(({ s, k }) => ({ s, k })), grund: 'Mindestens 3 Elemente mit Ort wählen' };
  const pos = achse === 'h' ? 'x' : 'y';
  const groesse = achse === 'h' ? 'b' : 'h';
  liste.sort((a, b) => a.r[pos] - b.r[pos]);
  const erst = liste[0].r;
  const letzt = liste.at(-1).r;
  const summe = liste.reduce((s, e) => s + e.r[groesse], 0);
  const luecke = (letzt[pos] + letzt[groesse] - erst[pos] - summe) / (liste.length - 1);
  let lauf = erst[pos];
  return sammle(
    liste.map((e) => {
      const p = lauf;
      lauf += e.r[groesse] + luecke;
      return achse === 'h' ? versetzt(e, p, e.r.y) : versetzt(e, e.r.x, p);
    }),
  );
}

/** Drehung/Richtung beim Spiegeln */
function gespiegelt(e, achse) {
  const w = e.wert;
  const extra = {};
  if (e.s === 'objekte') {
    if (w.drehung) extra.drehung = achse === 'h' ? (360 - w.drehung) % 360 : (540 - w.drehung) % 360;
    if (w.art === 'kegel' && Number.isFinite(w.richtung)) extra.richtung = achse === 'h' ? (540 - w.richtung) % 360 : (360 - w.richtung) % 360;
  }
  return extra;
}

/**
 * Spiegeln. rechteck (Kacheln, optional) = markiertes Auswahl-Rechteck: dann werden auch dessen Kacheln, Höhen und Bemalung
 * gespiegelt, und die Achse ist seine Mitte; sonst der Rahmen der gewählten Elemente.
 */
export function spiegelnOps(karte, gewaehlte, achse = 'h', rechteck = null) {
  const liste = elemente(gewaehlte);
  if (!liste.length && !rechteck) return { ops: [], neueAuswahl: [], grund: 'Nichts gewählt' };
  const g = rechteck ?? gesamtRahmen(liste);
  const teile = liste.map((e) => {
    const { r } = e;
    const x = achse === 'h' ? g.x + (g.x + g.b) - (r.x + r.b) : r.x;
    const y = achse === 'v' ? g.y + (g.y + g.h) - (r.y + r.h) : r.y;
    return versetzt(e, x, y, gespiegelt(e, achse));
  });
  const { ops, neueAuswahl } = sammle(teile);
  if (rechteck) {
    const zielX = (x) => (achse === 'h' ? rechteck.x + rechteck.x + rechteck.b - 1 - x : x);
    const zielY = (y) => (achse === 'v' ? rechteck.y + rechteck.y + rechteck.h - 1 - y : y);
    for (let y = rechteck.y; y < rechteck.y + rechteck.h; y++)
      for (let x = rechteck.x; x < rechteck.x + rechteck.b; x++) {
        if (!karte.imFeld(x, y)) continue;
        const qx = zielX(x);
        const qy = zielY(y);
        if (!karte.imFeld(qx, qy)) continue;
        const i = y * karte.breite + x;
        const q = qy * karte.breite + qx;
        if (karte.zellen[q] !== karte.zellen[i]) ops.push({ s: 'kachel', i, neu: karte.zellen[q] });
        if (karte.hoehen[q] !== karte.hoehen[i]) ops.push({ s: 'hoehe', i, neu: karte.hoehen[q] });
        const farbe = karte.s('bemalung').get(markerSchluessel(qx, qy)) ?? null;
        if ((karte.s('bemalung').get(markerSchluessel(x, y)) ?? null) !== farbe) ops.push({ s: 'bemalung', k: markerSchluessel(x, y), neu: farbe ? kopie(farbe) : null });
      }
  }
  return { ops, neueAuswahl };
}

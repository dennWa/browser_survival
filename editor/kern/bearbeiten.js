import { ausSchluessel, markerSchluessel, kopie } from './karte.js';

/**
 * Bearbeiten gewählter Elemente (umgebungsfrei, getestet in tests/editor.test.js): verschieben, drehen, duplizieren.
 * Eingabe: gewaehlte = [{ s, k, wert }] (wie zustand.gewaehlte()). Ausgabe: Operationen für EditorKarte.anwenden +
 * die neue Auswahl. Regeln:
 *   - Objekte bleiben in der Zone: was vorher ganz drin lag, darf nicht über den Rand geschoben werden
 *     (Baumkronen – ebene 'oben' – dürfen höchstens zur Hälfte überstehen, wie in den Spielzonen).
 *   - Drehen um 90° bleibt im Raster: ganzzahlige Objekte auf ganzzahliger Position drehen um die Mitte, wenn das wieder
 *     im Raster landet, sonst um die linke obere Ecke (kein „halbe Kachel“-Versatz, viermal drehen = Ausgangslage).
 */
const r3 = (v) => Math.round(v * 1000) / 1000;

/** Überstand eines Rechtecks über den Zonenrand (Summe aller Seiten, 0 = ganz drin) */
export function ueberstand(karte, o) {
  const b = o.b ?? 1;
  const h = o.h ?? 1;
  return Math.max(0, -o.x) + Math.max(0, -o.y) + Math.max(0, o.x + b - karte.breite) + Math.max(0, o.y + h - karte.hoehe);
}

/** Darf ein Objekt an dieser Stelle stehen (verglichen mit vorher)? */
function objektPasst(karte, vorher, neu) {
  const b = neu.b ?? 1;
  const h = neu.h ?? 1;
  if (neu.ebene === 'oben') return neu.x >= -b / 2 - 1e-9 && neu.y >= -h / 2 - 1e-9 && neu.x + b / 2 <= karte.breite + 1e-9 && neu.y + h / 2 <= karte.hoehe + 1e-9;
  // Was schon übersteht (alte Karten), darf nicht weiter hinaus – zurück in die Zone geht immer
  return ueberstand(karte, neu) <= ueberstand(karte, vorher) + 1e-9;
}

/**
 * Gewähltes um (dx, dy) Kacheln verschieben. Marker/Ankünfte/Bauwerke/Übergänge/Bereiche nur um ganze Kacheln.
 * @returns { ops, neueAuswahl } oder { ops: null, grund } wenn etwas aus der Zone fiele
 */
export function verschiebeOps(karte, gewaehlte, dx, dy) {
  const ganz = Number.isInteger(dx) && Number.isInteger(dy);
  const ops = [];
  const neueAuswahl = [];
  const markerWeg = [];
  const markerNeu = [];
  const raus = { ops: null, grund: 'Rand der Zone erreicht' };
  for (const { s, k, wert } of gewaehlte) {
    if (s === 'objekte') {
      const neu = { ...wert, x: r3(wert.x + dx), y: r3(wert.y + dy) };
      if (!objektPasst(karte, wert, neu)) return raus;
      ops.push({ s, k, neu });
      neueAuswahl.push({ s, k });
      continue;
    }
    if (!ganz) {
      neueAuswahl.push({ s, k });
      continue;
    }
    if (s === 'marker') {
      const [x, y] = ausSchluessel(k);
      if (!karte.imFeld(x + dx, y + dy)) return raus;
      markerWeg.push({ s, k, neu: null });
      markerNeu.push({ s, k: markerSchluessel(x + dx, y + dy), neu: wert });
      neueAuswahl.push({ s, k: markerSchluessel(x + dx, y + dy) });
    } else if (s === 'ankuenfte') {
      if (!karte.imFeld(wert.x + dx, wert.y + dy)) return raus;
      ops.push({ s, k, neu: { ...wert, x: wert.x + dx, y: wert.y + dy } });
      neueAuswahl.push({ s, k });
    } else if (s === 'bauwerke') {
      if (!karte.imFeld(wert.tx + dx, wert.ty + dy)) return raus;
      ops.push({ s, k, neu: { ...wert, tx: wert.tx + dx, ty: wert.ty + dy } });
      neueAuswahl.push({ s, k });
    } else {
      const neu = { ...wert, x: wert.x + dx, y: wert.y + dy };
      if (neu.x < 0 || neu.y < 0 || neu.x + neu.b > karte.breite || neu.y + neu.h > karte.hoehe) return raus;
      ops.push({ s, k, neu });
      neueAuswahl.push({ s, k });
    }
  }
  return { ops: [...ops, ...markerWeg, ...markerNeu], neueAuswahl };
}

/** Objekt um 90° im Uhrzeigersinn drehen (b/h tauschen, drehung + 90) – im Raster, in der Zone */
export function dreheObjekt(karte, o) {
  const cx = o.x + o.b / 2;
  const cy = o.y + o.h / 2;
  const neu = { ...o, b: o.h, h: o.b, x: r3(cx - o.h / 2), y: r3(cy - o.b / 2), drehung: ((o.drehung ?? 0) + 90) % 360 };
  const imRaster = (w) => Number.isInteger(w);
  if (imRaster(o.x) && imRaster(o.y) && imRaster(o.b) && imRaster(o.h) && !(imRaster(neu.x) && imRaster(neu.y))) {
    // Mitte läge auf einer halben Kachel → um die linke obere Ecke drehen
    neu.x = o.x;
    neu.y = o.y;
  }
  // nicht über den Rand drehen: so weit wie nötig hineinschieben
  if (neu.ebene !== 'oben') {
    neu.x = r3(Math.max(0, Math.min(neu.x, karte.breite - neu.b)));
    neu.y = r3(Math.max(0, Math.min(neu.y, karte.hoehe - neu.h)));
  }
  if (!neu.drehung) delete neu.drehung;
  // Kegel-Lampe: Leuchtrichtung dreht mit
  if (o.typ === 'licht' && o.art === 'kegel') neu.richtung = ((o.richtung ?? 90) + 90) % 360;
  return neu;
}

/** Gewähltes um 90° drehen. @returns { ops, uebersprungen } (Marker, Ankünfte, Bereiche haben keine Drehung) */
export function dreheOps(karte, gewaehlte) {
  const ops = [];
  let uebersprungen = 0;
  for (const { s, k, wert } of gewaehlte) {
    if (s === 'objekte') ops.push({ s, k, neu: dreheObjekt(karte, wert) });
    else if (s === 'bauwerke') ops.push({ s, k, neu: { ...wert, drehung: wert.drehung ? 0 : 1 } });
    else uebersprungen++;
  }
  return { ops, uebersprungen };
}

/**
 * Gewähltes duplizieren (um +1/+1 versetzt, am Rand nach innen). Objekte, Bauwerke, Bereiche, Übergänge bekommen neue IDs,
 * Marker landen auf der nächsten freien Kachel daneben, Ankünfte bekommen einen neuen Namen.
 * @returns { ops, neueAuswahl, uebersprungen }
 */
export function dupliziereOps(karte, gewaehlte) {
  const ops = [];
  const neueAuswahl = [];
  let uebersprungen = 0;
  let id = karte.naechsteId;
  const belegt = new Set(karte.s('marker').keys());
  const namen = new Set(karte.s('ankuenfte').keys());
  const versatz = (x, b, max) => (x + 1 + b <= max ? 1 : x - 1 >= 0 ? -1 : 0);
  const freieKachel = (x, y) => {
    for (const [dx, dy] of [[1, 1], [1, 0], [0, 1], [-1, 0], [0, -1], [-1, -1], [1, -1], [-1, 1]]) {
      const schl = markerSchluessel(x + dx, y + dy);
      if (karte.imFeld(x + dx, y + dy) && !belegt.has(schl)) return [x + dx, y + dy];
    }
    return null;
  };
  for (const { s, k, wert } of gewaehlte) {
    if (s === 'marker') {
      const [x, y] = ausSchluessel(k);
      const ziel = freieKachel(x, y);
      if (!ziel) {
        uebersprungen++;
        continue;
      }
      const schl = markerSchluessel(...ziel);
      belegt.add(schl);
      ops.push({ s, k: schl, neu: kopie(wert) });
      neueAuswahl.push({ s, k: schl });
    } else if (s === 'ankuenfte') {
      let n = 2;
      while (namen.has(`${k}${n}`)) n++;
      const name = `${k}${n}`;
      namen.add(name);
      const ziel = freieKachel(wert.x, wert.y) ?? [wert.x, wert.y];
      ops.push({ s, k: name, neu: { x: ziel[0], y: ziel[1] } });
      neueAuswahl.push({ s, k: name });
    } else if (s === 'bauwerke') {
      const dx = versatz(wert.tx, 1, karte.breite);
      ops.push({ s, k: id, neu: { ...kopie(wert), tx: wert.tx + dx, ty: wert.ty + (dx ? 0 : versatz(wert.ty, 1, karte.hoehe)) } });
      neueAuswahl.push({ s, k: id++ });
    } else if (s === 'objekte' || s === 'tierBereiche' || s === 'raumFlaechen' || s === 'uebergaenge') {
      const b = wert.b ?? 1;
      const h = wert.h ?? 1;
      ops.push({ s, k: id, neu: { ...kopie(wert), x: r3(wert.x + versatz(wert.x, b, karte.breite)), y: r3(wert.y + versatz(wert.y, h, karte.hoehe)) } });
      neueAuswahl.push({ s, k: id++ });
    } else uebersprungen++;
  }
  return { ops, neueAuswahl, uebersprungen };
}

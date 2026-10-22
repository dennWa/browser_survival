import { rahmenVon, gesamtRahmen } from './anordnen.js';

/**
 * Touch-Bauen (Editor 2.0, Schritt 7.6) – reine Regeln, ohne DOM (UI: ui/touchBauen.js).
 *   touchArt          welches Verhalten ein Werkzeug am Finger hat:
 *                       'bestaetigen' (Platzieren/Einfügen: Geist unter dem Fadenkreuz → ✓ Setzen / ✕ Abbrechen),
 *                       'zeichnen' (Pinsel, Radierer, Gelände, Farbe, Bereiche, Wände, Maßband: Ziehen mit Fadenkreuz + Lupe),
 *                       'direkt' (Auswahl, Zone, Pipette …: wie Maus, Tippen = Klick), null (Hand: nur schwenken)
 *   fadenkreuz        Fadenkreuz-Punkt über dem Finger (der Finger verdeckt sonst, wo gebaut wird)
 *   istLangdruck      Langdruck = Kontextmenü (Finger bleibt ruhig liegen)
 *   lupenQuelle       Ausschnitt der Leinwand, den die Lupe vergrößert zeigt
 *   touchGriffe       große Griffe (verschieben ✥ / drehen ⟳ / skalieren ⤡) um die Auswahl, in Bildpunkten
 *   griffBei          Griff unter dem Finger
 *   skaliereObjekt    neue Grundfläche beim Ziehen am Skalier-Griff (linke obere Ecke bleibt)
 *   touchRaster       Einrast-Raster am Finger (Free-Modus ist mit dem Finger sonst zu zappelig)
 */
export const TOUCH = Object.freeze({
  versatz: 64, // px: Fadenkreuz so weit über dem Finger
  langdruck: 550, // ms
  wackeln: 10, // px: so weit darf der Finger zittern, ohne dass es ein Ziehen wird
  griffRadius: 22, // px: Griffe sind groß genug für Daumen (Trefferradius etwas größer)
  griffAbstand: 30, // px: Griffe sitzen so weit außerhalb der Auswahl
  lupe: Object.freeze({ groesse: 128, faktor: 2.5 }),
  feinRaster: 0.25, // Kacheln: Free-Modus am Finger
});

/** Verhalten eines Werkzeugs am Finger (siehe oben) */
export function touchArt(werkzeug, eintrag = null, { wand = false } = {}) {
  if (!werkzeug || werkzeug === 'hand') return null;
  if (werkzeug === 'einfuegen') return 'bestaetigen';
  if (werkzeug === 'platzieren') {
    if (!eintrag) return 'direkt';
    // Wand-Bauwerke werden am Stück gezogen (kern/wand.js) – das ist ein Strich, kein Einzelstück
    if (eintrag.art === 'bauwerk' && wand) return 'zeichnen';
    return ['objekt', 'bauwerk', 'marker', 'klang'].includes(eintrag.art) ? 'bestaetigen' : 'direkt';
  }
  if (['malen', 'radierer', 'terrain', 'farbe', 'bereich', 'messen', 'kiMarkieren'].includes(werkzeug)) return 'zeichnen';
  return 'direkt';
}

/** Fadenkreuz über dem Finger; am oberen Rand rutscht es unter den Finger (sonst wäre die oberste Reihe unerreichbar) */
export function fadenkreuz(px, py, { versatz = TOUCH.versatz, oben = 0 } = {}) {
  const y = py - versatz;
  return { px, py: y >= oben ? y : Math.min(py + versatz, Math.max(oben, py)) };
}

export function istLangdruck(dauerMs, wegPx, { langdruck = TOUCH.langdruck, wackeln = TOUCH.wackeln } = {}) {
  return dauerMs >= langdruck && wegPx < wackeln;
}

/** Quell-Rechteck (Bildpunkte, ohne Pixeldichte) für eine Lupe der Kantenlänge `groesse` mit Vergrößerung `faktor` */
export function lupenQuelle(px, py, { groesse = TOUCH.lupe.groesse, faktor = TOUCH.lupe.faktor } = {}) {
  const s = groesse / faktor;
  return { sx: px - s / 2, sy: py - s / 2, sw: s, sh: s };
}

/**
 * Griffe um die Auswahl. `rahmen` in Bildpunkten {x,y,b,h}. Verschieben ✥ unter der Mitte, Drehen ⟳ darüber,
 * Skalieren ⤡ an der Ecke rechts unten (nur bei genau einem Objekt mit Grundfläche).
 */
export function touchGriffe(rahmen, { drehen = true, skalieren = false, abstand = TOUCH.griffAbstand } = {}) {
  if (!rahmen) return [];
  const cx = rahmen.x + rahmen.b / 2;
  const griffe = [{ id: 'bewegen', symbol: '✥', x: cx, y: rahmen.y + rahmen.h + abstand }];
  if (drehen) griffe.push({ id: 'drehen', symbol: '⟳', x: cx, y: rahmen.y - abstand });
  if (skalieren) griffe.push({ id: 'skalieren', symbol: '⤡', x: rahmen.x + rahmen.b + abstand * 0.75, y: rahmen.y + rahmen.h + abstand * 0.75 });
  // Bei sehr kleiner Auswahl (stark herausgezoomt) dürfen sich Verschieben und Skalieren nicht überdecken
  const v = griffe[0];
  const s = griffe.find((g) => g.id === 'skalieren');
  if (s && Math.hypot(s.x - v.x, s.y - v.y) < TOUCH.griffRadius * 2.2) s.x = v.x + TOUCH.griffRadius * 2.2;
  return griffe;
}

/** Griff unter dem Punkt (nächster innerhalb des Radius) */
export function griffBei(griffe, px, py, radius = TOUCH.griffRadius + 6) {
  let best = null;
  let bestD = radius;
  for (const g of griffe) {
    const d = Math.hypot(g.x - px, g.y - py);
    if (d <= bestD) {
      best = g;
      bestD = d;
    }
  }
  return best;
}

/** Gemeinsamer Rahmen der gewählten Elemente (Kacheln) – null, wenn nichts einen Ort hat */
export function auswahlRahmen(gewaehlte) {
  const liste = gewaehlte.map((e) => ({ r: rahmenVon(e.s, e.k, e.wert) })).filter((e) => e.r);
  return liste.length ? gesamtRahmen(liste) : null;
}

/** Raster am Finger: Free-Modus 0,25, kleine Teile 0,5, sonst ganze Kacheln */
export function touchRaster(frei, b = 1, h = 1) {
  if (frei) return TOUCH.feinRaster;
  return b < 1 || h < 1 ? 0.5 : 1;
}

/**
 * Skalieren am Griff: dx/dy = Zug in Kacheln seit Beginn, `start` = Objekt beim Anfassen. Linke obere Ecke bleibt,
 * Breite/Höhe rasten auf `raster` ein, mindestens ein Raster groß; `max` begrenzt auf die Zone.
 */
export function skaliereObjekt(start, dx, dy, { raster = 1, max = null } = {}) {
  const runde = (v) => Math.round(v / raster) * raster;
  let b = Math.max(raster, runde(start.b + dx));
  let h = Math.max(raster, runde(start.h + dy));
  if (max) {
    b = Math.min(b, Math.max(raster, max.breite - start.x));
    h = Math.min(h, Math.max(raster, max.hoehe - start.y));
  }
  b = Math.round(b * 1000) / 1000;
  h = Math.round(h * 1000) / 1000;
  return b === start.b && h === start.h ? start : { ...start, b, h };
}

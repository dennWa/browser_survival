import { normalisiere, begrenze } from '../mathe.js';

/**
 * Gemeinsame Bewegungsphysik. WICHTIG: Server und Client nutzen exakt diese Funktionen –
 * der Server autoritativ, der Client zur Vorhersage (Client-Side Prediction).
 * Weicht hier etwas zwischen beiden Seiten ab, "ruckelt" der eigene Spieler.
 */

const EPSILON = 0.001;

/** Macht aus einer (evtl. manipulierten) Eingabe einen gültigen Richtungsvektor mit Länge ≤ 1. */
export function richtungAusEingabe(eingabe) {
  const x = Number.isFinite(eingabe.x) ? begrenze(eingabe.x, -1, 1) : 0;
  const y = Number.isFinite(eingabe.y) ? begrenze(eingabe.y, -1, 1) : 0;
  return normalisiere(x, y);
}

/**
 * Wendet eine Eingabe auf einen Körper an ({ x, y, blick, ausdauer?, erschoepft? }).
 * @param parameter { geschwindigkeit (px/s), radius (px), optional Sprint: sprintFaktor, ausdauerMax,
 *                    ausdauerVerbrauch (/s), ausdauerRegeneration (/s), sprintMinimum }
 * @param dt Zeitschritt in Sekunden (immer TICK_DAUER_S → deterministisch)
 * @returns true, wenn in diesem Schritt gesprintet wurde
 */
export function wendeEingabeAn(koerper, eingabe, welt, parameter, dt) {
  const richtung = richtungAusEingabe(eingabe);
  const willSprinten = eingabe.sprint === true && Math.hypot(richtung.x, richtung.y) > 0.1;
  const sprintet = aktualisiereAusdauer(koerper, willSprinten, parameter, dt);
  const weg = parameter.geschwindigkeit * (sprintet ? parameter.sprintFaktor : 1) * dt;
  bewegeKoerper(koerper, richtung.x * weg, richtung.y * weg, parameter.radius, welt);
  if (Number.isFinite(eingabe.blick)) koerper.blick = eingabe.blick;
  koerper.sprintet = sprintet;
  return sprintet;
}

/**
 * Ausdauer: Sprinten verbraucht sie, sonst lädt sie sich auf. Wer bei 0 ankommt, ist erschöpft und
 * kann erst ab sprintMinimum wieder sprinten (verhindert Stottern an der Grenze).
 * Ohne Sprint-Parameter (ausdauerMax fehlt) gibt es keinen Sprint.
 */
export function aktualisiereAusdauer(koerper, willSprinten, p, dt) {
  if (p.ausdauerMax === undefined) return false;
  if (!Number.isFinite(koerper.ausdauer)) {
    koerper.ausdauer = p.ausdauerMax;
    koerper.erschoepft = false;
  }
  const sprintet = willSprinten && !koerper.erschoepft && koerper.ausdauer > 0;
  if (sprintet) {
    koerper.ausdauer -= p.ausdauerVerbrauch * dt;
    if (koerper.ausdauer <= 0) {
      koerper.ausdauer = 0;
      koerper.erschoepft = true;
    }
  } else {
    koerper.ausdauer = Math.min(p.ausdauerMax, koerper.ausdauer + p.ausdauerRegeneration * dt);
    if (koerper.erschoepft && koerper.ausdauer >= p.sprintMinimum) koerper.erschoepft = false;
  }
  return sprintet;
}

/**
 * Bewegt einen Körper mit Kollision gegen blockierte Kacheln.
 * Achsen werden getrennt behandelt → an Wänden entlang "rutschen" funktioniert automatisch.
 * Kollisionsform: Quadrat mit halber Kantenlänge = radius (für Kacheln gut genug).
 */
export function bewegeKoerper(koerper, dx, dy, radius, welt) {
  if (dx !== 0) bewegeX(koerper, dx, radius, welt);
  if (dy !== 0) bewegeY(koerper, dy, radius, welt);
}

function bewegeX(k, dx, r, welt) {
  const g = welt.kachelGroesse;
  let neuX = k.x + dx;
  const ty0 = Math.floor((k.y - r) / g);
  const ty1 = Math.floor((k.y + r - EPSILON) / g);
  if (dx > 0) {
    const von = Math.floor((k.x + r) / g);
    const bis = Math.floor((neuX + r - EPSILON) / g);
    for (let tx = von; tx <= bis; tx++) {
      if (spalteBlockiert(welt, tx, ty0, ty1)) {
        neuX = Math.min(neuX, tx * g - r - EPSILON);
        break;
      }
    }
  } else {
    const von = Math.floor((k.x - r) / g);
    const bis = Math.floor((neuX - r) / g);
    for (let tx = von; tx >= bis; tx--) {
      if (spalteBlockiert(welt, tx, ty0, ty1)) {
        neuX = Math.max(neuX, (tx + 1) * g + r + EPSILON);
        break;
      }
    }
  }
  k.x = neuX;
}

function bewegeY(k, dy, r, welt) {
  const g = welt.kachelGroesse;
  let neuY = k.y + dy;
  const tx0 = Math.floor((k.x - r) / g);
  const tx1 = Math.floor((k.x + r - EPSILON) / g);
  if (dy > 0) {
    const von = Math.floor((k.y + r) / g);
    const bis = Math.floor((neuY + r - EPSILON) / g);
    for (let ty = von; ty <= bis; ty++) {
      if (zeileBlockiert(welt, ty, tx0, tx1)) {
        neuY = Math.min(neuY, ty * g - r - EPSILON);
        break;
      }
    }
  } else {
    const von = Math.floor((k.y - r) / g);
    const bis = Math.floor((neuY - r) / g);
    for (let ty = von; ty >= bis; ty--) {
      if (zeileBlockiert(welt, ty, tx0, tx1)) {
        neuY = Math.max(neuY, (ty + 1) * g + r + EPSILON);
        break;
      }
    }
  }
  k.y = neuY;
}

function spalteBlockiert(welt, tx, ty0, ty1) {
  for (let ty = ty0; ty <= ty1; ty++) if (welt.istBlockiert(tx, ty)) return true;
  return false;
}

function zeileBlockiert(welt, ty, tx0, tx1) {
  for (let tx = tx0; tx <= tx1; tx++) if (welt.istBlockiert(tx, ty)) return true;
  return false;
}

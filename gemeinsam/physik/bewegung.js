import { fahre } from './fahrzeug.js';
import { normalisiere, begrenze } from '../mathe.js';

/**
 * Gemeinsame Bewegungsphysik. WICHTIG: Server und Client nutzen exakt diese Funktionen –
 * der Server autoritativ, der Client zur Vorhersage (Client-Side Prediction).
 * Weicht hier etwas zwischen beiden Seiten ab, "ruckelt" der eigene Spieler.
 */

const EPSILON = 0.001;
export const FLUG_TEMPO = 480; // px/s im Admin-Flugmodus (Laufen: 150)
const FLUG_SPRINT = 3;

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
  // Im Auto: Eingabe steuert das Fahrzeug, der Körper sitzt in dessen Mitte
  if (koerper.fahrzeug) {
    fahre(koerper.fahrzeug, eingabe, welt, dt);
    koerper.x = koerper.fahrzeug.x;
    koerper.y = koerper.fahrzeug.y;
    if (Number.isFinite(eingabe.blick)) koerper.blick = eingabe.blick;
    koerper.sprintet = false;
    aktualisiereAusdauer(koerper, false, parameter, dt);
    return false;
  }
  const richtung = richtungAusEingabe(eingabe);
  if (koerper.fliegen) {
    // Admin-Flugmodus: kein Hindernis, kein Ausdauerverbrauch – nur der Kartenrand hält einen auf
    const weg = FLUG_TEMPO * (eingabe.sprint === true ? FLUG_SPRINT : 1) * dt;
    koerper.x = begrenze(koerper.x + richtung.x * weg, parameter.radius, welt.breite * welt.kachelGroesse - parameter.radius);
    koerper.y = begrenze(koerper.y + richtung.y * weg, parameter.radius, welt.hoehe * welt.kachelGroesse - parameter.radius);
    if (Number.isFinite(eingabe.blick)) koerper.blick = eingabe.blick;
    koerper.sprintet = false;
    return false;
  }
  const willSprinten = eingabe.sprint === true && Math.hypot(richtung.x, richtung.y) > 0.1;
  const sprintet = aktualisiereAusdauer(koerper, willSprinten, parameter, dt);
  // tempoFaktor: Skill "Schnelligkeit" (Server setzt ihn am Spieler, der Client übernimmt ihn für die Vorhersage)
  const weg = parameter.geschwindigkeit * (koerper.tempoFaktor ?? 1) * (sprintet ? parameter.sprintFaktor : 1) * dt;
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
  // Boost (Energydrink): läuft in Echtzeit ab, Sprinten kostet währenddessen keine Ausdauer
  const boost = koerper.boostRest > 0;
  if (boost) koerper.boostRest = Math.max(0, koerper.boostRest - dt);
  const sprintet = willSprinten && (boost || (!koerper.erschoepft && koerper.ausdauer > 0));
  if (sprintet && boost) {
    // kostenlos
  } else if (sprintet) {
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
  if (dx !== 0) {
    const vorher = koerper.x;
    bewegeX(koerper, dx, radius, welt);
    // Blockiert, aber nicht seitlich unterwegs → in eine nahe Öffnung (Tür) gleiten
    if (dy === 0 && Math.abs(koerper.x - vorher) < Math.abs(dx) * 0.5) gleiteInOeffnung(koerper, Math.sign(dx), 0, Math.abs(dx), radius, welt);
  }
  if (dy !== 0) {
    const vorher = koerper.y;
    bewegeY(koerper, dy, radius, welt);
    if (dx === 0 && Math.abs(koerper.y - vorher) < Math.abs(dy) * 0.5) gleiteInOeffnung(koerper, 0, Math.sign(dy), Math.abs(dy), radius, welt);
  }
}

/**
 * Ecken-Gleiten: Läuft man knapp neben einer Öffnung (z. B. Tür) gegen die Kante, schiebt es einen quer zur
 * Laufrichtung in die Öffnung – man muss also nicht pixelgenau zielen. Gilt für Spieler und Zombies.
 * Sucht in der Kachelspalte/-zeile direkt voraus eine freie Kachel, deren Mitte höchstens GLEIT_WEITE entfernt ist.
 */
function gleiteInOeffnung(k, richtungX, richtungY, tempo, r, welt) {
  const g = welt.kachelGroesse;
  const weite = g * GLEIT_ANTEIL;
  if (richtungX !== 0) {
    const tx = Math.floor((k.x + richtungX * (r + 1)) / g); // Spalte direkt voraus
    const mitte = suchePassendeMitte(k.y, weite, g, (ty) => !welt.istBlockiert(tx, ty) && !welt.istBlockiert(Math.floor(k.x / g), ty));
    if (mitte !== null) bewegeY(k, Math.sign(mitte - k.y) * Math.min(Math.abs(mitte - k.y), tempo), r, welt);
  } else {
    const ty = Math.floor((k.y + richtungY * (r + 1)) / g);
    const mitte = suchePassendeMitte(k.x, weite, g, (tx) => !welt.istBlockiert(tx, ty) && !welt.istBlockiert(tx, Math.floor(k.y / g)));
    if (mitte !== null) bewegeX(k, Math.sign(mitte - k.x) * Math.min(Math.abs(mitte - k.x), tempo), r, welt);
  }
}

/** Nächste Kachelmitte (quer zur Laufrichtung) innerhalb `weite`, deren Kachel frei ist – oder null. */
function suchePassendeMitte(position, weite, g, frei) {
  const kachel = Math.floor(position / g);
  let beste = null;
  for (const t of [kachel, kachel - 1, kachel + 1]) {
    const mitte = t * g + g / 2;
    const abstand = Math.abs(mitte - position);
    if (abstand > weite || abstand < 0.01 || !frei(t)) continue;
    if (beste === null || abstand < Math.abs(beste - position)) beste = mitte;
  }
  return beste;
}

/** Wie weit (Anteil einer Kachel) man beim Ecken-Gleiten seitlich in eine Öffnung geschoben wird. */
const GLEIT_ANTEIL = 0.6;

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

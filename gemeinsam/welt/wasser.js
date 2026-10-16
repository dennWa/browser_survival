import { KACHELN } from './kacheln.js';

/**
 * Wasser & Angeln – Regeln, die Server (Auswerfen) UND Client (Hinweis "Linksklick: auswerfen") brauchen.
 * Wasserkacheln: gemeinsam/welt/kacheln.js (wasser: true) – nicht begehbar, aber Sicht & Schüsse gehen drüber.
 */
const MIN_WURF = 36; // px: mindestens so weit weg muss das Wasser sein

export const istWasserKachel = (welt, tx, ty) => KACHELN[welt.kachelAn(tx, ty)]?.wasser === true;

/** Wo würde die Pose landen, wenn man von (x, y) in Richtung `blick` auswirft? { x, y } oder null (kein Wasser in Reichweite). */
export function wurfZiel(welt, x, y, blick, reichweite) {
  const g = welt.kachelGroesse;
  const dx = Math.cos(blick);
  const dy = Math.sin(blick);
  for (let d = MIN_WURF; d <= reichweite; d += 6) {
    const px = x + dx * d;
    const py = y + dy * d;
    const tx = Math.floor(px / g);
    const ty = Math.floor(py / g);
    if (istWasserKachel(welt, tx, ty)) {
      // ein Stück weiter ins Wasser, solange es Wasser bleibt
      let weit = d;
      while (weit + 10 <= reichweite && istWasserKachel(welt, Math.floor((x + dx * (weit + 10)) / g), Math.floor((y + dy * (weit + 10)) / g))) weit += 10;
      return { x: x + dx * Math.min(weit, d + 40), y: y + dy * Math.min(weit, d + 40) };
    }
    if (welt.istSichtBlockiert(tx, ty)) return null; // Wand davor
  }
  return null;
}

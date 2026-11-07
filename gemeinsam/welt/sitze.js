/**
 * Runde 42: Sitzplätze auf Karten-Möbeln (Stühle, Bänke, Sofas, Sessel, Baumstämme) – Regeln für Server UND Client (umgebungsfrei).
 *   Ein Karten-Objekt ist ein Sitz, wenn sein Typ eingebaut ist (SITZ_TYPEN) oder sein eigenes Modell (Karten-`typen`,
 *   glbDatei) nach Stuhl/Bank/Sofa/Stamm klingt – oder der Typ ausdrücklich `sitz` (Sitzhöhe in m) trägt.
 *   Lange Sitze (Bank, Sofa) haben mehrere Plätze nebeneinander (je ~0,65 m).
 *   Blickrichtung aus `drehung` (0 = Front Süd, 90 West, 180 Nord, 270 Ost – wie die Karten-Generatoren).
 * Der Server setzt beim Hinsetzen `spieler.arbeit.ort = { x, y, blick, hoehe }` (px); der Renderer zeichnet die Figur dort
 * (die Spielerposition selbst bleibt neben dem Möbel → keine Kollisions-/Vorhersage-Probleme).
 */

/** So weit (Kacheln) darf ein Sitzplatz vom Spieler weg sein. */
export const SITZ_REICHWEITE = 1.7;

/** Eingebaute Möbel-Typen → Sitzhöhe (m). */
export const SITZ_TYPEN = Object.freeze({ stuhl: 0.46, sessel: 0.42, sessel_blau: 0.42, sofa: 0.42, sofa_dunkel: 0.42, bank: 0.42 });

/** Eigene Modelle (Dateiname) → Sitzhöhe (m); Reihenfolge zählt (erste passende Regel). */
const MODELL_REGELN = [
  [/log-stack|log_stack|table|tisch|workbench|werkbank/i, 0], // Holzstapel, Tische, Werkbänke: kein Sitz
  [/stool|hocker/i, 0.62],
  [/wood-log|wood_log|baumstamm/i, 0.4],
  [/bench|bank/i, 0.42],
  [/couch|sofa/i, 0.42],
  [/arm-chair|armchair|sessel/i, 0.42],
  [/chair|stuhl/i, 0.46],
];

/** Sitzhöhe (m) eines Karten-Objekttyps oder 0 (kein Sitz). @param typDef Eintrag aus welt.typen (optional) */
export function sitzHoeheFuer(typ, typDef) {
  if (typDef && Number.isFinite(typDef.sitz)) return typDef.sitz > 0 ? typDef.sitz : 0;
  if (SITZ_TYPEN[typ]) return SITZ_TYPEN[typ];
  const name = typDef?.glbDatei ?? (typ?.startsWith('sf_') ? typ : '');
  if (!name) return 0;
  for (const [muster, hoehe] of MODELL_REGELN) if (muster.test(name)) return hoehe;
  return 0;
}

/** Blickrichtung (Radiant, atan2 in Welt-px) beim Sitzen auf einem Objekt mit dieser Drehung (Grad). */
export function sitzBlick(drehung = 0) {
  return Math.PI / 2 + ((drehung ?? 0) * Math.PI) / 180;
}

/**
 * Alle Sitzplätze eines Objekts in px. Ein Platz liegt in der Sitzfläche, leicht nach hinten versetzt (Lehne).
 * @returns {{ x, y, blick, hoehe }[]}  hoehe in px
 */
export function sitzPlaetze(o, typDef, g) {
  const hoeheM = sitzHoeheFuer(o.typ, typDef);
  if (!hoeheM) return [];
  const blick = sitzBlick(o.drehung);
  const mx = (o.x + o.b / 2) * g;
  const my = (o.y + o.h / 2) * g;
  // lange Achse quer zur Blickrichtung → Plätze nebeneinander
  const quer = Math.abs(Math.cos(blick)) > 0.5 ? o.h : o.b;
  const anzahl = Math.max(1, Math.min(4, Math.floor(quer / 0.65)));
  const qx = -Math.sin(blick);
  const qy = Math.cos(blick);
  const plaetze = [];
  for (let i = 0; i < anzahl; i++) {
    const versatz = (i - (anzahl - 1) / 2) * (quer / anzahl) * g;
    plaetze.push({ x: mx + qx * versatz, y: my + qy * versatz, blick, hoehe: hoeheM * g });
  }
  return plaetze;
}

/**
 * Nächster freier Sitzplatz um (x, y) px. `belegt(platz)` → true, wenn dort schon jemand sitzt.
 * @returns {{ x, y, blick, hoehe } | null}
 */
export function findeSitz(welt, x, y, belegt = () => false) {
  const g = welt.kachelGroesse;
  const reichweite = SITZ_REICHWEITE * g;
  let bester = null;
  let bestAbstand = reichweite;
  for (const o of welt.objekte) {
    if (o.ebene === 'oben' || o.ebene === 'boden' || o.ebene === 'unsichtbar' || o.ebene === 'licht') continue;
    // grob vorfiltern (Objekt-Rechteck + Reichweite)
    if (x < o.x * g - reichweite || x > (o.x + o.b) * g + reichweite || y < o.y * g - reichweite || y > (o.y + o.h) * g + reichweite) continue;
    for (const p of sitzPlaetze(o, welt.typen?.[o.typ], g)) {
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bestAbstand && !belegt(p)) {
        bester = p;
        bestAbstand = d;
      }
    }
  }
  return bester;
}

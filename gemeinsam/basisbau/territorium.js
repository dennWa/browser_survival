import { KACHELN } from '../welt/kacheln.js';
import { BAUBARER_UNTERGRUND } from '../welt/bauwerke.js';

/**
 * Territorium = die Baugebiete einer Zone. Jede Basis-Flagge spannt einen Kreis (Radius in Kacheln) um ihre Kachel.
 * Die Flagge selbst hat kein Modell mehr – nur noch dieser Kreis (Client zeigt ihn nur dem Besitzer, rot).
 *
 * Flagge: { besitzer, tx, ty, radius, mitglieder? }   (radius in Kacheln; mitglieder siehe rechte.js)
 *
 * Server: hält ein Territorium pro Zone (spielWelt.territorium, gespeichert im Weltzustand).
 * Client: baut sich ein Territorium nur mit der EIGENEN Flagge (aus den Spielerdaten) – damit läuft dieselbe
 * Prüfung (platzierung.js) für die grün/rote Vorschau.
 */
export class Territorium {
  constructor() {
    /** besitzer → Flagge */
    this.flaggen = new Map();
    this.version = 0;
  }

  setze(flagge) {
    this.flaggen.set(flagge.besitzer, flagge);
    this.version++;
  }

  entferne(besitzer) {
    if (this.flaggen.delete(besitzer)) this.version++;
  }

  von(besitzer) {
    return this.flaggen.get(besitzer) ?? null;
  }

  /** Liegt die Kachel im Kreis dieser Flagge? (Abstand der Kachelmitten) */
  enthaelt(flagge, tx, ty) {
    return Math.hypot(tx - flagge.tx, ty - flagge.ty) <= flagge.radius;
  }

  /** Flagge, zu deren Gebiet die Kachel gehört – bei Überlappung die mit dem nächsten Mittelpunkt. */
  gebietBei(tx, ty) {
    let beste = null;
    let bestAbstand = Infinity;
    for (const f of this.flaggen.values()) {
      const abstand = Math.hypot(tx - f.tx, ty - f.ty);
      if (abstand <= f.radius && abstand < bestAbstand) {
        beste = f;
        bestAbstand = abstand;
      }
    }
    return beste;
  }

  /** Irgendeine Flagge (außer der von `ausser`) näher als `abstand` Kacheln? */
  flaggeNahe(tx, ty, abstand, ausser = null) {
    for (const f of this.flaggen.values()) {
      if (f.besitzer !== ausser && Math.hypot(tx - f.tx, ty - f.ty) < abstand) return f;
    }
    return null;
  }

  /** Client: alles ersetzen durch genau diese Flagge (oder keine). */
  setzeNurEigene(flagge) {
    this.flaggen.clear();
    if (flagge) this.flaggen.set(flagge.besitzer, flagge);
    this.version++;
  }
}

/** Standardwerte für die Flaggen-Prüfung (Server überschreibt sie aus konfiguration.basisbau). */
export const FLAGGEN_STANDARD = Object.freeze({ freiraum: 2, mindestAbstand: 15 });

/**
 * Darf `besitzer` seine Basis-Flagge auf Kachel (tx, ty) setzen?
 *  - nur eine Flagge pro Spieler,
 *  - Kachel selbst: bebaubarer Untergrund (Rasen) – kein Wasser, nichts Blockierendes,
 *  - im `freiraum` (Kacheln) rundherum: keine Weltobjekte (Wände, Möbel, Bäume, Steine, Türen), kein Innenraum, kein Wasser
 *    ("flach & frei" – so kollidiert das Gebiet nicht mit Karten-Gebäuden),
 *  - Mindestabstand zu fremden Flaggen (damit sich Gebiete höchstens am Rand überlappen).
 * @returns {{ ok: boolean, grund?: string }}
 */
export function pruefeFlaggenPlatz(welt, territorium, tx, ty, besitzer, optionen = FLAGGEN_STANDARD) {
  const { freiraum, mindestAbstand } = { ...FLAGGEN_STANDARD, ...optionen };
  if (territorium.von(besitzer)) return { ok: false, grund: 'Du hast schon eine Basis-Flagge' };
  const mitte = welt.kachelAn(tx, ty);
  if (mitte === null) return { ok: false, grund: 'Hier nicht' };
  if (KACHELN[mitte]?.wasser) return { ok: false, grund: 'Nicht auf Wasser' };
  if (!BAUBARER_UNTERGRUND.includes(KACHELN[mitte]?.name)) return { ok: false, grund: 'Nur auf flachem Rasen' };
  for (let y = ty - freiraum; y <= ty + freiraum; y++) {
    for (let x = tx - freiraum; x <= tx + freiraum; x++) {
      const zeichen = welt.kachelAn(x, y);
      if (zeichen === null) return { ok: false, grund: 'Zu nah am Kartenrand' };
      const kachel = KACHELN[zeichen];
      if (kachel?.wasser) return { ok: false, grund: 'Zu nah am Wasser' };
      if (kachel?.innen || welt.tuerBei(x, y) >= 0 || welt.istKartenBlockiert(x, y)) return { ok: false, grund: 'Zu nah an Gebäuden oder Hindernissen' };
    }
  }
  const nahe = territorium.flaggeNahe(tx, ty, mindestAbstand, besitzer);
  if (nahe) return { ok: false, grund: 'Zu nah an einer fremden Basis' };
  return { ok: true };
}

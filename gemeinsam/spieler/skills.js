/**
 * Skills (Fähigkeiten): Pro Level-Aufstieg gibt es Skillpunkte (konfiguration.level.punkteProLevel), die man
 * im Fähigkeiten-Fenster (Taste U / ⭐) verteilt. Tod = alles weg (wie Level & XP).
 *
 *   proPunkt → Wirkung je Punkt (siehe Funktionen unten), max → höchste Stufe
 *
 * Neue Fähigkeit? Hier eintragen + Wirkung an der passenden Stelle einbauen (z. B. kampfSystem für Schaden).
 * Server UND Client nutzen diese Datei (Tempo wirkt in der gemeinsamen Bewegungsphysik → Vorhersage passt).
 */
export const SKILLS = Object.freeze({
  tempo: { name: 'Schnelligkeit', symbol: '👟', proPunkt: 0.03, max: 10, beschreibung: '+3 % Lauftempo pro Punkt' },
  staerke: { name: 'Stärke', symbol: '💪', proPunkt: 0.08, max: 10, beschreibung: '+8 % Nahkampfschaden pro Punkt' },
  leben: { name: 'Zähigkeit', symbol: '❤', proPunkt: 10, max: 10, beschreibung: '+10 maximale Lebenspunkte pro Punkt' },
  sammeln: { name: 'Sammeln', symbol: '⛏', proPunkt: 0.06, max: 10, beschreibung: '6 % schneller Holz, Stein & Erz abbauen pro Punkt' },
});

export function leereSkills() {
  return Object.fromEntries(Object.keys(SKILLS).map((k) => [k, 0]));
}

/** Faktor fürs Lauftempo (1 = normal). */
export function tempoFaktor(skills) {
  return 1 + (skills?.tempo ?? 0) * SKILLS.tempo.proPunkt;
}

/** Faktor für Nahkampfschaden. */
export function staerkeFaktor(skills) {
  return 1 + (skills?.staerke ?? 0) * SKILLS.staerke.proPunkt;
}

/** Zusätzliche maximale Lebenspunkte. */
export function zusatzLeben(skills) {
  return (skills?.leben ?? 0) * SKILLS.leben.proPunkt;
}

/** Faktor für die Abbau-Dauer (kleiner = schneller), mindestens 40 % der normalen Zeit. */
export function sammelFaktor(skills) {
  return Math.max(0.4, 1 - (skills?.sammeln ?? 0) * SKILLS.sammeln.proPunkt);
}

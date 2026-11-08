/**
 * Abbaubare Kartenobjekte (Ressourcen-Knoten). Welche Objekttypen was liefern und welches Werkzeug
 * man dafür braucht. Menge, Dauer und Nachwachszeit stehen in der Server-Konfiguration (ressourcen).
 *
 *   art        → Item-ID, die man bekommt (siehe server/spiel/konfiguration/gegenstaende.js)
 *   werkzeug   → Item-ID, die man im Inventar haben muss
 *   radius     → Größe in Weltpixeln (Reichweite fürs Abbauen)
 *   blockiert  → steht im Weg, solange er nicht abgebaut ist
 *   nachMass   → Runde 38: Radius und Größe (klein/groß) kommen aus der Grundfläche b × h des Objekts (Fels-Modelle r32_fels_*)
 *   randBlock  → Runde 38: blockiert alle Kacheln, die die Grundfläche spürbar berühren (nicht nur die mit dem Mittelpunkt darin)
 */
/** Runde 38: die Low-Poly-Felsen der Karten (Editor-Deko r32_fels_0 … 7) sind jetzt echte Steinvorkommen: abbaubar, Kollision über die ganze Grundfläche */
const FELSEN = Object.fromEntries(
  Array.from({ length: 8 }, (_, i) => [`r32_fels_${i}`, { art: 'stein', werkzeug: 'spitzhacke', radius: 22, blockiert: true, aktion: 'Fels abbauen', nachMass: true, randBlock: true }]),
);
/** Felsen ab dieser Grundfläche (Kacheln²) gelten als „groß“ (mengeGross wie bei großen Steinen) */
export const FELS_GROSS_AB = 1.9;
/** Anteil einer Kachel (0..1) in beiden Richtungen, ab dem ein Fels sie blockiert (randBlock) */
export const RAND_BLOCK_ANTEIL = 0.3;

export const RESSOURCEN_OBJEKTE = Object.freeze({
  ...FELSEN,
  baum: { art: 'holz', werkzeug: 'axt', radius: 18, blockiert: false, aktion: 'Baum fällen' },
  baum_herbst: { art: 'holz', werkzeug: 'axt', radius: 18, blockiert: false, aktion: 'Baum fällen' },
  tanne: { art: 'holz', werkzeug: 'axt', radius: 17, blockiert: false, aktion: 'Baum fällen' },
  // Runde 31: Büsche geben Äste. Runde 44: „Zweig sammeln“ mit bloßen Händen (ohneWerkzeug – vorher „Ast abschneiden“ mit Machete/Messer)
  busch: { art: 'ast', werkzeug: null, werkzeuge: [], ohneWerkzeug: true, radius: 16, blockiert: false, aktion: 'Zweig sammeln' },
  stein: { art: 'stein', werkzeug: 'spitzhacke', radius: 16, blockiert: true, aktion: 'Stein abbauen' },
  eisenerz: { art: 'eisenerz', werkzeug: 'spitzhacke', radius: 16, blockiert: true, aktion: 'Eisenerz abbauen' },
});

/** So nah (px, zum Rand des Knotens) muss man stehen, um abzubauen. */
export const ABBAU_REICHWEITE = 34;

/** Runde 31: Messer/Machete in der Hand schneiden Rinde vom Baum (statt zu fällen): `RINDE_MAX` Mal je Baum (Server-Konfiguration ressourcen.rindeMax), Dauer = Holzfällen */
export const RINDE_WERKZEUGE = Object.freeze(['machete', 'kuechenmesser', 'kampfmesser']);
export const RINDE_MAX = 3;

/**
 * Welche Arbeit würde ein Knoten jetzt auslösen? Server (starteAbbau) und Client (Hinweistext E) fragen dasselbe.
 *   handId    Item-ID in der Hand (oder null) · hat(id) → hat der Spieler das Item im Inventar? · rindeAb = schon so oft geschnitten
 * @returns { art: 'rinde' | 'ast' | 'holz' | 'stein' | 'eisenerz', werkzeug: Item-ID für die Abnutzung } | null (ohne passendes Werkzeug)
 */
export function abbauArtFuer(r, handId, hat, rindeAb = 0) {
  if (r.art === 'holz' && RINDE_WERKZEUGE.includes(handId) && rindeAb < RINDE_MAX) return { art: 'rinde', werkzeug: handId };
  if (r.ohneWerkzeug) return { art: r.art, werkzeug: null }; // Runde 44: Zweige sammelt man mit der Hand
  const werkzeug = (r.werkzeuge ?? [r.werkzeug]).find((id) => id === handId && hat(id)) ?? (r.werkzeuge ?? [r.werkzeug]).find(hat);
  return werkzeug ? { art: r.art, werkzeug } : null;
}

/** Hinweistext/Symbol für E in der Welt (rindeAb = Rinde-Schnitte an diesem Baum) */
export function abbauText(r, art) {
  if (art === 'rinde') return { text: 'Rinde abschneiden', symbol: '🪵' };
  return { text: RESSOURCEN_OBJEKTE[r.typ].aktion, symbol: r.art === 'holz' ? '🪓' : r.art === 'ast' ? '🌿' : '⛏' };
}

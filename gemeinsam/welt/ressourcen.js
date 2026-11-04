/**
 * Abbaubare Kartenobjekte (Ressourcen-Knoten). Welche Objekttypen was liefern und welches Werkzeug
 * man dafür braucht. Menge, Dauer und Nachwachszeit stehen in der Server-Konfiguration (ressourcen).
 *
 *   art        → Item-ID, die man bekommt (siehe server/spiel/konfiguration/gegenstaende.js)
 *   werkzeug   → Item-ID, die man im Inventar haben muss
 *   radius     → Größe in Weltpixeln (Reichweite fürs Abbauen)
 *   blockiert  → steht im Weg, solange er nicht abgebaut ist
 */
export const RESSOURCEN_OBJEKTE = Object.freeze({
  baum: { art: 'holz', werkzeug: 'axt', radius: 18, blockiert: false, aktion: 'Baum fällen' },
  baum_herbst: { art: 'holz', werkzeug: 'axt', radius: 18, blockiert: false, aktion: 'Baum fällen' },
  tanne: { art: 'holz', werkzeug: 'axt', radius: 17, blockiert: false, aktion: 'Baum fällen' },
  // Runde 31: Büsche geben Äste – `werkzeuge` = alle passenden Items (sonst gilt `werkzeug`)
  busch: { art: 'ast', werkzeug: 'machete', werkzeuge: ['machete', 'axt', 'feuerwehrbeil', 'kuechenmesser', 'kampfmesser'], radius: 16, blockiert: false, aktion: 'Ast abschneiden' },
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
  const werkzeug = (r.werkzeuge ?? [r.werkzeug]).find((id) => id === handId && hat(id)) ?? (r.werkzeuge ?? [r.werkzeug]).find(hat);
  return werkzeug ? { art: r.art, werkzeug } : null;
}

/** Hinweistext/Symbol für E in der Welt (rindeAb = Rinde-Schnitte an diesem Baum) */
export function abbauText(r, art) {
  if (art === 'rinde') return { text: 'Rinde abschneiden', symbol: '🪵' };
  return { text: RESSOURCEN_OBJEKTE[r.typ].aktion, symbol: r.art === 'holz' ? '🪓' : r.art === 'ast' ? '🌿' : '⛏' };
}

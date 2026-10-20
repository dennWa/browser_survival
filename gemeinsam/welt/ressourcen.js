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
  stein: { art: 'stein', werkzeug: 'spitzhacke', radius: 16, blockiert: true, aktion: 'Stein abbauen' },
  eisenerz: { art: 'eisenerz', werkzeug: 'spitzhacke', radius: 16, blockiert: true, aktion: 'Eisenerz abbauen' },
});

/** So nah (px, zum Rand des Knotens) muss man stehen, um abzubauen. */
export const ABBAU_REICHWEITE = 34;

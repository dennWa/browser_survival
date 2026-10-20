/**
 * Messen & Ausrichten (Editor 2.0, Schritt 7.3) – umgebungsfrei, getestet in tests/messen.test.js.
 *   streckenInfo(punkte)  Maßband: Länge je Abschnitt (Kacheln = Meter), Gesamtlänge, Winkel (0° = Osten, 90° = Süden)
 *   fangKandidaten(karte) Linien zum Einrasten: Objektkanten/-mitten (x/y) + Hilfslinien
 *   fange(o, kandidaten, toleranz) Rechteck an die nächste Linie ziehen (links/Mitte/rechts bzw. oben/Mitte/unten)
 *   hilfslinieOps(karte, achse, alt, neu) Hilfslinien liegen in `karte.werte.hilfslinien = { x: [...], y: [...] }`
 *     (nur Editor/Entwurf, nicht im Spiel) → Änderung = 'wert'-Op → rückgängig machbar.
 */
const r2 = (v) => Math.round(v * 100) / 100;

export function streckenInfo(punkte) {
  const segmente = [];
  for (let i = 1; i < punkte.length; i++) {
    const [a, b] = [punkte[i - 1], punkte[i]];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    segmente.push({ laenge: r2(Math.hypot(dx, dy)), winkel: Math.round(((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360) });
  }
  return { segmente, gesamt: r2(segmente.reduce((s, x) => s + x.laenge, 0)) };
}

/** Kandidaten-Linien: { x: [werte], y: [werte] } (ohne die Objekte in `ohne`) */
export function fangKandidaten(karte, ohne = new Set()) {
  const x = new Set();
  const y = new Set();
  for (const [id, o] of karte.s('objekte')) {
    if (ohne.has(id) || o.ebene === 'oben') continue;
    for (const v of [o.x, o.x + o.b / 2, o.x + o.b]) x.add(r2(v));
    for (const v of [o.y, o.y + o.h / 2, o.y + o.h]) y.add(r2(v));
  }
  const h = karte.werte.hilfslinien ?? {};
  for (const v of h.x ?? []) x.add(v);
  for (const v of h.y ?? []) y.add(v);
  return { x: [...x], y: [...y] };
}

/**
 * Rechteck { x, y, b, h } an Kandidaten einrasten (je Achse die kleinste Abweichung von Kante/Mitte, wenn ≤ toleranz).
 * @returns { x, y, linien: [{ achse, wert }] } – linien zum Anzeigen
 */
export function fange(o, kandidaten, toleranz = 0.25) {
  const aus = { x: o.x, y: o.y, linien: [] };
  for (const [achse, pos, groesse] of [['x', o.x, o.b], ['y', o.y, o.h]]) {
    let best = null;
    for (const anteil of [0, 0.5, 1])
      for (const k of kandidaten[achse]) {
        const d = k - (pos + groesse * anteil);
        if (Math.abs(d) <= toleranz && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, wert: k };
      }
    if (best) {
      aus[achse] = r2(pos + best.d);
      aus.linien.push({ achse, wert: best.wert });
    }
  }
  return aus;
}

/** Hilfslinie setzen/verschieben/löschen: alt = vorhandener Wert (oder null), neu = Wert (oder null = löschen) */
export function hilfslinieOps(karte, achse, alt, neu) {
  const liste = [...(karte.werte.hilfslinien?.[achse] ?? [])];
  const i = alt === null ? -1 : liste.indexOf(alt);
  if (i >= 0) liste.splice(i, 1);
  if (neu !== null && !liste.includes(r2(neu))) liste.push(r2(neu));
  liste.sort((a, b) => a - b);
  return [{ s: 'wert', pfad: `hilfslinien.${achse}`, neu: liste.length ? liste : undefined }];
}

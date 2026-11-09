/**
 * Runde 47: Kartenmarker. Große Karte (M) → Rechtsklick (Handy: lange drücken) → Text + Sichtbarkeit.
 * spieler.marker = [{ id, karte, x, y, text, sicht }] (Weltpixel der Zone `karte`, im Spielstand, höchstens MARKER_MAX).
 * sicht: 'ich' (nur selbst) | 'gruppe' (eigene Gruppe = Flaggen-Besitzer + Mitglieder, egal in welcher Zone die Flagge steht) | 'alle'.
 * AKTION `marker` { was: setzen{x, y, text, sicht, id?} | entfernen{id} } – setzen mit vorhandener id ändert den Marker.
 * SpielServer.#sendeMarker verteilt die sichtbaren Marker aller Spieler (NACHRICHT.MARKER, nur bei Änderung).
 */
export const MARKER_MAX = 20;
export const MARKER_TEXT_MAX = 40;
export const MARKER_SICHTEN = Object.freeze(['ich', 'gruppe', 'alle']);

/** Text säubern: Steuerzeichen raus, Leerraum zusammenziehen, kürzen. Leer → '📍'. */
export function markerText(roh) {
  const text = String(roh ?? '')
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return [...text].slice(0, MARKER_TEXT_MAX).join('') || '📍';
}

export function markerAktion(spielWelt, spieler, aktion) {
  spieler.marker ??= [];
  if (aktion.was === 'entfernen') {
    spieler.marker = spieler.marker.filter((m) => m.id !== aktion.id);
    return;
  }
  const karte = spielWelt.karte.daten.id;
  const g = spielWelt.welt.kachelGroesse;
  const x = Math.round(aktion.x);
  const y = Math.round(aktion.y);
  if (!(x >= 0 && y >= 0 && x < spielWelt.welt.breite * g && y < spielWelt.welt.hoehe * g)) return;
  const sicht = MARKER_SICHTEN.includes(aktion.sicht) ? aktion.sicht : 'ich';
  const vorhanden = Number.isInteger(aktion.id) ? spieler.marker.find((m) => m.id === aktion.id) : null;
  if (vorhanden) {
    Object.assign(vorhanden, { text: markerText(aktion.text), sicht });
    return;
  }
  if (spieler.marker.length >= MARKER_MAX) return spielWelt.melde(spieler.id, `Höchstens ${MARKER_MAX} Marker – lösch erst einen alten (Rechtsklick auf den Marker)`);
  const id = spieler.marker.reduce((max, m) => Math.max(max, m.id), 0) + 1;
  spieler.marker.push({ id, karte, x, y, text: markerText(aktion.text), sicht });
}

/** Marker aus dem Spielstand (alles geprüft). */
export function pruefeMarker(roh) {
  if (!Array.isArray(roh)) return [];
  const liste = [];
  const ids = new Set();
  for (const m of roh.slice(0, MARKER_MAX)) {
    if (!m || !Number.isInteger(m.id) || m.id < 1 || ids.has(m.id)) continue;
    if (typeof m.karte !== 'string' || !/^[a-z0-9_-]{1,40}$/.test(m.karte)) continue;
    if (!Number.isFinite(m.x) || !Number.isFinite(m.y) || m.x < 0 || m.y < 0 || m.x > 1e6 || m.y > 1e6) continue;
    ids.add(m.id);
    liste.push({ id: m.id, karte: m.karte, x: Math.round(m.x), y: Math.round(m.y), text: markerText(m.text), sicht: MARKER_SICHTEN.includes(m.sicht) ? m.sicht : 'ich' });
  }
  return liste;
}

/**
 * Sichtbare Marker je Spieler: Map spieler → [{ id, karte, x, y, text, sicht, von, eigen }].
 * @param spielerListe alle Spieler im Spiel (alle Zonen)
 * @param gruppeVon    name → Set der Gruppen-Namen (inkl. sich selbst) oder undefined
 */
export function markerLagen(spielerListe, gruppeVon) {
  const lagen = new Map();
  for (const s of spielerListe) {
    const gruppe = gruppeVon(s.name);
    const liste = [];
    for (const anderer of spielerListe) {
      const eigen = anderer === s;
      for (const m of anderer.marker ?? []) {
        if (!eigen && !(m.sicht === 'alle' || (m.sicht === 'gruppe' && gruppe?.has(anderer.name)))) continue;
        liste.push({ ...m, von: anderer.anzeigeName ?? anderer.name, eigen });
      }
    }
    lagen.set(s, liste);
  }
  return lagen;
}

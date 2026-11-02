/**
 * Musik-Index (Phase 10): reine Funktionen ohne DOM/Node – genutzt von werkzeuge/audio/indexBauen.mjs (npm run musik:index,
 * lokaler Editor-Server), dem Editor (Audio-Zentrale) und tests/audioZentrale.test.js.
 *
 *   client/musik/<ordner>/*.ogg …        Ordner = Zonen-ID, `alle` (jede Zone) oder `hauptmenue` (Login-Bildschirm)
 *   client/musik/einstellungen.json      { "<ordner>": { "reihenfolge": ["b.ogg", "a.ogg"], "zufall": false, "ueberblendung": 3, "pause": 4 } } (optional)
 *   client/musik/musik.json              Index { "<ordner>": [Dateien in Reihenfolge], "_optionen": { "<ordner>": { zufall, ueberblendung, pause } } }
 */
export const MUSIK_ENDUNGEN = ['mp3', 'ogg', 'wav', 'm4a', 'flac', 'opus', 'webm'];
export const MUSIK_UEBERBLENDUNG_MAX = 15;
export const MUSIK_PAUSE_MAX = 120;
/** Standard (zonenMusik.js): 3 s einblenden, 2 s ausblenden beim Zonenwechsel, 4 s Pause zwischen Stücken */
export const MUSIK_STANDARD = Object.freeze({ ueberblendung: 3, pause: 4 });
/** Sonder-Ordner (keine Zonen) */
export const MUSIK_HAUPTMENUE = 'hauptmenue';
export const MUSIK_ALLE = 'alle';

export function istMusikDatei(name) {
  return new RegExp(`\\.(${MUSIK_ENDUNGEN.join('|')})$`, 'i').test(name);
}

/** Einstellungen säubern: nur Ordner-Objekte mit Liste `reihenfolge` (Strings) und `zufall` (bool). */
export function pruefeMusikEinstellungen(roh) {
  const aus = {};
  if (!roh || typeof roh !== 'object') return aus;
  for (const [ordner, e] of Object.entries(roh)) {
    if (!/^[a-z0-9_-]{1,40}$/i.test(ordner) || !e || typeof e !== 'object') continue;
    const r = {};
    if (Array.isArray(e.reihenfolge)) r.reihenfolge = e.reihenfolge.filter((d) => typeof d === 'string' && d.length <= 120);
    if (typeof e.zufall === 'boolean') r.zufall = e.zufall;
    // Studio 2.5: Überblendung (s, Ein-/Ausblenden beim Zonenwechsel und zwischen Stücken) und Pause zwischen Stücken (s)
    if (Number.isFinite(e.ueberblendung) && e.ueberblendung >= 0) r.ueberblendung = Math.min(MUSIK_UEBERBLENDUNG_MAX, Math.round(e.ueberblendung * 10) / 10);
    if (Number.isFinite(e.pause) && e.pause >= 0) r.pause = Math.min(MUSIK_PAUSE_MAX, Math.round(e.pause * 10) / 10);
    aus[ordner] = r;
  }
  return aus;
}

/** Dateien eines Ordners sortieren: erst laut `reihenfolge` (nur vorhandene), dann der Rest alphabetisch. */
export function sortiereMusik(dateien, reihenfolge = []) {
  const vorhanden = new Set(dateien);
  const vorne = reihenfolge.filter((d, i) => vorhanden.has(d) && reihenfolge.indexOf(d) === i);
  const rest = dateien.filter((d) => !vorne.includes(d)).sort((a, b) => a.localeCompare(b, 'de', { numeric: true }));
  return [...vorne, ...rest];
}

/**
 * Index bauen. @param ordner { "<ordner>": [dateinamen] } (nur Audio-Dateien werden genommen) @param einstellungen roh
 * @returns { "<ordner>": [...], _optionen?: { "<ordner>": { zufall } } }
 */
export function baueMusikIndex(ordner, einstellungen = {}) {
  const e = pruefeMusikEinstellungen(einstellungen);
  const index = {};
  const optionen = {};
  for (const name of Object.keys(ordner).sort()) {
    index[name] = sortiereMusik(ordner[name].filter(istMusikDatei), e[name]?.reihenfolge);
    const o = {};
    if (e[name]?.zufall === false) o.zufall = false;
    for (const k of ['ueberblendung', 'pause']) if (e[name]?.[k] !== undefined && e[name][k] !== MUSIK_STANDARD[k]) o[k] = e[name][k];
    if (Object.keys(o).length) optionen[name] = o;
  }
  if (Object.keys(optionen).length) index._optionen = optionen;
  return index;
}

/** Ordner-Namen eines Index (ohne `_optionen`) */
export function musikOrdner(index) {
  return Object.keys(index ?? {}).filter((k) => !k.startsWith('_') && Array.isArray(index[k]));
}

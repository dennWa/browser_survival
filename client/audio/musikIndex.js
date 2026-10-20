/**
 * Musik-Index (Phase 10): reine Funktionen ohne DOM/Node – genutzt von werkzeuge/audio/indexBauen.mjs (npm run musik:index,
 * lokaler Editor-Server), dem Editor (Audio-Zentrale) und tests/audioZentrale.test.js.
 *
 *   client/musik/<ordner>/*.ogg …        Ordner = Zonen-ID, `alle` (jede Zone) oder `hauptmenue` (Login-Bildschirm)
 *   client/musik/einstellungen.json      { "<ordner>": { "reihenfolge": ["b.ogg", "a.ogg"], "zufall": false } } (optional)
 *   client/musik/musik.json              Index { "<ordner>": [Dateien in Reihenfolge], "_optionen": { "<ordner>": { zufall } } }
 */
export const MUSIK_ENDUNGEN = ['mp3', 'ogg', 'wav', 'm4a', 'flac', 'opus', 'webm'];
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
    if (e[name]?.zufall === false) optionen[name] = { zufall: false };
  }
  if (Object.keys(optionen).length) index._optionen = optionen;
  return index;
}

/** Ordner-Namen eines Index (ohne `_optionen`) */
export function musikOrdner(index) {
  return Object.keys(index ?? {}).filter((k) => !k.startsWith('_') && Array.isArray(index[k]));
}

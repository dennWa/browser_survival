import { wetterSchichten, vorschauWetter, UMGEBUNGS_SCHICHTEN, WETTER_ZIELE } from '../../gemeinsam/audio/umgebung.js';
import { EREIGNISSE, parseDateiname, pruefeSoundEinstellungen } from '../../client/audio/eigeneSounds.js';
import { saubererName } from '../../editor/kern/audioKatalog.js';

/**
 * Audio-Zentrale des Studios (Phase 2) – umgebungsfreie Regeln (Tests: tests/studioAudio.test.js).
 *   TAGESZEITEN / ORTE                 Mischpult-Auswahl
 *   mischpult({ wetter, tageszeit, ort, schneeZone, windStufe }) → [{ name, staerke 0..1, aktiv }] in UMGEBUNGS_SCHICHTEN-Reihenfolge
 *       (gleiche Regel wie das Spiel: gemeinsam/audio/umgebung.wetterSchichten; `wind` = Grundwind läuft immer)
 *   wirksamerPegel(einstellungen, name, zone) → Pegel × Zonen-Faktor (wie client/audio/sound.js #pegel)
 *   ereignisPfad(ereignis, vorhandene, endung, { ersetzen }) → client/audio/eigene/<ereignis>[_n].<endung>
 *   musikPfad(ordner, name, vorhandene, endung) → client/musik/<ordner>/<Name>.<endung> (frei)
 */
export const TAGESZEITEN = Object.freeze({ tag: 1, abend: 0.45, nacht: 0.05 });
export const ORTE = Object.freeze({ draussen: 'draußen', haus: 'im Haus', auto: 'im Auto' });
export const WETTER = Object.freeze(Object.keys(WETTER_ZIELE));
export { UMGEBUNGS_SCHICHTEN };

export function mischpult({ wetter = 'klar', tageszeit = 'tag', ort = 'draussen', schneeZone = false, windStufe = null } = {}) {
  const w = vorschauWetter(WETTER.includes(wetter) ? wetter : 'klar', windStufe);
  const hell = typeof tageszeit === 'number' ? tageszeit : (TAGESZEITEN[tageszeit] ?? 1);
  const st = wetterSchichten({ w, hell, drinnen: ort !== 'draussen', imHaus: ort === 'haus', wetter, schneeZone });
  st.wind = 1; // Grundwind (starteAtmosphaere) läuft immer, Pegel regelt ihn
  return UMGEBUNGS_SCHICHTEN.map((name) => ({ name, staerke: Math.round((st[name] ?? 0) * 1000) / 1000, aktiv: (st[name] ?? 0) > 0.005, wann: EREIGNISSE[name]?.[1] ?? '' }));
}

export function wirksamerPegel(einstellungen, name, zone = null) {
  const e = pruefeSoundEinstellungen(einstellungen)[name] ?? {};
  return Math.round((e.lautstaerke ?? 1) * (zone ? (e.zonen?.[zone] ?? 1) : 1) * 1000) / 1000;
}

export function ereignisPfad(ereignis, vorhandene = [], endung = 'ogg', { ersetzen = false } = {}) {
  if (!Object.hasOwn(EREIGNISSE, ereignis)) throw new Error(`Unbekanntes Ereignis „${ereignis}“`);
  if (ersetzen) return `client/audio/eigene/${ereignis}.${endung}`;
  const nummern = vorhandene.map((p) => parseDateiname(String(p).split('/').at(-1))).filter((x) => x?.ereignis === ereignis).map((x) => x.nummer);
  return `client/audio/eigene/${ereignis}_${nummern.length ? Math.max(...nummern) + 1 : 1}.${endung}`;
}

export function musikPfad(ordner, name, vorhandene = [], endung = 'ogg') {
  if (!/^[a-z0-9_-]{1,40}$/i.test(ordner)) throw new Error(`Ungültiger Musik-Ordner „${ordner}“`);
  const basis = saubererName(name || 'Titel');
  const belegt = new Set(vorhandene.map((d) => String(d).split('/').at(-1).replace(/\.[a-z0-9]+$/i, '').toLowerCase()));
  let k = basis;
  for (let i = 2; belegt.has(k.toLowerCase()); i++) k = `${basis} (${i})`;
  return `client/musik/${ordner}/${k}.${endung}`;
}

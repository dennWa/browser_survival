import { BAUWERK_REICHWEITE } from '../../../gemeinsam/welt/bauwerke.js';

/**
 * Runde 24: Musik im Haus – Radio/Plattenspieler (Bauwerke) spielen ein Stück aus client/musik (Ordner-Index musik.json)
 * oder ein YouTube-Video. AKTION musik { ziel: bauwerkId, quelle: 'ordner' | 'youtube' | 'aus', wert }.
 * Gespeichert am Bauwerk: b.musik = { quelle, wert, startTick } (geht mit den Bauwerken ins Netz) – alle Clients in der Nähe
 * spielen synchron ab (Position = (aktueller Tick − startTick) × Tickdauer). Abspielen/Lautstärke: client/audio/hausMusik.js.
 */
export const MUSIK_TYPEN = new Set(['radio', 'plattenspieler']);
/** YouTube-Video-ID (11 Zeichen) */
export const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
/** Pfad im Musik-Ordner: <ordner>/<datei>.<endung> – keine Pfadsprünge */
export const MUSIK_PFAD = /^[a-z0-9_-]{1,40}\/[^/\\<>"?*]{1,160}\.(ogg|mp3|m4a|opus|webm|wav)$/i;

/** Prüft eine Musik-Wahl (auch für spielServer). @returns { quelle, wert } oder null */
export function pruefeMusikWahl(quelle, wert) {
  if (quelle === 'aus') return { quelle, wert: null };
  if (quelle === 'youtube' && typeof wert === 'string' && YOUTUBE_ID.test(wert)) return { quelle, wert };
  if (quelle === 'ordner' && typeof wert === 'string' && MUSIK_PFAD.test(wert) && !wert.includes('..')) return { quelle, wert };
  return null;
}

export function waehleMusik(spielWelt, spieler, { ziel, quelle, wert }) {
  const b = spielWelt.welt.bauwerke.get(ziel);
  if (!b || !MUSIK_TYPEN.has(b.typ)) return false;
  const g = spielWelt.welt.kachelGroesse;
  if (Math.hypot((b.tx + 0.5) * g - spieler.x, (b.ty + 0.5) * g - spieler.y) > BAUWERK_REICHWEITE + 24) {
    spielWelt.melde(spieler.id, 'Zu weit weg');
    return false;
  }
  const wahl = pruefeMusikWahl(quelle, wert);
  if (!wahl) {
    spielWelt.melde(spieler.id, quelle === 'youtube' ? 'Das ist kein gültiger YouTube-Link' : 'Dieses Stück gibt es nicht');
    return false;
  }
  if (wahl.quelle === 'aus') delete b.musik;
  else b.musik = { quelle: wahl.quelle, wert: wahl.wert, startTick: spielWelt.tick };
  spielWelt.welt.setzeBauwerk(b);
  spielWelt.ereignis({ typ: 'schalter', x: (b.tx + 0.5) * g, y: (b.ty + 0.5) * g });
  return true;
}

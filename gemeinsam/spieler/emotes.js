/**
 * Runde 47: Emotes – Emoji über dem Kopf (noch ohne Körper-Animation). Server prüft nur den Index (AKTION `emote` { wert }),
 * schickt das Ereignis `{ typ: 'emote', id, e }` an die Zone; Client zeigt es EMOTE_DAUER_MS lang (renderer.zeigeEmote).
 * ⚠ Reihenfolge nicht ändern (Index geht übers Netz) – Neue nur hinten anhängen.
 */
export const EMOTES = Object.freeze([
  ['👋', 'Hallo'],
  ['👍', 'Daumen hoch'],
  ['👎', 'Daumen runter'],
  ['😂', 'Lachen'],
  ['😊', 'Freude'],
  ['😢', 'Traurig'],
  ['😡', 'Wütend'],
  ['😱', 'Angst'],
  ['❤️', 'Herz'],
  ['🤝', 'Freunde'],
  ['✋', 'Halt!'],
  ['🙏', 'Bitte'],
  ['❓', 'Frage'],
  ['❗', 'Achtung'],
  ['🧟', 'Zombies!'],
  ['💤', 'Müde'],
]);

export const EMOTE_DAUER_MS = 4000;
/** Mindestabstand zwischen zwei Emotes eines Spielers (Server, in Ticks à 1/30 s) */
export const EMOTE_PAUSE_TICKS = 24;

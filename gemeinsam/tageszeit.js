/**
 * Tag & Nacht – reine Rechnerei, von Server (Spiellogik) und Client (Licht, Uhr) gemeinsam genutzt.
 *
 * Ein Zyklus = Tag (tagSekunden, 06:00–21:00) + Nacht (nachtSekunden, 21:00–06:00).
 * `zeit` = Sekunden seit Beginn des aktuellen Tages (0 … tagSekunden + nachtSekunden).
 */
const TAG_BEGINN_STUNDE = 6;
const TAG_STUNDEN = 15; // 06:00 → 21:00
const NACHT_STUNDEN = 9; // 21:00 → 06:00
const DAEMMERUNG_ANTEIL = 0.08; // so viel vom Tag (am Ende) ist Dämmerung
/** Runde 32: Morgen-Übergang länger (06:00 → ~08:15 erst voll hell) + Bodennebel bis ~09:00 (`morgen`) */
const MORGEN_ANTEIL = 0.15;
const MORGEN_NEBEL_ENDE = 0.2;

/**
 * @param zeit   Sekunden seit Tagesbeginn
 * @param dauer  { tagSekunden, nachtSekunden }
 * @returns {{ istNacht, stunde, minute, uhrzeit, helligkeit, anteil, morgen }}
 *   helligkeit 0 (Nacht) … 1 (Mittag) · anteil = Fortschritt im aktuellen Tag bzw. in der Nacht (0..1, für Sonne/Mond)
 */
export function tageszeit(zeit, { tagSekunden, nachtSekunden }) {
  const zyklus = tagSekunden + nachtSekunden;
  const t = ((zeit % zyklus) + zyklus) % zyklus;
  const istNacht = t >= tagSekunden;
  const stundenSeitSechs = istNacht
    ? TAG_STUNDEN + ((t - tagSekunden) / nachtSekunden) * NACHT_STUNDEN
    : (t / tagSekunden) * TAG_STUNDEN;
  const gesamtMinuten = Math.floor(((TAG_BEGINN_STUNDE + stundenSeitSechs) % 24) * 60);
  const stunde = Math.floor(gesamtMinuten / 60);
  const minute = gesamtMinuten % 60;

  const anteil = istNacht ? (t - tagSekunden) / nachtSekunden : t / tagSekunden;
  let helligkeit = 0;
  let morgen = 0;
  if (!istNacht) {
    // sanft hoch am Morgen (länger, Runde 32), Plateau, sanft runter am Abend
    helligkeit = Math.min(1, anteil / MORGEN_ANTEIL, (1 - anteil) / DAEMMERUNG_ANTEIL);
    helligkeit = helligkeit * helligkeit * (3 - 2 * helligkeit); // Smoothstep
    // Bodennebel: in der letzten Nachtstunde schon da (s. u.), am Morgen voll, bis MORGEN_NEBEL_ENDE weg
    morgen = Math.max(0, 1 - anteil / MORGEN_NEBEL_ENDE);
    morgen = morgen * morgen * (3 - 2 * morgen);
  } else if (anteil > 0.85) {
    morgen = (anteil - 0.85) / 0.15; // 04:40 → 06:00 zieht der Nebel auf
  }
  return {
    istNacht,
    stunde,
    minute,
    uhrzeit: `${String(stunde).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    helligkeit,
    anteil,
    morgen, // Runde 32: 0..1 Stärke des Morgennebels (Renderer: Bodennebel, warmer Dunst)
  };
}

/** Spielstunden seit 06:00 (fortlaufend, über Tage hinweg) → Sekunden; Umkehrung zu tageszeit(). */
function sekundenAusStunden(stunden, { tagSekunden, nachtSekunden }) {
  const zyklen = Math.floor(stunden / 24);
  const rest = stunden - zyklen * 24;
  const imZyklus = rest <= TAG_STUNDEN ? (rest / TAG_STUNDEN) * tagSekunden : tagSekunden + ((rest - TAG_STUNDEN) / NACHT_STUNDEN) * nachtSekunden;
  return zyklen * (tagSekunden + nachtSekunden) + imZyklus;
}

/**
 * Wie viele Sekunden muss die Uhr ab `zeit` vorlaufen, damit `stunden` Spielstunden vergehen?
 * (Tag und Nacht laufen unterschiedlich schnell – darum nicht einfach Dreisatz.)
 */
export function sekundenFuerStunden(zeit, stunden, dauer) {
  const zyklus = dauer.tagSekunden + dauer.nachtSekunden;
  const t = ((zeit % zyklus) + zyklus) % zyklus;
  const seitSechs = t < dauer.tagSekunden ? (t / dauer.tagSekunden) * TAG_STUNDEN : TAG_STUNDEN + ((t - dauer.tagSekunden) / dauer.nachtSekunden) * NACHT_STUNDEN;
  return sekundenAusStunden(seitSechs + stunden, dauer) - sekundenAusStunden(seitSechs, dauer);
}

/** Runde 43: Tageszeit-Objekt für eine feste Uhrzeit (Stunde 0–24, z. B. 20.55) – Zonen mit `festeZeit` (nur Licht/Himmel). */
export function tageszeitUm(stunde, dauer) {
  const seitSechs = (((stunde - TAG_BEGINN_STUNDE) % 24) + 24) % 24;
  return tageszeit(sekundenAusStunden(seitSechs, dauer), dauer);
}

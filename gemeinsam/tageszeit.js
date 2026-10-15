/**
 * Tag & Nacht – reine Rechnerei, von Server (Spiellogik) und Client (Licht, Uhr) gemeinsam genutzt.
 *
 * Ein Zyklus = Tag (tagSekunden, 06:00–21:00) + Nacht (nachtSekunden, 21:00–06:00).
 * `zeit` = Sekunden seit Beginn des aktuellen Tages (0 … tagSekunden + nachtSekunden).
 */
const TAG_BEGINN_STUNDE = 6;
const TAG_STUNDEN = 15; // 06:00 → 21:00
const NACHT_STUNDEN = 9; // 21:00 → 06:00
const DAEMMERUNG_ANTEIL = 0.08; // so viel vom Tag (am Anfang und Ende) ist Dämmerung

/**
 * @param zeit   Sekunden seit Tagesbeginn
 * @param dauer  { tagSekunden, nachtSekunden }
 * @returns {{ istNacht, stunde, minute, uhrzeit, helligkeit, anteil }}
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
  if (!istNacht) {
    // sanft hoch am Morgen, Plateau, sanft runter am Abend
    helligkeit = Math.min(1, anteil / DAEMMERUNG_ANTEIL, (1 - anteil) / DAEMMERUNG_ANTEIL);
    helligkeit = helligkeit * helligkeit * (3 - 2 * helligkeit); // Smoothstep
  }
  return {
    istNacht,
    stunde,
    minute,
    uhrzeit: `${String(stunde).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    helligkeit,
    anteil,
  };
}

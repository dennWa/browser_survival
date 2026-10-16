/**
 * Basisbau – Rechte. Eine einzige Stelle entscheidet, wer in einem Gebiet was darf (Server UND Client-Anzeige).
 *
 * Heute: nur der Besitzer der Flagge. Vorbereitet für Gruppen: `flagge.mitglieder = { spielerName: [RECHT, …] }`
 * (wird mitgespeichert, ist aber noch nirgends befüllbar). Später genügt es, die Mitglieder-Verwaltung (Einladen,
 * Rechte setzen) zu bauen – alle Prüfungen laufen schon über hatRecht().
 */
export const RECHT = Object.freeze({
  BAUEN: 'bauen', // Bauteile im Gebiet platzieren
  ABREISSEN: 'abreissen', // Bauteile im Gebiet abreißen (Rückerstattung geht an den, der abreißt)
  BENUTZEN: 'benutzen', // Türen & Kisten & Betten anderer im Gebiet benutzen
});

/**
 * Darf `name` im Gebiet der Flagge `flagge` das Recht `recht` ausüben?
 * @param flagge  { besitzer, mitglieder? } oder null (= herrenloses Gebiet → niemand darf, hier gilt: Aufrufer prüft vorher)
 */
export function hatRecht(flagge, name, recht) {
  if (!flagge || !name) return false;
  if (flagge.besitzer === name) return true;
  const rechte = flagge.mitglieder?.[name];
  return Array.isArray(rechte) && rechte.includes(recht);
}

/**
 * Darf `name` dieses Bauteil `b` benutzen (Tür öffnen, Kiste öffnen, Bett nutzen)?
 * Eigene Bauteile immer; fremde nur mit Recht BENUTZEN im Gebiet, in dem sie stehen.
 */
export function darfBenutzen(b, name, flaggeDort = null) {
  return b.besitzer === name || hatRecht(flaggeDort, name, RECHT.BENUTZEN);
}

/** Darf `name` das Bauteil abreißen? Eigenes immer, sonst als Besitzer/Mitglied des Gebiets. */
export function darfAbreissen(b, name, flaggeDort = null) {
  return b.besitzer === name || hatRecht(flaggeDort, name, RECHT.ABREISSEN);
}

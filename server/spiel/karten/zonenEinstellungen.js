/**
 * Zonen-Werte: Einstellungen, die eine Karte (Feld `einstellungen` der Kartendefinition) für IHRE Zone überschreiben darf.
 * Alles, was nicht gesetzt ist, kommt aus der globalen Konfiguration (spielKonfiguration.js / einstellungen.json).
 * Die Liste ist die Schnittstelle zwischen Map-Editor (editor/, zeigt sie an) und Spiel (kartenLader → SpielWelt).
 *
 *   einstellungen: { wetter: { regenAnteil: 0.9 }, zombie: { dichte: 2 }, tiere: { … }, loot: { … } }
 *
 * `zombie.dichte` ist neu (nur pro Zone): Faktor auf die Zombies je Spawnpunkt (1 = wie gehabt).
 */
export const ZONEN_EINSTELLUNGEN = Object.freeze({
  wetter: {
    titel: 'Wetter',
    werte: [
      { name: 'aktiv', label: 'Wetter an', typ: 'haken' },
      { name: 'regenAnteil', label: 'Regen-Anteil', typ: 'zahl', min: 0, max: 1, schritt: 0.05, hilfe: 'Rest = Nebel' },
      { name: 'dauerMin', label: 'Dauer min', typ: 'zahl', min: 10, max: 3600, einheit: 's' },
      { name: 'dauerMax', label: 'Dauer max', typ: 'zahl', min: 10, max: 3600, einheit: 's' },
      { name: 'pauseMin', label: 'Pause min', typ: 'zahl', min: 10, max: 7200, einheit: 's', hilfe: 'kürzer = häufiger Regen/Nebel' },
      { name: 'pauseMax', label: 'Pause max', typ: 'zahl', min: 10, max: 7200, einheit: 's' },
    ],
  },
  zombie: {
    titel: 'Zombies',
    werte: [
      { name: 'dichte', label: 'Dichte', typ: 'zahl', min: 0, max: 5, schritt: 0.25, standard: 1, hilfe: 'Faktor Zombies je Spawnpunkt' },
      { name: 'respawnZeit', label: 'Respawn', typ: 'zahl', min: 5, max: 3600, einheit: 's' },
      { name: 'nachtHorde', label: 'Nacht-Horde', typ: 'zahl', min: 0, max: 60, schritt: 1, hilfe: 'Zombies, die nachts zusätzlich kommen' },
      { name: 'nachtTempoFaktor', label: 'Nacht-Tempo', typ: 'zahl', min: 0.5, max: 3, schritt: 0.05, hilfe: 'Faktor Jagdtempo nachts' },
    ],
  },
  tiere: {
    titel: 'Tiere (Hasen)',
    werte: [
      { name: 'hasenProTausend', label: 'Hasen je 1000 Gras', typ: 'zahl', min: 0, max: 50, schritt: 0.5, hilfe: 'nur ohne Hasen-Bereiche' },
      { name: 'hasenMax', label: 'Hasen max', typ: 'zahl', min: 0, max: 200, schritt: 1 },
      { name: 'hasenRespawn', label: 'Respawn', typ: 'zahl', min: 5, max: 3600, einheit: 's' },
    ],
  },
  loot: {
    titel: 'Loot',
    werte: [
      { name: 'spawnChance', label: 'Loot-Chance', typ: 'zahl', min: 0, max: 1, schritt: 0.05, hilfe: 'liegt an einem Loot-Punkt etwas?' },
      { name: 'respawnZeit', label: 'Nachschub', typ: 'zahl', min: 5, max: 7200, einheit: 's', hilfe: 'bis geplünderte Punkte neu gewürfelt werden' },
    ],
  },
});

/** Rohwerte prüfen: nur bekannte Felder, Zahlen im erlaubten Bereich, Haken als boolean. Unbekanntes fällt still weg. */
export function pruefeZonenEinstellungen(roh) {
  const ergebnis = {};
  if (!roh || typeof roh !== 'object') return ergebnis;
  for (const [bereich, def] of Object.entries(ZONEN_EINSTELLUNGEN)) {
    const quelle = roh[bereich];
    if (!quelle || typeof quelle !== 'object') continue;
    for (const f of def.werte) {
      const v = quelle[f.name];
      if (f.typ === 'haken' && typeof v === 'boolean') (ergebnis[bereich] ??= {})[f.name] = v;
      if (f.typ === 'zahl' && Number.isFinite(v)) (ergebnis[bereich] ??= {})[f.name] = Math.max(f.min ?? -Infinity, Math.min(f.max ?? Infinity, v));
    }
  }
  return ergebnis;
}

/**
 * Konfiguration einer Zone: die gemeinsame Konfiguration, darüber die Zonen-Werte. Bereiche ohne Zonen-Werte bleiben
 * DIESELBEN Objekte (Developer-Änderungen wirken weiter überall); Bereiche mit Werten erben per Prototyp (nicht überschriebene
 * Felder lesen weiter live aus der gemeinsamen Konfiguration).
 */
export function zonenKonfiguration(basis, einstellungen) {
  const geprueft = pruefeZonenEinstellungen(einstellungen);
  if (Object.keys(geprueft).length === 0) return basis;
  const zone = Object.create(basis);
  for (const [bereich, werte] of Object.entries(geprueft)) zone[bereich] = Object.assign(Object.create(basis[bereich] ?? {}), werte);
  return zone;
}

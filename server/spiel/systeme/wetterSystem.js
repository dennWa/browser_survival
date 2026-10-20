/**
 * Wetter pro Zone: 'klar' | 'regen' | 'nebel' (Schneezonen, Karte `schnee`: 'schnee' statt 'regen' – lautlos, löscht kein Feuer
 * und beschleunigt kein Wachstum). Wechselt zufällig – Regen/Nebel dauern konfiguration.wetter.dauerMin…dauerMax
 * Sekunden (1–5 Minuten), dazwischen ist es klar (pauseMin…pauseMax). Der aktuelle Zustand geht in jedem
 * Schnappschuss mit (ZUSTAND.wetter). Regen halbiert die Wachstumszeit der Pflanzen (bauSystem, WACHSTUM_REGEN_FAKTOR).
 */
export const WACHSTUM_REGEN_FAKTOR = 2;

export function aktualisiereWetter(spielWelt, dt) {
  const k = spielWelt.konfiguration.wetter;
  const w = spielWelt.wetter;
  if (!k.aktiv) {
    w.art = 'klar';
    return;
  }
  w.rest -= dt;
  if (w.rest > 0) return;
  if (w.art === 'klar') {
    w.art = spielWelt.zufall.zahl() < k.regenAnteil ? niederschlag(spielWelt) : 'nebel'; // regenAnteil = Anteil Niederschlag (Regen bzw. Schnee)
    w.rest = k.dauerMin + spielWelt.zufall.zahl() * (k.dauerMax - k.dauerMin);
  } else {
    w.art = 'klar';
    w.rest = k.pauseMin + spielWelt.zufall.zahl() * (k.pauseMax - k.pauseMin);
  }
}

/** Art des Niederschlags dieser Zone: 'schnee' in Schneezonen, sonst 'regen'. */
export function niederschlag(spielWelt) {
  return spielWelt.welt?.schnee ? 'schnee' : 'regen';
}

/** Setzt das Wetter von Hand (Tests, Admin-/Konsolenbefehl). */
export function setzeWetter(spielWelt, art, sekunden = 120) {
  spielWelt.wetter.art = art;
  spielWelt.wetter.rest = sekunden;
}

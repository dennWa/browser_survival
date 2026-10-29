/**
 * Wetter pro Zone (Runde 23 erweitert), unabhängig von Tag/Nacht:
 *   'klar' | 'regen' | 'gewitter' (Regen + Blitz/Donner) | 'sturm' (starker Wind, trocken) | 'nebel'
 *   Schneezonen (Karte `schnee`): 'schnee' statt 'regen', 'schneesturm' statt 'gewitter' – lautlos, löschen kein Feuer.
 * Wechselt zufällig – Wetterphasen dauern konfiguration.wetter.dauerMin…dauerMax Sekunden (1–5 Minuten), dazwischen ist
 * es klar (pauseMin…pauseMax). Anteile: regenAnteil = Niederschlag (sonst Nebel/Sturm), davon gewitterAnteil = Gewitter
 * bzw. Schneesturm; vom Rest sturmAnteil = Sturm, sonst Nebel. Der Zustand geht in jedem Schnappschuss mit (ZUSTAND.wetter).
 * Regen/Gewitter halbieren die Wachstumszeit der Pflanzen (bauSystem, WACHSTUM_REGEN_FAKTOR) und löschen Lagerfeuer.
 */
export const WACHSTUM_REGEN_FAKTOR = 2;

/** Alle Wetterarten (Validierung, Admin-Auswahl). */
export const WETTER_ARTEN = Object.freeze(['klar', 'regen', 'gewitter', 'sturm', 'nebel', 'schnee', 'schneesturm']);

/** Regnet es (Feuer aus, Pflanzen wachsen schneller)? */
export function regnet(art) {
  return art === 'regen' || art === 'gewitter';
}

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
    const z = spielWelt.zufall;
    if (z.zahl() < k.regenAnteil) w.art = z.zahl() < (k.gewitterAnteil ?? 0) ? sturmNiederschlag(spielWelt) : niederschlag(spielWelt);
    else w.art = z.zahl() < (k.sturmAnteil ?? 0) ? 'sturm' : 'nebel';
    w.rest = k.dauerMin + z.zahl() * (k.dauerMax - k.dauerMin);
  } else {
    w.art = 'klar';
    w.rest = k.pauseMin + spielWelt.zufall.zahl() * (k.pauseMax - k.pauseMin);
  }
}

/** Art des Niederschlags dieser Zone: 'schnee' in Schneezonen, sonst 'regen'. */
export function niederschlag(spielWelt) {
  return spielWelt.welt?.schnee ? 'schnee' : 'regen';
}

/** Heftiger Niederschlag: 'schneesturm' in Schneezonen, sonst 'gewitter'. */
export function sturmNiederschlag(spielWelt) {
  return spielWelt.welt?.schnee ? 'schneesturm' : 'gewitter';
}

/** Wetterarten, die in dieser Zone vorkommen (Admin-Knopf schaltet sie der Reihe nach durch). */
export function wetterDerZone(spielWelt) {
  return ['klar', niederschlag(spielWelt), sturmNiederschlag(spielWelt), 'sturm', 'nebel'];
}

/** Setzt das Wetter von Hand (Tests, Admin-/Konsolenbefehl). */
export function setzeWetter(spielWelt, art, sekunden = 120) {
  spielWelt.wetter.art = art;
  spielWelt.wetter.rest = sekunden;
}

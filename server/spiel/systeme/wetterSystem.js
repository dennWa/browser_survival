/**
 * Wetter pro Zone (Runde 23 erweitert), unabhängig von Tag/Nacht:
 *   'klar' | 'regen' | 'gewitter' (Regen + Blitz/Donner) | 'sturm' (starker Wind, trocken) | 'nebel'
 *   Schneezonen (Karte `schnee`): 'schnee' statt 'regen', 'schneesturm' statt 'gewitter' – lautlos, löschen kein Feuer.
 * Wechselt zufällig – Wetterphasen dauern konfiguration.wetter.dauerMin…dauerMax Sekunden (1–5 Minuten), dazwischen ist
 * es klar (pauseMin…pauseMax). Anteile: regenAnteil = Niederschlag (sonst Nebel/Sturm), davon gewitterAnteil = Gewitter
 * bzw. Schneesturm; vom Rest sturmAnteil = Sturm, sonst Nebel. Der Zustand geht in jedem Schnappschuss mit (ZUSTAND.wetter).
 * Regen/Gewitter halbieren die Wachstumszeit der Pflanzen (bauSystem, WACHSTUM_REGEN_FAKTOR) und löschen Lagerfeuer.
 * Runde 26: Stufe 0 = Flaute (Ton ganz aus). Runde 24: Grundwind `wetter.wind` 0..1 (ruhig ≈0,1 · leicht ≈0,35 · frisch ≈0,6 · stark ≈0,85) wechselt alle
 * windMin…windMax Sekunden sein Ziel und gleitet langsam dorthin; Sturmwetter zieht ihn hoch, Nebel runter.
 * Geht als ZUSTAND.wind mit – der Client legt Böen drüber (Ton + Bäume/Gras aus derselben Kurve).
 */
export const WACHSTUM_REGEN_FAKTOR = 2;

/** Alle Wetterarten (Validierung, Admin-Auswahl). */
export const WETTER_ARTEN = Object.freeze(['klar', 'regen', 'gewitter', 'sturm', 'nebel', 'schnee', 'schneesturm']);

/** Regnet es (Feuer aus, Pflanzen wachsen schneller)? */
export function regnet(art) {
  return art === 'regen' || art === 'gewitter';
}

/** Windstufen, aus denen der Grundwind sein nächstes Ziel würfelt (Wert, Gewicht). */
export const WIND_STUFEN = Object.freeze([
  [0, 2.5], // Runde 26: echte Flaute – bei gutem Wetter oft ganz still
  [0.12, 3],
  [0.35, 3],
  [0.6, 2],
  [0.85, 0.8],
]);

export function aktualisiereWetter(spielWelt, dt) {
  const k = spielWelt.konfiguration.wetter;
  const w = spielWelt.wetter;
  aktualisiereWind(spielWelt, w, dt);
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

/** Ziel-Windstärke würfeln und langsam angleichen; das Wetter setzt Unter-/Obergrenzen. */
function aktualisiereWind(spielWelt, w, dt) {
  const k = spielWelt.konfiguration.wetter;
  w.wind ??= 0.35;
  w.windZiel ??= 0.35;
  w.windRest = (w.windRest ?? 0) - dt;
  if (w.windRest <= 0) {
    const z = spielWelt.zufall;
    const summe = WIND_STUFEN.reduce((s, [, g]) => s + g, 0);
    let r = z.zahl() * summe;
    w.windZiel = WIND_STUFEN.find(([, g]) => (r -= g) < 0)?.[0] ?? 0.35;
    w.windRest = (k.windMin ?? 45) + z.zahl() * ((k.windMax ?? 150) - (k.windMin ?? 45));
  }
  let ziel = w.windZiel;
  if (w.art === 'sturm' || w.art === 'schneesturm') ziel = 1;
  else if (w.art === 'gewitter') ziel = Math.max(ziel, 0.75);
  else if (w.art === 'regen') ziel = Math.max(ziel, 0.45);
  else if (w.art === 'nebel') ziel = Math.min(ziel, 0.12);
  const schritt = (k.windTempo ?? 0.025) * dt;
  w.wind += Math.max(-schritt, Math.min(schritt, ziel - w.wind));
}

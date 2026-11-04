/**
 * Umgebungs-Klang (Wetter & Tageszeit) – reine Regeln, gemeinsam für das Spiel (client/kern/clientSpiel.js) und das
 * Studio-Mischpult (studio/audio/, Phase 2.4). Tests: tests/studioAudio.test.js.
 *   WETTER_ZIELE / wetterZiel(art)   Zielwerte des Wetter-Effekts je Wetterlage (client/darstellung/wetterEffekt.js blendet dorthin)
 *   wetterSchichten({ w, hell, drinnen, imHaus, wetter, schneeZone, zeit })
 *       → Stärke 0..1 je Schleifen-Ereignis: regen, nacht, sturm, schneesturm, regen_stark, tag, nacht_wind, wind_leicht,
 *         wind_stark, blizzard_a, blizzard_b, regen_dach (vor Pegel/Zonen-Faktor aus client/audio/eigene/einstellungen.json)
 *     Runde 29: regen ↔ regen_stark überblenden (Starkregen/Gewitter), Schneezonen: blizzard_a/b wechseln sich ab (zeit in s) statt wind_*;
 *     Klangfarbe drinnen macht Sound.setzeDrinnen (Tiefpass auf den Draußen-Schichten), hier nur die Pegel.
 *     w = { regen, schnee, nebel, sturm, gewitter, windStufe 0..3 } (wie WetterEffekt), hell = Tageslicht 0..1,
 *     drinnen = Haus oder Auto (gedämpft), imHaus = Haus (Regen aufs Dach), schneeZone = Zone mit Schnee
 *   vorschauWetter(art, windStufe?) → w für eine Wetterlage im eingeschwungenen Zustand (Mischpult)
 *   UMGEBUNGS_SCHICHTEN  Reihenfolge/Namen fürs Mischpult (dazu `wind` = Grundwind, läuft immer)
 */
export const WETTER_ZIELE = Object.freeze({
  klar: {},
  regen: { regen: 1, nebel: 0.3 },
  starkregen: { regen: 1, nebel: 0.4, sturm: 0.3, starkregen: 1 },
  gewitter: { regen: 1, nebel: 0.5, sturm: 0.6, gewitter: 1 },
  sturm: { nebel: 0.12, sturm: 1 },
  nebel: { nebel: 1 },
  schnee: { schnee: 1, nebel: 0.4 },
  schneesturm: { schnee: 1, nebel: 0.85, sturm: 1 },
});

export const UMGEBUNGS_SCHICHTEN = Object.freeze(['wind', 'wind_leicht', 'wind_stark', 'blizzard_a', 'blizzard_b', 'regen', 'regen_stark', 'regen_dach', 'sturm', 'schneesturm', 'tag', 'nacht', 'nacht_wind']);

export const wetterZiel = (art) => ({ regen: 0, schnee: 0, nebel: 0, sturm: 0, gewitter: 0, starkregen: 0, ...(WETTER_ZIELE[art] ?? {}) });

/** 0..1 begrenzen, weich (Smoothstep) – für Wind-Lautstärken */
export const wind01 = (v) => {
  const t = Math.max(0, Math.min(1, v));
  return t * t * (3 - 2 * t);
};

/** Typische Windstufe einer Wetterlage (Mischpult; im Spiel würfelt der Server den Grundwind) */
export function vorschauWetter(art, windStufe = null) {
  const z = wetterZiel(art);
  const wind = windStufe ?? (art === 'nebel' ? 0.15 : z.sturm ? 2.6 : art === 'regen' ? 1.4 : 0.9);
  return { ...z, windStufe: Math.max(0, Math.min(3, wind)) };
}

/** Runde 29: So lange (s) braucht ein Blizzard-Wechsel hin und zurück */
const BLIZZARD_ZYKLUS = 100;
/** Draußen-Geräusche drinnen (Grillen, Vögel, Wind) deutlich leiser */
const DRINNEN_LEISE = 0.3;

export function wetterSchichten({ w, hell = 1, drinnen = false, imHaus = false, wetter = 'klar', schneeZone = false, zeit = 0 }) {
  const daempfung = drinnen ? 0.4 : 1;
  const schneesturm = wetter === 'schneesturm' || (schneeZone && w.schnee > 0.1) ? w.sturm : 0;
  const ruhig = !['regen', 'starkregen', 'gewitter', 'sturm', 'schneesturm'].includes(wetter);
  const stark = Math.max(w.gewitter ?? 0, w.starkregen ?? 0);
  const leise = drinnen ? DRINNEN_LEISE : 1;
  const blizzard = schneeZone ? (0.55 + 0.45 * Math.min(1, w.windStufe / 3)) * (1 - 0.6 * w.sturm) * leise : 0;
  const wechsel = (Math.sin((zeit / BLIZZARD_ZYKLUS) * Math.PI * 2) + 1) * (Math.PI / 4); // 0..π/2, gleiche Leistung
  const windFrei = schneeZone ? 0 : leise;
  return {
    regen: w.regen * (1 - stark) * (imHaus ? 0.16 : 1), // Runde 31: drinnen nochmal 20 % leiser (vorher 0,2)
    // Grillen: nur bei ruhigem Wetter, nicht in Schneezonen
    nacht: schneeZone || !ruhig ? 0 : (1 - hell) * leise,
    sturm: Math.max(0, w.sturm - schneesturm) * daempfung,
    schneesturm: schneesturm * daempfung,
    regen_stark: w.regen * stark * daempfung,
    tag: schneeZone ? 0 : Math.max(0, (hell - 0.55) / 0.45) * (1 - Math.max(w.regen, w.sturm, w.nebel * 0.5)) * leise,
    // Runde 28: Nachtwind aus – lief nachts zusätzlich zu wind_leicht (zwei Windgeräusche gleichzeitig). Die Windaufnahmen bleiben.
    nacht_wind: 0,
    // Runde 26: Windton folgt der Stufe der Bäume (0..3); Runde 28: leicht ↔ stark überblenden statt doppelt übereinander
    // Runde 31: schwacher Wind draußen einen Tick leiser (×0,8); drinnen unverändert (windFrei = DRINNEN_LEISE)
    wind_leicht: wind01((w.windStufe - 0.3) / 1.6) * 0.75 * (drinnen ? 1 : 0.8) * (1 - 0.8 * wind01((w.windStufe - 1.5) / 1.3) ** 1.3) * windFrei,
    wind_stark: wind01((w.windStufe - 1.5) / 1.3) ** 1.3 * (1 - 0.6 * w.sturm) * windFrei,
    blizzard_a: blizzard * Math.cos(wechsel),
    blizzard_b: blizzard * Math.sin(wechsel),
    // Runde 24: drinnen prasselt Regen aufs Dach
    regen_dach: imHaus ? w.regen : 0,
  };
}

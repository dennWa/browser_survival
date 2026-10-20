/**
 * Grafik-Einstellungen (Skalierbarkeit): Presets Hoch/Mittel/Niedrig + ein live überschreibbares Einstellungs-Objekt.
 *
 *   GRAFIK_PROFILE        – feste Presets (⚙ Einstellungen → Grafik, renderer.setzeGrafik(name), localStorage 'browserSurvival.grafik')
 *   GRAFIK_EINSTELLUNGEN  – aktuell wirksame Werte (Kopie des Presets); einzelne Schalter lassen sich überschreiben:
 *                           renderer.setzeGrafikOption('ssao', false) – wirkt sofort, ohne Neustart (z. B. für ein späteres UI-Menü
 *                           oder in der Konsole: spiel.renderer.setzeGrafikOption('bloom', false))
 *
 * Felder (Nachbearbeitung siehe nachbearbeitung.js):
 *   nachbearbeitung  EffectComposer an/aus (aus = direkt auf den Bildschirm wie früher, beste Bildrate)
 *   ssao             Umgebungsverdeckung (GTAO) – 1 = volle, 0.5 = halbe Auflösung, 0 = aus
 *   bloom            Leuchten um helle Lichter (Laternen, Feuer, Taschenlampe)
 *   schattenRadius   Weichheit der Schattenkanten (PCF mit Vogel-Disk; r186 kennt kein PCFSoftShadowMap mehr – PCF IST weich)
 *   msaa             Kantenglättung im Composer-Puffer (Samples; Handy immer 0)
 *   belichtung       toneMappingExposure (ACES Filmic)
 *   stufe/adaptiv/aufloesung/texturen/sonnenschatten/natur – Leistungsregler wie bisher (renderer.js, QUALITAETS_STUFEN)
 */
export const GRAFIK_PROFILE = Object.freeze({
  hoch: Object.freeze({
    name: 'Hoch',
    beschreibung: 'volle Auflösung, Schatten, Texturen, Umgebungsverdeckung & Leuchten',
    stufe: null, adaptiv: true, aufloesung: null, texturen: 1, sonnenschatten: true,
    nachbearbeitung: true, ssao: 1, bloom: true, schattenRadius: 4, msaa: 4, belichtung: 1.05,
  }),
  mittel: Object.freeze({
    name: 'Mittel',
    beschreibung: 'weiche Schatten & Leuchten, Umgebungsverdeckung in halber Auflösung',
    stufe: 3, adaptiv: false, aufloesung: 1.25, texturen: 0.6, sonnenschatten: true,
    nachbearbeitung: true, ssao: 0.5, bloom: true, schattenRadius: 3, msaa: 2, belichtung: 1.05,
  }),
  niedrig: Object.freeze({
    name: 'Niedrig',
    beschreibung: 'beste Leistung für schwache Geräte (ohne 3D-Gras & Nachbearbeitung)',
    stufe: 6, adaptiv: false, aufloesung: 0.8, texturen: 0.4, sonnenschatten: false, natur: false,
    nachbearbeitung: false, ssao: 0, bloom: false, schattenRadius: 1, msaa: 0, belichtung: 1.05,
  }),
});

/** Aktuell wirksame Werte – wird von renderer.setzeGrafik() neu befüllt, einzelne Felder per setzeGrafikOption() änderbar. */
export const GRAFIK_EINSTELLUNGEN = { profil: 'hoch', ...GRAFIK_PROFILE.hoch };

/** Preset übernehmen (alle Überschreibungen weg). */
export function waehleProfil(name) {
  for (const k of Object.keys(GRAFIK_EINSTELLUNGEN)) delete GRAFIK_EINSTELLUNGEN[k];
  Object.assign(GRAFIK_EINSTELLUNGEN, { profil: name }, GRAFIK_PROFILE[name]);
  return GRAFIK_EINSTELLUNGEN;
}

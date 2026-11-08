/**
 * Runde 46: Grafik-Details (⚙ Einstellungen → Grafik → „Details anpassen“) – einzelne Regler zusätzlich zum Profil
 * (Auto/Hoch/Mittel/Niedrig, renderer.js GRAFIK_PROFILE):
 *   - „auto“ = wie das Profil (inkl. automatischer Nachregelung im Renderer), jede andere Wahl gilt fest.
 *   - Ein Profil-Klick setzt die BILD-Details zurück auf „auto“ (Bildrate & Akku bleiben – sie gehören nicht zum Profil).
 *   - Bildrate/Akku wirken in der Spielschleife (bildrateGrenze, clientSpiel), alles andere im Renderer (setzeDetail).
 * Ohne DOM/three.js (in Node testbar). Gemerkt in localStorage `browserSurvival.grafikDetails` (JSON);
 * die Bildrate zusätzlich in `bs_maxfps` (ältere Fassungen lasen nur diesen Schlüssel).
 */
export const GRAFIK_DETAILS_SCHLUESSEL = 'browserSurvival.grafikDetails';
const ALT_FPS_SCHLUESSEL = 'bs_maxfps';

/** Bildrate mit „Akku sparen“ (Laptop am Akku bzw. immer) */
export const AKKU_FPS = 30;
/** Bildrate, solange ein Spielfenster (Inventar, Karte, Werkbank …) offen ist oder das Spiel nicht im Vordergrund liegt */
export const RUHE_FPS = 30;

/**
 * Die Regler. `bild: true` = gehört zum Profil (wird beim Profil-Klick auf „auto“ gesetzt), `neustart: true` = wirkt erst beim
 * nächsten Laden (WebGL-Kontext). `hilfe` erscheint unter den Reglern, sobald man einen anfasst.
 */
export const GRAFIK_DETAILS = Object.freeze({
  bildrate: {
    name: 'Bildrate',
    standard: 60,
    optionen: [[30, '30'], [60, '60'], [120, '120'], [0, 'Max']],
    hilfe: 'Höchste Bilder pro Sekunde. 30 halbiert die Arbeit der Grafikkarte (Strom, Wärme, Lüfter) – „Max“ nur für 120/144-Hz-Bildschirme.',
  },
  akku: {
    name: 'Akku sparen',
    standard: 'akku',
    optionen: [['aus', 'Aus'], ['akku', 'Bei Akku'], ['immer', 'Immer']],
    hilfe: `Höchstens ${AKKU_FPS} Bilder pro Sekunde, wenn der Laptop nicht am Strom hängt („Bei Akku“) bzw. immer. „Immer“ nimmt ab dem nächsten Start außerdem den sparsamen Grafikchip.`,
  },
  aufloesung: {
    name: 'Auflösung',
    bild: true,
    standard: 'auto',
    optionen: [['auto', 'Auto'], [1, '100\u00a0%'], [0.85, '85\u00a0%'], [0.7, '70\u00a0%'], [0.5, '50\u00a0%']],
    hilfe: 'Anteil der vollen Bildschirmauflösung, in der die 3D-Welt gerechnet wird (Schrift & Anzeigen bleiben scharf). Der größte Hebel: 70\u00a0% ≈ halbe Pixelarbeit.',
  },
  schatten: {
    name: 'Schatten',
    bild: true,
    standard: 'auto',
    optionen: [['auto', 'Auto'], ['hoch', 'Hoch'], ['mittel', 'Mittel'], ['niedrig', 'Niedrig'], ['aus', 'Aus']],
    hilfe: 'Hoch: feine Sonnen- und Taschenlampenschatten · Mittel: etwas weicher, halb so oft neu gezeichnet · Niedrig: keine Sonnenschatten, nur die Taschenlampe · Aus: gar keine (die Taschenlampe leuchtet dann auch durch Wände).',
  },
  lichter: {
    name: 'Lichtquellen',
    bild: true,
    standard: 'auto',
    optionen: [['auto', 'Auto'], ['viele', 'Viele'], ['normal', 'Normal'], ['wenige', 'Wenige']],
    hilfe: 'Wie viele Lampen, Feuer und Laternen nachts gleichzeitig echtes Licht werfen (die übrigen glühen nur). Jedes Licht kostet bei jedem Pixel Rechenzeit.',
  },
  kanten: {
    name: 'Kantenglättung',
    bild: true,
    neustart: true,
    standard: 'auto',
    optionen: [['auto', 'Auto'], ['an', 'An'], ['aus', 'Aus']],
    hilfe: 'Glatte statt treppiger Kanten (MSAA). Auto: an, außer auf Handys und hochauflösenden Bildschirmen (dort sind die Kanten schon fein). Wirkt ab dem nächsten Start.',
  },
  texturen: {
    name: 'Bodentexturen',
    bild: true,
    standard: 'auto',
    optionen: [['auto', 'Auto'], ['hoch', 'Hoch'], ['mittel', 'Mittel'], ['niedrig', 'Niedrig']],
    hilfe: 'Schärfe von Straßen, Wiesen und Böden. Niedriger spart Grafikspeicher (wichtig bei Onboard-Grafik und Handys).',
  },
  natur: {
    name: 'Gras & Blumen',
    bild: true,
    standard: 'auto',
    optionen: [['auto', 'Auto'], ['an', 'An'], ['aus', 'Aus']],
    hilfe: '3D-Gras und Blumen (bisher nur am Lagerplatz).',
  },
});

/** Schatten-Wahl → Schattenkarte (px), Neuzeichnen jedes n-te Bild, Sonnen-/Taschenlampenschatten, Baumschatten + Baum-Umrisse */
export const SCHATTEN_WAHL = Object.freeze({
  hoch: { groesse: 2048, takt: 1, sonne: true, lampe: true, baeume: true },
  mittel: { groesse: 1024, takt: 2, sonne: true, lampe: true, baeume: true },
  niedrig: { groesse: 1024, takt: 2, sonne: false, lampe: true, baeume: false }, // wie Profil „Niedrig“: nachts bleibt die Taschenlampe an Wänden hängen
  aus: { groesse: 1024, takt: 2, sonne: false, lampe: false, baeume: false },
});
/** Lichtquellen-Wahl → Licht-Budget des Profils (renderer.js LICHT_BUDGET) */
export const LICHTER_WAHL = Object.freeze({ viele: 'hoch', normal: 'mittel', wenige: 'niedrig' });
/** Bodentexturen-Wahl → Maßstab der Bodentextur (wie GRAFIK_PROFILE.*.texturen) */
export const TEXTUR_WAHL = Object.freeze({ hoch: 1, mittel: 0.6, niedrig: 0.4 });

/** Gültiger Wert für einen Regler (sonst sein Standard). Zahlen dürfen als Text kommen (dataset, JSON). */
export function pruefeDetail(name, wert) {
  const d = GRAFIK_DETAILS[name];
  if (!d) return undefined;
  for (const [w] of d.optionen) if (w === wert || (typeof w === 'number' && wert !== '' && wert !== null && Number(wert) === w)) return w;
  return d.standard;
}

export function standardDetails() {
  return Object.fromEntries(Object.entries(GRAFIK_DETAILS).map(([name, d]) => [name, d.standard]));
}

/** Gemerkte Details (unbekannte/ungültige Werte → Standard). `speicher` austauschbar für Tests. */
export function ladeGrafikDetails(speicher = globalThis.localStorage) {
  const details = standardDetails();
  try {
    const roh = JSON.parse(speicher?.getItem(GRAFIK_DETAILS_SCHLUESSEL) ?? 'null');
    if (roh && typeof roh === 'object') for (const name of Object.keys(details)) if (name in roh) details[name] = pruefeDetail(name, roh[name]);
    // Übernahme aus älteren Fassungen: FPS-Grenze stand nur in bs_maxfps (0 = unbegrenzt)
    if (!(roh && 'bildrate' in roh)) {
      const alt = speicher?.getItem(ALT_FPS_SCHLUESSEL);
      if (alt !== null && alt !== undefined) details.bildrate = pruefeDetail('bildrate', Number(alt));
    }
  } catch {
    // gesperrt/kaputt → Standard
  }
  return details;
}

export function speichereGrafikDetails(details, speicher = globalThis.localStorage) {
  try {
    speicher?.setItem(GRAFIK_DETAILS_SCHLUESSEL, JSON.stringify(details));
    speicher?.setItem(ALT_FPS_SCHLUESSEL, String(details.bildrate));
  } catch {
    // egal – gilt dann nur für diese Sitzung
  }
}

/** Profil gewählt → alle Bild-Details wieder „auto“ (Bildrate & Akku bleiben). @returns neues Objekt */
export function detailsFuerProfil(details) {
  const neu = { ...details };
  for (const [name, d] of Object.entries(GRAFIK_DETAILS)) if (d.bild) neu[name] = d.standard;
  return neu;
}

/** Anzahl fest eingestellter Bild-Details (für den Hinweis „… angepasst“) */
export function angepassteDetails(details) {
  return Object.entries(GRAFIK_DETAILS).filter(([name, d]) => d.bild && details[name] !== d.standard).length;
}

/**
 * Höchste Zeichen-Bildrate (0 = unbegrenzt) aus Einstellung + Lage: Akku sparen → AKKU_FPS; offenes Spielfenster oder Spiel nicht
 * im Vordergrund → RUHE_FPS. Die Spiellogik (fester Takt) läuft davon unabhängig weiter.
 */
export function bildrateGrenze(details, { amAkku = false, fensterOffen = false, imHintergrund = false } = {}) {
  let grenze = details?.bildrate ?? GRAFIK_DETAILS.bildrate.standard;
  const deckel = (wert) => (grenze > 0 ? Math.min(grenze, wert) : wert);
  if (details?.akku === 'immer' || (details?.akku === 'akku' && amAkku)) grenze = deckel(AKKU_FPS);
  if (fensterOffen || imHintergrund) grenze = deckel(RUHE_FPS);
  return grenze;
}

/**
 * Akku-Zustand live beobachten (Battery Status API – Chrome/Edge/Opera; andere Browser/Desktop-PCs gelten als „am Strom“).
 * @returns { amAkku } – wird bei jedem Ein-/Ausstecken aktualisiert
 */
export function beobachteAkku(umgebung = globalThis.navigator) {
  const zustand = { amAkku: false };
  try {
    umgebung?.getBattery?.()
      .then((akku) => {
        const pruefe = () => (zustand.amAkku = akku.charging === false);
        pruefe();
        akku.addEventListener?.('chargingchange', pruefe);
      })
      .catch(() => {});
  } catch {
    // keine API → am Strom
  }
  return zustand;
}

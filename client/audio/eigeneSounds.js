/**
 * Eigene Sounds: Ereignisliste + Parser für client/audio/eigene/ (siehe dortige README.md).
 * Reine Funktionen ohne DOM/Node – genutzt von werkzeuge/audio/indexieren.mjs (Index bauen),
 * tests/eigeneSounds.test.js und (nur EREIGNISSE-Namen) vom Client.
 */

/** Hauptgruppen (Reihenfolge = Audio-Zentrale/README). Musik + Karten-Klänge kommen nicht aus EREIGNISSE (Ordner/Karten). */
export const SOUND_GRUPPEN = Object.freeze(['Atmosphäre & Wetter', 'Tiere', 'Waffen & Kampf', 'Zombies', 'Fahrzeuge', 'Bauen, Handwerk & Arbeit', 'Inventar & Items', 'Oberfläche & Menüs']);

/**
 * Ereignis → [Gruppe, wann es ertönt, { loop?: Dauergeräusch (läuft als Schleife), stumm?: ohne eigene Datei kein Ton }].
 * Reihenfolge = Reihenfolge in README/Audio-Zentrale. Neue Sound-Ereignisse hier eintragen (+ Rezept in sound.js)!
 */
export const EREIGNISSE = {
  // Atmosphäre & Wetter (Schleifen, Bus „Wind & Regen“)
  wind: ['Atmosphäre & Wetter', 'Wind draußen (immer, Schleife; Regler „Wind & Regen“)', { loop: true }],
  regen: ['Atmosphäre & Wetter', 'Regen (Schleife, Lautstärke folgt der Regenstärke)', { loop: true }],
  nacht: ['Atmosphäre & Wetter', 'Nachtgeräusche – Grillen (Schleife, nur nachts)', { loop: true }],
  schritt_schnee: ['Atmosphäre & Wetter', 'Schritte im Schnee (Knirschen, jeder Tritt; Schneefall selbst ist lautlos)'],
  schritt_gras: ['Atmosphäre & Wetter', 'Schritte im Gras (jeder Tritt; 6 Aufnahmen, zufällig)'],
  donner: ['Atmosphäre & Wetter', 'Ferner Donner bei Gewitter (verzögert nach dem Blitz)'],
  donner_nah: ['Atmosphäre & Wetter', 'Naher Donnerschlag (Blitz ganz in der Nähe)', { stumm: true }],
  regen_stark: ['Atmosphäre & Wetter', 'Starkregen bei Gewitter (Schleife, zusätzlich zum Regen)', { loop: true, stumm: true }],
  wind_leicht: ['Atmosphäre & Wetter', 'Wind leicht – sanftes Rauschen draußen (Schleife, Stärke folgt Wind + Böen wie die Bäume)', { loop: true, stumm: true }],
  wind_stark: ['Atmosphäre & Wetter', 'Wind stark – kräftige Böen (Schleife, kommt bei starkem Wind/Böen dazu)', { loop: true, stumm: true }],
  schnurren: ['Tiere', 'Katze schnurrt (Schleife, wenn sie neben dir schläft)', { loop: true, stumm: true }],
  summen: ['Tiere', 'Bienen summen am Bienenstock (Schleife, nach Abstand)', { loop: true, stumm: true }],
  regen_dach: ['Atmosphäre & Wetter', 'Drinnen: Regen prasselt aufs Dach (Schleife)', { loop: true, stumm: true }],
  kamin: ['Atmosphäre & Wetter', 'Kaminfeuer knistert (Schleife, lauter je näher)', { loop: true, stumm: true }],
  generator: ['Bauen, Handwerk & Arbeit', 'Generator tuckert (Schleife, lauter je näher)', { loop: true, stumm: true }],
  sturm: ['Atmosphäre & Wetter', 'Sturm – starker, böiger Wind (Schleife; Wetter Sturm/Gewitter)', { loop: true, stumm: true }],
  schneesturm: ['Atmosphäre & Wetter', 'Schneesturm – heulender, kalter Wind (Schleife)', { loop: true, stumm: true }],
  tag: ['Atmosphäre & Wetter', 'Tag draußen – Vogelkulisse (Schleife, nur bei gutem Wetter, nicht in Schneezonen)', { loop: true, stumm: true }],
  nacht_wind: ['Atmosphäre & Wetter', 'Nacht – leises, unheimliches Pfeifen des Windes (Schleife)', { loop: true, stumm: true }],
  // Tiere
  hase_flucht: ['Tiere', 'Hase erschrickt und hoppelt davon'],
  vogel: ['Tiere', 'Vogelgezwitscher (tagsüber draußen, zufällig alle 8–25 s; nicht in Schneezonen)'],
  hase_tod: ['Tiere', 'Hase wird erlegt (ohne eigene Datei lautlos)', { stumm: true }],
  hase_schreck: ['Tiere', 'Hase erschrickt – kurzes Fiepen (ohne eigene Datei lautlos)', { stumm: true }],
  eule: ['Tiere', 'Eule ruft (nachts draußen, zufällig, fern)', { stumm: true }],
  heulen: ['Tiere', 'Fernes Heulen (Wolf/Hund, nachts, selten)', { stumm: true }],
  // Waffen & Kampf
  pistole: ['Waffen & Kampf', 'Pistolenschuss'],
  schrotflinte: ['Waffen & Kampf', 'Schrotflintenschuss'],
  automatikgewehr: ['Waffen & Kampf', 'Automatikgewehr-Schuss (Platzhalter, Waffe kommt später)'],
  leer: ['Waffen & Kampf', 'Klick: Magazin leer / nichts zu tun'],
  nachladen: ['Waffen & Kampf', 'Nachladen'],
  nahkampf: ['Waffen & Kampf', 'Schlag / Hieb in die Luft'],
  treffer_zombie: ['Waffen & Kampf', 'Zombie wird getroffen'],
  treffer_spieler: ['Waffen & Kampf', 'Spieler wird getroffen'],
  schaden_mann: ['Waffen & Kampf', 'Eigene Figur (Mann) nimmt Schaden – Aufschrei'],
  schaden_frau: ['Waffen & Kampf', 'Eigene Figur (Frau) nimmt Schaden – Aufschrei'],
  keuchen: ['Waffen & Kampf', 'Keuchen, wenn die Ausdauer leer ist (Mann)'],
  keuchen_frau: ['Waffen & Kampf', 'Keuchen, wenn die Ausdauer leer ist (Frau)', { stumm: true }],
  spieler_tod: ['Waffen & Kampf', 'Spieler stirbt (Mann)'],
  spieler_tod_frau: ['Waffen & Kampf', 'Spieler stirbt (Frau)', { stumm: true }],
  zittern: ['Waffen & Kampf', 'Frierender Atem bei Unterkühlung (zusammen mit „zaehneklappern“)', { stumm: true }],
  zaehneklappern: ['Waffen & Kampf', 'Zähneklappern bei Unterkühlung'],
  husten: ['Waffen & Kampf', 'Husten bei starker Kälte', { stumm: true }],
  anziehen: ['Inventar & Items', 'Kleidung an-/ausziehen', { stumm: true }],
  // Zombies
  zombie_stoehnen: ['Zombies', 'Zombie ruhend / schlurfend (Stöhnen, zufällig in der Nähe)'],
  zombie_angriff: ['Zombies', 'Zombie jagt / greift an'],
  zombie_tod: ['Zombies', 'Zombie stirbt'],
  bellen: ['Tiere', 'Hund bellt (Zombie in der Nähe oder gerade gezähmt)', { stumm: true }],
  miau: ['Tiere', 'Katze maunzt', { stumm: true }],
  gackern: ['Tiere', 'Huhn gackert', { stumm: true }],
  zombie_schrei: ['Zombies', 'Zombie entdeckt dich – Schrei/Brüllen (räumlich)', { stumm: true }],
  spucke: ['Zombies', 'Spucker spuckt Säure (Gurgeln)', { stumm: true }],
  spucke_trifft: ['Zombies', 'Säure klatscht auf den Boden', { stumm: true }],
  zuendung: ['Zombies', 'Explosiv-Zombie zündet – Zischen der Lunte', { stumm: true }],
  gewehr: ['Waffen & Kampf', 'Schuss Jagdgewehr (laut, hallt)', { stumm: true }],
  bogen: ['Waffen & Kampf', 'Bogen – Pfeil schwirrt los (leise)', { stumm: true }],
  armbrust: ['Waffen & Kampf', 'Armbrust – Sehne schnellt (leise)', { stumm: true }],
  schuss_leise: ['Waffen & Kampf', 'Schuss mit Schalldämpfer', { stumm: true }],
  nachladen_gewehr: ['Waffen & Kampf', 'Gewehr nachladen (Repetieren)', { stumm: true }],
  molotow: ['Waffen & Kampf', 'Molotowcocktail zerspringt und entflammt', { stumm: true }],
  brand: ['Waffen & Kampf', 'Brennende Fläche (Molotow) – Fauchen', { stumm: true }],
  dosenalarm: ['Bauen, Handwerk & Arbeit', 'Dosenalarm klappert (Zombie an der Basis)', { stumm: true }],
  grube: ['Bauen, Handwerk & Arbeit', 'Zombie fällt in die Fallgrube', { stumm: true }],
  explosion: ['Waffen & Kampf', 'Explosion (Explosiv-Zombie, später Granaten/Sprengfallen)', { stumm: true }],
  treffer_panzer: ['Zombies', 'Treffer auf einen gepanzerten Zombie (Metall)', { stumm: true }],
  zombie_ferne: ['Zombies', 'Fernes Zombie-Stöhnen in der Nacht (Horror-Kulisse)', { stumm: true }],
  tuer_schlag: ['Zombies', 'Zombie schlägt auf Tür'],
  tuer_bricht: ['Zombies', 'Tür bricht auf'],
  // Fahrzeuge
  motor: ['Fahrzeuge', 'Motor beim Fahren (Schleife, Tonhöhe folgt dem Tempo)', { loop: true }],
  autotuer: ['Fahrzeuge', 'Ein-/Aussteigen'],
  aufprall: ['Fahrzeuge', 'Auto kracht gegen Hindernis'],
  fahrzeug_schaden: ['Fahrzeuge', 'Auto nimmt Schaden'],
  fahrzeug_kaputt: ['Fahrzeuge', 'Auto geht kaputt (Explosion/Blech)'],
  ueberfahren: ['Fahrzeuge', 'Zombie/Tier wird überfahren (matschig)', { stumm: true }],
  // Bauen, Handwerk & Arbeit
  hack_holz: ['Bauen, Handwerk & Arbeit', 'Axt trifft Baum (jeder Hieb)'],
  baum_faellt: ['Bauen, Handwerk & Arbeit', 'Baum fällt um (Holzfällen fertig)'],
  hack_stein: ['Bauen, Handwerk & Arbeit', 'Spitzhacke trifft Eisenerz'],
  stein_bricht: ['Bauen, Handwerk & Arbeit', 'Eisenerz ist abgebaut'],
  hack_felsen: ['Bauen, Handwerk & Arbeit', 'Spitzhacke trifft Fels/Stein'],
  felsen_bricht: ['Bauen, Handwerk & Arbeit', 'Fels/Stein ist abgebaut'],
  gebaut: ['Bauen, Handwerk & Arbeit', 'Bauwerk platziert'],
  werkeln: ['Bauen, Handwerk & Arbeit', 'Herstellen / Basteln / Reparieren'],
  graben: ['Bauen, Handwerk & Arbeit', 'Beet anlegen / Hacke / Rasen abtragen'],
  tuer_auf: ['Bauen, Handwerk & Arbeit', 'Tür öffnen'],
  tuer_zu: ['Bauen, Handwerk & Arbeit', 'Tür schließen'],
  feuer_an: ['Bauen, Handwerk & Arbeit', 'Lagerfeuer anzünden'],
  feuer_aus: ['Bauen, Handwerk & Arbeit', 'Lagerfeuer erlischt'],
  knistern: ['Bauen, Handwerk & Arbeit', 'Feuer knistert in der Nähe (zufällig)'],
  holz_nachlegen: ['Bauen, Handwerk & Arbeit', 'Holz ins Feuer legen'],
  brutzel: ['Bauen, Handwerk & Arbeit', 'Essen wird gekocht (Start)'],
  brutzeln: ['Bauen, Handwerk & Arbeit', 'Essen brutzelt (Dauergeräusch am Feuer)'],
  fertig: ['Bauen, Handwerk & Arbeit', 'Essen ist gar'],
  verbrannt: ['Bauen, Handwerk & Arbeit', 'Essen ist verkohlt'],
  angel_wurf: ['Bauen, Handwerk & Arbeit', 'Angel auswerfen'],
  angel_biss: ['Bauen, Handwerk & Arbeit', 'Fisch beißt an'],
  gefangen: ['Bauen, Handwerk & Arbeit', 'Fisch gefangen'],
  falle_auf: ['Bauen, Handwerk & Arbeit', 'Falle gespannt'],
  falle_zu: ['Bauen, Handwerk & Arbeit', 'Falle schnappt zu'],
  // Inventar & Items
  aufheben: ['Inventar & Items', 'Item aufheben (leises Rascheln)'],
  beute: ['Inventar & Items', 'Beute / Kiste durchsucht'],
  essen: ['Inventar & Items', 'Essen'],
  trinken: ['Inventar & Items', 'Trinken'],
  magen_knurren: ['Inventar & Items', 'Magenknurren bei großem Hunger (unter 20 %, zufällig)'],
  durst: ['Inventar & Items', 'Trockenes Räuspern/Schlucken bei großem Durst (unter 20 %, zufällig)'],
  heilen: ['Inventar & Items', 'Heilen (Verband/Medizin)'],
  taschenlampe: ['Inventar & Items', 'Taschenlampe an/aus (L)'],
  inventar_auf: ['Inventar & Items', 'Inventar öffnen (Tab)'],
  inventar_zu: ['Inventar & Items', 'Inventar schließen'],
  // Oberfläche & Menüs
  ui_klick: ['Oberfläche & Menüs', 'Klick auf einen Knopf (Login, Menüs, HUD)'],
  ui_fehler: ['Oberfläche & Menüs', 'Geht hier nicht (z. B. Bauen an falscher Stelle)'],
  level_auf: ['Oberfläche & Menüs', 'Level-Aufstieg'],
};

/** Dauergeräusche (Schleifen) */
export const LOOP_EREIGNISSE = Object.freeze(Object.keys(EREIGNISSE).filter((n) => EREIGNISSE[n][2]?.loop));

export const ENDUNGEN = ['ogg', 'mp3', 'wav', 'm4a', 'webm', 'opus', 'flac'];
const DATEI = new RegExp(`^(.+?)(?:_(\\d+))?\\.(${ENDUNGEN.join('|')})$`, 'i');

/** "holz_faellen_2.ogg" → { ereignis: 'holz_faellen', nummer: 2 }; null wenn keine Audiodatei. */
export function parseDateiname(datei) {
  const m = DATEI.exec(datei);
  if (!m) return null;
  return { ereignis: m[1].toLowerCase(), nummer: m[2] === undefined ? 0 : Number(m[2]) };
}

/** Text "name zahl" (# = Kommentar) → { name: zahl }. Fehlerhafte Zeilen landen in warnungen. */
export function parseLautstaerke(text, warnungen = []) {
  const ergebnis = {};
  text.split(/\r?\n/).forEach((zeile, i) => {
    const s = zeile.replace(/#.*/, '').trim();
    if (!s) return;
    const teile = s.split(/[\s=:]+/);
    const zahl = Number(String(teile[1] ?? '').replace(',', '.').replace('%', ''));
    if (teile.length !== 2 || !Number.isFinite(zahl) || zahl < 0) {
      warnungen.push(`lautstaerke.txt Zeile ${i + 1}: "${zeile.trim()}" – erwartet "ereignis zahl" (0–100, darüber verstärkt)`);
      return;
    }
    ergebnis[teile[0].toLowerCase()] = Math.min(zahl, 300);
  });
  return ergebnis;
}

/** Grenzen der Einstellungen je Ereignis (einstellungen.json, Audio-Zentrale) */
export const PEGEL_MAX = 3;
export const STREUUNG_MAX = 0.5;
export const VERZOEGERUNG_MAX = 5; // s, Ton setzt später ein als die Animation
export const MAX_DAUER_MAX = 120; // s, Ton wird nach so langer Zeit abgeschnitten (0 = nie)

/**
 * einstellungen.json säubern: { ereignis: { lautstaerke: 0..3 (Faktor), streuung: 0..0.5 (± Tonhöhe), verzoegerung: 0..5 s, maxDauer: 0..120 s, einmal: bool (läuft noch → nicht neu starten), loop: bool } }.
 * Unbrauchbare Werte fliegen raus (Warnung).
 */
export function pruefeSoundEinstellungen(roh, warnungen = []) {
  const aus = {};
  if (!roh || typeof roh !== 'object' || Array.isArray(roh)) return aus;
  for (const [name, e] of Object.entries(roh)) {
    if (!/^[a-z0-9_]{1,40}$/.test(name) || !e || typeof e !== 'object') {
      warnungen.push(`einstellungen.json: Eintrag "${name}" ignoriert`);
      continue;
    }
    const r = {};
    if (Number.isFinite(e.lautstaerke) && e.lautstaerke >= 0) r.lautstaerke = Math.min(PEGEL_MAX, e.lautstaerke);
    if (Number.isFinite(e.streuung) && e.streuung > 0) r.streuung = Math.min(STREUUNG_MAX, e.streuung);
    if (Number.isFinite(e.verzoegerung) && e.verzoegerung > 0) r.verzoegerung = Math.min(VERZOEGERUNG_MAX, e.verzoegerung);
    if (Number.isFinite(e.maxDauer) && e.maxDauer > 0) r.maxDauer = Math.min(MAX_DAUER_MAX, e.maxDauer);
    if (e.einmal === true) r.einmal = true;
    if (e.dateiPegel && typeof e.dateiPegel === 'object' && !Array.isArray(e.dateiPegel)) {
      const dp = {};
      for (const [datei, w] of Object.entries(e.dateiPegel)) if (/^[\w. -]{1,80}$/.test(datei) && Number.isFinite(w) && w >= 0 && Math.abs(w - 1) > 0.001) dp[datei] = Math.min(PEGEL_MAX, w);
      if (Object.keys(dp).length) r.dateiPegel = dp; // Pegel je einzelner Datei (Variante), 1 = unverändert
    }
    if (typeof e.loop === 'boolean') r.loop = e.loop;
    if (Object.keys(r).length) aus[name] = r;
  }
  return aus;
}

/**
 * Baut den Index für den Client: { ereignis: { dateien: [...], lautstaerke: 0..3, streuung?, loop? } }.
 * Nur Ereignisse mit eigenen Dateien ODER eigenen Einstellungen tauchen auf. `einstellungen` (einstellungen.json,
 * schreibt die Audio-Zentrale) hat Vorrang vor lautstaerke.txt.
 * Unbekannte Namen → Warnung (Tippfehler!), werden aber trotzdem aufgenommen.
 */
export function baueIndex(dateinamen, lautstaerkeText = '', einstellungen = {}) {
  const warnungen = [];
  const index = {};
  const eintrag = (name) => (index[name] ??= { dateien: [], lautstaerke: 1 });
  for (const datei of [...dateinamen].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))) {
    const p = parseDateiname(datei);
    if (!p) continue;
    eintrag(p.ereignis).dateien.push(datei);
  }
  for (const [name, wert] of Object.entries(parseLautstaerke(lautstaerkeText, warnungen))) {
    eintrag(name).lautstaerke = wert / 100;
  }
  for (const [name, e] of Object.entries(pruefeSoundEinstellungen(einstellungen, warnungen))) {
    Object.assign(eintrag(name), e);
  }
  for (const name of Object.keys(index)) {
    if (!(name in EREIGNISSE)) warnungen.push(`Unbekanntes Ereignis "${name}" – Tippfehler? (Liste: eigene/README.md)`);
  }
  return { index, warnungen };
}

/** README-Tabelle der Ereignisse (Markdown), gruppiert. */
export function ereignisTabelle() {
  const zeilen = [];
  let gruppe = null;
  for (const [name, [g, text]] of Object.entries(EREIGNISSE)) {
    if (g !== gruppe) {
      gruppe = g;
      zeilen.push('', `### ${g}`, '', '| Dateiname (ohne Endung) | Wann? |', '|---|---|');
    }
    zeilen.push(`| \`${name}\` | ${text} |`);
  }
  return zeilen.join('\n');
}

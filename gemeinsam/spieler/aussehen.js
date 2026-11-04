/**
 * Aussehen der Spielfigur – Charaktererstellung (Hauptmenü → Neuer Spielstand, client/ui/charakterErstellung.js).
 *
 * Jedes Merkmal hat Optionen und einen Standard. `aktiv: false` = vorgesehen, aber noch ohne Grafik (nicht im Editor).
 * Kleidungs-Optionen (oberteil/hose/schuhe) tragen `form` + `farbe`: Die Darstellung baut daraus eine echte Kleidungs-
 * schicht über dem Körper (client/darstellung/kleidungModell.js). `form: null` = Original-Outfit des Modells.
 * Getragene Kleidungs-Items (Inventar → Kleidung) liegen darüber bzw. ersetzen die Grundkleidung an ihrer Stelle.
 *
 * Gespeichert im Spielstand (spieler.aussehen), mitgeschickt beim Login (ANMELDEN.aussehen), öffentlich im
 * Schnappschuss (kompakt: nur Abweichungen vom Standard) → alle sehen die gewählte Figur.
 */
export const AUSSEHEN = Object.freeze({
  koerper: {
    name: 'Geschlecht',
    aktiv: true,
    standard: 'mann',
    optionen: { mann: { name: 'Männlich', skin: 'humanMaleA' }, frau: { name: 'Weiblich', skin: 'humanFemaleA' } },
  },
  // Runde 32: Figur-Modell („Characters_ Extras“, Elbolilloduro, CC-BY; gerigged auf das Skelett der Spielfigur,
  // client/assets/3d/figuren/<id>.glb). `koerper` = passendes Geschlecht. Bei einer eigenen Figur gelten Frisur/Kleidung des Modells.
  figur: {
    name: 'Figur',
    aktiv: true,
    standard: 'standard',
    optionen: {
      standard: { name: 'Abenteurer' },
      ...Object.fromEntries([33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45].map((n, i) => [`mann_${n}`, { name: `Mann ${i + 1}`, koerper: 'mann' }])),
      sheriff: { name: 'Sheriff', koerper: 'mann' },
      sheriff_b: { name: 'Sheriff 2', koerper: 'mann' },
      ...Object.fromEntries([34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46].map((n, i) => [`frau_${n}`, { name: `Frau ${i + 1}`, koerper: 'frau' }])),
    },
  },
  haare: {
    name: 'Frisur',
    aktiv: true,
    standard: 'standard',
    optionen: {
      standard: { name: 'Klassisch', form: 'standard' },
      kurz: { name: 'Kurz', form: 'kurz' },
      lang: { name: 'Lang', form: 'lang' },
      zopf: { name: 'Zopf', form: 'zopf' },
      glatze: { name: 'Glatze', form: 'glatze' },
    },
  },
  haarfarbe: {
    name: 'Haarfarbe',
    aktiv: true,
    standard: 'natur',
    optionen: {
      natur: { name: 'Natur', farbe: null },
      schwarz: { name: 'Schwarz', farbe: '#211c19' },
      braun: { name: 'Braun', farbe: '#5b3a22' },
      blond: { name: 'Blond', farbe: '#c7a15c' },
      rot: { name: 'Rot', farbe: '#8c3a1d' },
      grau: { name: 'Grau', farbe: '#9a9a96' },
    },
  },
  oberteil: {
    name: 'Oberteil',
    aktiv: true,
    standard: 'standard',
    optionen: {
      standard: { name: 'Original', form: null },
      hoodie_grau: { name: 'Hoodie Grau', form: 'hoodie', farbe: '#5d6066' },
      hoodie_schwarz: { name: 'Hoodie Schwarz', form: 'hoodie', farbe: '#222326' },
      hoodie_oliv: { name: 'Hoodie Oliv', form: 'hoodie', farbe: '#4f5737' },
      hoodie_rot: { name: 'Hoodie Rot', form: 'hoodie', farbe: '#7c2a26' },
      shirt_weiss: { name: 'T-Shirt Weiß', form: 'shirt', farbe: '#d9d6cf' },
    },
  },
  hose: {
    name: 'Hose',
    aktiv: true,
    standard: 'standard',
    optionen: {
      standard: { name: 'Original', form: null },
      jeans: { name: 'Jeans', form: 'hose', farbe: '#3b4c72' },
      cargo: { name: 'Cargo', form: 'hose', farbe: '#7a6a4c' },
      jogger: { name: 'Jogginghose', form: 'hose', farbe: '#2a2b2f' },
    },
  },
  schuhe: {
    name: 'Schuhe',
    aktiv: true,
    standard: 'standard',
    optionen: {
      standard: { name: 'Original', form: null },
      sneaker: { name: 'Sneaker', form: 'schuh', farbe: '#e1e1dc' },
      stiefel: { name: 'Stiefel', form: 'stiefel', farbe: '#4e3420' },
      schwarz: { name: 'Schwarze Schuhe', form: 'schuh', farbe: '#1d1d20' },
    },
  },
  gesicht: { name: 'Gesicht', aktiv: false, standard: 'standard', optionen: { standard: { name: 'Standard' } } },
  hautfarbe: { name: 'Hautfarbe', aktiv: false, standard: 'standard', optionen: { standard: { name: 'Standard' } } },
});

/** Reihenfolge/Gruppen im Charakter-Editor (Haarfarbe hängt unter „Frisur“). */
export const AUSSEHEN_GRUPPEN = Object.freeze([
  { titel: 'Geschlecht', merkmale: ['koerper'] },
  { titel: 'Figur', merkmale: ['figur'] },
  { titel: 'Haare', merkmale: ['haare', 'haarfarbe'] },
  { titel: 'Oberteil', merkmale: ['oberteil'] },
  { titel: 'Hose', merkmale: ['hose'] },
  { titel: 'Schuhe', merkmale: ['schuhe'] },
]);

/** Ungültiges/Unbekanntes wird durch den Standard ersetzt – Ergebnis ist immer vollständig. */
export function pruefeAussehen(roh) {
  const aussehen = {};
  for (const [merkmal, def] of Object.entries(AUSSEHEN)) {
    const wert = roh?.[merkmal];
    aussehen[merkmal] = typeof wert === 'string' && Object.hasOwn(def.optionen, wert) ? wert : def.standard;
  }
  // Runde 32: Figur muss zum Geschlecht passen
  const figur = AUSSEHEN.figur.optionen[aussehen.figur];
  if (figur.koerper && figur.koerper !== aussehen.koerper) aussehen.figur = AUSSEHEN.figur.standard;
  return aussehen;
}

/** Fürs Netz: nur was vom Standard abweicht ({} = Standardfigur); pruefeAussehen() macht daraus wieder alles. */
export function aussehenKompakt(aussehen) {
  const kurz = {};
  for (const [merkmal, def] of Object.entries(AUSSEHEN)) if (aussehen?.[merkmal] && aussehen[merkmal] !== def.standard) kurz[merkmal] = aussehen[merkmal];
  return kurz;
}

/** Welcher Skin (Textur) für dieses Aussehen? Fehlende Merkmale = Standard. */
export function skinFuer(aussehen) {
  return AUSSEHEN.koerper.optionen[aussehen?.koerper]?.skin ?? AUSSEHEN.koerper.optionen.mann.skin;
}

/** Option eines Merkmals (Standard bei fehlendem/ungültigem Wert). */
export function aussehenOption(aussehen, merkmal) {
  const def = AUSSEHEN[merkmal];
  return def.optionen[aussehen?.[merkmal]] ?? def.optionen[def.standard];
}

/** Charaktername: 2–20 Zeichen, Buchstaben (auch Umlaute), Ziffern, _ und - (wie Benutzernamen). */
export const CHARAKTERNAME_MUSTER = /^[A-Za-z0-9_\-äöüÄÖÜß]{2,20}$/;

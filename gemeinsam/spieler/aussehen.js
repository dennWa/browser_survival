/**
 * Aussehen der Spielfigur – Grundgerüst für die Charaktererstellung.
 *
 * Jedes Merkmal hat Optionen und einen Standard. `aktiv: false` = schon vorgesehen, aber noch ohne Grafik
 * (taucht im Auswahlbildschirm noch nicht auf). Später ausbauen:
 *   haare / gesicht → eigene Meshes bzw. Texturen pro Option (client/darstellung/renderer.js → #figurMaterial)
 *   hautfarbe / kleidung → Textur-Varianten (Skin-Bilder in werkzeuge/assets/baue_assets.py)
 *
 * Gespeichert im Spielstand (spieler.aussehen), mitgeschickt beim Login (ANMELDEN.aussehen), öffentlich im
 * Schnappschuss → alle sehen die gewählte Figur.
 */
export const AUSSEHEN = Object.freeze({
  koerper: {
    name: 'Figur',
    aktiv: true,
    standard: 'mann',
    optionen: { mann: { name: 'Mann', symbol: '👨', skin: 'humanMaleA' }, frau: { name: 'Frau', symbol: '👩', skin: 'humanFemaleA' } },
  },
  haare: { name: 'Frisur', aktiv: false, standard: 'standard', optionen: { standard: { name: 'Standard' } } },
  gesicht: { name: 'Gesicht', aktiv: false, standard: 'standard', optionen: { standard: { name: 'Standard' } } },
  hautfarbe: { name: 'Hautfarbe', aktiv: false, standard: 'standard', optionen: { standard: { name: 'Standard' } } },
  kleidung: { name: 'Kleidung', aktiv: false, standard: 'standard', optionen: { standard: { name: 'Standard' } } },
});

/** Ungültiges/Unbekanntes wird durch den Standard ersetzt – Ergebnis ist immer vollständig. */
export function pruefeAussehen(roh) {
  const aussehen = {};
  for (const [merkmal, def] of Object.entries(AUSSEHEN)) {
    const wert = roh?.[merkmal];
    aussehen[merkmal] = typeof wert === 'string' && Object.hasOwn(def.optionen, wert) ? wert : def.standard;
  }
  return aussehen;
}

/** Welcher Skin (Textur) für dieses Aussehen? */
export function skinFuer(aussehen) {
  return AUSSEHEN.koerper.optionen[aussehen?.koerper]?.skin ?? AUSSEHEN.koerper.optionen.mann.skin;
}

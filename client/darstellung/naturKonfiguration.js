/**
 * Natur-Streuung: Welche 3D-Modelle (Gras, später Pflanzen/Bäume) auf welchem Untergrund der Karte verteilt werden.
 * Gelesen von naturModell.js. Rein Daten – hier nur Zahlen/Namen ändern.
 *
 * NEUES MODELL EINBINDEN
 *   1. .glb nach werkzeuge/assets/quellen/natur/<name>.glb legen (Ursprung am Boden, +y nach oben, eine Textur/Palette)
 *   2. `npm run assets:3d` (kopiert nach client/assets/3d/natur/ und schreibt natur.json)
 *   3. unten in STREUUNG unter dem Untergrund (Kachelname aus gemeinsam/welt/kacheln.js, z. B. 'gras') einen Eintrag ergänzen:
 *        { art: '<name>', proKachel: 0.4, hoehe: [14, 20] }
 *      art        Modellname (Dateiname ohne .glb)
 *      proKachel  mittlere Anzahl Büschel je Kachel (0,4 = alle 2,5 Kacheln eins; >1 = mehrere)
 *      hoehe      [min, max] Höhe in Weltpixeln (Figur = 64 px, Kachel = 32 px)
 *      farbe      optional [min, max] Helligkeitsfaktor je Büschel (Standard 0,85–1,15)
 *      wind       optional Schwankungsstärke 0–1 (Standard 1)
 *   4. Karte aktivieren: ZONEN unten.
 *
 * Mehr Pflanzen auf bestehende Karten bringen = nur Einträge hier; Bäume/Büsche mit eigener Logik (abbaubar) bleiben in baumModell.js.
 */

/** Verteilung je Untergrund (Kachelname) */
export const STREUUNG = {
  gras: [
    { art: 'gras', proKachel: 1.1, hoehe: [12, 20] },
    { art: 'gras_wispy_a', proKachel: 0.22, hoehe: [14, 22] },
    { art: 'gras_wispy_b', proKachel: 0.22, hoehe: [13, 20] },
    { art: 'gras_hoch', proKachel: 0.28, hoehe: [20, 29], farbe: [0.8, 1.05] },
  ],
};

/** Karten-ID → Streuung an/aus (Karten ohne Eintrag bleiben wie gehabt). `true` = STREUUNG, oder eigene Liste je Untergrund. */
export const ZONEN = {
  stadtrand: true,
};

/** Nur Büschel innerhalb dieses Abstands (px) um die Kamera werden gezeichnet (Dreiecke sparen) */
export const NATUR_SICHTWEITE = 700;
/** Handys zeichnen nur diesen Anteil der Büschel */
export const HANDY_DICHTE = 0.5;
/** Kantenlänge (Kacheln) der Blöcke fürs Sichtweiten-/Frustum-Culling */
export const NATUR_BLOCK = 8;

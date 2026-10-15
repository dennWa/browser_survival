/**
 * Balancing & Server-Einstellungen (Standardwerte).
 *
 * Der Node-Server überschreibt diese Werte mit server/daten/einstellungen.json
 * (nur die Felder, die dort stehen). So kann der Server-Admin Schaden, Loot,
 * Aggro-Radius usw. anpassen, ohne Code zu ändern.
 */
export const STANDARD_KONFIGURATION = Object.freeze({
  server: {
    name: 'Browser Survival Server',
    maxSpieler: 32,
    loginTimeoutMs: 20000,
    /** Startwert des Zufallsgenerators (gleicher Wert = gleiche Loot-Verteilung). null = zufällig */
    zufallsStartwert: null,
  },
  welt: {
    karte: 'krankenhaus',
  },
  spieler: {
    geschwindigkeit: 150, // Pixel pro Sekunde
    radius: 12,
    leben: 100,
  },
  zombie: {
    geschwindigkeit: 70,
    radius: 13,
    leben: 60,
    aggroRadius: 220, // ab dieser Entfernung (px) wird der Spieler bemerkt
    angriffsReichweite: 30,
    angriffsSchaden: 10,
    angriffsAbklingzeit: 1.0, // Sekunden zwischen zwei Angriffen
  },
  loot: {
    /** Wahrscheinlichkeit, dass an einem Loot-Punkt beim Start ein Gegenstand liegt (0..1) */
    spawnChance: 0.7,
  },
});

/** Tiefes Zusammenführen: überschreibt nur vorhandene Felder, unbekannte Felder werden ignoriert. */
export function erstelleKonfiguration(ueberschreibungen = {}) {
  return verschmelze(STANDARD_KONFIGURATION, ueberschreibungen);
}

function verschmelze(basis, extra) {
  const ergebnis = {};
  for (const [schluessel, wert] of Object.entries(basis)) {
    const neu = extra?.[schluessel];
    if (wert !== null && typeof wert === 'object' && !Array.isArray(wert)) {
      ergebnis[schluessel] = verschmelze(wert, neu);
    } else {
      ergebnis[schluessel] = neu !== undefined ? neu : wert;
    }
  }
  return ergebnis;
}

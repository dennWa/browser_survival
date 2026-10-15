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
    hungerProMinute: 4, // Sättigung 100 → 0 in 25 min
    durstProMinute: 6, // 100 → 0 in ~17 min
    hungerSchadenProSekunde: 0.5, // Schaden, wenn Hunger ODER Durst bei 0
    regenerationProSekunde: 0.25, // Heilung, wenn satt und getränkt
    regenerationAb: 70, // ab diesem Hunger- UND Durstwert
    respawnZeit: 6, // Sekunden bis zur Wiederbelebung
    startHunger: 85,
    startDurst: 85,
  },
  zombie: {
    geschwindigkeit: 70, // ruhend/schlurfend
    jagdGeschwindigkeit: 105, // beim Verfolgen (Spieler: 150 → man kann entkommen)
    radius: 13,
    leben: 60,
    aggroRadius: 260, // ab dieser Entfernung (px) wird ein sichtbarer Spieler bemerkt
    verlierRadius: 520, // weiter weg → Zombie gibt auf
    hoerRadius: 480, // Schüsse in diesem Umkreis locken Zombies an
    angriffsReichweite: 30,
    angriffsSchaden: 12,
    angriffsAbklingzeit: 1.0, // Sekunden zwischen zwei Angriffen
    respawnZeit: 90, // Sekunden bis ein getöteter Zombie nachkommt
    respawnMindestAbstand: 360, // nicht respawnen, wenn ein Spieler so nah am Spawnpunkt ist
    lootChance: 0.25, // Wahrscheinlichkeit, dass ein toter Zombie etwas fallen lässt
    pfadIntervall: 0.5, // Sekunden zwischen Neuberechnungen des Weges
  },
  kampf: {
    pvp: false, // Spieler können sich gegenseitig verletzen
    rueckstoss: 7, // px, die ein getroffener Zombie zurückgestoßen wird
  },
  loot: {
    /** Wahrscheinlichkeit, dass an einem Loot-Punkt ein Gegenstand liegt (0..1) */
    spawnChance: 0.7,
    /** Sekunden, bis an einem geplünderten Loot-Punkt neu gewürfelt wird */
    respawnZeit: 300,
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

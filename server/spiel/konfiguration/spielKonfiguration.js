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
    sprintFaktor: 1.6, // Sprint = 1,6 × Gehgeschwindigkeit
    ausdauerMax: 100,
    ausdauerVerbrauch: 22, // pro Sekunde Sprint (≈ 4,5 s am Stück)
    ausdauerRegeneration: 14, // pro Sekunde ohne Sprint
    sprintMinimum: 25, // nach völliger Erschöpfung erst ab diesem Wert wieder sprinten
    sprintHoerRadius: 150, // Rennen ist laut: Zombies in diesem Umkreis hören es
  },
  zombie: {
    geschwindigkeit: 70, // Grundtempo (Umherschlurfen = halbes Grundtempo)
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
    wanderRadius: 150, // so weit schlurfen ruhende Zombies von ihrem Spawnpunkt weg
    /**
     * Zombie-Typen: überschreiben die Grundwerte oben. gewicht = Häufigkeit beim Spawnen.
     * groesse = nur Optik (Sprite-Skalierung). radius ≤ 15, sonst passen sie nicht durch 1 Kachel breite Lücken.
     */
    varianten: {
      normal: { gewicht: 6 },
      laeufer: { gewicht: 2, leben: 35, jagdGeschwindigkeit: 140, angriffsSchaden: 8, angriffsAbklingzeit: 0.7, groesse: 0.92 },
      brocken: { gewicht: 1, leben: 180, jagdGeschwindigkeit: 78, angriffsSchaden: 25, angriffsAbklingzeit: 1.5, radius: 15, groesse: 1.3, rueckstossFaktor: 0.2 },
    },
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

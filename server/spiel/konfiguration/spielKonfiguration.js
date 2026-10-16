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
    autosaveSekunden: 30, // Spielstände regelmäßig sichern (zusätzlich beim Logout/Stopp)
    gaeste: true, // "Als Gast spielen" erlaubt (Name Gast-1234, ohne Passwort, nie Admin) – Node-Server: GAESTE=0 schaltet ab
    /** Startwert des Zufallsgenerators (gleicher Wert = gleiche Loot-Verteilung). null = zufällig */
    zufallsStartwert: null,
  },
  welt: {
    karte: 'stadtrand',
    tuerenGeschlossen: true, // Start: alle Türen zu (man öffnet sie selbst)
    tuerLeben: 120, // so viel Schaden hält eine geschlossene Tür aus, bevor Zombies sie aufbrechen
    tuerVerstaerkung: 150, // + Lebenspunkte pro Bretter-Verstärkung (höchstens 4× tuerLeben)
    tagSekunden: 600, // Tag (06:00–21:00) dauert 10 Minuten …
    nachtSekunden: 300, // … die Nacht (21:00–06:00) 5 Minuten
    startZeit: 30, // Sekunden nach Tagesbeginn beim Serverstart (kurz nach Sonnenaufgang)
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
    todesZombieRadius: 480, // px: beim Tod verschwinden alle Zombies in diesem Umkreis (kommen später regulär wieder)
    startHunger: 85,
    startDurst: 85,
    sprintFaktor: 1.6, // Sprint = 1,6 × Gehgeschwindigkeit
    ausdauerMax: 100,
    ausdauerVerbrauch: 22, // pro Sekunde Sprint (≈ 4,5 s am Stück)
    ausdauerRegeneration: 14, // pro Sekunde ohne Sprint
    sprintMinimum: 25, // nach völliger Erschöpfung erst ab diesem Wert wieder sprinten
    sprintHoerRadius: 150, // Rennen ist laut: Zombies in diesem Umkreis hören es
    /** Bekommt jeder neue Spieler (und nach dem Tod wieder). magazin = Schuss in der Waffe; ausgeruestet = in der Hand */
    startInventar: [
      { defId: 'pistole', menge: 1, magazin: 15, ausgeruestet: true },
      { defId: 'axt', menge: 1 },
      { defId: 'spitzhacke', menge: 1 },
      { defId: 'angel', menge: 1 },
    ],
  },
  zombie: {
    geschwindigkeit: 60, // Grundtempo (Umherschlurfen = knapp halbes Grundtempo)
    jagdGeschwindigkeit: 85, // beim Verfolgen (Spieler: 150 → man kann entkommen)
    radius: 13,
    leben: 60,
    aggroRadius: 240, // ab dieser Entfernung (px) wird ein sichtbarer Spieler bemerkt
    dunkelFaktor: 0.45, // Nachts mit Taschenlampe aus → Spieler wird erst ab aggroRadius × dunkelFaktor bemerkt
    nachtLichtFaktor: 1.2, // Nachts mit Taschenlampe an → leuchtet wie ein Leuchtturm
    nachtTempoFaktor: 1.2, // nachts jagen Zombies schneller
    nachtHorde: 8, // zusätzliche Zombies, die bei Einbruch der Nacht auftauchen (verschwinden morgens)
    verlierRadius: 520, // weiter weg → Zombie gibt auf
    hoerRadius: 480, // Schüsse in diesem Umkreis locken Zombies an
    angriffsReichweite: 30,
    angriffsSchaden: 12,
    angriffsAbklingzeit: 1.0, // Sekunden zwischen zwei Angriffen
    respawnZeit: 120, // Sekunden bis ein getöteter Zombie nachkommt
    respawnMindestAbstand: 360, // nicht respawnen, wenn ein Spieler so nah am Spawnpunkt ist
    lootChance: 0.25, // Wahrscheinlichkeit, dass ein toter Zombie etwas fallen lässt
    pfadIntervall: 0.5, // Sekunden zwischen Neuberechnungen des Weges
    wanderRadius: 150, // so weit schlurfen ruhende Zombies von ihrem Spawnpunkt weg
    /**
     * Zombie-Typen: überschreiben die Grundwerte oben. gewicht = Häufigkeit beim Spawnen.
     * groesse = nur Optik (Sprite-Skalierung). radius ≤ 15, sonst passen sie nicht durch 1 Kachel breite Lücken.
     */
    varianten: {
      normal: { gewicht: 6, xp: 10 },
      laeufer: { gewicht: 2, xp: 12, leben: 35, jagdGeschwindigkeit: 115, angriffsSchaden: 8, angriffsAbklingzeit: 0.7, groesse: 0.92 },
      // Boss (große Zombies): halten viel aus, teilen mehr aus; waffenChance = Wahrscheinlichkeit auf Waffe + Munition
      brocken: { gewicht: 1, xp: 40, leben: 420, jagdGeschwindigkeit: 62, angriffsSchaden: 40, angriffsAbklingzeit: 1.5, radius: 15, groesse: 1.3, rueckstossFaktor: 0.15, waffenChance: 0.5 },
    },
  },
  /** Autos: so viele Zombie-Schläge halten sie aus (ein normaler Zombie = 1 Schlag, Boss mehr); Überfahren kostet nur wenig. */
  fahrzeug: {
    haltbarkeit: 10,
    ueberfahrSchaden: 0.5, // pro überfahrenem Zombie (verhindert endloses Zombie-Farmen mit dem Auto)
  },
  /** Kleintiere (Hasen): Anzahl je 1000 Gras-Kacheln der Karte, scheu, geben 1× Fleisch. */
  tiere: {
    hasenProTausend: 6,
    hasenMax: 40,
    hasenLeben: 10,
    hasenTempo: 125, // Fluchttempo (Spieler 150)
    hasenScheuRadius: 150,
    hasenRespawn: 150,
  },
  /** Angeln: Angel im Inventar, Linksklick Richtung Wasser. Pose wackelt (biss) → in der Zeitspanne nochmal klicken. */
  angeln: {
    reichweite: 230, // px, so weit kann man auswerfen
    wartenMin: 3,
    wartenMax: 9,
    bissMin: 2, // Zeitfenster, in dem die Pose wackelt (Sekunden)
    bissMax: 3,
    doppelChance: 0.1, // 10 %: gleich 2 Fische
    fische: { fisch_barsch: 5, fisch_forelle: 3, fisch_hecht: 1.5 }, // Gewichte
  },
  /** Wetter: wechselt zufällig zwischen klar, Regen und Nebel (Dauer 1–5 Minuten). Regen halbiert die Wachstumszeit. */
  wetter: {
    aktiv: true,
    dauerMin: 60,
    dauerMax: 300,
    pauseMin: 90,
    pauseMax: 420,
    regenAnteil: 0.6, // Rest Nebel
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
    /** Sekunden, die das Inventar eines Toten am Boden liegt, bevor es verschwindet */
    todesVerfall: 180,
  },
  /**
   * Abbau: menge = sicherer Ertrag, chanceAufMehr = Wahrscheinlichkeit (0..1) für +1, dauer in Sekunden,
   * nachwachsen in Sekunden. Welche Objekte abbaubar sind: gemeinsam/welt/ressourcen.js
   */
  ressourcen: {
    holz: { menge: 1, chanceAufMehr: 0.2, dauer: 6, nachwachsen: 300 },
    stein: { menge: 1, chanceAufMehr: 0.2, dauer: 8, nachwachsen: 240 },
    eisenerz: { menge: 1, chanceAufMehr: 0.2, dauer: 10, nachwachsen: 420 },
  },

  /**
   * Schlafen im Bett (in jedem Bett, jederzeit): dauert `dauer` echte Sekunden, heilt, kostet etwas Hunger/Durst
   * und spult die Uhr um `stunden` Spielstunden vor – im Mehrspieler nur, wenn ALLE lebenden Spieler schlafen.
   * Bricht ab bei Bewegung oder Schaden.
   */
  schlafen: {
    dauer: 6,
    heilung: 60,
    stunden: 6,
    hungerKosten: 8,
    durstKosten: 10,
    zombieAbstand: 300, // so nah darf beim Hinlegen kein jagender Zombie sein
  },
  /** Bauwerke (gemeinsam/welt/bauwerke.js): Lagerfeuer, Kochen, Beete */
  bauen: {
    brennDauer: 300, // Sekunden, die ein angezündetes Lagerfeuer brennt
    kochDauer: 4, // Sekunden pro gebratenem Lebensmittel
    wachstumsTage: 1, // Pflanzen brauchen so viele Spieltage (1 = 24 Spielstunden; Schlafen spult mit vor)
    ernteMenge: 2, // Früchte pro Ernte
  },
  /** Level: XP pro Zombie; für Level 2 braucht man `ersteStufe` XP, jedes weitere Level `zuwachs` mehr. Tod = alles weg. */
  level: {
    xpProZombie: 10, // nur Rückfallwert – pro Zombie-Typ: zombie.varianten.<typ>.xp
    ersteStufe: 50,
    zuwachs: 20,
    punkteProLevel: 1, // Skillpunkte pro Aufstieg (gemeinsam/spieler/skills.js)
    xpProAbbau: 3, // XP für jede abgebaute Ressource (Baum, Stein, Erz)
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

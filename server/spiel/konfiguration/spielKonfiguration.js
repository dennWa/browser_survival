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
    uebergangSekunden: 5, // so lange im Übergang (Zonenrand) warten, bis man rüberwechselt (Runde 21)
  },
  spieler: {
    geschwindigkeit: 100, // Pixel pro Sekunde ohne Shift = leichtes Joggen (Runde 21: vorher 80 Gehen, war zu lahm)
    radius: 12,
    leben: 100,
    hungerProMinute: 2.7, // Sättigung 100 → 0 in ~37 min (Runde 23: seltener essen)
    durstProMinute: 4, // 100 → 0 in 25 min
    hungerSchadenProSekunde: 0.5, // Schaden, wenn Hunger ODER Durst bei 0
    regenerationProSekunde: 0.25, // Heilung, wenn satt und getränkt
    regenerationAb: 70, // ab diesem Hunger- UND Durstwert
    respawnZeit: 6, // Sekunden bis zur Wiederbelebung
    todesZombieRadius: 480, // px: beim Tod verschwinden alle Zombies in diesem Umkreis (kommen später regulär wieder)
    startHunger: 85,
    startDurst: 85,
    sprintFaktor: 1.7, // Rennen (Shift + Ausdauer) = 1,7 × Grundtempo = 170 px/s (Runde 21: vorher 150)
    joggFaktor: 1.25, // Shift gehalten, aber Ausdauer leer/erschöpft → schnelleres Joggen = 125 px/s
    ausdauerMax: 100,
    ausdauerVerbrauch: 22, // pro Sekunde Sprint (≈ 4,5 s am Stück)
    ausdauerRegeneration: 14, // pro Sekunde ohne Sprint
    sprintMinimum: 25, // nach völliger Erschöpfung erst ab diesem Wert wieder sprinten
    sprintHoerRadius: 120, // Rennen ist laut: Zombies in diesem Umkreis hören es
    /** Bekommt jeder neue Spieler (und nach dem Tod wieder). magazin = Schuss in der Waffe; ausgeruestet = in der Hand */
    startInventar: [
      { defId: 'pistole', menge: 1, magazin: 15, ausgeruestet: true }, // 15 im Magazin + 15 Reserve = 30 Schuss
      { defId: 'axt', menge: 1 },
      { defId: 'spitzhacke', menge: 1 },
      { defId: 'angel', menge: 1 },
      { defId: 'hammer', menge: 1 }, // Baumodus (BUILD): rüstet den Hammer aus
      { defId: 'hacke', menge: 1 }, // Erdfeld anlegen (in der Hand, dann G)
      { defId: 'munition_9mm', menge: 15 },
    ],
  },
  zombie: {
    geschwindigkeit: 54, // Grundtempo (Umherschlurfen = knapp halbes Grundtempo)
    jagdGeschwindigkeit: 120, // beim Verfolgen: ≈ 20 % langsamer als Rennen (150) – schneller als Gehen (80)/Joggen (115)
    radius: 13,
    leben: 60,
    aggroRadius: 170, // ab dieser Entfernung (px) wird ein sichtbarer Spieler bemerkt
    dunkelFaktor: 0.45, // Nachts mit Taschenlampe aus → Spieler wird erst ab aggroRadius × dunkelFaktor bemerkt
    nachtLichtFaktor: 1.2, // Nachts mit Taschenlampe an → leuchtet wie ein Leuchtturm
    nachtTempoFaktor: 1.1, // nachts jagen Zombies schneller (bleiben unter dem Renn-Tempo)
    nachtHorde: 8, // zusätzliche Zombies, die bei Einbruch der Nacht auftauchen (verschwinden morgens)
    verlierRadius: 520, // weiter weg → Zombie gibt auf
    hoerRadius: 400, // Schüsse in diesem Umkreis locken Zombies an
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
      laeufer: { gewicht: 2, xp: 12, leben: 35, jagdGeschwindigkeit: 135, angriffsSchaden: 8, angriffsAbklingzeit: 0.7, groesse: 0.92 },
      // Boss (große Zombies): halten viel aus, teilen mehr aus; waffenChance = Wahrscheinlichkeit auf Waffe + Munition
      // Brocken: selten (gewicht) und exakt 10 Pistolentreffer stark (Pistole 25 Schaden → 250 Leben; Schüsse ignorieren Skills)
      // Runde 20: „Halber Zombie“ (nur Beine + Bauch, Modell zombie-half.glb) – langsam, schwach, tritt zu
      halb: { gewicht: 1, xp: 6, leben: 30, jagdGeschwindigkeit: 90, angriffsSchaden: 6, angriffsAbklingzeit: 1.1, groesse: 1 },
      brocken: { gewicht: 0.2, xp: 40, leben: 250, jagdGeschwindigkeit: 90, angriffsSchaden: 40, angriffsAbklingzeit: 1.5, radius: 15, groesse: 1.3, rueckstossFaktor: 0.15, waffenChance: 0.5 },
    },
  },
  /** Autos: so viele Zombie-Schläge halten sie aus (ein normaler Zombie = 1 Schlag, Boss mehr); Überfahren kostet nur wenig. */
  fahrzeug: {
    haltbarkeit: 10,
    ueberfahrSchaden: 0.5, // pro überfahrenem Zombie (verhindert endloses Zombie-Farmen mit dem Auto)
    /**
     * Aufprall an Wand/anderem Fahrzeug ab 17 km/h (gemeinsam/physik/fahrzeug.js AUFPRALL_MIN_KMH): Schaden am eigenen Auto,
     * linear von `min` (bei 17 km/h) bis `max` (bei 120 km/h = Vollgas); Entlangschrammen nur `schrammFaktor` davon; `pause` Sekunden Ruhe zwischen zwei Aufprällen.
     */
    aufprallSchaden: { min: 0.5, max: 5, schrammFaktor: 0.25, pause: 0.5 },
    laterneBremse: 0.6, // Runde 18: Anteil des Tempos, der nach dem Umfahren einer Laterne bleibt (spürbares Abbremsen)
    laterneSchaden: 0.5, // Schaden am Auto, wenn es eine Straßenlaterne umfährt (ab 70 km/h, LATERNE_MIN_KMH)
    laterneNachwachsen: 600, // Sekunden, bis eine umgefahrene Straßenlaterne wieder steht (Bäume: ressourcen.holz.nachwachsen)
  },
  /** Runde 23: Test-Bots (systeme/botSystem.js) – so viele laufen je Zone herum; Admin kann welche setzen/entfernen. */
  bots: {
    proKarte: 0, // Standard aus (Tests); start.js und der Lokal-Modus setzen 2
  },
  /** Kleintiere (Hasen): Anzahl je 1000 Gras-Kacheln der Karte, scheu, geben 1× Fleisch. */
  tiere: {
    hasenProTausend: 2,
    hasenMax: 12,
    hasenLeben: 10,
    hasenTempo: 185, // Fluchttempo (Runde 23: schneller als ein sprintender Spieler, 170)
    hasenScheuRadius: 300, // Runde 23: viel scheuer (vorher 150); sprintende Spieler schrecken noch weiter (× sprintScheu)
    sprintScheu: 1.4,
    schussScheuRadius: 700, // Schuss in diesem Umkreis → Flucht
    autoScheuRadius: 380, // fahrendes Auto in diesem Umkreis → Flucht
    fluchtStrecke: [700, 1100], // so weit rennt ein erschreckter Hase (px), auch wenn der Spieler nicht folgt
    fluchtZeitMax: 9, // spätestens nach so vielen Sekunden Flucht wird wieder geprüft
    hasenRespawn: 150,
  },
  /** Angeln: Angel im Inventar, Linksklick Richtung Wasser. Pose wackelt (biss) → in der Zeitspanne nochmal klicken. */
  angeln: {
    reichweite: 230, // px, so weit kann man auswerfen
    wartenMin: 6, // Runde 18: Wartezeit verdoppelt (vorher 3–9 s)
    wartenMax: 18,
    bissMin: 2, // Zeitfenster, in dem die Pose wackelt (Sekunden)
    bissMax: 3,
    doppelChance: 0.1, // 10 %: gleich 2 Fische
    fische: { fisch_barsch: 5, fisch_forelle: 3, fisch_hecht: 1.5 }, // Gewichte innerhalb der Kategorie 'fisch'
    /** Beute-Kategorien (Gewichte 50/40/10): Fisch, Müll/Stoff/Schrott, Munition */
    beute: { fisch: 50, muell: 40, munition: 10 },
    muell: { muell: 3, stoff: 2, schrott: 2 }, // Gewichte innerhalb der Kategorie 'muell'
    munition: { munition_9mm: 3, munition_12: 1 }, // Gewichte; Stückzahl siehe munitionMenge
    munitionMenge: [3, 8],
  },
  /** Wetter: wechselt zufällig zwischen klar, Regen, Gewitter, Sturm und Nebel (Dauer 1–5 Minuten). Regen halbiert die Wachstumszeit. */
  wetter: {
    aktiv: true,
    dauerMin: 60,
    dauerMax: 300,
    pauseMin: 90,
    pauseMax: 420,
    regenAnteil: 0.6, // Anteil Niederschlag (Regen/Schnee), Rest Nebel bzw. Sturm
    gewitterAnteil: 0.3, // vom Niederschlag: Gewitter (Schneezonen: Schneesturm)
    sturmAnteil: 0.35, // vom Rest: Sturm statt Nebel
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
    holz: { menge: 1, mengeGross: 2, chanceAufMehr: 0.2, dauer: 6, nachwachsen: 300, apfelChance: 0.1 },
    stein: { menge: 1, mengeGross: 2, chanceAufMehr: 0.2, dauer: 8, nachwachsen: 240 },
    eisenerz: { menge: 1, chanceAufMehr: 0.2, dauer: 10, nachwachsen: 420 },
  },

  /**
   * Schlafen im Bett (in jedem Bett, jederzeit): dauert `dauer` echte Sekunden, heilt, kostet etwas Hunger/Durst
   * und spult die Uhr um `stunden` Spielstunden vor – im Mehrspieler nur, wenn ALLE lebenden Spieler schlafen.
   * Im Bett ist man festgehalten (keine Bewegung) – nur Schaden (Angriff) weckt auf.
   */
  schlafen: {
    dauer: 6,
    heilung: 60,
    stunden: 6, // 0 = Zeit läuft normal weiter (nur heilen); >0 = Uhr vorspulen
    hungerKosten: 8,
    durstKosten: 10,
    zombieAbstand: 300, // so nah darf beim Hinlegen kein jagender Zombie sein
  },
  /** Bauwerke (gemeinsam/welt/bauwerke.js): Lagerfeuer, Kochen, Beete */
  bauen: {
    brennDauer: 180, // Sekunden, die ein angezündetes Lagerfeuer brennt (3 Minuten); jedes Holz in der Hand (Linksklick) verlängert um so viel
    brennMax: 1800, // so lange kann ein Feuer höchstens am Stück brennen (durch Nachlegen)
    kochDauer: 20, // Sekunden, bis Fleisch/Fisch/Gemüse am Feuer fertig gebraten ist
    verbrennDauer: 30, // Sekunden insgesamt: bleibt es länger im Feuer, verbrennt es zu 'verkohlt'
    schmelzDauer: 15, // Sekunden pro Eisenerz im Schmelzofen (solange er heiß ist)
    ofenBrennDauer: 40, // Sekunden Hitze pro Holz im Schmelzofen
    wachstumsTage: 1, // Pflanzen brauchen so viele Spieltage (1 = 24 Spielstunden; Schlafen spult mit vor)
    ernteMenge: 2, // Früchte pro Ernte
  },
  /** Basisbau (gemeinsam/basisbau/): Baugebiet-Flagge, Abriss. Kosten der Teile: gemeinsam/basisbau/teile.js */
  basisbau: {
    radiusKacheln: 8, // Baugebiet um die Flagge (1 Kachel = 1 m); später durch Skillpunkte erweiterbar (territoriumSystem.radiusFuer)
    blockGroesse: 2, // Boden, Wand und Dach werden als Block aus 2×2 Kacheln gesetzt (1 = einzelne Kacheln)
    rueckgabe: 0.75, // Anteil der Baukosten, den man beim Abriss zurückbekommt (abgerundet pro Material)
    flaggeFreiraum: 2, // Kacheln um die Flagge, die frei von Karten-Gebäuden/Hindernissen/Wasser sein müssen
    flaggeMindestAbstand: 15, // Kacheln zwischen zwei Flaggen (verschiedener Spieler)
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

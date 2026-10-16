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
      brocken: { gewicht: 1, xp: 15, leben: 180, jagdGeschwindigkeit: 62, angriffsSchaden: 25, angriffsAbklingzeit: 1.5, radius: 15, groesse: 1.3, rueckstossFaktor: 0.2 },
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
    /** Sekunden, die das Inventar eines Toten am Boden liegt, bevor es verschwindet */
    todesVerfall: 180,
  },
  /** Abbau von Bäumen & Steinen (welche Objekte/Werkzeuge: gemeinsam/welt/ressourcen.js) */
  ressourcen: {
    holz: { menge: 2, dauer: 5, nachwachsen: 300 }, // menge pro Baum, dauer in Sekunden, nachwachsen in Sekunden
    stein: { menge: 2, dauer: 5, nachwachsen: 240 },
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
  /** Level: XP pro Zombie; für Level 2 braucht man `ersteStufe` XP, jedes weitere Level `zuwachs` mehr. Tod = alles weg. */
  level: {
    xpProZombie: 10, // nur Rückfallwert – pro Zombie-Typ: zombie.varianten.<typ>.xp
    ersteStufe: 50,
    zuwachs: 20,
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

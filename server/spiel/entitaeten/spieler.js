import { INVENTAR_PLAETZE } from '../../../gemeinsam/konstanten.js';
import { STANDARD_AUSRUESTUNG } from '../konfiguration/gegenstaende.js';
import { xpFuerNaechstesLevel } from '../systeme/levelSystem.js';
import { flaggeFuerClient, radiusFuer } from '../systeme/territoriumSystem.js';
import { leereSkills } from '../../../gemeinsam/spieler/skills.js';
import { aussehenKompakt, pruefeAussehen } from '../../../gemeinsam/spieler/aussehen.js';

/**
 * Spieler-Entität ("Männeken").
 * Entitäten sind reine Datenobjekte; Verhalten steckt in den Systemen (server/spiel/systeme/).
 * Felder unter [intern] verlassen nie den Server; [privat] geht nur an den Spieler selbst (SPIELER_DATEN).
 */
export function erzeugeSpieler({ id, benutzername, x, y, konfiguration, admin = false }) {
  const k = konfiguration.spieler;
  return {
    id,
    typ: 'spieler',
    name: benutzername,
    x,
    y,
    blick: 0,
    leben: k.leben,
    maxLeben: k.leben,
    /** Was der Spieler in der Hand hält → bestimmt das Animationsset im Client */
    ausruestung: STANDARD_AUSRUESTUNG,
    /** Laufende Aktion für Animationen: 'schiessen' | 'nachladen' | 'nahkampf' | null */
    aktion: null,
    aktionTick: 0,
    aktionDauer: 0,
    tot: false,
    ausdauer: k.ausdauerMax,
    erschoepft: false,
    sprintet: false,
    /** Taschenlampe an? Aus = schlechter zu sehen (für Zombies UND Mitspieler) */
    lichtAn: true,
    /** Admin-Schalter (nur mit Admin-Recht setzbar) – öffentlich, damit alle sehen, wer schummelt */
    gottmodus: false,
    unsichtbar: false,
    unendlichMunition: false, // Admin-Schalter: Schüsse kosten keine Munition
    boostRest: 0, // Sekunden, in denen Sprinten keine Ausdauer kostet (Energydrink) – öffentlich, der Client rechnet die Vorhersage damit
    stationText: '', // [intern] zuletzt gesendete Station-Ansicht (nur Änderungen schicken)
    offeneStation: null, // [intern] ID des Lagerfeuers/Schmelzofens, dessen Menü dieser Spieler offen hat
    fliegen: false, // Admin-Flugmodus (Umschalt+B): keine Kollision, schnell – Physik in gemeinsam/physik/bewegung.js
    /** Laufende Arbeit (Abbauen, Schlafen) – siehe systeme/arbeitSystem.js; öffentlich ist nur die Art */
    arbeit: null,
    /** Level (öffentlich, steht in der Spielerliste) und XP im aktuellen Level – siehe systeme/levelSystem.js */
    level: 1,
    xp: 0,
    /** Skills (gemeinsam/spieler/skills.js) + noch zu verteilende Punkte; tempoFaktor wirkt in der Bewegung */
    skills: leereSkills(),
    skillPunkte: 0,
    tempoFaktor: 1,
    /** Statistik (Tab-Liste, öffentlich): getötete Zombies/Spieler (bleiben), Sekunden seit dem letzten Tod */
    statistik: { zombies: 0, spieler: 0, ueberlebt: 0 },
    /** Angeln (systeme/angelSystem.js): { phase, rest, x, y, startX, startY } oder null; Pose + Schnur sind öffentlich */
    angeln: null,
    angriffVorher: false, // [intern] Linksklick-Flanke fürs Angeln
    offeneKiste: null, // [intern] ID der Lagerkiste, die dieser Spieler gerade geöffnet hat
    /** Basisbau: Respawn-Bett { karte, tx, ty } (systeme/spawnSystem.js) und Zone mit der eigenen Basis-Flagge (systeme/territoriumSystem.js) – beides im Spielstand */
    spawn: null,
    flaggeKarte: null,
    /** Aussehen (gemeinsam/spieler/aussehen.js) – öffentlich */
    aussehen: pruefeAussehen(null),
    // [privat]
    admin, // darf Admin-Befehle benutzen (kommt von der Authentifizierung)
    hunger: k.startHunger, // 100 = satt, 0 = verhungert
    durst: k.startDurst,
    /**
     * Plätze: null oder { defId, menge, magazin? }. 0–7 = Schnellleiste, 8–15 = Tasche,
     * ab 16 = Rucksack (nur mit Rucksack; Länge wächst/schrumpft mit – siehe inventarSystem.legeRucksackAn)
     */
    inventar: new Array(INVENTAR_PLAETZE).fill(null),
    rucksack: null, // defId des getragenen Rucksacks oder null
    fahrzeug: null, // [intern] Fahrzeug-Entität, in der der Spieler sitzt (systeme/fahrzeugSystem.js)
    ausgeruestet: null, // Inventarplatz der Waffe in der Hand
    nachladenRest: 0, // Sekunden, solange nachgeladen wird
    respawnRest: 0,
    // [intern]
    eingabePuffer: [],
    aktionsPuffer: [],
    letzteEmpfangeneSeq: 0,
    letzteVerarbeiteteSeq: 0,
    angriff: false,
    angriffsAbklingzeit: 0,
  };
}

/** Was ALLE Clients über einen Spieler erfahren. `seq` braucht der eigene Client zum Abgleich. */
export function spielerZuNetzwerk(s) {
  return {
    id: s.id,
    typ: s.typ,
    name: s.name,
    x: s.x,
    y: s.y,
    blick: s.blick,
    leben: Math.round(s.leben * 10) / 10, // nur für Lebensbalken – das eigene genaue Leben steht in SPIELER_DATEN
    maxLeben: s.maxLeben,
    ausruestung: s.ausruestung,
    // Item in der Hand (z. B. 'hammer') – der Renderer zeigt das passende Waffenmodell
    waffe: s.ausgeruestet !== null ? (s.inventar[s.ausgeruestet]?.defId ?? null) : null,
    aktion: s.aktion,
    aktionTick: s.aktionTick,
    aktionDauer: s.aktionDauer,
    tot: s.tot,
    // Ausdauer exakt (nicht gerundet): der eigene Client rechnet damit die Sprint-Vorhersage nach
    ausdauer: s.ausdauer,
    erschoepft: s.erschoepft,
    gleit: s.aufEis ? [s.gleitX, s.gleitY] : undefined, // Eis-Schwung exakt (Vorhersage rutscht genauso)
    boostRest: Math.round(s.boostRest * 1000) / 1000,
    sprintet: s.sprintet,
    lichtAn: s.lichtAn,
    gottmodus: s.gottmodus,
    unsichtbar: s.unsichtbar,
    fliegen: s.fliegen,
    arbeit: s.arbeit?.art ?? null, // 'holz' | 'stein' | 'schlafen' → Animation/Werkzeug
    arbeitOrt: s.arbeit?.ort ?? null, // Bett beim Schlafen
    level: s.level,
    zombiesGetoetet: s.statistik.zombies,
    spielerGetoetet: s.statistik.spieler,
    ueberlebt: Math.floor(s.statistik.ueberlebt),
    angeln: s.angeln ? { phase: s.angeln.phase, x: Math.round(s.angeln.x), y: Math.round(s.angeln.y) } : null,
    rucksack: s.rucksack !== null, // Rucksack auf dem Rücken (3D-Modell)
    aussehen: aussehenKompakt(s.aussehen), // nur Abweichungen vom Standard (spart ~110 Bytes pro Spieler und Tick)
    // Im Auto: genauer Fahrzustand (der eigene Client rechnet damit die Vorhersage nach)
    fahrzeug: s.fahrzeug ? { id: s.fahrzeug.id, winkel: s.fahrzeug.winkel, tempo: s.fahrzeug.tempo, laenge: s.fahrzeug.laenge, breite: s.fahrzeug.breite, modell: s.fahrzeug.modell, leben: Math.round(s.fahrzeug.leben * 10) / 10, maxLeben: s.fahrzeug.maxLeben } : null,
    seq: s.letzteVerarbeiteteSeq,
  };
}

/** Private Daten nur für den Spieler selbst (Inventar, Hunger, Durst …). */
/** @param spielWelt  die Zone des Spielers (für das eigene Baugebiet) */
export function spielerDatenPrivat(s, konfiguration, spielWelt = null) {
  return {
    level: s.level,
    xp: s.xp,
    xpNaechstes: xpFuerNaechstesLevel(s.level, konfiguration.level),
    skills: s.skills,
    skillPunkte: s.skillPunkte,
    tempoFaktor: s.tempoFaktor, // für die Bewegungs-Vorhersage im Client
    leben: Math.ceil(s.leben),
    maxLeben: s.maxLeben,
    hunger: Math.ceil(s.hunger),
    durst: Math.ceil(s.durst),
    inventar: s.inventar,
    rucksack: s.rucksack,
    ausgeruestet: s.ausgeruestet,
    nachladen: s.nachladenRest > 0,
    tot: s.tot,
    respawnIn: Math.ceil(s.respawnRest),
    admin: s.admin,
    fliegen: s.fliegen,
    unendlichMunition: s.unendlichMunition,
    flagge: spielWelt ? flaggeFuerClient(spielWelt, s) : null, // eigenes Baugebiet { tx, ty, radius } – nur der Besitzer erfährt es
    bauRadius: spielWelt ? radiusFuer(s, konfiguration) : konfiguration.basisbau.radiusKacheln, // Radius einer neuen Flagge (fürs Hologramm)
    bauBlock: konfiguration.basisbau.blockGroesse ?? 1, // Block-Kantenlänge für Boden/Wand/Dach (1 = einzeln)
    spawn: s.spawn, // Respawn-Bett { karte, tx, ty } oder null
    // Fortschritt in 5-%-Schritten (sonst würde jeder Tick neue Daten schicken)
    arbeit: s.arbeit
      ? { art: s.arbeit.art, fortschritt: Math.round((1 - s.arbeit.rest / s.arbeit.dauer) * 20) / 20, wartet: s.arbeit.fertig === true, amFeuer: s.arbeit.art === 'sitzen' && s.arbeit.bauwerkId != null }
      : null,
  };
}

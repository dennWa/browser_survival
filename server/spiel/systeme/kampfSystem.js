import { brecheArbeitAb, starteZerlegen, ZERLEGE_WERKZEUGE } from './arbeitSystem.js';
import { strahlGegenWaende, strahlTrifftKreis } from '../../../gemeinsam/physik/strahl.js';
import { bewegeKoerper } from '../../../gemeinsam/physik/bewegung.js';
import { NAHKAMPF_KEGEL, STANDARD_AUSRUESTUNG, waffenWerte } from '../konfiguration/gegenstaende.js';
import { aktuelleWaffe, kleidungsSchutz, konsumiere, legeAufBoden, nutzeWerkzeug, pflanzeSamenAusHand, legeRucksackAb, legeKleidungAb, starteNachladen, zaehleMunition } from './inventarSystem.js';
import { gibXp, setzeLevelZurueck } from './levelSystem.js';
import { staerkeFaktor } from '../../../gemeinsam/spieler/skills.js';
import { aussteigen, schlageFahrzeug } from './fahrzeugSystem.js';
import { behandleAngelKlick, brecheAngelnAb } from './angelSystem.js';
import { planeTierRespawn } from './tierSystem.js';
import { schuereFeuer, sitztAmFeuer } from './stationSystem.js';
import { tutorialVorSchaden } from './tutorialSystem.js';
import { lasseBossLootFallen, lasseZombieLootFallen } from './lootSystem.js';
import { explodiere } from './sonderZombieSystem.js';
import { werfe } from './explosionSystem.js';

/**
 * (Linksklick am Ufer mit Angel im Inventar ist KEIN Angriff: behandleAngelKlick läuft zuerst, siehe angelSystem.js.)
 * Kampfsystem: Angriffe der Spieler (Schuss per Strahl, Nahkampf per Trefferkegel),
 * Schaden, Tod. fuegeSchadenZu() ist die EINZIGE Stelle, an der Leben durch Angriffe sinkt.
 */
const SCHUSS_ANIMATION = 0.15;
const NAHKAMPF_ANIMATION = 0.45;
const NAHKAMPF_HOERWEITE = 140;

export function aktualisiereKampf(spielWelt, dt) {
  for (const spieler of spielWelt.alleVomTyp('spieler')) {
    spieler.angriffsAbklingzeit = Math.max(0, spieler.angriffsAbklingzeit - dt);
    if (behandleAngelKlick(spielWelt, spieler)) continue; // Linksklick am Ufer = auswerfen/einholen, kein Angriff
    if (spieler.tot || !spieler.angriff || spieler.angriffsAbklingzeit > 0 || spieler.nachladenRest > 0) continue;
    const { eintrag, def } = aktuelleWaffe(spieler);
    if (def.kategorie === 'fernkampf') schiessen(spielWelt, spieler, eintrag, def);
    else if (def.kategorie === 'wurf') {
      // Runde 24: Rohrbombe/Molotow werfen (explosionSystem)
      werfe(spielWelt, spieler, spieler.ausgeruestet, def);
      spieler.angriffsAbklingzeit = 0.9;
    }
    else if (def.kategorie === 'samen') {
      // Samen in der Hand: Linksklick pflanzt ins nächste freie Beet (kein Angriff)
      spieler.angriffsAbklingzeit = pflanzeSamenAusHand(spielWelt, spieler, def) ? 0.5 : 1.2;
    } else if (def.kategorie === 'nahrung' || def.kategorie === 'getraenk' || def.kategorie === 'medizin') {
      // Essen/Trinken/Medizin in der Hand: Linksklick verbraucht ein Stück
      spieler.angriffsAbklingzeit = konsumiere(spielWelt, spieler, spieler.ausgeruestet) ? 0.8 : 0.4;
    } else if (eintrag?.defId === 'holz') {
      // Holz in der Hand: Linksklick aufs Lagerfeuer = nachlegen (+3 min)
      spieler.angriffsAbklingzeit = schuereFeuer(spielWelt, spieler, spieler.ausgeruestet) ? 0.6 : 1.0;
    } else if (def.ausruestung === 'hacke') {
      // Hacke in der Hand: Linksklick legt ein Ackerfeld an (Client schickt AKTION feld), kein Nahkampf
      spieler.angriffsAbklingzeit = 0.2;
    } else if (ZERLEGE_WERKZEUGE.has(eintrag?.defId) && starteZerlegen(spielWelt, spieler, eintrag.defId)) {
      // Axt/Spitzhacke/Hammer vor eigenem Lagerfeuer/Werkbank/Ofen/Falle: Linksklick baut es ab (5 s), statt zu schlagen
      spieler.angriffsAbklingzeit = 0.5;
    } else if (spieler.arbeit?.art === 'zerlegen') {
      spieler.angriffsAbklingzeit = 0.2; // während des Zerlegens kein Nahkampf
    } else if (def.kategorie === 'nahkampf') nahkampf(spielWelt, spieler, def);
    // sonstiges in der Hand (Angel): Linksklick ist kein Angriff (Auswerfen läuft über behandleAngelKlick)
  }
}

function schiessen(spielWelt, spieler, eintrag, grundDef) {
  const def = waffenWerte(eintrag, grundDef); // Runde 24: Aufsätze (Zielfernrohr, Magazin, Schalldämpfer)
  if (eintrag.magazin <= 0 && spieler.unendlichMunition) eintrag.magazin = def.magazin; // Admin: nie leer
  if (eintrag.magazin <= 0) {
    // Leer: automatisch nachladen, sonst "Klick"
    if (zaehleMunition(spieler, def.munition) > 0) {
      starteNachladen(spielWelt, spieler);
    } else {
      spielWelt.ereignis({ typ: 'leer', von: spieler.id });
      spieler.angriffsAbklingzeit = 0.5;
    }
    return;
  }
  if (!spieler.unendlichMunition) eintrag.magazin -= 1;
  spieler.angriffsAbklingzeit = def.abklingzeit;
  spielWelt.setzeAktion(spieler, 'schiessen', SCHUSS_ANIMATION);
  // Ein "feuer" pro Abzug (Knall, Mündungsfeuer) – die Projektile kommen als einzelne "schuss"-Ereignisse
  const leise = (def.laerm ?? 1) < 0.5;
  spielWelt.ereignis({ typ: 'feuer', von: spieler.id, x: spieler.x, y: spieler.y, winkel: spieler.blick, waffe: def.ausruestung, item: eintrag.defId, ...(leise ? { leise: true } : {}) });

  for (let i = 0; i < (def.projektile ?? 1); i++) {
    const winkel = spieler.blick + (spielWelt.zufall.zahl() * 2 - 1) * (def.streuung ?? 0);
    feuereStrahl(spielWelt, spieler, winkel, def);
  }
  // Lärm lockt Zombies: Gewehr laut, Bogen/Armbrust/Schalldämpfer leise
  alarmiereZombies(spielWelt, spieler.x, spieler.y, spielWelt.konfiguration.zombie.hoerRadius * (def.laerm ?? 1), spieler.id);
}

/** Ego-Ansicht auf Gelände: Augenhöhe des Schützen und Körperhöhe der Ziele (Weltpixel) */
const AUGEN_HOEHE = 54;
const KOERPER_HOEHE = 62;

/**
 * Höhen-Treffer (Editor 2.0, 2.5): In der Draufsicht zählt nur die Richtung (2D, Nutzer-Entscheidung F4). Schießt man in der
 * Ego-Ansicht (spieler.neigung gesetzt) auf Gelände mit Höhen, muss die Schusslinie in Zielentfernung durch den Körper gehen –
 * wer oben auf der Klippe steht, muss man also nach oben anvisieren.
 */
function trifftHoehe(welt, schuetze, kandidat, t) {
  if (!welt.hoehen || !Number.isFinite(schuetze.neigung)) return true;
  const linie = welt.hoeheBei(schuetze.x, schuetze.y) + AUGEN_HOEHE + t * Math.tan(schuetze.neigung);
  const boden = welt.hoeheBei(kandidat.x, kandidat.y);
  return linie >= boden - 4 && linie <= boden + KOERPER_HOEHE;
}

/** Ein Projektil: trifft das erste Ziel vor der nächsten Wand. */
function feuereStrahl(spielWelt, schuetze, winkel, def) {
  const dx = Math.cos(winkel);
  const dy = Math.sin(winkel);
  const wand = strahlGegenWaende(spielWelt.welt, schuetze.x, schuetze.y, winkel, def.reichweite);
  let bestT = wand.laenge;
  let ziel = null;
  for (const kandidat of moeglicheZiele(spielWelt, schuetze)) {
    const t = strahlTrifftKreis(schuetze.x, schuetze.y, dx, dy, kandidat.x, kandidat.y, radiusVon(spielWelt, kandidat));
    if (t !== null && t < bestT && trifftHoehe(spielWelt.welt, schuetze, kandidat, t)) {
      bestT = t;
      ziel = kandidat;
    }
  }
  // stoff = Material am Einschlag (Client färbt Staub/Splitter passend; Blut gibt es nur bei 'treffer')
  const stoff = ziel ? 'fleisch' : wand.getroffen ? stoffAm(spielWelt.welt, schuetze.x + dx * (bestT + 2), schuetze.y + dy * (bestT + 2)) : null;
  spielWelt.ereignis({ typ: 'schuss', von: schuetze.id, x: schuetze.x, y: schuetze.y, zx: schuetze.x + dx * bestT, zy: schuetze.y + dy * bestT, stoff, ...(def.pfeil ? { pfeil: true } : {}) });
  if (ziel) fuegeSchadenZu(spielWelt, ziel, def.schaden, schuetze, winkel, { durchschlag: def.durchschlag ?? 0 });
  // Runde 24: Pfeile/Bolzen bleiben oft heil liegen (etwas vor dem Einschlag) und lassen sich wieder aufheben
  if (def.pfeil && def.munition && spielWelt.zufall.zahl() < (def.bergen ?? 0)) {
    const t = Math.max(0, bestT - 10);
    legeAufBoden(spielWelt, { defId: def.munition, menge: 1 }, schuetze.x + dx * t, schuetze.y + dy * t, 600);
  }
}

/** Material der getroffenen Kachel: Bauwerk-Typ oder Kartenzeichen → 'holz' | 'stein' | 'metall' | 'glas' | 'beton'. */
function stoffAm(welt, x, y) {
  const tx = Math.floor(x / welt.kachelGroesse);
  const ty = Math.floor(y / welt.kachelGroesse);
  for (const b of welt.bauwerkeAn(tx, ty)) {
    if (/zaun|eisen|metall/.test(b.typ)) return 'metall';
    if (/stein/.test(b.typ)) return 'stein';
    return 'holz';
  }
  const zeichen = welt.kachelAn(tx, ty);
  if (zeichen === 'F') return 'glas';
  if (zeichen === 'T') return 'holz';
  return 'beton';
}

function nahkampf(spielWelt, spieler, def) {
  spieler.angriffsAbklingzeit = def.abklingzeit;
  spielWelt.setzeAktion(spieler, 'nahkampf', NAHKAMPF_ANIMATION);
  spielWelt.ereignis({ typ: 'nahkampf', von: spieler.id, x: spieler.x, y: spieler.y, winkel: spieler.blick });
  let getroffen = false;
  for (const ziel of moeglicheZiele(spielWelt, spieler)) {
    const abstand = Math.hypot(ziel.x - spieler.x, ziel.y - spieler.y) - radiusVon(spielWelt, ziel);
    if (abstand > def.reichweite) continue;
    const richtung = Math.atan2(ziel.y - spieler.y, ziel.x - spieler.x);
    const differenz = Math.abs(Math.atan2(Math.sin(richtung - spieler.blick), Math.cos(richtung - spieler.blick)));
    if (differenz > (def.kegel ?? NAHKAMPF_KEGEL)) continue; // Runde 24: Speer sticht schmal nach vorn
    fuegeSchadenZu(spielWelt, ziel, def.schaden * staerkeFaktor(spieler.skills), spieler, richtung, { durchschlag: def.durchschlag ?? 0, rueckstoss: def.rueckstoss ?? 1 });
    getroffen = true;
  }
  // Runde 24: Nahkampfwaffen nutzen sich pro Schlag mit Treffer ab (Reparatur an der Werkbank)
  const defId = spieler.ausgeruestet !== null ? spieler.inventar[spieler.ausgeruestet]?.defId : null;
  if (getroffen && defId && def.haltbarkeit) nutzeWerkzeug(spielWelt, spieler, defId);
  alarmiereZombies(spielWelt, spieler.x, spieler.y, NAHKAMPF_HOERWEITE, spieler.id);
}

function* moeglicheZiele(spielWelt, angreifer) {
  yield* spielWelt.alleVomTyp('zombie');
  yield* spielWelt.alleVomTyp('tier');
  if (!spielWelt.konfiguration.kampf.pvp) return;
  for (const s of spielWelt.alleVomTyp('spieler')) if (s !== angreifer && !s.tot) yield s;
}

function radiusVon(spielWelt, entitaet) {
  return entitaet.trefferRadius ?? entitaet.radius ?? spielWelt.konfiguration.spieler.radius;
}

/**
 * Schaden zufügen. @param quelle Angreifer (oder null) · @param winkel Trefferrichtung (für Blut & Rückstoß)
 */
export function fuegeSchadenZu(spielWelt, ziel, menge, quelle, winkel = 0, optionen = {}) {
  if (ziel.tot || ziel.leben <= 0 || ziel.gottmodus) return;
  if (ziel.fahrzeug && quelle?.typ === 'zombie') {
    // Im Auto ist man vor Bissen sicher – dafür leidet das Auto (Boss-Schläge zählen mehr)
    schlageFahrzeug(spielWelt, ziel.fahrzeug, quelle.angriffsSchaden / spielWelt.konfiguration.zombie.angriffsSchaden);
    return;
  }
  if (ziel.typ === 'spieler' && tutorialVorSchaden(spielWelt, ziel, menge)) return; // Tutorial: Ohnmacht statt Tod
  // Runde 24: Panzerung (gepanzerte Zombies) schluckt einen Teil – Explosionen und Waffen mit `durchschlag` nicht
  if (ziel.panzer > 0 && !optionen.explosion) menge *= 1 - ziel.panzer * (1 - Math.min(1, optionen.durchschlag ?? 0));
  if (ziel.typ === 'spieler' && ziel.kleidung) menge *= 1 - kleidungsSchutz(ziel) / 100; // Runde 24: Rüstung
  ziel.leben -= menge;
  if (ziel.angeln) brecheAngelnAb(ziel);
  if (ziel.arbeit) brecheArbeitAb(spielWelt, ziel, ziel.arbeit.art === 'schlafen' ? 'Aufgeschreckt!' : null);
  spielWelt.ereignis({ typ: 'treffer', x: ziel.x, y: ziel.y, winkel, ziel: ziel.typ, ...(ziel.panzer > 0 ? { panzer: true } : {}) });

  if (ziel.typ === 'zombie') {
    const r = spielWelt.konfiguration.kampf.rueckstoss * ziel.rueckstossFaktor * (optionen.rueckstoss ?? 1);
    bewegeKoerper(ziel, Math.cos(winkel) * r, Math.sin(winkel) * r, ziel.radius, spielWelt.welt);
    if (quelle?.typ === 'spieler') {
      ziel.zielId = quelle.id;
      ziel.zustand = 'verfolgend';
      ziel.letztesZielX = quelle.x;
      ziel.letztesZielY = quelle.y;
    }
  }
  if (ziel.leben <= 0) toeten(spielWelt, ziel, quelle, optionen);
}

/**
 * @param quelle Wer getötet hat (Spieler bekommt XP) – null z. B. bei Admin-Befehlen
 * @param optionen { ohneXp } – true: kein XP (Roadkill mit dem Fahrzeug); die Statistik zählt den Kill trotzdem
 */
export function toeten(spielWelt, ziel, quelle = null, optionen = {}) {
  spielWelt.ereignis({ typ: 'tod', id: ziel.id, x: ziel.x, y: ziel.y, ziel: ziel.typ });
  if (ziel.typ === 'zombie') {
    // XP je nach Variante (Brocken 15, Läufer 12 …), sonst level.xpProZombie – immer der aktuelle Wert (Developer-Modus)
    const k = spielWelt.konfiguration;
    if (quelle?.typ === 'spieler') {
      if (!optionen.ohneXp) gibXp(spielWelt, quelle, k.zombie.varianten?.[ziel.variante]?.xp ?? k.level.xpProZombie);
      quelle.statistik.zombies++;
    }
    spielWelt.entfernen(ziel.id);
    spielWelt.planeZombieRespawn(ziel.spawnIndex);
    if (ziel.variante === 'explosiv' && !optionen.explosion) explodiere(spielWelt, ziel); // Treffer bringt ihn zum Platzen
    lasseZombieLootFallen(spielWelt, ziel.x, ziel.y);
    const waffenChance = k.zombie.varianten?.[ziel.variante]?.waffenChance ?? 0;
    if (waffenChance > 0 && spielWelt.zufall.zahl() < waffenChance) lasseBossLootFallen(spielWelt, ziel.x, ziel.y);
    return;
  }
  if (ziel.typ === 'tier') {
    // Hase: 1× Fleisch (klein, mehr ist nicht dran)
    spielWelt.entfernen(ziel.id);
    planeTierRespawn(spielWelt, ziel);
    legeAufBoden(spielWelt, { defId: 'fleisch', menge: 1 }, ziel.x, ziel.y);
    return;
  }
  if (quelle?.typ === 'spieler' && quelle !== ziel) quelle.statistik.spieler++;
  ziel.statistik.ueberlebt = 0;
  if (ziel.fahrzeug) aussteigen(spielWelt, ziel, { erzwingen: true });
  raeumeZombiesWeg(spielWelt, ziel.x, ziel.y, spielWelt.konfiguration.spieler.todesZombieRadius);
  // Spieler: alles fällt zu Boden (auch Rucksack und Kleidung), nach respawnZeit geht's am Startpunkt weiter
  legeRucksackAb(spielWelt, ziel, spielWelt.konfiguration.loot.todesVerfall);
  legeKleidungAb(spielWelt, ziel, spielWelt.konfiguration.loot.todesVerfall);
  ziel.inventar.forEach((eintrag, slot) => {
    if (!eintrag) return;
    const w = (slot / ziel.inventar.length) * Math.PI * 2;
    legeAufBoden(spielWelt, eintrag, ziel.x + Math.cos(w) * 14, ziel.y + Math.sin(w) * 14, spielWelt.konfiguration.loot.todesVerfall);
    ziel.inventar[slot] = null;
  });
  Object.assign(ziel, {
    tot: true,
    leben: 0,
    ausgeruestet: null,
    ausruestung: STANDARD_AUSRUESTUNG,
    nachladenRest: 0,
    arbeit: null,
    angriff: false,
    aktion: null,
    respawnRest: spielWelt.konfiguration.spieler.respawnZeit,
  });
  const verlorenesLevel = ziel.level;
  setzeLevelZurueck(ziel, spielWelt.konfiguration);
  spielWelt.melde(ziel.id, verlorenesLevel > 1 ? `Du bist gestorben – Level ${verlorenesLevel} ist weg, zurück auf Level 1` : 'Du bist gestorben');
}

/**
 * Nach einem Spielertod: Zombies im Umkreis verschwinden (kein "Spawn-Camping" am Todes-Loot). Normale Zombies
 * kommen nach der üblichen Respawn-Zeit an ihrem Spawnpunkt wieder, die Nacht-Horde nicht.
 */
export function raeumeZombiesWeg(spielWelt, x, y, radius) {
  if (!(radius > 0)) return;
  for (const z of [...spielWelt.alleVomTyp('zombie')]) {
    if (Math.hypot(z.x - x, z.y - y) > radius) continue;
    spielWelt.entfernen(z.id);
    if (!z.nacht && z.spawnIndex !== null) spielWelt.planeZombieRespawn(z.spawnIndex);
  }
}

/** Lärm (Schüsse, Kampf) lockt Zombies im Umkreis an – auch ohne Sichtkontakt. */
export function alarmiereZombies(spielWelt, x, y, radius, quelleId) {
  // Wände schlucken den Lärm: Wer drinnen ist, wird von Zombies draußen nicht gehört
  const quelle = spielWelt.holen(quelleId);
  if (quelle && sitztAmFeuer(quelle)) return;
  const quelleInnen = spielWelt.welt.istInnen(x, y);
  for (const z of spielWelt.alleVomTyp('zombie')) {
    if (z.zustand !== 'ruhend' && z.zielId !== null) continue;
    if (Math.hypot(z.x - x, z.y - y) > radius) continue;
    if (quelleInnen && !spielWelt.welt.istInnen(z.x, z.y)) continue;
    z.zielId = quelleId;
    z.zustand = 'verfolgend';
    z.letztesZielX = x;
    z.letztesZielY = y;
    z.pfad = null;
    z.pfadTimer = 0;
  }
}

import { brecheArbeitAb } from './arbeitSystem.js';
import { strahlGegenWaende, strahlTrifftKreis } from '../../../gemeinsam/physik/strahl.js';
import { bewegeKoerper } from '../../../gemeinsam/physik/bewegung.js';
import { NAHKAMPF_KEGEL, STANDARD_AUSRUESTUNG } from '../konfiguration/gegenstaende.js';
import { aktuelleWaffe, legeAufBoden, starteNachladen, zaehleMunition } from './inventarSystem.js';
import { lasseZombieLootFallen } from './lootSystem.js';

/**
 * Kampfsystem: Angriffe der Spieler (Schuss per Strahl, Nahkampf per Trefferkegel),
 * Schaden, Tod. fuegeSchadenZu() ist die EINZIGE Stelle, an der Leben durch Angriffe sinkt.
 */
const SCHUSS_ANIMATION = 0.15;
const NAHKAMPF_ANIMATION = 0.45;
const NAHKAMPF_HOERWEITE = 140;

export function aktualisiereKampf(spielWelt, dt) {
  for (const spieler of spielWelt.alleVomTyp('spieler')) {
    spieler.angriffsAbklingzeit = Math.max(0, spieler.angriffsAbklingzeit - dt);
    if (spieler.tot || !spieler.angriff || spieler.angriffsAbklingzeit > 0 || spieler.nachladenRest > 0) continue;
    const { eintrag, def } = aktuelleWaffe(spieler);
    if (def.kategorie === 'fernkampf') schiessen(spielWelt, spieler, eintrag, def);
    else nahkampf(spielWelt, spieler, def);
  }
}

function schiessen(spielWelt, spieler, eintrag, def) {
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
  eintrag.magazin -= 1;
  spieler.angriffsAbklingzeit = def.abklingzeit;
  spielWelt.setzeAktion(spieler, 'schiessen', SCHUSS_ANIMATION);
  // Ein "feuer" pro Abzug (Knall, Mündungsfeuer) – die Projektile kommen als einzelne "schuss"-Ereignisse
  spielWelt.ereignis({ typ: 'feuer', von: spieler.id, x: spieler.x, y: spieler.y, winkel: spieler.blick, waffe: def.ausruestung });

  for (let i = 0; i < (def.projektile ?? 1); i++) {
    const winkel = spieler.blick + (spielWelt.zufall.zahl() * 2 - 1) * (def.streuung ?? 0);
    feuereStrahl(spielWelt, spieler, winkel, def);
  }
  alarmiereZombies(spielWelt, spieler.x, spieler.y, spielWelt.konfiguration.zombie.hoerRadius, spieler.id);
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
    if (t !== null && t < bestT) {
      bestT = t;
      ziel = kandidat;
    }
  }
  spielWelt.ereignis({ typ: 'schuss', von: schuetze.id, x: schuetze.x, y: schuetze.y, zx: schuetze.x + dx * bestT, zy: schuetze.y + dy * bestT });
  if (ziel) fuegeSchadenZu(spielWelt, ziel, def.schaden, schuetze, winkel);
}

function nahkampf(spielWelt, spieler, def) {
  spieler.angriffsAbklingzeit = def.abklingzeit;
  spielWelt.setzeAktion(spieler, 'nahkampf', NAHKAMPF_ANIMATION);
  spielWelt.ereignis({ typ: 'nahkampf', von: spieler.id, x: spieler.x, y: spieler.y, winkel: spieler.blick });
  for (const ziel of moeglicheZiele(spielWelt, spieler)) {
    const abstand = Math.hypot(ziel.x - spieler.x, ziel.y - spieler.y) - radiusVon(spielWelt, ziel);
    if (abstand > def.reichweite) continue;
    const richtung = Math.atan2(ziel.y - spieler.y, ziel.x - spieler.x);
    const differenz = Math.abs(Math.atan2(Math.sin(richtung - spieler.blick), Math.cos(richtung - spieler.blick)));
    if (differenz <= NAHKAMPF_KEGEL) fuegeSchadenZu(spielWelt, ziel, def.schaden, spieler, richtung);
  }
  alarmiereZombies(spielWelt, spieler.x, spieler.y, NAHKAMPF_HOERWEITE, spieler.id);
}

function* moeglicheZiele(spielWelt, angreifer) {
  yield* spielWelt.alleVomTyp('zombie');
  if (!spielWelt.konfiguration.kampf.pvp) return;
  for (const s of spielWelt.alleVomTyp('spieler')) if (s !== angreifer && !s.tot) yield s;
}

function radiusVon(spielWelt, entitaet) {
  return entitaet.typ === 'zombie' ? entitaet.radius : spielWelt.konfiguration.spieler.radius;
}

/**
 * Schaden zufügen. @param quelle Angreifer (oder null) · @param winkel Trefferrichtung (für Blut & Rückstoß)
 */
export function fuegeSchadenZu(spielWelt, ziel, menge, quelle, winkel = 0) {
  if (ziel.tot || ziel.leben <= 0 || ziel.gottmodus) return;
  ziel.leben -= menge;
  if (ziel.arbeit) brecheArbeitAb(spielWelt, ziel, ziel.arbeit.art === 'schlafen' ? 'Aufgeschreckt!' : null);
  spielWelt.ereignis({ typ: 'treffer', x: ziel.x, y: ziel.y, winkel, ziel: ziel.typ });

  if (ziel.typ === 'zombie') {
    const r = spielWelt.konfiguration.kampf.rueckstoss * ziel.rueckstossFaktor;
    bewegeKoerper(ziel, Math.cos(winkel) * r, Math.sin(winkel) * r, ziel.radius, spielWelt.welt);
    if (quelle?.typ === 'spieler') {
      ziel.zielId = quelle.id;
      ziel.zustand = 'verfolgend';
      ziel.letztesZielX = quelle.x;
      ziel.letztesZielY = quelle.y;
    }
  }
  if (ziel.leben <= 0) toeten(spielWelt, ziel);
}

export function toeten(spielWelt, ziel) {
  spielWelt.ereignis({ typ: 'tod', id: ziel.id, x: ziel.x, y: ziel.y, ziel: ziel.typ });
  if (ziel.typ === 'zombie') {
    spielWelt.entfernen(ziel.id);
    spielWelt.planeZombieRespawn(ziel.spawnIndex);
    lasseZombieLootFallen(spielWelt, ziel.x, ziel.y);
    return;
  }
  // Spieler: alles fällt zu Boden, nach respawnZeit geht's am Startpunkt weiter
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
  spielWelt.melde(ziel.id, 'Du bist gestorben');
}

/** Lärm (Schüsse, Kampf) lockt Zombies im Umkreis an – auch ohne Sichtkontakt. */
export function alarmiereZombies(spielWelt, x, y, radius, quelleId) {
  for (const z of spielWelt.alleVomTyp('zombie')) {
    if (z.zustand !== 'ruhend' && z.zielId !== null) continue;
    if (Math.hypot(z.x - x, z.y - y) > radius) continue;
    z.zielId = quelleId;
    z.zustand = 'verfolgend';
    z.letztesZielX = x;
    z.letztesZielY = y;
    z.pfad = null;
    z.pfadTimer = 0;
  }
}

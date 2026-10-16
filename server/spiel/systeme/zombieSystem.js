import { bewegeKoerper } from '../../../gemeinsam/physik/bewegung.js';
import { sichtlinieFrei, wegFrei } from '../../../gemeinsam/physik/strahl.js';
import { lerpWinkel } from '../../../gemeinsam/mathe.js';
import { findePfad } from './pfadfindung.js';
import { fuegeSchadenZu } from './kampfSystem.js';
import { schlageTuer } from './tuerSystem.js';

/**
 * Zombie-KI pro Tick:
 *   ruhend      → schlurft langsam um seinen Spawnpunkt; sucht sichtbare Spieler im aggroRadius
 *                 (Wände blockieren die Sicht; Lärm weckt sie, siehe kampfSystem.alarmiereZombies)
 *   verfolgend  → direkt auf das Ziel zu (wenn Sicht UND Weg frei), sonst per A*-Weg um Möbel/Wände herum
 *                 zum Ziel bzw. zur zuletzt bekannten Position
 *   angreifend  → in Reichweite: Schaden mit Abklingzeit
 * Ziel weg / tot / zu weit → zurück zu ruhend. Zombies schieben sich gegenseitig auseinander.
 *
 * Türen: Der A*-Weg darf durch geschlossene Türen führen (teuer); steht der Zombie davor, schlägt er
 * dagegen, bis sie aufbricht (tuerSystem.schlageTuer).
 * Nacht: Taschenlampe an = von weiter weg sichtbar, aus = erst aus der Nähe; Zombies jagen schneller.
 * Nacht-Zombies (Horde) wittern Spieler im Umkreis HORDE_WITTERUNG und laufen zu deren letzter Position.
 *
 * Tempo, Schaden, Radius usw. kommen aus der Variante des Zombies (z.jagdGeschwindigkeit …),
 * Wahrnehmung (aggroRadius, verlierRadius …) aus konfiguration.zombie.
 */
const DREHGESCHWINDIGKEIT = 8; // je höher, desto schneller drehen sie sich zum Ziel
const TUER_KOSTEN = 8; // A*: eine geschlossene Tür "kostet" so viele Schritte Umweg
const TUER_SCHLAG_ABSTAND = 10; // px zwischen Zombie-Rand und Tür, ab dem er zuschlägt
const HORDE_WITTERUNG = 1100; // px
const PFAD_BUDGET = 4; // höchstens so viele A*-Suchen pro Tick (große Karte → teuer), der Rest wartet einen Tick
const HORDE_INTERVALL = 8; // Sekunden zwischen zwei "Witterungen"
const WEGPUNKT_ERREICHT = 8;
const ANGRIFF_ANIMATION = 0.5;

export function aktualisiereZombies(spielWelt, dt) {
  const k = spielWelt.konfiguration.zombie;
  const spielerRadius = spielWelt.konfiguration.spieler.radius;
  const lebendeSpieler = [...spielWelt.alleVomTyp('spieler')].filter((s) => !s.tot && !s.unsichtbar);
  const zombies = [...spielWelt.alleVomTyp('zombie')];
  spielWelt.pfadBudget = PFAD_BUDGET;

  for (const z of zombies) {
    z.angriffsAbklingzeit = Math.max(0, z.angriffsAbklingzeit - dt);
    if (z.nacht) wittere(spielWelt, z, lebendeSpieler, dt);
    const ziel = waehleZiel(spielWelt, z, lebendeSpieler, k);
    if (!ziel) {
      z.zustand = 'ruhend';
      z.zielId = null;
      z.pfad = null;
      schlurfe(spielWelt, z, dt, k);
      continue;
    }
    z.wanderZiel = null;

    const abstand = Math.hypot(ziel.x - z.x, ziel.y - z.y);
    const sicht = sichtlinieFrei(spielWelt.welt, z.x, z.y, ziel.x, ziel.y);
    if (sicht) {
      z.letztesZielX = ziel.x;
      z.letztesZielY = ziel.y;
    }

    const kontakt = z.radius + spielerRadius + 2;
    if (sicht && abstand <= k.angriffsReichweite + spielerRadius + (z.radius - k.radius)) {
      z.zustand = 'angreifend';
      z.blick = Math.atan2(ziel.y - z.y, ziel.x - z.x);
      if (z.angriffsAbklingzeit <= 0) {
        z.angriffsAbklingzeit = z.angriffsAbklingzeitMax;
        spielWelt.setzeAktion(z, 'angriff', ANGRIFF_ANIMATION);
        fuegeSchadenZu(spielWelt, ziel, z.angriffsSchaden, z, z.blick);
      }
    } else {
      z.zustand = 'verfolgend';
    }
    if (abstand > kontakt) bewegeZuZiel(spielWelt, z, ziel, sicht, dt, k);
  }

  trenneZombies(spielWelt, zombies);
  aktualisiereRespawns(spielWelt, dt, k);
}

/** Behält das aktuelle Ziel, solange es gültig ist – sonst nächster sichtbarer Spieler im Aggro-Radius (nachts: abhängig von der Lampe). */
function waehleZiel(spielWelt, z, lebendeSpieler, k) {
  if (z.zielId !== null) {
    const ziel = spielWelt.holen(z.zielId);
    const verlierRadius = z.nacht ? HORDE_WITTERUNG : k.verlierRadius; // die Horde ist hartnäckig
    if (ziel && !ziel.tot && !ziel.unsichtbar && Math.hypot(ziel.x - z.x, ziel.y - z.y) <= verlierRadius) return ziel;
    z.zielId = null;
  }
  let bester = null;
  let bestAbstand = Infinity;
  for (const s of lebendeSpieler) {
    const abstand = Math.hypot(s.x - z.x, s.y - z.y);
    // Im Dunkeln (Taschenlampe aus) fällt man erst aus der Nähe auf
    const bemerkRadius = !spielWelt.istNacht ? k.aggroRadius : k.aggroRadius * (s.lichtAn ? k.nachtLichtFaktor : k.dunkelFaktor);
    if (abstand < bemerkRadius && abstand < bestAbstand && sichtlinieFrei(spielWelt.welt, z.x, z.y, s.x, s.y)) {
      bester = s;
      bestAbstand = abstand;
    }
  }
  if (bester) {
    z.zielId = bester.id;
    z.letztesZielX = bester.x;
    z.letztesZielY = bester.y;
    z.pfad = null;
  }
  return bester;
}

function bewegeZuZiel(spielWelt, z, ziel, sicht, dt, k) {
  let punkt;
  if (sicht && wegFrei(spielWelt.welt, z.x, z.y, ziel.x, ziel.y, z.radius)) {
    punkt = ziel;
    z.pfad = null;
  } else {
    z.pfadTimer -= dt;
    if ((!z.pfad || z.pfadTimer <= 0) && spielWelt.pfadBudget > 0) {
      spielWelt.pfadBudget--;
      // Sieht er das Ziel, aber ein Hindernis (Auto, Tisch …) steht im Weg → Weg direkt zum Ziel suchen
      const zielX = sicht ? ziel.x : z.letztesZielX;
      const zielY = sicht ? ziel.y : z.letztesZielY;
      z.pfad = findePfad(spielWelt.welt, z.x, z.y, zielX, zielY, { tuerKosten: TUER_KOSTEN });
      z.pfadTimer = k.pfadIntervall + spielWelt.zufall.zahl() * 0.2; // gestaffelt, damit nicht alle im selben Tick rechnen
      if (!z.pfad) {
        z.zielId = null; // unerreichbar → aufgeben
        return;
      }
    }
    if (!z.pfad) return; // Budget aufgebraucht → nächsten Tick rechnen
    while (z.pfad.length > 0 && Math.hypot(z.pfad[0].x - z.x, z.pfad[0].y - z.y) < WEGPUNKT_ERREICHT) z.pfad.shift();
    if (z.pfad.length === 0) {
      // Zuletzt bekannte Position erreicht, Ziel nicht in Sicht → aufgeben
      z.zielId = null;
      return;
    }
    punkt = z.pfad[0];
    if (vorGeschlossenerTuer(spielWelt, z, punkt)) return;
  }
  const tempo = z.jagdGeschwindigkeit * (spielWelt.istNacht ? k.nachtTempoFaktor : 1);
  gehe(spielWelt, z, punkt, tempo, dt);
}

/** Liegt der nächste Wegpunkt in einer geschlossenen Tür und steht der Zombie davor → zuschlagen statt laufen. */
function vorGeschlossenerTuer(spielWelt, z, punkt) {
  const welt = spielWelt.welt;
  const g = welt.kachelGroesse;
  const tx = Math.floor(punkt.x / g);
  const ty = Math.floor(punkt.y / g);
  if (!welt.istGeschlosseneTuer(tx, ty)) return false;
  // Abstand Zombie-Mitte → Türkachel (Rechteck)
  const nx = Math.max(tx * g, Math.min(z.x, (tx + 1) * g));
  const ny = Math.max(ty * g, Math.min(z.y, (ty + 1) * g));
  if (Math.hypot(z.x - nx, z.y - ny) > z.radius + TUER_SCHLAG_ABSTAND) return false;
  z.blick = Math.atan2(punkt.y - z.y, punkt.x - z.x);
  z.zustand = 'angreifend';
  if (z.angriffsAbklingzeit <= 0) {
    z.angriffsAbklingzeit = z.angriffsAbklingzeitMax;
    spielWelt.setzeAktion(z, 'angriff', ANGRIFF_ANIMATION);
    schlageTuer(spielWelt, z, welt.tueren[welt.tuerBei(tx, ty)]);
  }
  return true;
}

/** Horde: ab und zu den nächsten Spieler wittern (auch ohne Sicht) und zu seiner Position aufbrechen. */
function wittere(spielWelt, z, lebendeSpieler, dt) {
  z.witterung = (z.witterung ?? spielWelt.zufall.zahl() * HORDE_INTERVALL) - dt;
  if (z.witterung > 0 || z.zielId !== null) return;
  z.witterung = HORDE_INTERVALL;
  let bester = null;
  let bestAbstand = HORDE_WITTERUNG;
  for (const s of lebendeSpieler) {
    const abstand = Math.hypot(s.x - z.x, s.y - z.y);
    if (abstand < bestAbstand) {
      bester = s;
      bestAbstand = abstand;
    }
  }
  if (!bester) return;
  Object.assign(z, { zielId: bester.id, zustand: 'verfolgend', letztesZielX: bester.x, letztesZielY: bester.y, pfad: null, pfadTimer: 0 });
}

/** Ruhende Zombies schlurfen ziellos in der Nähe ihres Spawnpunkts herum. */
function schlurfe(spielWelt, z, dt, k) {
  if (z.wanderZiel) {
    const vorherX = z.x;
    const vorherY = z.y;
    gehe(spielWelt, z, z.wanderZiel, z.wanderGeschwindigkeit, dt);
    const angekommen = Math.hypot(z.wanderZiel.x - z.x, z.wanderZiel.y - z.y) < WEGPUNKT_ERREICHT;
    const steckt = Math.hypot(z.x - vorherX, z.y - vorherY) < 0.05;
    if (angekommen || steckt) z.wanderZiel = null;
    return;
  }
  z.wanderTimer -= dt;
  if (z.wanderTimer > 0) return;
  z.wanderTimer = 3 + spielWelt.zufall.zahl() * 5;

  // Zu weit weg vom Spawn → in Richtung Heimat, sonst irgendwohin
  const weitWeg = Math.hypot(z.x - z.spawnX, z.y - z.spawnY) > k.wanderRadius * 0.6;
  const winkel = weitWeg ? Math.atan2(z.spawnY - z.y, z.spawnX - z.x) + (spielWelt.zufall.zahl() - 0.5) : spielWelt.zufall.zahl() * Math.PI * 2;
  const weite = 40 + spielWelt.zufall.zahl() * 90;
  const ziel = { x: z.x + Math.cos(winkel) * weite, y: z.y + Math.sin(winkel) * weite };
  if (Math.hypot(ziel.x - z.spawnX, ziel.y - z.spawnY) > k.wanderRadius) return;
  if (wegFrei(spielWelt.welt, z.x, z.y, ziel.x, ziel.y, z.radius)) z.wanderZiel = ziel;
}

function gehe(spielWelt, z, punkt, tempo, dt) {
  const winkel = Math.atan2(punkt.y - z.y, punkt.x - z.x);
  const weg = tempo * dt;
  bewegeKoerper(z, Math.cos(winkel) * weg, Math.sin(winkel) * weg, z.radius, spielWelt.welt);
  z.blick = lerpWinkel(z.blick, winkel, Math.min(1, dt * DREHGESCHWINDIGKEIT));
}

/** Überlappende Zombies auseinanderschieben (sonst stapeln sie sich zu einem Super-Zombie). */
function trenneZombies(spielWelt, zombies) {
  for (let i = 0; i < zombies.length; i++) {
    for (let j = i + 1; j < zombies.length; j++) {
      const a = zombies[i];
      const b = zombies[j];
      const mindestAbstand = a.radius + b.radius;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const abstand = Math.hypot(dx, dy);
      if (abstand >= mindestAbstand) continue;
      const nx = abstand > 0.01 ? dx / abstand : 1;
      const ny = abstand > 0.01 ? dy / abstand : 0;
      const schub = (mindestAbstand - abstand) / 2;
      bewegeKoerper(a, -nx * schub, -ny * schub, a.radius, spielWelt.welt);
      bewegeKoerper(b, nx * schub, ny * schub, b.radius, spielWelt.welt);
    }
  }
}

/** Getötete Zombies kommen nach respawnZeit am Spawnpunkt zurück – aber nie direkt vor den Augen eines Spielers. */
function aktualisiereRespawns(spielWelt, dt, k) {
  for (let i = spielWelt.zombieRespawns.length - 1; i >= 0; i--) {
    const eintrag = spielWelt.zombieRespawns[i];
    eintrag.rest -= dt;
    if (eintrag.rest > 0) continue;
    const spawn = spielWelt.karte.zombieSpawns[eintrag.spawnIndex];
    const spielerNah = [...spielWelt.alleVomTyp('spieler')].some(
      (s) => !s.tot && Math.hypot(s.x - spawn.x, s.y - spawn.y) < k.respawnMindestAbstand,
    );
    if (spielerNah) {
      eintrag.rest = 5; // später nochmal versuchen
      continue;
    }
    spielWelt.zombieRespawns.splice(i, 1);
    spielWelt.spawneZombie(eintrag.spawnIndex);
  }
}

import { bewegeKoerper } from '../../../gemeinsam/physik/bewegung.js';
import { sichtlinieFrei, wegFrei } from '../../../gemeinsam/physik/strahl.js';
import { lerpWinkel } from '../../../gemeinsam/mathe.js';
import { erzeugeZombie } from '../entitaeten/zombie.js';
import { findePfad } from './pfadfindung.js';
import { fuegeSchadenZu } from './kampfSystem.js';

/**
 * Zombie-KI pro Tick:
 *   ruhend      → sucht sichtbare Spieler im aggroRadius (Wände blockieren die Sicht; Lärm weckt sie, siehe kampfSystem)
 *   verfolgend  → direkt auf das Ziel zu (wenn Sicht UND Weg frei), sonst per A*-Weg um Möbel/Wände herum
 *                 zum Ziel bzw. zur zuletzt bekannten Position
 *   angreifend  → in Reichweite: Schaden mit Abklingzeit
 * Ziel weg / tot / zu weit → zurück zu ruhend. Zombies schieben sich gegenseitig auseinander.
 */
const DREHGESCHWINDIGKEIT = 8; // je höher, desto schneller drehen sie sich zum Ziel
const WEGPUNKT_ERREICHT = 8;
const ANGRIFF_ANIMATION = 0.5;

export function aktualisiereZombies(spielWelt, dt) {
  const k = spielWelt.konfiguration.zombie;
  const spielerRadius = spielWelt.konfiguration.spieler.radius;
  const lebendeSpieler = [...spielWelt.alleVomTyp('spieler')].filter((s) => !s.tot);
  const zombies = [...spielWelt.alleVomTyp('zombie')];

  for (const z of zombies) {
    z.angriffsAbklingzeit = Math.max(0, z.angriffsAbklingzeit - dt);
    const ziel = waehleZiel(spielWelt, z, lebendeSpieler, k);
    if (!ziel) {
      z.zustand = 'ruhend';
      z.zielId = null;
      z.pfad = null;
      continue;
    }

    const abstand = Math.hypot(ziel.x - z.x, ziel.y - z.y);
    const sicht = sichtlinieFrei(spielWelt.welt, z.x, z.y, ziel.x, ziel.y);
    if (sicht) {
      z.letztesZielX = ziel.x;
      z.letztesZielY = ziel.y;
    }

    const kontakt = k.radius + spielerRadius + 2;
    if (sicht && abstand <= k.angriffsReichweite + spielerRadius) {
      z.zustand = 'angreifend';
      z.blick = Math.atan2(ziel.y - z.y, ziel.x - z.x);
      if (z.angriffsAbklingzeit <= 0) {
        z.angriffsAbklingzeit = k.angriffsAbklingzeit;
        spielWelt.setzeAktion(z, 'angriff', ANGRIFF_ANIMATION);
        fuegeSchadenZu(spielWelt, ziel, k.angriffsSchaden, z, z.blick);
      }
    } else {
      z.zustand = 'verfolgend';
    }
    if (abstand > kontakt) bewegeZuZiel(spielWelt, z, ziel, sicht, dt, k);
  }

  trenneZombies(spielWelt, zombies, k.radius);
  aktualisiereRespawns(spielWelt, dt, k);
}

/** Behält das aktuelle Ziel, solange es gültig ist – sonst nächster sichtbarer Spieler im Aggro-Radius. */
function waehleZiel(spielWelt, z, lebendeSpieler, k) {
  if (z.zielId !== null) {
    const ziel = spielWelt.holen(z.zielId);
    if (ziel && !ziel.tot && Math.hypot(ziel.x - z.x, ziel.y - z.y) <= k.verlierRadius) return ziel;
    z.zielId = null;
  }
  let bester = null;
  let bestAbstand = k.aggroRadius;
  for (const s of lebendeSpieler) {
    const abstand = Math.hypot(s.x - z.x, s.y - z.y);
    if (abstand < bestAbstand && sichtlinieFrei(spielWelt.welt, z.x, z.y, s.x, s.y)) {
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
  if (sicht && wegFrei(spielWelt.welt, z.x, z.y, ziel.x, ziel.y, k.radius)) {
    punkt = ziel;
    z.pfad = null;
  } else {
    z.pfadTimer -= dt;
    if (!z.pfad || z.pfadTimer <= 0) {
      // Sieht er das Ziel, aber ein Hindernis (Auto, Tisch …) steht im Weg → Weg direkt zum Ziel suchen
      const zielX = sicht ? ziel.x : z.letztesZielX;
      const zielY = sicht ? ziel.y : z.letztesZielY;
      z.pfad = findePfad(spielWelt.welt, z.x, z.y, zielX, zielY);
      z.pfadTimer = k.pfadIntervall + spielWelt.zufall.zahl() * 0.2; // gestaffelt, damit nicht alle im selben Tick rechnen
      if (!z.pfad) {
        z.zielId = null; // unerreichbar → aufgeben
        return;
      }
    }
    while (z.pfad.length > 0 && Math.hypot(z.pfad[0].x - z.x, z.pfad[0].y - z.y) < WEGPUNKT_ERREICHT) z.pfad.shift();
    if (z.pfad.length === 0) {
      // Zuletzt bekannte Position erreicht, Ziel nicht in Sicht → aufgeben
      z.zielId = null;
      return;
    }
    punkt = z.pfad[0];
  }
  const winkel = Math.atan2(punkt.y - z.y, punkt.x - z.x);
  const weg = k.jagdGeschwindigkeit * dt;
  bewegeKoerper(z, Math.cos(winkel) * weg, Math.sin(winkel) * weg, k.radius, spielWelt.welt);
  z.blick = lerpWinkel(z.blick, winkel, Math.min(1, dt * DREHGESCHWINDIGKEIT));
}

/** Überlappende Zombies auseinanderschieben (sonst stapeln sie sich zu einem Super-Zombie). */
function trenneZombies(spielWelt, zombies, radius) {
  const mindestAbstand = radius * 2;
  for (let i = 0; i < zombies.length; i++) {
    for (let j = i + 1; j < zombies.length; j++) {
      const a = zombies[i];
      const b = zombies[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const abstand = Math.hypot(dx, dy);
      if (abstand >= mindestAbstand) continue;
      const nx = abstand > 0.01 ? dx / abstand : 1;
      const ny = abstand > 0.01 ? dy / abstand : 0;
      const schub = (mindestAbstand - abstand) / 2;
      bewegeKoerper(a, -nx * schub, -ny * schub, radius, spielWelt.welt);
      bewegeKoerper(b, nx * schub, ny * schub, radius, spielWelt.welt);
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
    spielWelt.hinzufuegen(
      erzeugeZombie({ id: spielWelt.neueId(), x: spawn.x, y: spawn.y, konfiguration: spielWelt.konfiguration, spawnIndex: eintrag.spawnIndex }),
    );
  }
}

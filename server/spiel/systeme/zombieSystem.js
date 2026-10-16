import { bewegeKoerper } from '../../../gemeinsam/physik/bewegung.js';
import { sichtlinieFrei, wegFrei } from '../../../gemeinsam/physik/strahl.js';
import { lerpWinkel } from '../../../gemeinsam/mathe.js';
import { findePfad } from '../../../gemeinsam/physik/pfadfindung.js';
import { fuegeSchadenZu } from './kampfSystem.js';
import { schlageTuer } from './tuerSystem.js';
import { abstandZumFahrzeug } from '../../../gemeinsam/physik/fahrzeug.js';

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
 * Engstellen (offene Türen): Wer der Türkachel am nächsten ist, reserviert sie (spielWelt.engstellen); andere
 * Zombies, die da durchwollen, warten davor (z.wartet) und weichen beim Auseinanderschieben komplett aus.
 * Steck-Erkennung misst die Bewegung NACH dem Auseinanderschieben (sonst "laufen" verkeilte Zombies scheinbar).
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
const STECK_ZEIT = 0.7; // Sekunden fast ohne Fortschritt → ausweichen
const PFAD_BUDGET = 4; // höchstens so viele A*-Suchen pro Tick (große Karte → teuer), der Rest wartet einen Tick
const HORDE_INTERVALL = 8; // Sekunden zwischen zwei "Witterungen"
const WEGPUNKT_ERREICHT = 8;
const GIB_AUF_ZEIT = 4; // Sekunden Ruhe nach einem unerreichbaren Ziel (spart A*-Suchen, Zaun hält Zombies fern)
const ENGSTELLE_VORAUS = [0, 14, 30, 46]; // px vor dem Zombie, die auf Türkacheln geprüft werden
const ANGRIFF_ANIMATION = 0.5;
const AUTO_SCHLAG_ABSTAND = 22; // px zwischen Zombie-Rand und Karosserie, ab dem er aufs Auto einschlägt (Autos blockieren kachelweise → Luft)

export function aktualisiereZombies(spielWelt, dt) {
  const k = spielWelt.konfiguration.zombie;
  const spielerRadius = spielWelt.konfiguration.spieler.radius;
  const lebendeSpieler = [...spielWelt.alleVomTyp('spieler')].filter((s) => !s.tot && !s.unsichtbar);
  const zombies = [...spielWelt.alleVomTyp('zombie')];
  spielWelt.pfadBudget = PFAD_BUDGET;
  // Tür-Reservierungen: letzte Runde gilt, diese Runde wird neu gesammelt (Kachel → { id, abstand })
  spielWelt.engstellenAlt = spielWelt.engstellen ?? new Map();
  spielWelt.engstellen = new Map();

  for (const z of zombies) {
    z.tickStartX = z.x;
    z.tickStartY = z.y;
    z.wartet = false;
    if (z.gibAuf > 0) z.gibAuf -= dt;
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
    const sicht = siehtZiel(spielWelt.welt, z, ziel);
    if (sicht) {
      z.letztesZielX = ziel.x;
      z.letztesZielY = ziel.y;
    }

    const kontakt = z.radius + spielerRadius + 2;
    // Sitzt das Ziel im Auto, schlägt der Zombie auf die Karosserie (nicht auf die Fahrer-Mitte) – siehe fahrzeugSystem.schlageFahrzeug
    const fz = ziel.fahrzeug ?? null;
    const autoAbstand = fz ? abstandZumFahrzeug(fz, z.x, z.y) - z.radius : 0;
    const inReichweite = fz ? autoAbstand <= AUTO_SCHLAG_ABSTAND : abstand <= k.angriffsReichweite + spielerRadius + (z.radius - k.radius);
    if (sicht && inReichweite) {
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
    if (fz ? !inReichweite : abstand > kontakt) {
      // Fahrer im Auto: nicht zur (blockierten) Fahrer-Mitte laufen, sondern an die nächste Stelle der Karosserie
      bewegeZuZiel(spielWelt, z, fz ? autoAnlaufpunkt(fz, z) : ziel, sicht, dt, k);
      z.jagtNoch = true;
    }
  }

  trenneZombies(spielWelt, zombies);
  for (const z of zombies) {
    if (!z.jagtNoch) continue;
    z.jagtNoch = false;
    pruefeObSteckt(spielWelt, z, Math.hypot(z.x - z.tickStartX, z.y - z.tickStartY), dt);
  }
  aktualisiereRespawns(spielWelt, dt, k);
}

/** Nächster Punkt rund ums Auto (außerhalb der Karosserie, im Abstand des Zombie-Radius) – dorthin läuft der Zombie. */
function autoAnlaufpunkt(fz, z) {
  const c = Math.cos(fz.winkel);
  const s = Math.sin(fz.winkel);
  const dx = z.x - fz.x;
  const dy = z.y - fz.y;
  const lx = dx * c + dy * s;
  const ly = -dx * s + dy * c;
  const hx = fz.laenge / 2 + z.radius + 1;
  const hy = fz.breite / 2 + z.radius + 1;
  let px = Math.max(-hx, Math.min(hx, lx));
  let py = Math.max(-hy, Math.min(hy, ly));
  if (Math.abs(lx) < hx && Math.abs(ly) < hy) {
    if (hx - Math.abs(lx) < hy - Math.abs(ly)) px = (lx < 0 ? -1 : 1) * hx;
    else py = (ly < 0 ? -1 : 1) * hy;
  }
  return { x: fz.x + px * c - py * s, y: fz.y + px * s + py * c };
}

/** Behält das aktuelle Ziel, solange es gültig ist – sonst nächster sichtbarer Spieler im Aggro-Radius (nachts: abhängig von der Lampe). */
function waehleZiel(spielWelt, z, lebendeSpieler, k) {
  if (z.zielId !== null) {
    const ziel = spielWelt.holen(z.zielId);
    const verlierRadius = z.nacht ? HORDE_WITTERUNG : k.verlierRadius; // die Horde ist hartnäckig
    if (ziel && !ziel.tot && !ziel.unsichtbar && Math.hypot(ziel.x - z.x, ziel.y - z.y) <= verlierRadius) return ziel;
    z.zielId = null;
  }
  if (z.gibAuf > 0) return null;
  let bester = null;
  let bestAbstand = Infinity;
  for (const s of lebendeSpieler) {
    const abstand = Math.hypot(s.x - z.x, s.y - z.y);
    // Im Dunkeln (Taschenlampe aus) fällt man erst aus der Nähe auf
    const bemerkRadius = !spielWelt.istNacht ? k.aggroRadius : k.aggroRadius * (s.lichtAn ? k.nachtLichtFaktor : k.dunkelFaktor);
    if (abstand < bemerkRadius && abstand < bestAbstand && siehtZiel(spielWelt.welt, z, s)) {
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

/**
 * Sicht auf ein Ziel: freie Linie UND nicht "drinnen versteckt" – wer im Haus ist, ist für Zombies draußen
 * unsichtbar (durch Fenster/Türen sehen sie nicht hinein). Hören (Schüsse, Sprinten) und die Nacht-Horde
 * (Witterung) gehen trotzdem.
 */
function siehtZiel(welt, z, ziel) {
  // Wer schon hinter dem Spieler her ist (hat ihn draußen gesehen), verliert ihn beim Betreten des Hauses nicht
  if (welt.istInnen(ziel.x, ziel.y) && !welt.istInnen(z.x, z.y) && z.zielId !== ziel.id) return false;
  return sichtlinieFrei(welt, z.x, z.y, ziel.x, ziel.y);
}

function bewegeZuZiel(spielWelt, z, ziel, sicht, dt, k) {
  // Gerade beim Ausweichen (siehe pruefeObSteckt)? Dann erst seitlich weg
  if (z.ausweichen) {
    z.ausweichen.rest -= dt;
    const w = z.ausweichen.winkel;
    if (z.ausweichen.rest <= 0) z.ausweichen = null;
    else return gehe(spielWelt, z, { x: z.x + Math.cos(w) * 50, y: z.y + Math.sin(w) * 50 }, z.jagdGeschwindigkeit, dt);
  }
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
        z.zielId = null; // unerreichbar (z. B. hinter einem Zaun) → aufgeben und eine Weile nicht neu suchen
        z.gibAuf = GIB_AUF_ZEIT;
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
  if (mussVorTuerWarten(spielWelt, z, punkt)) {
    z.wartet = true;
    z.blick = lerpWinkel(z.blick, Math.atan2(punkt.y - z.y, punkt.x - z.x), Math.min(1, dt * DREHGESCHWINDIGKEIT));
    return;
  }
  const tempo = z.jagdGeschwindigkeit * (spielWelt.istNacht ? k.nachtTempoFaktor : 1);
  gehe(spielWelt, z, punkt, tempo, dt);
}

/**
 * Engstellen-Vorfahrt: Liegt auf dem Weg direkt vor dem Zombie eine (offene) Türkachel, meldet er Anspruch an.
 * Der Zombie, der ihr am nächsten ist, hat Vorfahrt (Reservierung aus dem letzten Tick); alle anderen warten.
 */
function mussVorTuerWarten(spielWelt, z, punkt) {
  const welt = spielWelt.welt;
  const g = welt.kachelGroesse;
  const winkel = Math.atan2(punkt.y - z.y, punkt.x - z.x);
  for (const d of ENGSTELLE_VORAUS) {
    const tx = Math.floor((z.x + Math.cos(winkel) * d) / g);
    const ty = Math.floor((z.y + Math.sin(winkel) * d) / g);
    if (welt.tuerBei(tx, ty) < 0) continue;
    const kachel = ty * welt.breite + tx;
    const abstand = Math.hypot((tx + 0.5) * g - z.x, (ty + 0.5) * g - z.y);
    const anspruch = spielWelt.engstellen.get(kachel);
    if (!anspruch || abstand < anspruch.abstand) spielWelt.engstellen.set(kachel, { id: z.id, abstand });
    const inhaber = spielWelt.engstellenAlt.get(kachel);
    return !!inhaber && inhaber.id !== z.id && spielWelt.holen(inhaber.id) !== undefined && abstand > g * 0.5;
  }
  return false;
}

/**
 * Steck-Erkennung: Kommt ein jagender Zombie (z. B. zu zweit in einer Tür verkeilt) kaum voran, weicht er kurz
 * seitlich aus und plant den Weg neu. Türschläge zählen nicht als "stecken".
 */
function pruefeObSteckt(spielWelt, z, gelaufen, dt) {
  if (z.wartet) {
    z.steckt = 0;
    return;
  }
  if (z.zustand === 'angreifend' || z.ausweichen) return;
  const soll = z.jagdGeschwindigkeit * dt;
  z.steckt = gelaufen < soll * 0.25 ? (z.steckt ?? 0) + dt : Math.max(0, (z.steckt ?? 0) - dt * 2);
  if (z.steckt < STECK_ZEIT) return;
  z.steckt = 0;
  // Ein Stück zurück und schräg weg – macht dem Vordermann Platz
  const seite = spielWelt.zufall.zahl() < 0.5 ? -1 : 1;
  z.ausweichen = { winkel: z.blick + Math.PI + seite * (0.4 + spielWelt.zufall.zahl() * 0.6), rest: 0.4 };
  z.pfad = null;
  z.pfadTimer = 0;
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
  if (z.witterung > 0 || z.zielId !== null || z.gibAuf > 0) return;
  z.witterung = HORDE_INTERVALL;
  let bester = null;
  let bestAbstand = HORDE_WITTERUNG;
  for (const s of lebendeSpieler) {
    const abstand = Math.hypot(s.x - z.x, s.y - z.y);
    if (spielWelt.welt.istInnen(s.x, s.y) && !spielWelt.welt.istInnen(z.x, z.y)) continue; // drinnen = nicht zu wittern
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
      // Vorfahrt: Wer vor einer Tür wartet, weicht komplett; sonst wird der Ältere (kleinere ID) kaum geschoben
      const ueberlappung = mindestAbstand - abstand;
      let anteile = a.id < b.id ? [0.15, 0.85] : [0.85, 0.15];
      if (a.wartet !== b.wartet) anteile = a.wartet ? [1, 0] : [0, 1];
      const [anteilA, anteilB] = anteile;
      bewegeKoerper(a, -nx * ueberlappung * anteilA, -ny * ueberlappung * anteilA, a.radius, spielWelt.welt);
      bewegeKoerper(b, nx * ueberlappung * anteilB, ny * ueberlappung * anteilB, b.radius, spielWelt.welt);
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

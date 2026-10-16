import { STANDARD_AUSRUESTUNG } from '../konfiguration/gegenstaende.js';
import { toeten } from './kampfSystem.js';
import { gibStartausruestung } from './inventarSystem.js';
import { bettFehlt, spawnPunkt } from './spawnSystem.js';

/**
 * Überleben: Hunger & Durst sinken, bei 0 verliert man Leben; satt & getränkt heilt man langsam.
 * Tote Spieler werden nach respawnZeit an einem Startpunkt wiederbelebt – oder sofort per AKTION 'wiederbeleben'.
 */
export function aktualisiereUeberleben(spielWelt, dt) {
  const k = spielWelt.konfiguration.spieler;
  for (const spieler of spielWelt.alleVomTyp('spieler')) {
    if (spieler.tot) {
      spieler.respawnRest -= dt;
      if (spieler.respawnRest <= 0) wiederbeleben(spielWelt, spieler);
      continue;
    }
    spieler.statistik.ueberlebt += dt;
    if (spieler.gottmodus) continue; // Götter essen nicht
    spieler.hunger = Math.max(0, spieler.hunger - (k.hungerProMinute / 60) * dt);
    spieler.durst = Math.max(0, spieler.durst - (k.durstProMinute / 60) * dt);

    if (spieler.hunger <= 0 || spieler.durst <= 0) {
      spieler.leben -= k.hungerSchadenProSekunde * dt;
      if (spieler.leben <= 0) toeten(spielWelt, spieler);
    } else if (spieler.hunger >= k.regenerationAb && spieler.durst >= k.regenerationAb) {
      spieler.leben = Math.min(spieler.maxLeben, spieler.leben + k.regenerationProSekunde * dt);
    }
  }
}

/**
 * Neu beginnen (nach Countdown oder sofort per Knopf): neben dem eigenen Bett (Spawn Point, spawnSystem.js),
 * sonst an einem zufälligen Startpunkt. Liegt das Bett in einer anderen Zone, zieht der SpielServer den Spieler dorthin um.
 */
export function wiederbeleben(spielWelt, spieler) {
  const k = spielWelt.konfiguration.spieler;
  let start = null;
  if (spieler.spawn) {
    if (spieler.spawn.karte !== spielWelt.karte.daten.id) {
      spieler.zonenwechsel = { ziel: spieler.spawn.karte, ankunft: null, name: 'Dein Bett', spawn: true };
    } else {
      start = spawnPunkt(spielWelt, spieler.spawn);
      if (!start) {
        if (bettFehlt(spielWelt, spieler.spawn)) spieler.spawn = null;
        spielWelt.melde(spieler.id, 'Dein Bett ist weg oder zugebaut – du startest am normalen Startpunkt');
      }
    }
  }
  start ??= spielWelt.zufall.auswahl(spielWelt.karte.spielerStarts);
  Object.assign(spieler, {
    x: start.x,
    y: start.y,
    tot: false,
    leben: spieler.maxLeben,
    hunger: k.startHunger,
    durst: k.startDurst,
    respawnRest: 0,
    ausdauer: k.ausdauerMax,
    erschoepft: false,
    ausgeruestet: null,
    ausruestung: STANDARD_AUSRUESTUNG,
    arbeit: null,
  });
  // Neues Leben, neue Grundausrüstung (das alte Inventar liegt noch eine Weile am Todesort)
  if (spieler.inventar.every((e) => e === null)) gibStartausruestung(spieler, spielWelt.konfiguration);
}

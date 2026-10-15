import { STANDARD_AUSRUESTUNG } from '../konfiguration/gegenstaende.js';
import { toeten } from './kampfSystem.js';

/**
 * Überleben: Hunger & Durst sinken, bei 0 verliert man Leben; satt & getränkt heilt man langsam.
 * Tote Spieler werden nach respawnZeit an einem Startpunkt wiederbelebt.
 */
export function aktualisiereUeberleben(spielWelt, dt) {
  const k = spielWelt.konfiguration.spieler;
  for (const spieler of spielWelt.alleVomTyp('spieler')) {
    if (spieler.tot) {
      spieler.respawnRest -= dt;
      if (spieler.respawnRest <= 0) wiederbeleben(spielWelt, spieler);
      continue;
    }
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

function wiederbeleben(spielWelt, spieler) {
  const k = spielWelt.konfiguration.spieler;
  const start = spielWelt.zufall.auswahl(spielWelt.karte.spielerStarts);
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
  });
}

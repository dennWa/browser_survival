import { TICK_DAUER_S } from '../../../gemeinsam/konstanten.js';
import { wendeEingabeAn } from '../../../gemeinsam/physik/bewegung.js';
import { alarmiereZombies } from './kampfSystem.js';

/**
 * Verarbeitet die gepufferten Eingaben aller Spieler.
 * Jede Eingabe entspricht genau einem Tick Bewegung – identisch zur Client-Vorhersage.
 * Tote Spieler bewegen sich nicht, ihre Eingaben werden aber bestätigt (seq), damit der Client synchron bleibt.
 * Sprinten ist laut: Zombies im sprintHoerRadius werden aufmerksam.
 */
export function verarbeiteSpielerEingaben(spielWelt) {
  const parameter = spielWelt.physikParameter();
  const hoerRadius = spielWelt.konfiguration.spieler.sprintHoerRadius;
  for (const spieler of spielWelt.alleVomTyp('spieler')) {
    while (spieler.eingabePuffer.length > 0) {
      const eingabe = spieler.eingabePuffer.shift();
      if (!spieler.tot) {
        const sprintet = wendeEingabeAn(spieler, eingabe, spielWelt.welt, parameter, TICK_DAUER_S);
        spieler.angriff = eingabe.angriff;
        if (sprintet) alarmiereZombies(spielWelt, spieler.x, spieler.y, hoerRadius, spieler.id);
      }
      spieler.letzteVerarbeiteteSeq = eingabe.seq;
    }
  }
}

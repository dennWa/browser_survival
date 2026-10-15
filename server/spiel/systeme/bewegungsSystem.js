import { TICK_DAUER_S } from '../../../gemeinsam/konstanten.js';
import { wendeEingabeAn } from '../../../gemeinsam/physik/bewegung.js';

/**
 * Verarbeitet die gepufferten Eingaben aller Spieler.
 * Jede Eingabe entspricht genau einem Tick Bewegung – identisch zur Client-Vorhersage.
 */
export function verarbeiteSpielerEingaben(spielWelt) {
  const parameter = spielWelt.physikParameter();
  for (const spieler of spielWelt.alleVomTyp('spieler')) {
    while (spieler.eingabePuffer.length > 0) {
      const eingabe = spieler.eingabePuffer.shift();
      wendeEingabeAn(spieler, eingabe, spielWelt.welt, parameter, TICK_DAUER_S);
      spieler.letzteVerarbeiteteSeq = eingabe.seq;
    }
  }
}

import { TICK_DAUER_S } from '../../../gemeinsam/konstanten.js';
import { wendeEingabeAn } from '../../../gemeinsam/physik/bewegung.js';

/**
 * Verarbeitet die gepufferten Eingaben aller Spieler.
 * Jede Eingabe entspricht genau einem Tick Bewegung – identisch zur Client-Vorhersage.
 * Tote Spieler bewegen sich nicht, ihre Eingaben werden aber bestätigt (seq), damit der Client synchron bleibt.
 */
export function verarbeiteSpielerEingaben(spielWelt) {
  const parameter = spielWelt.physikParameter();
  for (const spieler of spielWelt.alleVomTyp('spieler')) {
    while (spieler.eingabePuffer.length > 0) {
      const eingabe = spieler.eingabePuffer.shift();
      if (!spieler.tot) {
        wendeEingabeAn(spieler, eingabe, spielWelt.welt, parameter, TICK_DAUER_S);
        spieler.angriff = eingabe.angriff;
      }
      spieler.letzteVerarbeiteteSeq = eingabe.seq;
    }
  }
}

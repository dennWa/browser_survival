import { STANDARD_AUSRUESTUNG } from '../konfiguration/gegenstaende.js';

/**
 * Spieler-Entität ("Männeken").
 * Entitäten sind reine Datenobjekte; Verhalten steckt in den Systemen (server/spiel/systeme/).
 * Felder mit Präfix-Kommentar [intern] verlassen nie den Server.
 */
export function erzeugeSpieler({ id, benutzername, x, y, konfiguration }) {
  return {
    id,
    typ: 'spieler',
    name: benutzername,
    x,
    y,
    blick: 0,
    leben: konfiguration.spieler.leben,
    maxLeben: konfiguration.spieler.leben,
    /** Was der Spieler in der Hand hält → bestimmt das Animationsset im Client */
    ausruestung: STANDARD_AUSRUESTUNG,
    // [intern]
    eingabePuffer: [],
    letzteEmpfangeneSeq: 0,
    letzteVerarbeiteteSeq: 0,
    inventar: [], // Phase 2
  };
}

/** Was andere Clients über einen Spieler erfahren. `seq` braucht der eigene Client zum Abgleich. */
export function spielerZuNetzwerk(s) {
  return { id: s.id, typ: s.typ, name: s.name, x: s.x, y: s.y, blick: s.blick, leben: s.leben, maxLeben: s.maxLeben, ausruestung: s.ausruestung, seq: s.letzteVerarbeiteteSeq };
}

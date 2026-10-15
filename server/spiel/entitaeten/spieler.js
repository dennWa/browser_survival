import { INVENTAR_PLAETZE } from '../../../gemeinsam/konstanten.js';
import { STANDARD_AUSRUESTUNG } from '../konfiguration/gegenstaende.js';

/**
 * Spieler-Entität ("Männeken").
 * Entitäten sind reine Datenobjekte; Verhalten steckt in den Systemen (server/spiel/systeme/).
 * Felder unter [intern] verlassen nie den Server; [privat] geht nur an den Spieler selbst (SPIELER_DATEN).
 */
export function erzeugeSpieler({ id, benutzername, x, y, konfiguration, admin = false }) {
  const k = konfiguration.spieler;
  return {
    id,
    typ: 'spieler',
    name: benutzername,
    x,
    y,
    blick: 0,
    leben: k.leben,
    maxLeben: k.leben,
    /** Was der Spieler in der Hand hält → bestimmt das Animationsset im Client */
    ausruestung: STANDARD_AUSRUESTUNG,
    /** Laufende Aktion für Animationen: 'schiessen' | 'nachladen' | 'nahkampf' | null */
    aktion: null,
    aktionTick: 0,
    aktionDauer: 0,
    tot: false,
    ausdauer: k.ausdauerMax,
    erschoepft: false,
    sprintet: false,
    /** Taschenlampe an? Aus = schlechter zu sehen (für Zombies UND Mitspieler) */
    lichtAn: true,
    /** Admin-Schalter (nur mit Admin-Recht setzbar) – öffentlich, damit alle sehen, wer schummelt */
    gottmodus: false,
    unsichtbar: false,
    // [privat]
    admin, // darf Admin-Befehle benutzen (kommt von der Authentifizierung)
    hunger: k.startHunger, // 100 = satt, 0 = verhungert
    durst: k.startDurst,
    /** INVENTAR_PLAETZE Plätze: null oder { defId, menge, magazin? } */
    inventar: new Array(INVENTAR_PLAETZE).fill(null),
    ausgeruestet: null, // Inventarplatz der Waffe in der Hand
    nachladenRest: 0, // Sekunden, solange nachgeladen wird
    respawnRest: 0,
    // [intern]
    eingabePuffer: [],
    aktionsPuffer: [],
    letzteEmpfangeneSeq: 0,
    letzteVerarbeiteteSeq: 0,
    angriff: false,
    angriffsAbklingzeit: 0,
  };
}

/** Was ALLE Clients über einen Spieler erfahren. `seq` braucht der eigene Client zum Abgleich. */
export function spielerZuNetzwerk(s) {
  return {
    id: s.id,
    typ: s.typ,
    name: s.name,
    x: s.x,
    y: s.y,
    blick: s.blick,
    leben: s.leben,
    maxLeben: s.maxLeben,
    ausruestung: s.ausruestung,
    aktion: s.aktion,
    aktionTick: s.aktionTick,
    aktionDauer: s.aktionDauer,
    tot: s.tot,
    // Ausdauer exakt (nicht gerundet): der eigene Client rechnet damit die Sprint-Vorhersage nach
    ausdauer: s.ausdauer,
    erschoepft: s.erschoepft,
    sprintet: s.sprintet,
    lichtAn: s.lichtAn,
    gottmodus: s.gottmodus,
    unsichtbar: s.unsichtbar,
    seq: s.letzteVerarbeiteteSeq,
  };
}

/** Private Daten nur für den Spieler selbst (Inventar, Hunger, Durst …). */
export function spielerDatenPrivat(s) {
  return {
    leben: Math.ceil(s.leben),
    maxLeben: s.maxLeben,
    hunger: Math.ceil(s.hunger),
    durst: Math.ceil(s.durst),
    inventar: s.inventar,
    ausgeruestet: s.ausgeruestet,
    nachladen: s.nachladenRest > 0,
    tot: s.tot,
    respawnIn: Math.ceil(s.respawnRest),
    admin: s.admin,
  };
}

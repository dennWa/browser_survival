import { BAUWERK_REICHWEITE } from '../../../gemeinsam/welt/bauwerke.js';
import { KISTE_PLAETZE } from '../../../gemeinsam/konstanten.js';
import { GEGENSTAENDE } from '../konfiguration/gegenstaende.js';
import { entferneSlot, fuegeZumInventarHinzu } from './inventarSystem.js';

/**
 * Lagerkisten (Bauwerk 'kiste', 16 Plätze, bauwerk.inhalt = Array aus null | { defId, menge, magazin? }).
 * Der Inhalt ist privat: er geht nur per NACHRICHT.KISTE an Spieler, die die Kiste gerade geöffnet haben
 * (spieler.offeneKiste). Geöffnet wird mit E (bauSystem.benutzeBauwerk → oeffneKiste); geschlossen per Knopf,
 * beim Wegtreten (aktualisiereKisten) oder wenn die Kiste verschwindet.
 */
const OEFFNEN_TOLERANZ = 24; // px mehr als BAUWERK_REICHWEITE, bevor sich die Kiste von selbst schließt

export function leererKistenInhalt() {
  return new Array(KISTE_PLAETZE).fill(null);
}

export function oeffneKiste(spielWelt, spieler, kiste) {
  spieler.offeneKiste = kiste.id;
  sendeKiste(spielWelt, spieler, kiste);
}

export function schliesseKiste(spielWelt, spieler) {
  if (spieler.offeneKiste === null) return;
  spielWelt.kistenNachrichten.push({ spielerId: spieler.id, id: spieler.offeneKiste, inhalt: null });
  spieler.offeneKiste = null;
}

function offeneKiste(spielWelt, spieler) {
  if (spieler.offeneKiste === null) return null;
  const b = spielWelt.welt.bauwerke.get(spieler.offeneKiste);
  return b?.typ === 'kiste' && b.inhalt ? b : null;
}

function sendeKiste(spielWelt, spieler, kiste) {
  spielWelt.kistenNachrichten.push({ spielerId: spieler.id, id: kiste.id, inhalt: kiste.inhalt.map((e) => (e ? { ...e } : null)) });
}

/** Alle, die diese Kiste offen haben, sehen die Änderung. */
function aktualisiereAnsichten(spielWelt, kiste) {
  for (const s of spielWelt.alleVomTyp('spieler')) if (s.offeneKiste === kiste.id) sendeKiste(spielWelt, s, kiste);
}

/** AKTION kisteLegen { slot }: Stapel aus dem Inventar in die Kiste (erst auf passende Stapel, dann freie Plätze). */
export function legeInKiste(spielWelt, spieler, slot) {
  const kiste = offeneKiste(spielWelt, spieler);
  const eintrag = spieler.inventar[slot];
  if (!kiste || !eintrag) return;
  const maxStapel = GEGENSTAENDE[eintrag.defId].stapelbar ?? 1;
  let rest = eintrag.menge;
  if (maxStapel > 1) {
    for (const platz of kiste.inhalt) {
      if (rest === 0) break;
      if (platz?.defId !== eintrag.defId || platz.menge >= maxStapel) continue;
      const passt = Math.min(rest, maxStapel - platz.menge);
      platz.menge += passt;
      rest -= passt;
    }
  }
  for (let i = 0; i < kiste.inhalt.length && rest > 0; i++) {
    if (kiste.inhalt[i] !== null) continue;
    const anzahl = Math.min(rest, maxStapel);
    kiste.inhalt[i] = { ...eintrag, menge: anzahl };
    rest -= anzahl;
  }
  if (rest === eintrag.menge) {
    spielWelt.melde(spieler.id, 'Die Kiste ist voll');
    return;
  }
  if (rest > 0) eintrag.menge = rest;
  else entferneSlot(spieler, slot);
  aktualisiereAnsichten(spielWelt, kiste);
}

/** AKTION kisteNehmen { slot }: Stapel von Kistenplatz `slot` ins Inventar. */
export function nimmAusKiste(spielWelt, spieler, slot) {
  const kiste = offeneKiste(spielWelt, spieler);
  const eintrag = kiste?.inhalt[slot];
  if (!eintrag) return;
  const rest = fuegeZumInventarHinzu(spieler, eintrag.defId, eintrag.menge, eintrag.magazin ?? 0);
  if (rest === eintrag.menge) {
    spielWelt.melde(spieler.id, 'Inventar voll');
    return;
  }
  if (rest > 0) eintrag.menge = rest;
  else kiste.inhalt[slot] = null;
  aktualisiereAnsichten(spielWelt, kiste);
}

/** Pro Tick: wer sich von der Kiste entfernt (oder wessen Kiste weg ist), dem schließt sie sich. */
export function aktualisiereKisten(spielWelt) {
  for (const s of spielWelt.alleVomTyp('spieler')) {
    if (s.offeneKiste === null) continue;
    const b = offeneKiste(spielWelt, s);
    const g = spielWelt.welt.kachelGroesse;
    if (!b || s.tot || s.fahrzeug || Math.hypot((b.tx + 0.5) * g - s.x, (b.ty + 0.5) * g - s.y) > BAUWERK_REICHWEITE + OEFFNEN_TOLERANZ) schliesseKiste(spielWelt, s);
  }
}

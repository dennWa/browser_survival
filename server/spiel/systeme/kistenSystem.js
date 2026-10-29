import { zusatzVon } from './inventarSystem.js';
import { BAUWERKE } from '../../../gemeinsam/welt/bauwerke.js';
import { BAUWERK_REICHWEITE } from '../../../gemeinsam/welt/bauwerke.js';
import { KISTE_PLAETZE } from '../../../gemeinsam/konstanten.js';
import { GEGENSTAENDE } from '../konfiguration/gegenstaende.js';
import { EINSTIEG_ABSTAND, abstandZumFahrzeug } from '../../../gemeinsam/physik/fahrzeug.js';
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

/**
 * AKTION kofferraum: Kofferraum des nächsten Autos in Reichweite (sitzt man drin: des eigenen) – gleiche Oberfläche wie die Lagerkiste.
 * `spieler.offeneKiste` ist dann 'f<Fahrzeug-ID>' statt der Bauwerk-ID.
 */
export function oeffneKofferraum(spielWelt, spieler) {
  let fz = spieler.fahrzeug;
  if (!fz) {
    let best = EINSTIEG_ABSTAND;
    for (const f of spielWelt.alleVomTyp('fahrzeug')) {
      const abstand = abstandZumFahrzeug(f, spieler.x, spieler.y);
      if (abstand <= best) {
        best = abstand;
        fz = f;
      }
    }
  }
  if (!fz?.kofferraum) return;
  spieler.offeneKiste = `f${fz.id}`;
  sendeKiste(spielWelt, spieler, fz);
}

export function schliesseKiste(spielWelt, spieler) {
  if (spieler.offeneKiste === null) return;
  spielWelt.kistenNachrichten.push({ spielerId: spieler.id, id: spieler.offeneKiste, inhalt: null });
  spieler.offeneKiste = null;
}

/** Der geöffnete Behälter: Lagerkiste (Bauwerk mit inhalt) oder Kofferraum ('f<ID>' → Fahrzeug mit kofferraum). */
function offeneKiste(spielWelt, spieler) {
  if (spieler.offeneKiste === null) return null;
  const k = behaelterVon(spielWelt, spieler.offeneKiste);
  return k;
}

function behaelterVon(spielWelt, ref) {
  if (typeof ref === 'string') {
    const fz = spielWelt.holen(Number(ref.slice(1)));
    return fz?.typ === 'fahrzeug' && fz.kofferraum ? { id: ref, inhalt: fz.kofferraum, titel: '🚗 Kofferraum', fahrzeug: fz } : null;
  }
  const b = spielWelt.welt.bauwerke.get(ref);
  return BAUWERKE[b?.typ]?.kiste && b.inhalt ? b : null; // Kiste oder Vorratsschrank
}

function sendeKiste(spielWelt, spieler, behaelter) {
  const k = behaelter.typ === 'fahrzeug' ? behaelterVon(spielWelt, `f${behaelter.id}`) : behaelter; // Kiste-Bauwerk oder Fahrzeug → einheitlich
  spielWelt.kistenNachrichten.push({ spielerId: spieler.id, id: k.id, titel: k.titel, inhalt: k.inhalt.map((e) => (e ? { ...e } : null)) });
}

/** Alle, die diesen Behälter offen haben, sehen die Änderung. */
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
  const rest = fuegeZumInventarHinzu(spieler, eintrag.defId, eintrag.menge, eintrag.magazin ?? 0, zusatzVon(eintrag));
  if (rest === eintrag.menge) {
    spielWelt.melde(spieler.id, 'Inventar voll');
    return;
  }
  if (rest > 0) eintrag.menge = rest;
  else kiste.inhalt[slot] = null;
  aktualisiereAnsichten(spielWelt, kiste);
}

/** Pro Tick: wer sich von der Kiste/dem Auto entfernt (oder wessen Behälter weg ist), dem schließt sie sich. */
export function aktualisiereKisten(spielWelt) {
  const g = spielWelt.welt.kachelGroesse;
  for (const s of spielWelt.alleVomTyp('spieler')) {
    if (s.offeneKiste === null) continue;
    const b = offeneKiste(spielWelt, s);
    if (!b || s.tot) {
      schliesseKiste(spielWelt, s);
      continue;
    }
    const weg = b.fahrzeug
      ? !s.fahrzeug && abstandZumFahrzeug(b.fahrzeug, s.x, s.y) > EINSTIEG_ABSTAND + OEFFNEN_TOLERANZ
      : s.fahrzeug || Math.hypot((b.tx + 0.5) * g - s.x, (b.ty + 0.5) * g - s.y) > BAUWERK_REICHWEITE + OEFFNEN_TOLERANZ;
    if (weg) schliesseKiste(spielWelt, s);
  }
}

import { zusatzVon } from './inventarSystem.js';
import { BAUWERKE } from '../../../gemeinsam/welt/bauwerke.js';
import { BAUWERK_REICHWEITE } from '../../../gemeinsam/welt/bauwerke.js';
import { KISTE_PLAETZE } from '../../../gemeinsam/konstanten.js';
import { GEGENSTAENDE } from '../konfiguration/gegenstaende.js';
import { EINSTIEG_ABSTAND, abstandZumFahrzeug } from '../../../gemeinsam/physik/fahrzeug.js';
import { entferneSlot, fuegeZumInventarHinzu } from './inventarSystem.js';
import { BEHAELTER, BEHAELTER_REICHWEITE, abstandZumBehaelter, findeBehaelter } from '../../../gemeinsam/welt/behaelter.js';
import { LOOT_TABELLEN } from '../konfiguration/lootTabellen.js';
import { pruefeEintrag } from '../spielstand.js';

/**
 * Lagerkisten (Bauwerk 'kiste', 16 Plätze, bauwerk.inhalt = Array aus null | { defId, menge, magazin? }).
 * Der Inhalt ist privat: er geht nur per NACHRICHT.KISTE an Spieler, die die Kiste gerade geöffnet haben
 * (spieler.offeneKiste). Geöffnet wird mit E (bauSystem.benutzeBauwerk → oeffneKiste); geschlossen per Knopf,
 * beim Wegtreten (aktualisiereKisten) oder wenn die Kiste verschwindet.
 *
 * Drei Sorten Behälter teilen sich Oberfläche und Aktionen (kisteLegen/-Nehmen/-Schliessen), unterschieden an spieler.offeneKiste:
 *   Zahl     → Bauwerk-ID (Lagerkiste, Vorratsschrank)
 *   'f<ID>'  → Kofferraum eines Fahrzeugs
 *   'm<Nr>'  → Runde 25: Behälter auf der Karte (Schrank, Kiste, Kühlschrank … – gemeinsam/welt/behaelter.js). Inhalt wird
 *              beim ersten Öffnen aus der Loot-Tabelle gewürfelt („durchsuchen“), leer geräumt füllt er sich nach
 *              loot.behaelterNachfuellen Sekunden neu. spielWelt.behaelter[nr] = { …findeBehaelter, inhalt | null, rest }.
 */
const OEFFNEN_TOLERANZ = 24; // px mehr als BAUWERK_REICHWEITE, bevor sich die Kiste von selbst schließt

export function leererKistenInhalt() {
  return new Array(KISTE_PLAETZE).fill(null);
}

export function oeffneKiste(spielWelt, spieler, kiste) {
  spieler.offeneKiste = kiste.id;
  sendeKiste(spielWelt, spieler, kiste);
}

/** Runde 25: Behälter der Karte anlegen (SpielWelt-Konstruktor). Inhalt kommt erst beim ersten Öffnen. */
export function initialisiereBehaelter(spielWelt) {
  spielWelt.behaelter = findeBehaelter(spielWelt.karte.daten).map((b) => ({ ...b, inhalt: null, rest: 0 }));
}

/** Würfelt den Inhalt eines Karten-Behälters (anzahl = Spanne laut BEHAELTER, Mengen wie normaler Loot). */
function fuelleBehaelter(spielWelt, b) {
  const def = BEHAELTER[b.art];
  const { zufall } = spielWelt;
  b.inhalt = new Array(def.plaetze).fill(null);
  const tabelle = LOOT_TABELLEN[def.loot] ?? [];
  const anzahl = tabelle.length ? zufall.ganzzahl(def.anzahl[0], def.anzahl[1]) : 0;
  for (let i = 0; i < anzahl; i++) {
    const { id: defId } = zufall.gewichteteAuswahl(tabelle);
    const item = GEGENSTAENDE[defId];
    const spanne = item.mengeBeimFund;
    const eintrag = { defId, menge: Math.min(spanne ? zufall.ganzzahl(spanne[0], spanne[1]) : 1, item.stapelbar ?? 1) };
    if (item.kategorie === 'fernkampf') eintrag.magazin = zufall.ganzzahl(0, Math.ceil(item.magazin / 2));
    const frei = b.inhalt.indexOf(null);
    if (frei < 0) break;
    b.inhalt[frei] = eintrag;
  }
}

/** AKTION behaelter { ziel: Nr }: Karten-Behälter öffnen (durchsuchen), wenn er in Reichweite ist. */
export function oeffneBehaelter(spielWelt, spieler, nr) {
  const b = spielWelt.behaelter?.[nr];
  if (!b || spieler.fahrzeug) return;
  if (abstandZumBehaelter(b, spieler.x, spieler.y, spielWelt.welt.kachelGroesse) > BEHAELTER_REICHWEITE + 8) return;
  const neu = b.inhalt === null;
  if (neu) fuelleBehaelter(spielWelt, b);
  spieler.offeneKiste = b.id;
  spielWelt.ereignis({ typ: 'behaelterAuf', x: b.x * spielWelt.welt.kachelGroesse, y: b.y * spielWelt.welt.kachelGroesse, art: b.art, von: spieler.id });
  if (neu && b.inhalt.every((e) => e === null)) spielWelt.melde(spieler.id, `${BEHAELTER[b.art].symbol} ${BEHAELTER[b.art].name}: leider leer`);
  sendeKiste(spielWelt, spieler, behaelterVon(spielWelt, b.id));
}

/** Pro Sekunde: leer geräumte Karten-Behälter füllen sich nach einer Weile neu (nur wenn gerade niemand hineinschaut). */
export function aktualisiereBehaelter(spielWelt, dt) {
  const dauer = spielWelt.konfiguration.loot.behaelterNachfuellen ?? 1800;
  for (const b of spielWelt.behaelter ?? []) {
    if (b.inhalt === null || b.inhalt.some((e) => e !== null)) {
      b.rest = dauer;
      continue;
    }
    b.rest -= dt;
    if (b.rest > 0) continue;
    if ([...spielWelt.alleVomTyp('spieler')].some((s) => s.offeneKiste === b.id)) continue;
    b.inhalt = null; // beim nächsten Öffnen neu gewürfelt
  }
}

/** Weltstand: Inhalte schon durchsuchter Behälter (Nr + Art + Position zum Wiederfinden, falls sich die Karte ändert). */
export function behaelterSpeichern(spielWelt) {
  return (spielWelt.behaelter ?? []).filter((b) => b.inhalt !== null).map((b) => ({ nr: b.nr, art: b.art, x: b.x, y: b.y, inhalt: b.inhalt.map((e) => (e ? { ...e } : null)) }));
}

export function behaelterLaden(spielWelt, liste) {
  if (!Array.isArray(liste)) return;
  for (const roh of liste) {
    const b = spielWelt.behaelter?.[roh?.nr];
    if (!b || b.art !== roh.art || b.x !== roh.x || b.y !== roh.y || !Array.isArray(roh.inhalt)) continue;
    b.inhalt = new Array(BEHAELTER[b.art].plaetze).fill(null);
    roh.inhalt.slice(0, b.inhalt.length).forEach((e, i) => (b.inhalt[i] = pruefeEintrag(e)));
  }
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

/** Der geöffnete Behälter: Lagerkiste (Bauwerk mit inhalt), Kofferraum ('f<ID>') oder Karten-Behälter ('m<Nr>'). */
function offeneKiste(spielWelt, spieler) {
  if (spieler.offeneKiste === null) return null;
  const k = behaelterVon(spielWelt, spieler.offeneKiste);
  return k;
}

function behaelterVon(spielWelt, ref) {
  if (typeof ref === 'string' && ref[0] === 'm') {
    const b = spielWelt.behaelter?.[Number(ref.slice(1))];
    if (!b?.inhalt) return null;
    const def = BEHAELTER[b.art];
    return { id: ref, inhalt: b.inhalt, titel: `${def.symbol} ${def.name}`, karte: b };
  }
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
      : b.karte
        ? s.fahrzeug || abstandZumBehaelter(b.karte, s.x, s.y, g) > BEHAELTER_REICHWEITE + OEFFNEN_TOLERANZ
        : s.fahrzeug || Math.hypot((b.tx + 0.5) * g - s.x, (b.ty + 0.5) * g - s.y) > BAUWERK_REICHWEITE + OEFFNEN_TOLERANZ;
    if (weg) schliesseKiste(spielWelt, s);
  }
}

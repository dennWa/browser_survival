import { AUFHEB_REICHWEITE, INVENTAR_PLAETZE } from '../../../gemeinsam/konstanten.js';
import { BAUWERK_REICHWEITE } from '../../../gemeinsam/welt/bauwerke.js';
import { AKTIONEN } from '../../../gemeinsam/protokoll.js';
import { GEGENSTAENDE, STANDARD_AUSRUESTUNG, UNBEWAFFNET } from '../konfiguration/gegenstaende.js';
import { erzeugeGegenstand } from '../entitaeten/gegenstand.js';
import { wiederbeleben } from './ueberlebenSystem.js';
import { fuehreAdminBefehlAus } from './adminSystem.js';
import { benutzeTuer, verstaerkeTuer as verstaerkeNaechsteTuer } from './tuerSystem.js';
import { starteAbbau, starteSchlafen } from './arbeitSystem.js';
import { stelleHer } from './craftingSystem.js';
import { benutzeBauwerk, feuer, platziere } from './bauSystem.js';
import { setzeSkillpunkt } from './levelSystem.js';

/**
 * Inventar: Aufheben, Benutzen (Essen/Trinken/Medizin), Aus-/Abrüsten, Ablegen, Nachladen.
 * Außerdem die übrigen AKTIONEN: Tür (→ tuerSystem.js), Taschenlampe, Wiederbeleben, Admin-Befehle (→ adminSystem.js).
 * Aktionen kommen als Nachricht AKTION, werden gepuffert und hier pro Tick abgearbeitet.
 */

/** Etwas Spielraum für Latenz: Client prüft AUFHEB_REICHWEITE, Server erlaubt minimal mehr. */
const AUFHEB_TOLERANZ = 12;

/** Waffe in der Hand: { eintrag (Inventarplatz oder null), def (Item-Definition oder UNBEWAFFNET) } */
export function aktuelleWaffe(spieler) {
  const eintrag = spieler.ausgeruestet !== null ? spieler.inventar[spieler.ausgeruestet] : null;
  return eintrag ? { eintrag, def: GEGENSTAENDE[eintrag.defId] } : { eintrag: null, def: UNBEWAFFNET };
}

export function verarbeiteAktionen(spielWelt) {
  for (const spieler of spielWelt.alleVomTyp('spieler')) {
    while (spieler.aktionsPuffer.length > 0) {
      const aktion = spieler.aktionsPuffer.shift();
      if (aktion.art === AKTIONEN.WIEDERBELEBEN) {
        if (spieler.tot) wiederbeleben(spielWelt, spieler);
        continue;
      }
      if (aktion.art === AKTIONEN.ADMIN) {
        fuehreAdminBefehlAus(spielWelt, spieler, aktion.befehl); // geht auch im Tod (z. B. Zombies wegräumen)
        continue;
      }
      if (spieler.tot) continue;
      switch (aktion.art) {
        case AKTIONEN.LICHT:
          spieler.lichtAn = !spieler.lichtAn;
          break;
        case AKTIONEN.TUER:
          benutzeTuer(spielWelt, spieler);
          break;
        case AKTIONEN.ABBAUEN:
          starteAbbau(spielWelt, spieler);
          break;
        case AKTIONEN.SCHLAFEN:
          starteSchlafen(spielWelt, spieler);
          break;
        case AKTIONEN.HERSTELLEN:
          stelleHer(spielWelt, spieler, aktion.rezept);
          break;
        case AKTIONEN.AUFHEBEN:
          aufheben(spielWelt, spieler);
          break;
        case AKTIONEN.BENUTZEN:
          benutzen(spielWelt, spieler, aktion.slot);
          break;
        case AKTIONEN.ABLEGEN:
          ablegen(spielWelt, spieler, aktion.slot);
          break;
        case AKTIONEN.TAUSCHEN:
          tausche(spieler, aktion.slot, aktion.ziel);
          break;
        case AKTIONEN.RUCKSACK_ABLEGEN:
          legeRucksackAb(spielWelt, spieler);
          break;
        case AKTIONEN.PLATZIEREN:
          platziere(spielWelt, spieler, aktion.slot, aktion.tx, aktion.ty);
          break;
        case AKTIONEN.FEUER:
          if (!feuer(spielWelt, spieler)) benutzeTuer(spielWelt, spieler);
          break;
        case AKTIONEN.BAUWERK:
          benutzeBauwerk(spielWelt, spieler);
          break;
        case AKTIONEN.SKILL:
          setzeSkillpunkt(spielWelt, spieler, aktion.skill);
          break;
        case AKTIONEN.NACHLADEN:
          starteNachladen(spielWelt, spieler);
          break;
      }
    }
  }
}

/** Läuft das Nachladen ab, wird das Magazin aus der Munition im Inventar gefüllt. */
export function aktualisiereNachladen(spielWelt, dt) {
  for (const spieler of spielWelt.alleVomTyp('spieler')) {
    if (spieler.nachladenRest <= 0) continue;
    spieler.nachladenRest -= dt;
    if (spieler.nachladenRest > 0) continue;
    spieler.nachladenRest = 0;
    const { eintrag, def } = aktuelleWaffe(spieler);
    if (!eintrag || def.kategorie !== 'fernkampf') continue;
    eintrag.magazin += entnehmeMunition(spieler, def.munition, def.magazin - eintrag.magazin);
  }
}

/**
 * Legt Gegenstände ins Inventar: erst auf passende Stapel, dann in freie Plätze.
 * @returns Menge, die NICHT mehr hineingepasst hat
 */
export function fuegeZumInventarHinzu(spieler, defId, menge, magazin = 0) {
  const def = GEGENSTAENDE[defId];
  const maxStapel = def.stapelbar ?? 1;
  let rest = menge;
  if (maxStapel > 1) {
    for (const eintrag of spieler.inventar) {
      if (rest === 0) break;
      if (eintrag?.defId !== defId || eintrag.menge >= maxStapel) continue;
      const passt = Math.min(rest, maxStapel - eintrag.menge);
      eintrag.menge += passt;
      rest -= passt;
    }
  }
  for (let slot = 0; slot < spieler.inventar.length && rest > 0; slot++) {
    if (spieler.inventar[slot] !== null) continue;
    const anzahl = Math.min(rest, maxStapel);
    spieler.inventar[slot] = def.kategorie === 'fernkampf' ? { defId, menge: 1, magazin } : { defId, menge: anzahl };
    rest -= anzahl;
  }
  return rest;
}

export function zaehleMunition(spieler, defId) {
  return spieler.inventar.reduce((summe, e) => summe + (e?.defId === defId ? e.menge : 0), 0);
}

export function aktualisiereAusruestung(spieler) {
  spieler.ausruestung = aktuelleWaffe(spieler).def.ausruestung ?? STANDARD_AUSRUESTUNG;
}

export function starteNachladen(spielWelt, spieler) {
  const { eintrag, def } = aktuelleWaffe(spieler);
  if (!eintrag || def.kategorie !== 'fernkampf' || spieler.nachladenRest > 0) return false;
  if (eintrag.magazin >= def.magazin) return false;
  if (zaehleMunition(spieler, def.munition) === 0) {
    spielWelt.melde(spieler.id, `Keine ${GEGENSTAENDE[def.munition].name}`);
    return false;
  }
  spieler.nachladenRest = def.nachladezeit;
  spielWelt.setzeAktion(spieler, 'nachladen', def.nachladezeit);
  return true;
}

// ---------------------------------------------------------------------------

function aufheben(spielWelt, spieler) {
  let naechster = null;
  let bestAbstand = AUFHEB_REICHWEITE + AUFHEB_TOLERANZ;
  for (const g of spielWelt.alleVomTyp('gegenstand')) {
    const abstand = Math.hypot(g.x - spieler.x, g.y - spieler.y);
    if (abstand <= bestAbstand) {
      naechster = g;
      bestAbstand = abstand;
    }
  }
  if (!naechster) return;

  const def = GEGENSTAENDE[naechster.defId];
  // Rucksack direkt anlegen, wenn man noch keinen trägt
  if (def.kategorie === 'rucksack' && !spieler.rucksack) {
    spielWelt.entfernen(naechster.id);
    legeRucksackAn(spielWelt, spieler, naechster.defId);
    return;
  }
  const rest = fuegeZumInventarHinzu(spieler, naechster.defId, naechster.menge, naechster.magazin ?? 0);
  if (rest === naechster.menge) {
    spielWelt.melde(spieler.id, 'Inventar voll');
    return;
  }
  const aufgehoben = naechster.menge - rest;
  if (rest > 0) {
    naechster.menge = rest;
    spielWelt.gegenstaendeVersion++;
  } else {
    spielWelt.entfernen(naechster.id);
  }
  spielWelt.melde(spieler.id, aufgehoben > 1 ? `${def.name} ×${aufgehoben}` : def.name);

  // Erste Waffe automatisch in die Hand nehmen
  if (spieler.ausgeruestet === null && (def.kategorie === 'nahkampf' || def.kategorie === 'fernkampf')) {
    const slot = spieler.inventar.findIndex((e) => e?.defId === naechster.defId);
    if (slot >= 0) {
      spieler.ausgeruestet = slot;
      aktualisiereAusruestung(spieler);
    }
  }
}

function benutzen(spielWelt, spieler, slot) {
  const eintrag = spieler.inventar[slot];
  if (!eintrag) return;
  const def = GEGENSTAENDE[eintrag.defId];
  switch (def.kategorie) {
    case 'nahrung':
      spieler.hunger = Math.min(100, spieler.hunger + def.naehrwert);
      verbrauche(spieler, slot);
      break;
    case 'getraenk':
      spieler.durst = Math.min(100, spieler.durst + def.durstwert);
      verbrauche(spieler, slot);
      break;
    case 'medizin':
      if (spieler.leben >= spieler.maxLeben) {
        spielWelt.melde(spieler.id, 'Du bist nicht verletzt');
        return;
      }
      spieler.leben = Math.min(spieler.maxLeben, spieler.leben + def.heilung);
      verbrauche(spieler, slot);
      break;
    case 'nahkampf':
    case 'fernkampf':
      // Gleiche Waffe nochmal → wegstecken
      spieler.ausgeruestet = spieler.ausgeruestet === slot ? null : slot;
      spieler.nachladenRest = 0;
      aktualisiereAusruestung(spieler);
      break;
    case 'munition':
      spielWelt.melde(spieler.id, 'Munition wird beim Nachladen (R) verwendet');
      break;
    case 'rucksack':
      if (spieler.rucksack) {
        wechsleRucksack(spielWelt, spieler, slot);
        return;
      }
      spieler.inventar[slot] = null;
      legeRucksackAn(spielWelt, spieler, eintrag.defId);
      break;
    case 'bauwerk':
    case 'werkzeug':
      // Aufstellen läuft über AKTION 'platzieren' (Vorschau im Client); Feuerzeug wirkt über F am Lagerfeuer
      spielWelt.melde(spieler.id, def.baut || def.bauwerk ? 'Platz wählen und bestätigen' : def.beschreibung ?? def.name);
      break;
    case 'samen':
      pflanzeInsBeet(spielWelt, spieler, slot, def);
      break;
    case 'material':
      if (eintrag.defId === 'bretter') verstaerkeTuer(spielWelt, spieler, slot);
      else spielWelt.melde(spieler.id, `${def.name}: zum Bauen an der Werkbank`);
      break;
  }
}

/** Bretter vor einer geschlossenen Tür → Tür hält mehr aus. */
function verstaerkeTuer(spielWelt, spieler, slot) {
  if (verstaerkeNaechsteTuer(spielWelt, spieler)) verbrauche(spieler, slot);
}

/** Samen benutzen = ins nächste leere Beet in Reichweite pflanzen (wie E am Beet). */
function pflanzeInsBeet(spielWelt, spieler, slot, def) {
  const beet = spielWelt.welt.naechstesBauwerk(spieler.x, spieler.y, BAUWERK_REICHWEITE, (b) => b.typ === 'beet' && !b.pflanze);
  if (!beet) {
    spielWelt.melde(spieler.id, 'Kein freies Beet in der Nähe – erst mit der Hacke eins anlegen');
    return;
  }
  benutzeBauwerk(spielWelt, spieler, beet.id, def.pflanze);
}

export function verbrauche(spieler, slot) {
  const eintrag = spieler.inventar[slot];
  eintrag.menge -= 1;
  if (eintrag.menge <= 0) entferneSlot(spieler, slot);
}

function entferneSlot(spieler, slot) {
  spieler.inventar[slot] = null;
  if (spieler.ausgeruestet === slot) {
    spieler.ausgeruestet = null;
    spieler.nachladenRest = 0;
    aktualisiereAusruestung(spieler);
  }
}

function ablegen(spielWelt, spieler, slot) {
  const eintrag = spieler.inventar[slot];
  if (!eintrag) return;
  legeAufBoden(spielWelt, eintrag, spieler.x + Math.cos(spieler.blick) * 18, spieler.y + Math.sin(spieler.blick) * 18);
  entferneSlot(spieler, slot);
}

/**
 * Drag & Drop im Inventar: Inhalt zweier Plätze tauschen; gleiche stapelbare Items werden zusammengelegt.
 * Die Waffe in der Hand "wandert mit" (ausgeruestet zeigt danach auf ihren neuen Platz).
 */
export function tausche(spieler, von, nach) {
  const n = spieler.inventar.length;
  if (!Number.isInteger(von) || !Number.isInteger(nach) || von === nach || von < 0 || nach < 0 || von >= n || nach >= n) return;
  const a = spieler.inventar[von];
  const b = spieler.inventar[nach];
  if (!a) return;
  const maxStapel = GEGENSTAENDE[a.defId].stapelbar ?? 1;
  if (b && b.defId === a.defId && maxStapel > 1 && b.menge < maxStapel) {
    const passt = Math.min(a.menge, maxStapel - b.menge);
    b.menge += passt;
    a.menge -= passt;
    if (a.menge === 0) entferneSlot(spieler, von);
    return;
  }
  spieler.inventar[von] = b;
  spieler.inventar[nach] = a;
  if (spieler.ausgeruestet === von) spieler.ausgeruestet = nach;
  else if (spieler.ausgeruestet === nach) spieler.ausgeruestet = von;
}

/**
 * Rucksack tauschen (man trägt schon einen): Der neue kommt auf den Rücken, der Inhalt des alten wandert mit
 * (erst in den neuen Rucksack, dann ins Grund-Inventar, Rest fällt). Der alte Rucksack landet im Inventar/Boden.
 */
export function wechsleRucksack(spielWelt, spieler, slot) {
  const neu = spieler.inventar[slot];
  const neuDef = GEGENSTAENDE[neu?.defId];
  if (neuDef?.kategorie !== 'rucksack' || !spieler.rucksack) return;
  const alt = spieler.rucksack;
  spieler.inventar[slot] = null;
  const mitnehmen = [];
  for (let i = INVENTAR_PLAETZE; i < spieler.inventar.length; i++) {
    if (spieler.inventar[i]) mitnehmen.push({ eintrag: spieler.inventar[i], warAusgeruestet: spieler.ausgeruestet === i });
  }
  if (spieler.ausgeruestet !== null && spieler.ausgeruestet >= INVENTAR_PLAETZE) spieler.ausgeruestet = null;
  spieler.rucksack = neu.defId;
  spieler.inventar.length = INVENTAR_PLAETZE + neuDef.plaetze;
  spieler.inventar.fill(null, INVENTAR_PLAETZE);
  const frei = () => {
    for (let i = INVENTAR_PLAETZE; i < spieler.inventar.length; i++) if (!spieler.inventar[i]) return i;
    return spieler.inventar.findIndex((e, i) => i < INVENTAR_PLAETZE && !e);
  };
  for (const { eintrag, warAusgeruestet } of mitnehmen) {
    const ziel = frei();
    if (ziel < 0) {
      legeAufBoden(spielWelt, eintrag, spieler.x, spieler.y);
      continue;
    }
    spieler.inventar[ziel] = eintrag;
    if (warAusgeruestet) spieler.ausgeruestet = ziel;
  }
  const platz = frei();
  if (platz >= 0) spieler.inventar[platz] = { defId: alt, menge: 1 };
  else legeAufBoden(spielWelt, { defId: alt, menge: 1 }, spieler.x, spieler.y);
  aktualisiereAusruestung(spieler);
  spielWelt.melde(spieler.id, `${neuDef.name} angelegt (+${neuDef.plaetze} Plätze)`);
}

/** Rucksack anlegen: Inventar wächst um def.plaetze leere Plätze. */
export function legeRucksackAn(spielWelt, spieler, defId) {
  const def = GEGENSTAENDE[defId];
  if (def?.kategorie !== 'rucksack' || spieler.rucksack) return false;
  spieler.rucksack = defId;
  spieler.inventar.length = INVENTAR_PLAETZE + def.plaetze;
  spieler.inventar.fill(null, INVENTAR_PLAETZE); // neue Plätze leer
  spielWelt?.melde(spieler.id, `${def.name} angelegt: +${def.plaetze} Plätze (I = Inventar)`);
  return true;
}

/**
 * Rucksack ablegen: Inhalt rückt in freie Plätze des Grund-Inventars; was nicht passt, fällt daneben auf den Boden.
 * @param verfall wie legeAufBoden (beim Tod: Todes-Verfall)
 */
export function legeRucksackAb(spielWelt, spieler, verfall = null) {
  if (!spieler.rucksack) return;
  const x = spieler.x + Math.cos(spieler.blick) * 18;
  const y = spieler.y + Math.sin(spieler.blick) * 18;
  for (let slot = INVENTAR_PLAETZE; slot < spieler.inventar.length; slot++) {
    const e = spieler.inventar[slot];
    if (!e) continue;
    const frei = spieler.inventar.findIndex((f, i) => i < INVENTAR_PLAETZE && f === null);
    if (frei >= 0) {
      spieler.inventar[frei] = e;
      if (spieler.ausgeruestet === slot) spieler.ausgeruestet = frei;
    } else {
      if (spieler.ausgeruestet === slot) spieler.ausgeruestet = null;
      legeAufBoden(spielWelt, e, x + (slot % 3) * 6 - 6, y + 6, verfall);
    }
  }
  spieler.inventar.length = INVENTAR_PLAETZE;
  legeAufBoden(spielWelt, { defId: spieler.rucksack, menge: 1 }, x, y, verfall);
  spieler.rucksack = null;
  aktualisiereAusruestung(spieler);
}

/** Legt einen Inventareintrag als Gegenstand in die Welt. @param verfall Sekunden bis er verschwindet (null = nie) */
export function legeAufBoden(spielWelt, eintrag, x, y, verfall = null) {
  spielWelt.hinzufuegen(
    erzeugeGegenstand({ id: spielWelt.neueId(), defId: eintrag.defId, x, y, menge: eintrag.menge, magazin: eintrag.magazin, verfall }),
  );
}

/** Startausrüstung (konfiguration.spieler.startInventar) ins leere Inventar legen. @returns spieler */
export function gibStartausruestung(spieler, konfiguration) {
  for (const eintrag of konfiguration.spieler.startInventar ?? []) {
    if (!GEGENSTAENDE[eintrag.defId]) continue;
    fuegeZumInventarHinzu(spieler, eintrag.defId, eintrag.menge ?? 1, eintrag.magazin ?? 0);
    if (eintrag.ausgeruestet) spieler.ausgeruestet = spieler.inventar.findIndex((e) => e?.defId === eintrag.defId);
  }
  aktualisiereAusruestung(spieler);
  return spieler;
}

/** Nimmt bis zu `menge` Munition aus dem Inventar. @returns tatsächlich entnommene Menge */
function entnehmeMunition(spieler, defId, menge) {
  let genommen = 0;
  for (let slot = 0; slot < spieler.inventar.length && genommen < menge; slot++) {
    const e = spieler.inventar[slot];
    if (e?.defId !== defId) continue;
    const anzahl = Math.min(e.menge, menge - genommen);
    e.menge -= anzahl;
    genommen += anzahl;
    if (e.menge === 0) spieler.inventar[slot] = null;
  }
  return genommen;
}

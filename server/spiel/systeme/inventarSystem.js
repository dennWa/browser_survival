import { AUFHEB_REICHWEITE } from '../../../gemeinsam/konstanten.js';
import { AKTIONEN } from '../../../gemeinsam/protokoll.js';
import { GEGENSTAENDE, STANDARD_AUSRUESTUNG, UNBEWAFFNET } from '../konfiguration/gegenstaende.js';
import { erzeugeGegenstand } from '../entitaeten/gegenstand.js';
import { wiederbeleben } from './ueberlebenSystem.js';
import { fuehreAdminBefehlAus } from './adminSystem.js';

/**
 * Inventar: Aufheben, Benutzen (Essen/Trinken/Medizin), Aus-/Abrüsten, Ablegen, Nachladen.
 * Außerdem die übrigen AKTIONEN: Taschenlampe, Wiederbeleben, Admin-Befehle (→ adminSystem.js).
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
        case AKTIONEN.AUFHEBEN:
          aufheben(spielWelt, spieler);
          break;
        case AKTIONEN.BENUTZEN:
          benutzen(spielWelt, spieler, aktion.slot);
          break;
        case AKTIONEN.ABLEGEN:
          ablegen(spielWelt, spieler, aktion.slot);
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
  }
}

function verbrauche(spieler, slot) {
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

/** Legt einen Inventareintrag als Gegenstand in die Welt. */
export function legeAufBoden(spielWelt, eintrag, x, y) {
  spielWelt.hinzufuegen(
    erzeugeGegenstand({ id: spielWelt.neueId(), defId: eintrag.defId, x, y, menge: eintrag.menge, magazin: eintrag.magazin }),
  );
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

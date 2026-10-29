import { tutorialAktion } from './tutorialSystem.js';
import { AUFHEB_REICHWEITE, INVENTAR_MAX, INVENTAR_PLAETZE } from '../../../gemeinsam/konstanten.js';
import { samenZiel } from '../../../gemeinsam/welt/bauwerke.js';
import { AKTIONEN } from '../../../gemeinsam/protokoll.js';
import { GEGENSTAENDE, STANDARD_AUSRUESTUNG, UNBEWAFFNET } from '../konfiguration/gegenstaende.js';
import { erzeugeGegenstand } from '../entitaeten/gegenstand.js';
import { wiederbeleben } from './ueberlebenSystem.js';
import { fuehreAdminBefehlAus } from './adminSystem.js';
import { verstaerkeTuer as verstaerkeNaechsteTuer } from './tuerSystem.js';
import { brecheSchlafAb, starteAbbau, starteSchlafen } from './arbeitSystem.js';
import { stelleHer } from './craftingSystem.js';
import { benutzeBauwerk, feuer, platziere } from './bauSystem.js';
import { setzeSkillpunkt } from './levelSystem.js';
import { fahrzeugAktion } from './fahrzeugSystem.js';
import { legeInKiste, nimmAusKiste, oeffneKofferraum, schliesseKiste } from './kistenSystem.js';
import { entferneFeld, legeFeldAn } from './bauSystem.js';
import { legeInStation, nimmAusStation, schliesseStation, setzeAmFeuer, setzeHin } from './stationSystem.js';
import { baue, reisseAb } from './basisbauSystem.js';

/**
 * Inventar: Aufheben, Benutzen (Essen/Trinken/Medizin), Aus-/Abrüsten, Ablegen, Nachladen.
 * Runde 23: Kleidung an-/ausziehen (zieheAn/zieheAus), Inventargröße = Grundplätze + Rucksack + Taschen (passeInventarAn).
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
      if (aktion.art === AKTIONEN.TUTORIAL) {
        tutorialAktion(spielWelt, spieler, aktion.befehl, aktion.wert);
        continue;
      }
      if (aktion.art === AKTIONEN.ADMIN) {
        fuehreAdminBefehlAus(spielWelt, spieler, aktion.befehl, aktion); // geht auch im Tod (z. B. Zombies wegräumen)
        continue;
      }
      if (spieler.tot) continue;
      // Im Auto geht nur: aussteigen, Licht, Fähigkeiten, Inventar umsortieren
      if (spieler.fahrzeug && ![AKTIONEN.FAHRZEUG, AKTIONEN.LICHT, AKTIONEN.SKILL, AKTIONEN.TAUSCHEN, AKTIONEN.KOFFERRAUM, AKTIONEN.KISTE_LEGEN, AKTIONEN.KISTE_NEHMEN, AKTIONEN.KISTE_SCHLIESSEN].includes(aktion.art)) continue;
      switch (aktion.art) {
        case AKTIONEN.LICHT:
          spieler.lichtAn = !spieler.lichtAn;
          break;
        case AKTIONEN.TUER: // veraltet: Türen gehen automatisch auf/zu (tuerSystem.aktualisiereTueren)
          break;
        case AKTIONEN.ABBAUEN:
          starteAbbau(spielWelt, spieler);
          break;
        case AKTIONEN.SCHLAFEN: // im Bett nochmal = aufstehen (Esc)
          if (!brecheSchlafAb(spielWelt, spieler)) starteSchlafen(spielWelt, spieler);
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
        case AKTIONEN.KONSUMIEREN:
          // Doppelklick im Inventar: sofort essen/trinken/heilen (gleiche Abklingzeit wie der Linksklick aus der Hand)
          if (spieler.angriffsAbklingzeit <= 0 && spieler.inventar[aktion.slot] && konsumiere(spielWelt, spieler, aktion.slot)) {
            spieler.angriffsAbklingzeit = 0.8;
            // Der erste Klick des Doppelklicks hat das Item in die Hand genommen (BENUTZEN) – nach dem Verzehr bleibt die Hand leer
            if (spieler.ausgeruestet === aktion.slot) {
              spieler.ausgeruestet = null;
              aktualisiereAusruestung(spieler);
            }
          }
          break;
        case AKTIONEN.ABLEGEN:
          ablegen(spielWelt, spieler, aktion.slot, aktion.einzeln === true);
          break;
        case AKTIONEN.TAUSCHEN:
          tausche(spieler, aktion.slot, aktion.ziel);
          break;
        case AKTIONEN.RUCKSACK_ABLEGEN:
          legeRucksackAb(spielWelt, spieler);
          break;
        case AKTIONEN.ANLEGEN: // Runde 23: Drag & Drop aufs Charakterbild / einen Ausrüstungsplatz
          if (GEGENSTAENDE[spieler.inventar[aktion.slot]?.defId]?.kategorie === 'rucksack') benutzen(spielWelt, spieler, aktion.slot);
          else zieheAn(spielWelt, spieler, aktion.slot);
          break;
        case AKTIONEN.AUSZIEHEN:
          if (aktion.stelle === 'ruecken') legeRucksackAb(spielWelt, spieler);
          else zieheAus(spielWelt, spieler, aktion.stelle);
          break;
        case AKTIONEN.PLATZIEREN:
          platziere(spielWelt, spieler, aktion.slot, aktion.tx, aktion.ty);
          break;
        case AKTIONEN.FELD:
          legeFeldAn(spielWelt, spieler, aktion.tx, aktion.ty);
          break;
        case AKTIONEN.FELD_ENTFERNEN:
          entferneFeld(spielWelt, spieler, aktion.tx, aktion.ty);
          break;
        case AKTIONEN.STATION_LEGEN:
          legeInStation(spielWelt, spieler, aktion.slot);
          break;
        case AKTIONEN.STATION_NEHMEN:
          nimmAusStation(spielWelt, spieler, aktion.slot);
          break;
        case AKTIONEN.STATION_SCHLIESSEN:
          schliesseStation(spielWelt, spieler);
          break;
        case AKTIONEN.STATION_SITZEN:
          setzeAmFeuer(spielWelt, spieler);
          break;
        case AKTIONEN.SITZEN:
          setzeHin(spielWelt, spieler);
          break;
        case AKTIONEN.BAUEN:
          baue(spielWelt, spieler, aktion);
          break;
        case AKTIONEN.ABREISSEN:
          reisseAb(spielWelt, spieler, aktion);
          break;
        case AKTIONEN.KISTE_LEGEN:
          legeInKiste(spielWelt, spieler, aktion.slot);
          break;
        case AKTIONEN.KISTE_NEHMEN:
          nimmAusKiste(spielWelt, spieler, aktion.slot);
          break;
        case AKTIONEN.KOFFERRAUM:
          oeffneKofferraum(spielWelt, spieler);
          break;
        case AKTIONEN.KISTE_SCHLIESSEN:
          schliesseKiste(spielWelt, spieler);
          break;
        case AKTIONEN.FEUER:
          feuer(spielWelt, spieler);
          break;
        case AKTIONEN.BAUWERK:
          benutzeBauwerk(spielWelt, spieler);
          break;
        case AKTIONEN.FAHRZEUG:
          fahrzeugAktion(spielWelt, spieler);
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
    eintrag.magazin += entferneItems(spieler, def.munition, def.magazin - eintrag.magazin);
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
  if (!eintrag) {
    // Leerer Platz gewählt (Runde 18): nichts mehr in der Hand
    if (spieler.ausgeruestet !== null) {
      spieler.ausgeruestet = null;
      spieler.nachladenRest = 0;
      aktualisiereAusruestung(spieler);
    }
    return;
  }
  const def = GEGENSTAENDE[eintrag.defId];
  switch (def.kategorie) {
    case 'nahrung':
    case 'getraenk':
    case 'medizin':
      // Erst in die Hand nehmen (nochmal = wegstecken); Linksklick verbraucht (kampfSystem → konsumiere)
      spieler.ausgeruestet = spieler.ausgeruestet === slot ? null : slot;
      spieler.nachladenRest = 0;
      aktualisiereAusruestung(spieler);
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
    case 'kleidung': // Runde 23: anziehen (gleiche Stelle → tauschen)
      zieheAn(spielWelt, spieler, slot);
      break;
    case 'bauwerk':
    case 'werkzeug':
      if (def.inHand) {
        // Angel & Co.: in die Hand nehmen bzw. wegstecken (auch fernab vom Wasser)
        spieler.ausgeruestet = spieler.ausgeruestet === slot ? null : slot;
        spieler.nachladenRest = 0;
        aktualisiereAusruestung(spieler);
        break;
      }
      // Aufstellen läuft über AKTION 'platzieren' (Vorschau im Client); Feuerzeug wirkt über F am Lagerfeuer
      spielWelt.melde(spieler.id, def.baut || def.bauwerk ? 'Platz wählen und bestätigen' : def.beschreibung ?? def.name);
      break;
    case 'samen':
      // Samen in die Hand nehmen; Linksklick/E neben einem freien Beet pflanzt (kampfSystem → pflanzeSamenAusHand)
      spieler.ausgeruestet = spieler.ausgeruestet === slot ? null : slot;
      aktualisiereAusruestung(spieler);
      break;
    case 'material':
      if (def.inHand) {
        // Holz: in die Hand nehmen (Linksklick aufs Lagerfeuer legt nach, Q wirft weg)
        spieler.ausgeruestet = spieler.ausgeruestet === slot ? null : slot;
        spieler.nachladenRest = 0;
        aktualisiereAusruestung(spieler);
        break;
      }
      if (eintrag.defId === 'bretter') verstaerkeTuer(spielWelt, spieler, slot);
      else spielWelt.melde(spieler.id, `${def.name}: zum Bauen an der Werkbank`);
      break;
  }
}

/** Bretter vor einer geschlossenen Tür → Tür hält mehr aus. */
function verstaerkeTuer(spielWelt, spieler, slot) {
  if (verstaerkeNaechsteTuer(spielWelt, spieler)) verbrauche(spieler, slot);
}

/**
 * Essen, Trinken, Medizin aus der Hand verbrauchen (Linksklick). @returns true, wenn etwas verbraucht wurde
 * Gurke & Co. mit `durstwert` stillen beides; `boost` (Energydrink) = Sekunden Sprinten ohne Ausdauerverbrauch.
 */
export function konsumiere(spielWelt, spieler, slot) {
  const eintrag = spieler.inventar[slot];
  const def = eintrag && GEGENSTAENDE[eintrag.defId];
  if (!def) return false;
  if (def.kategorie === 'medizin') {
    if (spieler.leben >= spieler.maxLeben) {
      spielWelt.melde(spieler.id, 'Du bist nicht verletzt');
      return false;
    }
    spieler.leben = Math.min(spieler.maxLeben, spieler.leben + def.heilung);
  } else if (def.kategorie === 'nahrung' || def.kategorie === 'getraenk') {
    if (def.naehrwert) spieler.hunger = Math.min(100, spieler.hunger + def.naehrwert);
    if (def.durstwert) spieler.durst = Math.min(100, spieler.durst + def.durstwert);
    if (def.boost) spieler.boostRest = def.boost;
  } else {
    return false;
  }
  spielWelt.ereignis({ typ: def.kategorie === 'getraenk' ? 'getrunken' : def.kategorie === 'medizin' ? 'geheilt' : 'gegessen', von: spieler.id, x: spieler.x, y: spieler.y });
  verbrauche(spieler, slot);
  return true;
}

/**
 * Werkzeug nutzt sich ab (Axt, Spitzhacke, Hacke: `haltbarkeit` in gegenstaende.js). Der Wert steht am Inventareintrag
 * (`haltbarkeit`, fehlt = voll). Bei 0 ist es kaputt und verschwindet.
 */
export function nutzeWerkzeug(spielWelt, spieler, defId) {
  const def = GEGENSTAENDE[defId];
  if (!def?.haltbarkeit) return;
  const slot = spieler.inventar.findIndex((e, i) => e?.defId === defId && i === spieler.ausgeruestet);
  const platz = slot >= 0 ? slot : spieler.inventar.findIndex((e) => e?.defId === defId);
  const eintrag = spieler.inventar[platz];
  if (!eintrag) return;
  eintrag.haltbarkeit = (eintrag.haltbarkeit ?? def.haltbarkeit) - 1;
  if (eintrag.haltbarkeit > 0) return;
  entferneSlot(spieler, platz);
  spielWelt.ereignis({ typ: 'werkzeugKaputt', von: spieler.id, x: spieler.x, y: spieler.y });
  spielWelt.melde(spieler.id, `💥 ${def.name} ist kaputt!`);
}

/** Samen in der Hand: ins nächste freie Beet in Reichweite pflanzen (Linksklick). @returns true, wenn gepflanzt */
export function pflanzeSamenAusHand(spielWelt, spieler, def) {
  const beet = samenZiel(spielWelt.welt, spieler.x, spieler.y, spieler.blick);
  if (!beet) {
    spielWelt.melde(spieler.id, 'Kein freies Beet in der Nähe – erst mit der Hacke ein Erdfeld anlegen');
    return false;
  }
  benutzeBauwerk(spielWelt, spieler, beet.id, def.pflanze);
  return true;
}

export function verbrauche(spieler, slot) {
  const eintrag = spieler.inventar[slot];
  eintrag.menge -= 1;
  if (eintrag.menge <= 0) entferneSlot(spieler, slot);
}

export function entferneSlot(spieler, slot) {
  spieler.inventar[slot] = null;
  if (spieler.ausgeruestet === slot) {
    spieler.ausgeruestet = null;
    spieler.nachladenRest = 0;
    aktualisiereAusruestung(spieler);
  }
}

function ablegen(spielWelt, spieler, slot, einzeln = false) {
  const eintrag = spieler.inventar[slot];
  if (!eintrag) return;
  // Einzeln wegwerfen (Q bei Holz/Samen in der Hand): nur 1 Stück vom Stapel
  if (einzeln && eintrag.menge > 1) {
    eintrag.menge -= 1;
    legeAufBoden(spielWelt, { defId: eintrag.defId, menge: 1 }, spieler.x + Math.cos(spieler.blick) * 18, spieler.y + Math.sin(spieler.blick) * 18);
    return;
  }
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
  spieler.rucksack = neu.defId;
  passeInventarAn(spielWelt, spieler); // Inhalt bleibt liegen; wird es kleiner, rückt der Rest nach vorn bzw. fällt
  insInventarOderBoden(spielWelt, spieler, { defId: alt, menge: 1 });
  aktualisiereAusruestung(spieler);
  spielWelt.melde(spieler.id, `${neuDef.name} angelegt (+${neuDef.plaetze} Plätze)`);
}

/** Runde 23: Stellen am Körper für Kleidung (Inventar links, gemeinsam mit dem Rucksack = Rücken). */
export const KLEIDUNG_STELLEN = Object.freeze(['kopf', 'oberkoerper', 'haende', 'beine', 'fuesse']);

/** Soll-Größe des Inventars: Grundplätze + Rucksack + Taschen der Kleidung. */
export function inventarGroesse(spieler) {
  let plaetze = INVENTAR_PLAETZE + (GEGENSTAENDE[spieler.rucksack]?.plaetze ?? 0);
  for (const defId of Object.values(spieler.kleidung ?? {})) plaetze += GEGENSTAENDE[defId]?.plaetze ?? 0;
  return Math.min(INVENTAR_MAX, plaetze);
}

/**
 * Inventar auf die Soll-Größe bringen: wächst → leere Plätze hinten dran; schrumpft → was hinten liegt, rückt in freie
 * Plätze nach vorn, der Rest fällt neben den Spieler (verfall wie legeAufBoden).
 */
export function passeInventarAn(spielWelt, spieler, verfall = null) {
  const ziel = inventarGroesse(spieler);
  while (spieler.inventar.length < ziel) spieler.inventar.push(null);
  if (spieler.inventar.length === ziel) return;
  const x = spieler.x + Math.cos(spieler.blick) * 18;
  const y = spieler.y + Math.sin(spieler.blick) * 18;
  for (let slot = ziel; slot < spieler.inventar.length; slot++) {
    const e = spieler.inventar[slot];
    if (!e) continue;
    const frei = spieler.inventar.findIndex((f, i) => i < ziel && f === null);
    if (frei >= 0) {
      spieler.inventar[frei] = e;
      if (spieler.ausgeruestet === slot) spieler.ausgeruestet = frei;
    } else {
      if (spieler.ausgeruestet === slot) spieler.ausgeruestet = null;
      if (spielWelt) legeAufBoden(spielWelt, e, x + (slot % 3) * 6 - 6, y + 6, verfall);
    }
  }
  spieler.inventar.length = ziel;
  if (spieler.ausgeruestet !== null && spieler.ausgeruestet >= ziel) spieler.ausgeruestet = null;
}

/** Eintrag in einen freien Platz legen, sonst vor die Füße. */
function insInventarOderBoden(spielWelt, spieler, eintrag) {
  const frei = spieler.inventar.findIndex((e) => !e);
  if (frei >= 0) spieler.inventar[frei] = eintrag;
  else if (spielWelt) legeAufBoden(spielWelt, eintrag, spieler.x, spieler.y);
}

/**
 * Runde 23: Kleidungsstück aus dem Inventar anziehen (AKTION anlegen bzw. benutzen). Was an der Stelle schon war, kommt
 * ins Inventar (oder fällt). Taschen (plaetze) vergrößern das Inventar sofort.
 */
export function zieheAn(spielWelt, spieler, slot) {
  const eintrag = spieler.inventar[slot];
  const def = eintrag && GEGENSTAENDE[eintrag.defId];
  if (def?.kategorie !== 'kleidung' || !KLEIDUNG_STELLEN.includes(def.slot)) return false;
  spieler.kleidung ??= Object.fromEntries(KLEIDUNG_STELLEN.map((s) => [s, null]));
  const alt = spieler.kleidung[def.slot];
  spieler.inventar[slot] = null;
  if (spieler.ausgeruestet === slot) spieler.ausgeruestet = null;
  spieler.kleidung[def.slot] = eintrag.defId;
  passeInventarAn(spielWelt, spieler);
  if (alt) insInventarOderBoden(spielWelt, spieler, { defId: alt, menge: 1 });
  aktualisiereAusruestung(spieler);
  spielWelt?.ereignis({ typ: 'anziehen', von: spieler.id, x: spieler.x, y: spieler.y });
  spielWelt?.melde(spieler.id, `${def.name} angezogen (+${def.waerme} Wärme${def.plaetze ? `, +${def.plaetze} Plätze` : ''})`);
  return true;
}

/** Runde 23: Kleidung an `stelle` ausziehen → ins Inventar (Taschen-Inhalt rückt nach vorn bzw. fällt). */
export function zieheAus(spielWelt, spieler, stelle) {
  const defId = spieler.kleidung?.[stelle];
  if (!defId) return false;
  spieler.kleidung[stelle] = null;
  passeInventarAn(spielWelt, spieler);
  insInventarOderBoden(spielWelt, spieler, { defId, menge: 1 });
  aktualisiereAusruestung(spieler);
  spielWelt?.ereignis({ typ: 'anziehen', von: spieler.id, x: spieler.x, y: spieler.y });
  return true;
}

/** Tod: alle Kleidung fällt (Taschen-Inhalt rückt vorher nach vorn bzw. fällt mit). */
export function legeKleidungAb(spielWelt, spieler, verfall = null) {
  const stuecke = Object.entries(spieler.kleidung ?? {}).filter(([, d]) => d);
  if (!stuecke.length) return;
  for (const [stelle] of stuecke) spieler.kleidung[stelle] = null;
  passeInventarAn(spielWelt, spieler, verfall);
  stuecke.forEach(([, defId], i) => {
    const w = (i / stuecke.length) * Math.PI * 2 + 0.4;
    legeAufBoden(spielWelt, { defId, menge: 1 }, spieler.x + Math.cos(w) * 20, spieler.y + Math.sin(w) * 20, verfall);
  });
  aktualisiereAusruestung(spieler);
}

/** Wärme der angezogenen Kleidung (Summe). */
export function kleidungsWaerme(spieler) {
  let w = 0;
  for (const defId of Object.values(spieler.kleidung ?? {})) w += GEGENSTAENDE[defId]?.waerme ?? 0;
  return w;
}

/** Rucksack anlegen: Inventar wächst um def.plaetze leere Plätze. */
export function legeRucksackAn(spielWelt, spieler, defId) {
  const def = GEGENSTAENDE[defId];
  if (def?.kategorie !== 'rucksack' || spieler.rucksack) return false;
  spieler.rucksack = defId;
  passeInventarAn(spielWelt, spieler); // neue Plätze leer
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
  const rucksack = spieler.rucksack;
  spieler.rucksack = null;
  passeInventarAn(spielWelt, spieler, verfall); // Inhalt rückt nach vorn, Rest fällt daneben
  legeAufBoden(spielWelt, { defId: rucksack, menge: 1 }, x, y, verfall);
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

/** Nimmt bis zu `menge` Stück von `defId` aus dem Inventar (Munition, Baumaterial …). @returns tatsächlich entnommene Menge */
export function entferneItems(spieler, defId, menge) {
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

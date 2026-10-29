import { BAUWERK_REICHWEITE, KOCHBAR } from '../../../gemeinsam/welt/bauwerke.js';
import { GEGENSTAENDE } from '../konfiguration/gegenstaende.js';
import { entferneSlot, fuegeZumInventarHinzu, legeAufBoden } from './inventarSystem.js';

/**
 * Stationen = Bauwerke mit eigenem Menü und Garzeit-Plätzen: Lagerfeuer (Fleisch/Fisch/Gemüse braten) und Schmelzofen
 * (Eisenerz → Eisenbarren). E am Bauwerk öffnet das Menü (bauSystem.benutzeBauwerk → oeffneStation).
 *
 *   bauwerk.plaetze = [null | { defId (aktueller Zustand), quelle (roh), zeit (Sekunden Garzeit) }]   – privat, geht nur als STATION-Nachricht an den Öffner
 *   Lagerfeuer:  brennt/brennRest; Garzeit läuft nur, solange es brennt. quelle fertig nach `bauen.kochDauer` (20 s), nach
 *                `bauen.verbrennDauer` (30 s) → 'verkohlt'.
 *   Schmelzofen: brennstoff (Holz) → brennRest (Hitze, `ofenBrennDauer` pro Holz); Eisenerz wird nach `schmelzDauer` zum Barren.
 *
 * AKTION stationLegen { slot } (1 Stück; Holz im Ofen = Brennstoff) · stationNehmen { slot = Platz } · stationSchliessen · stationSitzen
 * Das Menü schließt sich beim Wegtreten (wie die Kiste).
 */
const OEFFNEN_TOLERANZ = 24;
const SITZ_ABSTAND = 70;

/** Wie ein Rohstoff an dieser Station verarbeitet wird (null = kann nicht hinein). */
function rezept(typ, defId, k) {
  if (typ === 'lagerfeuer') {
    const fertig = KOCHBAR[defId];
    return fertig ? { fertig, dauer: k.kochDauer, verbrennt: k.verbrennDauer, verbranntItem: 'verkohlt' } : null;
  }
  if (typ === 'schmelzofen') return defId === 'eisenerz' ? { fertig: 'eisenbarren', dauer: k.schmelzDauer, verbrennt: null } : null;
  return null;
}

const PLAETZE = { lagerfeuer: 3, schmelzofen: 3 };

export const leerePlaetze = (typ) => new Array(PLAETZE[typ] ?? 0).fill(null);

export function oeffneStation(spielWelt, spieler, b) {
  spieler.offeneStation = b.id;
  b.plaetze ??= leerePlaetze(b.typ);
  sendeStation(spielWelt, spieler, b, true);
}

export function schliesseStation(spielWelt, spieler) {
  if (spieler.offeneStation === null) return;
  spielWelt.kistenNachrichten.push({ spielerId: spieler.id, station: true, id: spieler.offeneStation, plaetze: null });
  spieler.offeneStation = null;
}

function offeneStation(spielWelt, spieler) {
  if (spieler.offeneStation === null) return null;
  const b = spielWelt.welt.bauwerke.get(spieler.offeneStation);
  return b && PLAETZE[b.typ] ? b : null;
}

function ansicht(spielWelt, b) {
  const k = spielWelt.konfiguration.bauen;
  return {
    id: b.id,
    art: b.typ,
    brennt: b.typ === 'schmelzofen' ? b.brennRest > 0 : b.brennt === true,
    brennRest: Math.ceil(b.brennRest ?? 0),
    brennstoff: b.brennstoff ?? 0,
    plaetze: (b.plaetze ?? []).map((p) => {
      if (!p) return null;
      const r = rezept(b.typ, p.quelle, k);
      return { defId: p.defId, menge: 1, zeit: Math.round(p.zeit * 10) / 10, dauer: r?.dauer ?? 0, verbrennt: r?.verbrennt ?? null };
    }),
  };
}

function sendeStation(spielWelt, spieler, b, erzwingen = false) {
  const daten = ansicht(spielWelt, b);
  const text = JSON.stringify(daten);
  if (!erzwingen && spieler.stationText === text) return;
  spieler.stationText = text;
  spielWelt.kistenNachrichten.push({ spielerId: spieler.id, station: true, ...daten });
}

/** AKTION stationLegen { slot }: ein Stück aus dem Inventar auf einen freien Platz (Holz beim Ofen: Brennstoff). */
export function legeInStation(spielWelt, spieler, slot) {
  const b = offeneStation(spielWelt, spieler);
  const eintrag = spieler.inventar[slot];
  if (!b || !eintrag) return;
  const k = spielWelt.konfiguration.bauen;
  if (b.typ === 'schmelzofen' && eintrag.defId === 'holz') {
    if ((b.brennstoff ?? 0) >= 10) {
      spielWelt.melde(spieler.id, 'Der Ofen ist randvoll mit Holz');
      return;
    }
    b.brennstoff = (b.brennstoff ?? 0) + 1;
    verbrauchEins(spieler, slot);
    sendeStation(spielWelt, spieler, b, true);
    return;
  }
  if (!rezept(b.typ, eintrag.defId, k)) {
    spielWelt.melde(spieler.id, b.typ === 'lagerfeuer' ? 'Das kann man nicht braten' : 'Das lässt sich nicht schmelzen');
    return;
  }
  const frei = b.plaetze.findIndex((p) => p === null);
  if (frei < 0) {
    spielWelt.melde(spieler.id, 'Alle Plätze belegt');
    return;
  }
  b.plaetze[frei] = { defId: eintrag.defId, quelle: eintrag.defId, zeit: 0 };
  verbrauchEins(spieler, slot);
  spielWelt.ereignis({ typ: 'kochStart', x: (b.tx + 0.5) * spielWelt.welt.kachelGroesse, y: (b.ty + 0.5) * spielWelt.welt.kachelGroesse });
  for (const s of spielWelt.alleVomTyp('spieler')) if (s.offeneStation === b.id) sendeStation(spielWelt, s, b, true);
}

/** AKTION stationNehmen { slot = Platz }: Gebratenes/Verkohltes/Rohes zurück ins Inventar. */
export function nimmAusStation(spielWelt, spieler, platz) {
  const b = offeneStation(spielWelt, spieler);
  const p = b?.plaetze?.[platz];
  if (!p) return;
  if (fuegeZumInventarHinzu(spieler, p.defId, 1) > 0) legeAufBoden(spielWelt, { defId: p.defId, menge: 1 }, spieler.x, spieler.y);
  b.plaetze[platz] = null;
  for (const s of spielWelt.alleVomTyp('spieler')) if (s.offeneStation === b.id) sendeStation(spielWelt, s, b, true);
}

function verbrauchEins(spieler, slot) {
  const e = spieler.inventar[slot];
  e.menge -= 1;
  if (e.menge <= 0) entferneSlot(spieler, slot);
}

/** AKTION stationSitzen: am offenen, brennenden Lagerfeuer hinsetzen (Zombies übersehen einen, es heilt langsam). */
export function setzeAmFeuer(spielWelt, spieler) {
  const feuer = offeneStation(spielWelt, spieler);
  if (feuer?.typ !== 'lagerfeuer') return;
  if (!feuer.brennt) {
    spielWelt.melde(spieler.id, 'Das Feuer brennt nicht');
    return;
  }
  const g = spielWelt.welt.kachelGroesse;
  if (Math.hypot((feuer.tx + 0.5) * g - spieler.x, (feuer.ty + 0.5) * g - spieler.y) > SITZ_ABSTAND) return;
  spieler.arbeit = { art: 'sitzen', dauer: 1e6, rest: 1e6, x: spieler.x, y: spieler.y, bauwerkId: feuer.id };
  spieler.blick = Math.atan2((feuer.ty + 0.5) * g - spieler.y, (feuer.tx + 0.5) * g - spieler.x);
  spieler.nachladenRest = 0;
  spielWelt.melde(spieler.id, '🔥 Du sitzt am Feuer – hier ist es ruhig');
}

/**
 * AKTION sitzen (Taste Ä, Runde 18): überall hinsetzen bzw. wieder aufstehen. Liegt ein brennendes Lagerfeuer in
 * SITZ_ABSTAND, setzt man sich ans Feuer (Blick zum Feuer, heilt, Zombies übersehen einen) – Kochen/Nachlegen geht im Sitzen.
 */
export function setzeHin(spielWelt, spieler) {
  if (spieler.arbeit?.art === 'sitzen') {
    spieler.arbeit = null;
    return;
  }
  if (spieler.tot || spieler.fahrzeug || spieler.fliegen || spieler.arbeit) return;
  const g = spielWelt.welt.kachelGroesse;
  const feuer = spielWelt.welt.naechstesBauwerk(spieler.x, spieler.y, SITZ_ABSTAND, (b) => b.typ === 'lagerfeuer' && b.brennt);
  spieler.arbeit = { art: 'sitzen', dauer: 1e6, rest: 1e6, x: spieler.x, y: spieler.y, bauwerkId: feuer?.id ?? null };
  spieler.nachladenRest = 0;
  if (feuer) {
    spieler.blick = Math.atan2((feuer.ty + 0.5) * g - spieler.y, (feuer.tx + 0.5) * g - spieler.x);
    spielWelt.melde(spieler.id, '🔥 Du sitzt am Feuer – hier ist es ruhig');
  }
}

/** Sitzt der Spieler an einem (brennenden) Lagerfeuer? Nur dann übersehen ihn die Zombies. */
export function sitztAmFeuer(spieler) {
  return spieler.arbeit?.art === 'sitzen' && spieler.arbeit.bauwerkId != null;
}

/** Holz in der Hand, Linksklick aufs Lagerfeuer: +brennDauer (stapelt bis brennMax). @returns true, wenn ein Feuer getroffen wurde */
export function schuereFeuer(spielWelt, spieler, slot) {
  const b = spielWelt.welt.naechstesBauwerk(spieler.x, spieler.y, BAUWERK_REICHWEITE, (x) => x.typ === 'lagerfeuer' || x.typ === 'kamin'); // Runde 24: auch Kamin
  if (!b) {
    spielWelt.melde(spieler.id, 'Hier ist kein Lagerfeuer in der Nähe');
    return false;
  }
  if (!b.brennt) {
    spielWelt.melde(spieler.id, 'Das Feuer ist aus – erst anzünden (F)');
    return false;
  }
  const k = spielWelt.konfiguration.bauen;
  b.brennRest = b.typ === 'kamin' ? Math.min(k.kaminDauer * 2, b.brennRest + k.kaminDauer / 2) : Math.min(k.brennMax, b.brennRest + k.brennDauer);
  verbrauchEins(spieler, slot);
  spielWelt.welt.setzeBauwerk(b);
  spielWelt.ereignis({ typ: 'holzNachgelegt', x: (b.tx + 0.5) * spielWelt.welt.kachelGroesse, y: (b.ty + 0.5) * spielWelt.welt.kachelGroesse });
  spielWelt.melde(spieler.id, `🔥 Holz nachgelegt – brennt noch ${Math.ceil(b.brennRest / 60)} min`);
  return true;
}

/** Pro Tick und Station: Garzeit, Schmelzen, Hitze des Ofens. */
export function aktualisiereStation(spielWelt, b, dt) {
  const k = spielWelt.konfiguration.bauen;
  if (!b.plaetze) b.plaetze = leerePlaetze(b.typ);
  let geaendert = false;
  let heiss;
  if (b.typ === 'schmelzofen') {
    const wartet = b.plaetze.some((p) => p && p.defId === p.quelle);
    if (b.brennRest > 0) b.brennRest = Math.max(0, b.brennRest - dt);
    if (b.brennRest <= 0 && wartet && (b.brennstoff ?? 0) > 0) {
      b.brennstoff -= 1;
      b.brennRest = k.ofenBrennDauer;
    }
    heiss = b.brennRest > 0;
    if (heiss !== (b.brennt === true)) {
      b.brennt = heiss;
      geaendert = true;
    }
  } else {
    heiss = b.brennt === true;
  }
  if (heiss) {
    for (const p of b.plaetze) {
      if (!p) continue;
      const r = rezept(b.typ, p.quelle, k);
      if (!r) continue;
      p.zeit += dt;
      if (p.defId === p.quelle && p.zeit >= r.dauer) {
        p.defId = r.fertig;
        spielWelt.ereignis({ typ: 'gekocht', x: (b.tx + 0.5) * spielWelt.welt.kachelGroesse, y: (b.ty + 0.5) * spielWelt.welt.kachelGroesse });
      } else if (r.verbrennt && p.defId === r.fertig && p.zeit >= r.verbrennt) {
        p.defId = r.verbranntItem;
        spielWelt.ereignis({ typ: 'verbrannt', x: (b.tx + 0.5) * spielWelt.welt.kachelGroesse, y: (b.ty + 0.5) * spielWelt.welt.kachelGroesse });
      }
    }
  }
  if (geaendert) spielWelt.welt.setzeBauwerk(b);
}

/** Pro Tick: offene Menüs aktualisieren; wer sich entfernt, dem schließt es sich. */
export function aktualisiereStationen(spielWelt) {
  const g = spielWelt.welt.kachelGroesse;
  for (const s of spielWelt.alleVomTyp('spieler')) {
    if (s.offeneStation === null) continue;
    const b = offeneStation(spielWelt, s);
    if (!b || s.tot || s.fahrzeug || Math.hypot((b.tx + 0.5) * g - s.x, (b.ty + 0.5) * g - s.y) > BAUWERK_REICHWEITE + OEFFNEN_TOLERANZ) {
      schliesseStation(spielWelt, s);
      continue;
    }
    if (spielWelt.tick % 15 === 0) sendeStation(spielWelt, s, b);
  }
}

/** Plätze fürs Netz-/Spielstand-Format prüfen (Spielstand-Laden). */
export function pruefePlaetze(typ, roh, k) {
  const plaetze = leerePlaetze(typ);
  if (!Array.isArray(roh)) return plaetze;
  roh.slice(0, plaetze.length).forEach((p, i) => {
    if (!p || !GEGENSTAENDE[p.defId] || !GEGENSTAENDE[p.quelle] || !rezept(typ, p.quelle, k)) return;
    plaetze[i] = { defId: p.defId, quelle: p.quelle, zeit: Number.isFinite(p.zeit) ? Math.max(0, p.zeit) : 0 };
  });
  return plaetze;
}

import { GEGENSTAENDE } from '../konfiguration/gegenstaende.js';
import { RECHT } from '../../../gemeinsam/basisbau/rechte.js';
import { fuegeZumInventarHinzu, legeAufBoden, verbrauche, zusatzVon } from './inventarSystem.js';
import { toeten } from './kampfSystem.js';

/**
 * Runde 24 (P14): Miteinander spielen – Gruppen, Handel, Niederstrecken & Wiederbeleben. Werte: konfiguration.mehrspieler.
 *
 * Gruppe = Besitzer einer Basis-Flagge + ihre Mitglieder (flagge.mitglieder, gemeinsam/basisbau/rechte.js – alle Rechte:
 *   bauen, abreißen, Türen/Kisten/Betten benutzen). Nur der Flaggen-Besitzer lädt ein; man ist in höchstens einer Gruppe.
 *   AKTION gruppe { was: einladen{ziel} | annehmen | ablehnen | verlassen | entfernen{name} }.
 * Anfragen (Gruppe/Handel): spieler.anfrage = { art, vonId, vonName, rest } – geht privat an den Client (spielerDatenPrivat).
 * Handel: AKTION handel { was: anfragen{ziel} | annehmen | ablehnen | anbieten{slot} | zurueck{slot} | bereit | abbrechen }.
 *   spielWelt.handel: Map id → { a, b, angebot: { [spielerId]: [slot…] }, bereit: { [spielerId]: bool } }, spieler.handelId.
 *   Jede Änderung am Angebot nimmt beide „Bereit“ zurück; sind beide bereit, wird getauscht (Plätze müssen noch stimmen).
 *   Abbruch bei Abstand > handelAbstand, Tod, Zonenwechsel.
 * Niederstrecken: wer stirbt, während andere (menschliche) Spieler in der Zone leben, liegt `niederDauer` s am Boden
 *   (spieler.niedergestreckt = Restsekunden, Leben 1, keine Bewegung; Zombies lassen ihn liegen). AKTION helfen{ziel} mit
 *   Erste-Hilfe-Kasten in Reichweite holt ihn zurück (Leben × wiederbelebtLeben); AKTION aufgeben / Zeit um / erneuter
 *   Schaden → endgültig tot (kampfSystem.toeten mit { endgueltig: true }).
 */

const ALLE_RECHTE = [RECHT.BAUEN, RECHT.ABREISSEN, RECHT.BENUTZEN];
let naechsteHandelId = 1;

// ---------------------------------------------------------------- Gruppen

/** Flagge, deren Gruppe `name` angehört (eigene oder als Mitglied) – oder null. */
export function gruppenFlagge(spielWelt, name) {
  for (const f of spielWelt.territorium.flaggen.values()) if (f.besitzer === name || f.mitglieder?.[name]) return f;
  return null;
}

/** Namen aller Gruppenmitglieder (inkl. Besitzer) oder [] ohne Gruppe/ohne Mitglieder. */
export function gruppenNamen(spielWelt, name) {
  const f = gruppenFlagge(spielWelt, name);
  if (!f || !Object.keys(f.mitglieder ?? {}).length) return [];
  return [f.besitzer, ...Object.keys(f.mitglieder)];
}

export function gruppenAktion(spielWelt, spieler, aktion) {
  const k = spielWelt.konfiguration.mehrspieler;
  switch (aktion.was) {
    case 'einladen': {
      const ziel = andererSpieler(spielWelt, spieler, aktion.ziel, k.reichweite);
      if (!ziel) return;
      const f = spielWelt.territorium.von(spieler.name);
      if (!f) return spielWelt.melde(spieler.id, 'Stell erst eine Basis-Flagge auf – deine Gruppe teilt sich deine Basis');
      if (f.mitglieder?.[ziel.name]) return spielWelt.melde(spieler.id, `${ziel.name} ist schon in deiner Gruppe`);
      if (Object.keys(f.mitglieder ?? {}).length >= k.gruppeMax - 1) return spielWelt.melde(spieler.id, 'Deine Gruppe ist voll');
      stelleAnfrage(spielWelt, spieler, ziel, 'gruppe');
      return;
    }
    case 'annehmen':
    case 'ablehnen': {
      const a = spieler.anfrage;
      if (a?.art !== 'gruppe') return;
      spieler.anfrage = null;
      const von = spielWelt.holen(a.vonId);
      const f = von && spielWelt.territorium.von(von.name);
      if (aktion.was === 'ablehnen' || !f) return von && spielWelt.melde(von.id, `${spieler.name} hat abgelehnt`);
      verlasseGruppe(spielWelt, spieler, false); // nur eine Gruppe gleichzeitig
      spielWelt.territorium.setze({ ...f, mitglieder: { ...(f.mitglieder ?? {}), [spieler.name]: [...ALLE_RECHTE] } });
      for (const s of spielWelt.alleVomTyp('spieler')) if (gruppenNamen(spielWelt, s.name).includes(spieler.name)) spielWelt.melde(s.id, `👥 ${spieler.name} ist jetzt in der Gruppe von ${f.besitzer}`);
      return;
    }
    case 'verlassen':
      verlasseGruppe(spielWelt, spieler, true);
      return;
    case 'entfernen': {
      const f = spielWelt.territorium.von(spieler.name);
      if (!f?.mitglieder?.[aktion.name]) return;
      const { [aktion.name]: _weg, ...rest } = f.mitglieder;
      spielWelt.territorium.setze({ ...f, mitglieder: rest });
      spielWelt.melde(spieler.id, `${aktion.name} ist nicht mehr in deiner Gruppe`);
      const weg = [...spielWelt.alleVomTyp('spieler')].find((s) => s.name === aktion.name);
      if (weg) spielWelt.melde(weg.id, `${spieler.name} hat dich aus der Gruppe genommen`);
      return;
    }
  }
}

function verlasseGruppe(spielWelt, spieler, melden) {
  for (const f of [...spielWelt.territorium.flaggen.values()]) {
    if (!f.mitglieder?.[spieler.name]) continue;
    const { [spieler.name]: _weg, ...rest } = f.mitglieder;
    spielWelt.territorium.setze({ ...f, mitglieder: rest });
    if (melden) spielWelt.melde(spieler.id, `Du hast die Gruppe von ${f.besitzer} verlassen`);
  }
}

/** Für den Client: { besitzer, mitglieder[], flagge? } – flagge nur für Mitglieder (Besitzer kennt sie schon), damit Bau-Modus/Rechte stimmen. */
export function gruppeFuerClient(spielWelt, spieler) {
  const f = gruppenFlagge(spielWelt, spieler.name);
  if (!f) return undefined;
  const mitglieder = Object.keys(f.mitglieder ?? {});
  if (f.besitzer === spieler.name && !mitglieder.length) return undefined;
  return { besitzer: f.besitzer, mitglieder, ...(f.besitzer !== spieler.name ? { flagge: { tx: f.tx, ty: f.ty, radius: f.radius } } : {}) };
}

// ---------------------------------------------------------------- Anfragen

function andererSpieler(spielWelt, spieler, zielId, reichweite) {
  const ziel = Number.isInteger(zielId) ? spielWelt.holen(zielId) : null;
  if (ziel?.typ !== 'spieler' || ziel === spieler || ziel.tot || ziel.bot) return null;
  if (Math.hypot(ziel.x - spieler.x, ziel.y - spieler.y) > reichweite) {
    spielWelt.melde(spieler.id, `${ziel.name} ist zu weit weg`);
    return null;
  }
  return ziel;
}

function stelleAnfrage(spielWelt, von, an, art) {
  if (an.anfrage && an.anfrage.vonId !== von.id) return spielWelt.melde(von.id, `${an.name} hat gerade eine andere Anfrage offen`);
  an.anfrage = { art, vonId: von.id, vonName: von.name, rest: spielWelt.konfiguration.mehrspieler.anfrageDauer };
  spielWelt.melde(von.id, art === 'handel' ? `Handelsanfrage an ${an.name} geschickt` : `Einladung an ${an.name} geschickt`);
  spielWelt.ereignis({ typ: 'anfrage', von: an.id, x: an.x, y: an.y });
}

// ---------------------------------------------------------------- Handel

export function handelAktion(spielWelt, spieler, aktion) {
  const k = spielWelt.konfiguration.mehrspieler;
  switch (aktion.was) {
    case 'anfragen': {
      const ziel = andererSpieler(spielWelt, spieler, aktion.ziel, k.reichweite);
      if (!ziel) return;
      if (ziel.handelId || spieler.handelId) return spielWelt.melde(spieler.id, 'Da läuft schon ein Handel');
      stelleAnfrage(spielWelt, spieler, ziel, 'handel');
      return;
    }
    case 'annehmen':
    case 'ablehnen': {
      const a = spieler.anfrage;
      if (a?.art !== 'handel') return;
      spieler.anfrage = null;
      const von = spielWelt.holen(a.vonId);
      if (!von || von.tot || von.handelId || spieler.handelId) return;
      if (aktion.was === 'ablehnen') return spielWelt.melde(von.id, `${spieler.name} will gerade nicht handeln`);
      const id = naechsteHandelId++;
      spielWelt.handel.set(id, { id, a: von.id, b: spieler.id, angebot: { [von.id]: [], [spieler.id]: [] }, bereit: {} });
      von.handelId = spieler.handelId = id;
      return;
    }
  }
  const h = spieler.handelId && spielWelt.handel.get(spieler.handelId);
  if (!h) return;
  const meins = h.angebot[spieler.id];
  switch (aktion.was) {
    case 'anbieten':
      if (!spieler.inventar[aktion.slot] || meins.includes(aktion.slot) || meins.length >= k.handelPlaetze) return;
      meins.push(aktion.slot);
      h.bereit = {};
      return;
    case 'zurueck':
      h.angebot[spieler.id] = meins.filter((s) => s !== aktion.slot);
      h.bereit = {};
      return;
    case 'bereit':
      h.bereit[spieler.id] = !h.bereit[spieler.id];
      if (h.bereit[h.a] && h.bereit[h.b]) fuehreHandelAus(spielWelt, h);
      return;
    case 'abbrechen':
      beendeHandel(spielWelt, h, `${spieler.name} hat den Handel abgebrochen`);
      return;
  }
}

/** Tauschen: erst alles einsammeln (Plätze müssen noch dasselbe enthalten), dann verteilen – Rest fällt auf den Boden. */
function fuehreHandelAus(spielWelt, h) {
  const a = spielWelt.holen(h.a);
  const b = spielWelt.holen(h.b);
  const pakete = new Map();
  for (const s of [a, b]) {
    const eintraege = h.angebot[s.id].map((slot) => s.inventar[slot]);
    if (eintraege.some((e) => !e)) return beendeHandel(spielWelt, h, 'Handel geplatzt – ein Angebot hat sich geändert');
    pakete.set(s.id, eintraege.map((e) => ({ ...e })));
  }
  for (const s of [a, b]) for (const slot of h.angebot[s.id]) s.inventar[slot] = null;
  for (const [vonId, eintraege] of pakete) {
    const an = vonId === a.id ? b : a;
    for (const e of eintraege) {
      const rest = fuegeZumInventarHinzu(an, e.defId, e.menge, e.magazin ?? 0, zusatzVon(e));
      if (rest > 0) legeAufBoden(spielWelt, { ...e, menge: rest }, an.x, an.y);
    }
  }
  for (const s of [a, b]) if (s.ausgeruestet !== null && !s.inventar[s.ausgeruestet]) s.ausgeruestet = null;
  spielWelt.ereignis({ typ: 'gehandelt', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, von: a.id });
  beendeHandel(spielWelt, h, '🤝 Handel abgeschlossen');
}

function beendeHandel(spielWelt, h, text) {
  spielWelt.handel.delete(h.id);
  for (const id of [h.a, h.b]) {
    const s = spielWelt.holen(id);
    if (!s) continue;
    s.handelId = null;
    if (text) spielWelt.melde(s.id, text);
  }
}

/** Für den Client: laufender Handel aus Sicht von `spieler` (Inhalte statt Plätze) oder undefined. */
export function handelFuerClient(spielWelt, spieler) {
  const h = spieler.handelId && spielWelt.handel?.get(spieler.handelId);
  if (!h) return undefined;
  const anderer = spielWelt.holen(h.a === spieler.id ? h.b : h.a);
  const inhalt = (s) => h.angebot[s.id].map((slot) => s.inventar[slot]).filter(Boolean).map((e) => ({ defId: e.defId, menge: e.menge }));
  return { partner: anderer?.name ?? '?', meineSlots: [...h.angebot[spieler.id]], seins: anderer ? inhalt(anderer) : [], ichBereit: !!h.bereit[spieler.id], erBereit: !!(anderer && h.bereit[anderer.id]) };
}

// ---------------------------------------------------------------- Niederstrecken & Wiederbeleben

/** Aus kampfSystem.toeten: statt zu sterben niedergestreckt werden? (true = ist jetzt niedergestreckt) */
export function streckeNieder(spielWelt, spieler) {
  const k = spielWelt.konfiguration.mehrspieler;
  if (!k?.niederDauer || spielWelt.tutorial || spieler.niedergestreckt > 0) return false;
  const helfer = [...spielWelt.alleVomTyp('spieler')].some((s) => s !== spieler && !s.tot && !s.bot && !(s.niedergestreckt > 0));
  if (!helfer) return false;
  Object.assign(spieler, { niedergestreckt: k.niederDauer, leben: 1, arbeit: null, angriff: false });
  if (spieler.handelId) beendeHandel(spielWelt, spielWelt.handel.get(spieler.handelId) ?? { id: spieler.handelId, a: spieler.id, b: spieler.id }, null);
  spielWelt.ereignis({ typ: 'niedergestreckt', id: spieler.id, x: spieler.x, y: spieler.y });
  spielWelt.melde(spieler.id, `💀 Niedergestreckt! Ein Mitspieler kann dich mit einem Erste-Hilfe-Kasten retten (${Math.round(k.niederDauer)} s)`);
  for (const s of spielWelt.alleVomTyp('spieler')) if (s !== spieler && !s.bot) spielWelt.melde(s.id, `🆘 ${spieler.name} liegt am Boden – hilf mit einem Erste-Hilfe-Kasten!`);
  return true;
}

/** Pro Tick für Niedergestreckte (aus ueberlebenSystem): Zeit läuft ab → tot. */
export function aktualisiereNiedergestreckt(spielWelt, spieler, dt) {
  spieler.niedergestreckt -= dt;
  if (spieler.niedergestreckt <= 0) toeten(spielWelt, spieler, null, { endgueltig: true });
}

export function helfen(spielWelt, helfer, zielId) {
  const k = spielWelt.konfiguration.mehrspieler;
  const ziel = Number.isInteger(zielId) ? spielWelt.holen(zielId) : null;
  if (ziel?.typ !== 'spieler' || !(ziel.niedergestreckt > 0)) return;
  if (Math.hypot(ziel.x - helfer.x, ziel.y - helfer.y) > k.reichweite) return spielWelt.melde(helfer.id, 'Geh näher heran');
  const slot = helfer.inventar.findIndex((e) => e?.defId === 'erste_hilfe_kasten');
  if (slot < 0) return spielWelt.melde(helfer.id, `Du brauchst einen ${GEGENSTAENDE.erste_hilfe_kasten.name}`);
  verbrauche(helfer, slot);
  if (helfer.ausgeruestet === slot && !helfer.inventar[slot]) helfer.ausgeruestet = null;
  Object.assign(ziel, { niedergestreckt: 0, leben: Math.max(1, Math.round(ziel.maxLeben * k.wiederbelebtLeben)) });
  if (ziel.zustand) ziel.zustand.blutung = false;
  spielWelt.ereignis({ typ: 'wiederbelebt', id: ziel.id, x: ziel.x, y: ziel.y, von: helfer.id });
  spielWelt.melde(ziel.id, `❤ ${helfer.name} hat dich gerettet!`);
  spielWelt.melde(helfer.id, `❤ Du hast ${ziel.name} gerettet`);
}

/** Pro Tick: Anfragen laufen ab, Handel bricht bei Abstand/Tod ab. */
export function aktualisiereMehrspieler(spielWelt, dt) {
  const k = spielWelt.konfiguration.mehrspieler;
  for (const s of spielWelt.alleVomTyp('spieler')) {
    if (!s.anfrage) continue;
    s.anfrage.rest -= dt;
    if (s.anfrage.rest <= 0 || !spielWelt.holen(s.anfrage.vonId)) s.anfrage = null;
  }
  for (const h of [...spielWelt.handel.values()]) {
    const a = spielWelt.holen(h.a);
    const b = spielWelt.holen(h.b);
    if (!a || !b || a.tot || b.tot || a.niedergestreckt > 0 || b.niedergestreckt > 0) beendeHandel(spielWelt, h, 'Handel abgebrochen');
    else if (Math.hypot(a.x - b.x, a.y - b.y) > k.handelAbstand) beendeHandel(spielWelt, h, 'Handel abgebrochen – zu weit auseinander');
  }
}

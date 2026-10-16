import { INVENTAR_PLAETZE } from '../../gemeinsam/konstanten.js';
import { GEGENSTAENDE } from './konfiguration/gegenstaende.js';
import { aktualisiereAusruestung, fuegeZumInventarHinzu, legeRucksackAn } from './systeme/inventarSystem.js';
import { wendeSkillsAn } from './systeme/levelSystem.js';
import { SKILLS, leereSkills } from '../../gemeinsam/spieler/skills.js';
import { pruefeAussehen } from '../../gemeinsam/spieler/aussehen.js';
import { entpackeErkundet, packeErkundet } from '../../gemeinsam/welt/erkundung.js';

/**
 * Spielstand eines Spielers: was beim Ausloggen erhalten bleibt.
 * Gespeichert/geladen über eine Speicher-Schnittstelle (siehe speicher/arbeitsspeicherSpeicher.js).
 *
 * Beim Laden wird ALLES geprüft – ein Spielstand kann alt, kaputt oder manipuliert sein.
 */
export const SPIELSTAND_VERSION = 1;
/** Höchstens so viele Karten-Erkundungen pro Spielstand (Schutz gegen aufgeblähte/manipulierte Stände). */
const MAX_ERKUNDETE_KARTEN = 64;
/** Vor v0.10 gab es Stapel bis 60 – größere Altstapel werden beim Laden auf mehrere Plätze verteilt, nichts geht verloren. Mehr als das ist manipuliert. */
const ALTES_STAPEL_MAX = 60;

/**
 * @param kartenId  Zone, in der der Spieler gerade ist (dort taucht er beim nächsten Login wieder auf)
 * erkundet = { kartenId: base64 } – eine Karte (K) pro Zone; spieler.erkundetAndere hält die Zonen, in denen er gerade nicht ist.
 */
export function erstelleSpielstand(spieler, kartenId) {
  const erkundet = { ...spieler.erkundetAndere };
  if (spieler.erkundet) erkundet[kartenId] = packeErkundet(spieler.erkundet);
  return {
    version: SPIELSTAND_VERSION,
    karte: kartenId,
    x: spieler.x,
    y: spieler.y,
    leben: spieler.leben,
    hunger: spieler.hunger,
    durst: spieler.durst,
    inventar: spieler.inventar.map((e) => (e ? { ...e } : null)),
    rucksack: spieler.rucksack,
    ausgeruestet: spieler.ausgeruestet,
    level: spieler.level,
    xp: spieler.xp,
    skills: { ...spieler.skills },
    skillPunkte: spieler.skillPunkte,
    aussehen: { ...spieler.aussehen },
    statistik: { ...spieler.statistik },
    spawn: spieler.spawn ? { ...spieler.spawn } : null,
    flaggeKarte: spieler.flaggeKarte,
    erkundet,
    gespeichert: new Date().toISOString(),
  };
}

/**
 * Übernimmt einen gespeicherten Stand in einen frisch erzeugten Spieler.
 * Ungültiges wird verworfen (Spieler behält dann seine Startwerte).
 * @returns true, wenn ein Spielstand übernommen wurde
 */
export function wendeSpielstandAn(spieler, stand, spielWelt) {
  if (!stand || typeof stand !== 'object' || stand.version !== SPIELSTAND_VERSION) return false;

  // Tote oder verhungerte Stände nicht wiederbeleben → frischer Start
  if (!(zahl(stand.leben) > 0)) return false;
  spieler.hunger = begrenze(zahl(stand.hunger) ?? spieler.hunger, 0, 100);
  spieler.durst = begrenze(zahl(stand.durst) ?? spieler.durst, 0, 100);
  if (Number.isInteger(stand.level) && stand.level >= 1) spieler.level = Math.min(stand.level, 999);
  if (Number.isFinite(stand.xp) && stand.xp >= 0) spieler.xp = Math.floor(stand.xp);
  ladeSkills(spieler, stand, spielWelt.konfiguration); // setzt maxLeben (Zähigkeit) – darum Leben erst danach
  spieler.leben = begrenze(stand.leben, 1, spieler.maxLeben);
  spieler.aussehen = pruefeAussehen(stand.aussehen);
  ladeStatistik(spieler, stand.statistik);
  ladeBasis(spieler, stand);
  const kartenId = spielWelt.karte.daten.id;
  const erkundet = ladeErkundet(stand.erkundet);
  if (erkundet[kartenId] && spieler.erkundet) {
    const daten = entpackeErkundet(erkundet[kartenId], spieler.erkundet.length);
    if (daten) spieler.erkundet = daten;
  }
  delete erkundet[kartenId];
  spieler.erkundetAndere = erkundet;

  // Position nur, wenn gleiche Karte und begehbar (Karte könnte sich geändert haben)
  const g = spielWelt.welt.kachelGroesse;
  if (stand.karte === spielWelt.karte.daten.id && Number.isFinite(stand.x) && Number.isFinite(stand.y)) {
    if (!spielWelt.welt.istBlockiert(Math.floor(stand.x / g), Math.floor(stand.y / g))) {
      spieler.x = stand.x;
      spieler.y = stand.y;
    }
  }

  spieler.inventar = new Array(INVENTAR_PLAETZE).fill(null);
  spieler.rucksack = null;
  if (GEGENSTAENDE[stand.rucksack]?.kategorie === 'rucksack') legeRucksackAn(null, spieler, stand.rucksack);
  if (Array.isArray(stand.inventar)) {
    const ueberschuss = []; // alte Stände mit größeren Stapeln (z. B. 50 Holz): Rest in freie Plätze statt wegwerfen
    stand.inventar.slice(0, spieler.inventar.length).forEach((e, slot) => {
      spieler.inventar[slot] = pruefeEintrag(e);
      const eintrag = spieler.inventar[slot];
      if (eintrag && Number.isInteger(e.menge) && e.menge > eintrag.menge && e.menge <= ALTES_STAPEL_MAX && eintrag.magazin === undefined) ueberschuss.push({ defId: eintrag.defId, menge: e.menge - eintrag.menge });
    });
    for (const u of ueberschuss) fuegeZumInventarHinzu(spieler, u.defId, u.menge);
  }
  const slot = stand.ausgeruestet;
  const waffe = Number.isInteger(slot) ? spieler.inventar[slot] : null;
  const kategorie = waffe && GEGENSTAENDE[waffe.defId].kategorie;
  spieler.ausgeruestet = kategorie === 'nahkampf' || kategorie === 'fernkampf' ? slot : null;
  aktualisiereAusruestung(spieler);
  return true;
}

/** Basisbau: Respawn-Bett und Zone der Basis-Flagge (nur wohlgeformte Werte). */
function ladeBasis(spieler, stand) {
  const idOk = (id) => typeof id === 'string' && /^[a-z0-9_-]{1,40}$/.test(id);
  const s = stand.spawn;
  spieler.spawn = s && idOk(s.karte) && Number.isInteger(s.tx) && Number.isInteger(s.ty) ? { karte: s.karte, tx: s.tx, ty: s.ty } : null;
  spieler.flaggeKarte = idOk(stand.flaggeKarte) ? stand.flaggeKarte : null;
}

/** Statistik (Tab-Liste): nur sinnvolle Zahlen übernehmen. */
function ladeStatistik(spieler, roh) {
  const zaehler = (v) => (Number.isFinite(v) && v >= 0 ? Math.min(Math.floor(v), 1e9) : 0);
  spieler.statistik = { zombies: zaehler(roh?.zombies), spieler: zaehler(roh?.spieler), ueberlebt: Number.isFinite(roh?.ueberlebt) && roh.ueberlebt >= 0 ? Math.min(roh.ueberlebt, 1e9) : 0 };
}

/** Erkundung aus dem Spielstand: { kartenId: base64 } – alte Stände hatten { karte, daten } (nur eine Karte). */
function ladeErkundet(roh) {
  const ergebnis = {};
  if (!roh || typeof roh !== 'object') return ergebnis;
  const eintraege = typeof roh.karte === 'string' && typeof roh.daten === 'string' ? [[roh.karte, roh.daten]] : Object.entries(roh);
  for (const [id, daten] of eintraege.slice(0, MAX_ERKUNDETE_KARTEN)) {
    if (/^[a-z0-9_-]{1,40}$/.test(id) && typeof daten === 'string' && daten.length < 200_000) ergebnis[id] = daten;
  }
  return ergebnis;
}

/**
 * Skills prüfen: jede Stufe 0..max, und es dürfen nicht mehr Punkte verteilt/offen sein, als das Level hergibt –
 * sonst alles zurück auf "Punkte frei verteilbar".
 */
function ladeSkills(spieler, stand, konfiguration) {
  const verfuegbar = (spieler.level - 1) * (konfiguration.level.punkteProLevel ?? 1);
  const skills = leereSkills();
  let verteilt = 0;
  for (const [name, def] of Object.entries(SKILLS)) {
    const wert = stand.skills?.[name];
    if (Number.isInteger(wert) && wert >= 0) skills[name] = Math.min(wert, def.max);
    verteilt += skills[name];
  }
  const offen = Number.isInteger(stand.skillPunkte) && stand.skillPunkte >= 0 ? stand.skillPunkte : 0;
  if (verteilt + offen > verfuegbar) {
    spieler.skills = leereSkills();
    spieler.skillPunkte = verfuegbar;
  } else {
    spieler.skills = skills;
    spieler.skillPunkte = offen;
  }
  wendeSkillsAn(spieler, konfiguration);
}

export function pruefeEintrag(e) {
  const def = e && GEGENSTAENDE[e.defId];
  if (!def || !Number.isInteger(e.menge) || e.menge < 1) return null;
  const menge = Math.min(e.menge, def.stapelbar ?? 1);
  if (def.kategorie === 'fernkampf') {
    const magazin = Number.isInteger(e.magazin) ? begrenze(e.magazin, 0, def.magazin) : 0;
    return { defId: e.defId, menge: 1, magazin };
  }
  return { defId: e.defId, menge };
}

function zahl(wert) {
  return Number.isFinite(wert) ? wert : undefined;
}

function begrenze(wert, min, max) {
  return Math.min(max, Math.max(min, wert));
}

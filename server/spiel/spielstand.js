import { INVENTAR_PLAETZE } from '../../gemeinsam/konstanten.js';
import { GEGENSTAENDE } from './konfiguration/gegenstaende.js';
import { aktualisiereAusruestung, legeRucksackAn } from './systeme/inventarSystem.js';
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

export function erstelleSpielstand(spieler, kartenId) {
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
    erkundet: spieler.erkundet ? { karte: kartenId, daten: packeErkundet(spieler.erkundet) } : null,
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
  if (stand.erkundet?.karte === spielWelt.karte.daten.id && typeof stand.erkundet.daten === 'string' && spieler.erkundet) {
    const erkundet = entpackeErkundet(stand.erkundet.daten, spieler.erkundet.length);
    if (erkundet) spieler.erkundet = erkundet;
  }

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
    stand.inventar.slice(0, spieler.inventar.length).forEach((e, slot) => {
      spieler.inventar[slot] = pruefeEintrag(e);
    });
  }
  const slot = stand.ausgeruestet;
  const waffe = Number.isInteger(slot) ? spieler.inventar[slot] : null;
  const kategorie = waffe && GEGENSTAENDE[waffe.defId].kategorie;
  spieler.ausgeruestet = kategorie === 'nahkampf' || kategorie === 'fernkampf' ? slot : null;
  aktualisiereAusruestung(spieler);
  return true;
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

function pruefeEintrag(e) {
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

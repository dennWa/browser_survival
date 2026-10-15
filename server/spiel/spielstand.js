import { INVENTAR_PLAETZE } from '../../gemeinsam/konstanten.js';
import { GEGENSTAENDE } from './konfiguration/gegenstaende.js';
import { aktualisiereAusruestung } from './systeme/inventarSystem.js';

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
    ausgeruestet: spieler.ausgeruestet,
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
  spieler.leben = begrenze(stand.leben, 1, spieler.maxLeben);
  spieler.hunger = begrenze(zahl(stand.hunger) ?? spieler.hunger, 0, 100);
  spieler.durst = begrenze(zahl(stand.durst) ?? spieler.durst, 0, 100);

  // Position nur, wenn gleiche Karte und begehbar (Karte könnte sich geändert haben)
  const g = spielWelt.welt.kachelGroesse;
  if (stand.karte === spielWelt.karte.daten.id && Number.isFinite(stand.x) && Number.isFinite(stand.y)) {
    if (!spielWelt.welt.istBlockiert(Math.floor(stand.x / g), Math.floor(stand.y / g))) {
      spieler.x = stand.x;
      spieler.y = stand.y;
    }
  }

  spieler.inventar = new Array(INVENTAR_PLAETZE).fill(null);
  if (Array.isArray(stand.inventar)) {
    stand.inventar.slice(0, INVENTAR_PLAETZE).forEach((e, slot) => {
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

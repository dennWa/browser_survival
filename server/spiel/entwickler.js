import { ENTWICKLER_FELDER } from './konfiguration/entwicklerFelder.js';
import { GEGENSTAENDE } from './konfiguration/gegenstaende.js';
import { zusatzLeben } from '../../gemeinsam/spieler/skills.js';
import { STANDARD_KONFIGURATION } from './konfiguration/spielKonfiguration.js';

/**
 * Developer-Modus (nur Admins): Werte aus entwicklerFelder.js live ändern.
 *
 * Änderungen werden als "Überschreibungen" gesammelt – genau das Format von server/daten/einstellungen.json:
 *   { spieler: { leben: 150 }, gegenstaende: { pistole: { schaden: 40 } } }
 * Der SpielServer speichert sie über einen austauschbaren Einstellungs-Speicher (Datei bzw. localStorage).
 */
const FELD_NACH_PFAD = new Map(ENTWICKLER_FELDER.map((f) => [f.pfad, f]));
const STANDARD_GEGENSTAENDE = structuredClone(GEGENSTAENDE);

/** Aktuelle Werte aller Felder (fürs Developer-Fenster). */
export function entwicklerWerte(konfiguration) {
  return ENTWICKLER_FELDER.map((f) => ({ ...f, wert: lies(konfiguration, f.pfad), standard: lies(null, f.pfad) }));
}

/**
 * Einen Wert setzen (auf min/max begrenzt) und sofort wirken lassen.
 * @returns gesetzter Wert oder null (unbekanntes Feld / keine Zahl)
 */
export function setzeEntwicklerWert(spielWelt, ueberschreibungen, pfad, wert) {
  const feld = FELD_NACH_PFAD.get(pfad);
  const zahl = Number(wert);
  if (!feld || !Number.isFinite(zahl)) return null;
  const begrenzt = Math.min(feld.max, Math.max(feld.min, zahl));
  schreibe(spielWelt.konfiguration, pfad, begrenzt);
  schreibeUeberschreibung(ueberschreibungen, pfad, begrenzt);
  wendeAn(spielWelt, pfad);
  return begrenzt;
}

/** Item-Überschreibungen (aus einstellungen.json / localStorage) auf die Item-Datenbank anwenden. */
export function wendeGegenstandsUeberschreibungenAn(gegenstaende = {}) {
  for (const [id, werte] of Object.entries(gegenstaende ?? {})) {
    if (!GEGENSTAENDE[id] || typeof werte !== 'object') continue;
    for (const [schluessel, wert] of Object.entries(werte)) {
      if (typeof wert === 'number' && Number.isFinite(wert) && typeof STANDARD_GEGENSTAENDE[id][schluessel] === 'number') {
        GEGENSTAENDE[id][schluessel] = wert;
      }
    }
  }
}

/** Alle Developer-Werte auf Standard zurück (andere Einstellungen wie der Servername bleiben). */
export function setzeAllesZurueck(spielWelt, ueberschreibungen) {
  for (const f of ENTWICKLER_FELDER) {
    schreibe(spielWelt.konfiguration, f.pfad, lies(null, f.pfad));
    wendeAn(spielWelt, f.pfad);
    entferneUeberschreibung(ueberschreibungen, f.pfad.split('.'));
  }
}

function entferneUeberschreibung(o, teile) {
  if (!o || typeof o !== 'object') return;
  if (teile.length === 1) {
    delete o[teile[0]];
    return;
  }
  entferneUeberschreibung(o[teile[0]], teile.slice(1));
  if (o[teile[0]] && typeof o[teile[0]] === 'object' && Object.keys(o[teile[0]]).length === 0) delete o[teile[0]];
}

// ---------------------------------------------------------------------------

/** Wert lesen; konfiguration = null → Standardwert */
function lies(konfiguration, pfad) {
  const teile = pfad.split('.');
  if (teile[0] === 'gegenstaende') return (konfiguration ? GEGENSTAENDE : STANDARD_GEGENSTAENDE)[teile[1]]?.[teile[2]];
  return teile.reduce((o, t) => o?.[t], konfiguration ?? STANDARD_KONFIGURATION);
}

function schreibe(konfiguration, pfad, wert) {
  const teile = pfad.split('.');
  if (teile[0] === 'gegenstaende') {
    if (GEGENSTAENDE[teile[1]]) GEGENSTAENDE[teile[1]][teile[2]] = wert;
    return;
  }
  const ziel = teile.slice(0, -1).reduce((o, t) => o[t], konfiguration);
  ziel[teile.at(-1)] = wert;
}

function schreibeUeberschreibung(ueberschreibungen, pfad, wert) {
  const teile = pfad.split('.');
  let o = ueberschreibungen;
  for (const t of teile.slice(0, -1)) o = o[t] ??= {};
  o[teile.at(-1)] = wert;
}

/** Was eine Änderung sofort bei laufenden Figuren bewirken soll. */
function wendeAn(spielWelt, pfad) {
  const k = spielWelt.konfiguration;
  if (pfad === 'spieler.leben') {
    for (const s of spielWelt.alleVomTyp('spieler')) {
      const anteil = s.leben / s.maxLeben;
      s.maxLeben = k.spieler.leben + zusatzLeben(s.skills);
      if (!s.tot) s.leben = Math.max(1, anteil * s.maxLeben);
    }
  }
  if (pfad.startsWith('zombie.')) {
    for (const z of spielWelt.alleVomTyp('zombie')) {
      const v = { ...k.zombie, ...(k.zombie.varianten?.[z.variante] ?? {}) };
      const anteil = z.leben / z.maxLeben;
      Object.assign(z, {
        maxLeben: v.leben,
        leben: Math.max(1, anteil * v.leben),
        jagdGeschwindigkeit: v.jagdGeschwindigkeit,
        wanderGeschwindigkeit: v.geschwindigkeit * 0.45,
        angriffsSchaden: v.angriffsSchaden,
      });
    }
  }
}

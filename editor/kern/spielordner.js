/**
 * Spielordner-Katalog (client/assets/eigene/index.json): die mitgelieferten .glb-Modelle mit natürlichen Maßen.
 * Umgebungsfrei – die UI lädt den Katalog einmal (`ladeSpielordner`) und trägt ihn per `setzeSpielordner` ein.
 * Genutzt von der KI-Aktion `modell` (kern/kiImport.js) und vom Gemini-Kontext (kern/gemini.js).
 *
 * Ein Modell wird als Objekttyp mit `glbDatei` (Pfad unter client/) angelegt – ohne Bibliothek/Upload. Die Zielgröße
 * (`hoehe` in Metern = Kacheln) skaliert das Modell gleichmäßig: b/h des Fußabdrucks folgen den natürlichen Proportionen.
 * Typ-ID: `sf_<name>_<hoehe in dm>` (z. B. `sf_wolf_9`), je Höhe ein eigener Typ.
 */
export const SPIELORDNER_PFAD = 'assets/eigene';
export const HOEHE_MIN = 0.05;
export const HOEHE_MAX = 20;

let katalog = new Map(); // stem → { stem, name, b, t, hoehe }

/** Dateiname ohne .glb, klein */
export const stemVon = (s) => String(s ?? '').trim().toLowerCase().replace(/^.*\//, '').replace(/\.glb$/, '');

/** index.json-Liste [{ datei, name, masse:{b,h,hoehe} }] eintragen (Einträge ohne Maße werden übersprungen) */
export function setzeSpielordner(liste) {
  katalog = new Map();
  for (const e of Array.isArray(liste) ? liste : []) {
    const m = e?.masse;
    if (!m || !(m.b > 0) || !(m.h > 0) || !(m.hoehe > 0) || typeof e.datei !== 'string') continue;
    const stem = stemVon(e.datei);
    if (/^[a-z0-9_-]{1,100}$/.test(stem)) katalog.set(stem, { stem, name: e.name ?? stem, b: m.b, t: m.h, hoehe: m.hoehe });
  }
}

export const spielordnerModell = (name) => katalog.get(stemVon(name)) ?? null;
export const spielordnerGroesse = () => katalog.size;

/** Lädt index.json (basis = URL-Ordner von client/assets/eigene/) und trägt ihn ein. @returns Anzahl Modelle mit Maßen */
export async function ladeSpielordner(basis, holen = fetch) {
  const antwort = await holen(new URL('index.json', basis));
  if (!antwort.ok) throw new Error(`index.json nicht gefunden (${antwort.status})`);
  setzeSpielordner(await antwort.json());
  return katalog.size;
}

const r1 = (v) => Math.round(v * 10) / 10;
const r3 = (v) => Math.round(v * 1000) / 1000;

/**
 * Objekttyp für ein Modell in Zielhöhe. @returns { typId, typ, b, h, hoehe } | null (unbekanntes Modell)
 * b/h = Fußabdruck in Kacheln (natürliche Proportionen × Faktor), mindestens 0,1.
 */
export function spielordnerTyp(name, hoehe = null) {
  const m = spielordnerModell(name);
  if (!m) return null;
  const ziel = Math.min(HOEHE_MAX, Math.max(HOEHE_MIN, Number.isFinite(hoehe) && hoehe > 0 ? hoehe : m.hoehe));
  const f = ziel / m.hoehe;
  const b = Math.max(0.1, r3(m.b * f));
  const h = Math.max(0.1, r3(m.t * f));
  const typId = `sf_${m.stem.replace(/[^a-z0-9]+/g, '_').slice(0, 28)}_${Math.round(ziel * 10)}`;
  const typ = { name: m.name, kategorie: 'Spielordner', b, h, hoehe3d: r3(ziel), blockiert: true, farbe: '#c080ff', glbDatei: `${SPIELORDNER_PFAD}/${m.stem}.glb` };
  return { typId, typ, b, h, hoehe: r3(ziel) };
}

/** Kompakte Liste für KIs: „wolf 1.1x5.3x2.7“ = Breite × Tiefe × Höhe in Metern im Originalmaß (Aktion `modell` skaliert) */
export function spielordnerKontext() {
  if (!katalog.size) return '';
  return [...katalog.values()].map((m) => `${m.stem} ${r1(m.b)}x${r1(m.t)}x${r1(m.hoehe)}`).join(', ');
}

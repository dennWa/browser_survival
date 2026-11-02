import { MODELL_KATEGORIEN } from '../../editor/kern/katalog.js';
import { HOEHE_MIN, HOEHE_MAX, SPIELORDNER_PFAD, stemVon } from '../../editor/kern/spielordner.js';

/**
 * Modell-Werkstatt des Studios (Phase 3) – umgebungsfreie Regeln (Tests: tests/studioModelle.test.js).
 * Die Modelle liegen als Dateien im Spielordner: client/assets/eigene/<stem>.glb, Katalog `index.json`
 * [{ datei, name, groesse, kategorie, masse {b,h,hoehe} (natürliche Maße), zielHoehe, … }]. Die Werkstatt ergänzt je Eintrag
 * die SPIEL-Einstellungen, die editor/kern/spielordner.spielordnerTyp beim Platzieren in den Objekttyp übernimmt:
 *   blockiert  false = Figuren laufen hindurch (Standard: true)
 *   ebene      'moebel' (Standard) | 'boden' (flach, man läuft drüber) | 'oben' (über den Figuren, blockiert nie)
 *   fuss       { b, h } Grundfläche in Kacheln bei zielHoehe (fehlt = aus den natürlichen Maßen); das Modell wird hineingepasst
 *   leerlauf   Name des Animations-Clips, der im Spiel als Schleife läuft (fehlt = keine)
 *
 *   pruefeModellFelder(roh)          → bereinigter Patch (null = Feld entfernen) – wirft bei Unsinn
 *   aktualisiereIndex(index, datei, patch) → neuer Index (unverändert sortiert), Eintrag muss existieren
 *   fussabdruck(eintrag, hoehe?)     → { b, h } in Kacheln (wie spielordnerTyp)
 *   verwendungen(karten, stem)       → [{ zone, typen: [typId], objekte }] (Map zoneId → EditorKarte)
 *   angleichOps(karte, stem, eintrag) → Ops: Typen/Objekte einer Zone auf die neuen Spiel-Einstellungen bringen
 *   freierStem(wunsch, vorhandene)   → gültiger, freier Dateiname (a–z, 0–9, -, _)
 *   farbtonDrehen([r,g,b], grad, saettigung, helligkeit) → [r,g,b] (0–1) – „Farbton fürs ganze Modell“
 */
export const MODELL_EBENEN = Object.freeze({ moebel: 'Normal (steht im Weg)', boden: 'Boden (flach, man läuft drüber)', oben: 'Oben (über den Figuren)' });
export const FUSS_MIN = 0.1;
export const FUSS_MAX = 40;
const STEM_MUSTER = /^[a-z0-9][a-z0-9_-]{0,60}$/;
const r3 = (v) => Math.round(v * 1000) / 1000;
const zahl = (w) => (w === null || w === undefined || w === '' ? NaN : Number(w));

export function pruefeModellFelder(roh = {}) {
  const p = {};
  if ('name' in roh) {
    const n = String(roh.name ?? '').trim().slice(0, 60);
    if (!n) throw new Error('Name fehlt');
    p.name = n;
  }
  if ('kategorie' in roh) {
    if (!Object.hasOwn(MODELL_KATEGORIEN, roh.kategorie)) throw new Error(`Unbekannter Bereich „${roh.kategorie}“`);
    p.kategorie = roh.kategorie;
  }
  if ('zielHoehe' in roh) {
    const h = zahl(roh.zielHoehe);
    if (!(h >= HOEHE_MIN && h <= HOEHE_MAX)) throw new Error(`Höhe im Spiel: ${HOEHE_MIN}–${HOEHE_MAX} m`);
    p.zielHoehe = r3(h);
  }
  if ('blockiert' in roh) p.blockiert = roh.blockiert === null ? null : !!roh.blockiert;
  if ('ebene' in roh) {
    if (roh.ebene !== null && !Object.hasOwn(MODELL_EBENEN, roh.ebene)) throw new Error(`Unbekannte Ebene „${roh.ebene}“`);
    p.ebene = roh.ebene === 'moebel' ? null : roh.ebene; // Standard nicht speichern
  }
  if ('fuss' in roh) {
    if (roh.fuss === null) p.fuss = null;
    else {
      const b = zahl(roh.fuss?.b);
      const h = zahl(roh.fuss?.h);
      if (!(b >= FUSS_MIN && b <= FUSS_MAX && h >= FUSS_MIN && h <= FUSS_MAX)) throw new Error(`Grundfläche: ${FUSS_MIN}–${FUSS_MAX} Kacheln`);
      p.fuss = { b: r3(b), h: r3(h) };
    }
  }
  if ('leerlauf' in roh) {
    const l = roh.leerlauf === null ? '' : String(roh.leerlauf).trim();
    if (l && !/^[^<>"\\]{1,60}$/.test(l)) throw new Error('Ungültiger Clip-Name');
    p.leerlauf = l || null;
  }
  if ('masse' in roh) {
    const m = roh.masse;
    if (!(m?.b > 0 && m?.h > 0 && m?.hoehe > 0)) throw new Error('Maße fehlen');
    p.masse = { b: r3(m.b), h: r3(m.h), hoehe: r3(m.hoehe) };
  }
  for (const f of ['urheber', 'lizenz', 'url']) if (f in roh) p[f] = String(roh[f] ?? '').trim().slice(0, 200) || null;
  if ('groesse' in roh && roh.groesse > 0) p.groesse = Math.round(roh.groesse);
  return p;
}

export function aktualisiereIndex(index, datei, patch) {
  let gefunden = false;
  const neu = index.map((e) => {
    if (e.datei !== datei) return e;
    gefunden = true;
    const n = { ...e };
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === undefined) delete n[k];
      else n[k] = v;
    }
    return n;
  });
  if (!gefunden) throw new Error(`„${datei}“ steht nicht in index.json`);
  return neu;
}

/** Grundfläche in Kacheln bei Höhe `hoehe` (Standard: zielHoehe) */
export function fussabdruck(e, hoehe = null) {
  const m = e.masse;
  const ziel = e.zielHoehe > 0 ? e.zielHoehe : m.hoehe;
  const h = hoehe > 0 ? hoehe : ziel;
  if (e.fuss) return { b: Math.max(FUSS_MIN, r3((e.fuss.b * h) / ziel)), h: Math.max(FUSS_MIN, r3((e.fuss.h * h) / ziel)) };
  const f = h / m.hoehe;
  return { b: Math.max(FUSS_MIN, r3(m.b * f)), h: Math.max(FUSS_MIN, r3(m.h * f)) };
}

const glbPfad = (stem) => `${SPIELORDNER_PFAD}/${stem}.glb`;

/** Welche Zonen benutzen das Modell (Typ mit glbDatei assets/eigene/<stem>.glb)? */
export function verwendungen(karten, stem) {
  const pfad = glbPfad(stemVon(stem));
  const liste = [];
  for (const [zone, karte] of karten) {
    const typen = [...karte.s('typen')].filter(([, t]) => t.glbDatei === pfad).map(([id]) => id);
    if (!typen.length) continue;
    const t = new Set(typen);
    liste.push({ zone, typen, objekte: [...karte.s('objekte').values()].filter((o) => t.has(o.typ)).length });
  }
  return liste;
}

/** Ops: Typen (blockiert, animation) und deren Objekte (blockiert, ebene) einer Zone an den Index-Eintrag angleichen */
export function angleichOps(karte, stem, e) {
  const pfad = glbPfad(stemVon(stem));
  const ops = [];
  const blockiert = e.blockiert !== false && e.ebene !== 'oben';
  const ids = new Set();
  for (const [id, t] of karte.s('typen')) {
    if (t.glbDatei !== pfad) continue;
    ids.add(id);
    const n = { ...t, blockiert };
    if (e.leerlauf) n.animation = e.leerlauf;
    else delete n.animation;
    if (JSON.stringify(n) !== JSON.stringify(t)) ops.push({ s: 'typen', k: id, neu: n });
  }
  for (const [id, o] of karte.s('objekte')) {
    if (!ids.has(o.typ)) continue;
    const n = { ...o, blockiert };
    if (e.ebene && e.ebene !== 'moebel') n.ebene = e.ebene;
    else delete n.ebene;
    if (JSON.stringify(n) !== JSON.stringify(o)) ops.push({ s: 'objekte', k: id, neu: n });
  }
  return ops;
}

export function freierStem(wunsch, vorhandene = []) {
  const belegt = new Set(vorhandene.map(stemVon));
  let basis = String(wunsch ?? '')
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
    .slice(0, 50) || 'modell';
  if (!STEM_MUSTER.test(basis)) basis = `m-${basis}`.slice(0, 50);
  if (!belegt.has(basis)) return basis;
  for (let n = 2; ; n++) if (!belegt.has(`${basis}-${n}`)) return `${basis}-${n}`;
}

/** RGB (0–1) im HSL-Raum verschieben: grad = Farbton (−180…180), saettigung/helligkeit = Faktor (1 = gleich) */
export function farbtonDrehen([r, g, b], grad = 0, saettigung = 1, helligkeit = 1) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  let l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h /= 6;
  }
  h = (((h + grad / 360) % 1) + 1) % 1;
  s = Math.min(1, Math.max(0, s * saettigung));
  l = Math.min(1, Math.max(0, l * helligkeit));
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const kanal = (t) => {
    t = ((t % 1) + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [kanal(h + 1 / 3), kanal(h), kanal(h - 1 / 3)];
}

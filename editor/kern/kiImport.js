import { KACHELN, istKachel } from '../../gemeinsam/welt/kacheln.js';
import { BAUWERKE } from '../../gemeinsam/welt/bauwerke.js';
import { LOOT_TABELLEN } from '../../server/spiel/konfiguration/lootTabellen.js';
import { markerSchluessel, ID_SAMMLUNGEN, kopie } from './karte.js';
import { katalog, objektInfo } from './katalog.js';
import { pruefeObjekt, pruefeMarker, pruefeBauwerk } from './platzierung.js';
import { linie as linienPunkte } from './raster.js';
import { FORMAT_AUSSCHNITT, AUSSCHNITT_VERSION, bereichsPruefsumme, bereichText } from './ausschnitt.js';
import { ZONEN_EINSTELLUNGEN, pruefeZonenEinstellungen } from '../../server/spiel/karten/zonenEinstellungen.js';
import { neueLootZone, pruefeLootZone } from '../../server/spiel/karten/lootZonen.js';
import { einfuegeOps } from './auswahl.js';
import { eingebautePrefabs } from './prefabs.js';
import { spielordnerTyp } from './spielordner.js';

/**
 * Import von KI-Änderungen (Phase 8). Ablauf:
 *   1. leseKiAntwort(text)        → { aktionen, meta } – verträgt ```json-Blöcke, Liste, { aktionen: [...] } oder einen
 *                                   zurückgegebenen Ausschnitt (format browser-survival-ausschnitt, wird in Aktionen umgerechnet)
 *   2. pruefeAenderungen(karte, …) → Vorschau: je Aktion { art: 'neu'|'weg'|'aendern'|'ungueltig', text, x, y, ops }
 *                                   Simuliert auf einer KOPIE (spätere Aktionen sehen frühere), echte Karte bleibt unberührt.
 *   3. erst nach Bestätigung: ergebnis.ops auf die echte Karte (ein Verlaufsschritt „KI-Änderungen“).
 * Regeln: nur der markierte Bereich (aus der Antwort {aktion:'bereich'} oder der aktuellen Auswahl) darf sich ändern;
 * alles andere wird als ungültig GEMELDET (nie still ignoriert). Platzierung wie im Editor (grün/rot-Prüfung).
 * Editor 2.0, 9.1 – neue Aktionen: wert (Zonen-Werte, nur Whitelist zonenEinstellungen + musik), lootzone (Rechteck im
 * Bereich, Items geprüft wie im Spiel-Lader), name (Zone/Raum/Objekt/Übergang/Loot-Zone), prefab (eingebaut oder Option
 * `prefabs`, ganz im Bereich). Zonenweite Aktionen (wert, name zone/raum, raum, typtextur) hängen an keinem Ort.
 * Runde 18 (7.3, Loot-Balance wurde komplett abgelehnt): `meta.zone` darf ID ODER Anzeigename sein; `wert` versteht
 * pfad|schluessel|{bereich, feld}, Groß/Klein, Zahl-Text („0,6“) und eindeutige Prozent (≥ 10 / "60%"); `raum` ändert vorhandene
 * Räume ohne lootTabelle (spawnChance/respawnZeit tolerant über `anteil`/`zahlAus`).
 */
export const KI_FORMAT = 'browser-survival-ki-aenderungen';

const SYNONYME = {
  setze: 'setze', setzen: 'setze', neu: 'setze', hinzufuegen: 'setze', add: 'setze', platziere: 'setze',
  entferne: 'entferne', entfernen: 'entferne', loesche: 'entferne', löschen: 'entferne', loeschen: 'entferne', remove: 'entferne',
  aendere: 'aendere', aendern: 'aendere', ändere: 'aendere', ändern: 'aendere', update: 'aendere', verschiebe: 'aendere', drehe: 'aendere',
  kachel: 'kachel', kacheln: 'kachel', boden: 'kachel', male: 'kachel',
  linie: 'linie', mauer: 'linie',
  marker: 'marker', spawn: 'marker',
  bauwerk: 'bauwerk',
  raum: 'raum',
  hoehe: 'hoehe', höhe: 'hoehe',
  typtextur: 'typtextur', textur: 'typtextur',
  bemale: 'bemale', bemalung: 'bemale', farbe: 'bemale',
  bereich: 'bereich',
  wert: 'wert', einstellung: 'wert', zonenwert: 'wert',
  lootzone: 'lootzone', lootzonen: 'lootzone',
  name: 'name', benenne: 'name', umbenennen: 'name',
  prefab: 'prefab', vorlage: 'prefab',
  bodenton: 'bodenton', bodenfarbe: 'bodenton',
  modell: 'modell', model: 'modell', spielordner: 'modell',
};
/** Leerer Bereich: jede Aktion mit Ort ist darin ungültig */
const KEIN_BEREICH = Object.freeze({ x0: 0, y0: 0, x1: -1, y1: -1 });
/** Aktion ohne Ort (gilt für die ganze Zone)? */
export function istZonenweit(a) {
  const art = SYNONYME[String(a?.aktion ?? '').toLowerCase()];
  if (art === 'name') {
    const ziel = a.ziel ?? (a.buchstabe ? 'raum' : a.id !== undefined ? 'objekt' : 'zone');
    return ziel === 'zone' || ziel === 'raum';
  }
  return ['wert', 'raum', 'typtextur', 'bodenton'].includes(art);
}
/** Felder, die eine KI an Objekten setzen darf */
const OBJEKT_FELDER = new Set(['typ', 'x', 'y', 'b', 'h', 'blockiert', 'ebene', 'drehung', 'name', 'groesse', 'radius', 'farbe', 'staerke', 'flackern', 'mast', 'textur', 'art', 'richtung', 'oeffnung']);
const FARBE_HEX = /^#[0-9a-fA-F]{6}$/;
export const MUSTER_NAMEN = ['holz', 'stein', 'metall', 'stoff', 'gras', 'streifen', 'punkte'];
const KACHEL_NAMEN = Object.fromEntries(Object.entries(KACHELN).map(([z, k]) => [k.name, z]));
Object.assign(KACHEL_NAMEN, { rasen: ',', weg: '-', mauer: '#', see: '~' });

/** Text der KI → { aktionen, meta, warnungen } (wirft bei unlesbarem Text) */
export function leseKiAntwort(text, karte = null) {
  let roh = typeof text === 'string' ? text.trim() : text;
  if (typeof roh === 'string') {
    const block = roh.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (block) roh = block[1].trim();
    const start = roh.search(/[[{]/);
    if (start > 0) roh = roh.slice(start);
    try {
      roh = JSON.parse(roh);
    } catch (e) {
      throw new Error(`Antwort ist kein JSON (${e.message}). Erwartet: Liste von Aktionen, z. B. [{"aktion":"setze","typ":"baum","x":23,"y":14}]`);
    }
  }
  const meta = {};
  const warnungen = [];
  let aktionen;
  if (Array.isArray(roh)) aktionen = roh;
  else if (roh && typeof roh === 'object') {
    if (roh.formatVersion > (roh.format === FORMAT_AUSSCHNITT ? AUSSCHNITT_VERSION : 1)) throw new Error(`Formatversion ${roh.formatVersion} ist neuer als dieser Editor`);
    if (roh.format === FORMAT_AUSSCHNITT) {
      if (!karte) throw new Error('Ausschnitt-Antwort braucht die Karte');
      return ausschnittZuAktionen(karte, roh);
    }
    aktionen = roh.aktionen ?? roh.aenderungen ?? roh.actions;
    if (!Array.isArray(aktionen)) throw new Error('Kein Feld "aktionen" (Liste) gefunden');
    if (roh.bereich) Object.assign(meta, normalisiereBereich(roh.bereich));
    if (roh.zone) meta.zone = roh.zone;
    if (roh.pruefsumme) meta.pruefsumme = roh.pruefsumme;
  } else throw new Error('Leere Antwort');
  const rest = [];
  for (const a of aktionen) {
    if (a && typeof a === 'object' && SYNONYME[String(a.aktion ?? '').toLowerCase()] === 'bereich') {
      Object.assign(meta, normalisiereBereich(a));
      if (a.zone) meta.zone = a.zone;
      if (a.pruefsumme) meta.pruefsumme = a.pruefsumme;
    } else rest.push(a);
  }
  return { aktionen: rest, meta, warnungen };
}

function normalisiereBereich(b) {
  const zahl = (v) => (Number.isInteger(v) ? v : Number.isInteger(Number(v)) ? Number(v) : null);
  const x0 = zahl(b.x0);
  const x1 = zahl(b.x1);
  const y0 = zahl(b.y0);
  const y1 = zahl(b.y1);
  return x0 !== null && x1 !== null && y0 !== null && y1 !== null ? { bereich: { x0: Math.min(x0, x1), x1: Math.max(x0, x1), y0: Math.min(y0, y1), y1: Math.max(y0, y1) } } : {};
}

/**
 * Zurückgegebener (veränderter) Ausschnitt → Aktionen: Raster-Unterschiede → kachel/marker, Objekte per id verglichen
 * (fehlt → entferne, geändert → aendere, ohne id → setze).
 */
export function ausschnittZuAktionen(karte, a) {
  const b = normalisiereBereich(a.bereich ?? {}).bereich;
  if (!b) throw new Error('Ausschnitt ohne gültigen Bereich');
  const aktionen = [];
  const warnungen = [];
  const zeilen = new Map();
  for (const z of a.raster ?? []) {
    const m = String(z).match(/^\s*(\d+) (.*)$/);
    if (m && Number(m[1]) >= b.y0 && Number(m[1]) <= b.y1) zeilen.set(Number(m[1]), m[2]);
  }
  for (let y = b.y0; y <= b.y1; y++) {
    const z = zeilen.get(y);
    if (z === undefined) continue;
    if (z.length !== b.x1 - b.x0 + 1) {
      warnungen.push(`Rasterzeile y ${y} hat ${z.length} statt ${b.x1 - b.x0 + 1} Zeichen – übersprungen`);
      continue;
    }
    for (let x = b.x0; x <= b.x1; x++) {
      const neu = z[x - b.x0];
      const m = karte.markerAn(x, y);
      const altZeichen = m ? (m.art === 'start' ? 'S' : m.art === 'zombie' ? 'Z' : m.raum) : karte.kachelAn(x, y);
      if (neu === altZeichen) continue;
      if (m) aktionen.push({ aktion: 'entferne', marker: m.art, x, y });
      if (istKachel(neu)) {
        if (neu !== karte.kachelAn(x, y)) aktionen.push({ aktion: 'kachel', x, y, zeichen: neu });
      }
      else if (neu === 'S') aktionen.push({ aktion: 'marker', art: 'start', x, y });
      else if (neu === 'Z') aktionen.push({ aktion: 'marker', art: 'zombie', x, y });
      else if (neu >= 'a' && neu <= 'z') aktionen.push({ aktion: 'marker', art: 'loot', raum: neu, x, y });
      else aktionen.push({ aktion: 'kachel', x, y, zeichen: neu }); // ungültiges Zeichen → wird in der Prüfung gemeldet
    }
  }
  if (Array.isArray(a.objekte)) {
    const vorher = new Map([...karte.s('objekte')].filter(([, o]) => o.x + o.b / 2 >= b.x0 && o.x + o.b / 2 <= b.x1 + 1 && o.y + o.h / 2 >= b.y0 && o.y + o.h / 2 <= b.y1 + 1));
    const gesehen = new Set();
    for (const o of a.objekte) {
      if (o?.id !== undefined && karte.s('objekte').has(o.id)) {
        gesehen.add(o.id);
        const alt = karte.s('objekte').get(o.id);
        const diff = Object.fromEntries(Object.entries(o).filter(([k, v]) => k !== 'id' && JSON.stringify(alt[k]) !== JSON.stringify(v)));
        if (Object.keys(diff).length) aktionen.push({ aktion: 'aendere', id: o.id, ...diff });
      } else aktionen.push({ aktion: 'setze', ...Object.fromEntries(Object.entries(o).filter(([k]) => k !== 'id')) });
    }
    for (const [id] of vorher) if (!gesehen.has(id)) aktionen.push({ aktion: 'entferne', id });
  }
  return { aktionen, meta: { bereich: b, zone: a.zone?.id, pruefsumme: a.pruefsumme }, warnungen };
}

const zahl = (v) => typeof v === 'number' && Number.isFinite(v);
const r3 = (v) => Math.round(v * 1000) / 1000;
/** 7.3: Zahl oder Zahl-Text („0,6“, "600", "60%") → Zahl, sonst null */
export function zahlAus(v) {
  if (zahl(v)) return v;
  if (typeof v !== 'string') return null;
  const t = v.trim().replace(/%$/, '').trim().replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}
/** 7.3: Anteil 0–1 (eindeutige Prozent-Angaben 10–100 bzw. "60%" → 0,6) oder null (z. B. 3 – unklar) */
export function anteil(v) {
  const n = zahlAus(v);
  if (n === null || n < 0) return null;
  if (n <= 1 && !/%\s*$/.test(String(v))) return n;
  if (n <= 100 && (n >= 10 || /%\s*$/.test(String(v)))) return Math.round(n * 10) / 1000;
  return null;
}
/** 7.3: Zonen-Angabe der KI = diese Zone? (ID oder Anzeigename, Groß/Klein egal) */
const gleicheZone = (z, karte) => [karte.id, karte.name].some((n) => String(n ?? '').trim().toLowerCase() === String(z).trim().toLowerCase());

/**
 * Aktionen prüfen und als Diff aufbereiten (die übergebene Karte bleibt unverändert).
 * @param optionen.bereich  { x0, x1, y0, y1 } erlaubter Bereich (Vorrang: meta.bereich aus der Antwort)
 * @returns {{ eintraege, ops, bereich, warnungen, zaehler: { neu, weg, aendern, ungueltig } }}
 */
export function pruefeAenderungen(karte, { aktionen, meta = {}, warnungen = [] }, { bereich = null, prefabs = [] } = {}) {
  // Ohne Bereich gehen nur zonenweite Aktionen (9.1: wert, name zone/raum, raum, typtextur) – alles mit Ort braucht eine Markierung
  const b = meta.bereich ?? bereich ?? (aktionen.length && aktionen.every(istZonenweit) ? KEIN_BEREICH : null);
  const hinweise = [...warnungen];
  if (!b) throw new Error('Kein Bereich: bitte vor dem Import einen Bereich markieren (⬚ ins Leere ziehen) oder {"aktion":"bereich",…} angeben');
  // 7.3: KIs schreiben oft den Anzeigenamen statt der ID („Stadtrand“ statt „stadtrand“) – beides gilt als dieselbe Zone
  if (meta.zone && !gleicheZone(meta.zone, karte)) throw new Error(`Die Änderungen sind für Zone „${meta.zone}“, offen ist „${karte.id}“`);
  if (meta.pruefsumme && meta.pruefsumme !== bereichsPruefsumme(karte, b)) hinweise.push('Der Bereich hat sich seit dem Export geändert – Vorschau genau ansehen');
  if (meta.bereich && bereich && JSON.stringify(meta.bereich) !== JSON.stringify(bereich)) hinweise.push(`Bereich aus der Antwort (${bereichText(meta.bereich)}) statt der aktuellen Markierung`);
  const sim = karte.klon();
  const eintraege = [];
  const alleOps = [];
  const drin = (x, y) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1;
  const rechteckDrin = (o) => o.x >= b.x0 - 1e-9 && o.y >= b.y0 - 1e-9 && o.x + o.b <= b.x1 + 1 + 1e-9 && o.y + o.h <= b.y1 + 1 + 1e-9;
  const objektDrin = (o) => (o.ebene === 'oben' ? drin(Math.floor(o.x + o.b / 2), Math.floor(o.y + o.h / 2)) : rechteckDrin(o));

  aktionen.forEach((a, i) => {
    const nr = i + 1;
    const ungueltig = (text, x = null, y = null) => eintraege.push({ nr, aktion: a, art: 'ungueltig', text: `Aktion ${nr}: ${text}`, x, y, ops: [] });
    const fertig = (art, text, ops, x, y, extra = {}) => {
      const ausgefuehrt = sim.anwenden(ops);
      if (!ausgefuehrt.length) return eintraege.push({ nr, aktion: a, art: 'ungueltig', text: `Aktion ${nr}: ändert nichts (${text})`, x, y, ops: [] });
      alleOps.push(...ops);
      eintraege.push({ nr, aktion: a, art, text, ops, x, y, ...extra });
    };
    if (!a || typeof a !== 'object' || Array.isArray(a)) return ungueltig('keine Aktion (Objekt erwartet)');
    const art = SYNONYME[String(a.aktion ?? (a.typ ? 'setze' : '')).toLowerCase()];
    if (!art) return ungueltig(`unbekannte Aktion „${a.aktion}“ (erlaubt: setze, modell, entferne, aendere, kachel, linie, marker, bauwerk, raum, hoehe, typtextur, bemale, bodenton, wert, lootzone, name, prefab)`);

    if (art === 'setze') {
      if (typeof a.typ !== 'string') return ungueltig('Feld "typ" fehlt');
      if (!zahl(a.x) || !zahl(a.y)) return ungueltig(`x/y fehlen für ${a.typ}`);
      if (BAUWERKE[a.typ] && !objektTypBekannt(a.typ, karte)) return bauwerkSetzen({ ...a, aktion: 'bauwerk' });
      const eintrag = katalog().find((e) => e.art === 'objekt' && e.typ === a.typ) ?? null;
      if (!eintrag && !karte.s('typen').has(a.typ)) return ungueltig(`unbekannter Objekttyp „${a.typ}“`, Math.floor(a.x), Math.floor(a.y));
      const eigen = karte.s('typen').get(a.typ);
      const o = { typ: a.typ, x: r3(a.x), y: r3(a.y), b: eintrag?.b ?? eigen?.b ?? 1, h: eintrag?.h ?? eigen?.h ?? 1 };
      if (eintrag?.blockiert ?? eigen?.blockiert) o.blockiert = true;
      if (eintrag?.ebene ?? eigen?.ebene) o.ebene = eintrag?.ebene ?? eigen?.ebene;
      if (eintrag?.extra) Object.assign(o, kopie(eintrag.extra));
      const fremd = uebernimmFelder(o, a);
      if (!(o.b > 0 && o.h > 0)) return ungueltig('b/h müssen > 0 sein', Math.floor(o.x), Math.floor(o.y));
      if (!objektDrin(o)) return ungueltig(`${o.typ} bei ${o.x}|${o.y} liegt außerhalb des Bereichs (${bereichText(b)})`, Math.floor(o.x), Math.floor(o.y));
      const pr = pruefeObjekt(sim, o);
      if (!pr.ok) return ungueltig(`${o.typ} bei ${o.x}|${o.y}: ${pr.grund}`, Math.floor(o.x), Math.floor(o.y));
      const id = sim.naechsteId;
      return fertig('neu', `＋ ${objektInfo(o.typ, karte).name} (${o.typ}) bei ${o.x}|${o.y}${fremd.length ? ` – ignoriert: ${fremd.join(', ')}` : ''}`, [{ s: 'objekte', k: id, neu: o }], Math.floor(o.x), Math.floor(o.y), { rechteck: o });
    }

    if (art === 'modell') {
      // Spielordner-Modell (kern/spielordner.js): legt bei Bedarf den Typ `sf_<name>_<dm>` mit `glbDatei` an und setzt das Objekt
      const name = a.modell ?? a.datei ?? a.name;
      if (typeof name !== 'string') return ungueltig('Feld "modell" (Dateiname ohne .glb) fehlt');
      if (!zahl(a.x) || !zahl(a.y)) return ungueltig(`x/y fehlen für Modell ${name}`);
      const sf = spielordnerTyp(name, zahl(a.hoehe) ? a.hoehe : null);
      if (!sf) return ungueltig(`unbekanntes Modell „${name}“ (Liste: spielordnerModelle im Kontext)`, Math.floor(a.x), Math.floor(a.y));
      const o = { typ: sf.typId, x: r3(a.x), y: r3(a.y), b: sf.b, h: sf.h, blockiert: true };
      // Größe nur über "hoehe" (gleichmäßige Skalierung): b/h/typ aus der Aktion zählen nicht
      const { aktion, modell, datei, name: _n, hoehe: _h, b: _b, h: _hh, typ: _t, ...rest } = a;
      const fremd = uebernimmFelder(o, rest);
      if (!objektDrin(o)) return ungueltig(`${name} bei ${o.x}|${o.y} liegt außerhalb des Bereichs (${bereichText(b)})`, Math.floor(o.x), Math.floor(o.y));
      const pr = pruefeObjekt(sim, o);
      if (!pr.ok) return ungueltig(`${name} bei ${o.x}|${o.y}: ${pr.grund}`, Math.floor(o.x), Math.floor(o.y));
      const ops = sim.s('typen').has(sf.typId) ? [] : [{ s: 'typen', k: sf.typId, neu: sf.typ }];
      ops.push({ s: 'objekte', k: sim.naechsteId, neu: o });
      return fertig('neu', `＋ Modell ${sf.typ.name} (${sf.hoehe} m hoch, ${sf.b}×${sf.h}) bei ${o.x}|${o.y}${fremd.length ? ` – ignoriert: ${fremd.join(', ')}` : ''}`, ops, Math.floor(o.x), Math.floor(o.y), { rechteck: o });
    }

    if (art === 'entferne') {
      if (a.marker || a.art) {
        if (!Number.isInteger(a.x) || !Number.isInteger(a.y)) return ungueltig('x/y (ganze Zahlen) für den Marker fehlen');
        const m = sim.markerAn(a.x, a.y);
        if (!m || (a.marker ?? a.art) !== m.art) return ungueltig(`kein ${a.marker ?? a.art}-Marker bei ${a.x}|${a.y}`, a.x, a.y);
        if (!drin(a.x, a.y)) return ungueltig(`Marker bei ${a.x}|${a.y} liegt außerhalb des Bereichs`, a.x, a.y);
        return fertig('weg', `－ Marker ${m.art}${m.raum ? ` (${m.raum})` : ''} bei ${a.x}|${a.y}`, [{ s: 'marker', k: markerSchluessel(a.x, a.y), neu: null }], a.x, a.y);
      }
      const ziel = findeElement(sim, a);
      if (!ziel) return ungueltig(a.id !== undefined ? `kein Element mit id ${a.id}` : `kein ${a.typ ?? 'Objekt'} bei ${a.x}|${a.y}`, Number.isFinite(a.x) ? Math.floor(a.x) : null, Number.isFinite(a.y) ? Math.floor(a.y) : null);
      const { s, k, wert } = ziel;
      const pos = position(s, wert);
      if (!(s === 'objekte' ? objektDrin(wert) : drin(pos.x, pos.y))) return ungueltig(`${wert.typ ?? s} (id ${k}) liegt außerhalb des Bereichs`, pos.x, pos.y);
      return fertig('weg', `－ ${wert.typ ?? s} (id ${k}) bei ${pos.x}|${pos.y}`, [{ s, k, neu: null }], pos.x, pos.y, { rechteck: s === 'objekte' ? wert : null });
    }

    if (art === 'aendere') {
      const ziel = findeElement(sim, a.id !== undefined ? { id: a.id } : { typ: a.typ, x: a.altX ?? a.x, y: a.altY ?? a.y });
      if (!ziel || ziel.s !== 'objekte') return ungueltig(a.id !== undefined ? `kein Objekt mit id ${a.id}` : 'Objekt nicht gefunden (id angeben)');
      const alt = ziel.wert;
      if (!objektDrin(alt)) return ungueltig(`${alt.typ} (id ${ziel.k}) liegt außerhalb des Bereichs`, Math.floor(alt.x), Math.floor(alt.y));
      const neu = { ...alt };
      const fremd = uebernimmFelder(neu, a.id !== undefined ? a : { ...a, x: a.neuX ?? a.x, y: a.neuY ?? a.y });
      if (!(neu.b > 0 && neu.h > 0)) return ungueltig('b/h müssen > 0 sein');
      if (!objektDrin(neu)) return ungueltig(`neue Lage ${neu.x}|${neu.y} liegt außerhalb des Bereichs`, Math.floor(neu.x), Math.floor(neu.y));
      const pr = pruefeObjekt(sim, neu, { ignoriere: new Set([ziel.k]) });
      if (!pr.ok) return ungueltig(`${neu.typ} bei ${neu.x}|${neu.y}: ${pr.grund}`, Math.floor(neu.x), Math.floor(neu.y));
      const unterschiede = Object.keys({ ...alt, ...neu }).filter((key) => JSON.stringify(alt[key]) !== JSON.stringify(neu[key])).map((key) => `${key} ${alt[key] ?? '–'}→${neu[key] ?? '–'}`);
      return fertig('aendern', `～ ${alt.typ} (id ${ziel.k}): ${unterschiede.join(', ')}${fremd.length ? ` – ignoriert: ${fremd.join(', ')}` : ''}`, [{ s: 'objekte', k: ziel.k, neu }], Math.floor(neu.x), Math.floor(neu.y), { rechteck: neu });
    }

    if (art === 'kachel' || art === 'linie') {
      const zeichen = kachelZeichen(a.zeichen ?? a.kachel ?? a.boden);
      if (!zeichen) return ungueltig(`unbekannte Kachel „${a.zeichen ?? a.kachel}“ (Zeichen: ${Object.keys(KACHELN).join(' ')})`);
      let punkte;
      if (art === 'linie') {
        const [x0, y0] = a.von ?? [];
        const [x1, y1] = a.bis ?? [];
        if (![x0, y0, x1, y1].every(Number.isInteger)) return ungueltig('linie braucht "von":[x,y] und "bis":[x,y]');
        punkte = linienPunkte(x0, y0, x1, y1);
      } else {
        if (!Number.isInteger(a.x) || !Number.isInteger(a.y)) return ungueltig('x/y (ganze Zahlen) fehlen');
        const bb = Number.isInteger(a.b) ? a.b : 1;
        const hh = Number.isInteger(a.h) ? a.h : 1;
        if (bb < 1 || hh < 1 || bb * hh > 40000) return ungueltig('b/h ungültig');
        punkte = [];
        for (let y = a.y; y < a.y + hh; y++) for (let x = a.x; x < a.x + bb; x++) punkte.push({ x, y });
      }
      const draussen = punkte.find((p) => !drin(p.x, p.y));
      if (draussen) return ungueltig(`Kachel ${draussen.x}|${draussen.y} liegt außerhalb des Bereichs (${bereichText(b)})`, draussen.x, draussen.y);
      const ops = punkte.map((p) => ({ s: 'kachel', i: sim.index(p.x, p.y), neu: zeichen }));
      const p0 = punkte[0];
      return fertig('aendern', `▦ ${punkte.length}× ${KACHELN[zeichen].name} „${zeichen}“ ab ${p0.x}|${p0.y}`, ops, p0.x, p0.y, { kacheln: punkte });
    }

    if (art === 'marker') {
      const mArt = a.art ?? a.marker;
      if (!['start', 'zombie', 'loot'].includes(mArt)) return ungueltig(`Marker-Art „${mArt}“ unbekannt (start, zombie, loot)`);
      if (!Number.isInteger(a.x) || !Number.isInteger(a.y)) return ungueltig('x/y (ganze Zahlen) fehlen');
      if (!drin(a.x, a.y)) return ungueltig(`Marker bei ${a.x}|${a.y} liegt außerhalb des Bereichs (${bereichText(b)})`, a.x, a.y);
      const m = { art: mArt };
      if (mArt === 'loot') {
        if (!sim.s('raeume').has(a.raum)) return ungueltig(`Loot-Punkt: Raum „${a.raum}“ gibt es nicht (vorher {"aktion":"raum",…})`, a.x, a.y);
        m.raum = a.raum;
      }
      if (mArt === 'zombie') {
        if (Number.isInteger(a.anzahl) && a.anzahl > 1) m.anzahl = Math.min(20, a.anzahl);
        if (zahl(a.respawnZeit) && a.respawnZeit > 0) m.respawnZeit = a.respawnZeit;
        if (a.horde === true) m.horde = true;
      }
      const pr = pruefeMarker(sim, mArt, a.x, a.y);
      if (!pr.ok) return ungueltig(`${mArt} bei ${a.x}|${a.y}: ${pr.grund}`, a.x, a.y);
      return fertig('neu', `＋ Marker ${mArt}${m.raum ? ` (${m.raum})` : ''} bei ${a.x}|${a.y}`, [{ s: 'marker', k: markerSchluessel(a.x, a.y), neu: m }], a.x, a.y);
    }

    if (art === 'bauwerk') return bauwerkSetzen(a);

    if (art === 'raum') {
      const k = typeof (a.buchstabe ?? a.raum) === 'string' ? String(a.buchstabe ?? a.raum).trim().toLowerCase() : a.buchstabe ?? a.raum;
      if (!(typeof k === 'string' && /^[a-z]$/.test(k))) return ungueltig('Raum braucht "buchstabe" (a–z)');
      const alt = sim.s('raeume').get(k);
      // 7.3: vorhandener Raum → lootTabelle optional (Loot-Balance ändert nur spawnChance/respawnZeit); neuer Raum braucht sie
      const tabelle = a.lootTabelle ?? a.tabelle ?? alt?.lootTabelle;
      if (!LOOT_TABELLEN[tabelle]) return ungueltig(`${alt ? '' : `Raum ${k} gibt es noch nicht – `}unbekannte Loot-Tabelle „${tabelle}“ (${Object.keys(LOOT_TABELLEN).join(', ')})`);
      const neu = { ...(alt ?? {}), name: String(a.name ?? alt?.name ?? k), lootTabelle: tabelle };
      const hinweise = [];
      if (a.spawnChance !== undefined) {
        const c = anteil(a.spawnChance);
        if (c === null) return ungueltig(`Raum ${k}: spawnChance „${a.spawnChance}“ ist kein Anteil 0–1`);
        if (c !== Number(a.spawnChance)) hinweise.push(`spawnChance ${a.spawnChance} → ${c}`);
        neu.spawnChance = c;
      }
      if (a.respawnZeit !== undefined) {
        const z = zahlAus(a.respawnZeit);
        if (!(z > 0)) return ungueltig(`Raum ${k}: respawnZeit „${a.respawnZeit}“ ist keine Zahl > 0 (Sekunden)`);
        neu.respawnZeit = z;
      }
      const werte = [neu.spawnChance !== undefined ? `Chance ${neu.spawnChance}` : '', neu.respawnZeit ? `Nachschub ${neu.respawnZeit}s` : ''].filter(Boolean).join(', ');
      return fertig(alt ? 'aendern' : 'neu', `${alt ? '～' : '＋'} Raum ${k}: ${neu.name} (${neu.lootTabelle}${werte ? `; ${werte}` : ''})${hinweise.length ? ` – umgerechnet: ${hinweise.join(', ')}` : ''}`, [{ s: 'raeume', k, neu }], null, null);
    }

    if (art === 'hoehe') {
      if (!Number.isInteger(a.x) || !Number.isInteger(a.y) || !zahl(a.wert ?? a.hoehe)) return ungueltig('hoehe braucht x, y, wert');
      if (!drin(a.x, a.y)) return ungueltig(`Höhe bei ${a.x}|${a.y} liegt außerhalb des Bereichs`, a.x, a.y);
      const w = Math.max(-10, Math.min(10, a.wert ?? a.hoehe));
      return fertig('aendern', `⛰ Höhe ${a.x}|${a.y} → ${w}`, [{ s: 'hoehe', i: sim.index(a.x, a.y), neu: w }], a.x, a.y);
    }
    if (art === 'typtextur') {
      // Farbe/Muster für ALLE Objekte eines Typs (gilt zonenweit, nicht nur im Bereich)
      if (typeof a.typ !== 'string' || !objektTypBekannt(a.typ, sim)) return ungueltig(`typtextur: unbekannter Objekttyp „${a.typ}“`);
      const alt = sim.s('texturen').get(a.typ) ?? {};
      const t = { ...alt };
      if (a.farbe !== undefined) {
        if (a.farbe === null || a.farbe === '') delete t.farbe;
        else if (FARBE_HEX.test(a.farbe)) t.farbe = a.farbe.toLowerCase();
        else return ungueltig(`typtextur: Farbe „${a.farbe}“ ist kein #rrggbb`);
      }
      if (a.muster !== undefined) {
        if (a.muster === null || a.muster === '') delete t.muster;
        else if (MUSTER_NAMEN.includes(a.muster)) t.muster = a.muster;
        else return ungueltig(`typtextur: Muster „${a.muster}“ unbekannt (${MUSTER_NAMEN.join(', ')})`);
      }
      const leer = !Object.keys(t).length;
      return fertig(sim.s('texturen').has(a.typ) ? 'aendern' : 'neu', `🎨 Typ ${objektInfo(a.typ, sim).name}: ${leer ? 'Standard' : `${t.farbe ?? '–'} · ${t.muster ?? 'kein Muster'}`}`, [{ s: 'texturen', k: a.typ, neu: leer ? null : t }], null, null);
    }

    if (art === 'bemale') {
      // Bodenfarbe (Bemalung) für ein Rechteck; farbe null/"" entfernt sie
      if (!Number.isInteger(a.x) || !Number.isInteger(a.y)) return ungueltig('bemale: x/y (ganze Zahlen) fehlen');
      const bb = Number.isInteger(a.b) ? a.b : 1;
      const hh = Number.isInteger(a.h) ? a.h : 1;
      if (bb < 1 || hh < 1 || bb * hh > 40000) return ungueltig('bemale: b/h ungültig');
      const weg = a.farbe === null || a.farbe === '' || a.farbe === undefined;
      if (!weg && !FARBE_HEX.test(a.farbe)) return ungueltig(`bemale: Farbe „${a.farbe}“ ist kein #rrggbb`);
      if (!drin(a.x, a.y) || !drin(a.x + bb - 1, a.y + hh - 1)) return ungueltig(`bemale: Rechteck ragt aus dem Bereich (${bereichText(b)})`, a.x, a.y);
      const ops = [];
      for (let y = a.y; y < a.y + hh; y++) for (let x = a.x; x < a.x + bb; x++) ops.push({ s: 'bemalung', k: markerSchluessel(x, y), neu: weg ? null : a.farbe.toLowerCase() });
      return fertig('aendern', `🖌 ${bb}×${hh} Bodenfarbe ${weg ? 'entfernt' : a.farbe} ab ${a.x}|${a.y}`, ops, a.x, a.y, { kacheln: ops.map((o) => { const [x, y] = o.k.split(',').map(Number); return { x, y }; }) });
    }

    if (art === 'bodenton') {
      // Zonen-Thema (9.6): alle Kacheln eines Zeichens in der ganzen Zone einfärben (Bemalung); farbe null = entfernen
      const zeichen = kachelZeichen(a.zeichen ?? a.kachel);
      if (!zeichen) return ungueltig(`bodenton: unbekannte Kachel „${a.zeichen ?? a.kachel}“`);
      const weg = a.farbe === null || a.farbe === '' || a.farbe === undefined;
      if (!weg && !FARBE_HEX.test(a.farbe)) return ungueltig(`bodenton: Farbe „${a.farbe}“ ist kein #rrggbb`);
      const ops = [];
      for (let i = 0; i < sim.zellen.length; i++) if (sim.zellen[i] === zeichen) ops.push({ s: 'bemalung', k: markerSchluessel(i % sim.breite, Math.floor(i / sim.breite)), neu: weg ? null : a.farbe.toLowerCase() });
      if (!ops.length) return ungueltig(`bodenton: keine Kachel „${zeichen}“ in der Zone`);
      return fertig('aendern', `🖌 Bodenton ${KACHELN[zeichen].name} „${zeichen}“ → ${weg ? 'ohne Farbe' : a.farbe} (${ops.length} Kacheln)`, ops, null, null);
    }

    if (art === 'wert') {
      // Zonen-Werte: nur was der Inspektor auch anbietet (Whitelist), Zahlen begrenzt wie im Spiel-Lader
      // 7.3: Pfad auch als schluessel/key oder {bereich:"loot", feld:"spawnChance"}; Groß/Klein egal; Zahlen als Text ok
      const pfadRoh = a.pfad ?? a.schluessel ?? a.key ?? a.path ?? (typeof a.bereich === 'string' && typeof (a.feld ?? a.field) === 'string' ? `${a.bereich}.${a.feld ?? a.field}` : '');
      const pfad = String(pfadRoh ?? '').trim().replace(/^einstellungen\./i, '');
      const roh = a.wert !== undefined ? a.wert : a.value;
      if (pfad.toLowerCase() === 'musik') {
        const v = roh === null || roh === '' || roh === undefined ? undefined : String(roh);
        if (v !== undefined && !/^[\w-]{1,40}$/.test(v)) return ungueltig('wert: Musik-Ordner nur a–z, 0–9, _ und -');
        return fertig('aendern', `🎵 Musik-Ordner → ${v ?? 'Standard'}`, [{ s: 'wert', pfad: 'musik', neu: v }], null, null);
      }
      const [bName, fName, ...rest] = pfad.split('.');
      const bereichName = Object.keys(ZONEN_EINSTELLUNGEN).find((n) => n.toLowerCase() === String(bName ?? '').toLowerCase());
      const def = bereichName ? ZONEN_EINSTELLUNGEN[bereichName].werte.find((f) => f.name.toLowerCase() === String(fName ?? '').toLowerCase()) : null;
      if (!def || rest.length) return ungueltig(`wert: „${pfadRoh}“ ist kein Zonen-Wert (erlaubt: ${Object.entries(ZONEN_EINSTELLUNGEN).flatMap(([n, d]) => d.werte.map((f) => `${n}.${f.name}`)).join(', ')}, musik)`);
      const feld = def.name;
      const titel = `${ZONEN_EINSTELLUNGEN[bereichName].titel}: ${def.label}`;
      if (roh === null) return fertig('aendern', `⚙ ${titel} → Standard`, [{ s: 'wert', pfad: `einstellungen.${bereichName}.${feld}`, neu: undefined }], null, null);
      let v = roh;
      if (def.typ === 'haken' && typeof v === 'string' && /^(true|false)$/i.test(v.trim())) v = v.trim().toLowerCase() === 'true';
      if (def.typ === 'zahl') {
        v = zahlAus(v);
        // Anteil-Felder (max 1): eindeutige Prozent-Angaben (≥ 10 oder "60%") → 0,6; kleine Ausreißer (z. B. 3) werden begrenzt
        if (def.max === 1 && v !== null && v <= 100 && (v >= 10 || (v > 1 && /%\s*$/.test(String(roh))))) v = Math.round(v * 10) / 1000;
      }
      const geprueft = v === null ? undefined : pruefeZonenEinstellungen({ [bereichName]: { [feld]: v } })[bereichName]?.[feld];
      if (geprueft === undefined) return ungueltig(`wert: ${def.label} braucht ${def.typ === 'haken' ? 'true/false' : 'eine Zahl'} (bekam ${JSON.stringify(roh)})`);
      const herkunft = geprueft !== v ? ` (begrenzt von ${v})` : v !== roh ? ` (aus ${JSON.stringify(roh)})` : '';
      return fertig('aendern', `⚙ ${titel} → ${geprueft}${herkunft}`, [{ s: 'wert', pfad: `einstellungen.${bereichName}.${feld}`, neu: geprueft }], null, null);
    }

    if (art === 'lootzone') {
      if (![a.x, a.y, a.b, a.h].every(Number.isInteger) || a.b < 1 || a.h < 1) return ungueltig('lootzone braucht x, y, b, h (ganze Zahlen)');
      if (!drin(a.x, a.y) || !drin(a.x + a.b - 1, a.y + a.h - 1)) return ungueltig(`lootzone ragt aus dem Bereich (${bereichText(b)})`, a.x, a.y);
      const basis = neueLootZone({ x: a.x, y: a.y, b: a.b, h: a.h }, { tabelle: LOOT_TABELLEN[a.tabelle] ? a.tabelle : 'lager', name: typeof a.name === 'string' ? a.name : `Loot-Zone ${sim.s('lootZonen').size + 1}` });
      const roh = { ...basis };
      for (const f of ['modus', 'punkte', 'ort', 'spawnChance', 'respawnZeit', 'max']) if (a[f] !== undefined) roh[f] = a[f];
      const liste = a.items ?? a.eintraege;
      if (Array.isArray(liste)) roh.eintraege = liste.map((e) => ({ id: e?.id ?? e?.item, chance: e?.chance, gewicht: e?.gewicht, menge: e?.menge }));
      const { zone, fehler: fz } = pruefeLootZone(roh, { breite: sim.breite, hoehe: sim.hoehe });
      if (!zone) return ungueltig(`lootzone: ${fz.join(', ')}`, a.x, a.y);
      const id = sim.naechsteId;
      return fertig('neu', `🎁 Loot-Zone „${zone.name}“ ${zone.b}×${zone.h} bei ${zone.x}|${zone.y} (${zone.eintraege.length} Items, ${zone.punkte} Punkte)${fz.length ? ` – ${fz.join(', ')}` : ''}`, [{ s: 'lootZonen', k: id, neu: zone }], zone.x, zone.y, { rechteck: zone });
    }

    if (art === 'name') {
      const name = typeof a.name === 'string' ? a.name.trim().slice(0, 60) : '';
      if (!name || /[<>"\\]/.test(name)) return ungueltig('name: Name fehlt oder enthält < > " \\');
      const ziel = a.ziel ?? (a.buchstabe ? 'raum' : a.id !== undefined ? 'objekt' : 'zone');
      if (ziel === 'zone') return fertig('aendern', `🏷 Zone heißt jetzt „${name}“`, [{ s: 'wert', pfad: 'name', neu: name }], null, null);
      if (ziel === 'raum') {
        const k = a.buchstabe ?? a.raum;
        const r = sim.s('raeume').get(k);
        if (!r) return ungueltig(`name: Raum „${k}“ gibt es nicht`);
        return fertig('aendern', `🏷 Raum ${k}: „${r.name}“ → „${name}“`, [{ s: 'raeume', k, neu: { ...r, name } }], null, null);
      }
      const s = ziel === 'uebergang' ? 'uebergaenge' : ziel === 'lootzone' ? 'lootZonen' : 'objekte';
      const w = sim.s(s).get(a.id);
      if (!w) return ungueltig(`name: kein ${ziel} mit id ${a.id}`);
      const pos = { x: Math.floor(w.x), y: Math.floor(w.y) };
      if (!drin(pos.x, pos.y)) return ungueltig(`name: ${ziel} (id ${a.id}) liegt außerhalb des Bereichs`, pos.x, pos.y);
      return fertig('aendern', `🏷 ${ziel} (id ${a.id}) heißt jetzt „${name}“`, [{ s, k: a.id, neu: { ...w, name } }], pos.x, pos.y);
    }

    if (art === 'prefab') {
      if (!Number.isInteger(a.x) || !Number.isInteger(a.y)) return ungueltig('prefab braucht x, y (linke obere Ecke, ganze Zahlen)');
      const alle = [...prefabs, ...eingebautePrefabs()];
      const p = alle.find((e) => e.name.toLowerCase() === String(a.name ?? '').toLowerCase());
      if (!p) return ungueltig(`prefab „${a.name}“ unbekannt (${alle.map((e) => e.name).join(', ')})`);
      const v = p.vorlage;
      if (!drin(a.x, a.y) || !drin(a.x + v.b - 1, a.y + v.h - 1)) return ungueltig(`prefab „${p.name}“ (${v.b}×${v.h}) ragt bei ${a.x}|${a.y} aus dem Bereich (${bereichText(b)})`, a.x, a.y);
      const { ops } = einfuegeOps(sim, v, a.x, a.y);
      return fertig('neu', `🏠 Prefab „${p.name}“ (${v.b}×${v.h}) bei ${a.x}|${a.y}`, ops, a.x, a.y, { rechteck: { x: a.x, y: a.y, b: v.b, h: v.h } });
    }

    return ungueltig('nicht unterstützt');

    function bauwerkSetzen(aw) {
      const x = aw.x ?? aw.tx;
      const y = aw.y ?? aw.ty;
      if (!BAUWERKE[aw.typ]) return ungueltig(`unbekanntes Bauwerk „${aw.typ}“ (${Object.keys(BAUWERKE).join(', ')})`);
      if (!Number.isInteger(x) || !Number.isInteger(y)) return ungueltig('x/y (ganze Zahlen) fehlen');
      if (!drin(x, y)) return ungueltig(`Bauwerk bei ${x}|${y} liegt außerhalb des Bereichs (${bereichText(b)})`, x, y);
      const pr = pruefeBauwerk(sim, aw.typ, x, y);
      if (!pr.ok) return ungueltig(`${aw.typ} bei ${x}|${y}: ${pr.grund}`, x, y);
      const w = { typ: aw.typ, tx: x, ty: y };
      if (aw.drehung === 1 || aw.drehung === 90 || aw.drehung === 270) w.drehung = 1;
      return fertig('neu', `＋ Bauwerk ${aw.typ} bei ${x}|${y}`, [{ s: 'bauwerke', k: sim.naechsteId, neu: w }], x, y);
    }
  });
  const zaehler = { neu: 0, weg: 0, aendern: 0, ungueltig: 0 };
  for (const e of eintraege) zaehler[e.art]++;
  return { eintraege, ops: alleOps, bereich: b, warnungen: hinweise, zaehler };
}

function objektTypBekannt(typ, karte) {
  return katalog().some((e) => e.art === 'objekt' && e.typ === typ) || karte.s('typen').has(typ);
}

/** Erlaubte Felder aus der Aktion ins Objekt übernehmen. @returns Liste ignorierter Felder */
function uebernimmFelder(o, a) {
  const fremd = [];
  for (const [k, v] of Object.entries(a)) {
    if (k === 'aktion' || k === 'id' || k === 'altX' || k === 'altY' || k === 'neuX' || k === 'neuY') continue;
    if (!OBJEKT_FELDER.has(k)) {
      fremd.push(k);
      continue;
    }
    if (['x', 'y', 'b', 'h', 'radius', 'staerke'].includes(k)) {
      if (zahl(v)) o[k] = r3(v);
      else fremd.push(k);
    } else if (k === 'drehung') {
      if (zahl(v)) {
        const d = ((Math.round(v) % 360) + 360) % 360;
        if (d) o.drehung = d;
        else delete o.drehung;
      } else fremd.push(k);
    } else if (k === 'blockiert') {
      if (v === true) o.blockiert = true;
      else delete o.blockiert;
    } else if (k === 'ebene') {
      if (['moebel', 'boden', 'oben', 'licht'].includes(v)) {
        if (v === 'moebel') delete o.ebene;
        else o.ebene = v;
      } else fremd.push(k);
    } else if (k === 'groesse') {
      if (v === 'klein' || v === 'gross') o.groesse = v;
      else fremd.push(k);
    } else if (k === 'flackern' || k === 'mast') o[k] = v === true;
    else if (typeof v === 'string' && v.length <= 80) o[k] = v;
    else fremd.push(k);
  }
  return fremd;
}

function kachelZeichen(w) {
  if (typeof w !== 'string') return null;
  if (istKachel(w)) return w;
  return KACHEL_NAMEN[w.toLowerCase()] ?? null;
}

function position(s, w) {
  if (s === 'bauwerke') return { x: w.tx, y: w.ty };
  return { x: Math.floor(w.x), y: Math.floor(w.y) };
}

/** Element per id (alle Zahl-Sammlungen) oder per typ + x + y (Objekt bzw. Bauwerk) */
function findeElement(karte, a) {
  if (a.id !== undefined) {
    for (const s of ID_SAMMLUNGEN) if (karte.s(s).has(a.id)) return { s, k: a.id, wert: karte.s(s).get(a.id) };
    return null;
  }
  if (!zahl(a.x) || !zahl(a.y)) return null;
  if (a.typ && BAUWERKE[a.typ] && !objektTypBekannt(a.typ, karte)) {
    for (const [k, w] of karte.s('bauwerke')) if (w.typ === a.typ && w.tx === Math.floor(a.x) && w.ty === Math.floor(a.y)) return { s: 'bauwerke', k, wert: w };
    return null;
  }
  // genaue Lage zuerst, sonst Objekt dieses Typs, das die Kachel bedeckt
  for (const [k, o] of karte.s('objekte')) if ((!a.typ || o.typ === a.typ) && Math.abs(o.x - a.x) < 0.01 && Math.abs(o.y - a.y) < 0.01) return { s: 'objekte', k, wert: o };
  for (const [k, o] of karte.s('objekte')) if ((!a.typ || o.typ === a.typ) && a.x >= o.x && a.x < o.x + o.b && a.y >= o.y && a.y < o.y + o.h) return { s: 'objekte', k, wert: o };
  return null;
}

/** Für die Vorschau-Hervorhebung: Ein Rechteck je Eintrag */
export function eintragRechteck(e) {
  if (e.rechteck) return { x: e.rechteck.x, y: e.rechteck.y, b: e.rechteck.b, h: e.rechteck.h };
  if (e.kacheln?.length) {
    const xs = e.kacheln.map((p) => p.x);
    const ys = e.kacheln.map((p) => p.y);
    return { x: Math.min(...xs), y: Math.min(...ys), b: Math.max(...xs) - Math.min(...xs) + 1, h: Math.max(...ys) - Math.min(...ys) + 1 };
  }
  return e.x !== null && e.x !== undefined ? { x: e.x, y: e.y, b: 1, h: 1 } : null;
}


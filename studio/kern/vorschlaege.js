import { KACHELN } from '../../gemeinsam/welt/kacheln.js';
import { ausSchluessel } from '../../editor/kern/karte.js';

/**
 * Vorschlagsmodus (Studio Phase 4.7) – umgebungsfrei, Tests: tests/studio.test.js.
 * KI-Änderungen werden SOFORT ausgeführt (die KI arbeitet sonst „blind“ auf dem alten Stand), aber als vorläufig gemerkt:
 *   Vorschlaege.merke(zone, name, ops)   ops = ausgeführte ops von EditorKarte.anwenden ({ s, i|k|pfad, alt, neu })
 *   elemente(eintrag) → Änderungen für Menschen: [{ id, text, art: neu|geaendert|weg, ops, ort {x,y,b,h} }]
 *       Kacheln je Zielzeichen zusammengefasst („120× Rasen“), Objekte/Marker/… je Schlüssel, Werte je Pfad
 *   rueckOps(karte, ops) → Ops, die genau diese Änderungen zurücknehmen – nur, wo der Wert noch dem Vorschlag entspricht
 *       (später von Hand Geändertes bleibt)
 *   verwerfe(id) / uebernimm(id?) – Liste pflegen; markierungen(zone) → für Viewport.setzeMarkierungen
 */
let naechste = 1;

export class Vorschlaege {
  constructor() {
    this.liste = []; // [{ id, zone, name, ops, elemente }]
  }

  merke(zone, name, ops) {
    if (!ops?.length) return null;
    const e = { id: naechste++, zone, name, ops };
    e.elemente = elemente(e);
    this.liste.push(e);
    return e;
  }

  vonZone(zone) {
    return this.liste.filter((e) => e.zone === zone);
  }

  /** Element (eintragId:elementId) oder ganzen Eintrag (eintragId) aus der Liste nehmen → dessen ops */
  nimm(ref) {
    const [eid, elid] = String(ref).split(':');
    const e = this.liste.find((x) => String(x.id) === eid);
    if (!e) return [];
    if (elid === undefined) {
      this.liste = this.liste.filter((x) => x !== e);
      return e.elemente.flatMap((x) => x.ops);
    }
    const el = e.elemente.find((x) => x.id === elid);
    if (!el) return [];
    e.elemente = e.elemente.filter((x) => x !== el);
    if (!e.elemente.length) this.liste = this.liste.filter((x) => x !== e);
    return el.ops;
  }

  /** Übernehmen = nur aus der Liste nehmen (die Änderungen sind schon da). ref leer = alle der Zone */
  uebernimm(zone, ref = null) {
    if (ref !== null) return this.nimm(ref).length;
    const n = this.vonZone(zone).length;
    this.liste = this.liste.filter((e) => e.zone !== zone);
    return n;
  }

  markierungen(zone, karte = null) {
    const m = this.vonZone(zone).flatMap((e) => e.elemente.flatMap((el) => (el.orte ?? []).map((o) => ({ ...o, art: el.art }))));
    return (karte ? mitKoordinaten(m, karte.breite) : m).slice(0, 3000);
  }
}

const kachelName = (z) => (z == null ? '?' : (KACHELN[z]?.name ?? z));

export function elemente(eintrag) {
  const aus = [];
  const kacheln = new Map(); // neu-Zeichen → ops
  const hoehen = [];
  const sammlung = new Map(); // `${s}|${k}` → ops
  for (const op of eintrag.ops) {
    if (op.s === 'kachel') {
      if (!kacheln.has(op.neu)) kacheln.set(op.neu, []);
      kacheln.get(op.neu).push(op);
    } else if (op.s === 'hoehe') hoehen.push(op);
    else {
      const k = op.s === 'wert' ? `wert|${op.pfad}` : `${op.s}|${op.k}`;
      if (!sammlung.has(k)) sammlung.set(k, []);
      sammlung.get(k).push(op);
    }
  }
  for (const [z, ops] of kacheln) aus.push({ id: `k${z}`, text: `${ops.length}× Boden → ${kachelName(z)}`, art: 'geaendert', ops, kachelOps: true });
  if (hoehen.length) aus.push({ id: 'h', text: `Gelände (${hoehen.length} Kacheln)`, art: 'geaendert', ops: hoehen, kachelOps: true });
  for (const [k, ops] of sammlung) {
    const erst = ops[0];
    const letzt = ops.at(-1);
    const art = erst.alt == null ? 'neu' : letzt.neu == null ? 'weg' : 'geaendert';
    const w = letzt.neu ?? erst.alt ?? {};
    const was = erst.s === 'wert' ? `Einstellung ${erst.pfad}` : `${{ objekte: 'Objekt', marker: 'Punkt', spawnpunkte: 'Spawnpunkt', lootZonen: 'Loot-Zone', raeume: 'Raum', raumFlaechen: 'Raumfläche', klaenge: 'Klang', uebergaenge: 'Übergang', zombieBereiche: 'Zombie-Bereich', typen: 'Objekttyp', notizen: 'Notiz', bauwerke: 'Bauwerk', tierBereiche: 'Hasen-Bereich', ankuenfte: 'Ankunft' }[erst.s] ?? erst.s} ${w.typ ?? w.inhalt ?? w.name ?? w.art ?? ''}`.trim();
    aus.push({ id: k, text: `${{ neu: 'neu', weg: 'gelöscht', geaendert: 'geändert' }[art]}: ${was}`, art, ops, s: erst.s, k: erst.k });
  }
  for (const el of aus) el.orte = orte(el);
  return aus;
}

/** Orte (Kacheln) eines Elements für die Markierung in der Ansicht */
function orte(el) {
  if (el.kachelOps) return el.ops.slice(0, 1500).map((op) => ({ i: op.i }));
  const w = el.ops.at(-1).neu ?? el.ops[0].alt;
  if (!w || typeof w !== 'object') return [];
  if (el.s === 'marker') {
    const [x, y] = ausSchluessel(el.k);
    return [{ x, y, b: 1, h: 1 }];
  }
  if (Number.isFinite(w.tx)) return [{ x: w.tx, y: w.ty, b: 1, h: 1 }];
  if (Number.isFinite(w.x) && Number.isFinite(w.y)) return [{ x: w.x - (w.b ? 0 : 0.5), y: w.y - (w.h ? 0 : 0.5), b: w.b ?? 1, h: w.h ?? 1 }];
  return [];
}

/** Kachel-Indizes der Orte in x/y umrechnen (braucht die Kartenbreite) */
export function mitKoordinaten(orte, breite) {
  return orte.map((o) => (o.i !== undefined ? { ...o, x: o.i % breite, y: Math.floor(o.i / breite), b: 1, h: 1 } : o));
}

const gleich = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Rücknahme-Ops (neueste zuerst), nur wo der aktuelle Wert noch dem Vorschlag entspricht */
export function rueckOps(karte, ops) {
  const aus = [];
  for (const op of ops.slice().reverse()) {
    let aktuell;
    if (op.s === 'kachel') aktuell = karte.zellen[op.i];
    else if (op.s === 'hoehe') aktuell = karte.hoehen[op.i];
    else if (op.s === 'wert') aktuell = karte.wert(op.pfad);
    else aktuell = karte.s(op.s)?.get(op.k) ?? null;
    if (!gleich(aktuell, op.neu)) continue;
    aus.push(op.s === 'kachel' || op.s === 'hoehe' ? { s: op.s, i: op.i, neu: op.alt } : op.s === 'wert' ? { s: 'wert', pfad: op.pfad, neu: op.alt } : { s: op.s, k: op.k, neu: op.alt ?? null });
  }
  return aus;
}

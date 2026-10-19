/**
 * EditorKarte – das Datenmodell, an dem der Editor arbeitet (umgebungsfrei: läuft im Browser UND in node:test).
 *
 * Anders als das Spielformat (ASCII mit eingebetteten Markern) hält der Editor Boden und Marker GETRENNT:
 *   zellen[]  Kachelzeichen je Kachel (nur echte Kacheln aus KACHELN, nie Marker) – Index = y * breite + x
 *   hoehen[]  Terrain-Höhe je Kachel (Zahl, 0 = flach; nur Darstellung, siehe kern/terrain.js)
 *   sammlungen (Map Schlüssel → Wert):
 *     objekte       Zahl-ID → { typ, x, y, b, h, blockiert?, ebene?, drehung?, name?, farbe?, textur?, … }  (Kacheln, Brüche erlaubt)
 *     uebergaenge   Zahl-ID → { x, y, b, h, ziel, ankunft, name }
 *     bauwerke      Zahl-ID → { typ, tx, ty, drehung? }        (kartenfeste Bauwerke: Zaun, Lagerkiste …)
 *     tierBereiche  Zahl-ID → { x, y, b, h, art: 'hase', anzahl, respawnZeit? }
 *     raumFlaechen  Zahl-ID → { raum: 'a', x, y, b, h }        (markierte Raumfläche, gehört zu raeume[raum])
 *     marker        "x,y"   → { art: 'start'|'zombie'|'loot', raum?, anzahl?, respawnZeit?, horde? }
 *     raeume        'a'–'z' → { name, lootTabelle, spawnChance?, respawnZeit? }
 *     ankuenfte     Name    → { x, y }
 *     typen         Typ-ID  → eigener Objekttyp { name, kategorie, b, h, blockiert, ebene, farbe?, bild?, modus? }
 *     texturen      Typ-ID  → { farbe?, muster? }              (Bemalung pro Typ; pro Objekt: objekt.farbe/textur)
 *     bemalung      "x,y"   → '#rrggbb'                          (Farbe auf dem Boden, Phase 10 – Spiel malt sie in die Bodentextur)
 *     klaenge       Zahl-ID → Klang { name, audio, art punkt|bereich|global, … } (Editor 2.0 Phase 4, gemeinsam/audio/klanglandschaft.js)
 *   werte       { id, name, musik?, einstellungen: { wetter, zombie, tiere, loot } } (freie JSON-Werte, Pfad-Zugriff)
 *
 * JEDE Änderung läuft über `anwenden(ops)` – eine Liste von Operationen mit altem und neuem Wert. Daraus entsteht
 * der unbegrenzte, speicherbare Verlauf (kern/verlauf.js). Operationen:
 *   { s: 'kachel', i, neu }            Kachel setzen (Zeichen)
 *   { s: 'hoehe', i, neu }             Terrain-Höhe setzen
 *   { s: <Sammlung>, k, neu }          Eintrag setzen (neu = null → löschen)
 *   { s: 'wert', pfad, neu }           Wert unter Pfad 'einstellungen.wetter.dauerMin' setzen (undefined → entfernen)
 *   { s: 'raster', neu: { breite, hoehe, zellen, hoehen } }   ganzes Raster tauschen (Größe ändern)
 * `anwenden` trägt `alt` selbst ein und lässt No-ops weg; `umkehren(ops)` liefert die Gegenoperationen.
 */
export const SAMMLUNGEN = Object.freeze(['objekte', 'uebergaenge', 'bauwerke', 'tierBereiche', 'raumFlaechen', 'marker', 'raeume', 'ankuenfte', 'typen', 'texturen', 'bemalung', 'klaenge']);
/** Sammlungen mit Zahl-IDs (neue Einträge bekommen naechsteId) */
export const ID_SAMMLUNGEN = Object.freeze(['objekte', 'uebergaenge', 'bauwerke', 'tierBereiche', 'raumFlaechen', 'klaenge']);

/** Tiefe Kopie (nur JSON-Daten). */
export const kopie = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const gleich = (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b);
export const markerSchluessel = (x, y) => `${x},${y}`;
export const ausSchluessel = (k) => k.split(',').map(Number);

export class EditorKarte {
  constructor({ id = 'neue_zone', name = 'Neue Zone', breite = 40, hoehe = 30, fuellung = ',' } = {}) {
    this.breite = breite;
    this.hoehe = hoehe;
    this.zellen = new Array(breite * hoehe).fill(fuellung);
    this.hoehen = new Array(breite * hoehe).fill(0);
    this.sammlungen = Object.fromEntries(SAMMLUNGEN.map((s) => [s, new Map()]));
    this.werte = { id, name, einstellungen: {} };
    this.naechsteId = 1;
    /** steigt bei jeder Änderung (Zeichnen, Validierung, Autosave lesen es) */
    this.version = 0;
    this.beobachter = new Set();
  }

  get id() {
    return this.werte.id;
  }

  get name() {
    return this.werte.name;
  }

  /** (ops) → wird nach jeder Änderung aufgerufen */
  beobachte(f) {
    this.beobachter.add(f);
    return () => this.beobachter.delete(f);
  }

  neueId() {
    return this.naechsteId++;
  }

  imFeld(x, y) {
    return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < this.breite && y < this.hoehe;
  }

  index(x, y) {
    return y * this.breite + x;
  }

  kachelAn(x, y) {
    return this.imFeld(x, y) ? this.zellen[this.index(x, y)] : null;
  }

  hoeheAn(x, y) {
    return this.imFeld(x, y) ? this.hoehen[this.index(x, y)] : 0;
  }

  farbeAn(x, y) {
    return this.sammlungen.bemalung.get(markerSchluessel(x, y)) ?? null;
  }

  markerAn(x, y) {
    return this.sammlungen.marker.get(markerSchluessel(x, y)) ?? null;
  }

  /** Map einer Sammlung */
  s(name) {
    return this.sammlungen[name];
  }

  /** Wert unter Pfad ('einstellungen.wetter.dauerMin') oder undefined */
  wert(pfad) {
    return pfad.split('.').reduce((o, t) => (o == null ? undefined : o[t]), this.werte);
  }

  /** Objekte, deren Rechteck das Kachel-Rechteck [x0..x1]×[y0..y1] (inklusive) berührt. @returns [[id, objekt]] */
  objekteIn(x0, y0, x1, y1, sammlung = 'objekte') {
    const liste = [];
    for (const [id, o] of this.sammlungen[sammlung]) {
      const ox = o.x ?? o.tx;
      const oy = o.y ?? o.ty;
      const ob = o.b ?? 1;
      const oh = o.h ?? 1;
      if (ox < x1 + 1 && ox + ob > x0 && oy < y1 + 1 && oy + oh > y0) liste.push([id, o]);
    }
    return liste;
  }

  /** Oberstes Objekt unter dem Punkt (Kachelkoordinaten, Brüche) – oder null. */
  objektBei(px, py) {
    let treffer = null;
    for (const [id, o] of this.sammlungen.objekte) if (px >= o.x && px < o.x + o.b && py >= o.y && py < o.y + o.h) treffer = [id, o];
    return treffer;
  }

  /**
   * Operationen ausführen. Trägt `alt` ein, lässt No-ops weg.
   * @returns die tatsächlich ausgeführten Operationen (für den Verlauf)
   */
  anwenden(ops) {
    const fertig = [];
    for (const roh of ops) {
      const op = this.#einzeln(roh);
      if (op) fertig.push(op);
    }
    if (fertig.length) {
      this.version++;
      for (const f of this.beobachter) f(fertig);
    }
    return fertig;
  }

  #einzeln(op) {
    switch (op.s) {
      case 'kachel':
      case 'hoehe': {
        const feld = op.s === 'kachel' ? this.zellen : this.hoehen;
        if (!(op.i >= 0 && op.i < feld.length)) return null;
        const alt = feld[op.i];
        if (alt === op.neu) return null;
        feld[op.i] = op.neu;
        return { s: op.s, i: op.i, alt, neu: op.neu };
      }
      case 'wert': {
        const alt = kopie(this.wert(op.pfad));
        if (gleich(alt, op.neu)) return null;
        setzePfad(this.werte, op.pfad, kopie(op.neu));
        return { s: 'wert', pfad: op.pfad, alt, neu: kopie(op.neu) };
      }
      case 'raster': {
        const alt = { breite: this.breite, hoehe: this.hoehe, zellen: this.zellen.join(''), hoehen: [...this.hoehen] };
        const neu = op.neu;
        this.breite = neu.breite;
        this.hoehe = neu.hoehe;
        this.zellen = [...neu.zellen];
        this.hoehen = neu.hoehen ? [...neu.hoehen] : new Array(neu.breite * neu.hoehe).fill(0);
        return { s: 'raster', alt, neu: { breite: neu.breite, hoehe: neu.hoehe, zellen: this.zellen.join(''), hoehen: [...this.hoehen] } };
      }
      default: {
        const map = this.sammlungen[op.s];
        if (!map) throw new Error(`Unbekannte Operation "${op.s}"`);
        const alt = map.has(op.k) ? kopie(map.get(op.k)) : null;
        const neu = op.neu == null ? null : kopie(op.neu);
        if (gleich(alt, neu)) return null;
        if (neu === null) map.delete(op.k);
        else map.set(op.k, neu);
        if (typeof op.k === 'number' && op.k >= this.naechsteId) this.naechsteId = op.k + 1;
        return { s: op.s, k: op.k, alt, neu };
      }
    }
  }

  /** Zustand als JSON (Entwurf, mit IDs – damit der gespeicherte Verlauf weiter passt). */
  alsJson() {
    return {
      breite: this.breite,
      hoehe: this.hoehe,
      zellen: this.zellen.join(''),
      hoehen: this.hoehen.some((h) => h !== 0) ? this.hoehen : null,
      sammlungen: Object.fromEntries(SAMMLUNGEN.map((s) => [s, [...this.sammlungen[s]]])),
      werte: kopie(this.werte),
      naechsteId: this.naechsteId,
    };
  }

  static ausJson(j) {
    const k = new EditorKarte({ breite: j.breite, hoehe: j.hoehe });
    if (typeof j.zellen !== 'string' || j.zellen.length !== j.breite * j.hoehe) throw new Error('Entwurf: Kachelraster beschädigt');
    k.zellen = [...j.zellen];
    if (Array.isArray(j.hoehen) && j.hoehen.length === k.zellen.length) k.hoehen = j.hoehen.map(Number);
    for (const s of SAMMLUNGEN) for (const [schluessel, wert] of j.sammlungen?.[s] ?? []) k.sammlungen[s].set(schluessel, wert);
    k.werte = { einstellungen: {}, ...kopie(j.werte) };
    k.naechsteId = Math.max(j.naechsteId ?? 1, ...ID_SAMMLUNGEN.flatMap((s) => [...k.sammlungen[s].keys()].map((id) => id + 1)), 1);
    return k;
  }

  /** Unabhängige Kopie (ohne Beobachter) */
  klon() {
    return EditorKarte.ausJson(this.alsJson());
  }
}

/** Gegenoperationen (rückwärts, alt ⇄ neu) */
export function umkehren(ops) {
  return ops
    .slice()
    .reverse()
    .map((op) => ({ ...op, alt: op.neu, neu: op.alt }));
}

function setzePfad(ziel, pfad, wert) {
  const teile = pfad.split('.');
  let o = ziel;
  for (const t of teile.slice(0, -1)) {
    if (o[t] == null || typeof o[t] !== 'object') o[t] = {};
    o = o[t];
  }
  const letzter = teile.at(-1);
  if (wert === undefined) delete o[letzter];
  else o[letzter] = wert;
  // leere Zwischenobjekte aufräumen (z. B. einstellungen.wetter = {})
  for (let n = teile.length - 1; n > 0; n--) {
    const eltern = teile.slice(0, n - 1).reduce((x, t) => x?.[t], ziel);
    const kind = eltern?.[teile[n - 1]];
    if (kind && typeof kind === 'object' && Object.keys(kind).length === 0 && teile[n - 1] !== 'einstellungen') delete eltern[teile[n - 1]];
  }
}

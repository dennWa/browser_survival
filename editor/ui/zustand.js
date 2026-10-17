import { Verlauf } from '../kern/verlauf.js';
import { entwurfJson, ladeDatei } from '../kern/format.js';
import { ID_SAMMLUNGEN } from '../kern/karte.js';

/**
 * Zustand des Editors (Browser): Projekt = mehrere Zonen-Entwürfe { karte, verlauf }, aktive Zone, Werkzeug, Auswahl,
 * Zwischenablage, Ansicht. Kleine Ereignis-Schnittstelle: `bei(name, f)` / `melde(name, daten)`.
 * Ereignisse: 'karte' (Inhalt geändert), 'zone' (andere Zone aktiv / Liste), 'auswahl', 'werkzeug', 'ansicht', 'meldung'.
 *
 * ⚠ Editor-Code ändert die Karte NIE direkt: nur über `ausfuehren` (→ Verlauf, Autosave). So bleibt jede Änderung
 *   rückgängig machbar, und UI-Umbauten können keine Karte verändern.
 */
export class Zustand {
  constructor(speicher) {
    this.speicher = speicher;
    /** id → { karte, verlauf, abmelden } */
    this.zonen = new Map();
    this.aktivId = null;
    this.werkzeug = 'auswahl';
    this.malModus = 'pinsel'; // pinsel | rechteck | linie | fuellen (für Kacheln)
    this.eintrag = null; // Katalog-Eintrag der Bauleiste
    this.kategorie = 'Wege';
    this.pinselGroesse = 1;
    this.drehung = 0; // für neue Objekte
    /** Auswahl: Map "s|k" → { s, k } */
    this.auswahl = new Map();
    this.auswahlRechteck = null; // { x, y, b, h } (Excel-artig, für Kopieren & Ausschnitt-Export)
    this.zwischenablage = null;
    this.ansicht = '2d';
    this.overlays = { raster: true, innen: false, steil: true, nachbarn: true, bereiche: true };
    this.terrainStaerke = 0.5;
    this.layout = {}; // Zonen-Weltposition (Phase 7): id → { x, y }
    this.validierung = [];
    this.#hoerer = new Map();
    this.#speicherTimer = null;
    this.speicherStatus = '';
  }

  #hoerer;
  #speicherTimer;

  bei(name, f) {
    if (!this.#hoerer.has(name)) this.#hoerer.set(name, new Set());
    this.#hoerer.get(name).add(f);
  }

  melde(name, daten) {
    for (const f of this.#hoerer.get(name) ?? []) f(daten);
  }

  meldung(text, art = 'info') {
    this.melde('meldung', { text, art });
  }

  get aktiv() {
    return this.zonen.get(this.aktivId) ?? null;
  }

  get karte() {
    return this.aktiv?.karte ?? null;
  }

  get verlauf() {
    return this.aktiv?.verlauf ?? null;
  }

  /** Zone ins Projekt aufnehmen (ersetzt gleiche ID) und aktivieren */
  fuegeZoneHinzu(karte, verlauf = new Verlauf(), { aktivieren = true, speichern = true } = {}) {
    this.zonen.get(karte.id)?.abmelden?.();
    const eintrag = { karte, verlauf };
    eintrag.abmelden = karte.beobachte((ops) => {
      this.melde('karte', ops);
      this.#planeSpeichern();
    });
    this.zonen.set(karte.id, eintrag);
    if (!this.layout[karte.id]) this.layout[karte.id] = this.#freieWeltposition(karte);
    if (aktivieren) this.aktiviere(karte.id);
    else this.melde('zone');
    if (speichern) this.speichereJetzt(karte.id);
  }

  #freieWeltposition(karte) {
    let x = 0;
    for (const [id, p] of Object.entries(this.layout)) {
      const k = this.zonen.get(id)?.karte;
      if (k) x = Math.max(x, p.x + k.breite + 10);
    }
    return { x, y: 0 };
  }

  aktiviere(id) {
    if (!this.zonen.has(id)) return;
    this.aktivId = id;
    this.auswahl.clear();
    this.auswahlRechteck = null;
    this.melde('zone');
    this.melde('auswahl');
    this.speicher.setze('meta', 'aktiv', id);
  }

  async entferneZone(id) {
    const e = this.zonen.get(id);
    if (!e) return;
    e.abmelden?.();
    this.zonen.delete(id);
    delete this.layout[id];
    await this.speicher.loesche('entwuerfe', id);
    await this.speicher.setze('meta', 'layout', this.layout);
    if (this.aktivId === id) this.aktivId = this.zonen.keys().next().value ?? null;
    this.melde('zone');
  }

  /** Zone umbenennen (ID ändern) – Entwurf wird unter neuer ID gespeichert, Übergänge anderer Zonen nachgezogen */
  async benenneZoneUm(altId, neuId) {
    const e = this.zonen.get(altId);
    if (!e || altId === neuId || this.zonen.has(neuId)) return false;
    this.ausfuehren('Zonen-ID ändern', [{ s: 'wert', pfad: 'id', neu: neuId }], e.karte);
    this.zonen.delete(altId);
    this.zonen.set(neuId, e);
    this.layout[neuId] = this.layout[altId];
    delete this.layout[altId];
    for (const [id, z] of this.zonen) {
      if (id === neuId) continue;
      const ops = [...z.karte.s('uebergaenge')].filter(([, u]) => u.ziel === altId).map(([k, u]) => ({ s: 'uebergaenge', k, neu: { ...u, ziel: neuId } }));
      if (ops.length) z.verlauf.ausfuehren(z.karte, 'Zielzone umbenannt', ops);
    }
    await this.speicher.loesche('entwuerfe', altId);
    this.aktivId = neuId;
    await this.speichereAlle();
    this.melde('zone');
    return true;
  }

  /** Änderung an der aktiven Karte (mit Verlauf). @returns ausgeführte ops */
  ausfuehren(name, ops, karte = this.karte) {
    if (!karte) return [];
    const z = [...this.zonen.values()].find((e) => e.karte === karte);
    return z.verlauf.ausfuehren(karte, name, ops);
  }

  rueckgaengig() {
    const name = this.verlauf?.rueckgaengig(this.karte);
    this.#synchronisiereId();
    this.#bereinigeAuswahl();
    if (name) this.meldung(`↶ ${name}`);
    else this.meldung('Nichts rückgängig zu machen');
  }

  wiederholen() {
    const name = this.verlauf?.wiederholen(this.karte);
    this.#synchronisiereId();
    this.#bereinigeAuswahl();
    if (name) this.meldung(`↷ ${name}`);
  }

  /** Rückgängig einer ID-Änderung: Projekt-Schlüssel nachziehen */
  #synchronisiereId() {
    const e = this.aktiv;
    if (!e || e.karte.id === this.aktivId || this.zonen.has(e.karte.id)) return;
    const alt = this.aktivId;
    this.zonen.delete(alt);
    this.zonen.set(e.karte.id, e);
    this.layout[e.karte.id] = this.layout[alt];
    delete this.layout[alt];
    this.speicher.loesche('entwuerfe', alt);
    this.aktivId = e.karte.id;
    this.melde('zone');
  }

  // --- Auswahl ---------------------------------------------------------------
  waehle(eintraege, hinzufuegen = false) {
    if (!hinzufuegen) this.auswahl.clear();
    for (const { s, k } of eintraege) {
      const sk = `${s}|${k}`;
      if (hinzufuegen && this.auswahl.has(sk) && eintraege.length === 1) this.auswahl.delete(sk);
      else this.auswahl.set(sk, { s, k });
    }
    this.melde('auswahl');
  }

  leereAuswahl() {
    if (!this.auswahl.size && !this.auswahlRechteck) return;
    this.auswahl.clear();
    this.auswahlRechteck = null;
    this.melde('auswahl');
  }

  istGewaehlt(s, k) {
    return this.auswahl.has(`${s}|${k}`);
  }

  /** Ausgewählte Elemente, die es noch gibt: [{ s, k, wert }] */
  gewaehlte() {
    const karte = this.karte;
    if (!karte) return [];
    return [...this.auswahl.values()].map(({ s, k }) => ({ s, k, wert: karte.s(s).get(k) })).filter((e) => e.wert);
  }

  #bereinigeAuswahl() {
    const vorher = this.auswahl.size;
    for (const [sk, { s, k }] of this.auswahl) if (!this.karte?.s(s).has(k)) this.auswahl.delete(sk);
    if (this.auswahl.size !== vorher) this.melde('auswahl');
  }

  setzeWerkzeug(werkzeug) {
    this.werkzeug = werkzeug;
    this.melde('werkzeug');
  }

  // --- Speichern -------------------------------------------------------------
  #planeSpeichern() {
    this.speicherStatus = 'ungespeichert …';
    this.melde('speicher');
    clearTimeout(this.#speicherTimer);
    this.#speicherTimer = setTimeout(() => this.speichereJetzt(this.aktivId), 800);
  }

  async speichereJetzt(id = this.aktivId) {
    const e = this.zonen.get(id);
    if (!e) return;
    e.verlauf.beende?.();
    const ok = await this.speicher.setze('entwuerfe', id, entwurfJson(e.karte, e.verlauf));
    await this.speicher.setze('meta', 'layout', this.layout);
    this.speicherStatus = ok && this.speicher.art !== 'fluechtig' ? `✓ lokal gespeichert (${this.speicher.art === 'indexeddb' ? 'IndexedDB' : 'localStorage'})` : '⚠ Nur im Arbeitsspeicher – bitte 💾 als Datei speichern';
    this.melde('speicher');
  }

  async speichereAlle() {
    for (const id of this.zonen.keys()) await this.speichereJetzt(id);
  }

  /** Alle gespeicherten Entwürfe laden. @returns Anzahl */
  async ladeAlle() {
    this.layout = (await this.speicher.hole('meta', 'layout')) ?? {};
    let n = 0;
    for (const id of await this.speicher.schluessel('entwuerfe')) {
      try {
        const j = await this.speicher.hole('entwuerfe', id);
        const { karte, verlauf } = ladeDatei(j);
        this.fuegeZoneHinzu(karte, verlauf, { aktivieren: false, speichern: false });
        n++;
      } catch (e) {
        this.meldung(`Entwurf „${id}“ beschädigt: ${e.message}`, 'fehler');
      }
    }
    const letzte = await this.speicher.hole('meta', 'aktiv');
    if (letzte && this.zonen.has(letzte)) this.aktiviere(letzte);
    else if (this.zonen.size) this.aktiviere(this.zonen.keys().next().value);
    return n;
  }

  /** Nächste freie ID in einer Zahl-Sammlung (für Vorschauen) */
  static istIdSammlung(s) {
    return ID_SAMMLUNGEN.includes(s);
  }
}

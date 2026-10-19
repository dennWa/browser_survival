import { Verlauf } from '../kern/verlauf.js';
import { entwurfJson, ladeDatei } from '../kern/format.js';
import { ID_SAMMLUNGEN } from '../kern/karte.js';
import { EBENEN, ebenenAus, ebeneFrei, ebeneVon, filtereGesperrt } from '../kern/ebenen.js';

const EBENEN_SPEICHER = 'browserSurvival.editorEbenen';

/**
 * Zustand des Editors (Browser): Projekt = mehrere Zonen-Entwürfe { karte, verlauf }, aktive Zone, Werkzeug, Auswahl,
 * Zwischenablage, Ansicht. Kleine Ereignis-Schnittstelle: `bei(name, f)` / `melde(name, daten)`.
 * Ereignisse: 'karte' (Inhalt geändert), 'zone' (andere Zone aktiv / Liste), 'auswahl', 'werkzeug', 'eintrag' (Asset gewählt),
 * 'ebenen' (sichtbar/gesperrt), 'ansicht', 'meldung', 'speicher', 'pruefung', 'bibliothek' (3D-Modelle, ui/bibliothek.js).
 * `bibliothek` (Bibliothek) setzt main.js vor `ladeAlle`.
 * Ebenen (kern/ebenen.js): Änderungen an gesperrten/ausgeblendeten Ebenen lässt `ausfuehren`/`sammle` aus (mit Meldung).
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
    this.ebenen = ebenenAus(liesLokal(EBENEN_SPEICHER));
    this.terrainStaerke = 0.5;
    this.terrainZiel = 2; // Plateau-Höhe (m), Alt+Klick im Gelände-Werkzeug übernimmt die Höhe unter der Maus
    this.farbe = '#c0392b'; // aktuelle Malfarbe (Kategorie Farbe)
    this.layout = {}; // Zonen-Weltposition (Phase 7): id → { x, y }
    this.validierung = [];
    this.#hoerer = new Map();
    this.#speicherTimer = null;
    this.speicherStatus = '';
    /** Autosave-Anzeige (Schritt 1.6): art leer|ungespeichert|speichert|gespeichert|fehler|fluechtig, zeit, fehler */
    this.speicherZustand = { art: 'leer', zeit: null, fehler: null };
  }

  #hoerer;
  #speicherTimer;
  #ungespeichert = new Set();

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
    // Eingebettete 3D-Modelle (alte Entwürfe/Dateien) → Projekt-Bibliothek, Typ verweist danach per `asset` (Phase 3)
    if (this.bibliothek?.uebernimm(karte)) speichern = true;
    const eintrag = { karte, verlauf };
    eintrag.abmelden = karte.beobachte((ops) => {
      this.melde('karte', ops);
      this.#planeSpeichern(karte.id);
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

  /**
   * Änderung an der aktiven (oder genannten) Karte (mit Verlauf, 1 Schritt). Gesperrte Ebenen werden ausgelassen –
   * außer `alleEbenen` (projektweite Aufräum-Aktionen wie „Modell aus der Bibliothek löschen“). @returns ausgeführte ops
   */
  ausfuehren(name, ops, karte = this.karte, { alleEbenen = false } = {}) {
    if (!karte) return [];
    const z = [...this.zonen.values()].find((e) => e.karte === karte);
    return z.verlauf.ausfuehren(karte, name, alleEbenen ? ops : this.#ohneGesperrte(ops));
  }

  /** Laufende Änderung (Pinselstrich, Ziehen) in die offene Verlaufsgruppe sammeln (verlauf.beginne/beende) */
  sammle(ops) {
    const k = this.karte;
    if (!k) return [];
    const fertig = k.anwenden(this.#ohneGesperrte(ops));
    this.verlauf.sammle(fertig);
    return fertig;
  }

  #gesperrtGemeldet = 0;
  #ohneGesperrte(ops) {
    const { ops: frei, ausgelassen } = filtereGesperrt(this.ebenen, ops);
    const namen = Object.keys(ausgelassen);
    if (namen.length && performance.now() - this.#gesperrtGemeldet > 1500) {
      this.#gesperrtGemeldet = performance.now();
      this.meldung(`🔒 Ebene ${namen.map((id) => `„${EBENEN.find((e) => e.id === id)?.name ?? id}“`).join(', ')} gesperrt oder ausgeblendet – Änderung ausgelassen (Reiter Ebenen)`, 'fehler');
    }
    return frei;
  }

  // --- Ebenen ------------------------------------------------------------------
  setzeEbene(id, feld, wert) {
    if (!this.ebenen[id] || !(feld in this.ebenen[id])) return;
    this.ebenen[id][feld] = wert;
    // Ausgeblendetes/Gesperrtes kann nicht ausgewählt bleiben
    if (!ebeneFrei(this.ebenen, id)) for (const [sk, { s }] of this.auswahl) if (ebeneVon(s) === id) this.auswahl.delete(sk);
    schreibeLokal(EBENEN_SPEICHER, this.ebenen);
    this.melde('ebenen');
    this.melde('auswahl');
  }

  ebeneFrei(id) {
    return ebeneFrei(this.ebenen, id);
  }

  sichtbar(id) {
    return this.ebenen[id]?.sichtbar !== false;
  }

  /** Asset aus Browser/Pipette wählen (meldet 'eintrag' → Optionsleiste, Asset-Browser) */
  setzeEintrag(eintrag) {
    this.eintrag = eintrag;
    this.melde('eintrag');
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
  /** Geänderte Zonen merken (nicht nur die aktive: Übergangs-Vorschläge/Umbenennen ändern auch andere) und gesammelt speichern */
  #planeSpeichern(id = this.aktivId) {
    this.#ungespeichert.add(id);
    this.setzeSpeicher('ungespeichert');
    clearTimeout(this.#speicherTimer);
    this.#speicherTimer = setTimeout(async () => {
      for (const z of [...this.#ungespeichert]) if (this.zonen.has(z)) await this.speichereJetzt(z);
    }, 800);
  }

  async speichereJetzt(id = this.aktivId) {
    const e = this.zonen.get(id);
    if (!e) return;
    this.#ungespeichert.delete(id);
    e.verlauf.beende?.();
    this.setzeSpeicher('speichert');
    const ok = await this.speicher.setze('entwuerfe', id, entwurfJson(e.karte, e.verlauf));
    await this.speicher.setze('meta', 'layout', this.layout);
    if (!ok) {
      this.#ungespeichert.add(id); // nochmal versuchen (Klick auf die Anzeige / nächste Änderung)
      return this.setzeSpeicher('fehler', this.speicher.fehler);
    }
    if (this.#ungespeichert.size) return this.setzeSpeicher('ungespeichert');
    this.setzeSpeicher(this.speicher.art === 'fluechtig' ? 'fluechtig' : 'gespeichert');
  }

  /** Gibt es noch ungespeicherte Zonen? */
  get hatUngespeichertes() {
    return this.#ungespeichert.size > 0;
  }

  setzeSpeicher(art, fehler = null) {
    const ort = this.speicher.art === 'indexeddb' ? 'IndexedDB' : this.speicher.art === 'localstorage' ? 'localStorage' : 'Arbeitsspeicher';
    this.speicherZustand = { art, zeit: art === 'gespeichert' ? new Date() : this.speicherZustand.zeit, fehler };
    const uhr = this.speicherZustand.zeit?.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    this.speicherStatus = {
      leer: '',
      ungespeichert: '● ungespeichert',
      speichert: '⟳ speichert …',
      gespeichert: `✓ gespeichert ${uhr ?? ''}`.trim(),
      fehler: '⚠ Speichern fehlgeschlagen – Klick versucht es erneut',
      fluechtig: '⚠ nur im Arbeitsspeicher – Datei → Komplett-Backup',
    }[art];
    this.speicherOrt = ort;
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

function liesLokal(schluessel) {
  try {
    return JSON.parse(localStorage.getItem(schluessel) ?? 'null');
  } catch {
    return null;
  }
}

function schreibeLokal(schluessel, wert) {
  try {
    localStorage.setItem(schluessel, JSON.stringify(wert));
  } catch {
    /* gesperrter Speicher: gilt nur für diese Sitzung */
  }
}

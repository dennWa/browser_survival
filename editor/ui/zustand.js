import { Verlauf } from '../kern/verlauf.js';
import { entwurfJson, ladeDatei } from '../kern/format.js';
import { ID_SAMMLUNGEN } from '../kern/karte.js';
import { EBENEN, ebenenAus, ebeneFrei, ebeneVon, filtereGesperrt } from '../kern/ebenen.js';
import { filtereGesperrteZonen, eintragAnzeige } from '../kern/zonenManager.js';
import { konflikte, freiePosition, verschiebeZone } from '../kern/weltLayout.js';
import { GROSS_KACHELN } from '../kern/zone.js';

const EBENEN_SPEICHER = 'browserSurvival.editorEbenen';
const MESSEN_SPEICHER = 'browserSurvival.editorMessen';
const PINSEL_SPEICHER = 'browserSurvival.editorPinsel';

/**
 * Zustand des Editors (Browser): Projekt = mehrere Zonen-Entwürfe { karte, verlauf }, aktive Zone, Werkzeug, Auswahl,
 * Zwischenablage, Ansicht. Kleine Ereignis-Schnittstelle: `bei(name, f)` / `melde(name, daten)`.
 * Ereignisse: 'karte' (Inhalt geändert), 'zone' (andere Zone aktiv / Liste), 'auswahl', 'werkzeug', 'eintrag' (Asset gewählt),
 * 'ebenen' (sichtbar/gesperrt), 'ansicht', 'meldung', 'speicher', 'pruefung', 'bibliothek' (3D-Modelle, ui/bibliothek.js).
 * `bibliothek` (Modelle) und `audioBibliothek` (Klänge) setzt main.js vor `ladeAlle`.
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
    // Boden-Pinsel (6.1): Form eckig|rund + ausgefranster Rand (Streuung 0–1) – gilt für Pinsel, Radierer, Bemalen (localStorage)
    const pinsel = liesLokal(PINSEL_SPEICHER) ?? {};
    this.pinselForm = pinsel.form === 'rund' ? 'rund' : 'eckig';
    this.pinselStreuung = Number.isFinite(pinsel.streuung) ? Math.max(0, Math.min(0.8, pinsel.streuung)) : 0;
    this.drehung = 0; // für neue Objekte (Grad; im Free-Modus beliebig)
    this.frei = false; // Free-Modus (5.5): stufenlos platzieren/verschieben, freie Drehung
    // Messen & Ausrichten (7.3): Einrasten an Kanten/Mitten/Hilfslinien, Raster-Weite + Hauptlinien (localStorage)
    const messen = liesLokal(MESSEN_SPEICHER) ?? {};
    this.einrasten = messen.einrasten ?? true;
    this.rasterWeite = messen.rasterWeite ?? 1;
    this.hauptlinien = messen.hauptlinien ?? 10;
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

  /**
   * Runde 19: KI-Markierung JE ZONE (vorher bei jedem Zonenwechsel weg): id → { bereich: {x,y,b,h}|null, schutz: [{x,y,b,h}] }.
   * `kiBereich` = Rechteck für die KI (darf über die Zone ragen), `kiSchutz` = geschützte Flächen (KI darf dort nichts ändern).
   * Nur in dieser Sitzung; wandert bei Größenänderung links/oben mit (#versatzAusRaster).
   */
  kiMarken = new Map();
  get kiBereich() {
    return this.kiMarken.get(this.aktivId)?.bereich ?? null;
  }
  set kiBereich(r) {
    this.#kiMarke().bereich = r ?? null;
  }
  get kiSchutz() {
    return this.kiMarken.get(this.aktivId)?.schutz ?? [];
  }
  set kiSchutz(liste) {
    this.#kiMarke().schutz = liste ?? [];
  }
  #kiMarke(id = this.aktivId) {
    if (!this.kiMarken.has(id)) this.kiMarken.set(id, { bereich: null, schutz: [] });
    return this.kiMarken.get(id);
  }
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

  /**
   * Zone ins Projekt aufnehmen (ersetzt gleiche ID) und aktivieren. Vorhandene Zonen bleiben (6.4: neue Zonen werden
   * ANGEFÜGT). position = Wunsch-Weltlage {x,y} (z. B. aufgezogenes Rechteck) – überlappt sie, kommt die Zone daneben.
   */
  fuegeZoneHinzu(karte, verlauf = new Verlauf(), { aktivieren = true, speichern = true, position = null } = {}) {
    const neben = this.aktivId;
    this.zonen.get(karte.id)?.abmelden?.();
    // Eingebettete 3D-Modelle (alte Entwürfe/Dateien) → Projekt-Bibliothek, Typ verweist danach per `asset` (Phase 3)
    if (this.bibliothek?.uebernimm(karte)) speichern = true;
    if (this.audioBibliothek?.uebernimm(karte)) speichern = true;
    const eintrag = { karte, verlauf };
    eintrag.abmelden = karte.beobachte((ops) => {
      this.#versatzAusRaster(karte, ops);
      this.melde('karte', ops);
      this.#planeSpeichern(karte.id);
    });
    this.zonen.set(karte.id, eintrag);
    // vorhandene Lage (geladene Entwürfe) bleibt; neue Zonen: Wunschlage, wenn frei – sonst direkt neben die aktive Zone
    const platz = () => freiePosition(this.#ohne(karte.id), this.#groessen(), { b: karte.breite, h: karte.hoehe, neben: neben !== karte.id ? neben : null });
    if (position) this.layout[karte.id] = konflikte(this.layout, this.#groessen(), karte.id, position).length ? platz() : { x: Math.round(position.x), y: Math.round(position.y) };
    else if (!this.layout[karte.id]) this.layout[karte.id] = platz();
    if (aktivieren) this.aktiviere(karte.id);
    else this.melde('zone');
    if (speichern) this.speichereJetzt(karte.id);
  }

  /** Map id → EditorKarte (Größen für die Weltanordnung) */
  #groessen() {
    return new Map([...this.zonen].map(([id, e]) => [id, e.karte]));
  }

  #ohne(id) {
    const l = { ...this.layout };
    delete l[id];
    return l;
  }

  /** Größe links/oben geändert (auch Undo/Redo) → Weltlage mitziehen, damit die Zone in der Welt stehen bleibt */
  #versatzAusRaster(karte, ops) {
    for (const op of ops) {
      const v = op.s === 'raster' ? op.neu?.versatz : null;
      const p = v && this.layout[karte.id];
      if (!p) continue;
      this.layout[karte.id] = { x: p.x - v.x, y: p.y - v.y };
      // KI-Markierung bleibt an derselben Stelle der Welt
      const m = this.kiMarken.get(karte.id);
      const schiebe = (r) => r && { ...r, x: r.x + v.x, y: r.y + v.y };
      if (m) Object.assign(m, { bereich: schiebe(m.bereich), schutz: m.schutz.map(schiebe) });
      if (m) this.melde('kiBereich');
      this.speicher.setze('meta', 'layout', this.layout);
      this.melde('layout');
    }
  }

  /**
   * Zone in der Weltanordnung verschieben (6.4) – überlappen ist verboten. @returns { ok, grund?, konflikte? }
   */
  setzeZonenLage(id, ziel) {
    const erg = verschiebeZone(this.layout, this.#groessen(), id, ziel);
    if (!erg.ok) return erg;
    this.layout = erg.layout;
    this.speicher.setze('meta', 'layout', this.layout);
    this.melde('layout');
    return erg;
  }

  /** Überlappt die Zone (Größe b×h an ihrer Lage) andere Zonen? → [ids] */
  zonenKonflikte(id, { pos = this.layout[id], b = null, h = null } = {}) {
    const k = this.zonen.get(id)?.karte;
    if (!k || !pos) return [];
    return konflikte(this.layout, this.#groessen(), id, pos, { breite: b ?? k.breite, hoehe: h ?? k.hoehe });
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

  // --- Archiv (Schritt 6.1): Zonen archivieren statt löschen ------------------------------------
  // meta/archiv = { id: { name, archiviert, layout, entwurf } } – liegt im Editor-Speicher und im Komplett-Backup.

  async archiv() {
    return (await this.speicher.hole('meta', 'archiv')) ?? {};
  }

  /** Zone ins Archiv legen (Entwurf + Verlauf + Weltposition bleiben erhalten) und aus dem Projekt nehmen */
  async archiviereZone(id) {
    const e = this.zonen.get(id);
    if (!e) return false;
    const archiv = await this.archiv();
    archiv[id] = { name: e.karte.name, archiviert: new Date().toISOString(), layout: this.layout[id] ?? null, entwurf: entwurfJson(e.karte, e.verlauf) };
    if (!(await this.speicher.setze('meta', 'archiv', archiv))) return false;
    await this.entferneZone(id);
    return true;
  }

  /** Zone aus dem Archiv zurückholen. @returns Fehlertext oder null */
  async holeAusArchiv(id) {
    const archiv = await this.archiv();
    const a = archiv[id];
    if (!a) return 'Nicht im Archiv';
    if (this.zonen.has(id)) return `Im Projekt gibt es schon eine Zone „${id}“ – erst umbenennen oder archivieren`;
    const { karte, verlauf } = ladeDatei(a.entwurf);
    if (a.layout) this.layout[id] = a.layout;
    this.fuegeZoneHinzu(karte, verlauf);
    delete archiv[id];
    await this.speicher.setze('meta', 'archiv', archiv);
    return null;
  }

  async loescheAusArchiv(id) {
    const archiv = await this.archiv();
    delete archiv[id];
    await this.speicher.setze('meta', 'archiv', archiv);
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
    return z.verlauf.ausfuehren(karte, name, alleEbenen ? ops : this.#ohneGesperrte(ops, karte));
  }

  /** Laufende Änderung (Pinselstrich, Ziehen) in die offene Verlaufsgruppe sammeln (verlauf.beginne/beende) */
  sammle(ops) {
    const k = this.karte;
    if (!k) return [];
    const fertig = k.anwenden(this.#ohneGesperrte(ops, k));
    this.verlauf.sammle(fertig);
    return fertig;
  }

  #gesperrtGemeldet = 0;
  #ohneGesperrte(ops, karte = this.karte) {
    const { ops: frei, ausgelassen } = filtereGesperrt(this.ebenen, ops);
    const namen = Object.keys(ausgelassen);
    // einzelne gesperrte Bereichs-Zonen (Zonen-Manager, Schritt 6.1)
    const zonen = filtereGesperrteZonen(karte, frei);
    if ((namen.length || zonen.ausgelassen) && performance.now() - this.#gesperrtGemeldet > 1500) {
      this.#gesperrtGemeldet = performance.now();
      if (namen.length) this.meldung(`🔒 Ebene ${namen.map((id) => `„${EBENEN.find((e) => e.id === id)?.name ?? id}“`).join(', ')} gesperrt oder ausgeblendet – Änderung ausgelassen (Reiter Ebenen)`, 'fehler');
      else this.meldung('🔒 Zone gesperrt – Änderung ausgelassen (Reiter ▭ Bereiche)', 'fehler');
    }
    return zonen.ops;
  }

  /** Bereichs-Zone eines Eintrags anklickbar? (nicht ausgeblendet/gesperrt im Zonen-Manager) */
  zoneFrei(s, k, karte = this.karte) {
    const a = karte ? eintragAnzeige(karte, s, k) : null;
    return !a || (!a.aus && !a.sperre);
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

  /** Einrasten/Raster-Einstellungen (7.3) setzen und merken */
  setzeMessen(teil) {
    Object.assign(this, teil);
    try {
      localStorage.setItem(MESSEN_SPEICHER, JSON.stringify({ einrasten: this.einrasten, rasterWeite: this.rasterWeite, hauptlinien: this.hauptlinien }));
    } catch {}
    this.melde('ansicht');
  }

  /** Pinsel-Form/Streuung (6.1) setzen und merken */
  setzePinsel({ form = this.pinselForm, streuung = this.pinselStreuung } = {}) {
    this.pinselForm = form === 'rund' ? 'rund' : 'eckig';
    this.pinselStreuung = Math.max(0, Math.min(0.8, Number(streuung) || 0));
    schreibeLokal(PINSEL_SPEICHER, { form: this.pinselForm, streuung: this.pinselStreuung });
    this.melde('werkzeug');
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
      // Laufender Strich/Zug (offene Verlaufsgruppe): später speichern – speichereJetzt schließt die Gruppe, ein langsamer
      // Zug zerfiele sonst in viele Undo-Schritte
      if ([...this.#ungespeichert].some((z) => this.zonen.get(z)?.verlauf.offen)) return this.#planeSpeichern(id);
      for (const z of [...this.#ungespeichert]) if (this.zonen.has(z)) await this.speichereJetzt(z);
    }, this.#speicherPause());
  }

  /** Autosave-Pause: große Zonen (6.4) seltener speichern – ein Entwurf ist dort viele MB groß */
  #speicherPause() {
    let kacheln = 0;
    for (const z of this.#ungespeichert) kacheln = Math.max(kacheln, (this.zonen.get(z)?.karte.breite ?? 0) * (this.zonen.get(z)?.karte.hoehe ?? 0));
    return kacheln >= GROSS_KACHELN ? Math.min(15000, 800 + Math.round(kacheln / 1000)) : 800;
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

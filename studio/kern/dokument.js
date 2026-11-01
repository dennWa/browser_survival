import { Verlauf } from '../../editor/kern/verlauf.js';
import { ausDefinition, nachDefinition, entwurfJson, ladeDatei } from '../../editor/kern/format.js';
import { neueZone } from '../../editor/kern/zone.js';
import { objektKlaenge, entferneObjektKlaenge } from './aktionen.js';
import { filtereGesperrt, standardEbenen, EBENEN } from '../../editor/kern/ebenen.js';

/**
 * Dokument des Studios (umgebungsfrei bis auf den übergebenen `nativ`-Kanal → testbar mit Attrappe).
 * Hält die geöffneten Zonen ({ karte: EditorKarte, verlauf: Verlauf, gespeichertVersion, quelle }), die aktive Zone,
 * die Auswahl ([{ s, k }]) und meldet Änderungen an Beobachter:
 *   'zonen'     Liste geöffneter Zonen / aktive Zone geändert
 *   'aenderung' { ops, name }  – Karte geändert (Ansicht baut betroffene Sektoren neu)
 *   'auswahl'   Auswahl geändert
 *   'status'    { text, art }  – Meldung für die Statusleiste
 * JEDE Kartenänderung läuft über `aendere(name, ops)` (ein Undo-Schritt) bzw. `gruppe(name, f)` (viele ops, ein Schritt).
 */
export class Dokument {
  constructor(nativ) {
    this.nativ = nativ;
    this.zonen = new Map();
    this.aktivId = null;
    this.auswahl = [];
    this.beobachter = new Map();
    this.vorlagenModus = null; // { id, name } wenn eine Vorlage bearbeitet wird
    /** Ebenen { id: { sichtbar, gesperrt } } – gesperrte/ausgeblendete Ebenen nehmen keine Änderungen an (editor/kern/ebenen.js) */
    this.ebenen = standardEbenen();
  }

  bei(art, f) {
    if (!this.beobachter.has(art)) this.beobachter.set(art, new Set());
    this.beobachter.get(art).add(f);
    return () => this.beobachter.get(art).delete(f);
  }

  melde(art, daten) {
    for (const f of this.beobachter.get(art) ?? []) f(daten);
  }

  status(text, art = 'info') {
    this.melde('status', { text, art });
  }

  get aktiv() {
    return this.zonen.get(this.aktivId) ?? null;
  }

  get karte() {
    return this.aktiv?.karte ?? null;
  }

  get geaendert() {
    const z = this.aktiv;
    return !!z && z.karte.version !== z.gespeichertVersion;
  }

  #aufnehmen(id, karte, verlauf, quelle) {
    const eintrag = { karte, verlauf: verlauf ?? new Verlauf(), gespeichertVersion: karte.version, quelle };
    karte.beobachte((ops) => this.melde('aenderung', { ops, zone: id }));
    this.zonen.set(id, eintrag);
    this.aktivId = id;
    this.auswahl = [];
    this.melde('zonen');
    this.melde('auswahl');
    return eintrag;
  }

  /** Zone öffnen: Entwurf (falls vorhanden) sonst Spieldatei. Schon offen → nur aktivieren. */
  async oeffne(id, { ohneEntwurf = false } = {}) {
    if (this.zonen.has(id)) return this.aktiviere(id);
    const entwurf = ohneEntwurf ? null : await this.nativ.aufruf('projekt.ladeEntwurf', { id });
    if (entwurf) {
      const { karte, verlauf } = ladeDatei(entwurf);
      karte.anwenden(entferneObjektKlaenge(karte));
      karte.version = 0;
      return this.#aufnehmen(id, karte, verlauf, 'entwurf');
    }
    const def = await this.nativ.aufruf('projekt.definition', { id });
    if (!def) throw new Error(`Zone „${id}“ nicht gefunden`);
    const { karte } = ausDefinition(def);
    karte.anwenden(entferneObjektKlaenge(karte));
    karte.version = 0;
    return this.#aufnehmen(id, karte, null, 'spiel');
  }

  /** Neue leere Zone */
  neu({ id, name, breite, hoehe, boden = ',' }) {
    if (this.zonen.has(id)) throw new Error(`Zone „${id}“ ist schon offen`);
    const karte = neueZone({ id, name, breite, hoehe });
    if (boden !== ',') karte.zellen.fill(boden);
    karte.version = 0;
    const e = this.#aufnehmen(id, karte, null, 'neu');
    e.gespeichertVersion = -1; // ungespeichert
    return e;
  }

  /** Bestehende EditorKarte als Zone aufnehmen (Vorlagen-Editor) */
  nimmAuf(id, karte, quelle = 'vorlage') {
    karte.version = 0;
    return this.#aufnehmen(id, karte, null, quelle);
  }

  aktiviere(id) {
    if (!this.zonen.has(id)) return null;
    this.aktivId = id;
    this.auswahl = [];
    this.melde('zonen');
    this.melde('auswahl');
    return this.aktiv;
  }

  schliesse(id) {
    this.zonen.delete(id);
    if (this.aktivId === id) this.aktivId = this.zonen.keys().next().value ?? null;
    this.auswahl = [];
    this.melde('zonen');
    this.melde('auswahl');
  }

  // ---------- Ändern ----------
  aendere(name, ops) {
    const z = this.aktiv;
    if (!z || !ops?.length) return [];
    const gefiltert = filtereGesperrt(this.ebenen, ops);
    const weg = Object.entries(gefiltert.ausgelassen);
    if (weg.length) {
      this.status(`Gesperrt: ${weg.map(([id, n]) => `${n}× ${EBENEN.find((e) => e.id === id)?.name ?? id}`).join(', ')} ausgelassen`, 'fehler');
      ops = gefiltert.ops;
      if (!ops.length) return [];
    }
    const fertig = z.verlauf.ausfuehren(z.karte, name, ops);
    this.#auswahlBereinigen();
    return fertig;
  }

  /** f() darf mehrfach aendere aufrufen – alles wird EIN Undo-Schritt */
  gruppe(name, f) {
    const z = this.aktiv;
    if (!z) return undefined;
    z.verlauf.beginne(name);
    try {
      return f();
    } finally {
      z.verlauf.beende();
    }
  }

  rueckgaengig() {
    const z = this.aktiv;
    const name = z?.verlauf.rueckgaengig(z.karte);
    this.#auswahlBereinigen();
    if (name) this.status(`Rückgängig: ${name}`);
    return name;
  }

  wiederholen() {
    const z = this.aktiv;
    const name = z?.verlauf.wiederholen(z.karte);
    this.#auswahlBereinigen();
    if (name) this.status(`Wiederholt: ${name}`);
    return name;
  }

  // ---------- Auswahl ----------
  waehle(eintraege, { hinzu = false } = {}) {
    const neu = hinzu ? [...this.auswahl] : [];
    for (const e of eintraege) {
      const i = neu.findIndex((a) => a.s === e.s && a.k === e.k);
      if (i >= 0 && hinzu) neu.splice(i, 1);
      else if (i < 0) neu.push({ s: e.s, k: e.k });
    }
    this.auswahl = neu;
    this.melde('auswahl');
  }

  gewaehlt() {
    const k = this.karte;
    if (!k) return [];
    return this.auswahl.map((a) => ({ ...a, wert: a.s === 'zelle' ? null : k.s(a.s)?.get(a.k) })).filter((a) => a.wert);
  }

  #auswahlBereinigen() {
    const k = this.karte;
    if (!k) return;
    const vorher = this.auswahl.length;
    this.auswahl = this.auswahl.filter((a) => k.s(a.s)?.has(a.k));
    if (vorher !== this.auswahl.length) this.melde('auswahl');
  }

  // ---------- Speichern ----------
  /** Spiel-Definition der aktiven (oder genannten) Zone inkl. Objekt-Klänge */
  definition(id = this.aktivId) {
    const z = this.zonen.get(id);
    if (!z) return null;
    const def = nachDefinition(z.karte);
    const extra = objektKlaenge(z.karte);
    if (extra.length) def.klaenge = [...(def.klaenge ?? []), ...extra];
    return def;
  }

  async speichereEntwurf(id = this.aktivId) {
    const z = this.zonen.get(id);
    if (!z || z.quelle === 'vorlage') return false;
    await this.nativ.aufruf('projekt.speichereEntwurf', { id, inhalt: entwurfJson(z.karte, z.verlauf, { studio: true }) });
    z.gespeichertVersion = z.karte.version;
    if (z.quelle === 'neu') z.quelle = 'entwurf';
    this.melde('zonen');
    return true;
  }

  /** Ins Spiel übernehmen (Kartendatei + KARTEN). Entwurf wird danach gelöscht. */
  async insSpiel(id = this.aktivId) {
    const def = this.definition(id);
    const ergebnis = await this.nativ.aufruf('projekt.insSpiel', { definition: def });
    await this.nativ.aufruf('projekt.loescheEntwurf', { id });
    const z = this.zonen.get(id);
    z.gespeichertVersion = z.karte.version;
    z.quelle = 'spiel';
    this.melde('zonen');
    return ergebnis;
  }
}

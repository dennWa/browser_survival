import { umkehren } from './karte.js';

/**
 * Unbegrenztes Rückgängig/Wiederholen. Ein Eintrag = { name, ops } (ops so, wie EditorKarte.anwenden sie geliefert hat).
 * Der Verlauf ist reines JSON → wird mit dem Entwurf gespeichert und gilt über Sitzungen hinweg.
 *
 * Gruppen (z. B. ein Pinselstrich = viele Kacheln): beginne(name) → sammle(ops) … → beende(). Alles dazwischen ist EIN Schritt.
 */
export class Verlauf {
  constructor({ zurueck = [], vor = [] } = {}) {
    this.zurueck = zurueck;
    this.vor = vor;
    this.offen = null;
    this.version = 0;
  }

  /** Operationen ausführen und als einen Schritt merken. @returns ausgeführte ops */
  ausfuehren(karte, name, ops) {
    const fertig = karte.anwenden(ops);
    if (this.offen) this.offen.ops.push(...fertig);
    else if (fertig.length) this.#merke({ name, ops: fertig });
    return fertig;
  }

  beginne(name) {
    this.beende();
    this.offen = { name, ops: [] };
  }

  /** Bereits ausgeführte ops der offenen Gruppe zuschlagen */
  sammle(ops) {
    if (this.offen) this.offen.ops.push(...ops);
    else if (ops.length) this.#merke({ name: 'Änderung', ops });
  }

  beende() {
    const g = this.offen;
    this.offen = null;
    if (g?.ops.length) this.#merke(g);
  }

  #merke(eintrag) {
    this.zurueck.push(eintrag);
    this.vor = [];
    this.version++;
  }

  get kannZurueck() {
    return this.zurueck.length > 0;
  }

  get kannVor() {
    return this.vor.length > 0;
  }

  /** @returns Name des rückgängig gemachten Schritts oder null */
  rueckgaengig(karte) {
    this.beende();
    const e = this.zurueck.pop();
    if (!e) return null;
    karte.anwenden(umkehren(e.ops));
    this.vor.push(e);
    this.version++;
    return e.name;
  }

  wiederholen(karte) {
    this.beende();
    const e = this.vor.pop();
    if (!e) return null;
    karte.anwenden(e.ops);
    this.zurueck.push(e);
    this.version++;
    return e.name;
  }

  alsJson() {
    return { zurueck: this.zurueck, vor: this.vor };
  }

  static ausJson(j) {
    const ok = (l) => (Array.isArray(l) ? l.filter((e) => e && typeof e.name === 'string' && Array.isArray(e.ops)) : []);
    return new Verlauf({ zurueck: ok(j?.zurueck), vor: ok(j?.vor) });
  }
}

/**
 * Spielstände im Lokal-Modus (Singleplayer): im localStorage des Browsers.
 * Schnittstelle: siehe server/spiel/speicher/arbeitsspeicherSpeicher.js
 * (privates Fenster / gesperrter Speicher → es wird einfach nichts gespeichert)
 *
 * Runde 28: Jeder Singleplayer-Slot hat einen eigenen Präfix (`browserSurvival.slot<N>.`, client/netzwerk/spielstandSlots.js) –
 * Spielerstand UND Weltzustand („welt:<karte>“) eines Slots können so nie einen anderen Slot überschreiben.
 * Schreiben passiert im Leerlauf (ein Eintrag je Leerlauf-Häppchen → kein Ruckler beim Autosave); `leeren()` schreibt
 * alles Ausstehende sofort (Verlassen, Tab im Hintergrund, pagehide).
 */
const PRAEFIX = 'browserSurvival.spielstand.';

const leerlauf = (fn) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout: 1500 }) : setTimeout(fn, 30));

export class BrowserSpeicher {
  #offen = new Map(); // Schlüssel → Stand (neuester gewinnt)
  #geplant = false;

  /** @param beiSpielerGespeichert (benutzername, stand) → z. B. „zuletzt gespielt“ im Slot nachtragen */
  constructor({ praefix = PRAEFIX, beiSpielerGespeichert = null } = {}) {
    this.praefix = praefix;
    this.beiSpielerGespeichert = beiSpielerGespeichert;
  }

  #schluessel(name) {
    return this.praefix + name.toLowerCase();
  }

  async laden(benutzername) {
    const k = this.#schluessel(benutzername);
    if (this.#offen.has(k)) return structuredClone(this.#offen.get(k).stand);
    try {
      const text = localStorage.getItem(k);
      return text ? JSON.parse(text) : null;
    } catch {
      return null;
    }
  }

  async speichern(benutzername, stand) {
    this.#offen.set(this.#schluessel(benutzername), { name: benutzername, stand });
    if (this.#geplant) return;
    this.#geplant = true;
    leerlauf(() => this.#schreibeEinen());
  }

  #schreibeEinen() {
    this.#geplant = false;
    const [k, eintrag] = this.#offen.entries().next().value ?? [];
    if (!k) return;
    this.#offen.delete(k);
    this.#schreibe(k, eintrag);
    if (this.#offen.size) {
      this.#geplant = true;
      leerlauf(() => this.#schreibeEinen());
    }
  }

  #schreibe(k, { name, stand }) {
    try {
      localStorage.setItem(k, JSON.stringify(stand));
      if (!name.startsWith('welt:')) this.beiSpielerGespeichert?.(name, stand);
    } catch {
      // Speicher voll oder gesperrt → ignorieren
    }
  }

  /** Alles Ausstehende sofort schreiben (synchron). */
  leeren() {
    for (const [k, eintrag] of this.#offen) this.#schreibe(k, eintrag);
    this.#offen.clear();
  }
}

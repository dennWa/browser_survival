/**
 * Lokaler Speicher für Entwürfe, Prefabs und Projekt-Infos. Reihenfolge: IndexedDB → localStorage → nur Arbeitsspeicher.
 * Nie eine Ausnahme nach außen: wenn gar nichts geht (privates Fenster, Speicher voll, blockiert), meldet `art`
 * 'fluechtig' und das UI warnt („bitte als Datei speichern“).
 *
 * Bereiche: 'entwuerfe' (Zonen-ID → Entwurf-JSON), 'prefabs' (Name → Vorlage), 'meta' (Schlüssel → Wert),
 *          'assets' (Modell-ID → { meta, blob } bzw. ohne IndexedDB { meta, daten: Data-URL }; ui/bibliothek.js)
 */
const DB_NAME = 'browserSurvivalEditor';
const BEREICHE = ['entwuerfe', 'prefabs', 'meta', 'assets'];
const DB_VERSION = 2; // 2 = Bereich 'assets' (Phase 3)
const LS_PRAEFIX = 'browserSurvivalEditor.';

export class EditorSpeicher {
  constructor() {
    this.art = 'fluechtig';
    this.fehler = null;
    this.db = null;
    this.speicher = new Map(BEREICHE.map((b) => [b, new Map()]));
  }

  async oeffnen() {
    try {
      if (!globalThis.indexedDB) throw new Error('IndexedDB fehlt');
      this.db = await new Promise((ok, nein) => {
        const anfrage = indexedDB.open(DB_NAME, DB_VERSION);
        anfrage.onupgradeneeded = () => {
          for (const b of BEREICHE) if (!anfrage.result.objectStoreNames.contains(b)) anfrage.result.createObjectStore(b);
        };
        anfrage.onsuccess = () => ok(anfrage.result);
        anfrage.onerror = () => nein(anfrage.error);
        anfrage.onblocked = () => nein(new Error('IndexedDB blockiert'));
        setTimeout(() => nein(new Error('IndexedDB antwortet nicht')), 4000);
      });
      this.art = 'indexeddb';
      return this.art;
    } catch (e) {
      this.fehler = e.message;
    }
    try {
      const probe = `${LS_PRAEFIX}probe`;
      localStorage.setItem(probe, '1');
      localStorage.removeItem(probe);
      this.art = 'localstorage';
    } catch (e) {
      this.fehler = `${this.fehler}; localStorage: ${e.message}`;
      this.art = 'fluechtig';
    }
    return this.art;
  }

  async #tx(bereich, modus, arbeit) {
    return new Promise((ok, nein) => {
      const tx = this.db.transaction(bereich, modus);
      const ergebnis = arbeit(tx.objectStore(bereich));
      tx.oncomplete = () => ok(ergebnis.result);
      tx.onerror = () => nein(tx.error);
      tx.onabort = () => nein(tx.error ?? new Error('abgebrochen'));
    });
  }

  /** @returns true = gespeichert, false = fehlgeschlagen (Fehler in this.fehler) */
  async setze(bereich, schluessel, wert) {
    try {
      if (this.art === 'indexeddb') await this.#tx(bereich, 'readwrite', (s) => s.put(wert, schluessel));
      else if (this.art === 'localstorage') localStorage.setItem(`${LS_PRAEFIX}${bereich}.${schluessel}`, JSON.stringify(wert));
      else this.speicher.get(bereich).set(schluessel, structuredClone(wert));
      return true;
    } catch (e) {
      this.fehler = e.message;
      this.speicher.get(bereich).set(schluessel, structuredClone(wert));
      return false;
    }
  }

  async hole(bereich, schluessel) {
    try {
      if (this.art === 'indexeddb') return (await this.#tx(bereich, 'readonly', (s) => s.get(schluessel))) ?? null;
      if (this.art === 'localstorage') {
        const t = localStorage.getItem(`${LS_PRAEFIX}${bereich}.${schluessel}`);
        return t ? JSON.parse(t) : null;
      }
    } catch (e) {
      this.fehler = e.message;
    }
    return this.speicher.get(bereich).get(schluessel) ?? null;
  }

  async loesche(bereich, schluessel) {
    try {
      if (this.art === 'indexeddb') await this.#tx(bereich, 'readwrite', (s) => s.delete(schluessel));
      else if (this.art === 'localstorage') localStorage.removeItem(`${LS_PRAEFIX}${bereich}.${schluessel}`);
    } catch (e) {
      this.fehler = e.message;
    }
    this.speicher.get(bereich).delete(schluessel);
  }

  async schluessel(bereich) {
    try {
      if (this.art === 'indexeddb') return (await this.#tx(bereich, 'readonly', (s) => s.getAllKeys())).map(String);
      if (this.art === 'localstorage') {
        const p = `${LS_PRAEFIX}${bereich}.`;
        return Object.keys(localStorage)
          .filter((k) => k.startsWith(p))
          .map((k) => k.slice(p.length));
      }
    } catch (e) {
      this.fehler = e.message;
    }
    return [...this.speicher.get(bereich).keys()];
  }
}

/** Datei herunterladen (Blob-Link) */
export function herunterladen(dateiname, inhalt, typ = 'application/json') {
  const blob = inhalt instanceof Blob ? inhalt : new Blob([inhalt], { type: `${typ};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = dateiname;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Datei wählen und als Text lesen. @returns {Promise<{name, text}|null>} */
export function dateiWaehlen(accept = '.json,application/json', alsDataUrl = false) {
  return new Promise((ok) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.addEventListener('change', () => {
      const datei = input.files?.[0];
      if (!datei) return ok(null);
      const leser = new FileReader();
      leser.onload = () => ok({ name: datei.name, text: leser.result });
      leser.onerror = () => ok(null);
      if (alsDataUrl) leser.readAsDataURL(datei);
      else leser.readAsText(datei);
    });
    input.click();
  });
}

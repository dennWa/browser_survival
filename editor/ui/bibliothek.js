import { assetId, bytesZuGlbUrl, dataUrlZuBytes, metaNormal, setzeModellQuelle, uebernimmEingebettete, leseBibliotheksExport } from '../kern/bibliothek.js';

/**
 * Projekt-Bibliothek im Browser (Editor 2.0, Phase 3): 3D-Modelle einmal pro Projekt, Karten-Typen verweisen per `asset`.
 * Ablage: EditorSpeicher-Bereich 'assets' – IndexedDB { meta, blob } (Blob spart ¼ gegenüber Base64), sonst { meta, daten }.
 * Im Arbeitsspeicher: id → { meta, url (Data-URL) } – synchron für Export/Spiel (`setzeModellQuelle`) und 3D-Ansicht.
 * Ereignis: zustand.melde('bibliothek') nach jeder Änderung. Logik/Formate: kern/bibliothek.js.
 * ⚠ Löschen ist nicht rückgängig zu machen (Bibliothek liegt außerhalb des Karten-Verlaufs) → UI fragt mit Abhängigkeiten nach.
 */
export class Bibliothek {
  constructor(speicher, zustand) {
    this.speicher = speicher;
    this.zustand = zustand;
    /** id → { meta, url } */
    this.eintraege = new Map();
    setzeModellQuelle((id) => this.eintraege.get(id)?.url ?? null);
  }

  async lade() {
    for (const id of await this.speicher.schluessel('assets')) {
      try {
        const roh = await this.speicher.hole('assets', id);
        if (!roh?.meta) continue;
        const url = roh.blob ? await blobZuUrl(roh.blob) : roh.daten;
        if (typeof url === 'string') this.eintraege.set(id, { meta: metaNormal(roh.meta, id), url });
      } catch (e) {
        this.zustand.meldung(`Modell „${id}“ in der Bibliothek beschädigt: ${e.message}`, 'fehler');
      }
    }
    return this.eintraege.size;
  }

  get liste() {
    return [...this.eintraege.values()].map((e) => e.meta).sort((a, b) => a.name.localeCompare(b.name, 'de'));
  }

  meta(id) {
    return this.eintraege.get(id)?.meta ?? null;
  }

  url(id) {
    return this.eintraege.get(id)?.url ?? null;
  }

  /** Ordner, die schon benutzt werden (für Auswahl/Datalist) */
  get ordner() {
    return [...new Set(this.liste.map((m) => m.ordner).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de'));
  }

  async #schreibe(id, meta, bytes) {
    const wert = this.speicher.art === 'indexeddb' ? { meta, blob: new Blob([bytes], { type: 'model/gltf-binary' }) } : { meta, daten: bytesZuGlbUrl(bytes) };
    const ok = await this.speicher.setze('assets', id, wert);
    if (!ok) this.zustand.meldung(`Modell „${meta.name}“ nur im Arbeitsspeicher (${this.speicher.fehler}) – Komplett-Backup ziehen!`, 'fehler');
  }

  /**
   * Modell aufnehmen. Gleiche Datei schon da → vorhandener Eintrag (Meta bleibt, fehlende Felder werden ergänzt).
   * @returns { meta, neu }
   */
  async fuegeHinzu(bytes, meta = {}) {
    const id = assetId(bytes);
    const alt = this.eintraege.get(id);
    if (alt) {
      const ergaenzt = metaNormal({ ...meta, ...Object.fromEntries(Object.entries(alt.meta).filter(([, w]) => w !== '' && w !== null && !(Array.isArray(w) && !w.length))) }, id);
      if (JSON.stringify(ergaenzt) !== JSON.stringify(alt.meta)) await this.aendere(id, ergaenzt);
      return { meta: this.meta(id), neu: false };
    }
    const m = metaNormal({ erstellt: new Date().toISOString(), ...meta, groesse: bytes.length }, id);
    this.eintraege.set(id, { meta: m, url: bytesZuGlbUrl(bytes) });
    await this.#schreibe(id, m, bytes);
    this.zustand.melde('bibliothek');
    return { meta: m, neu: true };
  }

  async aendere(id, felder) {
    const e = this.eintraege.get(id);
    if (!e) return null;
    e.meta = metaNormal({ ...e.meta, ...felder, groesse: e.meta.groesse, erstellt: e.meta.erstellt }, id);
    await this.#schreibe(id, e.meta, dataUrlZuBytes(e.url));
    this.zustand.melde('bibliothek');
    return e.meta;
  }

  async entferne(id) {
    this.eintraege.delete(id);
    await this.speicher.loesche('assets', id);
    this.zustand.melde('bibliothek');
  }

  /** Export-Form für Backup/Entwurf-Datei: [{ ...meta, daten }] (nur die genannten IDs, Standard: alle) */
  exportiere(ids = [...this.eintraege.keys()]) {
    return ids.filter((id) => this.eintraege.has(id)).map((id) => ({ ...this.eintraege.get(id).meta, daten: this.eintraege.get(id).url }));
  }

  /** Export-Form (oder schon gelesene Liste) übernehmen. @returns Anzahl neuer Modelle */
  async importiere(liste) {
    let n = 0;
    for (const e of Array.isArray(liste) && liste[0]?.bytes ? liste : leseBibliotheksExport(liste)) if ((await this.fuegeHinzu(e.bytes, e.meta)).neu) n++;
    return n;
  }

  /**
   * Karte vor dem Aufnehmen ins Projekt: eingebettete `glb` → Bibliothek (alte Entwürfe, Datei-Import). Synchron nutzbar:
   * der Arbeitsspeicher-Eintrag steht sofort (fuegeHinzu setzt ihn vor dem ersten await), gespeichert wird nebenher.
   * @returns Anzahl umgestellter Modelle
   */
  uebernimm(karte) {
    const neu = uebernimmEingebettete(karte);
    for (const e of neu) this.fuegeHinzu(e.bytes, e.meta).catch((f) => this.zustand.meldung(`Modell nicht gespeichert: ${f.message}`, 'fehler'));
    return neu.length;
  }
}

function blobZuUrl(blob) {
  return new Promise((ok, fehler) => {
    const leser = new FileReader();
    // Browser setzen den Blob-Typ nicht immer → Kopf vereinheitlichen (Spiel-Lader nimmt nur model/gltf-binary)
    leser.onload = () => ok(String(leser.result).replace(/^data:[^,]*,/, 'data:model/gltf-binary;base64,'));
    leser.onerror = () => fehler(leser.error);
    leser.readAsDataURL(blob);
  });
}

import * as B from '../kern/bibliothek.js';

/**
 * Projekt-Bibliothek im Browser (Editor 2.0, Phase 3 + 4): Dateien einmal pro Projekt, Karten verweisen per ID.
 *   MODELLE (3D, .glb): Bereich 'assets', Typen verweisen per `asset`  (`new Bibliothek(speicher, zustand)`)
 *   AUDIO (Klänge):     Bereich 'audio',  Klänge verweisen per `audio` (`new Bibliothek(speicher, zustand, AUDIO)`)
 * Ablage: IndexedDB { meta, blob } (Blob spart ¼ gegenüber Base64), sonst { meta, daten }.
 * Im Arbeitsspeicher: id → { meta, url (Data-URL) } – synchron für Export/Spiel (`setzeQuelle`) und Anzeige/Vorhören.
 * Ereignis: zustand.melde('bibliothek', art) nach jeder Änderung. Logik/Formate: kern/bibliothek.js.
 * ⚠ Löschen ist nicht rückgängig zu machen (Bibliothek liegt außerhalb des Karten-Verlaufs) → UI fragt mit Abhängigkeiten nach.
 */
export const MODELLE = {
  art: 'modell',
  bereich: 'assets',
  praefix: 'm',
  wort: 'Modell',
  metaNormal: B.metaNormal,
  zuUrl: (bytes) => B.bytesZuGlbUrl(bytes),
  mime: () => 'model/gltf-binary',
  setzeQuelle: B.setzeModellQuelle,
  uebernimm: B.uebernimmEingebettete,
  leseExport: B.leseBibliotheksExport,
};
export const AUDIO = {
  art: 'audio',
  bereich: 'audio',
  praefix: 'a',
  wort: 'Audio',
  metaNormal: B.audioMetaNormal,
  zuUrl: (bytes, meta) => B.bytesZuAudioUrl(bytes, meta.format),
  mime: (meta) => B.bytesZuAudioUrl(new Uint8Array(0), meta.format).slice(5).split(';')[0],
  setzeQuelle: B.setzeAudioQuelle,
  uebernimm: B.uebernimmEingebetteteAudio,
  leseExport: B.leseAudioExport,
};

export class Bibliothek {
  constructor(speicher, zustand, art = MODELLE) {
    this.speicher = speicher;
    this.zustand = zustand;
    this.art = art;
    /** id → { meta, url } */
    this.eintraege = new Map();
    art.setzeQuelle((id) => this.eintraege.get(id)?.url ?? null);
  }

  async lade() {
    for (const id of await this.speicher.schluessel(this.art.bereich)) {
      try {
        const roh = await this.speicher.hole(this.art.bereich, id);
        if (!roh?.meta) continue;
        const meta = this.art.metaNormal(roh.meta, id);
        // Browser setzen den Blob-Typ nicht immer → Kopf vereinheitlichen (Spiel-Lader prüft den MIME-Typ)
        const url = roh.blob ? (await blobZuUrl(roh.blob)).replace(/^data:[^,]*,/, `data:${this.art.mime(meta)};base64,`) : roh.daten;
        if (typeof url === 'string') this.eintraege.set(id, { meta, url });
      } catch (e) {
        this.zustand.meldung(`${this.art.wort} „${id}“ in der Bibliothek beschädigt: ${e.message}`, 'fehler');
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

  #melde() {
    this.zustand.melde('bibliothek', this.art.art);
  }

  async #schreibe(id, meta, bytes) {
    const wert = this.speicher.art === 'indexeddb' ? { meta, blob: new Blob([bytes], { type: this.art.mime(meta) }) } : { meta, daten: this.art.zuUrl(bytes, meta) };
    const ok = await this.speicher.setze(this.art.bereich, id, wert);
    if (!ok) this.zustand.meldung(`${this.art.wort} „${meta.name}“ nur im Arbeitsspeicher (${this.speicher.fehler}) – Komplett-Backup ziehen!`, 'fehler');
  }

  /**
   * Datei aufnehmen. Gleiche Datei schon da → vorhandener Eintrag (Meta bleibt, fehlende Felder werden ergänzt).
   * Der Arbeitsspeicher-Eintrag steht vor dem ersten await (→ `uebernimm` ist synchron nutzbar). @returns { meta, neu }
   */
  async fuegeHinzu(bytes, meta = {}) {
    const id = B.assetId(bytes, this.art.praefix);
    const alt = this.eintraege.get(id);
    if (alt) {
      const ergaenzt = this.art.metaNormal({ ...meta, ...Object.fromEntries(Object.entries(alt.meta).filter(([, w]) => w !== '' && w !== null && !(Array.isArray(w) && !w.length))) }, id);
      if (JSON.stringify(ergaenzt) !== JSON.stringify(alt.meta)) await this.aendere(id, ergaenzt);
      return { meta: this.meta(id), neu: false };
    }
    const m = this.art.metaNormal({ erstellt: new Date().toISOString(), ...meta, groesse: bytes.length }, id);
    this.eintraege.set(id, { meta: m, url: this.art.zuUrl(bytes, m) });
    await this.#schreibe(id, m, bytes);
    this.#melde();
    return { meta: m, neu: true };
  }

  async aendere(id, felder) {
    const e = this.eintraege.get(id);
    if (!e) return null;
    e.meta = this.art.metaNormal({ ...e.meta, ...felder, groesse: e.meta.groesse, erstellt: e.meta.erstellt }, id);
    await this.#schreibe(id, e.meta, B.dataUrlZuBytes(e.url));
    this.#melde();
    return e.meta;
  }

  async entferne(id) {
    this.eintraege.delete(id);
    await this.speicher.loesche(this.art.bereich, id);
    this.#melde();
  }

  /** Export-Form für Backup/Entwurf-Datei: [{ ...meta, daten }] (nur die genannten IDs, Standard: alle) */
  exportiere(ids = [...this.eintraege.keys()]) {
    return ids.filter((id) => this.eintraege.has(id)).map((id) => ({ ...this.eintraege.get(id).meta, daten: this.eintraege.get(id).url }));
  }

  /** Export-Form (oder schon gelesene Liste) übernehmen. @returns Anzahl neuer Einträge */
  async importiere(liste) {
    let n = 0;
    for (const e of Array.isArray(liste) && liste[0]?.bytes ? liste : this.art.leseExport(liste)) if ((await this.fuegeHinzu(e.bytes, e.meta)).neu) n++;
    return n;
  }

  /**
   * Karte vor dem Aufnehmen ins Projekt: eingebettete Dateien (glb bzw. Klang-daten) → Bibliothek (alte Entwürfe,
   * Datei-Import). Synchron nutzbar, gespeichert wird nebenher. @returns Anzahl umgestellter Dateien
   */
  uebernimm(karte) {
    const neu = this.art.uebernimm(karte);
    for (const e of neu) this.fuegeHinzu(e.bytes, e.meta).catch((f) => this.zustand.meldung(`${this.art.wort} nicht gespeichert: ${f.message}`, 'fehler'));
    return neu.length;
  }
}

function blobZuUrl(blob) {
  return new Promise((ok, fehler) => {
    const leser = new FileReader();
    leser.onload = () => ok(String(leser.result));
    leser.onerror = () => fehler(leser.error);
    leser.readAsDataURL(blob);
  });
}

/**
 * Zonen-Musik: lädt Stücke aus dem Ordner-System `client/musik/`:
 *
 *   client/musik/<zonenId>/*.mp3|ogg|wav|m4a|flac   Stücke nur für diese Zone (z. B. stadtrand, waldweg)
 *   client/musik/alle/*                              Stücke für JEDE Zone (laufen, wenn die Zone keine eigenen hat – oder zusätzlich, siehe unten)
 *   client/musik/musik.json                          Index { "stadtrand": ["a.mp3"], … } – erzeugt `npm run musik:index`
 *
 *   client/musik/hauptmenue/*                         Login-Bildschirm/Hauptmenü (ohne "alle")
 *   client/musik/einstellungen.json                   Reihenfolge + Zufall je Ordner (Audio-Zentrale) → musik.json `_optionen`
 *
 * Browser dürfen keine Ordner auflisten (auch GitHub Pages nicht) – darum der Index. Nach dem Ablegen neuer
 * Dateien einmal `npm run musik:index` ausführen, dann alles committen. Ohne Dateien bleibt es still.
 * Ablauf: Zonenwechsel → sanft ausblenden → zufälliges Stück der neuen Zone einblenden → danach das nächste (nie
 * dasselbe zweimal hintereinander). Ein-/Ausblenden und Pause je Ordner: `_optionen.<ordner>.ueberblendung/pause` (Studio). Lautstärke: Regler "Musik" in den Einstellungen (Sound-Kanal `musik`).
 */
import { MUSIK_HAUPTMENUE, MUSIK_STANDARD } from './musikIndex.js';

const INDEX = new URL('../musik/musik.json', import.meta.url);

export class ZonenMusik {
  #sound;
  #index = null;
  #zone = null;
  #lauf = null; // { stoppen, beiEnde }
  #letztes = null;
  #timer = null;
  #laden = null;
  #liste = null; // Stücke der aktuellen Zone (für anstossen)

  constructor(sound) {
    this.#sound = sound;
  }

  /** Index (einmal) holen. Fehlt er, bleibt es still. */
  #ladeIndex() {
    this.#laden ??= fetch(INDEX, { cache: 'no-cache' })
      .then((a) => (a.ok ? a.json() : {}))
      .catch(() => ({}))
      .then((json) => (this.#index = json && typeof json === 'object' ? json : {}));
    return this.#laden;
  }

  /** Stücke für eine Zone: ihr eigener Ordner + "alle". */
  async stuecke(zone) {
    const index = this.#index ?? (await this.#ladeIndex());
    const eigene = (Array.isArray(index[zone]) ? index[zone] : []).map((datei) => `${zone}/${datei}`);
    if (zone === MUSIK_HAUPTMENUE) return eigene; // Hauptmenü: nur eigene Stücke
    const alle = (Array.isArray(index.alle) ? index.alle : []).map((datei) => `alle/${datei}`);
    return [...eigene, ...alle];
  }

  /** Zufällig (Standard) oder der Reihe nach (einstellungen.json `zufall: false`)? */
  #zufaellig(zone) {
    return this.#index?._optionen?.[zone]?.zufall !== false;
  }

  /** Überblendung/Pause des Ordners (einstellungen.json, Studio-Audio-Zentrale) in Sekunden */
  #option(zone, k) {
    return this.#index?._optionen?.[zone]?.[k] ?? MUSIK_STANDARD[k];
  }

  /** Neue Zone betreten (oder Spiel starten). Gleiche Zone nochmal = nichts tun. */
  async setzeZone(zone) {
    if (zone === this.#zone) return;
    const alt = this.#zone;
    this.#zone = zone;
    await this.#ladeIndex().catch(() => {});
    this.#stoppeAktuelles(Math.max(0.1, this.#index?._optionen?.[alt]?.ueberblendung ?? 2)); // Standard wie bisher 2 s
    const liste = await this.stuecke(zone);
    if (zone !== this.#zone || liste.length === 0) return;
    this.#liste = liste;
    this.#naechstes(liste);
  }

  /**
   * Runde 31: Ton ist jetzt entsperrt (erste Geste) – ist die Musik der Zone noch gesperrt/wartet sie auf den Wiederholungs-Timer
   * (3 s bzw. 15 s), sofort starten. So beginnt die Hauptmenü-Musik beim ersten Klick/Tastendruck statt Sekunden später.
   */
  anstossen() {
    if (!this.#zone || !this.#liste || this.#lauf) return;
    clearTimeout(this.#timer);
    this.#naechstes(this.#liste);
  }

  stoppen() {
    this.#zone = null;
    this.#stoppeAktuelles();
  }

  #stoppeAktuelles(sekunden = 2) {
    clearTimeout(this.#timer);
    this.#lauf?.stoppen(sekunden);
    this.#lauf = null;
  }

  async #naechstes(liste) {
    const zone = this.#zone;
    let stueck;
    if (!this.#zufaellig(zone)) stueck = liste[(liste.indexOf(this.#letztes) + 1) % liste.length];
    else {
      const kandidaten = liste.length > 1 ? liste.filter((s) => s !== this.#letztes) : liste;
      stueck = kandidaten[Math.floor(Math.random() * kandidaten.length)];
    }
    this.#letztes = stueck;
    const lauf = this.#sound.spieleMusik(new URL(`../musik/${stueck.split('/').map(encodeURIComponent).join('/')}`, import.meta.url).href, { fade: Math.max(0.1, this.#option(zone, 'ueberblendung')) });
    if (!lauf) {
      // Ton noch gesperrt (kein Klick bisher) → später nochmal versuchen
      this.#timer = setTimeout(() => zone === this.#zone && this.#naechstes(liste), 3000);
      return;
    }
    this.#lauf = lauf;
    lauf.beiEnde((fehler) => {
      this.#lauf = null;
      // Defekte Datei: länger warten, damit es keine Schleife gibt
      this.#timer = setTimeout(() => zone === this.#zone && this.#naechstes(liste), fehler === 'neustart' ? 500 : fehler ? 15000 : this.#option(zone, 'pause') * 1000);
    });
  }
}

/**
 * Zonen-Musik: lädt Stücke aus dem Ordner-System `client/musik/`:
 *
 *   client/musik/<zonenId>/*.mp3|ogg|wav|m4a|flac   Stücke nur für diese Zone (z. B. stadtrand, waldweg)
 *   client/musik/alle/*                              Stücke für JEDE Zone (laufen, wenn die Zone keine eigenen hat – oder zusätzlich, siehe unten)
 *   client/musik/musik.json                          Index { "stadtrand": ["a.mp3"], … } – erzeugt `npm run musik:index`
 *
 * Browser dürfen keine Ordner auflisten (auch GitHub Pages nicht) – darum der Index. Nach dem Ablegen neuer
 * Dateien einmal `npm run musik:index` ausführen, dann alles committen. Ohne Dateien bleibt es still.
 * Ablauf: Zonenwechsel → sanft ausblenden → zufälliges Stück der neuen Zone einblenden → danach das nächste (nie
 * dasselbe zweimal hintereinander). Lautstärke: Regler "Musik" in den Einstellungen (Sound-Kanal `musik`).
 */
const INDEX = new URL('../musik/musik.json', import.meta.url);
const PAUSE_ZWISCHEN_STUECKEN_MS = 4000;

export class ZonenMusik {
  #sound;
  #index = null;
  #zone = null;
  #lauf = null; // { stoppen, beiEnde }
  #letztes = null;
  #timer = null;
  #laden = null;

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
    const eigene = (index[zone] ?? []).map((datei) => `${zone}/${datei}`);
    const alle = (index.alle ?? []).map((datei) => `alle/${datei}`);
    return [...eigene, ...alle];
  }

  /** Neue Zone betreten (oder Spiel starten). Gleiche Zone nochmal = nichts tun. */
  async setzeZone(zone) {
    if (zone === this.#zone) return;
    this.#zone = zone;
    this.#stoppeAktuelles();
    const liste = await this.stuecke(zone);
    if (zone !== this.#zone || liste.length === 0) return;
    this.#naechstes(liste);
  }

  stoppen() {
    this.#zone = null;
    this.#stoppeAktuelles();
  }

  #stoppeAktuelles() {
    clearTimeout(this.#timer);
    this.#lauf?.stoppen(2);
    this.#lauf = null;
  }

  async #naechstes(liste) {
    const zone = this.#zone;
    const kandidaten = liste.length > 1 ? liste.filter((s) => s !== this.#letztes) : liste;
    const stueck = kandidaten[Math.floor(Math.random() * kandidaten.length)];
    this.#letztes = stueck;
    const lauf = this.#sound.spieleMusik(new URL(`../musik/${stueck.split('/').map(encodeURIComponent).join('/')}`, import.meta.url).href);
    if (!lauf) {
      // Ton noch gesperrt (kein Klick bisher) → später nochmal versuchen
      this.#timer = setTimeout(() => zone === this.#zone && this.#naechstes(liste), 3000);
      return;
    }
    this.#lauf = lauf;
    lauf.beiEnde((fehler) => {
      this.#lauf = null;
      // Defekte Datei: länger warten, damit es keine Schleife gibt
      this.#timer = setTimeout(() => zone === this.#zone && this.#naechstes(liste), fehler ? 15000 : PAUSE_ZWISCHEN_STUECKEN_MS);
    });
  }
}

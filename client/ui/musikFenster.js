import { youtubeId } from '../audio/hausMusik.js';

/**
 * Runde 24: Fenster am Radio/Plattenspieler (E): Stücke aus dem Musik-Ordner (musik.json, alle Ordner) oder YouTube-Link.
 * Wahl → beiWahl({ ziel, quelle: 'ordner'|'youtube'|'aus', wert }) → AKTION musik. Wird beim ersten Öffnen ins DOM gebaut.
 */
export class MusikFenster {
  #beiWahl = null;
  #ziel = null;
  #index = null;

  constructor(dokument) {
    this.dokument = dokument;
    this.el = null;
  }

  beiWahl(fn) {
    this.#beiWahl = fn;
  }

  get offen() {
    return !!this.el && !this.el.hidden;
  }

  zeige(b) {
    if (!b) {
      if (this.el) this.el.hidden = true;
      return;
    }
    this.#ziel = b.id;
    this.#baue();
    this.el.hidden = false;
    this.el.querySelector('.musik-titel').textContent = b.typ === 'plattenspieler' ? '💿 Plattenspieler' : '📻 Radio';
    this.el.querySelector('.musik-jetzt').textContent = b.musik ? `Läuft: ${b.musik.quelle === 'youtube' ? `YouTube (${b.musik.wert})` : b.musik.wert.split('/').pop().replace(/\.\w+$/, '')}` : 'Aus';
    this.#liste();
  }

  #baue() {
    if (this.el) return;
    const d = this.dokument;
    this.el = Object.assign(d.createElement('div'), { id: 'musik-fenster', className: 'fenster musik-fenster', hidden: true });
    this.el.innerHTML = `
      <div class="musik-kopf"><b class="musik-titel">📻 Radio</b><button type="button" class="musik-zu" aria-label="Schließen">✕</button></div>
      <div class="musik-jetzt"></div>
      <div class="musik-liste"></div>
      <label class="musik-yt">YouTube-Link<input type="text" inputmode="url" placeholder="https://youtu.be/…" spellcheck="false"></label>
      <div class="musik-knoepfe"><button type="button" class="musik-yt-ab">▶ YouTube abspielen</button><button type="button" class="musik-aus">⏹ Aus</button></div>
      <div class="musik-hinweis">Alle in der Nähe hören mit. Eigene Musik: Dateien nach client/musik/radio legen (npm run musik:index).</div>`;
    d.body.append(this.el);
    const eingabe = this.el.querySelector('.musik-yt input');
    eingabe.addEventListener('keydown', (e) => e.stopPropagation()); // WASD/Tab nicht ans Spiel
    this.el.querySelector('.musik-zu').addEventListener('click', () => this.zeige(null));
    this.el.querySelector('.musik-aus').addEventListener('click', () => this.#waehle('aus', null));
    this.el.querySelector('.musik-yt-ab').addEventListener('click', () => {
      const id = youtubeId(eingabe.value);
      if (!id) {
        eingabe.classList.add('fehler');
        return;
      }
      eingabe.classList.remove('fehler');
      this.#waehle('youtube', id);
    });
  }

  async #liste() {
    const ort = this.el.querySelector('.musik-liste');
    this.#index ??= await fetch(new URL('../musik/musik.json', import.meta.url), { cache: 'no-cache' })
      .then((a) => (a.ok ? a.json() : {}))
      .catch(() => ({}));
    const stuecke = [];
    for (const [ordner, dateien] of Object.entries(this.#index)) {
      if (ordner.startsWith('_') || !Array.isArray(dateien)) continue;
      for (const datei of dateien) stuecke.push(`${ordner}/${datei}`);
    }
    stuecke.sort((a, b) => (a.startsWith('radio/') ? -1 : 0) - (b.startsWith('radio/') ? -1 : 0));
    ort.replaceChildren(
      ...(stuecke.length
        ? stuecke.map((pfad) => {
            const k = Object.assign(this.dokument.createElement('button'), { type: 'button', className: 'musik-stueck', textContent: `♪ ${pfad.split('/').pop().replace(/\.\w+$/, '')}` });
            k.addEventListener('click', () => this.#waehle('ordner', pfad));
            return k;
          })
        : [Object.assign(this.dokument.createElement('div'), { textContent: 'Keine Musik im Ordner – nimm einen YouTube-Link.' })]),
    );
  }

  #waehle(quelle, wert) {
    this.#beiWahl?.({ ziel: this.#ziel, quelle, wert });
    this.zeige(null);
  }
}

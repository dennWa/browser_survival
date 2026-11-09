import { EMOTES } from '../../gemeinsam/spieler/emotes.js';

/**
 * Runde 47: Emote-Auswahl (Taste „emotes“ = Ö, 😀 in der oberen Leiste bzw. im ☰-Menü am Handy).
 * 16 Emojis im Raster; Klick/Tipp wählt, das Fenster schließt sich und das Emoji schwebt kurz über dem Kopf (für alle sichtbar).
 * Tasten 1–9 wählen bei offenem Fenster die ersten neun (Schnellleiste bleibt sonst unberührt).
 */
export class EmoteFenster {
  /** (index) → an den Server */
  beiWahl = null;

  constructor(dokument) {
    this.d = dokument;
    this.el = dokument.getElementById('emotes');
    const raster = dokument.getElementById('emotes-raster');
    raster.replaceChildren(
      ...EMOTES.map(([emoji, name], i) => {
        const b = Object.assign(dokument.createElement('button'), { type: 'button', className: 'emote-knopf', title: name });
        b.append(Object.assign(dokument.createElement('span'), { className: 'emote-zeichen', textContent: emoji }), Object.assign(dokument.createElement('small'), { textContent: i < 9 ? `${i + 1} ${name}` : name }));
        b.addEventListener('click', () => this.#waehle(i));
        return b;
      }),
    );
    dokument.getElementById('emotes-schliessen').addEventListener('click', () => this.zeige(false));
  }

  get offen() {
    return !this.el.hidden;
  }

  zeige(an = true) {
    this.el.hidden = !an;
  }

  umschalten() {
    this.zeige(this.el.hidden);
  }

  /** Zifferntaste bei offenem Fenster → true = verbraucht (keine Schnellleiste) */
  ziffer(slot) {
    if (!this.offen || slot > 8) return false;
    this.#waehle(slot);
    return true;
  }

  #waehle(i) {
    this.zeige(false);
    this.beiWahl?.(i);
  }
}

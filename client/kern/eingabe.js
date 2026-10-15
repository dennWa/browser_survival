import { TouchSteuerung } from './touchSteuerung.js';

/**
 * Alle Eingaben an einer Stelle: Tastatur, Maus und Touch (virtuelle Joysticks).
 * Der Rest des Spiels fragt nur richtung() und blickWinkel() ab – egal welches Gerät.
 *
 * Tastatur nutzt event.code (physische Taste) → WASD klappt auf QWERTZ, QWERTY, AZERTY.
 * Tastenbelegung: TASTEN unten anpassen.
 */
export const TASTEN = Object.freeze({
  oben: ['KeyW', 'ArrowUp'],
  unten: ['KeyS', 'ArrowDown'],
  links: ['KeyA', 'ArrowLeft'],
  rechts: ['KeyD', 'ArrowRight'],
  debug: ['F3'],
});

export class Eingabe {
  #gedrueckt = new Set();
  #tastenHoerer = new Map(); // code → [fn]
  #aktiv = false;

  constructor(fenster, leinwand, dokument = document) {
    this.mausX = 0; // Bildschirmkoordinaten (CSS-Pixel)
    this.mausY = 0;
    this.mausBenutzt = false;
    this.touch = new TouchSteuerung(dokument, leinwand);

    fenster.addEventListener('keydown', (e) => {
      if (!this.#aktiv || istEingabefeld(e.target)) return;
      if (TASTEN.debug.includes(e.code)) e.preventDefault();
      if (!e.repeat) for (const fn of this.#tastenHoerer.get(e.code) ?? []) fn();
      this.#gedrueckt.add(e.code);
    });
    fenster.addEventListener('keyup', (e) => this.#gedrueckt.delete(e.code));
    fenster.addEventListener('blur', () => this.zuruecksetzen());
    leinwand.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      this.mausX = e.clientX;
      this.mausY = e.clientY;
      this.mausBenutzt = true;
    });
  }

  get aktiv() {
    return this.#aktiv;
  }

  set aktiv(wert) {
    this.#aktiv = wert;
    this.touch.setzeAktiv(wert);
    if (!wert) this.zuruecksetzen();
  }

  /** Bewegungsrichtung, Länge 0..1 (Touch analog, Tastatur digital). */
  richtung() {
    const touch = this.touch.richtung();
    if (touch && (touch.x !== 0 || touch.y !== 0)) return touch;
    const an = (aktion) => TASTEN[aktion].some((code) => this.#gedrueckt.has(code));
    return { x: (an('rechts') ? 1 : 0) - (an('links') ? 1 : 0), y: (an('unten') ? 1 : 0) - (an('oben') ? 1 : 0) };
  }

  /**
   * Blickwinkel (Radiant) oder null = "Blickrichtung beibehalten".
   * Priorität: rechter Touch-Stick → Maus → Laufrichtung (Touch ohne Ziel-Stick).
   * @param spielerBildschirm Position des eigenen Spielers auf dem Bildschirm (CSS-Pixel)
   */
  blickWinkel(spielerBildschirm) {
    const ziel = this.touch.zielWinkel();
    if (ziel !== null) return ziel;
    if (this.touch.sichtbar) {
      const r = this.touch.richtung();
      return r && (r.x !== 0 || r.y !== 0) ? Math.atan2(r.y, r.x) : null;
    }
    if (this.mausBenutzt) return Math.atan2(this.mausY - spielerBildschirm.y, this.mausX - spielerBildschirm.x);
    return null;
  }

  /** Einmal-Aktion bei Tastendruck (z. B. Debug umschalten). */
  beiTaste(aktion, fn) {
    for (const code of TASTEN[aktion]) {
      if (!this.#tastenHoerer.has(code)) this.#tastenHoerer.set(code, []);
      this.#tastenHoerer.get(code).push(fn);
    }
  }

  zuruecksetzen() {
    this.#gedrueckt.clear();
    this.touch.zuruecksetzen();
  }
}

function istEingabefeld(element) {
  return element instanceof HTMLElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(element.tagName);
}

/**
 * Tastatur & Maus. Nutzt event.code (physische Taste) → WASD funktioniert auf QWERTZ, QWERTY, AZERTY.
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

  constructor(fenster, leinwand) {
    this.mausX = 0; // Bildschirmkoordinaten (CSS-Pixel)
    this.mausY = 0;
    this.aktiv = false;

    fenster.addEventListener('keydown', (e) => {
      if (!this.aktiv || istEingabefeld(e.target)) return;
      if (TASTEN.debug.includes(e.code)) e.preventDefault();
      if (!e.repeat) for (const fn of this.#tastenHoerer.get(e.code) ?? []) fn();
      this.#gedrueckt.add(e.code);
    });
    fenster.addEventListener('keyup', (e) => this.#gedrueckt.delete(e.code));
    fenster.addEventListener('blur', () => this.#gedrueckt.clear());
    leinwand.addEventListener('mousemove', (e) => {
      this.mausX = e.clientX;
      this.mausY = e.clientY;
    });
  }

  /** Bewegungsrichtung aus den gedrückten Tasten: x, y jeweils -1, 0 oder 1. */
  richtung() {
    const an = (aktion) => TASTEN[aktion].some((code) => this.#gedrueckt.has(code));
    return { x: (an('rechts') ? 1 : 0) - (an('links') ? 1 : 0), y: (an('unten') ? 1 : 0) - (an('oben') ? 1 : 0) };
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
  }
}

function istEingabefeld(element) {
  return element instanceof HTMLElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(element.tagName);
}

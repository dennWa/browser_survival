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
  angriff: ['Space'], // zusätzlich: linke Maustaste
  sprint: ['ShiftLeft', 'ShiftRight'],
  aufheben: ['KeyE'],
  nachladen: ['KeyR'],
  licht: ['KeyL'], // Taschenlampe an/aus
  wiederbeleben: ['Enter'], // tot → sofort neu spawnen
  admin: ['KeyP'], // Admin-Menü (nur Admins)
  ton: ['KeyM'], // Ton an/aus
  debug: ['F3'],
});

/** Schnellleiste: Taste n benutzt/rüstet Inventarplatz n-1 aus. */
const SLOT_TASTEN = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8'];

/** Ab diesem Ausschlag des rechten Touch-Sticks wird angegriffen (Zielen + Feuern mit einem Daumen). */
const TOUCH_FEUER_SCHWELLE = 0.85;

export class Eingabe {
  #gedrueckt = new Set();
  #tastenHoerer = new Map(); // code → [fn]
  #slotHoerer = [];
  #aktiv = false;
  #mausGedrueckt = false;

  constructor(fenster, leinwand, dokument = document) {
    this.mausX = 0; // Bildschirmkoordinaten (CSS-Pixel)
    this.mausY = 0;
    this.mausBenutzt = false;
    this.touch = new TouchSteuerung(dokument, leinwand);

    fenster.addEventListener('keydown', (e) => {
      if (!this.#aktiv || istEingabefeld(e.target)) return;
      if (TASTEN.debug.includes(e.code) || TASTEN.angriff.includes(e.code)) e.preventDefault();
      if (!e.repeat) {
        for (const fn of this.#tastenHoerer.get(e.code) ?? []) fn();
        const slot = SLOT_TASTEN.indexOf(e.code);
        if (slot >= 0) for (const fn of this.#slotHoerer) fn(slot);
      }
      this.#gedrueckt.add(e.code);
    });
    fenster.addEventListener('keyup', (e) => this.#gedrueckt.delete(e.code));
    fenster.addEventListener('blur', () => this.zuruecksetzen());
    // Auf dem ganzen Fenster: auch über HUD/Schnellleiste soll weiter gezielt werden
    fenster.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      this.mausX = e.clientX;
      this.mausY = e.clientY;
      this.mausBenutzt = true;
    });
    leinwand.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button === 0 && this.#aktiv) this.#mausGedrueckt = true;
    });
    fenster.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'mouse' && e.button === 0) this.#mausGedrueckt = false;
    });
    leinwand.addEventListener('contextmenu', (e) => e.preventDefault());
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

  /** Wird gerade angegriffen? (Maustaste, Leertaste oder rechter Touch-Stick voll ausgelenkt) */
  angriff() {
    if (!this.#aktiv) return false;
    return this.#mausGedrueckt || TASTEN.angriff.some((c) => this.#gedrueckt.has(c)) || this.touch.zielStaerke() >= TOUCH_FEUER_SCHWELLE;
  }

  /** Sprinten? (Shift gehalten oder linker Touch-Stick über den Rand gezogen) */
  sprint() {
    if (!this.#aktiv) return false;
    return TASTEN.sprint.some((c) => this.#gedrueckt.has(c)) || this.touch.sprint();
  }

  /** fn(slotIndex) bei Tasten 1–8 */
  beiSlotTaste(fn) {
    this.#slotHoerer.push(fn);
  }

  /**
   * Blickwinkel in der Welt (Radiant) oder null = "Blickrichtung beibehalten".
   * Priorität: rechter Touch-Stick → Maus → Laufrichtung (Touch ohne Ziel-Stick).
   * @param spieler { x, y } eigene Position in der Welt
   * @param kamera  braucht bildschirmZuWelt(sx, sy) – funktioniert so auch mit schräger 3D-Kamera
   */
  blickWinkel(spieler, kamera) {
    const ziel = this.touch.zielWinkel();
    if (ziel !== null) return ziel;
    if (this.touch.sichtbar) {
      const r = this.touch.richtung();
      return r && (r.x !== 0 || r.y !== 0) ? Math.atan2(r.y, r.x) : null;
    }
    if (this.mausBenutzt) {
      const punkt = kamera.bildschirmZuWelt(this.mausX, this.mausY);
      if (punkt) return Math.atan2(punkt.y - spieler.y, punkt.x - spieler.x);
    }
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
    this.#mausGedrueckt = false;
    this.touch.zuruecksetzen();
  }
}

function istEingabefeld(element) {
  return element instanceof HTMLElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(element.tagName);
}

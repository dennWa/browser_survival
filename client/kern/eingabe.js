import { TouchSteuerung } from './touchSteuerung.js';
import { TASTEN, aktionenFuer } from './tastenBelegung.js';

/**
 * Alle Eingaben an einer Stelle: Tastatur, Maus und Touch (virtuelle Joysticks).
 * Der Rest des Spiels fragt nur richtung() und blickWinkel() ab – egal welches Gerät.
 *
 * Tastatur nutzt event.code (physische Taste) → WASD klappt auf QWERTZ, QWERTY, AZERTY.
 * Runde 47: Belegung kommt aus `tastenBelegung.js` (frei einstellbar, ⚙ Einstellungen) und wird bei JEDEM Tastendruck
 * neu nachgeschlagen – beiTaste(aktion, fn) hängt an der Aktion, nicht an der Taste. Mittlere Maustaste und die
 * Seitentasten zählen als Tasten `Maus1|Maus3|Maus4` (z. B. Funken auf Maus 4).
 */
export { TASTEN } from './tastenBelegung.js';

/** Schnellleiste: Taste n benutzt/rüstet Inventarplatz n-1 aus. */
const SLOT_TASTEN = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0']; // 0 = Platz 10

/** Ab diesem Ausschlag des rechten Touch-Sticks wird angegriffen (Zielen + Feuern mit einem Daumen). */
const TOUCH_FEUER_SCHWELLE = 0.85;

export class Eingabe {
  #gedrueckt = new Set();
  #tastenHoerer = new Map(); // aktion → [fn]
  #slotHoerer = [];
  #aktiv = false;
  #mausGedrueckt = false;
  #fokusWeg = false; // Fenster hatte keinen Fokus → erster Klick holt nur den Fokus zurück (kein Schuss)
  /** Optionaler Haken: true = Linksklick ins Spiel löst gerade keinen Angriff aus (Fenster offen, Chat-Feld aktiv) */
  klickGesperrt = null;
  /** Optionaler Haken: (x, y) → true = Klick wurde für etwas anderes verbraucht (kein Angriff) */
  weltKlick = null;

  constructor(fenster, leinwand, dokument = document) {
    this.mausX = 0; // Bildschirmkoordinaten (CSS-Pixel)
    this.mausY = 0;
    this.mausBenutzt = false;
    this.mausZeit = 0;
    this.touch = new TouchSteuerung(dokument, leinwand);

    fenster.addEventListener('keydown', (e) => {
      if (!this.#aktiv || istEingabefeld(e.target)) return;
      const aktionen = aktionenFuer(e.code);
      if (aktionen.length > 0 && e.code !== 'Escape') e.preventDefault(); // Tab, Leertaste, F3, ' … lösen keine Browser-Aktion aus
      if (!e.repeat && !e.ctrlKey && !e.metaKey) { // Strg/⌘-Kürzel (Kopieren, Tab schließen …) lösen keine Spielaktion aus
        this.#loese(aktionen);
        const slot = SLOT_TASTEN.indexOf(e.code);
        if (slot >= 0) for (const fn of this.#slotHoerer) fn(slot);
      }
      this.#gedrueckt.add(e.code);
    });
    // Runde 47: Maus Mitte (1) und Seitentasten (3/4) als belegbare „Tasten“ – Zurück/Vor des Browsers unterdrücken
    const mausCode = (e) => (e.pointerType !== 'touch' && [1, 3, 4].includes(e.button) ? `Maus${e.button}` : null);
    fenster.addEventListener('pointerdown', (e) => {
      const code = mausCode(e);
      if (!code || !this.#aktiv || istEingabefeld(e.target)) return;
      if (aktionenFuer(code).length > 0) e.preventDefault();
      if (!this.#gedrueckt.has(code)) this.#loese(aktionenFuer(code));
      this.#gedrueckt.add(code);
    });
    fenster.addEventListener('pointerup', (e) => {
      const code = mausCode(e);
      if (!code) return;
      this.#gedrueckt.delete(code);
      if (this.#aktiv && aktionenFuer(code).length > 0) e.preventDefault();
    });
    for (const art of ['mouseup', 'auxclick']) fenster.addEventListener(art, (e) => this.#aktiv && [3, 4].includes(e.button) && e.preventDefault());
    fenster.addEventListener('keyup', (e) => this.#gedrueckt.delete(e.code));
    fenster.addEventListener('blur', () => {
      this.zuruecksetzen();
      this.#fokusWeg = true;
    });
    // Fokus kam per Tastatur/Alt-Tab zurück → nächster Klick schießt wieder normal (pointerdown kommt nach focus)
    fenster.addEventListener('focus', () => setTimeout(() => (this.#fokusWeg = false), 250));
    // Auf dem ganzen Fenster: auch über HUD/Schnellleiste soll weiter gezielt werden
    // mousemove statt nur pointermove: manche Stifte/Touchpads melden pointerType 'pen' o. Ä. – Hauptsache, es zielt
    // Runde 28: Nach einem Fingertipp schicken Browser „Kompatibilitäts-Mausereignisse“ an dieselbe Stelle – sonst schaute die
    // Figur beim Antippen eines HUD-Knopfs (Schnellleiste) dorthin. Solche Maus-Ereignisse kurz nach Touch ignorieren.
    let letzterTouch = -1e9;
    const touchGesehen = (e) => {
      if (e.type !== 'pointerdown' || e.pointerType === 'touch') letzterTouch = performance.now();
    };
    for (const art of ['touchstart', 'touchend', 'pointerdown']) fenster.addEventListener(art, touchGesehen, { capture: true, passive: true });
    const mausBewegt = (e) => {
      if (e.pointerType === 'touch') return;
      if (e.sourceCapabilities?.firesTouchEvents || performance.now() - letzterTouch < 900) return;
      this.mausX = e.clientX;
      this.mausY = e.clientY;
      this.mausBenutzt = true;
      this.mausZeit = performance.now();
    };
    fenster.addEventListener('pointermove', mausBewegt);
    fenster.addEventListener('mousemove', mausBewegt);
    leinwand.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch' && e.button === 0 && this.#aktiv) {
        e.preventDefault(); // kein Text-Markieren/Drag-Start, der die Maus "festhält"
        mausBewegt(e);
        // Klick, der nur den Fokus zurückholt oder ein Eingabefeld verlässt, schießt nicht
        if (this.weltKlick?.(e.clientX, e.clientY)) return; // z. B. Admin: Bot an diese Stelle setzen
        const feld = istEingabefeld(dokument.activeElement);
        if (feld) dokument.activeElement.blur();
        if (this.#fokusWeg || feld || this.klickGesperrt?.()) {
          this.#fokusWeg = false;
          return;
        }
        this.#mausGedrueckt = true;
      }
    });
    const losgelassen = (e) => {
      if (e.pointerType !== 'touch' && (e.button === 0 || e.type !== 'pointerup')) this.#mausGedrueckt = false;
    };
    fenster.addEventListener('pointerup', losgelassen);
    fenster.addEventListener('pointercancel', losgelassen);
    // Maus verlässt das Fenster mit gedrückter Taste → Loslassen kommt nie an
    dokument.addEventListener('mouseleave', () => (this.#mausGedrueckt = false));
    dokument.addEventListener('dragstart', (e) => this.#aktiv && e.preventDefault());
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

  /** Wird die Taste der Aktion gerade gehalten? (Push-to-talk, Funken …) */
  gehalten(aktion) {
    return this.#aktiv && (TASTEN[aktion] ?? []).some((c) => this.#gedrueckt.has(c));
  }

  /** Runde 24: Push-to-talk (Nähe) gehalten? */
  sprechen() {
    return this.gehalten('sprechen');
  }

  /** Runde 47: Funk-Taste gehalten? */
  funken() {
    return this.gehalten('funken');
  }

  /** fn(slotIndex) bei Tasten 1–9 und 0 (= Platz 10) */
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
    // Maus gewinnt, wenn sie zuletzt benutzt wurde (Touchscreen-Laptops: früher klemmte dann das Zielen)
    const mausAktuell = this.mausBenutzt && this.mausZeit >= this.touch.letzteBenutzung;
    if (this.touch.sichtbar && !mausAktuell) {
      const r = this.touch.richtung();
      return r && (r.x !== 0 || r.y !== 0) ? Math.atan2(r.y, r.x) : null;
    }
    if (this.mausBenutzt) {
      const punkt = kamera.bildschirmZuWelt(this.mausX, this.mausY);
      if (punkt) {
        this.zielAbstand = Math.hypot(punkt.x - spieler.x, punkt.y - spieler.y); // Runde 24: Wurfweite (Granate, Molotow)
        return Math.atan2(punkt.y - spieler.y, punkt.x - spieler.x);
      }
    }
    return null;
  }

  /** Einmal-Aktion bei Tastendruck (z. B. Debug umschalten) – gilt für die jeweils aktuelle Belegung der Aktion. */
  beiTaste(aktion, fn) {
    if (!this.#tastenHoerer.has(aktion)) this.#tastenHoerer.set(aktion, []);
    this.#tastenHoerer.get(aktion).push(fn);
  }

  #loese(aktionen) {
    for (const aktion of aktionen) for (const fn of this.#tastenHoerer.get(aktion) ?? []) fn();
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

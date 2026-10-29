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
  aufheben: ['KeyE'], // Aufheben / Abbauen / Werkbank / Schlafen – je nachdem, was in der Nähe ist
  menue: ['Escape'], // offene Menüs schließen
  karte: ['KeyM', 'KeyK'], // Karte auf/zu (Runde 23: M, K bleibt als Zweitbelegung)
  inventar: ['Tab'], // Inventar-Fenster auf/zu
  bauen: ['KeyB'], // Bau-Modus (BUILD) an/aus – R dreht dort das Bauteil; Admin: Umschalt+B = Flugmodus
  abriss: ['KeyX'], // im Bau-Modus: Abriss-Werkzeug
  gebiet: ['KeyV'], // roten Baugebiet-Ring ein-/ausblenden (Hammer in der Hand)
  skills: ['KeyU'], // Fähigkeiten (Skillpunkte verteilen)
  fallenlassen: ['KeyQ'], // Item fallen lassen (unter der Maus im Inventar, sonst das in der Hand)
  chat: ['KeyT'], // Chat-Eingabe öffnen
  spielerliste: ['KeyI'], // Spieler-Info: wer ist online (Level, Kills, überlebte Zeit)
  kofferraum: ['KeyG'], // Kofferraum des Autos öffnen (daneben stehen oder drinsitzen)
  sitzen: ['Quote'], // Ä (deutsche Tastatur; physisch die '-Taste): hinsetzen/aufstehen – überall, am Lagerfeuer heilend
  tuer: ['KeyF'], // Lagerfeuer an/aus (Name historisch)
  nachladen: ['KeyR'],
  licht: ['KeyL'], // Taschenlampe an/aus
  wiederbeleben: ['Enter'], // tot → sofort neu spawnen
  admin: ['KeyP'], // Admin-Menü (nur Admins)
  ton: [], // Ton an/aus (M ist seit Runde 23 die Karte; Ton im ⚙-Menü)
  debug: ['F3'],
});

/** Schnellleiste: Taste n benutzt/rüstet Inventarplatz n-1 aus. */
const SLOT_TASTEN = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0']; // 0 = Platz 10

/** Ab diesem Ausschlag des rechten Touch-Sticks wird angegriffen (Zielen + Feuern mit einem Daumen). */
const TOUCH_FEUER_SCHWELLE = 0.85;

export class Eingabe {
  #gedrueckt = new Set();
  #tastenHoerer = new Map(); // code → [fn]
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
      if (TASTEN.debug.includes(e.code) || TASTEN.angriff.includes(e.code) || TASTEN.inventar.includes(e.code) || TASTEN.chat.includes(e.code)) e.preventDefault();
      if (!e.repeat) {
        for (const fn of this.#tastenHoerer.get(e.code) ?? []) fn();
        const slot = SLOT_TASTEN.indexOf(e.code);
        if (slot >= 0) for (const fn of this.#slotHoerer) fn(slot);
      }
      this.#gedrueckt.add(e.code);
    });
    fenster.addEventListener('keyup', (e) => this.#gedrueckt.delete(e.code));
    fenster.addEventListener('blur', () => {
      this.zuruecksetzen();
      this.#fokusWeg = true;
    });
    // Fokus kam per Tastatur/Alt-Tab zurück → nächster Klick schießt wieder normal (pointerdown kommt nach focus)
    fenster.addEventListener('focus', () => setTimeout(() => (this.#fokusWeg = false), 250));
    // Auf dem ganzen Fenster: auch über HUD/Schnellleiste soll weiter gezielt werden
    // mousemove statt nur pointermove: manche Stifte/Touchpads melden pointerType 'pen' o. Ä. – Hauptsache, es zielt
    const mausBewegt = (e) => {
      if (e.pointerType === 'touch') return;
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

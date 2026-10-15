/**
 * Touch-Steuerung für Handy & Tablet: zwei virtuelle Joysticks.
 *   linke Bildschirmhälfte  → Bewegungs-Stick (analog: wenig gedrückt = langsam)
 *   rechte Bildschirmhälfte → Ziel-Stick (Blickrichtung; später: weit gedrückt = Angriff)
 *
 * Die Sticks erscheinen dort, wo der Daumen aufsetzt ("dynamische Joysticks") – bequem bei
 * jeder Handgröße und Bildschirmausrichtung. Funktioniert mit Pointer Events (alle modernen Browser).
 */
const STICK_RADIUS = 56; // CSS-Pixel
const TOTZONE = 0.15;
const ZIEL_SCHWELLE = 0.25;

export class TouchSteuerung {
  #sticks = { links: neuerStick(), rechts: neuerStick() };

  constructor(dokument, flaeche) {
    this.el = {
      wurzel: dokument.getElementById('touch'),
      links: dokument.getElementById('stick-links'),
      rechts: dokument.getElementById('stick-rechts'),
    };
    /** Grobe Zeiger (Finger) als Hauptbedienung → Touch-Gerät */
    this.istTouchGeraet = window.matchMedia?.('(pointer: coarse)').matches ?? false;
    this.sichtbar = false;
    this.aktiv = false;

    flaeche.addEventListener('pointerdown', (e) => this.#runter(e));
    flaeche.addEventListener('pointermove', (e) => this.#bewegen(e));
    flaeche.addEventListener('pointerup', (e) => this.#hoch(e));
    flaeche.addEventListener('pointercancel', (e) => this.#hoch(e));

    // Mobile Browser (v. a. Safari auf dem iPhone) ziehen trotz CSS die ganze Seite mit, wenn man
    // auf dem Spielfeld wischt ("Gummiband", Adressleiste, Neuladen). Im Spiel daher jede
    // Wisch- und Zoomgeste abfangen. Nicht-passiv, sonst darf preventDefault nichts verhindern.
    const blockiere = (e) => {
      if (this.aktiv && e.cancelable) e.preventDefault();
    };
    dokument.addEventListener('touchmove', blockiere, { passive: false });
    flaeche.addEventListener('touchstart', blockiere, { passive: false });
    dokument.addEventListener('gesturestart', blockiere); // iOS: Pinch-Zoom
    dokument.addEventListener('dblclick', blockiere); // Doppeltipp-Zoom
    this.dokument = dokument;
  }

  /** Touch-Oberfläche ein-/ausblenden (nur im Spiel und nur auf Touch-Geräten). */
  setzeAktiv(aktiv) {
    this.aktiv = aktiv;
    this.dokument.body.classList.toggle('im-spiel', aktiv);
    if (aktiv) window.scrollTo(0, 0);
    if (!aktiv) this.zuruecksetzen();
    this.#aktualisiereSichtbarkeit();
  }

  /** Bewegungsvektor (Länge 0..1) oder null, wenn der linke Stick nicht benutzt wird. */
  richtung() {
    const s = this.#sticks.links;
    if (s.zeiger === null) return null;
    return mitTotzone(s.x, s.y);
  }

  /** Blickwinkel vom rechten Stick, sonst null. */
  zielWinkel() {
    const s = this.#sticks.rechts;
    if (s.zeiger === null || Math.hypot(s.x, s.y) < ZIEL_SCHWELLE) return null;
    return Math.atan2(s.y, s.x);
  }

  /** Wie weit der rechte Stick gedrückt ist (0..1) – für späteres "Feuer bei Vollausschlag". */
  zielStaerke() {
    const s = this.#sticks.rechts;
    return s.zeiger === null ? 0 : Math.hypot(s.x, s.y);
  }

  zuruecksetzen() {
    for (const seite of ['links', 'rechts']) this.#loslassen(seite);
  }

  // ---------------------------------------------------------------------------

  #aktualisiereSichtbarkeit() {
    this.sichtbar = this.aktiv && this.istTouchGeraet;
    this.el.wurzel.hidden = !this.sichtbar;
  }

  #runter(e) {
    if (e.pointerType !== 'touch' || !this.aktiv) return;
    if (!this.istTouchGeraet) {
      // z. B. Laptop mit Touchscreen: Touch-Bedienung beim ersten Antippen einschalten
      this.istTouchGeraet = true;
      this.#aktualisiereSichtbarkeit();
    }
    const seite = e.clientX < window.innerWidth / 2 ? 'links' : 'rechts';
    const stick = this.#sticks[seite];
    if (stick.zeiger !== null) return;
    e.preventDefault();
    Object.assign(stick, { zeiger: e.pointerId, startX: e.clientX, startY: e.clientY, x: 0, y: 0 });
    const el = this.el[seite];
    el.style.left = `${e.clientX}px`;
    el.style.top = `${e.clientY}px`;
    el.classList.add('aktiv');
    this.#knopf(seite);
  }

  #bewegen(e) {
    const seite = this.#seiteVon(e.pointerId);
    if (!seite) return;
    e.preventDefault();
    const stick = this.#sticks[seite];
    let dx = (e.clientX - stick.startX) / STICK_RADIUS;
    let dy = (e.clientY - stick.startY) / STICK_RADIUS;
    const laenge = Math.hypot(dx, dy);
    if (laenge > 1) {
      dx /= laenge;
      dy /= laenge;
    }
    stick.x = dx;
    stick.y = dy;
    this.#knopf(seite);
  }

  #hoch(e) {
    const seite = this.#seiteVon(e.pointerId);
    if (seite) this.#loslassen(seite);
  }

  #loslassen(seite) {
    Object.assign(this.#sticks[seite], neuerStick());
    this.el[seite]?.classList.remove('aktiv');
  }

  #seiteVon(zeiger) {
    if (this.#sticks.links.zeiger === zeiger) return 'links';
    if (this.#sticks.rechts.zeiger === zeiger) return 'rechts';
    return null;
  }

  #knopf(seite) {
    const s = this.#sticks[seite];
    const knopf = this.el[seite].firstElementChild;
    knopf.style.transform = `translate(${s.x * STICK_RADIUS}px, ${s.y * STICK_RADIUS}px)`;
  }
}

function neuerStick() {
  return { zeiger: null, startX: 0, startY: 0, x: 0, y: 0 };
}

function mitTotzone(x, y) {
  const laenge = Math.hypot(x, y);
  if (laenge < TOTZONE) return { x: 0, y: 0 };
  const skaliert = (laenge - TOTZONE) / (1 - TOTZONE);
  return { x: (x / laenge) * skaliert, y: (y / laenge) * skaliert };
}

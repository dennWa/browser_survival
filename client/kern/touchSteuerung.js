/**
 * Touch-Steuerung für Handy & Tablet: zwei virtuelle Joysticks.
 *   links  → Bewegungs-Stick (analog: wenig gedrückt = langsam, über den Rand ziehen = sprinten)
 *   rechts → Ziel-Stick (Blickrichtung; ganz gedrückt = Angriff)
 *
 * Zwei Modi (Einstellungen → Touch-Steuerung, localStorage `browserSurvival.touch`):
 *   'fest' (Standard) → die Sticks sitzen fest unten links/rechts (Abstand + Höhe einstellbar); nur dort aufsetzen steuert.
 *   'frei'            → die Sticks erscheinen dort, wo der Daumen aufsetzt (halbe Bildschirmhälften), wie früher.
 * Finger, die keinen Stick bedienen, zählen als Geste: zwei Finger = Pinch-Zoom (beiZoom(faktor)), kurzes Tippen = beiTipp(x, y)
 * (z. B. Zombie anvisieren). Funktioniert mit Pointer Events (alle modernen Browser).
 */
const STICK_RADIUS = 56; // CSS-Pixel
const TOTZONE = 0.15;
const ZIEL_SCHWELLE = 0.25;
/** Daumen weiter als 1,35 × Stick-Radius vom Startpunkt → Sprint (Stick "über den Rand ziehen"). */
const SPRINT_SCHWELLE = 1.35;
/** Fester Modus: so weit (× Stick-Radius) vom Mittelpunkt darf der Daumen aufsetzen. */
const FEST_FANGRADIUS = 1.9;
const TIPP_MAX_MS = 320;
const TIPP_MAX_PX = 14;
const SPEICHER = 'browserSurvival.touch';
const STANDARD_EINSTELLUNG = { modus: 'fest', rand: 78, hoehe: 96 };

export class TouchSteuerung {
  #sticks = { links: neuerStick(), rechts: neuerStick() };
  /** Finger ohne Stick: pointerId → { x, y, t0, x0, y0 } (Pinch-Zoom, Tippen) */
  #gesten = new Map();
  #pinchAbstand = 0;
  #pinchAktiv = false;

  constructor(dokument, flaeche) {
    this.el = {
      wurzel: dokument.getElementById('touch'),
      links: dokument.getElementById('stick-links'),
      rechts: dokument.getElementById('stick-rechts'),
    };
    /** Grobe Zeiger (Finger) als Hauptbedienung → Touch-Gerät */
    this.istTouchGeraet = window.matchMedia?.('(pointer: coarse)').matches ?? false;
    this.sichtbar = false;
    /** Zeitpunkt der letzten Touch-Bedienung (performance.now) – Maus vs. Touch: wer zuletzt dran war, zielt */
    this.letzteBenutzung = 0;
    this.aktiv = false;
    /** Geste: Zoomfaktor (> 1 = rauszoomen, wie renderer.zoomen) und Tipp (Bildschirmkoordinaten) */
    this.beiZoom = null;
    this.beiTipp = null;
    this.einstellung = ladeEinstellung();
    this.#layout();
    window.addEventListener('resize', () => this.#layout());

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

  /** Modus 'fest' | 'frei' und Abstände (CSS-px) setzen; wird gemerkt. */
  setzeEinstellung(neu) {
    this.einstellung = { ...this.einstellung, ...neu };
    try {
      localStorage.setItem(SPEICHER, JSON.stringify(this.einstellung));
    } catch {
      /* ohne Speicher geht es auch */
    }
    this.zuruecksetzen();
    this.#layout();
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

  /** Linken Stick über den Rand hinaus gezogen? */
  sprint() {
    const s = this.#sticks.links;
    return s.zeiger !== null && s.roh >= SPRINT_SCHWELLE;
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
    this.#gesten.clear();
    this.#pinchAktiv = false;
  }

  // ---------------------------------------------------------------------------

  /** Mittelpunkt des festen Sticks (CSS-px). */
  #festPunkt(seite) {
    const { rand, hoehe } = this.einstellung;
    return { x: seite === 'links' ? rand : window.innerWidth - rand, y: window.innerHeight - hoehe };
  }

  /** Stick-Elemente positionieren (fest: feste Ruhelage, frei: Standard aus dem Stylesheet). */
  #layout() {
    const fest = this.einstellung.modus === 'fest';
    this.el.wurzel.classList.toggle('fest', fest);
    for (const seite of ['links', 'rechts']) {
      const el = this.el[seite];
      if (fest) {
        const p = this.#festPunkt(seite);
        el.style.left = `${p.x}px`;
        el.style.top = `${p.y}px`;
      } else {
        el.style.left = '';
        el.style.top = '';
      }
    }
  }

  #aktualisiereSichtbarkeit() {
    this.sichtbar = this.aktiv && this.istTouchGeraet;
    this.el.wurzel.hidden = !this.sichtbar;
  }

  #runter(e) {
    if (e.pointerType !== 'touch' || !this.aktiv) return;
    this.letzteBenutzung = performance.now();
    if (!this.istTouchGeraet) {
      // z. B. Laptop mit Touchscreen: Touch-Bedienung beim ersten Antippen einschalten
      this.istTouchGeraet = true;
      this.#aktualisiereSichtbarkeit();
    }
    const seite = e.clientX < window.innerWidth / 2 ? 'links' : 'rechts';
    const stick = this.#sticks[seite];
    const fest = this.einstellung.modus === 'fest';
    const mitte = fest ? this.#festPunkt(seite) : null;
    const imFangbereich = !fest || Math.hypot(e.clientX - mitte.x, e.clientY - mitte.y) <= STICK_RADIUS * FEST_FANGRADIUS;
    e.preventDefault();
    if (stick.zeiger !== null || !imFangbereich) {
      // Kein Stick-Finger: Geste (Pinch-Zoom / Tippen)
      this.#gesten.set(e.pointerId, { x: e.clientX, y: e.clientY, t0: performance.now(), x0: e.clientX, y0: e.clientY });
      if (this.#gesten.size === 2) this.#starteGeste();
      return;
    }
    Object.assign(stick, { zeiger: e.pointerId, startX: fest ? mitte.x : e.clientX, startY: fest ? mitte.y : e.clientY, x: 0, y: 0, roh: 0, t0: performance.now(), x0: e.clientX, y0: e.clientY, bewegt: false });
    const el = this.el[seite];
    if (!fest) {
      el.style.left = `${e.clientX}px`;
      el.style.top = `${e.clientY}px`;
    }
    el.classList.add('aktiv');
    if (fest) this.#bewegen(e); // Daumen kann gleich außerhalb der Mitte aufsetzen
    else this.#knopf(seite);
  }

  #bewegen(e) {
    const geste = this.#gesten.get(e.pointerId);
    if (geste) {
      e.preventDefault();
      geste.x = e.clientX;
      geste.y = e.clientY;
      if (this.#pinchAktiv) this.#pinchen();
      return;
    }
    const seite = this.#seiteVon(e.pointerId);
    if (!seite) return;
    e.preventDefault();
    const stick = this.#sticks[seite];
    this.letzteBenutzung = performance.now();
    if (Math.hypot(e.clientX - stick.x0, e.clientY - stick.y0) > TIPP_MAX_PX) stick.bewegt = true;
    let dx = (e.clientX - stick.startX) / STICK_RADIUS;
    let dy = (e.clientY - stick.startY) / STICK_RADIUS;
    const laenge = Math.hypot(dx, dy);
    stick.roh = laenge;
    if (laenge > 1) {
      dx /= laenge;
      dy /= laenge;
    }
    stick.x = dx;
    stick.y = dy;
    this.el[seite].classList.toggle('sprint', seite === 'links' && laenge >= SPRINT_SCHWELLE);
    this.#knopf(seite);
  }

  #hoch(e) {
    const geste = this.#gesten.get(e.pointerId);
    if (geste) {
      this.#gesten.delete(e.pointerId);
      const tipp = !this.#pinchAktiv && e.type === 'pointerup' && performance.now() - geste.t0 <= TIPP_MAX_MS && Math.hypot(geste.x - geste.x0, geste.y - geste.y0) <= TIPP_MAX_PX;
      if (this.#gesten.size < 2) this.#pinchAktiv = false;
      if (tipp) this.beiTipp?.(e.clientX, e.clientY);
      return;
    }
    const seite = this.#seiteVon(e.pointerId);
    if (!seite) return;
    const stick = this.#sticks[seite];
    // Freier Modus: kurzes Antippen (Stick kaum bewegt) zählt als Tipp
    const tipp = this.einstellung.modus === 'frei' && e.type === 'pointerup' && !stick.bewegt && performance.now() - stick.t0 <= TIPP_MAX_MS;
    this.#loslassen(seite);
    if (tipp) this.beiTipp?.(e.clientX, e.clientY);
  }

  #starteGeste() {
    const [a, b] = [...this.#gesten.values()];
    this.#pinchAbstand = Math.hypot(a.x - b.x, a.y - b.y);
    this.#pinchAktiv = true;
  }

  /** Zwei Finger: Abstand wird größer = reinzoomen. */
  #pinchen() {
    const [a, b] = [...this.#gesten.values()];
    if (!a || !b) return;
    const abstand = Math.hypot(a.x - b.x, a.y - b.y);
    if (this.#pinchAbstand > 8 && abstand > 8) this.beiZoom?.(this.#pinchAbstand / abstand);
    this.#pinchAbstand = abstand;
  }

  #loslassen(seite) {
    Object.assign(this.#sticks[seite], neuerStick());
    this.#knopf(seite);
    const el = this.el[seite];
    el?.classList.remove('aktiv', 'sprint');
    if (el && this.einstellung.modus !== 'fest') {
      el.style.left = '';
      el.style.top = '';
    }
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
  return { zeiger: null, startX: 0, startY: 0, x: 0, y: 0, roh: 0, t0: 0, x0: 0, y0: 0, bewegt: false };
}

function ladeEinstellung() {
  try {
    const roh = JSON.parse(localStorage.getItem(SPEICHER) ?? 'null');
    if (roh && (roh.modus === 'fest' || roh.modus === 'frei')) {
      return { modus: roh.modus, rand: klemme(roh.rand, 30, 220, STANDARD_EINSTELLUNG.rand), hoehe: klemme(roh.hoehe, 40, 260, STANDARD_EINSTELLUNG.hoehe) };
    }
  } catch {
    /* kein Speicher / kaputte Daten → Standard */
  }
  return { ...STANDARD_EINSTELLUNG };
}

function klemme(wert, min, max, standard) {
  return Number.isFinite(wert) ? Math.min(max, Math.max(min, wert)) : standard;
}

function mitTotzone(x, y) {
  const laenge = Math.hypot(x, y);
  if (laenge < TOTZONE) return { x: 0, y: 0 };
  const skaliert = (laenge - TOTZONE) / (1 - TOTZONE);
  return { x: (x / laenge) * skaliert, y: (y / laenge) * skaliert };
}

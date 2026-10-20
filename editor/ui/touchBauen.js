import { TOUCH, touchArt, fadenkreuz, lupenQuelle, touchGriffe, griffBei, auswahlRahmen, skaliereObjekt, touchRaster } from '../kern/touchBauen.js';
import { istWandEintrag } from '../kern/wand.js';
import { drehGriff } from '../kern/bearbeiten.js';
import { LINEAL } from './zeichner2d.js';

/**
 * Touch-Bauen (Editor 2.0, Schritt 7.6) – Finger auf der 2D-Karte. Regeln in kern/touchBauen.js.
 * Werkzeuge (ui/werkzeuge.js) geben jedes Finger-Ereignis zuerst an `faengt(e, phase)`; hier wird entschieden und
 * aufbereitet (`roh`-Ereignisse mit Fadenkreuz-Versatz) wieder an runterRoh/bewegenRoh/hochRoh gereicht.
 *   bestaetigen  Platzieren/Einfügen: Geist unter dem Fadenkreuz (über dem Finger) + Lupe, Loslassen → Leiste ✓ Setzen ·
 *                ⟳ Drehen · ✕ Abbrechen (`this.offen`); neuer Finger verschiebt den Geist
 *   zeichnen     Pinsel/Radierer/Gelände/Farbe/Bereich/Wand/Maßband: Fadenkreuz + Lupe, Ziehen ab `wackeln` px, Tippen = am Fadenkreuz
 *   direkt       Auswahl/Zone/Pipette …: wie die Maus, Tippen = Klick am Finger, Ziehen ab `wackeln` px
 *   Langdruck (≥ 550 ms ruhig) = Kontextmenü am Finger · 2. Finger bricht ab → Schwenken/Zoomen (Werkzeuge)
 *   Griffe (nur Auswahl-Werkzeug, nachdem zuletzt ein Finger benutzt wurde): ✥ verschieben, ⟳ Tippen = drehen (Free-Modus:
 *   ziehen = frei drehen im 15°-Raster), ⤡ Größe (genau ein Objekt). Jede Griff-Bewegung = 1 Undo-Schritt.
 * DOM: `.touch-lupe` (Canvas, kopiert aus der fertigen 2D-Leinwand über zeichner.nachZeichnen) und `.touch-bestaetigen`.
 */
export class TouchBauen {
  constructor({ werkzeuge, zeichner, zustand, aktionen, flaeche }) {
    this.w = werkzeuge;
    this.z = zeichner;
    this.zustand = zustand;
    this.aktionen = aktionen;
    this.leinwand = werkzeuge.leinwand;
    /** zuletzt mit dem Finger bedient (Griffe nur dann) */
    this.aktiv = false;
    this.finger = null; // { id, start, letzt, zeit, art, gestartet, langdruck, timer }
    this.griff = null; // { id, pid, start, startP, k, gestartet }
    /** offener Geist beim Platzieren: { ev } (roh-Ereignis am Fadenkreuz) */
    this.offen = null;

    this.lupe = document.createElement('canvas');
    this.lupe.className = 'touch-lupe';
    this.lupe.hidden = true;
    this.leiste = document.createElement('div');
    this.leiste.className = 'touch-bestaetigen';
    this.leiste.hidden = true;
    this.leiste.innerHTML = '<button type="button" data-t="setzen" class="akzent">✓ Setzen</button><button type="button" data-t="drehen" title="Drehen">⟳</button><button type="button" data-t="abbrechen" title="Abbrechen">✕</button>';
    this.leiste.addEventListener('click', (e) => {
      const t = e.target.closest('[data-t]')?.dataset.t;
      if (t === 'setzen') this.setzen();
      else if (t === 'drehen') this.drehen();
      else if (t === 'abbrechen') this.verwerfe();
    });
    flaeche.append(this.lupe, this.leiste);

    werkzeuge.touch = this;
    zeichner.griffQuelle = () => this.griffe();
    zeichner.nachZeichnen = () => this.#maleLupe();
    // Maus/Stift schaltet die Touch-Hilfen ab, Finger an (Griffe erscheinen nur nach Finger-Bedienung)
    this.leinwand.addEventListener('pointerdown', (e) => {
      const touch = e.pointerType === 'touch';
      if (touch !== this.aktiv) {
        this.aktiv = touch;
        this.z.anfordern();
      }
      if (!touch) {
        this.w.amFinger = false;
        if (this.offen) this.verwerfe();
      }
    }, { capture: true });
    // Werkzeugwechsel verwirft den Geist – aber nicht das 'werkzeug'-Ereignis, das Drehen (R/⟳) auslöst
    let werkzeug = zustand.werkzeug;
    zustand.bei('werkzeug', () => {
      if (zustand.werkzeug !== werkzeug) this.verwerfe();
      werkzeug = zustand.werkzeug;
    });
    for (const ev of ['zone', 'eintrag', 'ansicht']) zustand.bei(ev, () => this.verwerfe());
  }

  // --- Ereignisse aus ui/werkzeuge.js --------------------------------------------------------
  /** true = Ereignis hier behandelt (Werkzeuge machen nichts weiter) */
  faengt(e, phase) {
    if (phase === 'runter') return this.#runter(e);
    if (phase === 'bewegen') return this.#bewegen(e);
    return this.#hoch(e, phase === 'abbruch');
  }

  #runter(e) {
    const zustand = this.zustand;
    // Zweiter Finger: eigene Vorhaben fallen lassen, Werkzeuge machen daraus Schwenken/Zoomen
    if (this.finger || this.griff) {
      const f = this.finger ?? this.griff;
      if (f.id === e.pointerId || f.pid === e.pointerId) return true;
      const r = this.leinwand.getBoundingClientRect();
      if (!this.w.zeiger.has(f.id ?? f.pid)) this.w.zeiger.set(f.id ?? f.pid, { x: (f.letzt ?? f.start).clientX - r.left, y: (f.letzt ?? f.start).clientY - r.top });
      this.#fingerWeg();
      this.griff = null;
      return false;
    }
    if (this.w.zeiger.size || zustand.ansicht !== '2d' || !zustand.karte || this.w.neuModus) return false;
    const art = touchArt(zustand.werkzeug, zustand.eintrag, { wand: istWandEintrag(zustand.eintrag) });
    if (!art) return false;
    this.w.amFinger = true;
    const punkt = { clientX: e.clientX, clientY: e.clientY };
    // Griffe zuerst (liegen außerhalb der Auswahl)
    if (zustand.werkzeug === 'auswahl') {
      const r = this.leinwand.getBoundingClientRect();
      const g = griffBei(this.griffe(), e.clientX - r.left, e.clientY - r.top);
      if (g) return this.#griffRunter(g, e);
    }
    this.finger = { id: e.pointerId, start: punkt, letzt: punkt, zeit: performance.now(), art, gestartet: false, langdruck: false };
    this.finger.timer = setTimeout(() => this.#langdruck(), TOUCH.langdruck);
    if (art !== 'direkt') this.#zeigeKreuz(punkt);
    if (art === 'bestaetigen') this.w.vorschauBei(this.#roh(e, true));
    else if (art === 'zeichnen') this.w.bewegenRoh(this.#roh(e, true)); // Pinsel-Umriss am Fadenkreuz
    return true;
  }

  #bewegen(e) {
    if (this.griff && e.pointerId === this.griff.pid) return this.#griffBewegen(e);
    const f = this.finger;
    if (!f || f.id !== e.pointerId) return false;
    f.letzt = { clientX: e.clientX, clientY: e.clientY };
    if (f.langdruck) return true;
    if (!f.gestartet && Math.hypot(e.clientX - f.start.clientX, e.clientY - f.start.clientY) >= TOUCH.wackeln) {
      clearTimeout(f.timer);
      f.gestartet = true;
      if (f.art === 'zeichnen') this.w.runterRoh(this.#roh({ ...f.start, pointerId: f.id }, true));
      else if (f.art === 'direkt') this.w.runterRoh(this.#roh({ ...f.start, pointerId: f.id }, false));
    }
    if (f.art === 'bestaetigen') {
      this.#zeigeKreuz(e);
      this.w.vorschauBei(this.#roh(e, true));
    } else if (f.art === 'zeichnen') {
      this.#zeigeKreuz(e);
      this.w.bewegenRoh(this.#roh(e, true));
    } else if (f.gestartet) this.w.bewegenRoh(this.#roh(e, false));
    return true;
  }

  #hoch(e, abgebrochen) {
    if (this.griff && e.pointerId === this.griff.pid) return this.#griffHoch(e, abgebrochen);
    const f = this.finger;
    if (!f || f.id !== e.pointerId) return false;
    this.#fingerWeg();
    if (f.langdruck) return true;
    if (abgebrochen) {
      if (f.gestartet) this.w.hochRoh(this.#roh(e, f.art !== 'direkt'), true);
      if (f.art === 'bestaetigen') this.verwerfe();
      return true;
    }
    if (f.art === 'bestaetigen') {
      // Geist bleibt stehen → bestätigen oder verwerfen
      this.offen = { ev: this.#roh(e, true) };
      this.w.vorschauBei(this.offen.ev);
      this.leiste.hidden = false;
      return true;
    }
    const versatz = f.art === 'zeichnen';
    if (f.gestartet) this.w.hochRoh(this.#roh(e, versatz));
    else {
      // Tippen: Zeichen-Werkzeuge am Fadenkreuz (man hat damit gezielt), sonst am Finger
      const ev = this.#roh(e, versatz);
      this.w.runterRoh(ev);
      this.w.hochRoh(ev);
    }
    return true;
  }

  #fingerWeg() {
    if (!this.finger) return;
    clearTimeout(this.finger.timer);
    this.finger = null;
    this.z.fadenkreuz = null;
    this.lupe.hidden = true;
    this.z.anfordern();
  }

  #langdruck() {
    const f = this.finger;
    if (!f || f.gestartet) return;
    f.langdruck = true;
    clearTimeout(f.timer);
    this.z.fadenkreuz = null;
    this.lupe.hidden = true;
    if (f.art === 'bestaetigen' && !this.offen) this.z.vorschau = null;
    this.z.anfordern();
    navigator.vibrate?.(15);
    const p = this.w.kartenPunkt(f.letzt);
    const t = this.w.treffer(p);
    if (t && !this.zustand.istGewaehlt(t.s, t.k)) this.zustand.waehle([t]);
    this.aktionen.kontextmenue?.(f.letzt.clientX, f.letzt.clientY, { treffer: t, x: p.tx, y: p.ty });
  }

  // --- Platzieren bestätigen -----------------------------------------------------------------
  /** ✓: Geist an seiner Stelle setzen (wie ein Klick dort) */
  setzen() {
    const o = this.offen;
    if (!o) return;
    this.offen = null;
    this.leiste.hidden = true;
    this.w.amFinger = true;
    this.w.runterRoh(o.ev);
    this.w.hochRoh(o.ev);
    this.z.vorschau = null;
    this.z.anfordern();
  }

  drehen() {
    this.w.drehe();
    if (this.offen) this.w.vorschauBei(this.offen.ev);
  }

  /** ✕ / Esc / Werkzeugwechsel */
  verwerfe() {
    this.#fingerWeg();
    if (!this.offen) return;
    this.offen = null;
    this.leiste.hidden = true;
    this.z.vorschau = null;
    this.z.anfordern();
  }

  // --- Griffe ---------------------------------------------------------------------------------
  /** Große Griffe um die Auswahl (Bildpunkte) – nur Auswahl-Werkzeug, 2D, nach Finger-Bedienung */
  griffe() {
    const zustand = this.zustand;
    if (!this.aktiv || zustand.werkzeug !== 'auswahl' || zustand.ansicht !== '2d' || !zustand.karte) return [];
    const gew = zustand.gewaehlte();
    const r = auswahlRahmen(gew);
    if (!r) return [];
    const a = this.z.zuBild(r.x, r.y);
    const b = this.z.zuBild(r.x + r.b, r.y + r.h);
    const drehen = gew.some((g) => g.s === 'objekte' || g.s === 'bauwerke');
    const skalieren = gew.length === 1 && gew[0].s === 'objekte';
    return touchGriffe({ x: a.x, y: a.y, b: b.x - a.x, h: b.y - a.y }, { drehen, skalieren }).map((g) => ({ ...g, aktiv: this.griff?.id === g.id }));
  }

  #griffRunter(g, e) {
    const p = this.w.kartenPunkt(e);
    const gew = this.zustand.gewaehlte();
    this.griff = { id: g.id, pid: e.pointerId, start: { clientX: e.clientX, clientY: e.clientY }, startP: p, gestartet: false };
    // Werkzeuge kennen den Finger → ein zweiter Finger wird dort zur Geste
    const r = this.leinwand.getBoundingClientRect();
    this.w.zeiger.set(e.pointerId, { x: e.clientX - r.left, y: e.clientY - r.top });
    if (g.id === 'bewegen') {
      this.zustand.verlauf.beginne('Verschieben');
      this.w.ziehen = { art: 'bewegen', start: p, dx: 0, dy: 0 };
      this.griff.gestartet = true;
    } else if (g.id === 'skalieren') {
      this.griff.k = gew[0].k;
      this.griff.objekt = { ...gew[0].wert };
      this.zustand.verlauf.beginne('Größe ändern');
      this.griff.gestartet = true;
    }
    this.z.anfordern();
    return true;
  }

  #griffBewegen(e) {
    const g = this.griff;
    if (g.id === 'bewegen') {
      this.w.bewegenRoh(this.#roh(e, false));
      return true;
    }
    if (g.id === 'skalieren') {
      const p = this.w.kartenPunkt(e);
      const o = g.objekt;
      const k = this.zustand.karte;
      const neu = skaliereObjekt(o, p.wx - g.startP.wx, p.wy - g.startP.wy, { raster: touchRaster(this.zustand.frei, o.b, o.h), max: { breite: k.breite, hoehe: k.hoehe } });
      const jetzt = k.s('objekte').get(g.k);
      if (jetzt && (neu.b !== jetzt.b || neu.h !== jetzt.h)) {
        this.zustand.sammle([{ s: 'objekte', k: g.k, neu: { ...jetzt, b: neu.b, h: neu.h } }]);
        this.zustand.meldung(`Größe ${neu.b} × ${neu.h} Kacheln`);
      }
      return true;
    }
    // Drehen: im Free-Modus ziehen = frei drehen (15°-Raster), sonst nur Tippen
    if (!g.gestartet && Math.hypot(e.clientX - g.start.clientX, e.clientY - g.start.clientY) >= TOUCH.wackeln) {
      const gew = this.zustand.gewaehlte();
      if (this.zustand.frei && gew.length === 1 && gew[0].s === 'objekte') {
        const d = drehGriff(gew[0].wert);
        this.zustand.verlauf.beginne('Drehen (frei)');
        this.w.ziehen = { art: 'drehgriff', k: gew[0].k, start: gew[0].wert, winkel: Math.atan2(g.startP.wy - d.cy, g.startP.wx - d.cx) };
        g.gestartet = true;
      } else g.gestartet = 'nichts';
    }
    if (g.gestartet === true) this.w.bewegenRoh({ ...this.#roh(e, false), shiftKey: true });
    return true;
  }

  #griffHoch(e, abgebrochen) {
    const g = this.griff;
    this.griff = null;
    if (g.id === 'skalieren') {
      this.w.zeiger.delete(e.pointerId);
      this.zustand.verlauf.beende();
    } else if (g.id === 'drehen' && !g.gestartet) {
      this.w.zeiger.delete(e.pointerId);
      if (!abgebrochen) this.w.drehe();
    } else if (g.gestartet === true) this.w.hochRoh(this.#roh(e, false), abgebrochen);
    else this.w.zeiger.delete(e.pointerId);
    this.z.anfordern();
    return true;
  }

  // --- Fadenkreuz & Lupe ----------------------------------------------------------------------
  /** Roh-Ereignis für die Werkzeuge; mit Versatz am Fadenkreuz über dem Finger */
  #roh(e, versatz) {
    let { clientX, clientY } = e;
    if (versatz) clientY = this.#kreuz(e).clientY;
    return { clientX, clientY, pointerId: e.pointerId ?? this.finger?.id ?? 0, pointerType: 'touch', button: 0, buttons: 1, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, roh: true };
  }

  #kreuz(e) {
    const r = this.leinwand.getBoundingClientRect();
    const f = fadenkreuz(e.clientX, e.clientY, { oben: r.top + LINEAL + 2 });
    return { clientX: f.px, clientY: f.py };
  }

  #zeigeKreuz(e) {
    const r = this.leinwand.getBoundingClientRect();
    const k = this.#kreuz(e);
    this.z.fadenkreuz = { px: k.clientX - r.left, py: k.clientY - r.top };
    // Lupe in die Ecke, die das Fadenkreuz nicht verdeckt
    const g = TOUCH.lupe.groesse;
    const links = this.z.fadenkreuz.px > g + LINEAL + 40 || this.z.fadenkreuz.py > g + LINEAL + 40;
    this.lupe.style.left = links ? `${LINEAL + 8}px` : '';
    this.lupe.style.right = links ? '' : '8px';
    this.lupe.hidden = false;
    this.z.anfordern();
  }

  #maleLupe() {
    const f = this.z.fadenkreuz;
    if (!f || this.lupe.hidden) return;
    const dpr = window.devicePixelRatio || 1;
    const g = TOUCH.lupe.groesse;
    if (this.lupe.width !== Math.round(g * dpr)) {
      this.lupe.width = this.lupe.height = Math.round(g * dpr);
      this.lupe.style.width = this.lupe.style.height = `${g}px`;
    }
    const q = lupenQuelle(f.px, f.py);
    const ctx = this.lupe.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#0d0f12';
    ctx.fillRect(0, 0, this.lupe.width, this.lupe.height);
    ctx.drawImage(this.leinwand, q.sx * dpr, q.sy * dpr, q.sw * dpr, q.sh * dpr, 0, 0, this.lupe.width, this.lupe.height);
  }
}

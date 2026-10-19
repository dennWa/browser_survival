import { linie, rasteEin, rechteck, rechteckAus, pinsel, fuellen, kachelOps, nurImFeld, alsRechtecke } from '../kern/raster.js';
import { markerSchluessel, ausSchluessel, kopie } from '../kern/karte.js';
import { pruefeObjekt, pruefeMarker, pruefeBauwerk, pruefeBereich } from '../kern/platzierung.js';
import { terrainHeben, terrainGlaetten, terrainEbnen } from '../kern/terrain.js';
import { elementeIn, dreheVorlage } from '../kern/auswahl.js';
import { verschiebeOps, dreheOps } from '../kern/bearbeiten.js';
import { istWandEintrag, wandPunkte, begrenzeTueren, wandBauwerkOps } from '../kern/wand.js';
import { KACHELN } from '../../gemeinsam/welt/kacheln.js';
import { ebeneVon } from '../kern/ebenen.js';
import { LINEAL } from './zeichner2d.js';
import { STANDARD_KONFIGURATION } from '../../server/spiel/konfiguration/spielKonfiguration.js';

/**
 * Maus/Touch auf der 2D-Fläche → Werkzeuge. Werkzeuge:
 *   auswahl  Klick wählt (Umschalt = dazu), Ziehen verschiebt Gewähltes, Ziehen ins Leere = Auswahl-Rechteck (wie Excel)
 *   hand     schwenken (auch: mittlere Maustaste, Leertaste halten, zwei Finger)
 *   malen    Kacheln: Modus pinsel | rechteck (Umschalt = nur Rand) | linie (Mauern rasten ein, Strg = Raum-Umriss) | fuellen
 *   platzieren  … Wand-Bauwerke (Zaun, Holzwand, Tor …) werden mit gedrückter Maustaste am Stück gezogen (kern/wand.js)
 *   radierer Kacheln → Rasen, Objekte/Marker/Bauwerke unter dem Pinsel weg
 *   platzieren  Objekt/Bauwerk/Marker aus der Bauleiste (Vorschau grün/rot, R dreht)
 *   bereich  Rechteck aufziehen (Hasen-Bereich, Raumfläche, Übergang)
 *   zone     Griffe an Ecken/Kanten: Zone vergrößern/verkleinern
 *   terrain  Pinsel heben/senken/glätten/ebnen
 *   raumFuellen  Klick füllt den Raum (bis zu Wänden) als Raumfläche
 *   pipette  Kachel/Objekt unter der Maus in die Bauleiste übernehmen
 * Touch: Ansehen & Schwenken überall (1 Finger mit Hand-Werkzeug, 2 Finger immer = schwenken + zoomen). Malen/Bauen geht
 * per Tippen, Ziel ist aber der Desktop (bewusste Ausnahme, siehe editor/LIESMICH.md).
 * Maus: Rechts-Ziehen schwenkt, Rechtsklick ohne Ziehen = Kontextmenü (beim Platzieren/Einfügen: drehen),
 * Alt+Klick in Mal-/Platzier-Werkzeugen = Pipette. Ausgeblendete/gesperrte Ebenen sind nicht anklickbar (zustand.ebenen).
 */
export class Werkzeuge {
  constructor({ leinwand, zeichner, zustand, aktionen }) {
    this.leinwand = leinwand;
    this.z = zeichner;
    this.zustand = zustand;
    this.aktionen = aktionen; // { zoneGroesse(rand), neueZone(rechteck), uebergangAnlegen(r), ankunftAnlegen(x,y), raumFuellen(punkte), beiHover(x,y) }
    this.zeiger = new Map(); // pointerId → { x, y }
    this.ziehen = null;
    this.leertaste = false;
    this.neuModus = false; // Zone neu aufziehen
    this.letzteHover = null;
    /** Zusatztasten beim Ziehen (Strg = Raum-Umriss bei Wänden) */
    this.strg = false;

    leinwand.addEventListener('pointerdown', (e) => this.#runter(e));
    leinwand.addEventListener('pointermove', (e) => this.#bewegen(e));
    leinwand.addEventListener('pointerup', (e) => this.#hoch(e));
    leinwand.addEventListener('pointercancel', (e) => this.#hoch(e, true));
    leinwand.addEventListener('pointerleave', () => {
      if (!this.ziehen) {
        this.z.hover = null;
        this.z.vorschau = null;
        this.z.anfordern();
      }
    });
    leinwand.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = leinwand.getBoundingClientRect();
      const px = e.clientX - r.left;
      const py = e.clientY - r.top;
      // Trackpad: Pinch kommt als Strg+Rad (kleine Schritte), Zwei-Finger-Wischen als Rad mit kleinen deltaX/deltaY → schwenken
      if (e.ctrlKey) this.z.zoomen(Math.exp(-Math.max(-50, Math.min(50, e.deltaY)) * 0.01), px, py);
      else if (!istMausrad(e)) this.z.schwenken(-e.deltaX, -e.deltaY);
      else if (e.shiftKey) this.z.schwenken(-e.deltaY, 0);
      else this.z.zoomen(Math.exp(-Math.max(-1, Math.min(1, e.deltaY / 200)) * 0.35), px, py);
    }, { passive: false });
    leinwand.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) {
        this.leertaste = true;
        if (e.target === leinwand) e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => e.code === 'Space' && (this.leertaste = false));
  }

  get karte() {
    return this.zustand.karte;
  }

  #pos(e) {
    const r = this.leinwand.getBoundingClientRect();
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    const w = this.z.zuWelt(px, py);
    return { px, py, wx: w.x, wy: w.y, tx: Math.floor(w.x), ty: Math.floor(w.y) };
  }

  // --- Zeiger ------------------------------------------------------------------
  #runter(e) {
    this.leinwand.focus();
    this.leinwand.setPointerCapture(e.pointerId);
    const p = this.#pos(e);
    this.zeiger.set(e.pointerId, { x: p.px, y: p.py });
    if (this.zeiger.size === 2) {
      // Zwei Finger: laufende Aktion abbrechen → Schwenken/Zoomen
      this.#abbrechen();
      this.ziehen = { art: 'geste' };
      return;
    }
    if (this.zeiger.size > 2) return;
    const zustand = this.zustand;
    const drehWerkzeug = zustand.werkzeug === 'platzieren' || zustand.werkzeug === 'einfuegen';
    const hand = e.button === 1 || this.leertaste || zustand.werkzeug === 'hand' || (e.button === 2 && !drehWerkzeug);
    if (hand) {
      // Rechte Taste ohne Ziehen → Kontextmenü (in #hoch entschieden)
      this.ziehen = { art: 'schwenken', px: p.px, py: p.py, rechts: e.button === 2, startPx: p.px, startPy: p.py, weg: 0 };
      return;
    }
    if (e.button === 2) {
      // Rechtsklick beim Platzieren/Einfügen: drehen
      this.drehe();
      return;
    }
    if (this.neuModus) {
      this.ziehen = { art: 'neu', start: p };
      return;
    }
    if (!this.karte) return;
    if (p.px < LINEAL || p.py < LINEAL) return;
    const w = zustand.werkzeug;
    if (e.altKey && ['malen', 'platzieren', 'farbe', 'radierer', 'terrain'].includes(w)) return this.#pipette(p);
    if (w === 'zone') return this.#zoneRunter(p);
    if (w === 'auswahl') return this.#auswahlRunter(p, e.shiftKey);
    if (w === 'malen') return this.#malenRunter(p, e.shiftKey);
    if (w === 'radierer') {
      zustand.verlauf.beginne('Radieren');
      this.ziehen = { art: 'radieren', letzte: p };
      this.#radiere(p, p);
      return;
    }
    if (w === 'platzieren') return this.#platziere(p, e.shiftKey || zustand.mehrfach);
    if (w === 'bereich') {
      this.ziehen = { art: 'bereich', start: p };
      this.#bereichVorschau(p, p);
      return;
    }
    if (w === 'terrain') {
      zustand.verlauf.beginne('Gelände');
      this.ziehen = { art: 'terrain' };
      this.#terrain(p, e.shiftKey);
      return;
    }
    if (w === 'raumFuellen') return this.#raumFuellen(p);
    if (w === 'farbe') {
      const modus = this.zustand.eintrag?.werkzeug;
      if (modus === 'farbeFuellen') {
        // gleiche Kachel + gleiche Farbe zusammenhängend → neue Farbe
        const k = this.karte;
        const punkte = fuellen(p.tx, p.ty, (x, y) => (k.imFeld(x, y) ? `${k.kachelAn(x, y)}|${k.farbeAn(x, y)}` : null), 40000);
        this.zustand.ausfuehren('Farbe füllen', punkte.map(({ x, y }) => ({ s: 'bemalung', k: markerSchluessel(x, y), neu: this.zustand.farbe })));
        return;
      }
      this.zustand.verlauf.beginne(modus === 'farbeEntfernen' ? 'Farbe entfernen' : 'Farbe malen');
      this.ziehen = { art: 'farbe', letzte: p };
      this.#male(p, p);
      return;
    }
    if (w === 'einfuegen') {
      const v = this.zustand.einfuegeVorlage;
      if (v) this.aktionen.einfuegenBei(v, p.tx - Math.floor(v.b / 2), p.ty - Math.floor(v.h / 2), e.shiftKey || zustand.mehrfach);
      return;
    }
    if (w === 'pipette') return this.#pipette(p);
  }

  #bewegen(e) {
    const p = this.#pos(e);
    this.strg = e.ctrlKey || e.metaKey;
    const vorher = this.zeiger.get(e.pointerId);
    if (vorher) this.zeiger.set(e.pointerId, { x: p.px, y: p.py });
    // Hover-Koordinate (Statusleiste + Lineal)
    if (this.karte && (this.letzteHover?.tx !== p.tx || this.letzteHover?.ty !== p.ty)) {
      this.letzteHover = p;
      this.z.hover = { x: p.tx, y: p.ty };
      this.aktionen.beiHover?.(p.tx, p.ty);
      this.z.anfordern();
    }
    const d = this.ziehen;
    if (d?.art === 'geste') return this.#geste(e.pointerId, vorher);
    if (d?.art === 'schwenken') {
      d.weg = Math.max(d.weg ?? 0, Math.hypot(p.px - d.startPx, p.py - d.startPy));
      this.z.schwenken(p.px - d.px, p.py - d.py);
      d.px = p.px;
      d.py = p.py;
      return;
    }
    if (d?.art === 'neu') {
      this.z.neuRechteck = rechteckAus(Math.round(d.start.wx), Math.round(d.start.wy), Math.round(p.wx) - 1, Math.round(p.wy) - 1);
      this.z.neuRechteck.b = Math.max(1, Math.round(Math.abs(p.wx - d.start.wx)));
      this.z.neuRechteck.h = Math.max(1, Math.round(Math.abs(p.wy - d.start.wy)));
      this.z.anfordern();
      return;
    }
    if (!this.karte) return;
    if (!d) return this.#hoverVorschau(p, e.shiftKey);
    if (d.art === 'pinsel') {
      const neu = linie(d.letzte.tx, d.letzte.ty, p.tx, p.ty).flatMap(({ x, y }) => pinsel(x, y, this.zustand.pinselGroesse));
      this.zustand.ausfuehren('Malen', kachelOps(this.karte, neu, this.zustand.eintrag.zeichen));
      d.letzte = p;
    } else if (d.art === 'form') this.#formVorschau(d, p, e.shiftKey);
    else if (d.art === 'radieren') {
      this.#radiere(d.letzte, p);
      d.letzte = p;
    } else if (d.art === 'terrain') this.#terrain(p, e.shiftKey);
    else if (d.art === 'farbe') {
      this.#male(d.letzte, p);
      d.letzte = p;
    }
    else if (d.art === 'bewegen') this.#bewege(d, p, e.altKey);
    else if (d.art === 'wand') this.#wandVorschau(d, p, e.shiftKey);
    else if (d.art === 'rahmen') {
      this.zustand.auswahlRechteck = rechteckAus(d.start.tx, d.start.ty, p.tx, p.ty);
      this.zustand.melde('auswahl');
    } else if (d.art === 'bereich') this.#bereichVorschau(d.start, p);
    else if (d.art === 'zone') this.#zoneZiehen(d, p);
  }

  #hoch(e, abgebrochen = false) {
    this.zeiger.delete(e.pointerId);
    const d = this.ziehen;
    if (!d) return;
    if (d.art === 'geste') {
      if (this.zeiger.size === 0) this.ziehen = null;
      return;
    }
    this.ziehen = null;
    const p = this.#pos(e);
    if (abgebrochen) return this.#abbrechen(d);
    if (d.art === 'schwenken') {
      if (d.rechts && d.weg < 5 && this.karte) this.#kontextmenue(e, p);
      return;
    }
    if (d.art === 'neu') {
      const r = this.z.neuRechteck;
      this.z.neuRechteck = null;
      this.neuModus = false;
      if (r && r.b >= 4 && r.h >= 4) this.aktionen.neueZone(r);
      else this.zustand.meldung('Rechteck zu klein (mindestens 4 × 4) – nochmal aufziehen', 'fehler');
      this.z.anfordern();
      return;
    }
    if (d.art === 'pinsel' || d.art === 'radieren' || d.art === 'terrain' || d.art === 'bewegen' || d.art === 'farbe') this.zustand.verlauf.beende();
    if (d.art === 'form') this.#formAnwenden(d, p, e.shiftKey);
    if (d.art === 'wand') this.#wandFertig(d, p, e.shiftKey);
    if (d.art === 'rahmen') this.#rahmenFertig(d, p, e.shiftKey);
    if (d.art === 'bereich') this.#bereichFertig(d, p);
    if (d.art === 'zone') this.#zoneFertig();
    this.z.vorschau = null;
    this.z.anfordern();
  }

  /** Rechtsklick: Element unter der Maus wählen (falls nicht schon gewählt) und Kontextmenü öffnen */
  #kontextmenue(e, p) {
    const t = this.treffer(p);
    if (t && !this.zustand.istGewaehlt(t.s, t.k)) this.zustand.waehle([t]);
    this.aktionen.kontextmenue?.(e.clientX, e.clientY, { treffer: t, x: p.tx, y: p.ty });
  }

  #abbrechen(d = this.ziehen) {
    if (!d) return;
    if (['pinsel', 'radieren', 'terrain', 'bewegen', 'farbe'].includes(d.art)) this.zustand.verlauf.beende();
    this.z.vorschau = null;
    this.z.zonenVorschau = null;
    this.z.neuRechteck = null;
    this.ziehen = null;
    this.z.anfordern();
  }

  /** Esc */
  abbrechen() {
    this.#abbrechen();
    this.neuModus = false;
  }

  #geste(id, vorher) {
    const punkte = [...this.zeiger.values()];
    if (punkte.length < 2 || !vorher) return;
    const andere = [...this.zeiger.entries()].find(([k]) => k !== id)?.[1];
    if (!andere) return;
    const jetzt = this.zeiger.get(id);
    const abstandVor = Math.hypot(vorher.x - andere.x, vorher.y - andere.y);
    const abstandJetzt = Math.hypot(jetzt.x - andere.x, jetzt.y - andere.y);
    const mx = (jetzt.x + andere.x) / 2;
    const my = (jetzt.y + andere.y) / 2;
    if (abstandVor > 10) this.z.zoomen(abstandJetzt / abstandVor, mx, my);
    this.z.schwenken((jetzt.x - vorher.x) / 2, (jetzt.y - vorher.y) / 2);
  }

  // --- Auswahl -------------------------------------------------------------------
  /** Was liegt unter dem Punkt? Reihenfolge: Marker, Ankünfte, Bauwerke, Objekte, Übergänge, Bereiche */
  treffer(p) {
    const k = this.karte;
    if (!k) return null;
    const frei = (s) => this.zustand.ebeneFrei(ebeneVon(s));
    const m = frei('marker') && k.markerAn(p.tx, p.ty);
    if (m) return { s: 'marker', k: markerSchluessel(p.tx, p.ty) };
    if (frei('ankuenfte')) for (const [n, a] of k.s('ankuenfte')) if (a.x === p.tx && a.y === p.ty) return { s: 'ankuenfte', k: n };
    if (frei('bauwerke')) for (const [id, b] of k.s('bauwerke')) if (b.tx === p.tx && b.ty === p.ty) return { s: 'bauwerke', k: id };
    // Möbel vor Kronen: erst nicht-'oben', dann 'oben'
    let treffer = null;
    let krone = null;
    if (frei('objekte')) for (const [id, o] of k.s('objekte')) {
      if (p.wx < o.x || p.wx >= o.x + o.b || p.wy < o.y || p.wy >= o.y + o.h) continue;
      if (o.ebene === 'oben') krone = { s: 'objekte', k: id };
      else treffer = { s: 'objekte', k: id };
    }
    if (treffer || krone) return treffer ?? krone;
    for (const s of ['uebergaenge', 'tierBereiche', 'raumFlaechen'])
      if (frei(s)) for (const [id, r] of k.s(s)) if (p.wx >= r.x && p.wx < r.x + r.b && p.wy >= r.y && p.wy < r.y + r.h) return { s, k: id };
    return null;
  }

  #auswahlRunter(p, umschalt) {
    const t = this.treffer(p);
    if (t) {
      if (!this.zustand.istGewaehlt(t.s, t.k) || umschalt) this.zustand.waehle([t], umschalt);
      this.zustand.verlauf.beginne('Verschieben');
      this.ziehen = { art: 'bewegen', start: p, dx: 0, dy: 0 };
      return;
    }
    if (!umschalt) this.zustand.leereAuswahl();
    this.ziehen = { art: 'rahmen', start: p };
    this.zustand.auswahlRechteck = { x: p.tx, y: p.ty, b: 1, h: 1 };
  }

  #rahmenFertig(d, p, umschalt) {
    const r = rechteckAus(d.start.tx, d.start.ty, p.tx, p.ty);
    this.zustand.auswahlRechteck = r;
    const e = elementeIn(this.karte, r);
    const liste = [];
    for (const s of ['objekte', 'bauwerke', 'tierBereiche', 'raumFlaechen', 'marker']) for (const k of e[s]) liste.push({ s, k });
    for (const [id, u] of this.karte.s('uebergaenge')) if (u.x >= r.x && u.y >= r.y && u.x + u.b <= r.x + r.b && u.y + u.h <= r.y + r.h) liste.push({ s: 'uebergaenge', k: id });
    for (const [n, a] of this.karte.s('ankuenfte')) if (a.x >= r.x && a.y >= r.y && a.x < r.x + r.b && a.y < r.y + r.h) liste.push({ s: 'ankuenfte', k: n });
    this.zustand.waehle(liste.filter(({ s }) => this.zustand.ebeneFrei(ebeneVon(s))), umschalt);
    this.zustand.meldung(`Bereich x ${r.x}–${r.x + r.b - 1}, y ${r.y}–${r.y + r.h - 1} (${r.b} × ${r.h}) · ${liste.length} Elemente – Strg+C kopiert, Export → Ausschnitt`);
  }

  /** Gewähltes um ganze Kacheln verschieben (Alt = 0,1-Schritte für Objekte) */
  #bewege(d, p, fein) {
    const raster = fein ? 0.1 : 1;
    const dx = Math.round((p.wx - d.start.wx) / raster) * raster;
    const dy = Math.round((p.wy - d.start.wy) / raster) * raster;
    const sx = dx - d.dx;
    const sy = dy - d.dy;
    if (Math.abs(sx) < 1e-9 && Math.abs(sy) < 1e-9) return;
    const ops = verschiebeOps(this.karte, this.zustand.gewaehlte(), sx, sy);
    if (!ops.ops) return;
    this.zustand.sammle(ops.ops);
    // Marker haben neue Schlüssel → Auswahl nachziehen
    if (ops.neueAuswahl) this.zustand.waehle(ops.neueAuswahl);
    d.dx = dx;
    d.dy = dy;
  }

  // --- Malen ---------------------------------------------------------------------
  #malenRunter(p, umschalt) {
    const e = this.zustand.eintrag;
    if (e?.art !== 'kachel') return this.zustand.meldung('Erst eine Kachel in der Bauleiste wählen', 'fehler');
    const modus = this.zustand.malModus;
    if (modus === 'fuellen') {
      const punkte = fuellen(p.tx, p.ty, (x, y) => this.karte.kachelAn(x, y));
      this.zustand.ausfuehren(`Füllen: ${e.name}`, kachelOps(this.karte, punkte, e.zeichen));
      return;
    }
    if (modus === 'pinsel') {
      this.zustand.verlauf.beginne(`Malen: ${e.name}`);
      this.ziehen = { art: 'pinsel', letzte: p };
      this.zustand.ausfuehren('Malen', kachelOps(this.karte, pinsel(p.tx, p.ty, this.zustand.pinselGroesse), e.zeichen));
      return;
    }
    this.ziehen = { art: 'form', start: p };
    this.#formVorschau(this.ziehen, p, umschalt);
  }

  #formPunkte(d, p, umschalt) {
    if (this.zustand.malModus === 'rechteck') return rechteck(d.start.tx, d.start.ty, p.tx, p.ty, umschalt || !!this.zustand.nurRand);
    const e = this.zustand.eintrag;
    if (istWandEintrag(e)) {
      // Mauern: rasten waagerecht/senkrecht/45° ein (Umschalt = frei), Strg = Raum-Umriss; Türen höchstens 4 nebeneinander
      let punkte = wandPunkte(this.karte, { x: d.start.tx, y: d.start.ty }, { x: p.tx, y: p.ty }, { frei: umschalt, raum: this.strg || !!this.zustand.raumUmriss });
      if (this.zustand.pinselGroesse > 1) punkte = punkte.flatMap(({ x, y }) => pinsel(x, y, this.zustand.pinselGroesse));
      if (e.zeichen === 'T') {
        const b = begrenzeTueren(punkte);
        d.tuerGekuerzt = b.gekuerzt;
        punkte = b.punkte;
      }
      return punkte;
    }
    // Linie (frei, Umschalt = einrasten)
    const ende = umschalt ? rasteEin(d.start.tx, d.start.ty, p.tx, p.ty) : { x: p.tx, y: p.ty };
    return linie(d.start.tx, d.start.ty, ende.x, ende.y).flatMap(({ x, y }) => pinsel(x, y, this.zustand.pinselGroesse));
  }

  #formVorschau(d, p, umschalt) {
    const punkte = nurImFeld(this.karte, this.#formPunkte(d, p, umschalt));
    const r = rechteckAus(d.start.tx, d.start.ty, p.tx, p.ty);
    const wand = istWandEintrag(this.zustand.eintrag) && this.zustand.malModus === 'linie';
    const text = this.zustand.malModus === 'rechteck' ? `${r.b} × ${r.h}` : `${punkte.length} Kacheln${wand ? ` · Strg = Raum, Umschalt = frei${d.tuerGekuerzt ? ` · Tür max. 4 (${d.tuerGekuerzt} weg)` : ''}` : ''}`;
    this.z.vorschau = { kacheln: punkte, farbe: this.zustand.eintrag.farbe, text, textX: p.tx + 0.5, textY: p.ty };
    this.z.anfordern();
  }

  #formAnwenden(d, p, umschalt) {
    const e = this.zustand.eintrag;
    const wand = istWandEintrag(e) && this.zustand.malModus === 'linie';
    this.zustand.ausfuehren(`${this.zustand.malModus === 'rechteck' ? 'Rechteck' : wand ? 'Wand' : 'Linie'}: ${e.name}`, kachelOps(this.karte, this.#formPunkte(d, p, umschalt), e.zeichen));
    if (d.tuerGekuerzt) this.zustand.meldung(`Türen: höchstens ${4} nebeneinander – ${d.tuerGekuerzt} Kacheln weggelassen`, 'fehler');
  }

  // --- Wand-Bauwerke ziehen (Zaun, Holzwand, Tor …) ----------------------------------------
  #wandBauwerk(d, p, umschalt) {
    const e = this.zustand.eintrag;
    const punkte = wandPunkte(this.karte, { x: d.start.tx, y: d.start.ty }, { x: p.tx, y: p.ty }, { frei: umschalt, raum: this.strg || !!this.zustand.raumUmriss });
    const dx = Math.abs(p.tx - d.start.tx);
    const dy = Math.abs(p.ty - d.start.ty);
    return wandBauwerkOps(this.karte, e.typ, punkte, { standardDrehung: dy > dx ? 1 : this.zustand.drehung % 180 ? 1 : 0 });
  }

  #wandVorschau(d, p, umschalt) {
    const { ops, ungueltig } = this.#wandBauwerk(d, p, umschalt);
    this.z.vorschau = {
      kacheln: ops.map((o) => ({ x: o.neu.tx, y: o.neu.ty })),
      rot: ungueltig,
      gueltig: true,
      text: `${ops.length} ${this.zustand.eintrag.name}${ungueltig.length ? ` · ${ungueltig.length} rot (${ungueltig[0].grund})` : ''} · Strg = Raum, Umschalt = frei`,
      textX: p.tx + 0.5,
      textY: p.ty,
    };
    this.z.anfordern();
  }

  #wandFertig(d, p, umschalt) {
    const { ops, ungueltig } = this.#wandBauwerk(d, p, umschalt);
    if (ops.length) this.zustand.ausfuehren(`${this.zustand.eintrag.name}: ${ops.length} gezogen`, ops);
    if (ungueltig.length) this.zustand.meldung(`${ops.length} gesetzt, ${ungueltig.length} übersprungen (${ungueltig[0].grund})`, 'fehler');
  }

  #radiere(von, bis) {
    const k = this.karte;
    const punkte = nurImFeld(k, linie(von.tx, von.ty, bis.tx, bis.ty).flatMap(({ x, y }) => pinsel(x, y, this.zustand.pinselGroesse)));
    const ops = this.zustand.ebeneFrei('boden') ? kachelOps(k, punkte, ',') : [];
    const menge = new Set(punkte.map(({ x, y }) => `${x},${y}`));
    for (const { x, y } of punkte) if (k.markerAn(x, y)) ops.push({ s: 'marker', k: markerSchluessel(x, y), neu: null });
    // Radierer nimmt nur von freien Ebenen (gesperrte bleiben ohne Meldung stehen)
    const frei = (op) => this.zustand.ebeneFrei(ebeneVon(op.s));
    const nurFrei = () => ops.filter(frei);
    for (const [id, o] of k.s('objekte')) for (const { x, y } of punkte) if (x + 0.5 > o.x && x + 0.5 < o.x + o.b && y + 0.5 > o.y && y + 0.5 < o.y + o.h) {
      ops.push({ s: 'objekte', k: id, neu: null });
      break;
    }
    for (const [id, b] of k.s('bauwerke')) if (menge.has(`${b.tx},${b.ty}`)) ops.push({ s: 'bauwerke', k: id, neu: null });
    for (const [n, a] of k.s('ankuenfte')) if (menge.has(`${a.x},${a.y}`)) ops.push({ s: 'ankuenfte', k: n, neu: null });
    this.zustand.sammle(nurFrei());
  }

  // --- Platzieren ------------------------------------------------------------------
  /** Objekt, das bei p entstehen würde (Mitte unter dem Zeiger, Raster 1 bzw. 0,5 bei kleinen Teilen) */
  neuesObjekt(p) {
    const e = this.zustand.eintrag;
    const quer = this.zustand.drehung % 180 !== 0;
    const b = quer ? e.h : e.b;
    const h = quer ? e.b : e.h;
    const raster = b < 1 || h < 1 ? 0.1 : 1;
    const runde = (v) => Math.round(v / raster) * raster;
    const o = { typ: e.typ, x: runde(p.wx - b / 2), y: runde(p.wy - h / 2), b, h };
    if (b >= 1 && h >= 1 && Number.isInteger(b) && Number.isInteger(h)) {
      o.x = Math.round(p.wx - b / 2);
      o.y = Math.round(p.wy - h / 2);
    }
    o.x = Math.round(o.x * 1000) / 1000;
    o.y = Math.round(o.y * 1000) / 1000;
    if (e.blockiert) o.blockiert = true;
    if (e.ebene) o.ebene = e.ebene;
    const drehung = (this.zustand.drehung + (e.drehung ?? 0)) % 360;
    if (drehung) o.drehung = drehung;
    if (e.extra) Object.assign(o, kopie(e.extra));
    // Kegel-Lampe: die Platzier-Drehung (R) dreht die Leuchtrichtung
    if (o.art === 'kegel') {
      o.richtung = ((o.richtung ?? 90) + this.zustand.drehung) % 360;
      delete o.drehung;
    }
    return o;
  }

  #hoverVorschau(p, umschalt) {
    const zustand = this.zustand;
    const e = zustand.eintrag;
    const w = zustand.werkzeug;
    let v = null;
    if (w === 'platzieren' && e) {
      if (e.art === 'objekt') {
        const o = this.neuesObjekt(p);
        const pr = pruefeObjekt(this.karte, o);
        v = { rechtecke: [o], gueltig: pr.ok, text: pr.ok ? `${e.name} ${o.x}|${o.y}` : pr.grund, textX: o.x + o.b / 2, textY: o.y };
      } else if (e.art === 'bauwerk') {
        const pr = pruefeBauwerk(this.karte, e.typ, p.tx, p.ty);
        v = { rechtecke: [{ x: p.tx, y: p.ty, b: 1, h: 1 }], gueltig: pr.ok, text: pr.ok ? e.name : pr.grund, textX: p.tx + 0.5, textY: p.ty };
      } else if (e.art === 'marker') {
        const pr = pruefeMarker(this.karte, e.marker, p.tx, p.ty);
        v = { rechtecke: [{ x: p.tx, y: p.ty, b: 1, h: 1 }], gueltig: pr.ok, text: pr.ok ? e.name : pr.grund, textX: p.tx + 0.5, textY: p.ty };
      }
    } else if ((w === 'malen' && zustand.malModus === 'pinsel') || w === 'radierer') {
      v = { kacheln: nurImFeld(this.karte, pinsel(p.tx, p.ty, zustand.pinselGroesse)), farbe: w === 'radierer' ? 'rgba(255,80,80,0.5)' : e?.farbe };
    } else if (w === 'farbe' && zustand.eintrag?.werkzeug !== 'farbeFuellen') {
      v = { kacheln: nurImFeld(this.karte, pinsel(p.tx, p.ty, zustand.pinselGroesse)), farbe: zustand.eintrag?.werkzeug === 'farbeEntfernen' ? 'rgba(255,255,255,0.4)' : zustand.farbe };
    } else if (w === 'terrain') v = { kreis: { x: p.tx + 0.5, y: p.ty + 0.5, r: zustand.pinselGroesse / 2 + 0.5 } };
    else if (w === 'einfuegen' && zustand.einfuegeVorlage) {
      const vl = zustand.einfuegeVorlage;
      const r = { x: p.tx - Math.floor(vl.b / 2), y: p.ty - Math.floor(vl.h / 2), b: vl.b, h: vl.h };
      const drin = r.x >= 0 && r.y >= 0 && r.x + r.b <= this.karte.breite && r.y + r.h <= this.karte.hoehe;
      const kacheln = [];
      for (let y = 0; y < vl.h; y++) for (let x = 0; x < vl.b; x++) if (vl.zellen[y * vl.b + x] && vl.zellen[y * vl.b + x] !== ',') kacheln.push({ x: r.x + x, y: r.y + y });
      v = { rechtecke: [r], kacheln, gueltig: drin, text: `${vl.name ?? 'Einfügen'} ${r.b} × ${r.h}${drin ? '' : ' – ragt hinaus (Teile fallen weg)'} · R dreht`, textX: r.x + r.b / 2, textY: r.y };
    }
    else if (w === 'zone') {
      const g = this.#griffBei(p);
      this.leinwand.style.cursor = g ? (['l', 'r'].includes(g.id) ? 'ew-resize' : ['o', 'u'].includes(g.id) ? 'ns-resize' : g.id === 'lo' || g.id === 'ru' ? 'nwse-resize' : 'nesw-resize') : 'default';
    }
    if (umschalt !== undefined && v !== this.z.vorschau) {
      this.z.vorschau = v;
      this.z.anfordern();
    }
  }

  #platziere(p, umschalt) {
    const zustand = this.zustand;
    const e = zustand.eintrag;
    const k = this.karte;
    if (!e) return;
    if (e.art === 'objekt') {
      const o = this.neuesObjekt(p);
      const pr = pruefeObjekt(k, o);
      if (!pr.ok) return zustand.meldung(`Nicht platzierbar: ${pr.grund}`, 'fehler');
      const id = k.naechsteId;
      zustand.ausfuehren(`${e.name} setzen`, [{ s: 'objekte', k: id, neu: o }]);
      if (!umschalt) zustand.waehle([{ s: 'objekte', k: id }]);
    } else if (e.art === 'bauwerk' && istWandEintrag(e)) {
      // Wände am Stück: Maustaste gedrückt halten und ziehen (ein Klick = eine Kachel)
      this.ziehen = { art: 'wand', start: p };
      this.#wandVorschau(this.ziehen, p, false);
    } else if (e.art === 'bauwerk') {
      const pr = pruefeBauwerk(k, e.typ, p.tx, p.ty);
      if (!pr.ok) return zustand.meldung(`Nicht platzierbar: ${pr.grund}`, 'fehler');
      const b = { typ: e.typ, tx: p.tx, ty: p.ty };
      if (zustand.drehung % 180 !== 0) b.drehung = 1;
      zustand.ausfuehren(`${e.name} setzen`, [{ s: 'bauwerke', k: k.naechsteId, neu: b }]);
    } else if (e.art === 'marker') {
      const pr = pruefeMarker(k, e.marker, p.tx, p.ty);
      if (!pr.ok) return zustand.meldung(`Nicht platzierbar: ${pr.grund}`, 'fehler');
      if (e.marker === 'ankunft') return this.aktionen.ankunftAnlegen(p.tx, p.ty);
      const m = { art: e.marker };
      if (e.marker === 'loot') {
        const raum = e.raum ?? zustand.lootRaum;
        if (!raum || !k.s('raeume').has(raum)) return this.aktionen.raumWaehlen?.();
        m.raum = raum;
      }
      if (e.horde) m.horde = true;
      const schl = markerSchluessel(p.tx, p.ty);
      zustand.ausfuehren(`${e.name} setzen`, [{ s: 'marker', k: schl, neu: m }]);
      zustand.waehle([{ s: 'marker', k: schl }]);
    }
  }

  /** R: Drehung für neue Objekte bzw. Auswahl um 90° drehen */
  drehe() {
    const zustand = this.zustand;
    if (zustand.werkzeug === 'einfuegen' && zustand.einfuegeVorlage) {
      zustand.einfuegeVorlage = dreheVorlage(zustand.einfuegeVorlage);
      if (this.letzteHover) this.#hoverVorschau(this.letzteHover, false);
      return;
    }
    if (zustand.werkzeug === 'platzieren') {
      zustand.drehung = (zustand.drehung + 90) % 360;
      zustand.meldung(`Drehung ${zustand.drehung}°`);
      this.z.vorschau = null;
      if (this.letzteHover) this.#hoverVorschau(this.letzteHover, false);
      return;
    }
    const gew = zustand.gewaehlte();
    if (!gew.length) return zustand.meldung('Nichts zum Drehen ausgewählt (R dreht beim Platzieren die Vorschau)');
    const { ops, uebersprungen } = dreheOps(this.karte, gew);
    if (ops.length) zustand.ausfuehren('Drehen 90°', ops);
    if (uebersprungen) zustand.meldung(`${uebersprungen} Element(e) ohne Drehung (Marker, Bereiche) übersprungen`);
  }

  // --- Bereiche --------------------------------------------------------------------
  #bereichVorschau(a, p) {
    const r = rechteckAus(a.tx, a.ty, p.tx, p.ty);
    const pr = pruefeBereich(this.karte, this.zustand.eintrag?.sammlung, r);
    this.z.vorschau = { rechtecke: [r], gueltig: pr.ok, text: pr.ok ? `${r.b} × ${r.h}` : pr.grund, textX: r.x + r.b / 2, textY: r.y };
    this.z.anfordern();
  }

  #bereichFertig(d, p) {
    const e = this.zustand.eintrag;
    const r = rechteckAus(d.start.tx, d.start.ty, p.tx, p.ty);
    const pr = pruefeBereich(this.karte, e.sammlung, r);
    if (!pr.ok) return this.zustand.meldung(pr.grund, 'fehler');
    if (e.sammlung === 'uebergaenge') return this.aktionen.uebergangAnlegen(r);
    if (e.sammlung === 'raumFlaechen') return this.aktionen.raumFlaecheAnlegen([r]);
    const id = this.karte.naechsteId;
    // Standard wie im Spiel: hasenProTausend je 1000 Kacheln (Zonen-Wert oder global), mindestens 1
    const jeTausend = this.karte.wert('einstellungen.tiere.hasenProTausend') ?? STANDARD_KONFIGURATION.tiere.hasenProTausend;
    this.zustand.ausfuehren('Hasen-Bereich', [{ s: 'tierBereiche', k: id, neu: { ...r, art: 'hase', anzahl: Math.max(1, Math.round((r.b * r.h * jeTausend) / 1000)) } }]);
    this.zustand.waehle([{ s: 'tierBereiche', k: id }]);
  }

  #raumFuellen(p) {
    const k = this.karte;
    const z = k.kachelAn(p.tx, p.ty);
    if (z === null || KACHELN[z]?.blockiert) return this.zustand.meldung('In einen Raum klicken (nicht auf eine Wand)', 'fehler');
    // Füllen über begehbare Kacheln gleicher Innen/Außen-Art – Türen und Wände begrenzen
    const innen = !!KACHELN[z]?.innen;
    const punkte = fuellen(p.tx, p.ty, (x, y) => {
      const c = k.kachelAn(x, y);
      if (c === null) return null;
      return !KACHELN[c].blockiert && c !== 'T' && !!KACHELN[c].innen === innen ? 1 : 0;
    }, 20000);
    if (!innen && punkte.length > 3000) return this.zustand.meldung('Das ist draußen und riesig – lieber per Rechteck markieren', 'fehler');
    this.aktionen.raumFlaecheAnlegen(alsRechtecke(punkte));
  }

  #pipette(p) {
    if (this.zustand.werkzeug === 'farbe') {
      const f = this.karte.farbeAn(p.tx, p.ty);
      if (f) {
        this.zustand.farbe = f;
        this.zustand.melde('eintrag');
        return this.zustand.meldung(`Farbe ${f} übernommen`);
      }
    }
    const t = this.treffer(p);
    if (t?.s === 'objekte') this.aktionen.waehleEintrag?.({ typ: this.karte.s('objekte').get(t.k).typ });
    else this.aktionen.waehleEintrag?.({ zeichen: this.karte.kachelAn(p.tx, p.ty) });
  }

  /** Farbe entlang des Strichs malen bzw. entfernen */
  #male(von, bis) {
    const k = this.karte;
    const entfernen = this.zustand.eintrag?.werkzeug === 'farbeEntfernen';
    const punkte = nurImFeld(k, linie(von.tx, von.ty, bis.tx, bis.ty).flatMap(({ x, y }) => pinsel(x, y, this.zustand.pinselGroesse)));
    this.zustand.sammle(punkte.map(({ x, y }) => ({ s: 'bemalung', k: markerSchluessel(x, y), neu: entfernen ? null : this.zustand.farbe })));
  }

  // --- Terrain ---------------------------------------------------------------------
  #terrain(p, umschalt) {
    const zustand = this.zustand;
    const k = this.karte;
    const r = zustand.pinselGroesse / 2 + 0.5;
    const art = zustand.eintrag?.werkzeug;
    const staerke = zustand.terrainStaerke;
    let ops;
    if (art === 'terrainGlaetten') ops = terrainGlaetten(k, p.tx, p.ty, r, staerke);
    else if (art === 'terrainEbnen') ops = terrainEbnen(k, p.tx, p.ty, r, 0);
    else ops = terrainHeben(k, p.tx, p.ty, r, (art === 'terrainSenken') !== umschalt ? -staerke : staerke);
    zustand.sammle(ops);
  }

  // --- Zone ändern -----------------------------------------------------------------
  #griffBei(p) {
    if (!this.karte) return null;
    return this.z.griffe().find((g) => {
      const b = this.z.zuBild(g.x, g.y);
      return Math.abs(b.x - p.px) <= 12 && Math.abs(b.y - p.py) <= 12;
    });
  }

  #zoneRunter(p) {
    const g = this.#griffBei(p);
    if (!g) return;
    this.ziehen = { art: 'zone', griff: g.id };
    this.z.zonenVorschau = { x: 0, y: 0, b: this.karte.breite, h: this.karte.hoehe };
  }

  #zoneZiehen(d, p) {
    const k = this.karte;
    const r = { x0: 0, y0: 0, x1: k.breite, y1: k.hoehe };
    const gx = Math.round(p.wx);
    const gy = Math.round(p.wy);
    if (d.griff.includes('l')) r.x0 = Math.min(gx, r.x1 - 4);
    if (d.griff.includes('r')) r.x1 = Math.max(gx, r.x0 + 4);
    if (d.griff.includes('o')) r.y0 = Math.min(gy, r.y1 - 4);
    if (d.griff.includes('u')) r.y1 = Math.max(gy, r.y0 + 4);
    this.z.zonenVorschau = { x: r.x0, y: r.y0, b: r.x1 - r.x0, h: r.y1 - r.y0, verkleinert: r.x0 > 0 || r.y0 > 0 || r.x1 < k.breite || r.y1 < k.hoehe };
    this.z.anfordern();
  }

  #zoneFertig() {
    const v = this.z.zonenVorschau;
    this.z.zonenVorschau = null;
    const k = this.karte;
    if (!v || (v.x === 0 && v.y === 0 && v.b === k.breite && v.h === k.hoehe)) return;
    this.aktionen.zoneGroesse({ links: -v.x, oben: -v.y, rechts: v.x + v.b - k.breite, unten: v.y + v.h - k.hoehe });
  }
}

/** Mausrad oder Trackpad? Mausräder liefern grobe Schritte (Zeilenmodus oder ≥ 50 px) und kein deltaX. */
export function istMausrad(e) {
  return e.deltaMode !== 0 || (e.deltaX === 0 && Math.abs(e.deltaY) >= 50);
}

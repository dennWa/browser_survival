/**
 * Sichtkegel (Top-Down-Sichtfeld): Ein dunkler Schleier liegt über der Welt, nur ein Kegel vor der Figur (Blickrichtung) und
 * ein kleiner Kreis um sie herum bleiben frei – man sieht nur, was im Blickfeld liegt. Reine Darstellung (kein Einfluss auf Zombies).
 *
 * Gezeichnet wird auf einer eigenen, niedrig aufgelösten Canvas (halbe Größe) unter dem HUD; ein CSS-Weichzeichner macht die Kanten
 * weich. Kegel und Kreis werden als Bodenpolygon berechnet und per Kamera projiziert → stimmt mit der Perspektive überein.
 * Ein/Aus: Einstellungen ⚙ → „Sichtkegel“ (localStorage `browserSurvival.sichtkegel`).
 */
const SPEICHER = 'browserSurvival.sichtkegel';
const RAND = 28; // CSS-Pixel Überstand rundum (der Weichzeichner soll an den Bildrändern nicht aufhellen)
const SKALA = 0.5; // Auflösung der Canvas relativ zum Bildschirm
const KEGEL_WINKEL = 0.95; // Radiant (± um die Blickrichtung) ≈ 109° Gesamtöffnung
const KEGEL_REICHWEITE = 620; // px (Welt)
const KREIS_RADIUS = 125; // px (Welt): Nahbereich rundum bleibt immer sichtbar
const STUFEN = 9;
const PUNKTE = 22;

export class Sichtkegel {
  constructor(vorDemElement) {
    this.leinwand = Object.assign(document.createElement('canvas'), { id: 'sichtkegel' });
    Object.assign(this.leinwand.style, {
      position: 'fixed',
      left: `${-RAND}px`,
      top: `${-RAND}px`,
      width: `calc(100% + ${RAND * 2}px)`,
      height: `calc(100% + ${RAND * 2}px)`,
      pointerEvents: 'none',
      filter: 'blur(14px)',
    });
    vorDemElement.after(this.leinwand);
    this.ctx = this.leinwand.getContext('2d');
    this.an = true;
    try {
      this.an = localStorage.getItem(SPEICHER) !== 'aus';
    } catch {
      // egal
    }
    this.leinwand.hidden = !this.an;
    this.letzte = '';
    this.groesse(window.innerWidth, window.innerHeight);
  }

  setzeAn(an) {
    this.an = an;
    this.leinwand.hidden = !an;
    this.letzte = '';
    try {
      localStorage.setItem(SPEICHER, an ? 'an' : 'aus');
    } catch {
      // egal
    }
  }

  groesse(breite, hoehe) {
    this.leinwand.width = Math.ceil((breite + RAND * 2) * SKALA);
    this.leinwand.height = Math.ceil((hoehe + RAND * 2) * SKALA);
    this.letzte = '';
  }

  /**
   * @param kamera  KameraAdapter (weltZuBildschirm)
   * @param fokus   eigene Figur { x, y, blick, fahrzeugWinkel? }
   * @param dunkel  0 (Tag) … 1 (Nacht): nachts wird der Schleier etwas dichter
   * @param sichtbar false = Schleier aus (tot, Ego-Modus …)
   */
  zeichne(kamera, fokus, dunkel, sichtbar) {
    const leinwand = this.leinwand;
    const soll = this.an && sichtbar;
    if (leinwand.hidden === soll) leinwand.hidden = !soll;
    if (!soll) return;
    const winkel = fokus.fahrzeugWinkel ?? fokus.blick;
    const schluessel = `${Math.round(fokus.x)}|${Math.round(fokus.y)}|${winkel.toFixed(2)}|${kamera.breite}|${kamera.hoehe}|${kamera.zoom.toFixed(2)}|${dunkel.toFixed(2)}`;
    if (schluessel === this.letzte) return;
    this.letzte = schluessel;
    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, leinwand.width, leinwand.height);
    ctx.fillStyle = `rgba(3, 5, 10, ${0.66 + 0.2 * dunkel})`;
    ctx.fillRect(0, 0, leinwand.width, leinwand.height);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = `rgba(0, 0, 0, ${1 / STUFEN + 0.08})`;
    for (let i = 0; i < STUFEN; i++) {
      const s = 1 - (i / STUFEN) * 0.62; // von außen nach innen: Radius und Öffnungswinkel schrumpfen → weicher Rand
      this.#polygon(kamera, fokus.x, fokus.y, winkel, KEGEL_WINKEL * (0.55 + 0.45 * s), KEGEL_REICHWEITE * s, true);
      this.#polygon(kamera, fokus.x, fokus.y, winkel, Math.PI, KREIS_RADIUS * (0.45 + 0.55 * s), false);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  /** Kegel (Sektor um `winkel`) bzw. Kreis (halbwinkel = π) als Bodenpolygon füllen. */
  #polygon(kamera, x, y, winkel, halb, radius, mitSpitze) {
    const ctx = this.ctx;
    ctx.beginPath();
    const p0 = kamera.weltZuBildschirm(x, y, 0);
    const spitze = mitSpitze || halb < Math.PI;
    if (spitze) ctx.moveTo((p0.x + RAND) * SKALA, (p0.y + RAND) * SKALA);
    for (let i = 0; i <= PUNKTE; i++) {
      const w = winkel - halb + (2 * halb * i) / PUNKTE;
      const p = kamera.weltZuBildschirm(x + Math.cos(w) * radius, y + Math.sin(w) * radius, 0);
      if (i === 0 && !spitze) ctx.moveTo((p.x + RAND) * SKALA, (p.y + RAND) * SKALA);
      else ctx.lineTo((p.x + RAND) * SKALA, (p.y + RAND) * SKALA);
    }
    ctx.closePath();
    ctx.fill();
  }
}

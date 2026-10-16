import { KACHELN } from '../../gemeinsam/welt/kacheln.js';
import { BodenTextur } from '../darstellung/bodenTextur.js';

/**
 * Karte (Taste K / 🗺): zeigt die ganze Stadt – aber nur dort, wo man schon war ("Nebel des Krieges").
 * Erkundet wird alles im Umkreis von SICHT_KACHELN um die eigene Figur. Der Fortschritt wird pro
 * Server + Account + Karte im Browser gespeichert (localStorage), überlebt also Neuladen und Logout.
 */
const SICHT_KACHELN = 9;
const MASSSTAB = 0.25; // Kartenbild: 8 Pixel pro Kachel
const SPEICHER_INTERVALL_MS = 10000;

export class Karte {
  constructor(dokument, { welt, assets, schluessel }) {
    this.welt = welt;
    this.assets = assets;
    this.schluessel = `browser-survival-karte:${schluessel}`;
    this.el = dokument.getElementById('karte');
    this.leinwand = dokument.getElementById('karte-bild');
    this.anteilEl = dokument.getElementById('karte-anteil');
    this.erkundet = this.#laden();
    this.letzteKachel = -1;
    this.geaendert = false;
    this.letztesSpeichern = 0;
    this.letztesZeichnen = 0;
    /** Mitspieler [{ name, x, y }] – werden immer gezeigt (auch im Nebel), damit man sich findet */
    this.mitspieler = [];
    this.bild = null; // Kartenbild (einmalig erzeugt, wenn die Karte zum ersten Mal geöffnet wird)
    this.nebel = document.createElement('canvas'); // 1 Pixel pro Kachel, weich hochskaliert
    this.nebel.width = welt.breite;
    this.nebel.height = welt.hoehe;
    dokument.getElementById('karte-schliessen').addEventListener('click', () => this.zeige(false));
  }

  get offen() {
    return !this.el.hidden;
  }

  zeige(offen = !this.offen) {
    this.el.hidden = !offen;
    if (offen) this.zeichne(this.letzterSpieler);
  }

  /** Pro Frame: erkundete Kacheln eintragen (nur wenn man eine neue Kachel betritt). */
  aktualisiere(spieler, jetzt) {
    this.letzterSpieler = spieler;
    const g = this.welt.kachelGroesse;
    const tx = Math.floor(spieler.x / g);
    const ty = Math.floor(spieler.y / g);
    const kachel = ty * this.welt.breite + tx;
    if (kachel !== this.letzteKachel) {
      this.letzteKachel = kachel;
      for (let dy = -SICHT_KACHELN; dy <= SICHT_KACHELN; dy++) {
        for (let dx = -SICHT_KACHELN; dx <= SICHT_KACHELN; dx++) {
          if (dx * dx + dy * dy > SICHT_KACHELN * SICHT_KACHELN) continue;
          const x = tx + dx;
          const y = ty + dy;
          if (x < 0 || y < 0 || x >= this.welt.breite || y >= this.welt.hoehe) continue;
          const i = y * this.welt.breite + x;
          if (!this.erkundet[i]) {
            this.erkundet[i] = 1;
            this.geaendert = true;
          }
        }
      }
      if (this.offen) this.zeichne(spieler);
    }
    // Mitspieler bewegen sich → offene Karte zweimal pro Sekunde auffrischen
    if (this.offen && this.mitspieler.length > 0 && jetzt - this.letztesZeichnen > 500) this.zeichne(spieler);
    if (this.geaendert && jetzt - this.letztesSpeichern > SPEICHER_INTERVALL_MS) this.speichern(jetzt);
  }

  speichern(jetzt = performance.now()) {
    this.letztesSpeichern = jetzt;
    if (!this.geaendert) return;
    this.geaendert = false;
    try {
      // 8 Kacheln pro Byte → ~1,2 KB für die ganze Stadt
      const bytes = new Uint8Array(Math.ceil(this.erkundet.length / 8));
      this.erkundet.forEach((wert, i) => wert && (bytes[i >> 3] |= 1 << (i & 7)));
      localStorage.setItem(this.schluessel, btoa(String.fromCharCode(...bytes)));
    } catch {
      // Speicher voll/gesperrt → dann eben nur für diese Sitzung
    }
  }

  zeichne(spieler) {
    const ctx = this.leinwand.getContext('2d');
    if (!this.bild) this.bild = this.#erzeugeBild();
    this.leinwand.width = this.bild.width;
    this.leinwand.height = this.bild.height;
    ctx.drawImage(this.bild, 0, 0);

    // Nebel: unerkundete Kacheln schwarz, weich auslaufend
    const n = this.nebel.getContext('2d');
    const daten = n.createImageData(this.welt.breite, this.welt.hoehe);
    let gesehen = 0;
    for (let i = 0; i < this.erkundet.length; i++) {
      daten.data[i * 4 + 3] = this.erkundet[i] ? 0 : 255;
      gesehen += this.erkundet[i];
    }
    n.putImageData(daten, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.nebel, 0, 0, this.leinwand.width, this.leinwand.height);
    this.anteilEl.textContent = `${Math.round((gesehen / this.erkundet.length) * 100)} % erkundet`;

    this.letztesZeichnen = performance.now();
    const s = MASSSTAB;
    // Werkbänke immer zeigen (auch im Nebel) – sonst findet man sie kaum
    const g = this.welt.kachelGroesse;
    ctx.font = '15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const o of this.welt.objekte) {
      if (o.typ !== 'werkbank') continue;
      const x = (o.x + o.b / 2) * g * s;
      const y = (o.y + o.h / 2) * g * s;
      ctx.fillStyle = 'rgba(212, 160, 23, 0.35)';
      ctx.beginPath();
      ctx.arc(x, y, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillText('🔨', x, y + 1);
    }
    // Selbst gebaute Sachen (Bauwerke)
    const symbole = { werkbank: '🔨', lagerfeuer: '🔥', beet: '🌱', falle: '🪤' };
    ctx.font = '12px system-ui, sans-serif';
    for (const b of this.welt.bauwerke.values()) {
      if (!this.erkundet[b.ty * this.welt.breite + b.tx]) continue;
      ctx.globalAlpha = b.typ === 'lagerfeuer' && !b.brennt ? 0.5 : 1;
      ctx.fillText(symbole[b.typ] ?? '■', (b.tx + 0.5) * g * s, (b.ty + 0.5) * g * s + 1);
    }
    ctx.globalAlpha = 1;
    // Mitspieler: blaue Punkte mit Namen
    ctx.font = '600 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (const m of this.mitspieler) {
      ctx.fillStyle = '#4da3ff';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(m.x * s, m.y * s, 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeText(m.name, m.x * s, m.y * s - 10);
      ctx.fillStyle = '#cfe6ff';
      ctx.fillText(m.name, m.x * s, m.y * s - 10);
    }
    if (!spieler) return;
    // Eigene Position als Pfeil in Blickrichtung
    ctx.save();
    ctx.translate(spieler.x * s, spieler.y * s);
    ctx.rotate(spieler.blick ?? 0);
    ctx.fillStyle = '#ffd34d';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(10, 0);
    ctx.lineTo(-6, 6);
    ctx.lineTo(-3, 0);
    ctx.lineTo(-6, -6);
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
    ctx.restore();
  }

  /** Kartenbild: Böden, Wände, Möbel, Bäume, Werkbänke & Betten als Symbole. */
  #erzeugeBild() {
    const welt = this.welt;
    const g = welt.kachelGroesse;
    const s = MASSSTAB;
    const bild = new BodenTextur(welt, this.assets).rendere(s);
    const ctx = bild.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (let ty = 0; ty < welt.hoehe; ty++) {
      for (let tx = 0; tx < welt.breite; tx++) {
        const name = KACHELN[welt.kachelAn(tx, ty)]?.name;
        if (name !== 'wand' && name !== 'fenster') continue;
        ctx.fillStyle = name === 'fenster' ? '#7fb6cf' : '#22252b';
        ctx.fillRect(tx * g * s, ty * g * s, g * s + 0.5, g * s + 0.5);
      }
    }
    for (const o of welt.objekte) {
      const x = o.x * g * s;
      const y = o.y * g * s;
      const b = o.b * g * s;
      const h = o.h * g * s;
      if (o.ebene === 'oben') {
        ctx.fillStyle = o.typ === 'baum_herbst' ? 'rgba(196, 120, 50, 0.85)' : 'rgba(46, 120, 52, 0.85)';
        ctx.beginPath();
        ctx.arc(x + b / 2, y + h / 2, Math.min(b, h) / 2.4, 0, Math.PI * 2);
        ctx.fill();
      } else if (o.typ === 'stein' || o.typ === 'eisenerz') {
        ctx.fillStyle = o.typ === 'eisenerz' ? '#b0643a' : '#8a8d91';
        ctx.beginPath();
        ctx.arc(x + b / 2, y + h / 2, b / 2, 0, Math.PI * 2);
        ctx.fill();
      } else if (o.blockiert) {
        ctx.fillStyle = 'rgba(70, 55, 40, 0.75)';
        ctx.fillRect(x, y, b, h);
      }
    }
    ctx.font = '13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const o of welt.objekte) {
      const symbol = o.typ === 'werkbank' ? '🔨' : o.typ.startsWith('bett') ? '🛏' : null;
      if (symbol) ctx.fillText(symbol, (o.x + o.b / 2) * g * s, (o.y + o.h / 2) * g * s);
    }
    // Raumnamen
    ctx.font = '600 9px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.lineWidth = 2.5;
    for (const raum of welt.raeume) {
      ctx.strokeText(raum.name, raum.x * s, raum.y * s - 8);
      ctx.fillText(raum.name, raum.x * s, raum.y * s - 8);
    }
    return bild;
  }

  #laden() {
    const erkundet = new Uint8Array(this.welt.breite * this.welt.hoehe);
    try {
      const text = localStorage.getItem(this.schluessel);
      if (text) {
        const bytes = Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
        for (let i = 0; i < erkundet.length; i++) erkundet[i] = (bytes[i >> 3] >> (i & 7)) & 1;
      }
    } catch {
      // kaputt/gesperrt → neu anfangen
    }
    return erkundet;
  }
}

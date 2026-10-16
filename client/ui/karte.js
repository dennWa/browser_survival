import { KACHELN } from '../../gemeinsam/welt/kacheln.js';
import { BodenTextur } from '../darstellung/bodenTextur.js';
import { entpackeErkundet } from '../../gemeinsam/welt/erkundung.js';

/**
 * Karte (Taste K / 🗺): zeigt die ganze Zone – aber nur dort, wo man schon war ("Nebel des Krieges").
 * Erkundet wird alles im Umkreis von SICHT_KACHELN um die eigene Figur. Der Fortschritt wird pro
 * Server + Account + Karte im Browser gespeichert (localStorage), überlebt also Neuladen und Logout.
 * v0.10: Klick/Tippen auf einen erkundeten Ort → beiZielWahl (Auto-Lauf, clientSpiel.js); zeichneMini() = Minikarte im HUD.
 */
const SICHT_KACHELN = 9;
const MASSSTAB = 0.25; // Kartenbild: 8 Pixel pro Kachel
const SPEICHER_INTERVALL_MS = 10000;
const MINI_RADIUS_KACHELN = 20; // Minikarte zeigt so viele Kacheln in jede Richtung

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
    this.nebelVeraltet = true;
    this.gesehen = 0;
    dokument.getElementById('karte-schliessen').addEventListener('click', () => this.zeige(false));
    /** Auto-Lauf: Klick/Tippen auf einen erkundeten Ort → beiZielWahl(tx, ty); ziel = aktuelles Ziel (Flagge auf der Karte) */
    this.beiZielWahl = null;
    this.ziel = null;
    this.leinwand.addEventListener('click', (e) => {
      const r = this.leinwand.getBoundingClientRect();
      const tx = Math.floor(((e.clientX - r.left) / r.width) * this.welt.breite);
      const ty = Math.floor(((e.clientY - r.top) / r.height) * this.welt.hoehe);
      if (tx < 0 || ty < 0 || tx >= this.welt.breite || ty >= this.welt.hoehe) return;
      this.beiZielWahl?.(tx, ty, this.erkundet[ty * this.welt.breite + tx] === 1);
    });
  }

  get offen() {
    return !this.el.hidden;
  }

  /** Erkundung vom Server dazunehmen (Base64, siehe gemeinsam/welt/erkundung.js) – was lokal schon da ist, bleibt. */
  uebernimm(base64) {
    const vomServer = entpackeErkundet(base64, this.erkundet.length);
    if (!vomServer) return;
    for (let i = 0; i < vomServer.length; i++) if (vomServer[i] && !this.erkundet[i]) {
      this.erkundet[i] = 1;
      this.geaendert = true;
      this.nebelVeraltet = true;
    }
  }

  zeige(offen = !this.offen) {
    this.el.hidden = !offen;
    if (!offen) return;
    this.zeichne(this.letzterSpieler);
    this.#zentriere();
  }

  /** Passt die Karte nicht ganz ins Fenster (kleiner Bildschirm, hohe Zone): zur eigenen Figur scrollen. */
  #zentriere() {
    const s = this.letzterSpieler;
    const rahmen = this.leinwand.parentElement;
    if (!s || !rahmen) return;
    const faktor = this.leinwand.clientWidth / (this.welt.breite * this.welt.kachelGroesse);
    rahmen.scrollTop = s.y * faktor - rahmen.clientHeight / 2;
    rahmen.scrollLeft = s.x * faktor - rahmen.clientWidth / 2;
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
            this.nebelVeraltet = true;
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
    this.#aktualisiereNebel();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.nebel, 0, 0, this.leinwand.width, this.leinwand.height);
    this.anteilEl.textContent = `${Math.round((this.gesehen / this.erkundet.length) * 100)} % erkundet`;

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
    // Wege in andere Zonen: immer sichtbar (Pfeil zum Kartenrand + Zonenname)
    ctx.font = '600 10px system-ui, sans-serif';
    for (const u of this.welt.uebergaenge) {
      const x = ((u.px.x0 + u.px.x1) / 2) * s;
      const y = ((u.px.y0 + u.px.y1) / 2) * s;
      const oben = u.y === 0;
      const unten = u.y + u.h >= this.welt.hoehe;
      const pfeil = oben ? '⬆' : unten ? '⬇' : u.x === 0 ? '⬅' : '➡';
      const ty = oben ? y + 14 : unten ? y - 14 : y;
      ctx.fillStyle = 'rgba(77, 163, 255, 0.35)';
      ctx.fillRect(u.px.x0 * s, u.px.y0 * s, (u.px.x1 - u.px.x0) * s, (u.px.y1 - u.px.y0) * s);
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
      ctx.fillStyle = '#cfe6ff';
      ctx.strokeText(`${pfeil} ${u.name}`, x, ty);
      ctx.fillText(`${pfeil} ${u.name}`, x, ty);
    }
    ctx.font = '15px system-ui, sans-serif';
    // Selbst gebaute Sachen: Basisbau-Struktur (Boden, Wände) als Farbfelder (schnell, auch bei großen Basen), Möbel & Co. als Symbol
    const symbole = { werkbank: '🔨', lagerfeuer: '🔥', beet: '🌱', falle: '🪤', kiste: '📦', bett: '🛏', holztuer: '🚪' };
    const flaechen = { holzboden: 'rgba(199, 154, 98, 0.85)', holzwand: '#6b4424', holzwand_fenster: '#8aa7c0', holzwand_tuer: '#a77a44' };
    const kachel = g * s;
    const sichtbar = (b) => this.erkundet[b.ty * this.welt.breite + b.tx];
    for (const b of this.welt.bauwerke.values()) {
      if (!flaechen[b.typ] || !sichtbar(b)) continue;
      ctx.fillStyle = flaechen[b.typ];
      ctx.fillRect(b.tx * kachel, b.ty * kachel, kachel, kachel);
    }
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillStyle = '#fff';
    for (const b of this.welt.bauwerke.values()) {
      if (!symbole[b.typ] || !sichtbar(b)) continue;
      ctx.globalAlpha = b.typ === 'lagerfeuer' && !b.brennt ? 0.5 : 1;
      ctx.fillText(symbole[b.typ], (b.tx + 0.5) * kachel, (b.ty + 0.5) * kachel + 1);
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
    if (this.ziel) {
      // Ziel des Auto-Laufs: Flagge
      const fx = (this.ziel.tx + 0.5) * g * s;
      const fy = (this.ziel.ty + 0.5) * g * s;
      ctx.font = '20px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(255, 211, 77, 0.35)';
      ctx.beginPath();
      ctx.arc(fx, fy, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillText('🚩', fx - 4, fy - 2);
      ctx.textAlign = 'center';
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

  /** Nebel-Bild (1 Pixel pro Kachel) nur neu berechnen, wenn sich die Erkundung geändert hat. */
  #aktualisiereNebel() {
    if (!this.nebelVeraltet) return;
    this.nebelVeraltet = false;
    const n = this.nebel.getContext('2d');
    const daten = n.createImageData(this.welt.breite, this.welt.hoehe);
    let gesehen = 0;
    for (let i = 0; i < this.erkundet.length; i++) {
      daten.data[i * 4 + 3] = this.erkundet[i] ? 0 : 255;
      gesehen += this.erkundet[i];
    }
    n.putImageData(daten, 0, 0);
    this.gesehen = gesehen;
  }

  /**
   * Minikarte (HUD): Ausschnitt ±MINI_RADIUS_KACHELN um den Spieler aus demselben Kartenbild wie die große Karte,
   * unerkundetes bleibt schwarz. @param punkte [{ x, y, art: 'zombie' | 'spieler' | 'tier' }] in Weltpixeln
   */
  zeichneMini(leinwand, spieler, punkte = []) {
    if (!this.bild) this.bild = this.#erzeugeBild();
    this.#aktualisiereNebel();
    const g = this.welt.kachelGroesse;
    const k = g * MASSSTAB; // Pixel pro Kachel im Kartenbild
    const px = spieler.x / g;
    const py = spieler.y / g;
    const r = MINI_RADIUS_KACHELN;
    const gr = leinwand.width;
    const ctx = leinwand.getContext('2d');
    ctx.fillStyle = '#0a0c0f';
    ctx.fillRect(0, 0, gr, gr);
    ctx.imageSmoothingEnabled = true;
    // Ausschnitt auf die Karte begrenzen (am Rand bleibt schwarz)
    const x0 = Math.max(0, px - r);
    const y0 = Math.max(0, py - r);
    const x1 = Math.min(this.welt.breite, px + r);
    const y1 = Math.min(this.welt.hoehe, py + r);
    if (x1 <= x0 || y1 <= y0) return;
    const ziel = [((x0 - (px - r)) / (2 * r)) * gr, ((y0 - (py - r)) / (2 * r)) * gr, ((x1 - x0) / (2 * r)) * gr, ((y1 - y0) / (2 * r)) * gr];
    ctx.drawImage(this.bild, x0 * k, y0 * k, (x1 - x0) * k, (y1 - y0) * k, ...ziel);
    ctx.drawImage(this.nebel, x0, y0, x1 - x0, y1 - y0, ...ziel);
    const proKachel = gr / (2 * r);
    const bildX = (wx) => (wx / g - (px - r)) * proKachel;
    const bildY = (wy) => (wy / g - (py - r)) * proKachel;
    // Wege in andere Zonen (blau), immer sichtbar
    ctx.fillStyle = 'rgba(77, 163, 255, 0.55)';
    for (const u of this.welt.uebergaenge) ctx.fillRect(bildX(u.px.x0), bildY(u.px.y0), (u.px.x1 - u.px.x0) * (proKachel / g), (u.px.y1 - u.px.y0) * (proKachel / g));
    const farben = { zombie: '#e5483c', spieler: '#4da3ff', tier: '#e8d9b5' };
    for (const p of punkte) {
      const x = bildX(p.x);
      const y = bildY(p.y);
      if (x < 0 || y < 0 || x > gr || y > gr) continue;
      ctx.fillStyle = farben[p.art] ?? '#fff';
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, p.art === 'tier' ? 3 : 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fill();
    }
    // Ich: gelber Pfeil in Blickrichtung
    ctx.save();
    ctx.translate(gr / 2, gr / 2);
    ctx.rotate(spieler.blick ?? 0);
    ctx.fillStyle = '#ffd34d';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(11, 0);
    ctx.lineTo(-7, 7);
    ctx.lineTo(-3, 0);
    ctx.lineTo(-7, -7);
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

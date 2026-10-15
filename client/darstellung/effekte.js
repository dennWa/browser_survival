/**
 * Kurzlebige Effekte – rein optisch, ohne Einfluss auf das Spiel:
 * Mündungsfeuer, Leuchtspuren, Blutspritzer, Funken, Nahkampf-Schwung, Blutflecken am Boden,
 * roter Bildschirmblitz bei Schaden.
 *
 * Gefüttert mit den Server-Ereignissen aus ZUSTAND.ereignisse (siehe gemeinsam/protokoll.js).
 */
const MAX_PARTIKEL = 400;
const MAX_FLECKEN = 60;
const FLECK_LEBENSDAUER = 45; // Sekunden, dann verblasst das Blut
const MUENDUNG_ABSTAND = 20; // px vor der Figur
const LEUCHTSPUR_DAUER = 0.14;
const FEUER_DAUER = 0.09;
const FEUER_RADIUS = 24;
const SCHWUNG_DAUER = 0.16;

export class Effekte {
  #warteschlange = []; // { ab, ereignis }
  #leuchtspuren = [];
  #feuer = [];
  #partikel = [];
  #flecken = [];
  #schwuenge = [];
  #schadenBlitz = 0;

  /** Wird für jedes Ereignis aufgerufen, sobald es angezeigt wird (z. B. für Sound). */
  beiEreignis = null;

  /** Ereignisse einreihen; `verzoegerung(e)` → ms, ab wann sie gezeigt werden. */
  hinzufuegen(ereignisse, jetzt, verzoegerung) {
    for (const ereignis of ereignisse) this.#warteschlange.push({ ab: jetzt + verzoegerung(ereignis), ereignis });
  }

  /** Nur lesen! Für andere Renderer (3D-Prototyp), die die Effekte selbst darstellen. */
  get zustand() {
    return {
      leuchtspuren: this.#leuchtspuren,
      feuer: this.#feuer,
      partikel: this.#partikel,
      flecken: this.#flecken,
      schadenBlitz: this.#schadenBlitz,
    };
  }

  /** Aktive Lichtblitze (Mündungsfeuer) für die Lichtebene: [{ x, y, staerke }] */
  lichter() {
    return this.#feuer.map((f) => ({ x: f.x, y: f.y, staerke: 1 - f.alter / f.dauer }));
  }

  /** Roter Rand bei eigenem Schaden (0..1). */
  schaden(staerke) {
    this.#schadenBlitz = Math.min(1, this.#schadenBlitz + staerke);
  }

  aktualisiere(dt, jetzt) {
    for (let i = this.#warteschlange.length - 1; i >= 0; i--) {
      if (this.#warteschlange[i].ab > jetzt) continue;
      this.#starte(this.#warteschlange[i].ereignis);
      this.#warteschlange.splice(i, 1);
    }
    const altern = (liste) => {
      for (let i = liste.length - 1; i >= 0; i--) {
        liste[i].alter += dt;
        if (liste[i].alter >= liste[i].dauer) liste.splice(i, 1);
      }
    };
    for (const p of this.#partikel) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - 6 * dt; // Reibung
      p.vy *= 1 - 6 * dt;
    }
    altern(this.#leuchtspuren);
    altern(this.#feuer);
    altern(this.#partikel);
    altern(this.#flecken);
    altern(this.#schwuenge);
    this.#schadenBlitz = Math.max(0, this.#schadenBlitz - dt * 1.8);
  }

  // ---------------------------------------------------------------------------

  #starte(e) {
    this.beiEreignis?.(e);
    switch (e.typ) {
      case 'feuer': {
        const x = e.x + Math.cos(e.winkel) * MUENDUNG_ABSTAND;
        const y = e.y + Math.sin(e.winkel) * MUENDUNG_ABSTAND;
        this.#feuer.push({ x, y, winkel: e.winkel, alter: 0, dauer: FEUER_DAUER });
        break;
      }
      case 'schuss': {
        const winkel = Math.atan2(e.zy - e.y, e.zx - e.x);
        const sx = e.x + Math.cos(winkel) * MUENDUNG_ABSTAND;
        const sy = e.y + Math.sin(winkel) * MUENDUNG_ABSTAND;
        this.#leuchtspuren.push({ x: sx, y: sy, zx: e.zx, zy: e.zy, alter: 0, dauer: LEUCHTSPUR_DAUER });
        this.#spritzer(e.zx, e.zy, winkel + Math.PI, 3, '#c9c2b0', 40, 1.2); // Staub/Funken am Einschlag
        break;
      }
      case 'treffer':
        this.#spritzer(e.x, e.y, e.winkel, 10, e.ziel === 'zombie' ? '#6e1a12' : '#8e1010', 140, 2.2);
        if (Math.random() < 0.35) this.#fleck(e.x + Math.cos(e.winkel) * 10, e.y + Math.sin(e.winkel) * 10, 'blutfleck', 14);
        break;
      case 'tod':
        this.#fleck(e.x, e.y, 'blutlache', 44);
        this.#spritzer(e.x, e.y, Math.random() * Math.PI * 2, 18, '#5e140e', 90, 2.6, Math.PI);
        break;
      case 'nahkampf':
        this.#schwuenge.push({ x: e.x, y: e.y, winkel: e.winkel, alter: 0, dauer: SCHWUNG_DAUER });
        break;
    }
  }

  #spritzer(x, y, winkel, anzahl, farbe, tempo, groesse, streuung = 0.7) {
    for (let i = 0; i < anzahl && this.#partikel.length < MAX_PARTIKEL; i++) {
      const w = winkel + (Math.random() * 2 - 1) * streuung;
      const v = tempo * (0.4 + Math.random() * 0.8);
      this.#partikel.push({
        x, y, vx: Math.cos(w) * v, vy: Math.sin(w) * v,
        groesse: groesse * (0.6 + Math.random() * 0.8), farbe, alter: 0, dauer: 0.35 + Math.random() * 0.3,
      });
    }
  }

  #fleck(x, y, sprite, groesse) {
    if (this.#flecken.length >= MAX_FLECKEN) this.#flecken.shift();
    this.#flecken.push({ x, y, sprite, groesse: groesse * (0.8 + Math.random() * 0.4), winkel: Math.random() * Math.PI * 2, alter: 0, dauer: FLECK_LEBENSDAUER });
  }

  // ---------------------------------------------------------------------------
  // Zeichnen (Kamera-Transformation ist gesetzt)

  /** Blut am Boden – unter Gegenständen und Figuren. */
  zeichneBoden(ctx, assets) {
    const bild = assets?.umgebungBild;
    for (const f of this.#flecken) {
      const rest = 1 - f.alter / f.dauer;
      ctx.globalAlpha = Math.min(1, rest * 4) * 0.9;
      const rahmen = assets?.objekt(f.sprite);
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate(f.winkel);
      if (bild && rahmen) {
        ctx.drawImage(bild, rahmen.x, rahmen.y, rahmen.b, rahmen.h, -f.groesse / 2, -f.groesse / 2, f.groesse, f.groesse);
      } else {
        ctx.fillStyle = '#5a1410';
        ctx.beginPath();
        ctx.arc(0, 0, f.groesse / 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  /** Schüsse, Funken, Blut in der Luft – über den Figuren. */
  zeichneOben(ctx) {
    ctx.lineCap = 'round';
    for (const s of this.#leuchtspuren) {
      const rest = 1 - s.alter / s.dauer;
      // Leuchtschweif: breiter, warmer Rand + heller Kern
      ctx.strokeStyle = `rgba(255, 170, 60, ${0.35 * rest})`;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.zx, s.zy);
      ctx.stroke();
      ctx.strokeStyle = `rgba(255, 245, 210, ${0.95 * rest})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    for (const f of this.#feuer) {
      const rest = 1 - f.alter / f.dauer;
      const verlauf = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, FEUER_RADIUS);
      verlauf.addColorStop(0, `rgba(255, 250, 220, ${rest})`);
      verlauf.addColorStop(0.3, `rgba(255, 190, 70, ${0.85 * rest})`);
      verlauf.addColorStop(1, 'rgba(255, 120, 20, 0)');
      ctx.fillStyle = verlauf;
      ctx.beginPath();
      ctx.arc(f.x, f.y, FEUER_RADIUS, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const p of this.#partikel) {
      ctx.globalAlpha = 1 - p.alter / p.dauer;
      ctx.fillStyle = p.farbe;
      ctx.fillRect(p.x - p.groesse / 2, p.y - p.groesse / 2, p.groesse, p.groesse);
    }
    ctx.globalAlpha = 1;
    for (const s of this.#schwuenge) {
      const fortschritt = s.alter / s.dauer;
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.5 * (1 - fortschritt)})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 30, s.winkel - 0.9 + fortschritt * 0.4, s.winkel + 0.5 + fortschritt * 0.4);
      ctx.stroke();
    }
  }

  /** Roter Bildschirmrand bei Schaden (in Bildschirmpixeln). */
  zeichneBildschirm(ctx, breite, hoehe) {
    if (this.#schadenBlitz <= 0) return;
    const radius = Math.hypot(breite, hoehe) / 2;
    const verlauf = ctx.createRadialGradient(breite / 2, hoehe / 2, radius * 0.35, breite / 2, hoehe / 2, radius);
    verlauf.addColorStop(0, 'rgba(160, 0, 0, 0)');
    verlauf.addColorStop(1, `rgba(160, 0, 0, ${0.55 * this.#schadenBlitz})`);
    ctx.fillStyle = verlauf;
    ctx.fillRect(0, 0, breite, hoehe);
  }
}

/**
 * Kurzlebige Effekte – rein optisch, ohne Einfluss auf das Spiel:
 * Mündungsfeuer, Leuchtspuren, Blutspritzer, Funken, Nahkampf-Schwung, Blutflecken am Boden,
 * roter Bildschirmblitz bei Schaden.
 * Runde 24: Spucke der Spucker (Bogen, `spucken`), Säurespritzer, Explosionen (`explosionen`, großes Mündungslicht), Zündfunken.
 *
 * Gefüttert mit den Server-Ereignissen aus ZUSTAND.ereignisse (siehe gemeinsam/protokoll.js).
 */
const MAX_PARTIKEL = 400;
const MAX_FLECKEN = 60;
const FLECK_LEBENSDAUER = 120; // Sekunden (2 min), dann verblasst das Blut
const STOFF_FARBEN = { holz: '#8a6038', stein: '#8d8d88', metall: '#b9bec4', glas: '#cfe6ee', beton: '#b3aea2' };
const MUENDUNG_ABSTAND = 20; // px vor der Figur
const LEUCHTSPUR_DAUER = 0.14;
const FEUER_DAUER = 0.09;
const SCHWUNG_DAUER = 0.16;

export class Effekte {
  #warteschlange = []; // { ab, ereignis }
  #leuchtspuren = [];
  #feuer = [];
  #partikel = [];
  #flecken = [];
  #schwuenge = [];
  #spucken = [];
  #explosionen = [];
  #schadenBlitz = 0;

  /** Wird für jedes Ereignis aufgerufen, sobald es angezeigt wird (z. B. für Sound). */
  beiEreignis = null;

  /** Ereignisse einreihen; `verzoegerung(e)` → ms, ab wann sie gezeigt werden. */
  hinzufuegen(ereignisse, jetzt, verzoegerung) {
    for (const ereignis of ereignisse) this.#warteschlange.push({ ab: jetzt + verzoegerung(ereignis), ereignis });
  }

  /** Nur lesen! Der Renderer stellt die Effekte in 3D dar. */
  get zustand() {
    return {
      leuchtspuren: this.#leuchtspuren,
      feuer: this.#feuer,
      partikel: this.#partikel,
      flecken: this.#flecken,
      schwuenge: this.#schwuenge,
      spucken: this.#spucken,
      explosionen: this.#explosionen,
      schadenBlitz: this.#schadenBlitz,
    };
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
    altern(this.#spucken);
    altern(this.#explosionen);
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
        // Einschlag: Staub/Splitter in der Farbe des Materials – Blut gibt es nur bei 'treffer' (Zombie/Spieler/Tier)
        if (e.stoff && e.stoff !== 'fleisch') this.#spritzer(e.zx, e.zy, winkel + Math.PI, 5, STOFF_FARBEN[e.stoff] ?? STOFF_FARBEN.beton, 45, 1.3);
        break;
      }
      case 'treffer':
        this.#spritzer(e.x, e.y, e.winkel, 10, e.ziel === 'zombie' ? '#6e1a12' : e.ziel === 'tier' ? '#7a1a14' : '#8e1010', 140, 2.2);
        if (Math.random() < 0.35) this.#fleck(e.x + Math.cos(e.winkel) * 10, e.y + Math.sin(e.winkel) * 10, 'blutfleck', 14);
        break;
      case 'tod':
        this.#fleck(e.x, e.y, 'blutlache', 44);
        this.#spritzer(e.x, e.y, Math.random() * Math.PI * 2, 18, '#5e140e', 90, 2.6, Math.PI);
        break;
      case 'nahkampf':
        this.#schwuenge.push({ x: e.x, y: e.y, winkel: e.winkel, alter: 0, dauer: SCHWUNG_DAUER });
        break;
      case 'spucke':
        this.#spucken.push({ x: e.x, y: e.y, zx: e.zx, zy: e.zy, alter: 0, dauer: e.dauer ?? 0.75 });
        break;
      case 'spuckeTrifft':
        this.#spritzer(e.x, e.y, Math.random() * Math.PI * 2, 16, '#8fd13a', 80, 2.4, Math.PI);
        this.#fleck(e.x, e.y, 'blutfleck', 30, '#7fc23a');
        break;
      case 'zuendung':
        this.#spritzer(e.x, e.y, -Math.PI / 2, 8, '#ffd27a', 60, 1.6, Math.PI);
        break;
      case 'explosion': {
        const r = e.radius ?? 90;
        this.#explosionen.push({ x: e.x, y: e.y, radius: r, alter: 0, dauer: 0.9 });
        this.#feuer.push({ x: e.x, y: e.y, winkel: 0, alter: 0, dauer: 0.45, staerke: 16000, hoehe: 40 });
        this.#spritzer(e.x, e.y, 0, 40, '#ff9a3a', r * 3, 3.2, Math.PI);
        this.#spritzer(e.x, e.y, 0, 24, '#3a3330', r * 1.6, 3.8, Math.PI);
        this.#fleck(e.x, e.y, 'blutlache', r * 1.1, '#1d1a18');
        this.schaden(0); // Kamera-Wackeln kommt vom Renderer (explosionen)
        break;
      }
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

  #fleck(x, y, sprite, groesse, farbe = null) {
    if (this.#flecken.length >= MAX_FLECKEN) this.#flecken.shift();
    this.#flecken.push({ x, y, sprite, farbe, groesse: groesse * (0.8 + Math.random() * 0.4), winkel: Math.random() * Math.PI * 2, alter: 0, dauer: FLECK_LEBENSDAUER });
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

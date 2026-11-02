/**
 * Grusel-Direktor (Phase 4.15) – reine Client-Atmosphäre, keine Spiellogik:
 *   • Herzschlag (Sound 'herzschlag') + roter Puls am Bildrand (#grusel-puls), wenn nachts ein Zombie nah ist oder das Leben knapp wird –
 *     je näher/knapper, desto schneller.
 *   • Nachts alle 40–100 s ein Geräusch aus dem Dunkeln (grusel_schrei/-fluestern/-klopfen/-heulen) 350–650 px entfernt,
 *     aber nur, wenn gerade kein Zombie in der Nähe ist (Spannung statt Lärm). Blutmond: doppelt so oft.
 *   • Taschenlampe flackert kurz (renderer.lampeFlackern 0..1), wenn nachts ein Zombie sehr nah ist – und manchmal einfach so.
 * frame(dt, { x, y, nacht, nachtArt, leben, maxLeben, tot, zombies: [{x,y}] }) – dt in s. Zufall injizierbar (Tests).
 */
export const GRUSEL = Object.freeze({
  nahRadius: 230, // px: Zombie so nah → Herzschlag
  sehrNah: 110, // px: Lampe flackert
  ruheRadius: 420, // px: kein Zombie so nah → Geräusch aus dem Dunkeln erlaubt
  pauseMin: 40,
  pauseMax: 100,
  lebenKnapp: 0.3,
  geraeusche: ['grusel_schrei', 'grusel_fluestern', 'grusel_klopfen', 'grusel_heulen'],
});

export class GruselDirektor {
  constructor({ sound = null, renderer = null, puls = null, zufall = Math.random } = {}) {
    this.sound = sound;
    this.renderer = renderer;
    this.puls = puls; // DOM-Element (Klasse 'an', CSS-Variable --tempo)
    this.zufall = zufall;
    this.bisGeraeusch = this.#pause();
    this.bisHerz = 0;
    this.flackern = 0; // Restdauer s
  }

  #pause(faktor = 1) {
    return (GRUSEL.pauseMin + this.zufall() * (GRUSEL.pauseMax - GRUSEL.pauseMin)) * faktor;
  }

  /** @returns { herz: 0..1 (Intensität), flackert: bool, geraeusch: name|null } – für Tests */
  frame(dt, z) {
    const ergebnis = { herz: 0, flackert: false, geraeusch: null };
    if (!z || z.tot) {
      this.#setzePuls(0);
      this.#setzeLampe(1);
      return ergebnis;
    }
    let naechster = Infinity;
    for (const e of z.zombies ?? []) naechster = Math.min(naechster, Math.hypot(e.x - z.x, e.y - z.y));
    const nah = z.nacht && naechster < GRUSEL.nahRadius ? 1 - naechster / GRUSEL.nahRadius : 0;
    const anteil = z.maxLeben > 0 ? z.leben / z.maxLeben : 1;
    const knapp = anteil < GRUSEL.lebenKnapp ? 1 - anteil / GRUSEL.lebenKnapp : 0;
    const herz = Math.min(1, Math.max(nah, knapp));
    ergebnis.herz = herz;
    // Herzschlag: 1,1 s Abstand (ruhig) … 0,45 s (Panik)
    this.bisHerz -= dt;
    if (herz > 0.05 && this.bisHerz <= 0) {
      this.sound?.spiele('herzschlag', { lautstaerke: 0.35 + herz * 0.65 });
      this.bisHerz = 1.1 - herz * 0.65;
    }
    this.#setzePuls(herz);
    // Flackern
    if (this.flackern > 0) this.flackern -= dt;
    else if (z.nacht && naechster < GRUSEL.sehrNah && this.zufall() < dt * 1.5) this.flackern = 0.25 + this.zufall() * 0.35;
    // Geräusche aus dem Dunkeln
    const blutmond = z.nachtArt === 'blutmond';
    if (z.nacht) {
      this.bisGeraeusch -= dt * (blutmond ? 2 : 1);
      if (this.bisGeraeusch <= 0) {
        if (naechster > GRUSEL.ruheRadius) {
          const name = GRUSEL.geraeusche[Math.floor(this.zufall() * GRUSEL.geraeusche.length)];
          const w = this.zufall() * Math.PI * 2;
          const r = 350 + this.zufall() * 300;
          this.sound?.spiele(name, { x: z.x + Math.cos(w) * r, y: z.y + Math.sin(w) * r, lautstaerke: 0.8 });
          ergebnis.geraeusch = name;
          if (this.zufall() < 0.25) this.flackern = 0.4; // … und die Lampe zuckt mit
        }
        this.bisGeraeusch = this.#pause();
      }
    } else if (this.bisGeraeusch < GRUSEL.pauseMin * 0.5) this.bisGeraeusch = this.#pause(0.5); // tagsüber nachladen: erste Nacht nicht sofort
    ergebnis.flackert = this.flackern > 0;
    this.#setzeLampe(ergebnis.flackert ? (Math.sin(performance.now() * 0.09) > 0.2 ? 0.15 : 0.85) : 1);
    return ergebnis;
  }

  #setzePuls(herz) {
    if (!this.puls) return;
    this.puls.classList.toggle('an', herz > 0.05);
    this.puls.style.setProperty('--staerke', herz.toFixed(2));
    this.puls.style.setProperty('--tempo', `${(1.1 - herz * 0.65).toFixed(2)}s`);
  }

  #setzeLampe(f) {
    if (this.renderer) this.renderer.lampeFlackern = f;
  }

  stoppe() {
    this.#setzePuls(0);
    this.#setzeLampe(1);
  }
}

/**
 * Client-Spielschleife (Game Loop) auf Basis von requestAnimationFrame.
 *
 *   festerTakt()      läuft exakt TICK_RATE-mal pro Sekunde (Eingabe senden + Vorhersage)
 *   zeichne(alpha)    läuft so oft der Monitor kann (60/120/144 Hz)
 *                     alpha = 0..1, wie weit wir zwischen zwei festen Takten sind → weiche Darstellung
 */
const MAX_FRAME_MS = 250; // nach Tab-Wechsel nicht hunderte Ticks nachholen

export class SpielSchleife {
  #fpsZaehler = { frames: 0, seit: 0 };

  constructor({ tickDauerMs, festerTakt, zeichne }) {
    this.tickDauerMs = tickDauerMs;
    this.festerTakt = festerTakt;
    this.zeichne = zeichne;
    this.rafId = null;
    this.akkumulator = 0;
    this.letzteZeit = 0;
    this.fps = 0;
  }

  starten() {
    this.letzteZeit = performance.now();
    this.#fpsZaehler = { frames: 0, seit: this.letzteZeit };
    this.rafId = requestAnimationFrame((t) => this.#frame(t));
  }

  stoppen() {
    cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }

  #frame(jetzt) {
    const roh = jetzt - this.letzteZeit;
    const delta = Math.min(roh, MAX_FRAME_MS);
    // Tab war im Hintergrund / langer Hänger: Messfenster neu starten, sonst zeigt die Anzeige Unsinn
    if (roh > MAX_FRAME_MS) this.#fpsZaehler = { frames: 0, seit: jetzt };
    this.letzteZeit = jetzt;
    this.akkumulator += delta;
    while (this.akkumulator >= this.tickDauerMs) {
      this.festerTakt();
      this.akkumulator -= this.tickDauerMs;
    }
    this.zeichne(this.akkumulator / this.tickDauerMs, jetzt);

    this.#fpsZaehler.frames++;
    if (jetzt - this.#fpsZaehler.seit >= 1000) {
      this.fps = Math.round((this.#fpsZaehler.frames * 1000) / (jetzt - this.#fpsZaehler.seit));
      this.#fpsZaehler = { frames: 0, seit: jetzt };
    }
    if (this.rafId !== null) this.rafId = requestAnimationFrame((t) => this.#frame(t));
  }
}

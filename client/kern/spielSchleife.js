/**
 * Client-Spielschleife (Game Loop) auf Basis von requestAnimationFrame.
 *
 *   festerTakt()      läuft exakt TICK_RATE-mal pro Sekunde (Eingabe senden + Vorhersage)
 *   zeichne(alpha)    läuft so oft der Monitor kann (60/120/144 Hz), höchstens grenze() Bilder pro Sekunde
 *                     alpha = 0..1, wie weit wir zwischen zwei festen Takten sind → weiche Darstellung
 *   grenze()          Runde 46: optional, je Bild abgefragt (0 = unbegrenzt) – Einstellung „Bildrate“, Akku sparen, offene Fenster
 *                     (client/darstellung/grafikEinstellungen.js bildrateGrenze). Ohne grenze gilt MAX_FPS.
 */
const MAX_FRAME_MS = 250; // nach Tab-Wechsel nicht hunderte Ticks nachholen

/** Max. Zeichen-Bildrate ohne grenze() (0 = unbegrenzt). Standard 60; localStorage.bs_maxfps (setzt jetzt die Einstellung „Bildrate“). */
const MAX_FPS = (() => {
  try {
    const wert = Number(globalThis.localStorage?.getItem('bs_maxfps'));
    if (Number.isFinite(wert) && wert >= 0 && globalThis.localStorage.getItem('bs_maxfps') !== null) return wert === 0 ? 0 : Math.max(20, wert);
  } catch { /* localStorage gesperrt */ }
  return 60;
})();

export class SpielSchleife {
  #fpsZaehler = { frames: 0, seit: 0 };
  #naechsteZeichnung = 0;

  constructor({ tickDauerMs, festerTakt, zeichne, grenze = null }) {
    this.tickDauerMs = tickDauerMs;
    this.festerTakt = festerTakt;
    this.zeichne = zeichne;
    this.grenze = grenze;
    /** Grenze des letzten Bildes (Debug/HUD) */
    this.maxFps = MAX_FPS;
    this.rafId = null;
    this.akkumulator = 0;
    this.letzteZeit = 0;
    this.fps = 0;
    /** Editor-Debug-Testlauf (8.1): keine festen Takte (Eingabe/Vorhersage), Zeichnen läuft weiter */
    this.pausiert = false;
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
    if (this.pausiert) this.akkumulator = 0;
    while (this.akkumulator >= this.tickDauerMs) {
      this.festerTakt();
      this.akkumulator -= this.tickDauerMs;
    }
    // FPS-Limit: auf 120/144-Hz-Monitoren sonst Volllast der GPU (Stromverbrauch!). Tick-Logik oben läuft unabhängig.
    let max = MAX_FPS;
    if (this.grenze) {
      const g = Number(this.grenze());
      if (Number.isFinite(g) && g >= 0) max = g === 0 ? 0 : Math.max(10, g);
    }
    this.maxFps = max;
    const intervall = max > 0 ? 1000 / max : 0;
    if (max <= 0 || jetzt >= this.#naechsteZeichnung - 1.5) {
      this.#naechsteZeichnung = Math.max(this.#naechsteZeichnung + intervall, jetzt - intervall);
      this.zeichne(this.akkumulator / this.tickDauerMs, jetzt);

      this.#fpsZaehler.frames++;
      if (jetzt - this.#fpsZaehler.seit >= 1000) {
        this.fps = Math.round((this.#fpsZaehler.frames * 1000) / (jetzt - this.#fpsZaehler.seit));
        this.#fpsZaehler = { frames: 0, seit: jetzt };
      }
    }
    if (this.rafId !== null) this.rafId = requestAnimationFrame((t) => this.#frame(t));
  }
}

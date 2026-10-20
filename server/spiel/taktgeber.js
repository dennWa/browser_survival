/**
 * Fester Simulationstakt (Fixed Timestep). Läuft in Node und im Browser (nur setTimeout + performance.now).
 * Holt verpasste Ticks nach (max. MAX_NACHHOLEN am Stück), damit die Simulation nicht driftet,
 * springt aber bei langen Pausen (z. B. Browser-Tab im Hintergrund) einfach weiter.
 */
const MAX_NACHHOLEN = 5;

export class Taktgeber {
  constructor(tickDauerMs, beiTick) {
    this.tickDauerMs = tickDauerMs;
    this.beiTick = beiTick;
    this.timer = null;
    this.naechsterTick = 0;
  }

  get laeuft() {
    return this.timer !== null;
  }

  starten() {
    if (this.laeuft) return;
    this.naechsterTick = performance.now();
    this.#planen();
  }

  stoppen() {
    clearTimeout(this.timer);
    this.timer = null;
  }

  /** Tick-Abstand ändern (Editor-Debug-Testlauf: Zeitlupe) – läuft ohne Nachholen ab jetzt im neuen Takt weiter */
  setzeTickDauer(ms) {
    this.tickDauerMs = ms;
    this.naechsterTick = performance.now() + ms;
  }

  #planen() {
    const jetzt = performance.now();
    let nachgeholt = 0;
    while (jetzt >= this.naechsterTick && nachgeholt < MAX_NACHHOLEN) {
      this.beiTick();
      this.naechsterTick += this.tickDauerMs;
      nachgeholt++;
    }
    if (jetzt - this.naechsterTick > this.tickDauerMs * MAX_NACHHOLEN) this.naechsterTick = jetzt;
    const warten = Math.max(0, this.naechsterTick - performance.now());
    this.timer = setTimeout(() => this.#planen(), warten);
  }
}

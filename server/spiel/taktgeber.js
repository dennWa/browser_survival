/**
 * Fester Simulationstakt (Fixed Timestep). Läuft in Node und im Browser (nur setTimeout + performance.now).
 * Holt verpasste Ticks nach (max. MAX_NACHHOLEN am Stück), damit die Simulation nicht driftet,
 * springt aber bei langen Pausen (z. B. Browser-Tab im Hintergrund) einfach weiter.
 * Runde 47: `planer` { setTimeout, clearTimeout } austauschbar – der Browser-Host (client/netzwerk/workerTakt.js) nimmt einen
 * Web-Worker-Takt, weil Timer im Hintergrund-Tab sonst auf ~1/s gedrosselt werden (Freunde hätten dann Standbild).
 */
const MAX_NACHHOLEN = 5;

export class Taktgeber {
  constructor(tickDauerMs, beiTick, planer = null) {
    this.tickDauerMs = tickDauerMs;
    this.beiTick = beiTick;
    this.planer = planer ?? { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (id) => clearTimeout(id) };
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
    this.planer.clearTimeout(this.timer);
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
    this.timer = this.planer.setTimeout(() => this.#planen(), warten);
  }
}

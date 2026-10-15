/**
 * HUD (Head-Up-Display): Statusleiste und Debug-Overlay (F3) über dem Spiel.
 * Wird höchstens ~4× pro Sekunde aktualisiert, um das DOM nicht zu stressen.
 */
const AKTUALISIERUNG_MS = 250;

export class Hud {
  constructor(dokument, { debug = false } = {}) {
    this.el = {
      hud: dokument.getElementById('hud'),
      status: dokument.getElementById('hud-status'),
      leben: dokument.getElementById('hud-leben'),
      debug: dokument.getElementById('hud-debug'),
      hilfe: dokument.getElementById('hud-hilfe'),
      abmelden: dokument.getElementById('hud-abmelden'),
      vollbild: dokument.getElementById('hud-vollbild'),
    };
    this.el.vollbild.addEventListener('click', () => {
      if (dokument.fullscreenElement) dokument.exitFullscreen?.();
      else dokument.documentElement.requestFullscreen?.().catch(() => {});
    });
    this.debug = debug;
    this.letzteAktualisierung = 0;
  }

  beiAbmelden(fn) {
    this.el.abmelden.addEventListener('click', fn);
  }

  /** @param istTouch true → Touch-Hinweise und Vollbild-Knopf */
  anzeigen(istTouch = false) {
    this.el.hud.hidden = false;
    this.el.debug.hidden = !this.debug;
    this.el.vollbild.hidden = !istTouch || !document.fullscreenEnabled;
    this.el.hilfe.textContent = istTouch
      ? 'Linker Daumen: laufen · Rechter Daumen: zielen'
      : 'WASD bewegen · Maus zielen · F3 Debug';
  }

  verbergen() {
    this.el.hud.hidden = true;
  }

  debugUmschalten() {
    this.debug = !this.debug;
    this.el.debug.hidden = !this.debug;
  }

  aktualisiere(d) {
    const jetzt = performance.now();
    if (jetzt - this.letzteAktualisierung < AKTUALISIERUNG_MS) return;
    this.letzteAktualisierung = jetzt;

    this.el.status.textContent = `${d.serverName} · ${d.spielerOnline} online · Ping ${d.ping ?? '–'} ms`;
    const s = d.spieler;
    this.el.leben.textContent = s.maxLeben ? `❤ ${Math.ceil(s.leben)} / ${s.maxLeben}` : '';

    if (this.debug) {
      this.el.debug.textContent = [
        `FPS ${d.fps}   Tick ${d.tick}`,
        `Verbindung: ${d.verbindung}`,
        `Position: ${Math.round(s.x)} | ${Math.round(s.y)}`,
        `Unbestätigte Eingaben: ${d.offeneEingaben}`,
        `Zombies: ${d.zombies}   Gegenstände: ${d.gegenstaende}`,
      ].join('\n');
    }
  }
}

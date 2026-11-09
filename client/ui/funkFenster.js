/**
 * Runde 47: Funkgerät-Fenster (Taste „funkgeraet“ = Ü, ☰/obere Leiste 📻, Inventar → Rechtsklick „Einstellen“).
 * Ein/Aus und Frequenz (87,5–108,0 MHz in 0,1er-Schritten; ◀◀/▶▶ = ±1 MHz). Zeigt, wie viele andere Funkgeräte
 * auf der Frequenz sind und wer gerade spricht. Die Lage kommt vom Server (NACHRICHT.FUNK → setzeLage).
 * Aktionen gehen über `beiAktion(was, wert)` → clientSpiel.funk() → AKTION 'funk'.
 */
const MIN = 875;
const MAX = 1080;

export class FunkFenster {
  #lage = { an: false, bereit: false, geraet: false, frequenz: 1000, partner: [] };
  #wunsch = null; // zuletzt eingestellte Frequenz (bis der Server sie bestätigt)
  /** (was, wert) → an den Server */
  beiAktion = null;

  constructor(dokument) {
    this.d = dokument;
    this.el = dokument.getElementById('funk');
    this.frequenzEl = dokument.getElementById('funk-frequenz');
    this.anKnopf = dokument.getElementById('funk-an');
    this.info = dokument.getElementById('funk-info');
    this.geraetEl = dokument.getElementById('funk-geraet');
    this.keinEl = dokument.getElementById('funk-kein');
    dokument.getElementById('funk-schliessen').addEventListener('click', () => this.zeige(false));
    this.anKnopf.addEventListener('click', () => this.beiAktion?.(this.#lage.an ? 'aus' : 'an'));
    for (const b of this.el.querySelectorAll('[data-funk-schritt]')) {
      b.addEventListener('click', () => {
        const basis = this.#wunsch ?? this.#lage.frequenz;
        const neu = Math.max(MIN, Math.min(MAX, basis + Number(b.dataset.funkSchritt)));
        this.#wunsch = neu;
        this.beiAktion?.('frequenz', neu);
        this.#zeichne();
      });
    }
  }

  get offen() {
    return !this.el.hidden;
  }

  zeige(an = true) {
    this.el.hidden = !an;
    if (an) this.#zeichne();
  }

  umschalten() {
    this.zeige(this.el.hidden);
  }

  setzeLage(lage) {
    this.#lage = { ...this.#lage, ...lage };
    if (this.#wunsch === this.#lage.frequenz) this.#wunsch = null;
    if (this.offen) this.#zeichne();
  }

  #zeichne() {
    const l = this.#lage;
    this.geraetEl.hidden = !l.geraet;
    this.keinEl.hidden = l.geraet;
    const f = this.#wunsch ?? l.frequenz;
    this.frequenzEl.textContent = (f / 10).toFixed(1).replace('.', ',');
    this.el.classList.toggle('an', !!l.an);
    this.anKnopf.textContent = l.an ? '⏻ Ausschalten' : '⏻ Einschalten';
    this.anKnopf.classList.toggle('aktiv', !!l.an);
    if (!l.an) this.info.textContent = 'Aus – du hörst niemanden über Funk.';
    else if (!l.partner.length) this.info.textContent = 'Rauschen … noch niemand sonst auf dieser Frequenz.';
    else {
      const sprecher = l.partner.filter((p) => p.funkt).map((p) => p.name);
      this.info.textContent = `${l.partner.length} weitere${l.partner.length === 1 ? 's' : ''} Funkgerät${l.partner.length === 1 ? '' : 'e'} auf dieser Frequenz${sprecher.length ? ` – spricht gerade: ${sprecher.join(', ')}` : ''}.`;
    }
  }
}

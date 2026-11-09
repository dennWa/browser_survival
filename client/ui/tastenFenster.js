import { BELEGBAR, TASTEN, beiAenderung, setzeTaste, setzeZurueck, tasteVon, tastenName } from '../kern/tastenBelegung.js';

/**
 * Runde 47: ⚙ Einstellungen → „⌨ Tastenbelegung“ (aufklappbar). Je Aktion zwei Plätze; Klick auf einen Platz →
 * nächste Taste (oder Maus Mitte / Seitentaste) wird übernommen, Esc bricht ab, Entf/⌫ leert den Platz.
 * Eine Taste, die schon woanders liegt, wandert hierher (Meldung sagt, wo sie fehlt).
 * Außerdem: jedes Element mit `data-taste="<aktion>"` im Dokument zeigt immer die aktuelle Taste (Hinweistexte).
 */
export class TastenFenster {
  #warte = null; // { aktion, platz }
  #meldung = '';

  constructor(dokument) {
    this.d = dokument;
    this.el = dokument.getElementById('einst-tasten');
    this.knopf = dokument.getElementById('einst-tasten-knopf');
    this.knopf?.addEventListener('click', () => {
      this.el.hidden = !this.el.hidden;
      this.knopf.setAttribute('aria-expanded', String(!this.el.hidden));
      this.#warte = null;
      this.#meldung = '';
      if (!this.el.hidden) this.#baue();
    });
    beiAenderung(() => {
      this.aktualisiereHinweise();
      if (this.el && !this.el.hidden) this.#baue();
    });
    // Capture-Phase: läuft VOR der Spiel-Eingabe → die gedrückte Taste löst beim Belegen nichts im Spiel aus
    const fenster = dokument.defaultView ?? globalThis;
    fenster.addEventListener('keydown', (e) => this.#taste(e), true);
    fenster.addEventListener('pointerdown', (e) => this.#maus(e), true);
    this.aktualisiereHinweise();
  }

  /** Wartet das Fenster gerade auf eine Taste? (Esc soll dann nicht das Menü schließen) */
  get wartet() {
    return this.#warte !== null;
  }

  /** Alle `[data-taste]`-Elemente auf die aktuelle Belegung bringen. */
  aktualisiereHinweise(wurzel = this.d) {
    for (const el of wurzel.querySelectorAll?.('[data-taste]') ?? []) el.textContent = tasteVon(el.dataset.taste);
  }

  #taste(e) {
    if (!this.#warte) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.repeat) return;
    const { aktion, platz } = this.#warte;
    this.#warte = null;
    if (e.code === 'Escape') {
      this.#meldung = '';
    } else if (e.code === 'Backspace' || e.code === 'Delete') {
      setzeTaste(aktion, platz, null);
      this.#meldung = `„${namen(aktion)}“: Platz ${platz + 1} ist jetzt leer.`;
    } else this.#uebernimm(aktion, platz, e.code);
    this.#baue();
  }

  #maus(e) {
    if (!this.#warte) return;
    if ([1, 3, 4].includes(e.button)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      const { aktion, platz } = this.#warte;
      this.#warte = null;
      this.#uebernimm(aktion, platz, `Maus${e.button}`);
      this.#baue();
    } else if (!e.target?.closest?.('.tasten-platz')) {
      this.#warte = null; // daneben geklickt → abbrechen
      this.#baue();
    }
  }

  #uebernimm(aktion, platz, code) {
    const r = setzeTaste(aktion, platz, code);
    if (!r.ok) this.#meldung = `⚠ ${r.fehler}`;
    else if (r.verdraengt) this.#meldung = `${tastenName(code)} lag vorher auf „${namen(r.verdraengt)}“ – dort ist sie jetzt frei.`;
    else this.#meldung = `„${namen(aktion)}“ = ${tastenName(code)}`;
  }

  #baue() {
    if (!this.el) return;
    const teile = [];
    for (const { gruppe, aktionen } of BELEGBAR) {
      const zeilen = [Object.assign(this.d.createElement('p'), { className: 'tasten-gruppe', textContent: gruppe })];
      for (const [aktion, name] of aktionen) {
        const zeile = this.d.createElement('div');
        zeile.className = 'tasten-zeile';
        zeile.append(Object.assign(this.d.createElement('span'), { textContent: name }));
        for (const platz of [0, 1]) {
          const wartet = this.#warte?.aktion === aktion && this.#warte.platz === platz;
          const code = TASTEN[aktion]?.[platz];
          const b = Object.assign(this.d.createElement('button'), {
            type: 'button',
            className: `einst-wahl-knopf tasten-platz${wartet ? ' aktiv' : ''}${code ? '' : ' leer'}`,
            textContent: wartet ? 'Taste …' : code ? tastenName(code) : '–',
            title: wartet ? 'Taste drücken (Esc = abbrechen, Entf = leeren)' : 'Klicken und neue Taste drücken',
          });
          b.addEventListener('click', () => {
            this.#warte = wartet ? null : { aktion, platz };
            this.#meldung = wartet ? '' : `Neue Taste für „${name}“ drücken – Esc bricht ab, Entf leert.`;
            this.#baue();
          });
          zeile.append(b);
        }
        zeilen.push(zeile);
      }
      teile.push(...zeilen);
    }
    const fuss = this.d.createElement('div');
    fuss.className = 'einst-reihe tasten-fuss';
    const zurueck = Object.assign(this.d.createElement('button'), { type: 'button', className: 'einst-knopf', textContent: '↺ Alle zurücksetzen' });
    zurueck.addEventListener('click', () => {
      setzeZurueck();
      this.#warte = null;
      this.#meldung = 'Werkseinstellung wiederhergestellt.';
      this.#baue();
    });
    fuss.append(zurueck);
    const hinweis = Object.assign(this.d.createElement('p'), { className: 'werkbank-hinweis tasten-meldung', textContent: this.#meldung || 'Esc, F3, 1–0, Strg und Alt sind fest vergeben. Maus Mitte und die Seitentasten gehen auch.' });
    this.el.replaceChildren(...teile, fuss, hinweis);
  }
}

function namen(aktion) {
  for (const g of BELEGBAR) for (const [a, name] of g.aktionen) if (a === aktion) return name;
  return aktion;
}

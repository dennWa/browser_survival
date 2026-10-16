/**
 * Developer-Fenster (nur Admins): Spielwerte ingame ändern – Schaden, Leben, Tempo, Tageslänge …
 * Welche Werte es gibt, steht in server/spiel/konfiguration/entwicklerFelder.js.
 *
 * "Übernehmen" schickt die geänderten Felder an den Server; der wendet sie sofort an und speichert sie
 * dauerhaft (Node-Server: server/daten/einstellungen.json, Lokal-Modus: im Browser).
 * Export/Import: Einstellungen als JSON-Datei sichern bzw. laden (gleiches Format wie einstellungen.json).
 */
export class EntwicklerFenster {
  #felder = [];
  #ueberschreibungen = {};
  #gruppe = null;
  #aktionen = {};

  constructor(dokument) {
    this.dokument = dokument;
    const el = (id) => dokument.getElementById(id);
    this.el = el('entwickler');
    this.reiter = el('entwickler-reiter');
    this.liste = el('entwickler-liste');
    this.status = el('entwickler-status');
    this.datei = el('entwickler-datei');
    el('entwickler-schliessen').addEventListener('click', () => this.zeige(false));
    el('entwickler-uebernehmen').addEventListener('click', () => this.#uebernehmen());
    el('entwickler-zuruecksetzen').addEventListener('click', () => {
      if (confirm('Alle Developer-Werte auf Standard zurücksetzen?')) this.#aktionen.zuruecksetzen?.();
    });
    el('entwickler-export').addEventListener('click', () => this.#exportieren());
    el('entwickler-import').addEventListener('click', () => this.datei.click());
    this.datei.addEventListener('change', () => this.#importieren());
  }

  /** @param aktionen { abfragen(), setzen(werte), zuruecksetzen() } */
  beiAktionen(aktionen) {
    this.#aktionen = aktionen;
  }

  get offen() {
    return !this.el.hidden;
  }

  zeige(offen = !this.offen) {
    this.el.hidden = !offen;
    if (offen) {
      this.status.textContent = 'Lade Werte …';
      this.#aktionen.abfragen?.();
    }
  }

  /** Antwort des Servers (DEV_WERTE). */
  setzeWerte(felder, ueberschreibungen) {
    this.#felder = felder;
    this.#ueberschreibungen = ueberschreibungen ?? {};
    this.status.textContent = 'Änderungen wirken sofort und bleiben gespeichert.';
    this.#zeichne();
  }

  #zeichne() {
    const gruppen = [...new Set(this.#felder.map((f) => f.gruppe))];
    if (!gruppen.includes(this.#gruppe)) this.#gruppe = gruppen[0];
    this.reiter.replaceChildren(
      ...gruppen.map((g) => {
        const knopf = this.#element('button', { type: 'button', className: g === this.#gruppe ? 'aktiv' : '', textContent: g });
        knopf.addEventListener('click', () => {
          this.#gruppe = g;
          this.#zeichne();
        });
        return knopf;
      }),
    );
    this.liste.replaceChildren(...this.#felder.filter((f) => f.gruppe === this.#gruppe).map((f) => this.#zeile(f)));
  }

  #zeile(feld) {
    const zeile = this.#element('label', { className: `dev-zeile${feld.wert !== feld.standard ? ' geaendert' : ''}` });
    const name = this.#element('span', { className: 'dev-name', textContent: feld.name });
    const eingabe = this.#element('input', { type: 'number', min: feld.min, max: feld.max, step: feld.schritt, value: feld.wert });
    eingabe.dataset.pfad = feld.pfad;
    eingabe.dataset.alt = feld.wert;
    eingabe.addEventListener('input', () => zeile.classList.toggle('bearbeitet', Number(eingabe.value) !== feld.wert));
    const einheit = this.#element('span', { className: 'dev-einheit', textContent: feld.einheit ?? '' });
    const standard = this.#element('button', { type: 'button', className: 'dev-standard', title: `Standard: ${feld.standard}`, textContent: `↺ ${feld.standard}` });
    standard.addEventListener('click', (e) => {
      e.preventDefault();
      eingabe.value = feld.standard;
      zeile.classList.toggle('bearbeitet', feld.standard !== feld.wert);
    });
    zeile.append(name, eingabe, einheit, standard);
    return zeile;
  }

  #uebernehmen() {
    const werte = {};
    for (const eingabe of this.liste.querySelectorAll('input[data-pfad]')) {
      if (eingabe.value === '' || Number(eingabe.value) === Number(eingabe.dataset.alt)) continue;
      werte[eingabe.dataset.pfad] = Number(eingabe.value);
    }
    if (Object.keys(werte).length === 0) {
      this.status.textContent = 'Nichts geändert.';
      return;
    }
    this.status.textContent = 'Speichere …';
    this.#aktionen.setzen?.(werte);
  }

  #exportieren() {
    const text = JSON.stringify(this.#ueberschreibungen, null, 2);
    const link = this.#element('a', { href: URL.createObjectURL(new Blob([text], { type: 'application/json' })), download: 'einstellungen.json' });
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    this.status.textContent = 'Exportiert. Als server/daten/einstellungen.json gilt sie auch auf dem Node-Server.';
  }

  async #importieren() {
    const datei = this.datei.files?.[0];
    this.datei.value = '';
    if (!datei) return;
    try {
      const daten = JSON.parse(await datei.text());
      const werte = {};
      for (const f of this.#felder) {
        const wert = f.pfad.split('.').reduce((o, t) => o?.[t], daten);
        if (typeof wert === 'number') werte[f.pfad] = wert;
      }
      this.status.textContent = `${Object.keys(werte).length} Werte importiert …`;
      this.#aktionen.setzen?.(werte);
    } catch {
      this.status.textContent = 'Datei ist kein gültiges JSON.';
    }
  }

  #element(tag, eigenschaften) {
    return Object.assign(this.dokument.createElement(tag), eigenschaften);
  }
}

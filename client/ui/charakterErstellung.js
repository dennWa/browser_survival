import { AUSSEHEN, AUSSEHEN_GRUPPEN, CHARAKTERNAME_MUSTER, pruefeAussehen } from '../../gemeinsam/spieler/aussehen.js';

/**
 * Runde 28: Charaktererstellung (Hauptmenü → neuer Spielstand / neuer Multiplayer-Charakter).
 * Links die Merkmale (Geschlecht, Haare + Haarfarbe, Oberteil, Hose, Schuhe – aus gemeinsam/spieler/aussehen.js, nur
 * `aktiv: true`), in der Mitte die 3D-Figur (CharakterVorschau, gleiche Modelle/Kleidungsschichten wie im Spiel, drehbar),
 * unten Name + „Laden“. Für Mann und Frau gibt es dieselben Optionen.
 */
const ERLAUBT = /[^A-Za-z0-9_\-äöüÄÖÜß]/g;

export class CharakterErstellung {
  #auftrag = null; // { beiFertig, beiAbbruch }

  /** @param vorschau CharakterVorschau auf #ce-vorschau */
  constructor(dokument, { vorschau, meldung }) {
    this.d = dokument;
    this.vorschau = vorschau;
    this.meldung = meldung; // (text, fehler) → Meldungszeile des Hauptmenüs
    this.el = {
      optionen: dokument.getElementById('ce-optionen'),
      name: dokument.getElementById('ce-name'),
      laden: dokument.getElementById('ce-laden'),
      zurueck: dokument.getElementById('ce-zurueck'),
      ziel: dokument.getElementById('ce-ziel'),
    };
    this.aussehen = pruefeAussehen(null);
    this.el.name.addEventListener('input', () => {
      const sauber = this.el.name.value.replace(/\s+/g, '_').replace(ERLAUBT, '');
      if (sauber !== this.el.name.value) this.el.name.value = sauber;
      this.el.name.classList.remove('fehler');
    });
    this.el.name.addEventListener('keydown', (e) => e.key === 'Enter' && this.#fertig());
    this.el.laden.addEventListener('click', () => this.#fertig());
    this.el.zurueck.addEventListener('click', () => this.#auftrag?.beiAbbruch?.());
    this.#baueOptionen();
  }

  /** Öffnen: { titel, aussehen?, name?, beiFertig({ aussehen, name }), beiAbbruch() } */
  oeffne({ titel = '', aussehen = null, name = '', beiFertig, beiAbbruch }) {
    this.#auftrag = { beiFertig, beiAbbruch };
    this.aussehen = pruefeAussehen(aussehen);
    this.el.ziel.textContent = titel;
    this.el.name.value = name;
    this.el.name.classList.remove('fehler');
    this.#markiere();
    this.vorschau.setze(this.aussehen, null);
    this.vorschau.start();
  }

  schliessen() {
    this.vorschau.stop();
    this.#auftrag = null;
  }

  #baueOptionen() {
    const d = this.d;
    const kopf = Object.assign(d.createElement('div'), { className: 'ce-optionen-kopf' });
    const zufall = Object.assign(d.createElement('button'), { type: 'button', className: 'hm-link', textContent: 'Zufällig' });
    zufall.addEventListener('click', () => this.#zufall());
    kopf.append(Object.assign(d.createElement('span'), { textContent: 'Aussehen' }), zufall);
    this.el.optionen.append(kopf);
    for (const gruppe of AUSSEHEN_GRUPPEN) {
      const abschnitt = Object.assign(d.createElement('section'), { className: 'ce-gruppe' });
      abschnitt.append(Object.assign(d.createElement('h3'), { textContent: gruppe.titel }));
      for (const merkmal of gruppe.merkmale) {
        const def = AUSSEHEN[merkmal];
        if (!def?.aktiv) continue;
        if (gruppe.merkmale.length > 1) abschnitt.append(Object.assign(d.createElement('h4'), { textContent: def.name }));
        const zeile = Object.assign(d.createElement('div'), { className: `ce-wahl ${merkmal === 'haarfarbe' ? 'ce-farben' : ''}` });
        zeile.dataset.merkmal = merkmal;
        for (const [wert, option] of Object.entries(def.optionen)) {
          const knopf = Object.assign(d.createElement('button'), { type: 'button', title: option.name });
          knopf.dataset.wert = wert;
          if (option.koerper) knopf.dataset.koerper = option.koerper; // Runde 32: Figur nur beim passenden Geschlecht
          if ('farbe' in option) {
            const tupfer = Object.assign(d.createElement('span'), { className: 'ce-tupfer' });
            if (option.farbe) tupfer.style.background = option.farbe;
            else tupfer.classList.add('ce-tupfer-natur');
            knopf.append(tupfer);
          }
          if (merkmal !== 'haarfarbe') knopf.append(Object.assign(d.createElement('span'), { textContent: option.name }));
          knopf.addEventListener('click', () => this.#waehle(merkmal, wert));
          zeile.append(knopf);
        }
        abschnitt.append(zeile);
      }
      this.el.optionen.append(abschnitt);
    }
  }

  #waehle(merkmal, wert) {
    this.aussehen = pruefeAussehen({ ...this.aussehen, [merkmal]: wert });
    this.#markiere();
    this.vorschau.setze(this.aussehen, null);
  }

  #zufall() {
    const neu = {};
    for (const [merkmal, def] of Object.entries(AUSSEHEN)) {
      if (!def.aktiv) continue;
      const werte = Object.entries(def.optionen).filter(([, o]) => !o.koerper || o.koerper === neu.koerper).map(([w]) => w);
      neu[merkmal] = werte[Math.floor(Math.random() * werte.length)];
    }
    this.aussehen = pruefeAussehen(neu);
    this.#markiere();
    this.vorschau.setze(this.aussehen, null);
  }

  #markiere() {
    for (const zeile of this.el.optionen.querySelectorAll('.ce-wahl')) {
      for (const k of zeile.querySelectorAll('button')) {
        k.classList.toggle('aktiv', this.aussehen[zeile.dataset.merkmal] === k.dataset.wert);
        k.hidden = !!k.dataset.koerper && k.dataset.koerper !== this.aussehen.koerper;
      }
    }
  }

  #fertig() {
    const name = this.el.name.value.trim();
    if (!CHARAKTERNAME_MUSTER.test(name)) {
      this.el.name.classList.add('fehler');
      this.el.name.focus();
      this.meldung?.('Bitte einen Namen eingeben: 2–20 Zeichen (Buchstaben, Ziffern, _ und -).', true);
      return;
    }
    this.meldung?.('');
    this.#auftrag?.beiFertig?.({ aussehen: { ...this.aussehen }, name });
  }
}

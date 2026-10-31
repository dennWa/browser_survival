import { FunkStimme } from '../audio/funkstimme.js';

/**
 * Tutorial-Oberfläche (docs/konzepte/TUTORIAL_KONZEPT.md §8): Aufgabenliste, Tipp-Pop-up, Funk-Untertitel + Stimme (audio/funkstimme.js),
 * Ziel-Marker (Ring bzw. Randpfeil), Pause-Dialog (Esc / ⏸) und Ende-Dialog („Story jetzt starten?“).
 * Daten kommen vom Server in spielerDaten.tutorial (server/spiel/systeme/tutorialSystem.js → tutorialFuerClient).
 * Baut ihr DOM selbst (Stil: stil.css, Abschnitt Tutorial).
 */
const FLAGGE = 'browserSurvival.tutorialFertig';

export function tutorialGeschafft() {
  try {
    return localStorage.getItem(FLAGGE) === '1';
  } catch {
    return false;
  }
}

function merkeGeschafft() {
  try {
    localStorage.setItem(FLAGGE, '1');
  } catch {
    // egal
  }
}

export class TutorialAnzeige {
  #daten = null;
  #funkNr = 0;
  #gemeldet = new Set(); // 'schrittId:ui' – schon an den Server gemeldete Fenster
  #tippBis = 0;
  #letzterTipp = null;
  #letzterSchritt = null;
  #ende = false;

  /**
   * @param dokument
   * @param {{ holeAusgang, beiEnde(storyStarten: boolean), kapitelNamen: string[] }} optionen
   */
  constructor(dokument, { holeAusgang, beiEnde }) {
    this.dokument = dokument;
    this.beiEnde = beiEnde;
    this.spiel = null;
    this.stimme = new FunkStimme(holeAusgang);
    const neu = (tag, klasse, eltern = dokument.body) => {
      const e = dokument.createElement(tag);
      e.className = klasse;
      eltern.append(e);
      return e;
    };
    this.el = { wurzel: neu('div', 'tut') };
    this.el.wurzel.hidden = true;
    const w = this.el.wurzel;
    this.el.panel = neu('div', 'tut-panel', w);
    this.el.kopf = neu('div', 'tut-kopf', this.el.panel);
    this.el.titel = neu('span', 'tut-titel', this.el.kopf);
    this.el.pauseKnopf = neu('button', 'tut-pause-knopf', this.el.kopf);
    this.el.pauseKnopf.type = 'button';
    this.el.pauseKnopf.textContent = '⏸';
    this.el.pauseKnopf.title = 'Pause / überspringen (Esc)';
    this.el.pauseKnopf.addEventListener('click', () => this.pause());
    this.el.liste = neu('ul', 'tut-liste', this.el.panel);
    this.el.hinweis = neu('div', 'tut-hinweis', this.el.panel);
    this.el.hinweis.textContent = 'Hängst du fest? Esc → Kapitel überspringen';
    this.el.hinweis.hidden = true;
    this.el.tipp = neu('div', 'tut-tipp', w);
    this.el.tipp.hidden = true;
    this.el.funk = neu('div', 'tut-funk', w);
    this.el.funk.hidden = true;
    this.el.marker = neu('div', 'tut-marker', w);
    this.el.marker.hidden = true;
    this.el.dialog = neu('div', 'tut-dialog overlay', w);
    this.el.dialog.hidden = true;
    this.stimme.beiZeile = (text) => {
      this.el.funk.hidden = !text;
      if (text) this.el.funk.innerHTML = `<span class="tut-funk-name">📻 Jelke</span>${escape(text)}`;
    };
  }

  /** Sitzung beginnt (ClientSpiel) */
  starte(spiel) {
    this.spiel = spiel;
    this.#ende = false;
    this.#funkNr = 0;
    this.#gemeldet.clear();
    this.el.wurzel.hidden = false;
    this.el.dialog.hidden = true;
  }

  /** Sitzung vorbei (Abbruch, Ende, Logout) */
  stoppe() {
    this.spiel = null;
    this.#daten = null;
    this.stimme.stopp();
    this.el.wurzel.hidden = true;
  }

  get aktiv() {
    return !!this.spiel;
  }

  get dialogOffen() {
    return !this.el.dialog.hidden;
  }

  /** spielerDaten.tutorial vom Server */
  daten(d) {
    this.#daten = d;
    const touch = this.spiel?.eingabe.touch.istTouchGeraet;
    this.el.titel.textContent = `Kapitel ${d.kapitel + 1}/${d.kapitelAnzahl} · ${d.titel}`;
    this.el.liste.replaceChildren(
      ...d.aufgaben.map((a) => {
        const li = this.dokument.createElement('li');
        li.className = a.fertig ? 'fertig' : '';
        const taste = touch ? a.taste?.touch : a.taste?.pc;
        li.innerHTML = `<span class="tut-haken">${a.fertig ? '✔' : '○'}</span><span>${escape(a.text)}</span>${taste ? `<kbd>${escape(taste)}</kbd>` : ''}`;
        return li;
      }),
    );
    this.el.hinweis.hidden = !d.hinweis;
    if (d.schritt !== this.#letzterSchritt) {
      this.#letzterSchritt = d.schritt;
      this.el.panel.classList.remove('neu');
      void this.el.panel.offsetWidth;
      this.el.panel.classList.add('neu');
      this.spiel?.sound?.spiele('ui_klick');
    }
    if (d.tipp && d.tipp !== this.#letzterTipp) {
      this.#letzterTipp = d.tipp;
      this.el.tipp.textContent = `💡 ${d.tipp}`;
      this.el.tipp.hidden = false;
      this.#tippBis = performance.now() + 9000;
    }
    for (const f of d.funk) {
      if (f.nr <= this.#funkNr) continue;
      this.#funkNr = f.nr;
      this.stimme.sage(f);
    }
    if (d.fertig && !this.#ende) {
      this.#ende = true;
      merkeGeschafft();
      setTimeout(() => this.#zeigeEnde(), 4500); // Jelkes letzter Satz läuft noch
    }
  }

  /** Jeden Frame (ClientSpiel.#zeichne): Marker, Tipp ausblenden, geöffnete Fenster melden */
  frame(spiel, eigen, jetzt) {
    if (!this.#daten) return;
    if (!this.el.tipp.hidden && jetzt > this.#tippBis) this.el.tipp.hidden = true;
    const offen = { inventar: spiel.hud.inventar.offen, karte: spiel.karte.offen, skills: spiel.hud.skills.offen };
    for (const [ui, ist] of Object.entries(offen)) {
      const schluessel = `${this.#daten.schritt}:${ui}`;
      if (ist && !this.#gemeldet.has(schluessel)) {
        this.#gemeldet.add(schluessel);
        spiel.tutorialAktion('ui', ui);
      }
    }
    this.#marker(spiel, eigen);
  }

  #marker(spiel, eigen) {
    const ziel = this.#daten.ziel;
    const m = this.el.marker;
    if (!ziel || !eigen || this.dialogOffen || Math.hypot(ziel.x - eigen.x, ziel.y - eigen.y) < 40) {
      m.hidden = true;
      return;
    }
    const kamera = spiel.renderer.kamera;
    const p = kamera.weltZuBildschirm(ziel.x, ziel.y, 0);
    const rand = 46;
    const drin = p.x > rand && p.y > rand && p.x < kamera.breite - rand && p.y < kamera.hoehe - rand;
    m.hidden = false;
    m.classList.toggle('pfeil', !drin);
    if (drin) {
      m.style.transform = `translate(${p.x}px, ${p.y}px)`;
      return;
    }
    const mx = kamera.breite / 2;
    const my = kamera.hoehe / 2;
    const w = Math.atan2(p.y - my, p.x - mx);
    const f = Math.min((mx - rand) / Math.abs(Math.cos(w) || 1e-6), (my - rand) / Math.abs(Math.sin(w) || 1e-6));
    m.style.transform = `translate(${mx + Math.cos(w) * f}px, ${my + Math.sin(w) * f}px) rotate(${w}rad)`;
  }

  /** Esc / ⏸: Pause-Dialog mit Weiter · Kapitel überspringen · Kapitel wählen · Beenden */
  pause() {
    if (!this.spiel || this.#ende) return;
    if (this.dialogOffen) return this.#schliesseDialog();
    const kapitel = this.#daten?.kapitel ?? 0;
    this.#dialog(
      'Tutorial pausiert',
      'Das Spiel läuft im Hintergrund weiter.',
      [
        ['▶ Weiter', () => this.#schliesseDialog(), 'haupt'],
        ['⏭ Kapitel überspringen', () => this.#aktion('ueberspringen')],
        ['✕ Tutorial beenden', () => this.#beenden(false), 'gefahr'],
      ],
      this.#kapitelWahl(kapitel),
    );
  }

  #kapitelWahl(aktuell) {
    const namen = this.kapitelNamen ?? [];
    if (!namen.length) return null;
    const zeile = this.dokument.createElement('div');
    zeile.className = 'tut-kapitelwahl';
    zeile.append(Object.assign(this.dokument.createElement('span'), { textContent: 'Kapitel:' }));
    namen.forEach((name, i) => {
      const k = Object.assign(this.dokument.createElement('button'), { type: 'button', textContent: `${i + 1}`, title: name, className: i === aktuell ? 'aktiv' : '' });
      k.addEventListener('click', () => this.#aktion('kapitel', i));
      zeile.append(k);
    });
    return zeile;
  }

  #aktion(befehl, wert) {
    this.stimme.stopp();
    this.#funkNr = Math.max(this.#funkNr, ...(this.#daten?.funk.map((f) => f.nr) ?? [0]));
    this.spiel?.tutorialAktion(befehl, wert);
    this.#schliesseDialog();
  }

  #zeigeEnde() {
    if (!this.spiel) return;
    this.#dialog('Tutorial geschafft! 🎉', 'Du kennst jetzt das Wichtigste. Story jetzt starten?', [
      ['▶ Ja, Story starten', () => this.#beenden(true), 'haupt'],
      ['Zurück zum Hauptmenü', () => this.#beenden(false)],
    ]);
  }

  #beenden(story) {
    this.#schliesseDialog();
    this.stoppe();
    this.beiEnde?.(story);
  }

  #dialog(titel, text, knoepfe, extra = null) {
    const d = this.el.dialog;
    const box = this.dokument.createElement('div');
    box.className = 'tut-box';
    box.append(Object.assign(this.dokument.createElement('h2'), { textContent: titel }), Object.assign(this.dokument.createElement('p'), { textContent: text }));
    if (extra) box.append(extra);
    for (const [beschriftung, fn, art] of knoepfe) {
      const k = Object.assign(this.dokument.createElement('button'), { type: 'button', textContent: beschriftung, className: art ?? '' });
      k.addEventListener('click', fn);
      box.append(k);
    }
    d.replaceChildren(box);
    d.hidden = false;
    this.el.marker.hidden = true;
  }

  #schliesseDialog() {
    this.el.dialog.hidden = true;
  }
}

function escape(text) {
  return String(text).replace(/[&<>"]/g, (z) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[z]);
}

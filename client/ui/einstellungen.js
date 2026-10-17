import { LAUTSTAERKE_KANAELE } from '../audio/sound.js';
import { GRAFIK_PROFILE } from '../darstellung/renderer.js';

/**
 * Einstellungen-Fenster (⚙ in der oberen Leiste): Ton an/aus, drei Lautstärkeregler (Gesamt, Effekte, Wind &
 * Umgebung), Grafikstufe (hoch / mittel / niedrig) sowie – für Handys wichtig – Vollbild und Abmelden.
 * Die Werte merken sich Sound (localStorage `browserSurvival.ton`) und Renderer (`browserSurvival.grafik`) selbst;
 * dieses Fenster zeigt sie nur an. Sound/Renderer kommen per verbinde(), weil der Renderer erst nach dem Laden existiert.
 */
export class EinstellungenFenster {
  #sound = null;
  #renderer = () => null;
  #minikarteWechseln = null;
  #handy = null;

  constructor(dokument) {
    this.dokument = dokument;
    this.el = dokument.getElementById('einstellungen');
    this.reglerEl = dokument.getElementById('einstellungen-regler');
    this.grafikEl = dokument.getElementById('einstellungen-grafik');
    this.grafikInfo = dokument.getElementById('einstellungen-grafik-info');
    dokument.getElementById('einstellungen-schliessen').addEventListener('click', () => this.zeige(false));
    dokument.getElementById('hud-einstellungen').addEventListener('click', () => this.zeige());
    this.minikarteKnopf = dokument.getElementById('einst-minikarte');
    this.minikarteKnopf.addEventListener('click', () => this.#minikarteWechseln?.());
  }

  /** Handy-Abschnitt: Statusbalken (hud.anzeige) und Stick-Steuerung (touch.einstellung) – nur auf Touch-Geräten sichtbar. */
  verbindeHandy({ hud, touch }) {
    this.#handy = { hud, touch };
    const el = this.dokument.getElementById('einst-handy');
    const kompakt = this.dokument.getElementById('einst-kompakt');
    kompakt.addEventListener('click', () => {
      hud.setzeAnzeige({ kompakt: !(hud.anzeige.kompakt ?? hud.istTouch) });
      this.#aktualisiere();
    });
    for (const knopf of el.querySelectorAll('[data-balken]')) {
      knopf.addEventListener('click', () => {
        const name = knopf.dataset.balken;
        hud.setzeAnzeige({ balken: { [name]: hud.anzeige.balken[name] === false } });
        this.#aktualisiere();
      });
    }
    this.dokument.getElementById('einst-stick-fest').addEventListener('click', () => {
      touch.setzeEinstellung({ modus: 'fest' });
      this.#aktualisiere();
    });
    this.dokument.getElementById('einst-stick-frei').addEventListener('click', () => {
      touch.setzeEinstellung({ modus: 'frei' });
      this.#aktualisiere();
    });
    this.dokument.getElementById('einst-stick-rand').addEventListener('input', (e) => touch.setzeEinstellung({ rand: Number(e.target.value) }));
    this.dokument.getElementById('einst-stick-hoehe').addEventListener('input', (e) => touch.setzeEinstellung({ hoehe: Number(e.target.value) }));
  }

  /** @param sound Sound-Objekt · @param renderer Funktion, die den Renderer (oder null) liefert */
  verbinde({ sound, renderer }) {
    this.#sound = sound;
    this.#renderer = renderer;
    this.#baueRegler();
    this.#baueGrafik();
    const sicht = this.dokument.getElementById('einst-sichtkegel');
    sicht.addEventListener('click', () => {
      const kegel = this.#renderer()?.sichtkegel;
      kegel?.setzeAn(!kegel.an);
      this.#aktualisiere();
    });
  }

  /** Minikarte ein-/ausblenden: wechsle() schaltet um (Hud), zeigeMinikarte() aktualisiert die Beschriftung. */
  beiMinikarte(wechsle) {
    this.#minikarteWechseln = wechsle;
  }

  zeigeMinikarte(an) {
    this.minikarteKnopf.textContent = an ? '🧭 Minikarte an' : '🧭 Minikarte aus';
    this.minikarteKnopf.classList.toggle('aus', !an);
  }

  get offen() {
    return !this.el.hidden;
  }

  zeige(offen = !this.offen) {
    this.el.hidden = !offen;
    if (offen) this.#aktualisiere();
  }

  #baueRegler() {
    this.reglerEl.replaceChildren(
      ...Object.entries(LAUTSTAERKE_KANAELE).map(([kanal, name]) => {
        const zeile = Object.assign(this.dokument.createElement('label'), { className: 'einst-regler' });
        const regler = Object.assign(this.dokument.createElement('input'), { type: 'range', min: 0, max: 100, step: 5, value: Math.round(this.#sound.lautstaerken[kanal] * 100) });
        regler.dataset.kanal = kanal;
        regler.addEventListener('input', () => {
          this.#sound.entsperren();
          this.#sound.setzeLautstaerke(kanal, regler.value / 100);
        });
        zeile.append(Object.assign(this.dokument.createElement('span'), { textContent: name }), regler);
        return zeile;
      }),
    );
  }

  #baueGrafik() {
    this.grafikEl.replaceChildren(
      ...Object.entries(GRAFIK_PROFILE).map(([schluessel, profil]) => {
        const knopf = Object.assign(this.dokument.createElement('button'), { type: 'button', className: 'einst-knopf', textContent: profil.name });
        knopf.dataset.grafik = schluessel;
        knopf.addEventListener('click', () => {
          this.#renderer()?.setzeGrafik(schluessel);
          this.#aktualisiere();
        });
        return knopf;
      }),
    );
  }

  #aktualisiere() {
    const aktuell = this.#renderer()?.grafik;
    for (const knopf of this.grafikEl.children) knopf.classList.toggle('aktiv', knopf.dataset.grafik === aktuell);
    const kegel = this.#renderer()?.sichtkegel;
    const sicht = this.dokument.getElementById('einst-sichtkegel');
    sicht.textContent = kegel?.an === false ? '👁 Sichtkegel aus' : '👁 Sichtkegel an';
    sicht.classList.toggle('aktiv', kegel?.an !== false);
    this.grafikInfo.textContent = aktuell ? `${GRAFIK_PROFILE[aktuell].name}: ${GRAFIK_PROFILE[aktuell].beschreibung}` : '';
    if (this.#handy) {
      const { hud, touch } = this.#handy;
      const el = this.dokument.getElementById('einst-handy');
      el.hidden = !hud.istTouch;
      const kompakt = hud.anzeige.kompakt ?? hud.istTouch;
      const k = this.dokument.getElementById('einst-kompakt');
      k.textContent = kompakt ? 'Kompakt (ohne Symbole)' : 'Normal (mit Symbolen)';
      k.classList.toggle('aktiv', kompakt);
      for (const knopf of el.querySelectorAll('[data-balken]')) knopf.classList.toggle('aktiv', hud.anzeige.balken[knopf.dataset.balken] !== false);
      const fest = touch.einstellung.modus === 'fest';
      this.dokument.getElementById('einst-stick-fest').classList.toggle('aktiv', fest);
      this.dokument.getElementById('einst-stick-frei').classList.toggle('aktiv', !fest);
      this.dokument.getElementById('einst-stick-regler').hidden = !fest;
      this.dokument.getElementById('einst-stick-rand').value = touch.einstellung.rand;
      this.dokument.getElementById('einst-stick-hoehe').value = touch.einstellung.hoehe;
    }
    for (const regler of this.reglerEl.querySelectorAll('input')) regler.value = Math.round(this.#sound.lautstaerken[regler.dataset.kanal] * 100);
  }
}

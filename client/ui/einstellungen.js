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

  /** @param sound Sound-Objekt · @param renderer Funktion, die den Renderer (oder null) liefert */
  verbinde({ sound, renderer }) {
    this.#sound = sound;
    this.#renderer = renderer;
    this.#baueRegler();
    this.#baueGrafik();
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
    this.grafikInfo.textContent = aktuell ? `${GRAFIK_PROFILE[aktuell].name}: ${GRAFIK_PROFILE[aktuell].beschreibung}` : '';
    for (const regler of this.reglerEl.querySelectorAll('input')) regler.value = Math.round(this.#sound.lautstaerken[regler.dataset.kanal] * 100);
  }
}

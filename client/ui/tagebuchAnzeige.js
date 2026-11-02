/**
 * Überlebens-Tagebuch im HUD (Phase 4.15): aktuelles Kapitel + Ziele mit Fortschritt (Daten: spielerDaten.ziele aus
 * server/spiel/systeme/zielSystem.js → zieleFuerClient). Taste J / Tipp auf den Kopf klappt auf/zu (localStorage
 * `browserSurvival.tagebuch` = 'zu'|'auf'; auf schmalen Bildschirmen anfangs zu). `geschafft()` lässt das Panel aufleuchten.
 * Baut ihr DOM selbst (Stil: stil.css, Abschnitt Tagebuch); `entfernen()` beim Sitzungsende.
 */
const SCHLUESSEL = 'browserSurvival.tagebuch';

function lies() {
  try {
    return localStorage.getItem(SCHLUESSEL);
  } catch {
    return null;
  }
}

export class TagebuchAnzeige {
  #text = '';

  constructor(dokument) {
    this.dokument = dokument;
    this.el = dokument.createElement('div');
    this.el.className = 'tagebuch';
    this.el.hidden = true;
    this.el.innerHTML = '<button type="button" class="tagebuch-kopf" title="Tagebuch auf/zu (J)"><span class="tagebuch-titel"></span><span class="tagebuch-zahl"></span></button><ul class="tagebuch-liste"></ul>';
    dokument.body.append(this.el);
    const gemerkt = lies();
    this.zu = gemerkt ? gemerkt === 'zu' : (dokument.defaultView?.innerWidth ?? 1200) < 700;
    this.el.classList.toggle('zu', this.zu);
    this.el.querySelector('.tagebuch-kopf').addEventListener('click', () => this.umschalten());
  }

  umschalten() {
    this.zu = !this.zu;
    this.el.classList.toggle('zu', this.zu);
    try {
      localStorage.setItem(SCHLUESSEL, this.zu ? 'zu' : 'auf');
    } catch {
      // egal
    }
  }

  daten(z) {
    if (!z) {
      this.el.hidden = true;
      return;
    }
    const text = JSON.stringify(z);
    if (text === this.#text) return;
    this.#text = text;
    this.el.hidden = false;
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    const fertig = z.ziele.filter((x) => x.fertig).length;
    this.el.querySelector('.tagebuch-titel').innerHTML = `📓 <b>${esc(z.titel)}</b>`;
    this.el.querySelector('.tagebuch-zahl').textContent = z.ziele.length ? `Kap. ${Math.min(z.kapitel + 1, z.kapitelAnzahl)}/${z.kapitelAnzahl} · ${fertig}/${z.ziele.length}` : (z.rang ?? '');
    this.el.querySelector('.tagebuch-liste').innerHTML =
      (z.rang ? `<li class="rang">Rang: ${esc(z.rang)}</li>` : '') +
      z.ziele
        .map((x) => `<li class="${x.fertig ? 'fertig' : ''}"><span class="haken">${x.fertig ? '✔' : '○'}</span><span class="text">${esc(x.text)}</span>${x.ziel > 1 && !x.fertig ? `<span class="stand">${x.stand}/${x.ziel}</span><span class="balken"><i style="width:${Math.round((x.stand / x.ziel) * 100)}%"></i></span>` : ''}</li>`)
        .join('');
  }

  /** Ziel/Kapitel geschafft → kurz aufleuchten (zugeklappt: Kopf pulsiert) */
  geschafft(kapitel = false) {
    this.el.classList.remove('leuchtet', 'kapitel');
    void this.el.offsetWidth; // Animation neu starten
    this.el.classList.add('leuchtet');
    if (kapitel) this.el.classList.add('kapitel');
  }

  entfernen() {
    this.el.remove();
  }
}

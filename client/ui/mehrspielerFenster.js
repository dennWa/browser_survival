/**
 * Runde 24 (P14): Miteinander – Spieler-Menü (E an Mitspieler: Handeln, In Gruppe einladen), Anfrage-Leiste (Annehmen/Ablehnen),
 * Handelsfenster (eigene Items antippen = anbieten, Angebot antippen = zurück, „Bereit“) und Niedergestreckt-Hinweis (Aufgeben).
 * Alles per Tippen bedienbar (Touch). Daten: spielerDaten.anfrage/handel/gruppe/niedergestreckt (server mehrspielerSystem.js).
 * `senden(aktion)` → AKTION { art, was, ziel?, slot?, name? }. DOM wird beim ersten Gebrauch gebaut.
 */
const ICON = 40;

export class MehrspielerFenster {
  #senden;
  #zeichneIcon;
  #menueZiel = null;
  #handelSchluessel = '';

  constructor(dokument, { senden, zeichneIcon }) {
    this.d = dokument;
    this.#senden = senden;
    this.#zeichneIcon = zeichneIcon;
    this.el = Object.assign(dokument.createElement('div'), { className: 'mehrspieler' });
    this.el.innerHTML = `
      <div class="ms-anfrage fenster" hidden><span class="ms-anfrage-text"></span><button type="button" class="ms-ja">✔ Annehmen</button><button type="button" class="ms-nein">✕</button></div>
      <div class="ms-menue fenster" hidden><b class="ms-menue-titel"></b><button type="button" class="ms-handeln">🤝 Handeln</button><button type="button" class="ms-einladen">👥 In Gruppe einladen</button><button type="button" class="ms-zu">Schließen</button></div>
      <div class="ms-nieder fenster" hidden><b>💀 Niedergestreckt</b><span class="ms-nieder-text"></span><button type="button" class="ms-aufgeben">Aufgeben</button></div>
      <div class="ms-handel fenster" hidden>
        <div class="ms-kopf"><b class="ms-handel-titel">🤝 Handel</b><button type="button" class="ms-abbrechen" aria-label="Abbrechen">✕</button></div>
        <div class="ms-spalten"><div><div class="ms-unter">Du gibst</div><div class="ms-raster ms-meins"></div></div><div><div class="ms-unter ms-er">Du bekommst</div><div class="ms-raster ms-seins"></div></div></div>
        <div class="ms-unter">Dein Inventar – antippen zum Anbieten</div><div class="ms-raster ms-inventar"></div>
        <button type="button" class="ms-bereit">Bereit</button>
      </div>`;
    dokument.body.append(this.el);
    const $ = (s) => this.el.querySelector(s);
    this.anfrageEl = $('.ms-anfrage');
    this.menueEl = $('.ms-menue');
    this.niederEl = $('.ms-nieder');
    this.handelEl = $('.ms-handel');
    $('.ms-ja').addEventListener('click', () => this.#antwort('annehmen'));
    $('.ms-nein').addEventListener('click', () => this.#antwort('ablehnen'));
    $('.ms-handeln').addEventListener('click', () => this.#menueAktion('handel', 'anfragen'));
    $('.ms-einladen').addEventListener('click', () => this.#menueAktion('gruppe', 'einladen'));
    $('.ms-zu').addEventListener('click', () => this.zeigeMenue(null));
    $('.ms-aufgeben').addEventListener('click', () => this.#senden({ art: 'aufgeben' }));
    $('.ms-abbrechen').addEventListener('click', () => this.#senden({ art: 'handel', was: 'abbrechen' }));
    $('.ms-bereit').addEventListener('click', () => this.#senden({ art: 'handel', was: 'bereit' }));
    this.anfrageArt = null;
  }

  get offen() {
    return !this.menueEl.hidden || !this.handelEl.hidden;
  }

  /** Spieler-Menü für einen Mitspieler { id, name } (null = zu). */
  zeigeMenue(ziel) {
    this.#menueZiel = ziel;
    this.menueEl.hidden = !ziel;
    if (ziel) this.el.querySelector('.ms-menue-titel').textContent = ziel.name;
  }

  #menueAktion(art, was) {
    if (this.#menueZiel) this.#senden({ art, was, ziel: this.#menueZiel.id });
    this.zeigeMenue(null);
  }

  #antwort(was) {
    if (this.anfrageArt) this.#senden({ art: this.anfrageArt, was });
    this.anfrageEl.hidden = true;
  }

  /** Jede SPIELER_DATEN-Nachricht. */
  aktualisiere(daten, itemDefinitionen) {
    const a = daten.anfrage;
    this.anfrageArt = a?.art ?? null;
    this.anfrageEl.hidden = !a;
    if (a) this.el.querySelector('.ms-anfrage-text').textContent = a.art === 'handel' ? `🤝 ${a.von} möchte handeln` : `👥 ${a.von} lädt dich in die Gruppe ein`;
    this.niederEl.hidden = !daten.niedergestreckt;
    if (daten.niedergestreckt) this.el.querySelector('.ms-nieder-text').textContent = `Ein Mitspieler kann dich mit einem Erste-Hilfe-Kasten retten – noch ${daten.niedergestreckt} s`;
    this.#zeigeHandel(daten, itemDefinitionen);
  }

  #zeigeHandel(daten, defs) {
    const h = daten.handel;
    this.handelEl.hidden = !h;
    if (!h) return (this.#handelSchluessel = '');
    if (!this.menueEl.hidden) this.zeigeMenue(null);
    const schluessel = JSON.stringify([h, daten.inventar]);
    if (schluessel === this.#handelSchluessel) return;
    this.#handelSchluessel = schluessel;
    this.el.querySelector('.ms-handel-titel').textContent = `🤝 Handel mit ${h.partner}`;
    this.el.querySelector('.ms-er').textContent = `Du bekommst${h.erBereit ? ' ✔ bereit' : ''}`;
    const knopf = this.el.querySelector('.ms-bereit');
    knopf.textContent = h.ichBereit ? '✔ Bereit (warte …)' : 'Bereit';
    knopf.classList.toggle('aktiv', h.ichBereit);
    const slot = (e, beiKlick, titel) => {
      const b = Object.assign(this.d.createElement('button'), { type: 'button', className: 'slot inv-slot', title: titel ?? '' });
      if (e) {
        const c = Object.assign(this.d.createElement('canvas'), { width: ICON * 2, height: ICON * 2, className: 'ms-icon' });
        this.#zeichneIcon(c, e.defId);
        b.append(c);
        if (e.menge > 1) b.append(Object.assign(this.d.createElement('span'), { className: 'menge', textContent: e.menge }));
      } else b.classList.add('leer');
      if (beiKlick) b.addEventListener('click', beiKlick);
      return b;
    };
    const name = (e) => (e ? (defs?.[e.defId]?.name ?? e.defId) : '');
    this.el.querySelector('.ms-meins').replaceChildren(...h.meineSlots.map((s) => slot(daten.inventar[s], () => this.#senden({ art: 'handel', was: 'zurueck', slot: s }), name(daten.inventar[s]))));
    this.el.querySelector('.ms-seins').replaceChildren(...h.seins.map((e) => slot(e, null, name(e))));
    this.el.querySelector('.ms-inventar').replaceChildren(
      ...daten.inventar.map((e, s) => (e && !h.meineSlots.includes(s) ? slot(e, () => this.#senden({ art: 'handel', was: 'anbieten', slot: s }), name(e)) : null)).filter(Boolean),
    );
  }
}

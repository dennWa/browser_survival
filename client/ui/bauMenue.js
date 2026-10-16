import { BAUTEILE, KATEGORIEN, blockGroesseFuer, fehlendesMaterial, kostenFuer, kostenText, zaehleItem } from '../../gemeinsam/basisbau/teile.js';

/**
 * Bau-Menü (Basisbau): Leiste über der Schnellleiste mit Reitern (Basis · Struktur · Einrichtung), Karten pro Bauteil
 * (Symbol, Name, Kosten – rot, wenn Material fehlt) und Werkzeugknöpfen (Abreißen, Drehen, Baugebiet zeigen, ✓ Bauen für Touch).
 * Die Karten entstehen aus der Registry gemeinsam/basisbau/teile.js – ein neues Bauteil taucht hier von selbst auf.
 *
 * Reine Anzeige: Entscheidungen trifft kern/bauModus.js, das über beiAktion(art, wert) angesprochen wird:
 *   'waehle' (Bauteil-ID) · 'abriss' · 'drehen' · 'radius' · 'bauen' · 'schliessen' · 'kategorie' (Reiter)
 */
export class BauMenue {
  #wurzel;
  #beiAktion = () => {};
  #signatur = '';
  #kategorie = KATEGORIEN[0];

  constructor(dokument) {
    this.dokument = dokument;
    this.#wurzel = dokument.getElementById('bau-menue');
    const el = (tag, klasse, text = '') => Object.assign(dokument.createElement(tag), { className: klasse, textContent: text });
    this.reiter = el('div', 'bau-reiter');
    this.status = el('span', 'bau-status');
    this.zu = Object.assign(el('button', 'bau-zu', '✕'), { type: 'button', title: 'Bauen beenden (B)' });
    this.zu.addEventListener('click', () => this.#beiAktion('schliessen'));
    this.karten = el('div', 'bau-karten');
    this.werkzeuge = el('div', 'bau-werkzeuge');
    this.knoepfe = {};
    for (const [art, text, titel, extra] of [
      ['abriss', '🔨 Abriss', 'Mit dem Hammer ein eigenes Bauteil abreißen: 75 % der Kosten zurück (X)', ''],
      ['drehen', '↻ Drehen', 'Fenster, Türrahmen und Möbel drehen (R) – ohne Eingabe richtet sich das Teil selbst aus', ''],
      ['radius', '◎ Gebiet', 'Roten Baugebiet-Ring ein-/ausblenden (V) – nur du siehst ihn', ''],
      ['bauen', '✓ Bauen', 'Am Hologramm bauen (Touch: Knopf, PC: Linksklick)', 'nur-touch bau-ok'],
    ]) {
      const knopf = Object.assign(el('button', `bau-knopf ${extra}`.trim(), text), { type: 'button', title: titel });
      knopf.addEventListener('click', () => this.#beiAktion(art));
      this.knoepfe[art] = knopf;
      this.werkzeuge.append(knopf);
    }
    const kopf = el('div', 'bau-kopf');
    kopf.append(this.reiter, this.werkzeuge, this.status, this.zu);
    this.#wurzel.append(kopf, this.karten);
  }

  beiAktion(fn) {
    this.#beiAktion = fn;
  }

  /** Reiter wechseln (z. B. nach dem Setzen der Flagge → Struktur). */
  setzeKategorie(kategorie) {
    if (!KATEGORIEN.includes(kategorie) || kategorie === this.#kategorie) return;
    this.#kategorie = kategorie;
    this.#signatur = '';
  }

  get offen() {
    return !this.#wurzel.hidden;
  }

  zeige(an) {
    this.#wurzel.hidden = !an;
    if (!an) this.#signatur = '';
  }

  /**
   * @param o.auswahl      gewähltes Bauteil ('abriss' = Abrissmodus) oder null
   * @param o.hatFlagge    Baugebiet vorhanden?
   * @param o.inventar     Inventar des Spielers
   * @param o.itemName     (defId) → Anzeigename
   * @param o.radiusAn     roter Ring sichtbar?
   * @param o.statusText   Zeile oben rechts (z. B. "Gebiet: 15 m")
   * @param o.istTouch     Touch-Hinweise
   */
  aktualisiere({ auswahl, hatFlagge, inventar, itemName, radiusAn, statusText, istTouch, blockGroesse = 1 }) {
    const material = {};
    for (const t of Object.values(BAUTEILE)) for (const defId of Object.keys(t.kosten)) material[defId] = zaehleItem(inventar, defId);
    const signatur = JSON.stringify([this.#kategorie, auswahl, hatFlagge, material, radiusAn, statusText, istTouch, blockGroesse]);
    if (signatur === this.#signatur) return;
    this.#signatur = signatur;

    this.status.textContent = statusText;
    this.knoepfe.abriss.classList.toggle('aktiv', auswahl === 'abriss');
    this.knoepfe.abriss.disabled = !hatFlagge;
    this.knoepfe.radius.classList.toggle('aktiv', radiusAn);
    this.knoepfe.radius.disabled = !hatFlagge;
    this.knoepfe.drehen.disabled = !(auswahl && auswahl !== 'abriss' && BAUTEILE[auswahl]?.ausrichtung);
    this.knoepfe.bauen.disabled = !auswahl;
    this.knoepfe.bauen.textContent = auswahl === 'abriss' ? '✓ Abreißen' : '✓ Bauen';
    this.status.title = istTouch
      ? 'Rechter Stick: Ziel wählen · ganz drücken oder ✓ = bauen'
      : 'Linksklick bauen · Rechtsklick Auswahl lösen · R drehen · X abreißen · V Gebiet · B beenden';

    this.reiter.replaceChildren(
      ...KATEGORIEN.map((k) => {
        const knopf = Object.assign(this.dokument.createElement('button'), { type: 'button', className: `bau-tab${k === this.#kategorie ? ' aktiv' : ''}`, textContent: k });
        knopf.addEventListener('click', () => {
          this.#kategorie = k;
          this.#signatur = '';
          this.#beiAktion('kategorie', k);
        });
        return knopf;
      }),
    );

    this.karten.replaceChildren(
      ...Object.entries(BAUTEILE)
        .filter(([, t]) => t.kategorie === this.#kategorie)
        .map(([id, teil0]) => {
          const n = blockGroesseFuer(id, blockGroesse);
          const teil = { ...teil0, kosten: kostenFuer(id, blockGroesse), name: n > 1 ? `${teil0.name} ${n}×${n}` : teil0.name };
          const fehlt = fehlendesMaterial(inventar, teil.kosten);
          const gesperrt = teil.art === 'flagge' ? hatFlagge : !hatFlagge;
          const knopf = this.dokument.createElement('button');
          knopf.type = 'button';
          knopf.className = `bau-karte${auswahl === id ? ' gewaehlt' : ''}${gesperrt ? ' gesperrt' : ''}${fehlt.length ? ' arm' : ''}`;
          knopf.title = `${teil.beschreibung ?? teil.name}\nKosten: ${kostenText(teil.kosten, itemName)}`;
          const symbol = Object.assign(this.dokument.createElement('span'), { className: 'bau-symbol', textContent: teil.symbol });
          const name = Object.assign(this.dokument.createElement('span'), { className: 'bau-name', textContent: teil.art === 'flagge' && hatFlagge ? `${teil.name} ✓` : teil.name });
          const kosten = this.dokument.createElement('span');
          kosten.className = 'bau-kosten';
          const eintraege = Object.entries(teil.kosten);
          if (eintraege.length === 0) kosten.textContent = teil.art === 'flagge' && hatFlagge ? 'gesetzt' : 'kostenlos';
          for (const [defId, menge] of eintraege) {
            const chip = Object.assign(this.dokument.createElement('span'), {
              className: zaehleItem(inventar, defId) >= menge ? 'ok' : 'fehlt',
              textContent: `${menge}× ${itemName(defId)}`,
            });
            kosten.append(chip);
          }
          knopf.append(symbol, name, kosten);
          knopf.addEventListener('click', () => this.#beiAktion('waehle', id));
          return knopf;
        }),
    );
  }
}

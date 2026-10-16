import { INVENTAR_MAX, KISTE_PLAETZE } from '../../gemeinsam/konstanten.js';

/**
 * Lagerkisten-Fenster (E an einer Kiste): oben die 16 Kistenplätze, unten das eigene Inventar.
 * Antippen/Klicken schiebt den ganzen Stapel: Kistenplatz → Inventar bzw. Inventarplatz → Kiste.
 * Der Server prüft alles (kistenSystem.js) und schickt den neuen Inhalt per KISTE-Nachricht zurück.
 */
const ICON = 48;

export class KisteFenster {
  #aktionen = {};
  #inhalt = null;
  #daten = null;
  #itemDefinitionen = {};
  #kisten = [];
  #inventar = [];

  constructor(dokument, { zeichneIcon }) {
    this.dokument = dokument;
    this.zeichneIcon = zeichneIcon;
    this.el = dokument.getElementById('kiste');
    this.rasterKiste = dokument.getElementById('kiste-raster');
    this.rasterInventar = dokument.getElementById('kiste-inventar');
    this.info = dokument.getElementById('kiste-info');
    dokument.getElementById('kiste-schliessen').addEventListener('click', () => this.#aktionen.schliessen?.());
    for (let i = 0; i < KISTE_PLAETZE; i++) this.#kisten.push(this.#baueSlot(this.rasterKiste, i, (slot) => this.#aktionen.nehmen?.(slot)));
    for (let i = 0; i < INVENTAR_MAX; i++) this.#inventar.push(this.#baueSlot(this.rasterInventar, i, (slot) => this.#aktionen.legen?.(slot)));
  }

  /** @param aktionen { legen(slot), nehmen(slot), schliessen() } */
  beiAktionen(aktionen) {
    this.#aktionen = aktionen;
  }

  get offen() {
    return !this.el.hidden;
  }

  /** inhalt = Array(16) → öffnen/aktualisieren, null → schließen */
  zeige(inhalt) {
    this.#inhalt = inhalt;
    this.el.hidden = !inhalt;
    if (inhalt) this.#zeichne();
  }

  setzeDaten(daten, itemDefinitionen) {
    this.#daten = daten;
    this.#itemDefinitionen = itemDefinitionen ?? {};
    if (this.offen) this.#zeichne();
  }

  #baueSlot(raster, index, beiKlick) {
    const d = this.dokument;
    const knopf = Object.assign(d.createElement('button'), { type: 'button', className: 'slot inv-slot' });
    const icon = Object.assign(d.createElement('canvas'), { className: 'slot-icon', width: ICON * 2, height: ICON * 2 });
    const menge = Object.assign(d.createElement('span'), { className: 'slot-menge' });
    knopf.append(icon, menge);
    knopf.addEventListener('click', () => beiKlick(index));
    knopf.addEventListener('pointerenter', () => this.#zeigeInfo(raster === this.rasterKiste ? this.#inhalt?.[index] : this.#daten?.inventar[index]));
    raster.append(knopf);
    return { knopf, icon, menge, defId: undefined };
  }

  #zeigeInfo(eintrag) {
    const def = eintrag && this.#itemDefinitionen[eintrag.defId];
    this.info.textContent = def ? `${def.name}${eintrag.menge > 1 ? ` ×${eintrag.menge}` : ''}${def.beschreibung ? ` – ${def.beschreibung}` : ''}` : '';
  }

  #zeichne() {
    this.#zeichneReihe(this.#kisten, this.#inhalt ?? []);
    const inventar = this.#daten?.inventar ?? [];
    this.#zeichneReihe(this.#inventar, inventar, inventar.length);
  }

  #zeichneReihe(slots, eintraege, anzahl = slots.length) {
    slots.forEach((s, i) => {
      s.knopf.hidden = i >= anzahl;
      if (i >= anzahl) return;
      const e = eintraege[i] ?? null;
      s.knopf.classList.toggle('leer', !e);
      s.knopf.title = e ? (this.#itemDefinitionen[e.defId]?.name ?? e.defId) : '';
      s.menge.textContent = e && e.menge > 1 ? String(e.menge) : e?.magazin !== undefined ? `${e.magazin}` : '';
      const defId = e?.defId ?? null;
      if (s.defId === defId) return;
      s.defId = defId;
      this.zeichneIcon(s.icon, defId);
    });
  }
}

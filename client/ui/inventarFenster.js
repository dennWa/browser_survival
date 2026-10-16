import { HOTBAR_PLAETZE, INVENTAR_PLAETZE } from '../../gemeinsam/konstanten.js';

/**
 * Inventar-Fenster (Taste I bzw. 🎒): Schnellleiste (Plätze 0–7), Tasche (8–15) und – mit Rucksack – 8 weitere.
 *
 * Bedienung (Maus und Touch gleich, über Pointer-Events):
 *   antippen/klicken      → benutzen (essen, ausrüsten …) + Info unten anzeigen
 *   ziehen auf einen Platz → tauschen bzw. gleiche Stapel zusammenlegen (auch auf die Schnellleiste im HUD)
 *   aus dem Fenster ziehen → fallen lassen
 *   Q (Desktop)            → Platz unter der Maus fallen lassen
 * Der Server prüft alles nach (AKTION tauschen/ablegen/benutzen/rucksackAblegen).
 */
const ICON = 48;
const ZIEH_SCHWELLE = 7; // px Bewegung, ab der aus einem Klick ein Ziehen wird

export class InventarFenster {
  #aktionen = {};
  #slots = []; // { knopf, icon, menge, defId }
  #daten = null;
  #itemDefinitionen = {};
  #ziehen = null; // { slot, startX, startY, aktiv, geist, pointerId }
  #ueber = null; // Platz unter der Maus (für Q)

  constructor(dokument, { zeichneIcon }) {
    this.dokument = dokument;
    this.zeichneIcon = zeichneIcon;
    const el = (id) => dokument.getElementById(id);
    this.el = el('inventar');
    this.raster = { schnell: el('inventar-schnell'), tasche: el('inventar-tasche'), rucksack: el('inventar-rucksack') };
    this.rucksackBereich = el('inventar-rucksack-bereich');
    this.keinRucksack = el('inventar-kein-rucksack');
    this.rucksackKnopf = el('inventar-rucksack-ablegen');
    this.info = el('inventar-info');
    this.bauenListe = el('inventar-bauen');
    this.rezepte = {};
    this.bauenStand = '';
    el('inventar-schliessen').addEventListener('click', () => this.zeige(false));
    this.rucksackKnopf.addEventListener('click', () => this.#aktionen.rucksackAblegen?.());
    for (let slot = 0; slot < INVENTAR_PLAETZE + 8; slot++) this.#baueSlot(slot);
    // Ziehen läuft über das ganze Dokument (man darf aus dem Fenster heraus ziehen)
    dokument.addEventListener('pointermove', (e) => this.#bewege(e));
    dokument.addEventListener('pointerup', (e) => this.#loslassen(e));
    dokument.addEventListener('pointercancel', () => this.#abbrechen());
  }

  /** Rezepte vom Server; hier werden nur die mit ort: 'inventar' gezeigt (Werkbank, Lagerfeuer …). */
  setzeRezepte(rezepte) {
    this.rezepte = rezepte ?? {};
    this.bauenStand = '';
  }

  /** @param aktionen { benutzen(slot), tauschen(von, nach), ablegen(slot), rucksackAblegen(), herstellen(rezept) } */
  beiAktionen(aktionen) {
    this.#aktionen = aktionen;
  }

  get offen() {
    return !this.el.hidden;
  }

  /** Platz unter dem Mauszeiger (oder null) – für "Q = fallen lassen". */
  get platzUnterMaus() {
    return this.offen ? this.#ueber : null;
  }

  zeige(offen = !this.offen) {
    this.el.hidden = !offen;
    if (!offen) this.#abbrechen();
    else if (this.#daten) this.#zeichne();
  }

  setzeDaten(daten, itemDefinitionen) {
    this.#daten = daten;
    this.#itemDefinitionen = itemDefinitionen ?? {};
    if (this.offen) this.#zeichne();
  }

  // ---------------------------------------------------------------------------

  #baueSlot(slot) {
    const d = this.dokument;
    const knopf = Object.assign(d.createElement('button'), { type: 'button', className: 'slot inv-slot' });
    knopf.dataset.slot = slot;
    const icon = Object.assign(d.createElement('canvas'), { className: 'slot-icon', width: ICON * 2, height: ICON * 2 });
    const menge = Object.assign(d.createElement('span'), { className: 'slot-menge' });
    knopf.append(icon);
    if (slot < HOTBAR_PLAETZE) knopf.append(Object.assign(d.createElement('span'), { className: 'slot-nummer', textContent: String(slot + 1) }));
    knopf.append(menge);
    const ziel = slot < HOTBAR_PLAETZE ? this.raster.schnell : slot < INVENTAR_PLAETZE ? this.raster.tasche : this.raster.rucksack;
    ziel.append(knopf);
    this.#slots.push({ knopf, icon, menge, defId: undefined });

    knopf.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      if (!this.#daten?.inventar[slot]) return;
      e.preventDefault();
      this.#ziehen = { slot, startX: e.clientX, startY: e.clientY, aktiv: false, geist: null, pointerId: e.pointerId };
    });
    knopf.addEventListener('pointerenter', () => {
      this.#ueber = slot;
      this.#zeigeInfo(slot);
    });
    knopf.addEventListener('pointerleave', () => {
      if (this.#ueber === slot) this.#ueber = null;
    });
    knopf.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (e.pointerType !== 'touch') this.#aktionen.ablegen?.(slot);
    });
  }

  #bewege(e) {
    const z = this.#ziehen;
    if (!z || e.pointerId !== z.pointerId) return;
    if (!z.aktiv) {
      if (Math.hypot(e.clientX - z.startX, e.clientY - z.startY) < ZIEH_SCHWELLE) return;
      z.aktiv = true;
      z.geist = Object.assign(this.dokument.createElement('canvas'), { className: 'inv-geist', width: ICON * 2, height: ICON * 2 });
      this.zeichneIcon(z.geist, this.#daten.inventar[z.slot]?.defId);
      this.dokument.body.append(z.geist);
      this.#slots[z.slot].knopf.classList.add('gezogen');
      this.el.classList.add('zieht');
    }
    z.geist.style.transform = `translate(${e.clientX - 28}px, ${e.clientY - 28}px)`;
    const ziel = this.#zielUnter(e.clientX, e.clientY);
    for (const s of this.dokument.querySelectorAll('.slot.drop-ziel')) s.classList.remove('drop-ziel');
    ziel?.knopf?.classList.add('drop-ziel');
    this.el.classList.toggle('fallen-lassen', ziel?.art === 'boden');
  }

  #loslassen(e) {
    const z = this.#ziehen;
    if (!z || e.pointerId !== z.pointerId) return;
    if (!z.aktiv) {
      // Nur geklickt/angetippt → benutzen
      this.#ziehen = null;
      this.#aktionen.benutzen?.(z.slot);
      this.#zeigeInfo(z.slot);
      return;
    }
    const ziel = this.#zielUnter(e.clientX, e.clientY);
    this.#abbrechen();
    if (ziel?.art === 'slot' && ziel.slot !== z.slot) this.#aktionen.tauschen?.(z.slot, ziel.slot);
    else if (ziel?.art === 'boden') this.#aktionen.ablegen?.(z.slot);
  }

  #abbrechen() {
    const z = this.#ziehen;
    this.#ziehen = null;
    if (!z) return;
    z.geist?.remove();
    this.#slots[z.slot]?.knopf.classList.remove('gezogen');
    this.el.classList.remove('zieht', 'fallen-lassen');
    for (const s of this.dokument.querySelectorAll('.slot.drop-ziel')) s.classList.remove('drop-ziel');
  }

  /** Was liegt unter dem Finger/Mauszeiger? Ein Platz (Fenster oder HUD-Schnellleiste), das Fenster selbst oder "Boden". */
  #zielUnter(x, y) {
    const element = this.dokument.elementFromPoint(x, y);
    const knopf = element?.closest?.('.slot[data-slot]');
    if (knopf) {
      const slot = Number(knopf.dataset.slot);
      if (slot < (this.#daten?.inventar.length ?? 0)) return { art: 'slot', slot, knopf };
    }
    if (element && this.el.contains(element)) return { art: 'fenster' };
    return { art: 'boden' };
  }

  #zeigeInfo(slot) {
    const e = this.#daten?.inventar[slot];
    const def = e && this.#itemDefinitionen[e.defId];
    this.info.textContent = def ? `${def.name}${e.menge > 1 ? ` ×${e.menge}` : ''}${def.beschreibung ? ` – ${def.beschreibung}` : ''}` : '';
  }

  /** "Bauen"-Liste: neu aufbauen nur, wenn sich der Bestand der Zutaten geändert hat. */
  #zeichneBauen() {
    const bestand = {};
    for (const e of this.#daten.inventar) if (e) bestand[e.defId] = (bestand[e.defId] ?? 0) + e.menge;
    const liste = Object.entries(this.rezepte).filter(([, r]) => r.ort === 'inventar');
    const stand = JSON.stringify(liste.map(([, r]) => Object.keys(r.zutaten).map((z) => bestand[z] ?? 0)));
    if (stand === this.bauenStand) return;
    this.bauenStand = stand;
    const d = this.dokument;
    this.bauenListe.replaceChildren(
      ...liste.map(([id, r]) => {
        const machbar = Object.entries(r.zutaten).every(([z, n]) => (bestand[z] ?? 0) >= n);
        const zeile = Object.assign(d.createElement('div'), { className: `inv-rezept${machbar ? ' machbar' : ''}`, title: r.beschreibung ?? '' });
        const icon = Object.assign(d.createElement('canvas'), { width: 72, height: 72 });
        this.zeichneIcon(icon, r.ergebnis);
        const text = Object.assign(d.createElement('span'), { className: 'inv-rezept-text' });
        text.append(
          Object.assign(d.createElement('b'), { textContent: r.name }),
          Object.assign(d.createElement('small'), {
            textContent: Object.entries(r.zutaten).map(([z, n]) => `${Math.min(bestand[z] ?? 0, n)}/${n} ${this.#itemDefinitionen[z]?.name ?? z}`).join(' · '),
          }),
        );
        const knopf = Object.assign(d.createElement('button'), { type: 'button', textContent: 'Bauen', disabled: !machbar });
        knopf.addEventListener('click', () => this.#aktionen.herstellen?.(id));
        zeile.append(icon, text, knopf);
        return zeile;
      }),
    );
  }

  #zeichne() {
    const d = this.#daten;
    this.#zeichneBauen();
    const groesse = d.inventar.length;
    const hatRucksack = !!d.rucksack;
    this.rucksackBereich.classList.toggle('leer', !hatRucksack);
    this.keinRucksack.hidden = hatRucksack;
    this.raster.rucksack.hidden = !hatRucksack;
    this.rucksackKnopf.hidden = !hatRucksack;
    this.#slots.forEach((s, slot) => {
      s.knopf.hidden = slot >= groesse;
      if (slot >= groesse) return;
      const eintrag = d.inventar[slot];
      s.knopf.classList.toggle('ausgeruestet', slot === d.ausgeruestet);
      s.knopf.classList.toggle('leer', !eintrag);
      s.knopf.title = eintrag ? (this.#itemDefinitionen[eintrag.defId]?.name ?? eintrag.defId) : '';
      s.menge.textContent = eintrag && eintrag.menge > 1 ? String(eintrag.menge) : eintrag?.magazin !== undefined ? `${eintrag.magazin}` : '';
      const defId = eintrag?.defId ?? null;
      if (s.defId === defId) return;
      s.defId = defId;
      this.zeichneIcon(s.icon, defId);
    });
  }
}

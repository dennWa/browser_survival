import { HOTBAR_PLAETZE, INVENTAR_PLAETZE } from '../../gemeinsam/konstanten.js';
import { CharakterVorschau } from './charakterVorschau.js';
import { uiIcon } from './uiIcons.js';

/**
 * Inventar-Fenster (Taste Tab bzw. 🎒): Schnellleiste (Plätze 0–7), Tasche (8–15) und – mit Rucksack/Kleidung – weitere.
 * Runde 23: zweispaltig – links Charakter-Vorschau (ui/charakterVorschau.js) mit Ausrüstungs-Slots (Kopf, Oberkörper, Hände,
 * Beine, Füße, Rücken = Rucksack), rechts die Items. Item auf einen Ausrüstungs-Slot ziehen = anlegen (AKTION anlegen),
 * Klick auf belegten Slot = ausziehen (AKTION ausziehen; Rücken = Rucksack ablegen). Daten: spielerDaten.kleidung.
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

/** Haltbarkeits-Balken (Axt, Hacke …) am Platz: siehe ui/haltbarkeit.js */
import { setzeHaltbarkeit } from './haltbarkeit.js';

/** Beschriftung der Schnellleisten-Plätze: 1–9, Platz 10 = Taste 0 */
export function slotBeschriftung(slot) {
  return String((slot + 1) % 10);
}

/** Runde 24: Anzeigenamen der Waffen-Aufsätze */
const MOD_NAMEN = { zielfernrohr: 'Zielfernrohr', magazin: 'großes Magazin', schalldaempfer: 'Schalldämpfer' };

/** Zwei Klicks/Tipps innerhalb dieser Zeit (ms) auf denselben Platz = Doppelklick */
const DOPPELKLICK_MS = 450; // Runde 28: am Handy war 380 ms oft zu knapp

export class InventarFenster {
  #aktionen = {};
  #slots = []; // { knopf, icon, menge, defId }
  #daten = null;
  #itemDefinitionen = {};
  #ziehen = null; // { slot, startX, startY, aktiv, geist, pointerId }
  #ueber = null; // Platz unter der Maus (für Q)
  #letzterKlick = { slot: -1, zeit: 0 }; // für Doppelklick
  #ausrSlots = {}; // id → { knopf, icon, defId }

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
    for (let slot = 0; slot < INVENTAR_PLAETZE + 16; slot++) this.#baueSlot(slot);
    this.werte = el('inventar-werte');
    this.umgebung = el('inventar-umgebung').querySelector('.umgebung-liste');
    this.umgebungStand = null;
    this.zeigeUmgebung([], {});
    this.name = el('inventar-name');
    this.vorschau = new CharakterVorschau(el('inventar-figur'));
    /** main.js: () => { aussehen, name } der eigenen Figur */
    this.figurQuelle = null;
    for (const knopf of this.el.querySelectorAll('.ausr-slot')) {
      const id = knopf.dataset.ausr;
      this.#ausrSlots[id] = { knopf, icon: knopf.querySelector('canvas'), defId: undefined };
      knopf.addEventListener('click', () => {
        if (id === 'ruecken') this.#aktionen.rucksackAblegen?.();
        else if (this.#daten?.kleidung?.[id]) this.#aktionen.ausziehen?.(id);
      });
      knopf.addEventListener('pointerenter', () => this.#zeigeAusrInfo(id));
    }
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
    if (offen !== this.offen) this.beiUmschalten?.(offen); // Sound inventar_auf/_zu (main.js)
    this.el.hidden = !offen;
    if (!offen) {
      this.#abbrechen();
      this.vorschau.stop();
    } else {
      if (this.#daten) this.#zeichne();
      this.vorschau.start();
    }
  }

  setzeDaten(daten, itemDefinitionen) {
    this.#daten = daten;
    this.#itemDefinitionen = itemDefinitionen ?? {};
    if (this.offen) this.#zeichne();
  }

  /** Runde 29: Items um den Spieler (clientSpiel, ~4×/s, nur bei offenem Inventar) – antippen hebt auf */
  zeigeUmgebung(liste, itemDefinitionen) {
    const stand = liste.map((g) => `${g.id}:${g.menge}`).join();
    if (stand === this.umgebungStand) return;
    this.umgebungStand = stand;
    const d = this.dokument;
    this.umgebung.replaceChildren(
      ...liste.map((g) => {
        const name = itemDefinitionen[g.defId]?.name ?? g.defId;
        const knopf = Object.assign(d.createElement('button'), { type: 'button', className: 'umgebung-item', title: `${name} aufheben` });
        const icon = Object.assign(d.createElement('canvas'), { width: 64, height: 64 });
        this.zeichneIcon(icon, g.defId);
        knopf.append(icon, Object.assign(d.createElement('span'), { textContent: g.menge > 1 ? `${name} ×${g.menge}` : name }));
        knopf.addEventListener('click', () => this.#aktionen.aufhebenZiel?.(g.id));
        return knopf;
      }),
    );
    if (!liste.length) this.umgebung.append(Object.assign(d.createElement('p'), { className: 'umgebung-leer', textContent: 'Hier liegt nichts' }));
  }

  // ---------------------------------------------------------------------------

  #baueSlot(slot) {
    const d = this.dokument;
    const knopf = Object.assign(d.createElement('button'), { type: 'button', className: 'slot inv-slot' });
    knopf.dataset.slot = slot;
    const icon = Object.assign(d.createElement('canvas'), { className: 'slot-icon', width: ICON * 2, height: ICON * 2 });
    const menge = Object.assign(d.createElement('span'), { className: 'slot-menge' });
    knopf.append(icon);
    if (slot < HOTBAR_PLAETZE) knopf.append(Object.assign(d.createElement('span'), { className: 'slot-nummer', textContent: slotBeschriftung(slot) }));
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
      // Runde 32: Rechtsklick (Desktop) → Kontextmenü (Essen/Trinken/Benutzen/Anziehen/Anzünden/Ablegen …); Touch: lange drücken bleibt ohne Menü
      if (e.pointerType !== 'touch' && this.#daten?.inventar[slot]) this.#zeigeKontextmenue(slot, e.clientX, e.clientY);
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
    for (const s of this.dokument.querySelectorAll('.drop-ziel')) s.classList.remove('drop-ziel');
    ziel?.knopf?.classList.add('drop-ziel');
    this.el.classList.toggle('fallen-lassen', ziel?.art === 'boden');
  }

  #loslassen(e) {
    const z = this.#ziehen;
    if (!z || e.pointerId !== z.pointerId) return;
    if (!z.aktiv) {
      // Nur geklickt/angetippt → benutzen; Doppelklick auf Essen/Trinken/Medizin → sofort verbrauchen
      this.#ziehen = null;
      const jetzt = performance.now();
      const def = this.#itemDefinitionen[this.#daten?.inventar[z.slot]?.defId];
      const verbrauchbar = def && (def.kategorie === 'nahrung' || def.kategorie === 'getraenk' || def.kategorie === 'medizin');
      if (verbrauchbar && this.#letzterKlick.slot === z.slot && jetzt - this.#letzterKlick.zeit < DOPPELKLICK_MS) {
        this.#letzterKlick = { slot: -1, zeit: 0 };
        this.#aktionen.konsumieren?.(z.slot);
      } else {
        this.#letzterKlick = { slot: z.slot, zeit: jetzt };
        this.#aktionen.benutzen?.(z.slot);
      }
      this.#zeigeInfo(z.slot);
      return;
    }
    const ziel = this.#zielUnter(e.clientX, e.clientY);
    this.#abbrechen();
    if (ziel?.art === 'slot' && ziel.slot !== z.slot) this.#aktionen.tauschen?.(z.slot, ziel.slot);
    else if (ziel?.art === 'ausruestung' || ziel?.art === 'figur') this.#aktionen.anlegen?.(z.slot);
    else if (ziel?.art === 'boden') this.#aktionen.ablegen?.(z.slot);
  }

  #abbrechen() {
    const z = this.#ziehen;
    this.#ziehen = null;
    if (!z) return;
    z.geist?.remove();
    this.#slots[z.slot]?.knopf.classList.remove('gezogen');
    this.el.classList.remove('zieht', 'fallen-lassen');
    for (const s of this.dokument.querySelectorAll('.drop-ziel')) s.classList.remove('drop-ziel');
  }

  /** Was liegt unter dem Finger/Mauszeiger? Ein Platz (Fenster oder HUD-Schnellleiste), das Fenster selbst oder "Boden". */
  #zielUnter(x, y) {
    const element = this.dokument.elementFromPoint(x, y);
    const knopf = element?.closest?.('.slot[data-slot]');
    if (knopf) {
      const slot = Number(knopf.dataset.slot);
      if (slot < (this.#daten?.inventar.length ?? 0)) return { art: 'slot', slot, knopf };
    }
    const ausr = element?.closest?.('.ausr-slot');
    if (ausr) return { art: 'ausruestung', id: ausr.dataset.ausr, knopf: ausr };
    if (element?.id === 'inventar-figur') return { art: 'figur', knopf: element };
    if (element && this.el.contains(element)) return { art: 'fenster' };
    return { art: 'boden' };
  }

  /**
   * Runde 32: Kontextmenü eines Inventarplatzes – Einträge je nach Item-Art (itemKontextEintraege), schließt bei Klick daneben/Esc.
   */
  #zeigeKontextmenue(slot, x, y) {
    this.#schliesseKontextmenue();
    const e = this.#daten?.inventar[slot];
    const def = e && this.#itemDefinitionen[e.defId];
    if (!def) return;
    const d = this.dokument;
    const menue = Object.assign(d.createElement('div'), { className: 'inv-kontext' });
    menue.append(Object.assign(d.createElement('div'), { className: 'inv-kontext-titel', textContent: def.name }));
    for (const { text, aktion } of itemKontextEintraege(def, e)) {
      const k = Object.assign(d.createElement('button'), { type: 'button', textContent: text });
      k.addEventListener('click', (ev) => {
        ev.stopPropagation();
        this.#schliesseKontextmenue();
        if (aktion === 'einzeln') this.#aktionen.ablegen?.(slot, true);
        else this.#aktionen[aktion]?.(slot);
      });
      menue.append(k);
    }
    d.body.append(menue);
    const r = menue.getBoundingClientRect();
    menue.style.left = `${Math.min(x, (d.defaultView?.innerWidth ?? 1e4) - r.width - 4)}px`;
    menue.style.top = `${Math.min(y, (d.defaultView?.innerHeight ?? 1e4) - r.height - 4)}px`;
    this.#kontext = menue;
    const zu = (ev) => {
      if (ev.type === 'keydown' && ev.key !== 'Escape') return;
      if (ev.type === 'pointerdown' && menue.contains(ev.target)) return;
      this.#schliesseKontextmenue();
    };
    this.#kontextZu = zu;
    setTimeout(() => {
      d.addEventListener('pointerdown', zu, true);
      d.addEventListener('keydown', zu, true);
    });
  }

  #schliesseKontextmenue() {
    this.#kontext?.remove();
    this.#kontext = null;
    if (this.#kontextZu) {
      this.dokument.removeEventListener('pointerdown', this.#kontextZu, true);
      this.dokument.removeEventListener('keydown', this.#kontextZu, true);
      this.#kontextZu = null;
    }
  }

  #kontext = null;
  #kontextZu = null;

  #zeigeInfo(slot) {
    const e = this.#daten?.inventar[slot];
    const def = e && this.#itemDefinitionen[e.defId];
    this.info.textContent = def ? `${def.name}${e.menge > 1 ? ` ×${e.menge}` : ''}${def.beschreibung ? ` – ${def.beschreibung}` : ''}` : '';
    if (!def) return;
    // Runde 24: Zustand und Aufsätze (Zielfernrohr …) – Knopf nimmt sie wieder ab
    if (def.haltbarkeit) this.info.append(` · Zustand ${Math.round(((e.haltbarkeit ?? def.haltbarkeit) / def.haltbarkeit) * 100)} %`);
    if (def.verdirbt) this.info.append(` · ${(e.verderb ?? def.verdirbt) < def.verdirbt * 0.25 ? '⚠ bald verdorben' : 'frisch'} (noch ${Math.ceil((e.verderb ?? def.verdirbt) / 60)} min)`); // Runde 24 (P12)
    if (def.mods?.length) this.info.append(` · Aufsätze: ${e.mods?.length ? e.mods.map((m) => MOD_NAMEN[m] ?? m).join(', ') : `keine (passt: ${def.mods.map((m) => MOD_NAMEN[m] ?? m).join(', ')})`}`);
    if (e.mods?.length) {
      const knopf = Object.assign(this.dokument.createElement('button'), { type: 'button', className: 'inv-mod-ab', textContent: '🔧 abnehmen' });
      knopf.addEventListener('click', () => this.#aktionen.modsAbnehmen?.(slot));
      this.info.append(' ', knopf);
    }
  }

  #zeigeAusrInfo(id) {
    const defId = id === 'ruecken' ? this.#daten?.rucksack : this.#daten?.kleidung?.[id];
    const def = defId && this.#itemDefinitionen[defId];
    const namen = { kopf: 'Kopf', oberkoerper: 'Oberkörper', haende: 'Hände', beine: 'Beine', fuesse: 'Füße', ruecken: 'Rucksack' };
    this.info.textContent = def
      ? `${def.name}${def.waerme ? ` · Wärme +${def.waerme}` : ''}${def.schutz ? ` · Schutz ${def.schutz} %` : ''}${def.regenschutz ? ` · Regenschutz` : ''}${def.plaetze ? ` · +${def.plaetze} Plätze` : ''} – Klick = ${id === 'ruecken' ? 'ablegen' : 'ausziehen'}`
      : `${namen[id]}: leer – passende Kleidung hierher ziehen`;
  }

  /** Ausrüstungs-Slots, Figur und Werte links */
  #zeichneCharakter() {
    const d = this.#daten;
    const belegung = { ...(d.kleidung ?? {}), ruecken: d.rucksack ?? null };
    for (const [id, s] of Object.entries(this.#ausrSlots)) {
      const defId = belegung[id] ?? null;
      s.knopf.classList.toggle('belegt', !!defId);
      if (s.defId === defId) continue;
      s.defId = defId;
      this.zeichneIcon(s.icon, defId);
    }
    const figur = this.figurQuelle?.() ?? {};
    this.name.textContent = figur.name ?? '';
    this.vorschau.setze(figur.aussehen, d.kleidung ?? null);
    let waerme = 0;
    let schutz = 0;
    let platz = 0;
    for (const defId of Object.values(belegung)) {
      const def = defId && this.#itemDefinitionen[defId];
      waerme += def?.waerme ?? 0;
      schutz += def?.schutz ?? 0;
      platz += def?.plaetze ?? 0;
    }
    const wert = (icon, text, zahl) => `<div class="inv-wert">${uiIcon(icon)}<span>${text}</span><b>${zahl}</b></div>`;
    const html = wert('xp', 'Level', d.level ?? 1) + wert('kaelte', 'Wärme', `+${waerme}`) + (schutz ? wert('leben', 'Schutz', `${Math.min(60, schutz)} %`) : '') + wert('inventar', 'Plätze', `${d.inventar.length}${platz ? ` (+${platz})` : ''}`) + (d.kaelte > 0 ? wert('schneeflocke', 'Kälte', `${d.kaelte}%`) : '');
    if (this.werte.innerHTML !== html) this.werte.innerHTML = html;
  }

  /** "Bauen"-Liste: neu aufbauen nur, wenn sich der Bestand der Zutaten geändert hat. */
  #zeichneBauen() {
    const bestand = {};
    for (const e of this.#daten.inventar) if (e) bestand[e.defId] = (bestand[e.defId] ?? 0) + e.menge;
    const liste = Object.entries(this.rezepte).filter(([, r]) => r.ort === 'inventar');
    const level = this.#daten.level ?? 1;
    const stand = `${level}|${JSON.stringify(liste.map(([, r]) => Object.keys(r.zutaten).map((z) => bestand[z] ?? 0)))}`;
    if (stand === this.bauenStand) return;
    this.bauenStand = stand;
    const d = this.dokument;
    this.bauenListe.replaceChildren(
      ...liste.map(([id, r]) => {
        const levelOk = (r.level ?? 1) <= level;
        const machbar = levelOk && Object.entries(r.zutaten).every(([z, n]) => (bestand[z] ?? 0) >= n);
        const zeile = Object.assign(d.createElement('div'), { className: `inv-rezept${machbar ? ' machbar' : ''}${levelOk ? '' : ' gesperrt'}`, title: r.beschreibung ?? '' });
        const icon = Object.assign(d.createElement('canvas'), { width: 72, height: 72 });
        this.zeichneIcon(icon, r.ergebnis);
        const text = Object.assign(d.createElement('span'), { className: 'inv-rezept-text' });
        const titel = Object.assign(d.createElement('b'), { textContent: r.name });
        if ((r.level ?? 1) > 1) titel.append(Object.assign(d.createElement('span'), { className: `rezept-level${levelOk ? '' : ' fehlt'}`, textContent: `Level ${r.level}` }));
        text.append(
          titel,
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
    this.#zeichneCharakter();
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
      setzeHaltbarkeit(s.knopf, eintrag, this.#itemDefinitionen);
      const defId = eintrag?.defId ?? null;
      if (s.defId === defId) return;
      s.defId = defId;
      this.zeichneIcon(s.icon, defId);
    });
  }
}

/**
 * Runde 32: Einträge des Rechtsklick-Menüs je Item: [{ text, aktion }] – aktion = Name in den Inventar-Aktionen
 * (konsumieren | benutzen | anlegen | anzuenden | modsAbnehmen | ablegen) bzw. 'einzeln' (1 Stück ablegen).
 */
export function itemKontextEintraege(def, eintrag = {}) {
  const liste = [];
  if (def.kategorie === 'nahrung') liste.push({ text: '🍴 Essen', aktion: 'konsumieren' });
  else if (def.kategorie === 'getraenk') liste.push({ text: '🥤 Trinken', aktion: 'konsumieren' });
  else if (def.kategorie === 'medizin') liste.push({ text: '🩹 Benutzen', aktion: 'konsumieren' });
  if (def.slot || def.kategorie === 'kleidung' || def.kategorie === 'rucksack') liste.push({ text: '👕 Anziehen', aktion: 'anlegen' });
  if (eintrag.defId === 'fackel') liste.push({ text: '🔥 Anzünden', aktion: 'anzuenden' });
  if (eintrag.defId === 'funkgeraet') return [{ text: '📻 Einstellen', aktion: 'benutzen' }, { text: '⬇ Ablegen', aktion: 'ablegen' }]; // Runde 47
  if (['nahkampf', 'fernkampf', 'werkzeug', 'wurf', 'bauwerk', 'samen'].includes(def.kategorie) || def.inHand || def.werkzeug) liste.push({ text: '✋ In die Hand nehmen', aktion: 'benutzen' });
  else if (!liste.length) liste.push({ text: '✋ Nutzen', aktion: 'benutzen' });
  if (eintrag.mods?.length) liste.push({ text: '🔧 Aufsätze abnehmen', aktion: 'modsAbnehmen' });
  if ((eintrag.menge ?? 1) > 1) liste.push({ text: '⬇ 1 ablegen', aktion: 'einzeln' });
  liste.push({ text: '⬇ Ablegen', aktion: 'ablegen' });
  return liste;
}

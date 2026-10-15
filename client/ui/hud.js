import { INVENTAR_PLAETZE } from '../../gemeinsam/konstanten.js';

/**
 * HUD (Head-Up-Display) über dem Spiel:
 *   Statuszeile, Balken (Leben/Hunger/Durst), Schnellleiste (Inventar 1–8), Munition,
 *   Aufheben-Knopf, Nachladen-Knopf (Touch), Meldungen, Todesbildschirm, Debug (F3).
 *
 * Bedienung Schnellleiste: Klick/Tippen = benutzen bzw. ausrüsten · Rechtsklick/lange drücken = ablegen.
 */
const AKTUALISIERUNG_MS = 250;
const MELDUNG_DAUER_MS = 2600;
const MAX_MELDUNGEN = 4;
const LANGES_DRUECKEN_MS = 500;
const ICON_GROESSE = 48;

export class Hud {
  #aktionen = {};
  #assets = null;
  #istTouch = false;
  #slots = [];
  #letzterHinweis = null;

  constructor(dokument, { debug = false } = {}) {
    this.dokument = dokument;
    const el = (id) => dokument.getElementById(id);
    this.el = {
      hud: el('hud'),
      status: el('hud-status'),
      debug: el('hud-debug'),
      hilfe: el('hud-hilfe'),
      abmelden: el('hud-abmelden'),
      vollbild: el('hud-vollbild'),
      leben: el('wert-leben'),
      hunger: el('wert-hunger'),
      durst: el('wert-durst'),
      hotbar: el('hotbar'),
      munition: el('hud-munition'),
      aufheben: el('knopf-aufheben'),
      nachladen: el('knopf-nachladen'),
      meldungen: el('hud-meldungen'),
      tod: el('tod-overlay'),
      todText: el('tod-countdown'),
    };
    this.debug = debug;
    this.letzteAktualisierung = 0;

    this.el.vollbild.addEventListener('click', () => {
      if (dokument.fullscreenElement) dokument.exitFullscreen?.();
      else dokument.documentElement.requestFullscreen?.().catch(() => {});
    });
    this.el.aufheben.addEventListener('click', () => this.#aktionen.aufheben?.());
    this.el.nachladen.addEventListener('click', () => this.#aktionen.nachladen?.());
    this.#baueHotbar();
  }

  setzeAssets(assets) {
    this.#assets = assets;
  }

  beiAbmelden(fn) {
    this.el.abmelden.addEventListener('click', fn);
  }

  /** @param aktionen { benutzen(slot), ablegen(slot), aufheben(), nachladen() } */
  beiAktionen(aktionen) {
    this.#aktionen = aktionen;
  }

  /** @param istTouch true → Touch-Hinweise, Vollbild- und Nachladen-Knopf */
  anzeigen(istTouch = false) {
    this.#istTouch = istTouch;
    this.el.hud.hidden = false;
    this.el.hud.classList.toggle('touch', istTouch);
    this.el.debug.hidden = !this.debug;
    this.el.vollbild.hidden = !istTouch || !document.fullscreenEnabled;
    this.el.hilfe.textContent = istTouch
      ? 'Links: laufen · Rechts: zielen, ganz drücken = Angriff'
      : 'WASD laufen · Maus zielen · Klick/Leertaste Angriff · E aufheben · R nachladen · 1–8 Inventar · F3 Debug';
    this.#letzterHinweis = null;
  }

  verbergen() {
    this.el.hud.hidden = true;
    this.el.tod.hidden = true;
    this.el.meldungen.replaceChildren();
  }

  debugUmschalten() {
    this.debug = !this.debug;
    this.el.debug.hidden = !this.debug;
  }

  meldung(text) {
    const div = Object.assign(this.dokument.createElement('div'), { className: 'meldung', textContent: text });
    this.el.meldungen.append(div);
    while (this.el.meldungen.children.length > MAX_MELDUNGEN) this.el.meldungen.firstElementChild.remove();
    setTimeout(() => div.remove(), MELDUNG_DAUER_MS);
  }

  /** Private Spielerdaten vom Server (bei jeder Änderung). */
  setzeSpielerDaten(daten, itemDefinitionen) {
    setzeBalken(this.el.leben, daten.leben / daten.maxLeben);
    setzeBalken(this.el.hunger, daten.hunger / 100);
    setzeBalken(this.el.durst, daten.durst / 100);

    for (let slot = 0; slot < INVENTAR_PLAETZE; slot++) {
      this.#zeichneSlot(this.#slots[slot], daten.inventar[slot], itemDefinitionen, slot === daten.ausgeruestet);
    }

    // Munitionsanzeige für ausgerüstete Schusswaffe
    const waffe = daten.ausgeruestet !== null ? daten.inventar[daten.ausgeruestet] : null;
    const def = waffe && itemDefinitionen[waffe.defId];
    const schusswaffe = def?.kategorie === 'fernkampf';
    this.el.munition.hidden = !schusswaffe;
    this.el.nachladen.hidden = !schusswaffe || !this.#istTouch;
    if (schusswaffe) {
      const reserve = daten.inventar.reduce((s, e) => s + (e?.defId === def.munition ? e.menge : 0), 0);
      this.el.munition.textContent = daten.nachladen ? 'Nachladen …' : `${waffe.magazin} / ${reserve}`;
      this.el.munition.classList.toggle('leer', waffe.magazin === 0);
    }

    this.el.tod.hidden = !daten.tot;
    if (daten.tot) this.el.todText.textContent = `Wiederbelebung in ${Math.max(0, daten.respawnIn)} s`;
  }

  /** Jeden Frame aufgerufen – teure DOM-Updates gedrosselt. */
  aktualisiere(d) {
    const hinweis = d.aufhebbar ? `${this.#istTouch ? '✋' : '[E]'} ${d.aufhebbar} aufheben` : null;
    if (hinweis !== this.#letzterHinweis) {
      this.#letzterHinweis = hinweis;
      this.el.aufheben.hidden = !hinweis;
      if (hinweis) this.el.aufheben.textContent = hinweis;
    }

    const jetzt = performance.now();
    if (jetzt - this.letzteAktualisierung < AKTUALISIERUNG_MS) return;
    this.letzteAktualisierung = jetzt;
    this.el.status.textContent = `${d.serverName} · ${d.spielerOnline} online · Ping ${d.ping ?? '–'} ms`;
    if (this.debug) {
      const s = d.spieler;
      this.el.debug.textContent = [
        `FPS ${d.fps}   Tick ${d.tick}`,
        `Verbindung: ${d.verbindung}`,
        `Position: ${Math.round(s.x)} | ${Math.round(s.y)}`,
        `Unbestätigte Eingaben: ${d.offeneEingaben}`,
        `Zombies: ${d.zombies}   Gegenstände: ${d.gegenstaende}`,
      ].join('\n');
    }
  }

  // ---------------------------------------------------------------------------

  #baueHotbar() {
    for (let slot = 0; slot < INVENTAR_PLAETZE; slot++) {
      const knopf = Object.assign(this.dokument.createElement('button'), { type: 'button', className: 'slot' });
      const icon = Object.assign(this.dokument.createElement('canvas'), { className: 'slot-icon', width: ICON_GROESSE * 2, height: ICON_GROESSE * 2 });
      const nummer = Object.assign(this.dokument.createElement('span'), { className: 'slot-nummer', textContent: String(slot + 1) });
      const menge = Object.assign(this.dokument.createElement('span'), { className: 'slot-menge' });
      knopf.append(icon, nummer, menge);
      this.el.hotbar.append(knopf);
      this.#slots.push({ knopf, icon, menge, defId: null });

      let timer = null;
      let langGedrueckt = false;
      knopf.addEventListener('pointerdown', (e) => {
        if (e.pointerType !== 'touch') return;
        langGedrueckt = false;
        timer = setTimeout(() => {
          langGedrueckt = true;
          this.#aktionen.ablegen?.(slot);
        }, LANGES_DRUECKEN_MS);
      });
      const abbrechen = () => clearTimeout(timer);
      knopf.addEventListener('pointerup', abbrechen);
      knopf.addEventListener('pointerleave', abbrechen);
      knopf.addEventListener('click', () => {
        if (langGedrueckt) {
          langGedrueckt = false;
          return;
        }
        this.#aktionen.benutzen?.(slot);
      });
      knopf.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (e.pointerType !== 'touch') this.#aktionen.ablegen?.(slot);
      });
    }
  }

  #zeichneSlot(slot, eintrag, itemDefinitionen, ausgeruestet) {
    slot.knopf.classList.toggle('ausgeruestet', ausgeruestet);
    slot.knopf.classList.toggle('leer', !eintrag);
    slot.knopf.title = eintrag ? itemDefinitionen[eintrag.defId]?.name ?? eintrag.defId : '';
    slot.menge.textContent = eintrag && eintrag.menge > 1 ? String(eintrag.menge) : eintrag?.magazin !== undefined ? `${eintrag.magazin}` : '';
    if (slot.defId === (eintrag?.defId ?? null)) return; // Icon unverändert
    slot.defId = eintrag?.defId ?? null;

    const ctx = slot.icon.getContext('2d');
    ctx.clearRect(0, 0, slot.icon.width, slot.icon.height);
    const rahmen = eintrag && this.#assets?.item(eintrag.defId);
    const bild = this.#assets?.itemBild;
    if (!rahmen || !bild) {
      if (eintrag) {
        ctx.fillStyle = '#9aa0a8';
        ctx.font = '600 22px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText(slot.knopf.title.slice(0, 2), slot.icon.width / 2, slot.icon.height / 2 + 8);
      }
      return;
    }
    const platz = slot.icon.width * 0.82;
    const faktor = platz / Math.max(rahmen.b, rahmen.h);
    const b = rahmen.b * faktor;
    const h = rahmen.h * faktor;
    ctx.drawImage(bild, rahmen.x, rahmen.y, rahmen.b, rahmen.h, (slot.icon.width - b) / 2, (slot.icon.height - h) / 2, b, h);
  }
}

function setzeBalken(element, anteil) {
  const wert = Math.max(0, Math.min(1, anteil || 0));
  element.querySelector('.fuellung').style.width = `${wert * 100}%`;
  element.classList.toggle('kritisch', wert < 0.2);
}

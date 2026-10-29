/**
 * Werkbank-Menü (Crafting): Kategorien als Reiter, jedes Rezept als Karte mit Icon, Beschreibung,
 * Zutaten (grün = vorhanden, rot = fehlt) und "Herstellen"-Knopf. Rezepte kommen vom Server
 * (server/spiel/konfiguration/rezepte.js), der beim Herstellen auch alles nachprüft.
 * Runde 24: Reiter „Reparieren“ (nur wenn etwas abgenutzt ist): abgenutzte Waffen/Werkzeuge mit Haltbarkeit und Kosten
 * (gemeinsam/spieler/reparatur.js) → AKTION reparieren { slot }. Dasselbe Menü dient Amboss, Webstuhl, Chemie-Tisch und
 * Kochstelle (`ort`, gemeinsam/spieler/handwerk.js) – Titel wechselt, Reparieren nur an Werkbank/Amboss.
 */
import { reparaturKostenFuer } from '../../gemeinsam/spieler/reparatur.js';
import { HANDWERK_ORTE } from '../../gemeinsam/spieler/handwerk.js';

const ICON = 48;
const REPARIEREN = '🔧 Reparieren';

export class WerkbankMenue {
  #kategorie = null;
  #beiHerstellen = null;
  #beiSchliessen = null;
  #beiReparieren = null;
  #schluessel = '';
  #level = 1;

  constructor(dokument, { zeichneIcon }) {
    this.dokument = dokument;
    this.zeichneIcon = zeichneIcon; // (canvas, defId) → void
    this.el = dokument.getElementById('werkbank');
    this.reiter = dokument.getElementById('werkbank-reiter');
    this.liste = dokument.getElementById('werkbank-liste');
    this.titel = this.el.querySelector('h2');
    dokument.getElementById('werkbank-schliessen').addEventListener('click', () => this.#beiSchliessen?.());
  }

  beiHerstellen(fn) {
    this.#beiHerstellen = fn;
  }

  beiReparieren(fn) {
    this.#beiReparieren = fn;
  }

  beiSchliessen(fn) {
    this.#beiSchliessen = fn;
  }

  get offen() {
    return !this.el.hidden;
  }

  /** @param rezepte null = schließen */
  zeige(rezepte, spielerDaten, itemDefinitionen, ort = 'werkbank') {
    if (!rezepte) {
      this.el.hidden = true;
      this.#schluessel = '';
      return;
    }
    this.el.hidden = false;
    const ortDef = HANDWERK_ORTE[ort] ?? HANDWERK_ORTE.werkbank;
    if (this.titel) this.titel.textContent = `${ortDef.symbol} ${ortDef.name}`;
    const bestand = zaehleInventar(spielerDaten?.inventar ?? []);
    // Nur neu aufbauen, wenn sich Inventar oder Reiter geändert haben
    this.#level = spielerDaten?.level ?? 1;
    const abgenutzt = (spielerDaten?.inventar ?? [])
      .map((e, slot) => ({ e, slot, def: itemDefinitionen?.[e?.defId] }))
      .filter(({ e, def }) => ortDef.reparieren && def?.haltbarkeit && Number.isFinite(e.haltbarkeit) && e.haltbarkeit < def.haltbarkeit);
    const schluessel = `${ort}|${this.#kategorie}|${this.#level}|${JSON.stringify(bestand)}|${abgenutzt.map((a) => `${a.slot}:${a.e.haltbarkeit}`).join(',')}`;
    if (schluessel === this.#schluessel) return;
    this.#schluessel = schluessel;

    const kategorien = [...new Set(Object.values(rezepte).map((r) => r.kategorie))];
    if (abgenutzt.length) kategorien.push(REPARIEREN);
    if (!kategorien.includes(this.#kategorie)) this.#kategorie = kategorien[0];
    this.reiter.replaceChildren(
      ...kategorien.map((k) => {
        const knopf = this.#element('button', { type: 'button', className: k === this.#kategorie ? 'aktiv' : '', textContent: k });
        knopf.addEventListener('click', () => {
          this.#kategorie = k;
          this.#schluessel = '';
          this.zeige(rezepte, spielerDaten, itemDefinitionen, ort);
        });
        return knopf;
      }),
    );

    const karten =
      this.#kategorie === REPARIEREN
        ? abgenutzt.map(({ e, slot, def }) => this.#reparaturKarte(slot, e, def, reparaturKostenFuer(e.defId, itemDefinitionen, rezepte), bestand, itemDefinitionen))
        : Object.entries(rezepte)
            .filter(([, r]) => r.kategorie === this.#kategorie)
            .map(([id, r]) => this.#karte(id, r, bestand, itemDefinitionen));
    this.liste.replaceChildren(...karten);
  }

  /** Karte im Reiter „Reparieren“: Zustand in %, Kosten als Zutaten, Knopf → AKTION reparieren */
  #reparaturKarte(slot, eintrag, def, kosten, bestand, itemDefinitionen) {
    const rezeptArtig = { name: def.name, beschreibung: `Zustand ${Math.round((eintrag.haltbarkeit / def.haltbarkeit) * 100)} % → wieder 100 %`, zutaten: kosten ?? {}, ergebnis: eintrag.defId };
    const karte = this.#karte(`reparatur:${slot}`, rezeptArtig, bestand, itemDefinitionen);
    const knopf = karte.querySelector('.herstellen');
    knopf.textContent = 'Reparieren';
    const neu = knopf.cloneNode(true); // Herstellen-Klick entfernen
    neu.addEventListener('click', () => this.#beiReparieren?.(slot));
    knopf.replaceWith(neu);
    return karte;
  }

  #karte(id, rezept, bestand, itemDefinitionen) {
    const levelOk = (rezept.level ?? 1) <= (this.#level ?? 1);
    const machbar = levelOk && Object.entries(rezept.zutaten).every(([item, anzahl]) => (bestand[item] ?? 0) >= anzahl);
    const karte = this.#element('div', { className: `rezept${machbar ? ' machbar' : ''}${levelOk ? '' : ' gesperrt'}` });
    const icon = this.#element('canvas', { className: 'rezept-icon', width: ICON * 2, height: ICON * 2 });
    this.zeichneIcon(icon, rezept.ergebnis);
    const text = this.#element('div', { className: 'rezept-text' });
    const titel = this.#element('div', { className: 'rezept-name', textContent: `${rezept.name}${(rezept.menge ?? 1) > 1 ? ` ×${rezept.menge}` : ''}` });
    if ((rezept.level ?? 1) > 1) titel.append(this.#element('span', { className: `rezept-level${levelOk ? '' : ' fehlt'}`, textContent: `Level ${rezept.level}` }));
    const info = this.#element('div', { className: 'rezept-info', textContent: rezept.beschreibung ?? '' });
    const zutaten = this.#element('div', { className: 'rezept-zutaten' });
    for (const [item, anzahl] of Object.entries(rezept.zutaten)) {
      const hat = bestand[item] ?? 0;
      const chip = this.#element('span', { className: `zutat${hat >= anzahl ? ' ok' : ' fehlt'}` });
      const mini = this.#element('canvas', { width: 40, height: 40 });
      this.zeichneIcon(mini, item);
      chip.append(mini, `${Math.min(hat, anzahl)}/${anzahl} ${itemDefinitionen?.[item]?.name ?? item}`);
      zutaten.append(chip);
    }
    text.append(titel, info, zutaten);
    const knopf = this.#element('button', { type: 'button', className: 'herstellen', textContent: 'Herstellen', disabled: !machbar });
    knopf.addEventListener('click', () => this.#beiHerstellen?.(id));
    karte.append(icon, text, knopf);
    return karte;
  }

  #element(tag, eigenschaften) {
    return Object.assign(this.dokument.createElement(tag), eigenschaften);
  }
}

function zaehleInventar(inventar) {
  const bestand = {};
  for (const e of inventar) if (e) bestand[e.defId] = (bestand[e.defId] ?? 0) + e.menge;
  return bestand;
}

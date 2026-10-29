import { INVENTAR_MAX } from '../../gemeinsam/konstanten.js';

/**
 * Station-Fenster (E am Lagerfeuer oder Schmelzofen): oben die Koch-/Schmelzplätze mit Fortschrittsbalken, darunter
 * das eigene Inventar (antippen = 1 Stück hineinlegen; Holz beim Ofen = Brennstoff). Platz antippen = herausnehmen.
 * Der Server rechnet alles (stationSystem.js) und schickt ca. 2×/s eine STATION-Nachricht mit dem Stand.
 *   Lagerfeuer: roh → nach 20 s gar → nach 30 s verkohlt   ·   Schmelzofen: Eisenerz → Eisenbarren
 */
const ICON = 48;
const TITEL = { lagerfeuer: '🔥 Lagerfeuer', schmelzofen: '🏭 Schmelzofen' };

export class StationFenster {
  #aktionen = {};
  #stand = null;
  #daten = null;
  #itemDefinitionen = {};
  #plaetze = [];
  #inventar = [];

  constructor(dokument, { zeichneIcon }) {
    this.dokument = dokument;
    this.zeichneIcon = zeichneIcon;
    this.el = dokument.getElementById('station');
    this.titel = dokument.getElementById('station-titel');
    this.rasterPlaetze = dokument.getElementById('station-raster');
    this.rasterInventar = dokument.getElementById('station-inventar');
    this.info = dokument.getElementById('station-info');
    this.status = dokument.getElementById('station-status');
    this.knoepfe = dokument.getElementById('station-knoepfe');
    dokument.getElementById('station-schliessen').addEventListener('click', () => this.#aktionen.schliessen?.());
    this.feuerKnopf = dokument.getElementById('station-feuer');
    this.sitzKnopf = dokument.getElementById('station-sitzen');
    this.feuerKnopf.addEventListener('click', () => this.#aktionen.feuer?.());
    this.sitzKnopf.addEventListener('click', () => this.#aktionen.sitzen?.());
    this.kochbuchKnopf = dokument.getElementById('station-kochbuch'); // Runde 24: Rezepte der Kochstelle
    this.kochbuchKnopf?.addEventListener('click', () => this.#aktionen.kochbuch?.());
    for (let i = 0; i < 3; i++) this.#plaetze.push(this.#baueSlot(this.rasterPlaetze, i, (slot) => this.#aktionen.nehmen?.(slot), true));
    for (let i = 0; i < INVENTAR_MAX; i++) this.#inventar.push(this.#baueSlot(this.rasterInventar, i, (slot) => this.#aktionen.legen?.(slot), false));
  }

  /** @param aktionen { legen(slot), nehmen(platz), schliessen(), feuer(), sitzen(), kochbuch() } */
  beiAktionen(aktionen) {
    this.#aktionen = aktionen;
  }

  get offen() {
    return !this.el.hidden;
  }

  /** stand = STATION-Nachricht ({ art, brennt, brennRest, brennstoff, plaetze }) → öffnen/aktualisieren, null → schließen */
  zeige(stand) {
    this.#stand = stand;
    this.el.hidden = !stand;
    if (stand) this.#zeichne();
  }

  setzeDaten(daten, itemDefinitionen) {
    this.#daten = daten;
    this.#itemDefinitionen = itemDefinitionen ?? {};
    if (this.offen) this.#zeichne();
  }

  #baueSlot(raster, index, beiKlick, mitBalken) {
    const d = this.dokument;
    const knopf = Object.assign(d.createElement('button'), { type: 'button', className: 'slot inv-slot' });
    const icon = Object.assign(d.createElement('canvas'), { className: 'slot-icon', width: ICON * 2, height: ICON * 2 });
    const menge = Object.assign(d.createElement('span'), { className: 'slot-menge' });
    knopf.append(icon, menge);
    let balken = null;
    if (mitBalken) {
      balken = Object.assign(d.createElement('span'), { className: 'garbalken' });
      balken.append(Object.assign(d.createElement('span'), { className: 'garfuellung' }));
      knopf.append(balken);
    }
    knopf.addEventListener('click', () => beiKlick(index));
    knopf.addEventListener('pointerenter', () => this.#zeigeInfo(mitBalken ? this.#stand?.plaetze?.[index] : this.#daten?.inventar[index]));
    raster.append(knopf);
    return { knopf, icon, menge, balken, defId: undefined };
  }

  #zeigeInfo(eintrag) {
    const def = eintrag && this.#itemDefinitionen[eintrag.defId];
    this.info.textContent = def ? `${def.name}${def.beschreibung ? ` – ${def.beschreibung}` : ''}` : '';
  }

  #zeichne() {
    const s = this.#stand;
    this.titel.textContent = TITEL[s.art] ?? 'Station';
    const ofen = s.art === 'schmelzofen';
    const lagerfeuer = s.art === 'lagerfeuer';
    this.feuerKnopf.hidden = !lagerfeuer;
    this.sitzKnopf.hidden = !lagerfeuer;
    if (this.kochbuchKnopf) {
      this.kochbuchKnopf.hidden = !lagerfeuer;
      this.kochbuchKnopf.disabled = !s.brennt;
    }
    if (lagerfeuer) {
      this.feuerKnopf.textContent = s.brennt ? '💧 Löschen' : '🔥 Anzünden (Feuerzeug)';
      this.sitzKnopf.disabled = !s.brennt;
    }
    const min = Math.floor(s.brennRest / 60);
    const sek = String(s.brennRest % 60).padStart(2, '0');
    this.status.textContent = ofen
      ? `${s.brennt ? `🔥 heiß (${s.brennRest} s)` : 'kalt'} · Holz im Ofen: ${s.brennstoff} · Holz hineinlegen = Brennstoff`
      : s.brennt
        ? `🔥 brennt noch ${min}:${sek} · Holz in die Hand + Linksklick = +3 min`
        : 'Das Feuer ist aus';
    this.#plaetze.forEach((p, i) => {
      const e = s.plaetze[i] ?? null;
      p.knopf.classList.toggle('leer', !e);
      p.menge.textContent = '';
      const defId = e?.defId ?? null;
      if (p.defId !== defId) {
        p.defId = defId;
        this.zeichneIcon(p.icon, defId);
      }
      const fuellung = p.balken.firstChild;
      if (!e) {
        p.balken.hidden = true;
        p.knopf.title = '';
        return;
      }
      const name = this.#itemDefinitionen[e.defId]?.name ?? e.defId;
      const ende = e.verbrennt ?? e.dauer;
      const fertig = e.defId !== 'verkohlt' && this.#itemDefinitionen[e.defId] && e.dauer > 0 && e.zeit >= e.dauer;
      const verkohlt = e.defId === 'verkohlt';
      p.balken.hidden = !(e.dauer > 0) || (!e.verbrennt && fertig);
      fuellung.style.width = `${Math.min(100, (e.zeit / (ende || 1)) * 100)}%`;
      p.balken.classList.toggle('fertig', fertig && !verkohlt);
      p.balken.classList.toggle('gefahr', fertig && e.verbrennt && e.zeit >= e.dauer + (e.verbrennt - e.dauer) * 0.5);
      p.knopf.title = verkohlt ? `${name} – verbrannt!` : fertig ? `${name} – fertig, herausnehmen!` : `${name} …`;
      p.knopf.classList.toggle('fertig', fertig && !verkohlt);
      p.knopf.classList.toggle('verkohlt', verkohlt);
    });
    const inventar = this.#daten?.inventar ?? [];
    this.#inventar.forEach((s2, i) => {
      s2.knopf.hidden = i >= inventar.length;
      if (i >= inventar.length) return;
      const e = inventar[i] ?? null;
      s2.knopf.classList.toggle('leer', !e);
      s2.knopf.title = e ? (this.#itemDefinitionen[e.defId]?.name ?? e.defId) : '';
      s2.menge.textContent = e && e.menge > 1 ? String(e.menge) : '';
      const defId = e?.defId ?? null;
      if (s2.defId === defId) return;
      s2.defId = defId;
      this.zeichneIcon(s2.icon, defId);
    });
  }
}

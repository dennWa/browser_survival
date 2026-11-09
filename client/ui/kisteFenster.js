import { INVENTAR_MAX, KISTE_PLAETZE } from '../../gemeinsam/konstanten.js';

/**
 * Lagerkisten-Fenster (E an einer Kiste/Leiche): links der Behälter, rechts das eigene Inventar (Handy: untereinander).
 * Antippen/Klicken schiebt den ganzen Stapel: Kistenplatz → Inventar bzw. Inventarplatz → Kiste.
 * Der Server prüft alles (kistenSystem.js) und schickt den neuen Inhalt per KISTE-Nachricht zurück.
 * Runde 47: Beim Auto (Kofferraum, Taste G) oben das Auto-Menü: Tank, Reifen, Batterie, Karosserie + Knöpfe zum Tanken/Ein-/Ausbauen
 * (KISTE { auto: { tank, tankMax, reifen, batterie, leben, maxLeben, kaputt, fehlt[] } } → AKTION 'auto').
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
    this.titel = dokument.getElementById('kiste-titel');
    this.zaehler = dokument.getElementById('kiste-zaehler');
    this.zaehlerInv = dokument.getElementById('kiste-zaehler-inv');
    this.autoEl = dokument.getElementById('kiste-auto');
    this.alles = dokument.getElementById('kiste-alles');
    this.alles.addEventListener('click', () => (this.#inhalt ?? []).forEach((e, i) => e && this.#aktionen.nehmen?.(i)));
    dokument.getElementById('kiste-schliessen').addEventListener('click', () => this.#aktionen.schliessen?.());
    // Runde 32: Leichen toter Spieler haben mehr Plätze (Inventar + Rucksack + Kleidung) – überzählige Plätze bleiben verborgen
    for (let i = 0; i < Math.max(KISTE_PLAETZE, 44); i++) this.#kisten.push(this.#baueSlot(this.rasterKiste, i, (slot) => this.#aktionen.nehmen?.(slot)));
    for (let i = 0; i < INVENTAR_MAX; i++) this.#inventar.push(this.#baueSlot(this.rasterInventar, i, (slot) => this.#aktionen.legen?.(slot)));
  }

  /** @param aktionen { legen(slot), nehmen(slot), schliessen() } */
  beiAktionen(aktionen) {
    this.#aktionen = aktionen;
  }

  get offen() {
    return !this.el.hidden;
  }

  /** inhalt = Array(16) → öffnen/aktualisieren, null → schließen; auto = Zustand des Autos (Runde 47) oder null */
  zeige(inhalt, titel = null, auto = null) {
    this.#inhalt = inhalt;
    this.el.hidden = !inhalt;
    if (inhalt) this.titel.textContent = titel ?? '📦 Lagerkiste';
    this.#zeigeAuto(inhalt ? auto : null);
    if (inhalt) this.#zeichne();
  }

  /** Runde 47: Auto-Menü – was fehlt, was ist drin; Knöpfe nur, wenn passende Teile im Inventar liegen bzw. ausbaubar sind */
  #zeigeAuto(a) {
    this.autoEl.hidden = !a;
    this.#auto = a;
    if (!a) return;
    const d = this.dokument;
    const hat = (defId) => (this.#daten?.inventar ?? []).some((e) => e?.defId === defId);
    const zeile = (symbol, name, wert, ok, knoepfe) => {
      const z = d.createElement('div');
      z.className = `auto-zeile${ok ? '' : ' fehlt'}`;
      z.append(Object.assign(d.createElement('span'), { className: 'auto-symbol', textContent: symbol }), Object.assign(d.createElement('span'), { className: 'auto-name', textContent: name }), Object.assign(d.createElement('b'), { textContent: wert }));
      const leiste = d.createElement('span');
      leiste.className = 'auto-knoepfe';
      for (const [text, was, an] of knoepfe) {
        const b = Object.assign(d.createElement('button'), { type: 'button', textContent: text, disabled: !an });
        b.addEventListener('click', () => this.#aktionen.auto?.(was));
        leiste.append(b);
      }
      z.append(leiste);
      return z;
    };
    const kopf = d.createElement('div');
    kopf.className = `auto-status${a.fehlt.length || a.kaputt ? ' fehlt' : ''}`;
    kopf.textContent = a.kaputt ? '💥 Wrack – nichts mehr zu machen' : a.fehlt.length ? `🔧 Springt nicht an – es fehlt: ${a.fehlt.join(', ')}` : '✅ Fahrbereit';
    this.autoEl.replaceChildren(
      kopf,
      zeile('⛽', 'Tank', `${Math.round(a.tank)} / ${a.tankMax} L`, a.tank > 0, [['Tanken (Benzinkanister)', 'tanken', hat('benzin') && a.tank < a.tankMax]]),
      zeile('🛞', 'Reifen', `${a.reifen} / 4`, a.reifen >= 4, [['Montieren', 'reifenRein', hat('reifen') && a.reifen < 4], ['Abnehmen', 'reifenRaus', a.reifen > 0]]),
      zeile('🔋', 'Batterie', a.batterie ? 'drin' : 'fehlt', a.batterie, [['Einbauen', 'batterieRein', hat('autobatterie') && !a.batterie], ['Ausbauen', 'batterieRaus', a.batterie]]),
      zeile('🚗', 'Karosserie', `${Math.round((a.leben / a.maxLeben) * 100)} %`, !a.kaputt, []),
    );
  }

  #auto = null;

  setzeDaten(daten, itemDefinitionen) {
    this.#daten = daten;
    this.#itemDefinitionen = itemDefinitionen ?? {};
    if (this.offen) {
      this.#zeigeAuto(this.#auto); // Knöpfe hängen am Inventar (Kanister/Reifen/Batterie dabei?)
      this.#zeichne();
    }
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
    if (!def) return void (this.info.innerHTML = '<span class="kiste-hinweis">Antippen verschiebt den ganzen Stapel – links ins Inventar, rechts in den Behälter.</span>');
    const name = Object.assign(this.dokument.createElement('b'), { textContent: `${def.name}${eintrag.menge > 1 ? ` ×${eintrag.menge}` : ''}` });
    this.info.replaceChildren(name, def.beschreibung ?? '');
  }

  #zeichne() {
    this.#zeichneReihe(this.#kisten, this.#inhalt ?? [], this.#inhalt?.length ?? KISTE_PLAETZE);
    const inventar = this.#daten?.inventar ?? [];
    this.#zeichneReihe(this.#inventar, inventar, inventar.length);
    const belegt = (liste) => liste.filter(Boolean).length;
    const kiste = this.#inhalt ?? [];
    this.zaehler.textContent = `${belegt(kiste)} / ${kiste.length}`;
    this.zaehlerInv.textContent = `${belegt(inventar)} / ${inventar.length}`;
    this.alles.disabled = belegt(kiste) === 0;
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

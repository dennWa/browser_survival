import { KATEGORIEN, eintraegeDerKategorie } from '../kern/katalog.js';
import { esc } from './dialoge.js';

/**
 * Seitenleiste (Kategorien) → Bauleiste unten (Einträge der Kategorie) + Werkzeugleiste auf der Fläche.
 * Eintrag wählen setzt das passende Werkzeug: Kachel → malen, Objekt/Bauwerk/Marker → platzieren, Bereich → bereich …
 */
export const WERKZEUGE = [
  { id: 'auswahl', symbol: '⬚', titel: 'Auswahl (V) – Klick wählt, Ziehen verschiebt, ins Leere ziehen = Bereich markieren' },
  { id: 'hand', symbol: '✋', titel: 'Schwenken (H, Leertaste, mittlere Maustaste, 2 Finger)' },
  { trenner: true },
  { id: 'malen:pinsel', symbol: '🖌', titel: 'Pinsel (B)' },
  { id: 'malen:rechteck', symbol: '▭', titel: 'Rechteck (U) – Umschalt: nur Rand' },
  { id: 'malen:linie', symbol: '╱', titel: 'Linie / Mauer ziehen (L) – Mauern rasten ein, Umschalt: frei' },
  { id: 'malen:fuellen', symbol: '🪣', titel: 'Füllen (G)' },
  { id: 'radierer', symbol: '⌫', titel: 'Radierer (E) – Kacheln → Rasen, Objekte weg' },
  { id: 'pipette', symbol: '💧', titel: 'Pipette (I) – Kachel/Objekt übernehmen' },
  { trenner: true },
  { id: 'zone', symbol: '⤡', titel: 'Zone vergrößern/verkleinern (Z) – Griffe an Ecken und Kanten' },
  { id: 'drehen', symbol: '⟳', titel: 'Drehen 90° (R)' },
  { groesse: true },
];

export class Bauleiste {
  constructor({ zustand, aktionen }) {
    this.zustand = zustand;
    this.aktionen = aktionen;
    this.elKategorien = document.getElementById('kategorien');
    this.elLeiste = document.getElementById('bauleiste');
    this.elWerkzeuge = document.getElementById('werkzeuge');
    this.#baueKategorien();
    this.#baueWerkzeuge();
    this.zeigeKategorie(zustand.kategorie);
    zustand.bei('werkzeug', () => this.#aktualisiereWerkzeuge());
    zustand.bei('zone', () => this.zeigeKategorie(this.zustand.kategorie));
    zustand.bei('karte', (ops) => {
      if (ops.some((o) => o.s === 'raeume' || o.s === 'typen')) this.zeigeKategorie(this.zustand.kategorie);
    });
  }

  #baueKategorien() {
    this.elKategorien.innerHTML = '';
    for (const k of KATEGORIEN) {
      const b = document.createElement('button');
      b.textContent = k;
      b.dataset.kategorie = k;
      b.addEventListener('click', () => this.zeigeKategorie(k));
      this.elKategorien.append(b);
    }
  }

  zeigeKategorie(kategorie) {
    this.zustand.kategorie = kategorie;
    for (const b of this.elKategorien.children) b.classList.toggle('aktiv', b.dataset.kategorie === kategorie);
    const eintraege = [...eintraegeDerKategorie(kategorie, this.zustand.karte)];
    if (kategorie === 'Loot' && this.zustand.karte) {
      for (const [raum, r] of this.zustand.karte.s('raeume')) eintraege.push({ id: `loot:${raum}`, art: 'marker', marker: 'loot', raum, name: `${raum}: ${r.name}`, kategorie, symbol: '🎁', farbe: '#ffd23f' });
      eintraege.push({ id: 'aktion:raum', art: 'aktion', aktion: 'neuerRaum', name: 'Neuer Raum / Loot-Tabelle', kategorie, symbol: '➕' });
    }
    if (kategorie === 'Räume') eintraege.push({ id: 'aktion:prefab', art: 'aktion', aktion: 'prefabs', name: 'Prefabs (Vorlagen)', kategorie, symbol: '🏠' });
    if (kategorie === 'Zonen') eintraege.push({ id: 'aktion:zonen', art: 'aktion', aktion: 'zonen', name: 'Zonen-Übersicht', kategorie, symbol: '🗺' }, { id: 'aktion:vorschlaege', art: 'aktion', aktion: 'vorschlaege', name: 'Übergänge vorschlagen', kategorie, symbol: '💡' });
    if (kategorie === 'Eigene') eintraege.push({ id: 'aktion:neuerTyp', art: 'aktion', aktion: 'neuerTyp', name: 'Neues Objekt anlegen', kategorie, symbol: '✚' }, { id: 'aktion:bild3d', art: 'aktion', aktion: 'bild3d', name: 'Bild → 3D-Objekt', kategorie, symbol: '🖼' }, { id: 'aktion:grafik', art: 'aktion', aktion: 'grafik', name: 'Neue Grafik (Antrag)', kategorie, symbol: '🎨' });
    if (kategorie === 'Farbe') eintraege.push({ id: 'aktion:texturen', art: 'aktion', aktion: 'texturen', name: 'Farbe/Textur je Objekttyp', kategorie, symbol: '🎨' });
    this.eintraege = eintraege;
    this.elLeiste.innerHTML = eintraege.length ? '' : '<span class="leise" style="align-self:center">Keine Einträge</span>';
    for (const e of eintraege) {
      const b = document.createElement('button');
      b.title = `${e.name}${e.b ? ` (${e.b} × ${e.h}${e.blockiert ? ', blockiert' : ''})` : ''}`;
      b.dataset.id = e.id;
      b.innerHTML = `${e.art === 'kachel' ? `<span class="farbe" style="background:${esc(e.farbe)}"></span>` : `<span class="symbol">${esc(e.symbol)}</span>`}<span>${esc(e.name)}</span>`;
      b.addEventListener('click', () => this.waehle(e));
      this.elLeiste.append(b);
    }
    this.#markiereEintrag();
  }

  waehle(e) {
    const z = this.zustand;
    if (e.art === 'aktion') return this.aktionen.aktion(e.aktion);
    z.eintrag = e;
    if (e.art === 'kachel') z.setzeWerkzeug('malen');
    else if (e.art === 'objekt' || e.art === 'bauwerk' || e.art === 'marker') {
      if (e.marker === 'loot' && e.raum) z.lootRaum = e.raum;
      z.setzeWerkzeug('platzieren');
    } else if (e.art === 'bereich') z.setzeWerkzeug('bereich');
    else if (e.art === 'werkzeug') {
      if (e.werkzeug === 'wetter' || e.werkzeug === 'musik') {
        this.aktionen.aktion('zonenEinstellungen');
        return;
      }
      if (e.werkzeug === 'raumFuellen') z.setzeWerkzeug('raumFuellen');
      else if (e.werkzeug.startsWith('farbe')) z.setzeWerkzeug('farbe');
      else z.setzeWerkzeug('terrain');
    }
    z.meldung(`${e.name} gewählt${e.art === 'objekt' ? ' – Klick setzt, R dreht, Umschalt = mehrere' : ''}`);
    this.#markiereEintrag();
  }

  #markiereEintrag() {
    for (const b of this.elLeiste.children) b.classList?.toggle('aktiv', b.dataset.id === this.zustand.eintrag?.id);
  }

  #baueWerkzeuge() {
    this.elWerkzeuge.innerHTML = '';
    for (const w of WERKZEUGE) {
      if (w.trenner) {
        this.elWerkzeuge.append(Object.assign(document.createElement('div'), { className: 'trenner' }));
        continue;
      }
      if (w.groesse) {
        const div = document.createElement('div');
        div.innerHTML = '<button data-g="1" title="Pinsel größer (])">＋</button><div class="groesse" title="Pinselgröße">1</div><button data-g="-1" title="Pinsel kleiner ([)">－</button>';
        div.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => this.aktionen.pinselGroesse(Number(b.dataset.g))));
        this.elWerkzeuge.append(div);
        this.elGroesse = div.querySelector('.groesse');
        continue;
      }
      const b = document.createElement('button');
      b.textContent = w.symbol;
      b.title = w.titel;
      b.dataset.werkzeug = w.id;
      b.addEventListener('click', () => this.aktionen.werkzeug(w.id));
      this.elWerkzeuge.append(b);
    }
    this.#aktualisiereWerkzeuge();
  }

  #aktualisiereWerkzeuge() {
    const z = this.zustand;
    const aktiv = z.werkzeug === 'malen' ? `malen:${z.malModus}` : z.werkzeug;
    for (const b of this.elWerkzeuge.querySelectorAll('button[data-werkzeug]')) b.classList.toggle('aktiv', b.dataset.werkzeug === aktiv);
    if (this.elGroesse) this.elGroesse.textContent = String(z.pinselGroesse);
    this.#markiereEintrag();
  }
}

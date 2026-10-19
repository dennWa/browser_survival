import { GRUPPEN, KATEGORIEN, eintraegeDerKategorie, katalog, katalogEintrag, eigeneEintraege, passtZurSuche } from '../kern/katalog.js';
import { esc } from './dialoge.js';

/**
 * Asset-Browser (linke Seitenleiste, Reiter „Assets“, Editor 2.0 Schritt 1.3) – ersetzt Kategorie-Spalte + Bauleiste:
 *   Suche (Name, Typ, Kategorie, Gruppe; Umlaute egal) · ★ Favoriten · 🕘 Zuletzt benutzt · 7 aufklappbare Gruppen
 *   (kern/katalog.js GRUPPEN) mit den Kategorien als Unterüberschrift.
 * Eintrag wählen setzt das passende Werkzeug: Kachel → malen, Objekt/Bauwerk/Marker → platzieren, Bereich → bereich,
 * Werkzeug-Einträge (Terrain, Farbe, Raum füllen) → ihr Werkzeug, Aktions-Einträge (➕ Neuer Raum …) → aktionen[name].
 * Favoriten/Zuletzt/offene Gruppen: localStorage `browserSurvival.editorAssets`.
 */
const SPEICHER = 'browserSurvival.editorAssets';
const ZULETZT_MAX = 8;

/** Zusätzliche Aktions-Einträge je Kategorie (Räume der Zone als Loot-Punkte, Aktionen) */
function zusatzEintraege(kategorie, karte) {
  const liste = [];
  if (kategorie === 'Loot' && karte) {
    for (const [raum, r] of karte.s('raeume')) liste.push({ id: `loot:${raum}`, art: 'marker', marker: 'loot', raum, name: `Loot ${raum}: ${r.name}`, kategorie, symbol: '🎁', farbe: '#ffd23f' });
    liste.push({ id: 'aktion:raum', art: 'aktion', aktion: 'neuerRaum', name: 'Neuer Raum / Loot-Tabelle', kategorie, symbol: '➕' });
  }
  if (kategorie === 'Räume') liste.push({ id: 'aktion:prefab', art: 'aktion', aktion: 'prefabs', name: 'Prefabs (Vorlagen)', kategorie, symbol: '🏠' });
  if (kategorie === 'Zonen') liste.push({ id: 'aktion:zonen', art: 'aktion', aktion: 'zonen', name: 'Zonen-Übersicht', kategorie, symbol: '🗺' }, { id: 'aktion:vorschlaege', art: 'aktion', aktion: 'vorschlaege', name: 'Übergänge vorschlagen', kategorie, symbol: '💡' });
  if (kategorie === 'Eigene') liste.push({ id: 'aktion:neuerTyp', art: 'aktion', aktion: 'neuerTyp', name: 'Neues Objekt anlegen', kategorie, symbol: '✚' }, { id: 'aktion:bild3d', art: 'aktion', aktion: 'bild3d', name: 'Bild → 3D-Objekt', kategorie, symbol: '🖼' }, { id: 'aktion:modell3d', art: 'aktion', aktion: 'modell3d', name: '3D-Modell (.glb) laden', kategorie, symbol: '🧊' }, { id: 'aktion:grafik', art: 'aktion', aktion: 'grafik', name: 'Neue Grafik (Antrag)', kategorie, symbol: '🎨' });
  if (kategorie === 'Farbe') liste.push({ id: 'aktion:texturen', art: 'aktion', aktion: 'texturen', name: 'Farbe/Textur je Objekttyp', kategorie, symbol: '🎨' });
  return liste;
}

export class AssetBrowser {
  constructor({ zustand, leiste, aktionen }) {
    this.zustand = zustand;
    this.leiste = leiste;
    this.aktionen = aktionen;
    this.suche = '';
    const g = ladeGespeichert();
    this.favoriten = new Set(g.favoriten ?? []);
    this.zuletzt = g.zuletzt ?? [];
    this.zu = new Set(g.zu ?? []);
    // Gerüst einmal bauen; die Liste wird neu gezeichnet, das Suchfeld bleibt (Fokus!)
    this.wurzel = document.createElement('div');
    this.wurzel.className = 'asset-browser';
    this.wurzel.innerHTML = '<input type="search" class="asset-suche" placeholder="Assets suchen … (Strg+F)" aria-label="Assets suchen"><div class="asset-liste"></div>';
    this.eingabe = this.wurzel.querySelector('.asset-suche');
    this.liste = this.wurzel.querySelector('.asset-liste');
    this.eingabe.addEventListener('input', () => {
      this.suche = this.eingabe.value;
      this.zeichneListe();
    });
    this.eingabe.addEventListener('keydown', (e) => {
      e.stopPropagation(); // keine Werkzeug-Kürzel beim Tippen
      if (e.key === 'Enter') this.liste.querySelector('button.asset')?.click();
      if (e.key === 'Escape') {
        this.eingabe.value = this.suche = '';
        this.zeichneListe();
        this.eingabe.blur();
      }
    });
    this.liste.addEventListener('click', (e) => {
      const stern = e.target.closest('.stern');
      const knopf = e.target.closest('button.asset');
      if (!knopf) return;
      const eintrag = this.#eintrag(knopf.dataset.id);
      if (!eintrag) return;
      if (stern) {
        e.stopPropagation();
        this.favoriten.has(eintrag.id) ? this.favoriten.delete(eintrag.id) : this.favoriten.add(eintrag.id);
        this.#speichere();
        this.zeichneListe();
        return;
      }
      this.waehle(eintrag);
    });
    this.liste.addEventListener('toggle', (e) => {
      const name = e.target.dataset?.gruppe;
      if (!name) return;
      e.target.open ? this.zu.delete(name) : this.zu.add(name);
      this.#speichere();
    }, true);
    leiste.registriere('🧱 Assets', () => {
      if (leiste.el.firstChild !== this.wurzel) leiste.el.replaceChildren(this.wurzel);
      this.zeichneListe();
    }, { ereignisse: ['zone', 'eintrag'], ohneKarte: true });
    zustand.bei('karte', (ops) => ops.some((o) => o.s === 'raeume' || o.s === 'typen') && leiste.aktiv === '🧱 Assets' && this.zeichneListe());
  }

  /** Alle wählbaren Einträge (fest + eigene + Zusatz) */
  #alle() {
    const k = this.zustand.karte;
    return KATEGORIEN.flatMap((kat) => [...eintraegeDerKategorie(kat, k), ...zusatzEintraege(kat, k)]);
  }

  #eintrag(id) {
    return this.#alle().find((e) => e.id === id) ?? katalogEintrag(id, this.zustand.karte);
  }

  #kachel(e) {
    const aktiv = this.zustand.eintrag?.id === e.id;
    const vorschau = e.art === 'kachel' ? `<span class="farbe" style="background:${esc(e.farbe)}"></span>` : `<span class="symbol">${esc(e.symbol ?? '▪')}</span>`;
    const masse = e.b ? ` (${e.b} × ${e.h}${e.blockiert ? ', blockiert' : ''})` : '';
    const stern = e.art === 'aktion' ? '' : `<span class="stern${this.favoriten.has(e.id) ? ' an' : ''}" title="Favorit">${this.favoriten.has(e.id) ? '★' : '☆'}</span>`;
    return `<button type="button" class="asset${aktiv ? ' aktiv' : ''}" data-id="${esc(e.id)}" title="${esc(e.name + masse)}">${vorschau}<span class="name">${esc(e.name)}</span>${stern}</button>`;
  }

  zeichneListe() {
    const k = this.zustand.karte;
    const suche = this.suche.trim();
    const alle = this.#alle();
    const teile = [];
    if (suche) {
      const treffer = alle.filter((e) => passtZurSuche(e, suche));
      const einmal = [...new Map(treffer.map((e) => [e.id.split('@')[0], e])).values()];
      teile.push(einmal.length ? `<div class="asset-raster">${einmal.map((e) => this.#kachel(e)).join('')}</div>` : '<p class="leise">Nichts gefunden.</p>');
    } else {
      const fav = [...this.favoriten].map((id) => this.#eintrag(id)).filter(Boolean);
      if (fav.length) teile.push(`<h5>★ Favoriten</h5><div class="asset-raster">${fav.map((e) => this.#kachel(e)).join('')}</div>`);
      const zul = this.zuletzt.map((id) => this.#eintrag(id)).filter(Boolean);
      if (zul.length) teile.push(`<h5>🕘 Zuletzt</h5><div class="asset-raster">${zul.map((e) => this.#kachel(e)).join('')}</div>`);
      for (const g of GRUPPEN) {
        const gesehen = new Set();
        let inhalt = '';
        let n = 0;
        for (const kat of g.kategorien) {
          const eintraege = [...eintraegeDerKategorie(kat, k), ...zusatzEintraege(kat, k)].filter((e) => {
            const basis = e.id.split('@')[0];
            if (gesehen.has(basis)) return false;
            gesehen.add(basis);
            return true;
          });
          if (!eintraege.length) continue;
          n += eintraege.length;
          inhalt += `<h5>${esc(kat)}</h5><div class="asset-raster">${eintraege.map((e) => this.#kachel(e)).join('')}</div>`;
        }
        // Eigene Typen mit eigener (unbekannter) Kategorie landen in „Eigene“
        if (g.name === 'Eigene' && k) {
          const fremd = eigeneEintraege(k).filter((e) => !KATEGORIEN.includes(e.kategorie));
          if (fremd.length) {
            n += fremd.length;
            inhalt += `<h5>Weitere</h5><div class="asset-raster">${fremd.map((e) => this.#kachel(e)).join('')}</div>`;
          }
        }
        teile.push(`<details class="asset-gruppe" data-gruppe="${esc(g.name)}"${this.zu.has(g.name) ? '' : ' open'}><summary>${esc(g.symbol)} ${esc(g.name)} <span class="leise">${n}</span></summary>${inhalt}</details>`);
      }
    }
    this.liste.innerHTML = teile.join('');
  }

  /** Eintrag wählen → Werkzeug setzen (oder Aktion ausführen) */
  waehle(e) {
    const z = this.zustand;
    if (e.art === 'aktion') return this.aktionen[e.aktion]?.();
    if (e.art === 'werkzeug' && (e.werkzeug === 'wetter' || e.werkzeug === 'musik')) return this.aktionen.zonenEinstellungen?.(e.werkzeug === 'wetter' ? 'wetter' : null);
    if (z.ansicht === '3d') return z.meldung('Malen und Bauen gehen nur in 2D – Taste 3 schaltet um', 'fehler');
    z.setzeEintrag(e);
    if (e.art === 'kachel') this.aktionen.werkzeug(`malen:${z.malModus}`);
    else if (e.art === 'objekt' || e.art === 'bauwerk' || e.art === 'marker') {
      if (e.marker === 'loot' && e.raum) z.lootRaum = e.raum;
      this.aktionen.werkzeug('platzieren');
    } else if (e.art === 'bereich') this.aktionen.werkzeug('bereich');
    else if (e.art === 'werkzeug') {
      if (e.werkzeug === 'raumFuellen') this.aktionen.werkzeug('raumFuellen');
      else if (e.werkzeug.startsWith('farbe')) this.aktionen.werkzeug('farbe');
      else this.aktionen.werkzeug('terrain');
    }
    this.zuletzt = [e.id, ...this.zuletzt.filter((id) => id !== e.id)].slice(0, ZULETZT_MAX);
    this.#speichere();
    z.meldung(`${e.name} gewählt${e.art === 'objekt' ? ' – Klick setzt, R dreht, Umschalt = mehrere' : ''}`);
    if (this.leiste.aktiv === '🧱 Assets') this.zeichneListe();
  }

  /** Eintrag per ID wählen (Pipette, Menü „Einfügen“, Räume-Reiter) – mit Zusatzfeldern (z. B. Raum) */
  waehleId(id, extra = {}) {
    const e = this.#eintrag(id) ?? katalog().find((x) => x.id === id);
    if (e) this.waehle({ ...e, ...extra });
  }

  fokusSuche() {
    this.leiste.wurzel.hidden = false;
    this.leiste.zeige('🧱 Assets');
    this.eingabe.focus();
    this.eingabe.select();
  }

  #speichere() {
    try {
      localStorage.setItem(SPEICHER, JSON.stringify({ favoriten: [...this.favoriten], zuletzt: this.zuletzt, zu: [...this.zu] }));
    } catch {
      /* gesperrter Speicher */
    }
  }
}

function ladeGespeichert() {
  try {
    return JSON.parse(localStorage.getItem(SPEICHER) ?? '{}') ?? {};
  } catch {
    return {};
  }
}

import { GRUPPEN, KATEGORIEN, MODELL_KATEGORIEN, eintraegeDerKategorie, katalog, katalogEintrag, eigeneEintraege, passtZurSuche } from '../kern/katalog.js';
import { istWandEintrag } from '../kern/wand.js';
import { esc } from './dialoge.js';
import { lootVorlagenEintraege } from '../kern/bibliothekVorlagen.js';
import { ladeSpielordner, spielordnerListe, spielordnerTyp } from '../kern/spielordner.js';

/**
 * Baukasten (früher „Asset-Browser“; linke Seitenleiste, Reiter „🧱 Baukasten“, Editor 2.0 Schritt 1.3) – ersetzt Kategorie-Spalte + Bauleiste:
 *   Suche (Name, Typ, Kategorie, Gruppe; Umlaute egal) · ★ Favoriten · 🕘 Zuletzt benutzt · 7 aufklappbare Gruppen
 *   (kern/katalog.js GRUPPEN) mit den Kategorien als Unterüberschrift.
 * Eintrag wählen setzt das passende Werkzeug: Kachel → malen, Objekt/Bauwerk/Marker → platzieren, Bereich → bereich,
 * Werkzeug-Einträge (Terrain, Farbe, Raum füllen) → ihr Werkzeug, Aktions-Einträge (➕ Neuer Raum …) → aktionen[name].
 * Phase 10.7 (aufgeräumt): Gruppen als Chips oben („★ Schnell“ = Favoriten + Zuletzt, dann ⛰ Gelände, 🧱 Bauen …) – es ist
 * immer nur EINE Gruppe offen statt einer langen Liste; die Suche durchsucht alles. `zeigeEintrag(id)` springt zur Gruppe.
 * Favoriten/Zuletzt/gewählte Gruppe: localStorage `browserSurvival.editorAssets`.
 * 3D-Modelle der Projekt-Bibliothek (Phase 3) erscheinen als `bib:<id>` in ihrer Kategorie (mit Vorschaubild); Wählen legt
 * den Typ in der Zone an (aktionen.verwendeModell). Zonen-Typen, die auf ein vorhandenes Bibliotheks-Modell zeigen, werden
 * dafür nicht doppelt gezeigt. Bild → 3D und Grafik-Antrag sind ausgeblendet (Schritt 3.2, Code bleibt in eigeneUi.js).
 * 7.4 Bibliothek: Prefabs (`prefab:…`, art 'prefab', Vorschaubild aus prefabUi) als Gruppe „🏠 Prefabs“ + in Suche/Favoriten,
 * eigene Loot-Vorlagen in der Suche (öffnen die Verwaltung). Einträge lassen sich auf die Karte ziehen (HTML-Drag
 * 'application/x-editor-asset' → `ablegen(id, ereignis)`: Prefab wird dort eingefügt, Objekt/Bauwerk/Marker gesetzt).
 * Audio-Dateien (Phase 4) erscheinen in „Klänge“ als `klang:punkt:<id>` (art 'klang') → aktionen.klangSetzen (ui/audioUi.js).
 * Runde 19: die Spielordner-Modelle (client/assets/eigene/index.json, kern/spielordner.js) stehen direkt in ihrer Kategorie
 * als `sf:<name>` (art 'spielordner', Unterüberschrift „3D-Modelle“) – nur Name + Vorschaubild (lazy), die .glb lädt erst
 * die 3D-Ansicht. Wählen legt den Typ `sf_<name>_<dm>` (Standardhöhe) in der Zone an; diese Zonen-Typen werden nicht
 * doppelt gezeigt. Der frühere Dialog „Modelle → 📁 Spielordner“ ist dadurch entfallen.
 */
const SPEICHER = 'browserSurvival.editorAssets';
const ZULETZT_MAX = 8;

/** Zusätzliche Aktions-Einträge je Kategorie (Räume der Zone als Loot-Punkte, Aktionen) */
function zusatzEintraege(kategorie, karte) {
  const liste = [];
  if (kategorie === 'Loot' && karte) {
    for (const [raum, r] of karte.s('raeume')) liste.push({ id: `loot:${raum}`, art: 'marker', marker: 'loot', raum, name: `Loot ${raum}: ${r.name}`, kategorie, symbol: '🎁', farbe: '#ffd23f' });
    liste.push({ id: 'aktion:raum', art: 'aktion', aktion: 'neuerRaum', name: 'Neuer Raum / Loot-Tabelle', kategorie, symbol: '➕' }, { id: 'aktion:lootVorlagen', art: 'aktion', aktion: 'lootVorlagen', name: 'Loot-Vorlagen', kategorie, symbol: '📚' });
  }
  if (kategorie === 'Räume') liste.push({ id: 'aktion:prefab', art: 'aktion', aktion: 'prefabs', name: 'Prefabs (Vorlagen)', kategorie, symbol: '🏠' });
  if (kategorie === 'Zonen') liste.push({ id: 'aktion:zonen', art: 'aktion', aktion: 'zonen', name: 'Zonen-Übersicht', kategorie, symbol: '🗺' }, { id: 'aktion:vorschlaege', art: 'aktion', aktion: 'vorschlaege', name: 'Übergänge vorschlagen', kategorie, symbol: '💡' });
  if (kategorie === 'Eigene') liste.push({ id: 'aktion:modellHochladen', art: 'aktion', aktion: 'modellHochladen', name: '3D-Modelle hochladen', kategorie, symbol: '⬆' }, { id: 'aktion:modelle', art: 'aktion', aktion: 'modelle', name: 'Modell-Bibliothek', kategorie, symbol: '📦' }, { id: 'aktion:neuerTyp', art: 'aktion', aktion: 'neuerTyp', name: 'Platzhalter-Objekt anlegen', kategorie, symbol: '✚' });
  if (kategorie === 'Klänge') liste.push({ id: 'aktion:audioHochladen', art: 'aktion', aktion: 'audioHochladen', name: 'Audio hochladen', kategorie, symbol: '⬆' }, { id: 'aktion:audioReiter', art: 'aktion', aktion: 'audioReiter', name: 'Audio-Bibliothek (Ambiente, Musik)', kategorie, symbol: '🔊' });
  if (kategorie === 'Farbe') liste.push({ id: 'aktion:texturen', art: 'aktion', aktion: 'texturen', name: 'Farbe/Textur je Objekttyp', kategorie, symbol: '🎨' });
  return liste;
}

export class AssetBrowser {
  constructor({ zustand, leiste, aktionen, bibliothek = null, audioBibliothek = null }) {
    this.bibliothek = bibliothek;
    this.audioBibliothek = audioBibliothek;
    this.zustand = zustand;
    this.leiste = leiste;
    this.aktionen = aktionen;
    this.suche = '';
    const g = ladeGespeichert();
    this.favoriten = new Set(g.favoriten ?? []);
    this.zuletzt = g.zuletzt ?? [];
    this.zu = new Set(g.zu ?? []);
    this.gruppe = g.gruppe ?? null; // gewählter Chip (null = automatisch)
    // Gerüst einmal bauen; die Liste wird neu gezeichnet, das Suchfeld bleibt (Fokus!)
    this.wurzel = document.createElement('div');
    this.wurzel.className = 'asset-browser';
    this.wurzel.innerHTML = '<input type="search" class="asset-suche" placeholder="🔎 Suchen … (Strg+F)" aria-label="Baukasten durchsuchen"><div class="asset-chips" role="tablist" aria-label="Gruppen"></div><div class="asset-liste"></div>';
    this.eingabe = this.wurzel.querySelector('.asset-suche');
    this.liste = this.wurzel.querySelector('.asset-liste');
    this.chips = this.wurzel.querySelector('.asset-chips');
    this.chips.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-chip]');
      if (!b) return;
      this.gruppe = b.dataset.chip;
      this.#speichere();
      this.zeichneListe();
      this.liste.scrollTop = 0;
    });
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
    this.liste.addEventListener('dragstart', (e) => {
      const knopf = e.target.closest?.('button.asset[draggable]');
      if (knopf) e.dataTransfer.setData('application/x-editor-asset', knopf.dataset.id);
    });
    this.liste.addEventListener('toggle', (e) => {
      const name = e.target.dataset?.gruppe;
      if (!name) return;
      e.target.open ? this.zu.delete(name) : this.zu.add(name);
      this.#speichere();
    }, true);
    leiste.registriere('🧱 Baukasten', () => {
      if (leiste.el.firstChild !== this.wurzel) leiste.el.replaceChildren(this.wurzel);
      this.zeichneListe();
    }, { ereignisse: ['zone', 'eintrag', 'bibliothek', 'vorlagen'], ohneKarte: true });
    zustand.bei('karte', (ops) => ops.some((o) => o.s === 'raeume' || o.s === 'typen') && leiste.aktiv === '🧱 Baukasten' && this.zeichneListe());
    this.spielordner = [];
    // Spielordner-Katalog (ohne Spielserver fehlt er einfach)
    ladeSpielordner(new URL('../client/assets/eigene/', location.href))
      .then(() => {
        this.spielordner = spielordnerListe().map((m) => ({ id: `sf:${m.stem}`, art: 'spielordner', stem: m.stem, name: m.name, kategorie: MODELL_KATEGORIEN[m.kategorie] ?? 'Deko', symbol: '🧊', vorschau: m.vorschau, tags: ['modell', '3d', m.kategorie], hoehe: m.hoehe }));
        if (leiste.aktiv === '🧱 Baukasten') this.zeichneListe();
      })
      .catch(() => {});
  }

  /** Bibliotheks-Modelle als Einträge */
  #modelle() {
    return (this.bibliothek?.liste ?? []).map((m) => ({ id: `bib:${m.id}`, art: 'bibliothek', asset: m.id, name: m.name, kategorie: KATEGORIEN.includes(m.kategorie) ? m.kategorie : 'Eigene', symbol: '🧊', vorschau: m.vorschau, tags: [...m.tags, m.ordner, 'modell', '3d'].filter(Boolean), b: m.masse.b, h: m.masse.h }));
  }

  /** Einträge einer Kategorie: fest + Zonen-Typen (ohne die, die ein Bibliotheks-Modell schon zeigt) + Modelle + Zusatz */
  #derKategorie(kat, k) {
    // Zonen-Typen, die ein Bibliotheks- oder Spielordner-Modell schon zeigt, nicht doppelt
    const ausBibliothek = (e) => e.eigen && (this.bibliothek?.meta(k?.s('typen').get(e.typ)?.asset) || (e.typ?.startsWith('sf_') && k?.s('typen').get(e.typ)?.glbDatei));
    const klaenge = kat === 'Klänge' ? (this.audioBibliothek?.liste ?? []).map((m) => ({ id: `klang:punkt:${m.id}`, art: 'klang', klangArt: 'punkt', audio: m.id, name: m.name, kategorie: kat, symbol: '🔊', tags: [...m.tags, m.ordner, 'klang', 'audio', 'sound'].filter(Boolean) })) : [];
    return [...eintraegeDerKategorie(kat, k).filter((e) => !ausBibliothek(e)), ...this.#modelle().filter((e) => e.kategorie === kat), ...klaenge, ...zusatzEintraege(kat, k), ...this.spielordner.filter((e) => e.kategorie === kat)];
  }

  /** Alle wählbaren Einträge (fest + eigene + Modelle + Zusatz) */
  #alle() {
    const k = this.zustand.karte;
    return [...KATEGORIEN.flatMap((kat) => this.#derKategorie(kat, k)), ...this.#vorlagen()];
  }

  /** 7.4: Prefabs + eigene Loot-Vorlagen */
  #vorlagen() {
    return [...(this.aktionen.prefabEintraege?.() ?? []), ...lootVorlagenEintraege(this.aktionen.lootVorlagenEigene?.() ?? {})];
  }

  #eintrag(id) {
    return this.#alle().find((e) => e.id === id) ?? katalogEintrag(id, this.zustand.karte);
  }

  #kachel(e) {
    const aktiv = this.zustand.eintrag?.id === e.id;
    const bild = e.art === 'prefab' ? this.aktionen.prefabVorschau?.(e.vorlage) : e.vorschau ?? (e.eigen ? this.bibliothek?.meta(this.zustand.karte?.s('typen').get(e.typ)?.asset)?.vorschau : null);
    const vorschau = e.art === 'kachel' ? `<span class="farbe" style="background:${esc(e.farbe)}"></span>` : bild ? `<img class="vorschau" src="${esc(bild)}" alt="" loading="lazy" decoding="async">` : `<span class="symbol">${esc(e.symbol ?? '▪')}</span>`;
    const masse = e.b ? ` (${e.b} × ${e.h}${e.blockiert ? ', blockiert' : ''})` : e.art === 'spielordner' ? ` (3D-Modell, ${e.hoehe} m hoch)` : '';
    const stern = e.art === 'aktion' ? '' : `<span class="stern${this.favoriten.has(e.id) ? ' an' : ''}" title="Favorit">${this.favoriten.has(e.id) ? '★' : '☆'}</span>`;
    return `<button type="button" class="asset${aktiv ? ' aktiv' : ''}"${e.art === 'aktion' ? '' : ' draggable="true"'} data-id="${esc(e.id)}" title="${esc(e.name + masse)}">${vorschau}<span class="name">${esc(e.name)}</span>${stern}</button>`;
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
      const zul = this.zuletzt.map((id) => this.#eintrag(id)).filter(Boolean);
      const prefabs = this.aktionen.prefabEintraege?.() ?? [];
      const chips = [{ id: 'schnell', text: '★ Schnell', titel: 'Favoriten und zuletzt benutzt' }, ...GRUPPEN.map((g) => ({ id: g.name, text: `${g.symbol} ${g.name}`, titel: g.kategorien.join(', ') })), ...(prefabs.length ? [{ id: 'Prefabs', text: '🏠 Prefabs', titel: 'Fertige Bausteine (Häuser …)' }] : [])];
      if (!chips.some((c) => c.id === this.gruppe)) this.gruppe = fav.length || zul.length ? 'schnell' : GRUPPEN[0].name;
      this.chips.innerHTML = chips.map((c) => `<button type="button" role="tab" data-chip="${esc(c.id)}" class="${c.id === this.gruppe ? 'aktiv' : ''}" title="${esc(c.titel)}">${esc(c.text)}</button>`).join('');
      if (this.gruppe === 'schnell') {
        if (fav.length) teile.push(`<h5>★ Favoriten</h5><div class="asset-raster">${fav.map((e) => this.#kachel(e)).join('')}</div>`);
        if (zul.length) teile.push(`<h5>🕘 Zuletzt</h5><div class="asset-raster">${zul.map((e) => this.#kachel(e)).join('')}</div>`);
        if (!fav.length && !zul.length) teile.push('<p class="leise">Noch leer – benutzte Bausteine erscheinen hier, ☆ an einem Baustein macht ihn zum Favoriten.</p>');
      }
      for (const g of GRUPPEN.filter((x) => x.name === this.gruppe)) {
        const gesehen = new Set();
        let inhalt = '';
        let n = 0;
        for (const kat of g.kategorien) {
          const eintraege = this.#derKategorie(kat, k).filter((e) => {
            const basis = e.id.split('@')[0];
            if (gesehen.has(basis)) return false;
            gesehen.add(basis);
            return true;
          });
          if (!eintraege.length) continue;
          n += eintraege.length;
          const fest = eintraege.filter((e) => e.art !== 'spielordner');
          const modelle = eintraege.filter((e) => e.art === 'spielordner');
          inhalt += `<h5>${esc(kat)}</h5>`;
          if (fest.length) inhalt += `<div class="asset-raster">${fest.map((e) => this.#kachel(e)).join('')}</div>`;
          if (modelle.length) inhalt += `<h6 class="asset-unter">🧊 3D-Modelle (${modelle.length})</h6><div class="asset-raster mit-bild">${modelle.map((e) => this.#kachel(e)).join('')}</div>`;
        }
        // Eigene Typen mit eigener (unbekannter) Kategorie landen in „Eigene“
        if (g.name === 'Eigene' && k) {
          const fremd = eigeneEintraege(k).filter((e) => !KATEGORIEN.includes(e.kategorie) && !this.bibliothek?.meta(k.s('typen').get(e.typ)?.asset));
          if (fremd.length) {
            n += fremd.length;
            inhalt += `<h5>Weitere</h5><div class="asset-raster">${fremd.map((e) => this.#kachel(e)).join('')}</div>`;
          }
        }
        teile.push(`<div class="asset-gruppe" data-gruppe="${esc(g.name)}">${inhalt || '<p class="leise">Leer.</p>'}</div>`);
      }
      if (this.gruppe === 'Prefabs') teile.push(`<div class="asset-gruppe" data-gruppe="Prefabs"><div class="asset-raster">${prefabs.map((e) => this.#kachel(e)).join('')}</div></div>`);
    }
    this.chips.hidden = !!suche;
    this.liste.innerHTML = teile.join('');
  }

  /** Eintrag wählen → Werkzeug setzen (oder Aktion ausführen) */
  waehle(e) {
    const z = this.zustand;
    if (e.art === 'aktion') return this.aktionen[e.aktion]?.();
    if (e.art === 'prefab') {
      if (!z.karte) return z.meldung('Erst eine Zone öffnen', 'fehler');
      this.zuletzt = [e.id, ...this.zuletzt.filter((id) => id !== e.id)].slice(0, ZULETZT_MAX);
      this.#speichere();
      return this.aktionen.einfuegen(e.vorlage);
    }
    if (e.art === 'klang') {
      this.zuletzt = [e.id, ...this.zuletzt.filter((id) => id !== e.id)].slice(0, ZULETZT_MAX);
      this.#speichere();
      return this.aktionen.klangSetzen?.(e.audio, e.klangArt);
    }
    if (e.art === 'spielordner') {
      // Runde 19: Modell aus dem Spielordner → Typ in der Zone (Standardhöhe), dann wie ein eigener Typ platzieren
      if (!z.karte) return z.meldung('Erst eine Zone öffnen', 'fehler');
      const sf = spielordnerTyp(e.stem);
      if (!sf) return z.meldung(`Modell „${e.name}“ fehlt im Spielordner`, 'fehler');
      if (!z.karte.s('typen').has(sf.typId)) z.ausfuehren(`Modell „${e.name}“ in die Zone`, [{ s: 'typen', k: sf.typId, neu: sf.typ }]);
      this.zuletzt = [e.id, ...this.zuletzt.filter((id) => id !== e.id)].slice(0, ZULETZT_MAX);
      this.#speichere();
      return this.aktionen.waehleKatalog(`eigen:${sf.typId}`);
    }
    if (e.art === 'bibliothek') {
      // 6.6: Bibliotheks-Modelle lassen sich auch in 3D setzen (Klick auf den Boden)
      this.zuletzt = [e.id, ...this.zuletzt.filter((id) => id !== e.id)].slice(0, ZULETZT_MAX);
      this.#speichere();
      return this.aktionen.verwendeModell?.(e.asset);
    }
    if (e.art === 'werkzeug' && (e.werkzeug === 'wetter' || e.werkzeug === 'musik')) return this.aktionen.zonenEinstellungen?.(e.werkzeug === 'wetter' ? 'wetter' : null);
    // 6.6: in 3D gehen Objekte, Bauwerke und Marker (Klick auf den Boden) – Boden malen, Bereiche, Gelände nur in 2D
    if (z.ansicht === '3d' && !['objekt', 'bauwerk', 'marker'].includes(e.art)) return z.meldung('Boden malen, Bereiche und Gelände gehen nur in 2D – Taste 3 schaltet um (Objekte/Marker gehen auch in 3D)', 'fehler');
    z.setzeEintrag(e);
    if (e.art === 'kachel') {
      // Mauern werden gezogen (Linie) – danach kehrt der vorige Mal-Modus für Böden zurück
      if (istWandEintrag(e)) {
        if (z.malModus !== 'linie') z.malModusVorWand = z.malModus;
        this.aktionen.werkzeug('malen:linie');
      } else {
        if (z.malModusVorWand) z.malModus = z.malModusVorWand;
        z.malModusVorWand = null;
        this.aktionen.werkzeug(`malen:${z.malModus}`);
      }
    }
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
    z.meldung(`${e.name} gewählt${istWandEintrag(e) ? ' – Maustaste halten und ziehen (Strg = Raum-Umriss, Umschalt = frei)' : e.art === 'objekt' ? ' – Klick setzt, R dreht, Umschalt = mehrere' : ''}`);
    if (this.leiste.aktiv === '🧱 Baukasten') this.zeichneListe();
  }

  /** 7.4: Eintrag auf die Karte gezogen → dort einfügen/setzen (ereignis = Drop-Ereignis mit clientX/Y) */
  ablegen(id, ereignis) {
    const z = this.zustand;
    const e = this.#eintrag(id);
    if (!e || !z.karte) return;
    if (z.ansicht === '3d') return z.meldung('Ablegen geht nur in 2D – Taste 3 schaltet um', 'fehler');
    const p = this.aktionen.kartenPunkt?.(ereignis);
    if (!p) return;
    if (e.art === 'prefab') return this.aktionen.einfuegenBei(e.vorlage, p.tx - Math.floor(e.vorlage.b / 2), p.ty - Math.floor(e.vorlage.h / 2));
    this.waehle(e);
    // Modelle (Bibliothek/Spielordner) wählen einen Zonen-Typ mit anderer ID
    if (z.werkzeug === 'platzieren' && (z.eintrag?.id === e.id || e.art === 'spielordner' || e.art === 'bibliothek')) this.aktionen.platziereBei?.(ereignis);
  }

  /** Eintrag per ID wählen (Pipette, Menü „Einfügen“, Räume-Reiter) – mit Zusatzfeldern (z. B. Raum) */
  waehleId(id, extra = {}) {
    if (!this.suche.trim() && this.gruppe !== 'schnell') this.zeigeEintrag(id);
    const e = this.#eintrag(id) ?? katalog().find((x) => x.id === id);
    if (e) this.waehle({ ...e, ...extra });
  }

  /** Zur Gruppe springen, in der ein Eintrag liegt (Rauchtest, Pipette, Menü) – danach ist sein Knopf sichtbar */
  zeigeEintrag(id) {
    const basis = id.split('@')[0];
    const k = this.zustand.karte;
    const g = id.startsWith('prefab:') ? 'Prefabs' : GRUPPEN.find((x) => x.kategorien.some((kat) => this.#derKategorie(kat, k).some((e) => e.id.split('@')[0] === basis)))?.name;
    if (g && g !== this.gruppe) {
      this.gruppe = g;
      this.zeichneListe();
    }
  }

  fokusSuche() {
    this.leiste.wurzel.hidden = false;
    this.leiste.zeige('🧱 Baukasten');
    this.eingabe.focus();
    this.eingabe.select();
  }

  #speichere() {
    try {
      localStorage.setItem(SPEICHER, JSON.stringify({ favoriten: [...this.favoriten], zuletzt: this.zuletzt, zu: [...this.zu], gruppe: this.gruppe }));
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

import { ModellWerk, GRUNDKOERPER } from './modellWerk.js';
import { MODELL_EBENEN, freierStem, verwendungen, angleichOps, pruefeModellFelder } from '../kern/modelle.js';
import { MODELL_KATEGORIEN } from '../../editor/kern/katalog.js';
import { ANIMATIONS_ARTEN } from '../../editor/kern/animation.js';
import { EFFEKTE } from './malen.js';
import { setzeSpielordner } from '../../editor/kern/spielordner.js';
import { icon } from '../oberflaeche/icons.js';
import { dialog, formular, frage, melde, esc } from '../oberflaeche/dialoge.js';

/**
 * Modell-Werkstatt – Arbeitsbereich (Studio Phase 3). Vollbild-Ebene #werkstatt über dem Karten-Editor:
 *   links   Bibliothek: alle Modelle aus client/assets/eigene/index.json (Vorschaubild, Suche, Bereich), „Neues Modell“
 *   Mitte   Bühne (werkstatt/modellWerk.js) + Leiste: Gizmo W/E/R, Raster-Schritt, Blick, Hilfen (Raster, Figur, Grundfläche, Drahtgitter)
 *   rechts  Reiter Modell (Spiel-Einstellungen, Ausrichten, Info, „benutzt in“) · Teile (Baum, Lage, Grundkörper) ·
 *           Material (Farbe/Rauheit/Metall, Textur, Farbton) · Animation (Clips, Leerlauf, neue Bewegung)
 * Speichern: geänderte Geometrie → neue .glb (alte wird gesichert, Projekt.speichereModell) + Vorschaubild; nur Einstellungen →
 * index.json (modell.einstellen). Danach werden offene Zonen, die das Modell benutzen, angeglichen (angleichOps, je Zone 1 Undo).
 * Tastatur (nur solange offen): W/E/R Gizmo, Strg+Z/Y, Strg+S, Entf = Teil löschen, Strg+D = duplizieren, F = Ansicht, Esc = Auswahl weg.
 * KI/MCP: studio/kern/kiModelle.js ruft dieselben Methoden (studio.werkstatt.*, studio.werkstatt.werk.*).
 */
const REITER = [['modell', 'Modell'], ['teile', 'Teile'], ['knochen', 'Knochen'], ['material', 'Material'], ['malen', 'Malen'], ['animation', 'Animation']];

export class Werkstatt {
  constructor(studio) {
    this.studio = studio;
    this.el = document.getElementById('werkstatt');
    this.offen = false;
    this.werk = null;
    this.stem = null; // null = neues, noch ungespeichertes Modell
    this.index = [];
    this.reiter = 'modell';
    this.suche = '';
    this.bereich = '';
    this.einstellungenGeaendert = false;
  }

  // ---------- Öffnen / Schließen ----------
  async oeffne(stem = undefined) {
    if (!this.werk) this.#baue();
    this.el.classList.add('offen');
    this.offen = true;
    this.werk.groesse();
    this.werk.starte();
    this.index = await this.studio.nativ.aufruf('projekt.modellIndex');
    this.#bibliothek();
    if (stem !== undefined && stem !== this.stem) await this.lade(stem);
    else if (this.stem === null && !this.werk.eintrag) await this.neu('Neues Modell');
    this.#zeichne();
  }

  async schliesse() {
    if (!(await this.#verwerfenOk())) return false;
    this.el.classList.remove('offen');
    this.offen = false;
    this.werk?.stoppeAnimation();
    this.werk?.halte();
    return true;
  }

  get geaendert() {
    return !!this.werk && (this.werk.zurueck.length > 0 || this.einstellungenGeaendert);
  }

  async #verwerfenOk() {
    if (!this.geaendert) return true;
    return frage('Ungespeicherte Änderungen', `„${esc(this.werk.eintrag?.name)}“ hat ungespeicherte Änderungen. Verwerfen?`, { ja: 'Verwerfen', gefahr: true });
  }

  /** Modell aus dem Spielordner laden (stem = Dateiname ohne .glb) */
  async lade(stem, { ohneFrage = false } = {}) {
    if (!ohneFrage && !(await this.#verwerfenOk())) return false;
    const e = this.index.find((x) => x.datei === `${stem}.glb`);
    if (!e) throw new Error(`Modell „${stem}“ gibt es nicht (modelle_liste)`);
    const antwort = await fetch(`../client/assets/eigene/${stem}.glb`, { cache: 'no-store' });
    if (!antwort.ok) throw new Error(`${stem}.glb nicht lesbar (${antwort.status})`);
    await this.werk.lade(new Uint8Array(await antwort.arrayBuffer()), e);
    this.stem = stem;
    this.einstellungenGeaendert = false;
    this.#zeichne();
    this.studio.hinweis(`Werkstatt: „${e.name}“ geladen`);
    return true;
  }

  async neu(name = 'Neues Modell', { ohneFrage = false } = {}) {
    if (!ohneFrage && !(await this.#verwerfenOk())) return false;
    await this.werk.lade(null, { name, kategorie: 'deko' });
    this.stem = null;
    this.einstellungenGeaendert = true;
    this.#zeichne();
    return true;
  }

  /** Spiel-/Katalog-Einstellungen (vorgemerkt bis Speichern): name, kategorie, zielHoehe, blockiert, ebene, fuss, urheber, lizenz, url */
  einstellen(felder) {
    this.werk.stoppeAnimation();
    const p = pruefeModellFelder(felder);
    const e = this.werk.eintrag;
    for (const [k, v] of Object.entries(p)) {
      if (v === null) delete e[k];
      else e[k] = v;
    }
    if ('zielHoehe' in p) this.werk.hoeheAuto = false;
    this.einstellungenGeaendert = true;
    this.werk.beiAenderung?.('einstellungen');
    return e;
  }

  // ---------- Speichern ----------
  /** @param kopie Name/Dateiname für eine neue Datei (sonst wird das geladene Modell ersetzt) @returns Ergebnis-Text */
  async speichere({ kopie = null } = {}) {
    const w = this.werk;
    w.stoppeAnimation(); // Maße in Ruhepose messen
    const e = w.eintrag;
    const neu = this.stem === null || !!kopie;
    const geometrie = neu || w.zurueck.length > 0;
    const vorhandene = this.index.map((x) => x.datei);
    const stem = neu ? freierStem(kopie || e.name, vorhandene) : this.stem;
    const masse = w.masse();
    if (!masse) throw new Error('Das Modell ist leer');
    const felder = { name: kopie || e.name, kategorie: e.kategorie || 'deko', masse, zielHoehe: w.hoeheAuto ? masse.hoehe : w.spielHoehe };
    for (const k of ['blockiert', 'ebene', 'fuss', 'urheber', 'lizenz', 'url']) felder[k] = e[k] ?? null;
    felder.leerlauf = w.leerlauf || null;
    if (felder.ebene === undefined) felder.ebene = null;
    let text;
    if (geometrie) {
      const bytes = await w.exportiere();
      const vorschau = await w.vorschauPng();
      const r = await this.studio.nativ.aufruf('modell.speichern', { stem, bytes, vorschau, felder, neu });
      text = `${stem}.glb gespeichert${r.sicherung ? ` (alte Fassung: ${r.sicherung})` : ''}`;
    } else {
      await this.studio.nativ.aufruf('modell.einstellen', { datei: `${stem}.glb`, felder });
      text = `Einstellungen von ${stem}.glb gespeichert`;
    }
    this.index = await this.studio.nativ.aufruf('projekt.modellIndex');
    setzeSpielordner(this.index);
    w.eintrag = { ...this.index.find((x) => x.datei === `${stem}.glb`) };
    w.hoeheAuto = false;
    w.zurueck = [];
    w.vor = [];
    this.stem = stem;
    this.einstellungenGeaendert = false;
    const angeglichen = this.#angleichen(stem, w.eintrag);
    if (angeglichen) text += ` · ${angeglichen} offene Zone(n) angeglichen`;
    this.vorschauStand = Date.now();
    this.#bibliothek();
    this.#zeichne();
    this.studio.assets?.zeichne();
    this.studio.ansicht.objekteSchmutzig = true;
    this.studio.ansicht.anfordern();
    this.studio.hinweis(text, 'erfolg');
    return text;
  }

  /** Offene Zonen, die das Modell benutzen, an Kollision/Ebene/Leerlauf angleichen (je Zone ein Undo-Schritt) */
  #angleichen(stem, eintrag) {
    const { dok } = this.studio;
    let n = 0;
    for (const [id, z] of dok.zonen) {
      const ops = angleichOps(z.karte, stem, eintrag);
      if (!ops.length) continue;
      if (id === dok.aktivId) dok.aendere(`Modell „${eintrag.name}“ angeglichen`, ops);
      else z.verlauf.ausfuehren(z.karte, `Modell „${eintrag.name}“ angeglichen`, ops);
      n++;
    }
    return n;
  }

  /** Geladenes Modell löschen (Papierkorb) und ein neues, leeres Modell beginnen */
  async loesche() {
    if (this.stem === null) throw new Error('Das Modell ist noch nicht gespeichert');
    const stem = this.stem;
    const r = await this.studio.nativ.aufruf('modell.loeschen', { stem });
    this.index = await this.studio.nativ.aufruf('projekt.modellIndex');
    setzeSpielordner(this.index);
    this.einstellungenGeaendert = false;
    this.werk.zurueck = [];
    await this.neu('Neues Modell', { ohneFrage: true });
    this.#bibliothek();
    this.studio.assets?.zeichne();
    this.studio.hinweis(`${stem}.glb gelöscht (Papierkorb: Datei → Papierkorb)`, 'erfolg');
    return r;
  }

  verwendung() {
    return this.stem ? verwendungen(this.studio.zonenKarten(), this.stem) : [];
  }

  async sicherungen() {
    if (!this.stem) return melde('Sicherungen', 'Das Modell ist noch nicht gespeichert.');
    const liste = await this.studio.nativ.aufruf('modell.sicherungen', { stem: this.stem });
    if (!liste.length) return melde('Sicherungen', 'Noch keine Sicherungen – jede gespeicherte Änderung legt die alte Fassung unter <code>.studio/modelle/</code> ab.');
    const f = formular([{ name: 'sicherung', titel: 'Fassung', art: 'auswahl', wert: liste[0].datei, werte: liste.map((s) => [s.datei, `${s.zeit.replace('T', ' ').slice(0, 19)} · ${Math.round(s.groesse / 1024)} KB`]) }, { art: 'hinweis', html: 'Die aktuelle Fassung wird dabei selbst gesichert.' }]);
    const w = await dialog({ titel: `Sicherung von ${this.stem}.glb zurückholen`, icon: 'versionen', inhalt: f.element, knoepfe: [{ text: 'Abbrechen', wert: null }, { text: 'Zurückholen', art: 'primaer', wert: () => f.werte() }] });
    if (!w) return;
    await this.studio.nativ.aufruf('modell.wiederherstellen', { stem: this.stem, sicherung: w.sicherung });
    this.index = await this.studio.nativ.aufruf('projekt.modellIndex');
    await this.lade(this.stem, { ohneFrage: true });
    this.studio.hinweis('Sicherung zurückgeholt', 'erfolg');
  }

  // ---------- Aufbau ----------
  #baue() {
    this.el.innerHTML = `
      <header class="ws-kopf">
        <button class="knopf flach" data-ws="zurueck" data-tipp="Zurück zum Karten-Editor" data-kuerzel="Esc">${icon('pfeilRechts', 15)} Karten</button>
        <span class="ws-titel">${icon('modell', 16)} Modell-Werkstatt <b id="ws-name"></b> <span id="ws-status" class="neben"></span></span>
        <div class="ws-aktionen">
          <button class="knopf flach" data-ws="rueckgaengig" data-tipp="Rückgängig" data-kuerzel="Strg+Z">${icon('rueckgaengig', 15)}</button>
          <button class="knopf flach" data-ws="wiederholen" data-tipp="Wiederholen" data-kuerzel="Strg+Y">${icon('wiederholen', 15)}</button>
          <button class="knopf flach" data-ws="sicherungen" data-tipp="Sicherungen" data-text="Ältere Fassungen zurückholen">${icon('versionen', 15)}</button>
          <button class="knopf flach" data-ws="loeschen" data-tipp="Modell löschen" data-text="Wandert in den Papierkorb (20 Tage)">${icon('loeschen', 15)}</button>
          <button class="knopf" data-ws="kopie">${icon('kopieren', 14)} Als Kopie …</button>
          <button class="knopf primaer" data-ws="speichern" data-kuerzel="Strg+S">${icon('speichern', 14)} Speichern</button>
        </div>
      </header>
      <div class="ws-mitte">
        <aside class="panel ws-links">
          <header class="panel-kopf"><span>Modelle</span><div class="panel-aktionen"><button class="knopf flach" data-ws="neu" data-tipp="Neues Modell" data-text="Aus Grundkörpern zusammensetzen">${icon('plus', 15)}</button></div></header>
          <div class="ws-filter"><input class="feld" id="ws-suche" placeholder="Suchen…" /><select class="feld" id="ws-bereich"><option value="">Alle Bereiche</option>${Object.entries(MODELL_KATEGORIEN).map(([k, t]) => `<option value="${k}">${esc(t)}</option>`).join('')}</select></div>
          <div class="panel-inhalt" id="ws-liste"></div>
        </aside>
        <section class="ws-buehne">
          <div class="ws-leiste">
            <div class="glas"><div class="segment" id="ws-gizmo">
              <button data-gizmo="translate" class="aktiv" data-tipp="Schieben" data-kuerzel="W">${icon('bewegen', 15)}</button>
              <button data-gizmo="rotate" data-tipp="Drehen" data-kuerzel="E">${icon('drehen', 15)}</button>
              <button data-gizmo="scale" data-tipp="Größe" data-kuerzel="R">${icon('skalieren', 15)}</button>
              <button data-ws="einrasten" data-tipp="Einrasten" data-text="0,1 m · 15° · 0,1×">${icon('raster', 15)}</button>
            </div></div>
            <div class="glas"><div class="segment">${['schraeg', 'vorne', 'seite', 'oben'].map((b) => `<button data-blick="${b}">${{ schraeg: '3D', vorne: 'Vorne', seite: 'Seite', oben: 'Oben' }[b]}</button>`).join('')}</div></div>
            <div class="glas"><div class="segment" id="ws-hilfen">
              <button data-hilfe="raster" class="aktiv" data-tipp="Raster (1 Kästchen = 1 Kachel = 1 m)">${icon('raster', 15)}</button>
              <button data-hilfe="figur" class="aktiv" data-tipp="Figur (1,8 m) zum Vergleich">${icon('start', 15)}</button>
              <button data-hilfe="fuss" class="aktiv" data-tipp="Grundfläche im Spiel">${icon('flaeche', 15)}</button>
              <button data-hilfe="drahtgitter" data-tipp="Drahtgitter">${icon('ebenen', 15)}</button>
            </div></div>
          </div>
          <canvas id="ws-leinwand" tabindex="0"></canvas>
          <div class="ws-fuss" id="ws-info"></div>
        </section>
        <aside class="panel ws-rechts">
          <header class="panel-kopf"><div class="reiter" id="ws-reiter">${REITER.map(([id, t]) => `<button data-reiter="${id}">${t}</button>`).join('')}</div></header>
          <div class="panel-inhalt" id="ws-panel"></div>
        </aside>
      </div>`;
    this.werk = new ModellWerk(this.el.querySelector('#ws-leinwand'));
    this.werk.beiAenderung = () => this.#zeichne();
    this.werk.beiAuswahl = () => {
      if (this.werk.gewaehlt && this.reiter === 'modell') this.reiter = 'teile';
      this.#zeichne();
    };
    this.#verbinde();
  }

  #verbinde() {
    const el = this.el;
    const sicher = (f) => async (...a) => {
      try {
        await f(...a);
      } catch (e) {
        this.studio.hinweis(e.message, 'fehler');
      }
    };
    el.addEventListener('click', sicher(async (e) => {
      const t = e.target.closest('[data-ws],[data-gizmo],[data-blick],[data-hilfe],[data-reiter],[data-modell],[data-teil],[data-aktion]');
      if (!t) return;
      const d = t.dataset;
      if (d.ws === 'zurueck') return this.schliesse();
      if (d.ws === 'rueckgaengig') return this.werk.rueckgaengig();
      if (d.ws === 'wiederholen') return this.werk.wiederholen();
      if (d.ws === 'speichern') return this.speichere();
      if (d.ws === 'sicherungen') return this.sicherungen();
      if (d.ws === 'loeschen') {
        if (this.stem === null) return this.neu('Neues Modell', { ohneFrage: false });
        const v = this.verwendung();
        if (!(await frage('Modell löschen?', `„${esc(this.werk.eintrag.name)}“ (${esc(this.stem)}.glb) wandert in den Papierkorb (20 Tage zurückholbar).${v.length ? `<br /><b>Achtung:</b> benutzt in ${v.map((x) => esc(x.zone)).join(', ')} – dort fehlt es danach.` : ''}`, { ja: 'Löschen', gefahr: true }))) return;
        return this.loesche();
      }
      if (d.ws === 'kopie') {
        const f = formular([{ name: 'name', titel: 'Name der Kopie', wert: `${this.werk.eintrag.name} 2` }]);
        const w = await dialog({ titel: 'Als Kopie speichern', icon: 'kopieren', inhalt: f.element, knoepfe: [{ text: 'Abbrechen', wert: null }, { text: 'Speichern', art: 'primaer', wert: () => f.werte() }] });
        if (w?.name) await this.speichere({ kopie: w.name });
        return;
      }
      if (d.ws === 'neu') {
        const f = formular([{ name: 'name', titel: 'Name', wert: 'Neues Modell' }, { art: 'hinweis', html: 'Startet mit einer Kiste. Unter <b>Teile</b> fügst du Grundkörper hinzu (Kiste, Zylinder, Kugel, Kegel, Keil, Ring, Platte) und setzt sie mit W/E/R zusammen.' }]);
        const w = await dialog({ titel: 'Neues Modell', icon: 'modell', inhalt: f.element, knoepfe: [{ text: 'Abbrechen', wert: null }, { text: 'Anlegen', art: 'primaer', wert: () => f.werte() }] });
        if (w) await this.neu(w.name || 'Neues Modell');
        return;
      }
      if (d.ws === 'einrasten') {
        this.einrasten = !this.einrasten;
        this.werk.setzeRasterSchritt(this.einrasten);
        t.classList.toggle('aktiv', this.einrasten);
        return;
      }
      if (d.gizmo) {
        this.werk.setzeGizmo(d.gizmo);
        el.querySelectorAll('[data-gizmo]').forEach((b) => b.classList.toggle('aktiv', b === t));
        return;
      }
      if (d.blick) return this.werk.blick(d.blick);
      if (d.hilfe) {
        const an = !t.classList.contains('aktiv');
        t.classList.toggle('aktiv', an);
        return this.werk.setzeHilfen({ [d.hilfe]: an });
      }
      if (d.reiter) {
        this.reiter = d.reiter;
        return this.#zeichne();
      }
      if (d.modell) return this.lade(d.modell);
      if (d.teil && !d.aktion) return this.werk.waehle(d.teil);
      if (d.aktion) return this.#aktion(d.aktion, t);
    }));
    el.addEventListener('change', sicher((e) => this.#feld(e.target)));
    el.querySelector('#ws-suche').addEventListener('input', (e) => {
      this.suche = e.target.value;
      this.#bibliothek();
    });
    el.querySelector('#ws-bereich').addEventListener('change', (e) => {
      this.bereich = e.target.value;
      this.#bibliothek();
    });
    addEventListener('keydown', (e) => {
      if (!this.offen || document.getElementById('dialog-ebene').classList.contains('offen')) return;
      if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
      const strg = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      const tun = (f) => {
        e.preventDefault();
        e.stopPropagation();
        sicher(f)();
      };
      if (strg && k === 'z') tun(() => (e.shiftKey ? this.werk.wiederholen() : this.werk.rueckgaengig()));
      else if (strg && k === 'y') tun(() => this.werk.wiederholen());
      else if (strg && k === 's') tun(() => this.speichere());
      else if (strg && k === 'd' && this.werk.gewaehlt) tun(() => this.werk.teilDuplizieren(this.werk.gewaehlt.uuid));
      else if (strg) e.stopPropagation();
      else if ((k === 'delete' || k === 'backspace') && this.werk.gewaehlt) tun(() => this.werk.teilLoeschen(this.werk.gewaehlt.uuid));
      else if (k === 'w' || k === 'e' || k === 'r') tun(() => el.querySelector(`[data-gizmo=${{ w: 'translate', e: 'rotate', r: 'scale' }[k]}]`).click());
      else if (k === 'f') tun(() => this.werk.blick('schraeg'));
      else if (k === 'escape') tun(() => (this.werk.gewaehlt ? this.werk.waehle(null) : this.schliesse()));
      else e.stopPropagation(); // nichts an den Karten-Editor durchreichen
    }, true);
  }

  // ---------- Bibliothek ----------
  #bibliothek() {
    const ziel = this.el.querySelector('#ws-liste');
    const s = this.suche.trim().toLowerCase();
    const liste = this.index.filter((e) => (!this.bereich || e.kategorie === this.bereich) && (!s || `${e.name} ${e.datei}`.toLowerCase().includes(s)));
    const v = this.vorschauStand ? `?v=${this.vorschauStand}` : '';
    ziel.innerHTML = liste.length
      ? liste.map((e) => {
        const stem = e.datei.replace(/\.glb$/, '');
        return `<div class="ws-modell ${stem === this.stem ? 'aktiv' : ''}" data-modell="${esc(stem)}" title="${esc(e.datei)}"><img loading="lazy" src="../client/assets/eigene/vorschau/${esc(stem)}.png${v}" alt="" onerror="this.style.visibility='hidden'" /><span>${esc(e.name)}</span><span class="neben">${e.zielHoehe ?? e.masse?.hoehe ?? '?'} m</span></div>`;
      }).join('')
      : '<div class="insp-leer">Nichts gefunden.</div>';
  }

  // ---------- Rechte Seite ----------
  #zeichne() {
    if (!this.werk?.eintrag) return;
    const w = this.werk;
    const e = w.eintrag;
    this.el.querySelector('#ws-name').textContent = e.name ?? '';
    this.el.querySelector('#ws-status').innerHTML = this.stem === null ? 'neu · ungespeichert' : `${esc(this.stem)}.glb${this.geaendert ? ' · <span style="color:var(--gelb)">geändert</span>' : ''}`;
    this.el.querySelector('[data-ws=rueckgaengig]').disabled = !w.kannZurueck;
    this.el.querySelector('[data-ws=wiederholen]').disabled = !w.kannVor;
    this.el.querySelectorAll('[data-reiter]').forEach((b) => b.classList.toggle('aktiv', b.dataset.reiter === this.reiter));
    this.el.querySelectorAll('.ws-modell').forEach((m) => m.classList.toggle('aktiv', m.dataset.modell === this.stem));
    const i = w.info();
    this.el.querySelector('#ws-info').textContent = i.masse ? `Im Spiel ${i.spielHoehe} m hoch · Grundfläche ${i.grundflaeche.b} × ${i.grundflaeche.h} Kacheln · ${i.teile} Teile · ${i.dreiecke.toLocaleString('de-DE')} Dreiecke · ${i.materialien} Materialien${i.leerlauf ? ` · Leerlauf „${i.leerlauf}“` : ''}` : 'Leeres Modell';
    const p = this.el.querySelector('#ws-panel');
    p.innerHTML = { modell: () => this.#panelModell(), teile: () => this.#panelTeile(), knochen: () => this.#panelKnochen(), material: () => this.#panelMaterial(), malen: () => this.#panelMalen(), animation: () => this.#panelAnimation() }[this.reiter]();
    if (this.reiter !== 'malen' && w.malModus) w.setzeMalen({ an: false });
  }

  #zahl(name, wert, { min, max, schritt = 0.01, breit = false } = {}) {
    return `<input class="feld zahl" type="number" data-feld="${name}" value="${wert ?? ''}" ${min !== undefined ? `min="${min}"` : ''} ${max !== undefined ? `max="${max}"` : ''} step="${schritt}" ${breit ? 'style="width:100%"' : ''} />`;
  }

  #panelModell() {
    const w = this.werk;
    const e = w.eintrag;
    const fl = w.grundflaeche();
    const eigen = !!e.fuss;
    const v = this.verwendung();
    return `
      <div class="insp-abschnitt"><div class="insp-abschnitt-titel">Allgemein</div>
        <div class="insp-zeile"><span>Name</span><input class="feld" data-feld="name" value="${esc(e.name)}" /></div>
        <div class="insp-zeile"><span>Bereich</span><select class="feld" data-feld="kategorie">${Object.entries(MODELL_KATEGORIEN).map(([k, t]) => `<option value="${k}" ${k === (e.kategorie || 'deko') ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></div>
      </div>
      <div class="insp-abschnitt"><div class="insp-abschnitt-titel">Im Spiel</div>
        <div class="insp-zeile"><span>Höhe (m)</span><div>${this.#zahl('zielHoehe', Math.round(w.spielHoehe * 1000) / 1000, { min: 0.05, max: 20 })}${w.hoeheAuto ? '<span class="neben">automatisch</span>' : ''}</div></div>
        <div class="insp-zeile"><span>Kollision</span><label class="schalter"><input type="checkbox" data-feld="blockiert" ${e.blockiert !== false && e.ebene !== 'oben' ? 'checked' : ''} ${e.ebene === 'oben' ? 'disabled' : ''} /> steht im Weg</label></div>
        <div class="insp-zeile"><span>Ebene</span><select class="feld" data-feld="ebene">${Object.entries(MODELL_EBENEN).map(([k, t]) => `<option value="${k}" ${k === (e.ebene || 'moebel') ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></div>
        <div class="insp-zeile"><span>Grundfläche</span><label class="schalter"><input type="checkbox" data-feld="fussEigen" ${eigen ? 'checked' : ''} /> eigene</label></div>
        <div class="insp-zeile"><span>Kacheln</span><div class="insp-xyz"><label>B ${this.#zahl('fussB', fl.b, { min: 0.1, max: 40, breit: true })}</label><label>T ${this.#zahl('fussH', fl.h, { min: 0.1, max: 40, breit: true })}</label></div></div>
        <div class="hinweis-kasten">Das Spiel passt das Modell in Grundfläche × Höhe ein (Mitte, Unterkante auf dem Boden) – die Bühne zeigt es genauso. Gilt für <b>neu gesetzte</b> Objekte; offene Zonen werden beim Speichern angeglichen.</div>
      </div>
      <div class="insp-abschnitt"><div class="insp-abschnitt-titel">Ausrichten (ganzes Modell)</div>
        <div class="insp-knoepfe">
          <button class="knopf" data-aktion="drehenY">${icon('drehen', 14)} 90° drehen</button>
          <button class="knopf" data-aktion="drehenX">Kippen (x)</button>
          <button class="knopf" data-aktion="drehenZ">Kippen (z)</button>
          <button class="knopf" data-aktion="spiegelnX">Spiegeln</button>
          <button class="knopf flach" data-aktion="ursprung" title="Für Weiterverwendung in anderen Programmen – im Spiel ohne Wirkung">Ursprung unten mittig</button>
        </div>
      </div>
      <div class="insp-abschnitt"><div class="insp-abschnitt-titel">Herkunft (Credits)</div>
        <div class="insp-zeile"><span>Urheber</span><input class="feld" data-feld="urheber" value="${esc(e.urheber ?? '')}" placeholder="z. B. Kenney" /></div>
        <div class="insp-zeile"><span>Lizenz</span><input class="feld" data-feld="lizenz" value="${esc(e.lizenz ?? '')}" placeholder="CC0 / CC-BY 4.0 / eigene Arbeit" /></div>
        <div class="insp-zeile"><span>Quelle</span><input class="feld" data-feld="url" value="${esc(e.url ?? '')}" placeholder="https://…" /></div>
      </div>
      <div class="insp-abschnitt"><div class="insp-abschnitt-titel">Benutzt in</div>
        ${this.stem === null ? '<div class="neben">Noch nicht gespeichert.</div>' : v.length ? v.map((x) => `<div>${esc(x.zone)} · ${x.objekte} Objekt(e)</div>`).join('') : '<div class="neben">Keiner Zone (bekannte Zonen).</div>'}
      </div>`;
  }

  #panelTeile() {
    const w = this.werk;
    const g = w.gewaehlt;
    const teile = w.teile();
    const lage = g ? w.lage(g.uuid) : null;
    const xyz = (name, werte, schritt) => `<div class="insp-xyz" style="grid-template-columns:repeat(3,1fr)">${['x', 'y', 'z'].map((a, n) => `<label>${a}${this.#zahl(`${name}${n}`, werte[n], { schritt, breit: true })}</label>`).join('')}</div>`;
    return `
      <div class="insp-abschnitt"><div class="insp-abschnitt-titel">Grundkörper anfügen</div>
        <div class="insp-knoepfe">${Object.entries(GRUNDKOERPER).map(([k, f]) => `<button class="knopf" data-aktion="form" data-form="${k}">${esc(f.name)}</button>`).join('')}</div>
        <div class="insp-knoepfe"><button class="knopf flach" data-aktion="einfuegen">${icon('hochladen', 14)} Anderes Modell einfügen …</button></div>
      </div>
      <div class="insp-abschnitt" style="padding:6px 0"><div class="insp-abschnitt-titel" style="padding:0 12px">Teile (${teile.length})</div>
        <div class="ws-teile">${teile.map((t) => `<div class="liste-eintrag ${g?.uuid === t.uuid ? 'aktiv' : ''}" data-teil="${t.uuid}" style="padding-left:${12 + t.tiefe * 14}px">${icon(t.art === 'mesh' ? 'objekt' : t.art === 'knochen' ? 'link' : 'ebenen', 14)}<span style="${t.sichtbar ? '' : 'opacity:.45;text-decoration:line-through'}">${esc(t.name)}</span><button class="knopf flach ws-mini" data-teil="${t.uuid}" data-aktion="sichtbar" title="ein-/ausblenden (ausgeblendet = fehlt beim Speichern)">${icon(t.sichtbar ? 'auge' : 'augeZu', 13)}</button></div>`).join('')}</div>
      </div>
      ${g ? `<div class="insp-abschnitt"><div class="insp-abschnitt-titel">Gewählt: ${esc(g.name || 'Teil')}</div>
        <div class="insp-zeile"><span>Name</span><input class="feld" data-feld="teilName" value="${esc(g.name)}" /></div>
        <div class="insp-zeile"><span>Position</span>${xyz('pos', lage.position, 0.01)}</div>
        <div class="insp-zeile"><span>Drehung °</span>${xyz('dreh', lage.drehung, 5)}</div>
        <div class="insp-zeile"><span>Größe ×</span>${xyz('gr', lage.groesse, 0.05)}</div>
        <div class="insp-zeile"><span>Hängt an</span><select class="feld" data-feld="eltern"><option value="">Modell</option>${teile.filter((t) => t.uuid !== g.uuid).map((t) => `<option value="${t.uuid}" ${g.parent?.uuid === t.uuid ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></div>
        <div class="insp-knoepfe"><button class="knopf" data-aktion="duplizieren">${icon('kopieren', 14)} Duplizieren</button><button class="knopf" data-aktion="eigenesMaterial">Eigenes Material</button><button class="knopf gefahr" data-aktion="loeschen">${icon('loeschen', 14)} Löschen</button></div>
        <div class="neben">Modell-Einheiten · 1 Einheit ≈ ${w.info().einheitInMetern} m im Spiel</div>
      </div>` : '<div class="insp-leer">Teil in der Bühne oder Liste anklicken – dann verschieben (W), drehen (E), Größe (R).</div>'}`;
  }

  #panelMaterial() {
    const w = this.werk;
    const mats = w.materialien();
    const gewaehlt = w.gewaehlt?.isMesh ? new Set([].concat(w.gewaehlt.material).map((m) => m.uuid)) : null;
    return `
      <div class="insp-abschnitt"><div class="insp-abschnitt-titel">Farbton (ganzes Modell)</div>
        <div class="insp-zeile"><span>Farbton °</span><div><input type="range" min="-180" max="180" step="5" value="0" data-farbton="grad" /></div></div>
        <div class="insp-zeile"><span>Sättigung</span><div><input type="range" min="0" max="2" step="0.05" value="1" data-farbton="saettigung" /></div></div>
        <div class="insp-zeile"><span>Helligkeit</span><div><input type="range" min="0.3" max="1.7" step="0.05" value="1" data-farbton="helligkeit" /></div></div>
        <div class="insp-knoepfe"><button class="knopf" data-aktion="farbton">Anwenden</button></div>
      </div>
      <div class="insp-abschnitt"><div class="insp-abschnitt-titel">Materialien (${mats.length})${gewaehlt ? ' · gewähltes Teil oben' : ''}</div></div>
      ${mats.sort((a, b) => Number(gewaehlt?.has(b.uuid) ?? 0) - Number(gewaehlt?.has(a.uuid) ?? 0)).map((m) => `
        <div class="insp-abschnitt ${gewaehlt?.has(m.uuid) ? 'ws-markiert' : ''}">
          <div class="insp-zeile"><span title="${esc(m.uuid)}">${esc(m.name)}</span><div><input type="color" data-mat="${m.uuid}" data-matfeld="farbe" value="${m.farbe ?? '#ffffff'}" /> <span class="neben">${m.teile} Teil(e)${m.textur ? ' · Textur' : ''}</span></div></div>
          <div class="insp-zeile"><span>Rauheit</span><div><input type="range" min="0" max="1" step="0.05" value="${m.rauheit}" data-mat="${m.uuid}" data-matfeld="rauheit" /></div></div>
          <div class="insp-zeile"><span>Metall</span><div><input type="range" min="0" max="1" step="0.05" value="${m.metall}" data-mat="${m.uuid}" data-matfeld="metall" /></div></div>
          <div class="insp-knoepfe"><button class="knopf flach" data-aktion="textur" data-mat="${m.uuid}">${icon('hochladen', 13)} Textur …</button>${m.textur ? `<button class="knopf flach" data-aktion="texturWeg" data-mat="${m.uuid}">Textur entfernen</button>` : ''}</div>
        </div>`).join('')}`;
  }

  #panelAnimation() {
    const w = this.werk;
    const clips = w.animationen();
    const teile = w.teile();
    return `
      <div class="insp-abschnitt"><div class="insp-abschnitt-titel">Animationen (${clips.length})</div>
        ${clips.length ? clips.map((c) => `<div class="insp-zeile" style="grid-template-columns:1fr auto"><span>${c.leerlauf ? `<b style="color:var(--akzent)">${esc(c.name)}</b> · im Spiel` : esc(c.name)} <span class="neben">${c.dauer} s</span></span><div>
          <button class="knopf flach ws-mini" data-aktion="${w.laeuft === c.name ? 'stopp' : 'abspielen'}" data-clip="${esc(c.name)}" title="Vorschau">${icon(w.laeuft === c.name ? 'stopp' : 'abspielen', 13)}</button>
          <button class="knopf flach ws-mini" data-aktion="leerlauf" data-clip="${esc(c.name)}" title="Im Spiel als Leerlauf abspielen">${c.leerlauf ? 'aus' : 'Spiel'}</button>
          <button class="knopf flach ws-mini" data-aktion="clipLoeschen" data-clip="${esc(c.name)}" title="Löschen">${icon('loeschen', 13)}</button></div></div>`).join('') : '<div class="neben">Keine Animationen.</div>'}
      </div>
      <div class="insp-abschnitt"><div class="insp-abschnitt-titel">Neue Bewegung</div>
        <div class="insp-zeile"><span>Art</span><select class="feld" id="ws-anim-art">${Object.entries(ANIMATIONS_ARTEN).map(([k, a]) => `<option value="${k}">${esc(a.name)}</option>`).join('')}</select></div>
        <div class="insp-zeile"><span>Teil</span><select class="feld" id="ws-anim-teil"><option value="">ganzes Modell</option>${teile.map((t) => `<option value="${t.uuid}" ${w.gewaehlt?.uuid === t.uuid ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></div>
        <div class="insp-zeile"><span>Achse</span><select class="feld" id="ws-anim-achse"><option value="y">y (hoch)</option><option value="x">x</option><option value="z">z</option></select></div>
        <div class="insp-zeile"><span>Dauer (s)</span><div>${this.#zahl('animDauer', 2, { min: 0.1, max: 60, schritt: 0.1 })}</div></div>
        <div class="insp-zeile"><span>Stärke</span><div><input class="feld zahl" type="number" id="ws-anim-staerke" placeholder="Standard" step="0.05" /></div></div>
        <div class="insp-knoepfe"><button class="knopf primaer" data-aktion="animation">${icon('plus', 14)} Anlegen (läuft im Spiel)</button></div>
      </div>
      ${this.#panelKeyframes()}`;
  }

  /** Eigene Keyframe-Animation: Clip wählen/anlegen, Zeitleiste, Pose mit Knochen + Gizmo (E), „Keyframe setzen“ */
  #panelKeyframes() {
    const w = this.werk;
    const clips = w.animationen();
    this.kfClip = clips.some((c) => c.name === this.kfClip) ? this.kfClip : clips.at(-1)?.name ?? null;
    const zeiten = this.kfClip ? w.keyframeZeiten(this.kfClip) : [];
    const dauer = this.kfClip ? clips.find((c) => c.name === this.kfClip).dauer : 2;
    this.kfZeit = Math.min(this.kfZeit ?? 0, dauer);
    return `<div class="insp-abschnitt"><div class="insp-abschnitt-titel">Eigene Animation (Keyframes)</div>
      <div class="insp-zeile"><span>Clip</span><div><select class="feld" data-kf="clip">${clips.map((c) => `<option ${c.name === this.kfClip ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select><button class="knopf flach ws-mini" data-aktion="kfNeu" title="Neuer leerer Clip">${icon('plus', 13)}</button></div></div>
      ${this.kfClip ? `<div class="insp-zeile"><span>Dauer s</span><div><input class="feld zahl" type="number" min="0.1" max="60" step="0.1" data-kf="dauer" value="${dauer}" /></div></div>
      <div class="insp-zeile"><span>Zeit ${this.kfZeit.toFixed(2)} s</span><div><input type="range" min="0" max="${dauer}" step="0.05" value="${this.kfZeit}" data-kf="zeit" /></div></div>
      <div class="ws-zeitleiste">${zeiten.map((z) => `<button class="ws-key ${Math.abs(z - this.kfZeit) < 1e-3 ? 'aktiv' : ''}" style="left:${(z / dauer) * 100}%" data-aktion="kfSpringe" data-zeit="${z}" title="${z} s"></button>`).join('')}</div>
      <div class="insp-knoepfe"><button class="knopf primaer" data-aktion="kfSetzen">${icon('plus', 13)} Keyframe setzen</button><button class="knopf flach" data-aktion="kfLoeschen" ${zeiten.some((z) => Math.abs(z - this.kfZeit) < 1e-3) ? '' : 'disabled'}>Keyframe löschen</button><button class="knopf flach" data-aktion="${w.laeuft === this.kfClip ? 'stopp' : 'abspielen'}" data-clip="${esc(this.kfClip)}">${icon(w.laeuft === this.kfClip ? 'stopp' : 'abspielen', 13)} Abspielen</button></div>
      <div class="neben">Ablauf: Zeit wählen → Knochen anklicken und drehen (E) → „Keyframe setzen“ → nächste Zeit. Gesetzt werden alle Knochen (ohne Knochen: alle Teile); gewählter Knoten zuerst. Erster Keyframe bei 0 s, letzter = erster für eine saubere Schleife.</div>` : '<div class="neben">Mit + einen leeren Clip anlegen.</div>'}
    </div>`;
  }

  #panelKnochen() {
    const w = this.werk;
    const k = w.knochen();
    const g = w.gewaehlt;
    const istK = g && (g.userData.knochen || g.isBone);
    const teile = w.teile().filter((t) => t.art !== 'knochen' && !w.teil(t.uuid).userData.knochen);
    return `<div class="insp-abschnitt"><div class="insp-abschnitt-titel">Knochen & Gelenke (${k.length})</div>
        <div class="insp-knoepfe">
          <button class="knopf" data-aktion="knWurzel" title="Wurzel-Knochen unten in der Modellmitte">${icon('plus', 13)} Wurzel</button>
          <button class="knopf" data-aktion="knKind" ${istK ? '' : 'disabled'} title="Kind-Knochen am Ende des gewählten Knochens (Kette, wie Extrude)">${icon('plus', 13)} Kette</button>
          <button class="knopf" data-aktion="knTeil" ${g && !istK ? '' : 'disabled'} title="Gelenk am gewählten Teil – das Teil hängt daran">${icon('plus', 13)} Gelenk am Teil</button>
          <select class="feld" data-kn="kante" style="width:auto">${['unten', 'oben', 'links', 'rechts', 'vorne', 'hinten', 'mitte'].map((x) => `<option ${x === (this.knKante ?? 'unten') ? 'selected' : ''}>${x}</option>`).join('')}</select>
        </div>
        <label class="schalter"><input type="checkbox" data-kn="anzeige" ${w.knochenSichtbar !== false ? 'checked' : ''} /> Knochen anzeigen</label>
        <div class="ws-teile">${k.map((x) => `<div class="liste-eintrag ${g?.uuid === x.uuid ? 'aktiv' : ''}" data-teil="${x.uuid}">${icon('link', 13)}<span>${esc(x.name)}</span><span class="neben">${x.laenge.toFixed(2)} · ${x.kinder.length} Teil(e)</span></div>`).join('') || '<div class="neben" style="padding:6px 12px">Noch keine Knochen. Tipp: Teil wählen → „Gelenk am Teil“ (Kante oben = Arm an der Schulter).</div>'}</div>
      </div>
      ${istK ? `<div class="insp-abschnitt"><div class="insp-abschnitt-titel">Knochen: ${esc(g.name)}</div>
        <div class="insp-zeile"><span>Name</span><input class="feld" data-feld="teilName" value="${esc(g.name)}" /></div>
        ${g.userData.knochen ? `<div class="insp-zeile"><span>Länge</span><div><input class="feld zahl" type="number" min="0.02" step="0.05" data-kn="laenge" value="${(g.userData.knochen.laenge ?? 0).toFixed(3)}" /></div></div>` : ''}
        <div class="insp-zeile"><span>Teil binden</span><div><select class="feld" data-kn="binden"><option value="">— Teil wählen —</option>${teile.map((t) => `<option value="${t.uuid}">${esc(t.name)}</option>`).join('')}</select></div></div>
        <div class="insp-knoepfe"><button class="knopf" data-aktion="knPose0" title="Drehung zurück auf 0°">Pose zurücksetzen</button>${g.userData.knochen ? `<button class="knopf gefahr" data-aktion="knLoeschen">${icon('loeschen', 13)} Knochen löschen</button>` : ''}</div>
        <div class="neben">Drehen mit E (Gizmo) = Pose. Teile, die am Knochen hängen, bewegen sich mit. Für eine Bewegung: Reiter Animation → Eigene Animation.</div>
      </div>` : ''}`;
  }

  #panelMalen() {
    const w = this.werk;
    const p = w.malPinsel ?? { farbe: '#7a0d0d', groesse: 24, deckkraft: 0.8 };
    const mats = w.materialien();
    return `<div class="insp-abschnitt"><div class="insp-abschnitt-titel">Pinsel</div>
        <label class="schalter"><input type="checkbox" data-mal="an" ${w.malModus ? 'checked' : ''} /> Malmodus (auf dem Modell ziehen = malen, daneben = Kamera)</label>
        <div class="insp-zeile"><span>Farbe</span><div><input type="color" data-mal="farbe" value="${p.farbe}" /></div></div>
        <div class="insp-zeile"><span>Größe</span><div><input type="range" min="2" max="120" step="1" value="${p.groesse}" data-mal="groesse" /><span class="neben az-zahl">${p.groesse}</span></div></div>
        <div class="insp-zeile"><span>Deckkraft</span><div><input type="range" min="0.05" max="1" step="0.05" value="${p.deckkraft}" data-mal="deckkraft" /><span class="neben az-zahl">${p.deckkraft}</span></div></div>
        <div class="neben">Jeder Strich ist ein Rückgängig-Schritt. Teile ohne UV-Koordinaten lassen sich nicht bemalen.</div>
      </div>
      <div class="insp-abschnitt"><div class="insp-abschnitt-titel">Textur-Effekte</div>
        <div class="insp-zeile"><span>Auf</span><select class="feld" data-mal="ziel"><option value="">alle Materialien</option>${mats.map((m) => `<option value="${m.uuid}" ${this.effektZiel === m.uuid ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></div>
        <div class="insp-zeile"><span>Stärke</span><div><input type="range" min="0.05" max="1" step="0.05" value="${this.effektStaerke ?? 0.5}" data-mal="staerke" /><span class="neben az-zahl">${this.effektStaerke ?? 0.5}</span></div></div>
        <div class="insp-knoepfe">${Object.entries(EFFEKTE).map(([k, t]) => `<button class="knopf" data-aktion="effekt" data-effekt="${k}">${esc(t)}</button>`).join('')}</div>
        <div class="neben">Beispiel „gruseliger“: Dunkler 0,4 → Dreck 0,5 → Blut 0,4 → Verblassen 0,3. Einfärben nutzt die Pinselfarbe.</div>
      </div>`;
  }

  async #aktion(a, t) {
    const w = this.werk;
    const g = w.gewaehlt?.uuid;
    const d = t.dataset;
    switch (a) {
      case 'drehenY': return w.drehen('y', 90);
      case 'drehenX': return w.drehen('x', 90);
      case 'drehenZ': return w.drehen('z', 90);
      case 'spiegelnX': return w.spiegeln('x');
      case 'ursprung': return w.ursprungUntenMitte();
      case 'form': return w.teilHinzu(d.form);
      case 'duplizieren': return w.teilDuplizieren(g);
      case 'loeschen': return w.teilLoeschen(g);
      case 'eigenesMaterial': return w.eigenesMaterial(g);
      case 'sichtbar': return w.teilSichtbar(d.teil, !w.teil(d.teil).visible);
      case 'farbton': {
        const wert = (n) => Number(this.el.querySelector(`[data-farbton=${n}]`).value);
        return w.farbton(wert('grad'), wert('saettigung'), wert('helligkeit'));
      }
      case 'textur': {
        const bild = await waehleBild();
        if (bild) w.setzeTextur(d.mat, bild);
        return;
      }
      case 'texturWeg': return w.setzeTextur(d.mat, null);
      case 'abspielen':
        w.spieleAnimation(d.clip);
        return this.#zeichne();
      case 'stopp':
        w.stoppeAnimation();
        return this.#zeichne();
      case 'leerlauf': return w.setzeLeerlauf(w.leerlauf === d.clip ? '' : d.clip);
      case 'clipLoeschen': return w.animationLoeschen(d.clip);
      case 'kfNeu': {
        this.kfClip = w.clipNeu('Eigene Animation', 2);
        this.kfZeit = 0;
        return this.#zeichne();
      }
      case 'kfSetzen': {
        const knoten = w.gewaehlt ? [w.gewaehlt.uuid, ...w.knochen().map((k) => k.uuid).filter((u) => u !== w.gewaehlt.uuid)] : null;
        w.keyframeSetzen(this.kfClip, this.kfZeit, knoten);
        return this.#zeichne();
      }
      case 'kfLoeschen': return w.keyframeLoeschen(this.kfClip, this.kfZeit);
      case 'kfSpringe':
        this.kfZeit = Number(d.zeit);
        return w.zeigeZeit(this.kfClip, this.kfZeit);
      case 'knWurzel': return w.knochenHinzu({});
      case 'knKind': return w.knochenHinzu({ an: g });
      case 'knTeil': return w.knochenHinzu({ an: g, kante: this.knKante ?? 'unten' });
      case 'knLoeschen': return w.knochenLoeschen(g);
      case 'knPose0': return w.setzeLage(g, { drehung: [0, 0, 0] });
      case 'effekt': {
        const n = w.texturEffekt(this.effektZiel || null, d.effekt, { staerke: this.effektStaerke ?? 0.5, farbe: w.malPinsel?.farbe ?? '#5a7a3a', saat: Date.now() % 1000 });
        return this.studio.hinweis(n ? `Effekt auf ${n} Material(ien)` : 'Kein passendes Material (ohne UV nur Dunkler/Einfärben/Verblassen)', n ? 'erfolg' : 'fehler');
      }
      case 'animation': {
        const st = this.el.querySelector('#ws-anim-staerke').value;
        const name = w.animationHinzu({ art: this.el.querySelector('#ws-anim-art').value, teil: this.el.querySelector('#ws-anim-teil').value || null, achse: this.el.querySelector('#ws-anim-achse').value, dauer: Number(this.el.querySelector('[data-feld=animDauer]').value) || 2, staerke: st === '' ? undefined : Number(st) });
        w.spieleAnimation(name);
        return this.#zeichne();
      }
      case 'einfuegen': {
        const f = formular([{ name: 'modell', titel: 'Modell', art: 'auswahl', wert: '', werte: this.index.map((e) => [e.datei.replace(/\.glb$/, ''), e.name]) }]);
        const x = await dialog({ titel: 'Anderes Modell als Teil einfügen', icon: 'modell', inhalt: f.element, knoepfe: [{ text: 'Abbrechen', wert: null }, { text: 'Einfügen', art: 'primaer', wert: () => f.werte() }] });
        if (!x?.modell) return;
        return this.modellEinfuegen(x.modell);
      }
      default:
        return undefined;
    }
  }

  async modellEinfuegen(stem) {
    const antwort = await fetch(`../client/assets/eigene/${stem}.glb`);
    if (!antwort.ok) throw new Error(`${stem}.glb nicht lesbar`);
    return this.werk.modellEinfuegen(new Uint8Array(await antwort.arrayBuffer()), stem);
  }

  #feld(f) {
    const w = this.werk;
    const name = f.dataset.feld;
    const d = f.dataset;
    if (d.kf === 'clip') {
      this.kfClip = f.value;
      return this.#zeichne();
    }
    if (d.kf === 'dauer') return w.clipDauer(this.kfClip, Number(f.value));
    if (d.kf === 'zeit') {
      this.kfZeit = Number(f.value);
      return w.zeigeZeit(this.kfClip, this.kfZeit);
    }
    if (d.kn === 'kante') {
      this.knKante = f.value;
      return undefined;
    }
    if (d.kn === 'anzeige') return w.setzeKnochenAnzeige(f.checked);
    if (d.kn === 'laenge') return w.knochenLaenge(w.gewaehlt.uuid, Number(f.value));
    if (d.kn === 'binden' && f.value) return w.knochenBinden(w.gewaehlt.uuid, f.value);
    if (d.mal === 'an') {
      w.setzeMalen({ an: f.checked });
      return this.#zeichne();
    }
    if (d.mal === 'farbe' || d.mal === 'groesse' || d.mal === 'deckkraft') return w.setzeMalen({ [d.mal]: d.mal === 'farbe' ? f.value : Number(f.value) });
    if (d.mal === 'ziel') {
      this.effektZiel = f.value;
      return undefined;
    }
    if (d.mal === 'staerke') {
      this.effektStaerke = Number(f.value);
      return undefined;
    }
    if (f.dataset.matfeld) return w.setzeMaterial(f.dataset.mat, { [f.dataset.matfeld]: f.type === 'range' ? Number(f.value) : f.value });
    if (!name || name === 'animDauer') return;
    const g = w.gewaehlt?.uuid;
    const xyz = (p) => [0, 1, 2].map((n) => Number(this.el.querySelector(`[data-feld=${p}${n}]`).value));
    if (/^pos\d$/.test(name)) return w.setzeLage(g, { position: xyz('pos') });
    if (/^dreh\d$/.test(name)) return w.setzeLage(g, { drehung: xyz('dreh') });
    if (/^gr\d$/.test(name)) return w.setzeLage(g, { groesse: xyz('gr') });
    if (name === 'teilName') return w.teilUmbenennen(g, f.value);
    if (name === 'eltern') return w.teilAnhaengen(g, f.value || null);
    if (name === 'fussEigen') return this.einstellen({ fuss: f.checked ? w.grundflaeche() : null });
    if (name === 'fussB' || name === 'fussH') {
      const fl = w.grundflaeche();
      const hoehe = w.spielHoehe;
      // Eingabe gilt bei der aktuellen Höhe = zielHoehe (gespeichert wird bei zielHoehe)
      return this.einstellen({ fuss: { b: name === 'fussB' ? Number(f.value) : fl.b, h: name === 'fussH' ? Number(f.value) : fl.h }, zielHoehe: hoehe });
    }
    if (name === 'blockiert') return this.einstellen({ blockiert: f.checked ? null : false });
    if (name === 'zielHoehe') return this.einstellen({ zielHoehe: Number(f.value) });
    if (name === 'ebene') return this.einstellen({ ebene: f.value });
    return this.einstellen({ [name]: f.value });
  }
}

/** Bild-Datei wählen → HTMLImageElement (oder null) */
function waehleBild() {
  return new Promise((ok) => {
    const i = document.createElement('input');
    i.type = 'file';
    i.accept = 'image/png,image/jpeg,image/webp';
    i.onchange = async () => {
      const d = i.files?.[0];
      if (!d) return ok(null);
      const bild = new Image();
      bild.onload = () => ok(bild);
      bild.onerror = () => ok(null);
      bild.src = URL.createObjectURL(d);
    };
    i.click();
  });
}

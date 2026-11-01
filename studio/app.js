import * as THREE from 'three';
import { GLTFLoader } from '../client/vendor/three/addons.js';
import { Dokument } from './kern/dokument.js';
import { Befehle } from './kern/befehle.js';
import { erstelleKiAusfuehrer } from './kern/kiAusfuehren.js';
import * as A from './kern/aktionen.js';
import { Viewport } from './ansicht/viewport.js';
import { SpielOptik } from './ansicht/spielOptik.js';
import { Stimmung } from './ansicht/stimmung.js';
import { Werkzeuge, WERKZEUGE, MIT_GIZMO } from './ansicht/werkzeuge.js';
import { Menues, tooltips } from './oberflaeche/menue.js';
import { ZonenPanel, SzenePanel, AssetPanel, PruefPanel } from './oberflaeche/panels.js';
import { Inspektor } from './oberflaeche/inspektor.js';
import { KiPanel } from './oberflaeche/kiPanel.js';
import { zeigeStartbild, merkeZuletzt } from './oberflaeche/startbild.js';
import { dialog, formular, frage, melde, esc } from './oberflaeche/dialoge.js';
import { icon } from './oberflaeche/icons.js';
import { ladeSpielordner, setzeSpielordner } from '../editor/kern/spielordner.js';
import { ausDefinition } from '../editor/kern/format.js';
import { EditorKarte } from '../editor/kern/karte.js';
import { kopiereElemente, einfuegeOps } from '../editor/kern/auswahl.js';
import { groesseAendern, ZONEN_ID_MUSTER } from '../editor/kern/zone.js';
import { MODELL_KATEGORIEN } from '../editor/kern/katalog.js';
import { testDaten } from '../editor/kern/testlauf.js';
import { hatFehler, validiere } from '../editor/kern/validierung.js';
import { pruefeMarker } from '../editor/kern/platzierung.js';
import { speichereEditorTest } from '../client/ui/editorTestSpeicher.js';

/**
 * Browser Survival Studio – Fenster-Seite (Renderer). Verdrahtet Dokument (kern/dokument.js), Befehlsschicht
 * (kern/befehle.js), Ansicht (ansicht/viewport.js), Werkzeuge (ansicht/werkzeuge.js) und Panels (oberflaeche/*).
 * Hauptprozess-Zugriff nur über window.studioNativ (studio/main/vorab.cjs). KI/MCP rufen window.studioKi.fuehreAus.
 * Test-Zugriff (Rauchtest): window.studio.
 */
const nativ = window.studioNativ ?? {
  aufruf: async () => {
    throw new Error('Das Studio läuft nur als Programm: npm run studio');
  },
  bei: () => {},
};

class Studio {
  constructor() {
    this.nativ = nativ;
    this.dok = new Dokument(nativ);
    this.befehle = new Befehle();
    this.menues = new Menues(this.befehle, document.getElementById('menues'));
    this.ansicht = new Viewport(document.getElementById('leinwand'));
    this.werkzeuge = new Werkzeuge(this);
    this.ansicht.spielOptik = new SpielOptik(this.ansicht);
    this.ansicht.spielOptik.beiStatus = (t) => (t ? this.hinweis(t) : this.hinweis('Spiel-Optik aktuell', 'erfolg'));
    this.stimmung = new Stimmung(this.ansicht);
    this.asset = null;
    this.vorlagenListe = [];
    this.klangListe = [];
    this.zwischenablage = null;
    this.testAmKamerapunkt = false;
    this.rechtsReiter = 'inspektor';
    this.zonenPanel = new ZonenPanel(this);
    this.szene = new SzenePanel(this);
    this.assets = new AssetPanel(this);
    this.pruefung = new PruefPanel(this);
    this.inspektor = new Inspektor(this);
    this.ki = new KiPanel(this);
    window.studioKi = erstelleKiAusfuehrer(this);
    this.#verbinden();
  }

  // ---------- Schnittstelle für Panels/Werkzeuge/KI ----------
  zonenIds() {
    return [...new Set([...this.zonenPanel.liste.map((z) => z.id), ...[...this.dok.zonen].filter(([, z]) => z.quelle !== 'vorlage').map(([id]) => id)])];
  }

  async zonenListe() {
    await this.zonenPanel.laden();
    return this.zonenPanel.liste.map(({ id, name, breite, hoehe, registriert, entwurf }) => ({ id, name, breite, hoehe, imSpiel: registriert, entwurf, offen: this.dok.zonen.has(id) }));
  }

  vorlagen() {
    return this.vorlagenListe;
  }

  /** Alle Zonen als EditorKarte (für Übergangs-Prüfung): Spieldateien (Cache) + geöffnete Zonen */
  zonenKarten() {
    const m = new Map(this.zonenCache ?? []);
    for (const [id, z] of this.dok.zonen) if (z.quelle !== 'vorlage') m.set(id, z.karte);
    return m;
  }

  async #ladeZonenCache() {
    this.zonenCache ??= new Map();
    for (const z of this.zonenPanel.liste) {
      if (!z.datei || this.zonenCache.has(z.id)) continue;
      try {
        const def = await nativ.aufruf('projekt.definition', { id: z.id });
        if (def) this.zonenCache.set(z.id, ausDefinition(def).karte);
      } catch {
        // kaputte Zone: Prüfung meldet dann „Zielzone fehlt“
      }
    }
    this.pruefung.spaeter();
  }

  klangDateien() {
    return this.klangListe;
  }

  async klangFuerZone(datei) {
    const k = this.dok.karte;
    if (!k || this.dok.aktiv.quelle === 'vorlage') throw new Error('Klänge gehören zu einer Zone – Vorlagen speichern keine Klangdateien');
    const ziel = await nativ.aufruf('projekt.klangFuerZone', { quelle: datei, zone: k.id });
    if (ziel !== datei) this.klangListe = await nativ.aufruf('projekt.klangDateien');
    return ziel;
  }

  hinweis(text, art = 'info') {
    const el = document.getElementById('status-text');
    el.textContent = text;
    el.className = art === 'fehler' ? 'fehler' : art === 'erfolg' ? 'erfolg' : '';
    clearTimeout(this.hinweisZeit);
    this.hinweisZeit = setTimeout(() => {
      el.textContent = 'Bereit';
      el.className = '';
    }, art === 'fehler' ? 6000 : 4000);
  }

  zeigePosition(p) {
    const k = this.dok.karte;
    document.getElementById('status-position').textContent = k && k.imFeld(p.tx, p.ty) ? `Kachel ${p.tx} | ${p.ty} · Höhe ${k.hoeheAn(p.tx, p.ty)} m` : '';
  }

  zeigePruefung(liste) {
    const f = liste.filter((p) => p.schwere === 'fehler').length;
    const w = liste.length - f;
    const el = document.getElementById('status-pruefung');
    el.innerHTML = !this.dok.karte ? '' : f ? `<span class="status-marke fehler">${icon('fehler', 13)} ${f} Fehler${w ? ` · ${w} ${w === 1 ? 'Hinweis' : 'Hinweise'}` : ''}</span>` : w ? `<span class="status-marke warnung">${icon('warnung', 13)} ${w} ${w === 1 ? 'Hinweis' : 'Hinweise'}</span>` : `<span class="status-marke ok">${icon('pruefen', 13)} Keine Probleme</span>`;
    this.#reiterZahl();
  }

  meldeOptionen() {
    this.#optionsleiste();
    this.#werkzeugleisteAktiv();
  }

  setzeAnsicht(modus) {
    this.ansicht.setzeModus(modus);
    this.#ansichtsLeiste();
  }

  meldeKi(quelle) {
    if (quelle !== 'mcp') return;
    const el = document.getElementById('status-mcp');
    el.innerHTML = `<span class="status-marke ok">${icon('stecker', 13)} KI arbeitet …</span>`;
    clearTimeout(this.mcpZeit);
    this.mcpZeit = setTimeout(() => (el.innerHTML = `<span class="status-marke">${icon('stecker', 13)} MCP bereit</span>`), 2500);
  }

  waehleAsset(a) {
    this.asset = a;
    if (a.art === 'kachel') {
      if (a.kategorie === 'Mauern') {
        this.werkzeuge.opt.wand.art = a.zeichen === 'T' ? 'tuer' : a.zeichen === 'F' ? 'fenster' : 'wand';
        this.werkzeuge.waehle('wand');
      } else this.werkzeuge.waehle('boden');
    } else if (a.art === 'item') {
      this.werkzeuge.opt.spawn.inhalt = a.id;
      this.werkzeuge.waehle('spawn');
    } else this.werkzeuge.waehle('objekt');
    this.assets.zeichne();
  }

  // ---------- Zonen ----------
  async oeffneZone(id) {
    try {
      await this.dok.oeffne(id);
      merkeZuletzt(id);
    } catch (f) {
      this.hinweis(f.message, 'fehler');
      throw f;
    }
  }

  neueZone(felder) {
    if (!ZONEN_ID_MUSTER.test(felder.id)) throw new Error('ID nur a–z, 0–9, _ (max. 40 Zeichen)');
    if (this.zonenPanel.liste.some((z) => z.id === felder.id)) throw new Error(`Eine Zone „${felder.id}“ gibt es schon`);
    const e = this.dok.neu(felder);
    // Start in der Mitte, damit die Zone sofort testbar ist
    const k = e.karte;
    k.anwenden(A.markerOps(k, 'start', Math.floor(k.breite / 2), Math.floor(k.hoehe / 2)));
    k.version = 0;
    e.gespeichertVersion = -1;
    this.#zoneGewechselt();
    return e;
  }

  #zoneGewechselt() {
    const z = this.dok.aktiv;
    this.ansicht.setzeKarte(z?.karte ?? null);
    if (this.ansicht.spielOptik.an && z) this.ansicht.spielOptik.baue(this.dok.definition());
    document.getElementById('ansicht-leer').classList.toggle('versteckt', !!z);
    document.getElementById('zonen-titel').innerHTML = z ? `${z.quelle === 'vorlage' ? 'Vorlage' : 'Zone'} <b>${esc(z.karte.name)}</b>` : '';
    this.zonenPanel.zeichne();
    this.szene.zeichne();
    this.inspektor.zeichne();
    this.pruefung.pruefe();
    this.#speicherStatus();
    this.#werkzeugleisteAktiv();
  }

  #speicherStatus() {
    const z = this.dok.aktiv;
    const el = document.getElementById('status-speichern');
    if (!z) el.textContent = '';
    else if (z.karte.version !== z.gespeichertVersion) el.innerHTML = `<span class="status-marke warnung">${icon('speichern', 13)} Ungespeichert</span>`;
    else el.innerHTML = `<span class="status-marke">${icon('speichern', 13)} ${z.quelle === 'spiel' ? 'Wie im Spiel' : 'Entwurf gespeichert'}${this.gespeichertUm ? ` · ${this.gespeichertUm}` : ''}</span>`;
  }

  // ---------- Verdrahtung ----------
  #verbinden() {
    const { dok, ansicht, werkzeuge } = this;
    dok.bei('zonen', () => this.#zoneGewechselt());
    dok.bei('aenderung', ({ ops, zone }) => {
      if (zone !== dok.aktivId) return;
      ansicht.beiAenderung(ops);
      ansicht.spielOptik.planen(() => dok.definition());
      this.szene.spaeter();
      this.inspektor.zeichne();
      this.pruefung.spaeter();
      this.#speicherStatus();
      this.zonenPanel.zeichne();
      this.#werkzeugleisteAktiv();
    });
    dok.bei('auswahl', () => {
      ansicht.setzeAuswahl(dok.auswahl);
      ansicht.setzeGizmo(MIT_GIZMO[werkzeuge.aktiv] ?? null);
      this.szene.zeichne();
      this.inspektor.zeichne();
    });
    dok.bei('status', ({ text, art }) => this.hinweis(text, art));
    ansicht.beiZeiger = {
      unten: (e) => werkzeuge.unten(e),
      bewege: (e) => werkzeuge.bewege(e),
      oben: (e) => werkzeuge.oben(e),
      schweben: (e) => werkzeuge.schweben(e),
      verlassen: () => werkzeuge.verlassen(),
      rad: (e) => werkzeuge.rad(e),
      doppel: () => ansicht.zeigeAuswahl(),
      kontext: (e) => {
        const p = ansicht.treffe(e.clientX, e.clientY);
        if (p?.treffer && !dok.auswahl.some((a) => a.s === p.treffer.s && a.k === p.treffer.k)) dok.waehle([p.treffer]);
        this.einfuegePunkt = p;
        this.menues.kontext(e.clientX, e.clientY, dok.auswahl.length ? ['bearbeiten.kopieren', 'bearbeiten.duplizieren', 'vorlage.ausAuswahl', '-', 'ansicht.fokus', '-', 'bearbeiten.loeschen'] : ['bearbeiten.einfuegen', '-', 'ansicht.2d3d', 'ansicht.fokus']);
      },
    };
    ansicht.beiGizmo = (art, w) => this.#gizmo(art, w);
    // Tastatur: Befehle (nicht beim Tippen)
    document.addEventListener('keydown', (e) => {
      if (document.getElementById('dialog-ebene').classList.contains('offen')) return;
      const tippt = e.target.closest?.('input, textarea, select');
      if (tippt && !(e.ctrlKey && ['s', 'z', 'y'].includes(e.key.toLowerCase()))) return;
      if (e.key === '[' || e.key === ']') return werkzeuge.groesse(e.key === ']' ? 1 : -1);
      const b = this.befehle.zuTaste(e);
      if (!b) return;
      e.preventDefault();
      this.befehle.aus(b.id);
    });
    // Ziehbarer Teiler über den Assets
    const teiler = document.getElementById('teiler-assets');
    const panel = document.getElementById('panel-assets');
    teiler.addEventListener('pointerdown', (e) => {
      const start = e.clientY;
      const hoehe = panel.offsetHeight;
      const bewege = (ev) => (panel.style.height = `${Math.max(90, Math.min(innerHeight * 0.6, hoehe + start - ev.clientY))}px`);
      const ende = () => {
        removeEventListener('pointermove', bewege);
        removeEventListener('pointerup', ende);
      };
      addEventListener('pointermove', bewege);
      addEventListener('pointerup', ende);
    });
    // [data-befehl]-Knöpfe überall
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-befehl]');
      if (b && !b.closest('.menue-liste')) this.befehle.aus(b.dataset.befehl);
    });
    nativ.bei('mcp-aktivitaet', () => this.meldeKi('mcp'));
    tooltips();
  }

  #gizmo(art, w) {
    const { dok } = this;
    const k = dok.karte;
    const g = dok.gewaehlt();
    if (!g.length) return;
    if (art === 'bewegen') {
      const ops = A.verschiebeOps(k, dok.auswahl, w.dx, w.dy);
      // Höhe ziehen: Spawnpunkte heben/senken
      if (Math.abs(w.dz) > 0.01) for (const e of g) if (e.s === 'spawnpunkte') ops.push({ s: e.s, k: e.k, neu: { ...(ops.find((o) => o.k === e.k)?.neu ?? e.wert), hoehe: Math.max(0, Math.min(5, Math.round(((e.wert.hoehe ?? 0) + w.dz) * 100) / 100)) } });
      dok.aendere('Bewegen', ops);
    } else if (art === 'drehen') {
      if (!w.grad) return;
      dok.aendere('Drehen', g.filter((e) => e.s === 'objekte').map((e) => ({ s: e.s, k: e.k, neu: A.gedrehtesObjekt(e.wert, (e.wert.drehung ?? 0) + w.grad) })));
    } else if (art === 'skalieren') {
      if (Math.abs(w.faktor - 1) < 0.01) return;
      dok.aendere('Größe', g.filter((e) => e.s === 'objekte').map((e) => ({ s: e.s, k: e.k, neu: A.skaliertesObjekt(e.wert, (e.wert.skalierung ?? 1) * w.faktor) })));
    }
    this.ansicht.setzeAuswahl(dok.auswahl);
  }

  // ---------- Leisten ----------
  #werkzeugleiste() {
    const el = document.getElementById('werkzeugleiste');
    const gruppen = [[]];
    for (const w of WERKZEUGE) {
      if (w.trenner) gruppen.push([]);
      else gruppen.at(-1).push(w);
    }
    const knopf = (id, ic, titel, kuerzel, text = '') => `<button class="wz" data-befehl="${id}" data-tipp="${esc(titel)}" data-kuerzel="${esc(kuerzel ?? '')}" data-text="${esc(text)}">${icon(ic, 18)}</button>`;
    el.innerHTML = `${gruppen.map((g) => `<div class="wz-gruppe">${g.map((w) => knopf(`werkzeug.${w.id}`, w.icon, w.titel, w.kuerzel, w.text)).join('')}</div>`).join('')}<div class="wz-abstand"></div>
      <div class="wz-gruppe">${knopf('bearbeiten.rueckgaengig', 'rueckgaengig', 'Rückgängig', 'Strg+Z')}${knopf('bearbeiten.wiederholen', 'wiederholen', 'Wiederholen', 'Strg+Y')}</div>
      <div class="wz-gruppe">${knopf('zone.speichern', 'speichern', 'Entwurf speichern', 'Strg+S', 'Arbeitsstand sichern (nicht ins Spiel)')}${knopf('zone.insSpiel', 'insSpiel', 'Ins Spiel übernehmen', 'Strg+Umschalt+E', 'Kartendatei schreiben und im Spiel eintragen')}${knopf('zone.pruefen', 'pruefen', 'Prüfen')}${knopf('ki.oeffnen', 'ki', 'KI-Assistent')}</div>`;
    this.#werkzeugleisteAktiv();
  }

  #werkzeugleisteAktiv() {
    for (const b of document.querySelectorAll('#werkzeugleiste [data-befehl]')) {
      const id = b.dataset.befehl;
      b.classList.toggle('aktiv', id === `werkzeug.${this.werkzeuge.aktiv}`);
      b.disabled = !this.befehle.istAktiv(id);
    }
  }

  #optionsleiste() {
    const el = document.getElementById('optionsleiste');
    const w = WERKZEUGE.find((x) => x.id === this.werkzeuge.aktiv);
    const o = this.werkzeuge.opt[this.werkzeuge.aktiv] ?? {};
    const teile = [`<span class="opt-titel">${esc(w?.titel ?? '')}</span>`];
    for (const f of this.werkzeuge.optionen()) {
      if (f.art === 'hinweis') teile.push(`<span class="opt-hinweis">${esc(f.text)}</span>`);
      else if (f.art === 'segment') teile.push(`<div class="segment" data-opt="${f.feld}">${f.werte.map(([v, t]) => `<button data-wert="${esc(v)}" class="${String(o[f.feld]) === String(v) ? 'aktiv' : ''}">${esc(t)}</button>`).join('')}</div>`);
      else if (f.art === 'auswahl') teile.push(`<label class="opt">${esc(f.titel)}<select class="feld" data-opt="${f.feld}">${f.werte.map(([v, t]) => `<option value="${esc(v)}" ${String(o[f.feld]) === String(v) ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`);
      else if (f.art === 'zahl') teile.push(`<label class="opt">${esc(f.titel)}<input class="feld zahl" type="number" data-opt="${f.feld}" value="${esc(o[f.feld])}" min="${f.min}" max="${f.max}" step="${f.schritt}" /></label>`);
      else if (f.art === 'text') teile.push(`<label class="opt">${esc(f.titel)}<input class="feld" style="width:140px" data-opt="${f.feld}" value="${esc(o[f.feld] ?? '')}" placeholder="${esc(f.platzhalter ?? '')}" /></label>`);
      else if (f.art === 'schalter') teile.push(`<label class="schalter"><input type="checkbox" data-opt="${f.feld}" ${o[f.feld] ? 'checked' : ''} />${esc(f.titel)}</label>`);
    }
    el.innerHTML = teile.join('');
    el.onclick = (e) => {
      const b = e.target.closest('.segment button');
      if (!b) return;
      this.werkzeuge.setzeOption(b.parentElement.dataset.opt, b.dataset.wert);
      this.#optionsleiste();
    };
    el.onchange = (e) => {
      const f = e.target.closest('[data-opt]');
      if (!f) return;
      this.werkzeuge.setzeOption(f.dataset.opt, f.type === 'checkbox' ? f.checked : f.type === 'number' ? Number(f.value) : f.value);
    };
    document.getElementById('ansicht-hinweis').textContent = 'Rechte Maus drehen · Mitte/Leertaste schieben · Rad Zoom · RMT + WASD fliegen · F1 Hilfe';
  }

  #ansichtsLeiste() {
    const a = this.ansicht;
    document.getElementById('ansicht-oben-links').innerHTML = `<div class="glas"><div class="segment"><button data-befehl="ansicht.3d" class="${a.modus === '3d' ? 'aktiv' : ''}" data-tipp="3D-Ansicht" data-kuerzel="Tab">${icon('ansicht3d', 15)} 3D</button><button data-befehl="ansicht.2d" class="${a.modus === '2d' ? 'aktiv' : ''}" data-tipp="Draufsicht (2D)" data-kuerzel="Tab">${icon('ansicht2d', 15)} 2D</button></div></div>
      <div class="glas"><div class="segment"><button data-befehl="ansicht.raster" class="${a.ebenen.raster ? 'aktiv' : ''}" data-tipp="Raster">${icon('raster', 15)}</button><button data-befehl="ansicht.wandNiedrig" class="${a.wandNiedrig ? 'aktiv' : ''}" data-tipp="Wände niedrig" data-kuerzel="X" data-text="Innenräume von oben sehen">${icon('wandNiedrig', 15)}</button><button data-befehl="ansicht.objekte" class="${a.ebenen.objekte ? 'aktiv' : ''}" data-tipp="Objekte zeigen">${icon('objekt', 15)}</button><button data-befehl="ansicht.overlays" class="${a.ebenen.overlays ? 'aktiv' : ''}" data-tipp="Bereiche & Punkte zeigen">${icon('flaeche', 15)}</button></div></div>`;
    const st = this.stimmung;
    document.getElementById('ansicht-oben-rechts').innerHTML = `<div class="glas"><div class="segment"><button data-befehl="ansicht.spielOptik" class="${a.spielOptik.an ? 'aktiv' : ''}" data-tipp="Spiel-Optik" data-kuerzel="V" data-text="Echte Modelle & Texturen des Spiels zeigen">${icon('spielOptik', 15)} Spiel-Optik</button></div></div>
      <div class="glas"><div class="segment">${['tag', 'abend', 'nacht'].map((z) => `<button data-befehl="ansicht.zeit.${z}" class="${st.tageszeit === z ? 'aktiv' : ''}" data-tipp="${{ tag: 'Tag', abend: 'Abend', nacht: 'Nacht' }[z]}">${icon({ tag: 'sonne', abend: 'abend', nacht: 'mond' }[z], 15)}</button>`).join('')}</div></div>
      <div class="glas"><div class="segment">${['klar', 'nebel', 'regen', 'schnee'].map((w) => `<button data-befehl="ansicht.wetter.${w}" class="${st.wetter === w ? 'aktiv' : ''}" data-tipp="Wetter: ${{ klar: 'klar', nebel: 'Nebel', regen: 'Regen', schnee: 'Schnee' }[w]}">${w === 'klar' ? icon('sonne', 15) : { nebel: 'Nebel', regen: 'Regen', schnee: 'Schnee' }[w]}</button>`).join('')}</div></div>
      <div class="glas"><div class="segment"><button data-befehl="ansicht.fokus" data-tipp="Auswahl zeigen" data-kuerzel="F">${icon('fokus', 15)}</button><button data-befehl="ansicht.ganz" data-tipp="Ganze Zone zeigen" data-kuerzel="Pos1">${icon('zone', 15)}</button></div></div>`;
  }

  #rechtsReiter() {
    const el = document.getElementById('rechts-reiter');
    el.innerHTML = `<button data-reiter="inspektor">Eigenschaften</button><button data-reiter="pruef">Prüfung <span class="zahl-marke" id="pruef-zahl">0</span></button><button data-reiter="ki">${icon('ki', 13)} KI</button>`;
    el.onclick = (e) => {
      const b = e.target.closest('[data-reiter]');
      if (b) this.zeigeRechts(b.dataset.reiter);
    };
    this.zeigeRechts('inspektor');
  }

  zeigeRechts(reiter) {
    this.rechtsReiter = reiter;
    for (const b of document.querySelectorAll('#rechts-reiter button')) b.classList.toggle('aktiv', b.dataset.reiter === reiter);
    document.getElementById('inspektor').classList.toggle('versteckt', reiter !== 'inspektor');
    document.getElementById('pruef-panel').classList.toggle('versteckt', reiter !== 'pruef');
    document.getElementById('ki-panel').classList.toggle('versteckt', reiter !== 'ki');
  }

  #reiterZahl() {
    const el = document.getElementById('pruef-zahl');
    if (el) el.textContent = this.pruefung.liste.length;
  }

  // ---------- Befehle ----------
  #registriereBefehle() {
    const { dok, ansicht, werkzeuge } = this;
    const mitZone = () => !!dok.karte;
    const mitAuswahl = () => dok.auswahl.length > 0;
    const echteZone = () => !!dok.karte && dok.aktiv.quelle !== 'vorlage';
    this.befehle.registriere(
      // Datei
      { id: 'zone.neu', gruppe: 'Datei', titel: 'Neue Zone …', icon: 'plus', kuerzel: 'Strg+N', ausfuehren: () => this.#dialogNeueZone() },
      { id: 'zone.speichern', gruppe: 'Datei', titel: 'Entwurf speichern', icon: 'speichern', kuerzel: 'Strg+S', aktiv: mitZone, ausfuehren: () => this.speichern() },
      { id: 'zone.insSpiel', gruppe: 'Datei', titel: 'Ins Spiel übernehmen …', icon: 'insSpiel', kuerzel: 'Strg+Umschalt+E', aktiv: echteZone, ausfuehren: () => this.insSpiel() },
      { id: 'zone.testen', gruppe: 'Datei', titel: 'Testen (Spiel starten)', icon: 'abspielen', kuerzel: 'F5', aktiv: echteZone, ausfuehren: () => this.testen() },
      { id: 'zone.testenHier', gruppe: 'Datei', titel: 'Am Kamerapunkt starten', kuerzel: 'Umschalt+F5', aktiv: echteZone, angehakt: () => this.testAmKamerapunkt, ausfuehren: () => { this.testAmKamerapunkt = !this.testAmKamerapunkt; this.hinweis(this.testAmKamerapunkt ? 'Testlauf startet ab jetzt an der Kamera-Mitte' : 'Testlauf startet am Spieler-Start'); } },
      { id: 'zone.schliessen', gruppe: 'Datei', titel: 'Zone schließen', icon: 'schliessen', kuerzel: 'Strg+W', aktiv: mitZone, ausfuehren: () => this.schliessen() },
      { id: 'zone.aktualisieren', gruppe: 'Datei', titel: 'Zonenliste neu laden', icon: 'wiederholen', ausfuehren: () => this.zonenPanel.laden() },
      { id: 'asset.importModell', gruppe: 'Datei', titel: 'Modell importieren …', icon: 'hochladen', ausfuehren: () => this.#dialogModellImport() },
      { id: 'asset.importKlang', gruppe: 'Datei', titel: 'Klang importieren …', icon: 'audio', aktiv: echteZone, ausfuehren: () => this.#dialogKlangImport() },
      { id: 'studio.start', gruppe: 'Datei', titel: 'Startbildschirm', icon: 'hauptmenue', ausfuehren: () => this.#startbild() },
      { id: 'projekt.ordner', gruppe: 'Datei', titel: 'Spielordner wechseln …', icon: 'ordner', ausfuehren: async () => { try { if (await nativ.aufruf('projekt.ordnerWaehlen')) location.reload(); } catch (f) { this.hinweis(f.message, 'fehler'); } } },
      // Bearbeiten
      { id: 'bearbeiten.rueckgaengig', gruppe: 'Bearbeiten', titel: 'Rückgängig', icon: 'rueckgaengig', kuerzel: 'Strg+Z', aktiv: () => !!dok.aktiv?.verlauf.kannZurueck, ausfuehren: () => dok.rueckgaengig() },
      { id: 'bearbeiten.wiederholen', gruppe: 'Bearbeiten', titel: 'Wiederholen', icon: 'wiederholen', kuerzel: ['Strg+Y', 'Strg+Umschalt+Z'], aktiv: () => !!dok.aktiv?.verlauf.kannVor, ausfuehren: () => dok.wiederholen() },
      { id: 'bearbeiten.kopieren', gruppe: 'Bearbeiten', titel: 'Kopieren', icon: 'kopieren', kuerzel: 'Strg+C', aktiv: mitAuswahl, ausfuehren: () => { this.zwischenablage = kopiereElemente(dok.karte, dok.gewaehlt()); this.hinweis(this.zwischenablage ? 'Kopiert – Strg+V fügt an der Maus ein' : 'Nichts Kopierbares gewählt'); } },
      { id: 'bearbeiten.einfuegen', gruppe: 'Bearbeiten', titel: 'Einfügen', kuerzel: 'Strg+V', aktiv: () => mitZone() && !!this.zwischenablage, ausfuehren: () => this.#einfuegen() },
      { id: 'bearbeiten.duplizieren', gruppe: 'Bearbeiten', titel: 'Duplizieren', icon: 'kopieren', kuerzel: 'Strg+D', aktiv: mitAuswahl, ausfuehren: () => { const { ops, neue } = A.duplizierOps(dok.karte, dok.auswahl, 1, 1); dok.aendere('Duplizieren', ops); dok.waehle(neue); } },
      { id: 'bearbeiten.loeschen', gruppe: 'Bearbeiten', titel: 'Löschen', icon: 'loeschen', kuerzel: ['Entf', 'Backspace'], aktiv: mitAuswahl, ausfuehren: () => { dok.aendere(`${dok.auswahl.length} gelöscht`, A.loeschOps(dok.auswahl)); dok.waehle([]); } },
      { id: 'bearbeiten.alles', gruppe: 'Bearbeiten', titel: 'Alle Objekte wählen', kuerzel: 'Strg+A', aktiv: mitZone, ausfuehren: () => dok.waehle([...dok.karte.s('objekte').keys()].map((k) => ({ s: 'objekte', k }))) },
      { id: 'bearbeiten.abwaehlen', gruppe: 'Bearbeiten', titel: 'Auswahl aufheben', kuerzel: 'Esc', aktiv: mitZone, ausfuehren: () => { dok.waehle([]); ansicht.setzeGeist(null); } },
      // Ansicht
      { id: 'ansicht.2d3d', gruppe: 'Ansicht', titel: '3D / 2D umschalten', icon: 'ansicht3d', kuerzel: 'Tab', ausfuehren: () => this.setzeAnsicht(ansicht.modus === '3d' ? '2d' : '3d') },
      { id: 'ansicht.3d', gruppe: 'Ansicht', titel: '3D-Ansicht', icon: 'ansicht3d', versteckt: true, ausfuehren: () => this.setzeAnsicht('3d') },
      { id: 'ansicht.2d', gruppe: 'Ansicht', titel: 'Draufsicht (2D)', icon: 'ansicht2d', versteckt: true, ausfuehren: () => this.setzeAnsicht('2d') },
      { id: 'ansicht.fokus', gruppe: 'Ansicht', titel: 'Auswahl zeigen', icon: 'fokus', kuerzel: 'F', aktiv: mitAuswahl, ausfuehren: () => ansicht.zeigeAuswahl() },
      { id: 'ansicht.ganz', gruppe: 'Ansicht', titel: 'Ganze Zone zeigen', icon: 'zone', kuerzel: 'Home', aktiv: mitZone, ausfuehren: () => ansicht.zeige(dok.karte.breite / 2, dok.karte.hoehe / 2, Math.max(dok.karte.breite, dok.karte.hoehe) * 0.8) },
      { id: 'ansicht.raster', gruppe: 'Ansicht', titel: 'Raster', icon: 'raster', angehakt: () => ansicht.ebenen.raster, ausfuehren: () => this.#ebene('raster') },
      { id: 'ansicht.wandNiedrig', gruppe: 'Ansicht', titel: 'Wände niedrig', icon: 'wandNiedrig', kuerzel: 'X', angehakt: () => ansicht.wandNiedrig, ausfuehren: () => { ansicht.setzeWandNiedrig(!ansicht.wandNiedrig); this.#ansichtsLeiste(); } },
      { id: 'ansicht.objekte', gruppe: 'Ansicht', titel: 'Objekte zeigen', icon: 'objekt', angehakt: () => ansicht.ebenen.objekte, ausfuehren: () => this.#ebene('objekte') },
      { id: 'ansicht.overlays', gruppe: 'Ansicht', titel: 'Bereiche & Punkte zeigen', icon: 'flaeche', angehakt: () => ansicht.ebenen.overlays, ausfuehren: () => this.#ebene('overlays') },
      { id: 'ansicht.spielOptik', gruppe: 'Ansicht', titel: 'Spiel-Optik (echte Modelle)', icon: 'spielOptik', kuerzel: 'V', aktiv: mitZone, angehakt: () => ansicht.spielOptik.an, ausfuehren: () => { ansicht.spielOptik.setze(!ansicht.spielOptik.an, dok.definition()); this.#ansichtsLeiste(); } },
      ...['tag', 'abend', 'nacht'].map((z) => ({ id: `ansicht.zeit.${z}`, gruppe: 'Ansicht', titel: `Tageszeit: ${{ tag: 'Tag', abend: 'Abend', nacht: 'Nacht' }[z]}`, icon: { tag: 'sonne', abend: 'abend', nacht: 'mond' }[z], angehakt: () => this.stimmung.tageszeit === z, ausfuehren: () => { this.stimmung.setze({ tageszeit: z }); this.#ansichtsLeiste(); } })),
      ...['klar', 'nebel', 'regen', 'schnee'].map((w) => ({ id: `ansicht.wetter.${w}`, gruppe: 'Ansicht', titel: `Wetter: ${{ klar: 'Klar', nebel: 'Nebel', regen: 'Regen', schnee: 'Schnee' }[w]}`, icon: 'wolke', angehakt: () => this.stimmung.wetter === w, ausfuehren: () => { this.stimmung.setze({ wetter: w }); this.#ansichtsLeiste(); } })),
      { id: 'ansicht.palette', gruppe: 'Ansicht', titel: 'Befehlspalette', icon: 'suche', kuerzel: ['Strg+K', 'Strg+P'], ausfuehren: () => this.menues.palette() },
      // Zone
      { id: 'zone.eigenschaften', gruppe: 'Zone', titel: 'Zonen-Eigenschaften', icon: 'einstellungen', aktiv: mitZone, ausfuehren: () => { dok.waehle([]); this.zeigeRechts('inspektor'); } },
      { id: 'zone.groesse', gruppe: 'Zone', titel: 'Größe ändern …', icon: 'skalieren', aktiv: echteZone, ausfuehren: () => this.#dialogGroesse() },
      { id: 'zone.pruefen', gruppe: 'Zone', titel: 'Prüfen', icon: 'pruefen', aktiv: mitZone, ausfuehren: () => { this.pruefung.pruefe(); this.zeigeRechts('pruef'); } },
      { id: 'vorlage.neu', gruppe: 'Zone', titel: 'Neue Vorlage bauen …', icon: 'vorlage', ausfuehren: () => this.#dialogNeueVorlage() },
      { id: 'vorlage.ausAuswahl', gruppe: 'Zone', titel: 'Auswahl als Vorlage speichern …', icon: 'vorlage', aktiv: mitAuswahl, ausfuehren: () => this.#vorlageAusAuswahl() },
      { id: 'vorlage.speichern', gruppe: 'Zone', titel: 'Vorlage speichern', icon: 'speichern', aktiv: () => dok.aktiv?.quelle === 'vorlage', ausfuehren: () => this.#vorlageSpeichern() },
      { id: 'vorlage.bearbeiten', gruppe: 'Zone', titel: 'Vorlage bearbeiten', icon: 'vorlage', versteckt: true, aktiv: () => this.asset?.art === 'vorlage' && !this.asset.eingebaut, ausfuehren: () => this.#vorlageBearbeiten(this.asset) },
      { id: 'vorlage.loeschen', gruppe: 'Zone', titel: 'Vorlage löschen', icon: 'loeschen', versteckt: true, aktiv: () => this.asset?.art === 'vorlage' && !this.asset.eingebaut, ausfuehren: () => this.#vorlageLoeschen(this.asset) },
      // KI
      { id: 'ki.oeffnen', gruppe: 'KI', titel: 'KI-Assistent', icon: 'ki', kuerzel: 'Strg+L', ausfuehren: () => { this.zeigeRechts('ki'); setTimeout(() => document.getElementById('ki-text').focus(), 30); } },
      { id: 'ki.einstellungen', gruppe: 'KI', titel: 'Anbieter & API-Schlüssel …', icon: 'einstellungen', ausfuehren: () => this.ki.einstellungen() },
      { id: 'ki.mcp', gruppe: 'KI', titel: 'Mit Claude & Co. verbinden (MCP) …', icon: 'stecker', ausfuehren: () => this.ki.mcp() },
      // Hilfe
      { id: 'hilfe.tasten', gruppe: 'Hilfe', titel: 'Tastenkürzel', icon: 'hilfe', kuerzel: 'F1', ausfuehren: () => this.#hilfeTasten() },
      { id: 'hilfe.ueber', gruppe: 'Hilfe', titel: 'Über das Studio', icon: 'info', ausfuehren: () => melde('Browser Survival Studio', 'Der Editor für Browser Survival (Phase 1: Karten).<br />Konzept & Plan: <code>docs/konzepte/STUDIO_KONZEPT.md</code> · Anleitung: <code>studio/LIESMICH.md</code>.<br />Icons: eigene Zeichnungen. 3D: three.js (MIT). KI-Anbindung: Model Context Protocol SDK (MIT), Anthropic SDK (MIT).') },
      ...WERKZEUGE.filter((w) => !w.trenner).map((w) => ({ id: `werkzeug.${w.id}`, gruppe: 'Werkzeuge', titel: w.titel, icon: w.icon, kuerzel: w.kuerzel, aktiv: mitZone, ausfuehren: () => werkzeuge.waehle(w.id) })),
    );
  }

  #ebene(name) {
    this.ansicht.ebenen[name] = !this.ansicht.ebenen[name];
    this.ansicht.anfordern();
    this.#ansichtsLeiste();
  }

  #menues() {
    this.menues.baue([
      { titel: 'Datei', eintraege: ['zone.neu', 'zone.speichern', 'zone.insSpiel', '-', 'zone.testen', 'zone.testenHier', '-', 'asset.importModell', 'asset.importKlang', '-', 'zone.schliessen', 'studio.start', 'projekt.ordner'] },
      { titel: 'Bearbeiten', eintraege: ['bearbeiten.rueckgaengig', 'bearbeiten.wiederholen', '-', 'bearbeiten.kopieren', 'bearbeiten.einfuegen', 'bearbeiten.duplizieren', 'bearbeiten.loeschen', '-', 'bearbeiten.alles', 'bearbeiten.abwaehlen'] },
      { titel: 'Ansicht', eintraege: ['ansicht.2d3d', 'ansicht.fokus', 'ansicht.ganz', '-', 'ansicht.spielOptik', 'ansicht.raster', 'ansicht.wandNiedrig', 'ansicht.objekte', 'ansicht.overlays', '-', 'ansicht.zeit.tag', 'ansicht.zeit.abend', 'ansicht.zeit.nacht', '-', 'ansicht.wetter.klar', 'ansicht.wetter.nebel', 'ansicht.wetter.regen', 'ansicht.wetter.schnee', '-', 'ansicht.palette'] },
      { titel: 'Zone', eintraege: ['zone.eigenschaften', 'zone.groesse', 'zone.pruefen', '-', 'vorlage.neu', 'vorlage.ausAuswahl', 'vorlage.speichern'] },
      { titel: 'Werkzeuge', eintraege: WERKZEUGE.map((w) => (w.trenner ? '-' : `werkzeug.${w.id}`)) },
      { titel: 'KI', eintraege: ['ki.oeffnen', 'ki.einstellungen', 'ki.mcp'] },
      { titel: 'Hilfe', eintraege: ['hilfe.tasten', 'ansicht.palette', 'hilfe.ueber'] },
    ]);
  }

  // ---------- Aktionen ----------
  async speichern() {
    const z = this.dok.aktiv;
    if (!z) return;
    if (z.quelle === 'vorlage') return this.#vorlageSpeichern();
    await this.dok.speichereEntwurf();
    this.gespeichertUm = new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    this.#speicherStatus();
    this.hinweis('Entwurf gespeichert (.studio/entwuerfe/)', 'erfolg');
    this.zonenPanel.laden();
  }

  async insSpiel() {
    const { dok } = this;
    const liste = validiere(dok.karte, { zonen: this.zonenKarten() });
    if (hatFehler(liste)) {
      this.pruefung.pruefe();
      this.zeigeRechts('pruef');
      return melde('Noch nicht spielbar', `Die Zone hat ${liste.filter((p) => p.schwere === 'fehler').length} Fehler – rechts unter „Prüfung“ stehen sie (Klick springt hin).`, 'fehler');
    }
    const ok = await frage('Ins Spiel übernehmen', `Schreibt <code>server/spiel/karten/${esc(dok.karte.id)}.js</code> und trägt die Zone im Spiel ein.${liste.length ? `<br /><br />${liste.length} Hinweise (keine Fehler).` : ''}<br /><br />Danach <code>npm test</code> laufen lassen und committen.`, { ja: 'Übernehmen', icon: 'insSpiel' });
    if (!ok) return;
    try {
      const r = await dok.insSpiel();
      this.hinweis(`${r.datei} geschrieben${r.registriert ? ' und im Spiel eingetragen' : ''}`, 'erfolg');
      this.zonenCache?.delete(dok.aktivId);
      this.zonenPanel.laden();
      this.#speicherStatus();
    } catch (f) {
      melde('Übernehmen fehlgeschlagen', esc(String(f.message).replace(/^Error invoking remote method 'studio': (Error: )?/, '')), 'fehler');
    }
  }

  async testen() {
    const { dok } = this;
    if (!dok.karte || dok.aktiv.quelle === 'vorlage') return;
    this.hinweis('Testlauf wird vorbereitet …');
    const zonen = new Map();
    for (const z of this.zonenPanel.liste.filter((x) => x.registriert && !dok.zonen.has(x.id))) {
      const def = await nativ.aufruf('projekt.definition', { id: z.id });
      if (def) zonen.set(z.id, ausDefinition(def).karte);
    }
    for (const [id, z] of dok.zonen) {
      if (z.quelle === 'vorlage') continue;
      const k = z.karte.klon();
      k.anwenden(A.objektKlaenge(k).map((c, i) => ({ s: 'klaenge', k: k.naechsteId + i, neu: c })));
      if (id === dok.aktivId && this.testAmKamerapunkt) {
        const x = Math.floor(this.ansicht.ziel.x);
        const y = Math.floor(this.ansicht.ziel.z);
        if (pruefeMarker(k, 'start', x, y).ok) k.anwenden(A.markerOps(k, 'start', x, y));
      }
      zonen.set(id, k);
    }
    try {
      const { daten, probleme } = testDaten(zonen, dok.aktivId);
      await speichereEditorTest(daten);
      await nativ.aufruf('test.starten', { pfad: '/client/?editorTest=1' });
      this.hinweis(probleme.length ? `Testlauf gestartet (${probleme.length} Zonen fehlen: ${probleme[0]})` : 'Testlauf gestartet – Fenster schließen = zurück', probleme.length ? 'fehler' : 'erfolg');
    } catch (f) {
      melde('Testlauf nicht möglich', esc(f.message), 'fehler');
    }
  }

  async schliessen() {
    const z = this.dok.aktiv;
    if (!z) return;
    if (z.karte.version !== z.gespeichertVersion && z.quelle !== 'spiel') {
      const w = await dialog({ titel: 'Ungespeicherte Änderungen', icon: 'warnung', inhalt: `„${esc(z.karte.name)}“ hat ungespeicherte Änderungen.`, knoepfe: [{ text: 'Abbrechen', wert: null }, { text: 'Verwerfen', wert: 'weg' }, { text: 'Speichern', wert: 'speichern', art: 'primaer' }] });
      if (!w) return;
      if (w === 'speichern') await this.speichern();
    } else if (z.karte.version !== z.gespeichertVersion) await this.dok.speichereEntwurf();
    this.dok.schliesse(this.dok.aktivId);
  }

  #einfuegen() {
    const k = this.dok.karte;
    const v = this.zwischenablage;
    const p = this.einfuegePunkt ?? { tx: Math.floor(this.ansicht.ziel.x), ty: Math.floor(this.ansicht.ziel.z) };
    const { ops, neueIds } = einfuegeOps(k, v, Math.round(p.tx - v.b / 2), Math.round(p.ty - v.h / 2));
    this.dok.aendere('Einfügen', ops);
    this.dok.waehle(Object.entries(neueIds).flatMap(([s, ids]) => ids.map((id) => ({ s, k: id }))));
    this.einfuegePunkt = null;
  }

  async #autosave() {
    for (const [id, z] of this.dok.zonen) {
      if (z.quelle === 'vorlage' || z.karte.version === z.gespeichertVersion) continue;
      try {
        await this.dok.speichereEntwurf(id);
        this.gespeichertUm = new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
      } catch {
        // nächster Versuch beim nächsten Mal
      }
    }
    this.#speicherStatus();
  }

  // ---------- Dialoge ----------
  async #dialogNeueZone() {
    const f = formular([
      { name: 'name', titel: 'Name', wert: 'Neue Zone', platzhalter: 'z. B. Tankstelle Nord' },
      { name: 'id', titel: 'ID', wert: '', platzhalter: 'tankstelle_nord', hilfe: 'Nur a–z, 0–9, _ – wird Dateiname im Spiel.' },
      { name: 'breite', titel: 'Breite (Kacheln)', art: 'zahl', wert: 120, min: 20, max: 1500 },
      { name: 'hoehe', titel: 'Höhe (Kacheln)', art: 'zahl', wert: 100, min: 20, max: 1500 },
      { name: 'boden', titel: 'Grundboden', art: 'auswahl', wert: ',', werte: [[',', 'Gras'], ['$', 'Rasen'], [';', 'Waldboden'], ['*', 'Schnee'], ['!', 'Sand'], ['&', 'Erde'], ['_', 'Asphalt']] },
    ]);
    f.feld('name').addEventListener('input', (e) => {
      if (!f.feld('id').dataset.handarbeit) f.feld('id').value = e.target.value.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
    });
    f.feld('id').addEventListener('input', (e) => (e.target.dataset.handarbeit = '1'));
    f.feld('id').value = 'neue_zone';
    const w = await dialog({
      titel: 'Neue Zone',
      icon: 'zone',
      inhalt: f.element,
      knoepfe: [{ text: 'Abbrechen', wert: null }, { text: 'Anlegen', art: 'primaer', wert: () => f.werte(), pruefe: () => { try { const v = f.werte(); if (!ZONEN_ID_MUSTER.test(v.id)) throw new Error('ID nur a–z, 0–9, _'); if (this.zonenIds().includes(v.id)) throw new Error('Die ID gibt es schon'); return null; } catch (fe) { this.hinweis(fe.message, 'fehler'); return fe; } } }],
    });
    if (!w) return;
    this.neueZone({ id: w.id, name: w.name || w.id, breite: Math.max(20, Math.min(1500, w.breite | 0)), hoehe: Math.max(20, Math.min(1500, w.hoehe | 0)), boden: w.boden });
  }

  async #dialogGroesse() {
    const k = this.dok.karte;
    const f = formular([
      { art: 'hinweis', html: `Aktuell ${k.breite} × ${k.hoehe} Kacheln. Positive Werte vergrößern, negative schneiden ab.` },
      { name: 'links', titel: 'Links', art: 'zahl', wert: 0 },
      { name: 'rechts', titel: 'Rechts', art: 'zahl', wert: 0 },
      { name: 'oben', titel: 'Oben (Norden)', art: 'zahl', wert: 0 },
      { name: 'unten', titel: 'Unten (Süden)', art: 'zahl', wert: 0 },
    ]);
    const w = await dialog({ titel: 'Zonengröße ändern', icon: 'skalieren', inhalt: f.element, knoepfe: [{ text: 'Abbrechen', wert: null }, { text: 'Ändern', art: 'primaer', wert: () => f.werte() }] });
    if (!w) return;
    try {
      const { ops, abgeschnitten } = groesseAendern(k, { links: w.links | 0, oben: w.oben | 0, rechts: w.rechts | 0, unten: w.unten | 0 });
      this.dok.aendere('Zonengröße', ops);
      if (abgeschnitten.length) this.hinweis(`${abgeschnitten.length} Elemente lagen außerhalb und wurden entfernt`);
    } catch (f2) {
      this.hinweis(f2.message, 'fehler');
    }
  }

  async #dialogModellImport() {
    const f = formular([
      { name: 'datei', titel: 'Datei (.glb)', art: 'datei', annehmen: '.glb' },
      { art: 'hinweis', html: '<div class="vorschau-3d" id="import-vorschau"></div><div id="import-masse" style="margin-top:6px;color:var(--text-3)">Noch keine Datei gewählt.</div>' },
      { name: 'name', titel: 'Name', wert: '' },
      { name: 'stem', titel: 'Dateiname', wert: '', hilfe: 'a–z, 0–9, -, _ → client/assets/eigene/<name>.glb' },
      { name: 'kategorie', titel: 'Bereich', art: 'auswahl', wert: 'deko', werte: Object.entries(MODELL_KATEGORIEN).map(([k, t]) => [k, t]) },
      { name: 'zielHoehe', titel: 'Höhe im Spiel (m)', art: 'zahl', wert: 1, min: 0.05, max: 20, schritt: 0.05 },
      { name: 'urheber', titel: 'Urheber', wert: '', platzhalter: 'z. B. Kenney' },
      { name: 'lizenz', titel: 'Lizenz', art: 'auswahl', wert: 'CC0', werte: [['CC0', 'CC0 (gemeinfrei)'], ['CC-BY 4.0', 'CC-BY 4.0'], ['CC-BY 3.0', 'CC-BY 3.0'], ['eigene Arbeit', 'eigene Arbeit'], ['andere', 'andere / siehe Quelle']] },
      { name: 'url', titel: 'Quelle (URL)', wert: '', platzhalter: 'https://…' },
      { art: 'hinweis', html: 'Urheber, Lizenz und Quelle landen automatisch in <code>client/assets/eigene/credits.json</code> (Credits im Spiel).' },
    ]);
    let bytes = null;
    let vorschau = null;
    const zeigeVorschau = (szene) => {
      const ziel = f.element.querySelector('#import-vorschau');
      ziel.innerHTML = '';
      const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
      r.setSize(ziel.clientWidth, ziel.clientHeight);
      ziel.append(r.domElement);
      const s = new THREE.Scene();
      s.background = new THREE.Color(0x0d0f12);
      s.add(new THREE.HemisphereLight(0xffffff, 0x404040, 2.2), szene);
      const box = new THREE.Box3().setFromObject(szene);
      const groesse = box.getSize(new THREE.Vector3());
      const mitte = box.getCenter(new THREE.Vector3());
      const kam = new THREE.PerspectiveCamera(40, ziel.clientWidth / ziel.clientHeight, 0.01, 1000);
      const d = Math.max(groesse.x, groesse.y, groesse.z) * 1.8;
      kam.position.set(mitte.x + d * 0.7, mitte.y + d * 0.5, mitte.z + d * 0.9);
      kam.lookAt(mitte);
      r.render(s, kam);
      vorschau = r.domElement;
      return groesse;
    };
    const w = await dialog({
      titel: 'Modell importieren',
      icon: 'hochladen',
      breit: true,
      inhalt: f.element,
      beimOeffnen: () => {
        f.feld('datei').addEventListener('change', async (e) => {
          const datei = e.target.files?.[0];
          if (!datei) return;
          bytes = new Uint8Array(await datei.arrayBuffer());
          const roh = datei.name.replace(/\.glb$/i, '');
          f.feld('name').value ||= roh.replace(/[-_]+/g, ' ').replace(/\b\p{L}/gu, (c) => c.toUpperCase());
          f.feld('stem').value ||= roh.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').slice(0, 60);
          new GLTFLoader().parse(bytes.buffer.slice(0), '', (gltf) => {
            const g = zeigeVorschau(gltf.scene);
            f.element.querySelector('#import-masse').textContent = `Maße im Modell: ${g.x.toFixed(2)} × ${g.z.toFixed(2)} × ${g.y.toFixed(2)} (B × T × H)`;
            this.importMasse = { b: +g.x.toFixed(3), h: +g.z.toFixed(3), hoehe: +g.y.toFixed(3) };
            if (g.y > 0.05 && g.y < 20) f.feld('zielHoehe').value = g.y.toFixed(2);
          }, (fehler) => (f.element.querySelector('#import-masse').textContent = `Datei nicht lesbar: ${fehler.message ?? fehler}`));
        });
      },
      knoepfe: [{ text: 'Abbrechen', wert: null }, { text: 'Importieren', art: 'primaer', wert: () => f.werte() }],
    });
    if (!w) return;
    if (!bytes || !this.importMasse) return this.hinweis('Keine gültige .glb-Datei gewählt', 'fehler');
    try {
      const png = vorschau ? new Uint8Array(await (await new Promise((r) => vorschau.toBlob(r, 'image/png'))).arrayBuffer()) : null;
      await nativ.aufruf('projekt.importiereModell', { bytes, meta: { stem: w.stem, name: w.name, kategorie: w.kategorie, masse: this.importMasse, zielHoehe: w.zielHoehe, urheber: w.urheber, lizenz: w.lizenz, url: w.url, vorschau: png } });
      setzeSpielordner(await nativ.aufruf('projekt.modellIndex'));
      this.assets.reiter = 'modelle';
      this.assets.zeichne();
      this.hinweis(`„${w.name}“ importiert (client/assets/eigene/${w.stem}.glb)`, 'erfolg');
    } catch (f2) {
      melde('Import fehlgeschlagen', esc(String(f2.message).replace(/^Error invoking remote method 'studio': (Error: )?/, '')), 'fehler');
    }
  }

  async #dialogKlangImport() {
    const k = this.dok.karte;
    const f = formular([
      { name: 'datei', titel: 'Audiodatei', art: 'datei', annehmen: '.ogg,.mp3,.wav,.m4a,.flac,.opus,.webm' },
      { name: 'urheber', titel: 'Urheber', wert: '' },
      { name: 'lizenz', titel: 'Lizenz', art: 'auswahl', wert: 'CC0', werte: [['CC0', 'CC0'], ['CC-BY 4.0', 'CC-BY 4.0'], ['CC-BY 3.0', 'CC-BY 3.0'], ['eigene Arbeit', 'eigene Arbeit'], ['andere', 'andere']] },
      { name: 'url', titel: 'Quelle (URL)', wert: '' },
      { art: 'hinweis', html: `Landet in <code>client/audio/karten/${esc(k.id)}/</code>; Credits in <code>credits.json</code>. Schneiden & Mischen kommt mit der Audio-Zentrale (Phase 2).` },
    ]);
    const w = await dialog({ titel: 'Klang importieren', icon: 'audio', inhalt: f.element, knoepfe: [{ text: 'Abbrechen', wert: null }, { text: 'Importieren', art: 'primaer', wert: () => f.werte() }] });
    if (!w?.datei) return;
    try {
      const datei = await nativ.aufruf('projekt.importiereKlang', { bytes: new Uint8Array(await w.datei.arrayBuffer()), meta: { zone: k.id, name: w.datei.name, urheber: w.urheber, lizenz: w.lizenz, url: w.url } });
      this.klangListe = await nativ.aufruf('projekt.klangDateien');
      this.werkzeuge.opt.klang.datei = datei;
      this.werkzeuge.waehle('klang');
      this.hinweis(`${datei} importiert – jetzt in die Karte klicken`, 'erfolg');
    } catch (f2) {
      melde('Import fehlgeschlagen', esc(f2.message), 'fehler');
    }
  }

  // ---------- Vorlagen ----------
  async #dialogNeueVorlage(start = null) {
    const f = formular([
      { name: 'name', titel: 'Name', wert: start?.name ?? 'Neues Haus' },
      { name: 'breite', titel: 'Breite', art: 'zahl', wert: start?.b ?? 16, min: 3, max: 120 },
      { name: 'hoehe', titel: 'Tiefe', art: 'zahl', wert: start?.h ?? 12, min: 3, max: 120 },
      { art: 'hinweis', html: 'Die Vorlage öffnet sich wie eine kleine Zone. Bau dort alles ein (Wände, Möbel, Loot, Spawnpunkte) und speichere sie – danach steht sie unten unter „Vorlagen“ für jede Zone bereit.' },
    ]);
    const w = await dialog({ titel: 'Neue Vorlage', icon: 'vorlage', inhalt: f.element, knoepfe: [{ text: 'Abbrechen', wert: null }, { text: 'Bauen', art: 'primaer', wert: () => f.werte() }] });
    if (!w) return;
    const id = `vorlage_${w.name.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30) || 'neu'}`;
    const k = new EditorKarte({ id, name: w.name, breite: Math.max(3, w.breite | 0), hoehe: Math.max(3, w.hoehe | 0) });
    this.dok.nimmAuf(id, k, 'vorlage');
  }

  async #vorlageSpeichern() {
    const z = this.dok.aktiv;
    if (z?.quelle !== 'vorlage') return;
    const k = z.karte;
    const vorlage = A.vorlageAus(k, { x: 0, y: 0, b: k.breite, h: k.hoehe }, k.name);
    const id = k.id.replace(/^vorlage_/, '') || 'vorlage';
    await nativ.aufruf('projekt.speichereVorlage', { vorlage: { id, name: k.name, format: 'browser-survival-vorlage', formatVersion: 1, gespeichert: new Date().toISOString(), vorlage } });
    z.gespeichertVersion = k.version;
    this.vorlagenListe = await nativ.aufruf('projekt.vorlagen');
    this.assets.zeichne();
    this.#speicherStatus();
    this.zonenPanel.zeichne();
    this.hinweis(`Vorlage „${k.name}“ gespeichert (studio/vorlagen/${id}.json)`, 'erfolg');
  }

  async #vorlageAusAuswahl() {
    const { dok } = this;
    const v = kopiereElemente(dok.karte, dok.gewaehlt());
    if (!v) return this.hinweis('Nichts Kopierbares gewählt', 'fehler');
    // Kacheln unter dem Rahmen mitnehmen (Wände/Böden der Gebäude)
    const boxen = dok.auswahl.map((a) => this.ansicht.boxVon(a)).filter(Boolean);
    const x0 = Math.floor(Math.min(...boxen.map((b) => b.min.x)));
    const y0 = Math.floor(Math.min(...boxen.map((b) => b.min.z)));
    const x1 = Math.ceil(Math.max(...boxen.map((b) => b.max.x)));
    const y1 = Math.ceil(Math.max(...boxen.map((b) => b.max.z)));
    const f = formular([{ name: 'name', titel: 'Name', wert: 'Meine Vorlage' }, { name: 'boden', titel: '', art: 'schalter', wert: true, text: `Boden & Wände im Rahmen mitnehmen (${x1 - x0} × ${y1 - y0})` }]);
    const w = await dialog({ titel: 'Als Vorlage speichern', icon: 'vorlage', inhalt: f.element, knoepfe: [{ text: 'Abbrechen', wert: null }, { text: 'Speichern', art: 'primaer', wert: () => f.werte() }] });
    if (!w) return;
    const vorlage = w.boden ? A.vorlageAus(dok.karte, { x: x0, y: y0, b: x1 - x0, h: y1 - y0 }, w.name) : v;
    const id = w.name.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30) || 'vorlage';
    await nativ.aufruf('projekt.speichereVorlage', { vorlage: { id, name: w.name, format: 'browser-survival-vorlage', formatVersion: 1, gespeichert: new Date().toISOString(), vorlage } });
    this.vorlagenListe = await nativ.aufruf('projekt.vorlagen');
    this.assets.reiter = 'vorlagen';
    this.assets.zeichne();
    this.hinweis(`Vorlage „${w.name}“ gespeichert`, 'erfolg');
  }

  #vorlageBearbeiten(a) {
    const v = a.vorlage;
    const id = `vorlage_${a.vorlageId}`;
    if (this.dok.zonen.has(id)) return this.dok.aktiviere(id);
    const k = new EditorKarte({ id, name: a.name, breite: v.b, hoehe: v.h });
    k.anwenden(A.vorlageOps(k, v, 0, 0).ops);
    this.dok.nimmAuf(id, k, 'vorlage');
  }

  async #vorlageLoeschen(a) {
    if (!(await frage('Vorlage löschen', `„${esc(a.name)}“ endgültig löschen? Bereits eingesetzte Kopien in Zonen bleiben.`, { ja: 'Löschen', gefahr: true }))) return;
    await nativ.aufruf('projekt.loescheVorlage', { id: a.vorlageId });
    this.vorlagenListe = await nativ.aufruf('projekt.vorlagen');
    this.asset = null;
    this.assets.zeichne();
  }

  #hilfeTasten() {
    const zeilen = [...this.befehle.liste.values()].filter((b) => b.kuerzel).map((b) => `<div class="menue-eintrag" style="pointer-events:none"><span class="gruppe" style="width:90px;color:var(--text-3)">${esc(b.gruppe)}</span>${b.icon ? icon(b.icon, 15) : ''}<span>${esc(b.titel)}</span><span class="kuerzel">${esc([].concat(b.kuerzel).join(' / '))}</span></div>`);
    zeilen.push('<div class="menue-trenner"></div><div class="menue-eintrag" style="pointer-events:none"><span>Kamera</span><span class="kuerzel">Rechte Maus drehen · Mitte/Leertaste schieben · Rad Zoom · RMT+WASD/QE fliegen</span></div><div class="menue-eintrag" style="pointer-events:none"><span>Pinselgröße</span><span class="kuerzel">[ ]</span></div><div class="menue-eintrag" style="pointer-events:none"><span>Objekt drehen beim Setzen</span><span class="kuerzel">Strg+Rad</span></div>');
    dialog({ titel: 'Tastenkürzel', icon: 'hilfe', breit: true, inhalt: `<div>${zeilen.join('')}</div>`, knoepfe: [{ text: 'Schließen', wert: true, art: 'primaer' }] });
  }

  async #startbild() {
    const id = await zeigeStartbild(this);
    if (id) await this.oeffneZone(id).catch(() => {});
  }

  // ---------- Start ----------
  async starte() {
    this.#registriereBefehle();
    this.#menues();
    this.#werkzeugleiste();
    this.#ansichtsLeiste();
    this.#rechtsReiter();
    document.getElementById('knopf-testen').innerHTML = `${icon('abspielen', 14)} Testen`;
    document.querySelector('[data-befehl="asset.importModell"]').innerHTML = icon('hochladen', 16);
    const info = await nativ.aufruf('projekt.info');
    document.title = `Browser Survival Studio – ${info.name}`;
    await ladeSpielordner(new URL('../client/assets/eigene/', location.href)).catch(() => 0);
    this.vorlagenListe = await nativ.aufruf('projekt.vorlagen');
    this.klangListe = await nativ.aufruf('projekt.klangDateien');
    await this.zonenPanel.laden();
    await this.#ladeZonenCache();
    this.assets.zeichne();
    this.werkzeuge.waehle('auswahl');
    this.#zoneGewechselt();
    const m = await nativ.aufruf('mcp.info');
    document.getElementById('status-mcp').innerHTML = m.aktiv ? `<span class="status-marke" data-tipp="MCP-Server" data-text="${esc(m.url)}">${icon('stecker', 13)} MCP bereit</span>` : '';
    setInterval(() => this.#autosave(), 60_000);
    addEventListener('beforeunload', () => this.#autosave());
    this.bereit = true;
    if (!new URLSearchParams(location.search).has('ohneStart')) await this.#startbild();
  }
}

const studio = new Studio();
window.studio = studio;
studio.starte().catch((f) => {
  console.error(f);
  document.getElementById('status-text').textContent = `Start fehlgeschlagen: ${f.message}`;
  document.getElementById('status-text').className = 'fehler';
});

import * as THREE from 'three';
import { GLTFLoader } from '../client/vendor/three/addons.js';
import { Dokument } from './kern/dokument.js';
import { Befehle } from './kern/befehle.js';
import { erstelleKiAusfuehrer } from './kern/kiAusfuehren.js';
import * as A from './kern/aktionen.js';
import * as B from './kern/bauhilfen.js';
import { katalog } from '../editor/kern/katalog.js';
import { spielordnerListe } from '../editor/kern/spielordner.js';
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
import { oeffneItemEditor } from './oberflaeche/itemEditor.js';
import { Werkstatt } from './werkstatt/werkstatt.js';
import { VorschauBilder } from './ansicht/vorschauBilder.js';
import { oeffnePapierkorb } from './oberflaeche/papierkorb.js';
import { oeffneVeroeffentlichen } from './oberflaeche/veroeffentlichen.js';
import { Vorschlaege, rueckOps, mitKoordinaten } from './kern/vorschlaege.js';
import { AudioZentrale } from './audio/audioZentrale.js';
import { ladeSpielordner, setzeSpielordner } from '../editor/kern/spielordner.js';
import { ausDefinition, ladeDatei } from '../editor/kern/format.js';
import { EditorKarte } from '../editor/kern/karte.js';
import { kopiereElemente, einfuegeOps } from '../editor/kern/auswahl.js';
import { groesseAendern, ZONEN_ID_MUSTER } from '../editor/kern/zone.js';
import { MODELL_KATEGORIEN } from '../editor/kern/katalog.js';
import { testDaten } from '../editor/kern/testlauf.js';
import { neueVersion, fuegeHinzu, vergleiche, wiederherstellenOps } from '../editor/kern/versionen.js';
import { layoutAusUebergaengen } from '../editor/kern/zonenVerbund.js';
import { laufweg, balance, heatmapGitter, BEREICHE } from './kern/analyse.js';
import { beispielItems } from './kern/lootVorschau.js';
import { lootDichte } from '../editor/kern/lootZonenEditor.js';
import { hilfslinieOps } from '../editor/kern/messen.js';
import { ebenenAus, EBENEN } from '../editor/kern/ebenen.js';
import { nachDefinition } from '../editor/kern/format.js';
import { KACHELN } from '../gemeinsam/welt/kacheln.js';
import { RESSOURCEN_OBJEKTE } from '../gemeinsam/welt/ressourcen.js';
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
    try {
      this.dok.ebenen = ebenenAus(JSON.parse(localStorage.getItem('browserSurvival.studio.ebenen') || 'null'));
      this.zuletzt = JSON.parse(localStorage.getItem('browserSurvival.studio.zuletzt') || '[]');
    } catch {
      this.zuletzt = [];
    }
    this.ansicht.ebenenZustand = this.dok.ebenen;
    this.ansicht.vorlagenName = (id) => this.vorlagenListe.find((v) => v.id === id)?.name ?? id;
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
    this.vorschlaege = new Vorschlaege();
    try {
      this.vorschlagsModus = localStorage.getItem('browserSurvival.studio.vorschlagsModus') === '1';
    } catch {
      this.vorschlagsModus = false;
    }
    this.ki = new KiPanel(this);
    this.werkstatt = new Werkstatt(this);
    this.vorschau = new VorschauBilder(nativ);
    this.vorschau.beiFertig = (id, url) => {
      for (const el of document.querySelectorAll(`[data-vorschau="${CSS.escape(id)}"]`)) {
        el.removeAttribute('data-vorschau');
        el.style.background = '#1b1e24';
        el.innerHTML = `<img src="${url}" alt="" />`;
      }
    };
    this.audio = new AudioZentrale(this);
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

  /** Wie zonenKarten, aber Zonen mit gespeichertem Entwurf aus dem Entwurf (dort stehen die neuesten Notizen) – für `auftraege` */
  async alleZonenKarten() {
    const m = this.zonenKarten();
    for (const z of this.zonenPanel.liste) {
      if (!z.entwurf || this.dok.zonen.has(z.id)) continue;
      try {
        const e = await nativ.aufruf('projekt.ladeEntwurf', { id: z.id });
        if (e) m.set(z.id, ladeDatei(e).karte);
      } catch {
        // kaputter Entwurf → Spielstand bleibt
      }
    }
    return m;
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

  // ---------- Vorschlagsmodus (Phase 4.7, kern/vorschlaege.js) ----------
  setzeVorschlagsModus(an) {
    this.vorschlagsModus = !!an;
    try {
      localStorage.setItem('browserSurvival.studio.vorschlagsModus', an ? '1' : '0');
    } catch {
      // egal
    }
    const kasten = document.getElementById('ki-vorschlag');
    if (kasten) kasten.checked = this.vorschlagsModus;
    this.ki.zeichneVorschlaege();
    this.hinweis(an ? 'Vorschlagsmodus an: KI-Änderungen sind vorläufig – im KI-Reiter einzeln ablehnen oder übernehmen' : 'Vorschlagsmodus aus');
  }

  merkeVorschlag(name, ops) {
    this.vorschlaege.merke(this.dok.aktivId, name, ops);
    this.zeigeVorschlaege();
  }

  zeigeVorschlaege() {
    const k = this.dok.karte;
    this.ansicht.setzeMarkierungen(k ? this.vorschlaege.markierungen(this.dok.aktivId, k) : null);
    this.ki?.zeichneVorschlaege();
  }

  /** ref = 'eintrag' oder 'eintrag:element' → Änderung zurücknehmen (eigener Undo-Schritt) */
  lehneVorschlagAb(ref) {
    const k = this.dok.karte;
    const ops = rueckOps(k, this.vorschlaege.nimm(ref));
    if (ops.length) this.dok.aendere('KI-Vorschlag abgelehnt', ops);
    this.zeigeVorschlaege();
    return ops.length;
  }

  uebernimmVorschlaege(ref = null) {
    const n = this.vorschlaege.uebernimm(this.dok.aktivId, ref);
    this.zeigeVorschlaege();
    if (ref === null) this.hinweis(`${n} KI-Vorschläge übernommen`, 'erfolg');
    return n;
  }

  zeigeVorschlagOrt(ref) {
    const [eid, elid] = String(ref).split(':');
    const e = this.vorschlaege.liste.find((x) => String(x.id) === eid);
    const el = e?.elemente.find((x) => x.id === elid) ?? e?.elemente[0];
    const o = el && mitKoordinaten(el.orte ?? [], this.dok.karte.breite)[0];
    if (o) this.ansicht.zeige(o.x + (o.b ?? 1) / 2, o.y + (o.h ?? 1) / 2, null);
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
    // „Zuletzt benutzt“ (Vorlagen nur als Verweis, Inhalt kommt frisch aus der Liste)
    const merk = a.art === 'vorlage' ? { art: a.art, id: a.id, name: a.name, vorlageId: a.vorlageId, eingebaut: a.eingebaut } : a;
    this.zuletzt = [merk, ...this.zuletzt.filter((z) => z.id !== a.id)].slice(0, 18);
    try {
      localStorage.setItem('browserSurvival.studio.zuletzt', JSON.stringify(this.zuletzt));
    } catch {
      // egal
    }
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
    setTimeout(() => this.zeigeVorschlaege(), 0);
    this.ansicht.setzeKarte(z?.karte ?? null);
    if (this.ansicht.spielOptik.an && z) this.ansicht.spielOptik.baue(this.dok.definition());
    this.#lootVorschau(this.lootVorschauAn && !!z, { still: true });
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
      this.#lootVorschauPlanen();
      werkzeuge.vergissFang();
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
      doppel: () => (werkzeuge.aktiv === 'messen' ? werkzeuge.messenEnde() : ansicht.zeigeAuswahl()),
      kontext: (e) => {
        const p = ansicht.treffe(e.clientX, e.clientY);
        if (this.ansicht.laufen) return;
        if (p?.treffer && !dok.auswahl.some((a) => a.s === p.treffer.s && a.k === p.treffer.k)) dok.waehle([p.treffer]);
        this.einfuegePunkt = p;
        this.menues.kontext(e.clientX, e.clientY, dok.auswahl.length ? ['bearbeiten.kopieren', 'bearbeiten.duplizieren', 'vorlage.ausAuswahl', '-', 'ansicht.fokus', '-', 'bearbeiten.loeschen'] : ['bearbeiten.einfuegen', 'notiz.hier', '-', 'hilfslinie.waagerecht', 'hilfslinie.senkrecht', '-', 'ansicht.2d3d', 'ansicht.fokus']);
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
    document.getElementById('ansicht-oben-rechts').innerHTML = `<div class="glas"><div class="segment"><button data-befehl="ansicht.spielOptik" class="${a.spielOptik.an ? 'aktiv' : ''}" data-tipp="Spiel-Optik" data-kuerzel="V" data-text="Echte Modelle & Texturen des Spiels zeigen">${icon('spielOptik', 15)} Spiel-Optik</button><button data-befehl="ansicht.lootVorschau" class="${this.lootVorschauAn ? 'aktiv' : ''}" data-tipp="Loot-Vorschau" data-kuerzel="Umschalt+V" data-text="Beispiel-Items an allen Loot-Punkten (gewürfelt wie im Spiel)">${icon('item', 15)} Loot</button>${this.lootVorschauAn ? `<button data-befehl="ansicht.lootNeu" data-tipp="Neu würfeln" data-text="Andere Beispiel-Items zeigen">${icon('wuerfel', 15)}</button>` : ''}</div></div>
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
      { id: 'ansicht.vorschauNeu', gruppe: 'Ansicht', titel: 'Vorschaubilder neu erzeugen', icon: 'wiederholen', ausfuehren: async () => { await this.vorschau.loescheCache(); this.assets.zeichne(); this.hinweis('Vorschaubilder werden neu erzeugt …'); } },
      { id: 'projekt.veroeffentlichen', gruppe: 'Datei', titel: 'Veröffentlichen (Tests, Commit, Push) …', icon: 'insSpiel', kuerzel: 'Strg+Umschalt+P', ausfuehren: () => oeffneVeroeffentlichen(this) },
      { id: 'projekt.papierkorb', gruppe: 'Datei', titel: 'Papierkorb …', icon: 'loeschen', ausfuehren: () => oeffnePapierkorb(this) },
      { id: 'audio.oeffnen', gruppe: 'Datei', titel: 'Audio-Zentrale', icon: 'audio', kuerzel: 'Strg+Umschalt+A', ausfuehren: () => this.audio.oeffne() },
      { id: 'werkstatt.oeffnen', gruppe: 'Datei', titel: 'Modell-Werkstatt', icon: 'modell', kuerzel: 'Strg+Umschalt+M', ausfuehren: () => this.werkstatt.oeffne() },
      { id: 'modell.bearbeiten', gruppe: 'Datei', titel: 'In der Werkstatt bearbeiten', icon: 'modell', versteckt: true, aktiv: () => this.asset?.art === 'modell', ausfuehren: () => this.werkstatt.oeffne(this.asset.id.slice(7)) },
      { id: 'daten.items', gruppe: 'Datei', titel: 'Items, Loot & Rezepte …', icon: 'item', kuerzel: 'Strg+I', ausfuehren: () => oeffneItemEditor(this) },
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
      { id: 'bearbeiten.abwaehlen', gruppe: 'Bearbeiten', titel: 'Auswahl aufheben', kuerzel: 'Esc', aktiv: mitZone, ausfuehren: () => { if (werkzeuge.messenEnde(true)) return; dok.waehle([]); ansicht.setzeGeist(null); } },
      { id: 'messen.fertig', gruppe: 'Werkzeuge', titel: 'Messung beenden', kuerzel: 'Enter', versteckt: true, aktiv: () => werkzeuge.aktiv === 'messen', ausfuehren: () => werkzeuge.messenEnde() },
      { id: 'hilfslinie.waagerecht', gruppe: 'Ansicht', titel: 'Hilfslinie waagerecht (hier)', icon: 'raster', aktiv: mitZone, ausfuehren: () => this.#hilfslinie('y') },
      { id: 'hilfslinie.senkrecht', gruppe: 'Ansicht', titel: 'Hilfslinie senkrecht (hier)', icon: 'raster', aktiv: mitZone, ausfuehren: () => this.#hilfslinie('x') },
      { id: 'hilfslinien.loeschen', gruppe: 'Ansicht', titel: 'Alle Hilfslinien löschen', icon: 'loeschen', aktiv: () => !!(dok.karte?.werte.hilfslinien), ausfuehren: () => dok.aendere('Hilfslinien gelöscht', [{ s: 'wert', pfad: 'hilfslinien', neu: undefined }]) },
      { id: 'notiz.hier', gruppe: 'Zone', titel: 'Notiz hier …', icon: 'notiz', aktiv: mitZone, ausfuehren: () => { const p = this.einfuegePunkt; this.neueNotiz(p ? p.x : ansicht.ziel.x, p ? p.y : ansicht.ziel.z); } },
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
      { id: 'zone.ersetzen', gruppe: 'Zone', titel: 'Ersetzen …', icon: 'ersetzen', kuerzel: 'Strg+H', aktiv: mitZone, ausfuehren: () => this.#dialogErsetzen() },
      { id: 'zone.generieren', gruppe: 'Zone', titel: 'Generieren (Wald, Dorf) …', icon: 'generator', aktiv: echteZone, ausfuehren: () => this.#dialogGenerieren() },
      { id: 'zone.versionen', gruppe: 'Zone', titel: 'Versionen & Vergleich …', icon: 'versionen', aktiv: echteZone, ausfuehren: () => this.#dialogVersionen() },
      { id: 'zone.versionSpeichern', gruppe: 'Zone', titel: 'Version speichern …', icon: 'versionen', kuerzel: 'Strg+Umschalt+S', aktiv: echteZone, ausfuehren: () => this.#versionSpeichern() },
      { id: 'zone.vergleichAus', gruppe: 'Zone', titel: 'Markierungen ausblenden', icon: 'schliessen', versteckt: true, aktiv: () => !!this.vergleichAn, ausfuehren: () => { this.ansicht.setzeMarkierungen(null); this.vergleichAn = false; } },
      { id: 'pruefen.laufweg', gruppe: 'Zone', titel: 'Laufweg prüfen', icon: 'start', kuerzel: 'Strg+R', aktiv: echteZone, ausfuehren: () => this.#laufweg() },
      { id: 'pruefen.balance', gruppe: 'Zone', titel: 'Balance (alle Zonen) …', icon: 'ebenen', aktiv: () => this.zonenKarten().size > 0, ausfuehren: () => this.#balance() },
      { id: 'ansicht.lootVorschau', gruppe: 'Ansicht', titel: 'Loot-Vorschau (Beispiel-Items)', icon: 'item', kuerzel: 'Umschalt+V', aktiv: mitZone, angehakt: () => !!this.lootVorschauAn, ausfuehren: () => this.#lootVorschau(!this.lootVorschauAn) },
      { id: 'ansicht.lootNeu', gruppe: 'Ansicht', titel: 'Loot-Vorschau neu würfeln', icon: 'wuerfel', aktiv: () => !!this.lootVorschauAn, ausfuehren: () => { this.lootSaat = (this.lootSaat ?? 1) + 1; this.#lootVorschau(true); } },
      { id: 'ansicht.heatmap', gruppe: 'Ansicht', titel: 'Loot-Heatmap', icon: 'item', kuerzel: 'Umschalt+H', aktiv: mitZone, angehakt: () => !!this.heatmapAn, ausfuehren: () => this.#heatmap(!this.heatmapAn) },
      { id: 'ansicht.laufen', gruppe: 'Ansicht', titel: 'Als Spieler herumlaufen', icon: 'start', kuerzel: 'F6', aktiv: mitZone, ausfuehren: () => this.#laufen() },
      { id: 'zone.weltkarte', gruppe: 'Zone', titel: 'Weltkarte …', icon: 'welt', kuerzel: 'Strg+M', ausfuehren: () => this.#weltkarte() },
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

  #hilfslinie(achse) {
    const p = this.einfuegePunkt;
    const wert = p ? (achse === 'x' ? Math.round(p.x * 2) / 2 : Math.round(p.y * 2) / 2) : achse === 'x' ? Math.round(this.ansicht.ziel.x) : Math.round(this.ansicht.ziel.z);
    this.dok.aendere('Hilfslinie', hilfslinieOps(this.dok.karte, achse, null, wert));
    this.hinweis(`Hilfslinie bei ${achse} = ${wert} – Objekte rasten daran ein`);
  }

  /** Ebene sichtbar/gesperrt umschalten (Szene-Panel) */
  setzeEbene(id, art) {
    const e = this.dok.ebenen[id];
    if (!e) return;
    e[art] = !e[art];
    try {
      localStorage.setItem('browserSurvival.studio.ebenen', JSON.stringify(this.dok.ebenen));
    } catch {
      // egal
    }
    this.ansicht.objekteSchmutzig = true;
    this.ansicht.overlaysSchmutzig = true;
    this.ansicht.anfordern();
    this.szene.zeichne();
    this.hinweis(`${EBENEN.find((x) => x.id === id)?.name}: ${art === 'sichtbar' ? (e.sichtbar ? 'sichtbar' : 'ausgeblendet') : e.gesperrt ? 'gesperrt' : 'entsperrt'}`);
  }

  #ebene(name) {
    this.ansicht.ebenen[name] = !this.ansicht.ebenen[name];
    this.ansicht.anfordern();
    this.#ansichtsLeiste();
  }

  #menues() {
    this.menues.baue([
      { titel: 'Datei', eintraege: ['zone.neu', 'zone.speichern', 'zone.insSpiel', 'projekt.veroeffentlichen', '-', 'zone.testen', 'zone.testenHier', '-', 'asset.importModell', 'asset.importKlang', '-', 'audio.oeffnen', 'werkstatt.oeffnen', 'daten.items', 'projekt.papierkorb', '-', 'zone.schliessen', 'studio.start', 'projekt.ordner'] },
      { titel: 'Bearbeiten', eintraege: ['bearbeiten.rueckgaengig', 'bearbeiten.wiederholen', '-', 'bearbeiten.kopieren', 'bearbeiten.einfuegen', 'bearbeiten.duplizieren', 'bearbeiten.loeschen', '-', 'bearbeiten.alles', 'bearbeiten.abwaehlen'] },
      { titel: 'Ansicht', eintraege: ['ansicht.2d3d', 'ansicht.fokus', 'ansicht.ganz', '-', 'ansicht.spielOptik', 'ansicht.lootVorschau', 'ansicht.lootNeu', 'ansicht.laufen', 'ansicht.heatmap', 'ansicht.raster', 'hilfslinie.waagerecht', 'hilfslinie.senkrecht', 'hilfslinien.loeschen', 'ansicht.wandNiedrig', 'ansicht.objekte', 'ansicht.overlays', '-', 'ansicht.zeit.tag', 'ansicht.zeit.abend', 'ansicht.zeit.nacht', '-', 'ansicht.wetter.klar', 'ansicht.wetter.nebel', 'ansicht.wetter.regen', 'ansicht.wetter.schnee', '-', 'ansicht.vorschauNeu', 'ansicht.palette'] },
      { titel: 'Zone', eintraege: ['zone.eigenschaften', 'zone.groesse', 'zone.pruefen', 'pruefen.laufweg', 'pruefen.balance', 'zone.weltkarte', '-', 'zone.versionSpeichern', 'zone.versionen', 'zone.vergleichAus', '-', 'zone.ersetzen', 'zone.generieren', '-', 'vorlage.neu', 'vorlage.ausAuswahl', 'vorlage.speichern'] },
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
      await this.#versionAblegen('Ins Spiel übernommen', 'export');
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

  /** Rahmen der Auswahl (Kacheln) oder null */
  auswahlRahmen() {
    const boxen = this.dok.auswahl.map((a) => this.ansicht.boxVon(a)).filter(Boolean);
    if (!boxen.length) return null;
    const x = Math.floor(Math.min(...boxen.map((b) => b.min.x)));
    const y = Math.floor(Math.min(...boxen.map((b) => b.min.z)));
    return { x, y, b: Math.ceil(Math.max(...boxen.map((b) => b.max.x))) - x, h: Math.ceil(Math.max(...boxen.map((b) => b.max.z))) - y };
  }

  async #dialogErsetzen() {
    const k = this.dok.karte;
    const typen = [...new Set([...k.s('objekte').values()].map((o) => o.typ))].sort();
    const ziele = [...katalog().filter((e) => e.art === 'objekt' && !e.id.includes('@')).map((e) => [e.id, e.name]), ...spielordnerListe().map((m) => [`modell:${m.stem}`, `Modell: ${m.name}`])];
    const kacheln = katalog().filter((e) => e.art === 'kachel').map((e) => [e.zeichen, e.name]);
    const rahmen = this.auswahlRahmen();
    const f = formular([
      { name: 'bereich', titel: 'Bereich', art: 'auswahl', wert: rahmen ? 'auswahl' : 'zone', werte: [['zone', 'ganze Zone'], ...(rahmen ? [['auswahl', `Rahmen der Auswahl (${rahmen.b} × ${rahmen.h})`]] : [])] },
      { name: 'vonTyp', titel: 'Objekte von', art: 'auswahl', wert: '', werte: [['', '— keine —'], ...typen.map((t) => [t, t])] },
      { name: 'zu', titel: 'ersetzen durch', art: 'auswahl', wert: '', werte: [['', '— wählen —'], ...ziele] },
      { name: 'vonZeichen', titel: 'Boden von', art: 'auswahl', wert: '', werte: [['', '— keiner —'], ...kacheln] },
      { name: 'zuZeichen', titel: 'ersetzen durch', art: 'auswahl', wert: '', werte: [['', '— wählen —'], ...kacheln] },
    ]);
    const w = await dialog({ titel: 'Ersetzen', icon: 'ersetzen', inhalt: f.element, knoepfe: [{ text: 'Abbrechen', wert: null }, { text: 'Ersetzen', art: 'primaer', wert: () => f.werte() }] });
    if (!w) return;
    try {
      const ops = B.ersetzOps(k, { r: w.bereich === 'auswahl' ? rahmen : null, vonTyp: w.vonTyp || null, zu: w.zu || null, vonZeichen: w.vonZeichen || null, zuZeichen: w.zuZeichen || null });
      this.dok.aendere('Ersetzen', ops);
      this.hinweis(`${ops.length} Änderungen`, 'erfolg');
    } catch (fe) {
      this.hinweis(fe.message, 'fehler');
    }
  }

  async #dialogGenerieren() {
    const k = this.dok.karte;
    const r = this.auswahlRahmen() ?? { x: 0, y: 0, b: k.breite, h: k.hoehe };
    const f = formular([
      { name: 'art', titel: 'Was', art: 'auswahl', wert: 'wald', werte: [['wald', 'Wald (Waldboden, Bäume, Lichtung, See)'], ['nadelwald', 'Nadelwald'], ['dorf', 'Dorf (Straße + Häuser)']] },
      { name: 'x', titel: 'Bereich x', art: 'zahl', wert: r.x },
      { name: 'y', titel: 'y', art: 'zahl', wert: r.y },
      { name: 'b', titel: 'Breite', art: 'zahl', wert: r.b },
      { name: 'h', titel: 'Höhe', art: 'zahl', wert: r.h },
      { name: 'dichte', titel: 'Wald-Dichte', art: 'zahl', wert: 5, min: 1, max: 15 },
      { name: 'see', titel: '', art: 'schalter', wert: true, text: 'See' },
      { name: 'lichtung', titel: '', art: 'schalter', wert: true, text: 'Lichtung' },
      { name: 'haeuser', titel: 'Häuser (Dorf)', art: 'zahl', wert: 6, min: 1, max: 30 },
      { name: 'vorlagen', titel: '', art: 'schalter', wert: this.vorlagenListe.length > 0, text: 'eigene Vorlagen als Häuser nutzen' },
      { name: 'saat', titel: 'Variante', art: 'zahl', wert: Math.floor(Math.random() * 1000), hilfe: 'Gleiche Zahl = gleiches Ergebnis.' },
      { art: 'hinweis', html: 'Ein Startpunkt zum Weiterbauen – alles ist ein einziger Undo-Schritt (Strg+Z).' },
    ]);
    const w = await dialog({ titel: 'Generieren', icon: 'generator', inhalt: f.element, knoepfe: [{ text: 'Abbrechen', wert: null }, { text: 'Generieren', art: 'primaer', wert: () => f.werte() }] });
    if (!w) return;
    try {
      const bereich = { x: w.x, y: w.y, b: w.b, h: w.h };
      const e = w.art === 'dorf' ? B.generiereDorf(k, bereich, { haeuser: w.haeuser, vorlagen: w.vorlagen ? this.vorlagenListe.map((v) => v.vorlage) : [], saat: w.saat }) : B.generiereWald(k, bereich, { dichte: w.dichte, see: w.see, lichtung: w.lichtung, set: w.art, saat: w.saat });
      this.dok.aendere(w.art === 'dorf' ? 'Dorf generiert' : 'Wald generiert', B.verdichte(e.ops));
      this.hinweis(w.art === 'dorf' ? `${e.haeuser} Häuser gebaut` : 'Wald generiert', 'erfolg');
    } catch (fe) {
      this.hinweis(fe.message, 'fehler');
    }
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
      { art: 'hinweis', html: `Landet in <code>client/audio/karten/${esc(k.id)}/</code>; Credits in <code>credits.json</code>. Schneiden & Zuordnen: Datei → Audio-Zentrale.` },
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
    await this.#kopienAktualisieren(id, vorlage);
  }

  /** Nach dem Speichern einer Vorlage: alle verknüpften Kopien in allen Zonen auf den neuen Stand bringen (nachfragen) */
  async #kopienAktualisieren(vorlageId, vorlage) {
    const treffer = [];
    for (const [zid, k] of this.zonenKarten()) {
      const n = A.vorlagenInstanzen(k).filter((i) => i.vorlage === vorlageId).length;
      if (n) treffer.push([zid, n]);
    }
    if (!treffer.length) return;
    const summe = treffer.reduce((s, [, n]) => s + n, 0);
    const ok = await frage('Kopien aktualisieren?', `Diese Vorlage steckt <b>${summe}×</b> in: ${treffer.map(([z, n]) => `${esc(z)} (${n})`).join(', ')}.<br /><br />Alle Kopien auf den neuen Stand bringen? (je Zone ein Undo-Schritt, Zonen werden geöffnet und müssen danach gespeichert werden)`, { ja: 'Alle aktualisieren', icon: 'vorlage' });
    if (!ok) return;
    const zurueck = this.dok.aktivId;
    for (const [zid] of treffer) {
      await this.oeffneZone(zid);
      const k = this.dok.karte;
      this.dok.gruppe(`Vorlage „${vorlage.name ?? vorlageId}“ aktualisiert`, () => {
        for (const i of A.vorlagenInstanzen(k).filter((x) => x.vorlage === vorlageId)) this.dok.aendere('Kopie', A.aktualisiereInstanzOps(k, i, vorlage));
      });
    }
    this.dok.aktiviere(zurueck);
    this.hinweis(`${summe} Kopien aktualisiert – Zonen speichern nicht vergessen`, 'erfolg');
  }

  // ---------- Notizen ----------
  async neueNotiz(x, y) {
    const f = formular([{ name: 'text', titel: 'Notiz', art: 'textfeld', wert: '', zeilen: 4 }]);
    const w = await dialog({ titel: 'Notiz setzen', icon: 'notiz', inhalt: f.element, knoepfe: [{ text: 'Abbrechen', wert: null }, { text: 'Setzen', art: 'primaer', wert: () => f.werte() }] });
    if (!w?.text?.trim()) return;
    const { ops, id } = A.notizOps(this.dok.karte, x, y, w.text);
    this.dok.aendere('Notiz', ops);
    this.dok.waehle([{ s: 'notizen', k: id }]);
  }

  // ---------- Versionen ----------
  async #versionAblegen(name, art = 'manuell') {
    const id = this.dok.aktivId;
    const liste = await nativ.aufruf('projekt.versionen', { id });
    await nativ.aufruf('projekt.speichereVersionen', { id, liste: fuegeHinzu(liste, neueVersion(this.dok.karte, { name, art })) });
  }

  async #versionSpeichern() {
    const f = formular([{ name: 'name', titel: 'Name', wert: `Stand ${new Date().toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}` }]);
    const w = await dialog({ titel: 'Version speichern', icon: 'versionen', inhalt: f.element, knoepfe: [{ text: 'Abbrechen', wert: null }, { text: 'Speichern', art: 'primaer', wert: () => f.werte() }] });
    if (!w) return;
    await this.#versionAblegen(w.name);
    this.hinweis(`Version „${w.name}“ gespeichert`, 'erfolg');
  }

  async #dialogVersionen() {
    const id = this.dok.aktivId;
    let liste = await nativ.aufruf('projekt.versionen', { id });
    const el = document.createElement('div');
    const zeichne = () => {
      el.innerHTML = liste.length
        ? liste.map((v, i) => {
          const d = vergleiche(v.karte, this.dok.karte);
          return `<div class="insp-zeile" style="grid-template-columns:1fr auto;padding:6px 0;border-bottom:1px solid var(--linie)"><div style="display:block"><b>${esc(v.name)}</b> <span style="color:var(--text-3)">${new Date(v.zeit).toLocaleString('de-DE')} · ${v.art}</span><div style="color:var(--text-3);font-size:11.5px">${d.anzahl ? `seitdem: ${esc(d.zusammenfassung.join(' · '))}` : 'identisch mit jetzt'}</div></div><div><button class="knopf" data-v="vergleich" data-i="${i}">Vergleichen</button><button class="knopf" data-v="laden" data-i="${i}">Wiederherstellen</button><button class="knopf flach gefahr" data-v="weg" data-i="${i}">${icon('loeschen', 14)}</button></div></div>`;
        }).join('')
        : '<div class="insp-leer">Noch keine Versionen. „Version speichern“ (Strg+Umschalt+S) legt eine an; vor „Ins Spiel“ entsteht automatisch eine.</div>';
    };
    zeichne();
    await dialog({
      titel: `Versionen – ${this.dok.karte.name}`,
      icon: 'versionen',
      breit: true,
      inhalt: el,
      knoepfe: [{ text: 'Schließen', wert: true, art: 'primaer' }],
      beimOeffnen: (_d, schliesse) => {
        el.addEventListener('click', async (e) => {
          const b = e.target.closest('[data-v]');
          if (!b) return;
          const v = liste[Number(b.dataset.i)];
          if (b.dataset.v === 'vergleich') {
            const d = vergleiche(v.karte, this.dok.karte);
            this.ansicht.setzeMarkierungen(d.markierungen);
            this.vergleichAn = true;
            this.hinweis(`Vergleich mit „${v.name}“: grün = neu, rot = weg, gelb = geändert (Zone → Vergleich ausblenden)`);
            schliesse(true);
          } else if (b.dataset.v === 'laden') {
            await this.#versionAblegen('vor Wiederherstellen', 'wiederherstellung');
            this.dok.aendere(`Version „${v.name}“ wiederhergestellt`, wiederherstellenOps(this.dok.karte, v.karte));
            schliesse(true);
          } else if (b.dataset.v === 'weg') {
            liste = liste.filter((x) => x !== v);
            await nativ.aufruf('projekt.speichereVersionen', { id, liste });
            zeichne();
          }
        });
      },
    });
  }

  // ---------- Analysen ----------
  #laufweg() {
    try {
      const r = laufweg(this.dok.definition());
      this.ansicht.setzeMarkierungen(r.markierungen);
      this.vergleichAn = true;
      this.pruefung.zusatz = r.befunde.map((b) => ({ schwere: 'warnung', text: b.text, x: b.x, y: b.y }));
      this.pruefung.zeichne();
      this.zeigeRechts('pruef');
      this.hinweis(r.befunde.length ? `${Math.round(r.anteil * 100)} % erreichbar – ${r.befunde.length} Probleme rot markiert (Zone → Vergleich ausblenden)` : `Alles erreichbar (${r.erreicht} Kacheln vom Start und den Ankünften)`, r.befunde.length ? 'fehler' : 'erfolg');
    } catch (f) {
      this.hinweis(`Laufweg: ${f.message}`, 'fehler');
    }
  }

  async #balance() {
    const zeilen = [];
    for (const [id, k] of this.zonenKarten()) {
      try {
        const def = this.dok.zonen.has(id) ? this.dok.definition(id) : nachDefinition(k);
        zeilen.push({ id, name: k.name, ...balance(def) });
      } catch (f) {
        zeilen.push({ id, name: k.name, fehler: f.message });
      }
    }
    const ok = zeilen.filter((z) => !z.fehler);
    const max = (f) => Math.max(1, ...ok.map(f));
    const balken = (w, m, farbe) => `<div style="display:flex;align-items:center;gap:6px"><div style="height:8px;width:${Math.round((w / m) * 90)}px;background:${farbe};border-radius:3px"></div><span>${w}</span></div>`;
    const farbe = { essen: '#46c27a', trinken: '#4aa3ff', medizin: '#ef5d5d', waffen: '#ff8a3d', munition: '#f2c14e', material: '#b48a5a', sonstiges: '#8b919c' };
    const html = `<div style="overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:12px"><tr style="color:var(--text-3);text-align:left"><th>Zone</th><th>Gefahr<br /><small>Zombies/1000 Kachel</small></th><th>Versorgung<br /><small>Essen+Trinken/h/1000</small></th>${BEREICHE.map((b) => `<th>${b}<br /><small>pro Stunde</small></th>`).join('')}<th>Start-Loot</th></tr>${zeilen.map((z) => (z.fehler ? `<tr><td>${esc(z.name)}</td><td colspan="10" style="color:var(--rot)">${esc(z.fehler)}</td></tr>` : `<tr style="border-top:1px solid var(--linie)"><td style="padding:6px 4px"><b>${esc(z.name)}</b><br /><small style="color:var(--text-3)">${z.zombies} Zombies · ${z.lootPunkte} Loot-Punkte</small></td><td>${balken(z.gefahr, max((x) => x.gefahr), '#ef5d5d')}</td><td>${balken(z.versorgung, max((x) => x.versorgung), '#46c27a')}</td>${BEREICHE.map((b) => `<td>${balken(z.jeStunde[b], max((x) => x.jeStunde[b]), farbe[b])}</td>`).join('')}<td>${Object.values(z.start).reduce((s, w) => s + w, 0).toFixed(0)}</td></tr>`)).join('')}</table></div><div class="hinweis-kasten" style="margin-top:10px">Annahme: Jeder Loot-Punkt wird geplündert, sobald etwas liegt (Höchstwert). Gefahr = Zombie-Spawnpunkte je 1000 begehbare Kacheln. Gut zum Vergleichen der Zonen untereinander.</div>`;
    await dialog({ titel: 'Balance der Zonen', icon: 'ebenen', breit: true, inhalt: html, knoepfe: [{ text: 'Schließen', wert: true, art: 'primaer' }], klasse: 'sehr-breit' });
  }

  /** Loot-Vorschau: Beispiel-Items an allen Loot-Punkten (kern/lootVorschau.js, gleiche Würfel-Regeln wie das Spiel) */
  #lootVorschau(an, { still = false } = {}) {
    this.lootVorschauAn = an;
    const liste = an && this.dok.karte ? beispielItems(this.dok.definition(), this.lootSaat ?? 1) : null;
    this.ansicht.setzeLootVorschau(liste);
    this.#ansichtsLeiste();
    if (an && !still) this.hinweis(`Loot-Vorschau: ${liste.length} Beispiel-Items · gelber Ring = zufällig (Tabelle/Zone), grün = festes Item`);
  }

  #lootVorschauPlanen() {
    if (!this.lootVorschauAn) return;
    clearTimeout(this.lootZeit);
    this.lootZeit = setTimeout(() => this.#lootVorschau(true, { still: true }), 500);
  }

  #heatmap(an) {
    this.heatmapAn = an;
    const k = this.dok.karte;
    this.ansicht.setzeHeatmap(an && k ? heatmapGitter(k, lootDichte(k)) : null);
    this.#ansichtsLeiste();
    if (an) this.hinweis('Loot-Heatmap: grün = wenig, rot = viel Loot (Räume, Loot-Zonen, Spawnpunkte)');
  }

  #laufen() {
    const k = this.dok.karte;
    const start = [...k.s('marker')].find(([, m]) => m.art === 'start');
    const [sx, sy] = start ? start[0].split(',').map(Number) : [Math.floor(this.ansicht.ziel.x), Math.floor(this.ansicht.ziel.z)];
    const zielFrei = (x, y) => this.#frei(Math.floor(x), Math.floor(y));
    const x = zielFrei(this.ansicht.ziel.x, this.ansicht.ziel.z) ? this.ansicht.ziel.x : sx + 0.5;
    const y = zielFrei(this.ansicht.ziel.x, this.ansicht.ziel.z) ? this.ansicht.ziel.z : sy + 0.5;
    const r = 0.3; // Körperradius
    this.ansicht.starteLaufen(x, y, (px, py) => [[-r, -r], [r, -r], [-r, r], [r, r]].every(([dx, dy]) => this.#frei(Math.floor(px + dx), Math.floor(py + dy))), () => this.hinweis('Laufmodus beendet'));
    this.hinweis('Laufmodus: Maus schaut · W A S D laufen · Umschalt rennt · Esc beendet');
  }

  /** Begehbar wie im Spiel (Kacheln + blockierende Möbel/Ressourcen, Türen offen) */
  #frei(x, y) {
    const k = this.dok.karte;
    const z = k.kachelAn(x, y);
    if (z === null || (KACHELN[z]?.blockiert && z !== 'T')) return false;
    for (const [, o] of k.objekteIn(x, y, x, y)) {
      if (!(o.blockiert || RESSOURCEN_OBJEKTE[o.typ]?.blockiert) || o.ebene === 'oben') continue;
      if (x + 0.5 > o.x && x + 0.5 < o.x + o.b && y + 0.5 > o.y && y + 0.5 < o.y + o.h) return false;
    }
    return true;
  }

  // ---------- Weltkarte ----------
  async #weltkarte() {
    const zonen = this.zonenKarten();
    if (!zonen.size) return;
    const start = zonen.has('stadtrand') ? 'stadtrand' : zonen.keys().next().value;
    const layout = layoutAusUebergaengen(zonen, start);
    // Zonen ohne Verbindung unten in einer Reihe
    let maxY = Math.max(...Object.entries(layout).map(([id, p]) => p.y + zonen.get(id).hoehe));
    let x = Math.min(...Object.values(layout).map((p) => p.x));
    for (const [id, k] of zonen) if (!layout[id]) {
      layout[id] = { x, y: maxY + 30 };
      x += k.breite + 30;
    }
    const probleme = [];
    for (const [id, k] of zonen) for (const u of k.s('uebergaenge').values()) {
      const ziel = zonen.get(u.ziel);
      if (!ziel) probleme.push(`${id} → „${u.ziel}“: Zielzone gibt es nicht`);
      else {
        if (!ziel.s('ankuenfte').has(u.ankunft)) probleme.push(`${id} → ${u.ziel}: Ankunft „${u.ankunft}“ fehlt`);
        if (![...ziel.s('uebergaenge').values()].some((v) => v.ziel === id)) probleme.push(`${u.ziel} hat keinen Rückweg nach ${id}`);
      }
    }
    const xs = Object.entries(layout).flatMap(([id, p]) => [p.x, p.x + zonen.get(id).breite]);
    const ys = Object.entries(layout).flatMap(([id, p]) => [p.y, p.y + zonen.get(id).hoehe]);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const B = 860;
    const H = 460;
    const s = Math.min((B - 40) / (x1 - x0), (H - 40) / (y1 - y0));
    const px = (v) => 20 + (v - x0) * s;
    const py = (v) => 20 + (v - y0) * s;
    const el = document.createElement('div');
    el.innerHTML = `<canvas width="${B}" height="${H}" style="width:100%;border-radius:6px;background:#0d0f12;cursor:pointer"></canvas><div style="margin-top:8px;color:var(--text-2)">${probleme.length ? probleme.map((p) => `<div style="color:var(--gelb)">⚠ ${esc(p)}</div>`).join('') : '✓ Alle Übergänge haben Ziel, Ankunft und Rückweg.'}</div>`;
    const c = el.querySelector('canvas');
    const ctx = c.getContext('2d');
    const flaechen = [];
    for (const [id, k] of zonen) {
      const p = layout[id];
      const r = [px(p.x), py(p.y), k.breite * s, k.hoehe * s];
      flaechen.push([id, r]);
      ctx.fillStyle = id === this.dok.aktivId ? 'rgba(255,138,61,0.25)' : 'rgba(70,194,122,0.14)';
      ctx.strokeStyle = id === this.dok.aktivId ? '#ff8a3d' : '#46c27a';
      ctx.lineWidth = 2;
      ctx.fillRect(...r);
      ctx.strokeRect(...r);
      ctx.save();
      ctx.beginPath();
      ctx.rect(...r);
      ctx.clip(); // Namen nicht in die Nachbarzone schreiben
      ctx.fillStyle = '#d6d9df';
      ctx.font = '600 13px Segoe UI, system-ui';
      ctx.fillText(k.name.slice(0, 32), r[0] + 8, r[1] + 18);
      ctx.fillStyle = '#9aa1ad';
      ctx.font = '11px Segoe UI, system-ui';
      ctx.fillText(`${id} · ${k.breite} × ${k.hoehe}`, r[0] + 8, r[1] + 34);
      ctx.restore();
      for (const u of k.s('uebergaenge').values()) {
        const ok = zonen.has(u.ziel) && [...zonen.get(u.ziel).s('uebergaenge').values()].some((v) => v.ziel === id);
        ctx.fillStyle = ok ? '#4aa3ff' : '#ef5d5d';
        ctx.fillRect(px(p.x + u.x), py(p.y + u.y), Math.max(3, u.b * s), Math.max(3, u.h * s));
        const ziel = layout[u.ziel];
        if (ziel && zonen.has(u.ziel)) {
          ctx.strokeStyle = ok ? 'rgba(74,163,255,0.6)' : 'rgba(239,93,93,0.8)';
          ctx.setLineDash(ok ? [] : [5, 4]);
          ctx.beginPath();
          ctx.moveTo(px(p.x + u.x + u.b / 2), py(p.y + u.y + u.h / 2));
          ctx.lineTo(px(ziel.x + zonen.get(u.ziel).breite / 2), py(ziel.y + zonen.get(u.ziel).hoehe / 2));
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    }
    await dialog({
      titel: 'Weltkarte',
      icon: 'welt',
      breit: true,
      inhalt: el,
      knoepfe: [{ text: 'Schließen', wert: true, art: 'primaer' }],
      beimOeffnen: (_d, schliesse) =>
        c.addEventListener('click', (e) => {
          const r = c.getBoundingClientRect();
          const mx = ((e.clientX - r.left) / r.width) * B;
          const my = ((e.clientY - r.top) / r.height) * H;
          const t = flaechen.find(([, [fx, fy, fb, fh]]) => mx >= fx && my >= fy && mx <= fx + fb && my <= fy + fh);
          if (t) {
            schliesse(true);
            this.oeffneZone(t[0]);
          }
        }),
    });
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
    document.getElementById('knopf-veroeffentlichen').innerHTML = `${icon('insSpiel', 14)} Veröffentlichen`;
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

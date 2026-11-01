import { LOOT_TABELLEN } from '../../server/spiel/konfiguration/lootTabellen.js';
import { GEGENSTAENDE } from '../../server/spiel/konfiguration/gegenstaende.js';
import { linie, rechteckAus } from '../../editor/kern/raster.js';
import { pruefeObjekt, pruefeMarker } from '../../editor/kern/platzierung.js';
import * as A from '../kern/aktionen.js';
import * as B from '../kern/bauhilfen.js';
import { objektHoehe } from './viewport.js';

/**
 * Werkzeuge der Kartenbearbeitung – bekommen die Zeiger-Ereignisse der Ansicht (linke Maustaste) und ändern die Karte
 * NUR über Dokument.aendere/gruppe mit den Aktionen aus kern/aktionen.js. Optionen je Werkzeug → Optionsleiste
 * (`optionen(id)` liefert Felder, app.js zeichnet sie). Tastenkürzel stehen in WERKZEUGE (Q W E R B N H T O F K I P).
 */
export const WERKZEUGE = [
  { id: 'auswahl', titel: 'Auswählen', icon: 'auswahl', kuerzel: 'Q', text: 'Klicken wählt, Ziehen auf freier Fläche = Rahmen, Ziehen auf Gewähltem = verschieben. Umschalt = hinzufügen.' },
  { id: 'bewegen', titel: 'Bewegen', icon: 'bewegen', kuerzel: 'W', text: 'Pfeile des Gizmos ziehen. Strg = auf ganze Kacheln einrasten.' },
  { id: 'drehen', titel: 'Drehen', icon: 'drehen', kuerzel: 'E', text: 'Ring ziehen – rastet in 15°-Schritten.' },
  { id: 'skalieren', titel: 'Größe', icon: 'skalieren', kuerzel: 'R', text: 'Größer/kleiner – die Grundfläche (Kollision) wächst mit.' },
  { trenner: true },
  { id: 'boden', titel: 'Boden malen', icon: 'boden', kuerzel: 'B', text: 'Bodenkachel aus den Assets wählen und malen. [ ] = Pinselgröße.' },
  { id: 'wand', titel: 'Wand ziehen', icon: 'wand', kuerzel: 'N', text: 'Gerade Wand, Fenster oder Tür ziehen.' },
  { id: 'raum', titel: 'Raum bauen', icon: 'raum', kuerzel: 'H', text: 'Rechteck ziehen: Wände, Boden, Tür und Loot in einem Schritt.' },
  { id: 'gelaende', titel: 'Gelände', icon: 'gelaende', kuerzel: 'T', text: 'Heben, senken, glätten, ebnen.' },
  { id: 'strasse', titel: 'Straße', icon: 'strasse', kuerzel: 'L', text: 'Linie ziehen: Fahrbahn, Gehwege, Markierung und Laternen in einem Zug.' },
  { id: 'streuen', titel: 'Streuen', icon: 'streuen', kuerzel: 'S', text: 'Bäume, Büsche, Steine „aufsprühen“ – Umschalt = radieren.' },
  { trenner: true },
  { id: 'objekt', titel: 'Objekt platzieren', icon: 'objekt', kuerzel: 'O', text: 'Asset wählen, klicken zum Setzen. Strg+Rad = drehen, Umschalt = weiter setzen.' },
  { id: 'flaeche', titel: 'Bereich markieren', icon: 'flaeche', kuerzel: 'G', text: 'Rechteck ziehen: Loot-Zone, Hasen, Übergang oder Klangzone.' },
  { id: 'klang', titel: 'Klang setzen', icon: 'klang', kuerzel: 'K', text: 'Punktklang mit Hörweite setzen (oder an ein Objekt hängen).' },
  { id: 'spawn', titel: 'Item-Spawnpunkt', icon: 'spawn', kuerzel: 'I', text: 'Ein Item mit Chance & Intervall. Über Möbeln wird es automatisch draufgelegt.' },
  { id: 'marker', titel: 'Punkt setzen', icon: 'marker', kuerzel: 'P', text: 'Spieler-Start, Zombie, Horde oder Ankunftspunkt.' },
  { id: 'notiz', titel: 'Notiz', icon: 'notiz', kuerzel: 'Z', text: 'Klick setzt einen Notiz-Pin (z. B. „hier fehlt eine Tankstelle“) – auch für die KI lesbar.' },
];
export const MIT_GIZMO = { bewegen: 'translate', drehen: 'rotate', skalieren: 'scale' };

const LOOT_LISTE = Object.keys(LOOT_TABELLEN).filter((t) => t !== 'zombie' && t !== 'boss').sort();
export const ITEM_LISTE = Object.entries(GEGENSTAENDE).map(([id, g]) => ({ id, name: g.name, kategorie: g.kategorie })).sort((a, b) => a.name.localeCompare(b.name, 'de'));
const r2 = (v) => Math.round(v * 100) / 100;

export class Werkzeuge {
  /** @param studio  { dok, ansicht, asset (gewähltes Asset), zonenIds(), klangDateien, nativ, meldeOptionen() } */
  constructor(studio) {
    this.studio = studio;
    this.aktiv = 'auswahl';
    this.opt = {
      boden: { modus: 'pinsel', groesse: 2 },
      wand: { art: 'wand' },
      raum: { boden: '.', tuer: 's', name: '', lootTabelle: 'wohnung' },
      gelaende: { modus: 'heben', radius: 3, staerke: 0.25 },
      strasse: { fahrbahn: 4, gehweg: 1, markierung: true, laternen: 10 },
      streuen: { set: 'wald', radius: 5, dichte: 5, modus: 'streuen' },
      objekt: { drehung: 0, skalierung: 1, raster: 'halb', variieren: false },
      flaeche: { art: 'loot', tabelle: 'wohnung', ziel: '', ankunft: '', datei: '', anzahl: 4 },
      klang: { datei: '', innen: 2, aussen: 10, lautstaerke: 1 },
      spawn: { inhalt: 'konservendose', chance: 50, intervall: 10, mengeMin: 1, mengeMax: 1 },
      marker: { art: 'start', name: 'ankunft' },
    };
    this.zug = null;
  }

  get dok() {
    return this.studio.dok;
  }

  get ansicht() {
    return this.studio.ansicht;
  }

  waehle(id) {
    this.aktiv = id;
    this.zug = null;
    this.ansicht.setzeGeist(null);
    this.ansicht.setzeGizmo(MIT_GIZMO[id] ?? null);
    this.studio.meldeOptionen();
  }

  /** Felder für die Optionsleiste: [{ art: 'auswahl'|'zahl'|'text'|'schalter'|'hinweis', feld, titel, werte?, min?, max?, schritt? }] */
  optionen(id = this.aktiv) {
    const zonen = this.studio.zonenIds().map((z) => [z, z]);
    const klaenge = [['', '— Datei wählen —'], ...this.studio.klangDateien().map((d) => [d.pfad, d.pfad.replace(/^audio\/|^musik\//, '')])];
    switch (id) {
      case 'boden':
        return [
          { art: 'hinweis', text: this.studio.asset?.art === 'kachel' ? `Kachel: ${this.studio.asset.name}` : 'Bodenkachel unten in den Assets wählen' },
          { art: 'segment', feld: 'modus', werte: [['pinsel', 'Pinsel'], ['rechteck', 'Rechteck'], ['fuellen', 'Füllen']] },
          { art: 'zahl', feld: 'groesse', titel: 'Größe', min: 1, max: 15, schritt: 1 },
        ];
      case 'wand':
        return [{ art: 'segment', feld: 'art', werte: [['wand', 'Wand'], ['fenster', 'Fenster'], ['tuer', 'Tür']] }];
      case 'raum':
        return [
          { art: 'auswahl', feld: 'boden', titel: 'Boden', werte: [['.', 'Fliesen'], [':', 'Beton'], ['+', 'Holz']] },
          { art: 'auswahl', feld: 'tuer', titel: 'Tür', werte: [['s', 'Süden'], ['n', 'Norden'], ['w', 'Westen'], ['o', 'Osten'], ['', 'keine']] },
          { art: 'text', feld: 'name', titel: 'Name', platzhalter: 'z. B. Küche' },
          { art: 'auswahl', feld: 'lootTabelle', titel: 'Loot', werte: [['', 'kein Loot'], ...LOOT_LISTE.map((t) => [t, t])] },
        ];
      case 'gelaende':
        return [
          { art: 'segment', feld: 'modus', werte: [['heben', 'Heben'], ['senken', 'Senken'], ['glaetten', 'Glätten'], ['ebnen', 'Ebnen']] },
          { art: 'zahl', feld: 'radius', titel: 'Radius', min: 1, max: 20, schritt: 1 },
          { art: 'zahl', feld: 'staerke', titel: 'Stärke (m)', min: 0.05, max: 3, schritt: 0.05 },
        ];
      case 'strasse':
        return [
          { art: 'segment', feld: 'fahrbahn', werte: [['2', 'Weg (2)'], ['4', 'Straße (4)'], ['6', 'Breit (6)']] },
          { art: 'segment', feld: 'gehweg', werte: [['0', 'ohne Gehweg'], ['1', 'Gehweg'], ['2', 'breiter Gehweg']] },
          { art: 'schalter', feld: 'markierung', titel: 'Mittelmarkierung' },
          { art: 'zahl', feld: 'laternen', titel: 'Laterne alle', min: 0, max: 40, schritt: 1 },
        ];
      case 'streuen':
        return [
          { art: 'segment', feld: 'modus', werte: [['streuen', 'Streuen'], ['radieren', 'Radieren']] },
          { art: 'auswahl', feld: 'set', titel: 'Was', werte: [...Object.entries(B.STREU_SETS).map(([k, v]) => [k, v.name]), ['asset', this.studio.asset && ['objekt', 'modell'].includes(this.studio.asset.art) ? `Asset: ${this.studio.asset.name}` : 'gewähltes Asset']] },
          { art: 'zahl', feld: 'radius', titel: 'Radius', min: 1, max: 30, schritt: 1 },
          { art: 'zahl', feld: 'dichte', titel: 'Dichte', min: 1, max: 20, schritt: 1 },
        ];
      case 'objekt':
        return [
          { art: 'hinweis', text: this.studio.asset && ['objekt', 'modell', 'vorlage', 'bauwerk'].includes(this.studio.asset.art) ? this.studio.asset.name : 'Objekt unten in den Assets wählen' },
          { art: 'zahl', feld: 'drehung', titel: 'Drehung °', min: -360, max: 360, schritt: 15 },
          { art: 'zahl', feld: 'skalierung', titel: 'Größe ×', min: 0.25, max: 4, schritt: 0.05 },
          { art: 'segment', feld: 'raster', werte: [['frei', 'Frei'], ['halb', '½'], ['ganz', '1']] },
          { art: 'schalter', feld: 'variieren', titel: 'Variieren (Größe/Drehung zufällig)' },
        ];
      case 'flaeche': {
        const o = this.opt.flaeche;
        const felder = [{ art: 'segment', feld: 'art', werte: [['loot', 'Loot-Zone'], ['tiere', 'Hasen'], ['uebergang', 'Übergang'], ['klang', 'Klangzone']] }];
        if (o.art === 'loot') felder.push({ art: 'auswahl', feld: 'tabelle', titel: 'Tabelle', werte: LOOT_LISTE.map((t) => [t, t]) });
        if (o.art === 'tiere') felder.push({ art: 'zahl', feld: 'anzahl', titel: 'Anzahl', min: 1, max: 100, schritt: 1 });
        if (o.art === 'uebergang') felder.push({ art: 'auswahl', feld: 'ziel', titel: 'Zielzone', werte: [['', '— wählen —'], ...zonen] }, { art: 'text', feld: 'ankunft', titel: 'Ankunft', platzhalter: 'Name des Ankunftspunkts' });
        if (o.art === 'klang') felder.push({ art: 'auswahl', feld: 'datei', titel: 'Datei', werte: klaenge });
        return felder;
      }
      case 'klang':
        return [
          { art: 'auswahl', feld: 'datei', titel: 'Datei', werte: klaenge },
          { art: 'zahl', feld: 'innen', titel: 'Voll bis', min: 0, max: 50, schritt: 0.5 },
          { art: 'zahl', feld: 'aussen', titel: 'Hörweite', min: 1, max: 120, schritt: 1 },
          { art: 'zahl', feld: 'lautstaerke', titel: 'Lautstärke', min: 0, max: 2, schritt: 0.05 },
          { art: 'hinweis', text: 'Klick auf ein Objekt = Klang hängt am Objekt' },
        ];
      case 'spawn':
        return [
          { art: 'auswahl', feld: 'inhalt', titel: 'Item', werte: [...ITEM_LISTE.map((i) => [i.id, i.name]), ...LOOT_LISTE.map((t) => [`tabelle:${t}`, `Tabelle: ${t}`])] },
          { art: 'zahl', feld: 'chance', titel: 'Chance %', min: 0, max: 100, schritt: 5 },
          { art: 'zahl', feld: 'intervall', titel: 'alle (Min.)', min: 0.5, max: 1440, schritt: 1 },
          { art: 'zahl', feld: 'mengeMin', titel: 'Menge', min: 1, max: 99, schritt: 1 },
          { art: 'zahl', feld: 'mengeMax', titel: 'bis', min: 1, max: 99, schritt: 1 },
        ];
      case 'marker':
        return [
          { art: 'segment', feld: 'art', werte: [['start', 'Spieler-Start'], ['zombie', 'Zombie'], ['horde', 'Horde'], ['ankunft', 'Ankunft']] },
          ...(this.opt.marker.art === 'ankunft' ? [{ art: 'text', feld: 'name', titel: 'Name', platzhalter: 'z. B. von_stadtrand' }] : []),
        ];
      default:
        return [{ art: 'hinweis', text: WERKZEUGE.find((w) => w.id === id)?.text ?? '' }];
    }
  }

  setzeOption(feld, wert) {
    const o = this.opt[this.aktiv];
    if (!o) return;
    o[feld] = wert;
    if (this.aktiv === 'objekt' || this.aktiv === 'spawn') this.ansicht.setzeGeist(null);
    if ((this.aktiv === 'flaeche' && feld === 'art') || (this.aktiv === 'marker' && feld === 'art')) this.studio.meldeOptionen();
  }

  // ---------- Zeiger ----------
  #punkt(e) {
    return this.ansicht.treffe(e.clientX, e.clientY);
  }

  #raster(v) {
    const r = this.opt.objekt.raster;
    return r === 'ganz' ? Math.round(v) : r === 'halb' ? Math.round(v * 2) / 2 : r2(v);
  }

  schweben(e) {
    const p = this.#punkt(e);
    const k = this.dok.karte;
    if (!p || !k) return this.ansicht.setzeSchwebe(null);
    this.studio.zeigePosition(p);
    const g = this.opt.boden.groesse;
    if (this.aktiv === 'boden' && this.opt.boden.modus === 'pinsel') this.ansicht.setzeSchwebe(p.tx - Math.floor(g / 2), p.ty - Math.floor(g / 2), g, g);
    else if (this.aktiv === 'streuen') this.ansicht.setzeSchwebe(p.tx - this.opt.streuen.radius, p.ty - this.opt.streuen.radius, this.opt.streuen.radius * 2 + 1, this.opt.streuen.radius * 2 + 1);
    else if (this.aktiv === 'gelaende') this.ansicht.setzeSchwebe(p.tx - this.opt.gelaende.radius, p.ty - this.opt.gelaende.radius, this.opt.gelaende.radius * 2 + 1, this.opt.gelaende.radius * 2 + 1);
    else if (['boden', 'wand', 'raum', 'flaeche', 'marker', 'strasse'].includes(this.aktiv)) this.ansicht.setzeSchwebe(p.tx, p.ty);
    else this.ansicht.setzeSchwebe(null);
    if (this.aktiv === 'objekt') this.#geistObjekt(p);
    if (this.aktiv === 'spawn') this.#geistSpawn(p);
  }

  verlassen() {
    this.ansicht.setzeSchwebe(null);
    if (!this.zug) this.ansicht.setzeGeist(null);
  }

  /** Neues Objekt für Asset an Zeigerposition (Vorschau & Setzen) */
  #objektVorschlag(p) {
    const a = this.studio.asset;
    const k = this.dok.karte;
    if (!a || !k) return null;
    if (a.art === 'vorlage') {
      const v = a.vorlage;
      return { vorlage: v, x: Math.round(p.x - v.b / 2), y: Math.round(p.y - v.h / 2), b: v.b, h: v.h };
    }
    if (!['objekt', 'modell', 'bauwerk'].includes(a.art)) return null;
    const o = this.opt.objekt;
    const zufall = this.zufall ?? { s: 1, d: 0 };
    const drehung = (Number(o.drehung) || 0) + zufall.d;
    const skalierung = Math.min(4, Math.max(0.25, (Number(o.skalierung) || 1) * zufall.s));
    try {
      const { ops } = A.objektOps(k, a.id, 0, 0, { drehung, skalierung });
      const neu = ops.find((x) => x.s === 'objekte' || x.s === 'bauwerke')?.neu;
      if (!neu) return null;
      if (a.art === 'bauwerk') return { katalogId: a.id, x: Math.floor(p.x), y: Math.floor(p.y), b: 1, h: 1, drehung, skalierung, neu };
      const x = this.#raster(p.x - neu.b / 2);
      const y = this.#raster(p.y - neu.h / 2);
      return { katalogId: a.id, x, y, b: neu.b, h: neu.h, drehung, skalierung, neu: { ...neu, x, y } };
    } catch {
      return null;
    }
  }

  #geistObjekt(p) {
    const v = this.#objektVorschlag(p);
    if (!v) return this.ansicht.setzeGeist(null);
    if (v.vorlage) return this.ansicht.setzeGeist([{ x: v.x, y: v.y, b: v.b, h: v.h, hoehe: 0.3 }], true);
    const ok = pruefeObjekt(this.dok.karte, v.neu).ok;
    const hoehe = objektHoehe(v.neu, this.dok.karte);
    this.ansicht.setzeGeist([{ x: v.x + v.b / 2, y: v.y + v.h / 2, b: v.b, h: v.h, hoehe, mitte: true }], ok);
    this.studio.hinweis(ok ? `${v.neu.typ} · ${r2(v.b)} × ${r2(v.h)} Kacheln` : pruefeObjekt(this.dok.karte, v.neu).grund);
  }

  /** Spawnpunkt-Lage: über einem Möbel → obendrauf */
  #spawnLage(p) {
    const k = this.dok.karte;
    let hoehe = 0;
    if (p.treffer?.s === 'objekte') {
      const o = k.s('objekte').get(p.treffer.k);
      if (o && o.ebene !== 'boden') hoehe = r2(objektHoehe(o, k));
    }
    return { x: r2(p.x), y: r2(p.y), hoehe: Math.min(5, hoehe) };
  }

  #geistSpawn(p) {
    const l = this.#spawnLage(p);
    this.ansicht.setzeGeist([{ x: l.x, y: l.y, b: 0.4, h: 0.4, hoehe: 0.4, unten: l.hoehe, mitte: true }], true);
    this.studio.hinweis(l.hoehe ? `Liegt auf dem Möbel (Höhe ${l.hoehe} m)` : 'Auf dem Boden');
  }

  unten(e) {
    const p = this.#punkt(e);
    const k = this.dok.karte;
    if (!p || !k) return;
    const umschalt = e.shiftKey;
    switch (this.aktiv) {
      case 'auswahl':
      case 'bewegen':
      case 'drehen':
      case 'skalieren': {
        if (p.treffer) {
          const gewaehlt = this.dok.auswahl.some((a) => a.s === p.treffer.s && a.k === p.treffer.k);
          if (!gewaehlt || umschalt) this.dok.waehle([p.treffer], { hinzu: umschalt });
          if (this.aktiv === 'auswahl' && !umschalt) this.zug = { art: 'verschieben', start: p, letzter: p };
        } else {
          if (!umschalt) this.dok.waehle([]);
          this.zug = { art: 'rahmen', start: p, hinzu: umschalt };
        }
        return;
      }
      case 'boden': {
        const z = this.studio.asset?.art === 'kachel' ? this.studio.asset.zeichen : null;
        if (!z) return this.studio.hinweis('Erst eine Bodenkachel in den Assets wählen', 'fehler');
        if (this.opt.boden.modus === 'fuellen') return this.dok.aendere('Füllen', A.fuellOps(k, p.tx, p.ty, z));
        if (this.opt.boden.modus === 'rechteck') {
          this.zug = { art: 'rechteck', start: p, zeichen: z };
          return;
        }
        this.zug = { art: 'pinsel', letzter: p, zeichen: z };
        this.dok.aktiv.verlauf.beginne('Boden malen');
        this.#pinsel(p, p);
        return;
      }
      case 'wand':
      case 'raum':
      case 'flaeche':
        this.zug = { art: this.aktiv, start: p };
        return;
      case 'strasse':
        this.zug = { art: 'strasse', start: p };
        return;
      case 'streuen':
        this.dok.aktiv.verlauf.beginne(umschalt || this.opt.streuen.modus === 'radieren' ? 'Radieren' : 'Streuen');
        this.zug = { art: 'streuen', letzter: 0, radieren: umschalt || this.opt.streuen.modus === 'radieren' };
        this.#streuen(p);
        return;
      case 'gelaende':
        this.dok.aktiv.verlauf.beginne('Gelände');
        this.zug = { art: 'gelaende', letzter: null };
        this.#gelaende(p);
        return;
      case 'objekt':
        return this.#setzeObjekt(p, umschalt);
      case 'spawn': {
        const l = this.#spawnLage(p);
        const o = this.opt.spawn;
        const menge = o.inhalt.startsWith('tabelle:') ? undefined : [Number(o.mengeMin) || 1, Math.max(Number(o.mengeMin) || 1, Number(o.mengeMax) || 1)];
        try {
          const { ops, id } = A.spawnpunktOps(k, { ...l, inhalt: o.inhalt, chance: Number(o.chance), intervall: Number(o.intervall), menge });
          this.dok.aendere('Spawnpunkt', ops);
          if (!umschalt) this.dok.waehle([{ s: 'spawnpunkte', k: id }]);
        } catch (f) {
          this.studio.hinweis(f.message, 'fehler');
        }
        return;
      }
      case 'klang':
        return this.#setzeKlang(p);
      case 'notiz':
        return this.studio.neueNotiz(p.x, p.y);
      case 'marker': {
        const o = this.opt.marker;
        if (o.art !== 'ankunft') {
          const pr = pruefeMarker(k, o.art === 'horde' ? 'zombie' : o.art, p.tx, p.ty);
          if (!pr.ok) return this.studio.hinweis(pr.grund, 'fehler');
        }
        try {
          this.dok.aendere(o.art === 'ankunft' ? 'Ankunftspunkt' : 'Punkt', A.markerOps(k, o.art, p.tx, p.ty, { name: o.name }));
        } catch (f) {
          this.studio.hinweis(f.message, 'fehler');
        }
        return;
      }
      default:
    }
  }

  bewege(e) {
    const p = this.#punkt(e);
    if (!p || !this.zug) return this.schweben(e);
    this.studio.zeigePosition(p);
    const z = this.zug;
    const k = this.dok.karte;
    if (z.art === 'pinsel') {
      if (p.tx !== z.letzter.tx || p.ty !== z.letzter.ty) this.#pinsel(z.letzter, p);
      z.letzter = p;
      const g = this.opt.boden.groesse;
      this.ansicht.setzeSchwebe(p.tx - Math.floor(g / 2), p.ty - Math.floor(g / 2), g, g);
    } else if (z.art === 'gelaende') this.#gelaende(p);
    else if (z.art === 'streuen') {
      this.#streuen(p);
      const r = this.opt.streuen.radius;
      this.ansicht.setzeSchwebe(p.tx - r, p.ty - r, r * 2 + 1, r * 2 + 1);
    } else if (z.art === 'strasse') {
      const { ops } = B.strassenOps(k, z.start, p, this.#strassenOpt());
      const kacheln = ops.filter((o) => o.s === 'kachel').map((o) => ({ x: o.i % k.breite, y: Math.floor(o.i / k.breite), b: 1, h: 1, hoehe: 0.05 }));
      this.ansicht.setzeGeist(kacheln, true);
      this.studio.hinweis(`Straße ${kacheln.length} Kacheln`);
    }
    else if (z.art === 'verschieben') {
      const dx = p.x - z.start.x;
      const dy = p.y - z.start.y;
      z.dx = e.ctrlKey ? Math.round(dx) : r2(dx);
      z.dy = e.ctrlKey ? Math.round(dy) : r2(dy);
      const boxen = this.dok.auswahl.map((a) => this.ansicht.boxVon(a)).filter(Boolean);
      this.ansicht.setzeGeist(boxen.map((b) => ({ x: b.min.x + z.dx, y: b.min.z + z.dy, b: b.max.x - b.min.x, h: b.max.z - b.min.z, hoehe: Math.max(0.1, b.max.y - b.min.y) })), true);
    } else if (['rahmen', 'rechteck', 'raum', 'flaeche'].includes(z.art)) {
      const r = rechteckAus(z.start.tx, z.start.ty, p.tx, p.ty);
      const farbe = z.art === 'rahmen';
      this.ansicht.setzeGeist([{ x: r.x, y: r.y, b: r.b, h: r.h, hoehe: farbe ? 0.05 : z.art === 'raum' ? 2.6 : 0.15 }], true);
      this.studio.hinweis(`${r.b} × ${r.h} Kacheln`);
    } else if (z.art === 'wand') {
      const punkte = A.wandOps(k, z.start, p, this.opt.wand.art).map((o) => ({ x: o.i % k.breite, y: Math.floor(o.i / k.breite), b: 1, h: 1, hoehe: 2.6 }));
      this.ansicht.setzeGeist(punkte, true);
      this.studio.hinweis(`${punkte.length} Kacheln`);
    }
  }

  oben(e) {
    const z = this.zug;
    this.zug = null;
    if (!z) return;
    const p = this.#punkt(e) ?? z.letzter ?? z.start;
    const k = this.dok.karte;
    this.ansicht.setzeGeist(null);
    try {
      if (z.art === 'pinsel' || z.art === 'gelaende' || z.art === 'streuen') this.dok.aktiv.verlauf.beende();
      else if (z.art === 'strasse') this.dok.aendere('Straße', B.strassenOps(k, z.start, p, this.#strassenOpt()).ops);
      else if (z.art === 'verschieben' && (z.dx || z.dy)) this.dok.aendere('Verschieben', A.verschiebeOps(k, this.dok.auswahl, z.dx, z.dy));
      else if (z.art === 'rahmen') {
        const r = rechteckAus(z.start.tx, z.start.ty, p.tx, p.ty);
        this.dok.waehle(this.#imRechteck(r), { hinzu: z.hinzu });
      } else if (z.art === 'rechteck') this.dok.aendere('Boden (Rechteck)', A.rechteckOps(k, rechteckAus(z.start.tx, z.start.ty, p.tx, p.ty), z.zeichen));
      else if (z.art === 'wand') this.dok.aendere(this.opt.wand.art === 'tuer' ? 'Tür' : this.opt.wand.art === 'fenster' ? 'Fenster' : 'Wand', A.wandOps(k, z.start, p, this.opt.wand.art));
      else if (z.art === 'raum') {
        const o = this.opt.raum;
        const r = rechteckAus(z.start.tx, z.start.ty, p.tx, p.ty);
        const { ops } = A.raumOps(k, { ...r, boden: o.boden, tuer: o.tuer || null, name: o.name || (o.lootTabelle ? o.lootTabelle : null), lootTabelle: o.lootTabelle || null });
        this.dok.aendere(`Raum${o.name ? ` „${o.name}“` : ''}`, ops);
      } else if (z.art === 'flaeche') this.#flaeche(rechteckAus(z.start.tx, z.start.ty, p.tx, p.ty));
    } catch (f) {
      this.studio.hinweis(f.message, 'fehler');
    }
  }

  #imRechteck(r) {
    const k = this.dok.karte;
    const drin = (x, y) => x >= r.x && y >= r.y && x < r.x + r.b && y < r.y + r.h;
    const liste = [];
    for (const [id, o] of k.s('objekte')) if (drin(o.x + o.b / 2, o.y + o.h / 2)) liste.push({ s: 'objekte', k: id });
    for (const [id, o] of k.s('spawnpunkte')) if (drin(o.x, o.y)) liste.push({ s: 'spawnpunkte', k: id });
    for (const [id, o] of k.s('klaenge')) if (o.art === 'punkt' && drin(o.x, o.y)) liste.push({ s: 'klaenge', k: id });
    for (const [id, o] of k.s('bauwerke')) if (drin(o.tx + 0.5, o.ty + 0.5)) liste.push({ s: 'bauwerke', k: id });
    for (const id of k.s('marker').keys()) {
      const [x, y] = id.split(',').map(Number);
      if (drin(x + 0.5, y + 0.5)) liste.push({ s: 'marker', k: id });
    }
    return liste;
  }

  #pinsel(a, b) {
    const k = this.dok.karte;
    const ops = [];
    for (const p of linie(a.tx, a.ty, b.tx, b.ty)) ops.push(...A.pinselOps(k, p.x, p.y, this.opt.boden.groesse, this.zug.zeichen));
    this.dok.aendere('Boden malen', ops);
  }

  #strassenOpt() {
    const o = this.opt.strasse;
    return { fahrbahn: Number(o.fahrbahn), gehweg: Number(o.gehweg), markierung: !!o.markierung, laternen: Number(o.laternen) };
  }

  /** Typen fürs Streuen: Set oder gewähltes Asset */
  streuTypen() {
    const o = this.opt.streuen;
    if (o.set === 'asset') {
      const a = this.studio.asset;
      if (!a || !['objekt', 'modell'].includes(a.art)) throw new Error('Erst ein Objekt oder Modell in den Assets wählen');
      return [a.id];
    }
    return B.STREU_SETS[o.set]?.typen ?? B.STREU_SETS.wald.typen;
  }

  #streuen(p) {
    const jetzt = performance.now();
    if (jetzt - this.zug.letzter < 140) return;
    this.zug.letzter = jetzt;
    const o = this.opt.streuen;
    try {
      const typen = this.streuTypen();
      const ops = this.zug.radieren ? B.radierOps(this.dok.karte, p.x, p.y, Number(o.radius), { typen }) : B.streuOps(this.dok.karte, p.x, p.y, Number(o.radius), { typen, dichte: Number(o.dichte) / 3, saat: Math.floor(Math.random() * 1e9) }).ops;
      this.dok.aendere('Streuen', ops);
    } catch (f) {
      this.studio.hinweis(f.message, 'fehler');
    }
  }

  #gelaende(p) {
    const jetzt = performance.now();
    if (this.zug.letzter && jetzt - this.zug.letzter < 50) return;
    this.zug.letzter = jetzt;
    const o = this.opt.gelaende;
    this.dok.aendere('Gelände', A.gelaendeOps(this.dok.karte, o.modus, p.tx, p.ty, Number(o.radius), Number(o.staerke)));
  }

  #setzeObjekt(p, weiter) {
    const k = this.dok.karte;
    const v = this.#objektVorschlag(p);
    if (!v) return this.studio.hinweis('Erst ein Objekt, Modell oder eine Vorlage in den Assets wählen', 'fehler');
    if (v.vorlage) {
      const vid = this.studio.asset.vorlageId;
      const { ops, weggelassen } = vid ? A.verknuepfteVorlageOps(k, vid, v.vorlage, v.x, v.y) : A.vorlageOps(k, v.vorlage, v.x, v.y);
      this.dok.aendere(`Vorlage „${this.studio.asset.name}“`, ops);
      if (weggelassen) this.studio.hinweis(`${weggelassen} Teile lagen außerhalb der Zone`);
      return;
    }
    if (!pruefeObjekt(k, v.neu).ok && !this.studio.erlaubeUeberlappung) return this.studio.hinweis(pruefeObjekt(k, v.neu).grund, 'fehler');
    const { ops, id, sammlung } = A.objektOps(k, v.katalogId, v.x, v.y, { drehung: v.drehung, skalierung: v.skalierung });
    this.dok.aendere(`${this.studio.asset.name} gesetzt`, ops);
    if (!weiter) this.dok.waehle([{ s: sammlung, k: id }]);
    this.zufall = this.opt.objekt.variieren ? { s: 0.8 + Math.random() * 0.45, d: Math.round(Math.random() * 360) } : null;
    this.#geistObjekt(p);
  }

  async #setzeKlang(p) {
    const o = this.opt.klang;
    const k = this.dok.karte;
    if (!o.datei) return this.studio.hinweis('Erst eine Klangdatei wählen', 'fehler');
    try {
      const datei = await this.studio.klangFuerZone(o.datei);
      if (p.treffer?.s === 'objekte') {
        this.dok.aendere('Klang am Objekt', A.aenderOps(k, 'objekte', p.treffer.k, { klang: { datei, innen: Number(o.innen), aussen: Number(o.aussen), lautstaerke: Number(o.lautstaerke), name: datei.split('/').pop() } }));
        this.studio.hinweis('Klang hängt jetzt am Objekt (wandert mit, wird mitkopiert)', 'erfolg');
        return;
      }
      const { ops, id } = A.punktKlangOps(k, r2(p.x), r2(p.y), { datei, innen: Number(o.innen), aussen: Number(o.aussen), lautstaerke: Number(o.lautstaerke), name: datei.split('/').pop() });
      this.dok.aendere('Klang', ops);
      this.dok.waehle([{ s: 'klaenge', k: id }]);
    } catch (f) {
      this.studio.hinweis(f.message, 'fehler');
    }
  }

  async #flaeche(r) {
    const o = this.opt.flaeche;
    const k = this.dok.karte;
    try {
      let datei = null;
      if (o.art === 'klang') {
        if (!o.datei) throw new Error('Erst eine Klangdatei wählen');
        datei = await this.studio.klangFuerZone(o.datei);
      }
      if (o.art === 'uebergang' && !o.ziel) throw new Error('Erst die Zielzone wählen');
      const { ops, id, sammlung } = A.flaecheOps(k, o.art, r, { tabelle: o.tabelle, anzahl: Number(o.anzahl), ziel: o.ziel, ankunft: o.ankunft || k.id, datei, name: datei?.split('/').pop() });
      this.dok.aendere({ loot: 'Loot-Zone', tiere: 'Hasen-Bereich', uebergang: 'Übergang', klang: 'Klangzone' }[o.art], ops);
      this.dok.waehle([{ s: sammlung, k: id }]);
    } catch (f) {
      this.studio.hinweis(f.message, 'fehler');
    }
  }

  /** Strg+Rad im Objekt-Werkzeug: Geist drehen. @returns true = verbraucht */
  rad(e) {
    if (this.aktiv !== 'objekt' || !e.ctrlKey) return false;
    this.opt.objekt.drehung = ((((Number(this.opt.objekt.drehung) || 0) + (e.deltaY > 0 ? 15 : -15)) % 360) + 360) % 360;
    this.studio.meldeOptionen();
    this.schweben(e);
    return true;
  }

  /** [ ] Pinselgröße */
  groesse(d) {
    if (this.aktiv === 'boden') this.opt.boden.groesse = Math.max(1, Math.min(15, this.opt.boden.groesse + d));
    else if (this.aktiv === 'gelaende') this.opt.gelaende.radius = Math.max(1, Math.min(20, this.opt.gelaende.radius + d));
    else if (this.aktiv === 'streuen') this.opt.streuen.radius = Math.max(1, Math.min(30, this.opt.streuen.radius + d));
    else return;
    this.studio.meldeOptionen();
  }
}

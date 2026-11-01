import { katalog, objektInfo } from '../../editor/kern/katalog.js';
import { spielordnerListe } from '../../editor/kern/spielordner.js';
import { eingebautePrefabs } from '../../editor/kern/prefabs.js';
import { validiere } from '../../editor/kern/validierung.js';
import { GEGENSTAENDE } from '../../server/spiel/konfiguration/gegenstaende.js';
import { KACHELN } from '../../gemeinsam/welt/kacheln.js';
import { ausSchluessel } from '../../editor/kern/karte.js';
import { ITEM_LISTE } from '../ansicht/werkzeuge.js';
import { icon } from './icons.js';
import { esc } from './dialoge.js';

/**
 * Panels des Studios: Zonenliste (links oben), Szene-Baum (links), Assets (unten), Prüfung (rechts, Reiter).
 * Alle lesen nur aus Dokument/Katalog und rufen Studio-Methoden (studio.oeffneZone, studio.waehleAsset …).
 */
const FOTO = new Set(['rasen', 'wiese', 'erde', 'kies', 'pflaster', 'waldboden', 'sand']);
const KAT_ICON = { Umwelt: 'baum', Ressourcen: 'baum', Möbel: 'moebel', Fahrzeuge: 'auto', Gebäude: 'vorlage', Wege: 'flaeche', Deko: 'objekt', Gegenstände: 'item', 'Essen & Trinken': 'item', Böden: 'boden', Mauern: 'wand' };

// ---------------- Zonen ----------------
export class ZonenPanel {
  constructor(studio) {
    this.studio = studio;
    this.el = document.getElementById('zonen-liste');
    this.liste = [];
    document.getElementById('zonen-aktionen').innerHTML = `<button class="knopf flach" data-befehl="zone.neu" data-tipp="Neue Zone" data-kuerzel="Strg+N">${icon('plus', 16)}</button><button class="knopf flach" data-befehl="zone.aktualisieren" data-tipp="Liste neu laden">${icon('wiederholen', 16)}</button>`;
    this.el.addEventListener('click', (e) => {
      const z = e.target.closest('[data-zone]');
      if (z) this.studio.oeffneZone(z.dataset.zone);
    });
    this.el.addEventListener('contextmenu', (e) => {
      const z = e.target.closest('[data-zone]');
      if (!z) return;
      e.preventDefault();
      this.studio.oeffneZone(z.dataset.zone).then(() => this.studio.menues.kontext(e.clientX, e.clientY, ['zone.speichern', 'zone.insSpiel', 'zone.testen', '-', 'zone.eigenschaften', 'zone.schliessen']));
    });
  }

  async laden() {
    this.liste = await this.studio.nativ.aufruf('projekt.zonen');
    this.zeichne();
  }

  zeichne() {
    const { dok } = this.studio;
    const offen = [...dok.zonen.keys()].filter((id) => !this.liste.some((z) => z.id === id));
    const zeile = (z, eintrag) => {
      const geaendert = eintrag && eintrag.karte.version !== eintrag.gespeichertVersion;
      const marke = eintrag?.quelle === 'vorlage' ? '<span class="marke-klein">Vorlage</span>' : z.registriert ? '<span class="marke-klein spiel">Im Spiel</span>' : z.datei ? '<span class="marke-klein" title="Kartendatei, aber nicht in KARTEN eingetragen">Datei</span>' : '<span class="marke-klein entwurf">Entwurf</span>';
      const entwurf = z.entwurf && (z.registriert || z.datei) ? '<span class="marke-klein entwurf" title="Es gibt einen ungespielten Arbeitsstand">Entwurf</span>' : '';
      return `<div class="liste-eintrag ${dok.aktivId === z.id ? 'aktiv' : ''}" data-zone="${esc(z.id)}" data-tipp="${esc(z.name)}" data-text="${esc(`${z.id} · ${z.breite} × ${z.hoehe} Kacheln`)}">${icon(eintrag?.quelle === 'vorlage' ? 'vorlage' : 'zone', 16)}<span>${esc(z.name)}</span>${geaendert ? '<span class="punkt" title="Ungespeicherte Änderungen"></span>' : ''}<span class="neben" style="display:flex;gap:4px">${entwurf}${marke}</span></div>`;
    };
    this.el.innerHTML = [
      ...this.liste.map((z) => zeile(z, dok.zonen.get(z.id))),
      ...offen.map((id) => {
        const e = dok.zonen.get(id);
        return zeile({ id, name: e.karte.name, breite: e.karte.breite, hoehe: e.karte.hoehe, registriert: false }, e);
      }),
    ].join('');
  }
}

// ---------------- Szene ----------------
const SZENE_GRUPPEN = [
  ['objekte', 'Objekte', 'objekt'],
  ['spawnpunkte', 'Item-Spawnpunkte', 'spawn'],
  ['marker', 'Punkte (Start, Zombies, Loot)', 'marker'],
  ['lootZonen', 'Loot-Zonen', 'flaeche'],
  ['raumFlaechen', 'Räume', 'raum'],
  ['uebergaenge', 'Übergänge', 'tuer'],
  ['ankuenfte', 'Ankunftspunkte', 'marker'],
  ['klaenge', 'Klänge', 'klang'],
  ['tierBereiche', 'Tiere', 'hase'],
  ['bauwerke', 'Bauwerke', 'wand'],
  ['notizen', 'Notizen', 'notiz'],
];

export function eintragName(karte, s, k, w) {
  if (s === 'objekte') return w.name || objektInfo(w.typ, karte)?.name || karte.s('typen').get(w.typ)?.name || w.typ;
  if (s === 'spawnpunkte') return `${w.inhalt.startsWith('tabelle:') ? `Tabelle ${w.inhalt.slice(8)}` : (GEGENSTAENDE[w.inhalt]?.name ?? w.inhalt)} · ${w.chance} % / ${w.intervall} min`;
  if (s === 'marker') {
    const [x, y] = ausSchluessel(k);
    const art = w.art === 'start' ? 'Spieler-Start' : w.art === 'loot' ? `Loot (${karte.s('raeume').get(w.raum)?.name ?? w.raum})` : w.horde ? 'Horde' : 'Zombie';
    return `${art} · ${x}|${y}`;
  }
  if (s === 'lootZonen') return w.name || 'Loot-Zone';
  if (s === 'raumFlaechen') return karte.s('raeume').get(w.raum)?.name ?? `Raum ${w.raum}`;
  if (s === 'uebergaenge') return `→ ${w.ziel} (${w.ankunft})`;
  if (s === 'ankuenfte') return `${k} · ${w.x}|${w.y}`;
  if (s === 'klaenge') return `${w.name ?? 'Klang'} (${w.art})`;
  if (s === 'tierBereiche') return `${w.anzahl} Hasen`;
  if (s === 'bauwerke') return w.typ;
  if (s === 'notizen') return `${w.erledigt ? '✓ ' : ''}${w.text}`;
  return String(k);
}

export class SzenePanel {
  constructor(studio) {
    this.studio = studio;
    this.el = document.getElementById('szene-baum');
    this.filter = '';
    this.zu = new Set(['objekte']);
    document.getElementById('szene-suche').addEventListener('input', (e) => {
      this.filter = e.target.value.trim().toLowerCase();
      this.zeichne();
    });
    this.el.addEventListener('click', (e) => {
      const g = e.target.closest('[data-gruppe]');
      if (g) {
        const s = g.dataset.gruppe;
        if (this.zu.has(s)) this.zu.delete(s);
        else this.zu.add(s);
        return this.zeichne();
      }
      const z = e.target.closest('[data-s]');
      if (!z) return;
      const k = z.dataset.zahl === '1' ? Number(z.dataset.k) : z.dataset.k;
      studio.dok.waehle([{ s: z.dataset.s, k }], { hinzu: e.shiftKey || e.ctrlKey });
    });
    this.el.addEventListener('dblclick', (e) => {
      if (e.target.closest('[data-s]')) studio.ansicht.zeigeAuswahl();
    });
  }

  spaeter() {
    clearTimeout(this.zeit);
    this.zeit = setTimeout(() => this.zeichne(), 180);
  }

  zeichne() {
    const k = this.studio.dok.karte;
    if (!k) {
      this.el.innerHTML = '<div class="insp-leer">Keine Zone geöffnet.</div>';
      return;
    }
    const gewaehlt = new Set(this.studio.dok.auswahl.map((a) => `${a.s}|${a.k}`));
    const teile = [];
    for (const [s, titel, ic] of SZENE_GRUPPEN) {
      const eintraege = [...k.s(s)].map(([id, w]) => [id, w, eintragName(k, s, id, w)]).filter(([, , n]) => !this.filter || n.toLowerCase().includes(this.filter));
      if (!eintraege.length) continue;
      const zu = this.zu.has(s) && !this.filter;
      const kinder = zu ? '' : eintraege.slice(0, 250).map(([id, , n]) => `<div class="liste-eintrag ${gewaehlt.has(`${s}|${id}`) ? 'aktiv' : ''}" data-s="${s}" data-k="${esc(id)}" data-zahl="${typeof id === 'number' ? 1 : 0}">${icon(ic, 14)}<span>${esc(n)}</span></div>`).join('') + (eintraege.length > 250 ? `<div class="liste-mehr">… und ${eintraege.length - 250} weitere (filtern)</div>` : '');
      teile.push(`<div class="baum-gruppe ${zu ? 'zu' : ''}"><div class="liste-eintrag" data-gruppe="${s}"><span class="baum-pfeil">${icon('pfeilRunter', 14)}</span><span>${titel}</span><span class="neben">${eintraege.length}</span></div><div class="baum-kinder">${kinder}</div></div>`);
    }
    this.el.innerHTML = teile.join('') || '<div class="insp-leer">Die Zone ist noch leer.</div>';
  }
}

// ---------------- Assets ----------------
const REITER = [
  ['boeden', 'Böden', (e) => (e.art === 'kachel' && e.kategorie !== 'Mauern') || (e.art === 'objekt' && e.kategorie === 'Böden')],
  ['mauern', 'Wände', (e) => (e.art === 'kachel' && e.kategorie === 'Mauern') || (e.art === 'bauwerk' && e.kategorie === 'Mauern')],
  ['natur', 'Natur', (e) => e.art === 'objekt' && ['Umwelt', 'Ressourcen'].includes(e.kategorie)],
  ['moebel', 'Möbel', (e) => ['objekt', 'bauwerk'].includes(e.art) && e.kategorie === 'Möbel'],
  ['gebaeude', 'Gebäude', (e) => ['objekt', 'bauwerk'].includes(e.art) && e.kategorie === 'Gebäude'],
  ['fahrzeuge', 'Fahrzeuge', (e) => e.art === 'objekt' && e.kategorie === 'Fahrzeuge'],
  ['deko', 'Wege & Deko', (e) => e.art === 'objekt' && ['Wege', 'Deko', 'Gegenstände', 'Essen & Trinken'].includes(e.kategorie)],
  ['modelle', 'Modelle', null],
  ['vorlagen', 'Vorlagen', null],
  ['items', 'Items', null],
];

export class AssetPanel {
  constructor(studio) {
    this.studio = studio;
    this.reiter = 'boeden';
    this.suche = '';
    this.el = document.getElementById('asset-raster');
    this.kopf = document.getElementById('asset-reiter');
    this.kopf.innerHTML = REITER.map(([id, t]) => `<button data-reiter="${id}">${t}</button>`).join('');
    this.kopf.addEventListener('click', (e) => {
      const b = e.target.closest('[data-reiter]');
      if (!b) return;
      this.reiter = b.dataset.reiter;
      this.zeichne();
    });
    document.getElementById('asset-suche').addEventListener('input', (e) => {
      this.suche = e.target.value.trim().toLowerCase();
      this.zeichne();
    });
    this.el.addEventListener('click', (e) => {
      const z = e.target.closest('[data-i]');
      if (z) studio.waehleAsset(this.aktuell[Number(z.dataset.i)]);
    });
    this.el.addEventListener('contextmenu', (e) => {
      const z = e.target.closest('[data-i]');
      const a = z && this.aktuell[Number(z.dataset.i)];
      if (a?.art !== 'vorlage' || a.eingebaut) return;
      e.preventDefault();
      studio.waehleAsset(a);
      studio.menues.kontext(e.clientX, e.clientY, ['vorlage.bearbeiten', 'vorlage.loeschen']);
    });
  }

  #liste() {
    const s = this.suche;
    const passt = (n) => !s || n.toLowerCase().includes(s);
    if (this.reiter === 'modelle') return spielordnerListe().filter((m) => passt(`${m.name} ${m.stem} ${m.kategorie}`)).map((m) => ({ art: 'modell', id: `modell:${m.stem}`, name: m.name, bild: m.vorschau, kategorie: m.kategorie }));
    if (this.reiter === 'vorlagen') {
      const eigene = this.studio.vorlagen().map((v) => ({ art: 'vorlage', id: `vorlage:${v.id}`, vorlageId: v.id, name: v.name, vorlage: v.vorlage }));
      const eingebaut = eingebautePrefabs().map((p, i) => ({ art: 'vorlage', id: `prefab:${i}`, name: p.name, vorlage: p.vorlage, eingebaut: true }));
      return [...eigene, ...eingebaut].filter((v) => passt(v.name));
    }
    if (this.reiter === 'items') return ITEM_LISTE.filter((i) => passt(`${i.name} ${i.id} ${i.kategorie}`)).map((i) => ({ art: 'item', id: i.id, name: i.name, kategorie: i.kategorie }));
    const filter = REITER.find((r) => r[0] === this.reiter)[2];
    const gesehen = new Set();
    const liste = [];
    for (const e of katalog()) {
      if (!filter(e) || !passt(`${e.name} ${e.typ ?? ''} ${e.kategorie}`)) continue;
      const basis = e.id.split('@')[0];
      if (gesehen.has(basis)) continue;
      gesehen.add(basis);
      liste.push({ ...e, id: basis });
    }
    return liste;
  }

  #bild(a) {
    if (a.art === 'kachel') {
      const name = KACHELN[a.zeichen]?.name;
      if (FOTO.has(name)) return `<div class="asset-bild"><img src="../client/assets/boden/${name}.jpg" alt="" loading="lazy" /></div>`;
      return `<div class="asset-bild" style="background:${a.farbe}">${a.kategorie === 'Mauern' ? icon(a.zeichen === 'T' ? 'tuer' : 'wand', 26) : ''}</div>`;
    }
    if (a.art === 'modell' && a.bild) return `<div class="asset-bild" style="background:#1b1e24"><img src="${esc(a.bild)}" alt="" loading="lazy" onerror="this.style.display='none'" /></div>`;
    if (a.art === 'vorlage') return `<div class="asset-bild"><img src="${vorlagenBild(a.vorlage)}" alt="" style="image-rendering:pixelated" /></div>`;
    if (a.art === 'item') return `<div class="asset-bild" style="background:linear-gradient(135deg,#2b3038,#1b1e24)">${icon('item', 26)}</div>`;
    return `<div class="asset-bild" style="background:linear-gradient(160deg, ${a.farbe ?? '#666'} 0%, #15171b 140%)">${icon(KAT_ICON[a.kategorie] ?? 'objekt', 26)}</div>`;
  }

  zeichne() {
    for (const b of this.kopf.children) b.classList.toggle('aktiv', b.dataset.reiter === this.reiter);
    this.aktuell = this.#liste().slice(0, 400);
    const gewaehlt = this.studio.asset?.id;
    this.el.innerHTML = this.aktuell.map((a, i) => `<div class="asset ${a.id === gewaehlt ? 'aktiv' : ''}" data-i="${i}" data-tipp="${esc(a.name)}" data-text="${esc(a.art === 'item' ? 'Klick: als Item-Spawnpunkt setzen' : a.b ? `${a.b} × ${a.h} Kacheln${a.blockiert ? ' · blockiert' : ''}` : a.kategorie ?? '')}">${this.#bild(a)}<div class="asset-name">${esc(a.name)}</div></div>`).join('') || '<div class="asset-leer">Nichts gefunden.</div>';
  }
}

const KACHEL_FARBEN = Object.fromEntries(katalog().filter((e) => e.art === 'kachel').map((e) => [e.zeichen, e.farbe]));
const vorschauCache = new WeakMap();
/** Mini-Draufsicht einer Vorlage als Data-URL */
export function vorlagenBild(v) {
  if (vorschauCache.has(v)) return vorschauCache.get(v);
  const px = Math.max(2, Math.floor(64 / Math.max(v.b, v.h)));
  const c = document.createElement('canvas');
  c.width = v.b * px;
  c.height = v.h * px;
  const ctx = c.getContext('2d');
  for (let y = 0; y < v.h; y++)
    for (let x = 0; x < v.b; x++) {
      const z = v.zellen[y * v.b + x];
      if (z === null || z === undefined) continue;
      ctx.fillStyle = KACHEL_FARBEN[z] ?? '#555';
      ctx.fillRect(x * px, y * px, px, px);
    }
  ctx.fillStyle = 'rgba(255,190,120,0.9)';
  for (const o of v.objekte ?? []) if (o.ebene !== 'boden') ctx.fillRect(o.x * px, o.y * px, Math.max(1, o.b * px), Math.max(1, o.h * px));
  const url = c.toDataURL();
  vorschauCache.set(v, url);
  return url;
}

// ---------------- Prüfung ----------------
export class PruefPanel {
  constructor(studio) {
    this.studio = studio;
    this.el = document.getElementById('pruef-panel');
    this.liste = [];
    this.el.addEventListener('click', (e) => {
      const z = e.target.closest('[data-i]');
      const p = z && this.liste[Number(z.dataset.i)];
      if (p?.x !== null && p?.x !== undefined) studio.ansicht.zeige(p.x + 0.5, p.y + 0.5, 22);
    });
  }

  spaeter() {
    clearTimeout(this.zeit);
    this.zeit = setTimeout(() => this.pruefe(), 700);
  }

  pruefe() {
    const { dok } = this.studio;
    const k = dok.karte;
    if (!k || dok.aktiv?.quelle === 'vorlage') {
      this.liste = [];
    } else {
      try {
        this.liste = validiere(k, { zonen: this.studio.zonenKarten() });
      } catch (f) {
        this.liste = [{ schwere: 'fehler', text: `Prüfung fehlgeschlagen: ${f.message}`, x: null, y: null }];
      }
    }
    this.zeichne();
    this.studio.zeigePruefung(this.liste);
  }

  zeichne() {
    if (!this.liste.length) {
      this.el.innerHTML = `<div class="insp-leer">${icon('pruefen', 28)}<br />Keine Probleme gefunden.</div>`;
      return;
    }
    this.el.innerHTML = this.liste.map((p, i) => `<div class="pruef-eintrag ${p.schwere === 'fehler' ? 'fehler' : 'warnung'}" data-i="${i}">${icon(p.schwere === 'fehler' ? 'fehler' : 'warnung', 16)}<div><div>${esc(p.text)}</div>${p.x !== null && p.x !== undefined ? `<div class="pruef-ort">Kachel ${p.x}|${p.y} · klicken zum Hinspringen</div>` : ''}</div></div>`).join('');
  }
}

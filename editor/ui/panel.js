import { STANDARD_KONFIGURATION } from '../../server/spiel/konfiguration/spielKonfiguration.js';
import { LOOT_TABELLEN } from '../../server/spiel/konfiguration/lootTabellen.js';
import { BAUWERKE } from '../../gemeinsam/welt/bauwerke.js';
import { ausSchluessel, markerSchluessel } from '../kern/karte.js';
import { objektInfo, kachelInfo, OBJEKT_TYPEN } from '../kern/katalog.js';
import { ZONEN_EINSTELLUNGEN } from '../../server/spiel/karten/zonenEinstellungen.js';
import { esc, feldHtml } from './dialoge.js';

/**
 * Rechtes Panel mit Reitern. Jeder Reiter = Funktion, die HTML baut und Ereignisse bindet.
 * Eingaben erzeugen Operationen über zustand.ausfuehren (→ Verlauf). Weitere Reiter hängen main.js/andere Module an (reiter.set).
 */
export class Panel {
  constructor({ zustand, aktionen }) {
    this.zustand = zustand;
    this.aktionen = aktionen;
    this.elReiter = document.getElementById('panel-reiter');
    this.el = document.getElementById('panel-inhalt');
    this.reiter = new Map([
      ['Eigenschaften', () => this.#eigenschaften()],
      ['Zone', () => this.#zone()],
      ['Prüfung', () => this.#pruefung()],
    ]);
    this.aktiv = 'Eigenschaften';
    zustand.bei('auswahl', () => this.aktiv === 'Eigenschaften' && this.zeichne());
    zustand.bei('zone', () => this.zeichne());
    zustand.bei('karte', () => this.#spaeter());
    zustand.bei('pruefung', () => this.aktiv === 'Prüfung' && this.zeichne());
  }

  #timer = null;
  #spaeter() {
    // Während man im Panel tippt, nicht neu bauen (Fokus bliebe sonst nicht erhalten)
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => {
      if (!this.el.contains(document.activeElement)) this.zeichne();
    }, 120);
  }

  zeige(name) {
    this.aktiv = name;
    this.zeichne();
  }

  zeichne() {
    this.elReiter.innerHTML = '';
    for (const name of this.reiter.keys()) {
      const b = document.createElement('button');
      b.textContent = name === 'Prüfung' ? `Prüfung${this.#zaehler()}` : name;
      b.classList.toggle('aktiv', name === this.aktiv);
      b.addEventListener('click', () => this.zeige(name));
      this.elReiter.append(b);
    }
    if (!this.zustand.karte && this.aktiv !== 'Zonen' && this.aktiv !== 'Prefabs') {
      this.el.innerHTML = '<p class="leise">Keine Zone geöffnet.</p>';
      return;
    }
    this.reiter.get(this.aktiv)?.();
  }

  #zaehler() {
    const v = this.zustand.validierung;
    const f = v.filter((e) => e.schwere === 'fehler').length;
    const w = v.length - f;
    return f || w ? ` (${f ? `⛔${f}` : ''}${w ? ` ⚠${w}` : ''})` : ' ✓';
  }

  /** Felder einbauen und Änderungen melden: f(name, wert) */
  #felder(container, felder, beiAenderung) {
    const div = document.createElement('div');
    div.innerHTML = felder.map((f) => feldHtml(f).replace('class="feld"', `class="feld${f.gesetzt ? ' gesetzt' : ''}"`)).join('');
    for (const f of felder) {
      const el = div.querySelector(`[name="${f.name}"]`);
      el?.addEventListener('change', () => {
        let wert = f.typ === 'haken' ? el.checked : f.typ === 'zahl' ? (el.value === '' ? null : Number(el.value)) : el.value;
        if (f.typ === 'zahl' && wert !== null && !Number.isFinite(wert)) return;
        beiAenderung(f.name, wert);
      });
    }
    container.append(div);
    return div;
  }

  #knoepfe(container, liste) {
    const div = document.createElement('div');
    div.className = 'knopfreihe';
    for (const [text, f, art] of liste) {
      const b = document.createElement('button');
      b.textContent = text;
      if (art) b.className = art;
      b.addEventListener('click', f);
      div.append(b);
    }
    container.append(div);
  }

  // --- Eigenschaften ------------------------------------------------------------
  #eigenschaften() {
    const z = this.zustand;
    const k = z.karte;
    const gew = z.gewaehlte();
    this.el.innerHTML = '';
    if (gew.length === 0) {
      const h = this.hover;
      const kachel = h && k.imFeld(h.x, h.y) ? kachelInfo(k.kachelAn(h.x, h.y)) : null;
      this.el.innerHTML = `<p class="leise">Nichts ausgewählt. Mit ⬚ (V) anklicken, Umschalt = mehrere, ins Leere ziehen = Bereich (wie in Excel).</p>${
        kachel ? `<p>Kachel <b>${h.x}|${h.y}</b>: ${esc(kachel.name)} „${esc(kachel.zeichen)}“${kachel.blockiert ? ' (blockiert)' : ''}${kachel.innen ? ' (innen)' : ''}${k.hoeheAn(h.x, h.y) ? ` · Höhe ${k.hoeheAn(h.x, h.y)}` : ''}</p>` : ''
      }`;
      if (z.auswahlRechteck) {
        const r = z.auswahlRechteck;
        this.el.insertAdjacentHTML('beforeend', `<h3>Bereich x ${r.x}–${r.x + r.b - 1}, y ${r.y}–${r.y + r.h - 1}</h3>`);
        this.#knoepfe(this.el, [
          ['📋 Kopieren', () => this.aktionen.kopieren()],
          ['✂ Ausschneiden', () => this.aktionen.ausschneiden()],
          ['🗑 Leeren', () => this.aktionen.loeschen()],
          ['🤖 Ausschnitt für KI', () => this.aktionen.ausschnittExport()],
          ['🏠 Als Prefab', () => this.aktionen.prefabSpeichern()],
        ]);
      }
      return;
    }
    if (gew.length > 1) {
      this.el.innerHTML = `<h3>${gew.length} Elemente ausgewählt</h3><p class="leise">${[...new Set(gew.map((g) => g.wert.typ ?? g.s))].slice(0, 8).map(esc).join(', ')}</p>`;
      const objekte = gew.filter((g) => g.s === 'objekte');
      if (objekte.length) {
        this.#felder(this.el, [
          { name: 'blockiert', label: 'Blockiert (alle)', typ: 'auswahl', wert: '', optionen: [['', '– unverändert –'], ['ja', 'ja'], ['nein', 'nein']] },
          { name: 'ebene', label: 'Ebene (alle)', typ: 'auswahl', wert: '', optionen: [['', '– unverändert –'], ['moebel', 'Möbel'], ['boden', 'Boden'], ['oben', 'Oben (Krone)'], ['licht', 'Licht']] },
        ], (name, wert) => {
          if (wert === '') return;
          z.ausfuehren(`${name} für ${objekte.length} Objekte`, objekte.map(({ k: id, wert: o }) => ({ s: 'objekte', k: id, neu: name === 'blockiert' ? setzeOptional(o, 'blockiert', wert === 'ja' ? true : undefined) : setzeOptional(o, 'ebene', wert === 'moebel' ? undefined : wert) })));
        });
      }
      this.#allgemeineKnoepfe();
      return;
    }
    const { s, k: schl, wert } = gew[0];
    const titel = { objekte: () => `${objektInfo(wert.typ, k).name} (${wert.typ})`, marker: () => markerTitel(wert), ankuenfte: () => `Ankunftspunkt „${schl}“`, uebergaenge: () => `Übergang → ${wert.ziel}`, bauwerke: () => `Bauwerk ${BAUWERKE[wert.typ]?.name ?? wert.typ}`, tierBereiche: () => 'Hasen-Bereich', raumFlaechen: () => `Raumfläche (${wert.raum})` }[s]?.() ?? s;
    this.el.innerHTML = `<h3>${esc(titel)}</h3>`;
    const setze = (name, neu) => z.ausfuehren(`${titel}: ${name}`, [{ s, k: schl, neu }]);
    if (s === 'objekte') this.#objektFelder(schl, wert, setze);
    else if (s === 'marker') this.#markerFelder(schl, wert, setze);
    else if (s === 'ankuenfte') this.#ankunftFelder(schl, wert);
    else if (s === 'uebergaenge') this.#uebergangFelder(wert, setze);
    else if (s === 'bauwerke')
      this.#felder(this.el, [
        { name: 'typ', label: 'Typ', typ: 'auswahl', wert: wert.typ, optionen: Object.entries(BAUWERKE).map(([t, b]) => [t, b.name]) },
        { name: 'tx', label: 'x', typ: 'zahl', wert: wert.tx, schritt: 1 },
        { name: 'ty', label: 'y', typ: 'zahl', wert: wert.ty, schritt: 1 },
        { name: 'drehung', label: 'Ausrichtung', typ: 'auswahl', wert: wert.drehung ?? 0, optionen: [[0, 'Ost-West'], [1, 'Nord-Süd']] },
      ], (name, v) => setze(name, { ...wert, [name]: name === 'typ' ? v : Number(v) }));
    else if (s === 'tierBereiche') {
      const std = STANDARD_KONFIGURATION.tiere.hasenRespawn;
      this.#felder(this.el, [
        { name: 'anzahl', label: 'Anzahl Hasen', typ: 'zahl', wert: wert.anzahl, min: 0, schritt: 1 },
        { name: 'respawnZeit', label: 'Respawn (s)', typ: 'zahl', wert: wert.respawnZeit ?? '', min: 0, hilfe: `leer = Standard ${std} s` },
        ...rechteckFelder(wert),
      ], (name, v) => setze(name, setzeOptional(wert, name, v)));
    } else if (s === 'raumFlaechen') this.#raumFelder(wert.raum, (raum) => setze('raum', { ...wert, raum }));
    this.#allgemeineKnoepfe();
  }

  #allgemeineKnoepfe() {
    this.#knoepfe(this.el, [
      ['⧉ Duplizieren (Strg+D)', () => this.aktionen.duplizieren()],
      ['⟳ 90°', () => this.aktionen.drehen()],
      ['🗑 Löschen (Entf)', () => this.aktionen.auswahlLoeschen(), 'gefahr'],
    ]);
  }

  #objektFelder(id, o, setze) {
    const k = this.zustand.karte;
    const typen = [...new Set([...Object.keys(OBJEKT_TYPEN).filter((t) => t !== 'laterne'), ...k.s('typen').keys(), o.typ])];
    const felder = [
      { name: 'typ', label: 'Typ', typ: 'auswahl', wert: o.typ, optionen: typen.map((t) => [t, `${objektInfo(t, k).name}`]) },
      { name: 'name', label: 'Name', typ: 'text', wert: o.name ?? '', hilfe: 'optional, nur Editor/KI' },
      ...rechteckFelder(o, 0.1),
      { name: 'drehung', label: 'Drehung °', typ: 'zahl', wert: o.drehung ?? 0, schritt: 1, hilfe: '90er-Schritte = Raster; frei (z. B. 95) nur Optik' },
      { name: 'blockiert', label: 'Blockiert', typ: 'haken', wert: !!o.blockiert },
      { name: 'ebene', label: 'Ebene', typ: 'auswahl', wert: o.ebene ?? 'moebel', optionen: [['moebel', 'Möbel (Standard)'], ['boden', 'Boden (flach)'], ['oben', 'Oben (Krone)'], ['licht', 'Licht']] },
    ];
    if (['baum', 'baum_herbst', 'stein'].includes(o.typ)) felder.push({ name: 'groesse', label: 'Größe', typ: 'auswahl', wert: o.groesse ?? '', optionen: [['', 'automatisch (Zufall nach Position)'], ['klein', 'klein (1 Ertrag)'], ['gross', 'groß (2 Ertrag)']] });
    if (o.typ === 'licht')
      felder.push(
        { name: 'radius', label: 'Radius (Kacheln)', typ: 'zahl', wert: o.radius ?? 4, min: 1, schritt: 0.5 },
        { name: 'farbe', label: 'Lichtfarbe', typ: 'farbe', wert: o.farbe ?? '#ffd9a0' },
        { name: 'staerke', label: 'Stärke 0–1', typ: 'zahl', wert: o.staerke ?? 0.85, min: 0, max: 1, schritt: 0.05 },
        { name: 'flackern', label: 'Flackern', typ: 'haken', wert: !!o.flackern },
        { name: 'mast', label: 'Laternenmast', typ: 'haken', wert: !!o.mast },
      );
    else felder.push({ name: 'farbe', label: 'Farbe (Bemalung)', typ: 'farbe', wert: o.farbe ?? '#808080', hilfe: o.farbe ? 'gesetzt – „Farbe entfernen“ setzt zurück' : 'nicht gesetzt (Typfarbe)' }, { name: 'textur', label: 'Textur', typ: 'auswahl', wert: o.textur ?? '', optionen: TEXTUR_OPTIONEN });
    this.#felder(this.el, felder, (name, v) => {
      let neu = { ...o };
      if (name === 'blockiert') neu = setzeOptional(neu, 'blockiert', v ? true : undefined);
      else if (name === 'ebene') neu = setzeOptional(neu, 'ebene', v === 'moebel' ? undefined : v);
      else if (name === 'drehung') neu = setzeOptional(neu, 'drehung', v ? ((v % 360) + 360) % 360 : undefined);
      else if (name === 'name' || name === 'groesse' || name === 'textur') neu = setzeOptional(neu, name, v || undefined);
      else if (['x', 'y', 'b', 'h'].includes(name)) {
        if (v === null || ((name === 'b' || name === 'h') && v <= 0)) return;
        neu[name] = Math.round(v * 1000) / 1000;
      } else neu[name] = v;
      setze(name, neu);
    });
    if (o.farbe && o.typ !== 'licht') this.#knoepfe(this.el, [['Farbe entfernen', () => setze('farbe', setzeOptional(o, 'farbe', undefined))]]);
  }

  #markerFelder(schl, m, setze) {
    const z = this.zustand;
    const [x, y] = ausSchluessel(schl);
    const felder = [
      { name: 'x', label: 'x', typ: 'zahl', wert: x, schritt: 1 },
      { name: 'y', label: 'y', typ: 'zahl', wert: y, schritt: 1 },
    ];
    const zk = STANDARD_KONFIGURATION.zombie;
    if (m.art === 'zombie')
      felder.push(
        { name: 'anzahl', label: 'Anzahl', typ: 'zahl', wert: m.anzahl ?? '', min: 1, max: 20, schritt: 1, hilfe: 'leer = 1 (× Zonen-Dichte)' },
        { name: 'respawnZeit', label: 'Respawn (s)', typ: 'zahl', wert: m.respawnZeit ?? '', min: 1, hilfe: `leer = Zone/Standard (${z.karte.wert('einstellungen.zombie.respawnZeit') ?? zk.respawnZeit} s)` },
        { name: 'horde', label: 'Horden-Spawnpunkt', typ: 'haken', wert: !!m.horde, hilfe: 'nachts erscheint die Horde nur an solchen Punkten (wenn es welche gibt)' },
      );
    this.#felder(this.el, felder, (name, v) => {
      if (name === 'x' || name === 'y') {
        const nx = name === 'x' ? v : x;
        const ny = name === 'y' ? v : y;
        if (!z.karte.imFeld(nx, ny)) return z.meldung('Außerhalb der Zone', 'fehler');
        z.ausfuehren('Marker verschieben', [{ s: 'marker', k: schl, neu: null }, { s: 'marker', k: markerSchluessel(nx, ny), neu: m }]);
        z.waehle([{ s: 'marker', k: markerSchluessel(nx, ny) }]);
        return;
      }
      setze(name, setzeOptional(m, name, name === 'horde' ? (v ? true : undefined) : v === null ? undefined : v));
    });
    if (m.art === 'loot') this.#raumFelder(m.raum, (raum) => setze('raum', { ...m, raum }));
  }

  /** Raum wählen + Raum-Eigenschaften (Name, Loot-Tabelle, Häufigkeit) */
  #raumFelder(raum, beiWechsel) {
    const z = this.zustand;
    const k = z.karte;
    const r = k.s('raeume').get(raum);
    this.el.insertAdjacentHTML('beforeend', '<h4>Raum</h4>');
    this.#felder(this.el, [{ name: 'raum', label: 'Raum', typ: 'auswahl', wert: raum, optionen: [...k.s('raeume')].map(([b, rr]) => [b, `${b}: ${rr.name}`]).concat(r ? [] : [[raum, `${raum}: (fehlt!)`]]) }], (_, v) => beiWechsel(v));
    if (!r) {
      this.#knoepfe(this.el, [['Raum anlegen', () => this.aktionen.aktion('neuerRaum')]]);
      return;
    }
    const lk = STANDARD_KONFIGURATION.loot;
    this.#felder(this.el, [
      { name: 'name', label: 'Raumname', typ: 'text', wert: r.name },
      { name: 'lootTabelle', label: 'Loot-Tabelle', typ: 'auswahl', wert: r.lootTabelle, optionen: Object.keys(LOOT_TABELLEN).map((t) => [t, t]).concat(LOOT_TABELLEN[r.lootTabelle] ? [] : [[r.lootTabelle, `${r.lootTabelle} (unbekannt!)`]]) },
      { name: 'spawnChance', label: 'Loot-Chance', typ: 'zahl', wert: r.spawnChance ?? '', min: 0, max: 1, schritt: 0.05, hilfe: `leer = Zone/Standard ${k.wert('einstellungen.loot.spawnChance') ?? lk.spawnChance}`, gesetzt: r.spawnChance !== undefined },
      { name: 'respawnZeit', label: 'Nachschub (s)', typ: 'zahl', wert: r.respawnZeit ?? '', min: 1, hilfe: `leer = Zone/Standard ${k.wert('einstellungen.loot.respawnZeit') ?? lk.respawnZeit} s`, gesetzt: r.respawnZeit !== undefined },
    ], (name, v) => z.ausfuehren(`Raum ${raum}: ${name}`, [{ s: 'raeume', k: raum, neu: setzeOptional(r, name, v === null || v === '' ? undefined : v) }]));
    const tabelle = LOOT_TABELLEN[r.lootTabelle];
    if (tabelle) {
      const summe = tabelle.reduce((s, e) => s + e.gewicht, 0);
      this.el.insertAdjacentHTML('beforeend', `<p class="leise">Wahrscheinlichkeiten: ${tabelle.map((e) => `${esc(e.id)} ${Math.round((e.gewicht / summe) * 100)} %`).join(', ')}</p>`);
    }
  }

  #ankunftFelder(name, a) {
    const z = this.zustand;
    this.#felder(this.el, [
      { name: 'name', label: 'Name', typ: 'text', wert: name, hilfe: 'darauf verweisen Übergänge anderer Zonen' },
      { name: 'x', label: 'x', typ: 'zahl', wert: a.x, schritt: 1 },
      { name: 'y', label: 'y', typ: 'zahl', wert: a.y, schritt: 1 },
    ], (feld, v) => {
      if (feld === 'name') {
        if (!/^[a-z0-9_]+$/i.test(v) || z.karte.s('ankuenfte').has(v)) return z.meldung('Name ungültig oder schon vergeben', 'fehler');
        z.ausfuehren('Ankunft umbenennen', [{ s: 'ankuenfte', k: name, neu: null }, { s: 'ankuenfte', k: v, neu: a }]);
        z.waehle([{ s: 'ankuenfte', k: v }]);
      } else z.ausfuehren('Ankunft verschieben', [{ s: 'ankuenfte', k: name, neu: { ...a, [feld]: v } }]);
    });
  }

  #uebergangFelder(u, setze) {
    const z = this.zustand;
    const zonen = [...z.zonen.keys()].filter((id) => id !== z.aktivId);
    const ziel = z.zonen.get(u.ziel)?.karte;
    const ankuenfte = ziel ? [...ziel.s('ankuenfte').keys()] : [];
    this.#felder(this.el, [
      { name: 'name', label: 'Schildtext', typ: 'text', wert: u.name ?? '' },
      { name: 'ziel', label: 'Zielzone', typ: 'auswahl', wert: u.ziel, optionen: [['', '– wählen –'], ...zonen.map((id) => [id, id]), ...(u.ziel && !zonen.includes(u.ziel) ? [[u.ziel, `${u.ziel} (nicht im Projekt)`]] : [])] },
      { name: 'ankunft', label: 'Ankunftspunkt', typ: ankuenfte.length ? 'auswahl' : 'text', wert: u.ankunft, optionen: [['', '– wählen –'], ...ankuenfte.map((n) => [n, n])], hilfe: ziel ? '' : 'Zielzone ins Projekt laden, um Ankünfte zu sehen' },
      ...rechteckFelder(u, 1),
    ], (name, v) => setze(name, { ...u, [name]: ['x', 'y', 'b', 'h'].includes(name) ? Math.round(v) : v }));
    this.#knoepfe(this.el, [['📍 Ankunft in der Zielzone setzen', () => this.aktionen.ankunftInZiel(u)]]);
  }

  // --- Zone -----------------------------------------------------------------------
  #zone() {
    const z = this.zustand;
    const k = z.karte;
    this.el.innerHTML = '<h3>Zone</h3>';
    this.#felder(this.el, [
      { name: 'name', label: 'Name', typ: 'text', wert: k.name },
      { name: 'id', label: 'ID', typ: 'text', wert: k.id, hilfe: 'a–z, 0–9, _ (Dateiname im Spiel)' },
    ], (name, v) => (name === 'id' ? this.aktionen.zoneUmbenennen(v) : z.ausfuehren('Zonenname', [{ s: 'wert', pfad: 'name', neu: v }])));
    this.el.insertAdjacentHTML('beforeend', `<p>Größe: <b>${k.breite} × ${k.hoehe}</b> Kacheln</p>`);
    this.#knoepfe(this.el, [['⤡ Größe ändern…', () => this.aktionen.groesseDialog()], ['Griffe (Z)', () => this.aktionen.werkzeug('zone')]]);
    this.el.insertAdjacentHTML('beforeend', '<h4>Anzeige</h4>');
    const o = z.overlays;
    this.#felder(this.el, [
      { name: 'raster', label: 'Raster', typ: 'haken', wert: o.raster },
      { name: 'innen', label: 'Innen/Außen', typ: 'haken', wert: o.innen, hilfe: 'blau = innen (wie das Spiel es berechnet, Zombies sehen nicht hinein)' },
      { name: 'steil', label: 'Steile Hänge', typ: 'haken', wert: o.steil },
      { name: 'bereiche', label: 'Räume/Bereiche', typ: 'haken', wert: o.bereiche },
      { name: 'nachbarn', label: 'Nachbarzonen', typ: 'haken', wert: o.nachbarn },
    ], (name, v) => {
      o[name] = v;
      this.aktionen.neuZeichnen();
    });
    this.el.insertAdjacentHTML('beforeend', '<h3>Zonen-Werte</h3><p class="leise">Leer = globaler Standard (steht darunter). Grün = in dieser Zone gesetzt.</p>');
    this.#felder(this.el, [{ name: 'musik', label: 'Musik-Ordner', typ: 'text', wert: k.wert('musik') ?? '', platzhalter: k.id, hilfe: `leer = client/musik/${k.id}/ (+ alle/)`, gesetzt: !!k.wert('musik') }], (_, v) => z.ausfuehren('Musik-Ordner', [{ s: 'wert', pfad: 'musik', neu: v || undefined }]));
    for (const [bereich, felder] of Object.entries(ZONEN_EINSTELLUNGEN)) {
      this.el.insertAdjacentHTML('beforeend', `<h4>${esc(felder.titel)}</h4>`);
      this.#felder(
        this.el,
        felder.werte.map((f) => {
          const pfad = `einstellungen.${bereich}.${f.name}`;
          const gesetzt = k.wert(pfad);
          const std = STANDARD_KONFIGURATION[bereich]?.[f.name] ?? f.standard;
          return { ...f, name: f.name, wert: gesetzt ?? '', typ: f.typ === 'haken' ? 'auswahl' : f.typ, optionen: f.typ === 'haken' ? [['', `Standard (${std ? 'an' : 'aus'})`], ['true', 'an'], ['false', 'aus']] : undefined, hilfe: `Standard: ${f.typ === 'haken' ? (std ? 'an' : 'aus') : std}${f.einheit ? ` ${f.einheit}` : ''}${f.hilfe ? ` · ${f.hilfe}` : ''}`, gesetzt: gesetzt !== undefined };
        }),
        (name, v) => {
          const f = felder.werte.find((x) => x.name === name);
          const neu = v === '' || v === null ? undefined : f.typ === 'haken' ? v === 'true' : v;
          z.ausfuehren(`${felder.titel}: ${f.label}`, [{ s: 'wert', pfad: `einstellungen.${bereich}.${name}`, neu }]);
        },
      );
    }
  }

  // --- Prüfung ---------------------------------------------------------------------
  #pruefung() {
    const liste = this.zustand.validierung;
    this.el.innerHTML = liste.length ? '<p class="leise">Klick springt zur Stelle.</p>' : '<p>✓ Keine Probleme gefunden.</p>';
    const ul = document.createElement('ul');
    ul.className = 'liste';
    for (const e of liste) {
      const li = document.createElement('li');
      li.className = e.schwere;
      li.textContent = `${e.text}${e.x !== null ? ` (${e.x}|${e.y})` : ''}`;
      li.addEventListener('click', () => e.x !== null && this.aktionen.springeZu(e.x, e.y));
      ul.append(li);
    }
    this.el.append(ul);
  }
}

const TEXTUR_OPTIONEN = [['', '– keine –'], ['holz', 'Holz'], ['stein', 'Stein'], ['metall', 'Metall'], ['stoff', 'Stoff'], ['gras', 'Gras'], ['streifen', 'Streifen'], ['punkte', 'Punkte']];

function rechteckFelder(o, schritt = 1) {
  return [
    { name: 'x', label: 'x', typ: 'zahl', wert: o.x, schritt },
    { name: 'y', label: 'y', typ: 'zahl', wert: o.y, schritt },
    { name: 'b', label: 'Breite b', typ: 'zahl', wert: o.b, schritt, min: schritt },
    { name: 'h', label: 'Höhe h', typ: 'zahl', wert: o.h, schritt, min: schritt },
  ];
}

function markerTitel(m) {
  return m.art === 'start' ? 'Spieler-Start' : m.art === 'zombie' ? (m.horde ? 'Horden-Spawnpunkt' : 'Zombie-Spawn') : `Loot-Punkt (Raum ${m.raum})`;
}

/** Kopie mit gesetztem oder (undefined) entferntem Feld */
export function setzeOptional(o, name, wert) {
  const neu = { ...o };
  if (wert === undefined) delete neu[name];
  else neu[name] = wert;
  return neu;
}

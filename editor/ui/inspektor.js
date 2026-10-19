import { STANDARD_KONFIGURATION } from '../../server/spiel/konfiguration/spielKonfiguration.js';
import { LOOT_TABELLEN } from '../../server/spiel/konfiguration/lootTabellen.js';
import { BAUWERKE } from '../../gemeinsam/welt/bauwerke.js';
import { ausSchluessel, markerSchluessel } from '../kern/karte.js';
import { objektInfo, OBJEKT_TYPEN } from '../kern/katalog.js';
import { ueberstand, setzeDrehung, inZone } from '../kern/bearbeiten.js';
import { bereichHoehe } from '../kern/terrain.js';
import { ZONEN_EINSTELLUNGEN } from '../../server/spiel/karten/zonenEinstellungen.js';
import { esc, feldHtml } from './dialoge.js';

/**
 * Inspektor (rechte Seitenleiste, Editor 2.0): zeigt, was ausgewählt ist – oder, wenn nichts gewählt ist, die Zone selbst
 * (Name, ID, Größe, markierter Bereich, Zonen-Werte in aufklappbaren Gruppen; leer = globaler Standard).
 * Jede Eingabe wird eine Operation über zustand.ausfuehren (→ Verlauf, 1 Schritt). Positionen werden gegen den Zonenrand
 * geprüft (Meldung statt stiller Übernahme). Werkzeug-Optionen stehen in der Optionsleiste über der Karte.
 */
const TEXTUR_OPTIONEN = [['', '– keine –'], ['holz', 'Holz'], ['stein', 'Stein'], ['metall', 'Metall'], ['stoff', 'Stoff'], ['gras', 'Gras'], ['streifen', 'Streifen'], ['punkte', 'Punkte']];

export function inspektor({ zustand, leiste, aktionen, befehle }) {
  const offeneGruppen = new Set(['Zone']);

  /** Felder einbauen und Änderungen melden: f(name, wert) */
  function felder(container, liste, beiAenderung) {
    const div = document.createElement('div');
    div.innerHTML = liste.map((f) => feldHtml(f).replace('class="feld"', `class="feld${f.gesetzt ? ' gesetzt' : ''}"`)).join('');
    for (const f of liste) {
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

  /** Knopfreihe aus Befehls-IDs ('bearbeiten.kopieren') oder [text, f, art] */
  function knoepfe(container, liste) {
    const div = document.createElement('div');
    div.className = 'knopfreihe';
    for (const e of liste) {
      const b = document.createElement('button');
      b.type = 'button';
      if (typeof e === 'string') {
        const bf = befehle.get(e);
        if (!bf) continue;
        b.textContent = `${bf.symbol ?? ''} ${bf.kurz ?? bf.name}`.trim();
        b.title = `${bf.name}${bf.kuerzel[0] ? ` (${bf.kuerzel[0]})` : ''}`;
        b.dataset.befehl = e;
        if (e.endsWith('loeschen')) b.className = 'gefahr';
        b.addEventListener('click', () => befehle.fuehreAus(e));
      } else {
        const [text, f, art] = e;
        b.textContent = text;
        if (art) b.className = art;
        b.addEventListener('click', f);
      }
      div.append(b);
    }
    container.append(div);
  }

  /** Aufklappbare Gruppe (merkt sich offen/zu) */
  function gruppe(container, titel, fuellen) {
    const d = document.createElement('details');
    d.className = 'gruppe-auf';
    d.open = offeneGruppen.has(titel);
    d.innerHTML = `<summary>${esc(titel)}</summary>`;
    d.addEventListener('toggle', () => (d.open ? offeneGruppen.add(titel) : offeneGruppen.delete(titel)));
    const innen = document.createElement('div');
    d.append(innen);
    fuellen(innen);
    container.append(d);
    return d;
  }

  function zeichne() {
    const el = leiste.el;
    const z = zustand;
    const k = z.karte;
    const gew = z.gewaehlte();
    el.innerHTML = '';
    if (gew.length === 0) return zone(el, k);
    if (gew.length > 1) return mehrere(el, gew);
    const { s, k: schl, wert } = gew[0];
    const titel = { objekte: () => `${objektInfo(wert.typ, k).name} (${wert.typ})`, marker: () => markerTitel(wert), ankuenfte: () => `Ankunftspunkt „${schl}“`, uebergaenge: () => `Übergang → ${wert.ziel}`, bauwerke: () => `Bauwerk ${BAUWERKE[wert.typ]?.name ?? wert.typ}`, tierBereiche: () => 'Hasen-Bereich', raumFlaechen: () => `Raumfläche (${wert.raum})`, klaenge: () => `🔊 ${wert.name}` }[s]?.() ?? s;
    el.innerHTML = `<h3>${esc(titel)}</h3>`;
    const setze = (name, neu) => z.ausfuehren(`${titel}: ${name}`, [{ s, k: schl, neu }]);
    if (s === 'objekte') objektFelder(el, wert, setze);
    else if (s === 'marker') markerFelder(el, schl, wert, setze);
    else if (s === 'ankuenfte') ankunftFelder(el, schl, wert);
    else if (s === 'uebergaenge') uebergangFelder(el, wert, setze);
    else if (s === 'bauwerke')
      felder(el, [
        { name: 'typ', label: 'Typ', typ: 'auswahl', wert: wert.typ, optionen: Object.entries(BAUWERKE).map(([t, b]) => [t, b.name]) },
        { name: 'tx', label: 'x', typ: 'zahl', wert: wert.tx, schritt: 1 },
        { name: 'ty', label: 'y', typ: 'zahl', wert: wert.ty, schritt: 1 },
        { name: 'drehung', label: 'Ausrichtung', typ: 'auswahl', wert: wert.drehung ?? 0, optionen: [[0, 'Ost-West'], [1, 'Nord-Süd']] },
      ], (name, v) => {
        if ((name === 'tx' || name === 'ty') && !k.imFeld(name === 'tx' ? v : wert.tx, name === 'ty' ? v : wert.ty)) return z.meldung('Außerhalb der Zone', 'fehler');
        setze(name, { ...wert, [name]: name === 'typ' ? v : Number(v) });
      });
    else if (s === 'tierBereiche') {
      const std = STANDARD_KONFIGURATION.tiere.hasenRespawn;
      felder(el, [
        { name: 'anzahl', label: 'Anzahl Hasen', typ: 'zahl', wert: wert.anzahl, min: 0, schritt: 1 },
        { name: 'respawnZeit', label: 'Respawn (s)', typ: 'zahl', wert: wert.respawnZeit ?? '', min: 0, hilfe: `leer = Standard ${std} s` },
        ...rechteckFelder(wert),
      ], (name, v) => (rechteckOk(k, { ...wert, [name]: v }, name) ? setze(name, setzeOptional(wert, name, v)) : z.meldung('Bereich muss ganz in der Zone liegen', 'fehler')));
    } else if (s === 'raumFlaechen') raumFelder(el, wert.raum, (raum) => setze('raum', { ...wert, raum }));
    else if (s === 'klaenge') aktionen.klangFelder?.(el, schl, wert, setze, { felder, knoepfe }); // ui/audioUi.js
    knoepfe(el, ['bearbeiten.duplizieren', 'bearbeiten.drehen', 'bearbeiten.loeschen']);
  }

  function mehrere(el, gew) {
    const z = zustand;
    el.innerHTML = `<h3>${gew.length} Elemente ausgewählt</h3><p class="leise">${[...new Set(gew.map((g) => g.wert.typ ?? g.s))].slice(0, 8).map(esc).join(', ')}</p>`;
    const objekte = gew.filter((g) => g.s === 'objekte');
    if (objekte.length)
      felder(el, [
        { name: 'blockiert', label: 'Blockiert (alle)', typ: 'auswahl', wert: '', optionen: [['', '– unverändert –'], ['ja', 'ja'], ['nein', 'nein']] },
        { name: 'ebene', label: 'Ebene (alle)', typ: 'auswahl', wert: '', optionen: [['', '– unverändert –'], ['moebel', 'Möbel'], ['boden', 'Boden'], ['oben', 'Oben (Krone)'], ['licht', 'Licht']] },
      ], (name, wert) => {
        if (wert === '') return;
        z.ausfuehren(`${name} für ${objekte.length} Objekte`, objekte.map(({ k: id, wert: o }) => ({ s: 'objekte', k: id, neu: name === 'blockiert' ? setzeOptional(o, 'blockiert', wert === 'ja' ? true : undefined) : setzeOptional(o, 'ebene', wert === 'moebel' ? undefined : wert) })));
      });
    knoepfe(el, ['bearbeiten.duplizieren', 'bearbeiten.drehen', 'bearbeiten.kopieren', 'bearbeiten.alsPrefab', 'bearbeiten.loeschen']);
  }

  function objektFelder(el, o, setze) {
    const z = zustand;
    const k = z.karte;
    const typen = [...new Set([...Object.keys(OBJEKT_TYPEN).filter((t) => t !== 'laterne' && t !== 'scheinwerfer'), ...k.s('typen').keys(), o.typ])];
    const liste = [
      { name: 'typ', label: 'Typ', typ: 'auswahl', wert: o.typ, optionen: typen.map((t) => [t, `${objektInfo(t, k).name}`]) },
      { name: 'name', label: 'Name', typ: 'text', wert: o.name ?? '', hilfe: 'optional, nur Editor/KI' },
      ...rechteckFelder(o, 0.1),
      { name: 'drehung', label: 'Drehung °', typ: 'zahl', wert: o.drehung ?? 0, schritt: 1, hilfe: 'frei, z. B. 30 – zählt auch für die Kollision im Spiel (Grundfläche dreht mit)' },
      { name: 'blockiert', label: 'Blockiert', typ: 'haken', wert: !!o.blockiert },
      { name: 'ebene', label: 'Ebene', typ: 'auswahl', wert: o.ebene ?? 'moebel', optionen: [['moebel', 'Möbel (Standard)'], ['boden', 'Boden (flach)'], ['oben', 'Oben (Krone)'], ['licht', 'Licht']] },
    ];
    if (['baum', 'baum_herbst', 'stein'].includes(o.typ)) liste.push({ name: 'groesse', label: 'Größe', typ: 'auswahl', wert: o.groesse ?? '', optionen: [['', 'automatisch (Zufall nach Position)'], ['klein', 'klein (1 Ertrag)'], ['gross', 'groß (2 Ertrag)']] });
    if (o.typ === 'licht')
      liste.push(
        { name: 'radius', label: 'Radius (Kacheln)', typ: 'zahl', wert: o.radius ?? 4, min: 1, schritt: 0.5 },
        { name: 'farbe', label: 'Lichtfarbe', typ: 'farbe', wert: o.farbe ?? '#ffd9a0' },
        { name: 'staerke', label: 'Stärke 0–1', typ: 'zahl', wert: o.staerke ?? 0.85, min: 0, max: 1, schritt: 0.05 },
        { name: 'flackern', label: 'Flackern', typ: 'haken', wert: !!o.flackern },
        { name: 'mast', label: 'Laternenmast', typ: 'haken', wert: !!o.mast },
        { name: 'art', label: 'Lichtform', typ: 'auswahl', wert: o.art === 'kegel' ? 'kegel' : 'punkt', optionen: [['punkt', 'Punkt (rundum)'], ['kegel', 'Kegel (Scheinwerfer)']] },
        ...(o.art === 'kegel'
          ? [
              { name: 'richtung', label: 'Richtung °', typ: 'zahl', wert: o.richtung ?? 90, schritt: 15, hilfe: '0 = Osten, 90 = Süden, 180 = Westen, 270 = Norden (R dreht um 90°)' },
              { name: 'oeffnung', label: 'Öffnung °', typ: 'zahl', wert: o.oeffnung ?? 60, min: 10, max: 170, schritt: 5 },
            ]
          : []),
      );
    else liste.push({ name: 'farbe', label: 'Farbe (Bemalung)', typ: 'farbe', wert: o.farbe ?? '#808080', hilfe: o.farbe ? 'gesetzt – „Farbe entfernen“ setzt zurück' : 'nicht gesetzt (Typfarbe)' }, { name: 'textur', label: 'Textur', typ: 'auswahl', wert: o.textur ?? '', optionen: TEXTUR_OPTIONEN });
    felder(el, liste, (name, v) => {
      let neu = { ...o };
      if (name === 'blockiert') neu = setzeOptional(neu, 'blockiert', v ? true : undefined);
      else if (name === 'ebene') neu = setzeOptional(neu, 'ebene', v === 'moebel' ? undefined : v);
      else if (name === 'drehung') {
        // Free-Modus-Regel (5.5): Wechsel längs/quer tauscht b/h um die Mitte, der Rest-Winkel dreht die Grundfläche
        neu = setzeDrehung(o, v ?? 0);
        if (!inZone(k, neu)) return z.meldung('So gedreht ragt das Objekt aus der Zone', 'fehler');
      }
      else if (name === 'name' || name === 'groesse' || name === 'textur') neu = setzeOptional(neu, name, v || undefined);
      else if (name === 'art') {
        neu = setzeOptional(neu, 'art', v === 'kegel' ? 'kegel' : undefined);
        if (v === 'kegel') Object.assign(neu, { richtung: o.richtung ?? 90, oeffnung: o.oeffnung ?? 60 });
        else for (const f of ['richtung', 'oeffnung']) delete neu[f];
      } else if (name === 'richtung') neu.richtung = (((v ?? 90) % 360) + 360) % 360;
      else if (name === 'oeffnung') neu.oeffnung = Math.max(10, Math.min(170, v ?? 60));
      else if (['x', 'y', 'b', 'h'].includes(name)) {
        if (v === null || ((name === 'b' || name === 'h') && v <= 0)) return z.meldung('Größe muss > 0 sein', 'fehler');
        neu[name] = Math.round(v * 1000) / 1000;
        // nicht über den Rand (Kronen dürfen überstehen; was schon übersteht, darf nicht weiter hinaus)
        if (neu.ebene !== 'oben' && ueberstand(k, neu) > ueberstand(k, o) + 1e-9) return z.meldung(`So läge das Objekt außerhalb der Zone (${k.breite} × ${k.hoehe})`, 'fehler');
      } else neu[name] = v;
      setze(name, neu);
    });
    if (o.farbe && o.typ !== 'licht') knoepfe(el, [['Farbe entfernen', () => setze('farbe', setzeOptional(o, 'farbe', undefined))]]);
    if (k.s('typen').has(o.typ)) {
      const asset = k.s('typen').get(o.typ).asset;
      knoepfe(el, [[`✎ Typ „${o.typ}“ bearbeiten`, () => aktionen.typBearbeiten?.(o.typ)], ...(asset ? [['🧊 Modell (Bibliothek)', () => aktionen.modellBearbeiten?.(asset)], ['🛠 Werkstatt', () => aktionen.werkstatt?.(asset)]] : [])]);
    }
  }

  function markerFelder(el, schl, m, setze) {
    const z = zustand;
    const [x, y] = ausSchluessel(schl);
    const liste = [
      { name: 'x', label: 'x', typ: 'zahl', wert: x, schritt: 1 },
      { name: 'y', label: 'y', typ: 'zahl', wert: y, schritt: 1 },
    ];
    const zk = STANDARD_KONFIGURATION.zombie;
    if (m.art === 'zombie')
      liste.push(
        { name: 'anzahl', label: 'Anzahl', typ: 'zahl', wert: m.anzahl ?? '', min: 1, max: 20, schritt: 1, hilfe: 'leer = 1 (× Zonen-Dichte)' },
        { name: 'respawnZeit', label: 'Respawn (s)', typ: 'zahl', wert: m.respawnZeit ?? '', min: 1, hilfe: `leer = Zone/Standard (${z.karte.wert('einstellungen.zombie.respawnZeit') ?? zk.respawnZeit} s)` },
        { name: 'horde', label: 'Horden-Spawnpunkt', typ: 'haken', wert: !!m.horde, hilfe: 'nachts erscheint die Horde nur an solchen Punkten (wenn es welche gibt)' },
      );
    felder(el, liste, (name, v) => {
      if (name === 'x' || name === 'y') {
        const nx = name === 'x' ? v : x;
        const ny = name === 'y' ? v : y;
        if (!z.karte.imFeld(nx, ny)) return z.meldung('Außerhalb der Zone', 'fehler');
        if (z.karte.markerAn(nx, ny)) return z.meldung(`Auf ${nx}|${ny} liegt schon ein Marker`, 'fehler');
        z.ausfuehren('Marker verschieben', [{ s: 'marker', k: schl, neu: null }, { s: 'marker', k: markerSchluessel(nx, ny), neu: m }]);
        z.waehle([{ s: 'marker', k: markerSchluessel(nx, ny) }]);
        return;
      }
      setze(name, setzeOptional(m, name, name === 'horde' ? (v ? true : undefined) : v === null ? undefined : v));
    });
    if (m.art === 'loot') raumFelder(el, m.raum, (raum) => setze('raum', { ...m, raum }));
  }

  /** Raum wählen + Raum-Eigenschaften (Name, Loot-Tabelle, Häufigkeit) */
  function raumFelder(el, raum, beiWechsel) {
    const z = zustand;
    const k = z.karte;
    const r = k.s('raeume').get(raum);
    el.insertAdjacentHTML('beforeend', '<h4>Raum</h4>');
    felder(el, [{ name: 'raum', label: 'Raum', typ: 'auswahl', wert: raum, optionen: [...k.s('raeume')].map(([b, rr]) => [b, `${b}: ${rr.name}`]).concat(r ? [] : [[raum, `${raum}: (fehlt!)`]]) }], (_, v) => beiWechsel(v));
    if (!r) return knoepfe(el, [['Raum anlegen', () => aktionen.neuerRaum()]]);
    const lk = STANDARD_KONFIGURATION.loot;
    felder(el, [
      { name: 'name', label: 'Raumname', typ: 'text', wert: r.name },
      { name: 'lootTabelle', label: 'Loot-Tabelle', typ: 'auswahl', wert: r.lootTabelle, optionen: Object.keys(LOOT_TABELLEN).map((t) => [t, t]).concat(LOOT_TABELLEN[r.lootTabelle] ? [] : [[r.lootTabelle, `${r.lootTabelle} (unbekannt!)`]]) },
      { name: 'spawnChance', label: 'Loot-Chance', typ: 'zahl', wert: r.spawnChance ?? '', min: 0, max: 1, schritt: 0.05, hilfe: `leer = Zone/Standard ${k.wert('einstellungen.loot.spawnChance') ?? lk.spawnChance}`, gesetzt: r.spawnChance !== undefined },
      { name: 'respawnZeit', label: 'Nachschub (s)', typ: 'zahl', wert: r.respawnZeit ?? '', min: 1, hilfe: `leer = Zone/Standard ${k.wert('einstellungen.loot.respawnZeit') ?? lk.respawnZeit} s`, gesetzt: r.respawnZeit !== undefined },
    ], (name, v) => {
      if (name === 'spawnChance' && v !== null && !(v >= 0 && v <= 1)) return z.meldung('Loot-Chance: 0 bis 1', 'fehler');
      z.ausfuehren(`Raum ${raum}: ${name}`, [{ s: 'raeume', k: raum, neu: setzeOptional(r, name, v === null || v === '' ? undefined : v) }]);
    });
    const tabelle = LOOT_TABELLEN[r.lootTabelle];
    if (tabelle) {
      const summe = tabelle.reduce((s, e) => s + e.gewicht, 0);
      el.insertAdjacentHTML('beforeend', `<p class="leise">Wahrscheinlichkeiten: ${tabelle.map((e) => `${esc(e.id)} ${Math.round((e.gewicht / summe) * 100)} %`).join(', ')}</p>`);
    }
  }

  function ankunftFelder(el, name, a) {
    const z = zustand;
    felder(el, [
      { name: 'name', label: 'Name', typ: 'text', wert: name, hilfe: 'darauf verweisen Übergänge anderer Zonen' },
      { name: 'x', label: 'x', typ: 'zahl', wert: a.x, schritt: 1 },
      { name: 'y', label: 'y', typ: 'zahl', wert: a.y, schritt: 1 },
    ], (feld, v) => {
      if (feld === 'name') {
        if (!/^[a-z0-9_]+$/i.test(v) || z.karte.s('ankuenfte').has(v)) return z.meldung('Name ungültig oder schon vergeben', 'fehler');
        z.ausfuehren('Ankunft umbenennen', [{ s: 'ankuenfte', k: name, neu: null }, { s: 'ankuenfte', k: v, neu: a }]);
        z.waehle([{ s: 'ankuenfte', k: v }]);
      } else {
        const neu = { ...a, [feld]: v };
        if (!z.karte.imFeld(neu.x, neu.y)) return z.meldung('Außerhalb der Zone', 'fehler');
        z.ausfuehren('Ankunft verschieben', [{ s: 'ankuenfte', k: name, neu }]);
      }
    });
  }

  function uebergangFelder(el, u, setze) {
    const z = zustand;
    const zonen = [...z.zonen.keys()].filter((id) => id !== z.aktivId);
    const ziel = z.zonen.get(u.ziel)?.karte;
    const ankuenfte = ziel ? [...ziel.s('ankuenfte').keys()] : [];
    felder(el, [
      { name: 'name', label: 'Schildtext', typ: 'text', wert: u.name ?? '' },
      { name: 'ziel', label: 'Zielzone', typ: 'auswahl', wert: u.ziel, optionen: [['', '– wählen –'], ...zonen.map((id) => [id, id]), ...(u.ziel && !zonen.includes(u.ziel) ? [[u.ziel, `${u.ziel} (nicht im Projekt)`]] : [])] },
      { name: 'ankunft', label: 'Ankunftspunkt', typ: ankuenfte.length ? 'auswahl' : 'text', wert: u.ankunft, optionen: [['', '– wählen –'], ...ankuenfte.map((n) => [n, n])], hilfe: ziel ? '' : 'Zielzone ins Projekt laden, um Ankünfte zu sehen' },
      ...rechteckFelder(u, 1),
    ], (name, v) => {
      const neu = { ...u, [name]: ['x', 'y', 'b', 'h'].includes(name) ? Math.round(v) : v };
      if (['x', 'y', 'b', 'h'].includes(name) && !rechteckOk(z.karte, neu, name)) return z.meldung('Übergang muss ganz in der Zone liegen', 'fehler');
      setze(name, neu);
    });
    knoepfe(el, [['📍 Ankunft in der Zielzone setzen', () => aktionen.ankunftInZiel(u)]]);
  }

  // --- Nichts gewählt: Zone ---------------------------------------------------------
  function zone(el, k) {
    const z = zustand;
    if (z.auswahlRechteck) {
      const r = z.auswahlRechteck;
      el.insertAdjacentHTML('beforeend', `<h3>Bereich x ${r.x}–${r.x + r.b - 1}, y ${r.y}–${r.y + r.h - 1}</h3><p class="leise">${r.b} × ${r.h} Kacheln</p>`);
      knoepfe(el, ['bearbeiten.kopieren', 'bearbeiten.ausschneiden', 'bearbeiten.bereichLeeren', 'ki.ausschnitt', 'bearbeiten.alsPrefab']);
      felder(el, [{ name: 'bereichHoehe', label: 'Geländehöhe (m)', typ: 'zahl', wert: k.hoeheAn(r.x, r.y), min: -10, max: 10, schritt: 0.5, hilfe: 'setzt den ganzen Bereich auf diese Höhe (Plateau; Klippen > 1 m sperren ihren Fuß)' }], (_, v) => v !== null && z.ausfuehren(`Bereich auf ${v} m`, bereichHoehe(k, r, v)));
    } else el.insertAdjacentHTML('beforeend', '<p class="leise">Nichts ausgewählt. ⬚ (V): Klick wählt, Umschalt = mehrere, ins Leere ziehen = Bereich markieren. Rechtsklick = Kontextmenü.</p>');
    gruppe(el, 'Zone', (box) => {
      felder(box, [
        { name: 'name', label: 'Name', typ: 'text', wert: k.name },
        { name: 'id', label: 'ID', typ: 'text', wert: k.id, hilfe: 'a–z, 0–9, _ (Dateiname im Spiel)' },
      ], (name, v) => (name === 'id' ? aktionen.zoneUmbenennen(v) : z.ausfuehren('Zonenname', [{ s: 'wert', pfad: 'name', neu: v }])));
      box.insertAdjacentHTML('beforeend', `<p>Größe: <b>${k.breite} × ${k.hoehe}</b> Kacheln</p>`);
      knoepfe(box, ['zone.groesse', 'werkzeug.zone']);
      felder(box, [{ name: 'musik', label: 'Musik-Ordner', typ: 'text', wert: k.wert('musik') ?? '', platzhalter: k.id, hilfe: `leer = client/musik/${k.id}/ (+ alle/)`, gesetzt: !!k.wert('musik') }], (_, v) => z.ausfuehren('Musik-Ordner', [{ s: 'wert', pfad: 'musik', neu: v || undefined }]));
    });
    el.insertAdjacentHTML('beforeend', '<p class="leise" style="margin-top:10px">Zonen-Werte: leer = globaler Standard (steht darunter), grün = in dieser Zone gesetzt.</p>');
    for (const [bereich, def] of Object.entries(ZONEN_EINSTELLUNGEN)) {
      const d = gruppe(el, def.titel, (box) =>
        felder(
          box,
          def.werte.map((f) => {
            const pfad = `einstellungen.${bereich}.${f.name}`;
            const gesetzt = k.wert(pfad);
            const std = STANDARD_KONFIGURATION[bereich]?.[f.name] ?? f.standard;
            return { ...f, name: f.name, wert: gesetzt ?? '', typ: f.typ === 'haken' ? 'auswahl' : f.typ, optionen: f.typ === 'haken' ? [['', `Standard (${std ? 'an' : 'aus'})`], ['true', 'an'], ['false', 'aus']] : undefined, hilfe: `Standard: ${f.typ === 'haken' ? (std ? 'an' : 'aus') : std}${f.einheit ? ` ${f.einheit}` : ''}${f.hilfe ? ` · ${f.hilfe}` : ''}`, gesetzt: gesetzt !== undefined };
          }),
          (name, v) => {
            const f = def.werte.find((x) => x.name === name);
            const neu = v === '' || v === null ? undefined : f.typ === 'haken' ? v === 'true' : v;
            z.ausfuehren(`${def.titel}: ${f.label}`, [{ s: 'wert', pfad: `einstellungen.${bereich}.${name}`, neu }]);
          },
        ),
      );
      d.dataset.bereich = bereich;
      const anzahl = def.werte.filter((f) => k.wert(`einstellungen.${bereich}.${f.name}`) !== undefined).length;
      if (anzahl) d.querySelector('summary').insertAdjacentHTML('beforeend', ` <span class="gesetzt-zahl">${anzahl} gesetzt</span>`);
    }
  }

  /** Zonen-Werte eines Bereichs (z. B. 'wetter') aufklappen und zeigen */
  function zeigeZonenWerte(bereich = null) {
    zustand.leereAuswahl();
    if (bereich) offeneGruppen.add(ZONEN_EINSTELLUNGEN[bereich]?.titel);
    leiste.zeige('Inspektor');
    if (bereich) leiste.el.querySelector(`details[data-bereich="${bereich}"]`)?.scrollIntoView({ block: 'start' });
  }

  leiste.registriere('Inspektor', zeichne, { ereignisse: ['zone', 'karte', 'auswahl'] });
  return { zeichne, zeigeZonenWerte };
}

function rechteckFelder(o, schritt = 1) {
  return [
    { name: 'x', label: 'x', typ: 'zahl', wert: o.x, schritt },
    { name: 'y', label: 'y', typ: 'zahl', wert: o.y, schritt },
    { name: 'b', label: 'Breite b', typ: 'zahl', wert: o.b, schritt, min: schritt },
    { name: 'h', label: 'Höhe h', typ: 'zahl', wert: o.h, schritt, min: schritt },
  ];
}

function rechteckOk(karte, r, feld) {
  if ((feld === 'b' || feld === 'h') && !(r[feld] > 0)) return false;
  return r.x >= 0 && r.y >= 0 && r.x + r.b <= karte.breite && r.y + r.h <= karte.hoehe;
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

import { GEGENSTAENDE } from '../../server/spiel/konfiguration/gegenstaende.js';
import { LOOT_TABELLEN } from '../../server/spiel/konfiguration/lootTabellen.js';
import { REZEPTE } from '../../server/spiel/konfiguration/rezepte.js';
import { icon } from './icons.js';
import { dialog, frage, esc } from './dialoge.js';

/**
 * Item-Editor des Studios (Phase 1.16): Items, Loot-Tabellen und Rezepte bearbeiten – ohne Code. Gespeichert wird NUR in
 * server/spiel/konfiguration/studioDaten.js (über die handgeschriebenen Dateien gelegt, siehe dort). Nach dem Speichern:
 * Studio lädt neu (Listen frisch), Spiel neu starten, `npm test` prüft Icons/Rezept-Zutaten.
 *   Items          Felder des Items (Zahl/Text/Schalter/[min,max]/JSON) ändern, neues Item (Icon eines vorhandenen leihen)
 *   Loot-Tabellen  Einträge (Item + Gewicht) bearbeiten, neue Tabelle
 *   Rezepte        Name, Gruppe, Ort, Level, Ergebnis + Menge, Zutaten
 */
const KATEGORIEN = ['nahrung', 'getraenk', 'medizin', 'nahkampf', 'fernkampf', 'wurf', 'munition', 'material', 'werkzeug', 'kleidung', 'rucksack', 'bauwerk', 'samen', 'mod'];
const ORTE = [['', 'Werkbank'], ['inventar', 'Inventar (ohne Werkbank)'], ['amboss', 'Amboss'], ['webstuhl', 'Webstuhl'], ['chemie', 'Chemietisch'], ['feuer', 'Kochstelle']];
const NICHT_BEARBEITBAR = new Set(['stapelbar', 'inHand', 'ausruestung']);
const ID = /^[a-z0-9_]{1,40}$/;

export async function oeffneItemEditor(studio) {
  const arbeit = await studio.nativ.aufruf('projekt.studioDaten');
  let reiter = 'items';
  let gewaehlt = { items: Object.keys(GEGENSTAENDE)[0], loot: Object.keys(LOOT_TABELLEN)[0], rezepte: Object.keys(REZEPTE)[0] };
  let suche = '';
  let geaendert = false;
  const atlas = await fetch('../client/assets/atlas.json').then((r) => r.json()).catch(() => ({ items: { icons: {} } }));
  const icons = Object.keys(atlas.items?.icons ?? {}).sort();

  const item = (id) => ({ ...(GEGENSTAENDE[id] ?? {}), ...(arbeit.gegenstaende[id] ?? {}) });
  const alleItems = () => [...new Set([...Object.keys(GEGENSTAENDE), ...Object.keys(arbeit.gegenstaende)])];
  const tabelle = (n) => arbeit.lootTabellen[n] ?? LOOT_TABELLEN[n] ?? [];
  const alleTabellen = () => [...new Set([...Object.keys(LOOT_TABELLEN), ...Object.keys(arbeit.lootTabellen)])].filter((t) => t !== 'zombie' || true).sort();
  const rezept = (id) => arbeit.rezepte[id] ?? REZEPTE[id];
  const alleRezepte = () => [...new Set([...Object.keys(REZEPTE), ...Object.keys(arbeit.rezepte)])];
  const itemOptionen = (wert) => alleItems().sort().map((i) => `<option value="${i}" ${i === wert ? 'selected' : ''}>${esc(item(i).name ?? i)} (${i})</option>`).join('');
  const marke = (neu, aend) => (neu ? '<span class="marke-klein entwurf">neu</span>' : aend ? '<span class="marke-klein spiel">geändert</span>' : '');

  const el = document.createElement('div');
  el.style.cssText = 'display:grid;grid-template-columns:260px 1fr;gap:14px;height:62vh';

  const zeichne = () => {
    let liste = [];
    if (reiter === 'items') liste = alleItems().map((i) => [i, item(i).name ?? i, item(i).kategorie ?? '', marke(!GEGENSTAENDE[i], !!arbeit.gegenstaende[i])]);
    if (reiter === 'loot') liste = alleTabellen().map((t) => [t, t, `${tabelle(t).length} Einträge`, marke(!LOOT_TABELLEN[t], !!arbeit.lootTabellen[t])]);
    if (reiter === 'rezepte') liste = alleRezepte().map((r) => [r, rezept(r)?.name ?? r, rezept(r)?.kategorie ?? '', marke(!REZEPTE[r], !!arbeit.rezepte[r])]);
    liste = liste.filter(([id, name, kat]) => !suche || `${id} ${name} ${kat}`.toLowerCase().includes(suche)).sort((a, b) => a[1].localeCompare(b[1], 'de'));
    const neuText = { items: 'Neues Item', loot: 'Neue Tabelle', rezepte: 'Neues Rezept' }[reiter];
    el.innerHTML = `<div style="display:flex;flex-direction:column;gap:8px;min-height:0">
        <div class="segment">${[['items', 'Items'], ['loot', 'Loot-Tabellen'], ['rezepte', 'Rezepte']].map(([r, t]) => `<button data-reiter="${r}" class="${reiter === r ? 'aktiv' : ''}">${t}</button>`).join('')}</div>
        <input class="feld" data-suche placeholder="Suchen…" value="${esc(suche)}" />
        <div style="overflow:auto;flex:1;border:1px solid var(--linie);border-radius:6px">${liste.map(([id, name, kat, m]) => `<div class="liste-eintrag ${gewaehlt[reiter] === id ? 'aktiv' : ''}" data-id="${esc(id)}"><span>${esc(name)}</span><span class="neben" style="display:flex;gap:4px">${m}<span>${esc(kat)}</span></span></div>`).join('')}</div>
        <button class="knopf" data-neu>${icon('plus', 14)} ${neuText}</button>
      </div><div style="overflow:auto;min-height:0" data-formular>${formular()}</div>`;
  };

  const formular = () => {
    const id = gewaehlt[reiter];
    if (reiter === 'items') {
      const w = item(id);
      if (!w.name && !GEGENSTAENDE[id] && !arbeit.gegenstaende[id]) return '<div class="insp-leer">Links ein Item wählen.</div>';
      const zeilen = Object.entries(w).filter(([f]) => !NICHT_BEARBEITBAR.has(f)).map(([f, v]) => {
        const geaendertFeld = arbeit.gegenstaende[id] && f in arbeit.gegenstaende[id];
        let eingabe;
        if (f === 'kategorie') eingabe = `<select class="feld" data-feld="${f}" data-typ="text">${KATEGORIEN.map((k) => `<option ${k === v ? 'selected' : ''}>${k}</option>`).join('')}</select>`;
        else if (typeof v === 'number') eingabe = `<input class="feld zahl" type="number" step="any" data-feld="${f}" data-typ="zahl" value="${v}" />`;
        else if (typeof v === 'boolean') eingabe = `<label class="schalter"><input type="checkbox" data-feld="${f}" data-typ="bool" ${v ? 'checked' : ''} />${v ? 'ja' : 'nein'}</label>`;
        else if (Array.isArray(v) && v.length === 2 && v.every((x) => typeof x === 'number')) eingabe = `<span style="display:flex;gap:6px"><input class="feld zahl" type="number" data-feld="${f}" data-typ="paar0" value="${v[0]}" /><input class="feld zahl" type="number" data-feld="${f}" data-typ="paar1" value="${v[1]}" /></span>`;
        else if (typeof v === 'string') eingabe = `<input class="feld" data-feld="${f}" data-typ="text" value="${esc(v)}" />`;
        else eingabe = `<textarea class="feld" rows="2" data-feld="${f}" data-typ="json">${esc(JSON.stringify(v))}</textarea>`;
        return `<div class="insp-zeile" style="grid-template-columns:150px 1fr"><span style="${geaendertFeld ? 'color:var(--akzent)' : ''}">${esc(f)}</span><div>${eingabe}</div></div>`;
      });
      const neu = !GEGENSTAENDE[id];
      return `<div class="insp-titel" style="margin-bottom:4px">${esc(w.name ?? id)} <span style="color:var(--text-3);font-weight:400">${esc(id)}</span></div>
        ${neu ? `<div class="insp-zeile" style="grid-template-columns:150px 1fr"><span>Icon</span><div><select class="feld" data-icon>${icons.map((i) => `<option ${arbeit.icons[id] === i ? 'selected' : ''}>${i}</option>`).join('')}</select></div></div>` : ''}
        <div style="display:grid;gap:6px">${zeilen.join('')}</div>
        <div class="insp-knoepfe" style="margin-top:10px"><button class="knopf" data-feldneu>${icon('plus', 14)} Feld hinzufügen</button>${arbeit.gegenstaende[id] ? `<button class="knopf gefahr" data-zuruecksetzen>${neu ? 'Item löschen' : 'Studio-Änderungen verwerfen'}</button>` : ''}</div>
        <div class="hinweis-kasten" style="margin-top:10px">Orange = im Studio geändert. Felder wie <code>naehrwert</code>, <code>durstwert</code>, <code>schaden</code>, <code>reichweite</code>, <code>magazin</code>, <code>mengeBeimFund</code> wirken direkt im Spiel.</div>`;
    }
    if (reiter === 'loot') {
      const t = tabelle(id);
      const summe = t.reduce((s, e) => s + e.gewicht, 0) || 1;
      return `<div class="insp-titel">Loot-Tabelle ${esc(id)}</div><div style="display:grid;gap:4px;margin-top:8px">${t.map((e, i) => `<div style="display:grid;grid-template-columns:1fr 90px 60px 30px;gap:6px;align-items:center"><select class="feld" data-lootid="${i}">${itemOptionen(e.id)}</select><input class="feld zahl" type="number" min="0.1" step="0.1" data-lootgewicht="${i}" value="${e.gewicht}" /><span style="color:var(--text-3)">${Math.round((e.gewicht / summe) * 100)} %</span><button class="knopf flach" data-lootweg="${i}">${icon('schliessen', 14)}</button></div>`).join('')}</div>
        <div class="insp-knoepfe" style="margin-top:8px"><button class="knopf" data-lootneu>${icon('plus', 14)} Eintrag</button>${arbeit.lootTabellen[id] ? `<button class="knopf gefahr" data-lootzurueck>${LOOT_TABELLEN[id] ? 'Studio-Änderungen verwerfen' : 'Tabelle löschen'}</button>` : ''}</div>
        <div class="hinweis-kasten" style="margin-top:10px">Gewicht = relative Häufigkeit. Räume, Loot-Zonen und Spawnpunkte nutzen diese Tabellen.</div>`;
    }
    const r = rezept(id);
    if (!r) return '<div class="insp-leer">Links ein Rezept wählen.</div>';
    const zutaten = Object.entries(r.zutaten ?? {});
    return `<div class="insp-titel">Rezept ${esc(id)}</div><div style="display:grid;gap:6px;margin-top:8px">
      ${[['name', 'Name'], ['kategorie', 'Gruppe im Menü'], ['beschreibung', 'Beschreibung']].map(([f, t]) => `<div class="insp-zeile" style="grid-template-columns:150px 1fr"><span>${t}</span><div><input class="feld" data-rezept="${f}" value="${esc(r[f] ?? '')}" /></div></div>`).join('')}
      <div class="insp-zeile" style="grid-template-columns:150px 1fr"><span>Ergebnis</span><div><select class="feld" data-rezept="ergebnis">${itemOptionen(r.ergebnis)}</select><input class="feld zahl" type="number" min="1" data-rezept="menge" value="${r.menge ?? 1}" title="Menge" /></div></div>
      <div class="insp-zeile" style="grid-template-columns:150px 1fr"><span>Ort</span><div><select class="feld" data-rezept="ort">${ORTE.map(([o, t]) => `<option value="${o}" ${(r.ort ?? '') === o ? 'selected' : ''}>${t}</option>`).join('')}</select></div></div>
      <div class="insp-zeile" style="grid-template-columns:150px 1fr"><span>ab Level</span><div><input class="feld zahl" type="number" min="1" data-rezept="level" value="${r.level ?? 1}" /></div></div>
      <div class="insp-abschnitt-titel" style="margin-top:6px">Zutaten</div>
      ${zutaten.map(([z, n], i) => `<div style="display:grid;grid-template-columns:1fr 90px 30px;gap:6px"><select class="feld" data-zutat="${i}">${itemOptionen(z)}</select><input class="feld zahl" type="number" min="1" data-zutatmenge="${i}" value="${n}" /><button class="knopf flach" data-zutatweg="${i}">${icon('schliessen', 14)}</button></div>`).join('')}
      <div class="insp-knoepfe"><button class="knopf" data-zutatneu>${icon('plus', 14)} Zutat</button>${arbeit.rezepte[id] ? `<button class="knopf gefahr" data-rezeptzurueck>${REZEPTE[id] ? 'Studio-Änderungen verwerfen' : 'Rezept löschen'}</button>` : ''}</div></div>`;
  };

  const aendereRezept = (f) => {
    const id = gewaehlt.rezepte;
    arbeit.rezepte[id] = JSON.parse(JSON.stringify(rezept(id)));
    f(arbeit.rezepte[id]);
    geaendert = true;
  };

  el.addEventListener('input', (e) => {
    if (e.target.matches('[data-suche]')) {
      suche = e.target.value.toLowerCase();
      const pos = e.target.selectionStart;
      zeichne();
      const s = el.querySelector('[data-suche]');
      s.focus();
      s.setSelectionRange(pos, pos);
    }
  });
  el.addEventListener('change', (e) => {
    const t = e.target;
    const id = gewaehlt[reiter];
    if (t.dataset.feld) {
      const f = t.dataset.feld;
      const alt = item(id)[f];
      let wert;
      if (t.dataset.typ === 'zahl') wert = Number(t.value);
      else if (t.dataset.typ === 'bool') wert = t.checked;
      else if (t.dataset.typ?.startsWith('paar')) wert = [...alt].map((x, i) => (i === Number(t.dataset.typ.slice(4)) ? Number(t.value) : x));
      else if (t.dataset.typ === 'json') {
        try {
          wert = JSON.parse(t.value);
        } catch {
          return studio.hinweis(`${f}: kein gültiges JSON`, 'fehler');
        }
      } else wert = t.value;
      arbeit.gegenstaende[id] = { ...(arbeit.gegenstaende[id] ?? {}), [f]: wert };
      geaendert = true;
    } else if (t.matches('[data-icon]')) {
      arbeit.icons[id] = t.value;
      geaendert = true;
    } else if (t.dataset.lootid !== undefined || t.dataset.lootgewicht !== undefined) {
      const tab = tabelle(id).map((x) => ({ ...x }));
      if (t.dataset.lootid !== undefined) tab[Number(t.dataset.lootid)].id = t.value;
      else tab[Number(t.dataset.lootgewicht)].gewicht = Math.max(0.1, Number(t.value) || 1);
      arbeit.lootTabellen[id] = tab;
      geaendert = true;
    } else if (t.dataset.rezept) {
      const f = t.dataset.rezept;
      aendereRezept((r) => {
        if (f === 'menge' || f === 'level') {
          const n = Math.max(1, Math.round(Number(t.value) || 1));
          if (n === 1) delete r[f];
          else r[f] = n;
        } else if (f === 'ort' && !t.value) delete r.ort;
        else r[f] = t.value;
      });
    } else if (t.dataset.zutat !== undefined || t.dataset.zutatmenge !== undefined) {
      aendereRezept((r) => {
        const z = Object.entries(r.zutaten ?? {});
        if (t.dataset.zutat !== undefined) z[Number(t.dataset.zutat)][0] = t.value;
        else z[Number(t.dataset.zutatmenge)][1] = Math.max(1, Math.round(Number(t.value) || 1));
        r.zutaten = Object.fromEntries(z);
      });
    }
    zeichne();
  });
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('button, [data-id]');
    if (!b) return;
    const id = gewaehlt[reiter];
    if (b.dataset.reiter) {
      reiter = b.dataset.reiter;
      suche = ''; // Suche gilt je Reiter
    }
    else if (b.dataset.id) gewaehlt[reiter] = b.dataset.id;
    else if (b.matches('[data-neu]')) {
      const neuId = prompt2(reiter === 'items' ? 'ID des neuen Items (a–z, 0–9, _)' : reiter === 'loot' ? 'Name der neuen Loot-Tabelle' : 'ID des neuen Rezepts');
      const wert = await neuId;
      if (!wert) return;
      if (!ID.test(wert)) return studio.hinweis('Nur a–z, 0–9, _', 'fehler');
      if (reiter === 'items') {
        if (GEGENSTAENDE[wert] || arbeit.gegenstaende[wert]) return studio.hinweis('Die ID gibt es schon', 'fehler');
        const vorlage = item(id);
        arbeit.gegenstaende[wert] = Object.fromEntries(Object.entries({ ...vorlage, name: `${vorlage.name ?? 'Neues Item'} (neu)` }).filter(([f]) => !NICHT_BEARBEITBAR.has(f)));
        arbeit.icons[wert] = id;
      } else if (reiter === 'loot') arbeit.lootTabellen[wert] = [{ id: 'konservendose', gewicht: 1 }];
      else arbeit.rezepte[wert] = { name: 'Neues Rezept', kategorie: 'Werkzeuge', beschreibung: '', zutaten: { holz: 2 }, ergebnis: 'bretter' };
      gewaehlt[reiter] = wert;
      geaendert = true;
    } else if (b.matches('[data-feldneu]')) {
      const f = await prompt2('Feldname (z. B. heilung, naehrwert, schaden)');
      if (!f || !/^[a-zA-Z][a-zA-Z0-9]{0,30}$/.test(f)) return;
      arbeit.gegenstaende[id] = { ...(arbeit.gegenstaende[id] ?? {}), [f]: 0 };
      geaendert = true;
    } else if (b.matches('[data-zuruecksetzen]')) {
      delete arbeit.gegenstaende[id];
      delete arbeit.icons[id];
      geaendert = true;
    } else if (b.dataset.lootweg !== undefined) {
      arbeit.lootTabellen[id] = tabelle(id).filter((_, i) => i !== Number(b.dataset.lootweg));
      geaendert = true;
    } else if (b.matches('[data-lootneu]')) {
      arbeit.lootTabellen[id] = [...tabelle(id), { id: 'konservendose', gewicht: 1 }];
      geaendert = true;
    } else if (b.matches('[data-lootzurueck]')) {
      delete arbeit.lootTabellen[id];
      geaendert = true;
    } else if (b.dataset.zutatweg !== undefined) aendereRezept((r) => (r.zutaten = Object.fromEntries(Object.entries(r.zutaten).filter((_, i) => i !== Number(b.dataset.zutatweg)))));
    else if (b.matches('[data-zutatneu]')) aendereRezept((r) => (r.zutaten = { ...(r.zutaten ?? {}), holz: (r.zutaten?.holz ?? 0) + 1 }));
    else if (b.matches('[data-rezeptzurueck]')) {
      delete arbeit.rezepte[id];
      geaendert = true;
    } else return;
    zeichne();
  });

  zeichne();
  const ergebnis = await dialog({ titel: 'Items, Loot & Rezepte', icon: 'item', breit: true, klasse: 'sehr-breit', ohneEnter: true, inhalt: el, knoepfe: [{ text: 'Schließen', wert: 'zu' }, { text: 'Speichern', wert: 'speichern', art: 'primaer' }] });
  if (ergebnis !== 'speichern') return;
  // Prüfen: Rezept-Zutaten/Ergebnis und Loot-Einträge müssen Items sein, neue Items brauchen ein Icon
  const bekannt = new Set(alleItems());
  const fehler = [];
  for (const [rid, r] of Object.entries(arbeit.rezepte)) for (const z of [r.ergebnis, ...Object.keys(r.zutaten ?? {})]) if (!bekannt.has(z)) fehler.push(`Rezept ${rid}: Item „${z}“ gibt es nicht`);
  for (const [t, liste] of Object.entries(arbeit.lootTabellen)) for (const e of liste) if (!bekannt.has(e.id)) fehler.push(`Loot ${t}: Item „${e.id}“ gibt es nicht`);
  for (const iid of Object.keys(arbeit.gegenstaende)) if (!GEGENSTAENDE[iid] && !atlas.items.icons[iid] && !atlas.items.icons[arbeit.icons[iid]]) fehler.push(`Item ${iid}: Icon fehlt`);
  if (fehler.length) return dialog({ titel: 'Nicht gespeichert', icon: 'fehler', inhalt: fehler.map(esc).join('<br />'), knoepfe: [{ text: 'OK', wert: true, art: 'primaer' }] });
  await studio.nativ.aufruf('projekt.speichereStudioDaten', { daten: arbeit });
  if (await frage('Gespeichert', 'Gespeichert in <code>server/spiel/konfiguration/studioDaten.js</code>. Das Spiel übernimmt es beim nächsten Start (bitte <code>npm test</code> laufen lassen).<br /><br />Studio jetzt neu laden, damit alle Listen die Änderungen zeigen? (Offene Zonen werden vorher als Entwurf gesichert.)', { ja: 'Neu laden', nein: 'Später', icon: 'pruefen' })) {
    for (const [zid, z] of studio.dok.zonen) if (z.quelle !== 'vorlage' && z.karte.version !== z.gespeichertVersion) await studio.dok.speichereEntwurf(zid).catch(() => {});
    location.search = '?ohneStart=1';
  }
  void geaendert;
}

/** Kleine Texteingabe als Dialog (prompt() gibt es in Electron nicht) */
function prompt2(titel) {
  const feld = document.createElement('input');
  feld.className = 'feld';
  feld.style.width = '100%';
  return dialog({ titel, icon: 'plus', inhalt: feld, knoepfe: [{ text: 'Abbrechen', wert: null }, { text: 'OK', art: 'primaer', wert: () => feld.value.trim() }] });
}

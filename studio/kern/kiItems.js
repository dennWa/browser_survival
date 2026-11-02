import { GEGENSTAENDE } from '../../server/spiel/konfiguration/gegenstaende.js';
import { LOOT_TABELLEN } from '../../server/spiel/konfiguration/lootTabellen.js';
import { REZEPTE } from '../../server/spiel/konfiguration/rezepte.js';

/**
 * KI-/MCP-Werkzeuge für Items, Loot-Tabellen und Rezepte (Studio Phase 4.8) – Werkzeug-Liste: kiWerkzeuge.KI_ITEM_WERKZEUGE.
 * Wie der Item-Editor (oberflaeche/itemEditor.js) schreibt das NUR server/spiel/konfiguration/studioDaten.js (über die
 * handgeschriebenen Dateien gelegt; Projekt.speichereStudioDaten prüft IDs/Tabellen und erneuert die KI-Anleitung).
 * Wirkt im Spiel nach einem Neustart des Spiels; neue Items leihen sich ein vorhandenes Icon (icon_von).
 *   pruefeItemPatch / pruefeRezept – reine Prüfungen (Tests: tests/studio.test.js)
 */
export const ITEM_KATEGORIEN = Object.freeze(['nahrung', 'getraenk', 'medizin', 'nahkampf', 'fernkampf', 'wurf', 'munition', 'material', 'werkzeug', 'kleidung', 'rucksack', 'bauwerk', 'samen', 'mod']);
export const REZEPT_ORTE = Object.freeze(['', 'inventar', 'amboss', 'webstuhl', 'chemie', 'feuer']);
const ID = /^[a-z0-9_]{1,40}$/;
const GESCHUETZT = new Set(['stapelbar', 'inHand', 'ausruestung']);

const json = (t, was) => {
  if (t && typeof t === 'object') return t;
  try {
    return JSON.parse(String(t));
  } catch {
    throw new Error(`${was}: kein gültiges JSON`);
  }
};

export function pruefeItemPatch(id, felder, { neu = false, alleItems = GEGENSTAENDE } = {}) {
  if (!ID.test(id)) throw new Error('Item-ID nur a–z, 0–9, _');
  const f = json(felder, 'felder');
  if (!f || typeof f !== 'object' || Array.isArray(f)) throw new Error('felder muss ein Objekt sein');
  for (const k of Object.keys(f)) if (GESCHUETZT.has(k)) throw new Error(`Feld „${k}“ ist nicht bearbeitbar`);
  if ('kategorie' in f && !ITEM_KATEGORIEN.includes(f.kategorie)) throw new Error(`Kategorie: ${ITEM_KATEGORIEN.join(', ')}`);
  if (neu) {
    if (alleItems[id]) throw new Error(`„${id}“ gibt es schon – ohne neu=true ändern`);
    if (!f.name || !f.kategorie) throw new Error('Neues Item braucht name und kategorie');
  }
  for (const [k, v] of Object.entries(f)) if (typeof v === 'number' && !Number.isFinite(v)) throw new Error(`${k}: keine Zahl`);
  return f;
}

export function pruefeRezept(r, alleItems) {
  const x = json(r, 'rezept');
  if (!x.name || !x.ergebnis) throw new Error('Rezept braucht name und ergebnis');
  if (!alleItems[x.ergebnis]) throw new Error(`Ergebnis „${x.ergebnis}“ ist kein Item`);
  if (!x.zutaten || typeof x.zutaten !== 'object' || !Object.keys(x.zutaten).length) throw new Error('zutaten: { itemId: Menge }');
  for (const [z, n] of Object.entries(x.zutaten)) {
    if (!alleItems[z]) throw new Error(`Zutat „${z}“ ist kein Item`);
    if (!(Number(n) >= 1)) throw new Error(`Zutat ${z}: Menge ≥ 1`);
  }
  if (x.ort !== undefined && !REZEPT_ORTE.includes(x.ort)) throw new Error(`ort: ${REZEPT_ORTE.filter(Boolean).join(', ')} oder leer (Werkbank)`);
  if (x.ort === '') delete x.ort;
  return x;
}

export function kiItemWerkzeuge(studio) {
  const ok = (text, daten) => ({ ok: true, text, ...(daten !== undefined ? { daten } : {}) });
  const lade = () => studio.nativ.aufruf('projekt.studioDaten');
  const speichere = async (d) => {
    await studio.nativ.aufruf('projekt.speichereStudioDaten', { daten: d });
    return 'Gespeichert in studioDaten.js – wirkt nach Neustart des Spiels.';
  };
  const items = (d) => ({ ...GEGENSTAENDE, ...Object.fromEntries(Object.entries(d.gegenstaende).map(([id, f]) => [id, { ...(GEGENSTAENDE[id] ?? {}), ...f }])) });
  const tabellen = (d) => ({ ...LOOT_TABELLEN, ...d.lootTabellen });
  const rezepte = (d) => ({ ...REZEPTE, ...d.rezepte });

  return {
    items_liste: async ({ suche, kategorie }) => {
      const d = await lade();
      const s = String(suche ?? '').toLowerCase();
      const l = Object.entries(items(d))
        .filter(([id, i]) => (!kategorie || i.kategorie === kategorie) && (!s || `${id} ${i.name}`.toLowerCase().includes(s)))
        .map(([id, i]) => ({ id, name: i.name, kategorie: i.kategorie, ...(d.gegenstaende[id] ? { studio: GEGENSTAENDE[id] ? 'geändert' : 'neu' } : {}) }));
      return ok(`${l.length} Items`, l.slice(0, 300));
    },
    item_info: async ({ id }) => {
      const d = await lade();
      const i = items(d)[id];
      if (!i) throw new Error(`Item „${id}“ gibt es nicht (items_liste)`);
      const inTabellen = Object.entries(tabellen(d)).filter(([, t]) => t.some((e) => e.id === id)).map(([n, t]) => ({ tabelle: n, gewicht: t.find((e) => e.id === id).gewicht, anteilProzent: Math.round((t.find((e) => e.id === id).gewicht / t.reduce((s, e) => s + e.gewicht, 0)) * 1000) / 10 }));
      const inRezepten = Object.entries(rezepte(d)).filter(([, r]) => r.ergebnis === id || r.zutaten?.[id]).map(([rid, r]) => ({ id: rid, name: r.name, rolle: r.ergebnis === id ? 'ergebnis' : 'zutat' }));
      return ok(null, { id, ...i, studioGeaendert: d.gegenstaende[id] ?? null, icon: d.icons[id] ?? null, inTabellen, inRezepten });
    },
    item_setzen: async ({ id, felder, neu = false, icon_von }) => {
      const d = await lade();
      const f = pruefeItemPatch(id, felder, { neu, alleItems: items(d) });
      if (neu) {
        if (!icon_von) throw new Error('icon_von: vorhandenes Item, dessen Icon das neue Item leiht (z. B. konservendose)');
        if (!items(d)[icon_von]) throw new Error(`icon_von „${icon_von}“ ist kein Item`);
        d.icons[id] = d.icons[icon_von] ?? icon_von;
      } else if (!items(d)[id]) throw new Error(`Item „${id}“ gibt es nicht – neu=true für ein neues Item`);
      d.gegenstaende[id] = { ...(d.gegenstaende[id] ?? {}), ...f };
      return ok(`${neu ? 'Neues Item' : 'Item'} „${id}“: ${JSON.stringify(f)}. ${await speichere(d)}`);
    },
    item_zuruecksetzen: async ({ id }) => {
      const d = await lade();
      if (!d.gegenstaende[id]) return ok('Keine Studio-Änderungen an diesem Item.');
      delete d.gegenstaende[id];
      delete d.icons[id];
      return ok(`${GEGENSTAENDE[id] ? 'Studio-Änderungen verworfen' : 'Neues Item gelöscht'}: ${id}. ${await speichere(d)}`);
    },
    loot_tabellen: async ({ name }) => {
      const d = await lade();
      const t = tabellen(d);
      if (name) {
        if (!t[name]) throw new Error(`Tabelle „${name}“ gibt es nicht`);
        const summe = t[name].reduce((s, e) => s + e.gewicht, 0);
        return ok(null, t[name].map((e) => ({ ...e, prozent: Math.round((e.gewicht / summe) * 1000) / 10 })));
      }
      return ok(null, Object.entries(t).map(([n, l]) => ({ name: n, eintraege: l.length, ...(d.lootTabellen[n] ? { studio: true } : {}) })));
    },
    loot_eintrag: async ({ tabelle, item, gewicht }) => {
      const d = await lade();
      const alle = items(d);
      if (!alle[item]) throw new Error(`Item „${item}“ gibt es nicht`);
      if (!ID.test(tabelle)) throw new Error('Tabellenname nur a–z, 0–9, _');
      const t = [...(tabellen(d)[tabelle] ?? [])].filter((e) => e.id !== item);
      const g = Number(gewicht);
      if (g > 0) t.push({ id: item, gewicht: g });
      if (!t.length) throw new Error('Eine Tabelle braucht mindestens einen Eintrag');
      d.lootTabellen[tabelle] = t;
      return ok(`${tabelle}: ${g > 0 ? `${item} mit Gewicht ${g}` : `${item} entfernt`} (${t.length} Einträge). ${await speichere(d)}`);
    },
    rezepte_liste: async ({ suche }) => {
      const d = await lade();
      const s = String(suche ?? '').toLowerCase();
      return ok(null, Object.entries(rezepte(d)).filter(([id, r]) => !s || `${id} ${r.name} ${r.ergebnis}`.toLowerCase().includes(s)).map(([id, r]) => ({ id, ...r })).slice(0, 200));
    },
    rezept_setzen: async ({ id, rezept }) => {
      if (!ID.test(id)) throw new Error('Rezept-ID nur a–z, 0–9, _');
      const d = await lade();
      d.rezepte[id] = pruefeRezept(rezept, items(d));
      return ok(`Rezept „${id}“ gespeichert. ${await speichere(d)}`);
    },
  };
}

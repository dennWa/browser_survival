import { kopie } from './karte.js';

/**
 * Zonen-Manager (Editor 2.0, Schritt 6.1) – umgebungsfrei, getestet in tests/zonenManager.test.js.
 * Bereichs-Zonen einer Karte = alles mit Fläche bzw. Wirkungsbereich:
 *   Räume (alle Raumflächen eines Buchstabens = eine Zone, Schlüssel `raum|a`), Hasen-Bereiche, Übergänge, Klänge,
 *   Loot-Zonen (ab 6.2). Schlüssel sonst `<sammlung>|<id>`.
 * Anzeige je Zone (nur Editor, gespeichert in `karte.werte.zonenAnzeige[schl]` → Teil von Entwurf/Verlauf, nicht vom Spiel):
 *   { aus: true } ausgeblendet · { sperre: true } ausgegraut, nicht anklickbar, Änderungen ausgelassen · { farbe: '#rrggbb' }
 *   · { name } (nur für Zonen ohne eigenes Namensfeld, z. B. Hasen-Bereiche).
 * Ablage (Zwischenspeichern): `ablageEintrag` → JSON ohne Karte-IDs, `einsetzOps` setzt sie (auch in anderen Karten) wieder ein.
 * Alle Änderungen = Operationen → 1 Undo-Schritt je Aktion.
 */
export const ZONEN_ARTEN = Object.freeze([
  { art: 'raum', sammlung: 'raumFlaechen', name: 'Räume', symbol: '🚪', farbe: '#ffb84d' },
  { art: 'loot', sammlung: 'lootZonen', name: 'Loot-Zonen', symbol: '🎁', farbe: '#ffd23f' },
  { art: 'tier', sammlung: 'tierBereiche', name: 'Tier-Bereiche', symbol: '🐇', farbe: '#c8a27a' },
  { art: 'klang', sammlung: 'klaenge', name: 'Klänge', symbol: '🔊', farbe: '#7fd6ff' },
  { art: 'uebergang', sammlung: 'uebergaenge', name: 'Übergänge', symbol: '🔀', farbe: '#2b8cff' },
]);
const ART_VON_SAMMLUNG = Object.fromEntries(ZONEN_ARTEN.map((a) => [a.sammlung, a]));
const FARBE = /^#[0-9a-f]{6}$/i;

/** Zonen-Schlüssel eines Sammlungs-Eintrags (Raumflächen → ihr Raum) oder null */
export function zonenSchluessel(karte, s, k) {
  if (s === 'raumFlaechen') {
    const r = karte.s('raumFlaechen').get(k);
    return r ? `raum|${r.raum}` : null;
  }
  return ART_VON_SAMMLUNG[s] && karte.sammlungen[s] ? `${s}|${k}` : null;
}

/** Anzeige-Zustand einer Zone (Schlüssel) */
export function anzeige(karte, schl) {
  const a = karte.werte.zonenAnzeige?.[schl];
  return { aus: !!a?.aus, sperre: !!a?.sperre, farbe: a?.farbe && FARBE.test(a.farbe) ? a.farbe : null, name: typeof a?.name === 'string' ? a.name : null };
}

/** Anzeige-Zustand eines Sammlungs-Eintrags (für Zeichnen/Treffer) – Einträge ohne Zone: alles an */
export function eintragAnzeige(karte, s, k) {
  const schl = zonenSchluessel(karte, s, k);
  return schl ? anzeige(karte, schl) : { aus: false, sperre: false, farbe: null, name: null };
}

/** Umschließendes Rechteck (Kacheln) einer Zone */
function rechteckVon(liste) {
  const x0 = Math.min(...liste.map((r) => r.x));
  const y0 = Math.min(...liste.map((r) => r.y));
  const x1 = Math.max(...liste.map((r) => r.x + (r.b ?? 0)));
  const y1 = Math.max(...liste.map((r) => r.y + (r.h ?? 0)));
  return { x: x0, y: y0, b: x1 - x0, h: y1 - y0 };
}

function klangRechteck(c) {
  if (c.art === 'bereich') return { x: c.x, y: c.y, b: c.b, h: c.h };
  if (c.art === 'punkt') return { x: c.x - c.aussen, y: c.y - c.aussen, b: c.aussen * 2, h: c.aussen * 2 };
  return null;
}

/**
 * Alle Bereichs-Zonen der Karte, gruppiert nach ZONEN_ARTEN-Reihenfolge.
 * @returns [{ schl, art, sammlung, keys: [id], name, symbol, farbe, rechteck|null, anzeige, info }]
 */
export function bereichsZonen(karte) {
  const liste = [];
  const art = (a) => ZONEN_ARTEN.find((x) => x.art === a);
  // Räume: Flächen je Buchstabe
  const raeume = new Map();
  for (const [id, r] of karte.s('raumFlaechen')) {
    if (!raeume.has(r.raum)) raeume.set(r.raum, []);
    raeume.get(r.raum).push([id, r]);
  }
  for (const [raum, flaechen] of [...raeume].sort(([a], [b]) => a.localeCompare(b))) {
    const schl = `raum|${raum}`;
    const def = karte.s('raeume').get(raum);
    const a = anzeige(karte, schl);
    const flaeche = flaechen.reduce((n, [, r]) => n + r.b * r.h, 0);
    liste.push({ schl, art: 'raum', sammlung: 'raumFlaechen', keys: flaechen.map(([id]) => id), name: `${raum}: ${def?.name ?? '?'}`, symbol: art('raum').symbol, farbe: a.farbe ?? art('raum').farbe, rechteck: rechteckVon(flaechen.map(([, r]) => r)), anzeige: a, info: `${flaeche} Kacheln · ${def?.lootTabelle ?? 'ohne Loot-Tabelle'}` });
  }
  for (const za of ZONEN_ARTEN) {
    if (za.art === 'raum' || !karte.sammlungen[za.sammlung]) continue;
    for (const [id, e] of karte.s(za.sammlung)) {
      const schl = `${za.sammlung}|${id}`;
      const a = anzeige(karte, schl);
      let name;
      let info = '';
      let rechteck = { x: e.x, y: e.y, b: e.b, h: e.h };
      if (za.art === 'tier') {
        name = a.name ?? `Hasen-Bereich ${id}`;
        info = `${e.anzahl ?? '?'} Hasen · ${e.b} × ${e.h}`;
      } else if (za.art === 'uebergang') {
        name = e.name || `Übergang → ${e.ziel || '?'}`;
        info = `→ ${e.ziel || '?'} (${e.ankunft || '?'})`;
      } else if (za.art === 'klang') {
        name = e.name || `Klang ${id}`;
        info = { punkt: `Punkt · Hörweite ${e.aussen}`, bereich: `Ambiente · ${e.b} × ${e.h}`, global: 'Global (ganze Zone)' }[e.art] ?? '';
        rechteck = klangRechteck(e);
      } else {
        name = e.name || `${za.name} ${id}`;
        info = e.b ? `${e.b} × ${e.h}` : '';
      }
      liste.push({ schl, art: za.art, sammlung: za.sammlung, keys: [id], name, symbol: za.symbol, farbe: a.farbe ?? za.farbe, rechteck, anzeige: a, info });
    }
  }
  return liste;
}

/** Op: Anzeige einer Zone ändern (felder: aus/sperre/farbe/name; null/false = Standard) */
export function anzeigeOps(karte, schl, felder) {
  const alt = karte.werte.zonenAnzeige?.[schl] ?? {};
  const neu = { ...alt };
  for (const [f, w] of Object.entries(felder)) {
    if (w === null || w === false || w === '' || w === undefined) delete neu[f];
    else neu[f] = w;
  }
  return [{ s: 'wert', pfad: `zonenAnzeige.${schl}`, neu: Object.keys(neu).length ? neu : undefined }];
}

/** Ops: Zone umbenennen (Raum → Raum-Definition, Übergang/Klang → Feld name, sonst Anzeige-Name) */
export function umbenennenOps(karte, zone, name) {
  const n = String(name ?? '').trim().slice(0, 60);
  if (!n) return [];
  if (zone.art === 'raum') {
    const raum = zone.schl.slice(5);
    const def = karte.s('raeume').get(raum);
    return def ? [{ s: 'raeume', k: raum, neu: { ...def, name: n } }] : [];
  }
  if (zone.art === 'uebergang' || zone.art === 'klang' || zone.art === 'loot') return [{ s: zone.sammlung, k: zone.keys[0], neu: { ...karte.s(zone.sammlung).get(zone.keys[0]), name: n } }];
  return anzeigeOps(karte, zone.schl, { name: n });
}

/** Ops: Zone löschen (Raum: nur die Flächen – Raum-Definition/Loot-Tabelle bleibt im Reiter „Räume“) + ihre Anzeige */
export function zoneLoeschOps(karte, zone) {
  const ops = zone.keys.map((k) => ({ s: zone.sammlung, k, neu: null }));
  if (karte.werte.zonenAnzeige?.[zone.schl]) ops.push({ s: 'wert', pfad: `zonenAnzeige.${zone.schl}`, neu: undefined });
  return ops;
}

/** Zone als Ablage-Eintrag (ohne IDs, Koordinaten relativ zur linken oberen Ecke) – für „Zwischenspeichern“ */
export function ablageEintrag(karte, zone) {
  const r = zone.rechteck ?? { x: 0, y: 0, b: 0, h: 0 };
  const rel = (e) => ({ ...kopie(e), x: Math.round((e.x - r.x) * 1000) / 1000, y: Math.round((e.y - r.y) * 1000) / 1000 });
  const basis = { format: 'browser-survival-zone', formatVersion: 1, art: zone.art, name: zone.name, b: r.b, h: r.h, x: r.x, y: r.y, farbe: zone.anzeige.farbe };
  if (zone.art === 'raum') {
    const raum = zone.schl.slice(5);
    return { ...basis, raum: kopie(karte.s('raeume').get(raum) ?? { name: zone.name, lootTabelle: 'wohnhaus' }), buchstabe: raum, flaechen: zone.keys.map((k) => rel(karte.s('raumFlaechen').get(k))) };
  }
  const e = karte.s(zone.sammlung).get(zone.keys[0]);
  return { ...basis, sammlung: zone.sammlung, eintrag: e.art === 'global' ? kopie(e) : rel(e) };
}

/**
 * Ablage-Eintrag in eine Karte einsetzen. Position: (x, y) = linke obere Ecke (Standard: wie gespeichert), in die Zone
 * geschoben. Raum: gleicher Raum (Name + Tabelle) wird wiederverwendet, sonst neuer Buchstabe.
 * @returns { ops, auswahl: [{ s, k }] } oder { ops: [], grund }
 */
export function einsetzOps(karte, ablage, x = ablage.x, y = ablage.y) {
  if (!ablage || ablage.format !== 'browser-survival-zone') return { ops: [], grund: 'Kein Zonen-Eintrag' };
  const b = Math.min(ablage.b, karte.breite);
  const h = Math.min(ablage.h, karte.hoehe);
  const ox = Math.max(0, Math.min(karte.breite - b, Math.round(x)));
  const oy = Math.max(0, Math.min(karte.hoehe - h, Math.round(y)));
  let id = karte.naechsteId;
  const ops = [];
  const auswahl = [];
  const passt = (e) => e.x >= 0 && e.y >= 0 && e.x + (e.b ?? 0) <= karte.breite && e.y + (e.h ?? 0) <= karte.hoehe;
  if (ablage.art === 'raum') {
    const vorhanden = [...karte.s('raeume')].find(([, r]) => r.name === ablage.raum.name && r.lootTabelle === ablage.raum.lootTabelle)?.[0];
    let raum = vorhanden;
    if (!raum) {
      raum = [...'abcdefghijklmnopqrstuvwxyz'].find((c) => !karte.s('raeume').has(c));
      if (!raum) return { ops: [], grund: 'Alle 26 Raum-Buchstaben sind belegt' };
      ops.push({ s: 'raeume', k: raum, neu: kopie(ablage.raum) });
    }
    for (const f of ablage.flaechen) {
      const neu = { ...f, raum, x: f.x + ox, y: f.y + oy };
      if (!passt(neu)) continue;
      ops.push({ s: 'raumFlaechen', k: id, neu });
      auswahl.push({ s: 'raumFlaechen', k: id++ });
    }
    if (!auswahl.length) return { ops: [], grund: 'Raum passt nicht in die Zone' };
    return { ops, auswahl };
  }
  if (!ablage.sammlung || !karte.sammlungen[ablage.sammlung]) return { ops: [], grund: `Unbekannte Zonen-Art „${ablage.art}“` };
  const e = kopie(ablage.eintrag);
  if (!(ablage.sammlung === 'klaenge' && e.art === 'global')) {
    e.x += ox;
    e.y += oy;
    if (ablage.sammlung === 'klaenge' && e.art === 'punkt') {
      e.x = Math.min(karte.breite, e.x);
      e.y = Math.min(karte.hoehe, e.y);
    } else if (!passt(e)) return { ops: [], grund: 'Passt nicht in die Zone' };
  }
  ops.push({ s: ablage.sammlung, k: id, neu: e });
  if (ablage.farbe) ops.push(...anzeigeOps(karte, `${ablage.sammlung}|${id}`, { farbe: ablage.farbe }));
  return { ops, auswahl: [{ s: ablage.sammlung, k: id }] };
}

/** Ops auf gesperrten Zonen herausfiltern (Anzeige-Ops selbst bleiben erlaubt). @returns { ops, ausgelassen } */
export function filtereGesperrteZonen(karte, ops) {
  if (!karte?.werte.zonenAnzeige) return { ops, ausgelassen: 0 };
  let ausgelassen = 0;
  const frei = ops.filter((op) => {
    if (op.s === 'wert' || !ART_VON_SAMMLUNG[op.s]) return true;
    const vorher = karte.s(op.s).get(op.k);
    const schl = op.s === 'raumFlaechen' ? (vorher ?? op.neu) && `raum|${(vorher ?? op.neu).raum}` : `${op.s}|${op.k}`;
    if (schl && anzeige(karte, schl).sperre && vorher) {
      ausgelassen++;
      return false;
    }
    return true;
  });
  return { ops: frei, ausgelassen };
}

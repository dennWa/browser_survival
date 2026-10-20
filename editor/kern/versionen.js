import { EditorKarte, SAMMLUNGEN, kopie } from './karte.js';
import { rahmenVon } from './anordnen.js';

/**
 * Versionskontrolle (Editor 2.0, Schritt 7.5) – umgebungsfrei, getestet in tests/versionen.test.js.
 * Version = benannter Schnappschuss einer Zone: { id, name, art: 'manuell'|'export'|'veroeffentlichen'|'wiederherstellung', zeit, karte: alsJson }.
 *   neueVersion(karte, { name, art, zeit })   Schnappschuss (tiefe Kopie)
 *   fuegeHinzu(liste, version, { maxAuto })   neue Liste: neueste zuerst, automatische (nicht 'manuell') auf maxAuto begrenzt
 *   vergleiche(alt, neu)                      Diff zweier Karten (EditorKarte oder alsJson): Kacheln, Höhen, Größe, je Sammlung
 *                                             neu/weg/geaendert, Werte (oberste Schlüssel) + `zusammenfassung` (Textzeilen),
 *                                             `markierungen` [{ x, y, b, h, art: 'neu'|'weg'|'geaendert' }] für die Karte
 *   wiederherstellenOps(aktuell, ziel)        Ops, die die aktuelle Karte in den Stand `ziel` bringen (1 Undo-Schritt beim Aufrufer)
 *   letzteExportVersion(liste)                jüngste Version mit art export/veroeffentlichen (Änderungen seit dem letzten Export)
 */
const ALS_KARTE = (k) => (k instanceof EditorKarte ? k : EditorKarte.ausJson(k));
const gleich = (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b);
const NAMEN = { objekte: 'Objekte', uebergaenge: 'Übergänge', bauwerke: 'Bauwerke', tierBereiche: 'Tier-Bereiche', raumFlaechen: 'Raumflächen', marker: 'Marker', raeume: 'Räume', ankuenfte: 'Ankünfte', typen: 'eigene Typen', texturen: 'Texturen', bemalung: 'Bemalung', klaenge: 'Klänge', lootZonen: 'Loot-Zonen' };

export function neueVersion(karte, { name = '', art = 'manuell', zeit = new Date().toISOString() } = {}) {
  return { id: `${zeit}-${Math.random().toString(36).slice(2, 7)}`, name: name || (art === 'manuell' ? 'Version' : art), art, zeit, karte: kopie(karte.alsJson()) };
}

export function fuegeHinzu(liste, version, { maxAuto = 20 } = {}) {
  const neu = [version, ...liste];
  let auto = 0;
  return neu.filter((v) => v.art === 'manuell' || ++auto <= maxAuto);
}

export function letzteExportVersion(liste) {
  return liste.find((v) => v.art === 'export' || v.art === 'veroeffentlichen') ?? null;
}

export function vergleiche(altK, neuK) {
  const a = ALS_KARTE(altK);
  const n = ALS_KARTE(neuK);
  const d = { groesse: a.breite !== n.breite || a.hoehe !== n.hoehe, kacheln: 0, hoehen: 0, sammlungen: {}, werte: [], markierungen: [], zusammenfassung: [] };
  if (d.groesse) {
    d.zusammenfassung.push(`Größe ${a.breite} × ${a.hoehe} → ${n.breite} × ${n.hoehe}`);
    d.markierungen.push({ x: 0, y: 0, b: n.breite, h: n.hoehe, art: 'geaendert' });
  } else {
    for (let i = 0; i < n.zellen.length; i++) {
      const k = a.zellen[i] !== n.zellen[i];
      const h = a.hoehen[i] !== n.hoehen[i];
      if (k) d.kacheln++;
      if (h) d.hoehen++;
      if (k || h) d.markierungen.push({ x: i % n.breite, y: Math.floor(i / n.breite), b: 1, h: 1, art: 'geaendert' });
    }
    if (d.kacheln) d.zusammenfassung.push(`${d.kacheln} Kacheln geändert`);
    if (d.hoehen) d.zusammenfassung.push(`${d.hoehen} Geländehöhen geändert`);
  }
  for (const s of SAMMLUNGEN) {
    const ma = a.sammlungen[s];
    const mn = n.sammlungen[s];
    const e = { neu: [], weg: [], geaendert: [] };
    for (const [k, w] of mn) if (!ma.has(k)) e.neu.push(k);
    else if (!gleich(ma.get(k), w)) e.geaendert.push(k);
    for (const k of ma.keys()) if (!mn.has(k)) e.weg.push(k);
    if (!e.neu.length && !e.weg.length && !e.geaendert.length) continue;
    d.sammlungen[s] = e;
    const teile = [e.neu.length && `+${e.neu.length}`, e.weg.length && `−${e.weg.length}`, e.geaendert.length && `~${e.geaendert.length}`].filter(Boolean);
    d.zusammenfassung.push(`${NAMEN[s] ?? s}: ${teile.join(' ')}`);
    const markiere = (k, w, art) => {
      const r = rahmenVon(s, k, w);
      if (r) d.markierungen.push({ x: r.x, y: r.y, b: Math.max(r.b, 0.5), h: Math.max(r.h, 0.5), art });
    };
    for (const k of e.neu) markiere(k, mn.get(k), 'neu');
    for (const k of e.weg) markiere(k, ma.get(k), 'weg');
    for (const k of e.geaendert) markiere(k, mn.get(k), 'geaendert');
  }
  for (const k of new Set([...Object.keys(a.werte), ...Object.keys(n.werte)])) if (k !== 'id' && !gleich(a.werte[k], n.werte[k])) d.werte.push(k);
  if (d.werte.length) d.zusammenfassung.push(`Einstellungen: ${d.werte.join(', ')}`);
  d.anzahl = d.zusammenfassung.length;
  return d;
}

export function wiederherstellenOps(aktuell, zielJson) {
  const z = ALS_KARTE(zielJson);
  const ops = [];
  if (aktuell.breite !== z.breite || aktuell.hoehe !== z.hoehe) ops.push({ s: 'raster', neu: { breite: z.breite, hoehe: z.hoehe, zellen: z.zellen.join(''), hoehen: [...z.hoehen] } });
  else
    for (let i = 0; i < z.zellen.length; i++) {
      if (aktuell.zellen[i] !== z.zellen[i]) ops.push({ s: 'kachel', i, neu: z.zellen[i] });
      if (aktuell.hoehen[i] !== z.hoehen[i]) ops.push({ s: 'hoehe', i, neu: z.hoehen[i] });
    }
  for (const s of SAMMLUNGEN) {
    const ma = aktuell.s(s);
    const mz = z.sammlungen[s];
    for (const k of ma.keys()) if (!mz.has(k)) ops.push({ s, k, neu: null });
    for (const [k, w] of mz) if (!gleich(ma.get(k), w)) ops.push({ s, k, neu: kopie(w) });
  }
  for (const k of new Set([...Object.keys(aktuell.werte), ...Object.keys(z.werte)])) if (k !== 'id' && !gleich(aktuell.werte[k], z.werte[k])) ops.push({ s: 'wert', pfad: k, neu: kopie(z.werte[k]) });
  return ops;
}

/**
 * Map-Editor 2.0, Phase 1 (Kern, umgebungsfrei): Bearbeiten gewählter Elemente (verschieben/drehen/duplizieren) mit
 * Raster- und Randregeln. Weitere Phase-1-Kerne (Backup, Gruppen, Befehls-Kürzel) kommen hier dazu.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EditorKarte, markerSchluessel } from '../editor/kern/karte.js';
import { verschiebeOps, dreheObjekt, dreheOps, dupliziereOps, ueberstand } from '../editor/kern/bearbeiten.js';
import { dreheVorlage } from '../editor/kern/auswahl.js';

const karte = () => new EditorKarte({ id: 't', breite: 20, hoehe: 15 });
const gewaehlt = (k, ...eintraege) => eintraege.map(([s, schl]) => ({ s, k: schl, wert: k.s(s).get(schl) }));

test('Verschieben: Objekte nicht über den Rand (Kronen höchstens halb), Marker in der Zone, Grund wird gemeldet', () => {
  const k = karte();
  k.anwenden([
    { s: 'objekte', k: 1, neu: { typ: 'tisch', x: 17, y: 3, b: 2, h: 1, blockiert: true } },
    { s: 'objekte', k: 2, neu: { typ: 'baum', x: 16, y: 5, b: 3.5, h: 3.5, ebene: 'oben' } },
    { s: 'marker', k: markerSchluessel(19, 14), neu: { art: 'start' } },
  ]);
  const ok = verschiebeOps(k, gewaehlt(k, ['objekte', 1]), 1, 0);
  assert.ok(ok.ops, 'bis an den Rand geht');
  k.anwenden(ok.ops);
  assert.equal(k.s('objekte').get(1).x, 18);
  const raus = verschiebeOps(k, gewaehlt(k, ['objekte', 1]), 1, 0);
  assert.equal(raus.ops, null);
  assert.match(raus.grund, /Rand/);
  // Krone darf halb überstehen, nicht mehr
  assert.ok(verschiebeOps(k, gewaehlt(k, ['objekte', 2]), 2, 0).ops);
  assert.equal(verschiebeOps(k, gewaehlt(k, ['objekte', 2]), 3, 0).ops, null);
  // Marker am Rand
  assert.equal(verschiebeOps(k, gewaehlt(k, ['marker', '19,14']), 1, 0).ops, null);
  // Altlast: schon überstehendes Objekt darf zurück in die Zone
  k.anwenden([{ s: 'objekte', k: 3, neu: { typ: 'sofa', x: 19, y: 0, b: 3, h: 1 } }]);
  assert.ok(ueberstand(k, k.s('objekte').get(3)) > 0);
  assert.ok(verschiebeOps(k, gewaehlt(k, ['objekte', 3]), -1, 0).ops);
  assert.equal(verschiebeOps(k, gewaehlt(k, ['objekte', 3]), 1, 0).ops, null);
});

test('Drehen: bleibt im Raster (kein halber Versatz), viermal drehen = Ausgangslage, nicht über den Rand', () => {
  const k = karte();
  let o = { typ: 'tisch', x: 17, y: 12, b: 2, h: 1, blockiert: true };
  const start = { ...o };
  for (let i = 0; i < 4; i++) {
    o = dreheObjekt(k, o);
    assert.ok(Number.isInteger(o.x) && Number.isInteger(o.y), `Raster nach ${i + 1}. Drehung: ${o.x}|${o.y}`);
    assert.ok(o.x + o.b <= k.breite && o.y + o.h <= k.hoehe, 'in der Zone');
  }
  assert.deepEqual(o, start);
  // 3×1 dreht sauber um die Mitte
  const lang = dreheObjekt(k, { typ: 'sofa', x: 5, y: 5, b: 3, h: 1 });
  assert.deepEqual([lang.x, lang.y, lang.b, lang.h, lang.drehung], [6, 4, 1, 3, 90]);
  // am Rand wird hineingeschoben
  const rand = dreheObjekt(k, { typ: 'sofa', x: 0, y: 14, b: 3, h: 1 });
  assert.ok(rand.y + rand.h <= k.hoehe && rand.y >= 0);
  // Mischauswahl: Marker werden gezählt, nicht gedreht
  k.anwenden([{ s: 'objekte', k: 1, neu: start }, { s: 'marker', k: '1,1', neu: { art: 'start' } }, { s: 'bauwerke', k: 2, neu: { typ: 'holztuer', tx: 3, ty: 3 } }]);
  const { ops, uebersprungen } = dreheOps(k, gewaehlt(k, ['objekte', 1], ['marker', '1,1'], ['bauwerke', 2]));
  assert.equal(ops.length, 2);
  assert.equal(uebersprungen, 1);
  assert.equal(ops[1].neu.drehung, 1);
});

test('Duplizieren: Objekte versetzt (am Rand nach innen), Marker auf freie Nachbarkachel, Ankünfte mit neuem Namen', () => {
  const k = karte();
  k.anwenden([
    { s: 'objekte', k: 1, neu: { typ: 'tisch', x: 18, y: 14, b: 2, h: 1 } },
    { s: 'marker', k: '5,5', neu: { art: 'zombie', anzahl: 2 } },
    { s: 'marker', k: '6,6', neu: { art: 'start' } },
    { s: 'ankuenfte', k: 'nord', neu: { x: 2, y: 0 } },
  ]);
  const { ops, neueAuswahl, uebersprungen } = dupliziereOps(k, gewaehlt(k, ['objekte', 1], ['marker', '5,5'], ['ankuenfte', 'nord']));
  assert.equal(uebersprungen, 0);
  k.anwenden(ops);
  const kopie = k.s('objekte').get(neueAuswahl[0].k);
  assert.deepEqual([kopie.x, kopie.y], [17, 13], 'am rechten/unteren Rand nach innen versetzt');
  // 6,6 ist belegt → nächste freie Nachbarkachel
  assert.equal(neueAuswahl[1].s, 'marker');
  assert.notEqual(neueAuswahl[1].k, '6,6');
  assert.deepEqual(k.s('marker').get(neueAuswahl[1].k), { art: 'zombie', anzahl: 2 });
  assert.ok(k.s('ankuenfte').has('nord2'));
});

test('Prefab drehen: Tür-/Fenster-Bauwerke kippen ihre Ausrichtung auch ohne gesetztes Feld', () => {
  const v = dreheVorlage({ b: 2, h: 1, zellen: [',', ','], hoehen: null, bauwerke: [{ typ: 'holztuer', tx: 0, ty: 0 }, { typ: 'holztuer', tx: 1, ty: 0, drehung: 1 }] });
  assert.equal(v.bauwerke[0].drehung, 1);
  assert.equal(v.bauwerke[1].drehung, 0);
});

// --- Editor 2.0, Schritt 1.2–1.4: Ebenen, Gruppen, Tastenkürzel --------------------------------
import { EBENEN, ANZEIGEN, ebeneVon, ebenenAus, filtereGesperrt, standardEbenen } from '../editor/kern/ebenen.js';
import { GRUPPEN, KATEGORIEN, gruppeVon, passtZurSuche, katalog } from '../editor/kern/katalog.js';
import { SAMMLUNGEN } from '../editor/kern/karte.js';
import { tastenKuerzel, Befehle } from '../editor/ui/befehle.js';

test('Ebenen: jede Kartenänderung hat eine Ebene, gesperrte Ebenen werden ausgelassen, Speicherstand robust', () => {
  for (const s of ['kachel', 'hoehe', ...SAMMLUNGEN.filter((x) => !['raeume', 'typen', 'texturen'].includes(x))]) assert.ok(ebeneVon(s), `Ebene für ${s}`);
  for (const s of ['raeume', 'typen', 'texturen', 'wert', 'raster']) assert.equal(ebeneVon(s), null, `${s} ist immer änderbar`);
  const e = standardEbenen();
  e.objekte.gesperrt = true;
  e.marker.sichtbar = false;
  const { ops, ausgelassen } = filtereGesperrt(e, [{ s: 'objekte', k: 1, neu: null }, { s: 'kachel', i: 0, neu: '#' }, { s: 'ankuenfte', k: 'nord', neu: null }, { s: 'wert', pfad: 'name', neu: 'x' }]);
  assert.deepEqual(ops.map((o) => o.s), ['kachel', 'wert']);
  assert.deepEqual(ausgelassen, { objekte: 1, marker: 1 });
  // Gespeichertes mit Müll → Standard
  const g = ebenenAus({ objekte: { sichtbar: false, gesperrt: 'ja' }, raster: { sichtbar: false, gesperrt: true }, quatsch: {} });
  assert.equal(g.objekte.sichtbar, false);
  assert.equal(g.objekte.gesperrt, false);
  assert.equal(g.raster.sichtbar, false);
  assert.equal('gesperrt' in g.raster, false, 'Anzeigen sind nicht sperrbar');
  assert.equal(Object.keys(g).length, EBENEN.length + ANZEIGEN.length);
});

test('Asset-Gruppen: jede Kategorie in genau einer Gruppe, Suche ohne Umlaute', () => {
  for (const k of KATEGORIEN) assert.equal(GRUPPEN.filter((g) => g.kategorien.includes(k)).length, 1, k);
  assert.equal(gruppeVon('Unbekannt').name, 'Eigene');
  const tisch = katalog().find((e) => e.id === 'objekt:tisch');
  assert.ok(passtZurSuche(tisch, 'TISCH'));
  assert.ok(passtZurSuche(tisch, 'einrichtung tisch'), 'Gruppenname zählt');
  const kueche = katalog().find((e) => e.typ === 'kueche_herd');
  assert.ok(passtZurSuche(kueche, 'herd'));
  assert.ok(passtZurSuche(katalog().find((e) => e.name.startsWith('Böden') || e.kategorie === 'Böden'), 'boeden'), 'ö = oe');
  assert.ok(!passtZurSuche(tisch, 'auto'));
});

test('Tastenkürzel: Schreibweise, Umschalt nur bei Buchstaben, AltGr-Zeichen, Befehlsregister', () => {
  const t = (key, extra = {}) => tastenKuerzel({ key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, code: '', ...extra });
  assert.equal(t('z', { ctrlKey: true }), 'Strg+Z');
  assert.equal(t('Z', { ctrlKey: true, shiftKey: true }), 'Strg+Umschalt+Z');
  assert.equal(t('z', { metaKey: true }), 'Strg+Z', '⌘ = Strg');
  assert.equal(t('?', { shiftKey: true }), '?', 'Umschalt steckt im Zeichen');
  assert.equal(t('ArrowLeft', { shiftKey: true }), 'Umschalt+Links');
  assert.equal(t('Delete'), 'Entf');
  assert.equal(t('['), '[');
  assert.equal(t('[', { ctrlKey: true, altKey: true, getModifierState: (m) => m === 'AltGraph' }), '[', 'AltGr+8 auf deutscher Tastatur');
  assert.equal(t('Shift', { shiftKey: true }), null);
  const befehle = new Befehle();
  let n = 0;
  let gesperrt = false;
  befehle.registriere({ id: 'x.a', name: 'A', kuerzel: ['Strg+S'], inEingabe: true, ausfuehren: () => n++ }, { id: 'x.b', name: 'B', kuerzel: ['V'], verfuegbar: () => !gesperrt, ausfuehren: () => (n += 10) });
  const ev = (key, extra = {}) => ({ key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, preventDefault() {}, ...extra });
  assert.ok(befehle.behandleTaste(ev('s', { ctrlKey: true }), { inEingabe: true }));
  assert.ok(!befehle.behandleTaste(ev('v'), { inEingabe: true }), 'Werkzeug-Tasten nicht beim Tippen');
  assert.ok(befehle.behandleTaste(ev('v')));
  gesperrt = true;
  befehle.behandleTaste(ev('v'));
  assert.equal(n, 11);
});

// --- Editor 2.0, Schritt 1.6: Komplett-Backup ------------------------------------------------
import { baueBackup, leseBackup, backupDateiname, groesseText, BACKUP_FORMAT } from '../editor/kern/backup.js';
import { entwurfJson } from '../editor/kern/format.js';
import { Verlauf } from '../editor/kern/verlauf.js';
import { neueZone } from '../editor/kern/zone.js';

test('Backup: Rundreise aller Entwürfe (mit Verlauf), Prefabs, Anordnung – Gemini-Schlüssel kommt nie hinein', () => {
  const a = neueZone({ id: 'alpha', name: 'Alpha', breite: 10, hoehe: 8 });
  const va = new Verlauf();
  va.ausfuehren(a, 'Tisch', [{ s: 'objekte', k: 1, neu: { typ: 'tisch', x: 1, y: 1, b: 2, h: 1 } }]);
  const b = neueZone({ id: 'beta', name: 'Beta', breite: 6, hoehe: 6 });
  const prefab = { b: 1, h: 1, zellen: ['#'], objekte: [] };
  const daten = baueBackup({
    entwuerfe: [{ id: 'alpha', entwurf: entwurfJson(a, va) }, { id: 'beta', entwurf: entwurfJson(b, new Verlauf()) }],
    prefabs: { Mauer: prefab },
    meta: { layout: { alpha: { x: 0, y: 0 }, beta: { x: 10, y: 0 } }, aktiv: 'beta' },
    einstellungen: { 'browserSurvival.editorEbenen': { raster: { sichtbar: false } }, 'browserSurvival.editorGemini': { schluessel: 'GEHEIM' } },
  });
  const text = JSON.stringify(daten);
  assert.equal(daten.format, BACKUP_FORMAT);
  assert.ok(!text.includes('GEHEIM') && !text.includes('editorGemini'), 'kein API-Schlüssel im Backup');
  const g = leseBackup(text);
  assert.deepEqual(g.entwuerfe.map((e) => e.id), ['alpha', 'beta']);
  assert.equal(g.entwuerfe[0].karte.s('objekte').get(1).typ, 'tisch');
  assert.equal(g.entwuerfe[0].verlauf.zurueck.length, 1, 'Verlauf kommt mit');
  assert.deepEqual(g.prefabs.Mauer, prefab);
  assert.equal(g.meta.aktiv, 'beta');
  assert.deepEqual(Object.keys(g.einstellungen), ['browserSurvival.editorEbenen']);
});

test('Backup: kaputte Einträge werden gemeldet statt alles abzulehnen; fremde Dateien/zu neue Versionen abgelehnt', () => {
  const ok = entwurfJson(neueZone({ id: 'gut', name: 'Gut', breite: 5, hoehe: 5 }), new Verlauf());
  const g = leseBackup({ format: BACKUP_FORMAT, formatVersion: 1, entwuerfe: [{ id: 'gut', entwurf: ok }, { id: 'kaputt', entwurf: { format: 'browser-survival-entwurf', karte: { breite: 3, hoehe: 3, zellen: 'zu kurz' } } }], prefabs: { schlecht: { b: 0 } } });
  assert.deepEqual(g.entwuerfe.map((e) => e.id), ['gut']);
  assert.equal(g.fehlerhaft[0].id, 'kaputt');
  assert.deepEqual(g.prefabs, {});
  assert.throws(() => leseBackup('{"format":"browser-survival-entwurf"}'), /kein Editor-Backup/);
  assert.throws(() => leseBackup({ format: BACKUP_FORMAT, formatVersion: 99 }), /neuer/);
  assert.throws(() => leseBackup('kein json'), /JSON/);
  assert.match(backupDateiname(new Date(2026, 9, 19, 14, 5)), /^editor-backup-2026-10-19-1405\.json$/);
  assert.equal(groesseText(1536), '1,5 KB');
});

/** Editor 2.0, Schritt 8.2: Auto-Fix – je eindeutigem Prüfungsfall ein Test, „Alle beheben“ als ein Satz ops */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ausDefinition } from '../editor/kern/format.js';
import { markerSchluessel } from '../editor/kern/karte.js';
import { validiere } from '../editor/kern/validierung.js';
import { fixFuer, fixeAlle, istBehebbar } from '../editor/kern/autoFix.js';

// 20 × 10, Haus links oben (Innenboden '.', Tür T), Start S
const KACHELN = [
  ',,,,,,,,,,,,,,,,,,,,',
  ',#####,,,,,,,,,,,,,,',
  ',#...#,,,,,,,,,,,,,,',
  ',#...#,,,,S,,,,,,,,,',
  ',##T##,,,,,,,,,,,,,,',
  ',,,,,,,,,,,,,,,,,,,,',
  ',,,,,,,,,,,,,,,,,,,,',
  ',,,,,,,,,,,,,,,,,,,,',
  ',,,,,,,,,,,,,,,,,,,,',
  ',,,,,,,,,,,,,,,,,,,,',
];
const neu = (extra = {}) => ausDefinition({ id: 'af', name: 'AutoFix', kacheln: KACHELN, raeume: { a: { name: 'Hütte', lootTabelle: 'huette' } }, objekte: [], ...extra }).karte;
const eintrag = (k, code) => validiere(k, { mitErreichbarkeit: false }).find((e) => e.code === code);
const anwenden = (k, fix) => k.anwenden(fix.ops.map((o) => ({ ...o })));

test('Übergang an den nächsten Rand', () => {
  const k = neu({ uebergaenge: [{ x: 17, y: 4, b: 1, h: 2, ziel: 'x', ankunft: 'a', name: 'Ost' }], ankuenfte: { a: { x: 15, y: 4 } } });
  const e = eintrag(k, 'uebergang-rand');
  assert.ok(e && istBehebbar(e));
  const fix = fixFuer(k, e);
  assert.equal(fix.ops[0].neu.x, 19);
  anwenden(k, fix);
  assert.equal(eintrag(k, 'uebergang-rand'), undefined);
});

test('Ankunft aus dem Übergang nach innen', () => {
  const k = neu({ uebergaenge: [{ x: 19, y: 4, b: 1, h: 3, ziel: 'x', ankunft: 'a', name: 'Ost' }], ankuenfte: { a: { x: 19, y: 5 } } });
  const fix = fixFuer(k, eintrag(k, 'ankunft-im-uebergang'));
  assert.deepEqual([fix.ziel.x, fix.ziel.y], [18, 5]);
  anwenden(k, fix);
  assert.equal(eintrag(k, 'ankunft-im-uebergang'), undefined);
});

test('Zombie-Spawn aus dem Haus nach draußen', () => {
  const k = neu();
  k.anwenden([{ s: 'marker', k: markerSchluessel(3, 2), neu: { art: 'zombie' } }]);
  const fix = fixFuer(k, eintrag(k, 'zombie-innen'));
  assert.ok(fix);
  anwenden(k, fix);
  assert.equal(k.markerAn(3, 2), null);
  assert.equal(eintrag(k, 'zombie-innen'), undefined);
  assert.equal(eintrag(k, 'marker-blockiert'), undefined, 'nicht auf eine Wand');
});

test('Marker unter einem Möbel → nächste freie Kachel, Loot bleibt drinnen', () => {
  const k = neu();
  k.anwenden([
    { s: 'marker', k: markerSchluessel(3, 2), neu: { art: 'loot', raum: 'a' } },
    { s: 'objekte', k: 1, neu: { typ: 'tisch', x: 3, y: 2, b: 1, h: 1, blockiert: true } },
  ]);
  const fix = fixFuer(k, eintrag(k, 'marker-blockiert'));
  assert.deepEqual(fix.ziel, { x: 2, y: 2 }, 'nächste Innen-Kachel');
  anwenden(k, fix);
  assert.equal(eintrag(k, 'marker-blockiert'), undefined);
});

test('Objekt in die Zone schieben', () => {
  const k = neu();
  k.anwenden([{ s: 'objekte', k: 1, neu: { typ: 'tisch', x: 19, y: 9, b: 2, h: 1, blockiert: true } }]);
  const fix = fixFuer(k, eintrag(k, 'objekt-rand'));
  assert.deepEqual([fix.ops[0].neu.x, fix.ops[0].neu.y], [18, 9]);
  anwenden(k, fix);
  assert.equal(eintrag(k, 'objekt-rand'), undefined);
});

test('Möbel aus der Tür befreien', () => {
  const k = neu();
  k.anwenden([{ s: 'objekte', k: 1, neu: { typ: 'tisch', x: 3, y: 4, b: 1, h: 1, blockiert: true } }]);
  const e = eintrag(k, 'moebel-wand');
  assert.ok(e);
  const fix = fixFuer(k, e);
  assert.ok(fix);
  anwenden(k, fix);
  assert.equal(eintrag(k, 'moebel-wand'), undefined);
});

test('Loot-Punkt ohne Raum → einziger Raum; mehrdeutig → kein Fix', () => {
  const k = neu();
  k.anwenden([{ s: 'marker', k: markerSchluessel(3, 3), neu: { art: 'loot', raum: 'z' } }]);
  const fix = fixFuer(k, eintrag(k, 'loot-raum'));
  assert.equal(fix.ops[0].neu.raum, 'a');
  k.anwenden([{ s: 'raeume', k: 'b', neu: { name: 'Zweiter', lootTabelle: 'huette' } }]);
  assert.equal(fixFuer(k, eintrag(k, 'loot-raum')), null, 'zwei Räume, keine Raumfläche → nicht eindeutig');
});

test('Alle eindeutigen beheben: ein Satz ops, danach sind die Fälle weg', () => {
  const k = neu({ uebergaenge: [{ x: 17, y: 4, b: 1, h: 2, ziel: 'x', ankunft: 'a', name: 'Ost' }], ankuenfte: { a: { x: 15, y: 4 } } });
  k.anwenden([
    { s: 'marker', k: markerSchluessel(3, 2), neu: { art: 'zombie' } },
    { s: 'objekte', k: 1, neu: { typ: 'tisch', x: 19, y: 9, b: 2, h: 1, blockiert: true } },
  ]);
  const vorher = validiere(k, { mitErreichbarkeit: false });
  const { fixes, ops } = fixeAlle(k, vorher);
  assert.equal(fixes.length, 3);
  k.anwenden(ops);
  const nachher = validiere(k, { mitErreichbarkeit: false }).filter(istBehebbar);
  assert.deepEqual(nachher, []);
});

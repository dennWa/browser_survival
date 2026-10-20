/** Editor 2.0, Schritt 7.3: Maßband, Einrasten, Hilfslinien */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EditorKarte } from '../editor/kern/karte.js';
import { nachDefinition } from '../editor/kern/format.js';
import { streckenInfo, fangKandidaten, fange, hilfslinieOps } from '../editor/kern/messen.js';

test('Maßband: Abschnitte, Gesamtlänge, Winkel', () => {
  const i = streckenInfo([{ x: 0, y: 0 }, { x: 3, y: 4 }, { x: 3, y: 0 }]);
  assert.deepEqual(i.segmente, [{ laenge: 5, winkel: 53 }, { laenge: 4, winkel: 270 }]);
  assert.equal(i.gesamt, 9);
  assert.equal(streckenInfo([{ x: 1, y: 1 }]).gesamt, 0);
});

test('Einrasten an Objektkanten/-mitten und Hilfslinien, Hilfslinien als Undo-Op (nicht im Spiel)', () => {
  const k = new EditorKarte({ id: 'm', breite: 20, hoehe: 20 });
  k.anwenden([{ s: 'objekte', k: 1, neu: { typ: 'tisch', x: 4, y: 4, b: 2, h: 1 } }]);
  k.anwenden(hilfslinieOps(k, 'y', null, 10.004));
  assert.deepEqual(k.werte.hilfslinien, { y: [10] });
  const kand = fangKandidaten(k);
  assert.ok(kand.x.includes(5) && kand.y.includes(10));
  const g = fange({ x: 5.9, y: 9.85, b: 1, h: 1 }, kand);
  assert.equal(g.x, 6, 'linke Kante an die rechte Tischkante');
  assert.equal(g.y, 10, 'obere Kante auf die Hilfslinie (näher als die Mitte)');
  assert.equal(g.linien.length, 2);
  assert.deepEqual(fange({ x: 12, y: 15, b: 1, h: 1 }, kand).linien, []);
  assert.ok(!fangKandidaten(k, new Set([1])).x.includes(5));
  k.anwenden(hilfslinieOps(k, 'y', 10, null));
  assert.equal(k.werte.hilfslinien, undefined);
  k.anwenden(hilfslinieOps(k, 'x', null, 3));
  assert.equal(nachDefinition(k).hilfslinien, undefined);
});

/**
 * Editor 2.0, Schritt 7.2: Mehrfachauswahl – ausrichten, verteilen, spiegeln (inkl. Kacheln, Drehung, Lampen-Richtung).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EditorKarte, markerSchluessel } from '../editor/kern/karte.js';
import { ausrichtenOps, verteilenOps, spiegelnOps } from '../editor/kern/anordnen.js';

function karte() {
  const k = new EditorKarte({ id: 'a', breite: 30, hoehe: 20 });
  k.anwenden([
    { s: 'objekte', k: 1, neu: { typ: 'tisch', x: 2, y: 2, b: 2, h: 1 } },
    { s: 'objekte', k: 2, neu: { typ: 'stuhl', x: 9.5, y: 5, b: 1, h: 1, drehung: 30 } },
    { s: 'bauwerke', k: 3, neu: { typ: 'zaun', tx: 5, ty: 8 } },
    { s: 'marker', k: markerSchluessel(14, 3), neu: { art: 'zombie' } },
  ]);
  return k;
}
const gew = (k, ...liste) => liste.map(([s, schl]) => ({ s, k: schl, wert: k.s(s).get(schl) }));

test('Ausrichten links/rechts/oben/Mitte am gemeinsamen Rahmen', () => {
  const k = karte();
  const g = gew(k, ['objekte', 1], ['objekte', 2], ['bauwerke', 3], ['marker', '14,3']);
  k.anwenden(ausrichtenOps(k, g, 'links').ops);
  assert.deepEqual([k.s('objekte').get(1).x, k.s('objekte').get(2).x, k.s('bauwerke').get(3).tx], [2, 2, 2]);
  assert.ok(k.s('marker').has('2,3') && !k.s('marker').has('14,3'), 'Marker wandert (Schlüssel)');
  const k2 = karte();
  k2.anwenden(ausrichtenOps(k2, gew(k2, ['objekte', 1], ['objekte', 2], ['bauwerke', 3]), 'rechts').ops);
  assert.deepEqual([k2.s('objekte').get(1).x, k2.s('objekte').get(2).x, k2.s('bauwerke').get(3).tx], [8.5, 9.5, 10], 'rechte Kante 10.5 → Bauwerk gerundet');
  const k3 = karte();
  k3.anwenden(ausrichtenOps(k3, gew(k3, ['objekte', 1], ['objekte', 2]), 'oben').ops);
  assert.equal(k3.s('objekte').get(2).y, 2);
  const k4 = karte();
  k4.anwenden(ausrichtenOps(k4, gew(k4, ['objekte', 1], ['objekte', 2]), 'mitteV').ops);
  assert.equal(k4.s('objekte').get(1).y + 0.5, k4.s('objekte').get(2).y + 0.5, 'gleiche Mitte');
  assert.match(ausrichtenOps(k, gew(k, ['objekte', 1]), 'links').grund, /Mindestens 2/);
});

test('Verteilen: erstes/letztes bleiben, gleiche Lücken', () => {
  const k = new EditorKarte({ id: 'v', breite: 40, hoehe: 10 });
  k.anwenden([
    { s: 'objekte', k: 1, neu: { typ: 'a', x: 0, y: 0, b: 2, h: 1 } },
    { s: 'objekte', k: 2, neu: { typ: 'a', x: 3, y: 0, b: 1, h: 1 } },
    { s: 'objekte', k: 3, neu: { typ: 'a', x: 20, y: 0, b: 2, h: 1 } },
  ]);
  k.anwenden(verteilenOps(k, gew(k, ['objekte', 3], ['objekte', 1], ['objekte', 2]), 'h').ops);
  const x = [1, 2, 3].map((n) => k.s('objekte').get(n).x);
  assert.equal(x[0], 0);
  assert.equal(x[2], 20);
  // Spanne 0..22, Breiten 2+1+2 → Lücke (22 − 5) / 2 = 8.5 → 0..2 | 10.5..11.5 | 20..22
  assert.equal(x[1], 10.5);
  assert.match(verteilenOps(k, gew(k, ['objekte', 1], ['objekte', 2]), 'h').grund, /Mindestens 3/);
});

test('Spiegeln: Positionen, Drehung, Lampen-Richtung und Kacheln im markierten Rechteck', () => {
  const k = karte();
  k.anwenden([{ s: 'objekte', k: 5, neu: { typ: 'licht', x: 3, y: 4, b: 1, h: 1, art: 'kegel', richtung: 0 } }, { s: 'kachel', i: 2 * 30 + 2, neu: '#' }, { s: 'bemalung', k: '2,2', neu: '#ff0000' }]);
  const r = { x: 2, y: 2, b: 10, h: 4 };
  const g = gew(k, ['objekte', 1], ['objekte', 2], ['objekte', 5]);
  k.anwenden(spiegelnOps(k, g, 'h', r).ops);
  assert.equal(k.s('objekte').get(1).x, 10, 'Tisch (2..4) → (10..12)');
  assert.equal(k.s('objekte').get(2).x, 3.5, 'Stuhl 9.5..10.5 im Rahmen 2..12 → 3.5..4.5');
  assert.equal(k.s('objekte').get(2).drehung, 330);
  assert.equal(k.s('objekte').get(5).richtung, 180, 'Osten → Westen');
  assert.equal(k.kachelAn(11, 2), '#', 'Kachel gespiegelt');
  assert.equal(k.kachelAn(2, 2), ',');
  assert.equal(k.s('bemalung').get('11,2'), '#ff0000');
  assert.equal(k.s('bemalung').has('2,2'), false);
  // zweimal spiegeln = wie vorher
  k.anwenden(spiegelnOps(k, gew(k, ['objekte', 1], ['objekte', 2], ['objekte', 5]), 'h', r).ops);
  assert.equal(k.s('objekte').get(1).x, 2);
  assert.equal(k.s('objekte').get(2).drehung, 30);
  assert.equal(k.kachelAn(2, 2), '#');
  const v = karte();
  v.anwenden(spiegelnOps(v, gew(v, ['objekte', 2]), 'v', { x: 0, y: 0, b: 30, h: 20 }).ops);
  assert.equal(v.s('objekte').get(2).y, 14);
  assert.equal(v.s('objekte').get(2).drehung, 150);
});

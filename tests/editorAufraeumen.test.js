import test from 'node:test';
import assert from 'node:assert/strict';
import { EditorKarte } from '../editor/kern/karte.js';
import { startInDerMitte, pruefeMarker } from '../editor/kern/platzierung.js';

test('Phase 10.7: Spawn in die Kartenmitte – freie Kachel, nächste zur Mitte', () => {
  const k = new EditorKarte({ breite: 11, hoehe: 9 });
  assert.deepEqual(startInDerMitte(k), { x: 5, y: 4 });
  // Mitte zugemauert → nächste freie Kachel im Ring daneben
  const ops = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy || true) ops.push({ s: 'kachel', i: (4 + dy) * 11 + 5 + dx, neu: '#' });
  k.anwenden(ops.filter((o) => o.i !== 4 * 11 + 5 + 1)); // rechts neben der Mitte bleibt frei
  k.anwenden([{ s: 'kachel', i: 4 * 11 + 5, neu: '#' }]);
  const ort = startInDerMitte(k);
  assert.ok(ort && pruefeMarker(k, 'start', ort.x, ort.y).ok, JSON.stringify(ort));
  assert.ok(Math.max(Math.abs(ort.x - 5), Math.abs(ort.y - 4)) <= 1);
  // alles zu → null
  const voll = new EditorKarte({ breite: 3, hoehe: 3, fuellung: '#' });
  assert.equal(startInDerMitte(voll), null);
});

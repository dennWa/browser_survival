/** Editor 2.0, Schritt 7.5: Versionen, Diff, Wiederherstellen als 1 Schritt */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EditorKarte, umkehren } from '../editor/kern/karte.js';
import { neueVersion, fuegeHinzu, vergleiche, wiederherstellenOps, letzteExportVersion } from '../editor/kern/versionen.js';

function karte() {
  const k = new EditorKarte({ id: 'v', breite: 10, hoehe: 8 });
  k.anwenden([{ s: 'objekte', k: 1, neu: { typ: 'tisch', x: 2, y: 2, b: 2, h: 1 } }, { s: 'marker', k: '5,5', neu: { art: 'zombie' } }]);
  return k;
}

test('Diff: Kacheln, Sammlungen neu/weg/geändert, Werte, Markierungen', () => {
  const k = karte();
  const v = neueVersion(k, { name: 'Start', zeit: '2026-01-01T00:00:00Z' });
  k.anwenden([{ s: 'kachel', i: 0, neu: '#' }, { s: 'objekte', k: 1, neu: { typ: 'tisch', x: 3, y: 2, b: 2, h: 1 } }, { s: 'objekte', k: 2, neu: { typ: 'stuhl', x: 6, y: 6, b: 1, h: 1 } }, { s: 'marker', k: '5,5', neu: null }, { s: 'wert', pfad: 'name', neu: 'Neu' }]);
  const d = vergleiche(v.karte, k);
  assert.equal(d.kacheln, 1);
  assert.deepEqual(d.sammlungen.objekte, { neu: [2], weg: [], geaendert: [1] });
  assert.deepEqual(d.sammlungen.marker.weg, ['5,5']);
  assert.deepEqual(d.werte, ['name']);
  assert.ok(d.markierungen.some((m) => m.art === 'weg' && m.x === 5 && m.y === 5));
  assert.ok(d.markierungen.some((m) => m.art === 'neu' && m.x === 6));
  assert.ok(d.zusammenfassung.includes('Objekte: +1 ~1'));
  assert.equal(vergleiche(k, k).anzahl, 0);
});

test('Wiederherstellen = Ops zum alten Stand, umkehrbar (auch nach Größenänderung)', () => {
  const k = karte();
  const v = neueVersion(k);
  k.anwenden([{ s: 'objekte', k: 1, neu: null }, { s: 'wert', pfad: 'einstellungen.wetter', neu: { regen: 1 } }, { s: 'raster', neu: { breite: 12, hoehe: 8, zellen: ','.repeat(96), hoehen: null } }]);
  const vorher = JSON.stringify(k.alsJson().sammlungen);
  const angewandt = k.anwenden(wiederherstellenOps(k, v.karte));
  assert.equal(vergleiche(v.karte, k).anzahl, 0, 'Stand der Version');
  k.anwenden(umkehren(angewandt));
  assert.equal(JSON.stringify(k.alsJson().sammlungen), vorher, 'Rückgängig stellt den Stand davor her');
  assert.equal(k.breite, 12);
});

test('Versionsliste: automatische begrenzt, manuelle bleiben, letzter Export', () => {
  const k = karte();
  let l = [];
  l = fuegeHinzu(l, neueVersion(k, { name: 'meins' }), { maxAuto: 2 });
  for (let i = 0; i < 4; i++) l = fuegeHinzu(l, neueVersion(k, { art: i % 2 ? 'export' : 'veroeffentlichen' }), { maxAuto: 2 });
  assert.equal(l.length, 3);
  assert.ok(l.some((v) => v.name === 'meins'));
  assert.equal(letzteExportVersion(l).art, 'export');
  assert.equal(letzteExportVersion([]), null);
});

/** Editor 2.0, Schritt 7.4: Bibliothek & Vorlagen (Prefab-Einträge, Ordner, Suche, Vorschau-Daten) */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prefabEintraege, prefabOrdner, lootVorlagenEintraege, vorschauDaten } from '../editor/kern/bibliothekVorlagen.js';
import { eingebautePrefabs } from '../editor/kern/prefabs.js';

const v = (extra = {}) => ({ b: 2, h: 2, zellen: [',', '#', '_', ','], objekte: [{ typ: 'tisch', x: 0, y: 0, b: 1, h: 1 }, { typ: 'baum', x: 1, y: 1, b: 1, h: 1, ebene: 'oben' }], bauwerke: [{ typ: 'zaun', tx: 1, ty: 0 }], bemalung: [[0, 1, '#ff0000']], ...extra });

test('Prefab-Einträge: eindeutige IDs, Ordner, Suche (Umlaute egal), Gruppierung', () => {
  const liste = prefabEintraege([...eingebautePrefabs().map((p) => ({ ...p })), { name: 'Anglerhütte', vorlage: v({ ordner: 'Mein Wald' }), eigen: true }, { name: 'Bude', vorlage: v(), eigen: true }]);
  assert.ok(liste.every((e) => e.art === 'prefab' && e.id.startsWith('prefab:')));
  assert.equal(new Set(liste.map((e) => e.id)).size, liste.length);
  const g = prefabOrdner(liste);
  assert.deepEqual(g.map((x) => x.ordner), ['Eigene', 'Mein Wald', 'Eingebaut']);
  assert.deepEqual(prefabOrdner(liste, 'anglerhutte').flatMap((x) => x.eintraege.map((e) => e.name)), ['Anglerhütte']);
  assert.deepEqual(prefabOrdner(liste, 'mein wald').flatMap((x) => x.eintraege.map((e) => e.name)), ['Anglerhütte'], 'Ordner zählt bei der Suche');
});

test('Loot-Vorlagen als Bibliotheks-Einträge', () => {
  const e = lootVorlagenEintraege({ a1: { name: 'Küche' } });
  assert.equal(e[0].id, 'lootVorlage:a1');
  assert.equal(e[0].aktion, 'lootVorlagen');
});

test('Vorschau-Daten: Kachelfarben, Bemalung, Objekte ohne Kronen, Bauwerke', () => {
  const d = vorschauDaten(v(), (z) => ({ ',': '#00aa00', '#': '#555555' })[z]);
  assert.deepEqual(d.pixel, ['#00aa00', '#555555', '#ff0000', '#00aa00']);
  assert.equal(d.rechtecke.length, 2, 'Baumkrone (oben) fehlt, Zaun dabei');
});

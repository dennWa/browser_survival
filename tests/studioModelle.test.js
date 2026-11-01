/**
 * Studio Phase 3 (Modelle): 3.1 Loot-Vorschau (Beispiel-Items mit den Würfel-Regeln des Spiels) – studio/kern/lootVorschau.js.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { beispielItems, festesItem } from '../studio/kern/lootVorschau.js';
import { LOOT_TABELLEN } from '../server/spiel/konfiguration/lootTabellen.js';

const KARTE = {
  id: 'vorschau',
  name: 'Vorschau',
  kacheln: [',,,,,,,,', ',,S,,a,,', ',,,,,,,,', ',,,,,,,,'],
  raeume: { a: { name: 'Küche', lootTabelle: 'kueche' } },
  objekte: [],
  spawnpunkte: [
    { x: 6.5, y: 2.5, inhalt: 'apfel', chance: 5, intervall: 10, hoehe: 0.75 },
    { x: 1.5, y: 3.5, inhalt: 'tabelle:kueche', chance: 1, intervall: 10 },
  ],
  lootZonen: [{ x: 0, y: 0, b: 8, h: 1, modus: 'chance', eintraege: [{ id: 'konservendose', chance: 10 }], punkte: 2 }],
};

test('festesItem: nur einzelne, bekannte Items', () => {
  assert.equal(festesItem('apfel'), 'apfel');
  assert.equal(festesItem('tabelle:kueche'), null);
  assert.equal(festesItem('gibtsnicht'), null);
  assert.equal(festesItem(undefined), null);
});

test('beispielItems: jeder Loot-Punkt bekommt ein Beispiel (Raum, Zone, Spawnpunkt), fest = sicher', () => {
  const liste = beispielItems(KARTE, 7);
  const zahl = (q) => liste.filter((e) => e.quelle === q).length;
  assert.deepEqual([zahl('raum'), zahl('spawnpunkt')], [1, 2]);
  assert.ok(zahl('zone') >= 1, 'Zonen-Punkte (Verteilung wie im Spiel-Lader)');
  const apfel = liste.find((e) => e.quelle === 'spawnpunkt' && e.sicher);
  assert.equal(apfel.defId, 'apfel', 'trotz 5 % Chance liegt in der Vorschau etwas');
  assert.deepEqual([apfel.x, apfel.y, apfel.hoehe], [6.5, 2.5, 0.75]);
  const kueche = new Set(LOOT_TABELLEN.kueche.map((e) => e.id));
  assert.ok(kueche.has(liste.find((e) => e.quelle === 'raum').defId));
  assert.ok(liste.filter((e) => e.quelle === 'zone').every((e) => e.defId === 'konservendose'));
  assert.equal(liste.find((e) => e.quelle === 'raum').x, 5.5, 'Kachelmitte in Kacheleinheiten');
});

test('beispielItems: gleiche Saat = gleiche Vorschau, kaputte Karte = leer', () => {
  const k = { ...KARTE, spawnpunkte: Array.from({ length: 20 }, (_, i) => ({ x: (i % 8) + 0.5, y: 3.5, inhalt: 'tabelle:kueche', chance: 50 })) };
  assert.deepEqual(beispielItems(k, 3), beispielItems(k, 3));
  const andere = [1, 2, 4, 5, 6].map((s) => beispielItems(k, s).map((e) => e.defId).join());
  assert.ok(andere.some((a) => a !== beispielItems(k, 3).map((e) => e.defId).join()), 'andere Saat würfelt anders');
  assert.deepEqual(beispielItems({ id: 'kaputt', kacheln: ['?'] }), []);
});

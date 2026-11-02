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

// ---------- 3.3: Spiel-Einstellungen je Modell (index.json → spielordnerTyp) ----------
import { pruefeModellFelder, aktualisiereIndex, fussabdruck, verwendungen, angleichOps, freierStem, farbtonDrehen } from '../studio/kern/modelle.js';
import { setzeSpielordner, spielordnerTyp } from '../editor/kern/spielordner.js';
import { EditorKarte } from '../editor/kern/karte.js';
import { objektOps } from '../studio/kern/aktionen.js';

const INDEX = [
  { datei: 'kiste.glb', name: 'Kiste', kategorie: 'deko', masse: { b: 2, h: 1, hoehe: 1 }, zielHoehe: 1 },
  { datei: 'teppich.glb', name: 'Teppich', kategorie: 'moebel', masse: { b: 2, h: 3, hoehe: 0.05 }, zielHoehe: 0.05 },
];

test('pruefeModellFelder: Grenzen, Standard-Ebene wird nicht gespeichert, null entfernt', () => {
  assert.throws(() => pruefeModellFelder({ zielHoehe: 50 }));
  assert.throws(() => pruefeModellFelder({ ebene: 'dach' }));
  assert.throws(() => pruefeModellFelder({ fuss: { b: 0, h: 1 } }));
  assert.throws(() => pruefeModellFelder({ kategorie: 'quatsch' }));
  assert.deepEqual(pruefeModellFelder({ ebene: 'moebel', blockiert: 0, fuss: { b: '1.5', h: 2 }, leerlauf: ' Wippen ' }), { ebene: null, blockiert: false, fuss: { b: 1.5, h: 2 }, leerlauf: 'Wippen' });
  assert.deepEqual(pruefeModellFelder({ leerlauf: '' }), { leerlauf: null });
});

test('aktualisiereIndex + spielordnerTyp: Kollision, Ebene, eigene Grundfläche, Leerlauf landen im Typ', () => {
  assert.throws(() => aktualisiereIndex(INDEX, 'fehlt.glb', {}));
  let index = aktualisiereIndex(INDEX, 'teppich.glb', pruefeModellFelder({ blockiert: false, ebene: 'boden' }));
  index = aktualisiereIndex(index, 'kiste.glb', pruefeModellFelder({ fuss: { b: 3, h: 3 }, leerlauf: 'Drehen' }));
  assert.equal(INDEX[0].fuss, undefined, 'Original unverändert');
  setzeSpielordner(index);
  const teppich = spielordnerTyp('teppich');
  assert.equal(teppich.typ.blockiert, false);
  assert.equal(teppich.typ.ebene, 'boden');
  const kiste = spielordnerTyp('kiste', 2);
  assert.deepEqual([kiste.b, kiste.h], [6, 6], 'eigene Grundfläche wächst mit der Höhe');
  assert.equal(kiste.typ.animation, 'Drehen');
  assert.deepEqual(fussabdruck(index[0], 2), { b: 6, h: 6 });
  assert.deepEqual(fussabdruck(INDEX[0]), { b: 2, h: 1 });
  index = aktualisiereIndex(index, 'kiste.glb', { fuss: null, leerlauf: null });
  assert.equal('fuss' in index[0] || 'leerlauf' in index[0], false);
  // Objekt aus der Werkstatt-Einstellung
  const k = new EditorKarte({ id: 't', name: 't', breite: 10, hoehe: 10 });
  const { ops } = objektOps(k, 'modell:teppich', 2, 2);
  const o = ops.find((x) => x.s === 'objekte').neu;
  assert.equal(o.blockiert, false);
  assert.equal(o.ebene, 'boden');
});

test('verwendungen + angleichOps: Zonen finden und Typen/Objekte nachziehen', () => {
  setzeSpielordner(INDEX);
  const k = new EditorKarte({ id: 'z', name: 'z', breite: 10, hoehe: 10 });
  k.anwenden(objektOps(k, 'modell:kiste', 1, 1).ops);
  k.anwenden(objektOps(k, 'modell:kiste', 4, 4).ops);
  const v = verwendungen(new Map([['z', k], ['leer', new EditorKarte({ id: 'leer', name: 'l', breite: 5, hoehe: 5 })]]), 'kiste');
  assert.deepEqual(v, [{ zone: 'z', typen: ['sf_kiste_10'], objekte: 2 }]);
  const ops = angleichOps(k, 'kiste', { ...INDEX[0], blockiert: false, leerlauf: 'Wippen', ebene: 'boden' });
  assert.equal(ops.filter((o) => o.s === 'typen').length, 1);
  assert.equal(ops.filter((o) => o.s === 'objekte' && o.neu.blockiert === false && o.neu.ebene === 'boden').length, 2);
  k.anwenden(ops);
  assert.equal(k.s('typen').get('sf_kiste_10').animation, 'Wippen');
  assert.deepEqual(angleichOps(k, 'kiste', { ...INDEX[0], blockiert: false, leerlauf: 'Wippen', ebene: 'boden' }), [], 'schon gleich → nichts');
});

test('freierStem + farbtonDrehen', () => {
  assert.equal(freierStem('Große Kiste!', ['grosse-kiste']), 'grosse-kiste-2');
  assert.equal(freierStem('', []), 'modell');
  const [r, g, b] = farbtonDrehen([1, 0, 0], 120);
  assert.ok(g > 0.99 && r < 0.01 && b < 0.01, 'rot + 120° = grün');
  assert.deepEqual(farbtonDrehen([0.5, 0.5, 0.5], 90), [0.5, 0.5, 0.5], 'grau bleibt grau');
  assert.ok(farbtonDrehen([0.2, 0.4, 0.6], 0, 1, 0.5)[2] < 0.6, 'dunkler');
});

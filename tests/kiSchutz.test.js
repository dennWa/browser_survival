/**
 * Runde 19 – KI-Ausschnitt: geschützte Flächen (editor/kern/kiSchutz.js), Bereich über den Zonenrand (Export „_“,
 * Aktionen umrechnen nach dem Vergrößern), Auftrag im Text, `geschuetzt` in der bereich-Aktion zurück.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ausDefinition } from '../editor/kern/format.js';
import { ausschnitt, ausschnittText, AUSSEN } from '../editor/kern/ausschnitt.js';
import { leseKiAntwort, pruefeAenderungen } from '../editor/kern/kiImport.js';
import { opsImSchutz, verschiebeAktionen, randFuer, ueberlappt } from '../editor/kern/kiSchutz.js';
import { groesseAendern } from '../editor/kern/zone.js';

const zone = (b = 20, h = 12) => ausDefinition({ id: 'testzone', name: 'Testzone', kacheln: Array.from({ length: h }, () => ','.repeat(b)), raeume: {}, objekte: [{ typ: 'baum', x: 5, y: 5 }] }).karte;

test('opsImSchutz: Kachel, Objekt alt und neu, Marker – außerhalb frei', () => {
  const k = zone();
  const schutz = [{ x: 4, y: 4, b: 3, h: 3 }];
  assert.ok(ueberlappt({ x: 5, y: 5, b: 1, h: 1 }, schutz[0]));
  assert.ok(opsImSchutz(k, [{ s: 'kachel', i: 5 * k.breite + 5, neu: '-' }], schutz));
  assert.equal(opsImSchutz(k, [{ s: 'kachel', i: 1, neu: '-' }], schutz), null);
  k.anwenden([{ s: 'objekte', k: 1, neu: { typ: 'kiste', x: 5, y: 5, b: 1, h: 1 } }]);
  assert.ok(opsImSchutz(k, [{ s: 'objekte', k: 1, neu: { ...k.s('objekte').get(1), x: 15 } }], schutz), 'Herausschieben zählt (alter Ort)');
  assert.ok(opsImSchutz(k, [{ s: 'objekte', k: 2, neu: { typ: 'kiste', x: 3.5, y: 3.5, b: 1, h: 1 } }], schutz), 'ragt hinein');
  assert.ok(opsImSchutz(k, [{ s: 'marker', k: '4,6', neu: { art: 'zombie' } }], schutz));
  assert.equal(opsImSchutz(k, [{ s: 'typen', k: 'x', neu: { name: 'x' } }], schutz), null, 'zonenweit nie');
});

test('pruefeAenderungen: Aktion in geschützter Fläche ist ungültig, daneben gültig', () => {
  const k = zone();
  const gelesen = leseKiAntwort(JSON.stringify([
    { aktion: 'bereich', zone: 'testzone', x0: 0, x1: 19, y0: 0, y1: 11 },
    { aktion: 'kachel', x: 5, y: 5, zeichen: '-' },
    { aktion: 'kachel', x: 10, y: 2, zeichen: '-' },
  ]));
  const e = pruefeAenderungen(k, gelesen, { geschuetzt: [{ x: 4, y: 4, b: 3, h: 3 }] });
  assert.equal(e.zaehler.ungueltig, 1);
  assert.match(e.eintraege.find((x) => x.art === 'ungueltig').text, /geschützten Fläche/);
  assert.equal(e.zaehler.aendern + e.zaehler.neu, 1);
});

test('Export über den Zonenrand: „_“ draußen, Auftrag, Schutz in Text und bereich-Aktion', () => {
  const k = zone(10, 6);
  const a = ausschnitt(k, { x: 8, y: 2, b: 5, h: 2 }, { aussen: true, schutz: [{ x: 8, y: 2, b: 1, h: 1 }], auftrag: 'Baue einen Weg' });
  assert.deepEqual(a.aussen, { links: 0, oben: 0, rechts: 3, unten: 0 });
  assert.ok(a.raster.at(-1).endsWith(`,,${AUSSEN}${AUSSEN}${AUSSEN}`), a.raster.at(-1));
  const t = ausschnittText(a);
  assert.match(t, /## Auftrag\nBaue einen Weg/);
  assert.match(t, /Geschützte Flächen/);
  assert.match(t, /"geschuetzt":\[\{"x":8,"y":2,"b":1,"h":1\}\]/);
  const zurueck = leseKiAntwort(`[{"aktion":"bereich","zone":"testzone","x0":8,"x1":12,"y0":2,"y1":3,"geschuetzt":[{"x":8,"y":2,"b":1,"h":1}]}]`);
  assert.deepEqual(zurueck.meta.geschuetzt, [{ x: 8, y: 2, b: 1, h: 1 }]);
});

test('Bereich ragt hinaus: Zone wachsen lassen, Aktionen umrechnen, dann gültig', () => {
  const k = zone(10, 6);
  const bereich = { x0: -2, x1: 3, y0: 0, y1: 2 };
  const rand = randFuer(k, { x: -2, y: 0, b: 6, h: 3 });
  assert.deepEqual(rand, { links: 2, oben: 0, rechts: 0, unten: 0 });
  k.anwenden(groesseAendern(k, rand).ops);
  assert.equal(k.breite, 12);
  const aktionen = verschiebeAktionen([{ aktion: 'kachel', x: -2, y: 1, zeichen: '-' }, { aktion: 'linie', von: [-1, 0], bis: [1, 0], zeichen: '#' }], rand.links, rand.oben);
  assert.equal(aktionen[0].x, 0);
  assert.deepEqual(aktionen[1].von, [1, 0]);
  const e = pruefeAenderungen(k, { aktionen, meta: { bereich: { x0: bereich.x0 + 2, x1: bereich.x1 + 2, y0: 0, y1: 2 } } });
  assert.equal(e.zaehler.ungueltig, 0, JSON.stringify(e.eintraege));
});

test('AUSSEN-Zeichen ist weder Kachel noch Marker', async () => {
  const { KACHELN } = await import('../gemeinsam/welt/kacheln.js');
  assert.ok(!(AUSSEN in KACHELN));
  assert.ok(!/[a-zSZ]/.test(AUSSEN));
});

/** Editor 2.0, Schritt 9.8: Modell → Metadaten – Anfrage (nur Maße + Vorschaubild), strenge Prüfung der Antwort */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baueModellAnfrage, leseModellVorschlag, modellGesendet } from '../editor/kern/modellKi.js';

const META = { id: 'm_1', name: 'tree low', masse: { b: 2.4, h: 2.2, hoehe: 5.1 }, dreiecke: 812, animationen: [], vorschau: 'data:image/png;base64,iVBORw0KGgo=' };

test('Anfrage: Maße, Dreiecke, Bild als inlineData, JSON-Antwort – keine Modelldatei', () => {
  const a = baueModellAnfrage(META);
  const teile = a.contents[0].parts;
  assert.match(teile[0].text, /2\.4 × 2\.2 × 5\.1 m/);
  assert.match(teile[0].text, /812 Dreiecke/);
  assert.deepEqual(teile[1].inlineData, { mimeType: 'image/png', data: 'iVBORw0KGgo=' });
  assert.equal(a.generationConfig.responseMimeType, 'application/json');
  assert.equal(baueModellAnfrage(META, { mitBild: false }).contents[0].parts.length, 1);
  assert.ok(!JSON.stringify(a).includes('bytes'));
  assert.ok(modellGesendet(META).some((g) => /Vorschaubild/.test(g)));
});

test('Antwort: gültige Felder übernommen, Unsinn verworfen/begrenzt', () => {
  const v = leseModellVorschlag(JSON.stringify({ name: 'Kiefer', kategorie: 'Umwelt', ordner: 'Wald/Bäume/', tags: ['#Baum', 'nadel', 'x'.repeat(40)], b: 2, h: 2, hoehe: 99, ebene: 'oben', blockiert: true }));
  assert.deepEqual(v, { name: 'Kiefer', kategorie: 'Umwelt', ordner: 'Wald/Bäume', tags: ['baum', 'nadel', 'x'.repeat(24)], b: 2, h: 2, hoehe: 30, ebene: 'oben', blockiert: true });
  const schlecht = leseModellVorschlag('{"name":"<b>x</b>","kategorie":"Raumschiffe","ordner":"../geheim","b":"abc","ebene":"luft"}');
  assert.equal(schlecht.name, undefined);
  assert.equal(schlecht.kategorie, undefined);
  assert.equal(schlecht.ordner, undefined);
  assert.equal(schlecht.b, undefined);
  assert.equal(schlecht.ebene, undefined);
  assert.throws(() => leseModellVorschlag('kein json'), /kein gültiges JSON/);
});

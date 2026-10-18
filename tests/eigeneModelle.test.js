import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { verarbeiteKarte } from '../server/spiel/karten/kartenLader.js';
import { STADTRAND } from '../server/spiel/karten/stadtrand.js';
import { schreibeEigeneModelle } from '../werkzeuge/karten/eigeneModelle.mjs';

const GLB = 'data:model/gltf-binary;base64,AAAA';

test('Spiel bekommt nur eigene Typen mit gültigem Modell (Pfad oder eingebettet)', () => {
  const typen = {
    dreieck: { glbDatei: 'assets/eigene/stadtrand_dreieck.glb', hoehe3d: 1.2, urheber: 'nur für den Editor' },
    boese: { glbDatei: '../etc/passwd.glb' },
    ohneModell: { name: 'Platzhalter' },
    ein: { glb: GLB },
  };
  const daten = verarbeiteKarte({ ...STADTRAND, typen }).daten;
  assert.deepEqual(daten.typen, { dreieck: { glbDatei: 'assets/eigene/stadtrand_dreieck.glb', hoehe3d: 1.2 }, ein: { glb: GLB } });
});

test('ohne eigene Modelle kein typen-Feld im Spiel', () => {
  assert.equal(verarbeiteKarte(STADTRAND).daten.typen, undefined);
});

test('schreibeEigeneModelle legt die .glb ab und ersetzt die Daten durch den Pfad', () => {
  const ordner = mkdtempSync(path.join(tmpdir(), 'eigene-'));
  const definition = { id: 'testzone', typen: { dreieck: { glb: `data:model/gltf-binary;base64,${Buffer.from('glTFxyz').toString('base64')}` } } };
  const dateien = schreibeEigeneModelle(definition, ordner);
  assert.deepEqual(dateien, ['assets/eigene/testzone_dreieck.glb']);
  assert.equal(definition.typen.dreieck.glb, undefined);
  assert.equal(definition.typen.dreieck.glbDatei, 'assets/eigene/testzone_dreieck.glb');
  assert.equal(readFileSync(path.join(ordner, dateien[0]), 'utf8'), 'glTFxyz');
});

test('schreibeEigeneModelle lehnt Nicht-glb-Daten ab', () => {
  assert.throws(() => schreibeEigeneModelle({ id: 'testzone', typen: { x: { glb: 'data:image/png;base64,AAAA' } } }, tmpdir()), /keine .glb-Datei/);
});

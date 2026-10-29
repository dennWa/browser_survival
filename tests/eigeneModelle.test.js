import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { verarbeiteKarte } from '../server/spiel/karten/kartenLader.js';
import { STADTRAND } from '../server/spiel/karten/stadtrand.js';
import { schreibeEigeneModelle } from '../werkzeuge/karten/eigeneModelle.mjs';
import { BEHAELTER_TYPEN } from '../gemeinsam/welt/behaelter.js';

const GLB = 'data:model/gltf-binary;base64,AAAA';
// Stadtrand ohne die eingebauten Behälter-Modelle (die ergänzt der Lader selbst unter `typen`, Runde 25)
const OHNE_BEHAELTER = { ...STADTRAND, objekte: STADTRAND.objekte.filter((o) => !BEHAELTER_TYPEN[o.typ]) };

test('Spiel bekommt nur eigene Typen mit gültigem Modell (Pfad oder eingebettet)', () => {
  const typen = {
    dreieck: { glbDatei: 'assets/eigene/stadtrand_dreieck.glb', hoehe3d: 1.2, urheber: 'nur für den Editor' },
    boese: { glbDatei: '../etc/passwd.glb' },
    ohneModell: { name: 'Platzhalter' },
    ein: { glb: GLB },
  };
  const daten = verarbeiteKarte({ ...OHNE_BEHAELTER, typen }).daten;
  assert.deepEqual(daten.typen, { dreieck: { glbDatei: 'assets/eigene/stadtrand_dreieck.glb', hoehe3d: 1.2 }, ein: { glb: GLB } });
});

test('ohne eigene Modelle kein typen-Feld im Spiel', () => {
  assert.equal(verarbeiteKarte(OHNE_BEHAELTER).daten.typen, undefined);
});

test('Runde 25: eingebaute Behälter-Modelle (Truhe, Schrank …) ergänzt der Lader unter typen', () => {
  const daten = verarbeiteKarte(STADTRAND).daten;
  assert.deepEqual(daten.typen.truhe, { glbDatei: BEHAELTER_TYPEN.truhe.glbDatei, hoehe3d: BEHAELTER_TYPEN.truhe.hoehe3d });
  assert.ok(daten.typen.kleiderschrank.glbDatei.endsWith('.glb'));
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

test('LIZENZEN.md hält Urheber und Lizenz fest, fehlende Lizenz wird ausgewiesen', () => {
  const ordner = mkdtempSync(path.join(tmpdir(), 'eigene-'));
  const definition = { id: 'testzone', typen: {
    a: { name: 'Baum', glb: GLB, urheber: 'Max', lizenz: 'CC-BY 4.0' },
    b: { name: 'Fund', glb: GLB },
  } };
  schreibeEigeneModelle(definition, ordner);
  const md = readFileSync(path.join(ordner, 'assets/eigene/LIZENZEN.md'), 'utf8');
  assert.match(md, /\| assets\/eigene\/testzone_a\.glb \| Baum \| Max \| CC-BY 4\.0 \|/);
  assert.match(md, /\| assets\/eigene\/testzone_b\.glb \| Fund \| – \| \*\*keine Angabe\*\* \|/);
});

test('karte:editor räumt verwaiste Modelle der Karte auf und behält Lizenzzeilen anderer Karten (Schritt 3.3)', async () => {
  const { raeumeEigeneModelleAuf } = await import('../werkzeuge/karten/eigeneModelle.mjs');
  const { existsSync } = await import('node:fs');
  const ordner = mkdtempSync(path.join(tmpdir(), 'eigene-'));
  schreibeEigeneModelle({ id: 'andere', typen: { x: { name: 'X', glb: GLB, lizenz: 'CC0' } } }, ordner);
  schreibeEigeneModelle({ id: 'testzone', typen: { a: { name: 'A', glb: GLB }, b: { name: 'B', glb: GLB } } }, ordner);
  // zweite Veröffentlichung: b gelöscht, a bleibt (schon als Datei), c neu
  const definition = { id: 'testzone', typen: { a: { name: 'A', glbDatei: 'assets/eigene/testzone_a.glb' }, c: { name: 'C', glb: GLB } } };
  schreibeEigeneModelle(definition, ordner);
  assert.deepEqual(raeumeEigeneModelleAuf(definition, ordner), ['assets/eigene/testzone_b.glb']);
  assert.ok(!existsSync(path.join(ordner, 'assets/eigene/testzone_b.glb')));
  assert.ok(existsSync(path.join(ordner, 'assets/eigene/andere_x.glb')));
  const md = readFileSync(path.join(ordner, 'assets/eigene/LIZENZEN.md'), 'utf8');
  assert.match(md, /andere_x\.glb \| X \| – \| CC0/);
  assert.match(md, /testzone_a\.glb/);
  assert.match(md, /testzone_c\.glb/);
  assert.doesNotMatch(md, /testzone_b\.glb/);
});

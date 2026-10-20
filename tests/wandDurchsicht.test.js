import { test } from 'node:test';
import assert from 'node:assert/strict';
import { durchsichtFlaechen, durchsichtDeckkraft, DURCHSICHT_SEITE, DURCHSICHT_OBEN } from '../client/darstellung/wandDurchsicht.js';

const G = 32;
const stueck = (tx, tz, unten = 0, hoehe = 84) => ({ x: tx * G + G / 2, z: tz * G + G / 2, unten, hoehe });
const dreiecke = (f) => f.pos.length / 9;

test('Wand-Durchsicht: einzelnes Wandstück = 4 Seiten + Oberkante (je 2 Dreiecke), keine Unterseite', () => {
  const f = durchsichtFlaechen([stueck(3, 3)], G);
  assert.equal(dreiecke(f.seite), 8);
  assert.equal(dreiecke(f.oben), 2);
  assert.equal(f.seite.nor.length, f.seite.pos.length);
});

test('Wand-Durchsicht: aneinanderstoßende gleich hohe Stücke lassen die Innenflächen weg', () => {
  const f = durchsichtFlaechen([stueck(3, 3), stueck(4, 3), stueck(5, 3)], G);
  // Reihe in x: oben/unten je 3 Flächen + 2 Stirnseiten = 8 Flächen
  assert.equal(dreiecke(f.seite), 16);
  assert.equal(dreiecke(f.oben), 6);
  const nx = [...f.seite.nor].filter((_, i) => i % 3 === 0 && f.seite.nor[i] !== 0).length;
  assert.equal(nx / 6, 2); // genau zwei Stirnflächen (±x)
});

test('Wand-Durchsicht: unterschiedlich hohe Nachbarn (Türsturz, Fensterbrüstung) behalten ihre Fläche', () => {
  const f = durchsichtFlaechen([stueck(3, 3), stueck(4, 3, 70, 14)], G);
  assert.equal(dreiecke(f.seite), 16);
});

test('Wand-Durchsicht: Flächen zeigen nach außen (Dreiecks-Drehsinn passt zur Normalen)', () => {
  const f = durchsichtFlaechen([stueck(1, 1)], G);
  for (const teil of [f.seite, f.oben]) {
    for (let d = 0; d < dreiecke(teil); d++) {
      const p = (i) => [0, 1, 2].map((k) => teil.pos[d * 9 + i * 3 + k]);
      const [a, b, c] = [p(0), p(1), p(2)];
      const u = b.map((v, k) => v - a[k]);
      const w = c.map((v, k) => v - a[k]);
      const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
      const soll = [0, 1, 2].map((k) => teil.nor[d * 9 + k]);
      assert.ok(n[0] * soll[0] + n[1] * soll[1] + n[2] * soll[2] > 0);
    }
  }
});

test('Wand-Durchsicht: Deckkraft blendet von dicht (0) zu durchsichtig (1)', () => {
  assert.deepEqual(durchsichtDeckkraft(0), { seite: 1, oben: 1 });
  const voll = durchsichtDeckkraft(1);
  assert.ok(Math.abs(voll.seite - DURCHSICHT_SEITE) < 1e-9 && Math.abs(voll.oben - DURCHSICHT_OBEN) < 1e-9);
  assert.ok(voll.oben > voll.seite); // Oberkante bleibt kräftiger
});

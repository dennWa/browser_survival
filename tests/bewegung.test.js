import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Welt } from '../gemeinsam/welt/welt.js';
import { wendeEingabeAn } from '../gemeinsam/physik/bewegung.js';

// 5×3-Raum mit Wand rechts:  #####  /  #...#  /  #####
const welt = new Welt({ id: 't', name: 't', breite: 5, hoehe: 3, kachelGroesse: 32, kacheln: ['#####', '#...#', '#####'], raeume: [] });
const parameter = { geschwindigkeit: 300, radius: 12 };

test('Spieler läuft frei auf Boden', () => {
  const k = { x: 48, y: 48, blick: 0 };
  wendeEingabeAn(k, { x: 1, y: 0 }, welt, parameter, 0.1);
  assert.equal(k.x, 78);
  assert.equal(k.y, 48);
});

test('Spieler kann nicht durch Wände laufen', () => {
  const k = { x: 48, y: 48, blick: 0 };
  for (let i = 0; i < 100; i++) wendeEingabeAn(k, { x: 1, y: -1 }, welt, parameter, 0.1);
  assert.ok(k.x + parameter.radius <= 4 * 32, `x=${k.x} steckt in der rechten Wand`);
  assert.ok(k.y - parameter.radius >= 32, `y=${k.y} steckt in der oberen Wand`);
});

test('Diagonal ist nicht schneller als gerade', () => {
  const k = { x: 64, y: 48, blick: 0 };
  wendeEingabeAn(k, { x: 1, y: 1 }, new Welt({ ...welt, kacheln: ['.....', '.....', '.....'] }), parameter, 0.01);
  assert.ok(Math.hypot(k.x - 64, k.y - 48) <= 3.0001);
});

test('Manipulierte Eingaben werden begrenzt', () => {
  const k = { x: 48, y: 48, blick: 0 };
  wendeEingabeAn(k, { x: 9999, y: Number.NaN }, welt, parameter, 0.01);
  assert.equal(k.x, 51);
  assert.equal(k.y, 48);
});

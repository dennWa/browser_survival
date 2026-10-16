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

test('Ecken-Gleiten: knapp neben einer Tür vorbeilaufen schiebt einen hinein', async () => {
  const { Welt } = await import('../gemeinsam/welt/welt.js');
  const { bewegeKoerper } = await import('../gemeinsam/physik/bewegung.js');
  // Wand bei y = 3 mit einer 1 Kachel breiten Öffnung bei x = 3
  const welt = new Welt({ id: 't', name: 't', breite: 7, hoehe: 7, kachelGroesse: 32, kacheln: ['.......', '.......', '.......', '###.###', '.......', '.......', '.......'], raeume: [], objekte: [] });
  const k = { x: 3 * 32 + 16 + 12, y: 2 * 32 + 16 }; // 12 px neben der Türmitte
  for (let i = 0; i < 40; i++) bewegeKoerper(k, 0, 5, 12, welt);
  assert.ok(k.y > 4 * 32, `durch die Öffnung gekommen (y=${k.y.toFixed(1)}, x=${k.x.toFixed(1)})`);
  const k2 = { x: 3 * 32 + 16 + 30, y: 2 * 32 + 16 }; // zu weit daneben → bleibt an der Wand
  for (let i = 0; i < 40; i++) bewegeKoerper(k2, 0, 5, 12, welt);
  assert.ok(k2.y < 3 * 32, 'weit daneben: kein Durchkommen');
});

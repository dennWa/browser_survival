/** Editor 2.0, Schritt 7.6: Touch-Bauen (Fadenkreuz, Langdruck, Lupe, Griffe, Skalieren, Raster am Finger) */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TOUCH, touchArt, fadenkreuz, istLangdruck, lupenQuelle, touchGriffe, griffBei, auswahlRahmen, skaliereObjekt, touchRaster } from '../editor/kern/touchBauen.js';

test('Werkzeug-Verhalten am Finger', () => {
  assert.equal(touchArt('hand'), null);
  assert.equal(touchArt('platzieren', { art: 'objekt' }), 'bestaetigen');
  assert.equal(touchArt('platzieren', { art: 'marker' }), 'bestaetigen');
  assert.equal(touchArt('platzieren', { art: 'bauwerk' }), 'bestaetigen');
  assert.equal(touchArt('platzieren', { art: 'bauwerk' }, { wand: true }), 'zeichnen', 'Wände werden gezogen');
  assert.equal(touchArt('einfuegen'), 'bestaetigen');
  for (const w of ['malen', 'radierer', 'terrain', 'farbe', 'bereich', 'messen']) assert.equal(touchArt(w), 'zeichnen', w);
  for (const w of ['auswahl', 'zone', 'pipette', 'raumFuellen']) assert.equal(touchArt(w), 'direkt', w);
});

test('Fadenkreuz über dem Finger, am oberen Rand darunter', () => {
  assert.deepEqual(fadenkreuz(100, 300), { px: 100, py: 300 - TOUCH.versatz });
  const oben = fadenkreuz(50, 40, { oben: 24 });
  assert.ok(oben.py >= 24, 'nie über dem Lineal');
  assert.ok(oben.py >= 40, 'rutscht unter/auf den Finger');
});

test('Langdruck nur bei ruhigem Finger', () => {
  assert.ok(istLangdruck(600, 3));
  assert.ok(!istLangdruck(300, 0), 'zu kurz');
  assert.ok(!istLangdruck(900, 25), 'gezogen');
});

test('Lupe: Quelle zentriert um das Fadenkreuz, um den Faktor kleiner', () => {
  const q = lupenQuelle(200, 100, { groesse: 120, faktor: 3 });
  assert.deepEqual(q, { sx: 180, sy: 80, sw: 40, sh: 40 });
});

test('Griffe um die Auswahl, Treffer mit Daumen-Radius', () => {
  const g = touchGriffe({ x: 100, y: 100, b: 64, h: 32 }, { drehen: true, skalieren: true });
  assert.deepEqual(g.map((x) => x.id), ['bewegen', 'drehen', 'skalieren']);
  const bew = g.find((x) => x.id === 'bewegen');
  assert.ok(bew.y > 132 && bew.x === 132, 'Verschieben unter der Mitte');
  assert.ok(g.find((x) => x.id === 'drehen').y < 100, 'Drehen darüber');
  assert.equal(griffBei(g, bew.x + 10, bew.y - 8)?.id, 'bewegen');
  assert.equal(griffBei(g, 0, 0), null);
  // Winzige Auswahl: Verschieben und Skalieren überdecken sich nicht
  const klein = touchGriffe({ x: 50, y: 50, b: 2, h: 2 }, { skalieren: true });
  const [v, s] = [klein.find((x) => x.id === 'bewegen'), klein.find((x) => x.id === 'skalieren')];
  assert.ok(Math.hypot(v.x - s.x, v.y - s.y) >= TOUCH.griffRadius * 2);
  assert.deepEqual(touchGriffe(null), []);
  assert.deepEqual(touchGriffe({ x: 0, y: 0, b: 10, h: 10 }, { drehen: false }).map((x) => x.id), ['bewegen']);
});

test('Auswahl-Rahmen über mehrere Elemente', () => {
  const r = auswahlRahmen([
    { s: 'objekte', k: 1, wert: { x: 2, y: 3, b: 2, h: 1 } },
    { s: 'marker', k: '7,1', wert: { art: 'zombie' } },
    { s: 'klaenge', k: 2, wert: { art: 'global' } },
  ]);
  assert.deepEqual(r, { x: 2, y: 1, b: 6, h: 3 });
  assert.equal(auswahlRahmen([]), null);
});

test('Skalieren: Raster, Mindestgröße, Zonenrand, unverändert = gleiches Objekt', () => {
  const o = { typ: 'tisch', x: 4, y: 4, b: 2, h: 1 };
  assert.deepEqual(skaliereObjekt(o, 1.4, 0.6), { ...o, b: 3, h: 2 });
  assert.deepEqual(skaliereObjekt(o, -5, -5), { ...o, b: 1, h: 1 }, 'mindestens ein Raster');
  assert.deepEqual(skaliereObjekt(o, 30, 0, { max: { breite: 10, hoehe: 10 } }), { ...o, b: 6 }, 'nicht über den Rand');
  assert.equal(skaliereObjekt(o, 0.2, -0.2), o, 'kleiner Zug ändert nichts');
  assert.deepEqual(skaliereObjekt(o, 0.3, 0, { raster: 0.25 }), { ...o, b: 2.25 });
});

test('Raster am Finger', () => {
  assert.equal(touchRaster(true), TOUCH.feinRaster);
  assert.equal(touchRaster(false, 2, 1), 1);
  assert.equal(touchRaster(false, 0.5, 0.5), 0.5);
});

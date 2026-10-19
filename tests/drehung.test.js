/**
 * Frei gedrehte Objekte (Map-Editor 2.0, 5.5): gemeinsame Regel gemeinsam/welt/drehung.js – Rest-Winkel, Kacheln, Überlappung;
 * Vielfache von 90° verhalten sich exakt wie die alte achsparallele Regel; Welt blockiert gedreht.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drehLage, eigeneGroesse, ecken, huelle, enthaelt, bedeckteKacheln, ueberlappen } from '../gemeinsam/welt/drehung.js';

const alteRegel = (o, breite) => {
  const e = [];
  for (let ty = Math.floor(o.y); ty < Math.ceil(o.y + o.h); ty++)
    for (let tx = Math.floor(o.x); tx < Math.ceil(o.x + o.b); tx++) if (tx + 0.5 > o.x && tx + 0.5 < o.x + o.b && ty + 0.5 > o.y && ty + 0.5 < o.y + o.h) e.push(ty * breite + tx);
  return e;
};

test('drehLage: Viertel, Rest −45…45, quer', () => {
  assert.deepEqual(drehLage(0), { grad: 0, viertel: 0, rest: 0, quer: false });
  assert.deepEqual(drehLage(90), { grad: 90, viertel: 1, rest: 0, quer: true });
  assert.deepEqual(drehLage(-90), { grad: 270, viertel: 3, rest: 0, quer: true });
  assert.deepEqual(drehLage(30), { grad: 30, viertel: 0, rest: 30, quer: false });
  assert.deepEqual(drehLage(120), { grad: 120, viertel: 1, rest: 30, quer: true });
  assert.deepEqual(drehLage(350), { grad: 350, viertel: 0, rest: -10, quer: false });
  assert.deepEqual(eigeneGroesse({ b: 2, h: 1, drehung: 90 }), { b: 1, h: 2 });
  assert.deepEqual(eigeneGroesse({ b: 2, h: 1, drehung: 30 }), { b: 2, h: 1 });
});

test('Vielfache von 90°: Kacheln exakt wie die alte Regel (auch Bruchteile)', () => {
  for (const o of [{ x: 3, y: 4, b: 2, h: 1 }, { x: 51.5, y: 73.8, b: 2.2, h: 0.9 }, { x: 0.3, y: 0.3, b: 0.4, h: 0.4 }])
    for (const drehung of [0, 90, 180, 270, undefined]) assert.deepEqual(bedeckteKacheln({ ...o, drehung }, 200), alteRegel(o, 200));
});

test('Gedreht: 45° belegt die Raute, Hülle wächst, Punkt-Test im lokalen System', () => {
  const o = { x: 4, y: 4, b: 3, h: 1, drehung: 45 }; // Mitte (5.5, 4.5)
  const h = huelle(o);
  assert.ok(Math.abs(h.x1 - h.x0 - 2 * Math.SQRT1_2 * 2) < 1e-9);
  assert.ok(enthaelt(o, 5.5, 4.5));
  assert.ok(enthaelt(o, 6.3, 5.3), 'entlang der gedrehten Längsachse (unten rechts)');
  assert.ok(!enthaelt(o, 6.5, 3.5), 'quer zur Achse daneben');
  const k = bedeckteKacheln(o, 20).map((i) => [i % 20, Math.floor(i / 20)]);
  assert.deepEqual(k, [[4, 3], [5, 4], [6, 5]]);
  assert.equal(ecken(o).length, 4);
});

test('Überlappung (Trennachsen): achsparallel, gedreht, Berührung zählt nicht', () => {
  assert.ok(ueberlappen({ x: 0, y: 0, b: 2, h: 2 }, { x: 1, y: 1, b: 2, h: 2 }));
  assert.ok(!ueberlappen({ x: 0, y: 0, b: 2, h: 2 }, { x: 2, y: 0, b: 2, h: 2 }), 'Kante an Kante');
  // gedrehter Balken schneidet ein Quadrat neben sich, das seine achsparallele Grundfläche nicht berührt
  const balken = { x: 0, y: 2, b: 4, h: 0.5, drehung: 30 };
  assert.ok(ueberlappen(balken, { x: 3, y: 3, b: 0.5, h: 0.5 }));
  assert.ok(!ueberlappen(balken, { x: 0, y: 3.2, b: 0.6, h: 0.6 }));
});

test('Welt blockiert die Kacheln des gedrehten Objekts', async () => {
  const { Welt } = await import('../gemeinsam/welt/welt.js');
  const zeilen = Array.from({ length: 10 }, () => '.'.repeat(10));
  const welt = new Welt({ id: 't', name: 't', breite: 10, hoehe: 10, kacheln: zeilen, objekte: [{ typ: 'bank', x: 4, y: 4, b: 3, h: 1, blockiert: true, drehung: 45 }], kachelGroesse: 32 });
  assert.ok(welt.istBlockiert(6, 5) && welt.istBlockiert(4, 3));
  assert.ok(!welt.istBlockiert(6, 4), 'achsparallel wäre (6,4) belegt – gedreht nicht');
});

test('Editor: setzeDrehung tauscht b/h beim Wechsel längs/quer, Prüfung nutzt das gedrehte Rechteck', async () => {
  const { setzeDrehung, dreheOps } = await import('../editor/kern/bearbeiten.js');
  const { pruefeObjekt } = await import('../editor/kern/platzierung.js');
  const { neueZone } = await import('../editor/kern/zone.js');
  const bank = { typ: 'bank', x: 4, y: 4, b: 2, h: 1, blockiert: true };
  const a = setzeDrehung(bank, 30);
  assert.deepEqual([a.b, a.h, a.x, a.y, a.drehung], [2, 1, 4, 4, 30], '30°: gleiche Grundfläche, nur Rest-Winkel');
  const q = setzeDrehung(bank, 100);
  assert.deepEqual([q.b, q.h, q.x, q.y, q.drehung], [1, 2, 4.5, 3.5, 100], '100°: quer → b/h um die Mitte getauscht');
  assert.equal('drehung' in setzeDrehung({ ...bank, drehung: 30 }, 360), false);
  const lampe = setzeDrehung({ typ: 'licht', art: 'kegel', richtung: 90, x: 1, y: 1, b: 1, h: 1 }, 15);
  assert.equal(lampe.richtung, 105);
  const { ops } = dreheOps(null, [{ s: 'objekte', k: 1, wert: bank }, { s: 'bauwerke', k: 2, wert: { typ: 'zaun', drehung: 0 } }], 15);
  assert.equal(ops.length, 1, 'Bauwerke nur in 90°-Schritten');
  assert.equal(ops[0].neu.drehung, 15);
  // Prüfung: Wand neben dem Objekt – achsparallel frei, um 45° gedreht stößt der Balken an
  const k = neueZone({ id: 'frei', breite: 12, hoehe: 12 });
  k.anwenden([{ s: 'kachel', i: k.index(6, 5), neu: '#' }]);
  const balken = { typ: 'bank', x: 3, y: 4, b: 3, h: 1, blockiert: true }; // Mitte (4.5, 4.5)
  assert.ok(pruefeObjekt(k, balken).ok, 'achsparallel: Wand bei (6,5) nicht berührt');
  assert.ok(!pruefeObjekt(k, { ...balken, x: 4, drehung: 45 }).ok, 'gedreht 45°: reicht unten rechts in die Wand (6,5)');
  assert.ok(!pruefeObjekt(k, { ...balken, x: -0.2, drehung: 45 }).ok, 'Ecke ragt aus der Zone');
});

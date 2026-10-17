import test from 'node:test';
import assert from 'node:assert/strict';
import { baueIndex, parseDateiname, parseLautstaerke, EREIGNISSE } from '../client/audio/eigeneSounds.js';

test('Dateinamen: Ereignis + optionale Variantennummer', () => {
  assert.deepEqual(parseDateiname('baum_faellt.ogg'), { ereignis: 'baum_faellt', nummer: 0 });
  assert.deepEqual(parseDateiname('hack_holz_3.MP3'), { ereignis: 'hack_holz', nummer: 3 });
  assert.equal(parseDateiname('lautstaerke.txt'), null);
});

test('Lautstärke-Datei: Kommentare, Komma, Fehlerzeilen', () => {
  const w = [];
  const l = parseLautstaerke('# x\npistole 60\nbaum_faellt = 80 # laut\nmist\nleer -5\ntuer_zu 999', w);
  assert.deepEqual(l, { pistole: 60, baum_faellt: 80, tuer_zu: 300 });
  assert.equal(w.length, 2);
});

test('Index: Varianten sortiert, Lautstärke, Tippfehler-Warnung', () => {
  const { index, warnungen } = baueIndex(['hack_holz_10.ogg', 'hack_holz_2.ogg', 'hack_holz_1.ogg', 'baum_faelt.wav', 'README.md'], 'hack_holz 50\npistole 70');
  assert.deepEqual(index.hack_holz, { dateien: ['hack_holz_1.ogg', 'hack_holz_2.ogg', 'hack_holz_10.ogg'], lautstaerke: 0.5 });
  assert.deepEqual(index.pistole, { dateien: [], lautstaerke: 0.7 });
  assert.equal(warnungen.length, 1);
  assert.match(warnungen[0], /baum_faelt/);
});

test('Ereignisliste deckt Hauptsounds ab', () => {
  for (const n of ['baum_faellt', 'hack_holz', 'pistole', 'tuer_zu']) assert.ok(n in EREIGNISSE);
});

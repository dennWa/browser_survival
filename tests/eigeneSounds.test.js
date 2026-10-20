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

test('Phase 10.2: Gruppen, Schleifen, Einstellungen im Index', async () => {
  const { SOUND_GRUPPEN, LOOP_EREIGNISSE, pruefeSoundEinstellungen } = await import('../client/audio/eigeneSounds.js');
  for (const [name, [gruppe]] of Object.entries(EREIGNISSE)) assert.ok(SOUND_GRUPPEN.includes(gruppe), `${name}: ${gruppe}`);
  for (const n of ['wind', 'regen', 'nacht', 'motor', 'hase_flucht', 'hase_tod', 'ui_klick', 'inventar_auf', 'inventar_zu']) assert.ok(n in EREIGNISSE, n);
  assert.deepEqual([...LOOP_EREIGNISSE].sort(), ['motor', 'nacht', 'regen', 'wind']);
  const w = [];
  assert.deepEqual(pruefeSoundEinstellungen({ pistole: { lautstaerke: 9, streuung: 0.1, loop: 'ja' }, '../x': {}, wind: { loop: true } }, w), { pistole: { lautstaerke: 3, streuung: 0.1 }, wind: { loop: true } });
  assert.equal(w.length, 1);
  const { index } = baueIndex(['wind.ogg'], 'wind 50', { wind: { lautstaerke: 0.8, loop: true } });
  assert.deepEqual(index.wind, { dateien: ['wind.ogg'], lautstaerke: 0.8, loop: true });
  // Jedes Ereignis hat einen synthetischen Standard (außer bewusst stummen)
  const { SYNTH_EREIGNISSE } = await import('../client/audio/sound.js');
  for (const [name, [, , opt]] of Object.entries(EREIGNISSE)) if (!opt?.stumm) assert.ok(SYNTH_EREIGNISSE.includes(name), `kein Rezept: ${name}`);
});

test('Musik-Index: Reihenfolge, Zufall, Hauptmenü', async () => {
  const { baueMusikIndex, musikOrdner, sortiereMusik } = await import('../client/audio/musikIndex.js');
  const i = baueMusikIndex({ hauptmenue: ['b.ogg', 'a.mp3', 'x.txt'], stadtrand: ['c.ogg'] }, { hauptmenue: { reihenfolge: ['b.ogg', 'weg.ogg'], zufall: false } });
  assert.deepEqual(i.hauptmenue, ['b.ogg', 'a.mp3']);
  assert.deepEqual(i._optionen, { hauptmenue: { zufall: false } });
  assert.deepEqual(musikOrdner(i), ['hauptmenue', 'stadtrand']);
  assert.deepEqual(sortiereMusik(['t10.ogg', 't2.ogg']), ['t2.ogg', 't10.ogg']);
});

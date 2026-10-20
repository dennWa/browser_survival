import test from 'node:test';
import assert from 'node:assert/strict';
import { EREIGNISSE } from '../client/audio/eigeneSounds.js';
import { SYNTH_EREIGNISSE } from '../client/audio/sound.js';
import { AUDIO_GRUPPEN, baueKatalog, filtereKatalog, zaehleGruppen, zielPfad, setzeSoundEinstellung, setzeMusikEinstellung, verschiebe, saubererName, lesbarerName } from '../editor/kern/audioKatalog.js';
import { bearbeite, pruefeBearbeitung, istUnveraendert, ergebnisDauer, kodiereWav, leseWav, wellenformMinMax, spitze, NORMAL_SPITZE } from '../editor/kern/audioSchnitt.js';
import { oggCrc, oggSeite, baueOggOpus, preSkipAus, opusHead } from '../editor/kern/oggOpus.js';
import { pruefeSchreibPfad } from '../werkzeuge/editor/pfade.mjs';

const daten = {
  eigene: { pistole: { dateien: ['pistole.ogg', 'pistole_2.ogg'], lautstaerke: 0.8 }, wind: { dateien: ['wind.ogg'], lautstaerke: 1 } },
  einstellungen: { hack_holz: { streuung: 0.1 } },
  samples: { pistole: ['pistole_0.ogg'], hack_holz: ['hack_holz_0.ogg', 'hack_holz_1.ogg'] },
  synth: SYNTH_EREIGNISSE,
  musik: { alle: [], hauptmenue: ['b.ogg', 'a.ogg'], stadtrand: [], _optionen: { hauptmenue: { zufall: false } } },
  zonen: { stadtrand: 'Stadtrand', waldweg: 'Waldweg' },
  karten: [{ id: 'waldweg', name: 'Waldweg', klaenge: [{ name: 'Bach', datei: 'audio/karten/waldweg/bach.ogg', art: 'bereich' }] }],
};

test('Katalog: jedes Ereignis genau einmal, Gruppen, Quellen-Vorrang eigen > Sample > Synthese', () => {
  const k = baueKatalog(daten);
  const ereignisse = k.filter((e) => e.art === 'ereignis');
  assert.equal(ereignisse.length, Object.keys(EREIGNISSE).length);
  for (const e of k) assert.ok(AUDIO_GRUPPEN.some((g) => g.id === e.gruppe), e.id);
  const pistole = k.find((e) => e.id === 'ereignis:pistole');
  assert.equal(pistole.quelle, 'eigen');
  assert.deepEqual(pistole.dateien, ['client/audio/eigene/pistole.ogg', 'client/audio/eigene/pistole_2.ogg']);
  assert.equal(pistole.pegel, 0.8);
  assert.equal(pistole.gruppe, 'kampf');
  const holz = k.find((e) => e.id === 'ereignis:hack_holz');
  assert.equal(holz.quelle, 'sample');
  assert.equal(holz.varianten, 2);
  assert.equal(holz.streuung, 0.1);
  assert.equal(holz.geaendert, true);
  assert.equal(k.find((e) => e.id === 'ereignis:nachladen').quelle, 'synth');
  assert.equal(k.find((e) => e.id === 'ereignis:hase_tod').quelle, 'keine');
  assert.equal(k.find((e) => e.id === 'ereignis:wind').loop, true);
  assert.equal(k.find((e) => e.id === 'ereignis:hase_flucht').gruppe, 'tiere');
  // Musik: Ordner hauptmenue/alle/Zonen, Titel in Index-Reihenfolge
  const ordner = k.find((e) => e.id === 'musikOrdner:hauptmenue');
  assert.deepEqual(ordner.titel, ['b.ogg', 'a.ogg']);
  assert.equal(ordner.zufall, false);
  assert.ok(k.some((e) => e.id === 'musikOrdner:waldweg'), 'Zone ohne Index-Eintrag erscheint trotzdem');
  assert.equal(k.find((e) => e.id === 'musik:hauptmenue/a.ogg').position, 1);
  const bach = k.find((e) => e.art === 'kartenklang');
  assert.deepEqual(bach.dateien, ['client/audio/karten/waldweg/bach.ogg']);
});

test('Katalog: Suche, Filter, Zähler', () => {
  const k = baueKatalog(daten);
  assert.ok(filtereKatalog(k, { suche: 'stöhnen' }).some((e) => e.ereignis === 'zombie_stoehnen'));
  assert.ok(filtereKatalog(k, { suche: 'zombie stoehnen' }).every((e) => /zombie/i.test(e.name + e.ereignis + e.wann)));
  assert.ok(filtereKatalog(k, { filter: 'synth' }).every((e) => e.quelle === 'synth'));
  assert.ok(filtereKatalog(k, { filter: 'fehlend' }).some((e) => e.ereignis === 'hase_tod'));
  assert.deepEqual(filtereKatalog(k, { filter: 'geaendert', gruppe: 'kampf' }).map((e) => e.ereignis), ['pistole']);
  const n = zaehleGruppen(k);
  assert.equal(n.musik, 2);
  assert.equal(n.karten, 1);
  assert.equal(lesbarerName('zombie_stoehnen'), 'Zombie stöhnen');
  assert.equal(lesbarerName('feuer_an'), 'Feuer an');
});

test('Ziel-Pfade: Ersatz, Variante, Musik-Titel, Karten-Klang – alle vom Server erlaubt', () => {
  const k = baueKatalog(daten);
  const p = k.find((e) => e.id === 'ereignis:pistole');
  assert.deepEqual(zielPfad(p, { endung: 'ogg', ersetzen: true }), { pfad: 'client/audio/eigene/pistole.ogg', loeschen: ['client/audio/eigene/pistole_2.ogg'] });
  assert.equal(zielPfad(p, { endung: 'ogg', ersetzen: false }).pfad, 'client/audio/eigene/pistole_3.ogg');
  assert.equal(zielPfad(k.find((e) => e.id === 'ereignis:nachladen'), { endung: 'wav', ersetzen: false }).pfad, 'client/audio/eigene/nachladen_1.wav');
  const o = k.find((e) => e.id === 'musikOrdner:hauptmenue');
  assert.equal(zielPfad(o, { endung: 'ogg', name: 'Mein Lied: Teil/1.mp3' }).pfad, 'client/musik/hauptmenue/Mein Lied Teil 1.ogg');
  assert.equal(zielPfad(o, { endung: 'ogg', name: 'b' }).pfad, 'client/musik/hauptmenue/b (2).ogg');
  const t = k.find((e) => e.id === 'musik:hauptmenue/a.ogg');
  assert.deepEqual(zielPfad(t, { endung: 'ogg' }).loeschen, []);
  const bach = k.find((e) => e.art === 'kartenklang');
  assert.ok(zielPfad(bach, { endung: 'wav' }).fehler);
  assert.equal(zielPfad(bach, { endung: 'ogg' }).pfad, 'client/audio/karten/waldweg/bach.ogg');
  assert.ok(zielPfad(p, { endung: 'exe' }).fehler);
  for (const pfad of ['client/audio/eigene/pistole_3.ogg', 'client/musik/hauptmenue/Mein Lied Teil 1.ogg', 'client/musik/hauptmenue/b (2).ogg', 'client/audio/karten/waldweg/bach.ogg']) assert.ok(pruefeSchreibPfad(pfad).ok, pfad);
  assert.equal(saubererName('../../böse'), 'böse');
  assert.equal(saubererName('...'), 'titel');
});

test('Einstellungen: Standardwerte fallen weg, Musik-Reihenfolge', () => {
  let e = setzeSoundEinstellung({}, 'pistole', { lautstaerke: 1.5, streuung: 0 });
  assert.deepEqual(e, { pistole: { lautstaerke: 1.5 } });
  e = setzeSoundEinstellung(e, 'pistole', { lautstaerke: 1 });
  assert.deepEqual(e, {});
  assert.deepEqual(setzeSoundEinstellung({ a: { streuung: 0.2 } }, 'a', null), {});
  let m = setzeMusikEinstellung({}, 'hauptmenue', { reihenfolge: ['b.ogg', 'a.ogg'] });
  m = setzeMusikEinstellung(m, 'hauptmenue', { zufall: false });
  assert.deepEqual(m, { hauptmenue: { reihenfolge: ['b.ogg', 'a.ogg'], zufall: false } });
  assert.deepEqual(setzeMusikEinstellung(m, 'hauptmenue', { zufall: true, reihenfolge: [] }), {});
  assert.deepEqual(verschiebe(['a', 'b', 'c'], 0, 1), ['b', 'a', 'c']);
  assert.deepEqual(verschiebe(['a', 'b'], 0, -1), ['a', 'b']);
});

const RATE = 1000;
const rampe = (n) => Float32Array.from({ length: n }, (_, i) => i / n);

test('Schnitt: Start/Ende, Fades, Lautstärke, Normalisieren', () => {
  const q = { kanaele: [rampe(2000), rampe(2000)], rate: RATE };
  const r = bearbeite(q, { start: 0.5, ende: 1.5 });
  assert.equal(r.kanaele[0].length, 1000);
  assert.ok(Math.abs(r.kanaele[0][0] - 0.25) < 1e-6);
  const f = bearbeite(q, { start: 0, ende: 1, fadeIn: 0.1, fadeOut: 0.2 });
  assert.equal(f.kanaele[0][0], 0);
  assert.equal(f.kanaele[0].at(-1), 0);
  const n = bearbeite({ kanaele: [Float32Array.from([0.1, -0.2, 0.05])], rate: RATE }, { normalisieren: true });
  assert.ok(Math.abs(spitze(n.kanaele) - NORMAL_SPITZE) < 1e-6);
  const laut = bearbeite({ kanaele: [Float32Array.from([0.9, -0.9])], rate: RATE }, { gainDb: 12 });
  assert.equal(laut.geklippt, 2);
  assert.equal(laut.kanaele[0][0], 1);
  // Original bleibt unverändert
  assert.ok(Math.abs(q.kanaele[0][1000] - 0.5) < 1e-6);
  assert.ok(istUnveraendert({}, 2));
  assert.ok(!istUnveraendert({ start: 0.1 }, 2));
  assert.equal(pruefeBearbeitung({ start: 5, ende: 1, fadeIn: 9 }, 2).start < 2, true);
});

test('Schnitt: Loop-Überblendung ist nahtlos (Ende geht in den Anfang über)', () => {
  // Sinus, dessen Periode NICHT in die Länge passt → ohne Überblendung Sprung am Loop-Punkt
  const n = 1000;
  const x = Float32Array.from({ length: n }, (_, i) => Math.sin(i * 0.137));
  const roh = Math.abs(x[n - 1] - x[0]);
  const r = bearbeite({ kanaele: [x], rate: RATE }, { loop: true, ueberblendung: 0.1 });
  const y = r.kanaele[0];
  assert.equal(y.length, n - 100);
  assert.equal(ergebnisDauer({ loop: true, ueberblendung: 0.1 }, 1), 0.9);
  // Übergang y[ende] → y[0] so glatt wie ein normaler Schritt des Signals
  const sprung = Math.abs(y[y.length - 1] - y[0]);
  assert.ok(sprung < 0.2, `Sprung ${sprung} (roh ${roh})`);
  for (let i = 1; i < y.length; i++) assert.ok(Math.abs(y[i] - y[i - 1]) < 0.3, `Knick bei ${i}`);
});

test('WAV hin und zurück, Wellenform', () => {
  const k = [Float32Array.from([0, 0.5, -0.5, 1]), Float32Array.from([0, -0.25, 0.25, -1])];
  const w = leseWav(kodiereWav({ kanaele: k, rate: 8000 }));
  assert.equal(w.rate, 8000);
  assert.equal(w.kanaele.length, 2);
  for (let i = 0; i < 4; i++) assert.ok(Math.abs(w.kanaele[0][i] - k[0][i]) < 1e-3 && Math.abs(w.kanaele[1][i] - k[1][i]) < 1e-3);
  const wf = wellenformMinMax(Float32Array.from([0, 1, -1, 0.5]), 2);
  assert.deepEqual([...wf], [0, 1, -1, 0.5]);
});

test('Ogg/Opus: Seiten-CRC, Kopf, Granulposition = preSkip + Länge', () => {
  // CRC eines leeren Ogg-Kopfes mit bekanntem Wert (selbst berechnet und gegen libogg-Logik gestellt: CRC über Seite mit 0 im CRC-Feld)
  assert.equal(oggCrc(new Uint8Array([])), 0);
  assert.equal(oggCrc(new TextEncoder().encode('123456789')), 0x89a1897f); // CRC-32/MPEG-2 ohne Endinvertierung, Start 0
  const s = oggSeite({ pakete: [new Uint8Array(300)], granule: 960, serie: 7, nummer: 3, typ: 4 });
  assert.equal(String.fromCharCode(...s.subarray(0, 4)), 'OggS');
  assert.equal(s[26], 2); // 300 = 255 + 45 → 2 Segmente
  assert.deepEqual([...s.subarray(27, 29)], [255, 45]);
  // CRC in der Seite stimmt
  const kopie = s.slice();
  kopie.set([0, 0, 0, 0], 22);
  assert.equal(new DataView(s.buffer).getUint32(22, true), oggCrc(kopie));
  const pakete = Array.from({ length: 10 }, () => ({ daten: new Uint8Array(100), samples: 960 }));
  const datei = baueOggOpus(pakete, { kanaele: 2, preSkip: 312, eingangsRate: 44100, laenge: 9000 });
  // letzte Seite: EOS + Granule 9312
  let o = 0;
  let letzte = null;
  const granules = [];
  while (o < datei.length) {
    const v = new DataView(datei.buffer, o);
    letzte = { typ: datei[o + 5], granule: Number(v.getBigUint64(6, true)) };
    granules.push(letzte.granule);
    const seg = datei[o + 26];
    let l = 0;
    for (let i = 0; i < seg; i++) l += datei[o + 27 + i];
    o += 27 + seg + l;
  }
  assert.equal(o, datei.length);
  assert.equal(letzte.typ, 4);
  assert.equal(letzte.granule, 9312);
  assert.equal(preSkipAus(opusHead({ kanaele: 1, preSkip: 480, eingangsRate: 48000 })), 480);
  assert.equal(preSkipAus(new Uint8Array(5)), null);
});

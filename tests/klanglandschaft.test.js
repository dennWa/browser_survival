/**
 * Phase 4 (Audio-Engine): gemeinsame Regeln der Klanglandschaft – Feldprüfung, Abfall/Panorama, Auslöser-Bedingungen,
 * Wiedergabe-Automat (Loop, Intervall, Einmal + Abklingzeit) und Tonhöhen-Streuung deterministisch mit festem Zufall.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pruefeKlang, neuerKlang, pegel, bedingung, KlangSteuerung, zufallMit, tonhoehe, schnittDauer } from '../gemeinsam/audio/klanglandschaft.js';

const AUDIO = 'a_0123abcd_1z';

test('pruefeKlang: Quelle Pflicht, Felder begrenzt, Unbekanntes fällt weg', () => {
  assert.equal(pruefeKlang({ art: 'punkt' }), null, 'ohne Quelle');
  assert.equal(pruefeKlang({ audio: 'bad id' }), null);
  assert.equal(pruefeKlang({ datei: '../../etc/passwd.mp3' }), null);
  const k = pruefeKlang({ audio: AUDIO, art: 'punkt', x: 500, y: -3, innen: 5, aussen: 2, lautstaerke: 9, pitch: 80, bus: 'xx', ausloeser: 'boese', intervall: [20, 3], start: 2, ende: 1, boese: 1 }, { breite: 40, hoehe: 30 });
  assert.deepEqual([k.x, k.y, k.innen, k.aussen, k.lautstaerke, k.pitch, k.bus, k.ausloeser, k.intervall, k.ende], [40, 0, 5, 5.5, 2, 50, 'effekte', 'immer', [20, 20], 0]);
  assert.equal(k.boese, undefined);
  const b = pruefeKlang({ daten: 'data:audio/ogg;base64,AAAA', art: 'bereich', x: 38, y: 0, b: 10, h: 5 }, { breite: 40, hoehe: 30 });
  assert.equal(b.b, 2, 'Bereich bleibt in der Zone');
  assert.ok(pruefeKlang({ datei: 'audio/karten/wald/1.ogg', art: 'global', ersetztMusik: true }).ersetztMusik);
  const neu = pruefeKlang({ ...neuerKlang('bereich'), audio: AUDIO });
  assert.equal(neu.ausloeser, 'drinnen');
  assert.equal(neu.bus, 'atmosphaere');
});

test('pegel: Punkt fällt linear zwischen innen und außen ab, Panorama nach Seite; Bereich blendet am Rand weich', () => {
  const p = { art: 'punkt', x: 10, y: 10, innen: 2, aussen: 10 };
  assert.equal(pegel(p, 11, 10).faktor, 1);
  assert.equal(pegel(p, 16, 10).faktor, 0.5);
  assert.equal(pegel(p, 25, 10).faktor, 0);
  assert.ok(pegel(p, 4, 10).pan > 0.5, 'Quelle rechts vom Hörer → rechts');
  assert.ok(pegel(p, 16, 10).pan < -0.5);
  const b = { art: 'bereich', x: 0, y: 0, b: 10, h: 10, rand: 2 };
  assert.equal(pegel(b, 5, 5).faktor, 1);
  assert.equal(pegel(b, 1, 5).faktor, 0.5);
  assert.equal(pegel(b, -1, 5).faktor, 0);
  assert.equal(pegel({ art: 'global' }, 99, 99).faktor, 1);
});

test('bedingung: Auslöser drinnen/verlassen/Nähe/Tag/Nacht/Kampf/Horde/Zone', () => {
  const b = { art: 'bereich', x: 0, y: 0, b: 10, h: 10, rand: 2, naehe: 3 };
  const k = (ausloeser, extra = {}) => ({ ...b, ausloeser, ...extra });
  const drin = { hx: 5, hy: 5 };
  const draussen = { hx: 20, hy: 5 };
  assert.ok(bedingung(k('drinnen'), drin));
  assert.ok(!bedingung(k('drinnen'), draussen));
  assert.ok(bedingung(k('verlassen'), draussen));
  assert.ok(bedingung(k('naehe'), { hx: 12, hy: 5 }));
  assert.ok(!bedingung(k('naehe'), { hx: 14, hy: 5 }));
  assert.ok(bedingung(k('nacht'), { ...drin, nacht: true }));
  assert.ok(!bedingung(k('tag'), { ...drin, nacht: true }));
  assert.ok(bedingung(k('kampf'), { ...drin, kampfSeit: 2 }));
  assert.ok(!bedingung(k('kampf'), { ...drin, kampfSeit: 20 }));
  assert.ok(bedingung(k('horde'), { ...drin, horde: true }));
  assert.ok(bedingung({ art: 'global', ausloeser: 'zone' }, { hx: 0, hy: 0, zoneSeit: 0.2 }));
  assert.ok(!bedingung({ art: 'global', ausloeser: 'zone' }, { hx: 0, hy: 0, zoneSeit: 3 }));
});

test('KlangSteuerung: Loop startet/stoppt mit der Bedingung', () => {
  const s = new KlangSteuerung({ art: 'bereich', x: 0, y: 0, b: 10, h: 10, rand: 1, ausloeser: 'drinnen', wiedergabe: 'loop', intervall: [5, 5], pitch: 0, start: 0, ende: 0 });
  assert.deepEqual(s.schritt(0.1, { hx: 20, hy: 5 }), []);
  assert.deepEqual(s.schritt(0.1, { hx: 5, hy: 5 }), [{ art: 'start', tonhoehe: 1, loop: true }]);
  assert.deepEqual(s.schritt(0.1, { hx: 5, hy: 5 }), []);
  assert.deepEqual(s.schritt(0.1, { hx: 20, hy: 5 }), [{ art: 'stopp' }]);
});

test('KlangSteuerung: Intervall mit Zufallspausen, Einmal mit Abklingzeit, Tonhöhe ±% deterministisch', () => {
  const k = { art: 'global', ausloeser: 'immer', wiedergabe: 'intervall', intervall: [2, 4], pitch: 10, start: 0, ende: 1 };
  const s = new KlangSteuerung(k, { zufall: zufallMit(7), dauer: 3 });
  const starts = [];
  for (let t = 0; t < 30; t += 0.1) for (const b of s.schritt(0.1, { hx: 0, hy: 0 })) if (b.art === 'start') starts.push([Math.round(t * 10) / 10, b.tonhoehe]);
  assert.ok(starts.length >= 6 && starts.length <= 11, `Durchgänge: ${starts.length}`);
  for (let i = 1; i < starts.length; i++) {
    const abstand = starts[i][0] - starts[i - 1][0];
    assert.ok(abstand >= 2.9 && abstand <= 5.2, `Pause + 1 s Durchgang: ${abstand}`);
  }
  assert.ok(starts.every(([, p]) => p >= 0.9 && p <= 1.1));
  assert.ok(new Set(starts.map(([, p]) => p)).size > 1, 'Tonhöhe variiert');
  // gleicher Startwert → gleiche Folge
  const s2 = new KlangSteuerung(k, { zufall: zufallMit(7), dauer: 3 });
  const starts2 = [];
  for (let t = 0; t < 30; t += 0.1) for (const b of s2.schritt(0.1, { hx: 0, hy: 0 })) if (b.art === 'start') starts2.push([Math.round(t * 10) / 10, b.tonhoehe]);
  assert.deepEqual(starts2, starts);

  const e = new KlangSteuerung({ art: 'punkt', x: 0, y: 0, innen: 1, aussen: 5, naehe: 2, ausloeser: 'naehe', wiedergabe: 'einmal', abklingzeit: 10, intervall: [1, 1], pitch: 0, start: 0, ende: 0 });
  const nah = { hx: 1, hy: 0 };
  const fern = { hx: 4, hy: 0 };
  assert.equal(e.schritt(0.1, nah).length, 1, 'Annäherung → einmal');
  e.fertig();
  assert.equal(e.schritt(0.1, nah).length, 0, 'nicht erneut, solange nah');
  e.schritt(0.1, fern);
  assert.equal(e.schritt(0.1, nah).length, 0, 'Abklingzeit läuft noch');
  for (let i = 0; i < 100; i++) e.schritt(0.1, fern);
  assert.equal(e.schritt(0.1, nah).length, 1, 'nach Abklingzeit wieder');
  assert.equal(tonhoehe({ pitch: 0 }), 1);
  assert.equal(schnittDauer({ start: 1, ende: 0 }, 5), 4);
  assert.equal(schnittDauer({ start: 1, ende: 3 }, 5), 2);
});

test('Editor: Klänge rund um Format, Bibliothek und karte:editor (Dateien ablegen, verwaiste löschen)', async () => {
  const { mkdtempSync, existsSync, readFileSync, writeFileSync, mkdirSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');
  const { neueZone } = await import('../editor/kern/zone.js');
  const { nachDefinition, ausDefinition } = await import('../editor/kern/format.js');
  const B = await import('../editor/kern/bibliothek.js');
  const { verarbeiteKarte } = await import('../server/spiel/karten/kartenLader.js');
  const { schreibeKlaenge } = await import('../werkzeuge/karten/eigeneKlaenge.mjs');
  const { markerSchluessel } = await import('../editor/kern/karte.js');
  // kleinste WAV-Datei (44 Byte Kopf + 4 Byte Daten)
  const wav = new Uint8Array(48);
  wav.set([...'RIFF'].map((c) => c.charCodeAt(0)), 0);
  wav.set([...'WAVEfmt '].map((c) => c.charCodeAt(0)), 8);
  const id = B.assetId(wav, 'a');
  const k = neueZone({ id: 'klangzone', breite: 20, hoehe: 15 });
  k.anwenden([
    { s: 'klaenge', k: 1, neu: neuerKlang('punkt', { name: 'Huhn', audio: id, x: 5, y: 5 }) },
    { s: 'klaenge', k: 2, neu: neuerKlang('bereich', { name: 'Wald', audio: id, x: 2, y: 2, b: 8, h: 6 }) },
    { s: 'marker', k: markerSchluessel(1, 1), neu: { art: 'start' } },
  ]);
  try {
    // ohne Datei in der Bibliothek: Spiel bekommt nichts (nur Editor-ID)
    assert.equal(verarbeiteKarte(nachDefinition(k)).daten.klaenge, undefined);
    B.setzeAudioQuelle((x) => (x === id ? B.bytesZuAudioUrl(wav, 'wav') : null));
    const def = nachDefinition(k);
    assert.ok(def.klaenge.every((x) => x.daten.startsWith('data:audio/wav;base64,')));
    assert.equal(verarbeiteKarte(def).daten.klaenge.length, 2);
    // Datei-Import: eingebettete daten → Bibliothek, Klang verweist danach per ID
    const { karte: zurueck } = ausDefinition(JSON.parse(JSON.stringify(def)));
    assert.equal(zurueck.s('klaenge').size, 2);
    const neu = B.uebernimmEingebetteteAudio(zurueck);
    assert.equal(neu.length, 1, 'gleiche Datei nur einmal');
    assert.ok([...zurueck.s('klaenge').values()].every((x) => x.audio === id && !x.daten));
    // karte:editor
    const ordner = mkdtempSync(path.join(tmpdir(), 'klang-'));
    mkdirSync(path.join(ordner, 'audio/karten/klangzone'), { recursive: true });
    writeFileSync(path.join(ordner, 'audio/karten/klangzone/alt.ogg'), 'x');
    const { dateien, entfernt } = schreibeKlaenge(def, ordner);
    assert.deepEqual(dateien, [`audio/karten/klangzone/${id}.wav`]);
    assert.deepEqual(entfernt, ['audio/karten/klangzone/alt.ogg']);
    assert.ok(def.klaenge.every((x) => x.datei === dateien[0] && !x.daten && !x.audio));
    assert.deepEqual([...readFileSync(path.join(ordner, dateien[0]))], [...wav]);
    assert.equal(verarbeiteKarte(def).daten.klaenge[0].datei, dateien[0]);
    assert.ok(!existsSync(path.join(ordner, 'audio/karten/klangzone/alt.ogg')));
  } finally {
    B.setzeAudioQuelle(null);
  }
});

test('Prüfung: Klang ohne Datei in der Bibliothek, außerhalb, falscher Radius, zwei Musik-Ersatz', async () => {
  const { neueZone } = await import('../editor/kern/zone.js');
  const { validiere } = await import('../editor/kern/validierung.js');
  const B = await import('../editor/kern/bibliothek.js');
  const k = neueZone({ id: 'pruefklang', breite: 10, hoehe: 10 });
  k.anwenden([
    { s: 'klaenge', k: 1, neu: neuerKlang('punkt', { name: 'A', audio: AUDIO, x: 3, y: 3, innen: 4, aussen: 4 }) },
    { s: 'klaenge', k: 2, neu: neuerKlang('bereich', { name: 'B', audio: AUDIO, x: 8, y: 8, b: 5, h: 5 }) },
    { s: 'klaenge', k: 3, neu: neuerKlang('global', { name: 'M1', audio: AUDIO, ersetztMusik: true }) },
    { s: 'klaenge', k: 4, neu: neuerKlang('global', { name: 'M2', audio: AUDIO, ersetztMusik: true }) },
  ]);
  const codes = (p) => p.filter((x) => x.code.startsWith('klang') || x.text.includes('Ambiente')).map((x) => x.code);
  const ohne = codes(validiere(k));
  assert.equal(ohne.filter((c) => c === 'klang-fehlt').length, 4);
  assert.ok(ohne.includes('klang-radius'));
  assert.ok(ohne.includes('objekt-aussen'));
  assert.ok(ohne.includes('klang-musik'));
  B.setzeAudioQuelle((id) => (id === AUDIO ? 'data:audio/wav;base64,AAAA' : null));
  try {
    assert.ok(!codes(validiere(k)).includes('klang-fehlt'));
  } finally {
    B.setzeAudioQuelle(null);
  }
});

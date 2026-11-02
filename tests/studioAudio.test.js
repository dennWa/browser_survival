/**
 * Studio Phase 2 (Audio-Zentrale): Umgebungs-Regeln (gemeinsam/audio/umgebung.js, auch im Spiel), Mischpult, Pfade,
 * Zonen-Faktor/Musik-Überblendung in den Indexen, Projekt-Dateioperationen (Hauptprozess).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, cpSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { wetterSchichten, vorschauWetter, wetterZiel } from '../gemeinsam/audio/umgebung.js';
import { mischpult, wirksamerPegel, ereignisPfad, musikPfad } from '../studio/kern/audio.js';
import { baueIndex } from '../client/audio/eigeneSounds.js';
import { baueMusikIndex } from '../client/audio/musikIndex.js';
import { setzeMusikEinstellung, setzeSoundEinstellung } from '../editor/kern/audioKatalog.js';
import { Projekt } from '../studio/main/projekt.mjs';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('wetterSchichten: Gewitter = Starkregen, Schneezone = Schneesturm statt Sturm, drinnen gedämpft, Grillen nur ruhig', () => {
  const gewitter = wetterSchichten({ w: vorschauWetter('gewitter'), hell: 1, wetter: 'gewitter' });
  assert.ok(gewitter.regen_stark > 0.9 && gewitter.regen === 1 && gewitter.nacht === 0);
  const schnee = wetterSchichten({ w: vorschauWetter('schneesturm'), hell: 1, wetter: 'schneesturm', schneeZone: true });
  assert.ok(schnee.schneesturm > 0.9 && schnee.sturm === 0);
  const haus = wetterSchichten({ w: vorschauWetter('regen'), hell: 1, drinnen: true, imHaus: true, wetter: 'regen' });
  assert.equal(haus.regen, 0.2);
  assert.equal(haus.regen_dach, 1);
  assert.equal(haus.tag, 0);
  const nacht = wetterSchichten({ w: vorschauWetter('klar'), hell: 0.05, wetter: 'klar' });
  assert.ok(nacht.nacht > 0.9 && nacht.tag === 0);
  assert.deepEqual(wetterZiel('quatsch'), { regen: 0, schnee: 0, nebel: 0, sturm: 0, gewitter: 0 });
});

test('mischpult: alle Schichten in fester Reihenfolge, Wind läuft immer', () => {
  const m = mischpult({ wetter: 'sturm', tageszeit: 'tag' });
  assert.equal(m[0].name, 'wind');
  assert.ok(m.find((s) => s.name === 'wind').aktiv);
  assert.ok(m.find((s) => s.name === 'sturm').aktiv);
  assert.equal(m.find((s) => s.name === 'regen').aktiv, false);
});

test('Zonen-Faktor: einstellungen → Index → wirksamer Pegel; Musik-Überblendung/Pause im Index', () => {
  const einst = setzeSoundEinstellung({}, 'wind', { lautstaerke: 0.5, zonen: { schneeland: 2, waldweg: 1 } });
  assert.deepEqual(einst, { wind: { lautstaerke: 0.5, zonen: { schneeland: 2 } } });
  assert.equal(wirksamerPegel(einst, 'wind', 'schneeland'), 1);
  assert.equal(wirksamerPegel(einst, 'wind', 'waldweg'), 0.5);
  assert.deepEqual(baueIndex([], '', einst).index.wind.zonen, { schneeland: 2 });
  const m = setzeMusikEinstellung({}, 'waldweg', { ueberblendung: 8, pause: 0, zufall: false });
  const idx = baueMusikIndex({ waldweg: ['a.ogg'] }, m);
  assert.deepEqual(idx._optionen.waldweg, { zufall: false, ueberblendung: 8, pause: 0 });
  assert.equal(baueMusikIndex({ waldweg: ['a.ogg'] }, setzeMusikEinstellung(m, 'waldweg', { ueberblendung: 3, pause: 4, zufall: true }))._optionen, undefined, 'Standardwerte fliegen raus');
});

test('Pfade: nächste Variante, Ersetzen, freier Musik-Titel', () => {
  assert.equal(ereignisPfad('pistole', ['client/audio/eigene/pistole.ogg', 'client/audio/eigene/pistole_3.ogg']), 'client/audio/eigene/pistole_4.ogg');
  assert.equal(ereignisPfad('pistole', [], 'wav', { ersetzen: true }), 'client/audio/eigene/pistole.wav');
  assert.throws(() => ereignisPfad('gibtsnicht'));
  assert.equal(musikPfad('waldweg', 'Ruhe', ['client/musik/waldweg/Ruhe.ogg']), 'client/musik/waldweg/Ruhe (2).ogg');
  assert.throws(() => musikPfad('../x', 'a'));
});

test('Projekt: Audio schreiben/kopieren/löschen (Papierkorb), nur freigegebene Ordner, Einstellungen + Indexe', async () => {
  const tmp = mkdtempSync(path.join(tmpdir(), 'studio-audio-'));
  try {
    cpSync(path.join(WURZEL, 'server/spiel/karten/kartenLader.js'), path.join(tmp, 'server/spiel/karten/kartenLader.js'));
    for (const d of ['werkzeuge/audio', 'client/audio']) mkdirSync(path.join(tmp, d), { recursive: true });
    cpSync(path.join(WURZEL, 'werkzeuge/audio/indexBauen.mjs'), path.join(tmp, 'werkzeuge/audio/indexBauen.mjs'));
    for (const d of ['eigeneSounds.js', 'musikIndex.js']) cpSync(path.join(WURZEL, 'client/audio', d), path.join(tmp, 'client/audio', d));
    mkdirSync(path.join(tmp, 'client/audio/eigene'), { recursive: true });
    mkdirSync(path.join(tmp, 'client/assets/eigene'), { recursive: true });
    const p = new Projekt(tmp);
    await assert.rejects(() => p.schreibeAudio({ pfad: 'client/assets/boese.ogg', bytes: new Uint8Array([1]) }), /nicht erlaubt/);
    await assert.rejects(() => p.schreibeAudio({ pfad: 'client/audio/eigene/../../x.ogg', bytes: new Uint8Array([1]) }), /nicht erlaubt/);
    const r = await p.schreibeAudio({ pfad: 'client/audio/eigene/pistole_1.ogg', bytes: new Uint8Array([79, 103, 103, 83]), credits: { urheber: 'Ich', lizenz: 'CC0' } });
    assert.equal(r.groesse, 4);
    assert.deepEqual(JSON.parse(readFileSync(path.join(tmp, 'client/audio/eigene/eigene.json'), 'utf8')).pistole.dateien, ['pistole_1.ogg']);
    assert.equal(p.credits()[0].urheber, 'Ich');
    await p.kopiereAudio({ von: 'client/audio/eigene/pistole_1.ogg', nach: 'client/musik/waldweg/Schuss.ogg' });
    assert.deepEqual(JSON.parse(readFileSync(path.join(tmp, 'client/musik/musik.json'), 'utf8')).waldweg, ['Schuss.ogg']);
    await p.speichereAudioEinstellungen({ sound: { pistole: { lautstaerke: 0.4, zonen: { waldweg: 2 } } }, musik: { waldweg: { ueberblendung: 6 } } });
    assert.deepEqual(JSON.parse(readFileSync(path.join(tmp, 'client/audio/eigene/eigene.json'), 'utf8')).pistole.zonen, { waldweg: 2 });
    assert.equal(JSON.parse(readFileSync(path.join(tmp, 'client/musik/musik.json'), 'utf8'))._optionen.waldweg.ueberblendung, 6);
    const l = await p.loescheAudio({ pfad: 'client/audio/eigene/pistole_1.ogg' });
    assert.equal(p.papierkorb()[0].art, 'audio');
    assert.ok(existsSync(path.join(tmp, l.papierkorb)) && !existsSync(path.join(tmp, 'client/audio/eigene/pistole_1.ogg')));
    assert.equal(JSON.parse(readFileSync(path.join(tmp, 'client/audio/eigene/eigene.json'), 'utf8')).pistole.dateien.length, 0);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

/**
 * Editor 2.0, Schritt 9.9: Sicherheitsprüfung der KI-Funktionen – der API-Schlüssel landet nie in Entwurf, Export, Backup,
 * Log oder URL; Kontextgrenzen (nie die ganze Karte) und Schlüssel-Stopp gelten für alle Gemini-Aufrufe.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { EINSTELLUNGEN_WHITELIST, baueBackup } from '../editor/kern/backup.js';
import { entwurfJson, exportJson, ausDefinition } from '../editor/kern/format.js';
import { Verlauf } from '../editor/kern/verlauf.js';
import { frageGeminiBild } from '../editor/kern/gemini.js';
import { kiAnfrage, KI_AUFGABEN } from '../editor/kern/kiPipeline.js';
import { leseKiAntwort, pruefeAenderungen } from '../editor/kern/kiImport.js';

const SCHLUESSEL = 'AIzaTESTSCHLUESSEL0815';
const quellen = (ordner) => readdirSync(ordner, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? quellen(join(ordner, e.name)) : e.name.endsWith('.js') ? [join(ordner, e.name)] : []));
const EDITOR = quellen('editor');

test('Backup nimmt die Schlüssel-Einstellungen (Gemini, Poly Pizza) nie mit', () => {
  assert.ok(!EINSTELLUNGEN_WHITELIST.some((k) => /Gemini|PolyPizza/i.test(k)));
  const b = baueBackup({ einstellungen: { 'browserSurvival.editorGemini': { schluessel: SCHLUESSEL }, 'browserSurvival.editorPolyPizza': SCHLUESSEL, 'browserSurvival.editorLayout': { a: 1 } } });
  assert.ok(!JSON.stringify(b).includes(SCHLUESSEL));
  assert.deepEqual(Object.keys(b.einstellungen), ['browserSurvival.editorLayout']);
});

test('KI-Aktionen können keinen Schlüssel in Entwurf/Export schreiben (nur Whitelist-Werte, Namen ohne Sonderzeichen)', () => {
  const { karte } = ausDefinition({ id: 's', name: 'S', kacheln: [',,,,,S,,,,', ',,,,,,,,,,'], objekte: [] });
  const angriff = [
    { aktion: 'wert', pfad: 'apiKey', wert: SCHLUESSEL },
    { aktion: 'wert', pfad: 'einstellungen.gemini.schluessel', wert: SCHLUESSEL },
    { aktion: 'wert', pfad: 'musik', wert: SCHLUESSEL.replace('0815', '"x') },
  ];
  const v = pruefeAenderungen(karte, leseKiAntwort(JSON.stringify(angriff), karte), {});
  assert.deepEqual(v.eintraege.map((e) => e.art), ['ungueltig', 'ungueltig', 'ungueltig']);
  karte.anwenden(v.ops);
  assert.ok(!JSON.stringify(entwurfJson(karte, new Verlauf())).includes(SCHLUESSEL));
  assert.ok(!JSON.stringify(exportJson(karte)).includes(SCHLUESSEL));
});

test('Quelltext: Schlüssel nie in URL (?key=) und nie in console-Ausgaben', () => {
  for (const datei of EDITOR) {
    const text = readFileSync(datei, 'utf8');
    assert.ok(!/[?&]key=/.test(text), `${datei}: Schlüssel als URL-Parameter`);
    for (const zeile of text.split('\n')) if (/console\.(log|warn|error|info|debug)\(/.test(zeile)) assert.ok(!/schluessel|apiKey|api-key/i.test(zeile), `${datei}: loggt etwas mit Schlüssel: ${zeile.trim()}`);
  }
  // Gemini nur über kern/gemini.js (Header x-goog-api-key) – kein zweiter, ungeprüfter Weg
  const fetchGemini = EDITOR.filter((d) => /https:\/\/generativelanguage\.googleapis\.com/.test(readFileSync(d, 'utf8')));
  assert.deepEqual(fetchGemini.map((d) => d.replace(/\\/g, '/')), ['editor/kern/gemini.js']);
});

test('Bildmodell: Schlüssel-Stopp auch dort', async () => {
  let gesendet = 0;
  const fetchFn = async () => {
    gesendet++;
    return { ok: true, json: async () => ({}) };
  };
  await assert.rejects(frageGeminiBild({ schluessel: SCHLUESSEL, prompt: `Textur mit ${SCHLUESSEL}`, fetchFn }), /Sicherheitsstopp/);
  assert.equal(gesendet, 0);
});

test('Kontextgrenze: ohne Markierung nie Kacheln; Markierung geht ohne Limit mit (Runde 18 7.1) – nur bei Aufgaben mit Bereich', () => {
  const { karte } = ausDefinition({ id: 'g', name: 'Groß', kacheln: Array.from({ length: 120 }, (_, y) => (y === 5 ? 'S' : ',').padEnd(160, ',')), objekte: [] });
  for (const aufgabe of ['helfer', 'textZuKarte', 'luecken', 'fehler', 'lootBalance', 'thema', 'beschriftung']) {
    const ohne = kiAnfrage({ aufgabe, karte, frage: 'x' });
    assert.ok(!ohne.kontext.text.includes('## Kacheln'), `${aufgabe}: ohne Markierung kein Raster`);
    assert.ok(ohne.kontext.zeichen < 20000, `${aufgabe}: ${ohne.kontext.zeichen} Zeichen`);
    const riesig = kiAnfrage({ aufgabe, karte, frage: 'x', rechteck: { x: 0, y: 0, b: 160, h: 120 } });
    // Aufgaben ohne Bereich (Loot-Balance, Thema, Beschriftung) schicken auch bei Markierung keine Kacheln
    assert.equal(riesig.kontext.text.includes('## Kacheln'), KI_AUFGABEN[aufgabe].bereich, aufgabe);
  }
});

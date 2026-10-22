/** Editor 2.0, Schritt 9.1: KI-Fundament – Kontext ohne ganze Karte, Schlüssel nie im Body, JSON-Antworten, neue Aktionen */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ausDefinition } from '../editor/kern/format.js';
import { baueKontext, frageGemini, leseStrukturiert, findeAktionen } from '../editor/kern/gemini.js';
import { kiAnfrage, kiErgebnis } from '../editor/kern/kiPipeline.js';
import { leseKiAntwort, pruefeAenderungen, istZonenweit } from '../editor/kern/kiImport.js';
import { GEGENSTAENDE } from '../server/spiel/konfiguration/gegenstaende.js';

const KACHELN = Array.from({ length: 20 }, (_, y) => (y === 2 ? ',,,,,S' : ',,,,,,').padEnd(30, ','));
const neu = () => ausDefinition({ id: 'ki', name: 'KI-Test', kacheln: KACHELN, raeume: { a: { name: 'Hütte', lootTabelle: 'huette' } }, objekte: [] }).karte;
const BEREICH = { x0: 2, y0: 2, x1: 15, y1: 12 };
const pruefe = (k, aktionen, bereich = BEREICH) => pruefeAenderungen(k, leseKiAntwort(JSON.stringify(aktionen), k), { bereich });

test('Kontext: kleine Zone wird NICHT mehr ganz mitgeschickt (B6), Statistik schon', () => {
  const k = neu();
  const ohne = baueKontext(k);
  assert.equal(ohne.bereich, null);
  assert.equal(ohne.quelle, 'keiner');
  assert.ok(!ohne.text.includes('## Kacheln'), 'kein Kachel-Raster');
  assert.match(ohne.text, /Marker: 1 Start/);
  assert.match(ohne.text, /Räume: a=Hütte/);
  // Runde 18 (7.3): ohne Ausschnitt geht die Anleitung der ortlosen Aktionen mit (keine Kacheln)
  assert.deepEqual(ohne.teile.map((t) => t.titel), ['Zonen-Statistik (ohne Kacheln)', 'Anleitung: Aktionen ohne Ort (Zonen-Werte, Räume, Namen)']);
  const mit = baueKontext(k, { rechteck: { x: 2, y: 2, b: 5, h: 4 } });
  assert.equal(mit.quelle, 'markierung');
  assert.equal(mit.teile.length, 2);
});

test('Pipeline: Anfrage mit JSON-Antwortformat, „Das wird gesendet“ nennt die Teile und was nicht gesendet wird', () => {
  const { anfrage, gesendet } = kiAnfrage({ karte: neu(), frage: 'Mach es regnerisch' });
  assert.equal(anfrage.generationConfig.responseMimeType, 'application/json');
  assert.match(anfrage.systemInstruction.parts[0].text, /"antwort"/);
  assert.ok(gesendet.some((g) => /Statistik/.test(g)));
  assert.ok(gesendet.some((g) => /Nicht gesendet: ganze Karte, API-Schlüssel/.test(g)));
});

test('Schlüssel steht nie im Body – sonst wird nichts gesendet', async () => {
  let gesendet = 0;
  const fetchFn = async (_url, opt) => {
    gesendet++;
    assert.ok(!opt.body.includes('AIzaGEHEIM123'));
    assert.equal(opt.headers['x-goog-api-key'], 'AIzaGEHEIM123');
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"antwort":"ok","aktionen":[]}' }] } }] }) };
  };
  await frageGemini({ schluessel: 'AIzaGEHEIM123', anfrage: { contents: [] }, fetchFn });
  assert.equal(gesendet, 1);
  await assert.rejects(frageGemini({ schluessel: 'AIzaGEHEIM123', anfrage: { contents: [{ parts: [{ text: 'Schlüssel AIzaGEHEIM123' }] }] }, fetchFn }), /Sicherheitsstopp/);
  assert.equal(gesendet, 1, 'zweite Anfrage nicht gesendet');
});

test('Strukturierte Antwort: Text + Aktionen, Vorschau über die Pipeline', () => {
  const k = neu();
  const text = JSON.stringify({ antwort: 'Ich setze Regen.', aktionen: [{ aktion: 'wert', pfad: 'wetter.regenAnteil', wert: 0.8 }] });
  assert.equal(leseStrukturiert(text).antwort, 'Ich setze Regen.');
  assert.equal(findeAktionen(text, k).anzahl, 1);
  const e = kiErgebnis(k, text);
  assert.equal(e.antwort, 'Ich setze Regen.');
  assert.equal(e.fehler, null);
  assert.equal(e.vorschlag.vorschau.zaehler.aendern, 1, 'zonenweit: geht ohne Bereich');
  assert.equal(kiErgebnis(k, '{"antwort":"Nur ein Tipp","aktionen":[]}').vorschlag, null);
});

test('Aktion wert: nur Whitelist, Zahlen begrenzt, null = Standard', () => {
  const k = neu();
  const v = pruefe(k, [
    { aktion: 'wert', pfad: 'wetter.regenAnteil', wert: 3 },
    { aktion: 'wert', pfad: 'einstellungen.zombie.dichte', wert: 2 },
    { aktion: 'wert', pfad: 'server.name', wert: 'x' },
    { aktion: 'wert', pfad: 'musik', wert: 'wald' },
    { aktion: 'wert', pfad: 'zombie.dichte', wert: null },
  ]);
  assert.deepEqual(v.eintraege.map((e) => e.art), ['aendern', 'aendern', 'ungueltig', 'aendern', 'aendern']);
  assert.match(v.eintraege[0].text, /begrenzt von 3/);
  k.anwenden(v.ops);
  assert.equal(k.wert('einstellungen.wetter.regenAnteil'), 1);
  assert.equal(k.wert('einstellungen.zombie.dichte'), undefined);
  assert.equal(k.wert('musik'), 'wald');
  assert.ok(istZonenweit({ aktion: 'wert' }) && !istZonenweit({ aktion: 'setze' }));
});

test('Aktion lootzone: im Bereich, Items geprüft wie im Spiel', () => {
  const k = neu();
  const item = Object.keys(GEGENSTAENDE)[0];
  const v = pruefe(k, [
    { aktion: 'lootzone', x: 3, y: 3, b: 4, h: 3, name: 'Lager', modus: 'chance', items: [{ id: 'gibtsnicht', chance: 50 }, { id: item, chance: 30 }], punkte: 3 },
    { aktion: 'lootzone', x: 14, y: 11, b: 5, h: 5 },
  ]);
  assert.equal(v.eintraege[0].art, 'neu', v.eintraege[0].text);
  const z = v.eintraege[0].ops[0].neu;
  assert.equal(z.name, 'Lager');
  assert.deepEqual(z.eintraege.map((e) => e.id), [item], 'unbekanntes Item fällt weg');
  assert.match(v.eintraege[0].text, /unbekanntes Item/);
  assert.equal(v.eintraege[1].art, 'ungueltig', 'ragt aus dem Bereich');
});

test('Aktion name: Zone (ohne Bereich), Raum, Objekt im Bereich', () => {
  const k = neu();
  k.anwenden([{ s: 'objekte', k: 5, neu: { typ: 'tisch', x: 4, y: 4, b: 1, h: 1 } }]);
  const zonenweit = pruefeAenderungen(k, leseKiAntwort('[{"aktion":"name","name":"Waldrand"},{"aktion":"name","ziel":"raum","buchstabe":"a","name":"Scheune"}]', k), {});
  assert.equal(zonenweit.zaehler.aendern, 2);
  const v = pruefe(k, [{ aktion: 'name', ziel: 'objekt', id: 5, name: 'Esstisch' }, { aktion: 'name', name: '<script>' }]);
  assert.deepEqual(v.eintraege.map((e) => e.art), ['aendern', 'ungueltig']);
  assert.throws(() => pruefeAenderungen(k, leseKiAntwort('[{"aktion":"setze","typ":"tisch","x":4,"y":8}]', k), {}), /Kein Bereich/, 'mit Ort braucht es einen Bereich');
});

test('Aktion prefab: eingebautes Prefab im Bereich, ragt es hinaus → ungültig', () => {
  const k = neu();
  const voll = { x0: 0, y0: 0, x1: 29, y1: 19 };
  const v = pruefe(k, [{ aktion: 'prefab', name: 'Wohnhaus', x: 10, y: 4 }, { aktion: 'prefab', name: 'Wohnhaus', x: 28, y: 18 }, { aktion: 'prefab', name: 'Gibtsnicht', x: 1, y: 1 }], voll);
  assert.equal(v.eintraege[0].art, 'neu', v.eintraege[0].text);
  assert.equal(v.eintraege[1].art, 'ungueltig');
  assert.match(v.eintraege[2].text, /unbekannt/);
});

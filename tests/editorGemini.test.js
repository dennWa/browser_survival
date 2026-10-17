/**
 * Gemini-Helfer (editor/kern/gemini.js): Kontext, Anfrage, Antwort/Fehler (gemocktes fetch – kein Netz), neue KI-Aktionen typtextur/bemale.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KARTEN } from '../server/spiel/karten/kartenLader.js';
import { ausDefinition } from '../editor/kern/format.js';
import { leseKiAntwort, pruefeAenderungen } from '../editor/kern/kiImport.js';
import { baueKontext, baueAnfrage, frageGemini, leseGeminiAntwort, findeAktionen, ohneJsonBloecke, GEMINI_BASIS, SYSTEM_TEXT } from '../editor/kern/gemini.js';

const laden = () => ausDefinition(KARTEN.stadtrand.definition ?? KARTEN.stadtrand).karte;
const antwortOk = (text) => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }] }) });

test('Kontext: Markierung → Ausschnitt mit Bereich; Zone zu groß → nur Überblick; Auswahl → Rahmen', () => {
  const karte = laden();
  const k = baueKontext(karte, { rechteck: { x: 5, y: 5, b: 10, h: 8 } });
  assert.equal(k.quelle, 'markierung');
  assert.deepEqual(k.bereich, { x0: 5, x1: 14, y0: 5, y1: 12 });
  assert.match(k.text, /objektTypen:/);
  assert.match(k.text, /"aktion":"bereich"/);
  const gross = baueKontext(karte, { rechteck: { x: 0, y: 0, b: karte.breite, h: karte.hoehe } });
  assert.equal(gross.bereich, null);
  assert.ok(gross.zuGross);
  const [id, o] = [...karte.s('objekte')][0];
  const a = baueKontext(karte, { auswahl: [{ s: 'objekte', k: id, wert: o }] });
  assert.equal(a.quelle, 'auswahl');
  assert.match(a.text, new RegExp(`Objekt id ${id}:`));
  assert.equal(baueKontext(karte, { rechteck: { x: 5, y: 5, b: 4, h: 4 }, mitBereich: false }).bereich, null);
});

test('Anfrage: Verlauf ohne Kontext, Kontext nur in der neuen Frage, Rollen user/model', () => {
  const r = baueAnfrage({ verlauf: [{ rolle: 'nutzer', text: 'hi' }, { rolle: 'helfer', text: 'hallo' }], frage: 'mach Wald', kontext: 'KONTEXT' });
  assert.deepEqual(r.contents.map((c) => c.role), ['user', 'model', 'user']);
  assert.match(r.contents[2].parts[0].text, /KONTEXT[\s\S]*mach Wald/);
  assert.equal(r.systemInstruction.parts[0].text, SYSTEM_TEXT);
});

test('frageGemini: Schlüssel im Header (nicht in der URL), Fehlertexte, Abbruch', async () => {
  let aufruf;
  const ok = await frageGemini({ schluessel: ' KEY ', modell: 'gemini-2.5-flash', anfrage: { a: 1 }, fetchFn: async (url, opt) => ((aufruf = { url, opt }), antwortOk('Hallo!')) });
  assert.equal(ok.text, 'Hallo!');
  assert.equal(aufruf.url, `${GEMINI_BASIS}/gemini-2.5-flash:generateContent`);
  assert.equal(aufruf.opt.headers['x-goog-api-key'], 'KEY');
  assert.ok(!aufruf.url.includes('KEY'));
  const fehler = (status, error) => frageGemini({ schluessel: 'k', anfrage: {}, fetchFn: async () => ({ ok: false, status, json: async () => ({ error }) }) });
  await assert.rejects(fehler(400, { message: 'API key not valid' }), /Schlüssel/);
  await assert.rejects(fehler(429, {}), /429/);
  await assert.rejects(fehler(404, {}), /Modell/);
  await assert.rejects(frageGemini({ schluessel: '', anfrage: {} }), /Schlüssel/);
  await assert.rejects(frageGemini({ schluessel: 'k', modell: '../x', anfrage: {} }), /Modellname/);
  await assert.rejects(frageGemini({ schluessel: 'k', anfrage: {}, fetchFn: async () => { throw new TypeError('offline'); } }), /Verbindung/);
  assert.throws(() => leseGeminiAntwort({ promptFeedback: { blockReason: 'SAFETY' } }), /abgelehnt/);
  assert.throws(() => leseGeminiAntwort({ candidates: [] }), /nichts/);
});

test('Antwort: JSON-Block → Aktionen + Text ohne Block; reiner Text → keine Aktionen', () => {
  const karte = laden();
  const text = 'Mehr Grün!\n```json\n[{"aktion":"typtextur","typ":"baum","farbe":"#3a6b35"}]\n```\nFertig.';
  assert.equal(findeAktionen(text, karte).anzahl, 1);
  assert.equal(ohneJsonBloecke(text), 'Mehr Grün!\n\nFertig.');
  assert.equal(findeAktionen('Nur Gelaber, kein JSON.', karte), null);
  assert.equal(findeAktionen('```json\n[]\n```', karte), null);
});

test('KI-Aktionen typtextur + bemale: Vorschau, Prüfung (Farbe/Muster/Bereich), Anwenden', () => {
  const karte = laden();
  const bereich = { x0: 2, x1: 9, y0: 2, y1: 9 };
  const e = pruefeAenderungen(karte, leseKiAntwort([
    { aktion: 'typtextur', typ: 'baum', farbe: '#3A6B35', muster: 'gras' },
    { aktion: 'typtextur', typ: 'baum', muster: 'glitzer' },
    { aktion: 'typtextur', typ: 'gibtsnicht', farbe: '#000000' },
    { aktion: 'typtextur', typ: 'baum', farbe: 'rot' },
    { aktion: 'bemale', x: 3, y: 3, b: 2, h: 2, farbe: '#7a6a4f' },
    { aktion: 'bemale', x: 8, y: 8, b: 5, h: 5, farbe: '#7a6a4f' },
    { aktion: 'bemale', x: 3, y: 3, farbe: 'blau' },
  ]), { bereich });
  assert.deepEqual(e.eintraege.map((x) => x.art), ['neu', 'ungueltig', 'ungueltig', 'ungueltig', 'aendern', 'ungueltig', 'ungueltig']);
  karte.anwenden(e.ops);
  assert.deepEqual(karte.s('texturen').get('baum'), { farbe: '#3a6b35', muster: 'gras' });
  assert.equal(karte.farbeAn(4, 4), '#7a6a4f');
  assert.equal(karte.farbeAn(5, 5), null);
  const weg = pruefeAenderungen(karte, leseKiAntwort([{ aktion: 'typtextur', typ: 'baum', farbe: null, muster: null }]), { bereich });
  assert.equal(weg.eintraege[0].art, 'aendern');
  karte.anwenden(weg.ops);
  assert.equal(karte.s('texturen').has('baum'), false);
});

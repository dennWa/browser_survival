/** Editor 2.0, Schritte 9.2–9.7: KI-Aufgaben über die Pipeline, Lückenfinder (lokal), Bodenton-Aktion, Rahmen */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ausDefinition } from '../editor/kern/format.js';
import { markerSchluessel } from '../editor/kern/karte.js';
import { kiAnfrage, kiErgebnis, rahmenUm, KI_AUFGABEN } from '../editor/kern/kiPipeline.js';
import { findeLuecken, befundeText } from '../editor/kern/lueckenfinder.js';
import { leseKiAntwort, pruefeAenderungen } from '../editor/kern/kiImport.js';

const KACHELN = [
  ',,,,,,,,,,,,,,,,,,,,,,,,',
  ',#####,,,,,,,,,,,,######',
  ',#...#,,,,,,,,,,,,#....#',
  ',#...#,,,,S,,,,,,,#....#',
  ',#####,,,,,,,,,,,,##T###',
  ',,,,,,,,,,,,,,,,,,,,,,,,',
  ',,,,,,,,,,,,,,,,,,,,,,,,',
  ',,,,,,,,,,,,,,,,,,,,,,,,',
];
const neu = () => ausDefinition({ id: 'lf', name: 'Lücken', kacheln: KACHELN, raeume: { a: { name: 'Hütte', lootTabelle: 'huette' }, b: { name: 'Laden', lootTabelle: 'huette' } }, objekte: [] }).karte;

test('Lückenfinder: Haus ohne Eingang, Räume/Zone ohne Loot, Spawn in Sichtweite – lokal, sortiert nach Wichtigkeit', () => {
  const k = neu();
  k.anwenden([{ s: 'marker', k: markerSchluessel(12, 3), neu: { art: 'zombie' } }]);
  const b = findeLuecken(k);
  const arten = b.map((x) => x.art);
  assert.ok(arten.includes('haus-ohne-tuer'), 'linkes Haus hat keine Tür');
  assert.equal(b.filter((x) => x.art === 'haus-ohne-tuer').length, 1, 'rechtes Haus hat eine Tür');
  assert.ok(arten.includes('zone-ohne-loot'));
  assert.equal(b.filter((x) => x.art === 'raum-ohne-loot').length, 2);
  assert.ok(arten.includes('spawn-sicht'), 'Zombie 3 Kacheln neben dem Start, freie Sicht');
  assert.ok(b.every((x, i) => i === 0 || b[i - 1].gewicht >= x.gewicht), 'nach Gewicht sortiert');
  assert.match(befundeText(b), /^1\. \[/);
  // Loot-Punkt in Raum a → Raum a fällt weg, Zone hat Loot
  k.anwenden([{ s: 'marker', k: markerSchluessel(19, 2), neu: { art: 'loot', raum: 'a' } }]);
  const b2 = findeLuecken(k).map((x) => x.art);
  assert.ok(!b2.includes('zone-ohne-loot'));
  assert.equal(findeLuecken(k).filter((x) => x.art === 'raum-ohne-loot').length, 1);
});

test('Rahmen um Befunde: begrenzt auf die Zone, zu groß → null', () => {
  const k = neu();
  assert.deepEqual(rahmenUm(k, [{ x: 1, y: 1 }, { x: 5, y: 2 }], { rand: 2 }), { x: 0, y: 0, b: 8, h: 5 });
  assert.equal(rahmenUm(k, [{ x: null, y: null }]), null);
  assert.equal(rahmenUm(k, [{ x: 0, y: 0 }, { x: 23, y: 7 }], { max: 50 }), null);
});

test('Jede Aufgabe hat Systemtext-Zusatz und JSON; Zusatz-Bausteine landen in Kontext und „gesendet“', () => {
  for (const [id, a] of Object.entries(KI_AUFGABEN)) {
    assert.ok(a.json, id);
    if (id !== 'helfer') assert.ok(a.zusatz?.length > 20, id);
  }
  const k = neu();
  const { anfrage, kontext, gesendet } = kiAnfrage({ aufgabe: 'luecken', karte: k, frage: 'x', extra: [{ titel: 'Lokale Befunde', text: '1. [sackgasse] …' }] });
  assert.match(anfrage.systemInstruction.parts[0].text, /Befunde/);
  assert.match(kontext.text, /## Lokale Befunde/);
  assert.ok(gesendet.some((g) => g.startsWith('Lokale Befunde')));
  assert.equal(kontext.bereich, null, 'ohne Rechteck kein Ausschnitt');
  const mit = kiAnfrage({ aufgabe: 'textZuKarte', karte: k, frage: 'Dorf', rechteck: { x: 6, y: 5, b: 10, h: 3 } });
  assert.deepEqual(mit.kontext.bereich, { x0: 6, x1: 15, y0: 5, y1: 7 });
  assert.match(mit.anfrage.systemInstruction.parts[0].text, /Prefabs/);
  const ohne = kiAnfrage({ aufgabe: 'lootBalance', karte: k, frage: 'x', rechteck: { x: 0, y: 0, b: 5, h: 5 } });
  assert.equal(ohne.kontext.bereich, null, 'Loot-Balance bekommt nie einen Kartenausschnitt');
});

test('Zonen-Thema: bodenton färbt alle Kacheln eines Zeichens (zonenweit, ohne Bereich) + wert/typtextur in einem Satz', () => {
  const k = neu();
  const text = JSON.stringify({ antwort: 'Winter!', aktionen: [
    { aktion: 'bodenton', zeichen: ',', farbe: '#E8EEF2' },
    { aktion: 'wert', pfad: 'wetter.regenAnteil', wert: 0.2 },
    { aktion: 'typtextur', typ: 'baum', farbe: '#dfe7ea' },
    { aktion: 'bodenton', zeichen: 'X', farbe: '#000000' },
  ] });
  const e = kiErgebnis(k, text);
  assert.equal(e.fehler, null);
  const v = e.vorschlag.vorschau;
  assert.deepEqual(v.eintraege.map((x) => x.art), ['aendern', 'aendern', 'neu', 'ungueltig']);
  k.anwenden(v.ops);
  const rasen = k.zellen.filter((z) => z === ',').length;
  assert.equal(k.s('bemalung').size, rasen);
  assert.equal(k.farbeAn(0, 0), '#e8eef2');
});

test('Text zu Karte: Prefab + Weg im Bereich, außerhalb ungültig', () => {
  const k = ausDefinition({ id: 'tk', name: 'Leer', kacheln: Array.from({ length: 30 }, () => ','.repeat(40)), objekte: [] }).karte;
  const v = pruefeAenderungen(k, leseKiAntwort(JSON.stringify([
    { aktion: 'prefab', name: 'Wohnhaus', x: 2, y: 2 },
    { aktion: 'linie', von: [0, 20], bis: [39, 20], zeichen: '=' },
    { aktion: 'setze', typ: 'baum', x: 45, y: 5 },
  ]), k), { bereich: { x0: 0, y0: 0, x1: 39, y1: 29 } });
  assert.deepEqual(v.eintraege.map((x) => x.art), ['neu', 'aendern', 'ungueltig']);
});

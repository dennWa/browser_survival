/**
 * Runde 18 – Editor Phase 6/7 (Feedback): Boden-Pinsel (6.1), Messen/Text-Kürzel (6.3/6.5), Zonen-Weltanordnung (6.4),
 * Objekte kopieren (6.5), Knochen (6.7), Testlauf ohne Spawn-Warnung (6.8), KI ohne Limit (7.1), KI-Markierung außerhalb
 * der Zone (7.2), Loot-Balance-Vorschläge werden angenommen (7.3).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pinsel, pinselStrich, streuwert } from '../editor/kern/raster.js';
import { Befehle, istTextEingabe, TEXT_KUERZEL } from '../editor/ui/befehle.js';
import { touchArt } from '../editor/kern/touchBauen.js';
import { katalog, passtZurSuche } from '../editor/kern/katalog.js';
import { konflikte, freiePosition, verschiebeZone, rasteZoneEin, ueberlappen } from '../editor/kern/weltLayout.js';
import { groesseAendern, neueZone, MAX_GROESSE, groessenHinweis, GROSS_KACHELN, istGrosseZone } from '../editor/kern/zone.js';
import { kopiereElemente, einfuegeOps, dreheVorlage } from '../editor/kern/auswahl.js';
import { knochenEnde, knotenName, spurNachUmbenennen, knochenForm, standardLaenge } from '../editor/kern/knochen.js';
import { testDaten, ersatzStart } from '../editor/kern/testlauf.js';
import { ausDefinition } from '../editor/kern/format.js';
import { baueKontext, markierungTeile, aussenRechteck, ortloseAnleitung } from '../editor/kern/gemini.js';
import { kiAnfrage, kiErgebnis, rahmenUm } from '../editor/kern/kiPipeline.js';
import { leseKiAntwort, pruefeAenderungen, zahlAus, anteil } from '../editor/kern/kiImport.js';

const zone = (id, { start = true, b = 20, h = 12, extra = {} } = {}) =>
  ausDefinition({ id, name: id[0].toUpperCase() + id.slice(1), kacheln: Array.from({ length: h }, (_, y) => (start && y === 5 ? ',,,,,S' : '').padEnd(b, ',')), raeume: { a: { name: 'Hütte', lootTabelle: 'huette' } }, objekte: [], ...extra }).karte;

// --- 6.1 Boden-Pinsel ---------------------------------------------------------------------------
test('6.1 Pinsel: rund ist eine Scheibe, Streuung franst nur den Rand aus (deterministisch), Strich ohne Doppelte', () => {
  const eckig = pinsel(10, 10, 5);
  const rund = pinsel(10, 10, 5, true);
  assert.equal(eckig.length, 25);
  assert.ok(rund.length < 25 && rund.length >= 13, `rund: ${rund.length}`);
  assert.ok(rund.some((p) => p.x === 10 && p.y === 10));
  const a = pinsel(10, 10, 7, true, { streuung: 0.6, saat: 3 });
  const b = pinsel(10, 10, 7, true, { streuung: 0.6, saat: 3 });
  assert.deepEqual(a, b, 'gleiche Saat = gleiches Muster');
  assert.ok(a.length < pinsel(10, 10, 7, true).length, 'Rand teilweise weg');
  // die Mitte bleibt immer voll
  for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [-1, -1]]) assert.ok(a.some((p) => p.x === 10 + dx && p.y === 10 + dy));
  assert.ok(streuwert(1, 2, 3) >= 0 && streuwert(1, 2, 3) < 1);
  const strich = pinselStrich({ x: 0, y: 0 }, { x: 6, y: 0 }, { groesse: 3 });
  assert.equal(new Set(strich.map((p) => `${p.x},${p.y}`)).size, strich.length);
  assert.equal(strich.length, 9 * 3);
  // alle Böden (Schnee, Rasen, Asphalt …) sind Pinsel-Einträge, Mauern nicht
  const pinselKacheln = katalog().filter((e) => e.art === 'kachel' && passtZurSuche(e, 'pinsel'));
  for (const z of ['*', ',', '_', '.', '+', '~']) assert.ok(pinselKacheln.some((e) => e.zeichen === z), `Kachel ${z}`);
  assert.ok(!pinselKacheln.some((e) => e.zeichen === '#'));
});

// --- 6.3 / 6.5 Tastatur ---------------------------------------------------------------------------
test('6.3/6.5 Kürzel: Enter fürs Maßband nur bei laufender Messung, Strg+C/V/X/A in Feldern und bei markiertem Text beim Browser', () => {
  const befehle = new Befehle();
  let messen = false;
  let kopiert = 0;
  let fertig = 0;
  befehle.registriere(
    { id: 'm.fertig', name: 'Maßband beenden', kuerzel: ['Enter'], leise: true, verfuegbar: () => messen, ausfuehren: () => fertig++ },
    { id: 'b.kopieren', name: 'Kopieren', kuerzel: ['Strg+C'], ausfuehren: () => kopiert++ },
    { id: 'b.einfuegen', name: 'Einfügen', kuerzel: ['Strg+V'], ausfuehren: () => kopiert++ },
  );
  const taste = (key, strg = false) => ({ key, code: key.length === 1 ? `Key${key.toUpperCase()}` : key, ctrlKey: strg, metaKey: false, shiftKey: false, altKey: false, preventDefault() {} });
  assert.equal(befehle.behandleTaste(taste('Enter')), false, 'ohne Messung bleibt Enter beim Browser');
  messen = true;
  assert.equal(befehle.behandleTaste(taste('Enter')), true);
  assert.equal(fertig, 1);
  assert.equal(befehle.behandleTaste(taste('c', true), { inEingabe: true }), false, 'Strg+C im Feld = Text kopieren');
  assert.equal(befehle.behandleTaste(taste('c', true), { textMarkiert: true }), false, 'markierter Text → Browser');
  assert.equal(befehle.behandleTaste(taste('v', true), { textMarkiert: true }), true, 'Strg+V fügt weiter Karten-Elemente ein');
  assert.equal(befehle.behandleTaste(taste('c', true)), true);
  assert.equal(kopiert, 2);
  assert.deepEqual([...TEXT_KUERZEL], ['Strg+C', 'Strg+X', 'Strg+V', 'Strg+A']);
  assert.ok(istTextEingabe({ tagName: 'INPUT', type: 'number' }));
  assert.ok(istTextEingabe({ tagName: 'TEXTAREA' }));
  assert.ok(istTextEingabe({ tagName: 'DIV', isContentEditable: true }));
  assert.ok(!istTextEingabe({ tagName: 'INPUT', type: 'checkbox' }));
  assert.ok(!istTextEingabe({ tagName: 'BUTTON' }));
  // Touch: Messen und KI-Markieren = zeichnen (Finger zieht mit Fadenkreuz)
  assert.equal(touchArt('messen'), 'zeichnen');
  assert.equal(touchArt('kiMarkieren'), 'zeichnen');
});

// --- 6.4 Zonen ----------------------------------------------------------------------------------
test('6.4 Weltanordnung: Kante an Kante ok, Überlappung verboten, neue Zone daneben, Einrasten', () => {
  const groessen = new Map([['a', { breite: 40, hoehe: 30 }], ['b', { breite: 20, hoehe: 20 }]]);
  const layout = { a: { x: 0, y: 0 }, b: { x: 40, y: 0 } };
  assert.deepEqual(konflikte(layout, groessen, 'b'), [], 'Kante an Kante');
  assert.ok(!ueberlappen({ x: 0, y: 0, b: 4, h: 4 }, { x: 4, y: 0, b: 4, h: 4 }));
  assert.deepEqual(konflikte(layout, groessen, 'b', { x: 39, y: 5 }), ['a']);
  const schlecht = verschiebeZone(layout, groessen, 'b', { x: 30, y: 10 });
  assert.equal(schlecht.ok, false);
  assert.deepEqual(schlecht.konflikte, ['a']);
  const gut = verschiebeZone(layout, groessen, 'b', { x: 0, y: 30 });
  assert.ok(gut.ok);
  assert.deepEqual(gut.layout.b, { x: 0, y: 30 });
  assert.deepEqual(layout.b, { x: 40, y: 0 }, 'Eingabe unverändert');
  // neue Zone c 10×10 neben a: rechts ist b → die nächste freie Seite
  groessen.set('c', { breite: 10, hoehe: 10 });
  const p = freiePosition(layout, groessen, { b: 10, h: 10, neben: 'a' });
  assert.deepEqual(konflikte({ ...layout, c: p }, groessen, 'c'), []);
  // Einrasten: 1 Kachel Lücke → schnappt an die Kante
  assert.deepEqual(rasteZoneEin(layout, groessen, 'b', { x: 41, y: 1 }, 2), { x: 40, y: 0 });
});

test('6.4 Zonengröße bis 1500 (ZONE_MAX_KACHELN), Hinweise ab 1 Mio. Kacheln, Größe links/oben trägt den Versatz (auch im Undo)', () => {
  assert.equal(MAX_GROESSE, 1500);
  assert.equal(neueZone({ breite: 20000, hoehe: 10 }).breite, 1500);
  assert.throws(() => groesseAendern(zone('x'), { rechts: 2000 }), /zu groß/);
  assert.equal(groessenHinweis(100, 100), null);
  assert.equal(groessenHinweis(1000, 1000).stufe, 'gross');
  assert.equal(groessenHinweis(1500, 1500).stufe, 'sehr');
  assert.equal(groessenHinweis(1500, 1500, { heapGrenze: 50 * 1024 * 1024 }).stufe, 'zuviel');
  assert.ok(istGrosseZone({ breite: 1000, hoehe: GROSS_KACHELN / 1000 }));
  const k = zone('a');
  const erg = groesseAendern(k, { links: 3, oben: 2 });
  const [op] = k.anwenden(erg.ops.slice(0, 1));
  assert.deepEqual(op.neu.versatz, { x: 3, y: 2 });
  assert.deepEqual(op.alt.versatz, { x: -3, y: -2 });
  assert.equal(k.breite, 23);
});

// --- 6.5 Objekte kopieren -------------------------------------------------------------------------
test('6.5 Strg+C auf gewählte Objekte: nur die Elemente, Einfügen lässt Boden und Nachbarn stehen', () => {
  const k = zone('a');
  k.anwenden([
    { s: 'objekte', k: 1, neu: { typ: 'baum', x: 2, y: 2, b: 2, h: 2, blockiert: true } },
    { s: 'objekte', k: 2, neu: { typ: 'busch', x: 8, y: 3, b: 1, h: 1 } },
    { s: 'marker', k: '4,6', neu: { art: 'loot', raum: 'a' } },
    { s: 'kachel', i: k.index(12, 8), neu: '-' },
  ]);
  const gew = [1].map((id) => ({ s: 'objekte', k: id, wert: k.s('objekte').get(id) })).concat([{ s: 'marker', k: '4,6', wert: k.s('marker').get('4,6') }]);
  const v = kopiereElemente(k, gew);
  assert.ok(v.nurElemente);
  assert.ok(v.zellen.every((z) => z === null), 'keine Kacheln');
  assert.equal(v.objekte.length, 1);
  assert.deepEqual([v.objekte[0].x, v.objekte[0].y], [0, 0]);
  assert.deepEqual(v.marker[0].slice(0, 2), [2, 4]);
  // Einfügen über den Weg bei (12, 8) und neben den Busch: nichts wird weggestempelt
  const { ops, neueIds } = einfuegeOps(k, v, 10, 4);
  assert.ok(!ops.some((o) => o.neu === null), 'nichts gelöscht');
  assert.ok(!ops.some((o) => o.s === 'kachel'), 'Boden bleibt');
  k.anwenden(ops);
  assert.equal(k.kachelAn(12, 8), '-');
  assert.equal(k.s('objekte').size, 3);
  assert.equal(neueIds.marker.length, 1);
  assert.equal(dreheVorlage(v).nurElemente, true);
});

// --- 6.7 Knochen -------------------------------------------------------------------------------
test('6.7 Knochen: Ende entlang +y, gedreht; Namen spur-sicher und eindeutig; Spuren ziehen beim Umbenennen mit', () => {
  assert.deepEqual(knochenEnde([1, 2, 3], [0, 0, 0, 1], 0.5), [1, 2.5, 3]);
  const s = Math.SQRT1_2;
  const e = knochenEnde([0, 0, 0], [0, 0, s, s], 1); // 90° um z: +y → −x
  assert.ok(Math.abs(e[0] + 1) < 1e-6 && Math.abs(e[1]) < 1e-6);
  assert.equal(knotenName('Arm links.1', []), 'Arm_links1');
  assert.equal(knotenName('Arm', ['Arm', 'Arm_2']), 'Arm_3');
  assert.equal(knotenName('', []), 'Knochen');
  assert.equal(spurNachUmbenennen('Arm.quaternion', 'Arm', 'Oberarm'), 'Oberarm.quaternion');
  assert.equal(spurNachUmbenennen('Armband.position', 'Arm', 'Oberarm'), 'Armband.position');
  const f = knochenForm(2);
  assert.equal(f.punkte.length, 18);
  assert.equal(f.dreiecke.length, 24);
  assert.equal(f.punkte[16], 2, 'Spitze bei y = L');
  assert.equal(standardLaenge(0), 0.5);
});

// --- 6.8 Testlauf -------------------------------------------------------------------------------
test('6.8 Testlauf: andere Zonen ohne Spieler-Start laden trotzdem (Ersatz-Start nur in den Testdaten), keine Warnung', () => {
  const a = zone('alpha');
  const b = zone('beta', { start: false, extra: { ankuenfte: { west: { x: 2, y: 3 } } } });
  const { daten, probleme, ersatzStarts } = testDaten(new Map([['alpha', a], ['beta', b]]), 'alpha', 0);
  assert.deepEqual(probleme, []);
  assert.ok(daten.karten.beta, 'Zone ohne S ist im Test');
  assert.deepEqual(ersatzStarts.beta, { x: 2, y: 3 }, 'Ersatz = freie Ankunft');
  assert.equal(daten.karten.beta.kacheln[3][2], 'S');
  assert.ok(![...b.s('marker').values()].some((m) => m.art === 'start'), 'Editor-Karte bleibt unverändert');
  assert.ok(ersatzStart(zone('gamma', { start: false })), 'ohne Ankunft: Kartenmitte');
  // Start-Zone ohne S bleibt ein Fehler
  assert.throws(() => testDaten(new Map([['beta', zone('beta', { start: false })]]), 'beta', 0));
});

// --- 7.1 / 7.2 KI-Kontext ----------------------------------------------------------------------------
test('7.1 KI: kein Kachel-Limit – große Markierung geht ganz mit (nur Hinweis), rahmenUm ohne Grenze', () => {
  const k = zone('gross', { b: 220, h: 200 });
  const kx = baueKontext(k, { rechteck: { x: 0, y: 0, b: 220, h: 200 } });
  assert.deepEqual(kx.bereich, { x0: 0, x1: 219, y0: 0, y1: 199 });
  assert.equal(kx.gross, true);
  assert.match(kx.text, /## Kacheln/);
  assert.ok(rahmenUm(k, [{ x: 0, y: 0 }, { x: 219, y: 199 }], { rand: 0 }), 'früher > 2500 → null');
});

test('7.2 KI-Markierung außerhalb der Zone: Teil innen wird gesendet, Rest als Hinweis; ganz außen = nur Ideen', () => {
  const k = zone('a');
  const t = markierungTeile(k, { x: 15, y: -3, b: 10, h: 6 });
  assert.deepEqual(t.innen, { x: 15, y: 0, b: 5, h: 3 });
  assert.deepEqual(t.aussen, { links: 0, oben: 3, rechts: 5, unten: 0 });
  assert.ok(t.ragtHinaus && !t.ganzAussen);
  const kx = baueKontext(k, { rechteck: { x: 15, y: -3, b: 10, h: 6 } });
  assert.deepEqual(kx.bereich, { x0: 15, x1: 19, y0: 0, y1: 2 });
  assert.match(kx.text, /ragt über den Zonenrand/);
  const ganz = baueKontext(k, { rechteck: { x: 25, y: 0, b: 8, h: 8 } });
  assert.equal(ganz.bereich, null);
  assert.equal(ganz.markierung.ganzAussen, true);
  assert.match(ganz.text, /GANZ außerhalb/);
  // „Neue Zone dort“: größter Streifen jenseits der Kante bzw. die Markierung selbst
  assert.deepEqual(aussenRechteck(k, { x: 15, y: -3, b: 10, h: 6 }), { x: 20, y: -3, b: 5, h: 6 });
  assert.deepEqual(aussenRechteck(k, { x: 25, y: 0, b: 8, h: 8 }), { x: 25, y: 0, b: 8, h: 8 });
  // Vorschau: Aktionen nur im inneren Teil gültig
  const erg = kiErgebnis(k, JSON.stringify({ antwort: 'ok', aktionen: [{ aktion: 'setze', typ: 'busch', x: 16, y: 1 }, { aktion: 'setze', typ: 'busch', x: 22, y: 1 }] }), { bereich: kx.bereich });
  assert.deepEqual(erg.vorschlag.vorschau.eintraege.map((e) => e.art), ['neu', 'ungueltig']);
});

// --- 7.3 Loot-Balance --------------------------------------------------------------------------
test('7.3 Loot-Balance: Kontext ohne Bereich erklärt die ortlosen Aktionen (Ursache: Format fehlte)', () => {
  const k = zone('stadt');
  const { kontext, anfrage } = kiAnfrage({ aufgabe: 'lootBalance', karte: k, frage: 'x', extra: [{ titel: 'Loot', text: '…' }] });
  assert.equal(kontext.bereich, null);
  assert.match(kontext.text, /"aktion":"wert","pfad":"loot\.spawnChance"/);
  assert.match(kontext.text, /"aktion":"raum","buchstabe"/);
  assert.match(kontext.text, /zombie\.dichte/);
  assert.ok(!/erste Aktion: die "bereich"-Aktion aus dem Kontext\)/.test(anfrage.systemInstruction.parts[0].text), 'keine erfundene bereich-Aktion verlangen');
  assert.ok(ortloseAnleitung().includes('loot.respawnZeit'));
});

test('7.3 Loot-Balance: typische KI-Vorschläge werden angenommen (Name statt ID, Raum ohne Tabelle, Zahlen als Text, Prozent)', () => {
  const k = zone('stadtrand');
  // so antwortete die KI vorher – alles wurde abgelehnt
  const antwort = {
    antwort: '| Raum | Loot |\n…',
    aktionen: [
      { aktion: 'bereich', zone: 'Stadtrand' },
      { aktion: 'wert', pfad: 'loot.spawnChance', wert: 0.45 },
      { aktion: 'wert', pfad: 'einstellungen.zombie.Dichte', wert: '1.5' },
      { aktion: 'wert', bereich: 'loot', feld: 'respawnZeit', wert: 900 },
      { aktion: 'raum', buchstabe: 'a', spawnChance: 0.6, respawnZeit: 600 },
      { aktion: 'raum', buchstabe: 'A', spawnChance: '70%' },
      { aktion: 'wert', pfad: 'loot.spawnChance', wert: 55 },
    ],
  };
  const erg = kiErgebnis(k, JSON.stringify(antwort), { bereich: null });
  assert.equal(erg.fehler, null);
  const v = erg.vorschlag.vorschau;
  assert.deepEqual(v.eintraege.map((e) => e.art), ['aendern', 'aendern', 'aendern', 'aendern', 'aendern', 'aendern'], v.eintraege.map((e) => e.text).join('\n'));
  k.anwenden(v.ops);
  assert.equal(k.wert('einstellungen.loot.spawnChance'), 0.55);
  assert.equal(k.wert('einstellungen.zombie.dichte'), 1.5);
  assert.equal(k.wert('einstellungen.loot.respawnZeit'), 900);
  assert.deepEqual(k.s('raeume').get('a'), { name: 'Hütte', lootTabelle: 'huette', spawnChance: 0.7, respawnZeit: 600 });
  // weiterhin abgelehnt: unbekannte Pfade, neue Räume ohne Tabelle, andere Zone
  const schlecht = pruefeAenderungen(k, leseKiAntwort(JSON.stringify([{ aktion: 'wert', pfad: 'loot.gold', wert: 1 }, { aktion: 'raum', buchstabe: 'q', spawnChance: 0.5 }])));
  assert.deepEqual(schlecht.eintraege.map((e) => e.art), ['ungueltig', 'ungueltig']);
  assert.throws(() => pruefeAenderungen(k, leseKiAntwort(JSON.stringify([{ aktion: 'bereich', zone: 'waldweg' }, { aktion: 'wert', pfad: 'loot.spawnChance', wert: 0.3 }]))), /waldweg/);
  assert.equal(zahlAus('0,6'), 0.6);
  assert.equal(zahlAus('abc'), null);
  assert.equal(anteil('60%'), 0.6);
  assert.equal(anteil(0.3), 0.3);
  assert.equal(anteil(250), null);
});

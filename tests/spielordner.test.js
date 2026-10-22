/**
 * Spielordner-Modelle für die KI (editor/kern/spielordner.js): Katalog, KI-Aktion `modell`, Gemini-Kontext, Spiel-Lader.
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { KARTEN, verarbeiteKarte } from '../server/spiel/karten/kartenLader.js';
import { ausDefinition, nachDefinition } from '../editor/kern/format.js';
import { leseKiAntwort, pruefeAenderungen } from '../editor/kern/kiImport.js';
import { baueKontext } from '../editor/kern/gemini.js';
import { setzeSpielordner, spielordnerTyp, spielordnerKontext, spielordnerGroesse } from '../editor/kern/spielordner.js';

const index = JSON.parse(fs.readFileSync(new URL('../client/assets/eigene/index.json', import.meta.url), 'utf8'));
const laden = () => ausDefinition(KARTEN.stadtrand.definition ?? KARTEN.stadtrand).karte;
before(() => setzeSpielordner(index));

test('index.json: alle Modelle haben Maße, Vorschaubild, Kategorie und gültigen Dateinamen', () => {
  assert.ok(index.length >= 400);
  const bereiche = new Set(['natur', 'tiere', 'bau', 'moebel', 'fahrzeuge', 'gegenstaende', 'essen', 'deko']);
  for (const e of index) {
    assert.ok(bereiche.has(e.kategorie), `Kategorie fehlt: ${e.datei}`);
    assert.ok(e.zielHoehe > 0, `zielHoehe fehlt: ${e.datei}`);
    assert.ok(e.masse?.b > 0 && e.masse.h > 0 && e.masse.hoehe > 0, `Maße fehlen: ${e.datei}`);
    assert.match(e.datei, /^[a-z0-9_-]+\.glb$/, e.datei);
    assert.ok(fs.existsSync(new URL(`../client/assets/eigene/vorschau/${e.datei.replace(/\.glb$/, '.png')}`, import.meta.url)), `Vorschau fehlt: ${e.datei}`);
  }
  assert.equal(spielordnerGroesse(), index.length);
});

test('spielordnerTyp: Zielhöhe skaliert gleichmäßig, Typ-ID mit Höhe', () => {
  const natuerlich = spielordnerTyp('wolf', 2.7);
  const klein = spielordnerTyp('wolf', 0.9);
  assert.equal(spielordnerTyp('wolf').typId, 'sf_wolf_9', 'ohne Höhe: realistische Standardhöhe (zielHoehe)');
  assert.equal(spielordnerTyp('cat').hoehe, 0.35, 'Katze nicht mehr 40 m');
  assert.equal(klein.typId, 'sf_wolf_9');
  assert.equal(klein.typ.glbDatei, 'assets/eigene/wolf.glb');
  assert.ok(klein.b < natuerlich.b && klein.h < natuerlich.h);
  assert.ok(Math.abs(klein.h / klein.b - natuerlich.h / natuerlich.b) < 0.05, 'Proportionen bleiben');
  assert.equal(spielordnerTyp('gibts-nicht'), null);
});

test('KI-Aktion modell: legt Typ + Objekt an, Spiel-Lader nimmt es an; unbekannt/Kollision = ungültig', () => {
  const karte = laden();
  const bereich = { x0: 20, x1: 40, y0: 20, y1: 40 };
  const antwort = leseKiAntwort(JSON.stringify([
    { aktion: 'modell', modell: 'wolf', x: 25, y: 25, hoehe: 0.9, drehung: 90 },
    { aktion: 'modell', modell: 'wolf.glb', x: 30, y: 25, hoehe: 0.9 },
    { aktion: 'modell', modell: 'gibts-nicht', x: 25, y: 30 },
  ]));
  const erg = pruefeAenderungen(karte, antwort, { bereich });
  assert.equal(erg.eintraege.filter((e) => e.art === 'neu').length, 2, JSON.stringify(erg.eintraege.map((e) => e.text)));
  assert.equal(erg.eintraege.filter((e) => e.art === 'ungueltig').length, 1);
  const typOps = erg.ops.filter((o) => o.s === 'typen');
  assert.equal(typOps.length, 1, 'gleicher Typ nur einmal');
  karte.anwenden(erg.ops);
  assert.ok(karte.s('typen').has('sf_wolf_9'));
  const objekte = [...karte.s('objekte').values()].filter((o) => o.typ === 'sf_wolf_9');
  assert.equal(objekte.length, 2);
  assert.equal(objekte[0].drehung, 90);
  const geladen = verarbeiteKarte(nachDefinition(karte));
  assert.equal(geladen.daten.typen.sf_wolf_9.glbDatei, 'assets/eigene/wolf.glb');
});

test('Gemini-Kontext nennt die Spielordner-Modelle mit Maßen', () => {
  const k = baueKontext(laden(), { rechteck: { x: 5, y: 5, b: 10, h: 8 } });
  assert.match(k.text, /spielordnerModelle/);
  assert.match(k.text, /tiere: [^;]*wolf 0\.4x1\.8x0\.9/);
  assert.ok(spielordnerKontext().length < 20000, 'bleibt kompakt');
});

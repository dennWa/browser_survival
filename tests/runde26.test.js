import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { WIND_STUFEN } from '../server/spiel/systeme/wetterSystem.js';
import { TICK_DAUER_S } from '../gemeinsam/konstanten.js';
import { erstelleKonfiguration } from '../server/spiel/konfiguration/spielKonfiguration.js';
import { SpielWelt } from '../server/spiel/spielWelt.js';

const KARTE = { id: 'r26', name: 'R26', kacheln: ['#####', '#S,,#', '#####'], raeume: {}, objekte: [] };
function neueWelt(extra = {}) {
  const konfiguration = erstelleKonfiguration({ server: { zufallsStartwert: 7 }, tiere: { hasenProTausend: 0 }, ...extra, spieler: { startInventar: [] } });
  return { welt: new SpielWelt(konfiguration, { kartenDefinition: KARTE }) };
}

/** Runde 26 (KONZEPT_RUNDE26.md): Wetter-Sound, Wind-Flaute, Innen-Abschirmung. */

test('R26 Wind: es gibt echte Flaute (Stufe 0) und der Grundwind erreicht sie', () => {
  assert.ok(WIND_STUFEN.some(([w]) => w === 0), 'Stufe 0 vorhanden');
  const { welt } = neueWelt({ wetter: { aktiv: true, windMin: 1, windMax: 2, windTempo: 1 } });
  let minimum = 1;
  for (let i = 0; i < 6000; i++) {
    welt.aktualisiere(TICK_DAUER_S);
    if (welt.wetter.art === 'klar') minimum = Math.min(minimum, welt.wetter.wind);
  }
  assert.ok(minimum < 0.05, `bei klarem Wetter kommt Flaute vor (min ${minimum.toFixed(2)})`);
});

test('R26 Sound: Regen-Schleife ist eine echte, lange Aufnahme (nicht mehr die fast stumme 16-s-Datei)', () => {
  assert.ok(statSync('client/audio/eigene/regen.ogg').size > 400_000);
  const index = JSON.parse(readFileSync('client/audio/eigene/eigene.json', 'utf8'));
  assert.ok(index.regen.lautstaerke <= 1.2, 'kein Hochdrehen mehr nötig');
  assert.ok(index.zombie_stoehnen.lautstaerke < 0.8, 'Zombies leiser');
});

test('R26 Innen-Abschirmung: Renderer hält die Anzahl der Schnittebenen konstant', () => {
  const quelle = readFileSync('client/darstellung/renderer.js', 'utf8');
  assert.match(quelle, /this\.gl\.clippingPlanes = this\.innenEbenen/);
  assert.match(quelle, /#innenAbschirmung\(dt, fokus\)/);
});

test('R26 Grafik-Absturz: verlorener WebGL-Kontext wird abgefangen und gemeldet (sonst bleibt alles grau)', () => {
  const quelle = readFileSync('client/darstellung/renderer.js', 'utf8');
  assert.match(quelle, /addEventListener\('webglcontextlost'[\s\S]{0,80}preventDefault\(\)/);
  assert.match(quelle, /addEventListener\('webglcontextrestored'/);
  assert.match(quelle, /if \(this\.kontextVerloren\) return;/);
  const main = readFileSync('client/main.js', 'utf8');
  assert.match(main, /renderer\.beiKontext = grafikAbsturz/);
  assert.match(readFileSync('client/index.html', 'utf8'), /id="grafik-neu-laden"/);
});

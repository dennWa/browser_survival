import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TICK_DAUER_S } from '../gemeinsam/konstanten.js';
import { erstelleKonfiguration } from '../server/spiel/konfiguration/spielKonfiguration.js';
import { SpielWelt } from '../server/spiel/spielWelt.js';
import { setzeWetter } from '../server/spiel/systeme/wetterSystem.js';

/** Runde 24 (KONZEPT_RUNDE24.md): Wind, Progression, Waffen, Cozy, Überleben, Multiplayer. */
export const KARTE = {
  id: 'runde24',
  name: 'Runde 24',
  kacheln: [
    '##############################',
    '#S,,,,,,,,,,,,,,,,,,,,,,,,,,,#',
    '#,,,,,,,,,,,,,,,,,,,,,,,,,,,,#',
    '#,,,,,,,,,,,,,,,,,,,,,,,,,,,,#',
    '#,,,,,,,,,,,,,,,,,,,,,,,,,,,,#',
    '#,,,,,,,,,,,,,,,,,,,,,,,,,,,,#',
    '#,,,,,,,,,,,,,,,,,,,,,,,,,,,,#',
    '#,,,,,,,,,,,,,,,,,,,,,,,,,,,,#',
    '##############################',
  ],
  raeume: {},
  objekte: [{ typ: 'baum', x: 20, y: 6, b: 1, h: 1 }],
};
export const mitte = (t) => t * 32 + 16;

export function neueWelt(extra = {}) {
  const konfiguration = erstelleKonfiguration({ server: { zufallsStartwert: 5 }, tiere: { hasenProTausend: 0 }, wetter: { aktiv: false }, ...extra, spieler: { startInventar: [], ...extra.spieler } });
  const welt = new SpielWelt(konfiguration, { kartenDefinition: KARTE });
  for (const z of [...welt.alleVomTyp('zombie')]) welt.entfernen(z.id);
  const spieler = welt.spielerBetrittWelt('Tester');
  spieler.gottmodus = true;
  return { welt, spieler, konfiguration };
}
export const ticks = (welt, n) => {
  for (let i = 0; i < n; i++) welt.aktualisiere(TICK_DAUER_S);
};

test('P1 Wind: Grundwind wechselt zwischen ruhig und stark, geht in den Schnappschuss, Wetter setzt Grenzen', () => {
  const { welt } = neueWelt({ wetter: { aktiv: true, windMin: 2, windMax: 4, windTempo: 0.5 } });
  setzeWetter(welt, 'klar', 9999);
  const gesehen = new Set();
  for (let i = 0; i < 30 * 120; i++) {
    welt.aktualisiere(TICK_DAUER_S);
    if (i % 30 === 0) gesehen.add(Math.round(welt.wetter.wind * 10));
  }
  assert.ok(Math.min(...gesehen) <= 2 && Math.max(...gesehen) >= 6, `Windspanne ${[...gesehen]}`);
  const s = welt.schnappschuss();
  assert.ok(Number.isFinite(s.wind) && s.wind >= 0 && s.wind <= 1);
  setzeWetter(welt, 'sturm', 9999);
  ticks(welt, 30 * 3);
  assert.ok(welt.wetter.wind > 0.95, 'Sturm = voller Wind');
  setzeWetter(welt, 'nebel', 9999);
  ticks(welt, 30 * 3);
  assert.ok(welt.wetter.wind <= 0.12 + 1e-9, 'Nebel = fast windstill');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TICK_DAUER_S } from '../gemeinsam/konstanten.js';
import { erstelleKonfiguration } from '../server/spiel/konfiguration/spielKonfiguration.js';
import { SpielWelt } from '../server/spiel/spielWelt.js';
import { WALDSEE } from '../server/spiel/karten/waldsee.js';

/** Runde 41: Wild (Reh, Hirsch, Fuchs) über tierBereiche – sehr scheu, Herde flieht gemeinsam, mehr Fleisch. */
const mitte = (t) => t * 32 + 16;
const BREITE = 90;
const KARTE = {
  id: 'wild',
  name: 'Wild',
  kacheln: ['#'.repeat(BREITE), `#S${','.repeat(BREITE - 3)}#`, ...Array.from({ length: 39 }, () => `#${','.repeat(BREITE - 2)}#`), '#'.repeat(BREITE)],
  raeume: {},
  objekte: [],
  tierBereiche: [
    { x: 40, y: 15, b: 6, h: 6, art: 'reh', anzahl: 3 },
    { x: 60, y: 15, b: 4, h: 4, art: 'hirsch', anzahl: 1 },
    { x: 70, y: 30, b: 4, h: 4, art: 'quatsch', anzahl: 1 }, // unbekannte Art → Hase
  ],
};

function neueWelt() {
  const konfiguration = erstelleKonfiguration({ server: { zufallsStartwert: 5 }, wetter: { aktiv: false }, spieler: { startInventar: [] } });
  const welt = new SpielWelt(konfiguration, { kartenDefinition: KARTE });
  for (const z of [...welt.alleVomTyp('zombie')]) welt.entfernen(z.id);
  const spieler = welt.spielerBetrittWelt('Tester');
  spieler.gottmodus = true;
  spieler.x = mitte(2);
  spieler.y = mitte(2);
  return { welt, spieler };
}

test('Wild spawnt je Bereich mit eigener Art und eigenen Werten', () => {
  const { welt } = neueWelt();
  const tiere = [...welt.alleVomTyp('tier')];
  assert.equal(tiere.filter((t) => t.art === 'reh').length, 3);
  assert.equal(tiere.filter((t) => t.art === 'hirsch').length, 1);
  assert.equal(tiere.filter((t) => t.art === 'hase').length, 1);
  const hirsch = tiere.find((t) => t.art === 'hirsch');
  assert.equal(hirsch.leben, welt.konfiguration.tiere.wild.hirsch.leben);
  assert.ok(hirsch.trefferRadius > 17);
});

test('Reh flieht schon von weit, die Herde rennt mit, Flucht ist lang', () => {
  const { welt, spieler } = neueWelt();
  const rehe = [...welt.alleVomTyp('tier')].filter((t) => t.art === 'reh');
  rehe.forEach((r, i) => Object.assign(r, { x: mitte(42) + i * 40, y: mitte(18) }));
  const start = { x: rehe[0].x, y: rehe[0].y };
  spieler.x = rehe[0].x - 520; // außerhalb des Hasen-Radius (300), innerhalb des Reh-Radius
  spieler.y = rehe[0].y;
  welt.aktualisiere(TICK_DAUER_S);
  for (const r of rehe) assert.equal(r.zustand, 'flucht', 'ganze Herde flieht');
  spieler.x = mitte(2);
  spieler.y = mitte(2);
  for (let i = 0; i < 30 * 3; i++) welt.aktualisiere(TICK_DAUER_S);
  assert.ok(Math.hypot(rehe[0].x - start.x, rehe[0].y - start.y) > 450, 'rennt im Galopp weit weg');
});

test('Erlegter Hirsch gibt mehr Fleisch als ein Hase', async () => {
  const { toeten } = await import('../server/spiel/systeme/kampfSystem.js');
  const { welt } = neueWelt();
  const hirsch = [...welt.alleVomTyp('tier')].find((t) => t.art === 'hirsch');
  const vorher = [...welt.alleVomTyp('gegenstand')].length;
  toeten(welt, hirsch, null);
  const fleisch = [...welt.alleVomTyp('gegenstand')].length - vorher;
  assert.equal(fleisch, welt.konfiguration.tiere.wild.hirsch.fleisch);
});

test('Waldsee: Hirsche/Rehe/Füchse sind Wild-Bereiche statt Deko-Modelle', () => {
  const arten = new Set(WALDSEE.tierBereiche.map((t) => t.art));
  for (const a of ['reh', 'hirsch', 'fuchs']) assert.ok(arten.has(a), a);
  assert.ok(!WALDSEE.objekte.some((o) => /^sf_(deer|stag|fox)_/.test(o.typ)));
});

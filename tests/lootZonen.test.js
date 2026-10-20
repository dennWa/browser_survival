/**
 * Editor 2.0, Schritt 6.2: Loot-Zonen – Feldprüfung, feste Punkte (innen/außen, nicht in Wänden/Möbeln), Würfeln mit
 * exakter Chance bzw. Gewicht + Menge, erwartete Ausbeute, Spiel: Lader legt Punkte an, lootSystem füllt sie, `max` begrenzt.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Zufall } from '../server/spiel/zufall.js';
import { verarbeiteKarte } from '../server/spiel/karten/kartenLader.js';
import { erstelleKonfiguration } from '../server/spiel/konfiguration/spielKonfiguration.js';
import { SpielWelt } from '../server/spiel/spielWelt.js';
import * as L from '../server/spiel/karten/lootZonen.js';

// 12 × 8: links draußen Gras, rechts ein Raum (Wände #, Fliesen .), Start S
const KARTE = {
  id: 'lootzone',
  name: 'Loot-Zone',
  kacheln: [
    ',,,,,,######',
    ',,,,,,#....#',
    ',,S,,,#....#',
    ',,,,,,#....#',
    ',,,,,,#....#',
    ',,,,,,###T##',
    ',,,,,,,,,,,,',
    ',,,,,,,,,,,,',
  ],
  raeume: {},
  objekte: [{ typ: 'tisch', x: 7, y: 1, b: 2, h: 1, blockiert: true }],
};

test('pruefeLootZone: unbekannte Items weg, Chancen > 100 % gemeldet, Rechteck in der Zone', () => {
  const { zone, fehler } = L.pruefeLootZone({ x: 10, y: 0, b: 50, h: 3, modus: 'chance', punkte: 999, eintraege: [{ id: 'verband', chance: 70 }, { id: 'gibtsnicht', chance: 5 }, { id: 'apfel', chance: 40, menge: [3, 1] }] }, { breite: 12, hoehe: 8 });
  assert.equal(zone.b, 2);
  assert.equal(zone.punkte, L.MAX_PUNKTE);
  assert.deepEqual(zone.eintraege.map((e) => e.id), ['verband', 'apfel']);
  assert.deepEqual(zone.eintraege[1].menge, [3, 3]);
  assert.ok(fehler.some((f) => f.includes('gibtsnicht')));
  assert.ok(fehler.some((f) => f.includes('110')));
  assert.equal(L.pruefeLootZone({ x: 0, y: 0, b: 2, h: 2, eintraege: [] }).zone, null);
});

test('Punkte: fest, nur freie Kacheln, innen/außen getrennt', () => {
  const kachel = (x, y) => ({ frei: !(x === 1 && y === 1), innen: x >= 2 });
  const zone = { x: 0, y: 0, b: 4, h: 2, punkte: 20, ort: 'alle' };
  const p = L.punkteDerZone(zone, kachel);
  assert.equal(p.length, 7, 'eine Kachel belegt');
  assert.deepEqual(L.punkteDerZone(zone, kachel), p, 'gleiche Eingabe = gleiche Punkte');
  assert.ok(L.punkteDerZone({ ...zone, ort: 'innen' }, kachel).every(([x]) => x >= 2));
  assert.ok(L.punkteDerZone({ ...zone, ort: 'aussen' }, kachel).every(([x]) => x < 2));
  assert.equal(L.punkteDerZone({ ...zone, punkte: 3 }, kachel).length, 3);
});

test('Würfeln: exakte Chance (Rest = nichts) und Gewicht, Mengen; erwartete Ausbeute', () => {
  const zufall = new Zufall(42);
  const zone = { modus: 'chance', eintraege: [{ id: 'verband', chance: 50, menge: [2, 4] }, { id: 'apfel', chance: 20 }] };
  const zaehler = { verband: 0, apfel: 0, nichts: 0 };
  for (let i = 0; i < 4000; i++) {
    const w = L.wuerfleAusZone(zone, zufall);
    if (!w) zaehler.nichts++;
    else {
      zaehler[w.id]++;
      if (w.id === 'verband') assert.ok(w.menge >= 2 && w.menge <= 4);
    }
  }
  assert.ok(Math.abs(zaehler.verband / 4000 - 0.5) < 0.04, JSON.stringify(zaehler));
  assert.ok(Math.abs(zaehler.apfel / 4000 - 0.2) < 0.03);
  assert.ok(Math.abs(zaehler.nichts / 4000 - 0.3) < 0.04);
  const a = L.erwarteteAusbeute({ ...zone, punkte: 10 });
  assert.equal(a.leer, 0.3);
  assert.equal(a.eintraege[0].wahrscheinlichkeit, 0.5);
  assert.equal(a.eintraege[0].stueck, 15, '0,5 × 10 Punkte × Ø 3 Stück');
  const g = L.erwarteteAusbeute({ modus: 'gewicht', spawnChance: 0.5, punkte: 4, eintraege: [{ id: 'verband', gewicht: 3, menge: [1, 1] }, { id: 'apfel', gewicht: 1, menge: [1, 1] }] });
  assert.deepEqual(g.eintraege.map((e) => e.wahrscheinlichkeit), [0.375, 0.125]);
  assert.equal(g.leer, 0.5);
});

test('Spiel: Lader legt Zonen-Punkte an (nicht in Wand/Tisch, nur innen), lootSystem füllt sie, max begrenzt', () => {
  const lootZonen = [{ name: 'Küche', x: 6, y: 0, b: 6, h: 6, ort: 'innen', punkte: 50, modus: 'chance', eintraege: [{ id: 'apfel', chance: 100, menge: [2, 2] }], max: 3 }];
  const karte = verarbeiteKarte({ ...KARTE, lootZonen });
  const punkte = karte.lootPunkte.filter((p) => p.lootZone);
  // Raum innen: 4 × 4 = 16 Bodenkacheln, Tisch belegt 2 → 14 (Wände, Tür außen vor)
  assert.equal(punkte.length, 14);
  const g = karte.daten.kachelGroesse;
  for (const p of punkte) {
    const tx = Math.floor(p.x / g);
    const ty = Math.floor(p.y / g);
    assert.equal(karte.daten.kacheln[ty][tx], '.', `Punkt ${tx}|${ty} auf Innenboden`);
    assert.ok(!(ty === 1 && (tx === 7 || tx === 8)), 'nicht unter dem Tisch');
  }
  const konfiguration = erstelleKonfiguration({ server: { zufallsStartwert: 7 } });
  const welt = new SpielWelt(konfiguration, { kartenDefinition: { ...KARTE, lootZonen } });
  const items = [...welt.alleVomTyp('gegenstand')];
  assert.equal(items.length, 3, 'max = 3 gleichzeitig');
  assert.ok(items.every((i) => i.defId === 'apfel' && i.menge === 2));
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KARTEN, ladeKarte, verarbeiteKarte } from '../server/spiel/karten/kartenLader.js';
import { LOOT_TABELLEN } from '../server/spiel/konfiguration/lootTabellen.js';
import { GEGENSTAENDE } from '../server/spiel/konfiguration/gegenstaende.js';
import { Welt } from '../gemeinsam/welt/welt.js';

for (const id of Object.keys(KARTEN)) {
  test(`Karte "${id}" ist gültig`, () => {
    const karte = ladeKarte(id);
    const welt = new Welt(karte.daten);
    assert.ok(karte.spielerStarts.length > 0, 'braucht Spieler-Starts');
    for (const p of [...karte.spielerStarts, ...karte.zombieSpawns, ...karte.lootPunkte]) {
      const tx = Math.floor(p.x / welt.kachelGroesse);
      const ty = Math.floor(p.y / welt.kachelGroesse);
      assert.equal(welt.istBlockiert(tx, ty), false, `Spawn ${tx}|${ty} liegt in einer Wand`);
    }
    for (const p of karte.lootPunkte) assert.ok(LOOT_TABELLEN[p.lootTabelle], `Loot-Tabelle "${p.lootTabelle}" fehlt`);
  });
}

test('Alle Loot-Tabellen verweisen auf existierende Gegenstände', () => {
  for (const [name, tabelle] of Object.entries(LOOT_TABELLEN)) {
    for (const eintrag of tabelle) assert.ok(GEGENSTAENDE[eintrag.id], `${name}: "${eintrag.id}" unbekannt`);
  }
});

test('Kartenlader meldet ungleich lange Zeilen', () => {
  assert.throws(() => verarbeiteKarte({ id: 'kaputt', kacheln: ['S..', '..'], raeume: {} }), /Zeile 1/);
});

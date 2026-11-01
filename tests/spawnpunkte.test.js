/**
 * Studio Phase 1 (🎮): Item-Spawnpunkte (Chance, Intervall Echtzeit, Höhe auf Möbeln), Objekt-Skalierung im Kartenlader,
 * EditorKarte/Format reichen beides durch.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verarbeiteKarte } from '../server/spiel/karten/kartenLader.js';
import { erstelleKonfiguration } from '../server/spiel/konfiguration/spielKonfiguration.js';
import { SpielWelt } from '../server/spiel/spielWelt.js';
import { aktualisiereLoot } from '../server/spiel/systeme/lootSystem.js';
import * as S from '../server/spiel/karten/spawnpunkte.js';
import { gegenstandZuNetzwerk } from '../server/spiel/entitaeten/gegenstand.js';
import { ausDefinition, nachDefinition } from '../editor/kern/format.js';

const KARTE = {
  id: 'spawn',
  name: 'Spawn',
  kacheln: [',,,,,,,,', ',,S,,,,,', ',,,,,,,,', ',,,,,,,,'],
  raeume: {},
  objekte: [{ typ: 'tisch', x: 5, y: 1, b: 2, h: 1, blockiert: true, skalierung: 2 }],
};

test('pruefeSpawnpunkt: Grenzen, Inhalt (Item oder Tabelle), Menge, Höhe', () => {
  assert.equal(S.pruefeSpawnpunkt({ x: 1, y: 1, inhalt: 'gibtsnicht' }, { breite: 8, hoehe: 4 }).punkt, null);
  assert.equal(S.pruefeSpawnpunkt({ x: 9, y: 1, inhalt: 'apfel' }, { breite: 8, hoehe: 4 }).punkt, null);
  const { punkt } = S.pruefeSpawnpunkt({ x: 5.5, y: 1.5, inhalt: 'apfel', chance: 250, intervall: 0, menge: [3, 1], hoehe: 0.8 }, { breite: 8, hoehe: 4 });
  assert.deepEqual(punkt, { x: 5.5, y: 1.5, inhalt: 'apfel', chance: 100, intervall: S.SPAWN_INTERVALL_MIN, menge: [3, 3], hoehe: 0.8 });
  const tabelle = S.pruefeSpawnpunkt({ x: 1, y: 1, inhalt: 'tabelle:kueche', menge: [1, 2] }).punkt;
  assert.equal(tabelle.chance, 50);
  assert.equal(tabelle.intervall, 10);
  assert.equal(tabelle.menge, undefined, 'Tabellen nehmen die Standardmenge');
});

test('Kartenlader: Spawnpunkt → Loot-Punkt in Pixeln mit Chance/Intervall/Höhe, Skalierung wird durchgereicht', () => {
  const karte = verarbeiteKarte({ ...KARTE, spawnpunkte: [{ x: 5.5, y: 1.5, inhalt: 'apfel', chance: 40, intervall: 10, hoehe: 0.75 }, { x: 99, y: 0, inhalt: 'apfel' }] });
  const lp = karte.lootPunkte.filter((p) => p.spawnPunkt);
  assert.equal(lp.length, 1);
  assert.equal(lp[0].x, 5.5 * 32);
  assert.equal(lp[0].respawnZeit, 600, '10 Minuten Echtzeit');
  assert.equal(lp[0].spawnChance, 0.4);
  assert.equal(lp[0].hoehe, 24);
  assert.equal(karte.daten.objekte[0].skalierung, 2);
  assert.equal(verarbeiteKarte({ ...KARTE, objekte: [{ ...KARTE.objekte[0], skalierung: 99 }] }).daten.objekte[0].skalierung, 4);
});

test('lootSystem: 100 % legt sofort hin (mit Höhe im Netz), 0 % nie; nach Aufheben neuer Versuch erst nach dem Intervall', () => {
  const konfiguration = erstelleKonfiguration({ server: { zufallsStartwert: 3 } });
  const welt = new SpielWelt(konfiguration, { kartenDefinition: { ...KARTE, spawnpunkte: [{ x: 5.5, y: 1.5, inhalt: 'apfel', chance: 100, intervall: 1, menge: [2, 2], hoehe: 0.75 }, { x: 1.5, y: 3.5, inhalt: 'apfel', chance: 0 }] } });
  const items = [...welt.alleVomTyp('gegenstand')].filter((g) => g.defId === 'apfel');
  assert.equal(items.length, 1);
  assert.equal(items[0].menge, 2);
  assert.equal(gegenstandZuNetzwerk(items[0]).hoehe, 24);
  welt.entfernen(items[0].id);
  aktualisiereLoot(welt, 1); // bemerkt: aufgehoben → Timer 60 s
  aktualisiereLoot(welt, 30);
  assert.equal([...welt.alleVomTyp('gegenstand')].filter((g) => g.defId === 'apfel').length, 0, 'noch nicht nach 30 s');
  for (const s of welt.alleVomTyp('spieler')) s.x = 9999; // niemand in der Nähe
  aktualisiereLoot(welt, 31);
  assert.equal([...welt.alleVomTyp('gegenstand')].filter((g) => g.defId === 'apfel').length, 1, 'nach 61 s wieder da');
});

test('Format: spawnpunkte und skalierung überleben ausDefinition → nachDefinition', () => {
  const def = { ...KARTE, spawnpunkte: [{ x: 5.5, y: 1.5, inhalt: 'tabelle:kueche', chance: 30, intervall: 5 }] };
  const { karte } = ausDefinition(def);
  assert.equal(karte.s('spawnpunkte').size, 1);
  const zurueck = nachDefinition(karte);
  assert.deepEqual(zurueck.spawnpunkte, def.spawnpunkte);
  assert.equal(zurueck.objekte[0].skalierung, 2);
});

/**
 * Studio Phase 1.16 (🎮): Zombie-Bereiche – Prüfung, feste Verteilung, Mischung, Tageszeit (nachts erst später), Patrouille.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Z from '../server/spiel/karten/zombieBereiche.js';
import { verarbeiteKarte } from '../server/spiel/karten/kartenLader.js';
import { erstelleKonfiguration } from '../server/spiel/konfiguration/spielKonfiguration.js';
import { SpielWelt } from '../server/spiel/spielWelt.js';
import { ausDefinition, nachDefinition } from '../editor/kern/format.js';

const KARTE = {
  id: 'zb',
  name: 'ZB',
  kacheln: Array.from({ length: 20 }, (_, y) => (y === 1 ? ',S' + ','.repeat(28) : ','.repeat(30))),
  raeume: {},
  objekte: [],
};

test('Variantennamen passen zur Spielkonfiguration', () => {
  assert.deepEqual([...Z.ZOMBIE_VARIANTEN_NAMEN].sort(), Object.keys(erstelleKonfiguration().zombie.varianten).sort());
});

test('pruefeZombieBereich: Grenzen, Anzahl, unbekannte Varianten weg, Route ≥ 2 Punkte', () => {
  assert.equal(Z.pruefeZombieBereich({ x: 25, y: 0, b: 10, h: 5 }, { breite: 30, hoehe: 20 }).bereich, null);
  const { bereich } = Z.pruefeZombieBereich({ x: 10, y: 10, b: 6, h: 6, anzahl: 999, varianten: { laeufer: 3, gibtsnicht: 2 }, tageszeit: 'nacht', route: [{ x: 1, y: 1 }, { x: 20, y: 15 }] }, { breite: 30, hoehe: 20 });
  assert.equal(bereich.anzahl, Z.MAX_ANZAHL);
  assert.deepEqual(bereich.varianten, { laeufer: 3 });
  assert.equal(bereich.route.length, 2);
  assert.equal(Z.pruefeZombieBereich({ x: 1, y: 1, b: 2, h: 2, route: [{ x: 1, y: 1 }] }).bereich.route, undefined);
});

test('Lader: je Zombie ein Spawnpunkt im Bereich (fest), mit Mischung/Tageszeit/Route in Pixeln; Format hin und zurück', () => {
  const def = { ...KARTE, zombieBereiche: [{ x: 10, y: 10, b: 5, h: 5, anzahl: 4, varianten: { laeufer: 1 }, tageszeit: 'nacht', route: [{ x: 12, y: 12 }, { x: 25, y: 5 }] }] };
  const a = verarbeiteKarte(def).zombieSpawns.filter((s) => s.bereich === 0);
  const b = verarbeiteKarte(def).zombieSpawns.filter((s) => s.bereich === 0);
  assert.equal(a.length, 4);
  assert.deepEqual(a, b, 'gleiche Karte = gleiche Punkte');
  assert.ok(a.every((s) => s.x >= 10 * 32 && s.x < 15 * 32 && s.tageszeit === 'nacht' && s.route[1].x === 25 * 32));
  const { karte } = ausDefinition(def);
  assert.deepEqual(nachDefinition(karte).zombieBereiche, def.zombieBereiche);
});

test('SpielWelt: Nacht-Zombies erst nachts, Mischung greift, Patrouille setzt Wanderziele entlang der Route', () => {
  const k = erstelleKonfiguration({ server: { zufallsStartwert: 5 } });
  const welt = new SpielWelt(k, { kartenDefinition: { ...KARTE, zombieBereiche: [{ x: 10, y: 10, b: 5, h: 5, anzahl: 3, varianten: { laeufer: 1 }, tageszeit: 'nacht' }, { x: 2, y: 12, b: 4, h: 4, anzahl: 2, varianten: { brocken: 1 }, route: [{ x: 3, y: 13 }, { x: 25, y: 13 }] }] } });
  const zombies = () => [...welt.alleVomTyp('zombie')];
  assert.equal(zombies().length, 2, 'tagsüber nur die Route-Zombies');
  assert.ok(zombies().every((z) => z.variante === 'brocken' && z.route));
  welt.istNacht = true;
  for (const r of welt.zombieRespawns) r.rest = 0;
  for (const s of welt.alleVomTyp('spieler')) s.x = 99999;
  // Respawn-Schleife (zombieSystem) direkt anstoßen
  for (const r of [...welt.zombieRespawns]) {
    welt.zombieRespawns.splice(welt.zombieRespawns.indexOf(r), 1);
    welt.spawneZombie(r.spawnIndex);
  }
  assert.equal(zombies().filter((z) => z.variante === 'laeufer').length, 3, 'nachts kommen die Läufer');
});

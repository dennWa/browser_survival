/** Map-Editor 2.0, Schritt 8.1: Debug-Testlauf – Zeitlupe, Taktgeber, Schnappschuss für die Overlays, Zombie-Info */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SpielWelt } from '../server/spiel/spielWelt.js';
import { erstelleKonfiguration } from '../server/spiel/konfiguration/spielKonfiguration.js';
import { Taktgeber } from '../server/spiel/taktgeber.js';
import { TICK_DAUER_MS } from '../gemeinsam/konstanten.js';
import { ZEITLUPE, tickDauerBei, debugSchnappschuss, naechsterZombie, zombieInfo } from '../server/spiel/debugAnsicht.js';

const KARTE = {
  id: 'dbg',
  name: 'Debug',
  kacheln: [
    ',,,,,,,,,,,,,,,,,,,,',
    ',####,,,,,,,,,,,,,,,',
    ',#aa#,,,,,,,,,,,,,,,',
    ',#..#,,,,S,,,,,,,,,,',
    ',##T#,,,,,,,,,,,,,,,',
    ',,,,,,,,,,,,,,,,,,Z,',
    ',,,,,,,,,,,,,,,,,,,,',
    ',,,,,,,,,,Z,,,,,,,,,',
    ',,,,,,,,,,,,,,,,,,,,',
    ',,,,,,,,,,,,,,,,,,,,',
  ],
  raeume: { a: { name: 'Hütte', lootTabelle: 'huette' } },
  objekte: [],
  uebergaenge: [{ x: 19, y: 8, b: 1, h: 2, ziel: 'woanders', ankunft: 'west', name: 'Nach Osten' }],
  ankuenfte: { west: { x: 17, y: 8 } },
  klaenge: [{ art: 'punkt', name: 'Huhn', x: 5.5, y: 6.5, innen: 1, aussen: 4, daten: 'data:audio/wav;base64,AAAA' }],
};
const neueWelt = () => new SpielWelt(erstelleKonfiguration({ server: { zufallsStartwert: 3 } }), { kartenDefinition: KARTE });

test('Zeitlupe: Tick-Dauer je Faktor, begrenzt auf 0,1 … 1', () => {
  assert.deepEqual(ZEITLUPE, [0.1, 0.25, 0.5, 1]);
  assert.equal(tickDauerBei(1), TICK_DAUER_MS);
  assert.equal(tickDauerBei(0.25), TICK_DAUER_MS * 4);
  assert.ok(Math.abs(tickDauerBei(0.01) - TICK_DAUER_MS * 10) < 1e-9, 'nie langsamer als 0,1×');
  assert.equal(tickDauerBei(5), TICK_DAUER_MS, 'nie schneller als 1×');
  assert.equal(tickDauerBei('x'), TICK_DAUER_MS);
});

test('Taktgeber: neue Tick-Dauer gilt ab jetzt', () => {
  const t = new Taktgeber(TICK_DAUER_MS, () => {});
  t.setzeTickDauer(200);
  assert.equal(t.tickDauerMs, 200);
  assert.ok(t.naechsterTick > performance.now(), 'kein sofortiges Nachholen');
  assert.ok(!t.laeuft, 'Einstellen startet ihn nicht');
});

test('Taktgeber hält die Zeitlupe ein (0,25× ≈ 7,5 Ticks/s)', async () => {
  let n = 0;
  const t = new Taktgeber(TICK_DAUER_MS, () => n++);
  t.starten();
  t.setzeTickDauer(tickDauerBei(0.25));
  n = 0;
  await new Promise((r) => setTimeout(r, 1000));
  t.stoppen();
  assert.ok(n >= 6 && n <= 9, `${n} Ticks in 1 s`);
});

test('Schnappschuss: Zombies, Spawns mit Respawn-Timern, Loot, Übergänge, Klänge – ändert nichts', () => {
  const w = neueWelt();
  const vorher = w.tick;
  const s = debugSchnappschuss(w);
  assert.equal(w.tick, vorher);
  assert.equal(s.zombies.length, 2);
  assert.equal(s.spawns.length, 2);
  assert.ok(s.spawns.every((sp) => sp.lebend === 1 && sp.plaetze === 1 && sp.respawns.length === 0));
  assert.equal(s.loot.length, 2);
  assert.deepEqual(s.uebergaenge, [{ x: 19 * 32, y: 8 * 32, b: 32, h: 64, ziel: 'woanders', name: 'Nach Osten' }]);
  assert.equal(s.klaenge[0].art, 'punkt');
  assert.equal(s.klaenge[0].aussen, 4 * 32, 'Kacheln → Pixel');
  assert.equal(s.radien.bemerk, w.konfiguration.zombie.aggroRadius);
  // Zombie stirbt → Respawn-Timer am Spawnpunkt
  const z = [...w.alleVomTyp('zombie')][0];
  w.entfernen(z.id);
  w.planeZombieRespawn(z.spawnIndex);
  const s2 = debugSchnappschuss(w);
  const sp = s2.spawns.find((x) => x.x === z.spawnX && x.y === z.spawnY);
  assert.equal(sp.lebend, 0);
  assert.deepEqual(sp.respawns, [w.konfiguration.zombie.respawnZeit]);
});

test('Ziel, Pfad und Info eines jagenden Zombies; Klick-Treffer', () => {
  const w = neueWelt();
  const z = [...w.alleVomTyp('zombie')][0];
  z.zielId = 999;
  z.pfad = [{ x: 100, y: 100 }, { x: 132, y: 100 }];
  z.letztesZielX = 132;
  z.letztesZielY = 100;
  z.zustand = 'verfolgend';
  const s = debugSchnappschuss(w);
  const d = s.zombies.find((x) => x.id === z.id);
  assert.equal(d.ziel, null, 'Ziel-Spieler gibt es nicht → kein Ziel, aber Suchpunkt');
  assert.deepEqual(d.letztes, { x: 132, y: 100 });
  assert.equal(d.pfad.length, 2);
  assert.notEqual(d.pfad[0], z.pfad[0], 'Kopie, nicht das Server-Objekt');
  assert.equal(naechsterZombie(s, z.x + 10, z.y - 5)?.id, z.id);
  assert.equal(naechsterZombie(s, -500, -500), null);
  const info = zombieInfo(d).join('\n');
  assert.match(info, new RegExp(`#${z.id}`));
  assert.match(info, /verfolgt/);
  assert.match(info, /A\*-Pfad: 2 Wegpunkte/);
  assert.match(info, /Sucht bei 4\|3/);
});

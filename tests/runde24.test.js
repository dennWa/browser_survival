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

// ---------------------------------------------------------------- Phase 2: Progression & Sonder-Zombies
import { erzeugeZombie, waehleZombieVariante } from '../server/spiel/entitaeten/zombie.js';
import { hordeFuer, schickeHorde } from '../server/spiel/systeme/tageszeitSystem.js';
import { fuegeSchadenZu } from '../server/spiel/systeme/kampfSystem.js';
import { Zufall } from '../server/spiel/zufall.js';

const zombie = (welt, variante, x, y) => {
  const z = erzeugeZombie({ id: welt.neueId(), x, y, konfiguration: welt.konfiguration, variante });
  welt.hinzufuegen(z);
  return z;
};

test('P2 Horde wächst mit den Tagen, Boss-Nacht und Blutmond', () => {
  const k = erstelleKonfiguration();
  const t1 = hordeFuer(k, 1);
  const t5 = hordeFuer(k, 5);
  const t30 = hordeFuer(k, 29);
  assert.equal(t1.anzahl, k.zombie.nachtHorde);
  assert.ok(t5.anzahl > t1.anzahl && t30.anzahl <= k.zombie.nachtHorde * k.horde.maxFaktor);
  assert.equal(hordeFuer(k, 7).art, 'boss');
  assert.ok(hordeFuer(k, 7).bosse >= 1);
  const blut = hordeFuer(k, 10);
  assert.equal(blut.art, 'blutmond');
  assert.ok(blut.anzahl >= 2 * Math.round(k.zombie.nachtHorde * (1 + k.horde.wachstumProTag * 9)) - 1);
  assert.equal(hordeFuer(k, 20).lebenFaktor, k.horde.staerkeFaktor);
});

test('P2 Sonder-Zombies erst ab ihrem Tag', () => {
  const k = erstelleKonfiguration();
  const zufall = new Zufall(7);
  const frueh = new Set(Array.from({ length: 400 }, () => waehleZombieVariante(zufall, k, 1)));
  const spaet = new Set(Array.from({ length: 800 }, () => waehleZombieVariante(zufall, k, 12)));
  for (const v of ['sprinter', 'spucker', 'gepanzert', 'explosiv']) {
    assert.ok(!frueh.has(v), `${v} nicht an Tag 1`);
    assert.ok(spaet.has(v), `${v} an Tag 12`);
  }
});

test('P2 Blutmond-Horde: doppelt, Nachtart im Schnappschuss', () => {
  const { welt } = neueWelt();
  welt.karte.zombieSpawns.push({ x: mitte(25), y: mitte(6) });
  welt.tag = 10;
  welt.istNacht = true;
  welt.nachtArt = 'blutmond';
  const n = schickeHorde(welt, hordeFuer(welt.konfiguration, 10));
  assert.ok(n >= welt.konfiguration.zombie.nachtHorde * 2);
  assert.equal(welt.schnappschuss().nachtArt, 'blutmond');
});

test('P2 Gepanzert schluckt Schaden, Explosion nicht', () => {
  const { welt, spieler } = neueWelt();
  const z = zombie(welt, 'gepanzert', mitte(20), mitte(3));
  fuegeSchadenZu(welt, z, 20, spieler, 0);
  assert.ok(Math.abs(z.maxLeben - z.leben - 20 * (1 - welt.konfiguration.zombie.varianten.gepanzert.panzer)) < 1e-6);
  const vorher = z.leben;
  fuegeSchadenZu(welt, z, 20, spieler, 0, { explosion: true });
  assert.equal(vorher - z.leben, 20);
});

test('P2 Spucker spuckt aus Abstand, Treffer nur wer stehen bleibt', () => {
  const { welt, spieler } = neueWelt();
  spieler.gottmodus = false;
  spieler.x = mitte(5);
  spieler.y = mitte(4);
  const z = zombie(welt, 'spucker', mitte(12), mitte(4));
  z.spuckRest = 0;
  z.zielId = spieler.id;
  const leben = spieler.leben;
  ticks(welt, 30 * 2);
  assert.ok(welt.spuckeFluege.length > 0 || spieler.leben < leben, 'hat gespuckt');
  assert.ok(spieler.leben < leben, 'stehen bleiben = getroffen');
  assert.ok(Math.hypot(z.x - spieler.x, z.y - spieler.y) > 100, 'hält Abstand');
  // Ausweichen: nach dem Abschuss weggehen
  spieler.leben = 100;
  welt.spuckeFluege.length = 0;
  z.spuckRest = 0;
  welt.aktualisiere(TICK_DAUER_S);
  assert.equal(welt.spuckeFluege.length, 1);
  spieler.x += 120;
  ticks(welt, 30);
  assert.equal(spieler.leben, 100, 'ausgewichen');
});

test('P2 Explosiv-Zombie sprengt Spielerwand und verletzt Umstehende', () => {
  const { welt, spieler } = neueWelt();
  spieler.gottmodus = false;
  // Wand quer über die Karte (x = 15) – der Spieler steht dahinter
  for (let ty = 1; ty <= 7; ty++) welt.welt.setzeBauwerk({ id: welt.neueBauwerkId(), typ: 'holzwand', tx: 15, ty, besitzer: 'Tester' });
  spieler.x = mitte(18);
  spieler.y = mitte(4);
  const z = zombie(welt, 'explosiv', mitte(12), mitte(4));
  z.zielId = spieler.id;
  z.zustand = 'verfolgend';
  let explodiert = false;
  for (let i = 0; i < 30 * 15 && !explodiert; i++) {
    welt.aktualisiere(TICK_DAUER_S);
    explodiert = welt.ereignisse.some((e) => e.typ === 'explosion');
  }
  assert.ok(explodiert, 'ist explodiert');
  assert.ok(!welt.holen(z.id), 'Zombie weg');
  const reste = [1, 2, 3, 4, 5, 6, 7].filter((ty) => welt.welt.bauwerkBei(15, ty, 'wand')).length;
  assert.ok(reste < 7, `Wand gesprengt (${reste}/7 übrig)`);
});

test('P2 Explosiv-Zombie platzt beim Tod', () => {
  const { welt, spieler } = neueWelt();
  spieler.gottmodus = false;
  spieler.x = mitte(5);
  spieler.y = mitte(4);
  const z = zombie(welt, 'explosiv', mitte(6), mitte(4));
  const leben = spieler.leben;
  fuegeSchadenZu(welt, z, 999, spieler, 0);
  assert.ok(welt.ereignisse.some((e) => e.typ === 'explosion'));
  assert.ok(spieler.leben < leben);
});

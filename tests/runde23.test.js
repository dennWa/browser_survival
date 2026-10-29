import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TICK_DAUER_S } from '../gemeinsam/konstanten.js';
import { AKTIONEN } from '../gemeinsam/protokoll.js';
import { erstelleKonfiguration } from '../server/spiel/konfiguration/spielKonfiguration.js';
import { GEGENSTAENDE } from '../server/spiel/konfiguration/gegenstaende.js';
import { SpielWelt } from '../server/spiel/spielWelt.js';

/** Runde 23: Obst mit Wasser, Apfel beim Baumfällen, Esc im Bett, Abbau-Ereignis mit Menge (Popup „+N“). */
const KARTE = {
  id: 'runde23',
  name: 'Runde 23',
  kacheln: [
    '####################',
    '#S,,,,,,,,,,,,,,,,,#',
    '#,,,,,,,,,,,,,,,,,,#',
    '#,,,,,,,,,,,,,,,,,,#',
    '#,,,,,,,,,,,,,,,,,,#',
    '####################',
  ],
  raeume: {},
  objekte: [
    { typ: 'baum', x: 4, y: 2, b: 1, h: 1 },
    { typ: 'bett', x: 12, y: 2, b: 1, h: 2, blockiert: true },
  ],
};
const mitte = (t) => t * 32 + 16;

export function neueWelt(extra = {}) {
  const konfiguration = erstelleKonfiguration({ server: { zufallsStartwert: 3 }, tiere: { hasenProTausend: 0 }, wetter: { aktiv: false }, ...extra, spieler: { startInventar: [], ...extra.spieler } });
  const welt = new SpielWelt(konfiguration, { kartenDefinition: KARTE });
  for (const z of [...welt.alleVomTyp('zombie')]) welt.entfernen(z.id);
  const spieler = welt.spielerBetrittWelt('Tester');
  spieler.gottmodus = true;
  return { welt, spieler, konfiguration };
}
const ticks = (welt, n) => {
  for (let i = 0; i < n; i++) welt.aktualisiere(TICK_DAUER_S);
};
const aktion = (welt, spieler, a) => {
  spieler.aktionsPuffer.push({ slot: null, ...a });
  welt.aktualisiere(TICK_DAUER_S);
};
const anzahl = (spieler, defId) => spieler.inventar.reduce((s, e) => s + (e?.defId === defId ? e.menge : 0), 0);

test('Obst & Gemüse löschen etwa ⅓ ihres Nährwerts an Durst', () => {
  for (const id of ['apfel', 'tomate', 'kartoffel', 'paprika']) {
    const d = GEGENSTAENDE[id];
    assert.ok(d.durstwert > 0, id);
    assert.ok(Math.abs(d.durstwert - d.naehrwert / 3) <= 1, `${id}: ${d.durstwert} vs ${d.naehrwert}`);
  }
  const { welt, spieler } = neueWelt();
  spieler.durst = 40;
  spieler.inventar[0] = { defId: 'apfel', menge: 1 };
  aktion(welt, spieler, { art: AKTIONEN.KONSUMIEREN, slot: 0 });
  assert.ok(spieler.durst > 40);
});

test('Hunger/Durst sinken langsamer (seltener essen & trinken)', () => {
  const k = erstelleKonfiguration().ueberleben ?? erstelleKonfiguration().spieler;
  const hunger = k.hungerProMinute;
  const durst = k.durstProMinute;
  assert.ok(hunger <= 3 && durst <= 4.5, `${hunger}/${durst}`);
});

test('Baum fällen: Abbau-Ereignis trägt die Menge, mit apfelChance 1 gibt es einen Apfel dazu', () => {
  const { welt, spieler } = neueWelt({ ressourcen: { holz: { apfelChance: 1, dauer: 0.2 } } });
  spieler.inventar[0] = { defId: 'axt', menge: 1, haltbarkeit: 40 };
  spieler.x = mitte(4) + 30;
  spieler.y = mitte(2);
  aktion(welt, spieler, { art: AKTIONEN.ABBAUEN });
  const gesehen = [];
  for (let i = 0; i < 30; i++) {
    welt.aktualisiere(TICK_DAUER_S);
    gesehen.push(...welt.ereignisse.filter((e) => e.typ === 'abgebaut'));
  }
  assert.equal(anzahl(spieler, 'apfel'), 1);
  assert.ok(anzahl(spieler, 'holz') >= 1);
  assert.equal(gesehen.length, 1);
  assert.ok(gesehen[0].menge >= 1);
  assert.equal(gesehen[0].bonus, 'apfel');
});

test('Schlafen: zweite AKTION schlafen (Esc) lässt aufstehen', () => {
  const { welt, spieler } = neueWelt();
  spieler.x = mitte(11);
  spieler.y = mitte(2);
  aktion(welt, spieler, { art: AKTIONEN.SCHLAFEN });
  assert.equal(spieler.arbeit?.art, 'schlafen');
  ticks(welt, 5);
  aktion(welt, spieler, { art: AKTIONEN.SCHLAFEN });
  assert.equal(spieler.arbeit, null);
});

test('Wetter: Gewitter, Sturm, Nebel, Regen kommen vor; Gewitter löscht Feuer wie Regen', async () => {
  const { regnet, wetterDerZone, WETTER_ARTEN } = await import('../server/spiel/systeme/wetterSystem.js');
  const { welt } = neueWelt({ wetter: { aktiv: true, dauerMin: 1, dauerMax: 2, pauseMin: 1, pauseMax: 2 } });
  const gesehen = new Set();
  for (let i = 0; i < 30 * 600; i++) {
    welt.aktualisiere(TICK_DAUER_S);
    gesehen.add(welt.wetter.art);
  }
  for (const art of ['klar', 'regen', 'gewitter', 'sturm', 'nebel']) assert.ok(gesehen.has(art), `${art} (${[...gesehen]})`);
  assert.ok(!gesehen.has('schnee') && !gesehen.has('schneesturm'));
  assert.ok(regnet('gewitter') && regnet('regen') && !regnet('sturm') && !regnet('schneesturm'));
  assert.deepEqual(wetterDerZone(welt), ['klar', 'regen', 'gewitter', 'sturm', 'nebel']);
  assert.ok(WETTER_ARTEN.includes('schneesturm'));
  welt.welt.schnee = true;
  assert.deepEqual(wetterDerZone(welt), ['klar', 'schnee', 'schneesturm', 'sturm', 'nebel']);
});

test('Admin „Wetter wechseln“ schaltet alle Arten der Zone durch', async () => {
  const { ADMIN_BEFEHLE } = await import('../gemeinsam/protokoll.js');
  const { welt, spieler } = neueWelt({ wetter: { aktiv: true, pauseMin: 9999, pauseMax: 9999 } });
  spieler.admin = true;
  welt.wetter = { art: 'klar', rest: 9999 };
  const folge = [];
  for (let i = 0; i < 5; i++) {
    aktion(welt, spieler, { art: AKTIONEN.ADMIN, befehl: ADMIN_BEFEHLE.WETTER });
    folge.push(welt.wetter.art);
  }
  assert.deepEqual(folge, ['regen', 'gewitter', 'sturm', 'nebel', 'klar']);
});

test('Überfahren: Aufprall-Ereignis trägt das Ziel (Matsch-Sound im Client)', async () => {
  const quelle = await import('node:fs').then((fs) => fs.readFileSync(new URL('../server/spiel/systeme/fahrzeugSystem.js', import.meta.url), 'utf8'));
  assert.match(quelle, /ziel: 'zombie'/);
  assert.match(quelle, /ziel: 'tier'/);
});

test('Hase 2.0: sehr scheu, flieht weit (auch ohne Verfolger), erschrickt bei Schüssen', async () => {
  const { spawneHase, aktualisiereTiere } = await import('../server/spiel/systeme/tierSystem.js');
  const KARTE_WEIT = { id: 'weit', name: 'Weit', kacheln: ['#'.repeat(80), `#S${','.repeat(77)}#`, ...Array.from({ length: 39 }, () => `#${','.repeat(78)}#`), '#'.repeat(80)], raeume: {}, objekte: [] };
  const konfiguration = erstelleKonfiguration({ server: { zufallsStartwert: 9 }, tiere: { hasenProTausend: 0 }, wetter: { aktiv: false }, spieler: { startInventar: [] } });
  const welt = new SpielWelt(konfiguration, { kartenDefinition: KARTE_WEIT });
  for (const z of [...welt.alleVomTyp('zombie')]) welt.entfernen(z.id);
  const spieler = welt.spielerBetrittWelt('Tester');
  spieler.gottmodus = true;
  spieler.x = mitte(10);
  spieler.y = mitte(20);
  const hase = spawneHase(welt, 0);
  hase.x = mitte(17); // ~224 px entfernt: früher (150 px) ruhig, jetzt Flucht
  hase.y = mitte(20);
  welt.aktualisiere(TICK_DAUER_S);
  assert.equal(hase.zustand, 'flucht');
  const start = { x: hase.x, y: hase.y };
  spieler.x = mitte(2); // Spieler bleibt weit weg – Hase rennt trotzdem weiter
  ticks(welt, 30 * 3);
  assert.ok(Math.hypot(hase.x - start.x, hase.y - start.y) > 300, `weit geflohen (${Math.round(Math.hypot(hase.x - start.x, hase.y - start.y))} px)`);
  ticks(welt, 30 * 10);
  assert.equal(hase.zustand, 'ruhend');
  // Schuss in der Nähe → Flucht
  spieler.x = hase.x - 500;
  spieler.y = hase.y;
  welt.ereignisse.length = 0;
  welt.ereignis({ typ: 'feuer', von: spieler.id, x: spieler.x, y: spieler.y, winkel: 0 });
  aktualisiereTiere(welt, TICK_DAUER_S); // Schuss-Ereignis liegt im selben Tick vor
  assert.equal(hase.zustand, 'flucht');
});

test('Bots: laufen herum, sammeln Items auf, bekämpfen Zombies – über denselben Eingabeweg wie Spieler', async () => {
  const { spawneBot, botsDerZone } = await import('../server/spiel/systeme/botSystem.js');
  const { erzeugeZombie } = await import('../server/spiel/entitaeten/zombie.js');
  const { legeAufBoden } = await import('../server/spiel/systeme/inventarSystem.js');
  const KARTE_BOT = { id: 'bot', name: 'Bot', kacheln: ['#'.repeat(60), `#S${','.repeat(57)}#`, ...Array.from({ length: 28 }, () => `#${','.repeat(58)}#`), '#'.repeat(60)], raeume: {}, objekte: [] };
  const konfiguration = erstelleKonfiguration({ server: { zufallsStartwert: 4 }, tiere: { hasenProTausend: 0 }, wetter: { aktiv: false } });
  const welt = new SpielWelt(konfiguration, { kartenDefinition: KARTE_BOT });
  for (const z of [...welt.alleVomTyp('zombie')]) welt.entfernen(z.id);
  const bot = spawneBot(welt, { x: mitte(30), y: mitte(15) });
  assert.ok(bot.bot && bot.name.startsWith('Bot '));
  assert.equal(botsDerZone(welt).length, 1);
  // läuft herum
  ticks(welt, 30 * 8);
  assert.ok(Math.hypot(bot.x - mitte(30), bot.y - mitte(15)) > 40, 'bewegt sich');
  // Item in Sichtweite → aufheben
  legeAufBoden(welt, { defId: 'apfel', menge: 2 }, bot.x + 120, bot.y);
  for (let i = 0; i < 30 * 12 && anzahl(bot, 'apfel') === 0; i++) welt.aktualisiere(TICK_DAUER_S);
  assert.ok(anzahl(bot, 'apfel') >= 1, 'Apfel aufgehoben');
  // Zombie in Sicht → wird erschossen
  const zombie = welt.hinzufuegen(erzeugeZombie({ id: welt.neueId(), x: bot.x + 260, y: bot.y, konfiguration, variante: 'normal' }));
  zombie.zielId = null;
  for (let i = 0; i < 30 * 20 && welt.holen(zombie.id); i++) welt.aktualisiere(TICK_DAUER_S);
  assert.equal(welt.holen(zombie.id), undefined, 'Zombie tot');
  assert.ok(bot.statistik.zombies >= 1);
});

test('Admin: Bot per Klick setzen und wieder entfernen', async () => {
  const { ADMIN_BEFEHLE } = await import('../gemeinsam/protokoll.js');
  const { botsDerZone } = await import('../server/spiel/systeme/botSystem.js');
  const { welt, spieler } = neueWelt();
  spieler.admin = true;
  aktion(welt, spieler, { art: AKTIONEN.ADMIN, befehl: ADMIN_BEFEHLE.BOT_SETZEN, tx: 6, ty: 3 });
  assert.equal(botsDerZone(welt).length, 1);
  aktion(welt, spieler, { art: AKTIONEN.ADMIN, befehl: ADMIN_BEFEHLE.BOT_SETZEN, tx: 0, ty: 0 }); // Wand
  assert.equal(botsDerZone(welt).length, 1);
  const bot = botsDerZone(welt)[0];
  const g = welt.welt.kachelGroesse;
  aktion(welt, spieler, { art: AKTIONEN.ADMIN, befehl: ADMIN_BEFEHLE.BOT_ENTFERNEN, tx: Math.floor(bot.x / g), ty: Math.floor(bot.y / g) });
  assert.equal(botsDerZone(welt).length, 0);
  aktion(welt, spieler, { art: AKTIONEN.ADMIN, befehl: ADMIN_BEFEHLE.BOT_SETZEN, tx: 8, ty: 3 });
  aktion(welt, spieler, { art: AKTIONEN.ADMIN, befehl: ADMIN_BEFEHLE.BOT_SETZEN, tx: 9, ty: 3 });
  aktion(welt, spieler, { art: AKTIONEN.ADMIN, befehl: ADMIN_BEFEHLE.BOTS_ENTFERNEN });
  assert.equal(botsDerZone(welt).length, 0);
});

test('Bots halten niemanden vom Schlafen ab', async () => {
  const { spawneBot } = await import('../server/spiel/systeme/botSystem.js');
  const { welt, spieler } = neueWelt({ schlafen: { dauer: 0.5, stunden: 6 } });
  spawneBot(welt);
  spieler.x = mitte(11);
  spieler.y = mitte(2);
  const tagVorher = welt.zeit;
  aktion(welt, spieler, { art: AKTIONEN.SCHLAFEN });
  ticks(welt, 30 * 2);
  assert.equal(spieler.arbeit, null, 'aufgewacht');
  assert.ok(welt.zeit !== tagVorher, 'Zeit vorgespult');
});

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

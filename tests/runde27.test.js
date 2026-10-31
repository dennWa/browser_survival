import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TICK_DAUER_S } from '../gemeinsam/konstanten.js';
import { AKTIONEN } from '../gemeinsam/protokoll.js';
import { erstelleKonfiguration } from '../server/spiel/konfiguration/spielKonfiguration.js';
import { SpielWelt } from '../server/spiel/spielWelt.js';
import { erzeugeTier } from '../server/spiel/entitaeten/tier.js';
import { fuegeSchadenZu } from '../server/spiel/systeme/kampfSystem.js';
import { spielerDatenPrivat } from '../server/spiel/entitaeten/spieler.js';

/** Runde 27: Haustiere anfüttern (10 % je Futter), unsterblich, in den Einstellungen freilassen. */
const KARTE = {
  id: 'runde27',
  name: 'Testwiese',
  kacheln: ['##########', '#S,,,,,,,#', ...Array.from({ length: 7 }, () => '#,,,,,,,,#'), '##########'],
  raeume: {},
  objekte: [],
};

function neueWelt(startwert = 7) {
  const konfiguration = erstelleKonfiguration({ server: { zufallsStartwert: startwert }, tiere: { hasenProTausend: 0 }, wetter: { aktiv: false }, spieler: { startInventar: [] } });
  const welt = new SpielWelt(konfiguration, { kartenDefinition: KARTE });
  for (const z of [...welt.alleVomTyp('zombie')]) welt.entfernen(z.id);
  for (const t of [...welt.alleVomTyp('tier')]) welt.entfernen(t.id);
  const spieler = welt.spielerBetrittWelt('Tester');
  spieler.gottmodus = true;
  spieler.x = 4 * 32 + 16;
  spieler.y = 4 * 32 + 16;
  return { welt, spieler };
}
const aktion = (welt, spieler, a) => {
  spieler.aktionsPuffer.push({ slot: null, ...a });
  welt.aktualisiere(TICK_DAUER_S);
};
const tier = (welt, art, x, y) => welt.hinzufuegen(erzeugeTier({ id: welt.neueId(), art, x, y, konfiguration: welt.konfiguration }));

test('R27 Katze: Fisch füttert nur an (Chance verfehlt), Fisch ist weg, Milch reicht nicht mehr', () => {
  const { welt, spieler } = neueWelt();
  welt.konfiguration.haustiere.zaehmChance = 0;
  const katze = tier(welt, 'katze', spieler.x + 30, spieler.y);
  spieler.inventar[0] = { defId: 'milch', menge: 1 };
  aktion(welt, spieler, { art: AKTIONEN.HAUSTIER, ziel: katze.id });
  assert.equal(spieler.inventar[0]?.defId, 'milch', 'Milch wird nicht angenommen');
  spieler.inventar[1] = { defId: 'fisch_forelle', menge: 3 };
  for (let i = 0; i < 3; i++) aktion(welt, spieler, { art: AKTIONEN.HAUSTIER, ziel: katze.id });
  assert.equal(katze.besitzer, undefined, 'bleibt wild');
  assert.equal(katze.angefuettert, 3);
  assert.ok(!spieler.inventar[1], 'alle Fische gefressen');
});

test('R27 Zähm-Chance: über viele Fleischstücke ≈ 10 %', () => {
  let gezaehmt = 0;
  for (let n = 0; n < 300; n++) {
    const { welt, spieler } = neueWelt(n + 1);
    const hund = tier(welt, 'hund', spieler.x + 30, spieler.y);
    spieler.inventar[0] = { defId: 'fleisch', menge: 1 };
    aktion(welt, spieler, { art: AKTIONEN.HAUSTIER, ziel: hund.id });
    if (hund.besitzer) gezaehmt++;
  }
  assert.ok(gezaehmt >= 300 * 0.04 && gezaehmt <= 300 * 0.2, `gezähmt ${gezaehmt}/300`);
});

test('R27 Hund & Katze sind unsterblich, Freilassen macht das Tier wieder wild', () => {
  const { welt, spieler } = neueWelt();
  welt.konfiguration.haustiere.zaehmChance = 1;
  const hund = tier(welt, 'hund', spieler.x + 30, spieler.y);
  const katze = tier(welt, 'katze', spieler.x - 30, spieler.y);
  fuegeSchadenZu(welt, katze, 9999, null);
  assert.ok(welt.holen(katze.id) && katze.leben > 0, 'wilde Katze überlebt');
  spieler.inventar[0] = { defId: 'fleisch', menge: 1 };
  aktion(welt, spieler, { art: AKTIONEN.HAUSTIER, ziel: hund.id });
  assert.equal(hund.besitzer, spieler.name);
  fuegeSchadenZu(welt, hund, 9999, null);
  assert.ok(welt.holen(hund.id) && hund.leben > 0, 'eigener Hund überlebt');
  assert.deepEqual(spielerDatenPrivat(spieler, welt.konfiguration, welt).haustiere, [{ art: 'hund', name: hund.name }]);
  const name = hund.name;
  aktion(welt, spieler, { art: AKTIONEN.HAUSTIER_FREILASSEN, tierArt: 'hund', name });
  assert.equal(spieler.haustiere.length, 0);
  assert.ok(welt.holen(hund.id), 'Tier bleibt in der Welt');
  assert.equal(hund.besitzer, null);
  for (let i = 0; i < 60; i++) welt.aktualisiere(TICK_DAUER_S);
  assert.ok(welt.holen(hund.id), 'streunt weiter (wird nicht als „Besitzer weg“ entfernt)');
  assert.equal(spielerDatenPrivat(spieler, welt.konfiguration, welt).haustiere, undefined);
});

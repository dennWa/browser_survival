import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TICK_DAUER_S } from '../gemeinsam/konstanten.js';
import { AKTIONEN } from '../gemeinsam/protokoll.js';
import { BEHAELTER, findeBehaelter, naechsterBehaelter } from '../gemeinsam/welt/behaelter.js';
import { erstelleKonfiguration } from '../server/spiel/konfiguration/spielKonfiguration.js';
import { LOOT_TABELLEN } from '../server/spiel/konfiguration/lootTabellen.js';
import { GEGENSTAENDE } from '../server/spiel/konfiguration/gegenstaende.js';
import { SpielWelt } from '../server/spiel/spielWelt.js';
import { KARTEN, verarbeiteKarte } from '../server/spiel/karten/kartenLader.js';

/**
 * Runde 25: durchsuchbare Schränke/Kisten der Karte (gemeinsam/welt/behaelter.js + kistenSystem 'm<Nr>').
 */
const KARTE = {
  id: 'runde25',
  name: 'Runde 25',
  kacheln: ['############', '#S+++++++++#', '#++++++++++#', '#++++++++++#', '############'],
  raeume: {},
  objekte: [
    { typ: 'kleiderschrank', x: 3, y: 1, b: 2, h: 0.8, blockiert: true },
    { typ: 'tisch', x: 6, y: 1, b: 2, h: 1, blockiert: true },
    { typ: 'kiste', x: 9, y: 3, b: 1, h: 1, blockiert: true },
    { typ: 'sf_schrank', x: 9, y: 1, b: 1, h: 1, blockiert: true },
  ],
  typen: { sf_schrank: { glbDatei: 'assets/eigene/fridge.glb' } },
};
const mitte = (t) => t * 32 + 16;

function neueWelt() {
  const konfiguration = erstelleKonfiguration({ server: { zufallsStartwert: 3 }, tiere: { hasenProTausend: 0 }, wetter: { aktiv: false }, spieler: { startInventar: [] } });
  const welt = new SpielWelt(konfiguration, { kartenDefinition: KARTE });
  for (const z of [...welt.alleVomTyp('zombie')]) welt.entfernen(z.id);
  const spieler = welt.spielerBetrittWelt('Sucher');
  spieler.x = mitte(4);
  spieler.y = mitte(2);
  return { welt, spieler };
}
const aktion = (welt, spieler, a) => {
  spieler.aktionsPuffer.push({ slot: null, ...a });
  welt.aktualisiere(TICK_DAUER_S);
};

test('Behälter: eingebaute Typen, alte Deko-Kisten und Editor-Modelle (über die .glb) werden erkannt – feste Nummern', () => {
  const daten = verarbeiteKarte(KARTE).daten;
  const liste = findeBehaelter(daten);
  assert.deepEqual(liste.map((b) => [b.id, b.art]), [['m0', 'kleiderschrank'], ['m1', 'kiste'], ['m2', 'kuehlschrank']]);
  assert.equal(naechsterBehaelter(liste, mitte(4), mitte(2), 32)?.id, 'm0');
  assert.equal(naechsterBehaelter(liste, mitte(6), mitte(3), 32), null, 'zu weit weg');
  for (const def of Object.values(BEHAELTER)) assert.ok(LOOT_TABELLEN[def.loot], `Loot-Tabelle ${def.loot}`);
  for (const t of Object.values(LOOT_TABELLEN)) for (const e of t) assert.ok(GEGENSTAENDE[e.id], `Item ${e.id}`);
});

test('Behälter: E öffnet (Inhalt gewürfelt, nur an den Öffner), Items nehmen/ablegen, Weltstand, schließt beim Weggehen', () => {
  const { welt, spieler } = neueWelt();
  welt.kistenNachrichten.length = 0;
  aktion(welt, spieler, { art: AKTIONEN.BEHAELTER, ziel: 0 });
  assert.equal(spieler.offeneKiste, 'm0');
  const n = welt.kistenNachrichten.find((k) => k.id === 'm0' && k.spielerId === spieler.id);
  assert.equal(n.inhalt.length, BEHAELTER.kleiderschrank.plaetze);
  assert.match(n.titel, /Kleiderschrank/);
  const b = welt.behaelter[0];
  b.inhalt.fill(null);
  b.inhalt[2] = { defId: 'jeans', menge: 1 };
  aktion(welt, spieler, { art: AKTIONEN.KISTE_NEHMEN, slot: 2 });
  assert.ok(spieler.inventar.some((e) => e?.defId === 'jeans'));
  assert.equal(b.inhalt[2], null);
  const slot = spieler.inventar.findIndex((e) => e?.defId === 'jeans');
  aktion(welt, spieler, { art: AKTIONEN.KISTE_LEGEN, slot });
  assert.equal(b.inhalt[0].defId, 'jeans');
  // Weltstand: Inhalt überlebt den Neustart
  const stand = JSON.parse(JSON.stringify(welt.weltzustand()));
  const neu = new SpielWelt(welt.konfiguration, { kartenDefinition: KARTE });
  assert.ok(neu.uebernimmWeltzustand(stand));
  assert.equal(neu.behaelter[0].inhalt[0].defId, 'jeans');
  assert.equal(neu.behaelter[1].inhalt, null, 'nie geöffnete Behälter bleiben ungewürfelt');
  // Weggehen schließt
  spieler.x = mitte(9);
  spieler.y = mitte(2);
  welt.aktualisiere(TICK_DAUER_S);
  assert.equal(spieler.offeneKiste, null);
});

test('Behälter: zu weit weg geht nicht auf; leer geräumt füllt er sich nach behaelterNachfuellen neu', () => {
  const { welt, spieler } = neueWelt();
  aktion(welt, spieler, { art: AKTIONEN.BEHAELTER, ziel: 1 }); // Kiste unten rechts – zu weit
  assert.equal(spieler.offeneKiste, null);
  assert.equal(welt.behaelter[1].inhalt, null);
  aktion(welt, spieler, { art: AKTIONEN.BEHAELTER, ziel: 0 });
  welt.behaelter[0].inhalt.fill(null);
  aktion(welt, spieler, { art: AKTIONEN.KISTE_SCHLIESSEN });
  const dauer = welt.konfiguration.loot.behaelterNachfuellen;
  for (let t = 0; t < dauer + 3; t += 1) welt.aktualisiere(1);
  assert.equal(welt.behaelter[0].inhalt, null, 'wird beim nächsten Öffnen neu gewürfelt');
});

test('Karten: Stadtrand hat die neuen Test-Behälter, Schneeland-Schränke sind durchsuchbar', () => {
  const stadtrand = findeBehaelter(verarbeiteKarte(KARTEN.stadtrand).daten).map((b) => b.art);
  for (const art of ['truhe', 'kleiderschrank', 'kommode', 'kuehlschrank', 'werkzeugkiste', 'holzkiste', 'kiste']) assert.ok(stadtrand.includes(art), art);
  const schnee = findeBehaelter(verarbeiteKarte(KARTEN.schneeland).daten).map((b) => b.art);
  assert.ok(schnee.includes('kleiderschrank') && schnee.includes('kuehlschrank'));
});

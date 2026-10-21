import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TICK_DAUER_S } from '../gemeinsam/konstanten.js';
import { AKTIONEN } from '../gemeinsam/protokoll.js';
import { erstelleKonfiguration } from '../server/spiel/konfiguration/spielKonfiguration.js';
import { SpielWelt } from '../server/spiel/spielWelt.js';
import { fuegeZumInventarHinzu } from '../server/spiel/systeme/inventarSystem.js';
import { neuesBauwerk } from '../server/spiel/systeme/bauSystem.js';
import { ZERLEGE_DAUER } from '../server/spiel/systeme/arbeitSystem.js';

/** Runde 18: Sitzen überall (Ä), leerer Schnellleisten-Platz, Zerlegen mit Werkzeug, Hacken-Schlag als Animation. */
const KARTE = {
  id: 'runde18',
  name: 'Runde 18',
  kacheln: [
    '#########################',
    '#S,,,,,,,,,,,,,,,,,,,,,,#',
    '#,,,,,,,,,,,,,,,,,,,,,,,#',
    '#,,,,,,,,,,,~~~~,,,,,,,,#',
    '#,,,,,,,,,,,~~~~,,,,,,,,#',
    '#,,,,,,,,,,,~~~~,,,,,,,,#',
    '#,,,,,,,,,,,,,,,,,,,,,,,#',
    '#########################',
  ],
  raeume: {},
  objekte: [
    { typ: 'auto_rot', x: 3, y: 5, b: 5.5, h: 3, drehung: 90, blockiert: true },
    ...Array.from({ length: 20 }, (_, i) => ({ typ: 'stein', x: 2 + i, y: 1, b: 1, h: 1, blockiert: true })),
  ],
};
const mitte = (t) => t * 32 + 16;

function neueWelt(extra = {}) {
  const konfiguration = erstelleKonfiguration({ server: { zufallsStartwert: 7 }, tiere: { hasenProTausend: 0 }, wetter: { aktiv: false }, ...extra, spieler: { startInventar: [], ...extra.spieler } });
  const welt = new SpielWelt(konfiguration, { kartenDefinition: KARTE });
  for (const z of [...welt.alleVomTyp('zombie')]) welt.entfernen(z.id);
  const spieler = welt.spielerBetrittWelt('Tester');
  spieler.x = mitte(10);
  spieler.y = mitte(6);
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
const slotVon = (spieler, defId) => spieler.inventar.findIndex((e) => e?.defId === defId);
/** Linksklick: Taste runter, ein Tick, wieder los. */
const klick = (welt, spieler) => {
  spieler.eingabePuffer.push({ seq: ++spieler.letzteVerarbeiteteSeq, x: 0, y: 0, blick: spieler.blick, angriff: true });
  ticks(welt, 1);
  spieler.eingabePuffer.push({ seq: ++spieler.letzteVerarbeiteteSeq, x: 0, y: 0, blick: spieler.blick, angriff: false });
  ticks(welt, 1);
  spieler.angriffsAbklingzeit = 0;
};
const inDieHand = (welt, spieler, defId) => aktion(welt, spieler, { art: AKTIONEN.BENUTZEN, slot: slotVon(spieler, defId) });


const feuerVor = (welt, spieler, brennt = true) => {
  const b = neuesBauwerk(welt, 'lagerfeuer', 11, 6, spieler.name);
  b.brennt = brennt;
  b.brennRest = 999;
  welt.welt.setzeBauwerk(b);
  spieler.blick = 0; // schaut nach Osten (+x) zur Kachel 11
  return b;
};

test('Sitzen (Ä): überall hinsetzen und wieder aufstehen; Bewegen steht auf; ohne Feuer keine Tarnung', () => {
  const { welt, spieler } = neueWelt();
  aktion(welt, spieler, { art: AKTIONEN.SITZEN });
  assert.equal(spieler.arbeit?.art, 'sitzen');
  assert.equal(spieler.arbeit.bauwerkId, null);
  aktion(welt, spieler, { art: AKTIONEN.SITZEN });
  assert.equal(spieler.arbeit, null, 'nochmal Ä = aufstehen');
  aktion(welt, spieler, { art: AKTIONEN.SITZEN });
  for (let i = 0; i < 10; i++) spieler.eingabePuffer.push({ seq: ++spieler.letzteVerarbeiteteSeq, x: 1, y: 0, blick: 0 });
  ticks(welt, 10);
  assert.equal(spieler.arbeit, null, 'Bewegung = aufstehen');
});

test('Sitzen am brennenden Lagerfeuer: Blick zum Feuer, heilt, Linksklick (Holz nachlegen) steht nicht auf', () => {
  const { welt, spieler } = neueWelt();
  const b = feuerVor(welt, spieler);
  spieler.blick = Math.PI;
  spieler.leben = 50;
  aktion(welt, spieler, { art: AKTIONEN.SITZEN });
  assert.equal(spieler.arbeit?.bauwerkId, b.id);
  assert.ok(Math.abs(spieler.blick) < 0.01, 'schaut zum Feuer');
  ticks(welt, 30);
  assert.ok(spieler.leben > 50, 'heilt am Feuer');
  fuegeZumInventarHinzu(spieler, 'holz', 3);
  inDieHand(welt, spieler, 'holz');
  klick(welt, spieler);
  assert.equal(spieler.arbeit?.art, 'sitzen', 'bleibt sitzen');
});

test('Leerer Schnellleisten-Platz: nichts mehr in der Hand', () => {
  const { welt, spieler } = neueWelt();
  fuegeZumInventarHinzu(spieler, 'axt', 1);
  inDieHand(welt, spieler, 'axt');
  assert.equal(spieler.ausgeruestet, slotVon(spieler, 'axt'));
  const leer = spieler.inventar.findIndex((e, i) => !e && i < 10);
  aktion(welt, spieler, { art: AKTIONEN.BENUTZEN, slot: leer });
  assert.equal(spieler.ausgeruestet, null);
});

test('Zerlegen: eigenes Lagerfeuer mit Axt/Hammer per Linksklick in 5 s abbauen → Item zurück; fremdes nicht', () => {
  for (const werkzeug of ['axt', 'hammer', 'spitzhacke']) {
    const { welt, spieler } = neueWelt();
    const b = feuerVor(welt, spieler, false);
    fuegeZumInventarHinzu(spieler, werkzeug, 1);
    inDieHand(welt, spieler, werkzeug);
    klick(welt, spieler);
    assert.equal(spieler.arbeit?.art, 'zerlegen', werkzeug);
    ticks(welt, Math.ceil((ZERLEGE_DAUER - 0.5) / TICK_DAUER_S));
    assert.ok(welt.welt.bauwerke.has(b.id), 'noch nicht fertig');
    ticks(welt, Math.ceil(1 / TICK_DAUER_S));
    assert.ok(!welt.welt.bauwerke.has(b.id), 'abgebaut');
    assert.equal(anzahl(spieler, 'lagerfeuer'), 1, 'Item zurück');
  }
  const { welt, spieler } = neueWelt();
  const fremd = neuesBauwerk(welt, 'lagerfeuer', 11, 6, 'Jemand');
  welt.welt.setzeBauwerk(fremd);
  spieler.blick = 0;
  fuegeZumInventarHinzu(spieler, 'axt', 1);
  inDieHand(welt, spieler, 'axt');
  klick(welt, spieler);
  assert.notEqual(spieler.arbeit?.art, 'zerlegen', 'fremdes Feuer bleibt');
});

test('Hacke: Feld anlegen/entfernen spielt einen kurzen Schlag (Aktion „hacke“), ohne Schaden', () => {
  const { welt, spieler } = neueWelt();
  fuegeZumInventarHinzu(spieler, 'hacke', 1);
  inDieHand(welt, spieler, 'hacke');
  aktion(welt, spieler, { art: AKTIONEN.FELD, tx: 10, ty: 5 });
  assert.equal(welt.welt.bauwerkBei(10, 5, 'objekt')?.typ, 'beet');
  assert.equal(spieler.aktion, 'hacke');
  ticks(welt, 30);
  aktion(welt, spieler, { art: AKTIONEN.FELD_ENTFERNEN, tx: 10, ty: 5 });
  assert.equal(spieler.aktion, 'hacke');
});

test('Eis (Schneezone): zugefrorenes Wasser ist begehbar, man rutscht nach dem Loslassen weiter; kein Angeln auf Eis', async () => {
  const { wendeEingabeAn } = await import('../gemeinsam/physik/bewegung.js');
  const { wurfZiel } = await import('../gemeinsam/welt/wasser.js');
  const eisKarte = { ...KARTE, id: 'eis18', schnee: true };
  const konfiguration = erstelleKonfiguration({ server: { zufallsStartwert: 7 }, tiere: { hasenProTausend: 0 }, wetter: { aktiv: false }, spieler: { startInventar: [] } });
  const welt = new SpielWelt(konfiguration, { kartenDefinition: eisKarte });
  assert.equal(welt.welt.istBlockiert(12, 4), false, 'Eis begehbar');
  assert.equal(welt.welt.istEis(mitte(12), mitte(4)), true);
  assert.equal(wurfZiel(welt.welt, mitte(10), mitte(4), 0, 200), null, 'kein Angeln auf Eis');
  const p = welt.physikParameter();
  const k = { x: mitte(12), y: mitte(4), blick: 0 };
  for (let i = 0; i < 20; i++) wendeEingabeAn(k, { x: 1, y: 0 }, welt.welt, p, TICK_DAUER_S);
  const losgelassen = k.x;
  for (let i = 0; i < 5; i++) wendeEingabeAn(k, { x: 0, y: 0 }, welt.welt, p, TICK_DAUER_S);
  assert.ok(k.x - losgelassen > 3, 'rutscht nach dem Loslassen weiter');
  // Vorhersage = Server: gleiche Eingaben, gleiche Werte
  const a = { x: mitte(12), y: mitte(4), blick: 0 };
  const b = { x: mitte(12), y: mitte(4), blick: 0 };
  for (let i = 0; i < 40; i++) {
    const e = { x: Math.sin(i / 3), y: Math.cos(i / 5), sprint: i % 7 < 3 };
    wendeEingabeAn(a, e, welt.welt, p, TICK_DAUER_S);
    wendeEingabeAn(b, { ...e }, welt.welt, { ...p }, TICK_DAUER_S);
  }
  assert.deepEqual([a.x, a.y, a.gleitX, a.gleitY], [b.x, b.y, b.gleitX, b.gleitY]);
  // Ohne Schneezone bleibt Wasser Wasser
  const { welt: normal } = neueWelt();
  assert.equal(normal.welt.istBlockiert(12, 4), true);
  assert.ok(wurfZiel(normal.welt, mitte(10), mitte(4), 0, 200), 'am See angeln geht');
});

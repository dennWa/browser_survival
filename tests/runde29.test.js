import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SpielWelt } from '../server/spiel/spielWelt.js';
import { erstelleKonfiguration } from '../server/spiel/konfiguration/spielKonfiguration.js';
import { AKTIONEN } from '../gemeinsam/protokoll.js';
import { TICK_DAUER_S } from '../gemeinsam/konstanten.js';
import { strahlTrifftBox } from '../gemeinsam/physik/strahl.js';
import { findePfad } from '../gemeinsam/physik/pfadfindung.js';
import { bewegeKoerper, wasserFaktor } from '../gemeinsam/physik/bewegung.js';
import { wetterSchichten, vorschauWetter } from '../gemeinsam/audio/umgebung.js';
import { untergrundFuer } from '../client/audio/schritte.js';
import { setzeWetter } from '../server/spiel/systeme/wetterSystem.js';
import { fuegeSchadenZu } from '../server/spiel/systeme/kampfSystem.js';
import { spawneBot } from '../server/spiel/systeme/botSystem.js';
import { naesseStufe } from '../server/spiel/systeme/gesundheitSystem.js';
import { erzeugeFahrzeug } from '../server/spiel/entitaeten/fahrzeug.js';
import { EREIGNISSE } from '../client/audio/eigeneSounds.js';

const FELD = {
  id: 'feld29',
  name: 'Feld',
  kacheln: [
    '####################',
    '#,,,,,,,~~~~,,,,,,,#',
    '#,S,,,,,~~~~,,,,,,,#',
    '#,,,,,,,~~~~,,,,,,,#',
    '#,,,,,,,,,#####,,,,#',
    '#,,,,,,,,,#...#,,,,#',
    '#,,,,,,,,,#...T,,,,#',
    '#,,,,,,,,,#####,,,,#',
    '#,,,,,,,,,,,,,,,,,,#',
    '####################',
  ],
  raeume: {},
  objekte: [],
};
const m = (t) => t * 32 + 16;
function feld(extra = {}) {
  const konfiguration = erstelleKonfiguration({ server: { zufallsStartwert: 3 }, tiere: { hasenProTausend: 0 }, wetter: { aktiv: false }, ziele: { aktiv: false }, bots: { proKarte: 0 }, ...extra });
  const welt = new SpielWelt(konfiguration, { kartenDefinition: FELD });
  for (const z of [...welt.alleVomTyp('zombie')]) welt.entfernen(z.id);
  const spieler = welt.spielerBetrittWelt('Held');
  spieler.gottmodus = false;
  spieler.x = m(3);
  spieler.y = m(2);
  return { welt, spieler, konfiguration };
}
const laufe = (welt, n) => {
  for (let i = 0; i < n; i++) welt.aktualisiere(TICK_DAUER_S);
};

test('Wasser: zu Fuß watbar mit halbem Tempo, für Autos/Bauen weiter blockiert, Katzen bleiben draußen, Hunde kommen mit', () => {
  const { welt } = feld();
  const w = welt.welt;
  assert.ok(w.istBlockiert(9, 2) && w.istWatbar(9, 2) && w.istWasser(m(9), m(2)));
  assert.equal(wasserFaktor(w, m(9), m(2)), 0.5);
  assert.equal(wasserFaktor(w, m(3), m(2)), 1);
  const test = (k) => {
    Object.assign(k, { x: m(7) + 8, y: m(2) });
    bewegeKoerper(k, 40, 0, 10, w);
    return k.x;
  };
  assert.ok(test({}) > m(8) - 8, 'Mensch geht rein');
  assert.ok(test({ typ: 'tier', art: 'hund' }) > m(8) - 8, 'Hund geht rein');
  assert.ok(test({ typ: 'tier', art: 'katze' }) < m(8) - 16, 'Katze bleibt am Ufer');
  const pfad = findePfad(w, m(3), m(2), m(14), m(2));
  assert.ok(pfad?.length, 'Weg führt durchs Wasser');
  assert.equal(findePfad(w, m(3), m(2), m(9), m(2), { waten: false }), null, 'ohne waten: Wasser bleibt Ziel-blockiert');
});

test('Konsum: dauert 5 s im Stehen, Laufen bricht ab, Takt-Geräusche; Schaden-Ton hängt am Treffer-Ereignis', () => {
  const { welt, spieler } = feld();
  spieler.hunger = 20;
  spieler.inventar[3] = { defId: 'apfel', menge: 1 };
  spieler.aktionsPuffer.push({ art: AKTIONEN.KONSUMIEREN, slot: 3 });
  laufe(welt, 30);
  assert.equal(spieler.arbeit?.art, 'konsum');
  assert.ok(spieler.hunger <= 20, 'noch nicht gegessen');
  laufe(welt, 30 * 4.5);
  assert.ok(spieler.hunger > 20 && !spieler.inventar[3] && !spieler.arbeit, 'nach 5 s wirkt es');
  spieler.inventar[3] = { defId: 'apfel', menge: 1 };
  const vorher = spieler.hunger;
  spieler.letzterKonsumTick = -1e9;
  spieler.aktionsPuffer.push({ art: AKTIONEN.KONSUMIEREN, slot: 3 });
  laufe(welt, 15);
  spieler.x += 20; // weggelaufen
  laufe(welt, 30 * 6);
  assert.ok(!spieler.arbeit && spieler.inventar[3] && spieler.hunger <= vorher, 'abgebrochen, Apfel bleibt');
  assert.ok(EREIGNISSE.verband && EREIGNISSE.essen && EREIGNISSE.trinken);
});

test('Autos: Schüsse treffen die Box und zerstören das Auto; Strahl gegen gedrehtes Rechteck', () => {
  assert.equal(strahlTrifftBox(0, 0, 1, 0, 100, 0, 0, 30, 10), 70);
  assert.equal(strahlTrifftBox(0, 0, 1, 0, 100, 40, 0, 30, 10), null);
  assert.ok(Math.abs(strahlTrifftBox(0, 0, 1, 0, 100, 0, Math.PI / 2, 30, 10) - 90) < 1e-6);
  const { welt, spieler, konfiguration } = feld();
  const fz = welt.hinzufuegen ? welt.hinzufuegen(erzeugeFahrzeug(welt.neueId(), 'auto', m(10), m(8), 0)) : null;
  const auto = fz ?? [...welt.alleVomTyp('fahrzeug')][0];
  assert.ok(auto, 'Auto da');
  Object.assign(auto, { x: m(10), y: m(8), winkel: 0, laenge: 70, breite: 34 });
  Object.assign(spieler, { x: m(3), y: m(8), blick: 0, ausgeruestet: 0, unendlichMunition: true });
  spieler.inventar[0] = { defId: 'pistole', menge: 1, magazin: 15 };
  const start = auto.leben;
  const faktor = konfiguration.fahrzeug.schussFaktor;
  for (let i = 0; i < 400 && !auto.kaputt; i++) {
    spieler.eingabePuffer.push({ seq: i + 1, x: 0, y: 0, blick: 0, angriff: true, sprint: false });
    welt.aktualisiere(TICK_DAUER_S);
  }
  assert.ok(faktor > 0 && auto.leben < start && auto.kaputt, `Wrack (${auto.leben})`);
});

test('Bots: sterben ohne Niederstrecken; wer sie anschießt, wird Ziel – Bot trifft trotz pvp aus zurück', () => {
  const { welt, spieler } = feld();
  const bot = spawneBot(welt, { x: m(6), y: m(8) });
  bot.gottmodus = false;
  Object.assign(spieler, { x: m(3), y: m(8) });
  fuegeSchadenZu(welt, bot, 5, spieler, 0, { schuss: true });
  assert.equal(bot.bot.zielId, spieler.id);
  assert.equal(bot.bot.feindId, spieler.id);
  assert.ok(bot.zustand.blutung, 'blutet');
  spieler.leben = spieler.maxLeben = 100;
  laufe(welt, 30 * 4);
  assert.ok(spieler.leben < 100, 'Bot schießt zurück');
  fuegeSchadenZu(welt, bot, 9999, spieler, 0, { schuss: true });
  assert.ok(bot.tot && !(bot.niedergestreckt > 0), 'Bot liegt nicht niedergestreckt herum');
});

test('Nässe: nach 15 s Regen klamm; draußen trocknet es nur bei Sonne am Tag, im Türrahmen wie drinnen', () => {
  const { welt, spieler } = feld({ wetter: { aktiv: true } });
  setzeWetter(welt, 'regen', 99999);
  laufe(welt, 30 * 14);
  assert.equal(naesseStufe(spieler.naesse), 1);
  laufe(welt, 30 * 2);
  assert.ok(spieler.naesse >= 1);
  spieler.naesse = 3;
  setzeWetter(welt, 'nebel', 99999);
  laufe(welt, 30 * 10);
  assert.equal(spieler.naesse, 3, 'Nebel trocknet nicht');
  setzeWetter(welt, 'klar', 99999);
  welt.istNacht = false;
  laufe(welt, 30 * 10);
  assert.ok(Math.abs(spieler.naesse - (3 - 10 / 120)) < 0.02, `2 min je Stufe (${spieler.naesse})`);
  setzeWetter(welt, 'regen', 99999);
  spieler.naesse = 2;
  Object.assign(spieler, { x: m(14), y: m(6) }); // Türkachel
  laufe(welt, 30 * 6);
  assert.ok(spieler.naesse < 2, 'unter dem Türrahmen regnet es nicht');
});

test('Klang: Starkregen ersetzt Regen, Winterkarte = Blizzard statt Wind (abwechselnd), drinnen alles leiser, Schritte in Häusern', () => {
  const stark = wetterSchichten({ w: vorschauWetter('starkregen'), wetter: 'starkregen' });
  assert.ok(stark.regen_stark > 0.9 && stark.regen === 0);
  const leicht = wetterSchichten({ w: vorschauWetter('regen'), wetter: 'regen' });
  assert.ok(leicht.regen === 1 && leicht.regen_stark === 0);
  const winter = (zeit) => wetterSchichten({ w: vorschauWetter('schnee', 1.5), wetter: 'schnee', schneeZone: true, zeit });
  assert.ok(winter(25).blizzard_a < 0.05 && winter(75).blizzard_b < 0.05 && winter(25).blizzard_b > 0.5, 'wechselt ab');
  assert.equal(winter(0).wind_leicht, 0);
  const nacht = (drinnen) => wetterSchichten({ w: vorschauWetter('klar'), hell: 0, wetter: 'klar', drinnen }).nacht;
  assert.ok(nacht(true) < nacht(false) * 0.5);
  const { welt } = feld();
  assert.equal(untergrundFuer(welt.welt, m(12), m(6)).ereignis, 'schritt_innen');
});

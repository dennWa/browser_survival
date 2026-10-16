import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TICK_DAUER_S } from '../gemeinsam/konstanten.js';
import { AKTIONEN } from '../gemeinsam/protokoll.js';
import { erstelleKonfiguration } from '../server/spiel/konfiguration/spielKonfiguration.js';
import { GEGENSTAENDE } from '../server/spiel/konfiguration/gegenstaende.js';
import { REZEPTE } from '../server/spiel/konfiguration/rezepte.js';
import { SpielWelt } from '../server/spiel/spielWelt.js';
import { erzeugeZombie } from '../server/spiel/entitaeten/zombie.js';
import { fuegeZumInventarHinzu } from '../server/spiel/systeme/inventarSystem.js';
import { fuegeSchadenZu } from '../server/spiel/systeme/kampfSystem.js';
import { schlageFahrzeug } from '../server/spiel/systeme/fahrzeugSystem.js';
import { spawneHase } from '../server/spiel/systeme/tierSystem.js';
import { wurfZiel } from '../gemeinsam/welt/wasser.js';
import { setzeWetter } from '../server/spiel/systeme/wetterSystem.js';
import { spielerZuNetzwerk } from '../server/spiel/entitaeten/spieler.js';
import { erstelleSpielstand, wendeSpielstandAn } from '../server/spiel/spielstand.js';

/**
 * Neue Mechaniken (v0.10): Auto-Haltbarkeit & Wrack, Boss beim Tod, Abbau-XP, Stapelgrößen, Crafting-Level,
 * Statistik, Hasen, Angeln (See), Wetter.
 */
const KARTE = {
  id: 'see',
  name: 'See',
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
    { typ: 'stein', x: 20, y: 5, b: 1, h: 1, blockiert: true },
  ],
};
const mitte = (t) => t * 32 + 16;

function neueWelt(extra = {}) {
  const konfiguration = erstelleKonfiguration({ server: { zufallsStartwert: 5 }, tiere: { hasenProTausend: 0 }, wetter: { aktiv: false }, ...extra, spieler: { startInventar: [], ...extra.spieler } });
  const welt = new SpielWelt(konfiguration, { kartenDefinition: KARTE });
  for (const z of [...welt.alleVomTyp('zombie')]) welt.entfernen(z.id);
  const spieler = welt.spielerBetrittWelt('Tester');
  return { welt, spieler, konfiguration };
}
const ticks = (welt, n) => {
  for (let i = 0; i < n; i++) welt.aktualisiere(TICK_DAUER_S);
};
const anzahl = (spieler, defId) => spieler.inventar.reduce((s, e) => s + (e?.defId === defId ? e.menge : 0), 0);
const zombieBei = (welt, x, y, variante = 'normal') => welt.hinzufuegen(erzeugeZombie({ id: welt.neueId(), x, y, konfiguration: welt.konfiguration, variante }));

// ---------------------------------------------------------------------------
test('Stapelgrößen: Munition 50, alles andere 20, Waffen/Werkzeug/Rucksack einzeln', () => {
  assert.equal(GEGENSTAENDE.munition_9mm.stapelbar, 50);
  assert.equal(GEGENSTAENDE.munition_12.stapelbar, 50);
  assert.equal(GEGENSTAENDE.holz.stapelbar, 20);
  assert.equal(GEGENSTAENDE.konservendose.stapelbar, 20);
  assert.equal(GEGENSTAENDE.pistole.stapelbar, 1);
  assert.equal(GEGENSTAENDE.axt.stapelbar, 1);
  assert.equal(GEGENSTAENDE.rucksack.stapelbar, 1);
  const { spieler } = neueWelt();
  assert.equal(fuegeZumInventarHinzu(spieler, 'holz', 45), 0);
  assert.deepEqual(spieler.inventar.filter(Boolean).map((e) => e.menge), [20, 20, 5]);
});

// ---------------------------------------------------------------------------
test('Auto: hält 10 Zombie-Schläge, Überfahren kostet nur 0,5, dann Wrack + Fahrer fliegt raus', () => {
  const { welt, spieler } = neueWelt();
  const auto = [...welt.alleVomTyp('fahrzeug')][0];
  assert.equal(auto.leben, 10);
  spieler.x = auto.x;
  spieler.y = auto.y - auto.breite / 2 - 20;
  spieler.aktionsPuffer.push({ art: AKTIONEN.FAHRZEUG, slot: null });
  ticks(welt, 1);
  assert.equal(spieler.fahrzeug, auto);

  // 9 Schläge: Auto lebt noch
  const z = zombieBei(welt, auto.x, auto.y - 60);
  for (let i = 0; i < 9; i++) fuegeSchadenZu(welt, spieler, 12, z);
  assert.equal(auto.leben, 1);
  assert.equal(spieler.leben, spieler.maxLeben, 'Fahrer bekommt nichts ab');
  assert.equal(auto.kaputt, false);
  // Überfahren: 0,5
  schlageFahrzeug(welt, auto, welt.konfiguration.fahrzeug.ueberfahrSchaden);
  assert.equal(auto.leben, 0.5);
  // der 10. Schlag zerstört es
  fuegeSchadenZu(welt, spieler, 12, z);
  assert.equal(auto.kaputt, true);
  assert.equal(spieler.fahrzeug, null, 'Spieler ausgeworfen');
  assert.equal(auto.fahrerId, null);
  assert.ok(Math.hypot(spieler.x - auto.x, spieler.y - auto.y) > 20, 'steht neben dem Wrack');
  // Wrack: nicht mehr einsteigbar
  spieler.aktionsPuffer.push({ art: AKTIONEN.FAHRZEUG, slot: null });
  ticks(welt, 1);
  assert.equal(spieler.fahrzeug, null);
  // Wrack bleibt blockierend und überlebt den Weltzustand
  const stand = JSON.parse(JSON.stringify(welt.weltzustand()));
  const neu = neueWelt().welt;
  neu.uebernimmWeltzustand(stand);
  assert.equal([...neu.alleVomTyp('fahrzeug')][0].kaputt, true);
});

test('Auto: Boss-Schläge zählen mehr, Zombies schlagen auf die Karosserie, nicht auf die Fahrer-Mitte', () => {
  const { welt, spieler } = neueWelt();
  const auto = [...welt.alleVomTyp('fahrzeug')][0];
  spieler.x = auto.x;
  spieler.y = auto.y - auto.breite / 2 - 20;
  spieler.aktionsPuffer.push({ art: AKTIONEN.FAHRZEUG, slot: null });
  ticks(welt, 1);
  spieler.x = auto.x; // wie beim Fahren: der Fahrer sitzt in der Mitte
  spieler.y = auto.y;
  const boss = zombieBei(welt, auto.x, auto.y - auto.breite / 2 - 30, 'brocken');
  boss.zielId = spieler.id;
  boss.zustand = 'verfolgend';
  ticks(welt, 90);
  assert.ok(auto.leben < 10, `Boss hat das Auto beschädigt (${auto.leben})`);
  assert.ok(10 - auto.leben >= 2, 'Boss-Schlag zählt mehr als 1');
});

test('Überfahren eines Zombies kostet nur 0,5 Haltbarkeit (kein endloses Farmen)', () => {
  const { welt, spieler } = neueWelt();
  const auto = [...welt.alleVomTyp('fahrzeug')][0];
  spieler.x = auto.x;
  spieler.y = auto.y - auto.breite / 2 - 20;
  spieler.aktionsPuffer.push({ art: AKTIONEN.FAHRZEUG, slot: null });
  ticks(welt, 1);
  auto.tempo = 120;
  const z = zombieBei(welt, auto.x + auto.laenge / 2 + 4, auto.y);
  z.leben = 5;
  welt.aktualisiere(TICK_DAUER_S);
  assert.equal(welt.holen(z.id), undefined, 'Zombie überfahren');
  assert.equal(auto.leben, 9.5);
});

// ---------------------------------------------------------------------------
test('Boss: viel Leben, mehr Schaden, 50 % Waffe + Munition', () => {
  const k = erstelleKonfiguration().zombie;
  assert.ok(k.varianten.brocken.leben >= 3 * k.leben, 'hält deutlich mehr aus');
  assert.ok(k.varianten.brocken.angriffsSchaden >= 3 * k.angriffsSchaden, 'teilt mehr aus');
  assert.equal(k.varianten.brocken.waffenChance, 0.5);

  const { welt, spieler } = neueWelt({ zombie: { varianten: { brocken: { waffenChance: 1 } } } });
  const boss = zombieBei(welt, mitte(10), mitte(2), 'brocken');
  const vorher = welt.anzahlVomTyp('gegenstand');
  fuegeSchadenZu(welt, boss, 99999, spieler);
  const neu = [...welt.alleVomTyp('gegenstand')];
  assert.ok(neu.length >= vorher + 1, 'Waffe liegt da');
  const waffe = neu.find((g) => ['nahkampf', 'fernkampf'].includes(GEGENSTAENDE[g.defId].kategorie));
  assert.ok(waffe, 'es ist eine Waffe');
  if (GEGENSTAENDE[waffe.defId].kategorie === 'fernkampf') {
    assert.ok(neu.some((g) => g.defId === GEGENSTAENDE[waffe.defId].munition), 'Schusswaffe kommt mit Munition');
  }

  const { welt: w0, spieler: s0 } = neueWelt({ zombie: { lootChance: 0, varianten: { brocken: { waffenChance: 0 } } } });
  fuegeSchadenZu(w0, zombieBei(w0, mitte(10), mitte(2), 'brocken'), 99999, s0);
  assert.equal(w0.anzahlVomTyp('gegenstand'), 0, 'ohne Chance nichts');
});

// ---------------------------------------------------------------------------
test('Abbau gibt 3 XP', () => {
  const { welt, spieler } = neueWelt();
  fuegeZumInventarHinzu(spieler, 'spitzhacke', 1);
  spieler.x = mitte(19);
  spieler.y = mitte(5);
  spieler.aktionsPuffer.push({ art: AKTIONEN.ABBAUEN, slot: null });
  ticks(welt, 1);
  assert.ok(spieler.arbeit, 'Abbau läuft');
  ticks(welt, Math.ceil((spieler.arbeit.rest + 0.5) / TICK_DAUER_S));
  assert.equal(anzahl(spieler, 'stein') >= 1, true);
  assert.equal(spieler.xp, 3);
});

test('Crafting-Level: höherwertige Rezepte erst ab Spieler-Level', () => {
  assert.ok(REZEPTE.feuerwehrbeil.level > 1);
  const { welt, spieler } = neueWelt();
  fuegeZumInventarHinzu(spieler, 'holz', 20);
  spieler.aktionsPuffer.push({ art: AKTIONEN.HERSTELLEN, slot: null, rezept: 'holzwand' });
  ticks(welt, 1);
  assert.equal(anzahl(spieler, 'holzwand'), 0, 'Level zu niedrig');
  assert.equal(anzahl(spieler, 'holz'), 20, 'nichts verbraucht');
  spieler.level = REZEPTE.holzwand.level;
  spieler.aktionsPuffer.push({ art: AKTIONEN.HERSTELLEN, slot: null, rezept: 'holzwand' });
  ticks(welt, 1);
  assert.equal(anzahl(spieler, 'holzwand'), 1);
});

test('Basisbau-Gerüst: Holzwand blockiert, Holzboden nicht', () => {
  const { welt, spieler } = neueWelt();
  fuegeZumInventarHinzu(spieler, 'holzwand', 1);
  fuegeZumInventarHinzu(spieler, 'holzboden', 1);
  spieler.x = mitte(5);
  spieler.y = mitte(2);
  spieler.aktionsPuffer.push({ art: AKTIONEN.PLATZIEREN, slot: spieler.inventar.findIndex((e) => e?.defId === 'holzwand'), tx: 6, ty: 2 });
  spieler.aktionsPuffer.push({ art: AKTIONEN.PLATZIEREN, slot: spieler.inventar.findIndex((e) => e?.defId === 'holzboden'), tx: 4, ty: 2 });
  ticks(welt, 1);
  assert.equal(welt.welt.istBlockiert(6, 2), true);
  assert.equal(welt.welt.bauwerkBei(4, 2)?.typ, 'holzboden');
  assert.equal(welt.welt.istBlockiert(4, 2), false);
});

// ---------------------------------------------------------------------------
test('Statistik: Zombies getötet, Spieler getötet, Zeit überlebt (Tod setzt die Zeit zurück) – auch im Spielstand', () => {
  const { welt, spieler } = neueWelt({ kampf: { pvp: true } });
  const z = zombieBei(welt, mitte(10), mitte(2));
  fuegeSchadenZu(welt, z, 9999, spieler);
  assert.equal(spieler.statistik.zombies, 1);
  ticks(welt, 60);
  assert.ok(spielerZuNetzwerk(spieler).ueberlebt >= 1, 'Zeit läuft');
  const opfer = welt.spielerBetrittWelt('Opfer');
  fuegeSchadenZu(welt, opfer, 9999, spieler);
  assert.equal(spieler.statistik.spieler, 1);
  assert.equal(opfer.statistik.ueberlebt, 0);
  const netz = spielerZuNetzwerk(spieler);
  assert.equal(netz.zombiesGetoetet, 1);
  assert.equal(netz.spielerGetoetet, 1);

  const stand = JSON.parse(JSON.stringify(erstelleSpielstand(spieler, 'see')));
  const { welt: w2, spieler: s2 } = neueWelt();
  assert.equal(wendeSpielstandAn(s2, stand, w2), true);
  assert.equal(s2.statistik.zombies, 1);
  assert.equal(s2.statistik.spieler, 1);
});

// ---------------------------------------------------------------------------
test('Hase: scheu, rennt weg, 1× Fleisch, kommt später wieder', () => {
  const { welt, spieler } = neueWelt();
  assert.equal(welt.anzahlVomTyp('tier'), 0);
  spieler.x = mitte(3);
  spieler.y = mitte(2);
  const hase = spawneHase(welt, 0);
  assert.ok(hase, 'Hase gespawnt');
  hase.x = mitte(5);
  hase.y = mitte(2);
  const vorher = Math.hypot(hase.x - spieler.x, hase.y - spieler.y);
  ticks(welt, 20);
  assert.equal(hase.zustand, 'flucht');
  assert.ok(Math.hypot(hase.x - spieler.x, hase.y - spieler.y) > vorher + 20, 'weggelaufen');

  fuegeSchadenZu(welt, hase, 9999, spieler);
  assert.equal(welt.holen(hase.id), undefined);
  const fleisch = [...welt.alleVomTyp('gegenstand')].filter((g) => g.defId === 'fleisch');
  assert.equal(fleisch.length, 1);
  assert.equal(fleisch[0].menge, 1);
  assert.equal(welt.tierRespawns.length, 1);
});

test('Hasen starten je nach Rasenfläche der Karte', () => {
  const { welt } = neueWelt({ tiere: { hasenProTausend: 100, hasenMax: 7 } });
  const frisch = new SpielWelt(welt.konfiguration, { kartenDefinition: KARTE });
  assert.equal(frisch.anzahlVomTyp('tier'), 7);
});

// ---------------------------------------------------------------------------
test('See: Wasser blockiert Laufen, aber nicht Sicht und Schüsse', () => {
  const { welt } = neueWelt();
  assert.equal(welt.welt.istBlockiert(13, 4), true);
  assert.equal(welt.welt.istSichtBlockiert(13, 4), false);
});

test('Angeln: auswerfen, Pose wackelt (Biss), erneut klicken = Fang; zu früh/zu spät = nichts', () => {
  const { welt, spieler } = neueWelt({ angeln: { doppelChance: 0, wartenMin: 1, wartenMax: 1, bissMin: 2.5, bissMax: 2.5 } });
  fuegeZumInventarHinzu(spieler, 'angel', 1);
  spieler.x = mitte(9);
  spieler.y = mitte(4);
  spieler.blick = 0; // nach rechts zum See
  assert.ok(wurfZiel(welt.welt, spieler.x, spieler.y, 0, 230), 'Wasser in Reichweite');
  assert.equal(wurfZiel(welt.welt, spieler.x, spieler.y, Math.PI, 230), null, 'Westen: kein Wasser');

  const klick = () => {
    spieler.eingabePuffer.push({ seq: ++spieler.letzteVerarbeiteteSeq, x: 0, y: 0, blick: spieler.blick, angriff: true });
    ticks(welt, 1);
    spieler.eingabePuffer.push({ seq: ++spieler.letzteVerarbeiteteSeq, x: 0, y: 0, blick: spieler.blick, angriff: false });
    ticks(welt, 1);
  };
  klick();
  assert.equal(spieler.angeln?.phase, 'wartet');
  assert.ok(spielerZuNetzwerk(spieler).angeln, 'Pose im Netz');
  ticks(welt, 45);
  assert.equal(spieler.angeln?.phase, 'biss', 'Pose wackelt');
  klick();
  assert.equal(spieler.angeln, null);
  const fische = anzahl(spieler, 'fisch_barsch') + anzahl(spieler, 'fisch_forelle') + anzahl(spieler, 'fisch_hecht');
  assert.equal(fische, 1, 'ein Fisch');

  // zu früh eingeholt
  klick();
  assert.equal(spieler.angeln?.phase, 'wartet');
  klick();
  assert.equal(spieler.angeln, null);
  assert.equal(anzahl(spieler, 'fisch_barsch') + anzahl(spieler, 'fisch_forelle') + anzahl(spieler, 'fisch_hecht'), 1, 'nichts gefangen');

  // zu spät
  klick();
  ticks(welt, 45);
  assert.equal(spieler.angeln?.phase, 'biss');
  ticks(welt, 90); // 3 s > 2,5 s Fenster
  assert.equal(spieler.angeln, null, 'verpasst');
  assert.equal(anzahl(spieler, 'fisch_barsch') + anzahl(spieler, 'fisch_forelle') + anzahl(spieler, 'fisch_hecht'), 1);
});

test('Angeln: 10 % Doppelfang; Bewegung bricht ab; ohne Angel / ohne Wasser wird normal angegriffen', () => {
  const { welt, spieler } = neueWelt({ angeln: { doppelChance: 1, wartenMin: 0.1, wartenMax: 0.1, bissMin: 3, bissMax: 3 } });
  assert.equal(erstelleKonfiguration().angeln.doppelChance, 0.1);
  spieler.x = mitte(9);
  spieler.y = mitte(4);
  const klick = () => {
    spieler.eingabePuffer.push({ seq: ++spieler.letzteVerarbeiteteSeq, x: 0, y: 0, blick: 0, angriff: true });
    ticks(welt, 1);
    spieler.eingabePuffer.push({ seq: ++spieler.letzteVerarbeiteteSeq, x: 0, y: 0, blick: 0, angriff: false });
    ticks(welt, 1);
  };
  klick();
  assert.equal(spieler.angeln, null, 'ohne Angel nichts');
  fuegeZumInventarHinzu(spieler, 'angel', 1);
  klick();
  ticks(welt, 10);
  assert.equal(spieler.angeln?.phase, 'biss');
  klick();
  const fische = anzahl(spieler, 'fisch_barsch') + anzahl(spieler, 'fisch_forelle') + anzahl(spieler, 'fisch_hecht');
  assert.equal(fische, 2, 'Doppelfang');

  klick();
  assert.ok(spieler.angeln);
  spieler.x -= 40; // wegbewegt
  ticks(welt, 1);
  assert.equal(spieler.angeln, null, 'Abbruch durch Bewegung');
});

// ---------------------------------------------------------------------------
test('Wetter: wechselt, Regen/Nebel dauern 1–5 Minuten, Wetter geht im Schnappschuss mit', () => {
  const { welt } = neueWelt({ wetter: { aktiv: true } });
  assert.equal(welt.schnappschuss().wetter, 'klar');
  const gesehen = new Set();
  const dauern = [];
  let letzte = welt.wetter.art;
  let seit = 0;
  for (let i = 0; i < 30 * 3600 * 2; i++) {
    welt.aktualisiere(TICK_DAUER_S);
    seit += TICK_DAUER_S;
    if (welt.wetter.art !== letzte) {
      if (letzte !== 'klar') dauern.push(seit);
      gesehen.add(letzte);
      letzte = welt.wetter.art;
      seit = 0;
    }
    gesehen.add(welt.wetter.art);
  }
  assert.ok(gesehen.has('regen') && gesehen.has('nebel') && gesehen.has('klar'), `alle Wetterarten (${[...gesehen]})`);
  assert.ok(dauern.length > 3);
  assert.ok(dauern.every((d) => d >= 59 && d <= 301), `Dauer 1–5 min: ${dauern.map(Math.round)}`);
  setzeWetter(welt, 'regen', 5);
  assert.equal(welt.schnappschuss().wetter, 'regen');
});

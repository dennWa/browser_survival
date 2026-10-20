/**
 * Editor 2.0, Schritt 6.2: Loot-Zonen – Feldprüfung, feste Punkte (innen/außen, nicht in Wänden/Möbeln), Würfeln mit
 * exakter Chance bzw. Gewicht + Menge, erwartete Ausbeute, Spiel: Lader legt Punkte an, lootSystem füllt sie, `max` begrenzt.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Zufall } from '../server/spiel/zufall.js';
import { verarbeiteKarte } from '../server/spiel/karten/kartenLader.js';
import { erstelleKonfiguration } from '../server/spiel/konfiguration/spielKonfiguration.js';
import { SpielWelt } from '../server/spiel/spielWelt.js';
import * as L from '../server/spiel/karten/lootZonen.js';

// 12 × 8: links draußen Gras, rechts ein Raum (Wände #, Fliesen .), Start S
const KARTE = {
  id: 'lootzone',
  name: 'Loot-Zone',
  kacheln: [
    ',,,,,,######',
    ',,,,,,#....#',
    ',,S,,,#....#',
    ',,,,,,#....#',
    ',,,,,,#....#',
    ',,,,,,###T##',
    ',,,,,,,,,,,,',
    ',,,,,,,,,,,,',
  ],
  raeume: {},
  objekte: [{ typ: 'tisch', x: 7, y: 1, b: 2, h: 1, blockiert: true }],
};

test('pruefeLootZone: unbekannte Items weg, Chancen > 100 % gemeldet, Rechteck in der Zone', () => {
  const { zone, fehler } = L.pruefeLootZone({ x: 10, y: 0, b: 50, h: 3, modus: 'chance', punkte: 999, eintraege: [{ id: 'verband', chance: 70 }, { id: 'gibtsnicht', chance: 5 }, { id: 'apfel', chance: 40, menge: [3, 1] }] }, { breite: 12, hoehe: 8 });
  assert.equal(zone.b, 2);
  assert.equal(zone.punkte, L.MAX_PUNKTE);
  assert.deepEqual(zone.eintraege.map((e) => e.id), ['verband', 'apfel']);
  assert.deepEqual(zone.eintraege[1].menge, [3, 3]);
  assert.ok(fehler.some((f) => f.includes('gibtsnicht')));
  assert.ok(fehler.some((f) => f.includes('110')));
  assert.equal(L.pruefeLootZone({ x: 0, y: 0, b: 2, h: 2, eintraege: [] }).zone, null);
});

test('Punkte: fest, nur freie Kacheln, innen/außen getrennt', () => {
  const kachel = (x, y) => ({ frei: !(x === 1 && y === 1), innen: x >= 2 });
  const zone = { x: 0, y: 0, b: 4, h: 2, punkte: 20, ort: 'alle' };
  const p = L.punkteDerZone(zone, kachel);
  assert.equal(p.length, 7, 'eine Kachel belegt');
  assert.deepEqual(L.punkteDerZone(zone, kachel), p, 'gleiche Eingabe = gleiche Punkte');
  assert.ok(L.punkteDerZone({ ...zone, ort: 'innen' }, kachel).every(([x]) => x >= 2));
  assert.ok(L.punkteDerZone({ ...zone, ort: 'aussen' }, kachel).every(([x]) => x < 2));
  assert.equal(L.punkteDerZone({ ...zone, punkte: 3 }, kachel).length, 3);
});

test('Würfeln: exakte Chance (Rest = nichts) und Gewicht, Mengen; erwartete Ausbeute', () => {
  const zufall = new Zufall(42);
  const zone = { modus: 'chance', eintraege: [{ id: 'verband', chance: 50, menge: [2, 4] }, { id: 'apfel', chance: 20 }] };
  const zaehler = { verband: 0, apfel: 0, nichts: 0 };
  for (let i = 0; i < 4000; i++) {
    const w = L.wuerfleAusZone(zone, zufall);
    if (!w) zaehler.nichts++;
    else {
      zaehler[w.id]++;
      if (w.id === 'verband') assert.ok(w.menge >= 2 && w.menge <= 4);
    }
  }
  assert.ok(Math.abs(zaehler.verband / 4000 - 0.5) < 0.04, JSON.stringify(zaehler));
  assert.ok(Math.abs(zaehler.apfel / 4000 - 0.2) < 0.03);
  assert.ok(Math.abs(zaehler.nichts / 4000 - 0.3) < 0.04);
  const a = L.erwarteteAusbeute({ ...zone, punkte: 10 });
  assert.equal(a.leer, 0.3);
  assert.equal(a.eintraege[0].wahrscheinlichkeit, 0.5);
  assert.equal(a.eintraege[0].stueck, 15, '0,5 × 10 Punkte × Ø 3 Stück');
  const g = L.erwarteteAusbeute({ modus: 'gewicht', spawnChance: 0.5, punkte: 4, eintraege: [{ id: 'verband', gewicht: 3, menge: [1, 1] }, { id: 'apfel', gewicht: 1, menge: [1, 1] }] });
  assert.deepEqual(g.eintraege.map((e) => e.wahrscheinlichkeit), [0.375, 0.125]);
  assert.equal(g.leer, 0.5);
});

test('Spiel: Lader legt Zonen-Punkte an (nicht in Wand/Tisch, nur innen), lootSystem füllt sie, max begrenzt', () => {
  const lootZonen = [{ name: 'Küche', x: 6, y: 0, b: 6, h: 6, ort: 'innen', punkte: 50, modus: 'chance', eintraege: [{ id: 'apfel', chance: 100, menge: [2, 2] }], max: 3 }];
  const karte = verarbeiteKarte({ ...KARTE, lootZonen });
  const punkte = karte.lootPunkte.filter((p) => p.lootZone);
  // Raum innen: 4 × 4 = 16 Bodenkacheln, Tisch belegt 2 → 14 (Wände, Tür außen vor)
  assert.equal(punkte.length, 14);
  const g = karte.daten.kachelGroesse;
  for (const p of punkte) {
    const tx = Math.floor(p.x / g);
    const ty = Math.floor(p.y / g);
    assert.equal(karte.daten.kacheln[ty][tx], '.', `Punkt ${tx}|${ty} auf Innenboden`);
    assert.ok(!(ty === 1 && (tx === 7 || tx === 8)), 'nicht unter dem Tisch');
  }
  const konfiguration = erstelleKonfiguration({ server: { zufallsStartwert: 7 } });
  const welt = new SpielWelt(konfiguration, { kartenDefinition: { ...KARTE, lootZonen } });
  const items = [...welt.alleVomTyp('gegenstand')];
  assert.equal(items.length, 3, 'max = 3 gleichzeitig');
  assert.ok(items.every((i) => i.defId === 'apfel' && i.menge === 2));
});

test('Loot-Vorlagen (6.3): eingebaut aus den Spiel-Tabellen, aus Zone speichern, verknüpfen, nachziehen, lösen, Datei', async () => {
  const V = await import('../editor/kern/lootVorlagen.js');
  const { EditorKarte } = await import('../editor/kern/karte.js');
  const { nachDefinition } = await import('../editor/kern/format.js');
  const eingebaut = V.eingebauteVorlagen();
  assert.ok(eingebaut['spiel:lager'].eintraege.length > 3 && eingebaut['spiel:lager'].eingebaut);
  const k = new EditorKarte({ id: 'v', breite: 20, hoehe: 20 });
  const zone = L.neueLootZone({ x: 1, y: 1, b: 4, h: 4 }, { tabelle: 'apotheke' });
  k.anwenden([{ s: 'lootZonen', k: 1, neu: zone }, { s: 'lootZonen', k: 2, neu: { ...zone, x: 10 } }]);
  const v = V.vorlageAusZone({ ...zone, modus: 'chance', eintraege: [{ id: 'verband', chance: 60 }], max: 2 }, { name: 'Sanitäter', ordner: 'Medizin' });
  assert.equal(v.ort, undefined, 'ohne Ort/Punkte');
  // verknüpfen: Zone 1 und 2
  k.anwenden([1, 2].map((n) => ({ s: 'lootZonen', k: n, neu: V.zoneMitVorlage(k.s('lootZonen').get(n), v, 'v_test') })));
  assert.equal(k.s('lootZonen').get(1).modus, 'chance');
  assert.equal(k.s('lootZonen').get(2).max, 2);
  assert.equal(k.s('lootZonen').get(1).x, 1, 'Ort bleibt');
  assert.equal(V.verknuepfungen([k], 'v_test'), 2);
  // Vorlage ändern → beide Zonen nachziehen
  const v2 = { ...v, eintraege: [{ id: 'apfel', chance: 30 }] };
  const ops = V.syncOps(k, 'v_test', v2);
  assert.equal(ops.length, 2);
  k.anwenden(ops);
  assert.deepEqual(k.s('lootZonen').get(2).eintraege, [{ id: 'apfel', chance: 30 }]);
  assert.equal(V.syncOps(k, 'v_test', v2).length, 0, 'schon aktuell');
  assert.ok(!V.weichtAb(k.s('lootZonen').get(1), v2));
  assert.ok(V.weichtAb({ ...k.s('lootZonen').get(1), eintraege: [] }, v2));
  // Spielformat: Items stecken in der Zone, `vorlage` stört den Lader nicht
  const def = nachDefinition(k);
  assert.ok(def.lootZonen.every((z) => z.eintraege[0].id === 'apfel'));
  assert.ok(L.pruefeLootZone(def.lootZonen[0]).zone);
  k.anwenden(V.loeseOps(k, 'v_test'));
  assert.equal(V.verknuepfungen([k], 'v_test'), 0);
  // Datei: nur eigene, Kollision → neue ID
  const datei = JSON.parse(JSON.stringify(V.vorlagenDatei({ v_test: v2, ...eingebaut })));
  assert.deepEqual(Object.keys(datei.vorlagen), ['v_test']);
  const gelesen = V.leseVorlagenDatei(datei, new Set(['v_test']));
  assert.equal(gelesen.anzahl, 1);
  assert.notEqual(Object.keys(gelesen.vorlagen)[0], 'v_test');
  assert.throws(() => V.leseVorlagenDatei({ format: 'x' }), /Keine Loot-Vorlagen/);
  assert.ok(V.passtVorlage(v, 'sani medizin'));
});

test('Loot-Dichte (6.4): Raum-Loot-Punkte und Zonen-Punkte, weich verteilt, Maximum an der Quelle', async () => {
  const { lootDichte } = await import('../editor/kern/lootZonenEditor.js');
  const { EditorKarte, markerSchluessel } = await import('../editor/kern/karte.js');
  const { ANZEIGEN, standardEbenen } = await import('../editor/kern/ebenen.js');
  const k = new EditorKarte({ id: 'd', breite: 20, hoehe: 20 });
  assert.equal(lootDichte(k).max, 0);
  k.anwenden([
    { s: 'raeume', k: 'a', neu: { name: 'Lager', lootTabelle: 'lager', spawnChance: 0.5 } },
    { s: 'marker', k: markerSchluessel(3, 3), neu: { art: 'loot', raum: 'a' } },
    { s: 'lootZonen', k: 1, neu: { name: 'Z', x: 10, y: 10, b: 2, h: 1, modus: 'chance', punkte: 2, ort: 'alle', eintraege: [{ id: 'apfel', chance: 80 }] } },
  ]);
  const d = lootDichte(k, { radius: 2 });
  assert.equal(d.quellen, 3);
  assert.equal(d.zellen.get('3,3'), 0.5, 'Raum-Chance an der Quelle');
  assert.ok(d.zellen.get('4,3') < 0.5 && d.zellen.get('4,3') > 0);
  assert.equal(d.zellen.get('8,3'), undefined, 'außerhalb des Radius nichts');
  assert.ok(d.zellen.get('10,10') > 0.8, 'zwei Zonen-Punkte überlagern sich');
  assert.ok(ANZEIGEN.some((a) => a.id === 'loot' && a.kuerzel.includes('O')));
  assert.equal(standardEbenen().lootDichte.sichtbar, false);
});

/**
 * Map-Editor 2.0, Phase 1 (Kern, umgebungsfrei): Bearbeiten gewählter Elemente (verschieben/drehen/duplizieren) mit
 * Raster- und Randregeln. Weitere Phase-1-Kerne (Backup, Gruppen, Befehls-Kürzel) kommen hier dazu.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EditorKarte, markerSchluessel } from '../editor/kern/karte.js';
import { verschiebeOps, dreheObjekt, dreheOps, dupliziereOps, ueberstand } from '../editor/kern/bearbeiten.js';
import { dreheVorlage } from '../editor/kern/auswahl.js';

const karte = () => new EditorKarte({ id: 't', breite: 20, hoehe: 15 });
const gewaehlt = (k, ...eintraege) => eintraege.map(([s, schl]) => ({ s, k: schl, wert: k.s(s).get(schl) }));

test('Verschieben: Objekte nicht über den Rand (Kronen höchstens halb), Marker in der Zone, Grund wird gemeldet', () => {
  const k = karte();
  k.anwenden([
    { s: 'objekte', k: 1, neu: { typ: 'tisch', x: 17, y: 3, b: 2, h: 1, blockiert: true } },
    { s: 'objekte', k: 2, neu: { typ: 'baum', x: 16, y: 5, b: 3.5, h: 3.5, ebene: 'oben' } },
    { s: 'marker', k: markerSchluessel(19, 14), neu: { art: 'start' } },
  ]);
  const ok = verschiebeOps(k, gewaehlt(k, ['objekte', 1]), 1, 0);
  assert.ok(ok.ops, 'bis an den Rand geht');
  k.anwenden(ok.ops);
  assert.equal(k.s('objekte').get(1).x, 18);
  const raus = verschiebeOps(k, gewaehlt(k, ['objekte', 1]), 1, 0);
  assert.equal(raus.ops, null);
  assert.match(raus.grund, /Rand/);
  // Krone darf halb überstehen, nicht mehr
  assert.ok(verschiebeOps(k, gewaehlt(k, ['objekte', 2]), 2, 0).ops);
  assert.equal(verschiebeOps(k, gewaehlt(k, ['objekte', 2]), 3, 0).ops, null);
  // Marker am Rand
  assert.equal(verschiebeOps(k, gewaehlt(k, ['marker', '19,14']), 1, 0).ops, null);
  // Altlast: schon überstehendes Objekt darf zurück in die Zone
  k.anwenden([{ s: 'objekte', k: 3, neu: { typ: 'sofa', x: 19, y: 0, b: 3, h: 1 } }]);
  assert.ok(ueberstand(k, k.s('objekte').get(3)) > 0);
  assert.ok(verschiebeOps(k, gewaehlt(k, ['objekte', 3]), -1, 0).ops);
  assert.equal(verschiebeOps(k, gewaehlt(k, ['objekte', 3]), 1, 0).ops, null);
});

test('Drehen: bleibt im Raster (kein halber Versatz), viermal drehen = Ausgangslage, nicht über den Rand', () => {
  const k = karte();
  let o = { typ: 'tisch', x: 17, y: 12, b: 2, h: 1, blockiert: true };
  const start = { ...o };
  for (let i = 0; i < 4; i++) {
    o = dreheObjekt(k, o);
    assert.ok(Number.isInteger(o.x) && Number.isInteger(o.y), `Raster nach ${i + 1}. Drehung: ${o.x}|${o.y}`);
    assert.ok(o.x + o.b <= k.breite && o.y + o.h <= k.hoehe, 'in der Zone');
  }
  assert.deepEqual(o, start);
  // 3×1 dreht sauber um die Mitte
  const lang = dreheObjekt(k, { typ: 'sofa', x: 5, y: 5, b: 3, h: 1 });
  assert.deepEqual([lang.x, lang.y, lang.b, lang.h, lang.drehung], [6, 4, 1, 3, 90]);
  // am Rand wird hineingeschoben
  const rand = dreheObjekt(k, { typ: 'sofa', x: 0, y: 14, b: 3, h: 1 });
  assert.ok(rand.y + rand.h <= k.hoehe && rand.y >= 0);
  // Mischauswahl: Marker werden gezählt, nicht gedreht
  k.anwenden([{ s: 'objekte', k: 1, neu: start }, { s: 'marker', k: '1,1', neu: { art: 'start' } }, { s: 'bauwerke', k: 2, neu: { typ: 'holztuer', tx: 3, ty: 3 } }]);
  const { ops, uebersprungen } = dreheOps(k, gewaehlt(k, ['objekte', 1], ['marker', '1,1'], ['bauwerke', 2]));
  assert.equal(ops.length, 2);
  assert.equal(uebersprungen, 1);
  assert.equal(ops[1].neu.drehung, 1);
});

test('Duplizieren: Objekte versetzt (am Rand nach innen), Marker auf freie Nachbarkachel, Ankünfte mit neuem Namen', () => {
  const k = karte();
  k.anwenden([
    { s: 'objekte', k: 1, neu: { typ: 'tisch', x: 18, y: 14, b: 2, h: 1 } },
    { s: 'marker', k: '5,5', neu: { art: 'zombie', anzahl: 2 } },
    { s: 'marker', k: '6,6', neu: { art: 'start' } },
    { s: 'ankuenfte', k: 'nord', neu: { x: 2, y: 0 } },
  ]);
  const { ops, neueAuswahl, uebersprungen } = dupliziereOps(k, gewaehlt(k, ['objekte', 1], ['marker', '5,5'], ['ankuenfte', 'nord']));
  assert.equal(uebersprungen, 0);
  k.anwenden(ops);
  const kopie = k.s('objekte').get(neueAuswahl[0].k);
  assert.deepEqual([kopie.x, kopie.y], [17, 13], 'am rechten/unteren Rand nach innen versetzt');
  // 6,6 ist belegt → nächste freie Nachbarkachel
  assert.equal(neueAuswahl[1].s, 'marker');
  assert.notEqual(neueAuswahl[1].k, '6,6');
  assert.deepEqual(k.s('marker').get(neueAuswahl[1].k), { art: 'zombie', anzahl: 2 });
  assert.ok(k.s('ankuenfte').has('nord2'));
});

test('Prefab drehen: Tür-/Fenster-Bauwerke kippen ihre Ausrichtung auch ohne gesetztes Feld', () => {
  const v = dreheVorlage({ b: 2, h: 1, zellen: [',', ','], hoehen: null, bauwerke: [{ typ: 'holztuer', tx: 0, ty: 0 }, { typ: 'holztuer', tx: 1, ty: 0, drehung: 1 }] });
  assert.equal(v.bauwerke[0].drehung, 1);
  assert.equal(v.bauwerke[1].drehung, 0);
});

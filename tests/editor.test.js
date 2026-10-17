/**
 * Map-Editor (editor/kern/): Datenmodell, Verlauf, Format (Spiel ⇄ Editor, Entwurf, Export), Malwerkzeuge, Zonengröße,
 * Auswahl/Zwischenablage, Platzierung, Validierung, Veröffentlichen. Alles umgebungsfrei (kein DOM).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KARTEN, verarbeiteKarte } from '../server/spiel/karten/kartenLader.js';
import { EditorKarte, markerSchluessel, umkehren } from '../editor/kern/karte.js';
import { Verlauf } from '../editor/kern/verlauf.js';
import { ausDefinition, nachDefinition, entwurfJson, exportJson, ladeDatei, FORMAT_VERSION } from '../editor/kern/format.js';
import { linie, rasteEin, rechteck, pinsel, fuellen, alsRechtecke, kachelOps } from '../editor/kern/raster.js';
import { neueZone, groesseAendern } from '../editor/kern/zone.js';
import { kopiere, einfuegeOps, loescheOps, dreheVorlage } from '../editor/kern/auswahl.js';
import { pruefeObjekt, pruefeMarker, pruefeBereich } from '../editor/kern/platzierung.js';
import { validiere, hatFehler } from '../editor/kern/validierung.js';
import { katalog, KATEGORIEN, objektInfo } from '../editor/kern/katalog.js';
import { alsJsModul, veroeffentlichung } from '../editor/kern/veroeffentlichen.js';
import { innenRaster } from '../editor/kern/innen.js';

/** Kleine Testzone: 10 × 8 Rasen, Haus (Fliesen) mit Tür, Start draußen */
function testZone() {
  const def = {
    id: 'test',
    name: 'Test',
    kacheln: [
      ',,,,,,,,,,',
      ',####,,,,,',
      ',#..#,,,,,',
      ',#.a#,,S,,',
      ',##T#,,,,,',
      ',,,,,,,Z,,',
      ',,,,,,,,,,',
      ',,,,,,,,,,',
    ],
    raeume: { a: { name: 'Hütte', lootTabelle: 'huette' } },
    objekte: [{ typ: 'tisch', x: 2, y: 2, b: 1, h: 1, blockiert: true }],
  };
  return def;
}

test('Editor-Format: stadtrand & waldweg öffnen und verlustfrei zurückschreiben', () => {
  for (const [id, def] of Object.entries(KARTEN)) {
    const { karte, warnungen } = ausDefinition(def);
    assert.deepEqual(warnungen, [], id);
    const zurueck = nachDefinition(karte);
    for (const feld of ['id', 'name', 'kacheln', 'raeume', 'objekte', 'uebergaenge', 'ankuenfte']) assert.deepEqual(zurueck[feld], def[feld], `${id}.${feld}`);
    // auch über den Entwurf (mit internen IDs) bleibt alles gleich
    const entwurf = ladeDatei(JSON.stringify(entwurfJson(karte, new Verlauf())));
    assert.equal(entwurf.art, 'entwurf');
    assert.deepEqual(nachDefinition(entwurf.karte), zurueck);
  }
});

test('Editor-Format: Marker sind getrennt vom Boden (Untergrund wie im Spiel-Lader), Erweiterungen bleiben erhalten', () => {
  const def = { ...testZone(), zombieSpawns: [{ x: 7, y: 5, anzahl: 3, horde: true }], einstellungen: { wetter: { regenAnteil: 0.9 } }, musik: 'wald', bauwerke: [{ typ: 'zaun', tx: 8, ty: 7 }], tierBereiche: [{ x: 5, y: 5, b: 4, h: 3, art: 'hase', anzahl: 2 }] };
  const { karte } = ausDefinition(def);
  assert.equal(karte.kachelAn(7, 3), ',');
  assert.deepEqual(karte.markerAn(7, 3), { art: 'start' });
  assert.deepEqual(karte.markerAn(3, 3), { art: 'loot', raum: 'a' });
  assert.equal(karte.kachelAn(3, 3), '.');
  assert.deepEqual(karte.markerAn(7, 5), { art: 'zombie', anzahl: 3, horde: true });
  const zurueck = nachDefinition(karte);
  assert.deepEqual(zurueck.kacheln, def.kacheln);
  for (const f of ['zombieSpawns', 'einstellungen', 'musik', 'bauwerke', 'tierBereiche']) assert.deepEqual(zurueck[f], def[f], f);
  // Spiel-Lader kommt mit allen Erweiterungen klar (ignoriert, was er nicht kennt)
  assert.ok(verarbeiteKarte(zurueck).spielerStarts.length === 1);
});

test('Editor-Format: Export trägt Format + Version + Erklärung; neuere Versionen werden abgelehnt', () => {
  const { karte } = ausDefinition(testZone());
  const j = exportJson(karte, { jetzt: '2026-01-01' });
  assert.equal(j.format, 'browser-survival-karte');
  assert.equal(j.formatVersion, FORMAT_VERSION);
  assert.ok(j._liesmich.length > 3);
  assert.deepEqual(ladeDatei(JSON.stringify(j)).karte.zellen, karte.zellen);
  assert.throws(() => ladeDatei({ ...j, formatVersion: FORMAT_VERSION + 1 }), /neuer/);
  assert.throws(() => ladeDatei('{kaputt'), /JSON/);
  assert.throws(() => ladeDatei({ format: 'etwas-anderes' }), /Unbekanntes Format/);
  assert.throws(() => ladeDatei({ kacheln: ['abc', 'ab'] }), /Zeile 1/);
});

test('EditorKarte: Operationen, Gegenoperationen, Verlauf (gruppiert, speicherbar)', () => {
  const k = new EditorKarte({ breite: 5, hoehe: 4 });
  const v = new Verlauf();
  v.ausfuehren(k, 'Malen', [{ s: 'kachel', i: 0, neu: '#' }, { s: 'kachel', i: 1, neu: ',' }]); // 2. ist No-op
  assert.equal(v.zurueck[0].ops.length, 1);
  v.ausfuehren(k, 'Objekt', [{ s: 'objekte', k: k.naechsteId, neu: { typ: 'kiste', x: 1, y: 1, b: 1, h: 1 } }]);
  v.ausfuehren(k, 'Wert', [{ s: 'wert', pfad: 'einstellungen.wetter.regenAnteil', neu: 0.5 }]);
  v.beginne('Pinselstrich');
  for (let i = 5; i < 9; i++) v.sammle(k.anwenden([{ s: 'kachel', i, neu: '=' }]));
  v.beende();
  assert.equal(v.zurueck.length, 4);
  assert.equal(k.wert('einstellungen.wetter.regenAnteil'), 0.5);
  // über JSON (wie IndexedDB) und zurück
  const v2 = Verlauf.ausJson(JSON.parse(JSON.stringify(v.alsJson())));
  const k2 = EditorKarte.ausJson(JSON.parse(JSON.stringify(k.alsJson())));
  while (v2.rueckgaengig(k2));
  assert.ok(k2.zellen.every((z) => z === ','));
  assert.equal(k2.s('objekte').size, 0);
  assert.equal(k2.wert('einstellungen.wetter'), undefined);
  while (v2.wiederholen(k2));
  assert.deepEqual(k2.zellen, k.zellen);
  assert.deepEqual([...k2.s('objekte')], [...k.s('objekte')]);
  // umkehren vertauscht alt/neu in umgekehrter Reihenfolge
  assert.deepEqual(umkehren([{ s: 'kachel', i: 1, alt: 'a', neu: 'b' }, { s: 'kachel', i: 1, alt: 'b', neu: 'c' }]).map((o) => o.neu), ['b', 'a']);
});

test('Raster: Linie, Einrasten, Rechteck (+Rand), Pinsel, Füllen, Rechteck-Zerlegung', () => {
  assert.deepEqual(linie(0, 0, 3, 0).map((p) => p.x), [0, 1, 2, 3]);
  assert.equal(linie(0, 0, 4, 2).length, 5);
  assert.deepEqual(rasteEin(0, 0, 10, 2), { x: 10, y: 0 });
  assert.deepEqual(rasteEin(0, 0, 1, 9), { x: 0, y: 9 });
  assert.deepEqual(rasteEin(0, 0, 5, 4), { x: 5, y: 5 });
  assert.equal(rechteck(0, 0, 3, 2).length, 12);
  assert.equal(rechteck(3, 2, 0, 0, true).length, 10);
  assert.equal(pinsel(5, 5, 3).length, 9);
  assert.equal(pinsel(5, 5, 1).length, 1);
  const { karte } = ausDefinition(testZone());
  const innen = fuellen(2, 2, (x, y) => karte.kachelAn(x, y));
  assert.equal(innen.length, 4); // 2×2 Fliesen
  const r = alsRechtecke(innen);
  assert.deepEqual(r, [{ x: 2, y: 2, b: 2, h: 2 }]);
  assert.equal(kachelOps(karte, [{ x: -1, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }], '#').length, 1);
});

test('Zone: neu (nur Rasen), vergrößern (links/oben verschiebt alles), verkleinern meldet Abgeschnittenes, rückgängig', () => {
  const z = neueZone({ id: 'neu', breite: 12, hoehe: 9 });
  assert.equal(z.zellen.length, 108);
  assert.ok(z.zellen.every((c) => c === ','));
  const { karte } = ausDefinition({ ...testZone(), uebergaenge: [{ x: 9, y: 2, b: 1, h: 3, ziel: 'x', ankunft: 'a' }], ankuenfte: { a: { x: 6, y: 6 } } });
  const v = new Verlauf();
  const gross = groesseAendern(karte, { links: 2, oben: 1 });
  assert.equal(gross.abgeschnitten.length, 0);
  v.ausfuehren(karte, 'groß', gross.ops);
  assert.equal(karte.breite, 12);
  assert.deepEqual(karte.markerAn(9, 4), { art: 'start' });
  assert.equal(karte.kachelAn(2, 1), ',');
  assert.equal(karte.kachelAn(3, 2), '#');
  assert.equal([...karte.s('objekte').values()][0].x, 4);
  assert.deepEqual(karte.s('ankuenfte').get('a'), { x: 8, y: 7 });
  v.rueckgaengig(karte);
  assert.equal(karte.breite, 10);
  assert.deepEqual(nachDefinition(karte).kacheln, testZone().kacheln);
  const klein = groesseAendern(karte, { rechts: -4 });
  assert.ok(klein.abgeschnitten.some((a) => a.art === 'marker'), 'Start fällt raus');
  assert.ok(klein.abgeschnitten.some((a) => a.art === 'uebergaenge'));
  assert.ok(klein.abgeschnitten.some((a) => a.art === 'ankunft'));
  assert.throws(() => groesseAendern(karte, { rechts: -8 }), /zu klein/);
});

test('Auswahl: kopieren, einfügen, ausschneiden, drehen – Teile außerhalb werden gemeldet', () => {
  const { karte } = ausDefinition(testZone());
  const vorlage = kopiere(karte, { x: 1, y: 1, b: 4, h: 4 });
  assert.equal(vorlage.b, 4);
  assert.equal(vorlage.objekte.length, 1);
  assert.equal(vorlage.marker.length, 1);
  const { ops, weggelassen } = einfuegeOps(karte, vorlage, 5, 4);
  karte.anwenden(ops);
  assert.equal(weggelassen, 0);
  assert.equal(karte.kachelAn(5, 4), '#');
  assert.deepEqual(karte.markerAn(7, 6), { art: 'loot', raum: 'a' });
  assert.equal(karte.s('objekte').size, 2);
  const zuWeit = einfuegeOps(karte, vorlage, 8, 6);
  assert.ok(zuWeit.weggelassen >= 1);
  karte.anwenden(loescheOps(karte, { x: 1, y: 1, b: 4, h: 4 }));
  assert.equal(karte.kachelAn(1, 1), ',');
  assert.equal(karte.markerAn(3, 3), null);
  const gedreht = dreheVorlage({ b: 2, h: 1, zellen: ['#', '.'], hoehen: null, objekte: [{ typ: 'sofa', x: 0, y: 0, b: 2, h: 1 }], marker: [[1, 0, { art: 'start' }]] });
  assert.deepEqual([gedreht.b, gedreht.h], [1, 2]);
  assert.deepEqual(gedreht.zellen, ['#', '.']);
  assert.deepEqual(gedreht.objekte[0], { typ: 'sofa', x: 0, y: 0, b: 1, h: 2, drehung: 90 });
  assert.deepEqual(gedreht.marker[0].slice(0, 2), [0, 1]);
});

test('Platzierung: grün/rot wie im Spiel (Wand, Tür, Möbel, außerhalb, Zombie innen)', () => {
  const { karte } = ausDefinition(testZone());
  assert.equal(pruefeObjekt(karte, { typ: 'kiste', x: 6, y: 6, b: 1, h: 1, blockiert: true }).ok, true);
  assert.match(pruefeObjekt(karte, { typ: 'kiste', x: 1, y: 1, b: 1, h: 1, blockiert: true }).grund, /wand/);
  assert.match(pruefeObjekt(karte, { typ: 'kiste', x: 3, y: 4, b: 1, h: 1, blockiert: true }).grund, /Tür/);
  assert.match(pruefeObjekt(karte, { typ: 'kiste', x: 2, y: 2, b: 1, h: 1, blockiert: true }).grund, /Überschneidet tisch/);
  assert.match(pruefeObjekt(karte, { typ: 'bett', x: 9, y: 6, b: 2, h: 4, blockiert: true }).grund, /Außerhalb/);
  assert.equal(pruefeObjekt(karte, { typ: 'teppich', x: 1, y: 1, b: 3, h: 3, ebene: 'boden' }).ok, true, 'nicht blockierend darf überall hin');
  assert.match(pruefeMarker(karte, 'zombie', 2, 3).grund, /draußen/);
  assert.equal(pruefeMarker(karte, 'zombie', 8, 6).ok, true);
  assert.match(pruefeMarker(karte, 'start', 1, 1).grund, /wand/);
  assert.equal(pruefeBereich(karte, 'uebergaenge', { x: 9, y: 0, b: 1, h: 3 }).ok, true);
  assert.match(pruefeBereich(karte, 'uebergaenge', { x: 5, y: 5, b: 1, h: 1 }).grund, /rand/i);
});

test('Validierung: Start fehlt, Zombie im Haus, unbekannter Loot-Typ, Übergang ohne Ziel/Rückweg, Ankunft im Übergang, Objekt außerhalb', () => {
  const { karte } = ausDefinition(testZone());
  assert.deepEqual(validiere(karte), []);
  karte.anwenden([
    { s: 'marker', k: markerSchluessel(7, 3), neu: null },
    { s: 'marker', k: markerSchluessel(2, 2), neu: { art: 'zombie' } },
    { s: 'raeume', k: 'a', neu: { name: 'Hütte', lootTabelle: 'gibtsnicht' } },
    { s: 'objekte', k: 99, neu: { typ: 'kiste', x: 12, y: 3, b: 1, h: 1 } },
    { s: 'uebergaenge', k: 100, neu: { x: 9, y: 0, b: 1, h: 3, ziel: 'nachbar', ankunft: 'sued', name: 'N' } },
    { s: 'ankuenfte', k: 'drin', neu: { x: 9, y: 1 } },
  ]);
  const nachbar = new EditorKarte({ id: 'nachbar', breite: 6, hoehe: 6 });
  const liste = validiere(karte, { zonen: new Map([['nachbar', nachbar]]) });
  const codes = liste.map((e) => e.code);
  for (const c of ['start', 'zombie-innen', 'loot-typ', 'objekt-aussen', 'uebergang-ankunft', 'uebergang-rueckweg', 'ankunft-im-uebergang']) assert.ok(codes.includes(c), `${c} fehlt in ${codes}`);
  assert.ok(hatFehler(liste));
  const zombie = liste.find((e) => e.code === 'zombie-innen');
  assert.deepEqual([zombie.x, zombie.y], [2, 2], 'Koordinaten zum Hinspringen');
  // Spielzonen sind gültig (nur Warnungen erlaubt)
  const zonen = new Map(Object.entries(KARTEN).map(([id, d]) => [id, ausDefinition(d).karte]));
  for (const [id, k] of zonen) assert.ok(!hatFehler(validiere(k, { zonen })), id);
});

test('Innen/Außen wie im Spiel (Innenboden; Dach eines kartenfesten Bauwerks zählt mit)', () => {
  const { karte } = ausDefinition(testZone());
  karte.anwenden([{ s: 'bauwerke', k: 50, neu: { typ: 'holzdach', tx: 8, ty: 7 } }]);
  const innen = innenRaster(karte);
  assert.equal(innen[2 * 10 + 2], 1);
  assert.equal(innen[0], 0);
  assert.equal(innen[4 * 10 + 3], 0, 'Tür zählt nicht als innen');
  assert.equal(innen[7 * 10 + 8], 1, 'unter dem Dach');
});

test('Katalog: alle Kategorien belegt, jede Kachel und jeder Kartenobjekt-Typ der Spielzonen ist drin', () => {
  const k = katalog();
  for (const kat of KATEGORIEN.filter((x) => x !== 'Eigene')) assert.ok(k.some((e) => e.kategorie === kat), kat);
  const typen = new Set(Object.values(KARTEN).flatMap((d) => d.objekte.map((o) => o.typ)));
  for (const t of typen) assert.ok(objektInfo(t).bekannt, `Objekttyp ${t} fehlt im Katalog`);
  assert.ok(k.some((e) => e.art === 'bauwerk' && e.typ === 'zaun'));
});

test('Veröffentlichen: erzeugtes Kartenmodul ist gültiges JS und lädt identisch', async () => {
  for (const [id, def] of Object.entries(KARTEN)) {
    const { karte } = ausDefinition(def);
    const quelltext = alsJsModul(nachDefinition(karte));
    const modul = await import(`data:text/javascript,${encodeURIComponent(quelltext)}`);
    const geladen = modul[id.toUpperCase()];
    for (const f of ['kacheln', 'raeume', 'objekte', 'uebergaenge', 'ankuenfte']) assert.deepEqual(geladen[f], def[f], `${id}.${f}`);
  }
  const { karte } = ausDefinition({ ...testZone(), einstellungen: { zombie: { dichte: 2 } }, zombieSpawns: [{ x: 7, y: 5, anzahl: 2 }] });
  const v = veroeffentlichung(karte);
  assert.equal(v.dateiname, 'test.js');
  assert.match(v.importZeile, /import \{ TEST \} from '\.\/test\.js';/);
  const modul = await import(`data:text/javascript,${encodeURIComponent(v.quelltext)}`);
  assert.deepEqual(modul.TEST.einstellungen, { zombie: { dichte: 2 } });
  assert.deepEqual(modul.TEST.zombieSpawns, [{ x: 7, y: 5, anzahl: 2 }]);
});

test('Prefabs: eingebaute Vorlagen sind spielgültig; Räume reisen mit und werden bei Konflikt umbenannt', async () => {
  const { eingebautePrefabs, prefabDatei, ladePrefabDatei } = await import('../editor/kern/prefabs.js');
  const prefabs = eingebautePrefabs();
  assert.ok(prefabs.length >= 5);
  for (const { name, vorlage } of prefabs) {
    const k = neueZone({ id: 'p', breite: 30, hoehe: 20 });
    k.anwenden([{ s: 'marker', k: markerSchluessel(1, 1), neu: { art: 'start' } }]);
    const { ops, weggelassen } = einfuegeOps(k, vorlage, 5, 5);
    k.anwenden(ops);
    assert.equal(weggelassen, 0, name);
    for (const [, o] of k.s('objekte')) assert.ok(pruefeObjekt(k, o, { ignoriere: new Set([...k.s('objekte').keys()].filter((id) => k.s('objekte').get(id) === o)) }).ok, `${name}: ${o.typ} bei ${o.x}|${o.y}`);
    const fehler = validiere(k).filter((e) => e.schwere === 'fehler');
    assert.deepEqual(fehler, [], name);
  }
  // Raum-Konflikt: Zielkarte hat schon "a" mit anderem Inhalt → Prefab-Raum bekommt einen freien Buchstaben
  const { karte } = ausDefinition(testZone());
  const wohnhaus = prefabs.find((p) => p.name === 'Wohnhaus').vorlage;
  const groesser = groesseAendern(karte, { rechts: 15, unten: 6 });
  karte.anwenden(groesser.ops);
  const { ops } = einfuegeOps(karte, wohnhaus, 12, 1);
  karte.anwenden(ops);
  assert.deepEqual(karte.s('raeume').get('a'), { name: 'Hütte', lootTabelle: 'huette' });
  assert.deepEqual(karte.s('raeume').get('b'), { name: 'Wohnhaus', lootTabelle: 'wohnung' });
  assert.ok([...karte.s('marker').values()].filter((m) => m.raum === 'b').length >= 4);
  // nochmal einfügen → Raum "Wohnhaus" wird wiederverwendet, kein dritter Raum
  karte.anwenden(einfuegeOps(karte, wohnhaus, 0, 6).ops);
  assert.equal(karte.s('raeume').size, 2);
  // Prefab-Datei
  const datei = JSON.parse(JSON.stringify(prefabDatei('X', wohnhaus)));
  assert.equal(ladePrefabDatei(datei).vorlage.b, wohnhaus.b);
  assert.throws(() => ladePrefabDatei({ format: 'nein' }), /Keine Prefab/);
});

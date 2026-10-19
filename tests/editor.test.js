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
  assert.deepEqual(validiere(karte).filter((e) => e.code !== 'kein-licht'), [], 'nur der Licht-Hinweis (Testzone ohne Lampe)');
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

test('Zonen verbinden: Nachbarn erkennen, Übergänge auf Wegen vorschlagen (mit Rückweg + Ankunft), Prüfung wie zonen.test', async () => {
  const { nachbarn, vorschlaegeFuerPaar, vorschlagOps, layoutAusUebergaengen, gemeinsameKante } = await import('../editor/kern/zonenVerbund.js');
  // Süd-Zone a: Straße x 8–10 läuft zum Nordrand; Nord-Zone b: Straße x 3–5 zum Südrand
  const a = neueZone({ id: 'a', breite: 20, hoehe: 10 });
  const b = neueZone({ id: 'b', breite: 30, hoehe: 10 });
  for (let y = 0; y < 10; y++) for (const x of [8, 9, 10]) a.anwenden([{ s: 'kachel', i: a.index(x, y), neu: '=' }]);
  for (let y = 0; y < 10; y++) for (const x of [3, 4, 5]) b.anwenden([{ s: 'kachel', i: b.index(x, y), neu: '=' }]);
  a.anwenden([{ s: 'marker', k: markerSchluessel(2, 8), neu: { art: 'start' } }]);
  b.anwenden([{ s: 'marker', k: markerSchluessel(20, 2), neu: { art: 'start' } }]);
  const zonen = new Map([['a', a], ['b', b]]);
  const layout = { a: { x: 0, y: 0 }, b: { x: 5, y: -10 } }; // b liegt genau nördlich, um 5 verschoben → Straßen fluchten
  assert.deepEqual(gemeinsameKante(a, layout.a, b, layout.b), { seite: 'nord', von: 5, bis: 20 });
  const paare = nachbarn(zonen, layout);
  assert.equal(paare.length, 1);
  const v = vorschlaegeFuerPaar(zonen, layout, paare[0]);
  assert.equal(v.length, 1, 'genau die Straße');
  assert.deepEqual(v[0].a.rechteck, { x: 8, y: 0, b: 3, h: 1 });
  assert.deepEqual(v[0].b.rechteck, { x: 3, y: 9, b: 3, h: 1 });
  const { opsA, opsB } = vorschlagOps(zonen, paare[0], v[0]);
  a.anwenden(opsA);
  b.anwenden(opsB);
  for (const k of [a, b]) {
    const fehler = validiere(k, { zonen }).filter((e) => e.schwere === 'fehler' && (e.code.startsWith('uebergang') || e.code.startsWith('ankunft')));
    assert.deepEqual(fehler, [], k.id);
  }
  assert.equal(vorschlaegeFuerPaar(zonen, layout, paare[0]).length, 0, 'keine Doppel');
  // Anordnung aus Übergängen: b wieder genau nördlich, Straßen fluchtend
  assert.deepEqual(layoutAusUebergaengen(zonen, 'a').b, { x: 5, y: -10 });
  const echte = new Map(Object.entries(KARTEN).map(([id, d]) => [id, ausDefinition(d).karte]));
  const l = layoutAusUebergaengen(echte, 'stadtrand');
  assert.equal(l.waldweg.y, -echte.get('waldweg').hoehe, 'Waldweg liegt nördlich vom Stadtrand');
  // Ohne Wege: genau eine Stelle in der Mitte
  const c = neueZone({ id: 'c', breite: 10, hoehe: 10 });
  const d = neueZone({ id: 'd', breite: 10, hoehe: 10 });
  const z2 = new Map([['c', c], ['d', d]]);
  const p2 = nachbarn(z2, { c: { x: 0, y: 0 }, d: { x: 10, y: 0 } });
  const v2 = vorschlaegeFuerPaar(z2, { c: { x: 0, y: 0 }, d: { x: 10, y: 0 } }, p2[0]);
  assert.equal(v2.length, 1);
  assert.equal(v2[0].a.rechteck.x, 9);
  assert.ok(v2[0].laenge <= 5);
});

test('Ausschnitt-Export: Bereich, ASCII mit Achsen, Objekte mit IDs, Prüfsumme nur für den Bereich', async () => {
  const { ausschnitt, ausschnittText, bereichsPruefsumme, rasterMitAchsen } = await import('../editor/kern/ausschnitt.js');
  const { karte } = ausDefinition(testZone());
  const a = ausschnitt(karte, { x: 1, y: 1, b: 4, h: 4 }, { jetzt: 'x' });
  assert.equal(a.format, 'browser-survival-ausschnitt');
  assert.equal(a.formatVersion, 1);
  assert.equal(a.bereich.text, 'x 1–4, y 1–4');
  assert.deepEqual(a.raster, ['  1234', '1 ####', '2 #..#', '3 #.a#', '4 ##T#']);
  assert.equal(a.objekte.length, 1);
  assert.ok(Number.isInteger(a.objekte[0].id));
  assert.deepEqual(a.marker, [{ x: 3, y: 3, art: 'loot', raum: 'a' }]);
  assert.deepEqual(Object.keys(a.raeume), ['a']);
  assert.match(ausschnittText(a), /## So antwortest du/);
  // Achsen bei zweistelligen Koordinaten: Zehner- und Einerzeile
  assert.deepEqual(rasterMitAchsen({ x0: 9, x1: 11, y0: 8, y1: 10 }, () => 'abc'), ['    11', '   901', ' 8 abc', ' 9 abc', '10 abc']);
  const vorher = bereichsPruefsumme(karte, a.bereich);
  karte.anwenden([{ s: 'kachel', i: karte.index(8, 7), neu: '=' }]);
  assert.equal(bereichsPruefsumme(karte, a.bereich), vorher, 'Änderung außerhalb zählt nicht');
  karte.anwenden([{ s: 'kachel', i: karte.index(2, 2), neu: '+' }]);
  assert.notEqual(bereichsPruefsumme(karte, a.bereich), vorher);
});

test('KI-Import: Antwort lesen, prüfen (Bereich, Typen, Platzierung), Diff, erst danach anwenden', async () => {
  const { leseKiAntwort, pruefeAenderungen } = await import('../editor/kern/kiImport.js');
  const { ausschnitt } = await import('../editor/kern/ausschnitt.js');
  const { karte } = ausDefinition(testZone());
  const tischId = [...karte.s('objekte').keys()][0];
  const a = ausschnitt(karte, { x: 0, y: 0, b: 10, h: 6 });
  const antwort = `Klar! Hier:\n\`\`\`json\n${JSON.stringify([
    { aktion: 'bereich', zone: 'test', x0: 0, x1: 9, y0: 0, y1: 5, pruefsumme: a.pruefsumme },
    { aktion: 'setze', typ: 'baum', x: 6, y: 0 },
    { aktion: 'setze', typ: 'palme', x: 6, y: 2 },
    { aktion: 'setze', typ: 'kiste', x: 8, y: 7 },
    { aktion: 'setze', typ: 'kiste', x: 1, y: 2 },
    { aktion: 'entferne', id: tischId },
    { aktion: 'kachel', x: 5, y: 0, b: 3, h: 1, zeichen: 'strasse' },
    { aktion: 'linie', von: [9, 0], bis: [9, 3], zeichen: '#' },
    { aktion: 'raum', buchstabe: 'b', name: 'Schuppen', lootTabelle: 'werkstatt' },
    { aktion: 'marker', art: 'loot', raum: 'b', x: 7, y: 4 },
    { aktion: 'marker', art: 'zombie', x: 2, y: 2 },
    { aktion: 'bauwerk', typ: 'zaun', x: 6, y: 5 },
    { aktion: 'tanzen' },
  ])}\n\`\`\`\nViel Spaß`;
  const gelesen = leseKiAntwort(antwort, karte);
  assert.deepEqual(gelesen.meta.bereich, { x0: 0, x1: 9, y0: 0, y1: 5 });
  const vorher = JSON.stringify(nachDefinition(karte));
  const e = pruefeAenderungen(karte, gelesen);
  assert.equal(JSON.stringify(nachDefinition(karte)), vorher, 'Vorschau ändert die Karte nicht');
  const arten = e.eintraege.map((x) => x.art);
  assert.deepEqual(arten, ['neu', 'ungueltig', 'ungueltig', 'ungueltig', 'weg', 'aendern', 'aendern', 'neu', 'neu', 'ungueltig', 'neu', 'ungueltig']);
  assert.match(e.eintraege[1].text, /unbekannter Objekttyp „palme“/);
  assert.match(e.eintraege[2].text, /außerhalb des Bereichs/);
  assert.match(e.eintraege[3].text, /wand/);
  assert.match(e.eintraege[9].text, /nur draußen/);
  assert.match(e.eintraege[11].text, /unbekannte Aktion/);
  assert.deepEqual(e.warnungen, []);
  karte.anwenden(e.ops);
  assert.equal(karte.s('objekte').size, 1);
  assert.equal([...karte.s('objekte').values()][0].typ, 'baum');
  assert.equal(karte.kachelAn(6, 0), '=');
  assert.equal(karte.kachelAn(9, 2), '#');
  assert.deepEqual(karte.markerAn(7, 4), { art: 'loot', raum: 'b' });
  assert.equal(karte.s('bauwerke').size, 1);
  // Prüfsumme passt nicht mehr → Warnung; falsche Zone → Fehler; kein Bereich → Fehler
  assert.match(pruefeAenderungen(karte, gelesen).warnungen.join(), /geändert/);
  assert.throws(() => pruefeAenderungen(karte, { aktionen: [], meta: { zone: 'andere', bereich: { x0: 0, x1: 1, y0: 0, y1: 1 } } }), /Zone „andere“/);
  assert.throws(() => pruefeAenderungen(karte, { aktionen: [] }), /Kein Bereich/);
  assert.throws(() => leseKiAntwort('das ist kein json'), /kein JSON/);
  // Aktuelle Markierung als Bereich, aendere per id
  const baumId = [...karte.s('objekte').keys()][0];
  const v = pruefeAenderungen(karte, leseKiAntwort([{ aktion: 'aendere', id: baumId, x: 7, drehung: 90 }]), { bereich: { x0: 5, x1: 9, y0: 0, y1: 5 } });
  assert.equal(v.eintraege[0].art, 'aendern');
  assert.match(v.eintraege[0].text, /x 6→7/);
});

test('KI-Import: veränderter Ausschnitt zurück → Aktionen (Raster-Diff, Objekte per id)', async () => {
  const { leseKiAntwort, pruefeAenderungen } = await import('../editor/kern/kiImport.js');
  const { ausschnitt } = await import('../editor/kern/ausschnitt.js');
  const { karte } = ausDefinition(testZone());
  const a = JSON.parse(JSON.stringify(ausschnitt(karte, { x: 0, y: 0, b: 10, h: 8 })));
  a.raster[1 + 6] = a.raster[1 + 6].slice(0, 2) + '======' + a.raster[1 + 6].slice(8); // Zeile y 6: Straße x 0–5
  a.raster[1 + 5] = a.raster[1 + 5].replace('Z', ','); // Zombie weg
  a.objekte = [{ typ: 'stein', x: 8, y: 1, b: 1, h: 1, blockiert: true }]; // Tisch weg, Stein neu
  const gelesen = leseKiAntwort(JSON.stringify(a), karte);
  const e = pruefeAenderungen(karte, gelesen);
  assert.equal(e.zaehler.ungueltig, 0, JSON.stringify(e.eintraege.filter((x) => x.art === 'ungueltig')));
  karte.anwenden(e.ops);
  assert.equal(karte.kachelAn(3, 6), '=');
  assert.equal(karte.markerAn(7, 5), null);
  assert.deepEqual([...karte.s('objekte').values()].map((o) => o.typ), ['stein']);
});

test('Phase 10: Bemalung (Format-Rundreise, Spiel bekommt sie), Terrain-Pinsel + steile Hänge, Bild → 3D (Extrusion)', async () => {
  const { terrainHeben, terrainGlaetten, steileKacheln } = await import('../editor/kern/terrain.js');
  const { extrusion, alphaMaske, verkleinerteGroesse } = await import('../editor/kern/bild3d.js');
  const { karte } = ausDefinition(testZone());
  karte.anwenden([0, 1, 2].map((x) => ({ s: 'bemalung', k: markerSchluessel(5 + x, 6), neu: '#c0392b' })).concat([{ s: 'bemalung', k: markerSchluessel(9, 7), neu: '#2980b9' }]));
  const def = nachDefinition(karte);
  assert.deepEqual(def.bemalung, { '#2980b9': [[9, 7, 1, 1]], '#c0392b': [[5, 6, 3, 1]] });
  assert.equal(ausDefinition(def).karte.farbeAn(6, 6), '#c0392b');
  assert.deepEqual(verarbeiteKarte({ ...def, bemalung: { ...def.bemalung, rot: [[0, 0, 1, 1]], '#000000': [[99, 0, 1, 1]] } }).daten.bemalung, def.bemalung, 'Spiel bekommt nur Gültiges');
  // Kopieren nimmt Bemalung mit, Drehen dreht sie
  const v = kopiere(karte, { x: 5, y: 6, b: 3, h: 1 });
  assert.equal(v.bemalung.length, 3);
  assert.deepEqual(dreheVorlage(v).bemalung.map(([x, y]) => [x, y]), [[0, 0], [0, 1], [0, 2]]);
  // Terrain: heben, glätten, steile Kacheln → Export → unsichtbare Hindernisse im Spiel
  karte.anwenden(terrainHeben(karte, 7, 6, 0.5, 3));
  assert.equal(karte.hoeheAn(7, 6), 3);
  assert.ok(steileKacheln(karte).some(([x, y]) => x === 7 && y === 6));
  const geladen = verarbeiteKarte(nachDefinition(karte));
  assert.ok(geladen.daten.objekte.some((o) => o.typ === 'hang' && o.x === 7 && o.y === 6));
  karte.anwenden(terrainGlaetten(karte, 7, 6, 2, 1));
  assert.ok(karte.hoeheAn(7, 6) < 3);
  // Bild → 3D: 2×2-Bild, 3 deckende Pixel → 3 Quader à 36 Ecken
  const rgba = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 0, 255, 255, 255, 200]);
  assert.equal(alphaMaske({ breite: 2, hoehe: 2, rgba }).length, 3);
  const e = extrusion({ breite: 2, hoehe: 2, rgba }, { breite: 1, tiefe: 0.2 });
  assert.equal(e.pixel, 3);
  assert.equal(e.positionen.length, 3 * 36 * 3);
  const ys = [...e.positionen].filter((_, i) => i % 3 === 1);
  assert.equal(Math.min(...ys), 0, 'Fuß auf dem Boden');
  assert.equal(Math.max(...ys), 1, 'Höhe = Breite × Seitenverhältnis');
  assert.deepEqual(verkleinerteGroesse(128, 64), { breite: 32, hoehe: 16 });
});

test('Phase 10: eigene Objekttypen (Katalog, Platzierung, Validierung, Export), Grafik-Antrag in der Pipeline (Lizenz)', async () => {
  const { eintraegeDerKategorie } = await import('../editor/kern/katalog.js');
  const { karte } = ausDefinition(testZone());
  karte.anwenden([{ s: 'typen', k: 'palme', neu: { name: 'Palme', kategorie: 'Umwelt', b: 2, h: 2, blockiert: true, hoehe3d: 3, farbe: '#2e8b57' } }]);
  const eintrag = eintraegeDerKategorie('Umwelt', karte).find((e) => e.typ === 'palme');
  assert.ok(eintrag?.eigen);
  karte.anwenden([{ s: 'objekte', k: 77, neu: { typ: 'palme', x: 6, y: 6, b: 2, h: 2, blockiert: true } }]);
  const liste = validiere(karte);
  assert.ok(liste.some((e) => e.code === 'eigener-typ'));
  assert.ok(!hatFehler(liste));
  assert.deepEqual(nachDefinition(karte).typen.palme.name, 'Palme');
  // Pipeline: baue_assets.py liest Grafik-Anträge und lehnt falsche Lizenzen ab (nur wenn Python + Pillow da sind)
  const { spawnSync } = await import('node:child_process');
  const probe = spawnSync('python3', ['-c', 'import PIL, numpy'], { encoding: 'utf8' });
  if (probe.status !== 0) return;
  const skript = `
import sys, json, base64, io, tempfile, pathlib
sys.path.insert(0, 'werkzeuge/assets')
import baue_assets as b
from PIL import Image
t = pathlib.Path(tempfile.mkdtemp())
buf = io.BytesIO(); Image.new('RGBA', (4, 4), (255, 0, 0, 255)).save(buf, 'PNG')
d = {'format': 'browser-survival-grafik', 'id': 'palme', 'name': 'Palme', 'art': 'objekt', 'lizenz': 'CC-BY 4.0', 'urheber': 'X', 'quelle': 'https://x', 'bild': 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode()}
(t / 'palme.grafik.json').write_text(json.dumps(d))
print(len(b.lies_editor_grafiken(t)))
d['lizenz'] = 'CC-BY-NC 4.0'; (t / 'palme.grafik.json').write_text(json.dumps(d))
try:
    b.lies_editor_grafiken(t); print('falsch')
except SystemExit as e:
    print('abgelehnt')
`;
  const r = spawnSync('python3', ['-c', skript], { encoding: 'utf8', cwd: new URL('..', import.meta.url).pathname });
  assert.equal(r.stdout.trim(), '1\nabgelehnt', r.stderr);
});

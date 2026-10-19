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

// --- Editor 2.0, Schritt 1.2–1.4: Ebenen, Gruppen, Tastenkürzel --------------------------------
import { EBENEN, ANZEIGEN, ebeneVon, ebenenAus, filtereGesperrt, standardEbenen } from '../editor/kern/ebenen.js';
import { GRUPPEN, KATEGORIEN, gruppeVon, passtZurSuche, katalog } from '../editor/kern/katalog.js';
import { SAMMLUNGEN } from '../editor/kern/karte.js';
import { tastenKuerzel, Befehle } from '../editor/ui/befehle.js';

test('Ebenen: jede Kartenänderung hat eine Ebene, gesperrte Ebenen werden ausgelassen, Speicherstand robust', () => {
  for (const s of ['kachel', 'hoehe', ...SAMMLUNGEN.filter((x) => !['raeume', 'typen', 'texturen'].includes(x))]) assert.ok(ebeneVon(s), `Ebene für ${s}`);
  for (const s of ['raeume', 'typen', 'texturen', 'wert', 'raster']) assert.equal(ebeneVon(s), null, `${s} ist immer änderbar`);
  const e = standardEbenen();
  e.objekte.gesperrt = true;
  e.marker.sichtbar = false;
  const { ops, ausgelassen } = filtereGesperrt(e, [{ s: 'objekte', k: 1, neu: null }, { s: 'kachel', i: 0, neu: '#' }, { s: 'ankuenfte', k: 'nord', neu: null }, { s: 'wert', pfad: 'name', neu: 'x' }]);
  assert.deepEqual(ops.map((o) => o.s), ['kachel', 'wert']);
  assert.deepEqual(ausgelassen, { objekte: 1, marker: 1 });
  // Gespeichertes mit Müll → Standard
  const g = ebenenAus({ objekte: { sichtbar: false, gesperrt: 'ja' }, raster: { sichtbar: false, gesperrt: true }, quatsch: {} });
  assert.equal(g.objekte.sichtbar, false);
  assert.equal(g.objekte.gesperrt, false);
  assert.equal(g.raster.sichtbar, false);
  assert.equal('gesperrt' in g.raster, false, 'Anzeigen sind nicht sperrbar');
  assert.equal(Object.keys(g).length, EBENEN.length + ANZEIGEN.length);
});

test('Asset-Gruppen: jede Kategorie in genau einer Gruppe, Suche ohne Umlaute', () => {
  for (const k of KATEGORIEN) assert.equal(GRUPPEN.filter((g) => g.kategorien.includes(k)).length, 1, k);
  assert.equal(gruppeVon('Unbekannt').name, 'Eigene');
  const tisch = katalog().find((e) => e.id === 'objekt:tisch');
  assert.ok(passtZurSuche(tisch, 'TISCH'));
  assert.ok(passtZurSuche(tisch, 'einrichtung tisch'), 'Gruppenname zählt');
  const kueche = katalog().find((e) => e.typ === 'kueche_herd');
  assert.ok(passtZurSuche(kueche, 'herd'));
  assert.ok(passtZurSuche(katalog().find((e) => e.name.startsWith('Böden') || e.kategorie === 'Böden'), 'boeden'), 'ö = oe');
  assert.ok(!passtZurSuche(tisch, 'auto'));
});

test('Tastenkürzel: Schreibweise, Umschalt nur bei Buchstaben, AltGr-Zeichen, Befehlsregister', () => {
  const t = (key, extra = {}) => tastenKuerzel({ key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, code: '', ...extra });
  assert.equal(t('z', { ctrlKey: true }), 'Strg+Z');
  assert.equal(t('Z', { ctrlKey: true, shiftKey: true }), 'Strg+Umschalt+Z');
  assert.equal(t('z', { metaKey: true }), 'Strg+Z', '⌘ = Strg');
  assert.equal(t('?', { shiftKey: true }), '?', 'Umschalt steckt im Zeichen');
  assert.equal(t('ArrowLeft', { shiftKey: true }), 'Umschalt+Links');
  assert.equal(t('Delete'), 'Entf');
  assert.equal(t('['), '[');
  assert.equal(t('[', { ctrlKey: true, altKey: true, getModifierState: (m) => m === 'AltGraph' }), '[', 'AltGr+8 auf deutscher Tastatur');
  assert.equal(t('Shift', { shiftKey: true }), null);
  const befehle = new Befehle();
  let n = 0;
  let gesperrt = false;
  befehle.registriere({ id: 'x.a', name: 'A', kuerzel: ['Strg+S'], inEingabe: true, ausfuehren: () => n++ }, { id: 'x.b', name: 'B', kuerzel: ['V'], verfuegbar: () => !gesperrt, ausfuehren: () => (n += 10) });
  const ev = (key, extra = {}) => ({ key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, preventDefault() {}, ...extra });
  assert.ok(befehle.behandleTaste(ev('s', { ctrlKey: true }), { inEingabe: true }));
  assert.ok(!befehle.behandleTaste(ev('v'), { inEingabe: true }), 'Werkzeug-Tasten nicht beim Tippen');
  assert.ok(befehle.behandleTaste(ev('v')));
  gesperrt = true;
  befehle.behandleTaste(ev('v'));
  assert.equal(n, 11);
});

// --- Editor 2.0, Schritt 1.6: Komplett-Backup ------------------------------------------------
import { baueBackup, leseBackup, backupDateiname, groesseText, BACKUP_FORMAT } from '../editor/kern/backup.js';
import { entwurfJson } from '../editor/kern/format.js';
import { Verlauf } from '../editor/kern/verlauf.js';
import { neueZone } from '../editor/kern/zone.js';

test('Backup: Rundreise aller Entwürfe (mit Verlauf), Prefabs, Anordnung – Gemini-Schlüssel kommt nie hinein', () => {
  const a = neueZone({ id: 'alpha', name: 'Alpha', breite: 10, hoehe: 8 });
  const va = new Verlauf();
  va.ausfuehren(a, 'Tisch', [{ s: 'objekte', k: 1, neu: { typ: 'tisch', x: 1, y: 1, b: 2, h: 1 } }]);
  const b = neueZone({ id: 'beta', name: 'Beta', breite: 6, hoehe: 6 });
  const prefab = { b: 1, h: 1, zellen: ['#'], objekte: [] };
  const daten = baueBackup({
    entwuerfe: [{ id: 'alpha', entwurf: entwurfJson(a, va) }, { id: 'beta', entwurf: entwurfJson(b, new Verlauf()) }],
    prefabs: { Mauer: prefab },
    meta: { layout: { alpha: { x: 0, y: 0 }, beta: { x: 10, y: 0 } }, aktiv: 'beta' },
    einstellungen: { 'browserSurvival.editorEbenen': { raster: { sichtbar: false } }, 'browserSurvival.editorGemini': { schluessel: 'GEHEIM' } },
  });
  const text = JSON.stringify(daten);
  assert.equal(daten.format, BACKUP_FORMAT);
  assert.ok(!text.includes('GEHEIM') && !text.includes('editorGemini'), 'kein API-Schlüssel im Backup');
  const g = leseBackup(text);
  assert.deepEqual(g.entwuerfe.map((e) => e.id), ['alpha', 'beta']);
  assert.equal(g.entwuerfe[0].karte.s('objekte').get(1).typ, 'tisch');
  assert.equal(g.entwuerfe[0].verlauf.zurueck.length, 1, 'Verlauf kommt mit');
  assert.deepEqual(g.prefabs.Mauer, prefab);
  assert.equal(g.meta.aktiv, 'beta');
  assert.deepEqual(Object.keys(g.einstellungen), ['browserSurvival.editorEbenen']);
});

test('Backup: kaputte Einträge werden gemeldet statt alles abzulehnen; fremde Dateien/zu neue Versionen abgelehnt', () => {
  const ok = entwurfJson(neueZone({ id: 'gut', name: 'Gut', breite: 5, hoehe: 5 }), new Verlauf());
  const g = leseBackup({ format: BACKUP_FORMAT, formatVersion: 1, entwuerfe: [{ id: 'gut', entwurf: ok }, { id: 'kaputt', entwurf: { format: 'browser-survival-entwurf', karte: { breite: 3, hoehe: 3, zellen: 'zu kurz' } } }], prefabs: { schlecht: { b: 0 } } });
  assert.deepEqual(g.entwuerfe.map((e) => e.id), ['gut']);
  assert.equal(g.fehlerhaft[0].id, 'kaputt');
  assert.deepEqual(g.prefabs, {});
  assert.throws(() => leseBackup('{"format":"browser-survival-entwurf"}'), /kein Editor-Backup/);
  assert.throws(() => leseBackup({ format: BACKUP_FORMAT, formatVersion: 99 }), /neuer/);
  assert.throws(() => leseBackup('kein json'), /JSON/);
  assert.match(backupDateiname(new Date(2026, 9, 19, 14, 5)), /^editor-backup-2026-10-19-1405\.json$/);
  assert.equal(groesseText(1536), '1,5 KB');
});

// --- Editor 2.0, Schritt 2.1: Licht ------------------------------------------------------------
import { validiere } from '../editor/kern/validierung.js';
import { verarbeiteKarte } from '../server/spiel/karten/kartenLader.js';
import { nachDefinition } from '../editor/kern/format.js';

test('Licht: Warnung ohne Lichtquelle, Kegel-Lampe dreht mit R und kommt mit Richtung/Öffnung im Spiel an', () => {
  const k = neueZone({ id: 'dunkel', name: 'Dunkel', breite: 12, hoehe: 10 });
  k.anwenden([{ s: 'marker', k: '2,2', neu: { art: 'start' } }]);
  assert.ok(validiere(k).some((e) => e.code === 'kein-licht' && e.schwere === 'warnung'));
  const kegel = { typ: 'licht', x: 5, y: 5, b: 1, h: 1, ebene: 'licht', radius: 6, farbe: '#fff2d0', staerke: 0.9, art: 'kegel', richtung: 90, oeffnung: 60 };
  k.anwenden([{ s: 'objekte', k: 1, neu: kegel }]);
  assert.ok(!validiere(k).some((e) => e.code === 'kein-licht'));
  assert.equal(dreheObjekt(k, kegel).richtung, 180, 'R dreht die Leuchtrichtung');
  const daten = verarbeiteKarte(nachDefinition(k));
  const licht = daten.daten.objekte.find((o) => o.typ === 'licht');
  assert.deepEqual([licht.art, licht.richtung, licht.oeffnung], ['kegel', 90, 60]);
  // ungültige Werte werden eingefangen, Punkt-Lampen bleiben ohne Kegel-Felder
  k.anwenden([{ s: 'objekte', k: 1, neu: { ...kegel, richtung: -90, oeffnung: 500 } }, { s: 'objekte', k: 2, neu: { typ: 'licht', x: 1, y: 1, b: 1, h: 1, ebene: 'licht' } }]);
  const d2 = verarbeiteKarte(nachDefinition(k)).daten.objekte.filter((o) => o.typ === 'licht');
  assert.deepEqual([d2[0].richtung, d2[0].oeffnung], [270, 170]);
  assert.equal(d2[1].art, undefined);
});

// --- Editor 2.0, Schritt 2.2: Wände ziehen -----------------------------------------------------
import { istWandEintrag, wandPunkte, begrenzeTueren, wandBauwerkOps, TUER_MAX } from '../editor/kern/wand.js';

test('Wände ziehen: Einrasten, Raum-Umriss, Türen höchstens 4, Bauwerke mit Ausrichtung und Prüfung je Kachel', () => {
  const kat = (id) => katalog().find((e) => e.id === id);
  assert.ok(istWandEintrag(kat('kachel:#')) && istWandEintrag(kat('kachel:T')) && istWandEintrag(kat('bauwerk:zaun')) && istWandEintrag(kat('bauwerk:holzwand_fenster')));
  assert.ok(!istWandEintrag(kat('kachel:,')) && !istWandEintrag(kat('bauwerk:werkbank')) && !istWandEintrag(kat('objekt:tisch')));
  const k = neueZone({ id: 'wand', name: 'Wand', breite: 20, hoehe: 15 });
  // fast waagerecht → rastet waagerecht ein; Umschalt = frei
  const w = wandPunkte(k, { x: 2, y: 2 }, { x: 9, y: 3 });
  assert.ok(w.every((p) => p.y === 2) && w.length === 8);
  assert.ok(wandPunkte(k, { x: 2, y: 2 }, { x: 9, y: 3 }, { frei: true }).some((p) => p.y === 3));
  // Raum-Umriss 5 × 4 = 14 Randkacheln, über den Rand hinaus wird abgeschnitten
  assert.equal(wandPunkte(k, { x: 1, y: 1 }, { x: 5, y: 4 }, { raum: true }).length, 14);
  assert.ok(wandPunkte(k, { x: 15, y: 5 }, { x: 30, y: 5 }).every((p) => p.x < 20));
  // Türen
  const tuer = begrenzeTueren(wandPunkte(k, { x: 0, y: 7 }, { x: 9, y: 7 }));
  assert.equal(tuer.punkte.length, TUER_MAX);
  assert.equal(tuer.gekuerzt, 6);
  // Bauwerke: Fenster in senkrechter Wand → Nord-Süd; belegte Kachel wird übersprungen
  k.anwenden([{ s: 'bauwerke', k: 1, neu: { typ: 'holzwand', tx: 4, ty: 6 } }]);
  const senkrecht = wandPunkte(k, { x: 4, y: 3 }, { x: 4, y: 8 });
  const { ops, ungueltig } = wandBauwerkOps(k, 'holzwand_fenster', senkrecht);
  assert.equal(ops.length, 5);
  assert.deepEqual(ungueltig.map((u) => [u.x, u.y]), [[4, 6]]);
  assert.ok(ops.every((o) => o.neu.drehung === 1), 'Ausrichtung folgt der Wand (Nord-Süd)');
  const zaun = wandBauwerkOps(k, 'zaun', wandPunkte(k, { x: 8, y: 1 }, { x: 12, y: 1 }));
  assert.ok(zaun.ops.every((o) => o.neu.drehung === undefined), 'Zaun hat keine Ausrichtung');
  assert.equal(new Set(zaun.ops.map((o) => o.k)).size, 5, 'eigene IDs');
});

// --- Editor 2.0, Schritt 2.3/2.4: Gelände begehbar --------------------------------------------
import { Welt } from '../gemeinsam/welt/welt.js';
import { findePfad } from '../gemeinsam/physik/pfadfindung.js';
import { klippenFuesse, hoeheAn } from '../gemeinsam/welt/gelaende.js';
import { rampe, bereichHoehe, steigung } from '../editor/kern/terrain.js';

test('Gelände: Plateau oben begehbar, Klippe sperrt, Rampe verbindet – Pfadsuche wie im Spiel', () => {
  const k = neueZone({ id: 'huegel', name: 'Hügel', breite: 14, hoehe: 9 });
  k.anwenden([{ s: 'marker', k: '1,4', neu: { art: 'start' } }]);
  k.anwenden(bereichHoehe(k, { x: 7, y: 0, b: 7, h: 9 }, 3)); // Plateau rechts, 3 m
  const pfad = (karte) => {
    const welt = new Welt(verarbeiteKarte(nachDefinition(karte)).daten);
    const g = welt.kachelGroesse;
    return { welt, weg: findePfad(welt, 1.5 * g, 4.5 * g, 10.5 * g, 4.5 * g) };
  };
  const ohne = pfad(k);
  assert.equal(ohne.weg, null, 'Klippe ohne Rampe: kein Weg nach oben');
  assert.ok(ohne.welt.istBlockiert(6, 4) && !ohne.welt.istBlockiert(7, 4), 'Fuß gesperrt, Plateau-Rand begehbar');
  assert.equal(ohne.welt.hoeheBei(10.5 * 32, 4.5 * 32), 3 * 32, 'Höhe in Weltpixeln (1 m = 1 Kachel)');
  // Rampe 3 Kacheln breit von x 2 (0 m) nach x 7 (3 m): je Kachel ≤ 1 m
  k.anwenden(rampe(k, { x: 2, y: 4 }, { x: 7, y: 4 }, { breite: 3, von: 0, bis: 3 }));
  for (let x = 2; x <= 7; x++) assert.ok(Math.abs(k.hoeheAn(x + 1, 4) - k.hoeheAn(x, 4)) <= 1, `Steigung bei x ${x}`);
  const mit = pfad(k);
  assert.ok(mit.weg, 'über die Rampe erreichbar');
  assert.ok(mit.weg.some((p) => Math.floor(p.y / 32) === 4 && Math.floor(p.x / 32) === 5), 'Weg führt über die Rampe');
  // Stufen: Vielfache von 0,5 m
  const z2 = neueZone({ id: 'treppe', name: 'Treppe', breite: 8, hoehe: 3 });
  z2.anwenden(rampe(z2, { x: 0, y: 1 }, { x: 7, y: 1 }, { breite: 1, von: 0, bis: 2, stufe: 0.5 }));
  assert.ok([...Array(8).keys()].every((x) => (z2.hoeheAn(x, 1) * 2) % 1 === 0));
  assert.ok(steigung(z2, 3, 1) <= 1);
  // gemeinsame Helfer
  assert.deepEqual(klippenFuesse([0, 2, 0, 0], 2, 2), [[0, 0], [1, 1]]);
  assert.equal(hoeheAn([0, 2, 0, 2], 2, 2, 1, 1), 1, 'bilinear zwischen den Kachelmitten');
});

// --- Editor 2.0, Schritt 2.5: Ego-Zielen auf Gelände ----------------------------------------
import { SpielWelt } from '../server/spiel/spielWelt.js';
import { erstelleKonfiguration } from '../server/spiel/konfiguration/spielKonfiguration.js';
import { erzeugeZombie } from '../server/spiel/entitaeten/zombie.js';
import { TICK_DAUER_S } from '../gemeinsam/konstanten.js';

test('Ego-Zielen: Draufsicht trifft 2D, in der Ich-Perspektive muss man zum Ziel auf der Klippe hoch zielen', () => {
  const k = neueZone({ id: 'klippe', name: 'Klippe', breite: 16, hoehe: 5 });
  k.anwenden([{ s: 'marker', k: '1,2', neu: { art: 'start' } }]);
  k.anwenden(bereichHoehe(k, { x: 9, y: 0, b: 7, h: 5 }, 3)); // Plateau 3 m = 96 px
  const definition = nachDefinition(k);
  const schuss = (neigung) => {
    const konfiguration = erstelleKonfiguration({ server: { zufallsStartwert: 7 }, spieler: { startInventar: [] }, zombie: { aggroRadius: 0 } });
    const welt = new SpielWelt(konfiguration, { kartenDefinition: definition });
    const spieler = welt.spielerBetrittWelt('Ego');
    Object.assign(spieler, { x: 2.5 * 32, y: 2.5 * 32, blick: 0, angriff: true, ausgeruestet: 0, ausruestung: 'pistole', neigung });
    spieler.inventar[0] = { defId: 'pistole', menge: 1, magazin: 15 };
    const zombie = welt.hinzufuegen(erzeugeZombie({ id: welt.neueId(), x: 12.5 * 32, y: 2.5 * 32, konfiguration, blick: 0 }));
    welt.aktualisiere(TICK_DAUER_S);
    return zombie.leben < 60;
  };
  assert.ok(schuss(null), 'Draufsicht (keine Neigung): trifft wie bisher in 2D');
  assert.ok(!schuss(0), 'Ego, waagerecht: geht unter der Klippe durch');
  const d = 10 * 32; // Entfernung bis zum Ziel
  assert.ok(schuss(Math.atan2(96 + 30 - 54, d)), 'Ego, nach oben gezielt: Treffer');
});

/**
 * Editor 2.0, Schritt 6.1: Zonen-Manager (Kern) – Bereichs-Zonen auflisten, Anzeige (aus/Sperre/Farbe/Name) als
 * Undo-fähige Ops, Umbenennen, Löschen, Ablage (Zwischenspeichern + Einsetzen, auch in andere Karten), Sperre filtert Ops.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EditorKarte } from '../editor/kern/karte.js';
import { Verlauf } from '../editor/kern/verlauf.js';
import { nachDefinition } from '../editor/kern/format.js';
import { neuerKlang } from '../gemeinsam/audio/klanglandschaft.js';
import * as Z from '../editor/kern/zonenManager.js';

function karte() {
  const k = new EditorKarte({ id: 'zm', breite: 30, hoehe: 20 });
  k.anwenden([
    { s: 'raeume', k: 'a', neu: { name: 'Küche', lootTabelle: 'wohnhaus' } },
    { s: 'raumFlaechen', k: 1, neu: { raum: 'a', x: 2, y: 2, b: 4, h: 3 } },
    { s: 'raumFlaechen', k: 2, neu: { raum: 'a', x: 6, y: 2, b: 2, h: 2 } },
    { s: 'tierBereiche', k: 3, neu: { x: 10, y: 10, b: 5, h: 5, art: 'hase', anzahl: 2 } },
    { s: 'uebergaenge', k: 4, neu: { x: 0, y: 8, b: 1, h: 3, ziel: 'waldweg', ankunft: 'ost', name: 'Westausgang' } },
    { s: 'klaenge', k: 5, neu: neuerKlang('punkt', { name: 'Huhn', audio: 'a_00000000_1', x: 20, y: 5 }) },
    { s: 'klaenge', k: 6, neu: neuerKlang('global', { name: 'Musik', audio: 'a_00000000_1' }) },
  ]);
  return k;
}

test('bereichsZonen: Räume gruppiert, alle Arten mit Name, Rechteck und Info', () => {
  const z = Z.bereichsZonen(karte());
  assert.deepEqual(z.map((x) => x.schl), ['raum|a', 'tierBereiche|3', 'klaenge|5', 'klaenge|6', 'uebergaenge|4']);
  const raum = z[0];
  assert.deepEqual(raum.keys, [1, 2]);
  assert.equal(raum.name, 'a: Küche');
  assert.deepEqual(raum.rechteck, { x: 2, y: 2, b: 6, h: 3 });
  assert.equal(z.find((x) => x.schl === 'klaenge|6').rechteck, null, 'global hat keinen Ort');
  assert.equal(z.find((x) => x.schl === 'uebergaenge|4').name, 'Westausgang');
});

test('Anzeige (aus/Sperre/Farbe) ist eine Undo-fähige Op, gehört nicht ins Spiel-Format', () => {
  const k = karte();
  const v = new Verlauf();
  v.ausfuehren(k, 'aus', Z.anzeigeOps(k, 'tierBereiche|3', { aus: true, farbe: '#ff0000' }));
  assert.deepEqual(Z.eintragAnzeige(k, 'tierBereiche', 3), { aus: true, sperre: false, farbe: '#ff0000', name: null });
  assert.equal(Z.eintragAnzeige(k, 'raumFlaechen', 2).aus, false);
  v.ausfuehren(k, 'sperre', Z.anzeigeOps(k, 'raum|a', { sperre: true }));
  assert.ok(Z.eintragAnzeige(k, 'raumFlaechen', 2).sperre, 'Raumfläche erbt die Sperre ihres Raums');
  assert.equal(nachDefinition(k).zonenAnzeige, undefined);
  v.rueckgaengig(k);
  v.rueckgaengig(k);
  assert.equal(k.werte.zonenAnzeige, undefined, 'Undo räumt vollständig auf');
});

test('Sperre lässt Änderungen an der Zone aus, andere Ops bleiben', () => {
  const k = karte();
  k.anwenden(Z.anzeigeOps(k, 'raum|a', { sperre: true }));
  const { ops, ausgelassen } = Z.filtereGesperrteZonen(k, [
    { s: 'raumFlaechen', k: 1, neu: null },
    { s: 'tierBereiche', k: 3, neu: null },
    { s: 'objekte', k: 99, neu: { typ: 'tisch', x: 1, y: 1, b: 1, h: 1 } },
  ]);
  assert.equal(ausgelassen, 1);
  assert.deepEqual(ops.map((o) => o.s), ['tierBereiche', 'objekte']);
});

test('Umbenennen und Löschen je Art', () => {
  const k = karte();
  const zonen = Z.bereichsZonen(k);
  const zone = (schl) => zonen.find((x) => x.schl === schl);
  k.anwenden(Z.umbenennenOps(k, zone('raum|a'), 'Wohnküche'));
  assert.equal(k.s('raeume').get('a').name, 'Wohnküche');
  k.anwenden(Z.umbenennenOps(k, zone('tierBereiche|3'), 'Hasenwiese'));
  assert.equal(Z.anzeige(k, 'tierBereiche|3').name, 'Hasenwiese');
  assert.equal(k.s('tierBereiche').get(3).name, undefined, 'Spielfeld bleibt sauber');
  k.anwenden(Z.umbenennenOps(k, zone('klaenge|5'), 'Gackern'));
  assert.equal(k.s('klaenge').get(5).name, 'Gackern');
  k.anwenden(Z.zoneLoeschOps(k, Z.bereichsZonen(k).find((x) => x.schl === 'raum|a')));
  assert.equal(k.s('raumFlaechen').size, 0);
  assert.ok(k.s('raeume').has('a'), 'Raum-Definition bleibt');
  k.anwenden(Z.zoneLoeschOps(k, Z.bereichsZonen(k).find((x) => x.schl === 'tierBereiche|3')));
  assert.equal(k.werte.zonenAnzeige, undefined, 'Anzeige der gelöschten Zone ist weg');
});

test('Ablage: Raum und Klang zwischenspeichern und in eine andere Karte einsetzen', () => {
  const k = karte();
  const zonen = Z.bereichsZonen(k);
  const raum = JSON.parse(JSON.stringify(Z.ablageEintrag(k, zonen.find((x) => x.schl === 'raum|a'))));
  const klang = JSON.parse(JSON.stringify(Z.ablageEintrag(k, zonen.find((x) => x.schl === 'klaenge|5'))));
  const ziel = new EditorKarte({ id: 'neu', breite: 12, hoehe: 12 });
  ziel.anwenden([{ s: 'raeume', k: 'a', neu: { name: 'Lager', lootTabelle: 'lager' } }]);
  const r = Z.einsetzOps(ziel, raum, 1, 1);
  ziel.anwenden(r.ops);
  assert.equal(ziel.s('raeume').get('b').name, 'Küche', 'belegter Buchstabe → neuer');
  assert.deepEqual([...ziel.s('raumFlaechen').values()].map((f) => [f.raum, f.x, f.y]), [['b', 1, 1], ['b', 5, 1]]);
  // gleicher Raum vorhanden → wiederverwenden, kein neuer Buchstabe
  const r2 = Z.einsetzOps(ziel, raum, 1, 6);
  assert.ok(!r2.ops.some((o) => o.s === 'raeume'));
  // Klang: Punkt landet in der kleineren Zone (in die Zone geschoben)
  const c = Z.einsetzOps(ziel, klang);
  ziel.anwenden(c.ops);
  const gesetzt = ziel.s('klaenge').get(c.auswahl[0].k);
  assert.ok(gesetzt.x <= 12 && gesetzt.y <= 12 && gesetzt.name === 'Huhn');
  assert.match(Z.einsetzOps(ziel, { format: 'x' }).grund, /Kein Zonen-Eintrag/);
});

test('Komplett-Backup nimmt das Zonen-Archiv mit, kaputte Archiv-Einträge fallen weg', async () => {
  const { baueBackup, leseBackup } = await import('../editor/kern/backup.js');
  const { entwurfJson } = await import('../editor/kern/format.js');
  const k = karte();
  const archiv = { zm: { name: 'ZM', archiviert: '2026-10-20T10:00:00Z', layout: { x: 3, y: 4 }, entwurf: entwurfJson(k, new Verlauf()) }, kaputt: { name: 'x', entwurf: { format: 'nix' } } };
  const b = leseBackup(JSON.stringify(baueBackup({ archiv })));
  assert.deepEqual(Object.keys(b.archiv), ['zm']);
  assert.deepEqual(b.archiv.zm.layout, { x: 3, y: 4 });
  assert.equal(leseBackup(JSON.stringify(baueBackup({}))).archiv && Object.keys(leseBackup(JSON.stringify(baueBackup({}))).archiv).length, 0);
});

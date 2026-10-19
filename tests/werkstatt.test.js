/**
 * Map-Editor 2.0, Schritt 5.1 (Kern, umgebungsfrei): Modell-Werkstatt – Undo-Verlauf, Versionsnamen, Metadaten der neuen
 * Version (Original bleibt), Boden-/Drehpunkt-Versatz, Typen auf die neue Version umstellen.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { neueZone } from '../editor/kern/zone.js';
import { metaNormal } from '../editor/kern/bibliothek.js';
import { WerkstattVerlauf, versionsName, grundName, neueVersionMeta, bodenVersatz, drehpunktVersatz, versionOps } from '../editor/kern/werkstatt.js';

test('Werkstatt-Verlauf: merken, rückgängig, wiederholen, neue Änderung verwirft Wiederholen, Grenze', () => {
  const v = new WerkstattVerlauf(3);
  assert.equal(v.geaendert, false);
  let stand = { x: 0 };
  for (const x of [1, 2, 3]) {
    v.merke(stand);
    stand = { x };
  }
  assert.equal(v.geaendert, true);
  stand = v.rueckgaengig(stand);
  assert.deepEqual(stand, { x: 2 });
  stand = v.rueckgaengig(stand);
  assert.deepEqual(stand, { x: 1 });
  stand = v.wiederholen(stand);
  assert.deepEqual(stand, { x: 2 });
  v.merke(stand);
  stand = { x: 9 };
  assert.equal(v.kannVor, false);
  assert.equal(v.wiederholen(stand), null);
  // Grenze 3: ältester Schritt fällt raus
  for (let i = 0; i < 5; i++) v.merke({ x: 100 + i });
  assert.equal(v.zurueck.length, 3);
  // Schnappschüsse sind Kopien
  const s = { teile: [{ p: [1, 2, 3] }] };
  v.merke(s);
  s.teile[0].p[0] = 99;
  assert.equal(v.rueckgaengig({}).teile[0].p[0], 1);
});

test('Versionsnamen: nächste freie Nummer, Grundname ohne vN, Sonderzeichen im Namen', () => {
  assert.deepEqual(versionsName('Kiste', ['Kiste']), { name: 'Kiste v2', version: 2 });
  assert.deepEqual(versionsName('Kiste v2', ['Kiste', 'Kiste v2', 'Kiste v5', 'Kisten v9']), { name: 'Kiste v6', version: 6 });
  assert.deepEqual(versionsName('Tür (alt)', ['Tür (alt)']), { name: 'Tür (alt) v2', version: 2 });
  assert.equal(grundName('Baum v12'), 'Baum');
  assert.equal(grundName(''), 'Modell');
});

test('Neue Version: Lizenz/Ordner wandern mit, basis zeigt aufs Original, metaNormal behält basis/version', () => {
  const alt = metaNormal({ name: 'Kiste', ordner: 'Möbel', tags: ['holz'], lizenz: 'CC0', urheber: 'Kenney', quelle: 'https://kenney.nl', masse: { b: 1, h: 1, hoehe: 1 } }, 'm_aaaaaaaa_1');
  const neu = neueVersionMeta(alt, { groesse: { x: 2, y: 0.5, z: 1.04 }, dreiecke: 12 }, ['Kiste']);
  assert.equal(neu.name, 'Kiste v2');
  assert.equal(neu.basis, 'm_aaaaaaaa_1');
  assert.deepEqual(neu.masse, { b: 2, h: 1, hoehe: 0.5 });
  assert.equal(neu.lizenz, 'CC0');
  assert.equal(neu.urheber, 'Kenney');
  assert.deepEqual(neu.tags, ['holz']);
  const m = metaNormal(neu, 'm_bbbbbbbb_2');
  assert.equal(m.basis, 'm_aaaaaaaa_1');
  assert.equal(m.version, 2);
  // Version einer Version zeigt weiter aufs erste Original
  const v3 = neueVersionMeta(m, {}, ['Kiste', 'Kiste v2']);
  assert.equal(v3.basis, 'm_aaaaaaaa_1');
  assert.equal(v3.name, 'Kiste v3');
  assert.deepEqual(v3.masse, m.masse);
  // Originale haben kein basis/version; kaputte Werte fallen raus
  assert.equal('basis' in alt, false);
  assert.equal('basis' in metaNormal({ basis: '../x' }, 'm_1'), false);
  assert.equal('basis' in metaNormal({ basis: 'm_1' }, 'm_1'), false);
});

test('Boden- und Drehpunkt-Versatz aus der Hülle', () => {
  const box = { min: { x: 1, y: -0.5, z: -3 }, max: { x: 3, y: 2, z: -1 } };
  assert.deepEqual(bodenVersatz(box), { x: 0, y: 0.5, z: 0 });
  assert.deepEqual(drehpunktVersatz(box), { x: -2, y: 0.5, z: 2 });
  assert.deepEqual(drehpunktVersatz({ min: { x: -1, y: 0, z: -1 }, max: { x: 1, y: 1, z: 1 } }), { x: 0, y: 0, z: 0 });
});

test('Typen auf neue Version umstellen: Objekte bleiben, Größe optional', () => {
  const k = neueZone({ id: 'werkstatt', breite: 10, hoehe: 10 });
  k.anwenden([
    { s: 'typen', k: 'm_kiste', neu: { name: 'Kiste', kategorie: 'Eigene', b: 1, h: 1, hoehe3d: 1, blockiert: true, farbe: '#c080ff', asset: 'm_aaaaaaaa_1' } },
    { s: 'typen', k: 'm_anders', neu: { name: 'Anders', kategorie: 'Eigene', b: 1, h: 1, hoehe3d: 1, blockiert: true, farbe: '#c080ff', asset: 'm_cccccccc_3' } },
    { s: 'objekte', k: 1, neu: { typ: 'm_kiste', x: 2, y: 2, b: 1, h: 1 } },
  ]);
  const neu = { id: 'm_bbbbbbbb_2', masse: { b: 2, h: 1, hoehe: 0.5 }, lizenz: 'CC0' };
  const ohne = versionOps(k, 'm_aaaaaaaa_1', neu);
  assert.equal(ohne.length, 1);
  assert.equal(ohne[0].neu.asset, 'm_bbbbbbbb_2');
  assert.equal(ohne[0].neu.b, 1);
  const mit = versionOps(k, 'm_aaaaaaaa_1', neu, { mitGroesse: true });
  assert.deepEqual([mit[0].neu.b, mit[0].neu.h, mit[0].neu.hoehe3d], [2, 1, 0.5]);
  k.anwenden(mit);
  assert.equal(k.s('typen').get('m_kiste').asset, 'm_bbbbbbbb_2');
  assert.equal(k.s('typen').get('m_anders').asset, 'm_cccccccc_3');
  assert.equal(k.s('objekte').size, 1);
});

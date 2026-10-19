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

test('Malen (5.2): Leinwandgröße, Pinsel-Zwischenpunkte ohne Naht-Sprung, Aufkleber-Quader', async () => {
  const { malGroesse, pinselSchritte, aufkleberGroesse, MAL_STANDARD } = await import('../editor/kern/malen.js');
  assert.deepEqual(malGroesse(0, 0), { b: MAL_STANDARD, h: MAL_STANDARD });
  assert.deepEqual(malGroesse(4096, 2048), { b: 1024, h: 512 });
  assert.deepEqual(malGroesse(300, 200), { b: 300, h: 200 });
  assert.deepEqual(pinselSchritte(null, { u: 0.5, v: 0.5 }, 0.01), [{ u: 0.5, v: 0.5 }]);
  const s = pinselSchritte({ u: 0, v: 0 }, { u: 0.1, v: 0 }, 0.025);
  assert.equal(s.length, 4);
  assert.deepEqual(s.at(-1), { u: 0.1, v: 0 });
  assert.ok(Math.abs(s[0].u - 0.025) < 1e-9);
  // Naht: großer Sprung → nicht verbinden
  assert.deepEqual(pinselSchritte({ u: 0.05, v: 0.5 }, { u: 0.9, v: 0.5 }, 0.01), [{ u: 0.9, v: 0.5 }]);
  assert.deepEqual(aufkleberGroesse(0.5, 200, 100), { x: 0.5, y: 0.25, z: 0.5 });
  assert.deepEqual(aufkleberGroesse(0.2, 100, 300), { x: 0.2, y: 0.6, z: 0.6 });
});

test('Animationen (5.3): Keyframes je Art, Schleife geschlossen, Basis bleibt, Quaternion-Rechnung', async () => {
  const { baueAnimation, achsenDrehung, quatMal, leerlaufName, ANIMATIONS_ARTEN } = await import('../editor/kern/animation.js');
  const nahe = (a, b) => a.every((x, i) => Math.abs(x - b[i]) < 1e-5);
  // 90° um y zweimal = 180° um y
  assert.ok(nahe(quatMal(achsenDrehung('y', Math.PI / 2), achsenDrehung('y', Math.PI / 2)), achsenDrehung('y', Math.PI)));
  const basis = { position: [1, 2, 3], quaternion: [0, 0, 0, 1], scale: [2, 2, 2] };
  for (const art of Object.keys(ANIMATIONS_ARTEN)) {
    const c = baueAnimation(art, { knoten: 'Tuer', dauer: 3, basis });
    const s = c.spuren[0];
    const breite = s.name.endsWith('quaternion') ? 4 : 3;
    assert.equal(s.werte.length, s.zeiten.length * breite, art);
    assert.equal(s.zeiten.at(-1), 3, art);
    // Schleife: erster = letzter Schlüssel (Drehen: 0° ≙ 360° als Drehung, Vorzeichen egal)
    const erst = s.werte.slice(0, breite);
    const letzt = s.werte.slice(-breite);
    assert.ok(nahe(erst, letzt) || nahe(erst, letzt.map((x) => -x)), art);
    assert.ok(s.name.startsWith('Tuer.'), art);
  }
  const w = baueAnimation('wippen', { knoten: 'K', staerke: 0.5, achse: 'y', basis, dauer: 2 }).spuren[0];
  assert.equal(Math.max(...w.werte.filter((_, i) => i % 3 === 1)), 2.5);
  assert.ok(w.werte.filter((_, i) => i % 3 === 0).every((x) => x === 1));
  const p = baueAnimation('pendeln', { knoten: 'K', staerke: 90, achse: 'z' }).spuren[0];
  assert.ok(nahe(p.werte.slice(16, 20), achsenDrehung('z', Math.PI / 2)), 'Viertel der Zeit = voller Ausschlag');
  assert.deepEqual(baueAnimation('flackern', { knoten: 'K', startwert: 3 }), baueAnimation('flackern', { knoten: 'K', startwert: 3 }));
  assert.throws(() => baueAnimation('tanzen', { knoten: 'K' }));
  assert.equal(leerlaufName(['Laufen', 'Stehen'], 'Stehen'), 'Stehen');
  assert.equal(leerlaufName(['Laufen'], 'Stehen'), '');
});

test('Leerlauf-Animation (5.3): Meta → Typ → Export → Spiel-Lader, Ersetzen behält passende Clips', async () => {
  const B = await import('../editor/kern/bibliothek.js');
  const { nachDefinition } = await import('../editor/kern/format.js');
  const { verarbeiteKarte } = await import('../server/spiel/karten/kartenLader.js');
  const { markerSchluessel } = await import('../editor/kern/karte.js');
  const meta = metaNormal({ name: 'Mühle', animationen: ['Drehen', 'Stehen'], leerlauf: 'Drehen' }, 'm_aaaaaaaa_1');
  assert.equal(meta.leerlauf, 'Drehen');
  assert.equal('leerlauf' in metaNormal({ name: 'X', animationen: ['A'], leerlauf: 'B' }, 'm_1'), false, 'nur vorhandene Clips');
  const typ = B.typAusModell(meta);
  assert.equal(typ.animation, 'Drehen');
  const k = neueZone({ id: 'anim', breite: 10, hoehe: 10 });
  k.anwenden([
    { s: 'typen', k: 'm_muehle', neu: { ...typ, glb: 'data:model/gltf-binary;base64,AAAA' } },
    { s: 'typen', k: 'm_boese', neu: { ...typ, glb: 'data:model/gltf-binary;base64,AAAA', animation: '<script>' } },
    { s: 'objekte', k: 1, neu: { typ: 'm_muehle', x: 2, y: 2, b: 1, h: 1 } },
    { s: 'marker', k: markerSchluessel(6, 6), neu: { art: 'start' } },
  ]);
  const daten = verarbeiteKarte(nachDefinition(k)).daten;
  assert.equal(daten.typen.m_muehle.animation, 'Drehen');
  assert.equal(daten.typen.m_boese.animation, undefined);
  // Ersetzen: neuer Leerlauf gewinnt; ohne Leerlauf bleibt der alte, wenn es den Clip gibt; sonst fällt er weg
  const z = neueZone({ id: 'ers', breite: 5, hoehe: 5 });
  z.anwenden([{ s: 'typen', k: 't', neu: { name: 'T', b: 1, h: 1, asset: 'm_aaaaaaaa_1', animation: 'Stehen' } }]);
  assert.equal(B.ersetzOps(z, 'm_aaaaaaaa_1', { id: 'm_b', animationen: ['Stehen'] })[0].neu.animation, 'Stehen');
  assert.equal(B.ersetzOps(z, 'm_aaaaaaaa_1', { id: 'm_b', animationen: ['Laufen'], leerlauf: 'Laufen' })[0].neu.animation, 'Laufen');
  assert.equal('animation' in B.ersetzOps(z, 'm_aaaaaaaa_1', { id: 'm_b', animationen: [] })[0].neu, false);
  assert.equal(B.ersetzOps(z, 'm_aaaaaaaa_1', { id: 'm_b' })[0].neu.animation, 'Stehen', 'ohne Angaben unverändert');
});

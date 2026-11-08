/**
 * Runde 44: Figuren neu gerigged (Arme folgen den Clips), Skelett-Zombie, Buffet-Spawnpunkte (10 s), Lager-Tor (5 s → Stadtrand),
 * Objekt-Feld z, Büsche (Laubkrone ohne Rinde) sichtbar, neue Modellpakete im Index.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { ladeKarte, KARTEN } from '../server/spiel/karten/kartenLader.js';
import { SpielWelt } from '../server/spiel/spielWelt.js';
import { erstelleKonfiguration } from '../server/spiel/konfiguration/spielKonfiguration.js';
import { pruefeSpawnpunkt, BUFFET_INTERVALL_MIN, SPAWN_INTERVALL_MIN } from '../server/spiel/karten/spawnpunkte.js';
import { TICK_DAUER_S } from '../gemeinsam/konstanten.js';

const datei = (pfad) => new URL(`../${pfad}`, import.meta.url);

function lagerWelt() {
  const welt = new SpielWelt(erstelleKonfiguration({ server: { zufallsStartwert: 3 } }), { kartenDefinition: KARTEN.lager });
  welt.wetter = { art: 'klar', rest: 9999 };
  return welt;
}

/** GLB → { json, bin } (nur für die Prüfungen hier) */
function leseGlb(pfad) {
  const b = readFileSync(datei(pfad));
  const n = b.readUInt32LE(12);
  return { json: JSON.parse(b.subarray(20, 20 + n).toString('utf8')), bin: b.subarray(20 + n + 8) };
}

function accessor({ json, bin }, i) {
  const a = json.accessors[i];
  const bv = json.bufferViews[a.bufferView];
  const k = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[a.type];
  const Typ = { 5121: Uint8Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array }[a.componentType];
  const start = bin.byteOffset + (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
  const roh = new Typ(bin.buffer.slice(start, start + a.count * k * Typ.BYTES_PER_ELEMENT));
  return Array.from({ length: a.count }, (_, i) => Array.from(roh.subarray(i * k, i * k + k)));
}

test('Figuren: volle Textur, Normalen, Arm-Vertices hängen an Arm-Knochen (r32-Fehler: Arme blieben steif in A-Pose)', () => {
  const liste = JSON.parse(readFileSync(datei('client/assets/3d/figuren/figuren.json'), 'utf8'));
  assert.equal(liste.length, 28);
  for (const id of ['mann_37', 'frau_34', 'sheriff']) {
    const glb = leseGlb(`client/assets/3d/figuren/${id}.glb`);
    const prim = glb.json.meshes[0].primitives[0];
    assert.ok(prim.attributes.NORMAL !== undefined, `${id}: Normalen`);
    assert.equal(glb.json.images[0].mimeType, 'image/png', `${id}: Originaltextur (PNG), nicht 256-px-JPEG`);
    const pos = accessor(glb, prim.attributes.POSITION);
    const gelenke = accessor(glb, prim.attributes.JOINTS_0);
    const gewichte = accessor(glb, prim.attributes.WEIGHTS_0);
    const namen = glb.json.skins[0].joints.map((j) => glb.json.nodes[j].name);
    for (const seite of [1, -1]) {
      let best = 0;
      pos.forEach((p, i) => (p[0] * seite > pos[best][0] * seite ? (best = i) : 0));
      const haupt = namen[gelenke[best][gewichte[best].indexOf(Math.max(...gewichte[best]))]];
      assert.match(haupt, /^(Wrist|LowerArm)\./, `${id}: Fingerspitze (${pos[best].map((x) => x.toFixed(2))}) hängt an ${haupt}`);
    }
  }
});

test('Skelett-Zombie: eigenes GLB mit Rig, Textur + Normalmap und zombieartigen Clips inkl. Sterben', () => {
  const glb = leseGlb('client/assets/3d/zombies/skelett.glb');
  const clips = glb.json.animations.map((a) => a.name);
  assert.deepEqual(clips, ['stehen', 'gehen', 'rennen', 'angriff', 'sterben']);
  assert.equal(glb.json.skins[0].joints.length, 62);
  assert.ok(glb.json.materials[0].normalTexture, 'Normalmap');
  const renderer = readFileSync(datei('client/darstellung/renderer.js'), 'utf8');
  assert.match(renderer, /skelett: \{ datei: '3d\/zombies\/skelett\.glb'/);
  assert.match(renderer, /variante === 'laeufer'\) return 'skelett'/, 'einfache Zombies tragen das Skelett');
});

test('Buffet-Spawnpunkt: Intervall ab 10 s, legt auch nach, wenn Spieler daneben stehen', () => {
  assert.equal(pruefeSpawnpunkt({ x: 1, y: 1, inhalt: 'apfel', intervall: 0.1 }).punkt.intervall, SPAWN_INTERVALL_MIN, 'normal ≥ 30 s');
  const { punkt } = pruefeSpawnpunkt({ x: 1, y: 1, inhalt: 'apfel', intervall: 0.1, buffet: true, chance: 100 });
  assert.equal(punkt.intervall, BUFFET_INTERVALL_MIN);
  assert.equal(punkt.buffet, true);

  const welt = lagerWelt();
  const karte = welt.karte;
  const i = karte.lootPunkte.findIndex((p) => p.spawnPunkt?.buffet);
  assert.ok(i >= 0, 'Lager hat Buffet');
  const lp = karte.lootPunkte[i];
  assert.ok(lp.hoehe > 0 && lp.respawnZeit <= 11, 'auf dem Tisch, ~10 s');
  const id = welt.lootZustand[i].gegenstandId;
  assert.ok(welt.holen(id), 'liegt von Anfang an');
  const s = welt.spielerBetrittWelt('Hungrig');
  s.x = lp.x;
  s.y = lp.y + 20;
  welt.entfernen(id); // „aufgehoben“
  for (let t = 0; t < 12; t += TICK_DAUER_S) welt.aktualisiere(TICK_DAUER_S);
  const neu = welt.lootZustand[i].gegenstandId;
  assert.ok(neu !== null && neu !== id && welt.holen(neu), 'nach ~10 s wieder da, obwohl der Spieler daneben steht');
});

test('Lager: Tor geschlossen, 5 s davor stehen → Zonenwechsel zum Stadtrand', () => {
  const welt = lagerWelt();
  const [u] = welt.karte.daten.uebergaenge;
  assert.equal(u.ziel, 'stadtrand');
  const s = welt.spielerBetrittWelt('Reisend');
  s.x = (u.px.x0 + u.px.x1) / 2;
  s.y = (u.px.y0 + u.px.y1) / 2;
  for (let t = 0; t < 4; t += TICK_DAUER_S) welt.aktualisiere(TICK_DAUER_S);
  assert.ok(!s.zonenwechsel && s.uebergang?.rest > 0, 'Countdown läuft');
  for (let t = 0; t < 1.5; t += TICK_DAUER_S) welt.aktualisiere(TICK_DAUER_S);
  assert.equal(s.zonenwechsel?.ziel, 'stadtrand');
  // Tor selbst blockiert (man kommt nicht hinaus)
  const tor = welt.karte.daten.objekte.find((o) => o.typ.startsWith('sf_lg_palisadentor'));
  assert.ok(tor?.blockiert);
});

test('Objekt-Feld z (Aufstellhöhe in m) kommt durch den Kartenlader; Lager-Tisch trägt Teller', () => {
  const karte = ladeKarte('lager');
  const teller = karte.daten.objekte.filter((o) => o.typ.startsWith('sf_plate'));
  assert.ok(teller.length >= 3 && teller.every((o) => o.z > 0.5 && !o.blockiert));
  const kartenModell = readFileSync(datei('client/darstellung/kartenModell.js'), 'utf8');
  assert.match(kartenModell, /\(o\.z \?\? 0\) \* g/);
});

test('Büsche (busch_*.glb = Laubkrone ohne Rinde) werden nicht mehr verworfen', () => {
  const baum = readFileSync(datei('client/darstellung/baumModell.js'), 'utf8');
  assert.match(baum, /return ergebnis\.rinde \|\| ergebnis\.laub \? ergebnis : null/);
  const glb = leseGlb('client/assets/3d/baeume/busch_0.glb');
  assert.deepEqual(glb.json.materials.map((m) => m.name), ['laub']);
});

test('Neue Modellpakete im Spielordner-Index (Maße + Credits)', () => {
  const index = JSON.parse(readFileSync(datei('client/assets/eigene/index.json'), 'utf8'));
  const nach = new Map(index.map((e) => [e.datei, e]));
  for (const n of ['si-sofa', 'si-kuehlschrank', 'sp-fels-gross-1', 'sp-runenstein-5', 'gp-gras-1', 'lg-palisade', 'lg-palisadentor', 'lg-zelt', 'ph-blume-gazania-h']) {
    const e = nach.get(`${n}.glb`);
    assert.ok(e?.masse && e.zielHoehe > 0, `${n} im Index mit Maßen`);
    assert.ok(existsSync(datei(`client/assets/eigene/vorschau/${n}.png`)), `${n} Vorschaubild`);
  }
  const credits = readFileSync(datei('client/assets/eigene/credits.json'), 'utf8');
  for (const wer of ['photon (that one larry)', 'ashkan.fancy', 'DJMaesen', 'ssaraksh', 'Poly Haven']) assert.ok(credits.includes(wer), `Credits: ${wer}`);
});


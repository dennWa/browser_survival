/**
 * Map-Editor 2.0, Phase 3 (Kern, umgebungsfrei): Projekt-Bibliothek für 3D-Modelle – Inhalts-ID, GLB lesen/bauen,
 * Metadaten, Auflösen für Export/Spiel, Übernahme alter eingebetteter Typen, Abhängigkeiten beim Löschen/Ersetzen.
 */
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { EditorKarte, markerSchluessel } from '../editor/kern/karte.js';
import { nachDefinition } from '../editor/kern/format.js';
import { validiere } from '../editor/kern/validierung.js';
import { neueZone } from '../editor/kern/zone.js';
import { verarbeiteKarte } from '../server/spiel/karten/kartenLader.js';
import * as B from '../editor/kern/bibliothek.js';

/** Minimales glTF mit einem Dreieck (Puffer als data:-URI) */
function dreieckGltf({ animation = false, extra = {} } = {}) {
  const pos = new Float32Array([0, 0, 0, 1, 0, 0, 0, 2, 3]);
  const bytes = new Uint8Array(pos.buffer);
  return {
    asset: { version: '2.0' },
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 2, 3] }],
    bufferViews: [{ buffer: 0, byteLength: bytes.length }],
    buffers: [{ byteLength: bytes.length, uri: `data:application/octet-stream;base64,${B.bytesZuBase64(bytes)}` }],
    ...(animation ? { animations: [{ name: 'Laufen', channels: [], samplers: [] }] } : {}),
    ...extra,
  };
}
const glb = (o) => B.gltfZuGlb(dreieckGltf(o));

afterEach(() => B.setzeModellQuelle(null));

test('gltfZuGlb baut gültige .glb; glbInfo zählt Dreiecke/Animationen; ID hängt nur am Inhalt', () => {
  const g = glb({ animation: true });
  assert.ok(B.istGlb(g));
  assert.equal(g.length % 4, 0);
  const info = B.glbInfo(g);
  assert.equal(info.dreiecke, 1);
  assert.deepEqual(info.animationen, ['Laufen']);
  assert.deepEqual(info.fehler, []);
  const json = B.glbJson(g);
  assert.equal(json.buffers[0].uri, undefined, 'Puffer liegt im BIN-Teil');
  assert.equal(B.assetId(g), B.assetId(glb({ animation: true })));
  assert.notEqual(B.assetId(g), B.assetId(glb()));
  assert.match(B.assetId(g), B.ASSET_ID_MUSTER);
  // Base64-Rundreise
  assert.deepEqual(B.dataUrlZuBytes(B.bytesZuGlbUrl(g)), g);
});

test('gltfZuGlb: mehrere Puffer werden zusammengelegt, externe abgelehnt; glbInfo meldet Kompression/externe Texturen', () => {
  const j = dreieckGltf();
  j.buffers.push({ byteLength: 4, uri: 'data:application/octet-stream;base64,AAECAw==' });
  j.bufferViews.push({ buffer: 1, byteLength: 4 });
  const g = B.gltfZuGlb(j);
  const aus = B.glbJson(g);
  assert.equal(aus.buffers.length, 1);
  assert.equal(aus.bufferViews[1].buffer, 0);
  assert.equal(aus.bufferViews[1].byteOffset, 36);
  assert.throws(() => B.gltfZuGlb({ ...dreieckGltf(), buffers: [{ byteLength: 36, uri: 'modell.bin' }] }), /extern/);
  assert.throws(() => B.glbJson(new Uint8Array(30)), /Keine .glb/);
  const info = B.glbInfo(glb({ extra: { extensionsRequired: ['KHR_draco_mesh_compression'], images: [{ uri: 'holz.png' }] } }));
  assert.equal(info.fehler.length, 2);
  assert.equal(B.modellFormat('Baum.GLTF'), 'gltf');
  assert.equal(B.modellFormat('bild.png'), null);
});

test('Metadaten: Tags, Ordner, Maße, Quelle nur URL, Suche über Name/Tag/Ordner', () => {
  const m = B.metaNormal({ name: '  Kiefer ', ordner: '/Wald/Bäume/', tags: 'Baum, #Wald  wald', quelle: 'javascript:alert(1)', masse: { b: 200, h: 0, hoehe: 'x' }, vorschau: 'data:text/html,böse' }, 'm_1');
  assert.equal(m.name, 'Kiefer');
  assert.equal(m.ordner, 'Wald/Bäume');
  assert.deepEqual(m.tags, ['baum', 'wald']);
  assert.equal(m.quelle, '');
  assert.deepEqual(m.masse, { b: 40, h: 0.1, hoehe: 1 });
  assert.equal(m.vorschau, null);
  assert.ok(B.passtModell(m, 'wald kief'));
  assert.ok(B.passtModell(m, '#baum'));
  assert.ok(B.passtModell(m, 'baume'));
  assert.ok(!B.passtModell(m, 'auto'));
  assert.deepEqual(B.masseAusGroesse({ x: 2.04, y: 3.456, z: 0.01 }), { b: 2, h: 0.1, hoehe: 3.46 });
  assert.equal(B.typIdFuer('Große Kiefer!', (id) => id === 'm_grosse_kiefer'), 'm_grosse_kiefer_2');
});

test('Karten-Typ verweist auf die Bibliothek: Export/Spiel bekommen glb eingebettet, Prüfung meldet fehlendes Modell', () => {
  const g = glb();
  const id = B.assetId(g);
  const k = neueZone({ id: 'bib', breite: 12, hoehe: 10 });
  const meta = B.metaNormal({ name: 'Dreieck', masse: { b: 1, h: 1, hoehe: 2 } }, id);
  k.anwenden([
    { s: 'typen', k: 'm_dreieck', neu: B.typAusModell(meta) },
    { s: 'objekte', k: 1, neu: { typ: 'm_dreieck', x: 3, y: 3, b: 1, h: 1, blockiert: true } },
    { s: 'marker', k: markerSchluessel(6, 6), neu: { art: 'start' } },
  ]);
  assert.equal(k.s('typen').get('m_dreieck').glb, undefined, 'der Entwurf trägt nur die ID');
  assert.ok(validiere(k).some((p) => p.code === 'modell-fehlt'));
  assert.equal(nachDefinition(k).typen.m_dreieck.glb, undefined);
  B.setzeModellQuelle((x) => (x === id ? B.bytesZuGlbUrl(g) : null));
  const def = nachDefinition(k);
  assert.ok(def.typen.m_dreieck.glb.startsWith(B.GLB_KOPF));
  assert.equal(k.s('typen').get('m_dreieck').glb, undefined, 'Karte bleibt unverändert');
  assert.ok(verarbeiteKarte(def).daten.typen.m_dreieck.glb, 'Spiel-Lader nimmt das Modell an');
  assert.ok(!validiere(k).some((p) => p.code === 'modell-fehlt' || p.code === 'eigener-typ'));
});

test('Alte eingebettete Typen wandern in die Bibliothek (gleiche Datei nur einmal), Export-Form wird geprüft', () => {
  const g = glb();
  const url = B.bytesZuGlbUrl(g);
  const k = new EditorKarte({ id: 'alt', breite: 10, hoehe: 10 });
  k.s('typen').set('a', { name: 'A', b: 1, h: 1, glb: url, lizenz: 'CC0' });
  k.s('typen').set('b', { name: 'B', b: 2, h: 1, glb: url });
  k.s('typen').set('c', { name: 'C', b: 1, h: 1 });
  const neu = B.uebernimmEingebettete(k);
  assert.equal(neu.length, 1);
  assert.equal(neu[0].meta.lizenz, 'CC0');
  assert.equal(k.s('typen').get('a').asset, neu[0].id);
  assert.equal(k.s('typen').get('b').asset, neu[0].id);
  assert.equal(k.s('typen').get('a').glb, undefined);
  assert.deepEqual(B.benutzteModelle(k), [neu[0].id]);
  const gelesen = B.leseBibliotheksExport([{ id: 'falsch', name: 'X', daten: url }, { daten: 'data:image/png;base64,AAAA' }, null]);
  assert.equal(gelesen.length, 1);
  assert.equal(gelesen[0].id, neu[0].id, 'ID kommt aus dem Inhalt');
});

test('Verwendungen über alle Zonen, Löschen und Ersetzen als Ops', () => {
  const zonen = new Map();
  for (const id of ['z1', 'z2', 'z3']) {
    const k = new EditorKarte({ id, breite: 10, hoehe: 10 });
    if (id !== 'z3') {
      k.anwenden([{ s: 'typen', k: 'm_x', neu: { name: 'X', b: 1, h: 1, asset: 'm_aaaaaaaa_1' } }, { s: 'texturen', k: 'm_x', neu: { farbe: '#ff0000' } }]);
      k.anwenden([1, 2, 3].map((n) => ({ s: 'objekte', k: n, neu: { typ: 'm_x', x: n, y: 1, b: 1, h: 1 } })));
    }
    zonen.set(id, k);
  }
  const v = B.verwendungen(zonen, 'm_aaaaaaaa_1');
  assert.equal(v.zonen.length, 2);
  assert.equal(v.objekte, 6);
  const z1 = zonen.get('z1');
  z1.anwenden(B.loeschOps(z1, 'm_aaaaaaaa_1'));
  assert.equal(z1.s('objekte').size, 0);
  assert.equal(z1.s('typen').size, 0);
  assert.equal(z1.s('texturen').size, 0);
  const z2 = zonen.get('z2');
  z2.anwenden(B.ersetzOps(z2, 'm_aaaaaaaa_1', { id: 'm_bbbbbbbb_2', urheber: 'Kenney', lizenz: 'CC0' }));
  assert.equal(z2.s('typen').get('m_x').asset, 'm_bbbbbbbb_2');
  assert.equal(z2.s('typen').get('m_x').lizenz, 'CC0');
  assert.equal(z2.s('objekte').size, 3);
  assert.equal(B.verwendungen(zonen, 'm_aaaaaaaa_1').objekte, 0);
});

test('Poly Pizza (Mock, ohne Netz): Suche normalisiert, nur CC0/CC-BY, Schlüssel im Header, CORS-Fehler erkennbar', async () => {
  const { POLY_PIZZA, lizenzKurz, QuellenFehler } = await import('../editor/kern/quellen.js');
  assert.equal(lizenzKurz('CC0 1.0'), 'CC0');
  assert.equal(lizenzKurz('CC-BY 3.0'), 'CC-BY 3.0');
  assert.equal(lizenzKurz('CC-BY-SA 4.0'), 'CC-BY-SA 4.0');
  let anfrage = null;
  const mock = async (url, opt) => {
    anfrage = { url, opt };
    return { ok: true, status: 200, json: async () => ({ total: 3, results: [
      { ID: 'abc', Title: 'Tree', Licence: 'CC0 1.0', Download: 'https://static.poly.pizza/abc.glb', Thumbnail: 'https://static.poly.pizza/abc.webp', Creator: { Username: 'Kenney' }, 'Tri Count': 120, Tags: ['tree'] },
      { ID: 'def', Title: 'Rock', Licence: 'CC-BY 3.0', Download: 'https://static.poly.pizza/def.glb', Creator: { Username: 'Quaternius' } },
      { ID: 'ghi', Title: 'Böse', Licence: 'CC-BY-NC 4.0', Download: 'https://static.poly.pizza/ghi.glb' },
    ] }) };
  };
  const { liste, ausgefiltert } = await POLY_PIZZA.suche('baum wald', { schluessel: 'GEHEIM', fetch: mock });
  assert.match(anfrage.url, /^https:\/\/api\.poly\.pizza\/v1\.1\/search\/baum%20wald\?/);
  assert.equal(anfrage.opt.headers['x-auth-token'], 'GEHEIM');
  assert.equal(liste.length, 2);
  assert.equal(ausgefiltert, 1);
  assert.deepEqual([liste[0].lizenz, liste[0].urheber, liste[0].quelle, liste[0].dreiecke], ['CC0', 'Kenney', 'https://poly.pizza/m/abc', 120]);
  await assert.rejects(POLY_PIZZA.suche('x', { fetch: mock }), /Schlüssel/);
  await assert.rejects(POLY_PIZZA.suche('x', { schluessel: 'k', fetch: async () => { throw new TypeError('Failed to fetch'); } }), (e) => e instanceof QuellenFehler && e.cors);
  await assert.rejects(POLY_PIZZA.suche('x', { schluessel: 'k', fetch: async () => ({ ok: false, status: 401 }) }), /ungültig/);
  await assert.rejects(POLY_PIZZA.lade({ download: 'https://boese.example/x.glb' }), /Download-Adresse/);
  const bytes = await POLY_PIZZA.lade(liste[0], { fetch: async () => ({ ok: true, status: 200, arrayBuffer: async () => new Uint8Array([1, 2]).buffer }) });
  assert.deepEqual([...bytes], [1, 2]);
});

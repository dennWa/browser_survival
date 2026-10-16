import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KARTEN, verarbeiteKarte } from '../server/spiel/karten/kartenLader.js';
import { ausTiled, nachTiled, alsJsModul } from '../werkzeuge/karten/tiledKarte.mjs';

const ohneUndefined = (o) => JSON.parse(JSON.stringify(o));

for (const [id, definition] of Object.entries(KARTEN)) {
  test(`Tiled: "${id}" exportieren und wieder importieren ergibt dieselbe Karte`, async () => {
    const tmj = JSON.parse(JSON.stringify(nachTiled(definition))); // wie aus einer Datei
    const zurueck = ausTiled(tmj);
    const erwartet = ohneUndefined({ id: definition.id, name: definition.name, kacheln: definition.kacheln, raeume: definition.raeume, objekte: definition.objekte, uebergaenge: definition.uebergaenge, ankuenfte: definition.ankuenfte });
    assert.deepEqual(ohneUndefined(zurueck), erwartet);
    // Die erzeugte Kartendatei ergibt beim Laden wieder genau diese Definition
    const modul = await import(`data:text/javascript,${encodeURIComponent(alsJsModul(zurueck))}`);
    assert.deepEqual(ohneUndefined(modul[id.toUpperCase()]), erwartet);
  });
}

/** Kleine Karte, wie Tiled ≥ 1.9 sie speichert: "class" statt "type", Base64-Kacheln, gespiegelte Kachel. */
function handgemacht() {
  const zeichen = [',', '#', 'T', '+'];
  const gids = [
    1, 1, 1, 1, 1,
    1, 2, 3 | 0x80000000, 2, 1,
    1, 2, 4, 2, 1,
    1, 2, 2, 2, 1,
  ];
  const bytes = new Uint8Array(gids.length * 4);
  gids.forEach((g, i) => new DataView(bytes.buffer).setUint32(i * 4, g >>> 0, true));
  return {
    type: 'map',
    orientation: 'orthogonal',
    infinite: false,
    width: 5,
    height: 4,
    tilewidth: 32,
    tileheight: 32,
    properties: [
      { name: 'id', type: 'string', value: 'huette' },
      { name: 'raeume', type: 'string', value: '{"a":{"name":"Hütte","lootTabelle":"huette"}}' },
    ],
    tilesets: [{ firstgid: 1, tiles: zeichen.map((z, id) => ({ id, properties: [{ name: 'zeichen', type: 'string', value: z }] })) }],
    layers: [
      { name: 'boden', type: 'tilelayer', encoding: 'base64', data: btoa(String.fromCharCode(...bytes)) },
      {
        name: 'dinge',
        type: 'objectgroup',
        objects: [
          { id: 1, class: 'start', point: true, x: 16, y: 16 },
          { id: 2, class: 'loot', point: true, x: 80, y: 80, properties: [{ name: 'raum', type: 'string', value: 'a' }] },
          { id: 3, class: 'kiste', x: 0, y: 96, width: 32, height: 32, properties: [{ name: 'blockiert', type: 'bool', value: true }] },
          { id: 4, class: 'uebergang', name: 'Zum Wald', x: 128, y: 0, width: 32, height: 128, properties: [{ name: 'ziel', type: 'string', value: 'waldweg' }, { name: 'ankunft', type: 'string', value: 'sued' }] },
          { id: 5, class: 'ankunft', name: 'west', point: true, x: 16, y: 48 },
        ],
      },
    ],
  };
}

test('Tiled: Karte aus Tiled 1.10 (Klassen, Base64, gespiegelte Kacheln) wird eine gültige Kartendefinition', () => {
  const d = ausTiled(handgemacht());
  assert.deepEqual(d.kacheln, ['S,,,,', ',#T#,', ',#a#,', ',###,']);
  assert.deepEqual(d.objekte, [{ typ: 'kiste', x: 0, y: 3, b: 1, h: 1, blockiert: true }]);
  assert.deepEqual(d.uebergaenge, [{ x: 4, y: 0, b: 1, h: 4, ziel: 'waldweg', ankunft: 'sued', name: 'Zum Wald' }]);
  assert.deepEqual(d.ankuenfte, { west: { x: 0, y: 1 } });
  const karte = verarbeiteKarte(d);
  assert.equal(karte.lootPunkte[0].lootTabelle, 'huette');
  assert.equal(karte.daten.kacheln[2][2], 'T', 'Untergrund unter dem Loot-Punkt = erster begehbarer Nachbar (hier die Tür)');
});

test('Tiled: verständliche Fehler', () => {
  const karte = handgemacht();
  assert.throws(() => ausTiled({ ...karte, infinite: true }), /Unendlich/);
  assert.throws(() => ausTiled({ ...karte, tilesets: [{ firstgid: 1, source: 'kacheln.tsj' }] }), /einbetten/);
  assert.throws(() => ausTiled({ ...karte, tilesets: [{ firstgid: 1, tiles: [] }] }), /zeichen/);
  assert.throws(() => ausTiled(karte, { id: 'Böse Id' }), /ungültig/);
  const ohneRaum = handgemacht();
  ohneRaum.layers[1].objects[1].properties = [];
  assert.throws(() => ausTiled(ohneRaum), /raum/);
});

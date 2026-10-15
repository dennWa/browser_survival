import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { KARTEN, ladeKarte } from '../server/spiel/karten/kartenLader.js';
import { GEGENSTAENDE, STANDARD_AUSRUESTUNG } from '../server/spiel/konfiguration/gegenstaende.js';
import { Welt } from '../gemeinsam/welt/welt.js';
import { STANDARD_KONFIGURATION } from '../server/spiel/konfiguration/spielKonfiguration.js';

const atlas = JSON.parse(readFileSync(new URL('../client/assets/atlas.json', import.meta.url), 'utf8'));
/** Objekttypen, die prozedural gezeichnet werden und keine Grafik brauchen */
const PROZEDURAL = new Set(['markierung']);

for (const id of Object.keys(KARTEN)) {
  test(`Karte "${id}": alles vom Spieler-Start aus erreichbar (keine zugestellten Türen)`, () => {
    const karte = ladeKarte(id);
    const welt = new Welt(karte.daten);
    const g = welt.kachelGroesse;
    const start = karte.spielerStarts[0];
    const besucht = new Set();
    const schlange = [[Math.floor(start.x / g), Math.floor(start.y / g)]];
    while (schlange.length) {
      const [tx, ty] = schlange.pop();
      const schluessel = ty * welt.breite + tx;
      if (besucht.has(schluessel) || welt.istBlockiert(tx, ty)) continue;
      besucht.add(schluessel);
      schlange.push([tx + 1, ty], [tx - 1, ty], [tx, ty + 1], [tx, ty - 1]);
    }
    for (const p of [...karte.lootPunkte, ...karte.zombieSpawns, ...karte.spielerStarts]) {
      const tx = Math.floor(p.x / g);
      const ty = Math.floor(p.y / g);
      assert.ok(besucht.has(ty * welt.breite + tx), `Punkt ${tx}|${ty}${p.raum ? ` (Raum ${p.raum})` : ''} ist nicht erreichbar`);
    }
  });

  test(`Karte "${id}": jedes Objekt hat eine Grafik`, () => {
    for (const o of ladeKarte(id).daten.objekte) {
      if (PROZEDURAL.has(o.typ)) continue;
      assert.ok(atlas.umgebung.objekte[o.typ], `Objekttyp "${o.typ}" fehlt in atlas.json`);
    }
  });
}

test('Jeder Gegenstand hat ein Icon', () => {
  for (const defId of Object.keys(GEGENSTAENDE)) assert.ok(atlas.items.icons[defId], `Icon für "${defId}" fehlt`);
});

test('Jede Ausrüstung hat Idle- und Lauf-Animation', () => {
  const ausruestungen = new Set([STANDARD_AUSRUESTUNG, ...Object.values(GEGENSTAENDE).map((d) => d.ausruestung).filter(Boolean)]);
  for (const a of ausruestungen) {
    for (const aktion of ['idle', 'laufen']) {
      assert.ok(atlas.figuren.survivor.animationen[`${a}_${aktion}`], `Animation "${a}_${aktion}" fehlt`);
    }
  }
});

test('Jede Zombie-Variante hat alle Animationen', () => {
  for (const variante of Object.keys(STANDARD_KONFIGURATION.zombie.varianten)) {
    const figur = atlas.figuren[variante === 'normal' ? 'zombie' : `zombie_${variante}`];
    assert.ok(figur, `Grafiken für Zombie-Variante "${variante}" fehlen`);
    for (const a of ['idle', 'laufen', 'angriff']) assert.ok(figur.animationen[a], `${variante}: "${a}" fehlt`);
  }
});

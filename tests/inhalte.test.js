import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { KARTEN, ladeKarte } from '../server/spiel/karten/kartenLader.js';
import { GEGENSTAENDE } from '../server/spiel/konfiguration/gegenstaende.js';
import { Welt } from '../gemeinsam/welt/welt.js';

const atlas = JSON.parse(readFileSync(new URL('../client/assets/atlas.json', import.meta.url), 'utf8'));
/** Objekttypen, die prozedural gezeichnet werden und keine Grafik brauchen */
const PROZEDURAL = new Set(['markierung', 'licht']);

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

  test(`Karte "${id}": Möbel stehen weder in Wänden noch in Türen`, () => {
    const karte = ladeKarte(id);
    const welt = new Welt(karte.daten);
    for (const index of welt.moebelBlockiert) {
      const tx = index % welt.breite;
      const ty = Math.floor(index / welt.breite);
      const zeichen = welt.kachelAn(tx, ty);
      assert.ok(!'#FT'.includes(zeichen), `Möbel auf "${zeichen}" bei ${tx}|${ty}`);
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

test('3D-Figur, Skins und Animationen sind vorhanden', () => {
  const info = atlas.figuren3d;
  for (const pfad of [info.modell, info.animationen, ...Object.values(info.skins)]) {
    assert.ok(existsSync(new URL(`../client/assets/${pfad}`, import.meta.url)), `${pfad} fehlt`);
  }
  const clips = JSON.parse(readFileSync(new URL(`../client/assets/${info.animationen}`, import.meta.url), 'utf8'));
  for (const name of ['stehen', 'rennen']) assert.ok(clips[name], `Animation "${name}" fehlt`);
});

test('Stadtrand: vom Spawn geradeaus durch den Haupteingang in die Eingangshalle laufen', () => {
  const karte = ladeKarte('stadtrand');
  const welt = new Welt(karte.daten);
  const g = welt.kachelGroesse;
  for (const start of karte.spielerStarts) {
    // Gerade nach oben bis in die Eingangshalle (Zeile 38) – nichts darf im Weg stehen
    for (let ty = Math.floor(start.y / g); ty >= 38; ty--) {
      assert.equal(welt.istBlockiert(Math.floor(start.x / g), ty), false, `Weg bei ${Math.floor(start.x / g)}|${ty} blockiert`);
    }
  }
});

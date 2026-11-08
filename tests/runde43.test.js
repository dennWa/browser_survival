/**
 * Runde 43: Lagerplatz – friedliche Zone, feste Abendstimmung (festeZeit), Holzzaun rundherum, alle Sitze am Feuer schauen zum Feuer.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ladeKarte, KARTEN } from '../server/spiel/karten/kartenLader.js';
import { SpielWelt } from '../server/spiel/spielWelt.js';
import { erstelleKonfiguration } from '../server/spiel/konfiguration/spielKonfiguration.js';
import { fuegeSchadenZu } from '../server/spiel/systeme/kampfSystem.js';
import { Welt } from '../gemeinsam/welt/welt.js';
import { sitzPlaetze, sitzFrontFuer } from '../gemeinsam/welt/sitze.js';
import { tageszeitUm } from '../gemeinsam/tageszeit.js';

const g = 32;

function lagerWelt() {
  const welt = new SpielWelt(erstelleKonfiguration({ server: { zufallsStartwert: 4 } }), { kartenDefinition: KARTEN.lager });
  welt.wetter = { art: 'klar', rest: 9999 };
  return welt;
}

test('Lagerplatz ist friedlich: kein Schaden an Spielern, Hunger/Durst/Kälte pausieren', () => {
  const welt = lagerWelt();
  assert.equal(welt.welt.friedlich, true);
  const a = welt.spielerBetrittWelt('A');
  const b = welt.spielerBetrittWelt('B');
  const leben = a.leben;
  fuegeSchadenZu(welt, a, 500, b, 0);
  assert.equal(a.leben, leben, 'kein Schaden');
  assert.equal(a.tot, false);
  a.hunger = 40;
  a.durst = 30;
  a.kaelte = 80;
  for (let i = 0; i < 120; i++) welt.aktualisiere(1);
  assert.equal(a.hunger, 40, 'Hunger pausiert');
  assert.equal(a.durst, 30, 'Durst pausiert');
  assert.equal(a.kaelte, 0, 'keine Kälte');
  assert.equal(a.tot, false);
  // andere Zonen bleiben gefährlich
  const stadt = new SpielWelt(erstelleKonfiguration({}), { kartenDefinition: KARTEN.stadtrand });
  assert.equal(stadt.welt.friedlich, false);
});

test('Lagerplatz: feste Abendstimmung (festeZeit) – Dämmerung, nicht Nacht; tageszeitUm trifft die Stunde', () => {
  const daten = ladeKarte('lager').daten;
  assert.ok(daten.festeZeit >= 19.5 && daten.festeZeit < 21, `festeZeit ${daten.festeZeit}`);
  const dauer = { tagSekunden: 600, nachtSekunden: 300 };
  const t = tageszeitUm(daten.festeZeit, dauer);
  assert.equal(t.istNacht, false);
  assert.ok(t.helligkeit > 0.2 && t.helligkeit < 0.8, `Dämmerungs-Helligkeit (${t.helligkeit})`);
  assert.equal(t.stunde, Math.floor(daten.festeZeit));
  assert.equal(tageszeitUm(13, dauer).helligkeit, 1);
  assert.equal(tageszeitUm(2, dauer).istNacht, true);
  assert.equal(ladeKarte('stadtrand').daten.festeZeit, undefined, 'nur der Lagerplatz');
});

test('Lagerplatz: Holzzaun rundherum (nur das Tor ist offen), draußen nur Rasen + Bäume', () => {
  const karte = ladeKarte('lager');
  const welt = new Welt(karte.daten);
  const zaun = karte.daten.objekte.filter((o) => o.typ.startsWith('sf_wooden_fence'));
  assert.ok(zaun.length > 40);
  const x0 = Math.min(...zaun.map((o) => Math.floor(o.x + o.b / 2)));
  const x1 = Math.max(...zaun.map((o) => Math.floor(o.x + o.b / 2)));
  const y0 = Math.min(...zaun.map((o) => Math.floor(o.y + o.h / 2)));
  const y1 = Math.max(...zaun.map((o) => Math.floor(o.y + o.h / 2)));
  const offen = [];
  for (let x = x0; x <= x1; x++) for (const y of [y0, y1]) if (!welt.istBlockiert(x, y)) offen.push([x, y]);
  for (let y = y0; y <= y1; y++) for (const x of [x0, x1]) if (!welt.istBlockiert(x, y)) offen.push([x, y]);
  assert.ok(offen.length >= 2 && offen.length <= 4, `nur das Tor ist offen: ${JSON.stringify(offen)}`);
  assert.ok(offen.every(([x]) => x === x1), 'Tor im Osten');
  // draußen: nur Gras, Bäume und Zaun – keine Deko/Möbel
  const draussen = (o) => o.x + o.b <= x0 || o.x >= x1 + 1 || o.y + o.h <= y0 || o.y >= y1 + 1;
  const fremd = karte.daten.objekte.filter((o) => draussen(o) && !['baum', 'baum_herbst'].includes(o.typ));
  assert.deepEqual(fremd.map((o) => o.typ), []);
  assert.ok(karte.daten.objekte.filter((o) => draussen(o) && o.typ.startsWith('baum')).length >= 30, 'Wald drumherum');
  for (let y = 0; y < welt.hoehe; y++) for (let x = 0; x < welt.breite; x++) if (x < x0 || x > x1 || y < y0 || y > y1) assert.equal(welt.kachelAn(x, y), ',', `Rasen bei ${x}|${y}`);
});

test('Lagerplatz: jeder Sitz im Kreis ums Feuer schaut zum Feuer (Gartenbank-Front ist gedreht)', () => {
  const karte = ladeKarte('lager');
  assert.equal(sitzFrontFuer('sf_x', { glbDatei: 'assets/eigene/garden-bench.glb' }), 180);
  assert.equal(sitzFrontFuer('sf_x', { glbDatei: 'assets/eigene/wooden-chair.glb' }), 0);
  const feuer = karte.bauwerke.find((b) => b.typ === 'lagerfeuer');
  const fx = (feuer.tx + 0.5) * g;
  const fy = (feuer.ty + 0.5) * g;
  let geprueft = 0;
  for (const o of karte.daten.objekte) {
    for (const p of sitzPlaetze(o, karte.daten.typen[o.typ], g)) {
      if (Math.hypot(p.x - fx, p.y - fy) > 4.5 * g) continue;
      const zumFeuer = Math.atan2(fy - p.y, fx - p.x);
      assert.ok(Math.cos(p.blick - zumFeuer) > 0.8, `${o.typ} bei ${o.x}|${o.y} schaut nicht zum Feuer`);
      geprueft++;
    }
  }
  assert.ok(geprueft >= 8, `Sitze am Feuer geprüft (${geprueft})`);
});

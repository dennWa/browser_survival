import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TICK_DAUER_S } from '../gemeinsam/konstanten.js';
import { erstelleKonfiguration } from '../server/spiel/konfiguration/spielKonfiguration.js';
import { SpielWelt } from '../server/spiel/spielWelt.js';
import { WALDSEE } from '../server/spiel/karten/waldsee.js';

/** Runde 41: Wild (Reh, Hirsch, Fuchs) über tierBereiche – sehr scheu, Herde flieht gemeinsam, mehr Fleisch. */
const mitte = (t) => t * 32 + 16;
const BREITE = 90;
const KARTE = {
  id: 'wild',
  name: 'Wild',
  kacheln: ['#'.repeat(BREITE), `#S${','.repeat(BREITE - 3)}#`, ...Array.from({ length: 39 }, () => `#${','.repeat(BREITE - 2)}#`), '#'.repeat(BREITE)],
  raeume: {},
  objekte: [],
  tierBereiche: [
    { x: 40, y: 15, b: 6, h: 6, art: 'reh', anzahl: 3 },
    { x: 60, y: 15, b: 4, h: 4, art: 'hirsch', anzahl: 1 },
    { x: 70, y: 30, b: 4, h: 4, art: 'quatsch', anzahl: 1 }, // unbekannte Art → Hase
  ],
};

function neueWelt() {
  const konfiguration = erstelleKonfiguration({ server: { zufallsStartwert: 5 }, wetter: { aktiv: false }, spieler: { startInventar: [] } });
  const welt = new SpielWelt(konfiguration, { kartenDefinition: KARTE });
  for (const z of [...welt.alleVomTyp('zombie')]) welt.entfernen(z.id);
  const spieler = welt.spielerBetrittWelt('Tester');
  spieler.gottmodus = true;
  spieler.x = mitte(2);
  spieler.y = mitte(2);
  return { welt, spieler };
}

test('Wild spawnt je Bereich mit eigener Art und eigenen Werten', () => {
  const { welt } = neueWelt();
  const tiere = [...welt.alleVomTyp('tier')];
  assert.equal(tiere.filter((t) => t.art === 'reh').length, 3);
  assert.equal(tiere.filter((t) => t.art === 'hirsch').length, 1);
  assert.equal(tiere.filter((t) => t.art === 'hase').length, 1);
  const hirsch = tiere.find((t) => t.art === 'hirsch');
  assert.equal(hirsch.leben, welt.konfiguration.tiere.wild.hirsch.leben);
  assert.ok(hirsch.trefferRadius > 17);
});

test('Reh flieht schon von weit, die Herde rennt mit, Flucht ist lang', () => {
  const { welt, spieler } = neueWelt();
  const rehe = [...welt.alleVomTyp('tier')].filter((t) => t.art === 'reh');
  rehe.forEach((r, i) => Object.assign(r, { x: mitte(42) + i * 40, y: mitte(18) }));
  const start = { x: rehe[0].x, y: rehe[0].y };
  spieler.x = rehe[0].x - 520; // außerhalb des Hasen-Radius (300), innerhalb des Reh-Radius
  spieler.y = rehe[0].y;
  welt.aktualisiere(TICK_DAUER_S);
  for (const r of rehe) assert.equal(r.zustand, 'flucht', 'ganze Herde flieht');
  spieler.x = mitte(2);
  spieler.y = mitte(2);
  for (let i = 0; i < 30 * 3; i++) welt.aktualisiere(TICK_DAUER_S);
  assert.ok(Math.hypot(rehe[0].x - start.x, rehe[0].y - start.y) > 450, 'rennt im Galopp weit weg');
});

test('Erlegter Hirsch gibt mehr Fleisch als ein Hase', async () => {
  const { toeten } = await import('../server/spiel/systeme/kampfSystem.js');
  const { welt } = neueWelt();
  const hirsch = [...welt.alleVomTyp('tier')].find((t) => t.art === 'hirsch');
  const vorher = [...welt.alleVomTyp('gegenstand')].length;
  toeten(welt, hirsch, null);
  const fleisch = [...welt.alleVomTyp('gegenstand')].length - vorher;
  assert.equal(fleisch, welt.konfiguration.tiere.wild.hirsch.fleisch);
});

test('Waldsee: Hirsche/Rehe/Füchse sind Wild-Bereiche statt Deko-Modelle', () => {
  const arten = new Set(WALDSEE.tierBereiche.map((t) => t.art));
  for (const a of ['reh', 'hirsch', 'fuchs']) assert.ok(arten.has(a), a);
  assert.ok(!WALDSEE.objekte.some((o) => /^sf_(deer|stag|fox)_/.test(o.typ)));
});

// ---------- Runde 41 (2): weicher Pinsel (Boden-Malschicht) + Studio ----------
import { MAL_AUFLOESUNG, leereMaske, kodiere, dekodiere, tupfer, pruefeBodenMalerei, entpacke } from '../gemeinsam/welt/bodenMalerei.js';
import { EditorKarte } from '../editor/kern/karte.js';
import { nachDefinition, ausDefinition } from '../editor/kern/format.js';
import { alsJsModul } from '../editor/kern/veroeffentlichen.js';
import { verarbeiteKarte } from '../server/spiel/karten/kartenLader.js';
import * as A from '../studio/kern/aktionen.js';
import { KI_WERKZEUGE } from '../studio/kern/kiWerkzeuge.js';

test('Malschicht: Kodierung hin und zurück, leer = leerer Text, kaputt = null', () => {
  const m = leereMaske(10, 8);
  assert.equal(kodiere(m), '');
  m.fill(255, 100, 140);
  const t = kodiere(m);
  assert.deepEqual([...dekodiere(t, m.length)], [...m]);
  assert.equal(dekodiere(t, m.length + 1), null);
  assert.equal(dekodiere('%%%', m.length), null);
});

test('Malschicht: Tupfer ist rund, Härte macht den Rand weich, Radieren nimmt weg', () => {
  const a = MAL_AUFLOESUNG;
  const B = 20;
  const wert = (m, x, y) => m[Math.floor(y * a) * B * a + Math.floor(x * a)];
  const hart = leereMaske(B, B);
  tupfer(hart, B, B, a, 10, 10, 4, { haerte: 1 });
  const weich = leereMaske(B, B);
  tupfer(weich, B, B, a, 10, 10, 4, { haerte: 0 });
  assert.equal(wert(hart, 10, 10), 255);
  assert.equal(wert(hart, 13.4, 10), 255, 'harte Kante: fast bis zum Rand voll');
  assert.ok(wert(weich, 13.4, 10) < 80, 'weich: am Rand blass');
  assert.equal(wert(hart, 13, 13), 0, 'rund: Ecke des Quadrats bleibt leer');
  tupfer(hart, B, B, a, 10, 10, 2, { haerte: 1, radieren: true });
  assert.equal(wert(hart, 10, 10), 0);
});

test('Malschicht: Studio-Ops → Editor-Format → JS-Modul → Lader → Welt', () => {
  const k = new EditorKarte({ id: 'mal', name: 'Mal', breite: 16, hoehe: 12 });
  k.anwenden(A.markerOps(k, 'start', 1, 1));
  k.anwenden(A.weichMalenOps(k, 'rasen', [{ x: 4, y: 4 }, { x: 10, y: 6 }], { radius: 2, haerte: 0.3 }));
  k.anwenden(A.weichMalenOps(k, 'wasser', [{ x: 12, y: 8 }], { radius: 1.5 }));
  const def = nachDefinition(k);
  assert.deepEqual(Object.keys(def.bodenMalerei.schichten), ['rasen', 'wasser']);
  assert.ok(alsJsModul(def).includes('bodenMalerei: {'));
  const zurueck = ausDefinition(def).karte ?? ausDefinition(def);
  assert.equal(nachDefinition(zurueck).bodenMalerei.schichten.rasen, def.bodenMalerei.schichten.rasen);
  const geladen = verarbeiteKarte(def);
  const masken = entpacke(geladen.daten.bodenMalerei, 16, 12);
  assert.ok(masken.get('rasen').some((v) => v > 0));
  // Radieren bis leer entfernt die Schicht
  k.anwenden(A.weichMalenOps(k, 'wasser', [{ x: 12, y: 8 }], { radius: 4, haerte: 1, radieren: true }));
  assert.deepEqual(Object.keys(nachDefinition(k).bodenMalerei.schichten), ['rasen']);
  assert.throws(() => A.weichMalenOps(k, 'lava', [{ x: 1, y: 1 }]));
  assert.equal(pruefeBodenMalerei({ schichten: { lava: 'AQA=' } }, 16, 12), null);
});

test('Studio: Tier-Bereich mit Art, KI-Werkzeuge kennen Wild + weichen Pinsel', () => {
  const k = new EditorKarte({ id: 't', name: 't', breite: 20, hoehe: 20 });
  const { ops } = A.flaecheOps(k, 'tiere', { x: 2, y: 2, b: 5, h: 5 }, { anzahl: 3, tierArt: 'hirsch' });
  assert.equal(ops[0].neu.art, 'hirsch');
  assert.equal(A.flaecheOps(k, 'tiere', { x: 2, y: 2, b: 5, h: 5 }, { tierArt: 'drache' }).ops[0].neu.art, 'hase');
  assert.ok(KI_WERKZEUGE.some((w) => w.name === 'boden_weich_malen'));
  assert.ok(JSON.stringify(KI_WERKZEUGE.find((w) => w.name === 'flaeche_anlegen').schema).includes('hirsch'));
});

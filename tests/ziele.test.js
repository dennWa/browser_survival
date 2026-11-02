/**
 * Phase 4.15 – Überlebens-Tagebuch (server/spiel/systeme/zielSystem.js, konfiguration/ziele.js) und Grusel-Direktor
 * (client/kern/grusel.js): Zählen aus Ereignissen, Kapitel-Fortschritt mit XP, Spielstand-Rundreise, Client-Daten,
 * Herzschlag/Geräusche/Flackern mit gezinktem Zufall.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TICK_DAUER_S } from '../gemeinsam/konstanten.js';
import { erstelleKonfiguration } from '../server/spiel/konfiguration/spielKonfiguration.js';
import { SpielWelt } from '../server/spiel/spielWelt.js';
import { erzeugeZombie } from '../server/spiel/entitaeten/zombie.js';
import { fuegeSchadenZu } from '../server/spiel/systeme/kampfSystem.js';
import { erstelleSpielstand, wendeSpielstandAn } from '../server/spiel/spielstand.js';
import { spielerDatenPrivat } from '../server/spiel/entitaeten/spieler.js';
import { KAPITEL } from '../server/spiel/konfiguration/ziele.js';
import { aktualisiereZiele, pruefeZiele, zieleFuerClient } from '../server/spiel/systeme/zielSystem.js';
import { GruselDirektor, GRUSEL } from '../client/kern/grusel.js';

const KARTE = {
  id: 'zieltest',
  name: 'Zieltest',
  kacheln: Array.from({ length: 20 }, (_, y) => (y === 0 || y === 19 ? '#'.repeat(20) : `#${y === 10 ? 'S' : '.'}${'.'.repeat(17)}#`)),
};

function neueWelt() {
  const konfiguration = erstelleKonfiguration({ server: { zufallsStartwert: 5 }, tiere: { hasenProTausend: 0 }, wetter: { aktiv: false }, spieler: { startInventar: [] } });
  const welt = new SpielWelt(konfiguration, { kartenDefinition: KARTE });
  for (const z of [...welt.alleVomTyp('zombie')]) welt.entfernen(z.id);
  const spieler = welt.spielerBetrittWelt('Tester');
  return { welt, spieler };
}

const zaehleEreignisse = (welt, liste) => {
  welt.ereignisse = liste;
  aktualisiereZiele(welt);
  welt.ereignisse = [];
};

test('Tagebuch: Kapitel 1 aus Ereignissen abhaken – XP, Meldung, Kapitelwechsel', () => {
  const { welt, spieler } = neueWelt();
  const xp0 = spieler.xp + spieler.level * 1000;
  zaehleEreignisse(welt, [
    { typ: 'abgebaut', art: 'holz', von: spieler.id, menge: 3 },
    { typ: 'abgebaut', art: 'holz', von: spieler.id, menge: 2 },
    { typ: 'abgebaut', art: 'stein', von: 999 }, // fremder Spieler zählt nicht
  ]);
  assert.deepEqual(spieler.ziele.erledigt, ['holz5']);
  assert.ok(welt.meldungen.some((m) => m.spielerId === spieler.id && /Ziel geschafft/.test(m.text)));
  zaehleEreignisse(welt, [
    { typ: 'abgebaut', art: 'stein', von: spieler.id },
    { typ: 'abgebaut', art: 'stein', von: spieler.id },
    { typ: 'abgebaut', art: 'stein', von: spieler.id },
    { typ: 'hergestellt', von: spieler.id, rezept: 'axt' },
  ]);
  assert.equal(spieler.ziele.kapitel, 0);
  // Zombie per echtem Kampf töten → tod-Ereignis trägt den Täter
  const z = welt.hinzufuegen(erzeugeZombie({ id: welt.neueId(), x: spieler.x + 40, y: spieler.y, konfiguration: welt.konfiguration }));
  fuegeSchadenZu(welt, z, 9999, spieler, 0);
  const tod = welt.ereignisse.find((e) => e.typ === 'tod');
  assert.equal(tod.von, spieler.id);
  aktualisiereZiele(welt);
  assert.equal(spieler.ziele.kapitel, 1, 'Kapitel 1 komplett → Kapitel 2');
  assert.ok(welt.ereignisse.some((e) => e.typ === 'kapitelGeschafft' && e.id === spieler.id));
  assert.ok(spieler.xp + spieler.level * 1000 > xp0, 'XP gutgeschrieben');
  const c = zieleFuerClient(spieler);
  assert.equal(c.titel, KAPITEL[1].titel);
  assert.equal(c.rang, KAPITEL[0].rang);
  assert.equal(c.ziele.find((x) => x.id === 'zombie10').stand, 1, 'Zähler laufen ins nächste Kapitel weiter');
});

test('Tagebuch: Nächte zählen über das Morgen-Ereignis (Blutmond extra), Boss über die Variante', () => {
  const { welt, spieler } = neueWelt();
  const dauer = welt.tageszeitDauer();
  // bis in die Nacht und wieder zum Morgen spulen
  let morgen = 0;
  for (let i = 0; i < 2 * (dauer.tagSekunden + dauer.nachtSekunden) && !morgen; i += 5) {
    welt.aktualisiere(5);
    if (welt.ereignisse.some((e) => e.typ === 'morgen')) morgen++;
  }
  assert.equal(morgen, 1);
  assert.equal(spieler.ziele.zaehler.naechte, 1);
  zaehleEreignisse(welt, [{ typ: 'morgen', nachtArt: 'blutmond' }, { typ: 'tod', ziel: 'zombie', von: spieler.id, variante: 'brocken' }]);
  assert.equal(spieler.ziele.zaehler.blutmond, 1);
  assert.equal(spieler.ziele.zaehler.boss, 1);
  assert.equal(spieler.ziele.zaehler.naechte, 2);
});

test('Tagebuch: bleibt im Spielstand (auch nach dem Tod), Unsinn wird verworfen', () => {
  const { welt, spieler } = neueWelt();
  zaehleEreignisse(welt, [{ typ: 'gebaut', bauwerk: 'lagerfeuer', von: spieler.id }]);
  spieler.ziele.kapitel = 1;
  const stand = erstelleSpielstand(spieler, 'zieltest');
  const neu = neueWelt();
  assert.equal(wendeSpielstandAn(neu.spieler, JSON.parse(JSON.stringify(stand)), neu.welt), true);
  assert.equal(neu.spieler.ziele.zaehler.gebaut_lagerfeuer, 1);
  assert.equal(neu.spieler.ziele.kapitel, 1);
  const p = pruefeZiele({ zaehler: { zombie: -3, 'bö$e': 5, holz: 1e12, gebaut: 4.7 }, erledigt: ['holz5', 'gibtsnicht', 'holz5'], kapitel: 99 });
  assert.deepEqual(p.zaehler, { holz: 1e7, gebaut: 4 });
  assert.deepEqual(p.erledigt, ['holz5']);
  assert.equal(p.kapitel, KAPITEL.length);
  assert.ok(spielerDatenPrivat(spieler, welt.konfiguration, welt).ziele.ziele.length > 0, 'Client bekommt das Kapitel');
  // jedes Ziel hat einen sinnvollen Zähler und eindeutige ID
  const ids = KAPITEL.flatMap((k) => k.ziele.map((z) => z.id));
  assert.equal(new Set(ids).size, ids.length);
});

test('Tagebuch: läuft auch im normalen Spieltakt ohne Fehler (Ereignisse aus echten Systemen)', () => {
  const { welt, spieler } = neueWelt();
  for (let i = 0; i < 20; i++) welt.aktualisiere(TICK_DAUER_S);
  assert.ok(spieler.ziele);
  assert.equal(spieler.ziele.zaehler.level, 1);
  assert.equal(spieler.ziele.zaehler.zonen, 1);
});

test('Grusel: Herzschlag nur nachts mit Zombie in der Nähe oder bei knappem Leben', () => {
  const gespielt = [];
  const sound = { spiele: (n, o) => gespielt.push([n, o]) };
  const renderer = {};
  const g = new GruselDirektor({ sound, renderer, zufall: () => 0.5 });
  const basis = { x: 0, y: 0, leben: 100, maxLeben: 100, nacht: false, zombies: [{ x: 50, y: 0 }] };
  assert.equal(g.frame(0.1, basis).herz, 0, 'tagsüber kein Herzrasen');
  const r = g.frame(0.1, { ...basis, nacht: true });
  assert.ok(r.herz > 0.7);
  assert.equal(gespielt.at(-1)[0], 'herzschlag');
  assert.ok(g.frame(0.1, { ...basis, zombies: [], leben: 10 }).herz > 0.5, 'knappes Leben pocht auch am Tag');
  assert.equal(g.frame(0.1, { ...basis, tot: true }).herz, 0);
  assert.equal(renderer.lampeFlackern, 1);
});

test('Grusel: Geräusch aus dem Dunkeln nur nachts und nur ohne Zombie in der Nähe', () => {
  const gespielt = [];
  const g = new GruselDirektor({ sound: { spiele: (n, o) => gespielt.push([n, o]) }, zufall: () => 0 });
  const nacht = { x: 100, y: 100, leben: 100, maxLeben: 100, nacht: true, zombies: [] };
  let geraeusch = null;
  for (let t = 0; t < GRUSEL.pauseMax + 1 && !geraeusch; t += 1) geraeusch = g.frame(1, nacht).geraeusch;
  assert.ok(GRUSEL.geraeusche.includes(geraeusch));
  const [, o] = gespielt.find(([n]) => n === geraeusch);
  assert.ok(Math.hypot(o.x - 100, o.y - 100) >= 350, 'weit weg, nicht im Nacken');
  // Zombie in der Nähe → bleibt still (Spannung statt Lärm)
  const g2 = new GruselDirektor({ sound: { spiele: () => {} }, zufall: () => 0 });
  let still = true;
  for (let t = 0; t < GRUSEL.pauseMax * 2; t += 1) if (g2.frame(1, { ...nacht, zombies: [{ x: 300, y: 100 }] }).geraeusch) still = false;
  assert.ok(still);
});

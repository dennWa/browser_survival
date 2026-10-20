import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HOTBAR_PLAETZE, INVENTAR_PLAETZE, TICK_DAUER_S } from '../gemeinsam/konstanten.js';
import { AKTIONEN } from '../gemeinsam/protokoll.js';
import { AUFPRALL_MIN_KMH, FAHRZEUG, FAHRZEUG_MAX_KMH, kmhZuTempo, tempoZuKmh } from '../gemeinsam/physik/fahrzeug.js';
import { erstelleKonfiguration } from '../server/spiel/konfiguration/spielKonfiguration.js';
import { GEGENSTAENDE } from '../server/spiel/konfiguration/gegenstaende.js';
import { SpielWelt } from '../server/spiel/spielWelt.js';
import { fuegeZumInventarHinzu } from '../server/spiel/systeme/inventarSystem.js';
import { Welt } from '../gemeinsam/welt/welt.js';

/**
 * Runde 14: 10er-Schnellleiste, Doppelklick-Konsum (AKTION konsumieren), Tacho-Einheiten, Aufprall-Schaden ≥ 10 km/h,
 * umfahrbare Bäume/Laternen, Roadkill ohne XP, Brocken (selten, 10 Pistolentreffer).
 */
const BREITE = 40;
const zeile = (rand = false) => (rand ? '#'.repeat(BREITE) : `#${'_'.repeat(BREITE - 2)}#`);
function karte(objekte) {
  return {
    id: 'runde14',
    name: 'Runde 14',
    kacheln: [zeile(true), `#S${'_'.repeat(BREITE - 3)}#`, zeile(), zeile(), zeile(), zeile(), zeile(), zeile(true)],
    raeume: {},
    objekte,
  };
}
const AUTO = { typ: 'auto_rot', x: 3, y: 2.5, b: 5.5, h: 3, drehung: 90, blockiert: true };

function aufbau(objekte, konfig = {}) {
  const welt = new SpielWelt(erstelleKonfiguration({ server: { zufallsStartwert: 3 }, spieler: { startInventar: [] }, ...konfig }), { kartenDefinition: karte([AUTO, ...objekte]) });
  for (const z of [...welt.alleVomTyp('zombie')]) welt.entfernen(z.id);
  const spieler = welt.spielerBetrittWelt('Fahrer');
  const auto = [...welt.alleVomTyp('fahrzeug')][0];
  spieler.x = auto.x;
  spieler.y = auto.y - auto.breite / 2 - 20;
  spieler.aktionsPuffer.push({ art: AKTIONEN.FAHRZEUG, slot: null });
  welt.aktualisiere(TICK_DAUER_S);
  return { welt, spieler, auto };
}
const fahre = (welt, spieler, y, sekunden) => {
  for (let i = 0; i < sekunden / TICK_DAUER_S; i++) {
    spieler.eingabePuffer.push({ seq: (spieler.letzteVerarbeiteteSeq ?? 0) + 1, x: 0, y, blick: 0 });
    welt.aktualisiere(TICK_DAUER_S);
  }
};

test('Schnellleiste hat 10 Plätze (Tasten 1–9 und 0), Grund-Inventar bleibt 16', () => {
  assert.equal(HOTBAR_PLAETZE, 10);
  assert.equal(INVENTAR_PLAETZE, 16);
});

test('Tacho: Höchsttempo = 70 km/h, Umrechnung hin und zurück', () => {
  assert.equal(FAHRZEUG_MAX_KMH, 70);
  assert.ok(Math.abs(tempoZuKmh(FAHRZEUG.max) - 70) < 1e-9);
  assert.ok(Math.abs(tempoZuKmh(kmhZuTempo(10)) - 10) < 1e-9);
  assert.equal(AUFPRALL_MIN_KMH, 10);
});

test('Doppelklick-Konsum: AKTION konsumieren verbraucht Essen/Trinken direkt (ohne Hand), nicht-Verbrauchbares bleibt', () => {
  const welt = new SpielWelt(erstelleKonfiguration({ server: { zufallsStartwert: 3 }, spieler: { startInventar: [] } }), { kartenDefinition: karte([]) });
  const spieler = welt.spielerBetrittWelt('Esser');
  spieler.hunger = 30;
  spieler.durst = 30;
  fuegeZumInventarHinzu(spieler, 'apfel', 2);
  fuegeZumInventarHinzu(spieler, 'wasserflasche', 1);
  fuegeZumInventarHinzu(spieler, 'holz', 3);
  const slot = (id) => spieler.inventar.findIndex((e) => e?.defId === id);
  spieler.aktionsPuffer.push({ art: AKTIONEN.KONSUMIEREN, slot: slot('apfel') });
  welt.aktualisiere(TICK_DAUER_S);
  assert.ok(spieler.hunger > 30, 'Hunger gestillt');
  assert.equal(spieler.inventar[slot('apfel')].menge, 1, 'ein Apfel weniger');
  assert.equal(spieler.ausgeruestet, null, 'nichts in die Hand genommen');
  // Abklingzeit: sofort nochmal klappt nicht
  spieler.aktionsPuffer.push({ art: AKTIONEN.KONSUMIEREN, slot: slot('apfel') });
  welt.aktualisiere(TICK_DAUER_S);
  assert.equal(spieler.inventar[slot('apfel')].menge, 1, 'Abklingzeit');
  for (let i = 0; i < 40; i++) welt.aktualisiere(TICK_DAUER_S);
  spieler.aktionsPuffer.push({ art: AKTIONEN.KONSUMIEREN, slot: slot('wasserflasche') });
  welt.aktualisiere(TICK_DAUER_S);
  assert.ok(spieler.durst > 30, 'Durst gestillt');
  for (let i = 0; i < 40; i++) welt.aktualisiere(TICK_DAUER_S);
  spieler.aktionsPuffer.push({ art: AKTIONEN.KONSUMIEREN, slot: slot('holz') });
  welt.aktualisiere(TICK_DAUER_S);
  assert.equal(spieler.inventar[slot('holz')].menge, 3, 'Holz ist kein Essen');
});

test('Doppelklick = erst BENUTZEN (Hand), dann KONSUMIEREN: danach ist die Hand wieder leer', () => {
  const welt = new SpielWelt(erstelleKonfiguration({ server: { zufallsStartwert: 3 }, spieler: { startInventar: [] } }), { kartenDefinition: karte([]) });
  const spieler = welt.spielerBetrittWelt('Doppel');
  spieler.hunger = 10;
  fuegeZumInventarHinzu(spieler, 'apfel', 2);
  const slot = spieler.inventar.findIndex((e) => e?.defId === 'apfel');
  spieler.aktionsPuffer.push({ art: AKTIONEN.BENUTZEN, slot }, { art: AKTIONEN.KONSUMIEREN, slot });
  welt.aktualisiere(TICK_DAUER_S);
  assert.equal(spieler.inventar[slot].menge, 1);
  assert.equal(spieler.ausgeruestet, null, 'Hand leer, auch wenn ein Stapel übrig ist');
  for (let i = 0; i < 40; i++) welt.aktualisiere(TICK_DAUER_S);
  spieler.aktionsPuffer.push({ art: AKTIONEN.BENUTZEN, slot }, { art: AKTIONEN.KONSUMIEREN, slot });
  welt.aktualisiere(TICK_DAUER_S);
  assert.equal(spieler.inventar[slot], null, 'letzter Apfel gegessen');
  assert.equal(spieler.ausgeruestet, null);
});

test('Wand-Aufprall ab 10 km/h beschädigt das eigene Auto, langsam nicht', () => {
  const schnell = aufbau([]);
  fahre(schnell.welt, schnell.spieler, -1, 6);
  assert.ok(schnell.auto.leben < schnell.auto.maxLeben, `Schaden bei Volltempo (Leben ${schnell.auto.leben})`);
  const langsam = aufbau([]);
  // Auto direkt vor die rechte Wand stellen und mit ~6 km/h (< 10) dagegen rollen lassen
  langsam.auto.x = (BREITE - 1) * 32 - langsam.auto.laenge / 2 - 3;
  langsam.auto.tempo = kmhZuTempo(6);
  fahre(langsam.welt, langsam.spieler, 0, 1);
  assert.equal(langsam.auto.leben, langsam.auto.maxLeben, 'kein Schaden unter 10 km/h');
});

test('Baum & Laterne: Baum ab 10, Laterne ab 40 km/h umgefahren, langsam halten sie das Auto auf', () => {
  const objekte = [
    { typ: 'baum', x: 14, y: 3, b: 3, h: 3, ebene: 'oben', groesse: 'klein' },
    { typ: 'licht', x: 24, y: 3, b: 1, h: 1, radius: 3, farbe: '#ffc070', staerke: 0.8, mast: true },
  ];
  const { welt, spieler, auto } = aufbau(objekte);
  const baumId = welt.welt.ressourcen.find((r) => r.art === 'holz').id;
  assert.ok(welt.welt.istRessourceDa(baumId));
  fahre(welt, spieler, -1, 6);
  assert.ok(!welt.welt.istRessourceDa(baumId), 'Baum umgefahren');
  assert.ok(welt.welt.laternenUmgefahren.has(0), 'Laterne umgefahren');
  assert.ok(auto.leben < auto.maxLeben, 'die Laterne kostet das Auto Leben (0,5)');
  assert.ok(welt.ressourcenNachwuchs.has(baumId) && welt.laternenNachwuchs.has(0), 'beide wachsen/werden nach');
  // langsam: der Mast hält das Auto auf (weniger als 10 km/h)
  const langsam = aufbau(objekte);
  const hindernis = (langsam.welt.welt.laternen[0].x);
  langsam.auto.x = hindernis - langsam.auto.laenge / 2 - 6;
  langsam.auto.y = langsam.welt.welt.laternen[0].y;
  langsam.auto.tempo = kmhZuTempo(5);
  fahre(langsam.welt, langsam.spieler, 0, 2);
  assert.ok(!langsam.welt.welt.laternenUmgefahren.has(0), 'langsam bleibt die Laterne stehen');
  assert.ok(langsam.auto.x < hindernis, 'Auto kommt nicht durch den Mast');
});

test('Client-Welt: Laternen-Zustand wird übernommen und blockiert nicht mehr', () => {
  const welt = new Welt({ ...karte([{ typ: 'licht', x: 5, y: 3, b: 1, h: 1, radius: 3, farbe: '#fff', staerke: 0.8, mast: true }]), breite: BREITE, hoehe: 8, kachelGroesse: 32 });
  const l = welt.laternen[0];
  assert.equal(welt.umfahrbareImKreis(l.x, l.y, 5).length, 1);
  welt.uebernimmLaternen([0]);
  assert.equal(welt.umfahrbareImKreis(l.x, l.y, 5).length, 0);
});

test('Roadkill bringt 0 XP (Kill zählt in der Statistik)', async () => {
  const { erzeugeZombie } = await import('../server/spiel/entitaeten/zombie.js');
  const { welt, spieler, auto } = aufbau([]);
  const z = welt.hinzufuegen(erzeugeZombie({ id: welt.neueId(), x: auto.x + 140, y: auto.y, konfiguration: welt.konfiguration }));
  fahre(welt, spieler, -1, 2.5);
  assert.equal(welt.holen(z.id), undefined, 'umgefahren');
  assert.equal(spieler.xp, 0);
  assert.equal(spieler.statistik.zombies, 1);
});

test('Brocken: selten und exakt 10 Pistolentreffer', () => {
  const k = erstelleKonfiguration({});
  const v = k.zombie.varianten;
  assert.equal(v.brocken.leben, 10 * GEGENSTAENDE.pistole.schaden, '10 Treffer à Pistolenschaden');
  const summe = v.normal.gewicht + v.laeufer.gewicht + v.brocken.gewicht;
  assert.ok(v.brocken.gewicht / summe < 0.05, `Brocken-Anteil ${(v.brocken.gewicht / summe * 100).toFixed(1)} % (< 5 %)`);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TICK_DAUER_S } from '../gemeinsam/konstanten.js';
import { AKTIONEN } from '../gemeinsam/protokoll.js';
import { pruefePlatz } from '../gemeinsam/welt/bauwerke.js';
import { erstelleKonfiguration } from '../server/spiel/konfiguration/spielKonfiguration.js';
import { SpielWelt } from '../server/spiel/spielWelt.js';
import { erzeugeZombie } from '../server/spiel/entitaeten/zombie.js';
import { fuegeZumInventarHinzu } from '../server/spiel/systeme/inventarSystem.js';

/**
 * Bauwerke: Werkbank/Lagerfeuer aus dem Inventar bauen und aufstellen, Feuer + Kochen, Falle, Beet & Ernte,
 * Rucksack-Tausch, Weltzustand speichern/laden.
 */
const KARTE = {
  id: 'garten',
  name: 'Garten',
  kacheln: [
    ',,,,,,,,,,,,,,',
    ',S,,,,,,,,,,,,',
    ',,,,,,,,,,,,,,',
    ',,,,,,,,,,,,,,',
    ',,,,,,,#####,,',
    ',,,,,,,#+++#,,',
    ',,,,,,,#####,,',
  ],
  raeume: {},
};
const mitte = (t) => t * 32 + 16;

function gartenWelt() {
  const konfiguration = erstelleKonfiguration({ server: { zufallsStartwert: 9 }, spieler: { startInventar: [] } });
  const welt = new SpielWelt(konfiguration, { kartenDefinition: KARTE });
  for (const z of [...welt.alleVomTyp('zombie')]) welt.entfernen(z.id);
  const spieler = welt.spielerBetrittWelt('Gärtner');
  spieler.x = mitte(3);
  spieler.y = mitte(2);
  return { welt, spieler, konfiguration };
}
const aktion = (welt, spieler, a) => {
  spieler.aktionsPuffer.push({ slot: null, ...a });
  welt.aktualisiere(TICK_DAUER_S);
};
const anzahl = (spieler, defId) => spieler.inventar.reduce((s, e) => s + (e?.defId === defId ? e.menge : 0), 0);
const slotVon = (spieler, defId) => spieler.inventar.findIndex((e) => e?.defId === defId);

test('Werkbank: im Inventar aus 4 Holz bauen, aufstellen (blockiert), dort eine Falle herstellen', () => {
  const { welt, spieler } = gartenWelt();
  fuegeZumInventarHinzu(spieler, 'holz', 5);
  fuegeZumInventarHinzu(spieler, 'eisenerz', 3);
  aktion(welt, spieler, { art: AKTIONEN.HERSTELLEN, rezept: 'werkbank' });
  assert.equal(anzahl(spieler, 'werkbank'), 1, 'ohne Werkbank in der Nähe herstellbar');
  assert.equal(anzahl(spieler, 'holz'), 1);
  aktion(welt, spieler, { art: AKTIONEN.HERSTELLEN, rezept: 'falle' });
  assert.equal(anzahl(spieler, 'falle'), 0, 'Falle braucht eine Werkbank');

  aktion(welt, spieler, { art: AKTIONEN.PLATZIEREN, slot: slotVon(spieler, 'werkbank'), tx: 4, ty: 2 });
  assert.equal(welt.welt.bauwerkBei(4, 2)?.typ, 'werkbank');
  assert.equal(anzahl(spieler, 'werkbank'), 0, 'Item verbraucht');
  assert.equal(welt.welt.istBlockiert(4, 2), true);
  aktion(welt, spieler, { art: AKTIONEN.HERSTELLEN, rezept: 'falle' });
  assert.equal(anzahl(spieler, 'falle'), 1, 'an der gebauten Werkbank geht es');
});

test('Platzieren: zu weit, auf Wand, doppelt, Lagerfeuer drinnen → abgelehnt', () => {
  const { welt, spieler } = gartenWelt();
  fuegeZumInventarHinzu(spieler, 'lagerfeuer', 1);
  fuegeZumInventarHinzu(spieler, 'werkbank', 2);
  const slot = slotVon(spieler, 'werkbank');
  aktion(welt, spieler, { art: AKTIONEN.PLATZIEREN, slot, tx: 12, ty: 2 });
  assert.equal(welt.welt.bauwerke.size, 0, 'zu weit');
  assert.equal(pruefePlatz(welt.welt, 'werkbank', 7, 4).ok, false, 'Wand');
  assert.equal(pruefePlatz(welt.welt, 'lagerfeuer', 9, 5).ok, false, 'drinnen');
  aktion(welt, spieler, { art: AKTIONEN.PLATZIEREN, slot, tx: 4, ty: 2 });
  aktion(welt, spieler, { art: AKTIONEN.PLATZIEREN, slot: slotVon(spieler, 'werkbank'), tx: 4, ty: 2 });
  assert.equal(welt.welt.bauwerke.size, 1, 'nicht doppelt');
  aktion(welt, spieler, { art: AKTIONEN.PLATZIEREN, slot: slotVon(spieler, 'werkbank'), tx: 3, ty: 2 });
  assert.equal(welt.welt.bauwerke.size, 1, 'nicht da, wo man selbst steht');
});

test('Lagerfeuer: F ohne Feuerzeug geht nicht, mit schon; brennt runter; Tomate braten', () => {
  const { welt, spieler, konfiguration } = gartenWelt();
  fuegeZumInventarHinzu(spieler, 'lagerfeuer', 1);
  fuegeZumInventarHinzu(spieler, 'tomate', 2);
  aktion(welt, spieler, { art: AKTIONEN.PLATZIEREN, slot: slotVon(spieler, 'lagerfeuer'), tx: 4, ty: 2 });
  const feuer = welt.welt.bauwerkBei(4, 2);
  aktion(welt, spieler, { art: AKTIONEN.FEUER });
  assert.equal(feuer.brennt, false);
  assert.ok(welt.meldungen.some((m) => m.text.includes('Feuerzeug')));
  fuegeZumInventarHinzu(spieler, 'feuerzeug', 1);
  aktion(welt, spieler, { art: AKTIONEN.FEUER });
  assert.equal(feuer.brennt, true);

  aktion(welt, spieler, { art: AKTIONEN.BAUWERK });
  assert.equal(spieler.arbeit?.art, 'kochen');
  for (let i = 0; i < (konfiguration.bauen.kochDauer + 0.5) / TICK_DAUER_S; i++) welt.aktualisiere(TICK_DAUER_S);
  assert.equal(anzahl(spieler, 'tomate'), 1);
  assert.equal(anzahl(spieler, 'tomate_gebraten'), 1);

  feuer.brennRest = 0.01;
  welt.aktualisiere(TICK_DAUER_S);
  assert.equal(feuer.brennt, false, 'heruntergebrannt');
});

test('Falle: Zombie tritt rein → sofort tot, Besitzer bekommt XP; neu spannen, aufnehmen', () => {
  const { welt, spieler } = gartenWelt();
  fuegeZumInventarHinzu(spieler, 'falle', 1);
  aktion(welt, spieler, { art: AKTIONEN.PLATZIEREN, slot: slotVon(spieler, 'falle'), tx: 5, ty: 2 });
  const falle = welt.welt.bauwerkBei(5, 2);
  assert.ok(falle, 'Falle steht');
  assert.equal(welt.welt.istBlockiert(5, 2), false, 'Fallen blockieren nicht');
  const z = welt.hinzufuegen(erzeugeZombie({ id: welt.neueId(), x: mitte(5) + 4, y: mitte(2), konfiguration: welt.konfiguration, variante: 'brocken' }));
  welt.aktualisiere(TICK_DAUER_S);
  assert.equal(welt.holen(z.id), undefined, 'Zombie ist tot');
  assert.equal(falle.gespannt, false);
  assert.equal(spieler.xp, 15);

  spieler.x = mitte(4);
  aktion(welt, spieler, { art: AKTIONEN.BAUWERK });
  assert.equal(falle.gespannt, true, 'neu gespannt');
  aktion(welt, spieler, { art: AKTIONEN.BAUWERK });
  assert.equal(welt.welt.bauwerke.size, 0, 'aufgenommen');
  assert.equal(anzahl(spieler, 'falle'), 1);
});

test('Beet: Hacke auf Rasen, Samen pflanzen, nach 24 h zwei Tomaten ernten (Hacke bleibt)', () => {
  const { welt, spieler, konfiguration } = gartenWelt();
  fuegeZumInventarHinzu(spieler, 'hacke', 1);
  fuegeZumInventarHinzu(spieler, 'samen_gurke', 1);
  fuegeZumInventarHinzu(spieler, 'samen_tomate', 2);
  aktion(welt, spieler, { art: AKTIONEN.PLATZIEREN, slot: slotVon(spieler, 'hacke'), tx: 4, ty: 2 });
  const beet = welt.welt.bauwerkBei(4, 2);
  assert.equal(beet?.typ, 'beet');
  assert.equal(anzahl(spieler, 'hacke'), 1, 'Hacke bleibt');
  // Tomatensamen gezielt benutzen (nicht die Gurke, die vorne liegt)
  aktion(welt, spieler, { art: AKTIONEN.BENUTZEN, slot: slotVon(spieler, 'samen_tomate') });
  assert.equal(beet.pflanze, 'tomate');
  assert.equal(anzahl(spieler, 'samen_tomate'), 1);
  aktion(welt, spieler, { art: AKTIONEN.BAUWERK });
  assert.equal(anzahl(spieler, 'tomate'), 0, 'noch nicht reif');
  const tag = konfiguration.welt.tagSekunden + konfiguration.welt.nachtSekunden;
  beet.wachstum = 1 - 2 / tag; // kurz vor reif
  for (let i = 0; i < 3 / TICK_DAUER_S; i++) welt.aktualisiere(TICK_DAUER_S);
  assert.equal(beet.wachstum, 1);
  aktion(welt, spieler, { art: AKTIONEN.BAUWERK });
  assert.equal(anzahl(spieler, 'tomate'), 2);
  assert.equal(beet.pflanze, null, 'Beet wieder frei');
  assert.equal(pruefePlatz(welt.welt, 'beet', 10, 5).ok, false, 'drinnen kein Beet');
});

test('Rucksack tauschen: Inhalt wandert in den neuen, alter landet im Inventar', () => {
  const { welt, spieler } = gartenWelt();
  fuegeZumInventarHinzu(spieler, 'rucksack_klein', 1);
  aktion(welt, spieler, { art: AKTIONEN.BENUTZEN, slot: slotVon(spieler, 'rucksack_klein') });
  assert.equal(spieler.inventar.length, 20);
  spieler.inventar[18] = { defId: 'kaese', menge: 1 };
  fuegeZumInventarHinzu(spieler, 'rucksack_gross', 1);
  aktion(welt, spieler, { art: AKTIONEN.BENUTZEN, slot: slotVon(spieler, 'rucksack_gross') });
  assert.equal(spieler.rucksack, 'rucksack_gross');
  assert.equal(spieler.inventar.length, 24);
  assert.equal(anzahl(spieler, 'kaese'), 1, 'Käse ist mitgekommen');
  assert.equal(anzahl(spieler, 'rucksack_klein'), 1, 'alter Rucksack im Inventar');
});

test('Weltzustand: Bauwerke, Uhrzeit und Tag überleben einen Neustart', () => {
  const { welt, spieler } = gartenWelt();
  fuegeZumInventarHinzu(spieler, 'hacke', 1);
  fuegeZumInventarHinzu(spieler, 'samen_kartoffel', 1);
  aktion(welt, spieler, { art: AKTIONEN.PLATZIEREN, slot: slotVon(spieler, 'hacke'), tx: 4, ty: 2 });
  aktion(welt, spieler, { art: AKTIONEN.BAUWERK });
  welt.tag = 5;
  const stand = JSON.parse(JSON.stringify(welt.weltzustand()));
  stand.bauwerke.push({ typ: 'raketensilo', tx: 1, ty: 1 }, { typ: 'werkbank', tx: 7, ty: 4 }); // Unsinn + Wand
  const neu = gartenWelt().welt;
  assert.equal(neu.uebernimmWeltzustand(stand), true);
  assert.equal(neu.tag, 5);
  assert.equal(neu.welt.bauwerke.size, 1, 'nur das gültige Beet');
  assert.equal(neu.welt.bauwerkBei(4, 2).pflanze, 'kartoffel');
});

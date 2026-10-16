import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KISTE_PLAETZE, TICK_DAUER_S } from '../gemeinsam/konstanten.js';
import { AKTIONEN } from '../gemeinsam/protokoll.js';
import { FELD_GROESSE, pruefePlatz } from '../gemeinsam/welt/bauwerke.js';
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
  spieler.level = 2; // Falle ab Level 2
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
  assert.equal(spieler.xp, 40, 'Boss gibt 40 XP');

  spieler.x = mitte(4);
  aktion(welt, spieler, { art: AKTIONEN.BAUWERK });
  assert.equal(falle.gespannt, true, 'neu gespannt');
  aktion(welt, spieler, { art: AKTIONEN.BAUWERK });
  assert.equal(welt.welt.bauwerke.size, 0, 'aufgenommen');
  assert.equal(anzahl(spieler, 'falle'), 1);
});

test('Erdfeld: Spitzhacke legt 3×3 Beete an, Samen pflanzen, nach 24 h zwei Tomaten ernten', () => {
  const { welt, spieler, konfiguration } = gartenWelt();
  fuegeZumInventarHinzu(spieler, 'spitzhacke', 1);
  fuegeZumInventarHinzu(spieler, 'samen_gurke', 1);
  fuegeZumInventarHinzu(spieler, 'samen_tomate', 2);
  aktion(welt, spieler, { art: AKTIONEN.FELD, tx: 4, ty: 2 });
  assert.equal(welt.welt.bauwerke.size, FELD_GROESSE * FELD_GROESSE, 'ganzes Feld');
  const beet = welt.welt.bauwerkBei(4, 2);
  assert.equal(beet?.typ, 'beet');
  assert.equal(anzahl(spieler, 'spitzhacke'), 1, 'Spitzhacke bleibt');
  // Tomatensamen gezielt benutzen (nicht die Gurke, die vorne liegt)
  aktion(welt, spieler, { art: AKTIONEN.BENUTZEN, slot: slotVon(spieler, 'samen_tomate') });
  const bepflanzt = [...welt.welt.bauwerke.values()].filter((b) => b.pflanze === 'tomate');
  assert.equal(bepflanzt.length, 1);
  const feld = bepflanzt[0];
  assert.equal(anzahl(spieler, 'samen_tomate'), 1);
  spieler.x = (feld.tx + 0.5) * 32;
  spieler.y = (feld.ty + 0.5) * 32;
  aktion(welt, spieler, { art: AKTIONEN.BAUWERK });
  assert.equal(anzahl(spieler, 'tomate'), 0, 'noch nicht reif');
  const tag = konfiguration.welt.tagSekunden + konfiguration.welt.nachtSekunden;
  feld.wachstum = 1 - 2 / tag; // kurz vor reif
  for (let i = 0; i < 3 / TICK_DAUER_S; i++) welt.aktualisiere(TICK_DAUER_S);
  assert.equal(feld.wachstum, 1);
  aktion(welt, spieler, { art: AKTIONEN.BAUWERK });
  assert.equal(anzahl(spieler, 'tomate'), 2);
  assert.equal(feld.pflanze, null, 'Beet wieder frei');
  assert.equal(pruefePlatz(welt.welt, 'beet', 10, 5).ok, false, 'drinnen kein Beet');
});

test('Erdfeld: ohne Spitzhacke, nicht auf Wänden/Bauwerken', () => {
  const { welt, spieler } = gartenWelt();
  aktion(welt, spieler, { art: AKTIONEN.FELD, tx: 4, ty: 2 });
  assert.equal(welt.welt.bauwerke.size, 0, 'ohne Spitzhacke nichts');
  fuegeZumInventarHinzu(spieler, 'spitzhacke', 1);
  aktion(welt, spieler, { art: AKTIONEN.FELD, tx: 7, ty: 4 }); // Gebäude
  assert.equal(welt.welt.bauwerke.size, 0, 'nicht auf Wand/Boden drinnen');
});

test('Regen halbiert die Wachstumszeit', () => {
  const { welt, spieler } = gartenWelt();
  fuegeZumInventarHinzu(spieler, 'spitzhacke', 1);
  fuegeZumInventarHinzu(spieler, 'samen_tomate', 2);
  aktion(welt, spieler, { art: AKTIONEN.FELD, tx: 4, ty: 2 });
  aktion(welt, spieler, { art: AKTIONEN.BENUTZEN, slot: slotVon(spieler, 'samen_tomate') });
  const feld = [...welt.welt.bauwerke.values()].find((b) => b.pflanze);
  welt.wetter.art = 'klar';
  welt.wetter.rest = 1e6;
  const start = feld.wachstum;
  for (let i = 0; i < 30; i++) welt.aktualisiere(TICK_DAUER_S);
  const klar = feld.wachstum - start;
  welt.wetter.art = 'regen';
  const mitte1 = feld.wachstum;
  for (let i = 0; i < 30; i++) welt.aktualisiere(TICK_DAUER_S);
  const regen = feld.wachstum - mitte1;
  assert.ok(Math.abs(regen / klar - 2) < 0.01, `Regen wächst doppelt so schnell (${regen / klar})`);
});

test('Lagerkiste: aus 8 Holz, 16 Plätze, einlegen/entnehmen, Inhalt überlebt Neustart, nicht im Netz-Bauwerk', () => {
  const { welt, spieler } = gartenWelt();
  fuegeZumInventarHinzu(spieler, 'holz', 8);
  aktion(welt, spieler, { art: AKTIONEN.HERSTELLEN, rezept: 'kiste' });
  assert.equal(anzahl(spieler, 'kiste'), 1);
  assert.equal(anzahl(spieler, 'holz'), 0);
  aktion(welt, spieler, { art: AKTIONEN.PLATZIEREN, slot: slotVon(spieler, 'kiste'), tx: 4, ty: 2 });
  const kiste = welt.welt.bauwerkBei(4, 2);
  assert.equal(kiste.inhalt.length, KISTE_PLAETZE);
  fuegeZumInventarHinzu(spieler, 'apfel', 7);
  aktion(welt, spieler, { art: AKTIONEN.KISTE_LEGEN, slot: slotVon(spieler, 'apfel') });
  assert.equal(anzahl(spieler, 'apfel'), 7, 'zu — noch nicht geöffnet');
  aktion(welt, spieler, { art: AKTIONEN.BAUWERK }); // E öffnet
  assert.equal(spieler.offeneKiste, kiste.id);
  aktion(welt, spieler, { art: AKTIONEN.KISTE_LEGEN, slot: slotVon(spieler, 'apfel') });
  assert.equal(anzahl(spieler, 'apfel'), 0);
  assert.equal(kiste.inhalt[0].menge, 7);
  assert.ok(welt.bauwerkeOeffentlich().every((b) => b.inhalt === undefined), 'Inhalt ist privat');
  const stand = JSON.parse(JSON.stringify(welt.weltzustand()));
  const neu = gartenWelt().welt;
  neu.uebernimmWeltzustand(stand);
  assert.equal(neu.welt.bauwerkBei(4, 2).inhalt[0].menge, 7, 'Inhalt gespeichert');
  aktion(welt, spieler, { art: AKTIONEN.KISTE_NEHMEN, slot: 0 });
  assert.equal(anzahl(spieler, 'apfel'), 7);
  spieler.x = mitte(12); // weggehen → Kiste schließt sich
  welt.aktualisiere(TICK_DAUER_S);
  assert.equal(spieler.offeneKiste, null);
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
  fuegeZumInventarHinzu(spieler, 'spitzhacke', 1);
  fuegeZumInventarHinzu(spieler, 'samen_kartoffel', 1);
  aktion(welt, spieler, { art: AKTIONEN.FELD, tx: 4, ty: 2 });
  aktion(welt, spieler, { art: AKTIONEN.BAUWERK });
  welt.tag = 5;
  const stand = JSON.parse(JSON.stringify(welt.weltzustand()));
  stand.bauwerke.push({ typ: 'raketensilo', tx: 1, ty: 1 }, { typ: 'werkbank', tx: 7, ty: 4 }); // Unsinn + Wand
  const neu = gartenWelt().welt;
  assert.equal(neu.uebernimmWeltzustand(stand), true);
  assert.equal(neu.tag, 5);
  assert.equal(neu.welt.bauwerke.size, FELD_GROESSE * FELD_GROESSE, 'nur das gültige Erdfeld');
  assert.ok([...neu.welt.bauwerke.values()].some((b) => b.pflanze === 'kartoffel'));
});

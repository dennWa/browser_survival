import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TICK_DAUER_S } from '../gemeinsam/konstanten.js';
import { AKTIONEN } from '../gemeinsam/protokoll.js';
import { erstelleKonfiguration } from '../server/spiel/konfiguration/spielKonfiguration.js';
import { SpielWelt } from '../server/spiel/spielWelt.js';
import { erzeugeZombie } from '../server/spiel/entitaeten/zombie.js';
import { wendeEingabeAn } from '../gemeinsam/physik/bewegung.js';
import { Welt } from '../gemeinsam/welt/welt.js';

/** Parkplatz: Auto in der Mitte, Wand rechts. */
const KARTE = {
  id: 'parkplatz',
  name: 'Parkplatz',
  kacheln: [
    '#########################',
    '#S______________________#',
    '#_______________________#',
    '#_______________________#',
    '#_______________________#',
    '#_______________________#',
    '#_______________________#',
    '#########################',
  ],
  raeume: {},
  objekte: [{ typ: 'auto_rot', x: 6, y: 2.5, b: 5.5, h: 3, drehung: 90, blockiert: true }],
};
const mitte = (t) => t * 32 + 16;

function parkplatz() {
  const welt = new SpielWelt(erstelleKonfiguration({ server: { zufallsStartwert: 2 }, spieler: { startInventar: [] } }), { kartenDefinition: KARTE });
  for (const z of [...welt.alleVomTyp('zombie')]) welt.entfernen(z.id);
  const spieler = welt.spielerBetrittWelt('Fahrer');
  const auto = [...welt.alleVomTyp('fahrzeug')][0];
  return { welt, spieler, auto };
}
const fahre = (welt, spieler, x, y, sekunden) => {
  for (let i = 0; i < sekunden / TICK_DAUER_S; i++) {
    spieler.eingabePuffer.push({ seq: (spieler.letzteVerarbeiteteSeq ?? 0) + 1, x, y, blick: 0 });
    welt.aktualisiere(TICK_DAUER_S);
  }
};

test('Kartenautos werden Fahrzeuge: nicht mehr Möbel, blockieren aber ihre Kacheln', () => {
  const { welt, auto } = parkplatz();
  assert.ok(auto, 'Fahrzeug-Entität');
  assert.equal(welt.welt.objekte.some((o) => o.typ === 'auto_rot'), false, 'nicht mehr bei den Möbeln');
  welt.aktualisiere(TICK_DAUER_S);
  assert.equal(welt.welt.istBlockiert(Math.floor(auto.x / 32), Math.floor(auto.y / 32)), true);
  assert.equal(welt.welt.istBlockiert(Math.floor(auto.x / 32), Math.floor(auto.y / 32), auto.id), false, 'eigene Kacheln zählen nicht');
});

test('Einsteigen, Gas geben, lenken, gegen die Wand fahren, aussteigen', () => {
  const { welt, spieler, auto } = parkplatz();
  spieler.x = auto.x;
  spieler.y = auto.y - auto.breite / 2 - 20;
  spieler.aktionsPuffer.push({ art: AKTIONEN.FAHRZEUG, slot: null });
  welt.aktualisiere(TICK_DAUER_S);
  assert.equal(spieler.fahrzeug, auto);
  assert.equal(auto.fahrerId, spieler.id);
  const startX = auto.x;
  fahre(welt, spieler, 0, -1, 1.5); // Gas (W)
  assert.ok(auto.x > startX + 100, `fährt nach rechts (${Math.round(auto.x - startX)} px)`);
  assert.equal(spieler.x, auto.x, 'Fahrer sitzt im Auto');
  fahre(welt, spieler, 0, -1, 4); // weiter bis zur Wand
  assert.ok(auto.x + auto.laenge / 2 <= 24 * 32 + 4, `nicht durch die Wand (Front bei ${Math.round(auto.x + auto.laenge / 2)})`);
  fahre(welt, spieler, 0, 1, 2.5); // rückwärts
  fahre(welt, spieler, 0, 0, 1.2); // ausrollen
  const winkelVorher = auto.winkel;
  fahre(welt, spieler, 1, -1, 1); // Gas + rechts lenken
  assert.ok(auto.winkel > winkelVorher + 0.3, 'lenkt');
  fahre(welt, spieler, 0, 1, 2);
  spieler.aktionsPuffer.push({ art: AKTIONEN.FAHRZEUG, slot: null });
  welt.aktualisiere(TICK_DAUER_S);
  assert.equal(spieler.fahrzeug, null);
  assert.equal(auto.fahrerId, null);
  assert.ok(Math.hypot(spieler.x - auto.x, spieler.y - auto.y) > auto.breite / 2, 'neben dem Auto ausgestiegen');
});

test('Zombies anfahren: Schaden je nach Tempo; im Auto beißen sie nicht', () => {
  const { welt, spieler, auto } = parkplatz();
  spieler.x = auto.x;
  spieler.y = auto.y - auto.breite / 2 - 20;
  spieler.aktionsPuffer.push({ art: AKTIONEN.FAHRZEUG, slot: null });
  welt.aktualisiere(TICK_DAUER_S);
  const z = welt.hinzufuegen(erzeugeZombie({ id: welt.neueId(), x: mitte(16), y: auto.y, konfiguration: welt.konfiguration }));
  const leben = spieler.leben;
  fahre(welt, spieler, 0, -1, 2.5);
  assert.equal(welt.holen(z.id), undefined, 'umgefahren');
  assert.equal(spieler.xp, 10, 'XP für den Fahrer');
  assert.equal(spieler.leben, leben, 'keine Bisse im Auto');
});

test('Vorhersage: Client-Welt + gleiche Eingaben ergeben dieselbe Fahrt wie auf dem Server', () => {
  const { welt, spieler, auto } = parkplatz();
  spieler.x = auto.x;
  spieler.y = auto.y - auto.breite / 2 - 20;
  spieler.aktionsPuffer.push({ art: AKTIONEN.FAHRZEUG, slot: null });
  welt.aktualisiere(TICK_DAUER_S);
  const clientWelt = new Welt(welt.karte.daten);
  clientWelt.setzeFahrzeugKacheln(auto.id, [...welt.welt.fahrzeugKachelListe.get(auto.id)].map((i) => ({ tx: i % clientWelt.breite, ty: Math.floor(i / clientWelt.breite) })));
  const lokal = { x: spieler.x, y: spieler.y, blick: 0, fahrzeug: { id: auto.id, x: auto.x, y: auto.y, winkel: auto.winkel, tempo: 0, laenge: auto.laenge, breite: auto.breite } };
  const eingaben = [...Array(40)].map((_, i) => ({ x: i > 20 ? 0.7 : 0, y: -1, blick: 0 }));
  for (const e of eingaben) {
    wendeEingabeAn(lokal, e, clientWelt, welt.physikParameter(), TICK_DAUER_S);
    spieler.eingabePuffer.push({ seq: 1, ...e });
    welt.aktualisiere(TICK_DAUER_S);
  }
  assert.ok(Math.abs(lokal.x - spieler.x) < 0.001 && Math.abs(lokal.y - spieler.y) < 0.001, 'gleiche Position');
  assert.ok(Math.abs(lokal.fahrzeug.winkel - auto.winkel) < 1e-9);
});

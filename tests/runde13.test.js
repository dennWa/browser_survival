import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TICK_DAUER_S } from '../gemeinsam/konstanten.js';
import { AKTIONEN, ADMIN_BEFEHLE } from '../gemeinsam/protokoll.js';
import { wendeEingabeAn } from '../gemeinsam/physik/bewegung.js';
import { samenZiel } from '../gemeinsam/welt/bauwerke.js';
import { tageszeit } from '../gemeinsam/tageszeit.js';
import { erstelleKonfiguration } from '../server/spiel/konfiguration/spielKonfiguration.js';
import { GEGENSTAENDE } from '../server/spiel/konfiguration/gegenstaende.js';
import { SpielWelt } from '../server/spiel/spielWelt.js';
import { fuegeZumInventarHinzu } from '../server/spiel/systeme/inventarSystem.js';
import { erzeugeTier } from '../server/spiel/entitaeten/tier.js';
import { erzeugeZombie } from '../server/spiel/entitaeten/zombie.js';
import { pruefeEintrag } from '../server/spiel/spielstand.js';
import { neuesBauwerk } from '../server/spiel/systeme/bauSystem.js';

/**
 * Feedback-Runde 13: Haltbarkeit, Admin-Schalter, Energydrink, Kofferraum, Hasen überfahren, Angel-Loot, klein/groß,
 * Q einzeln, Hacke 1×1 (Rechtsklick = Rasen), Samen-Ziel, Essen aus der Hand.
 */
const KARTE = {
  id: 'runde13',
  name: 'Runde 13',
  kacheln: [
    '#########################',
    '#S,,,,,,,,,,,,,,,,,,,,,,#',
    '#,,,,,,,,,,,,,,,,,,,,,,,#',
    '#,,,,,,,,,,,~~~~,,,,,,,,#',
    '#,,,,,,,,,,,~~~~,,,,,,,,#',
    '#,,,,,,,,,,,~~~~,,,,,,,,#',
    '#,,,,,,,,,,,,,,,,,,,,,,,#',
    '#########################',
  ],
  raeume: {},
  objekte: [
    { typ: 'auto_rot', x: 3, y: 5, b: 5.5, h: 3, drehung: 90, blockiert: true },
    ...Array.from({ length: 20 }, (_, i) => ({ typ: 'stein', x: 2 + i, y: 1, b: 1, h: 1, blockiert: true })),
  ],
};
const mitte = (t) => t * 32 + 16;

function neueWelt(extra = {}) {
  const konfiguration = erstelleKonfiguration({ server: { zufallsStartwert: 7 }, tiere: { hasenProTausend: 0 }, wetter: { aktiv: false }, ...extra, spieler: { startInventar: [], ...extra.spieler } });
  const welt = new SpielWelt(konfiguration, { kartenDefinition: KARTE });
  for (const z of [...welt.alleVomTyp('zombie')]) welt.entfernen(z.id);
  const spieler = welt.spielerBetrittWelt('Tester');
  spieler.x = mitte(10);
  spieler.y = mitte(6);
  return { welt, spieler, konfiguration };
}
const ticks = (welt, n) => {
  for (let i = 0; i < n; i++) welt.aktualisiere(TICK_DAUER_S);
};
const aktion = (welt, spieler, a) => {
  spieler.aktionsPuffer.push({ slot: null, ...a });
  welt.aktualisiere(TICK_DAUER_S);
};
const anzahl = (spieler, defId) => spieler.inventar.reduce((s, e) => s + (e?.defId === defId ? e.menge : 0), 0);
const slotVon = (spieler, defId) => spieler.inventar.findIndex((e) => e?.defId === defId);
/** Linksklick: Taste runter, ein Tick, wieder los. */
const klick = (welt, spieler) => {
  spieler.eingabePuffer.push({ seq: ++spieler.letzteVerarbeiteteSeq, x: 0, y: 0, blick: spieler.blick, angriff: true });
  ticks(welt, 1);
  spieler.eingabePuffer.push({ seq: ++spieler.letzteVerarbeiteteSeq, x: 0, y: 0, blick: spieler.blick, angriff: false });
  ticks(welt, 1);
  spieler.angriffsAbklingzeit = 0;
};
const inDieHand = (welt, spieler, defId) => aktion(welt, spieler, { art: AKTIONEN.BENUTZEN, slot: slotVon(spieler, defId) });

test('Haltbarkeit: Werkzeug nutzt sich ab, geht kaputt und verschwindet; Axt unberührt; Wert überlebt den Spielstand', () => {
  const { welt, spieler } = neueWelt({ ressourcen: { stein: { dauer: 0.1, chanceAufMehr: 0 } } });
  for (const id of ['axt', 'spitzhacke', 'hacke']) assert.ok(GEGENSTAENDE[id].haltbarkeit > 0, `${id} hat Haltbarkeit`);
  fuegeZumInventarHinzu(spieler, 'axt', 1);
  fuegeZumInventarHinzu(spieler, 'spitzhacke', 1);
  spieler.inventar[slotVon(spieler, 'spitzhacke')].haltbarkeit = 2;
  assert.equal(pruefeEintrag({ defId: 'spitzhacke', menge: 1, haltbarkeit: 2 }).haltbarkeit, 2, 'bleibt im Spielstand');
  const abbauen = (tx) => {
    spieler.x = mitte(tx);
    spieler.y = mitte(2);
    aktion(welt, spieler, { art: AKTIONEN.ABBAUEN });
    ticks(welt, 12);
  };
  abbauen(2);
  assert.equal(spieler.inventar[slotVon(spieler, 'spitzhacke')].haltbarkeit, 1);
  abbauen(3);
  assert.equal(slotVon(spieler, 'spitzhacke'), -1, 'kaputt → weg');
  assert.ok(welt.meldungen.some((m) => m.text.includes('kaputt')));
  assert.equal(anzahl(spieler, 'axt'), 1);
});

test('Klein/groß: kleine Steine geben 1, große 2 (Glück +1); beide Sorten kommen vor', () => {
  const { welt, spieler } = neueWelt({ ressourcen: { stein: { dauer: 0.1, chanceAufMehr: 0 } } });
  const steine = welt.welt.ressourcen.filter((r) => r.typ === 'stein');
  assert.ok(steine.some((r) => r.groesse === 'gross') && steine.some((r) => r.groesse === 'klein'), 'beide Größen');
  fuegeZumInventarHinzu(spieler, 'spitzhacke', 1);
  for (const gesucht of ['klein', 'gross']) {
    const r = steine.find((s) => s.groesse === gesucht);
    spieler.x = r.x;
    spieler.y = r.y + 32;
    const vorher = anzahl(spieler, 'stein');
    aktion(welt, spieler, { art: AKTIONEN.ABBAUEN });
    ticks(welt, 12);
    assert.equal(anzahl(spieler, 'stein') - vorher, gesucht === 'gross' ? 2 : 1, gesucht);
  }
});

test('Ackerfeld: Hacke schlägt nicht zu, legt 1×1 an, feldEntfernen macht wieder Rasen, Hacke nutzt sich ab', () => {
  const { welt, spieler } = neueWelt();
  spieler.x = mitte(9);
  spieler.y = mitte(3);
  fuegeZumInventarHinzu(spieler, 'hacke', 1);
  inDieHand(welt, spieler, 'hacke');
  const z = welt.hinzufuegen(erzeugeZombie({ id: welt.neueId(), x: spieler.x + 28, y: spieler.y, konfiguration: welt.konfiguration }));
  klick(welt, spieler);
  assert.equal(z.leben, welt.konfiguration.zombie.leben, 'kein Nahkampf mit der Hacke');
  welt.entfernen(z.id);
  aktion(welt, spieler, { art: AKTIONEN.FELD, tx: 10, ty: 3 });
  assert.equal([...welt.welt.bauwerke.values()].filter((b) => b.typ === 'beet').length, 1, 'genau ein Beet');
  assert.equal(spieler.inventar[slotVon(spieler, 'hacke')].haltbarkeit, GEGENSTAENDE.hacke.haltbarkeit - 1);
  aktion(welt, spieler, { art: AKTIONEN.FELD_ENTFERNEN, tx: 10, ty: 3 });
  assert.equal(welt.welt.bauwerke.size, 0, 'wieder Rasen');
  aktion(welt, spieler, { art: AKTIONEN.FELD_ENTFERNEN, tx: 10, ty: 3 }); // nichts da: kein Fehler
});

test('Samen in der Hand: Ziel ist das Beet vor der Figur (Indikator = Server-Wahl)', () => {
  const { welt, spieler } = neueWelt();
  spieler.x = mitte(5);
  spieler.y = mitte(5);
  welt.welt.setzeBauwerk(neuesBauwerk(welt, 'beet', 6, 5, 'Tester'));
  welt.welt.setzeBauwerk(neuesBauwerk(welt, 'beet', 4, 5, 'Tester'));
  assert.equal(samenZiel(welt.welt, spieler.x, spieler.y, 0).tx, 6);
  assert.equal(samenZiel(welt.welt, spieler.x, spieler.y, Math.PI).tx, 4);
  fuegeZumInventarHinzu(spieler, 'samen_tomate', 2);
  inDieHand(welt, spieler, 'samen_tomate');
  spieler.blick = Math.PI;
  klick(welt, spieler);
  assert.equal(welt.welt.bauwerkBei(4, 5).pflanze, 'tomate');
  assert.equal(welt.welt.bauwerkBei(6, 5).pflanze, null);
});

test('Essen: erst in die Hand, Linksklick verbraucht; Gurke stillt Hunger und Durst gleich; Energydrink = 5 s Sprint-Boost', () => {
  const { welt, spieler } = neueWelt();
  spieler.hunger = 50;
  spieler.durst = 50;
  fuegeZumInventarHinzu(spieler, 'gurke', 2);
  inDieHand(welt, spieler, 'gurke');
  assert.equal(anzahl(spieler, 'gurke'), 2, 'nur in der Hand');
  klick(welt, spieler);
  assert.equal(anzahl(spieler, 'gurke'), 1);
  assert.equal(Math.round(spieler.hunger - 50), Math.round(spieler.durst - 50), 'gleiche Menge');
  assert.ok(spieler.hunger > 55);

  fuegeZumInventarHinzu(spieler, 'energydrink', 1);
  inDieHand(welt, spieler, 'energydrink');
  klick(welt, spieler);
  assert.ok(spieler.boostRest > 4 && spieler.boostRest <= 5);
  const physik = welt.physikParameter();
  spieler.ausdauer = 100;
  spieler.boostRest = 5;
  for (let i = 0; i < 4.5 / TICK_DAUER_S; i++) wendeEingabeAn(spieler, { x: 1, y: 0, sprint: true }, welt.welt, { ...physik }, TICK_DAUER_S);
  assert.equal(spieler.ausdauer, 100, 'Sprint kostet während des Boosts nichts');
  for (let i = 0; i < 2 / TICK_DAUER_S; i++) wendeEingabeAn(spieler, { x: 1, y: 0, sprint: true }, welt.welt, { ...physik }, TICK_DAUER_S);
  assert.ok(spieler.ausdauer < 100, 'danach wieder normal');
});

test('Q auf Stapel in der Hand wirft nur 1 Stück weg', () => {
  const { welt, spieler } = neueWelt();
  fuegeZumInventarHinzu(spieler, 'holz', 5);
  aktion(welt, spieler, { art: AKTIONEN.ABLEGEN, slot: slotVon(spieler, 'holz'), einzeln: true });
  assert.equal(anzahl(spieler, 'holz'), 4);
  const am_boden = [...welt.alleVomTyp('gegenstand')].filter((g) => g.defId === 'holz');
  assert.equal(am_boden.length, 1);
  assert.equal(am_boden[0].menge, 1);
  aktion(welt, spieler, { art: AKTIONEN.ABLEGEN, slot: slotVon(spieler, 'holz') });
  assert.equal(anzahl(spieler, 'holz'), 0, 'ohne einzeln: ganzer Stapel');
});

test('Admin: unendlich Munition (kein Verbrauch, kein Nachladen) und +12 Stunden', () => {
  const { welt, spieler } = neueWelt();
  spieler.admin = true;
  fuegeZumInventarHinzu(spieler, 'pistole', 1, 3);
  inDieHand(welt, spieler, 'pistole');
  aktion(welt, spieler, { art: AKTIONEN.ADMIN, befehl: ADMIN_BEFEHLE.UNENDLICH_MUNITION });
  assert.equal(spieler.unendlichMunition, true);
  for (let i = 0; i < 8; i++) klick(welt, spieler);
  assert.equal(spieler.inventar[slotVon(spieler, 'pistole')].magazin >= 3, true, 'Magazin leert sich nicht');
  assert.equal(spieler.nachladenRest, 0);
  aktion(welt, spieler, { art: AKTIONEN.ADMIN, befehl: ADMIN_BEFEHLE.UNENDLICH_MUNITION });
  assert.equal(spieler.unendlichMunition, false);

  const stunde = () => tageszeit(welt.zeit, welt.tageszeitDauer()).stunde;
  const vorher = stunde();
  const tagVorher = welt.tag;
  aktion(welt, spieler, { art: AKTIONEN.ADMIN, befehl: ADMIN_BEFEHLE.ZEIT_VORSTELLEN });
  assert.equal((stunde() - vorher + 24) % 24, 12, '+12 h');
  assert.ok(welt.tag >= tagVorher);
  spieler.admin = false;
  const z0 = welt.zeit;
  aktion(welt, spieler, { art: AKTIONEN.ADMIN, befehl: ADMIN_BEFEHLE.ZEIT_VORSTELLEN });
  assert.ok(Math.abs(welt.zeit - z0) < 1, 'ohne Admin-Recht passiert nichts');
});

test('Kofferraum: 10 Plätze, Items ablegen, bleibt im Welt-Spielstand, schließt beim Weggehen', () => {
  const { welt, spieler } = neueWelt();
  const auto = [...welt.alleVomTyp('fahrzeug')][0];
  assert.equal(auto.kofferraum.length, 10);
  spieler.x = auto.x;
  spieler.y = auto.y - auto.breite / 2 - 12;
  fuegeZumInventarHinzu(spieler, 'holz', 7);
  aktion(welt, spieler, { art: AKTIONEN.KOFFERRAUM });
  assert.equal(spieler.offeneKiste, `f${auto.id}`);
  const nachricht = welt.kistenNachrichten.find((k) => k.id === `f${auto.id}`);
  assert.equal(nachricht.inhalt.length, 10);
  aktion(welt, spieler, { art: AKTIONEN.KISTE_LEGEN, slot: slotVon(spieler, 'holz') });
  assert.equal(auto.kofferraum[0].defId, 'holz');
  assert.equal(auto.kofferraum[0].menge, 7);
  assert.equal(anzahl(spieler, 'holz'), 0);
  const stand = welt.weltzustand();
  assert.equal(stand.fahrzeuge[0].kofferraum[0].menge, 7);
  const neu = new SpielWelt(welt.konfiguration, { kartenDefinition: KARTE });
  assert.ok(neu.uebernimmWeltzustand(JSON.parse(JSON.stringify(stand))));
  assert.equal([...neu.alleVomTyp('fahrzeug')][0].kofferraum[0].menge, 7, 'Neustart behält den Inhalt');
  aktion(welt, spieler, { art: AKTIONEN.KISTE_NEHMEN, slot: 0 });
  assert.equal(anzahl(spieler, 'holz'), 7);
  spieler.x += 400;
  ticks(welt, 2);
  assert.equal(spieler.offeneKiste, null, 'zu beim Weggehen');
});

test('Auto überfährt Hasen: Hase ist weg, Fleisch liegt da, Auto bleibt heil', () => {
  const { welt } = neueWelt();
  const auto = [...welt.alleVomTyp('fahrzeug')][0];
  const hase = welt.hinzufuegen(erzeugeTier({ id: welt.neueId(), x: auto.x, y: auto.y, konfiguration: welt.konfiguration }));
  auto.tempo = 120;
  ticks(welt, 1);
  assert.equal(welt.holen(hase.id), undefined);
  assert.ok([...welt.alleVomTyp('gegenstand')].some((g) => g.defId === 'fleisch'));
  assert.equal(auto.leben, auto.maxLeben);
});

test('Angeln: Beute 50 % Fisch, 40 % Müll/Stoff/Schrott, 10 % Munition', () => {
  const { welt, spieler } = neueWelt({ angeln: { doppelChance: 0, wartenMin: 0.1, wartenMax: 0.1, bissMin: 3, bissMax: 3 } });
  assert.deepEqual(erstelleKonfiguration().angeln.beute, { fisch: 50, muell: 40, munition: 10 });
  fuegeZumInventarHinzu(spieler, 'angel', 1);
  spieler.ausgeruestet = spieler.inventar.findIndex((e) => e?.defId === 'angel'); // Runde 18: Angel muss in der Hand sein
  spieler.x = mitte(9);
  spieler.y = mitte(4);
  spieler.blick = 0;
  const stat = { fisch: 0, muell: 0, munition: 0 };
  const echt = welt.ereignis.bind(welt);
  welt.ereignis = (e) => {
    if (e.typ === 'gefangen') stat[e.kategorie]++;
    return echt(e);
  };
  const N = 400;
  for (let i = 0; i < N; i++) {
    spieler.inventar = spieler.inventar.map((e) => (e && e.defId !== 'angel' ? null : e)); // Inventar leeren, damit nie "voll"
    klick(welt, spieler);
    ticks(welt, 6);
    klick(welt, spieler);
    for (const g of [...welt.alleVomTyp('gegenstand')]) welt.entfernen(g.id);
  }
  const anteil = (k) => stat[k] / N;
  assert.ok(Math.abs(anteil('fisch') - 0.5) < 0.1, `Fisch ${anteil('fisch')}`);
  assert.ok(Math.abs(anteil('muell') - 0.4) < 0.1, `Müll ${anteil('muell')}`);
  assert.ok(Math.abs(anteil('munition') - 0.1) < 0.07, `Munition ${anteil('munition')}`);
  assert.equal(stat.fisch + stat.muell + stat.munition, N);
});

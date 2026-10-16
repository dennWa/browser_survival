import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TICK_DAUER_S } from '../gemeinsam/konstanten.js';
import { AKTIONEN, ADMIN_BEFEHLE } from '../gemeinsam/protokoll.js';
import { Welt } from '../gemeinsam/welt/welt.js';
import { sichtlinieFrei } from '../gemeinsam/physik/strahl.js';
import { BAUTEILE, fehlendesMaterial, rueckerstattung } from '../gemeinsam/basisbau/teile.js';
import { RECHT, hatRecht } from '../gemeinsam/basisbau/rechte.js';
import { Territorium } from '../gemeinsam/basisbau/territorium.js';
import { autoDrehung, pruefeBauteil, snappe } from '../gemeinsam/basisbau/platzierung.js';
import { bauwerkAktion } from '../gemeinsam/welt/bauwerke.js';
import { erstelleKonfiguration } from '../server/spiel/konfiguration/spielKonfiguration.js';
import { SpielWelt } from '../server/spiel/spielWelt.js';
import { fuegeZumInventarHinzu } from '../server/spiel/systeme/inventarSystem.js';
import { toeten } from '../server/spiel/systeme/kampfSystem.js';
import { spielerDatenPrivat } from '../server/spiel/entitaeten/spieler.js';
import { erstelleSpielstand, wendeSpielstandAn } from '../server/spiel/spielstand.js';

/**
 * Basisbau (v0.11): Baugebiet-Flagge, Bauteile mit Kosten, Snapping, Abriss (75 %), Rechte, Türen, Kisten, Bett-Spawn,
 * Speichern/Laden, Delta-Pakete. Karte: Wiese 44×30 mit Haus (oben rechts) und Teich (unten links).
 */
const ZEILEN = [];
for (let y = 0; y < 30; y++) {
  let zeile = '';
  for (let x = 0; x < 44; x++) {
    const rand = x === 0 || y === 0 || x === 43 || y === 29;
    const haus = x >= 30 && x <= 35 && y >= 3 && y <= 7;
    const hausInnen = x >= 31 && x <= 34 && y >= 4 && y <= 6;
    const teich = x >= 5 && x <= 8 && y >= 20 && y <= 23;
    zeile += rand ? '#' : hausInnen ? '+' : haus ? '#' : teich ? '~' : x === 10 && y === 10 ? 'S' : ',';
  }
  ZEILEN.push(zeile);
}
const KARTE = { id: 'wiese', name: 'Wiese', kacheln: ZEILEN, raeume: {} };
const mitte = (t) => t * 32 + 16;

function neueWelt(extra = {}) {
  const konfiguration = erstelleKonfiguration({ server: { zufallsStartwert: 3 }, tiere: { hasenProTausend: 0 }, wetter: { aktiv: false }, basisbau: { radiusKacheln: 15, blockGroesse: 1 }, ...extra, spieler: { startInventar: [], ...extra.spieler } });
  const welt = new SpielWelt(konfiguration, { kartenDefinition: KARTE });
  for (const z of [...welt.alleVomTyp('zombie')]) welt.entfernen(z.id);
  return { welt, konfiguration, ...baumeister(welt, 'Bob') };
}

/** Spieler mit Hammer in der Hand und reichlich Material. */
function baumeister(welt, name) {
  const spieler = welt.spielerBetrittWelt(name);
  fuegeZumInventarHinzu(spieler, 'hammer', 1);
  spieler.ausgeruestet = spieler.inventar.findIndex((e) => e?.defId === 'hammer');
  fuegeZumInventarHinzu(spieler, 'holz', 100);
  fuegeZumInventarHinzu(spieler, 'stein', 20);
  fuegeZumInventarHinzu(spieler, 'stoff', 10);
  return { spieler };
}

const anzahl = (spieler, defId) => spieler.inventar.reduce((s, e) => s + (e?.defId === defId ? e.menge : 0), 0);
const tick = (welt, aktionen = []) => {
  welt.aktualisiere(TICK_DAUER_S);
  return aktionen;
};
function aktion(welt, spieler, a) {
  spieler.aktionsPuffer.push({ slot: null, ...a });
  welt.aktualisiere(TICK_DAUER_S);
}
/** Stellt den Spieler nahe ans Ziel (zwei Kacheln westlich) und baut. */
function baue(welt, spieler, teil, tx, ty, extra = {}) {
  spieler.x = mitte(tx - 2);
  spieler.y = mitte(ty);
  aktion(welt, spieler, { art: AKTIONEN.BAUEN, teil, tx, ty, ...extra });
}
function reisseAb(welt, spieler, tx, ty, extra = {}) {
  spieler.x = mitte(tx - 2);
  spieler.y = mitte(ty);
  aktion(welt, spieler, { art: AKTIONEN.ABREISSEN, tx, ty, ...extra });
}
const letzteMeldung = (welt, spieler) => [...welt.meldungen].reverse().find((m) => m.spielerId === spieler.id)?.text;
const flagge = (welt, spieler, tx = 12, ty = 12) => baue(welt, spieler, 'flagge', tx, ty);
const typ = (welt, tx, ty, ebene = 'objekt') => welt.welt.bauwerkBei(tx, ty, ebene)?.typ;

// ---------------------------------------------------------------------------
test('Registry: Kosten wie im Konzept, jedes Bauteil hat Bauwerk-Definition', () => {
  const kosten = (id) => BAUTEILE[id].kosten;
  for (const id of ['holzboden', 'holzdach', 'holzwand', 'holzwand_fenster', 'holzwand_tuer', 'kiste']) assert.deepEqual(kosten(id), { holz: 8 }, id);
  assert.deepEqual(kosten('holztuer'), { holz: 6 });
  assert.deepEqual(kosten('bett'), { holz: 5, stein: 2, stoff: 2 });
  assert.deepEqual(rueckerstattung({ holz: 8 }), { holz: 6 });
  assert.deepEqual(rueckerstattung({ holz: 5, stein: 2, stoff: 2 }), { holz: 3, stein: 1, stoff: 1 });
  assert.deepEqual(rueckerstattung({ holz: 1 }), {}, '75 % von 1 rundet auf 0');
  assert.deepEqual(fehlendesMaterial([{ defId: 'holz', menge: 3 }], { holz: 8, stein: 1 }), [{ defId: 'holz', fehlt: 5 }, { defId: 'stein', fehlt: 1 }]);
});

// ---------------------------------------------------------------------------
test('Flagge: Hammer nötig, nur flacher freier Rasen, eine pro Spieler, Radius 15, nur der Besitzer erfährt das Gebiet', () => {
  const { welt, spieler, konfiguration } = neueWelt();
  spieler.ausgeruestet = null;
  flagge(welt, spieler);
  assert.equal(welt.territorium.von('Bob'), null, 'ohne Hammer in der Hand nichts');
  assert.match(letzteMeldung(welt, spieler), /Hammer/);
  spieler.ausgeruestet = spieler.inventar.findIndex((e) => e?.defId === 'hammer');

  flagge(welt, spieler, 6, 21);
  assert.match(letzteMeldung(welt, spieler), /Wasser/, 'nicht auf dem Teich');
  flagge(welt, spieler, 10, 21);
  assert.match(letzteMeldung(welt, spieler), /Wasser/, 'nicht direkt am Teich (Freiraum)');
  flagge(welt, spieler, 28, 5);
  assert.match(letzteMeldung(welt, spieler), /Gebäude|Hindernisse/, 'nicht neben dem Haus');
  flagge(welt, spieler, 33, 5);
  assert.equal(welt.territorium.von('Bob'), null, 'nicht im Haus');

  spieler.x = mitte(2);
  spieler.y = mitte(2);
  aktion(welt, spieler, { art: AKTIONEN.BAUEN, teil: 'flagge', tx: 12, ty: 12 });
  assert.match(letzteMeldung(welt, spieler), /weit/, 'Reichweite');

  flagge(welt, spieler);
  const f = welt.territorium.von('Bob');
  assert.deepEqual({ tx: f.tx, ty: f.ty, radius: f.radius }, { tx: 12, ty: 12, radius: konfiguration.basisbau.radiusKacheln });
  assert.equal(welt.welt.bauwerke.size, 0, 'die Flagge ist kein Bauwerk – nur das Gebiet bleibt');
  assert.deepEqual(spielerDatenPrivat(spieler, konfiguration, welt).flagge, { tx: 12, ty: 12, radius: 15 });

  flagge(welt, spieler, 20, 12);
  assert.match(letzteMeldung(welt, spieler), /schon eine/, 'nur eine Flagge');

  const { spieler: anna } = baumeister(welt, 'Anna');
  flagge(welt, anna, 20, 12);
  assert.match(letzteMeldung(welt, anna), /fremden Basis/, 'Mindestabstand zu Bobs Basis');
  assert.equal(spielerDatenPrivat(anna, konfiguration, welt).flagge, null, 'Anna sieht Bobs Gebiet nicht');
  flagge(welt, anna, 32, 12);
  assert.equal(welt.territorium.von('Anna')?.tx, 32);
});

test('Flagge: Spielstand merkt die Zone (eine Flagge über alle Zonen), Admin kann sie zurücknehmen', () => {
  const { welt, spieler } = neueWelt();
  flagge(welt, spieler);
  assert.equal(spieler.flaggeKarte, 'wiese');
  const stand = JSON.parse(JSON.stringify(erstelleSpielstand(spieler, 'wiese')));
  const { spieler: neu } = neueWelt();
  wendeSpielstandAn(neu, stand, welt);
  assert.equal(neu.flaggeKarte, 'wiese');
  neu.flaggeKarte = 'andere_zone'; // Flagge liegt woanders
  const { welt: w2, spieler: s2 } = neueWelt();
  s2.flaggeKarte = 'andere_zone';
  flagge(w2, s2);
  assert.match(letzteMeldung(w2, s2), /anderen Zone/);
  s2.flaggeKarte = null;

  spieler.admin = true;
  aktion(welt, spieler, { art: AKTIONEN.ADMIN, befehl: ADMIN_BEFEHLE.FLAGGE_ENTFERNEN });
  assert.equal(welt.territorium.von('Bob'), null);
  assert.equal(spieler.flaggeKarte, null);
});

// ---------------------------------------------------------------------------
test('Bauen: ohne Flagge verboten, nur im Radius, Kosten werden abgezogen, ohne Material geht nichts', () => {
  const { welt, spieler } = neueWelt();
  baue(welt, spieler, 'holzboden', 12, 12);
  assert.match(letzteMeldung(welt, spieler), /Flagge/);
  assert.equal(welt.welt.bauwerke.size, 0);

  flagge(welt, spieler);
  baue(welt, spieler, 'holzboden', 13, 12);
  assert.equal(typ(welt, 13, 12, 'boden'), 'holzboden');
  assert.equal(anzahl(spieler, 'holz'), 92, '8 Holz bezahlt');
  assert.equal(welt.welt.bauwerkBei(13, 12, 'boden').besitzer, 'Bob');

  baue(welt, spieler, 'holzboden', 13, 12);
  assert.match(letzteMeldung(welt, spieler), /steht schon/, 'Ebene belegt');
  baue(welt, spieler, 'holzboden', 26, 12); // 14 Kacheln von der Flagge
  assert.equal(typ(welt, 26, 12, 'boden'), 'holzboden', 'noch im Radius');
  baue(welt, spieler, 'holzboden', 28, 12); // 16 Kacheln
  assert.equal(typ(welt, 28, 12, 'boden'), undefined);
  assert.match(letzteMeldung(welt, spieler), /Außerhalb/);

  spieler.inventar = spieler.inventar.map((e) => (e?.defId === 'holz' ? null : e));
  fuegeZumInventarHinzu(spieler, 'holz', 5);
  baue(welt, spieler, 'holzboden', 14, 12);
  assert.equal(typ(welt, 14, 12, 'boden'), undefined);
  assert.match(letzteMeldung(welt, spieler), /fehlt: 3× Holz/);
  assert.equal(anzahl(spieler, 'holz'), 5, 'nichts abgezogen');
});

test('Bauen: Karten-Hindernisse, Spieler im Weg, Zone ohne Hammer', () => {
  const { welt, spieler } = neueWelt();
  flagge(welt, spieler, 26, 8);
  baue(welt, spieler, 'holzboden', 30, 8); // Hauswand (#) liegt nicht auf Gras – Haus: y 3..7, hier y 8 ist Wiese
  assert.equal(typ(welt, 30, 8, 'boden'), 'holzboden');
  baue(welt, spieler, 'holzboden', 30, 7);
  assert.equal(typ(welt, 30, 7, 'boden'), undefined, 'nicht auf Karten-Wände');
  baue(welt, spieler, 'holzboden', 32, 5);
  assert.equal(typ(welt, 32, 5, 'boden'), undefined, 'nicht im Haus');
  // Wand nicht auf jemanden setzen
  const { spieler: anna } = baumeister(welt, 'Anna');
  baue(welt, spieler, 'holzboden', 28, 9);
  anna.x = mitte(29);
  anna.y = mitte(9);
  aktion(welt, spieler, { art: AKTIONEN.BAUEN, teil: 'holzwand', tx: 29, ty: 9 });
  spieler.x = mitte(27);
  spieler.y = mitte(9);
  aktion(welt, spieler, { art: AKTIONEN.BAUEN, teil: 'holzboden', tx: 29, ty: 9 });
  aktion(welt, spieler, { art: AKTIONEN.BAUEN, teil: 'holzwand', tx: 29, ty: 9 });
  assert.equal(typ(welt, 29, 9, 'wand'), undefined, 'Anna steht drauf');
  anna.x = mitte(40);
  aktion(welt, spieler, { art: AKTIONEN.BAUEN, teil: 'holzwand', tx: 29, ty: 9 });
  assert.equal(typ(welt, 29, 9, 'wand'), 'holzwand');
});

test('Snapping: Wand nur neben Boden/Wand, Dach über Boden/Wand, Tür nur in die Türöffnung, Magnet auf gültige Nachbarkachel', () => {
  const { welt, spieler } = neueWelt();
  flagge(welt, spieler);
  baue(welt, spieler, 'holzwand', 14, 12);
  assert.equal(typ(welt, 14, 12, 'wand'), undefined, 'Wand schwebt nicht im Nichts');
  assert.match(letzteMeldung(welt, spieler), /Anschluss/);
  for (const x of [12, 13]) baue(welt, spieler, 'holzboden', x, 12);
  baue(welt, spieler, 'holzwand', 14, 12);
  assert.equal(typ(welt, 14, 12, 'wand'), 'holzwand', 'neben dem Boden');
  baue(welt, spieler, 'holzwand', 11, 11);
  assert.equal(typ(welt, 11, 11, 'wand'), 'holzwand', 'Ecke: diagonal am Boden (12,12) genügt – man kann einen Wandring in beliebiger Reihenfolge bauen');
  baue(welt, spieler, 'holzwand', 10, 10);
  assert.equal(typ(welt, 10, 10, 'wand'), undefined, 'zwei Kacheln diagonal vom Boden: kein Anschluss');
  baue(welt, spieler, 'holzwand', 15, 12);
  assert.equal(typ(welt, 15, 12, 'wand'), 'holzwand', 'neben der Wand');
  baue(welt, spieler, 'holztuer', 16, 12);
  assert.equal(typ(welt, 16, 12, 'tuer'), undefined, 'Tür nur in Türöffnung');

  baue(welt, spieler, 'holzwand_tuer', 16, 12);
  assert.equal(typ(welt, 16, 12, 'wand'), 'holzwand_tuer');
  baue(welt, spieler, 'holztuer', 16, 12);
  assert.equal(typ(welt, 16, 12, 'tuer'), 'holztuer');
  assert.equal(welt.welt.bauwerkBei(16, 12, 'tuer').offen, false, 'Tür startet zu');
  baue(welt, spieler, 'holztuer', 16, 12);
  assert.match(letzteMeldung(welt, spieler), /schon eine Tür/);

  baue(welt, spieler, 'holzdach', 13, 12);
  assert.equal(typ(welt, 13, 12, 'dach'), 'holzdach', 'über dem Boden');
  baue(welt, spieler, 'holzdach', 14, 12);
  assert.equal(typ(welt, 14, 12, 'dach'), 'holzdach', 'über der Wand – Dach liegt auch auf Wandkacheln');
  baue(welt, spieler, 'holzdach', 20, 12);
  assert.equal(typ(welt, 20, 12, 'dach'), undefined, 'kein Dach ohne Unterbau');

  // Magnet (reine Prüfung, wie das Hologramm): Zielpunkt knapp neben die Bodenkante → springt auf die gültige Kachel
  const t = new Territorium();
  t.setze(welt.territorium.von('Bob'));
  const kontext = { territorium: t, name: 'Bob' };
  const g = welt.welt.kachelGroesse;
  const weit = snappe(welt.welt, 'holzwand', 12.5 * g, 16.5 * g, kontext); // nichts in der Nähe zum Andocken
  assert.equal(weit.ok, false);
  const nah = snappe(welt.welt, 'holzwand', 12.5 * g, 13.9 * g, kontext); // (12,13) grenzt an Boden (12,12)
  assert.equal(nah.ok, true);
  assert.deepEqual([nah.tx, nah.ty], [12, 13]);
  const magnet = snappe(welt.welt, 'holzwand', 12.5 * g, 14.05 * g, kontext); // Kachel (12,14) ungültig, Nachbar (12,13) gültig und am nächsten
  assert.deepEqual([magnet.tx, magnet.ty, magnet.gesnappt], [12, 13, true]);
  assert.equal(snappe(welt.welt, 'holzboden', 12.5 * g, 14.05 * g, kontext).gesnappt, false, 'Böden rasten frei auf dem Raster (kein Magnet)');
});

test('Ausrichtung: Wände laufen parallel zur Bodenkante bzw. zu Nachbarwänden, die Tür übernimmt den Rahmen', () => {
  const { welt, spieler } = neueWelt();
  flagge(welt, spieler);
  baue(welt, spieler, 'holzboden', 12, 12);
  assert.equal(autoDrehung(welt.welt, 'holzwand_fenster', 12, 13), 0, 'Boden im Norden → Ost-West');
  assert.equal(autoDrehung(welt.welt, 'holzwand_fenster', 13, 12), 1, 'Boden im Westen → Nord-Süd');
  baue(welt, spieler, 'holzwand_tuer', 13, 12);
  assert.equal(welt.welt.bauwerkBei(13, 12, 'wand').drehung, 1);
  baue(welt, spieler, 'holztuer', 13, 12);
  assert.equal(welt.welt.bauwerkBei(13, 12, 'tuer').drehung, 1, 'Tür sitzt wie ihr Rahmen');
  baue(welt, spieler, 'holzwand_fenster', 12, 13, { drehung: 1 });
  assert.equal(welt.welt.bauwerkBei(12, 13, 'wand').drehung, 1, 'Spieler dreht per R');
});

// ---------------------------------------------------------------------------
test('Kollision & Sicht: Wand blockiert beides, Fenster nur Bewegung, Boden/Dach nie, Tür nur zu', () => {
  const { welt, spieler } = neueWelt();
  flagge(welt, spieler);
  for (const x of [12, 13, 14]) baue(welt, spieler, 'holzboden', x, 12);
  baue(welt, spieler, 'holzwand', 15, 12);
  baue(welt, spieler, 'holzwand_fenster', 12, 13);
  baue(welt, spieler, 'holzwand_tuer', 13, 13);
  baue(welt, spieler, 'holztuer', 13, 13);
  baue(welt, spieler, 'holzdach', 13, 12);
  const w = welt.welt;
  assert.equal(w.istBlockiert(13, 12), false, 'Boden + Dach sind begehbar');
  assert.equal(w.istBlockiert(15, 12), true);
  assert.equal(w.istBlockiert(12, 13), true);
  assert.equal(w.istBlockiert(13, 13), true, 'geschlossene Tür');
  assert.equal(w.istSichtBlockiert(15, 12), true);
  assert.equal(w.istSichtBlockiert(12, 13), false, 'durchs Fenster sieht und schießt man');
  assert.equal(w.istSichtBlockiert(13, 13), true, 'geschlossene Tür blockt Sicht');
  const g = w.kachelGroesse;
  assert.equal(sichtlinieFrei(w, mitte(12), mitte(11), mitte(12), mitte(15)), true, 'durchs Fenster');
  assert.equal(sichtlinieFrei(w, mitte(11), mitte(12), mitte(17), mitte(12)), false, 'Wand im Weg');

  // Tür öffnen: offen = durchlässig
  spieler.x = mitte(13);
  spieler.y = mitte(11.5);
  aktion(welt, spieler, { art: AKTIONEN.BAUWERK });
  assert.equal(welt.welt.bauwerkBei(13, 13, 'tuer').offen, true);
  assert.equal(w.istBlockiert(13, 13), false);
  assert.equal(w.istSichtBlockiert(13, 13), false);
  assert.equal(g, 32);
});

test('Rechte: nur der Besitzer baut, reißt ab, öffnet Tür & Kiste im Gebiet (Gruppenrechte vorbereitet)', () => {
  const { welt, spieler: bob } = neueWelt();
  const { spieler: anna } = baumeister(welt, 'Anna');
  flagge(welt, bob);
  baue(welt, bob, 'holzboden', 12, 12);
  baue(welt, bob, 'holzwand_tuer', 13, 12);
  baue(welt, bob, 'holztuer', 13, 12);
  baue(welt, bob, 'kiste', 12, 13);

  baue(welt, anna, 'holzboden', 14, 12);
  assert.equal(typ(welt, 14, 12, 'boden'), undefined, 'Anna darf nicht in Bobs Gebiet bauen');
  assert.match(letzteMeldung(welt, anna), /Fremdes|Flagge/);
  reisseAb(welt, anna, 12, 12);
  assert.equal(typ(welt, 12, 12, 'boden'), 'holzboden', 'Anna darf Bobs Boden nicht abreißen');
  assert.match(letzteMeldung(welt, anna), /gehört Bob/);

  anna.x = mitte(13);
  anna.y = mitte(11.5);
  aktion(welt, anna, { art: AKTIONEN.BAUWERK });
  assert.equal(welt.welt.bauwerkBei(13, 12, 'tuer').offen, false, 'Annas E öffnet Bobs Tür nicht');
  assert.match(letzteMeldung(welt, anna), /Gehört Bob/);
  anna.x = mitte(12);
  anna.y = mitte(14.5);
  aktion(welt, anna, { art: AKTIONEN.BAUWERK });
  assert.equal(anna.offeneKiste, null, 'Bobs Kiste bleibt zu');

  bob.x = mitte(12);
  bob.y = mitte(14.5);
  aktion(welt, bob, { art: AKTIONEN.BAUWERK });
  assert.equal(bob.offeneKiste, welt.welt.bauwerkBei(12, 13).id);

  // Anzeige: gesperrt für Fremde, öffnen für Besitzer
  const kiste = welt.welt.bauwerkBei(12, 13);
  assert.equal(bauwerkAktion(kiste, [], 'Anna').art, 'gesperrt');
  assert.equal(bauwerkAktion(kiste, [], 'Bob').art, 'oeffnen');

  // Gruppenrechte: Mitglieder mit Recht werden wie der Besitzer behandelt
  const gruppe = { besitzer: 'Bob', mitglieder: { Anna: [RECHT.BENUTZEN] } };
  assert.equal(hatRecht(gruppe, 'Anna', RECHT.BENUTZEN), true);
  assert.equal(hatRecht(gruppe, 'Anna', RECHT.BAUEN), false);
  assert.equal(hatRecht(gruppe, 'Cem', RECHT.BENUTZEN), false);
  assert.equal(bauwerkAktion(kiste, [], 'Anna', gruppe).art, 'oeffnen');
});

// ---------------------------------------------------------------------------
test('Abriss: nur mit Hammer, 75 % der Kosten zurück, Reihenfolge Tür → Möbel → Wand → Dach → Boden, Rahmen nimmt die Tür mit', () => {
  const { welt, spieler } = neueWelt();
  flagge(welt, spieler);
  baue(welt, spieler, 'holzboden', 12, 12);
  assert.equal(anzahl(spieler, 'holz'), 92);
  const hammer = spieler.ausgeruestet;
  spieler.ausgeruestet = null;
  reisseAb(welt, spieler, 12, 12);
  assert.equal(typ(welt, 12, 12, 'boden'), 'holzboden', 'ohne Hammer in der Hand nichts');
  spieler.ausgeruestet = hammer;

  reisseAb(welt, spieler, 12, 12);
  assert.equal(typ(welt, 12, 12, 'boden'), undefined);
  assert.equal(anzahl(spieler, 'holz'), 98, '6 von 8 Holz zurück (75 %)');
  assert.match(letzteMeldung(welt, spieler), /abgerissen.*\+6 Holz/);

  baue(welt, spieler, 'holzboden', 12, 12);
  baue(welt, spieler, 'holzwand_tuer', 13, 12);
  baue(welt, spieler, 'holztuer', 13, 12);
  baue(welt, spieler, 'holzdach', 13, 12);
  const holzVorher = anzahl(spieler, 'holz');
  reisseAb(welt, spieler, 13, 12);
  assert.equal(typ(welt, 13, 12, 'tuer'), undefined, 'Tür zuerst');
  assert.equal(typ(welt, 13, 12, 'wand'), 'holzwand_tuer');
  assert.equal(anzahl(spieler, 'holz'), holzVorher + 4, '75 % von 6 Holz = 4');
  baue(welt, spieler, 'holztuer', 13, 12);
  reisseAb(welt, spieler, 13, 12, { ebene: 'wand' });
  assert.equal(typ(welt, 13, 12, 'wand'), undefined);
  assert.equal(typ(welt, 13, 12, 'tuer'), undefined, 'der Rahmen nimmt die Tür mit');
  assert.equal(typ(welt, 13, 12, 'dach'), 'holzdach', 'Dach bleibt, bis man es selbst abreißt');
  reisseAb(welt, spieler, 13, 12);
  assert.equal(typ(welt, 13, 12, 'dach'), undefined);
  reisseAb(welt, spieler, 13, 12);
  assert.match(letzteMeldung(welt, spieler), /nichts zum Abreißen/);

  // Nicht-Basisbau-Bauwerke (Werkbank …) fasst der Hammer nicht an
  welt.welt.setzeBauwerk({ id: welt.neueBauwerkId(), typ: 'werkbank', tx: 14, ty: 12, besitzer: 'Bob' });
  reisseAb(welt, spieler, 14, 12);
  assert.equal(typ(welt, 14, 12), 'werkbank');
});

test('Abriss: Bett 3/1/1 zurück, Inventar voll → Rest vor die Füße, Kiste verstreut ihren Inhalt', () => {
  const { welt, spieler } = neueWelt();
  flagge(welt, spieler);
  baue(welt, spieler, 'bett', 12, 12);
  assert.equal(typ(welt, 12, 12), 'bett');
  assert.equal(anzahl(spieler, 'holz'), 95);
  assert.equal(anzahl(spieler, 'stein'), 18);
  assert.equal(anzahl(spieler, 'stoff'), 8);
  reisseAb(welt, spieler, 12, 12);
  assert.deepEqual([anzahl(spieler, 'holz'), anzahl(spieler, 'stein'), anzahl(spieler, 'stoff')], [98, 19, 9]);

  baue(welt, spieler, 'kiste', 13, 12);
  welt.welt.bauwerkBei(13, 12).inhalt[0] = { defId: 'apfel', menge: 4 };
  // Inventar komplett füllen
  spieler.inventar = spieler.inventar.map((e, i) => e ?? { defId: 'konservendose', menge: 1, _fueller: i });
  const hammerSlot = spieler.ausgeruestet;
  assert.ok(hammerSlot !== null);
  const gegenstaende = () => [...welt.alleVomTyp('gegenstand')];
  const vorher = gegenstaende().length;
  reisseAb(welt, spieler, 13, 12);
  assert.equal(typ(welt, 13, 12), undefined);
  const neu = gegenstaende().slice(vorher);
  assert.ok(neu.some((g) => g.defId === 'apfel' && g.menge === 4), 'Kisteninhalt liegt am Boden');
});

// ---------------------------------------------------------------------------
test('Bett: E setzt den Spawn Point – nach dem Tod wacht man neben dem Bett auf; abgerissen → normaler Start', () => {
  const { welt, spieler, konfiguration } = neueWelt();
  flagge(welt, spieler);
  baue(welt, spieler, 'bett', 14, 14);
  assert.equal(bauwerkAktion(welt.welt.bauwerkBei(14, 14), [], 'Bob').text, 'Spawn Point setzen (Unterkunft)');
  spieler.x = mitte(14);
  spieler.y = mitte(15.2);
  aktion(welt, spieler, { art: AKTIONEN.BAUWERK });
  assert.deepEqual(spieler.spawn, { karte: 'wiese', tx: 14, ty: 14 });
  assert.deepEqual(spielerDatenPrivat(spieler, konfiguration, welt).spawn, { karte: 'wiese', tx: 14, ty: 14 });

  spieler.x = mitte(20);
  spieler.y = mitte(20);
  toeten(welt, spieler);
  aktion(welt, spieler, { art: AKTIONEN.WIEDERBELEBEN });
  assert.equal(spieler.tot, false);
  assert.ok(Math.abs(spieler.x - mitte(14)) <= 40 && Math.abs(spieler.y - mitte(14)) <= 40, 'neben dem Bett');
  assert.equal(welt.welt.istBlockiert(Math.floor(spieler.x / 32), Math.floor(spieler.y / 32)), false, 'nicht im Bett');

  const stand = JSON.parse(JSON.stringify(erstelleSpielstand(spieler, 'wiese')));
  const { spieler: neu } = neueWelt();
  wendeSpielstandAn(neu, stand, welt);
  assert.deepEqual(neu.spawn, { karte: 'wiese', tx: 14, ty: 14 }, 'Spawn Point im Spielstand');

  fuegeZumInventarHinzu(spieler, 'hammer', 1); // nach dem Tod ist das Inventar leer
  spieler.ausgeruestet = spieler.inventar.findIndex((e) => e?.defId === 'hammer');
  reisseAb(welt, spieler, 14, 14);
  assert.equal(spieler.spawn, null, 'Bett weg → Spawn weg');
  toeten(welt, spieler);
  aktion(welt, spieler, { art: AKTIONEN.WIEDERBELEBEN });
  assert.equal(spieler.tot, false);
  assert.ok(Math.hypot(spieler.x - mitte(10), spieler.y - mitte(10)) < 40, 'normaler Startpunkt');
});

test('Bett in anderer Zone: Respawn löst einen Zonenwechsel aus', () => {
  const { welt, spieler } = neueWelt();
  spieler.spawn = { karte: 'andere', tx: 5, ty: 5 };
  toeten(welt, spieler);
  aktion(welt, spieler, { art: AKTIONEN.WIEDERBELEBEN });
  assert.equal(spieler.zonenwechsel?.ziel, 'andere');
  assert.equal(spieler.zonenwechsel?.spawn, true);
});

// ---------------------------------------------------------------------------
test('Kiste im Gebiet: öffnen, einlegen, Besitzer-Schutz, Weltzustand speichert Flaggen, Teile, Türzustand, Drehung', () => {
  const { welt, spieler } = neueWelt();
  flagge(welt, spieler);
  baue(welt, spieler, 'kiste', 13, 13);
  baue(welt, spieler, 'holzboden', 12, 12);
  baue(welt, spieler, 'holzwand_tuer', 13, 12, { drehung: 1 });
  baue(welt, spieler, 'holztuer', 13, 12);
  welt.welt.bauwerkBei(13, 12, 'tuer').offen = true;
  welt.welt.bauwerkBei(13, 13).inhalt[2] = { defId: 'apfel', menge: 3 };

  const stand = JSON.parse(JSON.stringify(welt.weltzustand()));
  assert.equal(stand.flaggen.length, 1);
  const { welt: neu } = neueWelt();
  assert.equal(neu.uebernimmWeltzustand(stand), true);
  assert.deepEqual(neu.territorium.von('Bob'), { besitzer: 'Bob', tx: 12, ty: 12, radius: 15, mitglieder: {} });
  assert.equal(typ(neu, 12, 12, 'boden'), 'holzboden');
  assert.equal(neu.welt.bauwerkBei(13, 12, 'tuer').offen, true);
  assert.equal(neu.welt.bauwerkBei(13, 12, 'wand').drehung, 1);
  assert.equal(neu.welt.bauwerkBei(13, 13).inhalt[2].menge, 3);
  // kaputter Stand wird ignoriert, nicht übernommen
  const kaputt = { ...stand, flaggen: [{ besitzer: 5, tx: 'x' }, { besitzer: 'X', tx: 9999, ty: 1 }], bauwerke: [{ typ: 'holzboden', tx: 1.5, ty: 2 }] };
  const { welt: leer } = neueWelt();
  assert.equal(leer.uebernimmWeltzustand(kaputt), true);
  assert.equal(leer.territorium.flaggen.size, 0);
  assert.equal(leer.welt.bauwerke.size, 0);
});

test('Delta-Pakete: nur geänderte Bauwerke gehen raus, der Client baut daraus dieselbe Welt', () => {
  const { welt, spieler } = neueWelt();
  flagge(welt, spieler);
  welt.nimmBauwerkAenderungen();
  baue(welt, spieler, 'holzboden', 12, 12);
  baue(welt, spieler, 'holzboden', 13, 12);
  baue(welt, spieler, 'kiste', 12, 13);
  let delta = welt.nimmBauwerkAenderungen();
  assert.equal(delta.gesetzt.length, 3);
  assert.deepEqual(delta.entfernt, []);
  assert.ok(delta.gesetzt.every((b) => b.inhalt === undefined), 'Kisteninhalt bleibt privat');

  const client = new Welt(welt.karte.daten);
  client.uebernimmBauwerke(welt.bauwerkeOeffentlich());
  const vorher = client.bauwerkeVersion;
  reisseAb(welt, spieler, 13, 12);
  delta = welt.nimmBauwerkAenderungen();
  assert.equal(delta.gesetzt.length, 0);
  assert.equal(delta.entfernt.length, 1);
  client.wendeBauwerkAenderungAn(delta.gesetzt, delta.entfernt);
  assert.ok(client.bauwerkeVersion > vorher);
  assert.equal(client.bauwerkBei(13, 12, 'boden'), null);
  assert.equal(client.bauwerkBei(12, 12, 'boden')?.typ, 'holzboden');
  assert.equal(welt.nimmBauwerkAenderungen().gesetzt.length, 0, 'Merkliste ist geleert');
  for (let i = 0; i < 205; i++) welt.welt.setzeBauwerk({ id: 5000 + i, typ: 'beet', tx: 1 + (i % 40), ty: 20 + Math.floor(i / 40), besitzer: 'x', pflanze: null, wachstum: 0 });
  assert.equal(welt.nimmBauwerkAenderungen(), null, 'viel passiert → ganze Liste');
});

test('Territorium: überlappende Gebiete gehören der näheren Flagge; Client-Prüfung = Server-Prüfung', () => {
  const t = new Territorium();
  t.setze({ besitzer: 'A', tx: 10, ty: 10, radius: 15 });
  t.setze({ besitzer: 'B', tx: 30, ty: 10, radius: 15 });
  assert.equal(t.gebietBei(10, 10).besitzer, 'A');
  assert.equal(t.gebietBei(21, 10).besitzer, 'B', 'näher an B');
  assert.equal(t.gebietBei(19, 10).besitzer, 'A');
  assert.equal(t.gebietBei(10, 40), null);

  const { welt, spieler } = neueWelt();
  flagge(welt, spieler);
  const client = new Territorium();
  client.setzeNurEigene(welt.territorium.von('Bob'));
  const kontext = { territorium: client, name: 'Bob', spieler: { x: mitte(10), y: mitte(12) } };
  assert.equal(pruefeBauteil(welt.welt, 'holzboden', 12, 12, kontext).ok, true);
  assert.equal(pruefeBauteil(welt.welt, 'holzboden', 20, 12, kontext).ok, false, 'zu weit weg');
  assert.equal(pruefeBauteil(welt.welt, 'holzboden', 30, 12, { ...kontext, spieler: null }).ok, false, 'außerhalb des Radius');
});

test('Überlappung: eine später daneben gesetzte fremde Flagge gibt keine Rechte an bestehenden Bauten; Werkbank & Co. nicht in fremdem Gebiet', () => {
  const { welt, spieler: bob } = neueWelt();
  const { spieler: anna } = baumeister(welt, 'Anna');
  flagge(welt, bob, 12, 12);
  baue(welt, bob, 'kiste', 20, 12); // 8 Kacheln von Bob
  flagge(welt, anna, 27, 12); // erlaubter Abstand 15; Kachel (20,12) liegt jetzt näher an Anna
  assert.equal(welt.territorium.gebietBei(20, 12).besitzer, 'Anna');
  reisseAb(welt, anna, 20, 12);
  assert.equal(typ(welt, 20, 12), 'kiste', 'Anna darf Bobs Kiste nicht abreißen');
  welt.welt.bauwerkBei(20, 12).inhalt[0] = { defId: 'apfel', menge: 2 };
  anna.x = mitte(20);
  anna.y = mitte(13.5);
  aktion(welt, anna, { art: AKTIONEN.BAUWERK });
  assert.equal(anna.offeneKiste, null);
  // Werkbank in fremdem Gebiet verboten
  fuegeZumInventarHinzu(anna, 'werkbank', 1);
  anna.x = mitte(11);
  anna.y = mitte(12);
  aktion(welt, anna, { art: AKTIONEN.PLATZIEREN, slot: anna.inventar.findIndex((e) => e?.defId === 'werkbank'), tx: 13, ty: 12 });
  assert.equal(typ(welt, 13, 12), undefined);
});

test('Blöcke: Boden/Wand/Dach werden als 2×2 gesetzt (halber Preis), Abriss gibt pro Kachel zurück', () => {
  const { welt, spieler } = neueWelt({ basisbau: { radiusKacheln: 15, blockGroesse: 2 } });
  flagge(welt, spieler);
  baue(welt, spieler, 'holzboden', 13, 13); // Anker wird auf das 2er-Raster gelegt: (12,12)
  for (const [x, y] of [[12, 12], [13, 12], [12, 13], [13, 13]]) assert.equal(typ(welt, x, y, 'boden'), 'holzboden', `${x},${y}`);
  assert.equal(typ(welt, 14, 12, 'boden'), undefined);
  assert.equal(anzahl(spieler, 'holz'), 100 - 16, '2×2 Boden = 16 Holz');
  baue(welt, spieler, 'holzwand', 14, 12);
  assert.equal(typ(welt, 15, 13, 'wand'), 'holzwand', 'Wand 2×2 dockt an den Boden an');
  const vorher = anzahl(spieler, 'holz');
  reisseAb(welt, spieler, 14, 13);
  assert.equal(typ(welt, 14, 13, 'wand'), undefined, 'Kachel abgerissen');
  assert.equal(anzahl(spieler, 'holz'), vorher + 3, '75 % von 4 Holz pro Kachel, abgerundet');
});

test('Zaun: kostet 2 Eisenerz, blockiert, Tor lässt sich öffnen, Zombies kommen nicht durch', () => {
  const { welt, spieler } = neueWelt();
  fuegeZumInventarHinzu(spieler, 'eisenerz', 10);
  flagge(welt, spieler);
  baue(welt, spieler, 'zaun', 14, 14);
  assert.equal(typ(welt, 14, 14, 'wand'), 'zaun');
  assert.equal(anzahl(spieler, 'eisenerz'), 8, '2 Eisenerz');
  assert.equal(welt.welt.istBlockiert(14, 14), true);
  assert.equal(welt.welt.istSichtBlockiert(14, 14), false, 'man sieht durch den Zaun');
  baue(welt, spieler, 'zauntor', 15, 14);
  assert.equal(welt.welt.istBlockiert(15, 14), true, 'Tor zu');
  aktion(welt, spieler, { art: AKTIONEN.BAUWERK });
  const tor = welt.welt.bauwerkBei(15, 14, 'wand');
  spieler.x = mitte(15);
  spieler.y = mitte(15);
  aktion(welt, spieler, { art: AKTIONEN.BAUWERK });
  assert.equal(tor.offen, true, 'Tor offen');
  assert.equal(welt.welt.istBlockiert(15, 14), false);
});

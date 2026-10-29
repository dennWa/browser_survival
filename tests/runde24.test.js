import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TICK_DAUER_S } from '../gemeinsam/konstanten.js';
import { erstelleKonfiguration } from '../server/spiel/konfiguration/spielKonfiguration.js';
import { SpielWelt } from '../server/spiel/spielWelt.js';
import { setzeWetter } from '../server/spiel/systeme/wetterSystem.js';

/** Runde 24 (KONZEPT_RUNDE24.md): Wind, Progression, Waffen, Cozy, Überleben, Multiplayer. */
export const KARTE = {
  id: 'runde24',
  name: 'Runde 24',
  kacheln: [
    '##############################',
    '#S,,,,,,,,,,,,,,,,,,,,,,,,,,,#',
    '#,,,,,,,,,,,,,,,,,,,,,,,,,,,,#',
    '#,,,,,,,,,,,,,,,,,,,,,,,,,,,,#',
    '#,,,,,,,,,,,,,,,,,,,,,,,,,,,,#',
    '#,,,,,,,,,,,,,,,,,,,,,,,,,,,,#',
    '#,,,,,,,,,,,,,,,,,,,,,,,,,,,,#',
    '#,,,,,,,,,,,,,,,,,,,,,,,,,,,,#',
    '##############################',
  ],
  raeume: {},
  objekte: [{ typ: 'baum', x: 20, y: 6, b: 1, h: 1 }],
};
export const mitte = (t) => t * 32 + 16;

export function neueWelt(extra = {}) {
  const konfiguration = erstelleKonfiguration({ server: { zufallsStartwert: 5 }, tiere: { hasenProTausend: 0 }, wetter: { aktiv: false }, ...extra, spieler: { startInventar: [], ...extra.spieler } });
  const welt = new SpielWelt(konfiguration, { kartenDefinition: KARTE });
  for (const z of [...welt.alleVomTyp('zombie')]) welt.entfernen(z.id);
  const spieler = welt.spielerBetrittWelt('Tester');
  spieler.gottmodus = true;
  return { welt, spieler, konfiguration };
}
export const ticks = (welt, n) => {
  for (let i = 0; i < n; i++) welt.aktualisiere(TICK_DAUER_S);
};

test('P1 Wind: Grundwind wechselt zwischen ruhig und stark, geht in den Schnappschuss, Wetter setzt Grenzen', () => {
  const { welt } = neueWelt({ wetter: { aktiv: true, windMin: 2, windMax: 4, windTempo: 0.5 } });
  setzeWetter(welt, 'klar', 9999);
  const gesehen = new Set();
  for (let i = 0; i < 30 * 120; i++) {
    welt.aktualisiere(TICK_DAUER_S);
    if (i % 30 === 0) gesehen.add(Math.round(welt.wetter.wind * 10));
  }
  assert.ok(Math.min(...gesehen) <= 2 && Math.max(...gesehen) >= 6, `Windspanne ${[...gesehen]}`);
  const s = welt.schnappschuss();
  assert.ok(Number.isFinite(s.wind) && s.wind >= 0 && s.wind <= 1);
  setzeWetter(welt, 'sturm', 9999);
  ticks(welt, 30 * 3);
  assert.ok(welt.wetter.wind > 0.95, 'Sturm = voller Wind');
  setzeWetter(welt, 'nebel', 9999);
  ticks(welt, 30 * 3);
  assert.ok(welt.wetter.wind <= 0.12 + 1e-9, 'Nebel = fast windstill');
});

// ---------------------------------------------------------------- Phase 2: Progression & Sonder-Zombies
import { erzeugeZombie, waehleZombieVariante } from '../server/spiel/entitaeten/zombie.js';
import { hordeFuer, schickeHorde } from '../server/spiel/systeme/tageszeitSystem.js';
import { fuegeSchadenZu } from '../server/spiel/systeme/kampfSystem.js';
import { Zufall } from '../server/spiel/zufall.js';

const zombie = (welt, variante, x, y) => {
  const z = erzeugeZombie({ id: welt.neueId(), x, y, konfiguration: welt.konfiguration, variante });
  welt.hinzufuegen(z);
  return z;
};

test('P2 Horde wächst mit den Tagen, Boss-Nacht und Blutmond', () => {
  const k = erstelleKonfiguration();
  const t1 = hordeFuer(k, 1);
  const t5 = hordeFuer(k, 5);
  const t30 = hordeFuer(k, 29);
  assert.equal(t1.anzahl, k.zombie.nachtHorde);
  assert.ok(t5.anzahl > t1.anzahl && t30.anzahl <= k.zombie.nachtHorde * k.horde.maxFaktor);
  assert.equal(hordeFuer(k, 7).art, 'boss');
  assert.ok(hordeFuer(k, 7).bosse >= 1);
  const blut = hordeFuer(k, 10);
  assert.equal(blut.art, 'blutmond');
  assert.ok(blut.anzahl >= 2 * Math.round(k.zombie.nachtHorde * (1 + k.horde.wachstumProTag * 9)) - 1);
  assert.equal(hordeFuer(k, 20).lebenFaktor, k.horde.staerkeFaktor);
});

test('P2 Sonder-Zombies erst ab ihrem Tag', () => {
  const k = erstelleKonfiguration();
  const zufall = new Zufall(7);
  const frueh = new Set(Array.from({ length: 400 }, () => waehleZombieVariante(zufall, k, 1)));
  const spaet = new Set(Array.from({ length: 800 }, () => waehleZombieVariante(zufall, k, 12)));
  for (const v of ['sprinter', 'spucker', 'gepanzert', 'explosiv']) {
    assert.ok(!frueh.has(v), `${v} nicht an Tag 1`);
    assert.ok(spaet.has(v), `${v} an Tag 12`);
  }
});

test('P2 Blutmond-Horde: doppelt, Nachtart im Schnappschuss', () => {
  const { welt } = neueWelt();
  welt.karte.zombieSpawns.push({ x: mitte(25), y: mitte(6) });
  welt.tag = 10;
  welt.istNacht = true;
  welt.nachtArt = 'blutmond';
  const n = schickeHorde(welt, hordeFuer(welt.konfiguration, 10));
  assert.ok(n >= welt.konfiguration.zombie.nachtHorde * 2);
  assert.equal(welt.schnappschuss().nachtArt, 'blutmond');
});

test('P2 Gepanzert schluckt Schaden, Explosion nicht', () => {
  const { welt, spieler } = neueWelt();
  const z = zombie(welt, 'gepanzert', mitte(20), mitte(3));
  fuegeSchadenZu(welt, z, 20, spieler, 0);
  assert.ok(Math.abs(z.maxLeben - z.leben - 20 * (1 - welt.konfiguration.zombie.varianten.gepanzert.panzer)) < 1e-6);
  const vorher = z.leben;
  fuegeSchadenZu(welt, z, 20, spieler, 0, { explosion: true });
  assert.equal(vorher - z.leben, 20);
});

test('P2 Spucker spuckt aus Abstand, Treffer nur wer stehen bleibt', () => {
  const { welt, spieler } = neueWelt();
  spieler.gottmodus = false;
  spieler.x = mitte(5);
  spieler.y = mitte(4);
  const z = zombie(welt, 'spucker', mitte(12), mitte(4));
  z.spuckRest = 0;
  z.zielId = spieler.id;
  const leben = spieler.leben;
  ticks(welt, 30 * 2);
  assert.ok(welt.spuckeFluege.length > 0 || spieler.leben < leben, 'hat gespuckt');
  assert.ok(spieler.leben < leben, 'stehen bleiben = getroffen');
  assert.ok(Math.hypot(z.x - spieler.x, z.y - spieler.y) > 100, 'hält Abstand');
  // Ausweichen: nach dem Abschuss weggehen
  spieler.leben = 100;
  welt.spuckeFluege.length = 0;
  z.spuckRest = 0;
  welt.aktualisiere(TICK_DAUER_S);
  assert.equal(welt.spuckeFluege.length, 1);
  spieler.x += 120;
  ticks(welt, 30);
  assert.equal(spieler.leben, 100, 'ausgewichen');
});

test('P2 Explosiv-Zombie sprengt Spielerwand und verletzt Umstehende', () => {
  const { welt, spieler } = neueWelt();
  spieler.gottmodus = false;
  // Wand quer über die Karte (x = 15) – der Spieler steht dahinter
  for (let ty = 1; ty <= 7; ty++) welt.welt.setzeBauwerk({ id: welt.neueBauwerkId(), typ: 'holzwand', tx: 15, ty, besitzer: 'Tester' });
  spieler.x = mitte(18);
  spieler.y = mitte(4);
  const z = zombie(welt, 'explosiv', mitte(12), mitte(4));
  z.zielId = spieler.id;
  z.zustand = 'verfolgend';
  let explodiert = false;
  for (let i = 0; i < 30 * 15 && !explodiert; i++) {
    welt.aktualisiere(TICK_DAUER_S);
    explodiert = welt.ereignisse.some((e) => e.typ === 'explosion');
  }
  assert.ok(explodiert, 'ist explodiert');
  assert.ok(!welt.holen(z.id), 'Zombie weg');
  const reste = [1, 2, 3, 4, 5, 6, 7].filter((ty) => welt.welt.bauwerkBei(15, ty, 'wand')).length;
  assert.ok(reste < 7, `Wand gesprengt (${reste}/7 übrig)`);
});

test('P2 Explosiv-Zombie platzt beim Tod', () => {
  const { welt, spieler } = neueWelt();
  spieler.gottmodus = false;
  spieler.x = mitte(5);
  spieler.y = mitte(4);
  const z = zombie(welt, 'explosiv', mitte(6), mitte(4));
  const leben = spieler.leben;
  fuegeSchadenZu(welt, z, 999, spieler, 0);
  assert.ok(welt.ereignisse.some((e) => e.typ === 'explosion'));
  assert.ok(spieler.leben < leben);
});

// ---------------------------------------------------------------- Phase 3+4: Waffen, Reparatur, Mods
import { AKTIONEN } from '../gemeinsam/protokoll.js';
import { GEGENSTAENDE, waffenWerte } from '../server/spiel/konfiguration/gegenstaende.js';
import { REZEPTE } from '../server/spiel/konfiguration/rezepte.js';
import { pruefeEintrag } from '../server/spiel/spielstand.js';
import { reparaturKostenFuer } from '../gemeinsam/spieler/reparatur.js';

const aktion = (welt, spieler, a) => {
  spieler.aktionsPuffer.push({ slot: null, ...a });
  welt.aktualisiere(TICK_DAUER_S);
};
const inDieHand = (welt, spieler, defId, extra = {}) => {
  spieler.inventar[0] = { defId, menge: 1, ...(GEGENSTAENDE[defId].kategorie === 'fernkampf' ? { magazin: GEGENSTAENDE[defId].magazin } : {}), ...extra };
  spieler.ausgeruestet = 0;
  spieler.ausruestung = GEGENSTAENDE[defId].ausruestung;
};
const schlage = (welt, spieler, blick = 0) => {
  spieler.blick = blick;
  spieler.angriffsAbklingzeit = 0;
  spieler.angriff = true;
  spieler.eingabePuffer.push({ seq: (spieler.letzteEmpfangeneSeq ?? 0) + 1, x: 0, y: 0, blick, angriff: true, sprint: false });
  welt.aktualisiere(TICK_DAUER_S);
  spieler.angriff = false;
};

test('P3 Neue Nahkampfwaffen + Rezepte existieren, Icons/Rezepte gültig', () => {
  for (const id of ['baseballschlaeger', 'brecheisen', 'speer', 'gewehr', 'bogen', 'armbrust', 'pfeil', 'bolzen', 'munition_gewehr', 'mod_zielfernrohr', 'mod_magazin', 'mod_schalldaempfer']) assert.ok(GEGENSTAENDE[id], id);
  for (const r of Object.values(REZEPTE)) for (const z of Object.keys(r.zutaten)) assert.ok(GEGENSTAENDE[z], `${r.name}: ${z}`);
});

test('P3 Schläger: Treffer kostet Haltbarkeit und stößt weiter zurück', () => {
  const { welt, spieler } = neueWelt();
  spieler.x = mitte(5);
  spieler.y = mitte(4);
  inDieHand(welt, spieler, 'baseballschlaeger');
  const z = zombie(welt, 'normal', spieler.x + 50, spieler.y);
  z.leben = z.maxLeben = 999;
  schlage(welt, spieler, 0);
  assert.ok(z.leben < 999, 'getroffen');
  assert.equal(spieler.inventar[0].haltbarkeit, GEGENSTAENDE.baseballschlaeger.haltbarkeit - 1);
  assert.ok(z.x - (spieler.x + 50) > welt.konfiguration.kampf.rueckstoss * 1.5, 'weit zurückgestoßen');
});

test('P3 Speer: lange Reichweite, aber schmaler Kegel', () => {
  const { welt, spieler } = neueWelt();
  spieler.x = mitte(5);
  spieler.y = mitte(4);
  inDieHand(welt, spieler, 'speer');
  const vorn = zombie(welt, 'normal', spieler.x + 110, spieler.y);
  const seitlich = zombie(welt, 'normal', spieler.x + 40, spieler.y + 45);
  vorn.leben = seitlich.leben = 999;
  schlage(welt, spieler, 0);
  assert.ok(vorn.leben < 999, 'vorn weit weg getroffen');
  assert.equal(seitlich.leben, 999, 'seitlich verfehlt');
});

test('P3 Brecheisen knackt Panzerung besser als Machete', () => {
  const k = erstelleKonfiguration();
  const panzer = k.zombie.varianten.gepanzert.panzer;
  const brecheisen = GEGENSTAENDE.brecheisen.schaden * (1 - panzer * (1 - GEGENSTAENDE.brecheisen.durchschlag));
  const machete = GEGENSTAENDE.machete.schaden * (1 - panzer);
  assert.ok(brecheisen > machete);
});

test('P3 Reparatur nur an der Werkbank, kostet Material, macht heil', () => {
  const { welt, spieler } = neueWelt();
  inDieHand(welt, spieler, 'baseballschlaeger', { haltbarkeit: 10 });
  spieler.inventar[1] = { defId: 'holz', menge: 5 };
  aktion(welt, spieler, { art: AKTIONEN.REPARIEREN, slot: 0 });
  assert.equal(spieler.inventar[0].haltbarkeit, 10, 'ohne Werkbank nicht');
  welt.welt.setzeBauwerk({ id: welt.neueBauwerkId(), typ: 'werkbank', tx: Math.floor(spieler.x / 32) + 1, ty: Math.floor(spieler.y / 32), besitzer: 'Tester' });
  aktion(welt, spieler, { art: AKTIONEN.REPARIEREN, slot: 0 });
  assert.equal(spieler.inventar[0].haltbarkeit, undefined, 'repariert = voll');
  assert.equal(spieler.inventar[1].menge, 5 - reparaturKostenFuer('baseballschlaeger', GEGENSTAENDE, REZEPTE).holz);
  assert.deepEqual(reparaturKostenFuer('axt', GEGENSTAENDE, REZEPTE), { holz: 2, stein: 1 }, 'ohne eigene Kosten: halbes Rezept');
});

test('P4 Bogen ist leise, Pistole laut', () => {
  for (const [waffe, munition, soll] of [['bogen', 'pfeil', 'ruhend'], ['pistole', 'munition_9mm', 'verfolgend']]) {
    const { welt, spieler } = neueWelt();
    spieler.x = mitte(3);
    spieler.y = mitte(4);
    inDieHand(welt, spieler, waffe);
    spieler.inventar[1] = { defId: munition, menge: 10 };
    const z = zombie(welt, 'normal', spieler.x + 330, spieler.y + 60);
    z.gefesselt = false;
    schlage(welt, spieler, Math.PI); // weg vom Zombie schießen
    assert.equal(z.zielId === spieler.id ? 'verfolgend' : 'ruhend', soll, waffe);
  }
});

test('P4 Pfeile lassen sich (oft) wieder einsammeln', () => {
  const { welt, spieler } = neueWelt();
  spieler.x = mitte(3);
  spieler.y = mitte(4);
  inDieHand(welt, spieler, 'bogen');
  spieler.inventar[1] = { defId: 'pfeil', menge: 20 };
  for (let i = 0; i < 12; i++) {
    spieler.inventar[0].magazin = 1;
    schlage(welt, spieler, 0);
  }
  const liegen = [...welt.alleVomTyp('gegenstand')].filter((g) => g.defId === 'pfeil').length;
  assert.ok(liegen >= 2 && liegen <= 11, `geborgen: ${liegen}`);
});

test('P4 Mods: anbringen (benutzen + ziehen), Werte, bleiben beim Ablegen/Speichern, abnehmen', () => {
  const { welt, spieler } = neueWelt();
  inDieHand(welt, spieler, 'gewehr');
  spieler.inventar[2] = { defId: 'mod_magazin', menge: 1 };
  spieler.inventar[3] = { defId: 'mod_zielfernrohr', menge: 1 };
  spieler.inventar[4] = { defId: 'mod_schalldaempfer', menge: 1 };
  aktion(welt, spieler, { art: AKTIONEN.BENUTZEN, slot: 2 });
  assert.deepEqual(spieler.inventar[0].mods, ['magazin']);
  assert.equal(spieler.inventar[2], null);
  aktion(welt, spieler, { art: AKTIONEN.TAUSCHEN, slot: 3, ziel: 0 });
  assert.deepEqual(spieler.inventar[0].mods, ['magazin', 'zielfernrohr']);
  const w = waffenWerte(spieler.inventar[0], GEGENSTAENDE.gewehr);
  assert.ok(w.magazin > GEGENSTAENDE.gewehr.magazin && w.reichweite > GEGENSTAENDE.gewehr.reichweite && w.streuung < GEGENSTAENDE.gewehr.streuung);
  // Schalldämpfer passt nicht an die Pistole? doch – an den Bogen nicht
  inDieHand(welt, spieler, 'bogen');
  aktion(welt, spieler, { art: AKTIONEN.BENUTZEN, slot: 4 });
  assert.ok(spieler.inventar[4], 'Schalldämpfer passt nicht an den Bogen');
  // Spielstand/Kiste behalten Aufsätze
  assert.deepEqual(pruefeEintrag({ defId: 'gewehr', menge: 1, magazin: 8, mods: ['magazin', 'quatsch'] }), { defId: 'gewehr', menge: 1, magazin: 8, mods: ['magazin'] });
  assert.equal(pruefeEintrag({ defId: 'gewehr', menge: 1, magazin: 8 }).magazin, GEGENSTAENDE.gewehr.magazin, 'ohne Magazin-Mod gekappt');
  // Ablegen + Aufheben
  spieler.inventar[5] = { defId: 'gewehr', menge: 1, magazin: 0, mods: ['zielfernrohr'] };
  aktion(welt, spieler, { art: AKTIONEN.ABLEGEN, slot: 5 });
  const boden = [...welt.alleVomTyp('gegenstand')].find((g) => g.defId === 'gewehr');
  assert.deepEqual(boden.mods, ['zielfernrohr']);
  boden.x = spieler.x;
  boden.y = spieler.y;
  aktion(welt, spieler, { art: AKTIONEN.AUFHEBEN });
  const zurueck = spieler.inventar.find((e) => e?.defId === 'gewehr' && e.mods);
  assert.deepEqual(zurueck?.mods, ['zielfernrohr']);
  // Abnehmen
  const slot = spieler.inventar.indexOf(zurueck);
  aktion(welt, spieler, { art: AKTIONEN.MODS_ABNEHMEN, slot });
  assert.equal(spieler.inventar[slot].mods, undefined);
  assert.ok(spieler.inventar.some((e) => e?.defId === 'mod_zielfernrohr'));
});

test('P3 Haltbarkeit bleibt beim Ablegen erhalten', () => {
  const { welt, spieler } = neueWelt();
  spieler.inventar[3] = { defId: 'speer', menge: 1, haltbarkeit: 7 };
  aktion(welt, spieler, { art: AKTIONEN.ABLEGEN, slot: 3 });
  const boden = [...welt.alleVomTyp('gegenstand')].find((g) => g.defId === 'speer');
  assert.equal(boden.haltbarkeit, 7);
});

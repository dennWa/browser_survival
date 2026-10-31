import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TICK_DAUER_S } from '../gemeinsam/konstanten.js';
import { erstelleKonfiguration } from '../server/spiel/konfiguration/spielKonfiguration.js';
import { SpielWelt } from '../server/spiel/spielWelt.js';
import { setzeWetter } from '../server/spiel/systeme/wetterSystem.js';

/** Runde 24 (archiv/runden/KONZEPT_RUNDE24.md): Wind, Progression, Waffen, Cozy, Überleben, Multiplayer. */
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
  spieler.zustand = null; // Treffer davor kann bluten (P11)
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
import { neuesBauwerk } from '../server/spiel/systeme/bauSystem.js';
import { kaelteRate } from '../server/spiel/systeme/ueberlebenSystem.js';

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

// ---------------------------------------------------------------- Phase 5+6: Sprengstoff, Fallen, Rüstung
test('P5 Rohrbombe: fliegt Richtung Maus, explodiert nach dem Zünder, verletzt Zombies', () => {
  const { welt, spieler } = neueWelt();
  spieler.x = mitte(3);
  spieler.y = mitte(4);
  inDieHand(welt, spieler, 'granate');
  spieler.zielAbstand = 200;
  const z = zombie(welt, 'normal', spieler.x + 200, spieler.y);
  z.leben = z.maxLeben = 500;
  schlage(welt, spieler, 0);
  assert.equal(spieler.inventar[0], null, 'verbraucht');
  assert.equal(welt.wuerfe.length, 1);
  ticks(welt, 30 * 3);
  assert.ok(z.leben < 500 - 40, `Explosion getroffen (${z.leben})`);
});

test('P5 Molotow: Brandfläche verletzt, was drin steht, und erlischt', () => {
  const { welt, spieler } = neueWelt();
  spieler.x = mitte(3);
  spieler.y = mitte(4);
  inDieHand(welt, spieler, 'molotow');
  spieler.zielAbstand = 220;
  const z = zombie(welt, 'normal', spieler.x + 220, spieler.y);
  z.gefesselt = true;
  z.leben = z.maxLeben = 500;
  schlage(welt, spieler, 0);
  ticks(welt, 30 * 4);
  assert.equal(welt.braende.length, 1);
  assert.ok(z.leben < 500 - 30, `brennt (${z.leben})`);
  ticks(welt, 30 * 8);
  assert.equal(welt.braende.length, 0, 'erloschen');
});

test('P5 Fallen: Sprengfalle, Stacheldraht, Fallgrube, Dosenalarm', () => {
  const { welt, spieler } = neueWelt();
  const setze = (typ, tx, ty) => {
    const b = neuesBauwerk(welt, typ, tx, ty, 'Tester');
    welt.welt.setzeBauwerk(b);
    return b;
  };
  // Sprengfalle
  setze('sprengfalle', 20, 2);
  const z1 = zombie(welt, 'normal', mitte(20), mitte(2));
  z1.gefesselt = true;
  welt.aktualisiere(TICK_DAUER_S);
  assert.ok(!welt.holen(z1.id) || z1.leben < z1.maxLeben, 'Sprengfalle trifft');
  assert.ok(!welt.welt.bauwerkBei(20, 2), 'Sprengfalle verbraucht');
  // Stacheldraht bremst + schadet
  const draht = setze('stacheldraht', 10, 6);
  const z2 = zombie(welt, 'normal', mitte(10), mitte(6));
  z2.gefesselt = true;
  ticks(welt, 30);
  assert.ok(z2.leben < z2.maxLeben && z2.bremse > 0, 'Draht verletzt & bremst');
  assert.ok(draht.rest < welt.konfiguration.fallen.drahtHaltbarkeit, 'nutzt sich ab');
  // Fallgrube hält fest
  setze('fallgrube', 25, 6);
  const z3 = zombie(welt, 'normal', mitte(25), mitte(6));
  welt.aktualisiere(TICK_DAUER_S);
  assert.ok(z3.gefangen > 0, 'steckt fest');
  const x = z3.x;
  ticks(welt, 30);
  assert.equal(z3.x, x, 'bewegt sich nicht');
  // Dosenalarm meldet dem Besitzer
  spieler.name = 'Tester';
  setze('dosenalarm', 5, 2);
  zombie(welt, 'normal', mitte(5) + 20, mitte(2)).gefesselt = true;
  welt.aktualisiere(TICK_DAUER_S);
  assert.ok(welt.ereignisse.some((e) => e.typ === 'dosenalarm'));
});

test('P6 Rüstung schluckt Schaden, Regenmantel hilft gegen Regen-Kälte', () => {
  const { welt, spieler } = neueWelt();
  spieler.gottmodus = false;
  spieler.kleidung = { kopf: 'helm', oberkoerper: 'schutzweste', haende: null, beine: null, fuesse: null };
  const z = zombie(welt, 'normal', spieler.x + 30, spieler.y);
  const leben = spieler.leben;
  fuegeSchadenZu(welt, spieler, 20, z, 0);
  assert.ok(Math.abs(leben - spieler.leben - 20 * (1 - 0.42)) < 1e-6, `Schutz 42 % (${leben - spieler.leben})`);
  welt.wetter.art = 'regen';
  const ohne = kaelteRate(welt, 0);
  const mit = kaelteRate(welt, 0.8);
  assert.ok(mit < ohne);
});

// ---------------------------------------------------------------- Phase 7+8: Cozy & Musik
import { BAUTEILE } from '../gemeinsam/basisbau/teile.js';
import { BAUWERKE, KOCHBAR, bauwerkAktion } from '../gemeinsam/welt/bauwerke.js';
import { hatStrom, istGemuetlich, leuchtet } from '../gemeinsam/welt/einrichtung.js';
import { pruefeMusikWahl } from '../server/spiel/systeme/musikSystem.js';
import { youtubeId } from '../client/audio/hausMusik.js';

test('P7 Möbel/Lichter: Registry vollständig, Kamin wärmt + brennt herunter, Strom nur mit Generator', () => {
  for (const [id, t] of Object.entries(BAUTEILE)) if (t.art === 'bauwerk') assert.ok(BAUWERKE[id], `BAUWERKE.${id}`);
  const { welt, spieler } = neueWelt();
  const setze = (typ, tx, ty, extra = {}) => {
    const b = { ...neuesBauwerk(welt, typ, tx, ty, 'Tester'), ...extra };
    welt.welt.setzeBauwerk(b);
    return b;
  };
  // Kamin: E mit Feuerzeug zündet
  spieler.x = mitte(6);
  spieler.y = mitte(4);
  spieler.inventar[0] = { defId: 'feuerzeug', menge: 1 };
  const kamin = setze('kamin', 7, 4);
  assert.equal(bauwerkAktion(kamin, spieler.inventar, 'Tester').art, 'kamin');
  aktion(welt, spieler, { art: AKTIONEN.BAUWERK });
  assert.equal(kamin.brennt, true);
  assert.ok(leuchtet(welt.welt, kamin));
  kamin.brennRest = 0.05;
  ticks(welt, 3);
  assert.equal(kamin.brennt, false, 'heruntergebrannt');
  // Stehlampe braucht Strom
  const lampe = setze('stehlampe', 20, 4);
  assert.equal(leuchtet(welt.welt, lampe), false);
  const gen = setze('generator', 22, 4);
  spieler.x = mitte(23);
  spieler.inventar[1] = { defId: 'benzin', menge: 1 };
  aktion(welt, spieler, { art: AKTIONEN.BAUWERK });
  assert.equal(gen.laeuft, true, 'Generator läuft');
  assert.equal(spieler.inventar[1], null, 'Benzin verbraucht');
  assert.ok(hatStrom(welt.welt, 20, 4) && leuchtet(welt.welt, lampe));
});

test('P7 Gemütlich: drinnen + 3 Möbel oder brennender Kamin', () => {
  const { welt } = neueWelt();
  const w = welt.welt;
  for (const [typ, tx] of [['sofa', 3], ['regal', 4], ['pflanze', 5]]) w.setzeBauwerk(neuesBauwerk(welt, typ, tx, 3, 'X'));
  assert.equal(istGemuetlich(w, mitte(4), mitte(4), true), true);
  assert.equal(istGemuetlich(w, mitte(4), mitte(4), false), false, 'nicht draußen');
  assert.equal(istGemuetlich(w, mitte(20), mitte(4), true), false, 'zu weit weg');
});

test('P8 Musik: Wahl prüfen, YouTube-Links erkennen', () => {
  assert.deepEqual(pruefeMusikWahl('youtube', 'dQw4w9WgXcQ'), { quelle: 'youtube', wert: 'dQw4w9WgXcQ' });
  assert.equal(pruefeMusikWahl('youtube', 'javascript:alert(1)'), null);
  assert.ok(pruefeMusikWahl('ordner', 'radio/Kevin MacLeod - Carefree.ogg'));
  assert.equal(pruefeMusikWahl('ordner', '../server/daten/konten.json'), null);
  assert.equal(youtubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10'), 'dQw4w9WgXcQ');
  assert.equal(youtubeId('https://youtu.be/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(youtubeId('https://youtube.com/shorts/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(youtubeId('hallo'), null);
  const { welt, spieler } = neueWelt();
  const radio = neuesBauwerk(welt, 'radio', Math.floor(spieler.x / 32) + 1, Math.floor(spieler.y / 32), 'X');
  welt.welt.setzeBauwerk(radio);
  aktion(welt, spieler, { art: AKTIONEN.MUSIK, ziel: radio.id, quelle: 'ordner', wert: 'radio/Kevin MacLeod - Carefree.ogg' });
  assert.equal(radio.musik?.wert, 'radio/Kevin MacLeod - Carefree.ogg');
  aktion(welt, spieler, { art: AKTIONEN.MUSIK, ziel: radio.id, quelle: 'aus', wert: null });
  assert.equal(radio.musik, undefined);
});

// ---------------------------------------------------------------- Phase 9+10: Haustiere & Farm
import { erzeugeTier } from '../server/spiel/entitaeten/tier.js';
import { erstelleSpielstand, wendeSpielstandAn } from '../server/spiel/spielstand.js';

const tier = (welt, art, x, y) => welt.hinzufuegen(erzeugeTier({ id: welt.neueId(), art, x, y, konfiguration: welt.konfiguration }));

test('P9 Hund: mit Fleisch zähmen, folgt, Bleib/Bei Fuß, bellt + beißt Zombies, kommt mit (Spielstand)', () => {
  const { welt, spieler } = neueWelt();
  spieler.x = mitte(5);
  spieler.y = mitte(4);
  welt.konfiguration.haustiere.zaehmChance = 1; // Runde 27: sonst nur 10 % je Fleisch
  const hund = tier(welt, 'hund', spieler.x + 30, spieler.y);
  aktion(welt, spieler, { art: AKTIONEN.HAUSTIER, ziel: hund.id });
  assert.equal(hund.besitzer, undefined, 'ohne Fleisch nicht');
  spieler.inventar[0] = { defId: 'fleisch', menge: 1 };
  aktion(welt, spieler, { art: AKTIONEN.HAUSTIER, ziel: hund.id });
  assert.equal(hund.besitzer, spieler.name);
  assert.equal(spieler.haustiere.length, 1);
  // folgt
  spieler.x = mitte(15);
  ticks(welt, 30 * 4);
  assert.ok(Math.hypot(hund.x - spieler.x, hund.y - spieler.y) < 120, 'folgt dem Besitzer');
  // Bleib
  aktion(welt, spieler, { art: AKTIONEN.HAUSTIER, ziel: hund.id });
  assert.equal(hund.zustand, 'bleib');
  aktion(welt, spieler, { art: AKTIONEN.HAUSTIER, ziel: hund.id });
  // Zombie in der Nähe → bellen + Biss
  const z = zombie(welt, 'normal', hund.x + 60, hund.y);
  z.gefesselt = true;
  z.leben = z.maxLeben = 500;
  let gebellt = false;
  for (let i = 0; i < 30 * 4; i++) {
    welt.aktualisiere(TICK_DAUER_S);
    gebellt ||= welt.ereignisse.some((e) => e.typ === 'bellen');
  }
  assert.ok(gebellt, 'bellt');
  assert.ok(z.leben < 500, 'beißt');
  // Eigenes Haustier trifft man nicht
  welt.entfernen(z.id);
  // Spielstand → neue Welt: Hund taucht neben dem Besitzer auf
  const stand = JSON.parse(JSON.stringify(erstelleSpielstand(spieler, 'runde24')));
  const { welt: welt2, spieler: neu } = neueWelt();
  wendeSpielstandAn(neu, stand, welt2);
  ticks(welt2, 30 * 3);
  const mitgekommen = [...welt2.alleVomTyp('tier')].find((t) => t.besitzer === neu.name && t.art === 'hund');
  assert.ok(mitgekommen, 'Hund kommt mit');
});

test('P9 Katze: mit Fisch zähmen, rollt sich neben dem sitzenden Besitzer ein', () => {
  const { welt, spieler } = neueWelt();
  welt.konfiguration.haustiere.zaehmChance = 1; // Runde 27: sonst nur 10 % je Fisch
  const katze = tier(welt, 'katze', spieler.x + 30, spieler.y);
  spieler.inventar[0] = { defId: 'fisch_barsch', menge: 1 };
  aktion(welt, spieler, { art: AKTIONEN.HAUSTIER, ziel: katze.id });
  assert.equal(katze.besitzer, spieler.name);
  spieler.arbeit = { art: 'sitzen' };
  ticks(welt, 10);
  assert.equal(katze.zustand, 'schlaeft');
});

test('P10 Huhn fangen → Hühnerstall legt Eier; Bienenstock macht Honig; Gewächshaus wächst doppelt so schnell', () => {
  const { welt, spieler } = neueWelt();
  const huhn = tier(welt, 'huhn', spieler.x + 30, spieler.y);
  spieler.inventar[0] = { defId: 'samen_weizen', menge: 2 };
  aktion(welt, spieler, { art: AKTIONEN.HAUSTIER, ziel: huhn.id });
  assert.ok(!welt.holen(huhn.id), 'eingefangen');
  assert.ok(spieler.inventar.some((e) => e?.defId === 'huhn'));
  // Stall + Stock + zwei Beete
  const setze = (typ, tx, ty) => {
    const b = neuesBauwerk(welt, typ, tx, ty, spieler.name);
    welt.welt.setzeBauwerk(b);
    return b;
  };
  const stall = setze('huehnerstall', 10, 2);
  const stock = setze('bienenstock', 12, 2);
  const normal = setze('beet', 14, 2);
  const glas = setze('gewaechshaus', 15, 2);
  Object.assign(normal, { pflanze: 'weizen', wachstum: 0 });
  Object.assign(glas, { pflanze: 'weizen', wachstum: 0 });
  const zyklus = welt.konfiguration.welt.tagSekunden + welt.konfiguration.welt.nachtSekunden;
  const sekundenJeStunde = zyklus / 24;
  for (let i = 0; i < 30 * 12 * sekundenJeStunde / 30; i++) welt.aktualisiere(1); // 12 Spielstunden in 1-s-Schritten
  assert.ok(stall.eier >= 1, `Eier ${stall.eier}`);
  assert.ok(stock.honig >= 1, `Honig ${stock.honig}`);
  assert.ok(glas.wachstum > normal.wachstum * 1.9, `Gewächshaus ${glas.wachstum} vs ${normal.wachstum}`);
  // Eier einsammeln
  spieler.x = mitte(10);
  spieler.y = mitte(3);
  const eier = stall.eier;
  aktion(welt, spieler, { art: AKTIONEN.BAUWERK });
  assert.equal(stall.eier, 0);
  assert.equal(spieler.inventar.find((e) => e?.defId === 'ei')?.menge, eier);
});

// ---------------------------------------------------------------- Phase 11–13: Gesundheit, Wasser & Küche, Handwerk
import { nachTreffer, lasseVerderben } from '../server/spiel/systeme/gesundheitSystem.js';
import { naheHandwerk, rezepteFuerOrt } from '../gemeinsam/spieler/handwerk.js';
import { spielerDatenPrivat } from '../server/spiel/entitaeten/spieler.js';

const iss = (welt, spieler, defId, extra = {}) => {
  spieler.inventar[3] = { defId, menge: 1, ...extra };
  spieler.angriffsAbklingzeit = 0;
  aktion(welt, spieler, { art: AKTIONEN.KONSUMIEREN, slot: 3 });
};

test('P11 Blutung kostet Leben und blockiert Heilung, Verband stillt sie; Infektion braucht Antibiotika', () => {
  const { welt, spieler, konfiguration } = neueWelt({ gesundheit: { blutungChance: 1, infektionChance: 1, bruchChance: 0 } });
  spieler.gottmodus = false;
  const z = zombie(welt, 'normal', mitte(25), mitte(6));
  nachTreffer(welt, spieler, 10, z);
  assert.equal(spieler.zustand.blutung, true);
  assert.ok(spieler.zustand.infektion > 0);
  assert.deepEqual(spielerDatenPrivat(spieler, konfiguration, welt).zustand, { blutung: true, infektion: 1 });
  const vorher = spieler.leben;
  ticks(welt, 30 * 4);
  assert.ok(spieler.leben < vorher - 1, 'blutet');
  iss(welt, spieler, 'verband');
  assert.equal(spieler.zustand.blutung, false, 'Verband stillt');
  // Verband auch bei vollem Leben nutzbar, wenn er hilft – Schmerzmittel nicht
  spieler.leben = spieler.maxLeben;
  iss(welt, spieler, 'schmerzmittel');
  assert.equal(spieler.inventar[3]?.defId, 'schmerzmittel', 'nicht verbraucht');
  iss(welt, spieler, 'antibiotika');
  assert.equal(spieler.zustand.infektion, 0);
});

test('P11 Beinbruch drückt das Tempo, Schiene hilft, verheilt; Rohes Fleisch kann vergiften, Aktivkohle hilft', () => {
  const { welt, spieler } = neueWelt({ gesundheit: { bruchChance: 1, schieneDauer: 2 } });
  spieler.gottmodus = false;
  const tempo = spieler.tempoFaktor;
  nachTreffer(welt, spieler, 40, null, { explosion: true });
  assert.equal(spieler.zustand.bruch, 1);
  ticks(welt, 2);
  assert.ok(spieler.tempoFaktor < tempo * 0.7, `humpelt ${spieler.tempoFaktor}`);
  iss(welt, spieler, 'schiene');
  assert.equal(spieler.zustand.bruch, 2);
  ticks(welt, 2);
  assert.ok(spieler.tempoFaktor > tempo * 0.8 && spieler.tempoFaktor < tempo);
  ticks(welt, 30 * 3);
  assert.equal(spieler.zustand.bruch, 0, 'verheilt');
  assert.equal(spieler.tempoFaktor, tempo);
  // Vergiftung
  welt.zufall.zahl = () => 0; // Pech garantiert
  iss(welt, spieler, 'fleisch');
  assert.ok(spieler.zustand.vergiftung > 0, 'vergiftet');
  iss(welt, spieler, 'aktivkohle');
  assert.equal(spieler.zustand.vergiftung, 0);
});

test('P11 Müdigkeit steigt, Erschöpfung bremst; Doppelbett erholt besser als Schlafsack, Spawn wird gesetzt', () => {
  const { welt, spieler } = neueWelt({ schlafen: { dauer: 0.5, stunden: 0, heilung: 0, zombieAbstand: 300 } });
  spieler.gottmodus = false;
  const zyklus = welt.konfiguration.welt.tagSekunden + welt.konfiguration.welt.nachtSekunden;
  for (let i = 0; i < 10; i++) welt.aktualisiere(zyklus / 24); // 10 Spielstunden
  assert.ok(Math.abs(spieler.muedigkeit - 30) < 2, `Müdigkeit ${spieler.muedigkeit}`);
  spieler.muedigkeit = 90;
  ticks(welt, 1);
  const erschoepft = spieler.tempoFaktor;
  assert.ok(erschoepft < 0.9);
  const schlafe = (typ, tx) => {
    const b = neuesBauwerk(welt, typ, tx, 2, spieler.name);
    welt.welt.setzeBauwerk(b);
    spieler.x = mitte(tx);
    spieler.y = mitte(3);
    spieler.muedigkeit = 100;
    aktion(welt, spieler, { art: AKTIONEN.BAUWERK, bauwerkId: b.id });
    assert.equal(spieler.arbeit?.art, 'schlafen', `${typ}: schläft`);
    ticks(welt, 30);
    assert.equal(spieler.arbeit, null, 'aufgewacht');
    return { rest: spieler.muedigkeit, b };
  };
  const sack = schlafe('schlafsack', 5);
  const doppel = schlafe('doppelbett', 10);
  assert.ok(doppel.rest < sack.rest - 20, `Doppelbett ${doppel.rest} < Schlafsack ${sack.rest}`);
  assert.deepEqual(spieler.spawn, { karte: 'runde24', tx: 10, ty: 2 }, 'Spawn am Doppelbett');
});

test('P12 Essen verdirbt (Vorratsschrank bremst), Spielstand behält Frische, Buffs aus Eintopf', () => {
  const { welt, spieler } = neueWelt();
  spieler.gottmodus = false;
  spieler.inventar[5] = { defId: 'fleisch', menge: 2 };
  ticks(welt, 30 * 3);
  assert.ok(spieler.inventar[5].verderb <= 898 && spieler.inventar[5].verderb >= 896, `verderb ${spieler.inventar[5].verderb}`);
  lasseVerderben(spieler.inventar, 2000);
  assert.equal(spieler.inventar[5].defId, 'verdorben');
  assert.deepEqual(pruefeEintrag({ defId: 'fisch_barsch', menge: 1, verderb: 120 }), { defId: 'fisch_barsch', menge: 1, verderb: 120 });
  // Kiste vs. Vorratsschrank
  const kiste = neuesBauwerk(welt, 'kiste', 4, 6, spieler.name);
  const schrank = neuesBauwerk(welt, 'vorratsschrank', 6, 6, spieler.name);
  welt.welt.setzeBauwerk(kiste);
  welt.welt.setzeBauwerk(schrank);
  kiste.inhalt[0] = { defId: 'milch', menge: 1 };
  schrank.inhalt[0] = { defId: 'milch', menge: 1 };
  for (let i = 0; i < 100; i++) welt.aktualisiere(1);
  const vk = 1200 - kiste.inhalt[0].verderb;
  const vs = 1200 - schrank.inhalt[0].verderb;
  assert.ok(vk >= 95 && vs <= vk * 0.25 + 1, `Kiste ${vk}, Schrank ${vs}`);
  // Eintopf: satt-Buff halbiert Hungerverlust
  iss(welt, spieler, 'eintopf');
  assert.ok(spieler.buffs.satt > 590);
  spieler.hunger = 80;
  ticks(welt, 30 * 10);
  const mitBuff = 80 - spieler.hunger;
  spieler.buffs = {};
  spieler.hunger = 80;
  ticks(welt, 30 * 10);
  const ohne = 80 - spieler.hunger;
  assert.ok(Math.abs(mitBuff - ohne / 2) < 0.05, `${mitBuff} vs ${ohne}`);
});

test('P12 Wasser: Flasche bleibt nach dem Trinken, Regentonne füllt sich bei Regen, Brunnen gibt dreckiges Wasser, Abkochen', () => {
  const { welt, spieler } = neueWelt({ wetter: { aktiv: true } });
  spieler.gottmodus = false;
  iss(welt, spieler, 'wasserflasche');
  assert.ok(spieler.inventar.some((e) => e?.defId === 'leere_flasche'));
  const tonne = neuesBauwerk(welt, 'regentonne', 4, 4, spieler.name);
  welt.welt.setzeBauwerk(tonne);
  assert.equal(bauwerkAktion(tonne, spieler.inventar, spieler.name).art, 'wasser');
  setzeWetter(welt, 'regen', 9999);
  const zyklus = welt.konfiguration.welt.tagSekunden + welt.konfiguration.welt.nachtSekunden;
  for (let i = 0; i < 3; i++) welt.aktualisiere(zyklus / 24);
  assert.ok(tonne.wasser >= 2.9, `Tonne ${tonne.wasser}`);
  spieler.x = mitte(4);
  spieler.y = mitte(5);
  aktion(welt, spieler, { art: AKTIONEN.BAUWERK, bauwerkId: tonne.id });
  assert.ok(spieler.inventar.some((e) => e?.defId === 'wasserflasche'), 'Regenwasser ist sauber');
  spieler.inventar.fill(null);
  spieler.inventar[0] = { defId: 'leere_flasche', menge: 1 };
  const brunnen = neuesBauwerk(welt, 'brunnen', 8, 4, spieler.name);
  welt.welt.setzeBauwerk(brunnen);
  spieler.x = mitte(8);
  aktion(welt, spieler, { art: AKTIONEN.BAUWERK, bauwerkId: brunnen.id });
  assert.equal(spieler.inventar.find((e) => e)?.defId, 'wasser_dreckig');
  assert.equal(KOCHBAR.wasser_dreckig, 'wasserflasche', 'abkochen');
  // Ohne Wasser in der Nähe: leere Flasche bleibt leer
  spieler.inventar[0] = { defId: 'leere_flasche', menge: 1 };
  spieler.angriffsAbklingzeit = 0;
  aktion(welt, spieler, { art: AKTIONEN.KONSUMIEREN, slot: 0 });
  assert.equal(spieler.inventar[0]?.defId, 'leere_flasche');
});

test('P13 Handwerks-Orte: Amboss, Webstuhl, Chemie, Kochstelle nur in der Nähe (Feuer muss brennen)', () => {
  const { welt, spieler } = neueWelt();
  const orte = new Set(Object.values(REZEPTE).map((r) => r.ort ?? 'werkbank'));
  for (const o of ['werkbank', 'inventar', 'amboss', 'webstuhl', 'chemie', 'feuer']) assert.ok(orte.has(o), o);
  assert.ok(Object.keys(rezepteFuerOrt(REZEPTE, 'werkbank')).includes('mehl'), 'Werkbank zeigt Inventar-Rezepte');
  assert.ok(!Object.keys(rezepteFuerOrt(REZEPTE, 'werkbank')).includes('eintopf'));
  spieler.inventar[0] = { defId: 'weizen', menge: 6 };
  aktion(welt, spieler, { art: AKTIONEN.HERSTELLEN, rezept: 'stoff_weben' });
  assert.ok(!spieler.inventar.some((e) => e?.defId === 'stoff'), 'ohne Webstuhl nichts');
  const web = neuesBauwerk(welt, 'webstuhl', 3, 1, spieler.name);
  welt.welt.setzeBauwerk(web);
  spieler.x = mitte(3);
  spieler.y = mitte(2);
  assert.equal(bauwerkAktion(web, [], spieler.name).station, 'webstuhl');
  aktion(welt, spieler, { art: AKTIONEN.HERSTELLEN, rezept: 'stoff_weben' });
  assert.equal(spieler.inventar.find((e) => e?.defId === 'stoff')?.menge, 2);
  // Kochstelle: Lagerfeuer muss brennen
  const feuer = neuesBauwerk(welt, 'lagerfeuer', 8, 2, spieler.name);
  welt.welt.setzeBauwerk(feuer);
  assert.equal(naheHandwerk(welt.welt, mitte(8), mitte(3), 'feuer'), false);
  feuer.brennt = true;
  assert.equal(naheHandwerk(welt.welt, mitte(8), mitte(3), 'feuer'), true);
  for (const r of Object.values(REZEPTE)) {
    assert.ok(GEGENSTAENDE[r.ergebnis], r.ergebnis);
    for (const z of Object.keys(r.zutaten)) assert.ok(GEGENSTAENDE[z], z);
  }
});

// ---------------------------------------------------------------- Phase 14: Gruppen, Handel, Wiederbeleben
const zweiSpieler = (extra) => {
  const w = neueWelt(extra);
  const b = w.welt.spielerBetrittWelt('Bob');
  b.x = w.spieler.x + 40;
  b.y = w.spieler.y;
  w.spieler.gottmodus = b.gottmodus = false;
  return { ...w, a: w.spieler, b };
};

test('P14 Gruppe: Einladung mit Flagge annehmen → Mitglied darf Kisten/Bauen; verlassen entfernt', async () => {
  const { setzeFlagge } = await import('../server/spiel/systeme/territoriumSystem.js');
  const { hatRechtBei } = await import('../server/spiel/systeme/territoriumSystem.js');
  const { welt, a, b, konfiguration } = zweiSpieler();
  aktion(welt, a, { art: AKTIONEN.GRUPPE, was: 'einladen', ziel: b.id });
  assert.equal(b.anfrage, undefined, 'ohne Flagge keine Einladung');
  assert.ok(setzeFlagge(welt, a, 8, 4));
  aktion(welt, a, { art: AKTIONEN.GRUPPE, was: 'einladen', ziel: b.id });
  assert.equal(b.anfrage?.art, 'gruppe');
  assert.deepEqual(spielerDatenPrivat(b, konfiguration, welt).anfrage, { art: 'gruppe', von: 'Tester' });
  aktion(welt, b, { art: AKTIONEN.GRUPPE, was: 'annehmen' });
  assert.ok(hatRechtBei(welt, 'Bob', 8, 4, 'benutzen'));
  assert.deepEqual(spielerDatenPrivat(b, konfiguration, welt).gruppe.mitglieder, ['Bob']);
  assert.equal(spielerDatenPrivat(b, konfiguration, welt).gruppe.besitzer, 'Tester');
  aktion(welt, b, { art: AKTIONEN.GRUPPE, was: 'verlassen' });
  assert.ok(!hatRechtBei(welt, 'Bob', 8, 4, 'benutzen'));
});

test('P14 Handel: anbieten, beide bereit → getauscht; Änderung nimmt Bereit zurück; Abstand bricht ab', () => {
  const { welt, a, b, konfiguration } = zweiSpieler();
  a.inventar[2] = { defId: 'axt', menge: 1, haltbarkeit: 7 };
  b.inventar[4] = { defId: 'apfel', menge: 3 };
  aktion(welt, a, { art: AKTIONEN.HANDEL, was: 'anfragen', ziel: b.id });
  aktion(welt, b, { art: AKTIONEN.HANDEL, was: 'annehmen' });
  assert.ok(a.handelId && a.handelId === b.handelId);
  aktion(welt, a, { art: AKTIONEN.HANDEL, was: 'anbieten', slot: 2 });
  aktion(welt, a, { art: AKTIONEN.HANDEL, was: 'bereit' });
  aktion(welt, b, { art: AKTIONEN.HANDEL, was: 'anbieten', slot: 4 });
  assert.equal(spielerDatenPrivat(a, konfiguration, welt).handel.ichBereit, false, 'Änderung → nicht mehr bereit');
  assert.deepEqual(spielerDatenPrivat(a, konfiguration, welt).handel.seins, [{ defId: 'apfel', menge: 3 }]);
  aktion(welt, a, { art: AKTIONEN.HANDEL, was: 'bereit' });
  aktion(welt, b, { art: AKTIONEN.HANDEL, was: 'bereit' });
  assert.equal(a.handelId, null);
  assert.equal(b.inventar.find((e) => e?.defId === 'axt')?.haltbarkeit, 7, 'Zustand bleibt');
  assert.equal(a.inventar.find((e) => e?.defId === 'apfel')?.menge, 3);
  assert.ok(!a.inventar.some((e) => e?.defId === 'axt'));
  // Abstand
  aktion(welt, a, { art: AKTIONEN.HANDEL, was: 'anfragen', ziel: b.id });
  aktion(welt, b, { art: AKTIONEN.HANDEL, was: 'annehmen' });
  b.x += 400;
  ticks(welt, 1);
  assert.equal(a.handelId, null, 'zu weit → abgebrochen');
});

test('P14 Niedergestreckt statt tot, wenn Mitspieler da sind; Erste-Hilfe-Kasten rettet; Zeit um → tot; allein sofort tot', async () => {
  const { toeten } = await import('../server/spiel/systeme/kampfSystem.js');
  const { welt, a, b } = zweiSpieler({ mehrspieler: { niederDauer: 2 } });
  toeten(welt, b);
  assert.ok(b.niedergestreckt > 0 && !b.tot, 'am Boden');
  const z = zombie(welt, 'normal', b.x + 60, b.y);
  ticks(welt, 5);
  assert.notEqual(z.zielId, b.id, 'Zombies lassen ihn liegen');
  welt.entfernen(z.id);
  aktion(welt, a, { art: AKTIONEN.HELFEN, ziel: b.id });
  assert.ok(b.niedergestreckt > 0, 'ohne Kasten nichts');
  a.inventar[1] = { defId: 'erste_hilfe_kasten', menge: 1 };
  aktion(welt, a, { art: AKTIONEN.HELFEN, ziel: b.id });
  assert.equal(b.niedergestreckt, 0);
  assert.ok(b.leben > 20 && !b.tot);
  assert.equal(a.inventar[1], null, 'Kasten verbraucht');
  toeten(welt, b);
  ticks(welt, 30 * 3);
  assert.equal(b.tot, true, 'Zeit um');
  // allein: sofort tot
  const solo = neueWelt();
  solo.spieler.gottmodus = false;
  toeten(solo.welt, solo.spieler);
  assert.equal(solo.spieler.tot, true);
});

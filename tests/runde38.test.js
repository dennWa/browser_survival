import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SpielWelt } from '../server/spiel/spielWelt.js';
import { erstelleKonfiguration } from '../server/spiel/konfiguration/spielKonfiguration.js';
import { AKTIONEN } from '../gemeinsam/protokoll.js';
import { TICK_DAUER_S } from '../gemeinsam/konstanten.js';
import { kmhZuTempo } from '../gemeinsam/physik/fahrzeug.js';
import { erzeugeFahrzeug } from '../server/spiel/entitaeten/fahrzeug.js';
import { aktualisiereFahrzeuge } from '../server/spiel/systeme/fahrzeugSystem.js';
import { aktualisiereNaesse, aktualisiereWetter, regnet, spuleWetterVor } from '../server/spiel/systeme/wetterSystem.js';
import { spuleZeitVor } from '../server/spiel/systeme/arbeitSystem.js';
import { fuegeZumInventarHinzu } from '../server/spiel/systeme/inventarSystem.js';
import { spielerDatenPrivat } from '../server/spiel/entitaeten/spieler.js';
import { wetterSchichten, vorschauWetter } from '../gemeinsam/audio/umgebung.js';
import { RESSOURCEN_OBJEKTE } from '../gemeinsam/welt/ressourcen.js';
import { beruehrteKacheln, bedeckteKacheln } from '../gemeinsam/welt/drehung.js';
import { STAMM_BREITE, stammBreite } from '../client/darstellung/baumModell.js';
import { StrassenNaesse } from '../client/darstellung/nasseStrassen.js';
import { hebeAlleAuf, amBoden } from './hilfen/aufheben.js';

/**
 * Runde 38: Anfahren von Spielern, Wetter an Spielzeit gekoppelt + Straßennässe, Regen im Haus leiser, Felsen als Steinvorkommen,
 * Ressourcen als Bodenitems, Stumpfdicke je Baumvariante, Blick-Fixierung (Server-Seite: arbeit.ziel), nasser Asphalt (Client-Logik).
 */
const KARTE = {
  id: 'r38',
  name: 'Runde 38',
  kacheln: Array.from({ length: 14 }, (_, i) => (i === 0 || i === 13 ? '#'.repeat(30) : i === 2 ? `#,S${','.repeat(26)}#` : `#${','.repeat(28)}#`)),
  raeume: {},
  objekte: [
    { typ: 'baum', x: 20, y: 5, b: 2, h: 2, ebene: 'oben' },
    { typ: 'stein', x: 8, y: 8, b: 1, h: 1, blockiert: true },
    // Fels (Editor-Deko r32_fels_*): 1,6 × 1,6 Kacheln, absichtlich nicht auf dem Raster → früher nur 1 Kachel blockiert
    { typ: 'r32_fels_6', x: 12.5, y: 6.6, b: 1.6, h: 1.6 },
    { typ: 'r32_fels_0', x: 16, y: 8, b: 1.2, h: 1.3, blockiert: true },
  ],
};
const m = (t) => t * 32 + 16;
function neueWelt(extra = {}) {
  const konfiguration = erstelleKonfiguration({ server: { zufallsStartwert: 9 }, tiere: { hasenProTausend: 0 }, wetter: { aktiv: false }, ziele: { aktiv: false }, bots: { proKarte: 0 }, ...extra });
  const welt = new SpielWelt(konfiguration, { kartenDefinition: KARTE });
  for (const z of [...welt.alleVomTyp('zombie')]) welt.entfernen(z.id);
  const spieler = welt.spielerBetrittWelt('Fußgänger');
  spieler.gottmodus = false;
  return { welt, spieler, w: welt.welt, konfiguration };
}
const laufe = (welt, n) => {
  for (let i = 0; i < n; i++) welt.aktualisiere(TICK_DAUER_S);
};

// --- Anfahren -----------------------------------------------------------------------------------------------------

function autoMit(welt, kmh, x = m(10), y = m(10)) {
  const fz = erzeugeFahrzeug({ id: welt.neueId(), modell: 'auto_rot', x, y, winkel: 0, laenge: 40, breite: 18 });
  fz.tempo = kmhZuTempo(kmh);
  welt.entitaeten.set(fz.id, fz);
  return fz;
}

test('Anfahren: ab 110 km/h sofort tot (endgültig, kein Niederstrecken)', () => {
  const { welt, spieler } = neueWelt();
  Object.assign(spieler, { x: m(10), y: m(10) });
  autoMit(welt, 112);
  aktualisiereFahrzeuge(welt, TICK_DAUER_S);
  assert.ok(spieler.tot, 'überfahren');
  assert.equal(spieler.niedergestreckt, 0, 'kein Niederstrecken – sofort tot');
  assert.ok(welt.ereignisse.some((e) => e.typ === 'aufprall' && e.ziel === 'spieler'));
});

test('Anfahren: darunter Schaden = Tempo ÷ 110 km/h der Maximal-Lebenspunkte', () => {
  const { welt, spieler } = neueWelt();
  Object.assign(spieler, { x: m(10), y: m(10) });
  const maximal = spieler.maxLeben;
  spieler.leben = maximal;
  autoMit(welt, 55);
  aktualisiereFahrzeuge(welt, TICK_DAUER_S);
  assert.ok(!spieler.tot);
  assert.ok(Math.abs(maximal - spieler.leben - maximal * 0.5) < 1.5, `≈ 50 % Schaden, war ${maximal - spieler.leben} von ${maximal}`);
});

test('Anfahren: Fahrer, Beifahrer, Gottmodus und langsames Schieben bleiben verschont; Sperre gegen Dauerschaden', () => {
  const { welt, spieler } = neueWelt();
  Object.assign(spieler, { x: m(10), y: m(10) });
  const fz = autoMit(welt, 2); // langsamer als spielerAnfahrMinKmh
  aktualisiereFahrzeuge(welt, TICK_DAUER_S);
  assert.equal(spieler.leben, spieler.maxLeben, 'zu langsam = keine Wirkung');
  fz.tempo = kmhZuTempo(30);
  spieler.gottmodus = true;
  aktualisiereFahrzeuge(welt, TICK_DAUER_S);
  assert.equal(spieler.leben, spieler.maxLeben, 'Gottmodus');
  spieler.gottmodus = false;
  fz.fahrerId = spieler.id;
  spieler.fahrzeug = fz;
  aktualisiereFahrzeuge(welt, TICK_DAUER_S);
  assert.equal(spieler.leben, spieler.maxLeben, 'der Fahrer überfährt sich nicht selbst');
  spieler.fahrzeug = null;
  fz.fahrerId = null;
  fz.tempo = kmhZuTempo(30);
  aktualisiereFahrzeuge(welt, TICK_DAUER_S);
  const nachErstem = spieler.leben;
  assert.ok(nachErstem < spieler.maxLeben, 'jetzt wird er getroffen');
  fz.tempo = kmhZuTempo(30);
  aktualisiereFahrzeuge(welt, TICK_DAUER_S);
  assert.ok(spieler.leben > nachErstem - 0.001, 'derselbe Treffer zählt nicht jeden Tick neu (Sperre)');
});

// --- Wetter an Spielzeit -----------------------------------------------------------------------------------------

test('Nässe: 15 s Verzögerung, dann Anstieg; nach Regenende in 120 s linear trocken (halb nach 60 s)', () => {
  const k = erstelleKonfiguration().wetter;
  const w = {};
  aktualisiereNaesse(w, true, 14, k);
  assert.equal(w.nass, 0, 'noch trocken in den ersten 15 s');
  aktualisiereNaesse(w, true, 1 + 15, k); // 15 s nach der Verzögerung = halbe Anstiegszeit
  assert.ok(Math.abs(w.nass - 0.5) < 0.01, `halb nass (${w.nass})`);
  aktualisiereNaesse(w, true, 60, k);
  assert.equal(w.nass, 1);
  aktualisiereNaesse(w, false, 60, k);
  assert.ok(Math.abs(w.nass - 0.5) < 0.01, `nach 1 min halb trocken (${w.nass})`);
  aktualisiereNaesse(w, false, 60, k);
  assert.equal(w.nass, 0, 'nach 2 min trocken');
  aktualisiereNaesse(w, true, 10, k);
  aktualisiereNaesse(w, false, 5, k);
  assert.equal(w.regenSeit, 0, 'Regenpause setzt die Verzögerung zurück');
});

test('Wetter läuft in Spielzeit: Schlafen/Zeitsprung rechnet Regenende und Folgewetter nach', () => {
  const { welt } = neueWelt({ wetter: { aktiv: true, dauerMin: 120, dauerMax: 120, pauseMin: 60, pauseMax: 60, regenAnteil: 1, gewitterAnteil: 0, starkregenAnteil: 0 } });
  welt.wetter.art = 'regen';
  welt.wetter.rest = 100;
  welt.wetter.nass = 1;
  // 6 Spielstunden schlafen → vielfach über Regenende hinaus (Zyklus 60 s klar + 120 s Regen)
  spuleZeitVor(welt, 6);
  assert.ok(['regen', 'klar'].includes(welt.wetter.art));
  assert.ok(welt.wetter.rest > 0 && welt.wetter.rest <= 120, `Restdauer der aktuellen Phase plausibel (${welt.wetter.rest})`);
  // kurzer Sprung: Regen (rest 100) endet nach 100 s → danach klar, Straße trocknet im Rest
  welt.wetter.art = 'regen';
  welt.wetter.rest = 100;
  welt.wetter.nass = 1;
  spuleWetterVor(welt, 130);
  assert.equal(welt.wetter.art, 'klar', 'Regen ist im Schlaf zu Ende gegangen');
  assert.ok(Math.abs(welt.wetter.rest - 30) < 0.01 || welt.wetter.rest === 30, `klare Pause läuft weiter (${welt.wetter.rest})`);
  assert.ok(welt.wetter.nass < 1, `Straße trocknet nach Regenende (${welt.wetter.nass})`);
  spuleWetterVor(welt, 30 + 100); // klar vorbei, nächster Regen begonnen (120 s Regen), dann weiter
  assert.equal(regnet(welt.wetter.art), true, 'nächstes Wetterereignis wurde mitgerechnet');
  assert.ok(Math.abs(welt.wetter.nass - 1) < 1e-9 || welt.wetter.nass > 0.9, `wieder nass (${welt.wetter.nass})`);
});

test('Wetter: ohne Zeitsprung tickt es wie bisher (aktualisiereWetter), nass geht in den Schnappschuss', () => {
  const { welt } = neueWelt({ wetter: { aktiv: true, dauerMin: 50, dauerMax: 50, pauseMin: 50, pauseMax: 50, regenAnteil: 1, gewitterAnteil: 0, starkregenAnteil: 0 } });
  welt.wetter.art = 'regen';
  welt.wetter.rest = 40;
  for (let i = 0; i < 40; i++) aktualisiereWetter(welt, 1);
  assert.ok(welt.wetter.nass > 0.5, `nach 40 s Regen nass (${welt.wetter.nass})`);
  assert.equal(typeof welt.schnappschuss().nass, 'number');
});

test('Regen im Haus ist 15 % leiser (alle drei Regen-Schichten), draußen/im Auto unverändert', () => {
  const regen = vorschauWetter('regen');
  const draussen = wetterSchichten({ w: regen, hell: 1, wetter: 'regen' });
  const haus = wetterSchichten({ w: regen, hell: 1, drinnen: true, imHaus: true, wetter: 'regen' });
  assert.ok(Math.abs(haus.regen - 0.112 * 0.85) < 1e-9);
  assert.ok(Math.abs(haus.regen_dach - 0.85) < 1e-9);
  assert.equal(draussen.regen_dach, 0);
  const auto = wetterSchichten({ w: regen, hell: 1, drinnen: true, imHaus: false, wetter: 'regen' });
  assert.equal(auto.regen, regen.regen, 'im Auto bleibt es wie bisher');
  const sturm = vorschauWetter('gewitter');
  const hausStark = wetterSchichten({ w: sturm, hell: 1, drinnen: true, imHaus: true, wetter: 'gewitter' });
  const autoStark = wetterSchichten({ w: sturm, hell: 1, drinnen: true, imHaus: false, wetter: 'gewitter' });
  assert.ok(Math.abs(hausStark.regen_stark - autoStark.regen_stark * 0.85) < 1e-9, 'Starkregen im Haus −15 %');
});

// --- Ressourcen als Bodenitems --------------------------------------------------------------------------------------

test('Baum fällen / Stein abbauen: Ausbeute liegt als Gegenstand am Boden (Verfall), Aufheben per E, Popup-Flag boden', () => {
  const { welt, spieler, konfiguration } = neueWelt({ ressourcen: { holz: { dauer: 0.2, chanceAufMehr: 0, apfelChance: 0 }, stein: { dauer: 0.2, chanceAufMehr: 0 } } });
  fuegeZumInventarHinzu(spieler, 'axt', 1);
  fuegeZumInventarHinzu(spieler, 'spitzhacke', 1);
  const baum = welt.welt.ressourcen.find((r) => r.typ === 'baum');
  Object.assign(spieler, { x: baum.x - baum.radius - 10, y: baum.y });
  spieler.aktionsPuffer.push({ art: AKTIONEN.ABBAUEN, slot: null });
  const gesehen = [];
  for (let i = 0; i < 30; i++) {
    welt.aktualisiere(TICK_DAUER_S);
    gesehen.push(...welt.ereignisse.filter((e) => e.typ === 'abgebaut'));
  }
  assert.equal(spieler.inventar.some((e) => e?.defId === 'holz'), false, 'nichts im Inventar');
  const holz = [...welt.alleVomTyp('gegenstand')].filter((g) => g.defId === 'holz');
  assert.equal(holz.length, 1);
  assert.ok(holz[0].verfallRest > 0 && holz[0].verfallRest <= konfiguration.ressourcen.bodenVerfall, 'verschwindet nach bodenVerfall');
  assert.ok(!welt.welt.istBlockiert(Math.floor(holz[0].x / 32), Math.floor(holz[0].y / 32)), 'nicht in einer blockierten Kachel');
  assert.ok(Math.hypot(holz[0].x - baum.x, holz[0].y - baum.y) < baum.radius + 4, 'liegt am Stumpf');
  assert.equal(gesehen[0]?.boden, true, 'Client zeigt kein „+N“-Popup');
  assert.equal(hebeAlleAuf(welt, spieler) >= 1, true);
  assert.ok(spieler.inventar.some((e) => e?.defId === 'holz'));
  // Stein ebenso
  const stein = welt.welt.ressourcen.find((r) => r.typ === 'stein');
  Object.assign(spieler, { x: stein.x, y: stein.y + stein.radius + 10 });
  spieler.aktionsPuffer.push({ art: AKTIONEN.ABBAUEN, slot: null });
  laufe(welt, 30);
  assert.ok(amBoden(welt, spieler, 'stein') >= 1, 'Stein liegt am Boden');
  hebeAlleAuf(welt, spieler);
  assert.ok(spieler.inventar.some((e) => e?.defId === 'stein'));
});

test('Abbau-Ziel: spielerDaten.arbeit.ziel = Ressourcen-ID (Client fixiert den Blick darauf)', () => {
  const { welt, spieler } = neueWelt();
  fuegeZumInventarHinzu(spieler, 'axt', 1);
  const baum = welt.welt.ressourcen.find((r) => r.typ === 'baum');
  Object.assign(spieler, { x: baum.x - baum.radius - 10, y: baum.y + 30 });
  spieler.aktionsPuffer.push({ art: AKTIONEN.ABBAUEN, slot: null });
  welt.aktualisiere(TICK_DAUER_S);
  assert.equal(spieler.arbeit?.art, 'holz');
  const eigene = spielerDatenPrivat(spieler, welt.konfiguration, welt);
  assert.equal(eigene.arbeit.ziel, baum.id);
  welt.aktualisiere(TICK_DAUER_S);
  const erwartet = Math.atan2(baum.y - spieler.y, baum.x - spieler.x);
  assert.ok(Math.abs(Math.atan2(Math.sin(spieler.blick - erwartet), Math.cos(spieler.blick - erwartet))) < 1e-6, 'Server richtet den Blick auf den Baum');
});

// --- Felsen als Steinvorkommen ---------------------------------------------------------------------------------------

test('Felsen (r32_fels_*) sind abbaubare Steinvorkommen: Radius/Größe aus der Grundfläche, blockiert, danach frei', () => {
  const { welt, spieler, w } = neueWelt({ ressourcen: { stein: { dauer: 0.2, chanceAufMehr: 0, menge: 1, mengeGross: 2 } } });
  for (let i = 0; i < 8; i++) assert.equal(RESSOURCEN_OBJEKTE[`r32_fels_${i}`].art, 'stein');
  const gross = w.ressourcen.find((r) => r.typ === 'r32_fels_6');
  const klein = w.ressourcen.find((r) => r.typ === 'r32_fels_0');
  assert.equal(gross.groesse, 'gross');
  assert.equal(klein.groesse, 'klein');
  assert.ok(Math.abs(gross.radius - 1.6 * 32 / 2) < 1e-9);
  // 1,6 × 1,6 Kacheln bei (12,5 | 6,6): berührt 3 × 3 Kacheln spürbar – die alte „Mittelpunkt-Regel“ blockierte nur eine
  const alt = bedeckteKacheln(gross.objekt, w.breite);
  const neu = beruehrteKacheln(gross.objekt, w.breite, 0.3);
  assert.ok(neu.length > alt.length, `mehr Kacheln blockiert (${alt.length} → ${neu.length})`);
  for (const index of neu) assert.equal(w.istBlockiert(index % w.breite, Math.floor(index / w.breite)), true, `Kachel ${index} blockiert`);
  // Abbau mit Spitzhacke → großer Fels liefert 2 Stein
  fuegeZumInventarHinzu(spieler, 'spitzhacke', 1);
  Object.assign(spieler, { x: gross.x, y: gross.y + gross.radius + 12 });
  spieler.aktionsPuffer.push({ art: AKTIONEN.ABBAUEN, slot: null });
  laufe(welt, 30);
  assert.equal(amBoden(welt, spieler, 'stein'), 2, 'großer Fels = mengeGross');
  assert.equal(w.istRessourceDa(gross.id), false);
  for (const index of neu) assert.equal(w.istBlockiert(index % w.breite, Math.floor(index / w.breite)), false, 'nach dem Abbau frei');
});

// --- Stumpfdicke -----------------------------------------------------------------------------------------------------

test('Stümpfe: Dicke folgt der Baumvariante (dünne Laubbäume ≪ dicke Kiefern), Fallback für Unbekanntes', () => {
  assert.ok(stammBreite('baum|laubbaum_00') < stammBreite('baum|kiefer_n2') / 2);
  assert.equal(stammBreite('baum|kiefer_n0'), STAMM_BREITE.kiefer_n0);
  assert.equal(stammBreite('tanne'), 12);
  assert.equal(stammBreite('baum|gibt_es_nicht'), 10);
  for (const [name, breite] of Object.entries(STAMM_BREITE)) assert.ok(breite > 3 && breite < 25, `${name}: ${breite}`);
});

// --- nasse Straßen (Client) ------------------------------------------------------------------------------------------

function nasseKarte() {
  const kachelAn = (tx, ty) => (tx < 0 || ty < 0 || tx >= 6 || ty >= 6 ? null : ty === 0 ? '_' : ty === 1 ? '=' : tx === 0 ? '#' : ',');
  return { kachelAn, breite: 6, hoehe: 6, schnee: false };
}

test('StrassenNaesse: nur Asphalt/Straße bekommen die Schicht; folgt dem Serverwert fließend, trocken = unsichtbar', () => {
  const n = new StrassenNaesse({ welt: nasseKarte(), g: 32, hy: () => 0, wandHoehe: 84 });
  assert.equal(n.anzahlStrassen, 12, 'zwei Reihen à 6 Kacheln');
  n.setze(0.8, 0); // erster Wert wird direkt übernommen (Beitritt mitten im Regen)
  assert.equal(n.nass, 0.8);
  n.setze(0, 0);
  const verlauf = [];
  for (let i = 0; i < 40; i++) {
    n.aktualisiere(0.1, { x: 100, y: 100 });
    verlauf.push(n.nass);
  }
  for (let i = 1; i < verlauf.length; i++) assert.ok(verlauf[i] <= verlauf[i - 1] + 1e-9, 'monoton fallend');
  assert.ok(verlauf[0] > 0.6, 'kein Sprung auf 0 (Folgekonstante)');
  assert.equal(n.strassen.visible, n.nass > 0.01);
  for (let i = 0; i < 100; i++) n.aktualisiere(0.1, { x: 100, y: 100 });
  assert.equal(n.nass, 0);
  assert.equal(n.strassen.visible, false, 'trocken: kein Draw-Call');
  n.setze(1, 1);
  for (let i = 0; i < 100; i++) n.aktualisiere(0.1, { x: 100, y: 100 });
  assert.ok(n.strassen.visible);
  assert.ok(n.strassen.material.opacity > 0.3 && n.strassen.material.opacity < 0.5, `dezent (${n.strassen.material.opacity})`);
  assert.ok(n.strassen.material.roughness < 0.2, 'nass = glatt');
});

test('StrassenNaesse: Dachtropfen starten an Hauskanten, fallen nach unten und verschwinden wieder; Schneezone bleibt trocken', () => {
  const n = new StrassenNaesse({ welt: nasseKarte(), g: 32, hy: () => 0, wandHoehe: 84 });
  assert.ok(n.kanten.length > 0, 'Außenkanten der Wand gefunden');
  n.setze(1, 1);
  const fokus = { x: 64, y: 128 };
  let ysMax = 0;
  let sichtbar = 0;
  for (let i = 0; i < 400; i++) {
    n.aktualisiere(0.05, fokus);
    for (const t of n.tropfen) if (t.an) {
      sichtbar++;
      ysMax = Math.max(ysMax, t.y);
      assert.ok(t.y >= -1 && t.y <= 90, `Höhe im Rahmen (${t.y})`);
    }
  }
  assert.ok(sichtbar > 0, 'es tropft');
  assert.ok(ysMax > 60, 'Tropfen starten an der Dachkante');
  const schnee = new StrassenNaesse({ welt: { ...nasseKarte(), schnee: true }, g: 32, hy: () => 0, wandHoehe: 84 });
  schnee.setze(1, 1);
  schnee.aktualisiere(0.1, fokus);
  assert.equal(schnee.strassen, null);
  assert.equal(schnee.kanten.length, 0);
  void THREE;
});

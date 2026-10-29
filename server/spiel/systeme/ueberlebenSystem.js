import { STANDARD_AUSRUESTUNG } from '../konfiguration/gegenstaende.js';
import { toeten } from './kampfSystem.js';
import { gibStartausruestung, kleidungsWaerme, kleidungsRegenschutz } from './inventarSystem.js';
import { bettFehlt, spawnPunkt } from './spawnSystem.js';
import { istGemuetlich } from '../../../gemeinsam/welt/einrichtung.js';
import { aktualisiereGesundheit, darfHeilen, neuerZustand } from './gesundheitSystem.js';
import { aktualisiereNiedergestreckt } from './mehrspielerSystem.js';

/**
 * Überleben: Hunger & Durst sinken, bei 0 verliert man Leben; satt & getränkt heilt man langsam.
 * Runde 23: Kälte (aktualisiereKaelte) – draußen in Kälte/Nacht/Unwetter steigt sie, Kleidung bremst, Wärme taut auf.
 * Runde 24: Gesundheit/Müdigkeit/Buffs/Verderb (gesundheitSystem) – Blutung & Co. blockieren die Heilung, Buff „satt“ halbiert den Hunger.
 * Tote Spieler werden nach respawnZeit an einem Startpunkt wiederbelebt – oder sofort per AKTION 'wiederbeleben'.
 */
export function aktualisiereUeberleben(spielWelt, dt) {
  const k = spielWelt.konfiguration.spieler;
  for (const spieler of spielWelt.alleVomTyp('spieler')) {
    if (spieler.tot) {
      spieler.respawnRest -= dt;
      if (spieler.respawnRest <= 0) wiederbeleben(spielWelt, spieler);
      continue;
    }
    if (spieler.niedergestreckt > 0) {
      aktualisiereNiedergestreckt(spielWelt, spieler, dt); // Runde 24
      continue;
    }
    spieler.statistik.ueberlebt += dt;
    // Runde 24: gemütlich (drinnen am Kamin oder zwischen Möbeln) → heilt schneller, wärmt mit (welt/einrichtung.js)
    spieler.gemuetlichPruefung = (spieler.gemuetlichPruefung ?? 0) - dt;
    if (spieler.gemuetlichPruefung <= 0) {
      spieler.gemuetlichPruefung = 1;
      spieler.gemuetlich = istGemuetlich(spielWelt.welt, spieler.x, spieler.y, spielWelt.welt.istInnen(spieler.x, spieler.y));
    }
    if (spieler.gottmodus) {
      spieler.kaelte = 0;
      continue; // Götter essen nicht und frieren nicht
    }
    aktualisiereKaelte(spielWelt, spieler, dt);
    const g = spielWelt.konfiguration.gesundheit;
    if (g) aktualisiereGesundheit(spielWelt, spieler, dt);
    if (spieler.tot) continue;
    spieler.hunger = Math.max(0, spieler.hunger - (k.hungerProMinute / 60) * (spieler.buffs?.satt ? g.sattFaktor : 1) * dt);
    spieler.durst = Math.max(0, spieler.durst - (k.durstProMinute / 60) * dt);

    if (spieler.hunger <= 0 || spieler.durst <= 0) {
      spieler.leben -= k.hungerSchadenProSekunde * dt;
      if (spieler.leben <= 0) toeten(spielWelt, spieler);
    } else if (spieler.hunger >= k.regenerationAb && spieler.durst >= k.regenerationAb && !(spieler.kaelte >= (spielWelt.konfiguration.kaelte?.keineHeilungAb ?? 101)) && (!g || darfHeilen(spieler, g))) {
      spieler.leben = Math.min(spieler.maxLeben, spieler.leben + k.regenerationProSekunde * (spieler.gemuetlich ? (k.gemuetlichFaktor ?? 2) : 1) * dt);
    }
  }
}

/** Kälte-Zuwachs pro Sekunde draußen ohne Kleidung (0 = mild, man wärmt sich langsam auf). */
export function kaelteRate(spielWelt, regenschutz = 0) {
  const k = spielWelt.konfiguration.kaelte;
  const schnee = spielWelt.welt?.schnee === true;
  const art = spielWelt.wetter?.art;
  let rate = schnee ? k.schneezone : 0;
  if (spielWelt.istNacht) rate += schnee ? k.schneeNacht : k.nacht;
  if (art === 'sturm') rate += schnee ? k.schneeSturm : k.sturm;
  else if (art && k[art] !== undefined && art !== 'nebel' && art !== 'klar') rate += k[art] * (1 - regenschutz); // Runde 24: Regenmantel
  return rate;
}

/**
 * Runde 23: Unterkühlung. Drinnen, im Auto, im Bett oder am brennenden Lagerfeuer wärmt man sich auf; draußen steigt die
 * Kälte je nach kaelteRate, gebremst durch die Wärme der Kleidung. Bei 100 sanfter Dauerschaden (Tutorial: aus).
 */
export function aktualisiereKaelte(spielWelt, spieler, dt) {
  const k = spielWelt.konfiguration.kaelte;
  if (!k?.aktiv || spielWelt.tutorial) {
    spieler.kaelte = 0;
    return;
  }
  const alt = spieler.kaelte ?? 0;
  let neu;
  const feuer = spielWelt.welt.naechstesBauwerk?.(spieler.x, spieler.y, k.feuerRadius, (b) => (b.typ === 'lagerfeuer' || b.typ === 'kamin') && b.brennt); // Runde 24: Kamin wärmt
  if (feuer) neu = alt - k.abbauFeuer * dt;
  else if (spieler.fahrzeug || spieler.arbeit?.art === 'schlafen' || spielWelt.welt.istInnen(spieler.x, spieler.y)) neu = alt - k.abbauDrinnen * dt;
  else {
    const rate = kaelteRate(spielWelt, kleidungsRegenschutz(spieler)) * Math.max(k.minFaktor, 1 - kleidungsWaerme(spieler) / 100);
    neu = rate > 0 ? alt + rate * (spieler.buffs?.warm ? spielWelt.konfiguration.gesundheit?.warmFaktor ?? 1 : 1) * dt : alt - k.abbau * dt;
  }
  spieler.kaelte = Math.max(0, Math.min(100, neu));
  if (spieler.kaelte >= 100) {
    if (alt < 100) spielWelt.melde(spieler.id, 'Du bist unterkühlt! Geh rein, ans Feuer oder zieh dich warm an');
    spieler.leben -= k.schadenProSekunde * dt;
    if (spieler.leben <= 0) toeten(spielWelt, spieler);
  } else if (alt < 70 && spieler.kaelte >= 70) spielWelt.melde(spieler.id, 'Dir ist eiskalt – such dir Wärme');
}

/**
 * Neu beginnen (nach Countdown oder sofort per Knopf): neben dem eigenen Bett (Spawn Point, spawnSystem.js),
 * sonst an einem zufälligen Startpunkt. Liegt das Bett in einer anderen Zone, zieht der SpielServer den Spieler dorthin um.
 */
export function wiederbeleben(spielWelt, spieler) {
  const k = spielWelt.konfiguration.spieler;
  let start = null;
  if (spieler.spawn) {
    if (spieler.spawn.karte !== spielWelt.karte.daten.id) {
      spieler.zonenwechsel = { ziel: spieler.spawn.karte, ankunft: null, name: 'Dein Bett', spawn: true };
    } else {
      start = spawnPunkt(spielWelt, spieler.spawn);
      if (!start) {
        if (bettFehlt(spielWelt, spieler.spawn)) spieler.spawn = null;
        spielWelt.melde(spieler.id, 'Dein Bett ist weg oder zugebaut – du startest am normalen Startpunkt');
      }
    }
  }
  start ??= spielWelt.zufall.auswahl(spielWelt.karte.spielerStarts);
  Object.assign(spieler, {
    x: start.x,
    y: start.y,
    tot: false,
    leben: spieler.maxLeben,
    hunger: k.startHunger,
    durst: k.startDurst,
    respawnRest: 0,
    ausdauer: k.ausdauerMax,
    erschoepft: false,
    ausgeruestet: null,
    ausruestung: STANDARD_AUSRUESTUNG,
    arbeit: null,
    kaelte: 0,
    zustand: neuerZustand(), // Runde 24
    muedigkeit: 0,
    buffs: {},
  });
  // Neues Leben, neue Grundausrüstung (das alte Inventar liegt noch eine Weile am Todesort)
  if (spieler.inventar.every((e) => e === null)) gibStartausruestung(spieler, spielWelt.konfiguration);
}

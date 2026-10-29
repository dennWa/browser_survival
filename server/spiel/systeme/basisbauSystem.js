import { BETT_TYPEN } from '../../../gemeinsam/welt/einrichtung.js';
import { BAUWERKE, ebeneVon, kachelInReichweite } from '../../../gemeinsam/welt/bauwerke.js';
import { BAUTEILE, BAU_REICHWEITE_BASIS, fehlendesMaterial, fussabdruck, kostenFuer, kostenProKachel, rueckerstattung } from '../../../gemeinsam/basisbau/teile.js';
import { autoDrehung, findeAbrissZiel, pruefeBauteil } from '../../../gemeinsam/basisbau/platzierung.js';
import { darfAbreissen } from '../../../gemeinsam/basisbau/rechte.js';
import { GEGENSTAENDE } from '../konfiguration/gegenstaende.js';
import { entferneItems, fuegeZumInventarHinzu, legeAufBoden } from './inventarSystem.js';
import { kachelBesetzt, neuesBauwerk } from './bauSystem.js';
import { schliesseKiste } from './kistenSystem.js';
import { vergissSpawnBei } from './spawnSystem.js';
import { flaggeFuerBauteil, flaggenOptionen, setzeFlagge } from './territoriumSystem.js';

/**
 * Basisbau (Server, autoritativ): Bauteile setzen und abreißen. Die Regeln selbst stehen in gemeinsam/basisbau/
 * (dieselben prüft der Client für das grün/rote Hologramm).
 *
 *   AKTION bauen    { teil, tx, ty, drehung? }   Bauteil aus BAUTEILE setzen (oder die Basis-Flagge)
 *   AKTION abreissen { tx, ty, ebene? }           mit dem Hammer ein Bauteil abreißen – 75 % der Kosten zurück
 *
 * Beides verlangt den Hammer in der Hand (der BUILD-Knopf rüstet ihn aus). Gebaut wird nur im eigenen Baugebiet
 * (territoriumSystem); Kosten werden aus dem Inventar genommen (Holz, Stein, Stoff …).
 */

export function hammerInHand(spieler) {
  return spieler.ausgeruestet !== null && spieler.inventar[spieler.ausgeruestet]?.defId === 'hammer';
}

function darfHandeln(spielWelt, spieler) {
  if (spieler.tot || spieler.fahrzeug) return false;
  if (!hammerInHand(spieler)) {
    spielWelt.melde(spieler.id, 'Rüste den Hammer aus (BUILD-Knopf)');
    return false;
  }
  return true;
}

/** AKTION bauen. */
export function baue(spielWelt, spieler, { teil: teilId, tx, ty, drehung = null }) {
  const teil = BAUTEILE[teilId];
  if (!teil || !Number.isInteger(tx) || !Number.isInteger(ty) || !darfHandeln(spielWelt, spieler)) return;
  const welt = spielWelt.welt;

  if (teil.art === 'flagge') {
    if (!kachelInReichweite(welt, spieler.x, spieler.y, tx, ty, BAU_REICHWEITE_BASIS)) return spielWelt.melde(spieler.id, 'Zu weit weg');
    setzeFlagge(spielWelt, spieler, tx, ty);
    return;
  }

  const blockGroesse = spielWelt.konfiguration.basisbau.blockGroesse ?? 1;
  const kontext = { territorium: spielWelt.territorium, name: spieler.name, spieler: { x: spieler.x, y: spieler.y }, flaggenOptionen: flaggenOptionen(spielWelt.konfiguration), blockGroesse };
  const pruefung = pruefeBauteil(welt, teilId, tx, ty, kontext);
  if (!pruefung.ok) return spielWelt.melde(spieler.id, pruefung.grund);
  const kacheln = fussabdruck(teilId, tx, ty, blockGroesse);
  if (BAUWERKE[teilId].blockiert && kacheln.some((k) => kachelBesetzt(spielWelt, k.tx, k.ty))) return spielWelt.melde(spieler.id, 'Da steht jemand');
  const kosten = kostenFuer(teilId, blockGroesse);
  const fehlt = fehlendesMaterial(spieler.inventar, kosten);
  if (fehlt.length > 0) {
    return spielWelt.melde(spieler.id, `Es fehlt: ${fehlt.map((f) => `${f.fehlt}× ${GEGENSTAENDE[f.defId]?.name ?? f.defId}`).join(', ')}`);
  }

  for (const [defId, menge] of Object.entries(kosten)) entferneItems(spieler, defId, menge);
  for (const k of kacheln) {
    const zusatz = teil.ausrichtung ? { drehung: ebeneVon(teilId) === 'tuer' ? autoDrehung(welt, teilId, k.tx, k.ty) : drehung === 0 || drehung === 1 ? drehung : autoDrehung(welt, teilId, k.tx, k.ty) } : {};
    welt.setzeBauwerk(neuesBauwerk(spielWelt, teilId, k.tx, k.ty, spieler.name, zusatz));
  }
  tx = kacheln[0].tx;
  ty = kacheln[0].ty;
  const g = welt.kachelGroesse;
  spielWelt.ereignis({ typ: 'gebaut', bauwerk: teilId, x: (tx + 0.5) * g, y: (ty + 0.5) * g, von: spieler.id });
  if (BETT_TYPEN.has(teilId)) spielWelt.melde(spieler.id, 'Schlafplatz steht – mit E schlafen & Spawn Point setzen');
}

/** AKTION abreissen. Eine Türöffnung nimmt ihre Tür mit. */
export function reisseAb(spielWelt, spieler, { tx, ty, ebene = null }) {
  if (!Number.isInteger(tx) || !Number.isInteger(ty) || !darfHandeln(spielWelt, spieler)) return;
  const welt = spielWelt.welt;
  if (!kachelInReichweite(welt, spieler.x, spieler.y, tx, ty, BAU_REICHWEITE_BASIS)) return spielWelt.melde(spieler.id, 'Zu weit weg');
  const ziel = findeAbrissZiel(welt, tx, ty, ebene);
  if (!ziel) return spielWelt.melde(spieler.id, 'Hier gibt es nichts zum Abreißen');
  if (!darfAbreissen(ziel, spieler.name, flaggeFuerBauteil(spielWelt, ziel)) && ziel.besitzer) {
    return spielWelt.melde(spieler.id, `Das gehört ${ziel.besitzer}`);
  }

  const abzureissen = [ziel];
  if (BAUWERKE[ziel.typ].rahmen) {
    const tuer = welt.bauwerkBei(tx, ty, 'tuer');
    if (tuer) abzureissen.unshift(tuer);
  }
  const erhalten = new Map(); // defId → Menge (für die Meldung)
  const g = welt.kachelGroesse;
  for (const b of abzureissen) {
    if (BAUWERKE[b.typ]?.kiste) leereKiste(spielWelt, spieler, b);
    if (BETT_TYPEN.has(b.typ)) vergissSpawnBei(spielWelt, b);
    for (const [defId, menge] of Object.entries(rueckerstattung(kostenProKachel(b.typ, spielWelt.konfiguration.basisbau.blockGroesse ?? 1), spielWelt.konfiguration.basisbau.rueckgabe))) {
      const rest = fuegeZumInventarHinzu(spieler, defId, menge);
      if (rest > 0) legeAufBoden(spielWelt, { defId, menge: rest }, spieler.x, spieler.y); // Inventar voll → vor die Füße
      erhalten.set(defId, (erhalten.get(defId) ?? 0) + menge);
    }
    welt.entferneBauwerk(b.id);
    spielWelt.ereignis({ typ: 'abgerissen', bauwerk: b.typ, x: (b.tx + 0.5) * g, y: (b.ty + 0.5) * g, von: spieler.id });
  }
  const text = [...erhalten].map(([defId, menge]) => `+${menge} ${GEGENSTAENDE[defId]?.name ?? defId}`).join(', ');
  spielWelt.melde(spieler.id, `${BAUWERKE[ziel.typ].name} abgerissen${text ? ` (${text})` : ''}`);
}

/** Kiste wird abgerissen: Inhalt fällt auf den Boden, offene Ansichten schließen sich. */
function leereKiste(spielWelt, spieler, kiste) {
  for (const s of spielWelt.alleVomTyp('spieler')) if (s.offeneKiste === kiste.id) schliesseKiste(spielWelt, s);
  const g = spielWelt.welt.kachelGroesse;
  for (const eintrag of kiste.inhalt ?? []) {
    if (eintrag) legeAufBoden(spielWelt, eintrag, (kiste.tx + 0.5) * g + (spielWelt.zufall.zahl() - 0.5) * 14, (kiste.ty + 0.5) * g + (spielWelt.zufall.zahl() - 0.5) * 14);
  }
  kiste.inhalt = [];
}

import { bewegeKoerper } from '../../../gemeinsam/physik/bewegung.js';
import { KACHELN } from '../../../gemeinsam/welt/kacheln.js';
import { erzeugeTier } from '../entitaeten/tier.js';
import { aktualisiereHaustier, begleite, spawneWildeTiere } from './haustierSystem.js';

/**
 * Hasen: hoppeln auf Rasen umher und rennen vor Spielern weg (scheuRadius). Runde 23: wie echte Hasen – sehr scheu
 * (Spieler, sprintende Spieler noch früher, Schüsse, fahrende Autos), fliehen dann eine lange Strecke (fluchtStrecke) im
 * Zickzack mit kurzen Hakenschlägen, auch wenn niemand folgt; danach kurz wachsam. Kleine Beute: 1× Fleisch
 * (kampfSystem.toeten). Erlegte Hasen kommen nach `tiere.hasenRespawn` Sekunden an anderer Stelle nach.
 * Anzahl: konfiguration.tiere.hasenProTausend je 1000 Rasen-Kacheln der Karte (höchstens hasenMax) – oder, wenn die Karte
 * Hasen-Bereiche hat (tierBereiche, Map-Editor), genau deren `anzahl` je Bereich (Respawn im selben Bereich).
 */
const MIN_ABSTAND_SPIELER = 360; // nicht vor den Augen eines Spielers (nach-)spawnen
const WANDER_TEMPO = 34;

/** Beim Erzeugen der Zone: Hasen auf zufällige Rasenkacheln setzen. */
export function spawneStartTiere(spielWelt) {
  const k = spielWelt.konfiguration.tiere;
  const welt = spielWelt.welt;
  // Hasen-Bereiche aus der Karte (Map-Editor): dann nur dort, je Bereich `anzahl`
  const bereiche = spielWelt.karte.tierBereiche ?? [];
  if (bereiche.length) {
    bereiche.forEach((bereich, i) => {
      for (let n = 0; n < bereich.anzahl; n++) spawneHase(spielWelt, 0, i);
    });
    return;
  }
  spawneWildeTiere(spielWelt); // Runde 24: streunende Hunde/Katzen, Hühner
  let gras = 0;
  for (let ty = 0; ty < welt.hoehe; ty++) for (let tx = 0; tx < welt.breite; tx++) if (istTierBoden(welt, tx, ty)) gras++;
  const anzahl = Math.min(k.hasenMax, Math.round((gras / 1000) * k.hasenProTausend));
  for (let i = 0; i < anzahl; i++) spawneHase(spielWelt, 0);
}

/** Hasen leben auf Rasen und im Schnee. */
function istTierBoden(welt, tx, ty) {
  const name = KACHELN[welt.kachelAn(tx, ty)]?.name;
  return name === 'gras' || name === 'schnee';
}

/**
 * Setzt einen Hasen auf eine freie Rasenkachel (mind. `abstand` px von jedem Spieler) – in Bereich `bereich` (Index in
 * karte.tierBereiche, dort auch auf anderem begehbarem Boden) oder irgendwo. @returns Hase oder null
 */
export function spawneHase(spielWelt, abstand = MIN_ABSTAND_SPIELER, bereich = null) {
  const welt = spielWelt.welt;
  const g = welt.kachelGroesse;
  const spieler = [...spielWelt.alleVomTyp('spieler')];
  const r = bereich === null ? null : spielWelt.karte.tierBereiche?.[bereich];
  for (let versuch = 0; versuch < 60; versuch++) {
    const tx = r ? spielWelt.zufall.ganzzahl(r.x, r.x + r.b - 1) : spielWelt.zufall.ganzzahl(1, welt.breite - 2);
    const ty = r ? spielWelt.zufall.ganzzahl(r.y, r.y + r.h - 1) : spielWelt.zufall.ganzzahl(1, welt.hoehe - 2);
    if ((!r && !istTierBoden(welt, tx, ty)) || welt.istBlockiert(tx, ty)) continue;
    const x = (tx + 0.5) * g;
    const y = (ty + 0.5) * g;
    if (spieler.some((s) => Math.hypot(s.x - x, s.y - y) < abstand)) continue;
    const hase = erzeugeTier({ id: spielWelt.neueId(), x, y, konfiguration: spielWelt.konfiguration });
    if (r) hase.bereich = bereich;
    return spielWelt.hinzufuegen(hase);
  }
  return null;
}

export function aktualisiereTiere(spielWelt, dt) {
  const k = spielWelt.konfiguration.tiere;
  const lebende = [...spielWelt.alleVomTyp('spieler')].filter((s) => !s.tot && !s.unsichtbar);
  // Schreckquellen dieses Ticks: Schüsse (Ereignis feuer) und fahrende Autos
  const schuesse = spielWelt.ereignisse.filter((e) => e.typ === 'feuer');
  const autos = [...spielWelt.alleVomTyp('fahrzeug')].filter((f) => Math.abs(f.tempo ?? 0) > 40);
  // Runde 24: Haustiere/Hühner haben eigenes Verhalten; alle 2 s eigene Tiere zum Besitzer holen
  spielWelt.begleitTakt = (spielWelt.begleitTakt ?? 0) - dt;
  if (spielWelt.begleitTakt <= 0) {
    spielWelt.begleitTakt = 2;
    for (const s of lebende) begleite(spielWelt, s);
  }
  for (const t of [...spielWelt.alleVomTyp('tier')]) {
    if (t.art !== 'hase') {
      aktualisiereHaustier(spielWelt, t, dt);
      continue;
    }
    const quelle = schreckQuelle(t, k, lebende, schuesse, autos);
    if (quelle) erschrecke(spielWelt, t, quelle);
    if (t.zustand === 'flucht') {
      fliehe(spielWelt, t, k, dt);
      continue;
    }
    t.zustand = 'ruhend';
    t.wachsam = Math.max(0, (t.wachsam ?? 0) - dt);
    t.pause -= dt;
    t.wanderTimer -= dt;
    if (t.wanderTimer <= 0) {
      t.wanderTimer = 2 + spielWelt.zufall.zahl() * 4;
      if (spielWelt.zufall.zahl() < 0.5) {
        t.wanderZiel = null; // sitzt still (frisst, schnuppert)
      } else {
        const w = spielWelt.zufall.zahl() * Math.PI * 2;
        const r = 30 + spielWelt.zufall.zahl() * 90;
        t.wanderZiel = { x: t.x + Math.cos(w) * r, y: t.y + Math.sin(w) * r };
      }
    }
    if (t.wanderZiel) {
      const abstand = Math.hypot(t.wanderZiel.x - t.x, t.wanderZiel.y - t.y);
      if (abstand < 4) t.wanderZiel = null;
      else laufe(spielWelt, t, Math.atan2(t.wanderZiel.y - t.y, t.wanderZiel.x - t.x), WANDER_TEMPO * dt);
    }
  }
  // Nachschub
  for (let i = spielWelt.tierRespawns.length - 1; i >= 0; i--) {
    const e = spielWelt.tierRespawns[i];
    e.rest -= dt;
    if (e.rest > 0) continue;
    if (spawneHase(spielWelt, MIN_ABSTAND_SPIELER, e.bereich ?? null)) spielWelt.tierRespawns.splice(i, 1);
    else e.rest = 10;
  }
}

/** Was erschreckt den Hasen gerade? → { x, y } (Richtung, von der er wegrennt) oder null. Wachsam = größerer Radius. */
function schreckQuelle(t, k, spieler, schuesse, autos) {
  const faktor = t.wachsam > 0 ? 1.3 : 1;
  for (const s of spieler) {
    const radius = k.hasenScheuRadius * faktor * (s.sprintet || s.fahrzeug ? k.sprintScheu ?? 1 : 1);
    if (Math.hypot(s.x - t.x, s.y - t.y) < radius) return s;
  }
  for (const e of schuesse) if (Math.hypot(e.x - t.x, e.y - t.y) < (k.schussScheuRadius ?? 0)) return e;
  for (const f of autos) if (Math.hypot(f.x - t.x, f.y - t.y) < (k.autoScheuRadius ?? 0)) return f;
  return null;
}

/** Flucht beginnen (bzw. Richtung erneuern, wenn die Gefahr wieder näher kommt). */
function erschrecke(spielWelt, t, quelle) {
  const [min, max] = spielWelt.konfiguration.tiere.fluchtStrecke ?? [600, 900];
  if (t.zustand !== 'flucht') {
    t.fluchtRest = min + spielWelt.zufall.zahl() * (max - min);
    t.fluchtZeit = 0;
    t.hakenTimer = 0;
  } else t.fluchtRest = Math.max(t.fluchtRest, min * 0.6); // wird weiter verfolgt → weiter rennen
  t.zustand = 'flucht';
  t.wanderZiel = null;
  t.fluchtVon = { x: quelle.x, y: quelle.y };
}

/** Lange Flucht im Zickzack (Hakenschlagen) weg von der Schreckquelle; danach wachsam ausruhen. */
function fliehe(spielWelt, t, k, dt) {
  t.fluchtZeit = (t.fluchtZeit ?? 0) + dt;
  t.hakenTimer = (t.hakenTimer ?? 0) - dt;
  if (t.hakenTimer <= 0) {
    // neuer Haken: 0,35–0,8 s in eine Richtung, ± bis 0,9 rad um „weg von der Gefahr“
    t.hakenTimer = 0.35 + spielWelt.zufall.zahl() * 0.45;
    t.haken = (spielWelt.zufall.zahl() * 2 - 1) * 0.9;
  }
  const weg = Math.atan2(t.y - t.fluchtVon.y, t.x - t.fluchtVon.x) + (t.haken ?? 0);
  const vorher = { x: t.x, y: t.y };
  laufe(spielWelt, t, weg, k.hasenTempo * dt);
  const geschafft = Math.hypot(t.x - vorher.x, t.y - vorher.y);
  if (geschafft < k.hasenTempo * dt * 0.3) t.hakenTimer = 0; // Hindernis: sofort neuen Haken schlagen
  t.fluchtRest -= Math.max(geschafft, k.hasenTempo * dt * 0.5);
  if (t.fluchtRest <= 0 || t.fluchtZeit > (k.fluchtZeitMax ?? 9)) {
    t.zustand = 'ruhend';
    t.wachsam = 6; // eine Weile besonders schreckhaft
    t.wanderTimer = 1.5 + spielWelt.zufall.zahl() * 2; // erst mal still sitzen
  }
}

function laufe(spielWelt, t, winkel, schritt) {
  const vorherX = t.x;
  const vorherY = t.y;
  t.blick = winkel;
  bewegeKoerper(t, Math.cos(winkel) * schritt, Math.sin(winkel) * schritt, t.radius, spielWelt.welt);
  // Steckt am Hindernis → neues Ziel suchen statt dagegen zu hoppeln
  if (Math.hypot(t.x - vorherX, t.y - vorherY) < schritt * 0.3) t.wanderZiel = null;
}

/** Hase erlegt (vom kampfSystem aufgerufen): Nachschub planen – im selben Hasen-Bereich, falls er aus einem kam. */
export function planeTierRespawn(spielWelt, hase = null) {
  const bereich = hase?.bereich ?? null;
  const rest = (bereich !== null ? spielWelt.karte.tierBereiche?.[bereich]?.respawnZeit : null) ?? spielWelt.konfiguration.tiere.hasenRespawn;
  spielWelt.tierRespawns.push({ rest, bereich });
}

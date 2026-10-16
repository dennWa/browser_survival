import { bewegeKoerper } from '../../../gemeinsam/physik/bewegung.js';
import { KACHELN } from '../../../gemeinsam/welt/kacheln.js';
import { erzeugeTier } from '../entitaeten/tier.js';

/**
 * Hasen: hoppeln auf Rasen umher und rennen vor Spielern weg (scheuRadius). Kleine Beute: 1× Fleisch
 * (kampfSystem.toeten). Erlegte Hasen kommen nach `tiere.hasenRespawn` Sekunden an anderer Stelle nach.
 * Anzahl: konfiguration.tiere.hasenProTausend je 1000 Rasen-Kacheln der Karte (höchstens hasenMax).
 */
const MIN_ABSTAND_SPIELER = 360; // nicht vor den Augen eines Spielers (nach-)spawnen
const WANDER_TEMPO = 34;

/** Beim Erzeugen der Zone: Hasen auf zufällige Rasenkacheln setzen. */
export function spawneStartTiere(spielWelt) {
  const k = spielWelt.konfiguration.tiere;
  const welt = spielWelt.welt;
  let gras = 0;
  for (let ty = 0; ty < welt.hoehe; ty++) for (let tx = 0; tx < welt.breite; tx++) if (KACHELN[welt.kachelAn(tx, ty)]?.name === 'gras') gras++;
  const anzahl = Math.min(k.hasenMax, Math.round((gras / 1000) * k.hasenProTausend));
  for (let i = 0; i < anzahl; i++) spawneHase(spielWelt, 0);
}

/** Setzt einen Hasen auf eine freie Rasenkachel (mind. `abstand` px von jedem Spieler). @returns Hase oder null */
export function spawneHase(spielWelt, abstand = MIN_ABSTAND_SPIELER) {
  const welt = spielWelt.welt;
  const g = welt.kachelGroesse;
  const spieler = [...spielWelt.alleVomTyp('spieler')];
  for (let versuch = 0; versuch < 60; versuch++) {
    const tx = spielWelt.zufall.ganzzahl(1, welt.breite - 2);
    const ty = spielWelt.zufall.ganzzahl(1, welt.hoehe - 2);
    if (KACHELN[welt.kachelAn(tx, ty)]?.name !== 'gras' || welt.istBlockiert(tx, ty)) continue;
    const x = (tx + 0.5) * g;
    const y = (ty + 0.5) * g;
    if (spieler.some((s) => Math.hypot(s.x - x, s.y - y) < abstand)) continue;
    return spielWelt.hinzufuegen(erzeugeTier({ id: spielWelt.neueId(), x, y, konfiguration: spielWelt.konfiguration }));
  }
  return null;
}

export function aktualisiereTiere(spielWelt, dt) {
  const k = spielWelt.konfiguration.tiere;
  const lebende = [...spielWelt.alleVomTyp('spieler')].filter((s) => !s.tot && !s.unsichtbar);
  for (const t of spielWelt.alleVomTyp('tier')) {
    let scheu = null;
    let best = k.hasenScheuRadius;
    for (const s of lebende) {
      const abstand = Math.hypot(s.x - t.x, s.y - t.y);
      if (abstand < best) {
        best = abstand;
        scheu = s;
      }
    }
    if (scheu) {
      t.zustand = 'flucht';
      t.wanderZiel = null;
      // weg vom Spieler, leicht zickzack
      const weg = Math.atan2(t.y - scheu.y, t.x - scheu.x) + Math.sin((spielWelt.tick + t.id * 7) / 5) * 0.6;
      laufe(spielWelt, t, weg, k.hasenTempo * dt);
      continue;
    }
    t.zustand = 'ruhend';
    t.pause -= dt;
    t.wanderTimer -= dt;
    if (t.wanderTimer <= 0) {
      t.wanderTimer = 2 + spielWelt.zufall.zahl() * 4;
      if (spielWelt.zufall.zahl() < 0.45) {
        t.wanderZiel = null; // sitzt still
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
    spielWelt.tierRespawns[i] -= dt;
    if (spielWelt.tierRespawns[i] > 0) continue;
    if (spawneHase(spielWelt)) spielWelt.tierRespawns.splice(i, 1);
    else spielWelt.tierRespawns[i] = 10;
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

/** Hase erlegt (vom kampfSystem aufgerufen): Nachschub planen. */
export function planeTierRespawn(spielWelt) {
  spielWelt.tierRespawns.push(spielWelt.konfiguration.tiere.hasenRespawn);
}

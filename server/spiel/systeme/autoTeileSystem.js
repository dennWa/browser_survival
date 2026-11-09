import { fuegeZumInventarHinzu, legeAufBoden } from './inventarSystem.js';
import { abstandZumFahrzeug, EINSTIEG_ABSTAND } from '../../../gemeinsam/physik/fahrzeug.js';

/**
 * Runde 47: Auto-Teile – Tank (Liter), 4 Reifen, Batterie (fz.tank/reifen/batterie). Fahrbereit = nicht kaputt + Sprit + 4 Reifen +
 * Batterie → `fz.antrieb` (gemeinsam/physik/fahrzeug.js fahre(): ohne Antrieb nur ausrollen/bremsen – auch in der Client-Vorhersage).
 * Werte K `fahrzeug.teile` { tankMax, verbrauchProPx, kanisterLiter, spawnVoll } – vorerst spawnen alle Autos voll (Nutzer-Wunsch),
 * die Teile liegen als Loot herum (benzin = Benzinkanister, reifen, autobatterie; Tankstelle/Werkstatt).
 * AKTION `auto` { was: tanken | reifenRein | reifenRaus | batterieRein | batterieRaus } am offenen Kofferraum, im Auto oder am nächsten Auto.
 * Der Zustand geht mit der Kofferraum-Ansicht an den Client (kistenSystem → NACHRICHT.KISTE { auto }) → Auto-Menü.
 */
export const AUTO_WAS = Object.freeze(['tanken', 'reifenRein', 'reifenRaus', 'batterieRein', 'batterieRaus']);

export function neueTeile(k, voll = k?.spawnVoll !== false) {
  return { tank: voll ? (k?.tankMax ?? 40) : 0, reifen: voll ? 4 : 0, batterie: voll };
}

/** Teile aus einem Weltstand (alles geprüft; alte Stände ohne Teile → voll). */
export function pruefeTeile(f, k) {
  const voll = neueTeile(k, true);
  if (!f || (f.tank === undefined && f.reifen === undefined && f.batterie === undefined)) return voll;
  return {
    tank: Number.isFinite(f.tank) ? Math.max(0, Math.min(voll.tank, f.tank)) : voll.tank,
    reifen: Number.isInteger(f.reifen) ? Math.max(0, Math.min(4, f.reifen)) : 4,
    batterie: f.batterie !== false,
  };
}

/** Was fehlt zum Losfahren? ['Sprit', 'Batterie', '2 Reifen'] */
export function fehlteile(fz) {
  const fehlt = [];
  if (!(fz.tank > 0)) fehlt.push('Sprit');
  if ((fz.reifen ?? 4) < 4) fehlt.push(4 - fz.reifen === 1 ? '1 Reifen' : `${4 - fz.reifen} Reifen`);
  if (fz.batterie === false) fehlt.push('Batterie');
  return fehlt;
}

export function fahrbereit(fz) {
  return !fz.kaputt && fehlteile(fz).length === 0;
}

/** Für das Auto-Menü (nur an den, der den Kofferraum offen hat) */
export function teileFuerClient(fz, k) {
  return { tank: Math.round((fz.tank ?? 0) * 10) / 10, tankMax: k?.tankMax ?? 40, reifen: fz.reifen ?? 4, batterie: fz.batterie !== false, leben: Math.round(fz.leben * 10) / 10, maxLeben: fz.maxLeben, kaputt: !!fz.kaputt, fehlt: fehlteile(fz) };
}

/** Pro Tick je Auto (fahrzeugSystem.aktualisiereFahrzeuge): Sprit nach gefahrener Strecke, Antrieb an/aus. */
export function aktualisiereTeile(spielWelt, fz) {
  const k = spielWelt.konfiguration.fahrzeug.teile;
  if (fz.tank === undefined) Object.assign(fz, neueTeile(k));
  const weg = Number.isFinite(fz.letzteX) ? Math.hypot(fz.x - fz.letzteX, fz.y - fz.letzteY) : 0;
  fz.letzteX = fz.x;
  fz.letzteY = fz.y;
  if (fz.fahrerId !== null && weg > 0 && weg < 200 && fz.tank > 0) {
    fz.tank = Math.max(0, fz.tank - weg * (k?.verbrauchProPx ?? 0));
    if (fz.tank === 0) spielWelt.melde(fz.fahrerId, '⛽ Der Tank ist leer – füll ihn mit einem Benzinkanister auf (Auto-Menü: G)');
  }
  fz.antrieb = fahrbereit(fz);
}

/** Auto, an dem der Spieler gerade schraubt: offener Kofferraum > eigenes Auto > nächstes Auto in Reichweite. */
function zielAuto(spielWelt, spieler) {
  const ref = spieler.offeneKiste;
  if (typeof ref === 'string' && ref[0] === 'f') {
    const fz = spielWelt.holen(Number(ref.slice(1)));
    if (fz?.typ === 'fahrzeug') return fz;
  }
  if (spieler.fahrzeug) return spieler.fahrzeug;
  let best = null;
  let bestAbstand = EINSTIEG_ABSTAND;
  for (const f of spielWelt.alleVomTyp('fahrzeug')) {
    const a = abstandZumFahrzeug(f, spieler.x, spieler.y);
    if (a <= bestAbstand) [best, bestAbstand] = [f, a];
  }
  return best;
}

function nimmItem(spieler, defId) {
  const slot = spieler.inventar.findIndex((e) => e?.defId === defId);
  if (slot < 0) return false;
  const e = spieler.inventar[slot];
  e.menge -= 1;
  if (e.menge <= 0) {
    spieler.inventar[slot] = null;
    if (spieler.ausgeruestet === slot) spieler.ausgeruestet = null;
  }
  return true;
}

function gibItem(spielWelt, spieler, defId) {
  const rest = fuegeZumInventarHinzu(spieler, defId, 1);
  if (rest > 0) legeAufBoden(spielWelt, { defId, menge: rest }, spieler.x, spieler.y);
}

/** @returns true, wenn sich am Auto etwas geändert hat (→ Ansicht auffrischen) */
export function autoAktion(spielWelt, spieler, was) {
  const fz = zielAuto(spielWelt, spieler);
  if (!fz) return spielWelt.melde(spieler.id, 'Kein Auto in der Nähe'), false;
  const k = spielWelt.konfiguration.fahrzeug.teile;
  if (fz.tank === undefined) Object.assign(fz, neueTeile(k));
  const melde = (t) => spielWelt.melde(spieler.id, t);
  switch (was) {
    case 'tanken': {
      const max = k?.tankMax ?? 40;
      if (fz.tank >= max - 0.05) return melde('⛽ Der Tank ist schon voll'), false;
      if (!nimmItem(spieler, 'benzin')) return melde('⛽ Du brauchst einen Benzinkanister'), false;
      fz.tank = Math.min(max, fz.tank + (k?.kanisterLiter ?? 20));
      spielWelt.ereignis({ typ: 'tanken', x: fz.x, y: fz.y, von: spieler.id });
      melde(`⛽ Getankt – ${Math.round(fz.tank)} / ${max} Liter`);
      break;
    }
    case 'reifenRein':
      if (fz.reifen >= 4) return melde('🛞 Alle vier Reifen sind dran'), false;
      if (!nimmItem(spieler, 'reifen')) return melde('🛞 Du brauchst einen Autoreifen'), false;
      fz.reifen += 1;
      melde(`🛞 Reifen montiert (${fz.reifen}/4)`);
      break;
    case 'reifenRaus':
      if (fz.fahrerId !== null || fz.reifen <= 0) return false;
      fz.reifen -= 1;
      gibItem(spielWelt, spieler, 'reifen');
      melde(`🛞 Reifen abgenommen (${fz.reifen}/4)`);
      break;
    case 'batterieRein':
      if (fz.batterie) return melde('🔋 Es ist schon eine Batterie drin'), false;
      if (!nimmItem(spieler, 'autobatterie')) return melde('🔋 Du brauchst eine Autobatterie'), false;
      fz.batterie = true;
      melde('🔋 Batterie eingebaut');
      break;
    case 'batterieRaus':
      if (fz.fahrerId !== null || !fz.batterie) return false;
      fz.batterie = false;
      gibItem(spielWelt, spieler, 'autobatterie');
      melde('🔋 Batterie ausgebaut');
      break;
    default:
      return false;
  }
  spielWelt.ereignis({ typ: 'schrauben', x: fz.x, y: fz.y, von: spieler.id });
  fz.antrieb = fahrbereit(fz);
  return true;
}

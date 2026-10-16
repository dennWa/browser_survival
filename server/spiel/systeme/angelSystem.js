import { KACHELN } from '../../../gemeinsam/welt/kacheln.js';
import { GEGENSTAENDE } from '../konfiguration/gegenstaende.js';
import { fuegeZumInventarHinzu, legeAufBoden } from './inventarSystem.js';

/**
 * Angeln. Die Angel muss nur im Inventar liegen ("auto-ausgerüstet"). Linksklick in Richtung Wasser wirft aus
 * (statt anzugreifen), die Pose liegt dann im Wasser:
 *
 *   spieler.angeln = { phase: 'wartet' | 'biss', rest, x, y (Pose, Pixel), startX, startY }
 *
 *   wartet  → nach wartenMin…wartenMax Sekunden beißt etwas
 *   biss    → Pose wackelt bissMin…bissMax Sekunden (2–3 s): in dieser Zeit nochmal Linksklick = Fang
 *   Klick während "wartet" holt die Pose zu früh ein (nichts gefangen); Bewegung, Schaden, Tod, Auto → Abbruch
 *
 * Fang: ein Fisch (Barsch/Forelle/Hecht nach Gewicht), mit doppelChance (10 %) gleich zwei.
 * Werte: konfiguration.angeln. Öffentlich (Netz) ist nur { phase, x, y } → Pose + Schnur im Renderer.
 */
const ABBRUCH_WEG = 14;
const MIN_WURF = 36; // px: mindestens so weit weg muss das Wasser sein
const ZOMBIE_SPERRE = 260; // jagt einen ein Zombie in dieser Nähe, ist Linksklick immer Angriff

export const istWasserKachel = (welt, tx, ty) => KACHELN[welt.kachelAn(tx, ty)]?.wasser === true;

/** Wo würde die Pose landen, wenn man von (x, y) in Richtung `blick` auswirft? { x, y } oder null (kein Wasser in Reichweite). */
export function wurfZiel(welt, x, y, blick, reichweite) {
  const g = welt.kachelGroesse;
  const dx = Math.cos(blick);
  const dy = Math.sin(blick);
  for (let d = MIN_WURF; d <= reichweite; d += 6) {
    const px = x + dx * d;
    const py = y + dy * d;
    const tx = Math.floor(px / g);
    const ty = Math.floor(py / g);
    if (istWasserKachel(welt, tx, ty)) {
      // ein Stück weiter ins Wasser, solange es Wasser bleibt
      let weit = d;
      while (weit + 10 <= reichweite && istWasserKachel(welt, Math.floor((x + dx * (weit + 10)) / g), Math.floor((y + dy * (weit + 10)) / g))) weit += 10;
      return { x: x + dx * Math.min(weit, d + 40), y: y + dy * Math.min(weit, d + 40) };
    }
    if (welt.istSichtBlockiert(tx, ty)) return null; // Wand davor
  }
  return null;
}

/**
 * Wird vom kampfSystem jeden Tick VOR dem Angriff aufgerufen.
 * @returns true, wenn der Linksklick fürs Angeln gebraucht wurde (oder man gerade angelt) → kein Angriff
 */
export function behandleAngelKlick(spielWelt, spieler) {
  const neuerKlick = spieler.angriff && !spieler.angriffVorher;
  spieler.angriffVorher = spieler.angriff;
  if (spieler.tot || spieler.fahrzeug) {
    spieler.angeln = null;
    return false;
  }
  const a = spieler.angeln;
  if (a) {
    if (neuerKlick) {
      if (a.phase === 'biss') faenge(spielWelt, spieler);
      else {
        spielWelt.melde(spieler.id, 'Zu früh! Pose eingeholt');
        spieler.angeln = null;
      }
    }
    return spieler.angriff || neuerKlick; // solange geklickt wird, nicht schießen
  }
  if (!neuerKlick || !spieler.inventar.some((e) => e?.defId === 'angel')) return false;
  const k = spielWelt.konfiguration.angeln;
  const gejagt = [...spielWelt.alleVomTyp('zombie')].some((z) => z.zielId === spieler.id && Math.hypot(z.x - spieler.x, z.y - spieler.y) < ZOMBIE_SPERRE);
  if (gejagt) return false;
  const ziel = wurfZiel(spielWelt.welt, spieler.x, spieler.y, spieler.blick, k.reichweite);
  if (!ziel) return false;
  if (spieler.arbeit) spieler.arbeit = null;
  spieler.nachladenRest = 0;
  spieler.angeln = { phase: 'wartet', rest: k.wartenMin + spielWelt.zufall.zahl() * (k.wartenMax - k.wartenMin), x: ziel.x, y: ziel.y, startX: spieler.x, startY: spieler.y };
  spielWelt.ereignis({ typ: 'angelWurf', von: spieler.id, x: ziel.x, y: ziel.y });
  spielWelt.melde(spieler.id, '🎣 Pose ausgeworfen – warte auf den Biss …');
  return true;
}

/** Pro Tick: Warten → Biss → verpasst. */
export function aktualisiereAngeln(spielWelt, dt) {
  const k = spielWelt.konfiguration.angeln;
  for (const spieler of spielWelt.alleVomTyp('spieler')) {
    const a = spieler.angeln;
    if (!a) continue;
    if (spieler.tot || spieler.fahrzeug || Math.hypot(spieler.x - a.startX, spieler.y - a.startY) > ABBRUCH_WEG) {
      spieler.angeln = null;
      continue;
    }
    a.rest -= dt;
    if (a.rest > 0) continue;
    if (a.phase === 'wartet') {
      a.phase = 'biss';
      a.rest = k.bissMin + spielWelt.zufall.zahl() * (k.bissMax - k.bissMin);
      spielWelt.ereignis({ typ: 'angelBiss', von: spieler.id, x: a.x, y: a.y });
    } else {
      spieler.angeln = null;
      spielWelt.melde(spieler.id, 'Zu spät – der Fisch ist weg');
    }
  }
}

/** Abbruch von außen (z. B. Schaden). */
export function brecheAngelnAb(spieler) {
  spieler.angeln = null;
}

function faenge(spielWelt, spieler) {
  const k = spielWelt.konfiguration.angeln;
  const a = spieler.angeln;
  spieler.angeln = null;
  const anzahl = spielWelt.zufall.zahl() < k.doppelChance ? 2 : 1;
  const tabelle = Object.entries(k.fische).map(([id, gewicht]) => ({ id, gewicht }));
  const namen = [];
  for (let i = 0; i < anzahl; i++) {
    const { id } = spielWelt.zufall.gewichteteAuswahl(tabelle);
    namen.push(GEGENSTAENDE[id].name);
    if (fuegeZumInventarHinzu(spieler, id, 1) > 0) legeAufBoden(spielWelt, { defId: id, menge: 1 }, spieler.x, spieler.y);
  }
  spielWelt.ereignis({ typ: 'gefangen', von: spieler.id, x: a.x, y: a.y, anzahl });
  spielWelt.melde(spieler.id, anzahl > 1 ? `🎣 Doppelfang! ${namen.join(' + ')}` : `🎣 ${namen[0]} gefangen!`);
}

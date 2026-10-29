import { bewegeKoerper } from '../../../gemeinsam/physik/bewegung.js';
import { lerpWinkel } from '../../../gemeinsam/mathe.js';
import { fuegeSchadenZu } from './kampfSystem.js';
import { explosion } from './explosionSystem.js';

/**
 * Runde 24: Sonder-Zombies (Werte in konfiguration.zombie.varianten):
 *   spucker   – hält Abstand (`halteAbstand`) und spuckt Säure im Bogen (`spuckReichweite`, `spuckSchaden`, `spuckAbklingzeit`).
 *               Die Spucke fliegt `SPUCK_FLUGZEIT` s (spielWelt.spuckeFluege) und trifft nur, wer dann noch im Radius steht → ausweichen!
 *   explosiv  – zündet (`zuendZeit` s, Ereignis 'zuendung') neben dem Ziel oder vor einer Spielerwand/-tür, die ihm den Weg versperrt
 *               (dann läuft er stur geradeaus statt aufzugeben). Explosion (`explosion`): Schaden mit Abfall bis `sprengRadius`, zerstört
 *               Spieler-Bauwerke (Wand/Tür/Objekt) im `sprengKachelRadius`. Stirbt er vorher, explodiert er sofort.
 *   gepanzert – `panzer` (0..1) schluckt Anteil Schaden (kampfSystem.fuegeSchadenZu; `durchschlag` an der Waffe hebt ihn auf).
 *   sprinter  – nur Werte (sehr schnell, wenig Leben).
 * Ereignisse: 'spucke' {von,x,y,zx,zy,dauer} · 'spuckeTrifft' {x,y} · 'zuendung' {id,x,y} · 'explosion' {x,y,radius}.
 */
export const SPUCK_FLUGZEIT = 0.75;
const SPUCK_TREFFRADIUS = 30;
const ZUEND_ABSTAND = 46;

/** Pro Zombie aus zombieSystem. @returns true = Bewegung erledigt (normales Verfolgen überspringen) */
export function sonderVerhalten(spielWelt, z, ziel, abstand, sicht, dt) {
  const v = variantenWerte(spielWelt, z);
  if (!v) return false;
  if (v.spuckReichweite) return spucker(spielWelt, z, v, ziel, abstand, sicht, dt);
  if (v.sprengRadius) return explosiv(spielWelt, z, v, ziel, abstand, dt);
  return false;
}

function variantenWerte(spielWelt, z) {
  return spielWelt.konfiguration.zombie.varianten?.[z.variante] ?? null;
}

function spucker(spielWelt, z, v, ziel, abstand, sicht, dt) {
  z.spuckRest = Math.max(0, (z.spuckRest ?? 1) - dt);
  if (!ziel || !sicht) return false;
  z.blick = lerpWinkel(z.blick, Math.atan2(ziel.y - z.y, ziel.x - z.x), Math.min(1, dt * 8));
  if (abstand <= v.spuckReichweite && z.spuckRest <= 0 && !ziel.fahrzeug) {
    z.spuckRest = v.spuckAbklingzeit ?? 3;
    spielWelt.setzeAktion(z, 'angriff', 0.5);
    // Ziel = Stelle, an der der Spieler JETZT steht – wer weiterläuft, weicht aus
    const zx = ziel.x;
    const zy = ziel.y;
    spielWelt.spuckeFluege.push({ x: zx, y: zy, rest: SPUCK_FLUGZEIT, schaden: v.spuckSchaden ?? 10, von: z.id });
    spielWelt.ereignis({ typ: 'spucke', von: z.id, x: z.x, y: z.y, zx, zy, dauer: SPUCK_FLUGZEIT });
  }
  // Abstand halten: näher als halteAbstand → zurückweichen, sonst stehen bleiben (Nahkampf nur, wenn man ihn stellt)
  if (abstand < (v.halteAbstand ?? 120) * 0.6) return false;
  if (abstand < (v.halteAbstand ?? 120)) {
    const w = Math.atan2(z.y - ziel.y, z.x - ziel.x);
    bewegeKoerper(z, Math.cos(w) * z.jagdGeschwindigkeit * 0.5 * dt, Math.sin(w) * z.jagdGeschwindigkeit * 0.5 * dt, z.radius, spielWelt.welt);
    z.zustand = 'verfolgend';
    return true;
  }
  if (abstand <= v.spuckReichweite) {
    z.zustand = 'verfolgend';
    return true;
  }
  return false;
}

function explosiv(spielWelt, z, v, ziel, abstand, dt) {
  if (z.zuendung !== undefined) {
    z.zuendung -= dt;
    z.zustand = 'angreifend';
    if (z.zuendung <= 0) explodiere(spielWelt, z);
    return true;
  }
  if (ziel) z.sprengZiel = { x: ziel.x, y: ziel.y };
  if (ziel && abstand <= ZUEND_ABSTAND) return zuende(spielWelt, z, v);
  // Weg versperrt (A* gab auf)? Stur zum letzten Ziel – steht eine Spielerwand im Weg, sprengt er sie
  if (!ziel && z.gibAuf > 0 && z.sprengZiel) {
    const w = Math.atan2(z.sprengZiel.y - z.y, z.sprengZiel.x - z.x);
    if (spielerWandVor(spielWelt, z, w)) return zuende(spielWelt, z, v);
    if (Math.hypot(z.sprengZiel.x - z.x, z.sprengZiel.y - z.y) < 20) z.sprengZiel = null;
    else {
      const weg = z.jagdGeschwindigkeit * dt;
      bewegeKoerper(z, Math.cos(w) * weg, Math.sin(w) * weg, z.radius, spielWelt.welt);
      z.blick = lerpWinkel(z.blick, w, Math.min(1, dt * 8));
      z.zustand = 'verfolgend';
    }
    return true;
  }
  return false;
}

function zuende(spielWelt, z, v) {
  z.zuendung = v.zuendZeit ?? 1.2;
  z.zustand = 'angreifend';
  spielWelt.ereignis({ typ: 'zuendung', id: z.id, x: z.x, y: z.y });
  return true;
}

/** Spieler-Bauwerk (Wand/Tür/Objekt mit Besitzer) in Laufrichtung direkt vor dem Zombie? */
function spielerWandVor(spielWelt, z, winkel) {
  const welt = spielWelt.welt;
  const g = welt.kachelGroesse;
  for (const d of [z.radius + 6, z.radius + 18]) {
    const tx = Math.floor((z.x + Math.cos(winkel) * d) / g);
    const ty = Math.floor((z.y + Math.sin(winkel) * d) / g);
    for (const b of welt.bauwerkeAn(tx, ty)) if (b.besitzer != null && b.typ !== 'erdfeld') return true;
  }
  return false;
}

/** Explosion an der Stelle des Zombies (auch bei seinem Tod): Schaden für alle im Radius, Spieler-Bauwerke in der Nähe gehen kaputt. */
export function explodiere(spielWelt, z) {
  if (z.explodiert) return;
  z.explodiert = true;
  const v = variantenWerte(spielWelt, z) ?? {};
  if (spielWelt.holen(z.id)) spielWelt.entfernen(z.id);
  explosion(spielWelt, z.x, z.y, { radius: v.sprengRadius ?? 90, schaden: v.sprengSchaden ?? 45, kachelRadius: v.sprengKachelRadius ?? 1.5, quelle: z, ohneId: z.id });
}

/** Fliegende Spucke: landet nach SPUCK_FLUGZEIT, trifft Spieler im Radius. Einmal pro Tick aus zombieSystem. */
export function aktualisiereSpucke(spielWelt, dt) {
  const fluege = spielWelt.spuckeFluege;
  for (let i = fluege.length - 1; i >= 0; i--) {
    const f = fluege[i];
    f.rest -= dt;
    if (f.rest > 0) continue;
    fluege.splice(i, 1);
    spielWelt.ereignis({ typ: 'spuckeTrifft', x: f.x, y: f.y });
    const quelle = spielWelt.holen(f.von) ?? { typ: 'zombie', id: f.von, angriffsSchaden: f.schaden };
    for (const s of spielWelt.alleVomTyp('spieler')) {
      if (s.tot || s.fahrzeug) continue;
      if (Math.hypot(s.x - f.x, s.y - f.y) <= SPUCK_TREFFRADIUS + 10) fuegeSchadenZu(spielWelt, s, f.schaden, quelle, Math.atan2(s.y - f.y, s.x - f.x), { saeure: true });
    }
  }
}

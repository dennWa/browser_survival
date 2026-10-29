import { BETT_TYPEN } from '../../../gemeinsam/welt/einrichtung.js';
/**
 * Spawn Point (Bett): E am eigenen Bett setzt den Respawn-Punkt (spieler.spawn = { karte, tx, ty }).
 * Nach dem Tod wacht man neben dem Bett auf (ueberlebenSystem.wiederbeleben); ist es in einer anderen Zone, zieht
 * der Server den Spieler dorthin um (spielServer.#wechsleZone). Fehlt das Bett inzwischen, gilt wieder der normale Start.
 * Der Spawn wird im Spielstand gespeichert (spielstand.js).
 */

/** E am Bett: Spawn Point setzen. (Rechte prüft bauSystem.benutzeBauwerk vorher.) */
export function setzeSpawn(spielWelt, spieler, bett, leise = false) {
  const neu = { karte: spielWelt.karte.daten.id, tx: bett.tx, ty: bett.ty };
  const gleich = spieler.spawn && spieler.spawn.karte === neu.karte && spieler.spawn.tx === neu.tx && spieler.spawn.ty === neu.ty;
  spieler.spawn = neu;
  const g = spielWelt.welt.kachelGroesse;
  spielWelt.ereignis({ typ: 'spawnGesetzt', x: (bett.tx + 0.5) * g, y: (bett.ty + 0.5) * g, von: spieler.id });
  if (gleich && leise) return;
  spielWelt.melde(spieler.id, gleich ? 'Spawn Point ist schon hier' : 'Spawn Point gesetzt – hier wachst du nach dem Tod wieder auf');
}

/**
 * Wo wacht man auf? Die freie Kachel neben dem Bett (4er-, dann diagonale Nachbarn) in Pixeln – oder null,
 * wenn das Bett fehlt (→ `bettFehlt`) bzw. zugebaut ist.
 * @returns {{ x: number, y: number } | null}
 */
export function spawnPunkt(spielWelt, spawn) {
  const welt = spielWelt.welt;
  if (!spawn || !BETT_TYPEN.has(welt.bauwerkBei(spawn.tx, spawn.ty)?.typ)) return null;
  const g = welt.kachelGroesse;
  for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const tx = spawn.tx + dx;
    const ty = spawn.ty + dy;
    if (!welt.istBlockiert(tx, ty)) return { x: (tx + 0.5) * g, y: (ty + 0.5) * g };
  }
  return null;
}

/** Steht das Bett noch? (Nur für Spawns in dieser Zone sinnvoll.) */
export function bettFehlt(spielWelt, spawn) {
  return !BETT_TYPEN.has(spielWelt.welt.bauwerkBei(spawn.tx, spawn.ty)?.typ);
}

/** Bett abgerissen: alle online-Spieler dieser Zone, deren Spawn darauf zeigt, verlieren ihn (Offline-Spieler merken es beim Respawn). */
export function vergissSpawnBei(spielWelt, bett) {
  const karte = spielWelt.karte.daten.id;
  for (const s of spielWelt.alleVomTyp('spieler')) {
    if (s.spawn && s.spawn.karte === karte && s.spawn.tx === bett.tx && s.spawn.ty === bett.ty) {
      s.spawn = null;
      spielWelt.melde(s.id, 'Dein Spawn Point wurde abgerissen');
    }
  }
}

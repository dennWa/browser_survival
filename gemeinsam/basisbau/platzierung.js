import { BAUWERKE, ebeneVon, kachelInReichweite, pruefePlatz } from '../welt/bauwerke.js';
import { BAUTEILE, BAU_REICHWEITE_BASIS } from './teile.js';
import { RECHT, hatRecht } from './rechte.js';
import { pruefeFlaggenPlatz } from './territorium.js';

/**
 * Basisbau – Platzieren & Snapping (Server UND Client: Hologramm-Farbe = Server-Prüfung).
 *
 * Das Bauraster ist die Kachel (32 px). "Andocken" heißt hier: Das Teil rastet auf die passende Kachel ein –
 * Wände nur neben Boden oder Wand (Kachel mit Boden oder 4er-Nachbar; Eckwände auch diagonal am Boden), Dach über Boden/Wand bzw. neben einem Dach,
 * Tür nur in eine Türöffnung. Zeigt man knapp daneben, springt das Teil auf die nächste gültige Nachbarkachel (Magnet).
 *
 * kontext = { territorium, name, spieler?: { x, y }, reichweite?, flaggenOptionen? }
 *   territorium  Territorium (Server: alle Flaggen der Zone; Client: nur die eigene)
 *   name         wer baut
 *   spieler      Position – ohne Angabe keine Reichweitenprüfung
 */

const NACHBARN = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const DIAGONALEN = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
const MAGNET_EBENEN = new Set(['wand', 'tuer', 'dach']);
const EBENEN_NAMEN = { boden: 'Boden', wand: 'Wand', dach: 'Dach' };

/** Dockt das Teil an? (Snapping-Bedingung des Bauwerk-Typs, siehe `anschluss` in bauwerke.js) */
export function pruefeAnschluss(welt, typ, tx, ty) {
  const anschluss = BAUWERKE[typ]?.anschluss;
  if (!anschluss) return { ok: true };
  if (anschluss.kachel?.some((e) => welt.bauwerkBei(tx, ty, e))) return { ok: true };
  for (const [dx, dy] of NACHBARN) {
    if (anschluss.nachbarn?.some((e) => welt.bauwerkBei(tx + dx, ty + dy, e))) return { ok: true };
  }
  for (const [dx, dy] of DIAGONALEN) {
    if (anschluss.diagonal?.some((e) => welt.bauwerkBei(tx + dx, ty + dy, e))) return { ok: true };
  }
  const moegliche = [...new Set([...(anschluss.kachel ?? []), ...(anschluss.nachbarn ?? [])])].map((e) => EBENEN_NAMEN[e] ?? e);
  return { ok: false, grund: `Kein Anschluss – an ${moegliche.join(' oder ')} bauen` };
}

/**
 * Darf `kontext.name` das Bauteil `teilId` (BAUTEILE) auf Kachel (tx, ty) setzen? Ohne Kosten (die prüft der Server und zeigt der Client extra).
 * @returns {{ ok: boolean, grund?: string }}
 */
export function pruefeBauteil(welt, teilId, tx, ty, kontext) {
  const teil = BAUTEILE[teilId];
  if (!teil) return { ok: false, grund: 'Unbekanntes Bauteil' };
  const { territorium, name, spieler = null, reichweite = BAU_REICHWEITE_BASIS } = kontext;
  if (spieler && !kachelInReichweite(welt, spieler.x, spieler.y, tx, ty, reichweite)) return { ok: false, grund: 'Zu weit weg' };
  if (teil.art === 'flagge') return pruefeFlaggenPlatz(welt, territorium, tx, ty, name, kontext.flaggenOptionen);

  if (!territorium.von(name)) return { ok: false, grund: 'Setze zuerst eine Basis-Flagge' };
  const gebiet = territorium.gebietBei(tx, ty);
  if (!gebiet) return { ok: false, grund: 'Außerhalb deines Baugebiets' };
  if (!hatRecht(gebiet, name, RECHT.BAUEN)) return { ok: false, grund: 'Fremdes Baugebiet' };
  const platz = pruefePlatz(welt, teilId, tx, ty);
  if (!platz.ok) return platz;
  return pruefeAnschluss(welt, teilId, tx, ty);
}

/**
 * Richtung für Teile mit Öffnung/Rahmen (BAUTEILE.ausrichtung): 0 = läuft Ost-West, 1 = Nord-Süd.
 * Wände richten sich nach angrenzenden Wänden, sonst parallel zur Bodenkante; die Tür übernimmt den Rahmen.
 */
export function autoDrehung(welt, typ, tx, ty) {
  const ebene = ebeneVon(typ);
  if (ebene === 'tuer') return welt.bauwerkBei(tx, ty, 'wand')?.drehung ?? 0;
  if (ebene !== 'wand') return 0;
  const hat = (dx, dy, e) => welt.bauwerkBei(tx + dx, ty + dy, e) !== null;
  const wandX = hat(-1, 0, 'wand') || hat(1, 0, 'wand');
  const wandY = hat(0, -1, 'wand') || hat(0, 1, 'wand');
  if (wandX !== wandY) return wandX ? 0 : 1;
  const bodenX = hat(-1, 0, 'boden') || hat(1, 0, 'boden');
  const bodenY = hat(0, -1, 'boden') || hat(0, 1, 'boden');
  if (bodenX !== bodenY) return bodenY ? 0 : 1;
  return 0;
}

/**
 * Zielkachel zum Zielpunkt (px) bestimmen und andocken.
 * @param drehungWunsch  0 | 1 vom Spieler (Taste R) oder null = automatisch
 * @returns {{ tx, ty, ok, grund?, gesnappt: boolean, drehung: 0|1 }}
 */
export function snappe(welt, teilId, px, py, kontext, drehungWunsch = null) {
  const g = welt.kachelGroesse;
  const tx0 = Math.floor(px / g);
  const ty0 = Math.floor(py / g);
  let ergebnis = { tx: tx0, ty: ty0, ...pruefeBauteil(welt, teilId, tx0, ty0, kontext), gesnappt: false };
  const typ = BAUTEILE[teilId]?.art === 'bauwerk' ? teilId : null;
  if (!ergebnis.ok && typ && MAGNET_EBENEN.has(ebeneVon(typ))) {
    // Magnet: die 8 Nachbarkacheln, nächste zum Zielpunkt zuerst
    const kandidaten = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) kandidaten.push({ tx: tx0 + dx, ty: ty0 + dy, abstand: Math.hypot((tx0 + dx + 0.5) * g - px, (ty0 + dy + 0.5) * g - py) });
    kandidaten.sort((a, b) => a.abstand - b.abstand);
    for (const k of kandidaten) {
      const pruefung = pruefeBauteil(welt, teilId, k.tx, k.ty, kontext);
      if (pruefung.ok) {
        ergebnis = { tx: k.tx, ty: k.ty, ...pruefung, gesnappt: true };
        break;
      }
    }
  }
  const richtbar = BAUTEILE[teilId]?.ausrichtung === true;
  // Die Tür steht immer wie ihr Rahmen – nur Rahmen, Fenster und Möbel lassen sich drehen
  const wunsch = ebeneVon(teilId) === 'tuer' ? null : drehungWunsch;
  ergebnis.drehung = richtbar ? (wunsch ?? autoDrehung(welt, teilId, ergebnis.tx, ergebnis.ty)) : 0;
  return ergebnis;
}

/** Abriss: welches Bauteil auf der Kachel zuerst dran ist, wenn keine Ebene angegeben wird (oben nach unten). */
const ABRISS_REIHENFOLGE = ['tuer', 'objekt', 'wand', 'dach', 'boden'];

/**
 * Das Bauteil auf Kachel (tx, ty), das der Hammer abreißen würde (Ebene angegeben, sonst von oben nach unten) – nur echte
 * Bauteile aus BAUTEILE (Werkbank, Feuer, Falle, Beet nicht). Server UND Client (Markierung) nutzen dasselbe.
 */
export function findeAbrissZiel(welt, tx, ty, ebene = null) {
  const kandidaten = welt.bauwerkeAn(tx, ty).filter((b) => BAUTEILE[b.typ]);
  if (ebene) return kandidaten.find((b) => ebeneVon(b.typ) === ebene) ?? null;
  for (const e of ABRISS_REIHENFOLGE) {
    const treffer = kandidaten.find((b) => ebeneVon(b.typ) === e);
    if (treffer) return treffer;
  }
  return null;
}

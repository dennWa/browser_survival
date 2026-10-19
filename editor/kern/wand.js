import { BAUWERKE } from '../../gemeinsam/welt/bauwerke.js';
import { BAUTEILE } from '../../gemeinsam/basisbau/teile.js';
import { linie, rasteEin, rechteck, nurImFeld } from './raster.js';
import { pruefeBauwerk } from './platzierung.js';

/**
 * Wände am Stück ziehen (Editor 2.0, Schritt 2.2) – umgebungsfrei, getestet in tests/editorBearbeiten.test.js.
 * Mauer-Einträge (Kacheln Wand/Fenster/Tür aus „Mauern“, Bauwerke der Ebenen wand/tuer: Zaun, Holzwand, Tor …) werden mit
 * gedrückter linker Maustaste als Linie gezogen: rastet waagerecht/senkrecht/45° ein (frei = Umschalt), raum = Rechteck-Umriss
 * (Strg). Bauwerke mit Ausrichtung (Fenster, Türöffnung, Tür, Tor) richten sich nach dem Wandverlauf aus.
 */
export const TUER_MAX = 4; // nebeneinanderliegende Tür-Kacheln bilden EINE Tür (Spiel: höchstens 4)

/** Ist der Katalog-Eintrag eine Wand (→ Ziehen statt Einzelklick)? */
export function istWandEintrag(e) {
  if (!e) return false;
  if (e.art === 'kachel') return e.kategorie === 'Mauern';
  if (e.art === 'bauwerk') return ['wand', 'tuer'].includes(BAUWERKE[e.typ]?.ebene);
  return false;
}

/** Kacheln der gezogenen Wand: Linie (eingerastet oder frei) bzw. Rechteck-Umriss, nur in der Zone */
export function wandPunkte(karte, start, ende, { frei = false, raum = false } = {}) {
  let punkte;
  if (raum) punkte = rechteck(start.x, start.y, ende.x, ende.y, true);
  else {
    const e = frei ? ende : rasteEin(start.x, start.y, ende.x, ende.y);
    punkte = linie(start.x, start.y, e.x, e.y);
  }
  return nurImFeld(karte, punkte);
}

/**
 * Tür-Kacheln begrenzen: Läufe mit mehr als TUER_MAX nebeneinanderliegenden Türen werden gekürzt.
 * @returns { punkte, gekuerzt }
 */
export function begrenzeTueren(punkte) {
  const menge = new Set(punkte.map((p) => `${p.x},${p.y}`));
  const behalten = [];
  const gezaehlt = new Map(); // Lauf-Start → Anzahl
  let gekuerzt = 0;
  for (const p of punkte) {
    // Lauf = zusammenhängende Kette (waagerecht oder senkrecht) – Startpunkt des Laufs suchen
    const waag = menge.has(`${p.x - 1},${p.y}`) || menge.has(`${p.x + 1},${p.y}`);
    let sx = p.x;
    let sy = p.y;
    if (waag) while (menge.has(`${sx - 1},${sy}`)) sx--;
    else while (menge.has(`${sx},${sy - 1}`)) sy--;
    const lauf = `${waag ? 'w' : 's'}${sx},${sy}`;
    const n = (gezaehlt.get(lauf) ?? 0) + 1;
    gezaehlt.set(lauf, n);
    if (n > TUER_MAX) gekuerzt++;
    else behalten.push(p);
  }
  return { punkte: behalten, gekuerzt };
}

/** Ausrichtung einer Wand-Kachel aus dem Verlauf: 0 = Ost-West, 1 = Nord-Süd */
export function ausrichtungIn(menge, p, standard = 0) {
  if (menge.has(`${p.x - 1},${p.y}`) || menge.has(`${p.x + 1},${p.y}`)) return 0;
  if (menge.has(`${p.x},${p.y - 1}`) || menge.has(`${p.x},${p.y + 1}`)) return 1;
  return standard;
}

/**
 * Bauwerke entlang der Wand (eine Operation je gültiger Kachel, Ausrichtung automatisch).
 * @returns { ops, ungueltig: [{ x, y, grund }], gesetzt }
 */
export function wandBauwerkOps(karte, typ, punkte, { standardDrehung = 0 } = {}) {
  const menge = new Set(punkte.map((p) => `${p.x},${p.y}`));
  const richtbar = BAUTEILE[typ]?.ausrichtung === true;
  const ops = [];
  const ungueltig = [];
  let id = karte.naechsteId;
  for (const p of punkte) {
    const pr = pruefeBauwerk(karte, typ, p.x, p.y);
    if (!pr.ok) {
      ungueltig.push({ x: p.x, y: p.y, grund: pr.grund });
      continue;
    }
    const b = { typ, tx: p.x, ty: p.y };
    if (richtbar && ausrichtungIn(menge, p, standardDrehung)) b.drehung = 1;
    ops.push({ s: 'bauwerke', k: id++, neu: b });
  }
  return { ops, ungueltig, gesetzt: ops.length };
}

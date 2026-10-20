import { KACHELN } from '../../gemeinsam/welt/kacheln.js';
import { BAUWERKE } from '../../gemeinsam/welt/bauwerke.js';
import { RESSOURCEN_OBJEKTE } from '../../gemeinsam/welt/ressourcen.js';
import { markerSchluessel } from './karte.js';
import { bedeckteKacheln as gedrehteKacheln, huelle } from '../../gemeinsam/welt/drehung.js';

/**
 * Platzierungsvorschau (Phase 4/5): grün = gültig, rot = blockiert oder außerhalb der Zone.
 * Regeln wie im Spiel: Möbel-Kollision über Kachelmittelpunkte (welt.berechneMoebelKollision; frei gedrehte Objekte mit ihrem
 * gedrehten Rechteck, gemeinsam/welt/drehung.js – Editor 2.0, 5.5), Wände/Fenster/Wasser blockieren,
 * Türen dürfen nicht zugestellt werden, Zombies nur draußen (Innenboden = KACHELN.innen).
 * @returns {{ ok: boolean, grund?: string }}
 */

/** Kacheln, deren Mittelpunkt im (ggf. gedrehten) Rechteck liegt – dieselbe Regel wie die Möbel-Kollision im Spiel */
export function bedeckteKacheln(r) {
  // Index-Rechnung braucht nichtnegative Kacheln → bei Objekten über dem linken/oberen Rand vorübergehend verschieben
  const h = huelle(r);
  const ox = Math.min(0, Math.floor(h.x0));
  const oy = Math.min(0, Math.floor(h.y0));
  const breite = Math.ceil(h.x1 - ox) + 2;
  return gedrehteKacheln({ ...r, x: r.x - ox, y: r.y - oy }, breite).map((i) => ({ x: (i % breite) + ox, y: Math.floor(i / breite) + oy }));
}

const istHart = (z) => z === '#' || z === 'F' || z === '~' || z === 'T';

export function pruefeObjekt(karte, o, { ignoriere = new Set() } = {}) {
  if (o.ebene === 'oben') {
    if (o.x < 0 || o.y < 0 || o.x >= karte.breite || o.y >= karte.hoehe) return { ok: false, grund: 'Außerhalb der Zone' };
  } else {
    const r = huelle(o); // frei gedreht: die Ecken müssen in der Zone liegen
    if (r.x0 < -1e-9 || r.y0 < -1e-9 || r.x1 > karte.breite + 1e-9 || r.y1 > karte.hoehe + 1e-9) return { ok: false, grund: 'Außerhalb der Zone' };
  }
  const blockiert = o.blockiert || RESSOURCEN_OBJEKTE[o.typ]?.blockiert;
  if (!blockiert) return { ok: true };
  const kacheln = bedeckteKacheln(o);
  for (const { x, y } of kacheln) {
    const z = karte.kachelAn(x, y);
    if (z === null) return { ok: false, grund: 'Außerhalb der Zone' };
    if (istHart(z)) return { ok: false, grund: z === 'T' ? 'Würde eine Tür zustellen' : `Steht in ${KACHELN[z].name}` };
    if (karte.markerAn(x, y)) return { ok: false, grund: 'Steht auf einem Spawn-/Loot-Punkt' };
  }
  const belegt = new Set(kacheln.map(({ x, y }) => `${x},${y}`));
  for (const [id, a] of karte.s('objekte')) {
    if (ignoriere.has(id) || !(a.blockiert || RESSOURCEN_OBJEKTE[a.typ]?.blockiert)) continue;
    const ra = huelle(a);
    const ro = huelle(o);
    if (ra.x0 >= ro.x1 || ra.x1 <= ro.x0 || ra.y0 >= ro.y1 || ra.y1 <= ro.y0) continue;
    if (bedeckteKacheln(a).some(({ x, y }) => belegt.has(`${x},${y}`))) return { ok: false, grund: `Überschneidet ${a.typ}` };
  }
  return { ok: true };
}

export function pruefeMarker(karte, art, x, y) {
  if (!karte.imFeld(x, y)) return { ok: false, grund: 'Außerhalb der Zone' };
  const z = karte.kachelAn(x, y);
  if (KACHELN[z]?.blockiert) return { ok: false, grund: `Steht in ${KACHELN[z].name}` };
  if (art === 'zombie' && KACHELN[z]?.innen) return { ok: false, grund: 'Zombies nur draußen' };
  for (const [, o] of karte.s('objekte')) {
    if (!o.blockiert && !RESSOURCEN_OBJEKTE[o.typ]?.blockiert) continue;
    if (bedeckteKacheln(o).some((k) => k.x === x && k.y === y)) return { ok: false, grund: `Steht in ${o.typ}` };
  }
  if (art === 'ankunft') {
    for (const [, u] of karte.s('uebergaenge')) if (x >= u.x && x < u.x + u.b && y >= u.y && y < u.y + u.h) return { ok: false, grund: 'Ankunft nie in einen Übergang' };
  } else {
    const m = karte.s('marker').get(markerSchluessel(x, y));
    if (m && m.art !== art) return { ok: false, grund: 'Hier ist schon ein anderer Marker' };
  }
  return { ok: true };
}

export function pruefeBauwerk(karte, typ, x, y) {
  if (!BAUWERKE[typ]) return { ok: false, grund: 'Unbekanntes Bauwerk' };
  if (!karte.imFeld(x, y)) return { ok: false, grund: 'Außerhalb der Zone' };
  if (istHart(karte.kachelAn(x, y))) return { ok: false, grund: `Steht in ${KACHELN[karte.kachelAn(x, y)].name}` };
  const ebene = BAUWERKE[typ].ebene ?? 'objekt';
  for (const [, b] of karte.s('bauwerke')) if (b.tx === x && b.ty === y && (BAUWERKE[b.typ]?.ebene ?? 'objekt') === ebene) return { ok: false, grund: 'Da steht schon ein Bauwerk dieser Ebene' };
  return { ok: true };
}

/** Rechteck für Bereiche (Übergang muss am Rand liegen) */
export function pruefeBereich(karte, sammlung, r) {
  if (r.b < 1 || r.h < 1) return { ok: false, grund: 'Zu klein' };
  if (r.x < 0 || r.y < 0 || r.x + r.b > karte.breite || r.y + r.h > karte.hoehe) return { ok: false, grund: 'Außerhalb der Zone' };
  if (sammlung === 'uebergaenge') {
    const amRand = r.x === 0 || r.y === 0 || r.x + r.b === karte.breite || r.y + r.h === karte.hoehe;
    if (!amRand) return { ok: false, grund: 'Übergänge gehören an den Zonenrand' };
  }
  return { ok: true };
}

/**
 * Freie Kachel für den Spieler-Start möglichst nah an der Kartenmitte (Phase 10.7: „Testen ohne Spawn → in die Mitte?“).
 * Sucht ringförmig nach außen; bevorzugt draußen begehbare Kacheln, die pruefeMarker erlaubt. @returns { x, y } | null
 */
export function startInDerMitte(karte) {
  const mx = Math.floor(karte.breite / 2);
  const my = Math.floor(karte.hoehe / 2);
  const max = Math.max(karte.breite, karte.hoehe);
  for (let r = 0; r <= max; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = mx + dx;
        const y = my + dy;
        if (karte.imFeld(x, y) && pruefeMarker(karte, 'start', x, y).ok && !KACHELN[karte.kachelAn(x, y)]?.wasser && karte.kachelAn(x, y) !== '~') return { x, y };
      }
    }
  }
  return null;
}

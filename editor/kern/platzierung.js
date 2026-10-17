import { KACHELN } from '../../gemeinsam/welt/kacheln.js';
import { BAUWERKE } from '../../gemeinsam/welt/bauwerke.js';
import { RESSOURCEN_OBJEKTE } from '../../gemeinsam/welt/ressourcen.js';
import { markerSchluessel } from './karte.js';

/**
 * Platzierungsvorschau (Phase 4/5): grün = gültig, rot = blockiert oder außerhalb der Zone.
 * Regeln wie im Spiel: Möbel-Kollision über Kachelmittelpunkte (welt.berechneMoebelKollision), Wände/Fenster/Wasser blockieren,
 * Türen dürfen nicht zugestellt werden, Zombies nur draußen (Innenboden = KACHELN.innen).
 * @returns {{ ok: boolean, grund?: string }}
 */

/** Kacheln, deren Mittelpunkt im Rechteck liegt (wie das Spiel Möbel-Kollision rechnet) */
export function bedeckteKacheln(r) {
  const liste = [];
  for (let ty = Math.floor(r.y); ty < Math.ceil(r.y + r.h); ty++)
    for (let tx = Math.floor(r.x); tx < Math.ceil(r.x + r.b); tx++) {
      const mx = tx + 0.5;
      const my = ty + 0.5;
      if (mx > r.x && mx < r.x + r.b && my > r.y && my < r.y + r.h) liste.push({ x: tx, y: ty });
    }
  return liste;
}

const istHart = (z) => z === '#' || z === 'F' || z === '~' || z === 'T';

export function pruefeObjekt(karte, o, { ignoriere = new Set() } = {}) {
  if (o.ebene === 'oben') {
    if (o.x < 0 || o.y < 0 || o.x >= karte.breite || o.y >= karte.hoehe) return { ok: false, grund: 'Außerhalb der Zone' };
  } else if (o.x < 0 || o.y < 0 || o.x + o.b > karte.breite + 1e-9 || o.y + o.h > karte.hoehe + 1e-9) return { ok: false, grund: 'Außerhalb der Zone' };
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
    if (a.x >= o.x + o.b || a.x + a.b <= o.x || a.y >= o.y + o.h || a.y + a.h <= o.y) continue;
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

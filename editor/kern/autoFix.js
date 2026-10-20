import { KACHEL_GROESSE } from '../../gemeinsam/konstanten.js';
import { markerSchluessel } from './karte.js';
import { pruefeObjekt, bedeckteKacheln } from './platzierung.js';
import { pruefWelt } from './innen.js';
import { validiere } from './validierung.js';

/**
 * Auto-Fix (Editor 2.0, Schritt 8.2) – „Automatisch beheben“ für EINDEUTIGE Prüfungseinträge (kern/validierung.js).
 * Rein (kein DOM). Jeder Fix = { code, text, ops, ziel: {x,y} } oder null, wenn es keine eindeutige Lösung gibt.
 *   uebergang-rand        Übergang an den nächsten Rand schieben (Größe bleibt)
 *   ankunft-im-uebergang  Ankunft auf die nächste freie Kachel außerhalb aller Übergänge (landeinwärts)
 *   ankunft-blockiert     Ankunft auf die nächste freie Kachel
 *   zombie-innen          Zombie-Spawn auf die nächste freie Kachel draußen
 *   marker-blockiert      Marker (Start/Zombie/Loot) auf die nächste freie Kachel (Loot bleibt drinnen, Zombie draußen)
 *   objekt-aussen         Objekt ganz in die Zone schieben
 *   objekt-rand           Objekt ganz in die Zone schieben
 *   moebel-wand           Möbel aus Wand/Tür auf den nächsten freien Platz
 *   loot-raum             Loot-Punkt ohne Raum → Raum der Raumfläche darunter bzw. der einzige Raum der Zone
 * fixeAlle: nacheinander auf einer Kopie (jeder Fix sieht die vorherigen) → ein Satz ops = 1 Undo-Schritt.
 */
export const BEHEBBAR = Object.freeze(['uebergang-rand', 'ankunft-im-uebergang', 'ankunft-blockiert', 'zombie-innen', 'marker-blockiert', 'objekt-aussen', 'objekt-rand', 'moebel-wand', 'loot-raum']);
const SUCHRADIUS = 8;

export const istBehebbar = (eintrag) => BEHEBBAR.includes(eintrag?.code);

/** Fix für einen Prüfungseintrag – null = nicht eindeutig/nicht behebbar */
export function fixFuer(karte, eintrag, pw = pruefWelt(karte)) {
  if (!istBehebbar(eintrag)) return null;
  const { x, y } = eintrag;
  switch (eintrag.code) {
    case 'uebergang-rand':
      return uebergangAnDenRand(karte, x, y);
    case 'ankunft-im-uebergang':
    case 'ankunft-blockiert':
      return ankunftVerschieben(karte, x, y, pw, eintrag.code);
    case 'zombie-innen':
    case 'marker-blockiert':
      return markerVerschieben(karte, x, y, pw, eintrag.code);
    case 'objekt-aussen':
    case 'objekt-rand':
      return objektInDieZone(karte, x, y);
    case 'moebel-wand':
      return moebelBefreien(karte, x, y);
    case 'loot-raum':
      return lootRaum(karte, x, y);
    default:
      return null;
  }
}

/**
 * Alle eindeutigen Fixes einer Liste nacheinander (auf einer Kopie). `nur` = Codes/Filter optional.
 * @returns { fixes: [{ eintrag, fix }], ops }  – ops gegen den Stand von `karte`, in Reihenfolge anwendbar
 */
export function fixeAlle(karte, liste) {
  const kopie = karte.klon();
  const fixes = [];
  const ops = [];
  for (const eintrag of liste) {
    if (!istBehebbar(eintrag)) continue;
    // Eintrag noch aktuell? (ein früherer Fix kann ihn miterledigt haben)
    const aktuell = validiere(kopie, { mitErreichbarkeit: false }).some((e) => e.code === eintrag.code && e.x === eintrag.x && e.y === eintrag.y);
    if (!aktuell) continue;
    const fix = fixFuer(kopie, eintrag);
    if (!fix?.ops.length) continue;
    kopie.anwenden(fix.ops.map((o) => ({ ...o })));
    fixes.push({ eintrag, fix });
    ops.push(...fix.ops);
  }
  return { fixes, ops };
}

// --- einzelne Fälle ---------------------------------------------------------------------------
function uebergangAnDenRand(karte, x, y) {
  const treffer = [...karte.s('uebergaenge')].find(([, u]) => u.x === x && u.y === y);
  if (!treffer) return null;
  const [id, u] = treffer;
  const abstaende = [
    { d: u.x, neu: { x: 0 } },
    { d: u.y, neu: { y: 0 } },
    { d: karte.breite - (u.x + u.b), neu: { x: karte.breite - u.b } },
    { d: karte.hoehe - (u.y + u.h), neu: { y: karte.hoehe - u.h } },
  ].sort((a, b) => a.d - b.d);
  if (abstaende[0].d === abstaende[1].d) return null; // zwei Ränder gleich nah → nicht eindeutig
  const neu = { ...u, ...abstaende[0].neu };
  if (neu.x < 0 || neu.y < 0) return null;
  return { code: 'uebergang-rand', text: `Übergang „${u.name ?? u.ziel}“ an den Rand: (${u.x}|${u.y}) → (${neu.x}|${neu.y})`, ops: [{ s: 'uebergaenge', k: id, neu }], ziel: { x: neu.x, y: neu.y } };
}

/** Nächste Kachel (Ring für Ring, gleich weit → kleinste Distanz, dann oben/links zuerst) mit passt(x,y) */
function naechsteKachel(karte, x, y, passt, radius = SUCHRADIUS) {
  for (let r = 1; r <= radius; r++) {
    const ring = [];
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (Math.max(Math.abs(dx), Math.abs(dy)) === r) ring.push([x + dx, y + dy, dx * dx + dy * dy]);
    ring.sort((a, b) => a[2] - b[2] || a[1] - b[1] || a[0] - b[0]);
    for (const [nx, ny] of ring) if (karte.imFeld(nx, ny) && passt(nx, ny)) return { x: nx, y: ny };
  }
  return null;
}

const imUebergang = (karte, x, y) => [...karte.s('uebergaenge').values()].some((u) => x >= u.x && x < u.x + u.b && y >= u.y && y < u.y + u.h);
const innen = (welt, x, y) => welt.istInnen((x + 0.5) * KACHEL_GROESSE, (y + 0.5) * KACHEL_GROESSE);

function ankunftVerschieben(karte, x, y, pw, code) {
  const treffer = [...karte.s('ankuenfte')].find(([, a]) => a.x === x && a.y === y);
  if (!treffer || !pw) return null;
  const [name, a] = treffer;
  const ziel = naechsteKachel(karte, x, y, (nx, ny) => !pw.welt.istBlockiert(nx, ny) && !imUebergang(karte, nx, ny));
  if (!ziel) return null;
  return { code, text: `Ankunft „${name}“: (${x}|${y}) → (${ziel.x}|${ziel.y})${code === 'ankunft-im-uebergang' ? ' (raus aus dem Übergang)' : ' (freie Kachel)'}`, ops: [{ s: 'ankuenfte', k: name, neu: { ...a, x: ziel.x, y: ziel.y } }], ziel };
}

function markerVerschieben(karte, x, y, pw, code) {
  const m = karte.markerAn(x, y);
  if (!m || !pw) return null;
  const warInnen = innen(pw.welt, x, y);
  const passt = (nx, ny) => {
    if (pw.welt.istBlockiert(nx, ny) || karte.markerAn(nx, ny)) return false;
    if (m.art === 'zombie') return !innen(pw.welt, nx, ny);
    if (m.art === 'loot') return innen(pw.welt, nx, ny) === warInnen; // im selben Raum-Typ bleiben
    return true;
  };
  const ziel = naechsteKachel(karte, x, y, passt);
  if (!ziel) return null;
  const name = m.art === 'start' ? 'Spieler-Start' : m.art === 'zombie' ? 'Zombie-Spawn' : `Loot-Punkt (${m.raum})`;
  return {
    code,
    text: `${name}: (${x}|${y}) → (${ziel.x}|${ziel.y})${code === 'zombie-innen' ? ' (nach draußen)' : ' (freie Kachel)'}`,
    ops: [{ s: 'marker', k: markerSchluessel(x, y), neu: null }, { s: 'marker', k: markerSchluessel(ziel.x, ziel.y), neu: { ...m } }],
    ziel,
  };
}

function objektBei(karte, x, y, filter = () => true) {
  return [...karte.s('objekte')].find(([, o]) => Math.floor(o.x) === x && Math.floor(o.y) === y && filter(o)) ?? null;
}

function objektInDieZone(karte, x, y) {
  const treffer = objektBei(karte, x, y);
  if (!treffer) return null;
  const [id, o] = treffer;
  if (o.b > karte.breite || o.h > karte.hoehe) return null;
  const nx = Math.round(Math.min(Math.max(0, o.x), karte.breite - o.b) * 1000) / 1000;
  const ny = Math.round(Math.min(Math.max(0, o.y), karte.hoehe - o.h) * 1000) / 1000;
  if (nx === o.x && ny === o.y) return null;
  return { code: 'objekt-aussen', text: `Objekt „${o.typ}“ in die Zone: (${o.x}|${o.y}) → (${nx}|${ny})`, ops: [{ s: 'objekte', k: id, neu: { ...o, x: nx, y: ny } }], ziel: { x: Math.floor(nx), y: Math.floor(ny) } };
}

function moebelBefreien(karte, x, y) {
  // Objekt, das die gemeldete Wand-/Tür-Kachel bedeckt (blockierend, nicht Krone)
  const treffer = [...karte.s('objekte')].find(([, o]) => o.blockiert && o.ebene !== 'oben' && bedeckteKacheln(o).some((k) => k.x === x && k.y === y));
  if (!treffer) return null;
  const [id, o] = treffer;
  const ignoriere = new Set([id]);
  for (let r = 1; r <= SUCHRADIUS; r++) {
    const kandidaten = [];
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (Math.max(Math.abs(dx), Math.abs(dy)) === r) kandidaten.push([dx, dy, dx * dx + dy * dy]);
    kandidaten.sort((a, b) => a[2] - b[2] || a[1] - b[1] || a[0] - b[0]);
    for (const [dx, dy] of kandidaten) {
      const neu = { ...o, x: o.x + dx, y: o.y + dy };
      if (pruefeObjekt(karte, neu, { ignoriere }).ok) return { code: 'moebel-wand', text: `„${o.typ}“ aus Wand/Tür: (${o.x}|${o.y}) → (${neu.x}|${neu.y})`, ops: [{ s: 'objekte', k: id, neu }], ziel: { x: Math.floor(neu.x), y: Math.floor(neu.y) } };
    }
  }
  return null;
}

function lootRaum(karte, x, y) {
  const m = karte.markerAn(x, y);
  if (!m || m.art !== 'loot') return null;
  const flaechen = [...karte.s('raumFlaechen').values()].filter((r) => x >= r.x && x < r.x + r.b && y >= r.y && y < r.y + r.h && karte.s('raeume').has(r.raum));
  const raeume = [...new Set(flaechen.map((r) => r.raum))];
  let raum = raeume.length === 1 ? raeume[0] : null;
  if (!raum && !raeume.length && karte.s('raeume').size === 1) raum = [...karte.s('raeume').keys()][0];
  if (!raum) return null;
  const r = karte.s('raeume').get(raum);
  return { code: 'loot-raum', text: `Loot-Punkt (${x}|${y}) → Raum ${raum} „${r.name}“`, ops: [{ s: 'marker', k: markerSchluessel(x, y), neu: { ...m, raum } }], ziel: { x, y } };
}


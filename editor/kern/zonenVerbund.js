import { KACHELN } from '../../gemeinsam/welt/kacheln.js';

/**
 * Zonen verbinden (Phase 7). Das Projekt ordnet Zonen auf einer Weltkarte an (layout: id → { x, y } in Kacheln, linke obere
 * Ecke). Grenzen zwei Zonen Kante an Kante, findet der Editor die gemeinsame Kante und schlägt dort Übergänge vor –
 * auf jedem zusammenhängenden Stück, das auf BEIDEN Seiten begehbar ist (Straße, Weg, Wiese …), samt Ankunftspunkten
 * ein paar Kacheln landeinwärts (nie im Übergang, sonst Ping-Pong). Prüfungen wie tests/zonen.test.js: validierung.js.
 */
export const GEGENSEITE = Object.freeze({ nord: 'sued', sued: 'nord', west: 'ost', ost: 'west' });
const ANKUNFT_ABSTAND = 3;
const MAX_UEBERGANG_BREITE = 12;
/** Kacheln, die als Weg gelten (Übergänge bevorzugt dort) */
const WEGE = new Set(['=', '_', '-']);

/** Kante von a, an der b anliegt – oder null. @returns { seite, von, bis } (von/bis in Kacheln entlang der Kante, in a-Koordinaten) */
export function gemeinsameKante(a, pa, b, pb) {
  const ueberlappX = [Math.max(pa.x, pb.x), Math.min(pa.x + a.breite, pb.x + b.breite)];
  const ueberlappY = [Math.max(pa.y, pb.y), Math.min(pa.y + a.hoehe, pb.y + b.hoehe)];
  if (ueberlappX[1] > ueberlappX[0]) {
    if (pb.y + b.hoehe === pa.y) return { seite: 'nord', von: ueberlappX[0] - pa.x, bis: ueberlappX[1] - pa.x };
    if (pa.y + a.hoehe === pb.y) return { seite: 'sued', von: ueberlappX[0] - pa.x, bis: ueberlappX[1] - pa.x };
  }
  if (ueberlappY[1] > ueberlappY[0]) {
    if (pb.x + b.breite === pa.x) return { seite: 'west', von: ueberlappY[0] - pa.y, bis: ueberlappY[1] - pa.y };
    if (pa.x + a.breite === pb.x) return { seite: 'ost', von: ueberlappY[0] - pa.y, bis: ueberlappY[1] - pa.y };
  }
  return null;
}

/** Alle Nachbarpaare des Projekts: [{ a, b, kante }] (jedes Paar einmal, a < b) */
export function nachbarn(zonen, layout) {
  const ids = [...zonen.keys()].filter((id) => layout[id]).sort();
  const liste = [];
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++) {
      const kante = gemeinsameKante(zonen.get(ids[i]), layout[ids[i]], zonen.get(ids[j]), layout[ids[j]]);
      if (kante) liste.push({ a: ids[i], b: ids[j], kante });
    }
  return liste;
}

/** Randkachel der Seite an Position t (entlang der Kante) */
function randKachel(karte, seite, t) {
  if (seite === 'nord') return { x: t, y: 0 };
  if (seite === 'sued') return { x: t, y: karte.hoehe - 1 };
  if (seite === 'west') return { x: 0, y: t };
  return { x: karte.breite - 1, y: t };
}

function begehbar(karte, x, y) {
  const z = karte.kachelAn(x, y);
  return z !== null && !KACHELN[z]?.blockiert;
}

/** Rechteck (1 Kachel dick) an der Seite, entlang t0..t1 (exklusiv) */
function randRechteck(karte, seite, t0, t1) {
  if (seite === 'nord') return { x: t0, y: 0, b: t1 - t0, h: 1 };
  if (seite === 'sued') return { x: t0, y: karte.hoehe - 1, b: t1 - t0, h: 1 };
  if (seite === 'west') return { x: 0, y: t0, b: 1, h: t1 - t0 };
  return { x: karte.breite - 1, y: t0, b: 1, h: t1 - t0 };
}

/** Ankunftspunkt: Mitte des Stücks, ANKUNFT_ABSTAND Kacheln landeinwärts (erste begehbare Kachel dorthin) */
function ankunftPunkt(karte, seite, t) {
  for (let d = ANKUNFT_ABSTAND; d >= 1; d--) {
    const p = seite === 'nord' ? { x: t, y: d } : seite === 'sued' ? { x: t, y: karte.hoehe - 1 - d } : seite === 'west' ? { x: d, y: t } : { x: karte.breite - 1 - d, y: t };
    if (begehbar(karte, p.x, p.y) && !karte.markerAn(p.x, p.y)) return p;
  }
  return null;
}

const ueberlappt = (u, r) => u.x < r.x + r.b && r.x < u.x + u.b && u.y < r.y + r.h && r.y < u.y + u.h;

/**
 * Vorschläge für ein Nachbarpaar. @returns [{ a: { rechteck, ankunft }, b: { rechteck, ankunft }, laenge }]
 *   a.rechteck = Übergang in Zone a (Ziel b, landet bei b.ankunft); b.rechteck = Rückweg in b (Ziel a, landet bei a.ankunft)
 */
export function vorschlaegeFuerPaar(zonen, layout, { a, b, kante }) {
  const ka = zonen.get(a);
  const kb = zonen.get(b);
  const pa = layout[a];
  const pb = layout[b];
  const seiteB = GEGENSEITE[kante.seite];
  const langsX = kante.seite === 'nord' || kante.seite === 'sued';
  const versatz = langsX ? pa.x - pb.x : pa.y - pb.y; // t in a → t + versatz in b
  const randA = (t) => randKachel(ka, kante.seite, t);
  const randB = (t) => randKachel(kb, seiteB, t + versatz);
  const istWeg = (karte, p) => WEGE.has(karte.kachelAn(p.x, p.y));
  // Läufe [start, ende) entlang der Kante, auf denen pruefe(t) gilt (höchstens MAX_UEBERGANG_BREITE lang)
  const laeufe = (pruefe) => {
    const liste = [];
    let anfang = null;
    for (let t = kante.von; t <= kante.bis; t++) {
      const ok = t < kante.bis && pruefe(t);
      if (ok && anfang === null) anfang = t;
      if (anfang !== null && (!ok || t - anfang >= MAX_UEBERGANG_BREITE)) {
        liste.push([anfang, t]);
        anfang = ok ? t : null;
      }
    }
    return liste;
  };
  const frei = (t) => begehbar(ka, randA(t).x, randA(t).y) && begehbar(kb, randB(t).x, randB(t).y);
  // Wege (Straße, Asphalt, Gehweg) sind die natürlichen Verbindungen; ohne Wege: eine Stelle mitten im längsten freien Stück
  let kandidaten = laeufe((t) => frei(t) && (istWeg(ka, randA(t)) || istWeg(kb, randB(t))));
  if (!kandidaten.length) {
    const alle = laeufe(frei).sort((x, y) => y[1] - y[0] - (x[1] - x[0]));
    if (alle.length) {
      const [s0, s1] = alle[0];
      const m = Math.floor((s0 + s1) / 2);
      kandidaten = [[Math.max(s0, m - 2), Math.min(s1, m + 3)]];
    }
  }
  const vorschlaege = [];
  for (const [anfang, ende] of kandidaten) {
    const mitte = Math.floor((anfang + ende - 1) / 2);
    const ra = randRechteck(ka, kante.seite, anfang, ende);
    const rb = randRechteck(kb, seiteB, anfang + versatz, ende + versatz);
    const ankA = ankunftPunkt(ka, kante.seite, mitte);
    const ankB = ankunftPunkt(kb, seiteB, mitte + versatz);
    const schonDa = [...ka.s('uebergaenge').values()].some((u) => u.ziel === b && ueberlappt(u, ra)) || [...kb.s('uebergaenge').values()].some((u) => u.ziel === a && ueberlappt(u, rb));
    if (ankA && ankB && !schonDa) vorschlaege.push({ a: { rechteck: ra, ankunft: ankA }, b: { rechteck: rb, ankunft: ankB }, laenge: ende - anfang });
  }
  return vorschlaege;
}

function freierName(karte, basis) {
  let n = basis;
  for (let i = 2; karte.s('ankuenfte').has(n); i++) n = `${basis}${i}`;
  return n;
}

/**
 * Vorschlag → Operationen für beide Zonen. Ankünfte heißen nach der Seite, von der man kommt (z. B. in der Nordzone „sued“).
 * @returns { opsA, opsB }
 */
export function vorschlagOps(zonen, paar, v) {
  const ka = zonen.get(paar.a);
  const kb = zonen.get(paar.b);
  const seiteA = paar.kante.seite;
  const seiteB = GEGENSEITE[seiteA];
  const nameInA = freierName(ka, seiteA); // Ankunft in a liegt an a's Seite zur b-Zone
  const nameInB = freierName(kb, seiteB);
  const opsA = [
    { s: 'uebergaenge', k: ka.naechsteId, neu: { ...v.a.rechteck, ziel: paar.b, ankunft: nameInB, name: kb.name } },
    { s: 'ankuenfte', k: nameInA, neu: v.a.ankunft },
  ];
  const opsB = [
    { s: 'uebergaenge', k: kb.naechsteId, neu: { ...v.b.rechteck, ziel: paar.a, ankunft: nameInA, name: ka.name } },
    { s: 'ankuenfte', k: nameInB, neu: v.b.ankunft },
  ];
  return { opsA, opsB };
}

/**
 * Anordnung aus vorhandenen Übergängen ableiten (z. B. stadtrand ↔ waldweg): ausgehend von `start` werden Zonen so
 * gelegt, dass ein Übergang und sein Rückweg an derselben Stelle der gemeinsamen Kante liegen.
 * @returns layout { id: { x, y } } (nur erreichbare Zonen)
 */
export function layoutAusUebergaengen(zonen, start) {
  const layout = { [start]: { x: 0, y: 0 } };
  const offen = [start];
  const seiteVon = (k, u) => (u.y === 0 ? 'nord' : u.y + u.h === k.hoehe ? 'sued' : u.x === 0 ? 'west' : u.x + u.b === k.breite ? 'ost' : null);
  while (offen.length) {
    const id = offen.shift();
    const k = zonen.get(id);
    for (const u of k.s('uebergaenge').values()) {
      const ziel = zonen.get(u.ziel);
      if (!ziel || layout[u.ziel]) continue;
      const seite = seiteVon(k, u);
      if (!seite) continue;
      const zurueck = [...ziel.s('uebergaenge').values()].find((v) => v.ziel === id && seiteVon(ziel, v) === GEGENSEITE[seite]);
      const p = layout[id];
      const mitteU = seite === 'nord' || seite === 'sued' ? u.x + u.b / 2 : u.y + u.h / 2;
      const mitteV = zurueck ? (seite === 'nord' || seite === 'sued' ? zurueck.x + zurueck.b / 2 : zurueck.y + zurueck.h / 2) : mitteU;
      const quer = Math.round(mitteU - mitteV);
      layout[u.ziel] =
        seite === 'nord' ? { x: p.x + quer, y: p.y - ziel.hoehe } : seite === 'sued' ? { x: p.x + quer, y: p.y + k.hoehe } : seite === 'west' ? { x: p.x - ziel.breite, y: p.y + quer } : { x: p.x + k.breite, y: p.y + quer };
      offen.push(u.ziel);
    }
  }
  return layout;
}

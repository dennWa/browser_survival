/**
 * Runde 41 – Boden-Malschicht („weicher Pinsel“, Studio): Rasen, Wege, Wasser … rund und mit weichem Rand auf die Karte malen,
 * statt nur ganze Kacheln. Reine Optik: die Kachel darunter bestimmt weiter Begehbarkeit, Wasser, Angeln usw.
 *
 * Kartenformat:  bodenMalerei: { aufloesung: 4, schichten: { rasen: '<RLE+Base64>', wasser: '…' } }
 *   - je Schicht eine Deckkraft-Maske (0–255) in `aufloesung` Zellen je Kachel (Breite = breite·aufloesung),
 *     gespeichert als Lauflängen-Paare [anzahl 1–255, wert] → Base64 (leere Flächen kosten fast nichts).
 *   - Reihenfolge der Schlüssel = Malreihenfolge (erste Schicht liegt unten).
 * Umgebungsfrei (kein DOM, kein node:) – btoa/atob gibt es in Browser und Node ≥ 16.
 * Benutzt von: kartenLader (pruefeBodenMalerei), client/darstellung/malSchicht.js (Spiel + Studio), studio/ansicht/werkzeuge.js (Pinsel).
 */
export const MAL_AUFLOESUNG = 4;
/** Böden, die man weich malen kann (Kachel-Namen aus gemeinsam/welt/kacheln.js) */
export const MAL_BOEDEN = ['rasen', 'wiese', 'gras', 'waldboden', 'wildwald', 'erde', 'kies', 'sand', 'pflaster', 'asphalt', 'strasse', 'gehweg', 'beton', 'fliesen', 'holz', 'steg', 'wasser', 'schnee'];
const STUFEN = 17; // Werte werden auf 16 Stufen (0, 17, 34 … 255) gerundet → kürzere Läufe; sieht wegen der weichen Vergrößerung gleich aus

export function leereMaske(breite, hoehe, aufloesung = MAL_AUFLOESUNG) {
  return new Uint8Array(breite * aufloesung * hoehe * aufloesung);
}

/** Maske → Text (Lauflänge + Base64). Komplett leer → '' */
export function kodiere(maske) {
  const bytes = [];
  let leer = true;
  for (let i = 0; i < maske.length; ) {
    const wert = maske[i];
    if (wert) leer = false;
    let n = 1;
    while (n < 255 && i + n < maske.length && maske[i + n] === wert) n++;
    bytes.push(n, wert);
    i += n;
  }
  if (leer) return '';
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.slice(i, i + 0x8000));
  return btoa(s);
}

/** Text → Maske der Länge `laenge` (zu kurz/lang/kaputt → null) */
export function dekodiere(text, laenge) {
  const maske = new Uint8Array(laenge);
  if (!text) return maske;
  let roh;
  try {
    roh = atob(text);
  } catch {
    return null;
  }
  if (roh.length % 2) return null;
  let p = 0;
  for (let i = 0; i < roh.length; i += 2) {
    const n = roh.charCodeAt(i);
    const wert = roh.charCodeAt(i + 1);
    if (!n || p + n > laenge) return null;
    if (wert) maske.fill(wert, p, p + n);
    p += n;
  }
  return p === laenge ? maske : null;
}

/**
 * Ein runder Pinseltupfer. Koordinaten in KACHELN (Bruch erlaubt), radius in Kacheln.
 * haerte 0–1: Anteil des Radius mit voller Deckkraft (1 = harte Kante, 0 = ganz weich auslaufend).
 * staerke 0–1: maximale Deckkraft. Malen = Maximum (kein Aufsummieren beim Hin- und Herfahren), radieren = Minimum.
 * @returns { x0, y0, x1, y1 } betroffene Kacheln (x1/y1 exklusiv) oder null, wenn nichts geändert
 */
export function tupfer(maske, breite, hoehe, aufloesung, cx, cy, radius, { haerte = 0.5, staerke = 1, radieren = false } = {}) {
  const mb = breite * aufloesung;
  const mh = hoehe * aufloesung;
  const r = Math.max(0.05, radius) * aufloesung;
  const mx = cx * aufloesung;
  const my = cy * aufloesung;
  const h = Math.min(0.999, Math.max(0, haerte));
  const voll = Math.min(1, Math.max(0, staerke)) * 255;
  const xa = Math.max(0, Math.floor(mx - r));
  const xe = Math.min(mb - 1, Math.ceil(mx + r));
  const ya = Math.max(0, Math.floor(my - r));
  const ye = Math.min(mh - 1, Math.ceil(my + r));
  let geaendert = false;
  for (let y = ya; y <= ye; y++) {
    for (let x = xa; x <= xe; x++) {
      const d = Math.hypot(x + 0.5 - mx, y + 0.5 - my) / r;
      if (d >= 1) continue;
      let f = d <= h ? 1 : 1 - (d - h) / (1 - h);
      f = f * f * (3 - 2 * f); // weich auslaufen (smoothstep)
      const v = Math.round((f * voll) / STUFEN) * STUFEN;
      const i = y * mb + x;
      const neu = radieren ? Math.min(maske[i], 255 - v) : Math.max(maske[i], v);
      if (neu !== maske[i]) {
        maske[i] = neu;
        geaendert = true;
      }
    }
  }
  if (!geaendert) return null;
  return { x0: Math.floor(xa / aufloesung), y0: Math.floor(ya / aufloesung), x1: Math.floor(xe / aufloesung) + 1, y1: Math.floor(ye / aufloesung) + 1 };
}

/** Pinselstrich von a nach b (Tupfer im Abstand ≤ ¼ Radius) → vereinigtes Rechteck oder null */
export function strich(maske, breite, hoehe, aufloesung, a, b, radius, optionen) {
  const schritte = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / Math.max(0.05, radius * 0.25)));
  let r = null;
  for (let i = a === b ? schritte : 1; i <= schritte; i++) {
    const t = i / schritte;
    const e = tupfer(maske, breite, hoehe, aufloesung, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, radius, optionen);
    if (e) r = r ? { x0: Math.min(r.x0, e.x0), y0: Math.min(r.y0, e.y0), x1: Math.max(r.x1, e.x1), y1: Math.max(r.y1, e.y1) } : e;
  }
  return r;
}

/** Hat die Maske im Kachel-Rechteck (x1/y1 exklusiv) irgendwo Deckkraft? */
export function hatInhalt(maske, breite, aufloesung, x0, y0, x1, y1) {
  const mb = breite * aufloesung;
  for (let y = y0 * aufloesung; y < y1 * aufloesung; y++) {
    const zeile = y * mb;
    for (let x = x0 * aufloesung; x < x1 * aufloesung; x++) if (maske[zeile + x]) return true;
  }
  return false;
}

/**
 * Kartenwert prüfen (Lader/Editor): unbekannte Böden, kaputte oder falsch große Masken und leere Schichten fallen weg.
 * @returns { aufloesung, schichten } oder null (nichts Gültiges)
 */
export function pruefeBodenMalerei(roh, breite, hoehe) {
  if (!roh || typeof roh !== 'object' || !roh.schichten || typeof roh.schichten !== 'object') return null;
  const aufloesung = Number.isInteger(roh.aufloesung) && roh.aufloesung >= 1 && roh.aufloesung <= 8 ? roh.aufloesung : MAL_AUFLOESUNG;
  const laenge = breite * aufloesung * hoehe * aufloesung;
  const schichten = {};
  for (const [name, text] of Object.entries(roh.schichten)) {
    if (!MAL_BOEDEN.includes(name) || typeof text !== 'string' || !text) continue;
    if (dekodiere(text, laenge)) schichten[name] = text;
  }
  return Object.keys(schichten).length ? { aufloesung, schichten } : null;
}

/** Alle Schichten entpacken: Map name → Uint8Array (Reihenfolge = Malreihenfolge) */
export function entpacke(malerei, breite, hoehe) {
  const m = new Map();
  if (!malerei?.schichten) return m;
  const a = malerei.aufloesung ?? MAL_AUFLOESUNG;
  for (const [name, text] of Object.entries(malerei.schichten)) {
    const maske = dekodiere(text, breite * a * hoehe * a);
    if (maske) m.set(name, maske);
  }
  return m;
}

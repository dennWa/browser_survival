/**
 * Raster-Algorithmen der Malwerkzeuge (reine Funktionen, liefern Kachellisten [{x, y}]).
 * Alles in Kachelkoordinaten; was außerhalb der Karte liegt, wird von `nurImFeld` herausgefiltert.
 */

/** Bresenham-Linie von (x0,y0) nach (x1,y1), inklusive Endpunkte. */
export function linie(x0, y0, x1, y1) {
  const punkte = [];
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let fehler = dx + dy;
  let x = x0;
  let y = y0;
  for (let n = 0; n < 100000; n++) {
    punkte.push({ x, y });
    if (x === x1 && y === y1) break;
    const e2 = 2 * fehler;
    if (e2 >= dy) {
      fehler += dy;
      x += sx;
    }
    if (e2 <= dx) {
      fehler += dx;
      y += sy;
    }
  }
  return punkte;
}

/**
 * Mauer-Linie mit Raster-Einrastung: nur waagerecht, senkrecht oder 45° (wie Mauern ziehen in Aufbauspielen).
 * @returns Endpunkt nach Einrasten
 */
export function rasteEin(x0, y0, x1, y1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  if (adx > ady * 2) return { x: x1, y: y0 };
  if (ady > adx * 2) return { x: x0, y: y1 };
  const d = Math.max(adx, ady);
  return { x: x0 + Math.sign(dx) * d, y: y0 + Math.sign(dy) * d };
}

/** Normalisiertes Rechteck aus zwei Ecken (inklusive) */
export function rechteckAus(x0, y0, x1, y1) {
  return { x: Math.min(x0, x1), y: Math.min(y0, y1), b: Math.abs(x1 - x0) + 1, h: Math.abs(y1 - y0) + 1 };
}

/** Kacheln eines Rechtecks; rand = true → nur der Umriss (z. B. Mauerring) */
export function rechteck(x0, y0, x1, y1, rand = false) {
  const r = rechteckAus(x0, y0, x1, y1);
  const punkte = [];
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.b; x++) {
      if (rand && x !== r.x && y !== r.y && x !== r.x + r.b - 1 && y !== r.y + r.h - 1) continue;
      punkte.push({ x, y });
    }
  }
  return punkte;
}

/** Pinsel: Quadrat (groesse 1, 2, 3 …) bzw. Kreis, zentriert auf (x, y) */
export function pinsel(x, y, groesse = 1, rund = false) {
  const punkte = [];
  const n = Math.max(1, Math.floor(groesse));
  const start = -Math.floor((n - 1) / 2);
  const r = n / 2;
  for (let dy = start; dy < start + n; dy++) {
    for (let dx = start; dx < start + n; dx++) {
      if (rund && n > 2 && Math.hypot(dx + 0.5 - (start + r), dy + 0.5 - (start + r)) > r) continue;
      punkte.push({ x: x + dx, y: y + dy });
    }
  }
  return punkte;
}

/**
 * Füllen (Flood-Fill, 4er-Nachbarschaft): alle zusammenhängenden Kacheln mit gleichem Wert wie (x, y).
 * @param wertAn (x, y) → vergleichbarer Wert oder null außerhalb
 */
export function fuellen(x, y, wertAn, max = 200000) {
  const start = wertAn(x, y);
  if (start === null || start === undefined) return [];
  const gesehen = new Set();
  const punkte = [];
  const stapel = [[x, y]];
  while (stapel.length && punkte.length < max) {
    const [cx, cy] = stapel.pop();
    const k = `${cx},${cy}`;
    if (gesehen.has(k)) continue;
    gesehen.add(k);
    if (wertAn(cx, cy) !== start) continue;
    punkte.push({ x: cx, y: cy });
    stapel.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
  }
  return punkte;
}

export function nurImFeld(karte, punkte) {
  const gesehen = new Set();
  return punkte.filter(({ x, y }) => {
    const k = y * karte.breite + x;
    if (!karte.imFeld(x, y) || gesehen.has(k)) return false;
    gesehen.add(k);
    return true;
  });
}

/** Kachel-Operationen fürs Malen */
export function kachelOps(karte, punkte, zeichen) {
  return nurImFeld(karte, punkte).map(({ x, y }) => ({ s: 'kachel', i: karte.index(x, y), neu: zeichen }));
}

/** Zerlegt eine Kachelmenge in Zeilen-Rechtecke [{x, y, b, h}] (für raumFlaechen) – zusammenhängende Läufe je Zeile, gleiche Läufe untereinander verschmolzen. */
export function alsRechtecke(punkte) {
  const zeilen = new Map();
  for (const { x, y } of punkte) {
    if (!zeilen.has(y)) zeilen.set(y, []);
    zeilen.get(y).push(x);
  }
  const laeufe = [];
  for (const [y, xs] of [...zeilen].sort((a, b) => a[0] - b[0])) {
    xs.sort((a, b) => a - b);
    let start = xs[0];
    for (let i = 1; i <= xs.length; i++) {
      if (i < xs.length && xs[i] === xs[i - 1] + 1) continue;
      laeufe.push({ x: start, y, b: xs[i - 1] - start + 1, h: 1 });
      start = xs[i];
    }
  }
  // gleiche Läufe direkt untereinander verschmelzen
  const offen = new Map();
  const fertig = [];
  for (const l of laeufe) {
    const k = `${l.x},${l.b}`;
    const vorher = offen.get(k);
    if (vorher && vorher.y + vorher.h === l.y) vorher.h++;
    else {
      if (vorher) fertig.push(vorher);
      offen.set(k, { ...l });
    }
  }
  return [...fertig, ...offen.values()].sort((a, b) => a.y - b.y || a.x - b.x);
}

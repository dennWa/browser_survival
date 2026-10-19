/**
 * Gelände-Höhen (Editor 2.0, Schritt 2.4) – gemeinsam für Server, Client und Map-Editor (umgebungsfrei).
 * Eine Höhe je Kachel in Metern (1 m = 1 Kachel = kachelGroesse px), + = Hügel/Plateau, − = Senke.
 *
 * Begehbarkeit (Klippen-Regel): Liegt ein Nachbar (4er-Nachbarschaft) mehr als KLIPPE höher, ist die Kachel der FUSS einer
 * Klippe und gesperrt. Die Oberseite eines Plateaus bleibt begehbar, sanfte Hänge und Rampen (≤ KLIPPE je Kachel) auch –
 * dadurch funktionieren Bewegung, Zombie-Pfadsuche und Fahrzeuge ohne eigene Höhenlogik (Kachel-Kollision wie bisher).
 * Treffer bleiben in der Draufsicht 2D (Nutzer-Entscheidung F4); die Ego-Ansicht prüft die Neigung (kampfSystem).
 */
export const KLIPPE = 1.0;
export const HOEHE_MIN = -10;
export const HOEHE_MAX = 10;

/** Kacheln am Fuß einer Klippe: [[x, y], …] */
export function klippenFuesse(hoehen, breite, hoehe, schwelle = KLIPPE) {
  const liste = [];
  if (!hoehen || !hoehen.some((h) => h !== 0)) return liste;
  for (let y = 0; y < hoehe; y++)
    for (let x = 0; x < breite; x++) {
      const h = hoehen[y * breite + x];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= breite || ny >= hoehe) continue;
        if (hoehen[ny * breite + nx] - h > schwelle) {
          liste.push([x, y]);
          break;
        }
      }
    }
  return liste;
}

/**
 * Höhe (Meter) an einer Stelle in Kachelkoordinaten (Brüche erlaubt) – bilinear zwischen den Kachelmitten.
 * Ohne Höhen 0.
 */
export function hoeheAn(hoehen, breite, hoehe, tx, ty) {
  if (!hoehen) return 0;
  const fx = Math.max(0, Math.min(breite - 1, tx - 0.5));
  const fy = Math.max(0, Math.min(hoehe - 1, ty - 0.5));
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(breite - 1, x0 + 1);
  const y1 = Math.min(hoehe - 1, y0 + 1);
  const ax = fx - x0;
  const ay = fy - y0;
  const h = (x, y) => hoehen[y * breite + x];
  return (h(x0, y0) * (1 - ax) + h(x1, y0) * ax) * (1 - ay) + (h(x0, y1) * (1 - ax) + h(x1, y1) * ax) * ay;
}

/** Höhen aus dem Kartenformat lesen: Zeilen "0 0 1.5 …" → Array (Meter, auf cm gerundet, begrenzt) oder null */
export function liesHoehen(zeilen, breite, hoehe) {
  if (!Array.isArray(zeilen)) return null;
  const hoehen = new Array(breite * hoehe).fill(0);
  zeilen.slice(0, hoehe).forEach((zeile, y) => {
    String(zeile)
      .trim()
      .split(/\s+/)
      .slice(0, breite)
      .forEach((w, x) => {
        const n = Number(w);
        hoehen[y * breite + x] = Number.isFinite(n) ? Math.round(Math.max(HOEHE_MIN, Math.min(HOEHE_MAX, n)) * 100) / 100 : 0;
      });
  });
  return hoehen.some((h) => h !== 0) ? hoehen : null;
}

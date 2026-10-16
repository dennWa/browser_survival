/**
 * Erkundete Kacheln ("Nebel des Krieges" der Karte, Taste K). Der Server merkt sie sich pro Spieler im
 * Spielstand → auf jedem Gerät dieselbe Karte; der Client markiert zusätzlich selbst (sofortige Anzeige).
 *   erkundet = Uint8Array(breite × hoehe), 1 = schon gesehen
 */
export const SICHT_KACHELN = 9;

/** Alles im Umkreis SICHT_KACHELN um (x, y) (Weltpixel) als erkundet markieren. @returns true, wenn neu */
export function markiereErkundet(erkundet, welt, x, y) {
  const g = welt.kachelGroesse;
  const tx = Math.floor(x / g);
  const ty = Math.floor(y / g);
  let neu = false;
  for (let dy = -SICHT_KACHELN; dy <= SICHT_KACHELN; dy++) {
    const yy = ty + dy;
    if (yy < 0 || yy >= welt.hoehe) continue;
    for (let dx = -SICHT_KACHELN; dx <= SICHT_KACHELN; dx++) {
      const xx = tx + dx;
      if (xx < 0 || xx >= welt.breite || dx * dx + dy * dy > SICHT_KACHELN * SICHT_KACHELN) continue;
      const i = yy * welt.breite + xx;
      if (!erkundet[i]) {
        erkundet[i] = 1;
        neu = true;
      }
    }
  }
  return neu;
}

/** 8 Kacheln pro Byte → Base64 (~1,6 KB für die Stadtrand-Karte). */
export function packeErkundet(erkundet) {
  const bytes = new Uint8Array(Math.ceil(erkundet.length / 8));
  for (let i = 0; i < erkundet.length; i++) if (erkundet[i]) bytes[i >> 3] |= 1 << (i & 7);
  let text = '';
  for (let i = 0; i < bytes.length; i += 4096) text += String.fromCharCode(...bytes.subarray(i, i + 4096));
  return btoa(text);
}

/** Gegenstück zu packeErkundet; kaputte Daten → null. */
export function entpackeErkundet(base64, laenge) {
  try {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const erkundet = new Uint8Array(laenge);
    for (let i = 0; i < laenge; i++) erkundet[i] = (bytes[i >> 3] >> (i & 7)) & 1;
    return erkundet;
  } catch {
    return null;
  }
}

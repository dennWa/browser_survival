/**
 * Fahrzeug-Physik – gemeinsam für Server (autoritativ) und Client (Vorhersage), deterministisch wie bewegung.js.
 *
 * Ein Fahrzeug: { id, modell, x, y, winkel, tempo, laenge, breite }
 *   x/y = Mitte (Weltpixel), winkel = Fahrtrichtung (Radiant, 0 = nach rechts, wie spieler.blick),
 *   tempo = px/s (negativ = rückwärts)
 * Eingabe wie beim Laufen: y = -1 (W) Gas, y = +1 (S) Bremse/rückwärts, x = lenken.
 *
 * Kollision: drei Kreise entlang der Längsachse (vorne, Mitte, hinten) gegen blockierte Kacheln –
 * Lenken prüft die neue Pose (kein Einklemmen); steckt das Auto schon fest, darf es freifahren.
 * die eigenen Fahrzeug-Kacheln zählen nicht (welt.istBlockiert(tx, ty, ignoriereFahrzeug)).
 */
export const FAHRZEUG = Object.freeze({
  beschleunigung: 230, // px/s²
  bremse: 520,
  rueckwaertsMax: 120,
  max: 340, // px/s (Laufen: 150)
  rollReibung: 160, // ohne Gas wird er langsamer
  lenkung: 2.4, // rad/s bei voller Lenkung und Fahrt
  abprallen: 0.25, // Anteil des Tempos, der beim Aufprall übrig bleibt (rückwärts)
});

/** So nah (px, zum Fahrzeugrand) muss man stehen, um einzusteigen. */
export const EINSTIEG_ABSTAND = 34;

/** Abstand eines Punkts zum Fahrzeug-Rechteck (0 = drin). */
export function abstandZumFahrzeug(fz, x, y) {
  const dx = x - fz.x;
  const dy = y - fz.y;
  const laengs = Math.abs(dx * Math.cos(fz.winkel) + dy * Math.sin(fz.winkel)) - fz.laenge / 2;
  const quer = Math.abs(-dx * Math.sin(fz.winkel) + dy * Math.cos(fz.winkel)) - fz.breite / 2;
  return Math.hypot(Math.max(0, laengs), Math.max(0, quer));
}

/** Maße und Startdaten der Kartenautos (Objekttyp → Fahrzeug). */
export const FAHRZEUG_MODELLE = Object.freeze({
  auto_schwarz: { name: 'Auto', farbe: 0x2b2d31 },
  auto_blau: { name: 'Auto', farbe: 0x2d6fc0 },
  auto_rot: { name: 'Auto', farbe: 0xc0392b },
  auto_gruen: { name: 'Auto', farbe: 0x3f8a3a },
  auto_gelb: { name: 'Auto', farbe: 0xe0b52c },
  transporter: { name: 'Transporter', farbe: 0xe8e8e2, transporter: true },
});

/** Kartenobjekt (Auto mit drehung in Grad, 0 = Front nach oben) → Fahrzeugdaten */
export function fahrzeugAusObjekt(o, g) {
  const quer = o.b > o.h; // liegt waagerecht
  return {
    modell: o.typ,
    x: (o.x + o.b / 2) * g,
    y: (o.y + o.h / 2) * g,
    winkel: (((o.drehung ?? (quer ? 90 : 0)) - 90) * Math.PI) / 180,
    tempo: 0,
    laenge: Math.max(o.b, o.h) * g * 0.86,
    breite: Math.min(o.b, o.h) * g * 0.72,
  };
}

/** Ein Schritt Fahren. @returns { aufprall: true/false } */
export function fahre(fz, eingabe, welt, dt) {
  const gas = Number.isFinite(eingabe.y) ? Math.max(-1, Math.min(1, -eingabe.y)) : 0;
  const lenken = Number.isFinite(eingabe.x) ? Math.max(-1, Math.min(1, eingabe.x)) : 0;
  const p = FAHRZEUG;
  if (gas > 0.1) fz.tempo += (fz.tempo < 0 ? p.bremse : p.beschleunigung) * gas * dt;
  else if (gas < -0.1) fz.tempo -= (fz.tempo > 0 ? p.bremse : p.beschleunigung * 0.6) * -gas * dt;
  else fz.tempo = Math.sign(fz.tempo) * Math.max(0, Math.abs(fz.tempo) - p.rollReibung * dt);
  fz.tempo = Math.max(-p.rueckwaertsMax, Math.min(p.max, fz.tempo));
  // Lenken wirkt nur in Fahrt (rückwärts andersherum, wie im echten Auto)
  // Drehung nur, wenn die neue Pose frei ist (sonst klemmt das Auto in der Wand und ist stuck)
  const drehung = lenken * p.lenkung * dt * Math.max(-1, Math.min(1, fz.tempo / 110));
  const steckt = !passt(fz, fz.x, fz.y, welt); // schon eingeklemmt (z. B. Altstand) → Freifahr-Modus
  if (drehung !== 0) {
    for (const f of [1, 0.5, 0.25]) {
      const w = fz.winkel + drehung * f;
      if (steckt || passt(fz, fz.x, fz.y, welt, w)) {
        fz.winkel = w;
        break;
      }
    }
  }
  const dx = Math.cos(fz.winkel) * fz.tempo * dt;
  const dy = Math.sin(fz.winkel) * fz.tempo * dt;
  if (dx === 0 && dy === 0) return { aufprall: false };
  // Erst ganz, sonst einzeln je Achse (an Wänden entlangschrammen), sonst Aufprall
  for (const [mx, my] of [[dx, dy], [dx, 0], [0, dy]]) {
    if (mx === 0 && my === 0) continue;
    if (passt(fz, fz.x + mx, fz.y + my, welt)) {
      fz.x += mx;
      fz.y += my;
      if (mx !== dx || my !== dy) fz.tempo *= 0.96; // schrammen bremst
      return { aufprall: mx !== dx || my !== dy };
    }
  }
  if (steckt) {
    // Eingeklemmt: trotzdem langsam herausfahren, bis das Auto wieder frei steht
    fz.x += dx * 0.5;
    fz.y += dy * 0.5;
    return { aufprall: true };
  }
  fz.tempo = -fz.tempo * p.abprallen;
  return { aufprall: true };
}

/** Passt das Fahrzeug an Position (x, y)? Drei Kreise entlang der Längsachse. */
export function passt(fz, x, y, welt, winkel = fz.winkel) {
  const r = fz.breite / 2;
  const versatz = fz.laenge / 2 - r;
  const g = welt.kachelGroesse;
  for (const s of [-versatz, 0, versatz]) {
    const cx = x + Math.cos(winkel) * s;
    const cy = y + Math.sin(winkel) * s;
    const r2 = r * 0.92;
    for (let ty = Math.floor((cy - r2) / g); ty <= Math.floor((cy + r2) / g); ty++) {
      for (let tx = Math.floor((cx - r2) / g); tx <= Math.floor((cx + r2) / g); tx++) {
        if (!welt.istBlockiert(tx, ty, fz.id)) continue;
        // Kreis gegen Kachel-Rechteck
        const nx = Math.max(tx * g, Math.min(cx, (tx + 1) * g));
        const ny = Math.max(ty * g, Math.min(cy, (ty + 1) * g));
        if ((cx - nx) ** 2 + (cy - ny) ** 2 < r2 * r2) return false;
      }
    }
  }
  return true;
}

/** Kacheln, die ein (stehendes oder fahrendes) Fahrzeug belegt: deren Mitte liegt im Fahrzeug-Rechteck. */
export function fahrzeugKacheln(fz, g) {
  const kacheln = [];
  const halbL = fz.laenge / 2 - 2;
  const halbB = fz.breite / 2 - 2;
  const cos = Math.cos(fz.winkel);
  const sin = Math.sin(fz.winkel);
  const r = Math.hypot(halbL, halbB);
  for (let ty = Math.floor((fz.y - r) / g); ty <= Math.floor((fz.y + r) / g); ty++) {
    for (let tx = Math.floor((fz.x - r) / g); tx <= Math.floor((fz.x + r) / g); tx++) {
      const dx = (tx + 0.5) * g - fz.x;
      const dy = (ty + 0.5) * g - fz.y;
      const laengs = dx * cos + dy * sin;
      const quer = -dx * sin + dy * cos;
      if (Math.abs(laengs) <= halbL && Math.abs(quer) <= halbB) kacheln.push({ tx, ty });
    }
  }
  return kacheln;
}

/** Wo steigt man aus? Erste freie Stelle links/rechts/hinten/vorne neben dem Fahrzeug – oder null. */
export function ausstiegsPunkt(fz, welt, radius) {
  const g = welt.kachelGroesse;
  const cos = Math.cos(fz.winkel);
  const sin = Math.sin(fz.winkel);
  const seitlich = fz.breite / 2 + radius + 6;
  const laengs = fz.laenge / 2 + radius + 6;
  const kandidaten = [
    [-sin * seitlich, cos * seitlich],
    [sin * seitlich, -cos * seitlich],
    [-cos * laengs, -sin * laengs],
    [cos * laengs, sin * laengs],
  ];
  for (const [dx, dy] of kandidaten) {
    const x = fz.x + dx;
    const y = fz.y + dy;
    let frei = true;
    for (let ty = Math.floor((y - radius) / g); ty <= Math.floor((y + radius) / g) && frei; ty++) {
      for (let tx = Math.floor((x - radius) / g); tx <= Math.floor((x + radius) / g) && frei; tx++) {
        if (welt.istBlockiert(tx, ty)) frei = false;
      }
    }
    if (frei) return { x, y };
  }
  return null;
}

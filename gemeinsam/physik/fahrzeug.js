/**
 * Fahrzeug-Physik – gemeinsam für Server (autoritativ) und Client (Vorhersage), deterministisch wie bewegung.js.
 *
 * Ein Fahrzeug: { id, modell, x, y, winkel, tempo, laenge, breite }
 *   x/y = Mitte (Weltpixel), winkel = Fahrtrichtung (Radiant, 0 = nach rechts, wie spieler.blick),
 *   tempo = px/s (negativ = rückwärts)
 * Eingabe wie beim Laufen: y = -1 (W) Gas, y = +1 (S) Bremse/rückwärts, x = lenken.
 * fz.lenkung = aktueller Lenkeinschlag (−1..1, folgt der Eingabe weich wie ein Lenkrad) – gehört zum Fahrzustand
 * (Vorhersage/Reconciliation: spielerZuNetzwerk schickt ihn mit).
 *
 * Fahrmodell (Nutzer-Wunsch „realistischer“): Einspurmodell – Drehrate = Tempo / Radstand × tan(Lenkwinkel);
 * der größte Lenkwinkel sinkt mit dem Tempo (bei Vollgas nur noch weite Kurven), Beschleunigung lässt zur
 * Höchstgeschwindigkeit hin nach, ohne Gas bremsen Rollreibung + Fahrtwind.
 *
 * Kollision: drei Kreise entlang der Längsachse (vorne, Mitte, hinten) gegen blockierte Kacheln –
 * Lenken prüft die neue Pose (kein Einklemmen); steckt das Auto schon fest, darf es freifahren.
 * die eigenen Fahrzeug-Kacheln zählen nicht (welt.istBlockiert(tx, ty, ignoriereFahrzeug)).
 */
export const FAHRZEUG = Object.freeze({
  beschleunigung: 125, // px/s² beim Anfahren (vorher 230 – zog zu schnell an); zur Höchstgeschwindigkeit hin nur noch ¼ davon
  bremse: 400,
  rueckwaertsMax: 110,
  max: 340, // px/s (Laufen: 150)
  rollReibung: 70, // ohne Gas wird er langsamer …
  fahrtwind: 0.28, // … plus dieser Anteil des Tempos je Sekunde
  lenkWinkel: 0.65, // rad, größter Radeinschlag im Stand/langsam
  lenkAbfall: 225, // px/s (Runde 21: 200 → etwas straffer): bei diesem Tempo ist der größte Einschlag halbiert
  radstand: 0.55, // Anteil der Fahrzeuglänge
  lenkTempo: 5, // so schnell (Runde 21: 4 → straffer) (1/s) dreht das „Lenkrad“ zum Anschlag …
  lenkZurueck: 6.5, // … und zurück in die Mitte
  abprallen: 0.25, // Anteil des Tempos, der beim Aufprall übrig bleibt (rückwärts)
});

/** Anzeige-Höchstgeschwindigkeit (Tacho): FAHRZEUG.max entspricht 120 km/h (Runde 20, vorher 70 – wirkte zu lahm) */
export const FAHRZEUG_MAX_KMH = 120;
/** ab diesem Tempo wirken Aufprälle (Schaden am eigenen Auto) und Bäume/Laternen werden umgefahren (≈ 56 px/s, wie früher „10 km/h“) */
export const AUFPRALL_MIN_KMH = 17;

/** Straßenlaternen werden erst ab diesem Tempo umgefahren (darunter halten sie das Auto auf; ≈ 198 px/s, wie früher „40 km/h“) */
export const LATERNE_MIN_KMH = 70;

/** px/s → km/h (für Tacho & Aufprall-Schwelle) */
export function tempoZuKmh(tempo) {
  return (Math.abs(tempo) * FAHRZEUG_MAX_KMH) / FAHRZEUG.max;
}

/** km/h → px/s */
export function kmhZuTempo(kmh) {
  return (kmh * FAHRZEUG.max) / FAHRZEUG_MAX_KMH;
}

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

/** Steht (x, y) hinter dem Fahrzeug (Heck, in Einstiegsreichweite)? → Tab öffnet dort den Kofferraum (Runde 21). */
export function hinterFahrzeug(fz, x, y) {
  const dx = x - fz.x;
  const dy = y - fz.y;
  const laengs = dx * Math.cos(fz.winkel) + dy * Math.sin(fz.winkel);
  const quer = -dx * Math.sin(fz.winkel) + dy * Math.cos(fz.winkel);
  return laengs < -fz.laenge * 0.3 && Math.abs(quer) <= fz.breite / 2 + 10 && abstandZumFahrzeug(fz, x, y) <= EINSTIEG_ABSTAND;
}

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

/**
 * Ein Schritt Fahren. @returns { aufprall: true/false }
 * Zusätzlich merkt sich `fz.aufprall = { kmh, schramm }` (stärkster Aufprall seit dem Abholen durch den Server – der setzt es zurück):
 * Wand/anderes Fahrzeug getroffen, kmh = Tempo davor, schramm = nur an der Wand entlanggeschrammt.
 */
export function fahre(fz, eingabe, welt, dt) {
  const gas = Number.isFinite(eingabe.y) ? Math.max(-1, Math.min(1, -eingabe.y)) : 0;
  const lenken = Number.isFinite(eingabe.x) ? Math.max(-1, Math.min(1, eingabe.x)) : 0;
  const p = FAHRZEUG;
  const anteil = Math.min(1, Math.abs(fz.tempo) / p.max);
  if (gas > 0.1) fz.tempo += (fz.tempo < 0 ? p.bremse : p.beschleunigung * (1 - 0.75 * anteil * anteil)) * gas * dt;
  else if (gas < -0.1) fz.tempo -= (fz.tempo > 0 ? p.bremse : p.beschleunigung * 0.7) * -gas * dt;
  else fz.tempo = Math.sign(fz.tempo) * Math.max(0, Math.abs(fz.tempo) - (p.rollReibung + p.fahrtwind * Math.abs(fz.tempo)) * dt);
  fz.tempo = Math.max(-p.rueckwaertsMax, Math.min(p.max, fz.tempo));
  // Lenkrad folgt der Eingabe weich (kein Sofort-Einschlag)
  const lenkung = Number.isFinite(fz.lenkung) ? fz.lenkung : 0;
  const zurMitte = Math.abs(lenken) < Math.abs(lenkung) || Math.sign(lenken) !== Math.sign(lenkung);
  const schritt = (zurMitte ? p.lenkZurueck : p.lenkTempo) * dt;
  fz.lenkung = lenkung + Math.max(-schritt, Math.min(schritt, lenken - lenkung));
  // Einspurmodell: Drehrate = v / Radstand · tan(Einschlag); Einschlag wird mit dem Tempo kleiner (rückwärts andersherum, wie im echten Auto)
  // Drehung nur, wenn die neue Pose frei ist (sonst klemmt das Auto in der Wand und ist stuck)
  const einschlag = (fz.lenkung * p.lenkWinkel) / (1 + (fz.tempo / p.lenkAbfall) ** 2);
  const drehung = ((fz.tempo / Math.max(20, fz.laenge * p.radstand)) * Math.tan(einschlag)) * dt;
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
  const kmh = tempoZuKmh(fz.tempo);
  const merkeAufprall = (schramm) => {
    if (kmh < AUFPRALL_MIN_KMH) return;
    if (!fz.aufprall || kmh > fz.aufprall.kmh) fz.aufprall = { kmh, schramm };
    else if (!schramm) fz.aufprall.schramm = false;
  };
  // Erst ganz, sonst einzeln je Achse (an Wänden entlangschrammen), sonst Aufprall
  for (const [mx, my] of [[dx, dy], [dx, 0], [0, dy]]) {
    if (mx === 0 && my === 0) continue;
    if (passt(fz, fz.x + mx, fz.y + my, welt)) {
      fz.x += mx;
      fz.y += my;
      if (mx !== dx || my !== dy) {
        fz.tempo *= 0.96; // schrammen bremst
        merkeAufprall(true);
      }
      return { aufprall: mx !== dx || my !== dy };
    }
  }
  if (steckt) {
    // Eingeklemmt: trotzdem langsam herausfahren, bis das Auto wieder frei steht
    fz.x += dx * 0.5;
    fz.y += dy * 0.5;
    return { aufprall: true };
  }
  merkeAufprall(false);
  fz.tempo = -fz.tempo * p.abprallen;
  return { aufprall: true };
}

/**
 * Passt das Fahrzeug an Position (x, y)? Drei Kreise entlang der Längsachse.
 * Baumstämme blockieren nur unter AUFPRALL_MIN_KMH, Lampenmasten unter LATERNE_MIN_KMH – schneller werden sie umgefahren (der Server fällt sie, fahrzeugSystem).
 */
export function passt(fz, x, y, welt, winkel = fz.winkel) {
  const r = fz.breite / 2;
  const kmh = tempoZuKmh(fz.tempo);
  const hindernisseBlockieren = kmh < LATERNE_MIN_KMH && typeof welt.umfahrbareImKreis === 'function';
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
    if (hindernisseBlockieren && welt.umfahrbareImKreis(cx, cy, r2).some((h) => kmh < (h.typ === 'laterne' ? LATERNE_MIN_KMH : AUFPRALL_MIN_KMH))) return false;
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

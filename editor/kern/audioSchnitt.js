/**
 * Audio-Bearbeitung der Audio-Zentrale (Editor Phase 10.5) – reine Rechnung auf PCM-Kanälen (Float32Array je Kanal),
 * ohne Web-Audio (Tests: tests/audioZentrale.test.js). Gespeichert wird später NUR das Ergebnis von `bearbeite`
 * (gekürzt, Fades/Lautstärke eingerechnet, Schleife nahtlos überblendet) – das ungekürzte Original nicht.
 *
 * Bearbeitung e = { start, ende (s; 0 = bis Schluss), fadeIn, fadeOut (s), gainDb (−24…+12), normalisieren (Spitze → −1 dB),
 *                   loop (nahtlose Schleife), ueberblendung (s, Loop-Übergang) }
 */
export const STANDARD_BEARBEITUNG = Object.freeze({ start: 0, ende: 0, fadeIn: 0, fadeOut: 0, gainDb: 0, normalisieren: false, loop: false, ueberblendung: 0.25 });
export const NORMAL_SPITZE = 0.89; // −1 dBFS
export const GAIN_GRENZEN = Object.freeze([-24, 12]);

/** Werte begrenzen (Start < Ende, Fades passen in die Länge, Überblendung ≤ halbe Länge) */
export function pruefeBearbeitung(e, dauer) {
  const b = { ...STANDARD_BEARBEITUNG, ...e };
  const zahl = (x, d = 0) => (Number.isFinite(x) ? x : d);
  b.start = Math.max(0, Math.min(zahl(b.start), Math.max(0, dauer - 0.01)));
  b.ende = zahl(b.ende) > 0 ? Math.min(dauer, Math.max(b.start + 0.01, b.ende)) : 0;
  const laenge = (b.ende || dauer) - b.start;
  b.fadeIn = Math.max(0, Math.min(zahl(b.fadeIn), laenge));
  b.fadeOut = Math.max(0, Math.min(zahl(b.fadeOut), laenge - b.fadeIn));
  b.gainDb = Math.max(GAIN_GRENZEN[0], Math.min(GAIN_GRENZEN[1], zahl(b.gainDb)));
  b.normalisieren = !!b.normalisieren;
  b.loop = !!b.loop;
  b.ueberblendung = Math.max(0, Math.min(zahl(b.ueberblendung, 0.25), laenge / 2));
  return b;
}

/** Nichts verändert? (dann darf die Original-Datei unverändert gespeichert werden) */
export function istUnveraendert(e, dauer) {
  const b = pruefeBearbeitung(e, dauer);
  return b.start === 0 && (b.ende === 0 || b.ende >= dauer - 0.001) && b.fadeIn === 0 && b.fadeOut === 0 && b.gainDb === 0 && !b.normalisieren && !b.loop;
}

/** Höchster Betrag über alle Kanäle */
export function spitze(kanaele) {
  let m = 0;
  for (const k of kanaele) for (let i = 0; i < k.length; i++) {
    const v = Math.abs(k[i]);
    if (v > m) m = v;
  }
  return m;
}

/** Länge (s) nach dem Schnitt (bei Loop um die Überblendung kürzer) */
export function ergebnisDauer(e, dauer) {
  const b = pruefeBearbeitung(e, dauer);
  const laenge = (b.ende || dauer) - b.start;
  return b.loop ? laenge - b.ueberblendung : laenge;
}

/**
 * Bearbeitung anwenden. @param quelle { kanaele: Float32Array[], rate } @returns { kanaele, rate, faktor, geklippt }
 * Reihenfolge: schneiden → (Loop: Ende in den Anfang überblenden, gleich laut) → Fades (nicht bei Loop) → Lautstärke.
 */
export function bearbeite({ kanaele, rate }, e) {
  const dauer = (kanaele[0]?.length ?? 0) / rate;
  const b = pruefeBearbeitung(e, dauer);
  const s0 = Math.round(b.start * rate);
  const s1 = Math.max(s0 + 1, Math.round((b.ende || dauer) * rate));
  let aus = kanaele.map((k) => k.slice(s0, s1));
  const n = s1 - s0;
  if (b.loop) {
    const c = Math.min(Math.floor(b.ueberblendung * rate), Math.floor(n / 2));
    if (c > 0) {
      // Ergebnis y (Länge n − c): y[i] = x[c + i]; die letzten c Werte blenden vom Ende (x[n−c+j]) in den Anfang (x[j]) über →
      // y endet genau dort, wo y[0] = x[c] weitergeht: nahtlos.
      aus = aus.map((x) => {
        const y = new Float32Array(n - c);
        y.set(x.subarray(c, n - c), 0);
        const basis = n - 2 * c;
        for (let j = 0; j < c; j++) {
          const t = (j + 0.5) / c;
          y[basis + j] = x[n - c + j] * Math.cos((t * Math.PI) / 2) + x[j] * Math.sin((t * Math.PI) / 2);
        }
        return y;
      });
    }
  } else {
    const fi = Math.round(b.fadeIn * rate);
    const fo = Math.round(b.fadeOut * rate);
    for (const y of aus) {
      for (let i = 0; i < fi && i < y.length; i++) y[i] *= i / fi;
      for (let i = 0; i < fo && i < y.length; i++) y[y.length - 1 - i] *= i / fo;
    }
  }
  let faktor = 10 ** (b.gainDb / 20);
  if (b.normalisieren) {
    const sp = spitze(aus);
    if (sp > 1e-6) faktor *= NORMAL_SPITZE / sp;
  }
  let geklippt = 0;
  if (faktor !== 1) {
    for (const y of aus) for (let i = 0; i < y.length; i++) {
      let v = y[i] * faktor;
      if (v > 1) (v = 1), geklippt++;
      else if (v < -1) (v = -1), geklippt++;
      y[i] = v;
    }
  }
  return { kanaele: aus, rate, faktor, geklippt };
}

/** Wellenform für die Anzeige: je Spalte [min, max] (−1…1) → Float32Array der Länge 2·breite */
export function wellenformMinMax(kanal, breite) {
  const aus = new Float32Array(breite * 2);
  const n = kanal.length;
  if (!n || breite < 1) return aus;
  for (let x = 0; x < breite; x++) {
    const a = Math.floor((x / breite) * n);
    const e = Math.max(a + 1, Math.floor(((x + 1) / breite) * n));
    let lo = 1;
    let hi = -1;
    const schritt = Math.max(1, Math.floor((e - a) / 400)); // lange Dateien: nur Stichproben
    for (let i = a; i < e && i < n; i += schritt) {
      const v = kanal[i];
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    aus[x * 2] = lo;
    aus[x * 2 + 1] = hi;
  }
  return aus;
}

/** Kanäle → 16-Bit-PCM-WAV (Uint8Array) */
export function kodiereWav({ kanaele, rate }) {
  const k = kanaele.length;
  const n = kanaele[0]?.length ?? 0;
  const daten = n * k * 2;
  const puffer = new ArrayBuffer(44 + daten);
  const v = new DataView(puffer);
  const schreibe = (o, t) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  schreibe(0, 'RIFF');
  v.setUint32(4, 36 + daten, true);
  schreibe(8, 'WAVE');
  schreibe(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, k, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * k * 2, true);
  v.setUint16(32, k * 2, true);
  v.setUint16(34, 16, true);
  schreibe(36, 'data');
  v.setUint32(40, daten, true);
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < k; c++) {
    const s = Math.max(-1, Math.min(1, kanaele[c][i]));
    v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    o += 2;
  }
  return new Uint8Array(puffer);
}

/** Kleine WAV-Datei lesen (16-Bit PCM) – für Tests und als Rückfall */
export function leseWav(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const k = v.getUint16(22, true);
  const rate = v.getUint32(24, true);
  let o = 12;
  while (o < bytes.length - 8) {
    const id = String.fromCharCode(...bytes.subarray(o, o + 4));
    const groesse = v.getUint32(o + 4, true);
    if (id === 'data') {
      const n = groesse / 2 / k;
      const kanaele = Array.from({ length: k }, () => new Float32Array(n));
      for (let i = 0; i < n; i++) for (let c = 0; c < k; c++) kanaele[c][i] = v.getInt16(o + 8 + (i * k + c) * 2, true) / 0x8000;
      return { kanaele, rate };
    }
    o += 8 + groesse + (groesse % 2);
  }
  throw new Error('WAV ohne Daten');
}

/** Bitrate (bit/s) für Opus: kurze Effekte mono 64k, Stereo 96k, Musik 128k */
export function bitrateFuer({ kanaele, dauer, musik = false }) {
  if (musik) return kanaele > 1 ? 128000 : 96000;
  return kanaele > 1 ? 96000 : 64000;
}

/** Größe schätzen + Hinweis (Bytes) */
export function groessenHinweis(bytes, { musik = false } = {}) {
  const mb = bytes / 1024 / 1024;
  if (musik ? mb > 8 : mb > 1.5) return `Recht groß (${mb.toFixed(1).replace('.', ',')} MB) – lädt am Handy langsam. Tipp: kürzen${musik ? '' : ' oder Mono'}.`;
  return '';
}

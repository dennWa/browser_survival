/**
 * Ogg-Opus-Verpackung (Editor Phase 10.5) – reine Funktionen, ohne Web-Audio (Tests: tests/audioZentrale.test.js).
 * Der Browser kodiert Opus-Pakete (WebCodecs AudioEncoder, ui/audioKodierer.js); hier werden sie in eine abspielbare
 * .ogg-Datei gepackt (RFC 7845: Seite 1 OpusHead, Seite 2 OpusTags, dann Audio-Seiten mit Granulposition in 48-kHz-Samples).
 * Die letzte Granulposition = preSkip + echte Länge → Decoder schneiden Vorlauf und Polster am Ende ab (wichtig für Schleifen).
 */
const CRC_TABELLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let r = i << 24;
    for (let j = 0; j < 8; j++) r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1;
    t[i] = r >>> 0;
  }
  return t;
})();

/** Ogg-CRC32 (Polynom 0x04C11DB7, nicht gespiegelt, Start 0) */
export function oggCrc(bytes) {
  let crc = 0;
  for (let i = 0; i < bytes.length; i++) crc = ((crc << 8) ^ CRC_TABELLE[((crc >>> 24) ^ bytes[i]) & 0xff]) >>> 0;
  return crc >>> 0;
}

/** Eine Ogg-Seite aus ganzen Paketen. typ: 2 = Anfang (BOS), 4 = Ende (EOS) */
export function oggSeite({ pakete, granule, serie, nummer, typ = 0 }) {
  const segmente = [];
  for (const p of pakete) {
    let rest = p.length;
    while (rest >= 255) {
      segmente.push(255);
      rest -= 255;
    }
    segmente.push(rest);
  }
  if (segmente.length > 255) throw new Error('Zu viele Segmente auf einer Ogg-Seite');
  const laenge = pakete.reduce((s, p) => s + p.length, 0);
  const seite = new Uint8Array(27 + segmente.length + laenge);
  const v = new DataView(seite.buffer);
  seite.set([0x4f, 0x67, 0x67, 0x53], 0); // "OggS"
  seite[4] = 0;
  seite[5] = typ;
  v.setBigUint64(6, BigInt(granule), true);
  v.setUint32(14, serie >>> 0, true);
  v.setUint32(18, nummer, true);
  v.setUint32(22, 0, true);
  seite[26] = segmente.length;
  seite.set(segmente, 27);
  let o = 27 + segmente.length;
  for (const p of pakete) {
    seite.set(p, o);
    o += p.length;
  }
  v.setUint32(22, oggCrc(seite), true);
  return seite;
}

/** OpusHead (19 Bytes, Kanal-Zuordnung 0 = mono/stereo) */
export function opusHead({ kanaele, preSkip, eingangsRate }) {
  const b = new Uint8Array(19);
  const v = new DataView(b.buffer);
  b.set([...'OpusHead'].map((c) => c.charCodeAt(0)), 0);
  b[8] = 1;
  b[9] = kanaele;
  v.setUint16(10, preSkip, true);
  v.setUint32(12, eingangsRate, true);
  v.setInt16(16, 0, true);
  b[18] = 0;
  return b;
}

export function opusTags(hersteller = 'browser-survival Audio-Zentrale') {
  const h = new TextEncoder().encode(hersteller);
  const b = new Uint8Array(8 + 4 + h.length + 4);
  const v = new DataView(b.buffer);
  b.set([...'OpusTags'].map((c) => c.charCodeAt(0)), 0);
  v.setUint32(8, h.length, true);
  b.set(h, 12);
  v.setUint32(12 + h.length, 0, true);
  return b;
}

/** Liest preSkip aus einer vorhandenen OpusHead (z. B. decoderConfig.description des Encoders) – sonst null */
export function preSkipAus(head) {
  if (!head || head.length < 19 || String.fromCharCode(...head.subarray(0, 8)) !== 'OpusHead') return null;
  return new DataView(head.buffer, head.byteOffset, head.byteLength).getUint16(10, true);
}

/**
 * Pakete zu einer .ogg-Datei. @param pakete [{ daten: Uint8Array, samples (48 kHz) }]
 * @param o { kanaele, preSkip = 312, eingangsRate, laenge (echte Samples bei 48 kHz), serie }
 */
export function baueOggOpus(pakete, { kanaele, preSkip = 312, eingangsRate = 48000, laenge = null, serie = 0x42535631 }) {
  const seiten = [oggSeite({ pakete: [opusHead({ kanaele, preSkip, eingangsRate })], granule: 0, serie, nummer: 0, typ: 2 }), oggSeite({ pakete: [opusTags()], granule: 0, serie, nummer: 1 })];
  const ende = laenge === null ? Infinity : preSkip + laenge;
  let granule = 0; // RFC 7845: Granule zählt alle dekodierten Samples (inkl. preSkip), Endseite = preSkip + echte Länge
  let gruppe = [];
  let bytes = 0;
  let nummer = 2;
  const raus = (letzte) => {
    seiten.push(oggSeite({ pakete: gruppe, granule: Math.min(granule, ende), serie, nummer: nummer++, typ: letzte ? 4 : 0 }));
    gruppe = [];
    bytes = 0;
  };
  pakete.forEach((p, i) => {
    gruppe.push(p.daten);
    bytes += p.daten.length;
    granule += p.samples;
    const letzte = i === pakete.length - 1;
    if (letzte || bytes > 4000 || gruppe.length >= 50) raus(letzte);
  });
  if (!pakete.length) seiten.push(oggSeite({ pakete: [], granule: preSkip, serie, nummer, typ: 4 }));
  const gesamt = new Uint8Array(seiten.reduce((s, x) => s + x.length, 0));
  let o = 0;
  for (const s of seiten) {
    gesamt.set(s, o);
    o += s.length;
  }
  return gesamt;
}

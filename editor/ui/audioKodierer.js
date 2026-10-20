import { baueOggOpus, preSkipAus } from '../kern/oggOpus.js';
import { kodiereWav } from '../kern/audioSchnitt.js';

/**
 * Kompakt speichern (Audio-Zentrale, Phase 10.5): PCM → .ogg (Opus über WebCodecs `AudioEncoder`, schnell und ohne Echtzeit)
 * oder – wenn der Browser das nicht kann – 16-Bit-WAV (größer, mit Hinweis). Opus läuft mit 48 kHz → vorher per
 * OfflineAudioContext umrechnen. Mehr als 2 Kanäle werden auf Stereo heruntergemischt.
 *   kannOpus() → Promise<bool> · kodiere({ kanaele, rate }, { bitrate }) → { bytes, endung, art: 'opus'|'wav', hinweis }
 */
const OPUS_RATE = 48000;

export async function kannOpus() {
  if (typeof AudioEncoder === 'undefined') return false;
  try {
    const s = await AudioEncoder.isConfigSupported({ codec: 'opus', sampleRate: OPUS_RATE, numberOfChannels: 2, bitrate: 96000 });
    return !!s.supported;
  } catch {
    return false;
  }
}

/** auf 48 kHz umrechnen (Browser-Resampler) */
async function auf48k(kanaele, rate) {
  if (rate === OPUS_RATE) return kanaele;
  const n = kanaele[0].length;
  const ziel = Math.ceil((n * OPUS_RATE) / rate);
  const ctx = new OfflineAudioContext(kanaele.length, ziel, OPUS_RATE);
  const puffer = ctx.createBuffer(kanaele.length, n, rate);
  kanaele.forEach((k, i) => puffer.copyToChannel(k, i));
  const q = ctx.createBufferSource();
  q.buffer = puffer;
  q.connect(ctx.destination);
  q.start();
  const r = await ctx.startRendering();
  return Array.from({ length: r.numberOfChannels }, (_, i) => r.getChannelData(i));
}

function hoechstensStereo(kanaele) {
  if (kanaele.length <= 2) return kanaele;
  const n = kanaele[0].length;
  const l = new Float32Array(n);
  const r = new Float32Array(n);
  kanaele.forEach((k, i) => {
    const ziel = i % 2 ? r : l;
    for (let j = 0; j < n; j++) ziel[j] += k[j] / Math.ceil(kanaele.length / 2);
  });
  return [l, r];
}

async function kodiereOpus(kanaele, rate, bitrate) {
  const roh = await auf48k(hoechstensStereo(kanaele), rate);
  const k = roh.length;
  const laenge = roh[0].length;
  // Stille hinten anhängen: der Encoder verzögert um preSkip (~6,5 ms) – ohne Polster fehlte sonst das Ende.
  // Die Granulposition (preSkip + laenge) schneidet das Polster beim Abspielen wieder ab.
  const pcm = roh.map((c) => {
    const p = new Float32Array(laenge + 1920);
    p.set(c);
    return p;
  });
  const pakete = [];
  let fehler = null;
  let head = null;
  const encoder = new AudioEncoder({
    output: (chunk, meta) => {
      const d = new Uint8Array(chunk.byteLength);
      chunk.copyTo(d);
      pakete.push({ daten: d, samples: Math.round(((chunk.duration ?? 20000) * OPUS_RATE) / 1e6) });
      if (meta?.decoderConfig?.description && !head) head = new Uint8Array(meta.decoderConfig.description instanceof ArrayBuffer ? meta.decoderConfig.description : meta.decoderConfig.description.buffer);
    },
    error: (e) => (fehler = e),
  });
  encoder.configure({ codec: 'opus', sampleRate: OPUS_RATE, numberOfChannels: k, bitrate });
  const block = OPUS_RATE; // 1 s je AudioData
  for (let s = 0; s < pcm[0].length; s += block) {
    const n = Math.min(block, pcm[0].length - s);
    const daten = new Float32Array(n * k);
    for (let c = 0; c < k; c++) daten.set(pcm[c].subarray(s, s + n), c * n);
    const a = new AudioData({ format: 'f32-planar', sampleRate: OPUS_RATE, numberOfFrames: n, numberOfChannels: k, timestamp: Math.round((s / OPUS_RATE) * 1e6), data: daten });
    encoder.encode(a);
    a.close();
  }
  await encoder.flush();
  encoder.close();
  if (fehler) throw fehler;
  if (!pakete.length) throw new Error('Opus-Encoder lieferte nichts');
  return baueOggOpus(pakete, { kanaele: k, preSkip: preSkipAus(head) ?? 312, eingangsRate: rate, laenge });
}

export async function kodiere({ kanaele, rate }, { bitrate = 96000 } = {}) {
  if (await kannOpus()) {
    try {
      return { bytes: await kodiereOpus(kanaele, rate, bitrate), endung: 'ogg', art: 'opus', hinweis: '' };
    } catch (e) {
      console.warn('[Audio-Zentrale] Opus fehlgeschlagen, speichere WAV:', e);
    }
  }
  return { bytes: kodiereWav({ kanaele: hoechstensStereo(kanaele), rate }), endung: 'wav', art: 'wav', hinweis: 'Dieser Browser kann kein Opus kodieren – gespeichert als WAV (größer). Tipp: Chrome/Edge verwenden.' };
}

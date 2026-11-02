import { Sound } from '../../client/audio/sound.js';
import { bearbeite, pruefeBearbeitung, wellenformMinMax, spitze, STANDARD_BEARBEITUNG, bitrateFuer } from '../../editor/kern/audioSchnitt.js';
import { kodiere } from '../../editor/ui/audioKodierer.js';
import { mischpult } from '../kern/audio.js';

/**
 * Audio-Werk der Studio-Audio-Zentrale (Phase 2) – Web Audio im Studio-Fenster, OHNE eigene Oberfläche: die Zentrale
 * (audio/audioZentrale.js) und die KI (kern/kiAudio.js) benutzen dieselben Methoden.
 *   lade(pfad)              → AudioBuffer (Cache; pfad relativ zum Spielordner, z. B. client/audio/eigene/pistole.ogg)
 *   analyse(puffer)         → { dauer, kanaele, rate, spitzeDb, rmsDb, stilleAnfang, stilleEnde } (Stille < −45 dB)
 *   spiele(puffer, e) / stopp()   Vorhören (mit Bearbeitung e: start/ende/fades/gain/normalisieren/loop) · spieleSynth(ereignis)
 *   schneide(puffer, e)     → { kanaele, rate } (editor/kern/audioSchnitt.bearbeite – dieselbe Rechnung wie die alte Zentrale)
 *   kodiere(pcm, { musik }) → { bytes, endung ('ogg' Opus über WebCodecs, sonst 'wav') }
 *   zeichne(canvas, puffer, e, { kopf }) Wellenform + Auswahl/Fades
 *   Mischpult: spielSound() = ECHTER Spiel-Sound (client/audio/sound.js, lädt eigene.json wie das Spiel) →
 *     mischpultSpielen(zustand) setzt Zone, Grundwind, Regen, Grillen, Schichten wie clientSpiel; mischpultStopp();
 *     pegelLive(name, wert) / zonenPegelLive(name, zone, f) ändern laufende Schleifen sofort.
 */
const url = (pfad) => new URL(`../${pfad.split('/').map(encodeURIComponent).join('/')}`, location.href).href;
const db = (v) => (v > 0 ? Math.round(20 * Math.log10(v) * 10) / 10 : -Infinity);

export class AudioWerk {
  constructor() {
    this.cache = new Map();
    this.quelle = null;
  }

  get ctx() {
    this.kontext ??= new AudioContext();
    if (this.kontext.state === 'suspended') this.kontext.resume();
    return this.kontext;
  }

  async lade(pfad, { neu = false } = {}) {
    if (neu) this.cache.delete(pfad);
    if (!this.cache.has(pfad)) {
      const p = fetch(url(pfad), { cache: 'no-store' })
        .then((r) => {
          if (!r.ok) throw new Error(`${pfad} nicht gefunden (${r.status})`);
          return r.arrayBuffer();
        })
        .then((b) => this.ctx.decodeAudioData(b));
      this.cache.set(pfad, p);
      p.catch(() => this.cache.delete(pfad));
    }
    return this.cache.get(pfad);
  }

  /** Bytes (Import) dekodieren – Probe, ob der Browser die Datei lesen kann */
  dekodiere(bytes) {
    return this.ctx.decodeAudioData(bytes.slice ? bytes.slice().buffer : bytes);
  }

  kanaele(puffer) {
    return Array.from({ length: puffer.numberOfChannels }, (_, i) => puffer.getChannelData(i));
  }

  analyse(puffer) {
    const k = this.kanaele(puffer);
    const n = k[0].length;
    let summe = 0;
    const schritt = Math.max(1, Math.floor(n / 200000));
    let zaehl = 0;
    for (let i = 0; i < n; i += schritt) for (const c of k) {
      summe += c[i] * c[i];
      zaehl++;
    }
    const grenze = 10 ** (-45 / 20);
    const laut = (i) => k.some((c) => Math.abs(c[i]) > grenze);
    let a = 0;
    while (a < n && !laut(a)) a += 16;
    let e = n - 1;
    while (e > a && !laut(e)) e -= 16;
    const r = (v) => Math.round(v * 1000) / 1000;
    return { dauer: r(puffer.duration), kanaele: puffer.numberOfChannels, rate: puffer.sampleRate, spitzeDb: db(spitze(k)), rmsDb: db(Math.sqrt(summe / Math.max(1, zaehl))), stilleAnfang: r(Math.min(a, n) / puffer.sampleRate), stilleEnde: r(Math.max(0, n - 1 - e) / puffer.sampleRate) };
  }

  schneide(puffer, e) {
    return bearbeite({ kanaele: this.kanaele(puffer), rate: puffer.sampleRate }, pruefeBearbeitung(e, puffer.duration));
  }

  async kodiere(pcm, { musik = false } = {}) {
    const dauer = pcm.kanaele[0].length / pcm.rate;
    return kodiere(pcm, { bitrate: bitrateFuer({ kanaele: pcm.kanaele.length, dauer, musik }) });
  }

  /** Vorhören: mit Bearbeitung (geschnittene Fassung) – Schleife bei e.loop. beiEnde() wenn fertig */
  spiele(puffer, e = null, beiEnde = null) {
    this.stopp();
    const ctx = this.ctx;
    let quelle = puffer;
    if (e) {
      const pcm = this.schneide(puffer, e);
      quelle = ctx.createBuffer(pcm.kanaele.length, pcm.kanaele[0].length, pcm.rate);
      pcm.kanaele.forEach((c, i) => quelle.copyToChannel(c, i));
    }
    const q = ctx.createBufferSource();
    q.buffer = quelle;
    q.loop = !!e?.loop;
    q.connect(ctx.destination);
    q.onended = () => {
      if (this.quelle === q) this.quelle = null;
      beiEnde?.();
    };
    q.start();
    this.quelle = q;
    this.startZeit = ctx.currentTime;
    this.laenge = quelle.duration;
    return quelle.duration;
  }

  /** Abspielposition 0..1 (für den Kopf in der Wellenform) oder null */
  position() {
    if (!this.quelle) return null;
    const t = this.ctx.currentTime - this.startZeit;
    return this.quelle.loop ? (t % this.laenge) / this.laenge : Math.min(1, t / this.laenge);
  }

  stopp() {
    try {
      this.quelle?.stop();
    } catch {
      // schon aus
    }
    this.quelle = null;
  }

  /** Synthetischer Spielklang (Ereignis ohne Datei) – exakt wie im Spiel */
  spieleSynth(ereignis) {
    this.synth ??= new Sound({ nurSynth: true });
    this.synth.entsperren();
    this.synth.spiele(ereignis);
  }

  zeichne(canvas, puffer, e = STANDARD_BEARBEITUNG, { kopf = null } = {}) {
    const b = (canvas.width = canvas.clientWidth * devicePixelRatio);
    const h = (canvas.height = canvas.clientHeight * devicePixelRatio);
    const g = canvas.getContext('2d');
    g.fillStyle = '#0d0f12';
    g.fillRect(0, 0, b, h);
    if (!puffer) return;
    const mm = wellenformMinMax(puffer.getChannelData(0), b);
    const d = puffer.duration;
    const x = (t) => (t / d) * b;
    const p = pruefeBearbeitung(e, d);
    const x0 = x(p.start);
    const x1 = x(p.ende || d);
    g.fillStyle = 'rgba(255,138,61,0.10)';
    g.fillRect(x0, 0, x1 - x0, h);
    for (let i = 0; i < b; i++) {
      const drin = i >= x0 && i <= x1;
      g.fillStyle = drin ? '#ff9d5c' : '#4a515c';
      const lo = mm[i * 2];
      const hi = mm[i * 2 + 1];
      g.fillRect(i, h / 2 - hi * (h / 2) * 0.95, 1, Math.max(1, (hi - lo) * (h / 2) * 0.95));
    }
    // Fades als Linien
    g.strokeStyle = '#ffd9a0';
    g.lineWidth = devicePixelRatio;
    g.beginPath();
    g.moveTo(x0, h);
    g.lineTo(x(p.start + p.fadeIn), 2);
    g.lineTo(x((p.ende || d) - p.fadeOut), 2);
    g.lineTo(x1, h);
    g.stroke();
    // Griffe
    g.fillStyle = '#ff8a3d';
    g.fillRect(x0 - devicePixelRatio, 0, 2 * devicePixelRatio, h);
    g.fillRect(x1 - devicePixelRatio, 0, 2 * devicePixelRatio, h);
    if (kopf !== null) {
      g.fillStyle = '#ffffff';
      g.fillRect(x0 + (x1 - x0) * kopf, 0, devicePixelRatio, h);
    }
  }

  // ---------- Mischpult (echter Spiel-Sound) ----------
  spielSound({ neu = false } = {}) {
    if (neu && this.sound) {
      this.sound.stoppeAtmosphaere();
      this.sound = null;
    }
    if (!this.sound) {
      this.sound = new Sound();
      this.sound.entsperren();
    }
    return this.sound;
  }

  /** zustand = { wetter, tageszeit, ort, zone, schneeZone } → spielt die Umgebung wie das Spiel. @returns Schichten */
  mischpultSpielen(zustand) {
    const s = this.spielSound();
    const schichten = mischpult(zustand);
    s.setzeZone(zustand.zone ?? null);
    if (!this.atmoLaeuft) {
      s.starteAtmosphaere();
      this.atmoLaeuft = true;
    }
    for (const { name, staerke } of schichten) {
      if (name === 'wind') continue;
      if (name === 'regen') s.regen(staerke);
      else if (name === 'nacht') s.nacht(staerke);
      else s.schicht(name, staerke, 1);
    }
    this.mischpultZustand = zustand;
    return schichten;
  }

  mischpultStopp() {
    this.sound?.stoppeAtmosphaere();
    this.atmoLaeuft = false;
    this.mischpultZustand = null;
  }

  pegelLive(name, wert) {
    if (!this.sound) return;
    this.sound.setzePegel(name, wert);
    if (this.mischpultZustand) this.mischpultSpielen(this.mischpultZustand);
  }

  zonenPegelLive(name, zone, faktor) {
    if (!this.sound || !zone) return;
    this.sound.setzeZonenPegel(name, zone, faktor);
  }
}

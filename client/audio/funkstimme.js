/**
 * Funkstimme (Tutorial, Funker Jelke): spielt Sprachzeilen aus client/audio/tutorial/<id>.ogg über einen Funk-Filter
 * (Bandpass, leichte Verzerrung, Rauschen, Squelch-Klick am Anfang/Ende). Der Effekt liegt NICHT in den Dateien – jede neue
 * Aufnahme mit demselben Namen klingt automatisch nach Funk. Fehlt eine Datei, bleibt nur der Untertitel (Lesedauer).
 * Zeilen laufen nacheinander (Warteschlange); `beiZeile(text|null)` meldet den aktuellen Untertitel.
 */
const ORDNER = 'audio/tutorial/';
const FUNK = { tief: 380, hoch: 3200, verzerrung: 18, rauschen: 0.035, pegel: 1.6 };

export class FunkStimme {
  #ctx = null;
  #ziel = null;
  #puffer = new Map(); // id → Promise<AudioBuffer|null>
  #schlange = [];
  #laeuft = false;
  #quelle = null;
  #timer = null;
  #version = 0;

  /** @param holeAusgang () => { ctx, bus } | null (Sound.klangAusgang) */
  constructor(holeAusgang) {
    this.holeAusgang = holeAusgang;
    this.beiZeile = null;
  }

  /** Datei vorab laden (macht die nächste Zeile ohne Pause) */
  vorladen(id) {
    const a = this.holeAusgang?.();
    if (!a || this.#puffer.has(id)) return;
    this.#puffer.set(
      id,
      fetch(ORDNER + id + '.ogg')
        .then((r) => (r.ok ? r.arrayBuffer() : null))
        .then((daten) => (daten ? a.ctx.decodeAudioData(daten) : null))
        .catch(() => null),
    );
  }

  /** Zeile einreihen { id, text } */
  sage(zeile) {
    this.vorladen(zeile.id);
    this.#schlange.push(zeile);
    // Wer schnell spielt, soll keine veralteten Anweisungen hören: höchstens 2 Zeilen warten
    if (this.#schlange.length > 2) this.#schlange.splice(0, this.#schlange.length - 2);
    if (!this.#laeuft) this.#weiter();
  }

  /** Alles stoppen (Pause/Ende) */
  stopp() {
    this.#version++;
    this.#schlange = [];
    this.#laeuft = false;
    clearTimeout(this.#timer);
    try {
      this.#quelle?.stop();
    } catch {
      // schon aus
    }
    this.#quelle = null;
    this.beiZeile?.(null);
  }

  async #weiter() {
    const zeile = this.#schlange.shift();
    if (!zeile) {
      this.#laeuft = false;
      this.beiZeile?.(null);
      return;
    }
    this.#laeuft = true;
    const version = this.#version;
    this.beiZeile?.(zeile.text);
    const lesedauer = 1800 + zeile.text.length * 55;
    const puffer = await (this.#puffer.get(zeile.id) ?? Promise.resolve(null));
    if (version !== this.#version) return;
    const a = this.holeAusgang?.();
    if (!puffer || !a) {
      this.#timer = setTimeout(() => this.#weiter(), lesedauer);
      return;
    }
    const dauer = this.#spiele(a, puffer);
    this.#timer = setTimeout(() => this.#weiter(), Math.max(dauer * 1000 + 450, 1200));
  }

  /** Funk-Kette aufbauen und abspielen. @returns Dauer in s */
  #spiele({ ctx, bus }, puffer) {
    if (this.#ctx !== ctx) {
      this.#ctx = ctx;
      const tief = ctx.createBiquadFilter();
      tief.type = 'highpass';
      tief.frequency.value = FUNK.tief;
      const hoch = ctx.createBiquadFilter();
      hoch.type = 'lowpass';
      hoch.frequency.value = FUNK.hoch;
      const verzerrer = ctx.createWaveShaper();
      const kurve = new Float32Array(1024);
      for (let i = 0; i < kurve.length; i++) {
        const x = (i / (kurve.length - 1)) * 2 - 1;
        kurve[i] = ((1 + FUNK.verzerrung / 100) * x) / (1 + (FUNK.verzerrung / 100) * Math.abs(x));
      }
      verzerrer.curve = kurve;
      const pegel = ctx.createGain();
      pegel.gain.value = FUNK.pegel;
      tief.connect(hoch).connect(verzerrer).connect(pegel).connect(bus('effekte'));
      this.#ziel = tief;
    }
    const t = ctx.currentTime + 0.12;
    this.#klick(ctx, ctx.currentTime);
    const quelle = ctx.createBufferSource();
    quelle.buffer = puffer;
    quelle.connect(this.#ziel);
    quelle.start(t);
    this.#quelle = quelle;
    // leises Rauschen unter der Stimme
    const rausch = ctx.createBufferSource();
    rausch.buffer = rauschPuffer(ctx, puffer.duration + 0.3);
    const rg = ctx.createGain();
    rg.gain.value = FUNK.rauschen;
    rausch.connect(rg).connect(this.#ziel);
    rausch.start(t - 0.05);
    rausch.stop(t + puffer.duration + 0.1);
    this.#klick(ctx, t + puffer.duration + 0.05);
    return puffer.duration + 0.2;
  }

  #klick(ctx, wann) {
    const quelle = ctx.createBufferSource();
    quelle.buffer = rauschPuffer(ctx, 0.07);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.25, wann);
    g.gain.exponentialRampToValueAtTime(0.001, wann + 0.07);
    quelle.connect(g).connect(this.#ziel);
    quelle.start(wann);
    quelle.stop(wann + 0.08);
  }
}

const rauschCache = new WeakMap();
function rauschPuffer(ctx, sekunden) {
  let p = rauschCache.get(ctx);
  if (!p || p.duration < sekunden) {
    p = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * Math.max(sekunden, 2)), ctx.sampleRate);
    const d = p.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    rauschCache.set(ctx, p);
  }
  return p;
}

/**
 * Sound-System: alle Geräusche werden live mit der Web Audio API erzeugt (Synthese) –
 * keine Audiodateien, keine Lizenzen, kein Download.
 *
 * Räumlicher Klang: Lautstärke nimmt mit der Entfernung zum Hörer (eigener Spieler) ab,
 * links/rechts per Stereo-Panning.
 *
 * Später echte Aufnahmen? → in REZEPTE einen Eintrag durch das Abspielen eines AudioBuffers ersetzen.
 *
 * Browser erlauben Ton erst nach einer Nutzeraktion → entsperren() beim Login-Klick aufrufen.
 */
const SPEICHER_SCHLUESSEL = 'browserSurvival.ton';
const HOERWEITE = 900; // px, ab hier unhörbar

export class Sound {
  #ctx = null;
  #ausgang = null;
  #rauschen = null;
  #atmosphaere = null;
  #hoerer = { x: 0, y: 0 };

  constructor() {
    this.stumm = false;
    this.lautstaerke = 0.7;
    try {
      const gespeichert = JSON.parse(localStorage.getItem(SPEICHER_SCHLUESSEL) ?? '{}');
      if (typeof gespeichert.stumm === 'boolean') this.stumm = gespeichert.stumm;
    } catch {
      // egal
    }
  }

  /** Muss in einem Klick-/Tastenereignis aufgerufen werden (Autoplay-Sperre der Browser). */
  entsperren() {
    if (!this.#ctx) {
      const AudioKontext = window.AudioContext || window.webkitAudioContext;
      if (!AudioKontext) return;
      this.#ctx = new AudioKontext();
      const kompressor = this.#ctx.createDynamicsCompressor(); // verhindert Übersteuern bei vielen Schüssen
      this.#ausgang = this.#ctx.createGain();
      this.#ausgang.gain.value = this.stumm ? 0 : this.lautstaerke;
      this.#ausgang.connect(kompressor).connect(this.#ctx.destination);
      this.#rauschen = erzeugeRauschen(this.#ctx);
    }
    this.#ctx.resume?.();
  }

  /** @returns neuer Zustand (true = stumm) */
  umschalten() {
    this.stumm = !this.stumm;
    if (this.#ausgang) this.#ausgang.gain.setTargetAtTime(this.stumm ? 0 : this.lautstaerke, this.#ctx.currentTime, 0.05);
    try {
      localStorage.setItem(SPEICHER_SCHLUESSEL, JSON.stringify({ stumm: this.stumm }));
    } catch {
      // egal
    }
    return this.stumm;
  }

  setzeHoerer(x, y) {
    this.#hoerer.x = x;
    this.#hoerer.y = y;
  }

  /**
   * Spielt ein Geräusch. Ohne x/y: direkt "im Kopf" (eigene Aktionen).
   * @param optionen { x, y, lautstaerke = 1, tonhoehe = 1 }
   */
  spiele(name, { x, y, lautstaerke = 1, tonhoehe = 1 } = {}) {
    const ctx = this.#ctx;
    const rezept = REZEPTE[name];
    if (!ctx || !rezept || ctx.state !== 'running') return;

    let gain = lautstaerke;
    let pan = 0;
    if (x !== undefined) {
      const dx = x - this.#hoerer.x;
      const dy = y - this.#hoerer.y;
      const abstand = Math.hypot(dx, dy);
      if (abstand > HOERWEITE) return;
      gain *= (1 - abstand / HOERWEITE) ** 1.6;
      pan = Math.max(-1, Math.min(1, dx / 450));
    }
    if (gain < 0.01) return;

    const lautstaerkeKnoten = ctx.createGain();
    lautstaerkeKnoten.gain.value = gain;
    let ziel = lautstaerkeKnoten;
    if (ctx.createStereoPanner) {
      const panner = ctx.createStereoPanner();
      panner.pan.value = pan;
      lautstaerkeKnoten.connect(panner);
      ziel = panner;
    }
    ziel.connect(this.#ausgang);
    const dauer = rezept({ ctx, ausgang: lautstaerkeKnoten, t: ctx.currentTime, rauschen: this.#rauschen, tonhoehe });
    setTimeout(() => ziel.disconnect(), (dauer + 0.5) * 1000);
  }

  /** Leises, unheimliches Hintergrundbrummen (Wind, entferntes Grollen). */
  starteAtmosphaere() {
    const ctx = this.#ctx;
    if (!ctx || this.#atmosphaere) return;
    const quelle = ctx.createBufferSource();
    quelle.buffer = this.#rauschen;
    quelle.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 180;
    const gain = ctx.createGain();
    gain.gain.value = 0.11;
    const lfo = ctx.createOscillator(); // langsames An- und Abschwellen wie Wind
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 120;
    lfo.connect(lfoGain).connect(filter.frequency);
    const brummen = ctx.createOscillator();
    brummen.type = 'sine';
    brummen.frequency.value = 49; // Netzbrummen der Notbeleuchtung
    const brummGain = ctx.createGain();
    brummGain.gain.value = 0.025;
    quelle.connect(filter).connect(gain).connect(this.#ausgang);
    brummen.connect(brummGain).connect(this.#ausgang);
    quelle.start();
    lfo.start();
    brummen.start();
    this.#atmosphaere = [quelle, lfo, brummen];
  }

  stoppeAtmosphaere() {
    for (const knoten of this.#atmosphaere ?? []) knoten.stop();
    this.#atmosphaere = null;
  }
}

// ---------------------------------------------------------------------------
// Rezepte: jedes baut seine Knoten, plant den Verlauf und gibt die Dauer (s) zurück.

const REZEPTE = {
  pistole: (k) => schuss(k, { dauer: 0.22, hell: 5200, dumpf: 700, druck: 120, lautstaerke: 0.9 }),
  schrotflinte: (k) => schuss(k, { dauer: 0.42, hell: 3200, dumpf: 380, druck: 85, lautstaerke: 1.25 }),
  leer: ({ ctx, ausgang, t }) => {
    klick(ctx, ausgang, t, 2200, 0.25);
    return 0.05;
  },
  nachladen: ({ ctx, ausgang, t, rauschen }) => {
    rauschStoss(ctx, ausgang, rauschen, t, { dauer: 0.05, typ: 'bandpass', frequenz: 2400, lautstaerke: 0.35 });
    rauschStoss(ctx, ausgang, rauschen, t + 0.35, { dauer: 0.06, typ: 'bandpass', frequenz: 1600, lautstaerke: 0.4 });
    klick(ctx, ausgang, t + 0.7, 1800, 0.3);
    return 0.8;
  },
  nahkampf: ({ ctx, ausgang, t, rauschen }) => {
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 2;
    filter.frequency.setValueAtTime(350, t);
    filter.frequency.exponentialRampToValueAtTime(1800, t + 0.18);
    rauschStoss(ctx, ausgang, rauschen, t, { dauer: 0.22, filter, lautstaerke: 0.5 });
    return 0.25;
  },
  treffer_zombie: ({ ctx, ausgang, t, rauschen }) => {
    rauschStoss(ctx, ausgang, rauschen, t, { dauer: 0.14, typ: 'lowpass', frequenz: 700, lautstaerke: 0.7 });
    ton(ctx, ausgang, t, { typ: 'sine', von: 110, bis: 45, dauer: 0.15, lautstaerke: 0.5 });
    return 0.2;
  },
  treffer_spieler: ({ ctx, ausgang, t, rauschen }) => {
    rauschStoss(ctx, ausgang, rauschen, t, { dauer: 0.12, typ: 'lowpass', frequenz: 900, lautstaerke: 0.6 });
    ton(ctx, ausgang, t + 0.02, { typ: 'sawtooth', von: 210, bis: 130, dauer: 0.22, lautstaerke: 0.22, filter: 900 });
    return 0.3;
  },
  zombie_stoehnen: (k) => stoehnen(k, { dauer: 1.1 + Math.random() * 0.9, wut: 0 }),
  zombie_angriff: (k) => stoehnen(k, { dauer: 0.45, wut: 1 }),
  zombie_tod: (k) => {
    stoehnen(k, { dauer: 1.2, wut: 0.3, fallen: 0.5 });
    return 1.3;
  },
  spieler_tod: ({ ctx, ausgang, t, rauschen }) => {
    ton(ctx, ausgang, t, { typ: 'sawtooth', von: 180, bis: 60, dauer: 0.9, lautstaerke: 0.3, filter: 700 });
    rauschStoss(ctx, ausgang, rauschen, t, { dauer: 0.5, typ: 'lowpass', frequenz: 400, lautstaerke: 0.6 });
    ton(ctx, ausgang, t + 0.3, { typ: 'sine', von: 55, bis: 30, dauer: 2.5, lautstaerke: 0.4 });
    return 2.8;
  },
  schritt: ({ ctx, ausgang, t, rauschen, tonhoehe }) => {
    rauschStoss(ctx, ausgang, rauschen, t, { dauer: 0.06, typ: 'lowpass', frequenz: 500 * tonhoehe, lautstaerke: 0.5 });
    return 0.08;
  },
  aufheben: ({ ctx, ausgang, t }) => {
    ton(ctx, ausgang, t, { typ: 'triangle', von: 520, bis: 520, dauer: 0.07, lautstaerke: 0.25 });
    ton(ctx, ausgang, t + 0.07, { typ: 'triangle', von: 780, bis: 780, dauer: 0.1, lautstaerke: 0.25 });
    return 0.2;
  },
  essen: ({ ctx, ausgang, t, rauschen }) => {
    for (let i = 0; i < 3; i++) rauschStoss(ctx, ausgang, rauschen, t + i * 0.16, { dauer: 0.07, typ: 'bandpass', frequenz: 1800 + i * 300, lautstaerke: 0.4 });
    return 0.55;
  },
  trinken: ({ ctx, ausgang, t }) => {
    for (let i = 0; i < 3; i++) ton(ctx, ausgang, t + i * 0.22, { typ: 'sine', von: 320, bis: 190, dauer: 0.12, lautstaerke: 0.3 });
    return 0.75;
  },
  heilen: ({ ctx, ausgang, t }) => {
    ton(ctx, ausgang, t, { typ: 'sine', von: 440, bis: 660, dauer: 0.35, lautstaerke: 0.2 });
    return 0.4;
  },
};

function schuss({ ctx, ausgang, t, rauschen, tonhoehe }, { dauer, hell, dumpf, druck, lautstaerke }) {
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(hell * tonhoehe, t);
  filter.frequency.exponentialRampToValueAtTime(dumpf, t + dauer);
  rauschStoss(ctx, ausgang, rauschen, t, { dauer, filter, lautstaerke });
  ton(ctx, ausgang, t, { typ: 'sine', von: druck, bis: 35, dauer: dauer * 0.6, lautstaerke: lautstaerke * 0.9 });
  return dauer + 0.05;
}

/** Zombie-Laut: Sägezahn mit Vibrato durch zwei "Vokal"-Filter (Formanten) + Atemrauschen. */
function stoehnen({ ctx, ausgang, t, rauschen, tonhoehe }, { dauer, wut, fallen = 0.15 }) {
  const grund = (95 + Math.random() * 35) * tonhoehe * (1 + wut * 0.4);
  const osz = ctx.createOscillator();
  osz.type = 'sawtooth';
  osz.frequency.setValueAtTime(grund, t);
  osz.frequency.exponentialRampToValueAtTime(grund * (1 - fallen), t + dauer);
  const vibrato = ctx.createOscillator();
  vibrato.frequency.value = 4 + Math.random() * 3 + wut * 6;
  const vibratoTiefe = ctx.createGain();
  vibratoTiefe.gain.value = grund * (0.04 + wut * 0.08);
  vibrato.connect(vibratoTiefe).connect(osz.frequency);

  const huelle = ctx.createGain();
  huelle.gain.setValueAtTime(0.0001, t);
  huelle.gain.exponentialRampToValueAtTime(0.35 + wut * 0.2, t + dauer * 0.25);
  huelle.gain.exponentialRampToValueAtTime(0.0001, t + dauer);
  for (const [frequenz, q] of [[520 + wut * 200, 6], [1150 + wut * 300, 8]]) {
    const formant = ctx.createBiquadFilter();
    formant.type = 'bandpass';
    formant.frequency.value = frequenz;
    formant.Q.value = q;
    osz.connect(formant).connect(huelle);
  }
  huelle.connect(ausgang);
  osz.start(t);
  vibrato.start(t);
  osz.stop(t + dauer + 0.05);
  vibrato.stop(t + dauer + 0.05);
  rauschStoss(ctx, ausgang, rauschen, t, { dauer, typ: 'bandpass', frequenz: 900, lautstaerke: 0.08 + wut * 0.1 });
  return dauer + 0.1;
}

function rauschStoss(ctx, ausgang, rauschen, t, { dauer, typ, frequenz, filter, lautstaerke }) {
  const quelle = ctx.createBufferSource();
  quelle.buffer = rauschen;
  quelle.playbackRate.value = 0.8 + Math.random() * 0.4;
  let f = filter;
  if (!f) {
    f = ctx.createBiquadFilter();
    f.type = typ;
    f.frequency.value = frequenz;
  }
  const huelle = ctx.createGain();
  huelle.gain.setValueAtTime(lautstaerke, t);
  huelle.gain.exponentialRampToValueAtTime(0.0001, t + dauer);
  quelle.connect(f).connect(huelle).connect(ausgang);
  quelle.start(t, Math.random() * 0.5);
  quelle.stop(t + dauer + 0.02);
}

function ton(ctx, ausgang, t, { typ, von, bis, dauer, lautstaerke, filter }) {
  const osz = ctx.createOscillator();
  osz.type = typ;
  osz.frequency.setValueAtTime(von, t);
  osz.frequency.exponentialRampToValueAtTime(Math.max(1, bis), t + dauer);
  const huelle = ctx.createGain();
  huelle.gain.setValueAtTime(lautstaerke, t);
  huelle.gain.exponentialRampToValueAtTime(0.0001, t + dauer);
  let kette = osz;
  if (filter) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = filter;
    kette = osz.connect(f);
  }
  kette.connect(huelle).connect(ausgang);
  osz.start(t);
  osz.stop(t + dauer + 0.02);
}

function klick(ctx, ausgang, t, frequenz, lautstaerke) {
  ton(ctx, ausgang, t, { typ: 'square', von: frequenz, bis: frequenz * 0.6, dauer: 0.03, lautstaerke });
}

/** 2 Sekunden weißes Rauschen als Grundmaterial für Schüsse, Schritte, Wind … */
function erzeugeRauschen(ctx) {
  const puffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const daten = puffer.getChannelData(0);
  for (let i = 0; i < daten.length; i++) daten[i] = Math.random() * 2 - 1;
  return puffer;
}

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
/** Regler in den Einstellungen: gesamt = alles, effekte = Aktionen/Kampf/Zombies, atmosphaere = Wind, Regen & Brummen, musik = Zonen-Musik (client/musik). */
export const LAUTSTAERKE_KANAELE = Object.freeze({ gesamt: 'Gesamt', effekte: 'Effekte', atmosphaere: 'Wind & Regen', musik: 'Musik' });
const HOERWEITE = 900; // px, ab hier unhörbar
/**
 * Anschlag-Zeit (s): Lautstärke steigt kurz an statt von 0 auf 100 % zu springen – harte Sprünge
 * erzeugen hörbare Klicks/Knistern (besonders bei Kopfhörern).
 */
const ANSCHLAG = 0.004;
/** Geräusche minimal in die Zukunft planen: kommt der Haupt-Thread zu spät, beginnt sonst die Hülle mittendrin. */
const VORLAUF = 0.012;

/** Relative Lautstärke je Aufnahme (alle Proben sind auf etwa gleiche Lautheit normalisiert). */
const PROBEN_PEGEL = {
  pistole: 1.0, schrotflinte: 1.15, hack_holz: 1.0, hack_stein: 0.9, treffer_zombie: 0.8, treffer_spieler: 0.9,
  tuer_auf: 0.7, tuer_zu: 0.8, tuer_schlag: 1.0, tuer_bricht: 1.1, aufprall: 1.0, fahrzeug_schaden: 0.8, fahrzeug_kaputt: 1.0,
  autotuer: 0.7, gebaut: 0.8, werkeln: 0.7, graben: 0.7, stein_bricht: 1.0, baum_faellt: 1.1,
  zombie_stoehnen: 0.8, zombie_angriff: 0.9, zombie_tod: 0.9, aufheben: 0.25,
};

export class Sound {
  #ctx = null;
  #ausgang = null; // Gesamtlautstärke → Lautsprecher
  #effekte = null; // Effekte → Kompressor → #ausgang
  #musikBus = null;
  #regen = null;
  #atmoBus = null; // Wind & Co. laufen am Kompressor vorbei: laute Schüsse drücken sie sonst weg ("Wind bricht ab")
  #rauschen = null;
  #wind = null;
  #motor = null;
  #hoerer = { x: 0, y: 0 };
  #proben = {}; // Name → [AudioBuffer] (echte Aufnahmen aus audio/samples, siehe werkzeuge/assets/baue_sounds.py)

  constructor() {
    this.stumm = false;
    this.lautstaerken = { gesamt: 0.7, effekte: 1, atmosphaere: 0.6, musik: 0.5 };
    try {
      const gespeichert = JSON.parse(localStorage.getItem(SPEICHER_SCHLUESSEL) ?? '{}');
      if (typeof gespeichert.stumm === 'boolean') this.stumm = gespeichert.stumm;
      for (const kanal of Object.keys(this.lautstaerken)) {
        if (typeof gespeichert[kanal] === 'number') this.lautstaerken[kanal] = Math.max(0, Math.min(1, gespeichert[kanal]));
      }
    } catch {
      // egal
    }
  }

  #speichern() {
    try {
      localStorage.setItem(SPEICHER_SCHLUESSEL, JSON.stringify({ stumm: this.stumm, ...this.lautstaerken }));
    } catch {
      // egal
    }
  }

  /** Kanal ('gesamt' | 'effekte' | 'atmosphaere') auf 0–1 stellen. */
  setzeLautstaerke(kanal, wert) {
    if (!(kanal in this.lautstaerken)) return;
    this.lautstaerken[kanal] = Math.max(0, Math.min(1, wert));
    this.#wendeLautstaerkenAn();
    this.#speichern();
  }

  #wendeLautstaerkenAn() {
    const ctx = this.#ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    this.#ausgang.gain.setTargetAtTime(this.stumm ? 0 : this.lautstaerken.gesamt, t, 0.05);
    this.#effekte.gain.setTargetAtTime(this.lautstaerken.effekte, t, 0.05);
    this.#atmoBus.gain.setTargetAtTime(this.lautstaerken.atmosphaere, t, 0.05);
    this.#musikBus.gain.setTargetAtTime(this.lautstaerken.musik, t, 0.05);
  }
  /** Muss in einem Klick-/Tastenereignis aufgerufen werden (Autoplay-Sperre der Browser). */
  entsperren() {
    if (!this.#ctx) {
      const AudioKontext = window.AudioContext || window.webkitAudioContext;
      if (!AudioKontext) return;
      this.#ctx = new AudioKontext();
      const kompressor = this.#ctx.createDynamicsCompressor(); // verhindert Übersteuern bei vielen Schüssen
      this.#ausgang = this.#ctx.createGain();
      this.#effekte = this.#ctx.createGain();
      this.#atmoBus = this.#ctx.createGain();
      this.#musikBus = this.#ctx.createGain();
      this.#effekte.connect(kompressor).connect(this.#ausgang);
      this.#atmoBus.connect(this.#ausgang);
      this.#musikBus.connect(this.#ausgang); // Musik am Kompressor vorbei (Schüsse drücken sie nicht weg)
      this.#ausgang.connect(this.#ctx.destination);
      this.#rauschen = erzeugeRauschen(this.#ctx);
      this.#wendeLautstaerkenAn();
      // Tab im Hintergrund / Anruf / Handy sperrt den Ton → bei der nächsten Gelegenheit wieder aufwecken
      const aufwecken = () => this.#ctx.state !== 'running' && this.#ctx.resume?.();
      this.#ctx.addEventListener?.('statechange', aufwecken);
      document.addEventListener('visibilitychange', aufwecken);
      for (const ereignis of ['pointerdown', 'keydown']) window.addEventListener(ereignis, aufwecken, { passive: true });
    }
    this.#ctx.resume?.();
    this.#ladeProben();
  }

  /** Lädt die echten Aufnahmen im Hintergrund; bis sie da sind (oder fehlen), spielt die Synthese. */
  #ladeProben() {
    if (this.#probenGeladen) return;
    this.#probenGeladen = true;
    const basis = new URL('./samples/', import.meta.url);
    fetch(new URL('samples.json', basis))
      .then((r) => (r.ok ? r.json() : {}))
      .then((manifest) => {
        for (const [name, dateien] of Object.entries(manifest)) {
          for (const datei of dateien) {
            fetch(new URL(datei, basis))
              .then((r) => r.arrayBuffer())
              .then((daten) => this.#ctx.decodeAudioData(daten))
              .then((puffer) => (this.#proben[name] ??= []).push(puffer))
              .catch(() => {});
          }
        }
      })
      .catch(() => {});
  }
  #probenGeladen = false;

  /** @returns neuer Zustand (true = stumm) */
  umschalten() {
    this.stumm = !this.stumm;
    this.#wendeLautstaerkenAn();
    this.#speichern();
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
    const proben = this.#proben[name];
    if (!ctx || (!rezept && !proben) || ctx.state !== 'running') return;

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
    ziel.connect(this.#effekte);
    let dauer;
    if (proben?.length) {
      // Echte Aufnahme: zufällige Variante, Tonhöhe leicht gestreut (kein Maschinengewehr-Effekt bei Wiederholung)
      const quelle = ctx.createBufferSource();
      quelle.buffer = proben[Math.floor(Math.random() * proben.length)];
      quelle.playbackRate.value = tonhoehe * (0.94 + Math.random() * 0.12);
      const pegel = ctx.createGain();
      pegel.gain.value = PROBEN_PEGEL[name] ?? 1;
      quelle.connect(pegel).connect(lautstaerkeKnoten);
      quelle.start(ctx.currentTime + VORLAUF);
      dauer = quelle.buffer.duration / quelle.playbackRate.value;
    } else {
      dauer = rezept({ ctx, ausgang: lautstaerkeKnoten, t: ctx.currentTime + VORLAUF, rauschen: this.#rauschen, tonhoehe });
    }
    setTimeout(() => ziel.disconnect(), (dauer + 0.5) * 1000);
  }

  /**
   * Motorgeräusch beim Fahren: zwei verstimmte Oszillatoren durch einen Tiefpass, Tonhöhe & Lautstärke folgen
   * dem Tempo. tempo = null → Motor aus (weich ausblenden).
   */
  motor(tempo) {
    const ctx = this.#ctx;
    if (!ctx || ctx.state !== 'running') return;
    if (tempo === null) {
      if (!this.#motor) return;
      const { knoten, gain } = this.#motor;
      gain.gain.setTargetAtTime(0, ctx.currentTime, 0.12);
      setTimeout(() => knoten.forEach((k) => k.stop()), 600);
      this.#motor = null;
      return;
    }
    if (!this.#motor) {
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      const a = ctx.createOscillator();
      a.type = 'sawtooth';
      const b = ctx.createOscillator();
      b.type = 'square';
      a.connect(filter);
      b.connect(filter);
      filter.connect(gain).connect(this.#effekte);
      a.start();
      b.start();
      this.#motor = { knoten: [a, b], gain, filter, a, b };
    }
    const anteil = Math.min(1, Math.abs(tempo) / 340);
    const t = ctx.currentTime;
    this.#motor.a.frequency.setTargetAtTime(34 + anteil * 70, t, 0.08);
    this.#motor.b.frequency.setTargetAtTime(17.3 + anteil * 36, t, 0.08);
    this.#motor.filter.frequency.setTargetAtTime(300 + anteil * 700, t, 0.1);
    this.#motor.gain.gain.setTargetAtTime(0.05 + anteil * 0.08, t, 0.1);
  }

  /**
   * Hintergrund: Wind (langes, nahtlos geschleiftes braunes Rauschen, Lautstärke und Klangfarbe wabern langsam)
   * plus tiefes Brummen. Eigener Bus am Kompressor vorbei – nichts im Spiel soll ihn unterbrechen.
   */
  starteAtmosphaere() {
    const ctx = this.#ctx;
    if (!ctx || this.#wind) return;
    const quelle = ctx.createBufferSource();
    quelle.buffer = erzeugeWind(ctx);
    quelle.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 520;
    filter.Q.value = 0.7;
    const gain = ctx.createGain();
    gain.gain.value = 0.22; // Wind bewusst leise (war 0.55)
    const lfo = ctx.createOscillator(); // Böen: Klangfarbe …
    lfo.frequency.value = 0.09;
    const lfoFilter = ctx.createGain();
    lfoFilter.gain.value = 260;
    lfo.connect(lfoFilter).connect(filter.frequency);
    const lfo2 = ctx.createOscillator(); // … und Lautstärke schwellen in anderem Takt an und ab
    lfo2.frequency.value = 0.053;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.09;
    lfo2.connect(lfoGain).connect(gain.gain);
    const brummen = ctx.createOscillator();
    brummen.type = 'sine';
    brummen.frequency.value = 49; // Netzbrummen der Notbeleuchtung
    const brummGain = ctx.createGain();
    brummGain.gain.value = 0.012;
    quelle.connect(filter).connect(gain).connect(this.#atmoBus);
    brummen.connect(brummGain).connect(this.#atmoBus);
    for (const knoten of [quelle, lfo, lfo2, brummen]) knoten.start();
    this.#wind = [quelle, lfo, lfo2, brummen];
  }

  stoppeAtmosphaere() {
    for (const knoten of this.#wind ?? []) knoten.stop();
    this.#wind = null;
    this.regen(0);
  }

  /**
   * Regenrauschen (Atmosphäre-Bus): staerke 0 = aus … 1 = Platzregen; blendet weich ein/aus.
   * Nebel hat keinen eigenen Ton (er dämpft nur den Wind: staerke wirkt dann nicht).
   */
  regen(staerke) {
    const ctx = this.#ctx;
    if (!ctx || ctx.state !== 'running') return;
    if (!this.#regen) {
      if (staerke <= 0) return;
      const quelle = ctx.createBufferSource();
      quelle.buffer = this.#rauschen;
      quelle.loop = true;
      const hoch = ctx.createBiquadFilter();
      hoch.type = 'highpass';
      hoch.frequency.value = 1400;
      const tief = ctx.createBiquadFilter();
      tief.type = 'lowpass';
      tief.frequency.value = 7500;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      quelle.connect(hoch).connect(tief).connect(gain).connect(this.#atmoBus);
      quelle.start();
      this.#regen = { quelle, gain };
    }
    const ziel = Math.max(0, Math.min(1, staerke)) * 0.16;
    this.#regen.gain.gain.setTargetAtTime(ziel, ctx.currentTime, 1.5);
    if (staerke <= 0) {
      const alt = this.#regen;
      this.#regen = null;
      setTimeout(() => alt.quelle.stop(), 6000);
    }
  }

  /**
   * Musikstück abspielen (Zonen-Musik, siehe audio/zonenMusik.js). Läuft über einen Audio-Tag, damit lange Dateien
   * gestreamt werden. @returns { stoppen(fadeSekunden), beiEnde(fn) } oder null (Ton noch gesperrt)
   */
  spieleMusik(url, { fade = 3 } = {}) {
    const ctx = this.#ctx;
    if (!ctx) return null;
    const audio = new Audio(url);
    audio.crossOrigin = 'anonymous';
    audio.preload = 'auto';
    const quelle = ctx.createMediaElementSource(audio);
    const gain = ctx.createGain();
    gain.gain.value = 0;
    quelle.connect(gain).connect(this.#musikBus);
    let endeHoerer = null;
    audio.addEventListener('ended', () => endeHoerer?.());
    audio.addEventListener('error', () => endeHoerer?.(true));
    audio.play().then(() => gain.gain.setTargetAtTime(1, ctx.currentTime, fade / 3)).catch(() => endeHoerer?.(true));
    return {
      beiEnde: (fn) => (endeHoerer = fn),
      stoppen: (fadeSekunden = fade) => {
        endeHoerer = null;
        gain.gain.setTargetAtTime(0, ctx.currentTime, Math.max(0.05, fadeSekunden / 3));
        setTimeout(() => {
          audio.pause();
          quelle.disconnect();
          gain.disconnect();
        }, fadeSekunden * 1000 + 300);
      },
    };
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
  aufheben: ({ ctx, ausgang, t, rauschen }) => {
    // Nur ein leises Stoffrascheln (Ersatz, falls die Sample-Datei fehlt) – kein Piepton
    rauschStoss(ctx, ausgang, rauschen, t, { dauer: 0.12, typ: 'bandpass', frequenz: 1800, lautstaerke: 0.05 });
    return 0.15;
  },
  essen: ({ ctx, ausgang, t, rauschen }) => {
    for (let i = 0; i < 3; i++) rauschStoss(ctx, ausgang, rauschen, t + i * 0.16, { dauer: 0.07, typ: 'bandpass', frequenz: 1800 + i * 300, lautstaerke: 0.4 });
    return 0.55;
  },
  trinken: ({ ctx, ausgang, t }) => {
    for (let i = 0; i < 3; i++) ton(ctx, ausgang, t + i * 0.22, { typ: 'sine', von: 320, bis: 190, dauer: 0.12, lautstaerke: 0.3 });
    return 0.75;
  },
  // Angeln
  angel_wurf: ({ ctx, ausgang, t, rauschen }) => {
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.5;
    f.frequency.setValueAtTime(3000, t);
    f.frequency.exponentialRampToValueAtTime(700, t + 0.25); // Schnur zischt durch die Luft
    rauschStoss(ctx, ausgang, rauschen, t, { dauer: 0.28, filter: f, lautstaerke: 0.3, anschlag: 0.02 });
    ton(ctx, ausgang, t + 0.34, { typ: 'sine', von: 420, bis: 180, dauer: 0.16, lautstaerke: 0.35 }); // Plopp
    rauschStoss(ctx, ausgang, rauschen, t + 0.34, { dauer: 0.12, typ: 'lowpass', frequenz: 1200, lautstaerke: 0.3 });
    return 0.6;
  },
  angel_biss: ({ ctx, ausgang, t }) => {
    for (let i = 0; i < 2; i++) ton(ctx, ausgang, t + i * 0.14, { typ: 'sine', von: 700, bis: 330, dauer: 0.11, lautstaerke: 0.35 }); // Blub Blub
    return 0.4;
  },
  gefangen: ({ ctx, ausgang, t, rauschen }) => {
    rauschStoss(ctx, ausgang, rauschen, t, { dauer: 0.5, typ: 'bandpass', frequenz: 1800, lautstaerke: 0.5, anschlag: 0.02 }); // Platsch
    [660, 880, 1100].forEach((f, i) => ton(ctx, ausgang, t + 0.15 + i * 0.08, { typ: 'triangle', von: f, bis: f, dauer: 0.16, lautstaerke: 0.18 }));
    return 0.8;
  },
  fahrzeug_schaden: ({ ctx, ausgang, t, rauschen }) => {
    ton(ctx, ausgang, t, { typ: 'square', von: 220, bis: 110, dauer: 0.12, lautstaerke: 0.18, filter: 1400 });
    rauschStoss(ctx, ausgang, rauschen, t, { dauer: 0.1, typ: 'bandpass', frequenz: 1600, lautstaerke: 0.6, anschlag: 0.002 });
    return 0.2;
  },
  fahrzeug_kaputt: ({ ctx, ausgang, t, rauschen }) => {
    ton(ctx, ausgang, t, { typ: 'sine', von: 90, bis: 28, dauer: 0.9, lautstaerke: 1.0, anschlag: 0.003 });
    rauschStoss(ctx, ausgang, rauschen, t, { dauer: 0.9, typ: 'lowpass', frequenz: 1100, lautstaerke: 0.9, anschlag: 0.003 });
    rauschStoss(ctx, ausgang, rauschen, t + 0.05, { dauer: 0.4, typ: 'highpass', frequenz: 2500, lautstaerke: 0.4, anschlag: 0.002 });
    return 1.1;
  },
  beute: ({ ctx, ausgang, t }) => {
    [392, 523, 659, 784].forEach((f, i) => ton(ctx, ausgang, t + i * 0.07, { typ: 'square', von: f, bis: f, dauer: 0.12, lautstaerke: 0.1, filter: 2400 }));
    return 0.5;
  },
  // Fahrzeuge
  autotuer: ({ ctx, ausgang, t, rauschen }) => {
    rauschStoss(ctx, ausgang, rauschen, t, { dauer: 0.12, typ: 'lowpass', frequenz: 700, lautstaerke: 0.7, anschlag: 0.002 });
    ton(ctx, ausgang, t, { typ: 'sine', von: 140, bis: 70, dauer: 0.15, lautstaerke: 0.4, anschlag: 0.002 });
    klick(ctx, ausgang, t + 0.09, 1800, 0.12);
    return 0.3;
  },
  aufprall: ({ ctx, ausgang, t, rauschen }) => {
    ton(ctx, ausgang, t, { typ: 'sine', von: 110, bis: 40, dauer: 0.25, lautstaerke: 0.8, anschlag: 0.002 });
    rauschStoss(ctx, ausgang, rauschen, t, { dauer: 0.2, typ: 'lowpass', frequenz: 900, lautstaerke: 0.8, anschlag: 0.002 });
    return 0.3;
  },
  // Bauen & Garten
  gebaut: ({ ctx, ausgang, t, rauschen }) => {
    for (let i = 0; i < 3; i++) {
      rauschStoss(ctx, ausgang, rauschen, t + i * 0.13, { dauer: 0.06, typ: 'lowpass', frequenz: 900, lautstaerke: 0.6, anschlag: 0.002 });
      ton(ctx, ausgang, t + i * 0.13, { typ: 'triangle', von: 260, bis: 140, dauer: 0.07, lautstaerke: 0.3, anschlag: 0.002 });
    }
    return 0.45;
  },
  feuer_an: ({ ctx, ausgang, t, rauschen }) => {
    klick(ctx, ausgang, t, 2600, 0.15); // Feuerzeug
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(300, t + 0.05);
    f.frequency.exponentialRampToValueAtTime(1600, t + 0.5);
    rauschStoss(ctx, ausgang, rauschen, t + 0.05, { dauer: 0.6, filter: f, lautstaerke: 0.6, anschlag: 0.15 }); // Wusch
    return 0.7;
  },
  feuer_aus: ({ ctx, ausgang, t, rauschen }) => {
    rauschStoss(ctx, ausgang, rauschen, t, { dauer: 0.7, typ: 'highpass', frequenz: 2500, lautstaerke: 0.35, anschlag: 0.05 }); // Zischen
    return 0.75;
  },
  knistern: ({ ctx, ausgang, t, rauschen }) => {
    for (let i = 0; i < 3; i++) {
      rauschStoss(ctx, ausgang, rauschen, t + Math.random() * 0.25, { dauer: 0.015, typ: 'bandpass', frequenz: 1800 + Math.random() * 2500, lautstaerke: 0.25 + Math.random() * 0.2, anschlag: 0.001 });
    }
    return 0.3;
  },
  falle_zu: ({ ctx, ausgang, t, rauschen }) => {
    rauschStoss(ctx, ausgang, rauschen, t, { dauer: 0.05, typ: 'highpass', frequenz: 3000, lautstaerke: 0.9, anschlag: 0.001 });
    ton(ctx, ausgang, t, { typ: 'square', von: 1900, bis: 1300, dauer: 0.12, lautstaerke: 0.12, filter: 4000, anschlag: 0.001 });
    ton(ctx, ausgang, t, { typ: 'sine', von: 3100, bis: 2900, dauer: 0.35, lautstaerke: 0.08 }); // Metall klingt nach
    return 0.4;
  },
  falle_auf: ({ ctx, ausgang, t }) => {
    for (let i = 0; i < 4; i++) klick(ctx, ausgang, t + i * 0.06, 1500 - i * 150, 0.12); // Feder spannen
    return 0.3;
  },
  graben: ({ ctx, ausgang, t, rauschen }) => {
    for (let i = 0; i < 2; i++) rauschStoss(ctx, ausgang, rauschen, t + i * 0.18, { dauer: 0.12, typ: 'lowpass', frequenz: 500, lautstaerke: 0.5, anschlag: 0.01 });
    return 0.35;
  },
  brutzeln: ({ ctx, ausgang, t, rauschen }) => {
    rauschStoss(ctx, ausgang, rauschen, t, { dauer: 0.9, typ: 'highpass', frequenz: 3500, lautstaerke: 0.22, anschlag: 0.1 });
    return 0.95;
  },
  level_auf: ({ ctx, ausgang, t }) => {
    [523, 659, 784, 1047].forEach((f, i) => ton(ctx, ausgang, t + i * 0.09, { typ: 'triangle', von: f, bis: f, dauer: 0.22, lautstaerke: 0.22 }));
    return 0.6;
  },
  heilen: ({ ctx, ausgang, t }) => {
    ton(ctx, ausgang, t, { typ: 'sine', von: 440, bis: 660, dauer: 0.35, lautstaerke: 0.2 });
    return 0.4;
  },
  // Türen: Knarzen beim Öffnen, Klacken beim Schließen, dumpfe Schläge, Splittern
  tuer_auf: ({ ctx, ausgang, t, rauschen }) => {
    ton(ctx, ausgang, t, { typ: 'sawtooth', von: 190, bis: 240, dauer: 0.35, lautstaerke: 0.08, filter: 900 });
    rauschStoss(ctx, ausgang, rauschen, t, { dauer: 0.08, typ: 'bandpass', frequenz: 1200, lautstaerke: 0.25 });
    return 0.4;
  },
  tuer_zu: ({ ctx, ausgang, t, rauschen }) => {
    rauschStoss(ctx, ausgang, rauschen, t, { dauer: 0.1, typ: 'lowpass', frequenz: 600, lautstaerke: 0.55 });
    ton(ctx, ausgang, t, { typ: 'sine', von: 120, bis: 60, dauer: 0.12, lautstaerke: 0.35 });
    klick(ctx, ausgang, t + 0.08, 1500, 0.15);
    return 0.25;
  },
  tuer_schlag: ({ ctx, ausgang, t, rauschen, tonhoehe }) => {
    rauschStoss(ctx, ausgang, rauschen, t, { dauer: 0.16, typ: 'lowpass', frequenz: 380 * tonhoehe, lautstaerke: 0.9 });
    ton(ctx, ausgang, t, { typ: 'sine', von: 90 * tonhoehe, bis: 40, dauer: 0.2, lautstaerke: 0.6 });
    return 0.25;
  },
  // Abbau & Handwerk
  hack_holz: ({ ctx, ausgang, t, rauschen, tonhoehe }) => {
    rauschStoss(ctx, ausgang, rauschen, t, { dauer: 0.09, typ: 'bandpass', frequenz: 900 * tonhoehe, lautstaerke: 0.8 });
    ton(ctx, ausgang, t, { typ: 'triangle', von: 220 * tonhoehe, bis: 120, dauer: 0.12, lautstaerke: 0.45 });
    return 0.15;
  },
  hack_stein: ({ ctx, ausgang, t, rauschen, tonhoehe }) => {
    rauschStoss(ctx, ausgang, rauschen, t, { dauer: 0.05, typ: 'highpass', frequenz: 2500, lautstaerke: 0.5 });
    ton(ctx, ausgang, t, { typ: 'square', von: 1400 * tonhoehe, bis: 1100, dauer: 0.08, lautstaerke: 0.12, filter: 3000 });
    ton(ctx, ausgang, t, { typ: 'sine', von: 2600 * tonhoehe, bis: 2400, dauer: 0.18, lautstaerke: 0.08 });
    return 0.2;
  },
  /**
   * Baum fällt (passt zur Animation in renderer.baumFaellt): 0–1 s Holz knackt & knarzt immer dichter,
   * bei 1 s der große Bruch, dann rauscht die Krone durch die Luft, bei 1,65 s der dumpfe Aufschlag + Äste.
   */
  baum_faellt: ({ ctx, ausgang, t, rauschen }) => {
    // Knarzen: tiefer Sägezahn, der langsam anschwillt und leicht eiert
    ton(ctx, ausgang, t + 0.05, { typ: 'sawtooth', von: 95, bis: 62, dauer: 1.0, lautstaerke: 0.1, filter: 520, anschlag: 0.35 });
    ton(ctx, ausgang, t + 0.3, { typ: 'sawtooth', von: 140, bis: 88, dauer: 0.7, lautstaerke: 0.06, filter: 700, anschlag: 0.2 });
    // Knacken: kurze, scharfe Holzsplitter in immer kürzeren Abständen
    let z = t + 0.08;
    for (let i = 0; i < 9; i++) {
      const laut = 0.25 + i * 0.05;
      rauschStoss(ctx, ausgang, rauschen, z, { dauer: 0.025 + Math.random() * 0.02, typ: 'bandpass', frequenz: 1400 + Math.random() * 1600, lautstaerke: laut, anschlag: 0.001 });
      ton(ctx, ausgang, z, { typ: 'triangle', von: 220 + Math.random() * 120, bis: 90, dauer: 0.05, lautstaerke: laut * 0.5, anschlag: 0.001 });
      z += 0.16 - i * 0.014 + Math.random() * 0.03;
    }
    // Der große Bruch
    rauschStoss(ctx, ausgang, rauschen, t + 1.0, { dauer: 0.16, typ: 'bandpass', frequenz: 1100, lautstaerke: 0.95, anschlag: 0.001 });
    ton(ctx, ausgang, t + 1.0, { typ: 'triangle', von: 180, bis: 60, dauer: 0.14, lautstaerke: 0.5, anschlag: 0.001 });
    // Krone rauscht durch die Luft (Blätter, Äste)
    const wind = ctx.createBiquadFilter();
    wind.type = 'bandpass';
    wind.Q.value = 0.8;
    wind.frequency.setValueAtTime(600, t + 1.05);
    wind.frequency.exponentialRampToValueAtTime(2400, t + 1.62);
    rauschStoss(ctx, ausgang, rauschen, t + 1.05, { dauer: 0.62, filter: wind, lautstaerke: 0.55, anschlag: 0.25 });
    // Aufschlag: dumpfer Schlag + Erdrauschen + nachknackende Äste
    ton(ctx, ausgang, t + 1.65, { typ: 'sine', von: 85, bis: 28, dauer: 0.6, lautstaerke: 1.0, anschlag: 0.003 });
    rauschStoss(ctx, ausgang, rauschen, t + 1.65, { dauer: 0.45, typ: 'lowpass', frequenz: 420, lautstaerke: 0.9, anschlag: 0.003 });
    for (let i = 0; i < 5; i++) {
      rauschStoss(ctx, ausgang, rauschen, t + 1.7 + i * 0.07 + Math.random() * 0.05, { dauer: 0.03, typ: 'bandpass', frequenz: 900 + Math.random() * 1500, lautstaerke: 0.3, anschlag: 0.001 });
    }
    return 2.5;
  },
  stein_bricht: ({ ctx, ausgang, t, rauschen }) => {
    rauschStoss(ctx, ausgang, rauschen, t, { dauer: 0.35, typ: 'bandpass', frequenz: 1400, lautstaerke: 0.8 });
    for (let i = 0; i < 4; i++) klick(ctx, ausgang, t + 0.08 + i * 0.06, 900 - i * 120, 0.2);
    return 0.45;
  },
  werkeln: ({ ctx, ausgang, t, rauschen }) => {
    for (let i = 0; i < 3; i++) {
      rauschStoss(ctx, ausgang, rauschen, t + i * 0.18, { dauer: 0.05, typ: 'bandpass', frequenz: 1800, lautstaerke: 0.5 });
      ton(ctx, ausgang, t + i * 0.18, { typ: 'triangle', von: 700, bis: 500, dauer: 0.06, lautstaerke: 0.25 });
    }
    return 0.6;
  },
  tuer_bricht: ({ ctx, ausgang, t, rauschen }) => {
    rauschStoss(ctx, ausgang, rauschen, t, { dauer: 0.5, typ: 'bandpass', frequenz: 900, lautstaerke: 0.9 });
    for (let i = 0; i < 4; i++) klick(ctx, ausgang, t + 0.05 + i * 0.07, 600 + i * 250, 0.25);
    ton(ctx, ausgang, t, { typ: 'sine', von: 80, bis: 30, dauer: 0.4, lautstaerke: 0.7 });
    return 0.6;
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

function rauschStoss(ctx, ausgang, rauschen, t, { dauer, typ, frequenz, filter, lautstaerke, anschlag = ANSCHLAG }) {
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
  huellkurve(huelle.gain, t, lautstaerke, dauer, anschlag);
  quelle.connect(f).connect(huelle).connect(ausgang);
  quelle.start(t, Math.random() * 0.5);
  quelle.stop(t + dauer + 0.03);
}

function ton(ctx, ausgang, t, { typ, von, bis, dauer, lautstaerke, filter, anschlag = ANSCHLAG }) {
  const osz = ctx.createOscillator();
  osz.type = typ;
  osz.frequency.setValueAtTime(von, t);
  osz.frequency.exponentialRampToValueAtTime(Math.max(1, bis), t + dauer);
  const huelle = ctx.createGain();
  huellkurve(huelle.gain, t, lautstaerke, dauer, anschlag);
  let kette = osz;
  if (filter) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = filter;
    kette = osz.connect(f);
  }
  kette.connect(huelle).connect(ausgang);
  osz.start(t);
  osz.stop(t + dauer + 0.03);
}

/** Kurzer Anstieg, dann exponentielles Ausklingen – und am Ende sauber auf 0 (kein Knacken beim Stoppen). */
function huellkurve(param, t, lautstaerke, dauer, anschlag = ANSCHLAG) {
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(lautstaerke, t + anschlag);
  param.exponentialRampToValueAtTime(0.0001, t + Math.max(dauer, anschlag * 2));
  param.linearRampToValueAtTime(0, t + dauer + 0.015);
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

/** 12 s braunes Rauschen (tiefes Rauschen wie Wind), Ende und Anfang überblendet → Schleife ohne Knacken. */
function erzeugeWind(ctx) {
  const laenge = ctx.sampleRate * 12;
  const ueberblendung = Math.floor(ctx.sampleRate * 2);
  const roh = new Float32Array(laenge + ueberblendung);
  let letzter = 0;
  for (let i = 0; i < roh.length; i++) {
    letzter = (letzter + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    roh[i] = letzter;
  }
  const puffer = ctx.createBuffer(1, laenge, ctx.sampleRate);
  const daten = puffer.getChannelData(0);
  let spitze = 0;
  for (let i = 0; i < laenge; i++) {
    // die letzten `ueberblendung` Samples laufen in den Anfang über
    const anteil = i < ueberblendung ? i / ueberblendung : 1;
    daten[i] = i < ueberblendung ? roh[i] * Math.sqrt(anteil) + roh[laenge + i] * Math.sqrt(1 - anteil) : roh[i];
    spitze = Math.max(spitze, Math.abs(daten[i]));
  }
  for (let i = 0; i < laenge; i++) daten[i] /= spitze * 1.2;
  return puffer;
}

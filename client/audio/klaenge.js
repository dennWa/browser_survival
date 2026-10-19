import { KlangSteuerung, pegel, schnittDauer, MAX_AKTIV } from '../../gemeinsam/audio/klanglandschaft.js';

/**
 * Klanglandschaft im Spiel (Editor 2.0, Phase 4): spielt die Klänge der Karte (`karte.klaenge`, vom Lader geprüft) über die
 * Busse von sound.js (Effekte / Wind & Regen / Musik – die Regler in den Einstellungen gelten).
 *   punkt   – Lautstärke nach Abstand (innen voll → außen stumm) + Stereo-Panorama zur eigenen Figur
 *   bereich – Ambiente im Rechteck, am Rand weich ein-/ausgeblendet
 *   global  – überall (Hintergrundmusik der Karte; `ersetztMusik` schaltet die Ordner-Musik ab → clientSpiel)
 * Regeln (Auslöser, Loop/Intervall/Einmal, Pitch): gemeinsam/audio/klanglandschaft.js. Schnitt/Fades nicht-destruktiv beim
 * Abspielen. Leistungsgrenze: nur die nächsten MAX_AKTIV Klänge laufen (Handy weniger).
 * Aufruf: `new Klanglandschaft(sound, klaenge, kachelGroesse)`, je Bild `aktualisiere(dt, kontext)`, beim Verlassen `stoppe()`.
 */
const puffer = new Map(); // URL → Promise<AudioBuffer|null>

function quelleUrl(k) {
  if (k.daten) return k.daten;
  if (k.datei) return new URL(`../${k.datei}`, import.meta.url).href;
  return null;
}

export class Klanglandschaft {
  constructor(sound, klaenge = [], { handy = false } = {}) {
    this.sound = sound;
    this.max = handy ? MAX_AKTIV.handy : MAX_AKTIV.desktop;
    this.eintraege = klaenge.filter(quelleUrl).map((klang) => ({ klang, url: quelleUrl(klang), steuerung: new KlangSteuerung(klang), stimme: null, puffer: null }));
    this.gestoppt = false;
  }

  /** global + ersetztMusik → Ordner-Musik der Zone aus */
  get ersetztMusik() {
    return this.eintraege.some((e) => e.klang.art === 'global' && e.klang.ersetztMusik);
  }

  #lade(e, ctx) {
    if (!puffer.has(e.url))
      puffer.set(
        e.url,
        fetch(e.url)
          .then((a) => a.arrayBuffer())
          .then((b) => ctx.decodeAudioData(b))
          .catch(() => null),
      );
    puffer.get(e.url).then((p) => {
      e.puffer = p;
      if (p) e.steuerung.dauer = p.duration;
    });
  }

  /**
   * @param {number} dt Sekunden seit dem letzten Aufruf
   * @param {object} kontext { hx, hy (Hörer in Kacheln), nacht, kampfSeit, horde, zoneSeit }
   */
  aktualisiere(dt, kontext) {
    const ausgang = this.sound?.klangAusgang?.();
    if (!ausgang || this.gestoppt) return;
    const { ctx } = ausgang;
    // die nächsten N dürfen spielen (Abstand 0 = drin/global)
    const sortiert = this.eintraege.map((e) => ({ e, p: pegel(e.klang, kontext.hx, kontext.hy) })).sort((a, b) => a.p.abstand - b.p.abstand);
    sortiert.forEach(({ e, p }, i) => {
      if (!e.puffer) {
        if (p.faktor > 0 || e.klang.art === 'global') this.#lade(e, ctx);
        return;
      }
      const erlaubt = i < this.max;
      for (const b of e.steuerung.schritt(dt, kontext)) {
        if (b.art === 'start' && erlaubt) this.#starte(e, b, ausgang);
        else if (b.art === 'start') e.steuerung.fertig();
        else if (b.art === 'stopp') this.#beende(e);
      }
      if (!erlaubt && e.stimme) {
        this.#beende(e, 0.5);
        e.steuerung.fertig(); // später wieder erlaubt → Loop startet neu
      }
      if (e.stimme) {
        e.stimme.pegel.gain.setTargetAtTime(e.klang.lautstaerke * p.faktor, ctx.currentTime, 0.12);
        e.stimme.pan?.pan.setTargetAtTime(p.pan, ctx.currentTime, 0.12);
      }
    });
  }

  #starte(e, befehl, { ctx, bus }) {
    if (e.stimme) this.#beende(e, 0.15);
    const k = e.klang;
    const ziel = bus(k.bus);
    if (!ziel) return;
    const q = ctx.createBufferSource();
    q.buffer = e.puffer;
    q.playbackRate.value = befehl.tonhoehe;
    const huelle = ctx.createGain();
    const pegelGain = ctx.createGain();
    pegelGain.gain.value = 0;
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    q.connect(huelle).connect(pegelGain);
    (pan ? pegelGain.connect(pan) : pegelGain).connect(ziel);
    const t = ctx.currentTime + 0.01;
    const start = Math.min(k.start, Math.max(0, e.puffer.duration - 0.01));
    const dauer = schnittDauer(k, e.puffer.duration);
    huelle.gain.setValueAtTime(k.fadeIn > 0 ? 0.0001 : 1, t);
    if (k.fadeIn > 0) huelle.gain.linearRampToValueAtTime(1, t + Math.min(k.fadeIn, dauer));
    if (befehl.loop) {
      q.loop = true;
      q.loopStart = start;
      q.loopEnd = start + dauer;
      q.start(t, start);
    } else {
      const echt = dauer / befehl.tonhoehe;
      if (k.fadeOut > 0) {
        huelle.gain.setValueAtTime(1, t + Math.max(k.fadeIn, echt - k.fadeOut));
        huelle.gain.linearRampToValueAtTime(0.0001, t + echt);
      }
      q.start(t, start, dauer);
    }
    const stimme = { q, huelle, pegel: pegelGain, pan };
    q.onended = () => {
      for (const n of [q, huelle, pegelGain, pan]) n?.disconnect();
      if (e.stimme === stimme) {
        e.stimme = null;
        if (!befehl.loop) e.steuerung.fertig();
      }
    };
    e.stimme = stimme;
  }

  #beende(e, ausblenden = null) {
    const s = e.stimme;
    if (!s) return;
    e.stimme = null;
    const ctx = s.q.context;
    const dauer = Math.max(0.05, ausblenden ?? e.klang.fadeOut ?? 0.3);
    s.huelle.gain.cancelScheduledValues(ctx.currentTime);
    s.huelle.gain.setTargetAtTime(0.0001, ctx.currentTime, dauer / 3);
    try {
      s.q.stop(ctx.currentTime + dauer + 0.05);
    } catch {
      /* schon gestoppt */
    }
  }

  stoppe() {
    this.gestoppt = true;
    for (const e of this.eintraege) this.#beende(e, 0.8);
  }
}

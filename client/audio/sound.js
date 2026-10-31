/**
 * Sound-System: Geräusche = eigene Dateien (audio/eigene, Vorrang) > echte Samples (audio/samples) > Web-Audio-Synthese (REZEPTE).
 * Lautstärke je Ereignis: eigene/lautstaerke.txt bzw. eigene/einstellungen.json (Audio-Zentrale) → eigene.json. Ereignisliste: eigeneSounds.js.
 * Dauergeräusche (Phase 10.2): wind, regen, nacht, motor laufen als Schleife – aus der eigenen Datei, sonst synthetisch.
 * Runde 26: Wünsche vor dem Entsperren (Regen/Nacht/Schichten) werden bei 'running' nachgeholt (#nachholen).
 * Einstellungen je Ereignis: lautstaerke (Faktor, alle Quellen), streuung (± Tonhöhe je Abspielen), loop.
 *
 * Räumlicher Klang: Lautstärke nimmt mit der Entfernung zum Hörer (eigener Spieler) ab,
 * links/rechts per Stereo-Panning. Runde 23: ferne Geräusche klingen dumpfer (Tiefpass nach Entfernung), `dumpf` = hinter
 * Wänden (stärkerer Tiefpass), `raeumlich` = 3D-Richtung per HRTF-Panner (Zombies: vorne/hinten/links/rechts mit Kopfhörer),
 * `weite` = eigene Hörweite. Wetter-/Tageszeit-Schichten (sturm, schneesturm, regen_stark, tag, nacht_wind) laufen als
 * Schleifen über `schicht(name, staerke)` (nur mit eigener Datei).
 *
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
  autotuer: 0.7, gebaut: 0.8, werkeln: 0.7, graben: 0.7, stein_bricht: 1.0, 
  zombie_stoehnen: 0.8, zombie_angriff: 0.9, zombie_tod: 0.9, aufheben: 0.25, schritt_schnee: 0.9, schritt_gras: 0.9,
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
  #eigene = {}; // Name → [AudioBuffer] (eigene Dateien aus audio/eigene, haben Vorrang vor #proben und Synthese)
  #eigenePegel = {}; // Name → Faktor aus eigene/lautstaerke.txt / einstellungen.json (gilt für alle Quellen)
  #streuung = {}; // Name → ± Tonhöhe (0..0,5) aus einstellungen.json
  #zeit = {}; // Name → { verzoegerung, maxDauer, einmal } aus einstellungen.json: Ton später starten (s) / nach so langer Zeit abschneiden (s) / nicht neu starten, solange er läuft
  #kurz = new Set(); // gerade klingende Kurzgeräusche { name, knoten, ziel, ohnePegel } (Stopp/Live-Pegel der Audio-Zentrale)
  #laufBis = {}; // Name → Audio-Zeit, bis der zuletzt gestartete Ton (mit `einmal`) zu Ende ist
  #nacht = null;
  #letzteEigene = {}; // Name → zuletzt gespielter Index (keine direkte Wiederholung)

  /** @param nurSynth true = keine Dateien laden, immer die Synthese (Vorhören in der Audio-Zentrale des Editors) */
  constructor({ nurSynth = false } = {}) {
    this.nurSynth = nurSynth;
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
      // Runde 26: Wetter-Aufrufe vor dem Entsperren werden verworfen (clientSpiel merkt sich aber den Wert und ruft nicht
      // erneut) → sobald der Ton läuft, gewünschte Stärken nachholen. Sonst blieb Regen draußen stumm, bis sich der Wert änderte.
      this.#ctx.addEventListener?.('statechange', () => this.#ctx.state === 'running' && this.#nachholen());
      document.addEventListener('visibilitychange', aufwecken);
      for (const ereignis of ['pointerdown', 'keydown']) window.addEventListener(ereignis, aufwecken, { passive: true });
    }
    this.#ctx.resume?.();
    this.#ladeProben();
  }

  /** Lädt die echten Aufnahmen im Hintergrund; bis sie da sind (oder fehlen), spielt die Synthese. */
  #ladeProben() {
    if (this.#probenGeladen || this.nurSynth) return;
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
    // Eigene Sounds (npm run sounds → eigene.json): { ereignis: { dateien: [...], lautstaerke: 1 } }
    const eigeneBasis = new URL('../eigene/', basis);
    fetch(new URL('eigene.json', eigeneBasis))
      .then((r) => (r.ok ? r.json() : {}))
      .then((index) => {
        for (const [name, { dateien = [], lautstaerke = 1, streuung = 0, verzoegerung = 0, maxDauer = 0, einmal = false, dateiPegel = {} }] of Object.entries(index)) {
          this.#eigenePegel[name] = lautstaerke;
          if (streuung > 0) this.#streuung[name] = streuung;
          if (verzoegerung > 0 || maxDauer > 0 || einmal) this.#zeit[name] = { verzoegerung, maxDauer, einmal };
          if (!REZEPTE[name] && !dateien.length) console.warn(`[Sound] Unbekanntes Ereignis "${name}" in eigene/lautstaerke.txt`);
          for (const datei of dateien) {
            fetch(new URL(datei, eigeneBasis))
              .then((r) => r.arrayBuffer())
              .then((daten) => this.#ctx.decodeAudioData(daten))
              .then((puffer) => {
                if (dateiPegel[datei] !== undefined) this.#dateiPegel.set(puffer, dateiPegel[datei]);
                (this.#eigene[name] ??= []).push(puffer);
                this.#schleifeNeu(name);
              })
              .catch(() => console.warn(`[Sound] eigene/${datei} nicht ladbar`));
          }
        }
      })
      .catch(() => {});
  }
  #probenGeladen = false;
  #dateiPegel = new Map(); // Puffer → Pegel dieser einzelnen Datei (einstellungen.json dateiPegel)

  /** @returns neuer Zustand (true = stumm) */
  umschalten() {
    this.stumm = !this.stumm;
    this.#wendeLautstaerkenAn();
    this.#speichern();
    return this.stumm;
  }

  /**
   * Für die Klanglandschaft der Karte (audio/klaenge.js): Audio-Kontext + Bus je Regler ('effekte' | 'atmosphaere' | 'musik').
   * null, solange der Ton gesperrt ist.
   */
  klangAusgang() {
    const ctx = this.#ctx;
    if (!ctx || ctx.state !== 'running') return null;
    return { ctx, bus: (name) => (name === 'musik' ? this.#musikBus : name === 'atmosphaere' ? this.#atmoBus : this.#effekte) };
  }

  /** Gewünschte Dauer-Stärken anwenden, die vor dem Entsperren ankamen (Regen, Nacht, Schichten) */
  #nachholen() {
    if (this.#regenStaerke > 0 && !this.#regen) this.regen(this.#regenStaerke);
    if (this.#nachtStaerke > 0 && !this.#nacht) this.nacht(this.#nachtStaerke);
    for (const [name, st] of this.#schichtStaerke) if (st > 0.001 && !this.#schichten.has(name)) this.schicht(name, st);
  }

  /** Woher kommt der Ton eines Ereignisses gerade? 'eigen' | 'sample' | 'synth' | null (für Tests/Audio-Zentrale) */
  quelleVon(name) {
    if (this.#eigene[name]?.length) return 'eigen';
    if (this.#proben[name]?.length) return 'sample';
    return REZEPTE[name] || SCHLEIFEN_SYNTH.has(name) ? 'synth' : null;
  }

  /** Eigene Datei für eine laufende Schleife nachgeladen → mit der Datei neu starten */
  #schleifeNeu(name) {
    if (this.#schichtStaerke.has(name) && !this.#schichten.has(name)) this.schicht(name, this.#schichtStaerke.get(name));
    if (name === 'wind_leicht' && this.#wind) {
      for (const knoten of this.#wind) knoten.stop();
      this.#wind = null;
    } else if (name === 'wind' && this.#wind?.synth) {
      this.stoppeAtmosphaere({ ohneRegen: true });
      this.starteAtmosphaere();
    } else if (name === 'regen' && this.#regen?.synth) {
      const st = this.#regenStaerke;
      this.#regen.quelle.stop();
      this.#regen = null;
      this.regen(st);
    } else if (name === 'nacht' && this.#nacht?.synth) {
      const st = this.#nachtStaerke;
      this.#nacht.quelle.stop();
      this.#nacht = null;
      this.nacht(st);
    } else if (name === 'motor' && this.#motor?.synth) {
      this.#motor.knoten.forEach((k) => k.stop());
      this.#motor = null; // nächster motor(tempo)-Aufruf baut die Datei-Schleife
    }
  }

  /** Schleifen-Quelle aus der eigenen Datei (Datei ist schon nahtlos geschnitten, z. B. in der Audio-Zentrale) */
  #eigeneSchleife(name) {
    const puffer = this.#eigene[name];
    if (!puffer?.length) return null;
    const quelle = this.#ctx.createBufferSource();
    quelle.buffer = puffer[Math.floor(Math.random() * puffer.length)];
    quelle.loop = true;
    return quelle;
  }

  setzeHoerer(x, y) {
    this.#hoerer.x = x;
    this.#hoerer.y = y;
  }

  /**
   * Spielt ein Geräusch. Ohne x/y: direkt "im Kopf" (eigene Aktionen).
   * @param optionen { x, y, lautstaerke = 1, tonhoehe = 1 }
   */
  spiele(name, { x, y, lautstaerke = 1, tonhoehe = 1, dumpf = false, raeumlich = false, weite = HOERWEITE, kurve = 1.6 } = {}) {
    const ctx = this.#ctx;
    const rezept = REZEPTE[name];
    const proben = this.#proben[name];
    const eigene = this.#eigene[name];
    if (!ctx || (!rezept && !proben && !eigene) || ctx.state !== 'running') return;

    let gain = lautstaerke * (this.#eigenePegel[name] ?? 1);
    const streuung = this.#streuung[name] ?? 0;
    const zufallsTon = () => 1 + (Math.random() * 2 - 1) * streuung;
    let pan = 0;
    let dx = 0;
    let dy = 0;
    let tiefpass = 0; // 0 = kein Filter, sonst Grenzfrequenz (Hz)
    if (x !== undefined) {
      dx = x - this.#hoerer.x;
      dy = y - this.#hoerer.y;
      const abstand = Math.hypot(dx, dy);
      if (abstand > weite) return;
      const nah = 1 - abstand / weite;
      gain *= nah ** kurve;
      pan = Math.max(-1, Math.min(1, dx / 450));
      // Ferne klingt dumpfer (Luft schluckt Höhen), hinter Wänden noch mehr
      if (abstand > 120) tiefpass = 900 + 16000 * nah * nah;
      if (dumpf) tiefpass = Math.min(tiefpass || 20000, 650 + 900 * nah);
    }
    if (gain < 0.01) return;

    const { verzoegerung = 0, maxDauer = 0, einmal = false } = this.#zeit[name] ?? {};
    if (einmal && ctx.currentTime < (this.#laufBis[name] ?? 0)) return; // läuft noch (z. B. Holzhacken: jeder Schlag würde den langen Ton neu starten)
    const beginn = ctx.currentTime + VORLAUF + verzoegerung;
    const lautstaerkeKnoten = ctx.createGain();
    lautstaerkeKnoten.gain.value = gain;
    // maxDauer: nach so langer Zeit (ab Tonbeginn) weich ausblenden und stoppen – Ton endet mit der Animation
    const kuerze = (quelle) => {
      if (!(maxDauer > 0)) return;
      lautstaerkeKnoten.gain.setValueAtTime(gain, beginn + maxDauer);
      lautstaerkeKnoten.gain.linearRampToValueAtTime(0, beginn + maxDauer + 0.06);
      quelle.stop(beginn + maxDauer + 0.08);
    };
    let ziel = lautstaerkeKnoten;
    if (tiefpass > 0 && tiefpass < 18000) {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = tiefpass;
      ziel.connect(filter);
      ziel = filter;
    }
    if (raeumlich && x !== undefined && ctx.createPanner) {
      // HRTF: Richtung (auch vorne/hinten) – Hörer schaut „nach oben“ auf dem Bildschirm (-z); Lautstärke rechnen wir selbst (rolloff 0)
      const panner = ctx.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'linear';
      panner.rolloffFactor = 0;
      const p = panner.positionX ? panner : null;
      const px = dx / 120;
      const pz = dy / 120;
      if (p) {
        p.positionX.value = px;
        p.positionY.value = 0;
        p.positionZ.value = pz;
      } else panner.setPosition?.(px, 0, pz);
      ziel.connect(panner);
      ziel = panner;
    } else if (ctx.createStereoPanner) {
      const panner = ctx.createStereoPanner();
      panner.pan.value = pan;
      ziel.connect(panner);
      ziel = panner;
    }
    ziel.connect(this.#effekte);
    const lauf = { name, knoten: lautstaerkeKnoten, ziel, ohnePegel: gain / (this.#eigenePegel[name] ?? 1) };
    this.#kurz.add(lauf);
    let dauer;
    if (eigene?.length) {
      // Eigene Datei: unverändert (Tonhöhe 1, außer Streuung), zufällige Variante, nie zweimal dieselbe hintereinander
      let i = Math.floor(Math.random() * eigene.length);
      if (eigene.length > 1 && i === this.#letzteEigene[name]) i = (i + 1 + Math.floor(Math.random() * (eigene.length - 1))) % eigene.length;
      this.#letzteEigene[name] = i;
      const quelle = ctx.createBufferSource();
      quelle.buffer = eigene[i];
      if (streuung || tonhoehe !== 1) quelle.playbackRate.value = tonhoehe * (streuung ? zufallsTon() : 1); // tonhoehe z. B. Boss-Zombie tiefer
      const dateiGain = this.#dateiPegel.get(eigene[i]);
      if (dateiGain !== undefined) {
        const dateiKnoten = ctx.createGain();
        dateiKnoten.gain.value = dateiGain;
        quelle.connect(dateiKnoten).connect(lautstaerkeKnoten);
      } else quelle.connect(lautstaerkeKnoten);
      quelle.start(beginn);
      kuerze(quelle);
      dauer = quelle.buffer.duration / quelle.playbackRate.value;
    } else if (proben?.length) {
      // Echte Aufnahme: zufällige Variante, Tonhöhe leicht gestreut (kein Maschinengewehr-Effekt bei Wiederholung)
      const quelle = ctx.createBufferSource();
      quelle.buffer = proben[Math.floor(Math.random() * proben.length)];
      quelle.playbackRate.value = tonhoehe * (streuung ? zufallsTon() : 0.94 + Math.random() * 0.12);
      const pegel = ctx.createGain();
      pegel.gain.value = PROBEN_PEGEL[name] ?? 1;
      quelle.connect(pegel).connect(lautstaerkeKnoten);
      quelle.start(beginn);
      kuerze(quelle);
      dauer = quelle.buffer.duration / quelle.playbackRate.value;
    } else {
      dauer = rezept({ ctx, ausgang: lautstaerkeKnoten, t: beginn, rauschen: this.#rauschen, tonhoehe: tonhoehe * (streuung ? zufallsTon() : 1) });
    }
    const spielzeit = Math.min(dauer, maxDauer > 0 ? maxDauer : Infinity) + verzoegerung;
    if (einmal) this.#laufBis[name] = ctx.currentTime + VORLAUF + spielzeit;
    setTimeout(() => {
      ziel.disconnect();
      this.#kurz.delete(lauf);
    }, (spielzeit + 0.5) * 1000);
  }

  /** Alle gerade klingenden Kurzgeräusche sofort abschneiden (Audio-Zentrale: Stopp) */
  stoppeKurze() {
    for (const l of this.#kurz) l.ziel.disconnect();
    this.#kurz.clear();
    this.#laufBis = {};
  }

  /**
   * Motorgeräusch beim Fahren: dumpfes Tuckern (tiefes Rauschen + weicher Sinus, dessen Lautstärke im Zündtakt pulsiert).
   * Drehzahl (Takt, Tonhöhe, Filter) und Lautstärke folgen dem Tempo. tempo = null → Motor aus (weich ausblenden).
   */
  motor(tempo) {
    const ctx = this.#ctx;
    if (!ctx || ctx.state !== 'running') return;
    const pegel = this.#eigenePegel.motor ?? 1;
    if (tempo === null) {
      if (!this.#motor) return;
      const { knoten, gain } = this.#motor;
      gain.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
      setTimeout(() => knoten.forEach((k) => k.stop()), 800);
      this.#motor = null;
      return;
    }
    if (!this.#motor && this.#eigene.motor?.length) {
      // Eigene Motor-Schleife: Tonhöhe und Lautstärke folgen dem Tempo
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const quelle = this.#eigeneSchleife('motor');
      quelle.connect(gain).connect(this.#effekte);
      quelle.start();
      this.#motor = { knoten: [quelle], gain, quelle };
    }
    if (!this.#motor) {
      const gain = ctx.createGain();
      gain.gain.value = 0;
      // Brummen: Rauschschleife, stark tiefpassgefiltert
      const rauschen = ctx.createBufferSource();
      rauschen.buffer = this.#rauschen;
      rauschen.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 160;
      filter.Q.value = 0.9;
      const rauschPegel = ctx.createGain();
      rauschPegel.gain.value = 0.9;
      // Grundton: weicher Dreieck-Ton, pulsiert im Zündtakt
      const ton = ctx.createOscillator();
      ton.type = 'triangle';
      const tonPegel = ctx.createGain();
      tonPegel.gain.value = 0.5;
      const takt = ctx.createOscillator();
      takt.type = 'sine';
      const taktTiefe = ctx.createGain();
      taktTiefe.gain.value = 0.3;
      const huelle = ctx.createGain();
      huelle.gain.value = 0.7;
      takt.connect(taktTiefe).connect(huelle.gain);
      rauschen.connect(filter).connect(rauschPegel).connect(huelle);
      ton.connect(tonPegel).connect(huelle);
      huelle.connect(gain).connect(this.#effekte);
      for (const k of [rauschen, ton, takt]) k.start();
      this.#motor = { knoten: [rauschen, ton, takt], gain, filter, ton, takt, synth: true };
    }
    const anteil = Math.min(1, Math.abs(tempo) / 340);
    const t = ctx.currentTime;
    if (this.#motor.quelle) {
      this.#motor.quelle.playbackRate.setTargetAtTime(0.75 + anteil * 0.8, t, 0.12);
      this.#motor.gain.gain.setTargetAtTime((0.25 + anteil * 0.35) * pegel, t, 0.15);
      return;
    }
    this.#motor.ton.frequency.setTargetAtTime(46 + anteil * 54, t, 0.12);
    this.#motor.takt.frequency.setTargetAtTime(7 + anteil * 17, t, 0.12);
    this.#motor.filter.frequency.setTargetAtTime(150 + anteil * 260, t, 0.15);
    this.#motor.gain.gain.setTargetAtTime((0.1 + anteil * 0.16) * pegel, t, 0.15);
  }

  /**
   * Hintergrund: Wind (langes, nahtlos geschleiftes braunes Rauschen, Lautstärke und Klangfarbe wabern langsam)
   * plus tiefes Brummen. Eigener Bus am Kompressor vorbei – nichts im Spiel soll ihn unterbrechen.
   */
  starteAtmosphaere() {
    const ctx = this.#ctx;
    if (!ctx || this.#wind) return;
    if (this.#eigene.wind_leicht?.length) return; // Runde 24: echte Windaufnahmen (Schichten wind_leicht/wind_stark) ersetzen die Synthese
    const pegel = this.#eigenePegel.wind ?? 1;
    const eigen = this.#eigeneSchleife('wind');
    if (eigen) {
      const g = ctx.createGain();
      g.gain.value = WIND_EIGEN * pegel;
      eigen.connect(g).connect(this.#atmoBus);
      eigen.start();
      this.#wind = Object.assign([eigen], { synth: false, regler: (p) => (g.gain.value = WIND_EIGEN * p) });
      return;
    }
    const quelle = ctx.createBufferSource();
    quelle.buffer = erzeugeWind(ctx);
    quelle.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 520;
    filter.Q.value = 0.7;
    const gain = ctx.createGain();
    gain.gain.value = WIND_SYNTH * pegel; // Wind bewusst leise (war 0.55)
    const lfo = ctx.createOscillator(); // Böen: Klangfarbe …
    lfo.frequency.value = 0.09;
    const lfoFilter = ctx.createGain();
    lfoFilter.gain.value = 260;
    lfo.connect(lfoFilter).connect(filter.frequency);
    const lfo2 = ctx.createOscillator(); // … und Lautstärke schwellen in anderem Takt an und ab
    lfo2.frequency.value = 0.053;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = WIND_BOEN * pegel; // Böen skalieren mit (sonst übertönen sie einen kleinen Pegel)
    lfo2.connect(lfoGain).connect(gain.gain);
    const brummen = ctx.createOscillator();
    brummen.type = 'sine';
    brummen.frequency.value = 49; // Netzbrummen der Notbeleuchtung
    const brummGain = ctx.createGain();
    brummGain.gain.value = WIND_BRUMM * pegel;
    quelle.connect(filter).connect(gain).connect(this.#atmoBus);
    brummen.connect(brummGain).connect(this.#atmoBus);
    for (const knoten of [quelle, lfo, lfo2, brummen]) knoten.start();
    this.#wind = Object.assign([quelle, lfo, lfo2, brummen], {
      synth: true,
      regler: (p) => {
        gain.gain.value = WIND_SYNTH * p;
        lfoGain.gain.value = WIND_BOEN * p;
        brummGain.gain.value = WIND_BRUMM * p;
      },
    });
  }

  /** Verzögerung/Kürzung/„nur einmal“ eines Ereignisses setzen (Audio-Zentrale-Vorschau, ohne Neuladen) */
  setzeZeit(name, { verzoegerung = 0, maxDauer = 0, einmal = false } = {}) {
    if (verzoegerung > 0 || maxDauer > 0 || einmal) this.#zeit[name] = { verzoegerung, maxDauer, einmal };
    else delete this.#zeit[name];
  }

  /** Pegel eines Ereignisses live ändern (Audio-Zentrale: Regler während des Anhörens); Wind sofort, andere ab dem nächsten Abspielen */
  setzePegel(name, wert) {
    this.#eigenePegel[name] = wert;
    for (const l of this.#kurz) if (l.name === name) l.knoten.gain.setTargetAtTime(l.ohnePegel * wert, this.#ctx.currentTime, 0.02);
    if (name === 'wind') this.#wind?.regler?.(wert);
  }

  stoppeAtmosphaere({ ohneRegen = false } = {}) {
    for (const knoten of this.#wind ?? []) knoten.stop();
    this.#wind = null;
    if (ohneRegen) return;
    this.regen(0);
    this.nacht(0);
    for (const name of [...this.#schichten.keys()]) this.schicht(name, 0, 0.5);
  }

  /**
   * Regenrauschen (Atmosphäre-Bus): staerke 0 = aus … 1 = Platzregen; blendet weich ein/aus.
   * Nebel hat keinen eigenen Ton (er dämpft nur den Wind: staerke wirkt dann nicht).
   */
  regen(staerke) {
    const ctx = this.#ctx;
    this.#regenStaerke = Math.max(0, staerke);
    if (!ctx || ctx.state !== 'running') return;
    if (!this.#regen && staerke > 0) {
      const eigen = this.#eigeneSchleife('regen');
      if (eigen) {
        const gain = ctx.createGain();
        gain.gain.value = 0;
        eigen.connect(gain).connect(this.#atmoBus);
        eigen.start();
        this.#regen = { quelle: eigen, gain, faktor: 0.6 };
      }
    }
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
      this.#regen = { quelle, gain, faktor: 0.16, synth: true };
    }
    const ziel = Math.max(0, Math.min(1, staerke)) * this.#regen.faktor * (this.#eigenePegel.regen ?? 1);
    this.#regen.gain.gain.setTargetAtTime(ziel, ctx.currentTime, 1.5);
    if (staerke <= 0) {
      const alt = this.#regen;
      this.#regen = null;
      setTimeout(() => alt.quelle.stop(), 6000);
    }
  }

  #regenStaerke = 0;
  #nachtStaerke = 0;
  #schichten = new Map(); // Name → { quelle, gain } (laufende Wetter-/Tageszeit-Schleifen)
  #schichtStaerke = new Map(); // Name → zuletzt gewünschte Stärke (startet nach, wenn die Datei später geladen ist)

  /**
   * Runde 23: Atmosphäre-Schicht als Schleife aus der eigenen Datei (sturm, schneesturm, regen_stark, tag, nacht_wind):
   * staerke 0 = aus … 1 = voll; blendet weich (zeit s). Ohne Datei passiert nichts.
   */
  schicht(name, staerke, zeit = 1.8) {
    const ctx = this.#ctx;
    staerke = Math.max(0, Math.min(1, staerke || 0));
    this.#schichtStaerke.set(name, staerke);
    if (!ctx || ctx.state !== 'running') return;
    let s = this.#schichten.get(name);
    if (!s) {
      if (staerke <= 0.001) return;
      const quelle = this.#eigeneSchleife(name);
      if (!quelle) return;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      quelle.connect(gain).connect(this.#atmoBus);
      // zufälliger Einstieg in die Schleife, damit es nicht jedes Mal gleich beginnt
      quelle.start(0, Math.random() * (quelle.buffer?.duration ?? 0));
      s = { quelle, gain };
      this.#schichten.set(name, s);
    }
    s.gain.gain.setTargetAtTime(staerke * (this.#eigenePegel[name] ?? 1), ctx.currentTime, zeit / 3);
    if (staerke <= 0.001) {
      this.#schichten.delete(name);
      setTimeout(() => s.quelle.stop(), zeit * 2500);
    }
  }

  /**
   * Nachtgeräusche (Grillen, Atmosphäre-Bus): staerke 0 = Tag … 1 = tiefe Nacht; blendet langsam ein/aus.
   * Eigene Datei `nacht` hat Vorrang, sonst eine synthetische Grillen-Schleife.
   */
  nacht(staerke) {
    const ctx = this.#ctx;
    this.#nachtStaerke = Math.max(0, staerke);
    if (!ctx || ctx.state !== 'running') return;
    if (!this.#nacht) {
      if (staerke <= 0) return;
      const eigen = this.#eigeneSchleife('nacht');
      const quelle = eigen ?? ctx.createBufferSource();
      if (!eigen) {
        quelle.buffer = erzeugeGrillen(ctx);
        quelle.loop = true;
      }
      const gain = ctx.createGain();
      gain.gain.value = 0;
      quelle.connect(gain).connect(this.#atmoBus);
      quelle.start();
      this.#nacht = { quelle, gain, faktor: eigen ? 0.5 : 0.09, synth: !eigen };
    }
    this.#nacht.gain.gain.setTargetAtTime(Math.min(1, staerke) * this.#nacht.faktor * (this.#eigenePegel.nacht ?? 1), ctx.currentTime, 2);
    if (staerke <= 0) {
      const alt = this.#nacht;
      this.#nacht = null;
      setTimeout(() => alt.quelle.stop(), 8000);
    }
  }

  /**
   * Musikstück abspielen (Zonen-Musik, siehe audio/zonenMusik.js). Läuft über einen Audio-Tag, damit lange Dateien
   * gestreamt werden. @returns { stoppen(fadeSekunden), beiEnde(fn) } oder null (Ton noch gesperrt)
   */
  spieleMusik(url, { fade = 3, schleife = false, ab = 0 } = {}) {
    const ctx = this.#ctx;
    if (!ctx) return null;
    const audio = new Audio(url);
    audio.crossOrigin = 'anonymous';
    audio.preload = 'auto';
    audio.loop = schleife; // Runde 24: Radio im Haus läuft in Schleife, Einstieg synchron (ab Sekunden, modulo Länge)
    if (ab > 0) audio.addEventListener('loadedmetadata', () => (audio.currentTime = audio.duration ? ab % audio.duration : 0), { once: true });
    const quelle = ctx.createMediaElementSource(audio);
    const gain = ctx.createGain();
    gain.gain.value = 0;
    quelle.connect(gain).connect(this.#musikBus);
    let endeHoerer = null;
    audio.addEventListener('ended', () => endeHoerer?.());
    audio.addEventListener('error', () => endeHoerer?.(true));
    audio.play().then(() => gain.gain.setTargetAtTime(1, ctx.currentTime, fade / 3)).catch(() => endeHoerer?.(true));
    let ziel = 1;
    return {
      beiEnde: (fn) => (endeHoerer = fn),
      /** Runde 24: Lautstärke 0..1 (Abstand zum Radio) */
      lautstaerke: (wert) => {
        if (Math.abs(wert - ziel) < 0.01) return;
        ziel = wert;
        gain.gain.setTargetAtTime(wert, ctx.currentTime, 0.25);
      },
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
  // Runde 23: Zähneklappern bei Kälte (immer synthetisch; der Atem dazu kommt als Datei „zittern“): schnelle, unregelmäßige Klicks
  zaehneklappern: ({ ctx, ausgang, t, rauschen }) => {
    const dauer = 0.9 + Math.random() * 0.5;
    let z = t;
    while (z < t + dauer) {
      const q = ctx.createBufferSource();
      q.buffer = rauschen;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 2400 + Math.random() * 1600;
      f.Q.value = 9;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, z);
      g.gain.linearRampToValueAtTime(0.35 + Math.random() * 0.25, z + 0.002);
      g.gain.exponentialRampToValueAtTime(0.001, z + 0.018);
      q.connect(f).connect(g).connect(ausgang);
      q.start(z, Math.random() * 1.5, 0.03);
      z += 0.045 + Math.random() * 0.035;
    }
    return dauer + 0.05;
  },
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
  schritt_schnee: ({ ctx, ausgang, t, rauschen }) => {
    // Ersatz ohne Sample: weiches Knirschen = mehrere kurze, helle Rauschstöße dicht hintereinander + dumpfer Tritt
    rauschStoss(ctx, ausgang, rauschen, t, { dauer: 0.07, typ: 'lowpass', frequenz: 500, lautstaerke: 0.25 });
    for (let i = 0; i < 4; i++) rauschStoss(ctx, ausgang, rauschen, t + 0.012 + i * 0.028 + Math.random() * 0.012, { dauer: 0.03, typ: 'bandpass', frequenz: 2800 + Math.random() * 2600, lautstaerke: 0.16 });
    return 0.25;
  },
  schritt_gras: ({ ctx, ausgang, t, rauschen }) => {
    // Ersatz ohne Datei: dumpfer Tritt + kurzes Rascheln
    rauschStoss(ctx, ausgang, rauschen, t, { dauer: 0.08, typ: 'lowpass', frequenz: 400, lautstaerke: 0.2 });
    rauschStoss(ctx, ausgang, rauschen, t + 0.02, { dauer: 0.12, typ: 'bandpass', frequenz: 3200, lautstaerke: 0.1 });
    return 0.2;
  },
  // Runde 18: Platzhalter-Synthesen (eigene Dateien ersetzen sie über die Audio-Zentrale)
  vogel: ({ ctx, ausgang, t }) => {
    // 2–4 kurze Pfiffe, die nach oben/unten gleiten
    const n = 2 + Math.floor(Math.random() * 3);
    const grund = 2600 + Math.random() * 1400;
    for (let i = 0; i < n; i++) {
      const f = grund * (0.9 + Math.random() * 0.25);
      ton(ctx, ausgang, t + i * (0.09 + Math.random() * 0.05), { typ: 'sine', von: f, bis: f * (Math.random() < 0.5 ? 1.35 : 0.75), dauer: 0.07, lautstaerke: 0.07, anschlag: 0.005 });
    }
    return n * 0.15 + 0.1;
  },
  donner: ({ ctx, ausgang, t, rauschen }) => {
    // fernes Grollen: lange, tiefe Rauschwelle mit ein paar Nachrollern
    rauschStoss(ctx, ausgang, rauschen, t, { dauer: 2.6, typ: 'lowpass', frequenz: 140, lautstaerke: 0.9, anschlag: 0.25 });
    for (let i = 0; i < 3; i++) rauschStoss(ctx, ausgang, rauschen, t + 0.4 + i * 0.5 + Math.random() * 0.3, { dauer: 0.9, typ: 'lowpass', frequenz: 90 + Math.random() * 60, lautstaerke: 0.5, anschlag: 0.1 });
    return 3.2;
  },
  automatikgewehr: (k) => schuss(k, { dauer: 0.16, hell: 4600, dumpf: 520, druck: 100, lautstaerke: 0.85 }),
  schaden_mann: ({ ctx, ausgang, t, rauschen }) => {
    ton(ctx, ausgang, t, { typ: 'sawtooth', von: 170, bis: 115, dauer: 0.24, lautstaerke: 0.2, filter: 800 });
    rauschStoss(ctx, ausgang, rauschen, t, { dauer: 0.1, typ: 'bandpass', frequenz: 700, lautstaerke: 0.12 });
    return 0.3;
  },
  schaden_frau: ({ ctx, ausgang, t, rauschen }) => {
    ton(ctx, ausgang, t, { typ: 'sawtooth', von: 330, bis: 230, dauer: 0.22, lautstaerke: 0.18, filter: 1400 });
    rauschStoss(ctx, ausgang, rauschen, t, { dauer: 0.09, typ: 'bandpass', frequenz: 1300, lautstaerke: 0.1 });
    return 0.3;
  },
  keuchen: ({ ctx, ausgang, t, rauschen }) => {
    // zwei schwere Atemzüge (ein/aus)
    for (let i = 0; i < 2; i++) {
      rauschStoss(ctx, ausgang, rauschen, t + i * 0.55, { dauer: 0.28, typ: 'bandpass', frequenz: 1100, lautstaerke: 0.22, anschlag: 0.08 });
      rauschStoss(ctx, ausgang, rauschen, t + i * 0.55 + 0.3, { dauer: 0.22, typ: 'bandpass', frequenz: 750, lautstaerke: 0.16, anschlag: 0.05 });
    }
    return 1.15;
  },
  magen_knurren: ({ ctx, ausgang, t }) => {
    ton(ctx, ausgang, t, { typ: 'sawtooth', von: 75, bis: 110, dauer: 0.5, lautstaerke: 0.14, filter: 260, anschlag: 0.1 });
    ton(ctx, ausgang, t + 0.45, { typ: 'sawtooth', von: 95, bis: 60, dauer: 0.6, lautstaerke: 0.12, filter: 220, anschlag: 0.1 });
    return 1.1;
  },
  durst: ({ ctx, ausgang, t, rauschen }) => {
    // trockenes Räuspern + Schlucken
    rauschStoss(ctx, ausgang, rauschen, t, { dauer: 0.16, typ: 'bandpass', frequenz: 1800, lautstaerke: 0.14, anschlag: 0.01 });
    ton(ctx, ausgang, t + 0.3, { typ: 'sine', von: 420, bis: 180, dauer: 0.12, lautstaerke: 0.15 });
    return 0.5;
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
  // Oberfläche, Inventar, Tiere (Phase 10.2)
  ui_klick: ({ ctx, ausgang, t }) => {
    klick(ctx, ausgang, t, 2600, 0.06);
    return 0.05;
  },
  ui_fehler: ({ ctx, ausgang, t }) => {
    klick(ctx, ausgang, t, 1540, 0.25);
    return 0.05;
  },
  taschenlampe: ({ ctx, ausgang, t }) => {
    klick(ctx, ausgang, t, 3500, 0.15);
    return 0.05;
  },
  inventar_auf: ({ ctx, ausgang, t, rauschen }) => {
    rauschStoss(ctx, ausgang, rauschen, t, { dauer: 0.14, typ: 'bandpass', frequenz: 1400, lautstaerke: 0.12, anschlag: 0.02 }); // Rucksack-Rascheln
    return 0.18;
  },
  inventar_zu: ({ ctx, ausgang, t, rauschen }) => {
    rauschStoss(ctx, ausgang, rauschen, t, { dauer: 0.1, typ: 'bandpass', frequenz: 1000, lautstaerke: 0.1, anschlag: 0.01 });
    return 0.14;
  },
  hase_flucht: ({ ctx, ausgang, t, rauschen }) => {
    // drei schnelle, dumpfe Hoppel-Tapser im Gras
    for (let i = 0; i < 3; i++) rauschStoss(ctx, ausgang, rauschen, t + i * 0.11, { dauer: 0.05, typ: 'lowpass', frequenz: 700, lautstaerke: 0.25, anschlag: 0.003 });
    return 0.4;
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
  // Stein abbauen (Fels): dumpfes, körniges Pochen – kein Metallklang
  hack_felsen: ({ ctx, ausgang, t, rauschen, tonhoehe }) => {
    rauschStoss(ctx, ausgang, rauschen, t, { dauer: 0.1, typ: 'lowpass', frequenz: 650 * tonhoehe, lautstaerke: 0.8, anschlag: 0.002 });
    ton(ctx, ausgang, t, { typ: 'sine', von: 130, bis: 55, dauer: 0.16, lautstaerke: 0.7, anschlag: 0.002 });
    for (let i = 0; i < 4; i++) rauschStoss(ctx, ausgang, rauschen, t + 0.03 + i * 0.03 + Math.random() * 0.02, { dauer: 0.02, typ: 'bandpass', frequenz: 500 + Math.random() * 700, lautstaerke: 0.22, anschlag: 0.001 });
    return 0.3;
  },
  felsen_bricht: ({ ctx, ausgang, t, rauschen }) => {
    ton(ctx, ausgang, t, { typ: 'sine', von: 90, bis: 32, dauer: 0.5, lautstaerke: 0.9, anschlag: 0.003 });
    rauschStoss(ctx, ausgang, rauschen, t, { dauer: 0.5, typ: 'lowpass', frequenz: 900, lautstaerke: 0.85, anschlag: 0.003 });
    for (let i = 0; i < 7; i++) rauschStoss(ctx, ausgang, rauschen, t + 0.12 + i * 0.07 + Math.random() * 0.04, { dauer: 0.03, typ: 'bandpass', frequenz: 400 + Math.random() * 600, lautstaerke: 0.3, anschlag: 0.001 });
    return 0.9;
  },
  // Lagerfeuer-Küche: Brutzeln beim Garen, Glöckchen wenn fertig, Zischen beim Verbrennen
  brutzel: ({ ctx, ausgang, t, rauschen }) => {
    rauschStoss(ctx, ausgang, rauschen, t, { dauer: 1.1, typ: 'highpass', frequenz: 4200, lautstaerke: 0.12, anschlag: 0.1 });
    for (let i = 0; i < 26; i++) rauschStoss(ctx, ausgang, rauschen, t + Math.random() * 1.0, { dauer: 0.012 + Math.random() * 0.01, typ: 'bandpass', frequenz: 2500 + Math.random() * 4500, lautstaerke: 0.15 + Math.random() * 0.25, anschlag: 0.001 });
    return 1.2;
  },
  fertig: ({ ctx, ausgang, t }) => {
    ton(ctx, ausgang, t, { typ: 'sine', von: 1046, bis: 1046, dauer: 0.35, lautstaerke: 0.28, anschlag: 0.003 });
    ton(ctx, ausgang, t + 0.12, { typ: 'sine', von: 1568, bis: 1568, dauer: 0.5, lautstaerke: 0.24, anschlag: 0.003 });
    return 0.8;
  },
  verbrannt: ({ ctx, ausgang, t, rauschen }) => {
    rauschStoss(ctx, ausgang, rauschen, t, { dauer: 0.6, typ: 'highpass', frequenz: 2200, lautstaerke: 0.35, anschlag: 0.03 });
    ton(ctx, ausgang, t, { typ: 'sawtooth', von: 180, bis: 90, dauer: 0.4, lautstaerke: 0.1, filter: 500 });
    return 0.7;
  },
  holz_nachlegen: ({ ctx, ausgang, t, rauschen }) => {
    ton(ctx, ausgang, t, { typ: 'triangle', von: 200, bis: 110, dauer: 0.1, lautstaerke: 0.4, anschlag: 0.002 });
    rauschStoss(ctx, ausgang, rauschen, t, { dauer: 0.08, typ: 'bandpass', frequenz: 900, lautstaerke: 0.5, anschlag: 0.002 });
    rauschStoss(ctx, ausgang, rauschen, t + 0.1, { dauer: 0.5, typ: 'bandpass', frequenz: 1400, lautstaerke: 0.3, anschlag: 0.15 });
    return 0.7;
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

/** Wind-Grundlautstärken (bei Pegel 100 %): eigene Datei, Synthese, Böen-Schwellen, Brummen */
const WIND_EIGEN = 0.25;
const WIND_SYNTH = 0.12;
const WIND_BOEN = 0.05;
const WIND_BRUMM = 0.008;

/** Schleifen ohne Rezept (laufen über eigene Methoden: starteAtmosphaere, regen, nacht, motor) */
const SCHLEIFEN_SYNTH = new Set(['wind', 'regen', 'nacht', 'motor']);
/** Ereignisse mit synthetischem Standard (für die Audio-Zentrale: alles andere ist ohne Datei stumm) */
export const SYNTH_EREIGNISSE = Object.freeze([...Object.keys(REZEPTE), ...SCHLEIFEN_SYNTH]);

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

/** 8 s Grillen-Zirpen (Nacht): kurze, hohe Pulsgruppen von drei Grillen in versetztem Takt, nahtlos schleifbar. */
function erzeugeGrillen(ctx) {
  const rate = ctx.sampleRate;
  const laenge = rate * 8;
  const puffer = ctx.createBuffer(1, laenge, rate);
  const d = puffer.getChannelData(0);
  const grillen = [
    { f: 4300, takt: 0.62, versatz: 0.0, laut: 0.5 },
    { f: 4750, takt: 0.8, versatz: 0.31, laut: 0.35 },
    { f: 3900, takt: 1.0, versatz: 0.55, laut: 0.25 },
  ];
  for (const g of grillen) {
    const takt = 8 / Math.round(8 / g.takt); // passt ganzzahlig in 8 s → Schleife ohne Sprung
    for (let start = g.versatz; start < 8; start += takt) {
      for (let p = 0; p < 3; p++) {
        const s0 = Math.floor((start + p * 0.045) * rate);
        const n = Math.floor(0.025 * rate);
        for (let i = 0; i < n; i++) {
          const k = (s0 + i) % laenge;
          d[k] += Math.sin((2 * Math.PI * g.f * (s0 + i)) / rate) * Math.sin((Math.PI * i) / n) * g.laut;
        }
      }
    }
  }
  return puffer;
}

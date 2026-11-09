import { tasteVon } from '../kern/tastenBelegung.js';

/**
 * Sprachchat (Runde 24, P15) + Funkgerät (Runde 47) – WebRTC direkt zwischen Spielern, der Spielserver vermittelt nur
 * (NACHRICHT.STIMME, Adresse = Sitzungs-ID `sid`, bleibt über Zonenwechsel gleich).
 *
 * Nähe: Modus (⚙ → Sprachchat, localStorage `browserSurvival.stimme`) 'aus' | 'ptt' (Taste „sprechen“ / 🎤 halten) | 'offen'
 *   (🎤 tippen = stumm). Verbunden wird mit Mitspielern derselben Zone ≤ VERBINDEN px; Lautstärke + Stereo nach Abstand.
 * Funk: Lage kommt vom Server (NACHRICHT.FUNK: an, frequenz, partner[{sid,name,funkt}]). Mit Funkpartnern wird – egal wie weit
 *   weg, auch in anderen Zonen – ebenfalls verbunden. Taste „funken“ (Standard Z) / 📻 halten = senden.
 * Je Verbindung ZWEI Audiospuren in fester Reihenfolge (Transceiver 0 = Nähe, 1 = Funk; beide Seiten legen sie gleich an):
 *   Nähe-Spur (Mikrofon) läuft beim Empfänger über Abstand/Stereo, Funk-Spur (Klon des Mikrofons) über den Funk-Filter
 *   (Bandpass, leichte Sättigung, Rauschen, Knacken beim Drücken/Loslassen). Wer funkt, spricht dabei auch laut (Nähe-Spur an).
 * Wer zuerst kam (kleinere sid), schickt das Angebot. Ohne Mikrofon (verweigert) hört man trotzdem zu.
 * STUN: öffentlicher Google-STUN (nur Verbindungsaufbau, keine Audiodaten).
 */
const SPEICHER = 'browserSurvival.stimme';
const VERBINDEN = 700;
const TRENNEN = 900;
const HOERWEITE = 650;
const ICE = [{ urls: 'stun:stun.l.google.com:19302' }];
const FUNK_LAUT = 1.1; // Funkstimme (konstant, egal wie weit weg)

export class StimmChat {
  #senden;
  #peers = new Map(); // sid → { pc, start, nah: {gain, panner}, funk: {gain}, audio: [] }
  #strom = null; // Mikrofon
  #funkSpur = null; // Klon der Mikrofonspur (eigenes enabled-Flag)
  #ctx = null;
  #pttGedrueckt = false;
  #funkGedrueckt = false;
  #stumm = false;
  #takt = 0;
  #funk = { an: false, bereit: false, frequenz: 1000, partner: [] };
  #partner = new Map(); // sid → { name, funkt }
  #rauschen = null; // { quelle, gain } Funk-Rauschen während jemand sendet

  /** @param senden (anSid, signal) → NACHRICHT.STIMME an den Server */
  constructor(dokument, senden) {
    this.d = dokument;
    this.#senden = senden;
    this.modus = 'aus';
    try {
      this.modus = ['aus', 'ptt', 'offen'].includes(localStorage.getItem(SPEICHER)) ? localStorage.getItem(SPEICHER) : 'aus';
    } catch {
      /* privates Fenster */
    }
    this.knopf = Object.assign(dokument.createElement('button'), { type: 'button', id: 'stimm-knopf', textContent: '🎤' });
    // Runde 47: Funk-Sprechknopf (Touch & Maus) – nur sichtbar, wenn das Funkgerät an ist
    this.funkKnopf = Object.assign(dokument.createElement('button'), { type: 'button', id: 'funk-knopf', textContent: '📻', hidden: true });
    dokument.body.append(this.knopf, this.funkKnopf);
    this.knopf.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (this.modus === 'ptt') this.sprechen(true);
      else if (this.modus === 'offen') this.#setzeStumm(!this.#stumm);
    });
    for (const ende of ['pointerup', 'pointercancel', 'pointerleave']) this.knopf.addEventListener(ende, () => this.modus === 'ptt' && this.sprechen(false));
    this.funkKnopf.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.funkKnopfGehalten = true;
    });
    for (const ende of ['pointerup', 'pointercancel', 'pointerleave']) this.funkKnopf.addEventListener(ende, () => (this.funkKnopfGehalten = false));
    for (const b of dokument.querySelectorAll('[data-stimme]')) b.onclick = () => this.setzeModus(b.dataset.stimme); // onclick: neue Sitzung (Zonenwechsel) ersetzt die alte
    this.funkKnopfGehalten = false;
    this.#zeigeModus();
    if (this.modus !== 'aus') this.#mikrofon();
  }

  async setzeModus(modus) {
    this.modus = modus;
    try {
      localStorage.setItem(SPEICHER, modus);
    } catch {
      /* egal */
    }
    if (modus === 'aus' && !this.#funk.bereit) this.beenden();
    else await this.#mikrofon();
    this.#zeigeModus();
  }

  /** Push-to-talk Nähe (Taste / Knopf halten) */
  sprechen(an) {
    this.#pttGedrueckt = an;
    this.#spur();
  }

  /** Runde 47: Funk-Taste gehalten? → Funk-Spur (und Nähe-Spur) an, Knacken */
  funken(an) {
    if (an && !this.#funk.bereit) return;
    if (an === this.#funkGedrueckt) return;
    this.#funkGedrueckt = an;
    this.#knacken(an ? 0.5 : 0.35);
    this.#spur();
  }

  get funkt() {
    return this.#funkGedrueckt;
  }

  /** Runde 47: Funk-Lage vom Server (NACHRICHT.FUNK) */
  setzeFunk(lage) {
    const vorher = new Map(this.#partner);
    const warBereit = this.#funk.bereit;
    this.#funk = { an: !!lage.an, bereit: !!lage.bereit, frequenz: lage.frequenz, partner: Array.isArray(lage.partner) ? lage.partner : [] };
    this.#partner = new Map(this.#funk.partner.map((p) => [p.sid, { name: p.name, funkt: !!p.funkt }]));
    // Jemand fängt an/hört auf zu funken → Knacken + Rauschen
    if (this.#funk.bereit) {
      for (const [sid, p] of this.#partner) {
        const alt = vorher.get(sid);
        if (p.funkt !== !!alt?.funkt) this.#knacken(p.funkt ? 0.45 : 0.3);
      }
    }
    this.#setzeRauschen(this.#funk.bereit && [...this.#partner.values()].some((p) => p.funkt));
    if (!this.#funk.bereit && this.#funkGedrueckt) this.funken(false);
    if (this.#funk.bereit && !warBereit) this.#mikrofon();
    if (!this.#funk.bereit && warBereit && this.modus === 'aus') this.beenden();
    this.funkKnopf.hidden = !this.#funk.bereit;
    this.funkKnopf.title = `Funken: halten (${tasteVon('funken')})`;
    this.#spur();
  }

  /** Namen der Funkpartner, die gerade senden (HUD) */
  get funkSprecher() {
    return [...this.#partner.values()].filter((p) => p.funkt).map((p) => p.name);
  }

  #setzeStumm(stumm) {
    this.#stumm = stumm;
    this.#spur();
  }

  #spur() {
    const funk = this.#funk.bereit && this.#funkGedrueckt;
    const nah = this.modus === 'offen' ? !this.#stumm : (this.modus === 'ptt' && this.#pttGedrueckt) || (this.modus !== 'aus' && funk);
    for (const t of this.#strom?.getAudioTracks() ?? []) t.enabled = nah;
    if (this.#funkSpur) this.#funkSpur.enabled = funk;
    this.knopf.classList.toggle('sendet', nah);
    this.funkKnopf.classList.toggle('sendet', funk);
    this.knopf.textContent = this.modus === 'offen' && this.#stumm ? '🔇' : '🎤';
    this.knopf.title = `Sprachchat: halten (${tasteVon('sprechen')}) zum Sprechen`;
  }

  #zeigeModus() {
    this.knopf.hidden = this.modus === 'aus';
    for (const b of this.d.querySelectorAll('[data-stimme]')) b.classList.toggle('aktiv', b.dataset.stimme === this.modus);
    this.#spur();
  }

  async #mikrofon() {
    if (this.#strom || !navigator.mediaDevices?.getUserMedia) return;
    try {
      this.#strom = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      this.#funkSpur = this.#strom.getAudioTracks()[0]?.clone() ?? null;
      this.#spur();
      for (const sid of [...this.#peers.keys()]) this.#schliesse(sid); // neu verbinden, jetzt mit Mikrofon
    } catch {
      this.#strom = null; // verweigert → nur zuhören
    }
  }

  beenden() {
    for (const sid of [...this.#peers.keys()]) this.#schliesse(sid);
    for (const t of this.#strom?.getTracks() ?? []) t.stop();
    this.#funkSpur?.stop();
    this.#strom = null;
    this.#funkSpur = null;
    this.#setzeRauschen(false);
  }

  /** Alles abbauen inkl. Knöpfe (Sitzungsende / Zonenwechsel) */
  entfernen() {
    this.beenden();
    this.knopf.remove();
    this.funkKnopf.remove();
  }

  /**
   * Pro Bild: Verbindungen nach Abstand bzw. Funk auf-/abbauen, Lautstärke/Stereo setzen.
   * @param ich { sid, x, y } · @param andere [{ sid, x, y }] (Spieler derselben Zone, ohne Bots)
   */
  aktualisiere(ich, andere, dt) {
    if (!ich?.sid || (this.modus === 'aus' && !this.#funk.bereit)) return;
    this.#takt -= dt;
    const pruefen = this.#takt <= 0;
    if (pruefen) this.#takt = 1;
    const gewollt = new Set();
    const nahe = new Map();
    for (const s of andere) {
      if (!s.sid) continue;
      const d = Math.hypot(s.x - ich.x, s.y - ich.y);
      nahe.set(s.sid, { d, dx: s.x - ich.x });
      if (this.modus !== 'aus' && d < (this.#peers.has(s.sid) ? TRENNEN : VERBINDEN)) gewollt.add(s.sid);
    }
    if (this.#funk.bereit) for (const sid of this.#partner.keys()) gewollt.add(sid);
    if (pruefen) {
      for (const sid of gewollt) if (!this.#peers.has(sid) && ich.sid < sid) this.#verbinde(sid, true);
      for (const [sid, p] of [...this.#peers]) {
        if (!gewollt.has(sid) || (p.pc.connectionState !== 'connected' && performance.now() - p.start > 20000)) this.#schliesse(sid);
      }
    }
    for (const [sid, p] of this.#peers) {
      const n = nahe.get(sid);
      if (p.nah) {
        p.nah.gain.gain.value = this.modus !== 'aus' && n ? Math.max(0, 1 - n.d / HOERWEITE) ** 1.5 : 0;
        if (n) p.nah.panner.pan.value = Math.max(-1, Math.min(1, n.dx / 300));
      }
      // Funk: nur echte Partner; direkt daneben (≤ 120 px) hört man die Stimme schon laut → Funk leiser (kein Doppel-Echo)
      if (p.funk) p.funk.gain.gain.value = this.#funk.bereit && this.#partner.has(sid) ? FUNK_LAUT * (n && n.d < 120 && this.modus !== 'aus' ? 0.35 : 1) : 0;
    }
  }

  /** Signal vom Server: { von: sid, signal: { sdp } | { kandidat } } */
  async beiSignal(von, signal) {
    if ((this.modus === 'aus' && !this.#funk.bereit) || !signal) return;
    let p = this.#peers.get(von);
    try {
      if (signal.sdp) {
        if (signal.sdp.type === 'offer') {
          if (p) this.#schliesse(von);
          p = this.#verbinde(von, false);
        }
        if (!p) return;
        await p.pc.setRemoteDescription(signal.sdp);
        if (signal.sdp.type === 'offer') {
          this.#belegeSpuren(p); // Antwortende: Transceiver kommen aus dem Angebot (0 = Nähe, 1 = Funk)
          await p.pc.setLocalDescription(await p.pc.createAnswer());
          this.#senden(von, { sdp: p.pc.localDescription.toJSON() });
        }
      } else if (signal.kandidat && p) await p.pc.addIceCandidate(signal.kandidat);
    } catch {
      this.#schliesse(von);
    }
  }

  #verbinde(sid, anbieter) {
    const pc = new RTCPeerConnection({ iceServers: ICE });
    const p = { pc, start: performance.now(), nah: null, funk: null, audio: [] };
    this.#peers.set(sid, p);
    if (anbieter) {
      const mik = this.#strom?.getAudioTracks()[0] ?? null;
      for (const spur of [mik, this.#funkSpur]) {
        if (spur && mik) pc.addTransceiver(spur, { direction: 'sendrecv', streams: [this.#strom] });
        else pc.addTransceiver('audio', { direction: 'recvonly' });
      }
    }
    pc.onicecandidate = (e) => e.candidate && this.#senden(sid, { kandidat: e.candidate.toJSON() });
    pc.ontrack = (e) => {
      const index = pc.getTransceivers().indexOf(e.transceiver);
      this.#hoere(p, index === 1 ? 'funk' : 'nah', new MediaStream([e.track]));
    };
    if (anbieter) {
      pc.createOffer()
        .then((o) => pc.setLocalDescription(o))
        .then(() => this.#senden(sid, { sdp: pc.localDescription.toJSON() }))
        .catch(() => this.#schliesse(sid));
    }
    return p;
  }

  /** Antwortende: eigene Spuren in die Transceiver aus dem Angebot hängen (gleiche Reihenfolge). */
  #belegeSpuren(p) {
    const mik = this.#strom?.getAudioTracks()[0] ?? null;
    const spuren = [mik, this.#funkSpur];
    p.pc.getTransceivers().forEach((t, i) => {
      const spur = spuren[i] ?? null;
      if (spur && mik) {
        t.sender.replaceTrack(spur).catch(() => {});
        t.direction = 'sendrecv';
      } else t.direction = 'recvonly';
    });
  }

  #kontext() {
    this.#ctx ??= new AudioContext();
    if (this.#ctx.state === 'suspended') this.#ctx.resume().catch(() => {});
    return this.#ctx;
  }

  #hoere(p, art, strom) {
    if (p[art]) return;
    const ctx = this.#kontext();
    // Chrome spielt WebRTC-Ströme in WebAudio nur ab, wenn sie auch an einem (stummen) <audio> hängen
    const audio = Object.assign(new Audio(), { srcObject: strom, muted: true });
    audio.play().catch(() => {});
    p.audio.push(audio);
    const quelle = ctx.createMediaStreamSource(strom);
    const gain = ctx.createGain();
    gain.gain.value = 0;
    if (art === 'nah') {
      const panner = ctx.createStereoPanner();
      quelle.connect(gain).connect(panner).connect(ctx.destination);
      p.nah = { gain, panner, quelle };
    } else {
      // Funk-Klang: Telefon-Bandpass + leichte Sättigung
      const hoch = Object.assign(ctx.createBiquadFilter(), { type: 'highpass' });
      hoch.frequency.value = 420;
      const tief = Object.assign(ctx.createBiquadFilter(), { type: 'lowpass' });
      tief.frequency.value = 2900;
      const saettigung = ctx.createWaveShaper();
      saettigung.curve = saettigungsKurve(2.2);
      quelle.connect(hoch).connect(tief).connect(saettigung).connect(gain).connect(ctx.destination);
      p.funk = { gain, quelle };
    }
  }

  /** Kurzes Funk-Knacken (Rauschstoß) beim Drücken/Loslassen – eigenes und fremdes Senden. */
  #knacken(staerke) {
    if (!this.#ctx && !this.#funk.bereit) return;
    const ctx = this.#kontext();
    const dauer = 0.09;
    const puffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dauer), ctx.sampleRate);
    const daten = puffer.getChannelData(0);
    for (let i = 0; i < daten.length; i++) daten[i] = (Math.random() * 2 - 1) * (1 - i / daten.length) ** 2;
    const quelle = Object.assign(ctx.createBufferSource(), { buffer: puffer });
    const filter = Object.assign(ctx.createBiquadFilter(), { type: 'bandpass' });
    filter.frequency.value = 1800;
    const gain = ctx.createGain();
    gain.gain.value = 0.25 * staerke;
    quelle.connect(filter).connect(gain).connect(ctx.destination);
    quelle.start();
  }

  /** Leises Funk-Rauschen, solange ein Partner sendet. */
  #setzeRauschen(an) {
    if (!an) {
      if (this.#rauschen) {
        this.#rauschen.quelle.stop();
        this.#rauschen = null;
      }
      return;
    }
    if (this.#rauschen) return;
    const ctx = this.#kontext();
    const puffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const daten = puffer.getChannelData(0);
    for (let i = 0; i < daten.length; i++) daten[i] = Math.random() * 2 - 1;
    const quelle = Object.assign(ctx.createBufferSource(), { buffer: puffer, loop: true });
    const filter = Object.assign(ctx.createBiquadFilter(), { type: 'bandpass' });
    filter.frequency.value = 2200;
    filter.Q.value = 0.7;
    const gain = ctx.createGain();
    gain.gain.value = 0.018;
    quelle.connect(filter).connect(gain).connect(ctx.destination);
    quelle.start();
    this.#rauschen = { quelle, gain };
  }

  #schliesse(sid) {
    const p = this.#peers.get(sid);
    if (!p) return;
    this.#peers.delete(sid);
    p.pc.close();
    for (const art of ['nah', 'funk']) {
      p[art]?.quelle.disconnect();
      p[art]?.gain.disconnect();
      p[art]?.panner?.disconnect();
    }
    for (const a of p.audio) a.srcObject = null;
  }

  get verbindungen() {
    return [...this.#peers.values()].filter((p) => p.pc.connectionState === 'connected').length;
  }

  /** Für Tests/Fehlersuche: je Verbindung Zustand, Pegel und empfangene Audio-Bytes (0 = Nähe, 1 = Funk). */
  async zustand() {
    const liste = [];
    for (const [sid, p] of this.#peers) {
      const bytes = [0, 0];
      const transceiver = p.pc.getTransceivers();
      try {
        for (const r of (await p.pc.getStats()).values()) {
          if (r.type !== 'inbound-rtp' || r.kind !== 'audio') continue;
          const i = transceiver.findIndex((t) => t.mid === r.mid);
          if (i >= 0 && i < 2) bytes[i] += r.bytesReceived ?? 0;
        }
      } catch {
        /* geschlossen */
      }
      liste.push({ sid, verbindung: p.pc.connectionState, nah: p.nah?.gain.gain.value ?? null, funk: p.funk?.gain.gain.value ?? null, bytes });
    }
    return liste;
  }
}

/** Weiche Sättigung (Funk-Klang), k = Stärke */
function saettigungsKurve(k) {
  const kurve = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const x = (i / 255) * 2 - 1;
    kurve[i] = Math.tanh(k * x) / Math.tanh(k);
  }
  return kurve;
}

/**
 * Runde 24 (P15): Proximity Voice Chat – WebRTC direkt zwischen Spielern, der Spielserver vermittelt nur (NACHRICHT.STIMME).
 * Modus (⚙ Einstellungen → Sprachchat, localStorage `browserSurvival.stimme`): 'aus' | 'ptt' (Taste C / 🎤 halten) | 'offen'
 * (🎤 tippen = stumm). Verbunden wird mit Mitspielern ≤ VERBINDEN px; Lautstärke + Stereo nach Abstand (HOERWEITE).
 * Wer zuerst kam (kleinere Spieler-ID), schickt das Angebot. Ohne Mikrofon (verweigert) hört man trotzdem zu.
 * STUN: öffentlicher Google-STUN (nur Verbindungsaufbau, keine Audiodaten).
 */
const SPEICHER = 'browserSurvival.stimme';
const VERBINDEN = 700;
const TRENNEN = 900;
const HOERWEITE = 650;
const ICE = [{ urls: 'stun:stun.l.google.com:19302' }];

export class StimmChat {
  #senden;
  #peers = new Map(); // spielerId → { pc, gain, panner, audio, start }
  #strom = null;
  #ctx = null;
  #pttGedrueckt = false;
  #stumm = false;
  #takt = 0;

  /** @param senden (an, signal) → NACHRICHT.STIMME an den Server */
  constructor(dokument, senden) {
    this.d = dokument;
    this.#senden = senden;
    this.modus = 'aus';
    try {
      this.modus = ['aus', 'ptt', 'offen'].includes(localStorage.getItem(SPEICHER)) ? localStorage.getItem(SPEICHER) : 'aus';
    } catch {
      /* privates Fenster */
    }
    this.knopf = Object.assign(dokument.createElement('button'), { type: 'button', id: 'stimm-knopf', textContent: '🎤', title: 'Sprachchat: halten (C) zum Sprechen' });
    dokument.body.append(this.knopf);
    this.knopf.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (this.modus === 'ptt') this.sprechen(true);
      else if (this.modus === 'offen') this.#setzeStumm(!this.#stumm);
    });
    for (const ende of ['pointerup', 'pointercancel', 'pointerleave']) this.knopf.addEventListener(ende, () => this.modus === 'ptt' && this.sprechen(false));
    for (const b of dokument.querySelectorAll('[data-stimme]')) b.onclick = () => this.setzeModus(b.dataset.stimme); // onclick: neue Sitzung (Zonenwechsel) ersetzt die alte
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
    if (modus === 'aus') this.beenden();
    else await this.#mikrofon();
    this.#zeigeModus();
  }

  /** Push-to-talk (Taste C / Knopf halten) */
  sprechen(an) {
    this.#pttGedrueckt = an;
    this.#spur();
  }

  #setzeStumm(stumm) {
    this.#stumm = stumm;
    this.#spur();
  }

  #spur() {
    const senden = this.modus === 'offen' ? !this.#stumm : this.modus === 'ptt' && this.#pttGedrueckt;
    for (const t of this.#strom?.getAudioTracks() ?? []) t.enabled = senden;
    this.knopf.classList.toggle('sendet', senden);
    this.knopf.textContent = this.modus === 'offen' && this.#stumm ? '🔇' : '🎤';
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
      this.#spur();
      for (const id of [...this.#peers.keys()]) this.#schliesse(id); // neu verbinden, jetzt mit Mikrofon
    } catch {
      this.#strom = null; // verweigert → nur zuhören
    }
  }

  beenden() {
    for (const id of [...this.#peers.keys()]) this.#schliesse(id);
    for (const t of this.#strom?.getTracks() ?? []) t.stop();
    this.#strom = null;
  }

  /**
   * Pro Bild: Verbindungen nach Abstand auf-/abbauen, Lautstärke/Stereo setzen.
   * @param ich { id, x, y } · @param andere [{ id, x, y }] (Spieler derselben Zone, ohne Bots)
   */
  aktualisiere(ich, andere, dt) {
    if (this.modus === 'aus' || !ich) return;
    this.#takt -= dt;
    const pruefen = this.#takt <= 0;
    if (pruefen) this.#takt = 1;
    const gesehen = new Set();
    for (const s of andere) {
      const d = Math.hypot(s.x - ich.x, s.y - ich.y);
      gesehen.add(s.id);
      let p = this.#peers.get(s.id);
      if (pruefen && !p && d < VERBINDEN && ich.id < s.id) p = this.#verbinde(s.id, true);
      if (pruefen && p && (d > TRENNEN || (p.pc.connectionState !== 'connected' && performance.now() - p.start > 20000))) {
        this.#schliesse(s.id);
        continue;
      }
      if (p?.gain) {
        p.gain.gain.value = Math.max(0, 1 - d / HOERWEITE) ** 1.5;
        p.panner.pan.value = Math.max(-1, Math.min(1, (s.x - ich.x) / 300));
      }
    }
    if (pruefen) for (const id of [...this.#peers.keys()]) if (!gesehen.has(id)) this.#schliesse(id);
  }

  /** Signal vom Server: { von, signal: { sdp } | { kandidat } } */
  async beiSignal(von, signal) {
    if (this.modus === 'aus' || !signal) return;
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
          await p.pc.setLocalDescription(await p.pc.createAnswer());
          this.#senden(von, { sdp: p.pc.localDescription.toJSON() });
        }
      } else if (signal.kandidat && p) await p.pc.addIceCandidate(signal.kandidat);
    } catch {
      this.#schliesse(von);
    }
  }

  #verbinde(id, anbieter) {
    const pc = new RTCPeerConnection({ iceServers: ICE });
    const p = { pc, start: performance.now(), gain: null, panner: null, audio: null };
    this.#peers.set(id, p);
    if (this.#strom) for (const t of this.#strom.getAudioTracks()) pc.addTrack(t, this.#strom);
    else pc.addTransceiver('audio', { direction: 'recvonly' });
    pc.onicecandidate = (e) => e.candidate && this.#senden(id, { kandidat: e.candidate.toJSON() });
    pc.ontrack = (e) => this.#hoere(p, e.streams[0] ?? new MediaStream([e.track]));
    if (anbieter) {
      pc.createOffer()
        .then((o) => pc.setLocalDescription(o))
        .then(() => this.#senden(id, { sdp: pc.localDescription.toJSON() }))
        .catch(() => this.#schliesse(id));
    }
    return p;
  }

  #hoere(p, strom) {
    if (p.gain) return;
    this.#ctx ??= new AudioContext();
    if (this.#ctx.state === 'suspended') this.#ctx.resume().catch(() => {});
    // Chrome spielt WebRTC-Ströme in WebAudio nur ab, wenn sie auch an einem (stummen) <audio> hängen
    p.audio = Object.assign(new Audio(), { srcObject: strom, muted: true });
    p.audio.play().catch(() => {});
    const quelle = this.#ctx.createMediaStreamSource(strom);
    p.gain = this.#ctx.createGain();
    p.panner = this.#ctx.createStereoPanner();
    quelle.connect(p.gain).connect(p.panner).connect(this.#ctx.destination);
  }

  #schliesse(id) {
    const p = this.#peers.get(id);
    if (!p) return;
    this.#peers.delete(id);
    p.pc.close();
    p.gain?.disconnect();
    p.panner?.disconnect();
    if (p.audio) p.audio.srcObject = null;
  }

  get verbindungen() {
    return [...this.#peers.values()].filter((p) => p.pc.connectionState === 'connected').length;
  }
}

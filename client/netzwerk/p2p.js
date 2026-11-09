import { Signal } from './signal.js';

/**
 * Runde 47: Browser-Hosting – Mehrspieler ohne eigenen Server. Der Host-Tab lässt den echten SpielServer laufen
 * (lokalerServer.js `oeffneHostKanal`), Freunde verbinden sich per WebRTC-DataChannel direkt mit ihm.
 *
 *   Host:   new Host({ server, code, passwort, maxGaeste }).starten() – meldet sich beim Vermittler als `browsersurvival-<CODE>`
 *           an, beantwortet Angebote, nimmt nach dem Handschlag (Passwort, Platz frei) jeden Kanal in den SpielServer.
 *   Gast:   verbindeMitHost(code, passwort) → Text-Kanal (wie WebSocket) → JsonVerbindung → normaler Login (Gast).
 *
 * Handschlag im DataChannel (vor dem Spielprotokoll): Gast → { typ:'__p2p', was:'hallo', passwort } · Host → 'willkommen' |
 * 'abgelehnt'{grund}. Trennen mit Grund (Kick): 'tschuess'{grund}, dann zu. Große Nachrichten (Startdaten der Karte) werden
 * in Stücke ≤ STUECK Zeichen geteilt: `~<id>,<nr>,<anzahl>|<teil>` (JSON beginnt nie mit „~“).
 * Verbindung: öffentliche STUN-Server (keine Spieldaten), kein TURN → hinter sehr strengen Firmen-/Mobilfunk-NATs kann es scheitern.
 * ⚠ Der öffentliche PeerJS-Dienst prüft die Nutzdaten nach PeerJS-Schema und wirft sonst den Absender raus: Angebot mit
 *   { sdp, type:'data', connectionId, label, reliable, serialization }, Antwort { sdp, type, connectionId }, Kandidat { candidate, type, connectionId }.
 */
export const ID_PRAEFIX = 'browsersurvival-';
/** Fehlersuche: die letzten 200 Ereignisse (Konsole: browserSurvival.p2p) */
export const P2P_PROTOKOLL = [];
const log = (...teile) => {
  P2P_PROTOKOLL.push(`${new Date().toISOString().slice(11, 23)} ${teile.join(' ')}`);
  if (P2P_PROTOKOLL.length > 200) P2P_PROTOKOLL.shift();
};
export const ICE = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];
const STUECK = 60000;
const CODE_ZEICHEN = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Neuer Einladungscode, z. B. „K7P2XQ“ (ohne verwechselbare Zeichen 0/O/1/I). */
export function neuerCode(laenge = 6) {
  let c = '';
  for (let i = 0; i < laenge; i++) c += CODE_ZEICHEN[Math.floor(Math.random() * CODE_ZEICHEN.length)];
  return c;
}

/** Eingabe säubern („k7p 2xq“ → „K7P2XQ“); null, wenn es kein gültiger Code ist. */
export function pruefeCode(roh) {
  const c = String(roh ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return /^[A-Z0-9]{4,12}$/.test(c) ? c : null;
}

export const hostKennung = (code) => `${ID_PRAEFIX}${code}`;

/** Nutzdaten im PeerJS-Format (sonst schließt der öffentliche Vermittler die Verbindung, s. Kopf). */
const angebotNutzdaten = (sdp, connectionId) => ({ sdp, type: 'data', connectionId, label: connectionId, reliable: true, serialization: 'raw' });
const antwortNutzdaten = (sdp, connectionId) => ({ sdp, type: 'data', connectionId });
const kandidatNutzdaten = (candidate, connectionId) => ({ candidate, type: 'data', connectionId });

/** Einladungslink für den Code (gleiche Seite, ?beitreten=CODE). */
export function einladungsLink(code, ort = globalThis.location) {
  const basis = `${ort.origin}${ort.pathname}`;
  return `${basis}?beitreten=${encodeURIComponent(code)}`;
}

/** DataChannel → Text-Kanal (senden/beiNachricht/beiTrennung/trennen) mit Stückelung und Trenn-Grund. */
export function kanalAus(dc, pc) {
  const nachrichtHoerer = [];
  const trennHoerer = [];
  const teile = new Map();
  let getrennt = false;
  let grund = null;
  let zaehler = 0;
  const ende = (g) => {
    if (getrennt) return;
    getrennt = true;
    for (const h of trennHoerer) h(grund ?? g);
    try {
      dc.close();
    } catch {
      /* egal */
    }
    try {
      pc?.close();
    } catch {
      /* egal */
    }
  };
  const liefere = (text) => {
    if (text.startsWith('{"typ":"__p2p"')) {
      try {
        const n = JSON.parse(text);
        if (n.was === 'tschuess') grund = n.grund ?? null;
      } catch {
        /* egal */
      }
      return;
    }
    for (const h of nachrichtHoerer) h(text);
  };
  dc.addEventListener('message', (e) => {
    const t = typeof e.data === 'string' ? e.data : '';
    if (t.charCodeAt(0) !== 126) return liefere(t);
    const strich = t.indexOf('|');
    const [id, nr, anzahl] = t.slice(1, strich).split(',').map(Number);
    if (!(anzahl > 0 && anzahl < 2000 && nr >= 0 && nr < anzahl)) return;
    const liste = teile.get(id) ?? new Array(anzahl).fill(null);
    liste[nr] = t.slice(strich + 1);
    teile.set(id, liste);
    if (liste.every((x) => x !== null)) {
      teile.delete(id);
      liefere(liste.join(''));
    }
  });
  dc.addEventListener('close', () => ende('Verbindung zum Host verloren'));
  pc?.addEventListener('connectionstatechange', () => ['failed', 'closed'].includes(pc.connectionState) && ende('Verbindung verloren'));
  return {
    senden(text) {
      if (getrennt || dc.readyState !== 'open') return;
      const s = String(text);
      if (s.length <= STUECK) return dc.send(s);
      const id = ++zaehler;
      const anzahl = Math.ceil(s.length / STUECK);
      for (let i = 0; i < anzahl; i++) dc.send(`~${id},${i},${anzahl}|${s.slice(i * STUECK, (i + 1) * STUECK)}`);
    },
    beiNachricht(h) {
      nachrichtHoerer.push(h);
    },
    beiTrennung(h) {
      trennHoerer.push(h);
    },
    trennen(g = 'Verbindung getrennt') {
      if (getrennt) return;
      try {
        if (dc.readyState === 'open') dc.send(JSON.stringify({ typ: '__p2p', was: 'tschuess', grund: g }));
      } catch {
        /* egal */
      }
      grund = g;
      setTimeout(() => ende(g), 150); // kurz warten, damit der Grund noch ankommt
    },
  };
}

/** Host: nimmt Freunde über den Vermittler an und hängt sie an den SpielServer. */
export class Host {
  #signal = null;
  #verbindungen = new Map(); // gegenstelle → { pc, kanal?, angenommen }
  #abmelden = null;

  /** @param beiStatus fn({ zustand: 'verbinde'|'bereit'|'fehler', text, gaeste }) */
  constructor({ server, code, passwort = '', maxGaeste = 7, beiStatus = null, adresse = undefined }) {
    Object.assign(this, { server, code, passwort, maxGaeste, beiStatus, adresse });
    this.zustand = 'aus';
  }

  get gaeste() {
    return [...this.#verbindungen.values()].filter((v) => v.angenommen).length;
  }

  #melde(zustand, text) {
    this.zustand = zustand;
    this.text = text;
    this.beiStatus?.({ zustand, text, gaeste: this.gaeste });
  }

  async starten() {
    this.#melde('verbinde', 'Verbinde mit dem Vermittlungsdienst …');
    this.#signal = new Signal(hostKennung(this.code), this.adresse);
    try {
      await this.#signal.verbinden();
    } catch (fehler) {
      this.#melde('fehler', fehler.message);
      throw fehler;
    }
    this.#abmelden = this.#signal.beiNachricht((n) => this.#beiSignal(n));
    this.#melde('bereit', 'Bereit – Freunde können mit dem Code beitreten');
    return this;
  }

  stoppen() {
    this.#abmelden?.();
    this.#signal?.schliessen();
    for (const v of this.#verbindungen.values()) {
      v.kanal?.trennen('Der Host hat das Spiel beendet');
      v.pc.close();
    }
    this.#verbindungen.clear();
    this.#melde('aus', 'Gestoppt');
  }

  async #beiSignal(n) {
    if (n.type === 'GESCHLOSSEN') {
      // Vermittler weg (z. B. Standby) – laufende Spiele bleiben, neue Freunde kommen erst nach Neuverbindung rein
      if (this.zustand === 'bereit') {
        this.#melde('fehler', 'Vermittlungsdienst getrennt – verbinde neu …');
        setTimeout(() => this.zustand !== 'aus' && this.starten().catch(() => {}), 3000);
      }
      return;
    }
    const src = typeof n.src === 'string' ? n.src : null;
    log('Host ←', n.type, src ?? '-');
    if (!src || !n.payload) return;
    if (n.type === 'OFFER' && n.payload.sdp) {
      this.#verbindungen.get(src)?.pc.close();
      const pc = new RTCPeerConnection({ iceServers: ICE });
      const verbindungsId = String(n.payload.connectionId ?? 'dc_spiel');
      const v = { pc, kanal: null, angenommen: false };
      this.#verbindungen.set(src, v);
      pc.onicecandidate = (e) => e.candidate && this.#signal.senden(src, 'CANDIDATE', kandidatNutzdaten(e.candidate.toJSON(), verbindungsId));
      pc.ondatachannel = (e) => this.#neuerKanal(src, v, e.channel);
      pc.onconnectionstatechange = () => {
        log('Host Verbindung', src, pc.connectionState);
        if (['failed', 'closed'].includes(pc.connectionState) && this.#verbindungen.get(src) === v) {
          this.#verbindungen.delete(src);
          this.beiStatus?.({ zustand: this.zustand, text: this.text, gaeste: this.gaeste });
        }
      };
      try {
        await pc.setRemoteDescription(n.payload.sdp);
        await pc.setLocalDescription(await pc.createAnswer());
        this.#signal.senden(src, 'ANSWER', antwortNutzdaten(pc.localDescription.toJSON(), verbindungsId));
        log('Host → ANSWER', src);
      } catch (f) {
        log('Host Fehler beim Antworten', f?.message ?? f);
        pc.close();
        this.#verbindungen.delete(src);
      }
    } else if (n.type === 'CANDIDATE' && n.payload.candidate) {
      await this.#verbindungen.get(src)?.pc.addIceCandidate(n.payload.candidate).catch(() => {});
    }
  }

  #neuerKanal(src, v, dc) {
    let begruesst = false;
    const zeit = setTimeout(() => !begruesst && v.pc.close(), 15000);
    const hallo = (e) => {
      if (begruesst || typeof e.data !== 'string') return;
      let n;
      try {
        n = JSON.parse(e.data);
      } catch {
        return;
      }
      if (n?.typ !== '__p2p' || n.was !== 'hallo') return;
      begruesst = true;
      clearTimeout(zeit);
      dc.removeEventListener('message', hallo);
      const ab = (grund) => {
        dc.send(JSON.stringify({ typ: '__p2p', was: 'abgelehnt', grund }));
        setTimeout(() => v.pc.close(), 300);
      };
      if (this.passwort && n.passwort !== this.passwort) return ab('Falsches Server-Passwort');
      if (this.gaeste >= this.maxGaeste) return ab('Der Server ist voll');
      dc.send(JSON.stringify({ typ: '__p2p', was: 'willkommen' }));
      v.angenommen = true;
      v.kanal = kanalAus(dc, v.pc);
      v.kanal.beiTrennung(() => {
        if (this.#verbindungen.get(src) === v) this.#verbindungen.delete(src);
        this.beiStatus?.({ zustand: this.zustand, text: this.text, gaeste: this.gaeste });
      });
      this.server.verbindungHinzufuegen(v.kanal, { adresse: `p2p:${src.slice(-6)}` });
      this.beiStatus?.({ zustand: this.zustand, text: this.text, gaeste: this.gaeste });
    };
    dc.addEventListener('message', hallo);
  }
}

/**
 * Gast: mit dem Host hinter `code` verbinden. @returns Text-Kanal (erfüllt nach „willkommen“)
 * Fehlermeldungen sind für Menschen gedacht (landen im Hauptmenü).
 */
export async function verbindeMitHost(code, passwort = '', { timeoutMs = 25000, adresse = undefined } = {}) {
  const signal = new Signal(`${ID_PRAEFIX}g-${Math.random().toString(36).slice(2, 12)}`, adresse);
  await signal.verbinden();
  const ziel = hostKennung(code);
  const pc = new RTCPeerConnection({ iceServers: ICE });
  const dc = pc.createDataChannel('spiel', { ordered: true });
  const verbindungsId = `dc_${Math.random().toString(36).slice(2, 13)}`;
  return new Promise((erfuellen, ablehnen) => {
    let fertig = false;
    const fehler = (text) => {
      if (fertig) return;
      fertig = true;
      clearTimeout(timer);
      signal.schliessen();
      pc.close();
      ablehnen(new Error(text));
    };
    const timer = setTimeout(() => fehler('Host nicht erreichbar – stimmt der Code und läuft das Spiel beim Host? (Manche Netzwerke blockieren direkte Verbindungen.)'), timeoutMs);
    signal.beiNachricht(async (n) => {
      log('Gast ←', n.type, n.src ?? '-');
      if (n.src !== ziel) return n.type === 'EXPIRE' || n.type === 'ERROR' ? fehler('Kein Server mit diesem Code gefunden – ist der Host online?') : undefined;
      try {
        if (n.type === 'ANSWER' && n.payload?.sdp) await pc.setRemoteDescription(n.payload.sdp);
        else if (n.type === 'CANDIDATE' && n.payload?.candidate) await pc.addIceCandidate(n.payload.candidate);
      } catch {
        /* einzelner Kandidat kaputt – egal */
      }
    });
    pc.onicecandidate = (e) => {
      if (!e.candidate) return;
      log('Gast Kandidat', e.candidate.type ?? '?', e.candidate.protocol ?? '');
      signal.senden(ziel, 'CANDIDATE', kandidatNutzdaten(e.candidate.toJSON(), verbindungsId));
    };
    pc.onconnectionstatechange = () => {
      log('Gast Verbindung', pc.connectionState);
      if (pc.connectionState === 'failed') fehler('Direkte Verbindung zum Host gescheitert (Netzwerk/Firewall).');
    };
    dc.addEventListener('open', () => dc.send(JSON.stringify({ typ: '__p2p', was: 'hallo', passwort })));
    dc.addEventListener('message', function antwort(e) {
      let n;
      try {
        n = JSON.parse(e.data);
      } catch {
        return;
      }
      if (n?.typ !== '__p2p') return;
      dc.removeEventListener('message', antwort);
      if (n.was !== 'willkommen') return fehler(n.grund ?? 'Vom Host abgelehnt');
      fertig = true;
      clearTimeout(timer);
      signal.schliessen(); // Vermittler wird nicht mehr gebraucht
      erfuellen(kanalAus(dc, pc));
    });
    pc.createOffer()
      .then((o) => pc.setLocalDescription(o))
      .then(() => {
        signal.senden(ziel, 'OFFER', angebotNutzdaten(pc.localDescription.toJSON(), verbindungsId));
        log('Gast → OFFER', ziel);
      })
      .catch(() => fehler('Verbindung konnte nicht vorbereitet werden'));
  });
}

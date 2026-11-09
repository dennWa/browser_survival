/**
 * Runde 47: Vermittler („Signalisierung“) für Browser-Hosting – nur zum Kennenlernen der WebRTC-Gegenstellen (Angebot, Antwort,
 * ICE-Kandidaten); das Spiel selbst läuft danach direkt zwischen den Browsern (client/netzwerk/p2p.js).
 *
 * Protokoll = PeerJS-Server (JSON über WebSocket): verbinden mit `…/peerjs?key=…&id=<eigene ID>&token=…` → { type: 'OPEN' };
 * senden { type: 'OFFER'|'ANSWER'|'CANDIDATE'|'LEAVE', dst, payload } → kommt bei dst als { type, src, payload } an;
 * alle 5 s { type: 'HEARTBEAT' }. Fehler: 'ID-TAKEN' (Code schon vergeben), 'ERROR', 'EXPIRE' (Ziel nicht da).
 * Standard: der kostenlose öffentliche PeerJS-Dienst; eigener Vermittler: Node-Server `/peerjs` (server/node/signalServer.js)
 * bzw. URL-Parameter `?signal=wss://…/peerjs?key=peerjs`.
 */
export const OEFFENTLICHER_VERMITTLER = 'wss://0.peerjs.com/peerjs?key=peerjs';
const HERZSCHLAG_MS = 5000;

/** Adresse des Vermittlers: ?signal=… > eigener Node-Server (gleiche Adresse, nicht GitHub Pages/Datei) > öffentlicher PeerJS-Dienst. */
export function vermittlerAdresse(ort = globalThis.location) {
  const param = ort?.search ? new URLSearchParams(ort.search).get('signal') : null;
  if (param && /^wss?:\/\//.test(param)) return param;
  return OEFFENTLICHER_VERMITTLER;
}

function zufall(laenge = 16) {
  const zeichen = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < laenge; i++) s += zeichen[Math.floor(Math.random() * zeichen.length)];
  return s;
}

export class Signal {
  #ws = null;
  #hoerer = new Set();
  #herz = 0;

  /** @param id eigene Kennung beim Vermittler (Buchstaben, Ziffern, „-“) */
  constructor(id, adresse = vermittlerAdresse()) {
    this.id = id;
    this.adresse = adresse;
    this.offen = false;
  }

  /** Verbinden; erfüllt bei OPEN, scheitert bei ID-TAKEN/ERROR/Zeitüberschreitung. */
  verbinden(timeoutMs = 12000) {
    return new Promise((erfuellen, ablehnen) => {
      const trenner = this.adresse.includes('?') ? '&' : '?';
      let ws;
      try {
        ws = new WebSocket(`${this.adresse}${trenner}id=${encodeURIComponent(this.id)}&token=${zufall(12)}&version=1.5.4`);
      } catch {
        return ablehnen(new Error('Vermittlungsdienst nicht erreichbar'));
      }
      this.#ws = ws;
      const timer = setTimeout(() => {
        ablehnen(new Error('Vermittlungsdienst antwortet nicht – Internetverbindung prüfen'));
        ws.close();
      }, timeoutMs);
      ws.addEventListener('message', (e) => {
        let n;
        try {
          n = JSON.parse(e.data);
        } catch {
          return;
        }
        if (!this.offen) {
          clearTimeout(timer);
          if (n.type === 'OPEN') {
            this.offen = true;
            this.#herz = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send('{"type":"HEARTBEAT"}'), HERZSCHLAG_MS);
            return erfuellen(this);
          }
          ablehnen(new Error(n.type === 'ID-TAKEN' ? 'Dieser Einladungscode ist gerade schon vergeben' : `Vermittlungsdienst: ${n.payload?.msg ?? n.type}`));
          return ws.close();
        }
        for (const h of [...this.#hoerer]) h(n);
      });
      ws.addEventListener('close', () => {
        clearTimeout(timer);
        clearInterval(this.#herz);
        const warOffen = this.offen;
        this.offen = false;
        if (!warOffen) ablehnen(new Error('Vermittlungsdienst nicht erreichbar'));
        for (const h of [...this.#hoerer]) h({ type: 'GESCHLOSSEN' });
      });
    });
  }

  senden(dst, type, payload) {
    if (this.#ws?.readyState === WebSocket.OPEN) this.#ws.send(JSON.stringify({ type, dst, payload }));
  }

  /** fn({ type, src, payload }) – @returns abmelden() */
  beiNachricht(fn) {
    this.#hoerer.add(fn);
    return () => this.#hoerer.delete(fn);
  }

  schliessen() {
    clearInterval(this.#herz);
    this.offen = false;
    try {
      this.#ws?.close();
    } catch {
      /* egal */
    }
  }
}

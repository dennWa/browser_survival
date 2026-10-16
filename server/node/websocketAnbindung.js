import { WebSocketServer, WebSocket } from 'ws';

/**
 * Verbindet echte WebSockets mit dem SpielServer.
 * Jeder Socket wird in die Text-Kanal-Schnittstelle übersetzt (siehe server/spiel/netz/speicherKanal.js).
 */
const MAX_NACHRICHT_BYTES = 16 * 1024;
/** Hängt ein Client so weit hinterher, werden Nachrichten verworfen statt den Speicher zu füllen. */
const MAX_PUFFER_BYTES = 1024 * 1024;
const HERZSCHLAG_MS = 15000;

export function bindeWebsocketServer(httpServer, spielServer, { pfad = '/ws' } = {}) {
  const wss = new WebSocketServer({ server: httpServer, path: pfad, maxPayload: MAX_NACHRICHT_BYTES });

  wss.on('connection', (socket, anfrage) => {
    socket.lebt = true;
    socket.on('pong', () => (socket.lebt = true));
    socket.on('error', () => {}); // Fehler führen ohnehin zu 'close'
    spielServer.verbindungHinzufuegen(socketZuKanal(socket), { adresse: anfrage.socket.remoteAddress });
  });

  // Herzschlag: tote Verbindungen (z. B. WLAN weg) erkennen und aufräumen
  const herzschlag = setInterval(() => {
    for (const socket of wss.clients) {
      if (!socket.lebt) {
        socket.terminate();
        continue;
      }
      socket.lebt = false;
      socket.ping();
    }
  }, HERZSCHLAG_MS);
  wss.on('close', () => clearInterval(herzschlag));

  return wss;
}

function socketZuKanal(socket) {
  return {
    senden(text) {
      if (socket.readyState !== WebSocket.OPEN || socket.bufferedAmount > MAX_PUFFER_BYTES) return;
      socket.send(text);
    },
    beiNachricht(hoerer) {
      socket.on('message', (daten, istBinaer) => {
        if (!istBinaer) hoerer(daten.toString());
      });
    },
    beiTrennung(hoerer) {
      socket.once('close', (_code, grund) => hoerer(grund?.toString() || 'Verbindung getrennt'));
    },
    trennen(grund = 'Verbindung getrennt') {
      // Close-Grund darf max. 123 Bytes haben
      socket.close(1000, Buffer.from(grund).subarray(0, 120).toString());
    },
  };
}

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
  const wss = new WebSocketServer({
    server: httpServer,
    path: pfad,
    maxPayload: MAX_NACHRICHT_BYTES,
    // Kompression (permessage-deflate, kann jeder Browser): Schnappschüsse sind JSON und schrumpfen auf ~1/5
    // (gemessen: 4,4 KB → 0,9 KB). Stufe 1 = schnell; der Server behält den Wörterbuch-Kontext (ähnliche
    // Nachrichten → noch kleiner), Client-Nachrichten sind winzig → dort ohne Kontext (spart Speicher).
    perMessageDeflate: {
      zlibDeflateOptions: { level: 1, memLevel: 8 },
      clientNoContextTakeover: true,
      threshold: 256,
      concurrencyLimit: 10,
    },
  });

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

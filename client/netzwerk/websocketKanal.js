/**
 * Öffnet einen WebSocket und liefert ihn als Text-Kanal (gleiche Schnittstelle wie der Speicher-Kanal).
 * @returns {Promise<Kanal>} erfüllt, sobald die Verbindung steht
 */
export function oeffneWebsocketKanal(adresse, timeoutMs = 5000) {
  return new Promise((erfuellen, ablehnen) => {
    let socket;
    try {
      socket = new WebSocket(adresse);
    } catch {
      ablehnen(new Error('Ungültige Serveradresse'));
      return;
    }

    const nachrichtHoerer = [];
    const trennHoerer = [];
    let geoeffnet = false;
    const timer = setTimeout(() => socket.close(), timeoutMs);

    const kanal = {
      senden(text) {
        if (socket.readyState === WebSocket.OPEN) socket.send(text);
      },
      beiNachricht(hoerer) {
        nachrichtHoerer.push(hoerer);
      },
      beiTrennung(hoerer) {
        trennHoerer.push(hoerer);
      },
      trennen(grund = 'Abgemeldet') {
        socket.close(1000, grund);
      },
    };

    socket.addEventListener('open', () => {
      geoeffnet = true;
      clearTimeout(timer);
      erfuellen(kanal);
    });
    socket.addEventListener('message', (ereignis) => {
      if (typeof ereignis.data === 'string') for (const hoerer of nachrichtHoerer) hoerer(ereignis.data);
    });
    socket.addEventListener('close', (ereignis) => {
      clearTimeout(timer);
      if (!geoeffnet) {
        ablehnen(new Error('Server nicht erreichbar'));
        return;
      }
      for (const hoerer of trennHoerer) hoerer(ereignis.reason || 'Verbindung zum Server verloren');
    });
  });
}

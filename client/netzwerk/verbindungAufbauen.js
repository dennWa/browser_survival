import { JsonVerbindung } from './jsonVerbindung.js';
import { oeffneWebsocketKanal } from './websocketKanal.js';
import { oeffneLokalenKanal, oeffneTutorialKanal } from './lokalerServer.js';

/**
 * Fabrik: baut je nach Servereintrag die passende Verbindung.
 * Neuer Transport (z. B. WebRTC)? → hier ergänzen, sonst nirgends.
 */
export async function verbindungAufbauen(serverEintrag, adresse) {
  if (serverEintrag.typ === 'lokal') {
    return new JsonVerbindung(oeffneLokalenKanal(), 'Lokal');
  }
  if (serverEintrag.typ === 'tutorial') {
    return new JsonVerbindung(oeffneTutorialKanal(), 'Tutorial');
  }
  if (serverEintrag.typ === 'websocket') {
    const ziel = adresse || serverEintrag.adresse;
    if (!ziel) throw new Error('Bitte eine Serveradresse angeben');
    return new JsonVerbindung(await oeffneWebsocketKanal(ziel), ziel);
  }
  throw new Error(`Unbekannter Servertyp: ${serverEintrag.typ}`);
}

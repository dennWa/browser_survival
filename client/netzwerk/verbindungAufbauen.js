import { JsonVerbindung } from './jsonVerbindung.js';
import { oeffneWebsocketKanal } from './websocketKanal.js';
import { oeffneHostKanal, oeffneLokalenKanal, oeffneTutorialKanal } from './lokalerServer.js';
import { verbindeMitHost } from './p2p.js';

/**
 * Fabrik: baut je nach Servereintrag die passende Verbindung.
 * Neuer Transport (z. B. WebRTC)? → hier ergänzen, sonst nirgends.
 */
export async function verbindungAufbauen(serverEintrag, adresse, { slot = null, passwort = '', hostName = null, beiHostStatus = null } = {}) {
  // Runde 47: selbst hosten (Server im Tab, Freunde per WebRTC) bzw. einem Host per Einladungscode beitreten
  if (serverEintrag.typ === 'host') {
    return new JsonVerbindung(await oeffneHostKanal(serverEintrag.welt, { hostName, beiStatus: beiHostStatus }), `Host ${serverEintrag.welt.code}`);
  }
  if (serverEintrag.typ === 'p2p') {
    const code = adresse || serverEintrag.code;
    if (!code) throw new Error('Bitte einen Einladungscode eingeben');
    return new JsonVerbindung(await verbindeMitHost(code, passwort), `Code ${code}`);
  }
  if (serverEintrag.typ === 'lokal') {
    return new JsonVerbindung(await oeffneLokalenKanal(slot), 'Lokal');
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

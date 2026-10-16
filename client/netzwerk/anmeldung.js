import { NACHRICHT } from '../../gemeinsam/protokoll.js';
import { PROTOKOLL_VERSION } from '../../gemeinsam/konstanten.js';

/**
 * Login-Ablauf: ANMELDEN senden, auf ANMELDUNG_OK oder ANMELDUNG_FEHLER warten.
 * @returns {Promise<object>} Inhalt von ANMELDUNG_OK (Karte, Spieler-ID, Physik, Gegenstände …)
 */
export function anmelden(verbindung, { benutzername, passwort, gast = false, aussehen = null }, timeoutMs = 8000) {
  return new Promise((erfuellen, ablehnen) => {
    const aufraeumen = () => {
      clearTimeout(timer);
      abmeldenNachricht();
      abmeldenTrennung();
    };
    const abmeldenNachricht = verbindung.beiNachricht((nachricht) => {
      if (nachricht.typ === NACHRICHT.ANMELDUNG_OK) {
        aufraeumen();
        erfuellen(nachricht);
      } else if (nachricht.typ === NACHRICHT.ANMELDUNG_FEHLER) {
        aufraeumen();
        ablehnen(new Error(nachricht.grund));
      }
    });
    const abmeldenTrennung = verbindung.beiTrennung((grund) => {
      aufraeumen();
      ablehnen(new Error(grund));
    });
    const timer = setTimeout(() => {
      aufraeumen();
      ablehnen(new Error('Server antwortet nicht'));
    }, timeoutMs);

    verbindung.senden({ typ: NACHRICHT.ANMELDEN, benutzername, passwort, gast, aussehen, protokoll: PROTOKOLL_VERSION });
  });
}

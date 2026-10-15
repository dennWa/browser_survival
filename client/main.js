import { SERVER_LISTE, DEBUG_START } from './konfiguration.js';
import { Renderer } from './darstellung/renderer.js';
import { Eingabe } from './kern/eingabe.js';
import { ClientSpiel } from './kern/clientSpiel.js';
import { verbindungAufbauen } from './netzwerk/verbindungAufbauen.js';
import { anmelden } from './netzwerk/anmeldung.js';
import { LoginBildschirm } from './ui/loginBildschirm.js';
import { Hud } from './ui/hud.js';

/**
 * Einstiegspunkt des Clients. Verdrahtet nur die Bausteine – keine Spiellogik hier.
 *
 * Ablauf:  Login-Bildschirm → Verbindung aufbauen → Anmelden → ClientSpiel läuft
 *          → bei Trennung/Abmelden zurück zum Login
 */
const leinwand = document.getElementById('spielflaeche');
const renderer = new Renderer(leinwand);
const eingabe = new Eingabe(window, leinwand);
const login = new LoginBildschirm(document, SERVER_LISTE);
const hud = new Hud(document, { debug: DEBUG_START });

let aktuellesSpiel = null;

eingabe.beiTaste('debug', () => hud.debugUmschalten());
hud.beiAbmelden(() => aktuellesSpiel?.beenden('Abgemeldet'));

login.beiAnmeldung(async ({ server, adresse, benutzername, passwort }) => {
  login.setzeBeschaeftigt(true);
  let verbindung = null;
  try {
    verbindung = await verbindungAufbauen(server, adresse);
    const anmeldeDaten = await anmelden(verbindung, { benutzername, passwort });
    spielStarten(verbindung, anmeldeDaten);
  } catch (fehler) {
    if (verbindung && !verbindung.getrennt) verbindung.trennen('Login abgebrochen');
    login.anzeigen(fehler.message);
  }
});

function spielStarten(verbindung, anmeldeDaten) {
  login.verbergen();
  hud.anzeigen();
  eingabe.aktiv = true;
  leinwand.focus();
  aktuellesSpiel = new ClientSpiel({
    verbindung,
    anmeldeDaten,
    eingabe,
    renderer,
    hud,
    beiEnde: (grund) => {
      aktuellesSpiel = null;
      eingabe.aktiv = false;
      eingabe.zuruecksetzen();
      hud.verbergen();
      renderer.leeren();
      login.anzeigen(grund === 'Abgemeldet' ? '' : grund);
    },
  });
}

renderer.leeren();
login.anzeigen();

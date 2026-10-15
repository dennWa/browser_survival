import { SERVER_LISTE, DEBUG_START } from './konfiguration.js';
import { Renderer } from './darstellung/renderer.js';
import { ladeAssets } from './darstellung/assets.js';
import { Eingabe } from './kern/eingabe.js';
import { ClientSpiel } from './kern/clientSpiel.js';
import { verbindungAufbauen } from './netzwerk/verbindungAufbauen.js';
import { anmelden } from './netzwerk/anmeldung.js';
import { LoginBildschirm } from './ui/loginBildschirm.js';
import { Hud } from './ui/hud.js';
import { zeigeCredits } from './ui/credits.js';

/**
 * Einstiegspunkt des Clients. Verdrahtet nur die Bausteine – keine Spiellogik hier.
 *
 * Ablauf:  Grafiken laden → Login-Bildschirm → Verbindung aufbauen → Anmelden → ClientSpiel läuft
 *          → bei Trennung/Abmelden zurück zum Login
 */
const leinwand = document.getElementById('spielflaeche');
const renderer = new Renderer(leinwand);
const eingabe = new Eingabe(window, leinwand);
const login = new LoginBildschirm(document, SERVER_LISTE);
const hud = new Hud(document, { debug: DEBUG_START });

let aktuellesSpiel = null;
let assets = null;

eingabe.beiTaste('debug', () => hud.debugUmschalten());
eingabe.beiTaste('aufheben', () => aktuellesSpiel?.aufheben());
eingabe.beiTaste('nachladen', () => aktuellesSpiel?.nachladen());
eingabe.beiSlotTaste((slot) => aktuellesSpiel?.benutzen(slot));
hud.beiAbmelden(() => aktuellesSpiel?.beenden('Abgemeldet'));
hud.beiAktionen({
  aufheben: () => aktuellesSpiel?.aufheben(),
  nachladen: () => aktuellesSpiel?.nachladen(),
  benutzen: (slot) => aktuellesSpiel?.benutzen(slot),
  ablegen: (slot) => aktuellesSpiel?.ablegen(slot),
});
document.getElementById('credits-knopf').addEventListener('click', () => zeigeCredits(document, assets));

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
  eingabe.aktiv = true;
  hud.anzeigen(eingabe.touch.istTouchGeraet);
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
      hud.verbergen();
      renderer.leeren();
      login.anzeigen(grund === 'Abgemeldet' ? '' : grund);
    },
  });
}

async function starten() {
  renderer.leeren();
  const ladeBildschirm = document.getElementById('laden');
  const fuellung = document.getElementById('ladebalken-fuellung');
  try {
    assets = await ladeAssets((anteil) => (fuellung.style.width = `${Math.round(anteil * 100)}%`));
    renderer.setzeAssets(assets);
    hud.setzeAssets(assets);
  } catch (fehler) {
    // Ohne Grafiken läuft das Spiel mit Platzhalter-Formen weiter
    console.warn('[Assets] Laden fehlgeschlagen:', fehler);
  }
  ladeBildschirm.hidden = true;
  login.anzeigen();
}

starten();

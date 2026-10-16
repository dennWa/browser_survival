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
import { Sound } from './audio/sound.js';
import { lokalerServer } from './netzwerk/lokalerServer.js';
import { NACHRICHT } from '../gemeinsam/protokoll.js';

/**
 * Einstiegspunkt des Clients. Verdrahtet nur die Bausteine – keine Spiellogik hier.
 *
 * Ablauf:  Grafiken + 3D-Figuren laden → Login-Bildschirm → Verbindung aufbauen → Anmelden
 *          → ClientSpiel läuft → bei Trennung/Abmelden zurück zum Login
 *
 * Grafik: Three.js (WebGL). Das 2D-Canvas #spielflaeche liegt durchsichtig darüber (Eingaben, Namen, Vignette).
 */
const leinwand = document.getElementById('spielflaeche');
let renderer = null;
const eingabe = new Eingabe(window, leinwand);
const login = new LoginBildschirm(document, SERVER_LISTE);
const hud = new Hud(document, { debug: DEBUG_START });
const sound = new Sound();
hud.zeigeTon(sound.stumm);

let aktuellesSpiel = null;
let assets = null;

eingabe.beiTaste('debug', () => hud.debugUmschalten());
eingabe.beiTaste('licht', () => aktuellesSpiel?.licht());
eingabe.beiTaste('tuer', () => aktuellesSpiel?.tuer());
eingabe.beiTaste('wiederbeleben', () => aktuellesSpiel?.wiederbeleben());
eingabe.beiTaste('admin', () => hud.adminMenuUmschalten());
eingabe.beiTaste('aufheben', () => aktuellesSpiel?.interagieren());
eingabe.beiTaste('menue', () => aktuellesSpiel?.menuesSchliessen());
eingabe.beiTaste('karte', () => aktuellesSpiel?.karteUmschalten());
eingabe.beiTaste('nachladen', () => aktuellesSpiel?.nachladen());
eingabe.beiSlotTaste((slot) => aktuellesSpiel?.benutzen(slot));
hud.beiAbmelden(() => aktuellesSpiel?.beenden('Abgemeldet'));
const tonUmschalten = () => {
  sound.entsperren();
  hud.zeigeTon(sound.umschalten());
};
hud.beiTon(tonUmschalten);
eingabe.beiTaste('ton', tonUmschalten);
hud.beiAktionen({
  aufheben: () => aktuellesSpiel?.aufheben(),
  nachladen: () => aktuellesSpiel?.nachladen(),
  benutzen: (slot) => aktuellesSpiel?.benutzen(slot),
  ablegen: (slot) => aktuellesSpiel?.ablegen(slot),
  licht: () => aktuellesSpiel?.licht(),
  tuer: () => aktuellesSpiel?.tuer(),
  interagieren: () => aktuellesSpiel?.interagieren(),
  karte: () => aktuellesSpiel?.karteUmschalten(),
  entwicklerAbfragen: () => aktuellesSpiel?.entwickler(NACHRICHT.DEV_ABFRAGEN),
  entwicklerSetzen: (werte) => aktuellesSpiel?.entwickler(NACHRICHT.DEV_SETZEN, { werte }),
  entwicklerZuruecksetzen: () => aktuellesSpiel?.entwickler(NACHRICHT.DEV_ZURUECKSETZEN),
  herstellen: (rezept) => aktuellesSpiel?.herstellen(rezept),
  werkbankSchliessen: () => aktuellesSpiel?.werkbankUmschalten(false),
  wiederbeleben: () => aktuellesSpiel?.wiederbeleben(),
  admin: (befehl) => aktuellesSpiel?.admin(befehl),
  // Nachtsicht: Dunkelheit im Renderer aus – rein optisch, daher nur im Admin-Menü
  nachtsicht: () => renderer && hud.setzeNachtsicht(renderer.nachtsichtUmschalten()),
});
// Für Neugierige & Tests: in der Browser-Konsole `browserSurvival.spiel` bzw. `.server` (nur Lokal-Modus)
window.browserSurvival = {
  get spiel() {
    return aktuellesSpiel;
  },
  get server() {
    return lokalerServer();
  },
};
document.getElementById('credits-knopf').addEventListener('click', () => zeigeCredits(document, assets));

login.beiAnmeldung(async ({ server, adresse, benutzername, passwort }) => {
  sound.entsperren(); // Klick auf "Login" = Nutzeraktion → Browser erlaubt ab jetzt Ton
  if (!renderer) {
    login.zeigeMeldung('Dein Browser kann keine 3D-Grafik (WebGL) – leider geht es ohne nicht.', true);
    return;
  }
  login.setzeBeschaeftigt(true);
  let verbindung = null;
  try {
    verbindung = await verbindungAufbauen(server, adresse);
    const anmeldeDaten = await anmelden(verbindung, { benutzername, passwort });
    spielStarten(verbindung, anmeldeDaten, benutzername);
  } catch (fehler) {
    if (verbindung && !verbindung.getrennt) verbindung.trennen('Login abgebrochen');
    login.anzeigen(fehler.message);
  }
});

function spielStarten(verbindung, anmeldeDaten, benutzername) {
  if (renderer.nachtsicht) renderer.nachtsichtUmschalten(); // Nachtsicht aus der letzten Runde zurücksetzen
  renderer.anzeigen();
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
    sound,
    benutzername,
    beiEnde: (grund) => {
      aktuellesSpiel = null;
      eingabe.aktiv = false;
      hud.verbergen();
      renderer.verbergen();
      login.anzeigen(grund === 'Abgemeldet' ? '' : grund);
    },
  });
}

async function starten() {
  const ladeBildschirm = document.getElementById('laden');
  const fuellung = document.getElementById('ladebalken-fuellung');
  const ladeText = document.getElementById('lade-text');
  try {
    assets = await ladeAssets((anteil) => (fuellung.style.width = `${Math.round(anteil * 80)}%`));
    hud.setzeAssets(assets);
  } catch (fehler) {
    console.warn('[Assets] Laden fehlgeschlagen:', fehler);
  }
  let fehlerText = '';
  try {
    ladeText.textContent = 'Lade 3D-Figuren …';
    renderer = await Renderer.erstelle(leinwand, assets);
    renderer.verbergen();
    fuellung.style.width = '100%';
  } catch (fehler) {
    console.warn('[3D] nicht verfügbar:', fehler);
    fehlerText = 'Dein Browser kann keine 3D-Grafik (WebGL) – leider geht es ohne nicht.';
  }
  ladeBildschirm.hidden = true;
  login.anzeigen(fehlerText);
}

starten();

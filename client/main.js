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

/**
 * Einstiegspunkt des Clients. Verdrahtet nur die Bausteine – keine Spiellogik hier.
 *
 * Ablauf:  Grafiken laden → Login-Bildschirm → (3D: Prototyp nachladen) → Verbindung aufbauen → Anmelden
 *          → ClientSpiel läuft → bei Trennung/Abmelden zurück zum Login
 *
 * Renderer: 2D (Standard) oder 3D-Prototyp – gleiche Schnittstelle. Der 3D-Teil (inkl. Three.js) wird
 * erst geladen, wenn jemand im Login "3D" wählt.
 */
const leinwand = document.getElementById('spielflaeche');
const renderer2d = new Renderer(leinwand);
let renderer3d = null;
let aktiverRenderer = renderer2d;
const eingabe = new Eingabe(window, leinwand);
const login = new LoginBildschirm(document, SERVER_LISTE);
const hud = new Hud(document, { debug: DEBUG_START });
const sound = new Sound();
hud.zeigeTon(sound.stumm);

let aktuellesSpiel = null;
let assets = null;

eingabe.beiTaste('debug', () => hud.debugUmschalten());
eingabe.beiTaste('licht', () => aktuellesSpiel?.licht());
eingabe.beiTaste('wiederbeleben', () => aktuellesSpiel?.wiederbeleben());
eingabe.beiTaste('admin', () => hud.adminMenuUmschalten());
eingabe.beiTaste('aufheben', () => aktuellesSpiel?.aufheben());
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
  wiederbeleben: () => aktuellesSpiel?.wiederbeleben(),
  admin: (befehl) => aktuellesSpiel?.admin(befehl),
  // Nachtsicht: Dunkelheit im Renderer aus – rein optisch, daher nur im Admin-Menü
  nachtsicht: () => hud.setzeNachtsicht(!aktiverRenderer.lichtUmschalten()),
});
document.getElementById('credits-knopf').addEventListener('click', () => zeigeCredits(document, assets));

login.beiAnmeldung(async ({ server, adresse, benutzername, passwort, grafik }) => {
  sound.entsperren(); // Klick auf "Login" = Nutzeraktion → Browser erlaubt ab jetzt Ton
  login.setzeBeschaeftigt(true);
  let verbindung = null;
  try {
    const renderer = await waehleRenderer(grafik);
    verbindung = await verbindungAufbauen(server, adresse);
    const anmeldeDaten = await anmelden(verbindung, { benutzername, passwort });
    spielStarten(verbindung, anmeldeDaten, renderer);
  } catch (fehler) {
    if (verbindung && !verbindung.getrennt) verbindung.trennen('Login abgebrochen');
    login.anzeigen(fehler.message);
  }
});

/** 3D-Prototyp bei Bedarf nachladen; klappt das nicht (z. B. kein WebGL), geht's in 2D weiter. */
async function waehleRenderer(grafik) {
  if (grafik !== '3d') {
    renderer3d?.verbergen();
    return renderer2d;
  }
  try {
    if (!renderer3d) {
      login.zeigeMeldung('Lade 3D-Prototyp …');
      const { Renderer3D } = await import('./darstellung3d/renderer3d.js');
      renderer3d = await Renderer3D.erstelle(leinwand, assets);
    }
    renderer3d.anzeigen();
    return renderer3d;
  } catch (fehler) {
    console.warn('[3D] nicht verfügbar:', fehler);
    login.zeigeMeldung('3D nicht verfügbar – spiele in 2D', true);
    return renderer2d;
  }
}

function spielStarten(verbindung, anmeldeDaten, renderer) {
  aktiverRenderer = renderer;
  if (renderer.lichtAn === false) renderer.lichtUmschalten(); // Nachtsicht aus der letzten Runde zurücksetzen
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
    beiEnde: (grund) => {
      aktuellesSpiel = null;
      eingabe.aktiv = false;
      hud.verbergen();
      renderer3d?.verbergen();
      renderer2d.leeren();
      login.anzeigen(grund === 'Abgemeldet' ? '' : grund);
    },
  });
}

async function starten() {
  renderer2d.leeren();
  const ladeBildschirm = document.getElementById('laden');
  const fuellung = document.getElementById('ladebalken-fuellung');
  try {
    assets = await ladeAssets((anteil) => (fuellung.style.width = `${Math.round(anteil * 100)}%`));
    renderer2d.setzeAssets(assets);
    hud.setzeAssets(assets);
  } catch (fehler) {
    // Ohne Grafiken läuft das Spiel mit Platzhalter-Formen weiter
    console.warn('[Assets] Laden fehlgeschlagen:', fehler);
  }
  ladeBildschirm.hidden = true;
  login.anzeigen();
}

starten();

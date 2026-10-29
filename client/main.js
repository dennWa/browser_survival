import { SERVER_LISTE, DEBUG_START } from './konfiguration.js';
import { Renderer } from './darstellung/renderer.js';
import { ladeAssets } from './darstellung/assets.js';
import { Eingabe } from './kern/eingabe.js';
import { ClientSpiel } from './kern/clientSpiel.js';
import { verbindungAufbauen } from './netzwerk/verbindungAufbauen.js';
import { anmelden } from './netzwerk/anmeldung.js';
import { konsolenHelfer } from './kern/konsolenHelfer.js';
import { LoginBildschirm, gastName } from './ui/loginBildschirm.js';
import { Hud } from './ui/hud.js';
import { zeigeCredits } from './ui/credits.js';
import { ladeUiIcons } from './ui/uiIcons.js';
import { Sound } from './audio/sound.js';
import { ZonenMusik } from './audio/zonenMusik.js';
import { lokalerServer, setzeTestKarten, beendeTutorial, tutorialServerInstanz } from './netzwerk/lokalerServer.js';
import { TutorialAnzeige, tutorialGeschafft } from './ui/tutorialAnzeige.js';
import { KAPITEL } from '../server/spiel/tutorial/skript.js';
import { ladeEditorTest, zeigeTestBanner, istVonAudio, zeigeAudioBanner } from './ui/editorTest.js';
import { starteDebugLauf } from './debug/debugLauf.js';
import { AKTIONEN, NACHRICHT } from '../gemeinsam/protokoll.js';
import { EgoModus } from './ego/egoModus.js'; // EGO-PROTOTYP (siehe EGO_PROTOTYP.md)
import { Welt } from '../gemeinsam/welt/welt.js';
import { Karte } from './ui/karte.js';

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
ladeUiIcons(); // Runde 23: Icon-Sprite (game-icons.net) für HUD/Inventar
const eingabe = new Eingabe(window, leinwand);
eingabe.klickGesperrt = () => !!aktuellesSpiel?.fensterOffen(); // Klick ins Spiel bei offenem Fenster schießt nicht
// Touch-Gesten: zwei Finger = Zoom, Tippen = Zombie anvisieren
eingabe.touch.beiZoom = (faktor) => renderer?.zoomen(faktor);
eingabe.touch.beiTipp = (x, y) => aktuellesSpiel?.weltKlick(x, y) || aktuellesSpiel?.zielAntippen(x, y);
eingabe.weltKlick = (x, y) => !!aktuellesSpiel?.weltKlick(x, y); // Runde 23: Admin-Klickmodus (Bots)
// Rechtsklick bricht das Aufstellen (Platzier-Modus) ab
leinwand.addEventListener('contextmenu', () => aktuellesSpiel?.rechtsklick());
// Mausrad: rein-/rauszoomen (nur im Spiel)
leinwand.addEventListener(
  'wheel',
  (e) => {
    if (!aktuellesSpiel || !renderer) return;
    e.preventDefault();
    renderer.zoomen(Math.exp(Math.max(-1, Math.min(1, e.deltaY / 300)) * 0.35));
  },
  { passive: false },
);
const login = new LoginBildschirm(document, SERVER_LISTE);
const hud = new Hud(document, { debug: DEBUG_START });
hud.inventar.figurQuelle = () => ({ aussehen: aktuellesSpiel?.eigeneDaten?.aussehen, name: aktuellesSpiel?.benutzername }); // Inventar-Charakter
const sound = new Sound();
const musik = new ZonenMusik(sound); // Zonen-Musik aus client/musik/<zone>/ (läuft über Zonenwechsel weiter)
// Phase 10.2 (Audio-Zentrale): Klick-Sound für Knöpfe (nicht für Aktionsknöpfe im Spiel), Inventar auf/zu, Hauptmenü-Musik
document.addEventListener('click', (e) => {
  const knopf = e.target.closest?.('button');
  if (knopf && !knopf.id.startsWith('knopf-') && knopf.id !== 'hud-licht') sound.spiele('ui_klick');
}, true);
hud.inventar.beiUmschalten = (offen) => sound.spiele(offen ? 'inventar_auf' : 'inventar_zu');
// Tutorial (TUTORIAL_KONZEPT.md): eigene Zone, lokal; am Ende „Story jetzt starten?“
let storyNachTutorial = false;
const tutorial = new TutorialAnzeige(document, {
  holeAusgang: () => sound.klangAusgang(),
  beiEnde: (story) => {
    storyNachTutorial = story;
    aktuellesSpiel?.beenden('Abgemeldet');
  },
});
tutorial.kapitelNamen = KAPITEL.map((k) => k.titel);
/** Hauptmenü-Musik (client/musik/hauptmenue/) – Browser spielen Ton erst nach der ersten Berührung/Taste */
const hauptmenueMusik = () => {
  if (aktuellesSpiel || new URLSearchParams(location.search).has('editorTest')) return;
  sound.entsperren();
  musik.setzeZone('hauptmenue');
};
for (const art of ['pointerdown', 'keydown']) window.addEventListener(art, hauptmenueMusik, { once: true, passive: true });
hud.zeigeTon(sound.stumm);
hud.einstellungen.verbinde({ sound, renderer: () => renderer });
hud.einstellungen.verbindeHandy({ hud, touch: eingabe.touch });

let aktuellesSpiel = null;
new EgoModus({ eingabe, leinwand, holeRenderer: () => renderer, holeSpiel: () => aktuellesSpiel }); // EGO-PROTOTYP: Taste C
let assets = null;

eingabe.beiTaste('debug', () => hud.debugUmschalten());
eingabe.beiTaste('licht', () => aktuellesSpiel?.licht());
eingabe.beiTaste('tuer', () => aktuellesSpiel?.tuer());
eingabe.beiTaste('wiederbeleben', () => aktuellesSpiel?.wiederbeleben());
eingabe.beiTaste('admin', () => hud.adminMenuUmschalten());
eingabe.beiTaste('aufheben', () => aktuellesSpiel?.interagieren());
eingabe.beiTaste('menue', () => {
  // Tutorial: Esc schließt erst offene Fenster, sonst Pause-Dialog (überspringen/beenden)
  if (tutorial.aktiv && (tutorial.dialogOffen || !aktuellesSpiel?.etwasOffen())) return tutorial.pause();
  aktuellesSpiel?.menuesSchliessen();
});
eingabe.beiTaste('karte', () => aktuellesSpiel?.karteUmschalten());
eingabe.beiTaste('inventar', () => aktuellesSpiel && !aktuellesSpiel.tabTaste() && hud.inventar.zeige()); // hinter dem Auto: Kofferraum
eingabe.beiTaste('skills', () => aktuellesSpiel && hud.skills.zeige());
eingabe.beiTaste('fallenlassen', () => aktuellesSpiel?.fallenlassen(hud.inventar.platzUnterMaus));
eingabe.beiTaste('chat', () => aktuellesSpiel && hud.chatOeffnen());
eingabe.beiTaste('spielerliste', () => aktuellesSpiel && hud.spielerlisteUmschalten(aktuellesSpiel.spielerStatistik()));
eingabe.beiTaste('nachladen', () => aktuellesSpiel?.nachladen());
eingabe.beiTaste('kofferraum', () => aktuellesSpiel?.kofferraum());
eingabe.beiTaste('sitzen', () => aktuellesSpiel?.sitzen());
eingabe.beiTaste('bauen', () => aktuellesSpiel?.bauUmschalten(eingabe.sprint())); // Umschalt+B (Admin): Flugmodus
eingabe.beiTaste('abriss', () => aktuellesSpiel?.bauAbriss());
eingabe.beiTaste('gebiet', () => aktuellesSpiel?.bauGebiet());
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
  angeln: () => aktuellesSpiel?.angeln(),
  benutzen: (slot) => aktuellesSpiel?.benutzen(slot),
  konsumieren: (slot) => aktuellesSpiel?.konsumieren(slot),
  ablegen: (slot) => aktuellesSpiel?.ablegen(slot),
  tauschen: (von, nach) => aktuellesSpiel?.tauschen(von, nach),
  rucksackAblegen: () => aktuellesSpiel?.rucksackAblegen(),
  anlegen: (slot) => aktuellesSpiel?.anlegen(slot),
  ausziehen: (stelle) => aktuellesSpiel?.ausziehen(stelle),
  zoomStufe: () => renderer?.naechsteZoomStufe(),
  skill: (name) => aktuellesSpiel?.skill(name),
  feld: () => aktuellesSpiel?.feldEntfernen(),
  bauen: () => aktuellesSpiel?.bauUmschalten(),
  autoLaufStopp: () => aktuellesSpiel?.autoLaufStoppen(),
  kisteLegen: (slot) => aktuellesSpiel?.kisteLegen(slot),
  kisteNehmen: (slot) => aktuellesSpiel?.kisteNehmen(slot),
  kisteSchliessen: () => aktuellesSpiel?.kisteSchliessen(),
  stationLegen: (slot) => aktuellesSpiel?.stationAktion(AKTIONEN.STATION_LEGEN, slot),
  stationNehmen: (platz) => aktuellesSpiel?.stationAktion(AKTIONEN.STATION_NEHMEN, platz),
  stationSchliessen: () => aktuellesSpiel?.stationSchliessen(),
  stationSitzen: () => aktuellesSpiel?.stationSitzen(),
  kochbuch: () => aktuellesSpiel?.kochbuch(), // Runde 24: Lagerfeuer → Rezepte der Kochstelle
  platzierenOk: () => aktuellesSpiel?.platzierungBestaetigen(),
  platzierenAbbrechen: () => aktuellesSpiel?.platzierungAbbrechen(),
  licht: () => aktuellesSpiel?.licht(),
  tuer: () => aktuellesSpiel?.tuer(),
  interagieren: () => aktuellesSpiel?.interagieren(),
  kofferraum: () => aktuellesSpiel?.kofferraum(),
  sitzen: () => aktuellesSpiel?.sitzen(),
  karte: () => aktuellesSpiel?.karteUmschalten(),
  chat: (text) => aktuellesSpiel?.chat(text),
  spielerliste: () => aktuellesSpiel && hud.spielerlisteUmschalten(aktuellesSpiel.spielerStatistik()),
  entwicklerAbfragen: () => aktuellesSpiel?.entwickler(NACHRICHT.DEV_ABFRAGEN),
  entwicklerSetzen: (werte) => aktuellesSpiel?.entwickler(NACHRICHT.DEV_SETZEN, { werte }),
  entwicklerZuruecksetzen: () => aktuellesSpiel?.entwickler(NACHRICHT.DEV_ZURUECKSETZEN),
  herstellen: (rezept) => aktuellesSpiel?.herstellen(rezept),
  reparieren: (slot) => aktuellesSpiel?.slotAktion(AKTIONEN.REPARIEREN, slot),
  modsAbnehmen: (slot) => aktuellesSpiel?.slotAktion(AKTIONEN.MODS_ABNEHMEN, slot),
  werkbankSchliessen: () => aktuellesSpiel?.werkbankUmschalten(false),
  wiederbeleben: () => aktuellesSpiel?.wiederbeleben(),
  admin: (befehl) => aktuellesSpiel?.admin(befehl),
  // Nachtsicht: Dunkelheit im Renderer aus – rein optisch, daher nur im Admin-Menü
  nachtsicht: () => renderer && hud.setzeNachtsicht(renderer.nachtsichtUmschalten()),
});
// Für Neugierige & Tests: in der Browser-Konsole `browserSurvival.spiel` bzw. `.server` (nur Lokal-Modus)
// Konsolen-Helfer (tp, gib, boden, zeit, ich …) siehe client/kern/konsolenHelfer.js
window.browserSurvival = {
  get spiel() {
    return aktuellesSpiel;
  },
  get server() {
    return tutorialServerInstanz() ?? lokalerServer();
  },
  sound, // Tests/Audio-Zentrale: sound.quelleVon('wind') → 'eigen' | 'sample' | 'synth'
  ...konsolenHelfer({ spiel: () => aktuellesSpiel, server: () => tutorialServerInstanz() ?? lokalerServer() }),
  tutorial,
};
document.getElementById('credits-knopf').addEventListener('click', () => zeigeCredits(document, assets));

/** Map-Editor-Test (client/?editorTest=1): Entwürfe als Zonen, Auto-Login lokal – siehe ui/editorTest.js */
const editorTest = await ladeEditorTest();
if (editorTest) setzeTestKarten(editorTest);

login.beiAnmeldung((daten) => anmeldungStarten(daten));
login.beiTutorial(({ aussehen }) => {
  storyNachTutorial = false;
  anmeldungStarten({ server: { id: 'tutorial', name: 'Tutorial', typ: 'tutorial' }, benutzername: 'Gast-0001', gast: true, aussehen });
});

async function anmeldungStarten({ server, adresse, benutzername, passwort, gast = false, aussehen = null }) {
  sound.entsperren(); // Klick auf "Login" = Nutzeraktion → Browser erlaubt ab jetzt Ton
  if (!renderer) {
    login.zeigeMeldung('Dein Browser kann keine 3D-Grafik (WebGL) – leider geht es ohne nicht.', true);
    return;
  }
  login.setzeBeschaeftigt(true);
  let verbindung = null;
  try {
    verbindung = await verbindungAufbauen(server, adresse);
    let anmeldeDaten;
    try {
      anmeldeDaten = await anmelden(verbindung, { benutzername, passwort, gast, aussehen });
    } catch (fehler) {
      // Gast schon online (z. B. zweiter Tab) → mit neuem Zufallsnamen nochmal
      if (!gast || !/bereits eingeloggt/.test(fehler.message)) throw fehler;
      if (!verbindung.getrennt) verbindung.trennen('Neuer Gastname');
      benutzername = gastName(true);
      verbindung = await verbindungAufbauen(server, adresse);
      anmeldeDaten = await anmelden(verbindung, { benutzername, passwort, gast, aussehen });
    }
    await spielStarten(verbindung, anmeldeDaten, benutzername, { tutorialZone: server.typ === 'tutorial' });
  } catch (fehler) {
    if (verbindung && !verbindung.getrennt) verbindung.trennen('Login abgebrochen');
    login.anzeigen(fehler.message);
  }
}

/**
 * Ins Spiel: Ladebildschirm zeigen, Welt aufbauen + Shader kompilieren, ein paar Frames aufwärmen lassen –
 * erst wenn es ruhig läuft, verschwindet der Ladebildschirm (sonst ruckeln die ersten Sekunden).
 * Auch beim Zonenwechsel (zone = Name der neuen Zone, seq = Eingabe-Zähler der alten Sitzung).
 */
async function spielStarten(verbindung, anmeldeDaten, benutzername, { zone = null, seq = 0, tutorialZone = false } = {}) {
  const vorab = []; // Nachrichten, die während des Ladens ankommen, gehen nicht verloren
  const vorabAbmelden = verbindung.beiNachricht((n) => vorab.push(n));
  let getrennt = null;
  const trennAbmelden = verbindung.beiTrennung((grund) => (getrennt = grund ?? 'Verbindung verloren'));
  const zurueckZumLogin = (grund) => {
    aktuellesSpiel = null;
    setTimeout(() => !aktuellesSpiel && musik.setzeZone('hauptmenue'), 0); // nach dem Stoppen der Zonen-Musik
    eingabe.aktiv = false;
    versteckeLaden();
    hud.verbergen();
    renderer.verbergen();
    if (tutorialZone) {
      tutorial.stoppe();
      beendeTutorial();
      login.empfehleTutorial(!tutorialGeschafft());
      const story = storyNachTutorial;
      storyNachTutorial = false;
      login.anzeigen('');
      if (story) login.starteStory();
      return;
    }
    login.anzeigen(grund === 'Abgemeldet' ? '' : grund);
  };
  eingabe.aktiv = false;
  const titel = zone ? `Unterwegs nach ${zone}` : tutorialZone ? 'Kreisklinik Hohenfeld' : 'Welt wird aufgebaut';
  zeigeLaden(`${titel} …`, 0);
  login.verbergen();
  await naechsterFrame();
  // Ladebildschirm: ALLES vorbereiten, was später ruckeln könnte – Karte (Boden, Wände, Bäume …) 0–80 %, Kartenbild,
  // dann setzeWelt (Texturen hochladen, Shader vorkompilieren) und Aufwärm-Frames bis es ruhig läuft (→ 100 %)
  const welt = new Welt(anmeldeDaten.karte);
  await renderer.bereiteVor(welt, (p) => zeigeLaden(`${titel} … Landschaft`, Math.round(p * 80)));
  zeigeLaden(`${titel} … Karte`, 82);
  await naechsterFrame();
  Karte.vorbereiten(welt, renderer.assets, Infinity);
  zeigeLaden(`${titel} … Grafik`, 86);
  await naechsterFrame();
  vorabAbmelden();
  trennAbmelden();
  if (getrennt) return zurueckZumLogin(getrennt);
  if (renderer.nachtsicht && !zone) renderer.nachtsichtUmschalten(); // Nachtsicht aus der letzten Runde zurücksetzen
  renderer.anzeigen();
  hud.anzeigen(eingabe.touch.istTouchGeraet);
  const spiel = new ClientSpiel({
    verbindung,
    anmeldeDaten,
    welt,
    eingabe,
    renderer,
    hud,
    sound,
    musik,
    benutzername,
    seq,
    vorabNachrichten: vorab,
    tutorial: tutorialZone ? tutorial : null,
    beiEnde: zurueckZumLogin,
    // Übergang betreten → diese Sitzung abräumen, neue Zone aufbauen (Verbindung bleibt dieselbe)
    beiZonenwechsel: (daten, alt) => {
      alt.uebergeben();
      spielStarten(verbindung, daten, benutzername, { zone: daten.zone ?? daten.karte?.name, seq: alt.seq });
    },
  });
  if (spiel.beendet) return; // während des Nachholens schon weitergezogen
  aktuellesSpiel = spiel;
  zeigeLaden(`${titel} … fast fertig`, 94);
  await renderer.warteBisRuhig();
  if (aktuellesSpiel !== spiel) return;
  versteckeLaden();
  eingabe.aktiv = true;
  leinwand.focus();
}

const ladeBildschirm = document.getElementById('laden');
function zeigeLaden(text, prozent) {
  ladeBildschirm.hidden = false;
  ladeBildschirm.classList.remove('weg');
  document.getElementById('lade-text').textContent = text;
  document.getElementById('ladebalken-fuellung').style.width = `${prozent}%`;
  document.getElementById('lade-prozent').textContent = `${Math.round(prozent)} %`;
}
function versteckeLaden() {
  ladeBildschirm.classList.add('weg'); // kurz ausblenden (CSS), dann weg
  setTimeout(() => {
    if (ladeBildschirm.classList.contains('weg')) ladeBildschirm.hidden = true;
  }, 350);
}
const naechsterFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

async function starten() {
  try {
    zeigeLaden('Lade Grafiken …', 0);
    assets = await ladeAssets((anteil) => zeigeLaden('Lade Grafiken …', Math.round(anteil * 80)));
    hud.setzeAssets(assets);
  } catch (fehler) {
    console.warn('[Assets] Laden fehlgeschlagen:', fehler);
  }
  let fehlerText = '';
  try {
    zeigeLaden('Lade 3D-Figuren …', 85);
    renderer = await Renderer.erstelle(leinwand, assets);
    renderer.verbergen();
    hud.inventar.vorschau.spielRenderer = renderer; // Charakter-Vorschau im Inventar (Runde 23)
    zeigeLaden('Fertig', 100);
  } catch (fehler) {
    console.warn('[3D] nicht verfügbar:', fehler);
    fehlerText = 'Dein Browser kann keine 3D-Grafik (WebGL) – leider geht es ohne nicht.';
  }
  ladeBildschirm.hidden = true;
  if (editorTest && !fehlerText) {
    // Editor-Test: direkt ins Spiel (lokal, Gast „Tester“), Banner mit Rückweg zum Editor
    zeigeTestBanner(document, editorTest);
    anmeldungStarten({ server: SERVER_LISTE.find((s) => s.typ === 'lokal'), benutzername: 'Gast-0001', gast: true });
    // Debug-Testlauf (Map-Editor 8.1): Zeitlupe, Pause, Schritte, Overlays – nur hier, nie online
    window.browserSurvival.debug = starteDebugLauf({ spiel: () => aktuellesSpiel, server: () => lokalerServer(), leinwand });
    return;
  }
  if (istVonAudio() && !fehlerText) {
    zeigeAudioBanner(document); // Audio-Zentrale ▶ Spiel starten: lokal als Gast, Rückweg im Banner
    anmeldungStarten({ server: SERVER_LISTE.find((s) => s.typ === 'lokal'), benutzername: 'Gast-0001', gast: true });
    return;
  }
  login.empfehleTutorial(!tutorialGeschafft());
  login.anzeigen(fehlerText);
}

starten();

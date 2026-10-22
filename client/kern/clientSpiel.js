import { AUFHEB_REICHWEITE, BETT_REICHWEITE, TICK_DAUER_MS, TICK_DAUER_S, WERKBANK_REICHWEITE } from '../../gemeinsam/konstanten.js';
import { ABBAU_REICHWEITE, RESSOURCEN_OBJEKTE } from '../../gemeinsam/welt/ressourcen.js';
import { BAUWERKE, BAUWERK_REICHWEITE, bauwerkAktion, feuerText, kachelInReichweite, pruefePlatz, samenZiel, zielKachel } from '../../gemeinsam/welt/bauwerke.js';
import { wurfZiel } from '../../gemeinsam/welt/wasser.js';
import { findePfad } from '../../gemeinsam/physik/pfadfindung.js';
import { tageszeit } from '../../gemeinsam/tageszeit.js';
import { AKTIONEN, NACHRICHT } from '../../gemeinsam/protokoll.js';
import { Welt } from '../../gemeinsam/welt/welt.js';
import { wendeEingabeAn } from '../../gemeinsam/physik/bewegung.js';
import { sichtlinieFrei } from '../../gemeinsam/physik/strahl.js';
import { EINSTIEG_ABSTAND, FAHRZEUG_MODELLE, abstandZumFahrzeug, fahrzeugKacheln, tempoZuKmh } from '../../gemeinsam/physik/fahrzeug.js';
import { lerp, lerpWinkel } from '../../gemeinsam/mathe.js';
import { INTERPOLATIONS_VERZOEGERUNG_MS, PING_INTERVALL_MS } from '../konfiguration.js';
import { Effekte } from '../darstellung/effekte.js';
import { SpielSchleife } from './spielSchleife.js';
import { Karte } from '../ui/karte.js';
import { BauModus } from './bauModus.js';
import { Klanglandschaft } from '../audio/klaenge.js';
import { Schritte } from '../audio/schritte.js';

/** Maximal gemerkte, vom Server noch nicht bestätigte Eingaben (~4 s). */
const MAX_OFFENE_EINGABEN = 120;
const STOEHN_REICHWEITE = 650; // Zombies in diesem Umkreis stöhnen gelegentlich
const STOEHN_PAUSE_MS = 900; // höchstens ein Stöhnen pro Pause (sonst Chor)
const ZOMBIE_TONHOEHE = { normal: 1, laeufer: 1.35, brocken: 0.7 };
const AUTOLAUF_ANKUNFT_PX = 9; // so nah an der Kachelmitte des Ziels gilt man als angekommen
const AUTOLAUF_WEGPUNKT_PX = 10;
const AUTOLAUF_STECKT_S = 1.2; // so lange ohne Fortschritt → Weg neu suchen, dann aufgeben
const ZIEL_TIPP_RADIUS = 46; // Bildschirm-Pixel: so nah muss ein Tipp/Klick an einem Zombie sein, um ihn anzuvisieren
const ZIEL_MAX_ABSTAND = 900; // weiter weg → Zielwahl endet
const ANGEL_REICHWEITE = 230; // wie konfiguration.angeln.reichweite (Server) – nur für den Hinweis "Linksklick: auswerfen"

/**
 * Eine laufende Spielsitzung im Client (existiert ab erfolgreichem Login bis zur Trennung).
 *
 * Netzwerk-Techniken (Stichworte zum Nachlesen: "Gabriel Gambetta Fast-Paced Multiplayer"):
 *   1. Client-Side Prediction: Der eigene Spieler bewegt sich sofort lokal (keine Eingabeverzögerung).
 *   2. Server Reconciliation:  Kommt ein Server-Zustand, wird die eigene Position übernommen und
 *                              alle noch unbestätigten Eingaben erneut angewendet.
 *   3. Entity Interpolation:   Andere Spieler/Zombies werden zwischen zwei Server-Schnappschüssen
 *                              weich interpoliert (leicht verzögert dargestellt).
 *
 * Außerdem hier: Platzier-Modus (Bauwerke, Erdfeld mit G), Bau-Modus (BUILD, Basisbau → kern/bauModus.js), Lagerkiste (KISTE-Nachricht → hud.kiste), Wetter (ZUSTAND.wetter →
 * Renderer/Regenton), Angel-Hinweis, Minikarte, Tab-Statistik und der AUTO-LAUF (Klick auf die große Karte → A* →
 * Eingaben statt Tasten; jede manuelle Eingabe bricht ab).
 *
 * Angriffe, Inventar & Co. entscheidet allein der Server – der Client schickt nur Wünsche
 * (EINGABE.angriff, AKTION) und zeigt das Ergebnis an.
 */
export class ClientSpiel {
  /**
   * @param beiZonenwechsel (daten, sitzung) → ZONE_WECHSEL kam an: main.js räumt diese Sitzung ab (uebergeben) und baut neu auf
   * @param seq             letzte Eingabe-Nummer der vorigen Zone (der Server zählt über Zonen hinweg weiter)
   */
  constructor({ verbindung, anmeldeDaten, eingabe, renderer, hud, sound, musik = null, beiEnde, beiZonenwechsel, benutzername = '', vorabNachrichten = [], seq = 0 }) {
    this.verbindung = verbindung;
    this.eingabe = eingabe;
    this.renderer = renderer;
    this.hud = hud;
    this.sound = sound;
    this.musik = musik; // Zonen-Musik (läuft über Zonenwechsel hinweg weiter, siehe audio/zonenMusik.js)
    this.beiEnde = beiEnde;
    this.beiZonenwechsel = beiZonenwechsel;
    this.benutzername = benutzername;

    this.serverName = anmeldeDaten.serverName;
    this.eigeneId = anmeldeDaten.spielerId;
    this.welt = new Welt(anmeldeDaten.karte);
    this.musikOrdner = anmeldeDaten.karte.musik ?? this.welt.id; // Musik-Ordner der Zone (Map-Editor: Feld musik)
    // Klanglandschaft der Karte (Map-Editor Phase 4: Punkt-/Bereichs-/Global-Klänge mit Auslösern)
    this.klaenge = new Klanglandschaft(sound, anmeldeDaten.karte.klaenge ?? [], { handy: globalThis.matchMedia?.('(pointer: coarse)').matches ?? false });
    this.klangZeit = { zoneSeit: performance.now(), kampf: -Infinity, letzte: null };
    if (anmeldeDaten.tueren) this.welt.uebernimmOffeneTueren(anmeldeDaten.tueren);
    if (anmeldeDaten.abgebaut) this.welt.uebernimmAbgebaute(anmeldeDaten.abgebaut);
    if (anmeldeDaten.laternen) this.welt.uebernimmLaternen(anmeldeDaten.laternen);
    if (anmeldeDaten.bauwerke) this.welt.uebernimmBauwerke(anmeldeDaten.bauwerke);
    /** Platzier-Modus (Bauwerk-Item bzw. Erdfeld mit der Hacke): { slot, defId, typ, name, art?: 'feld' } oder null */
    this.platzierung = null;
    /** Basisbau: Bau-Modus mit Menü, Hologramm, Baugebiet-Ring (kern/bauModus.js) */
    this.bau = new BauModus({
      welt: this.welt,
      renderer,
      eingabe,
      hud,
      sound,
      senden: (n) => this.#senden(n),
      kontext: () => ({ daten: this.spielerDaten, lokal: this.lokal, name: this.benutzername, defs: this.itemDefinitionen, eigeneDaten: this.eigeneDaten }),
      vorBeginn: () => this.platzierungAbbrechen(),
    });
    this.wetter = 'klar'; // 'klar' | 'regen' | 'schnee' | 'nebel' (vom Server)
    this.schritte = new Schritte(); // Knirschen im Schnee (audio/schritte.js)
    /** Auto-Lauf: { ziel: {tx, ty}, pfad: [{x, y}], stuck: Sekunden, letzterNeuStart } oder null */
    this.autoLauf = null;
    /** Angetippter/rechtsgeklickter Zombie: Blick + Dauerfeuer, bis er umfällt (Zombie-ID oder null) */
    this.zielZombieId = null;
    this.letzteMiniKarte = 0;
    this.letzterRegenTon = -1;
    this.schlaeft = false;
    this.letzteListe = 0;
    this.letzterKlick = false;
    this.rezepte = anmeldeDaten.rezepte ?? {};
    hud.inventar.setzeRezepte(this.rezepte);
    this.karte = new Karte(document, {
      welt: this.welt,
      assets: renderer.assets,
      schluessel: `${anmeldeDaten.serverName}:${benutzername.toLowerCase()}:${this.welt.id}`,
    });
    this.karte.beiZielWahl = (tx, ty, erkundet) => this.autoLaufStarten(tx, ty, erkundet);
    if (anmeldeDaten.erkundet) this.karte.uebernimm(anmeldeDaten.erkundet); // vom Server (auch von anderen Geräten)
    this.werkbankOffen = false;
    // Uhr: Serverzeit + seit Empfang vergangene Zeit (läuft zwischen den Schnappschüssen weich weiter)
    this.tageszeitDauer = anmeldeDaten.tageszeit ?? { tagSekunden: 600, nachtSekunden: 300 };
    this.serverZeit = anmeldeDaten.zeit ?? 0;
    this.zeitEmpfangen = performance.now();
    this.tag = anmeldeDaten.tag ?? 1;
    this.physik = anmeldeDaten.physik;
    this.gegenstaende = anmeldeDaten.gegenstaende ?? [];
    this.itemDefinitionen = anmeldeDaten.itemDefinitionen ?? {};
    this.spielerDaten = anmeldeDaten.spielerDaten;
    this.bau.beiSpielerDaten(this.spielerDaten); // eigenes Baugebiet aus den Spielerdaten
    this.effekte = new Effekte();
    this.effekte.beiEreignis = (e) => {
      if (e.typ === 'abgebaut' && e.art === 'holz') this.renderer.baumFaellt(e); // Baum kippt um
      if (e.typ === 'laterneUmgefahren') this.renderer.laterneFaellt(e); // Straßenlaterne knickt um
      this.#ereignisSound(e);
    };
    this.letztesStoehnen = 0;

    // Vorhergesagter eigener Spieler (+ Position vom vorherigen Takt für weiche Darstellung)
    this.lokal = { x: anmeldeDaten.start.x, y: anmeldeDaten.start.y, blick: 0, tempoFaktor: anmeldeDaten.spielerDaten?.tempoFaktor ?? 1 };
    this.lokalVorher = { x: this.lokal.x, y: this.lokal.y };
    this.eigeneDaten = null; // letzter öffentlicher Server-Stand des eigenen Spielers
    this.seq = seq;
    this.offeneEingaben = [];

    this.schnappschuesse = []; // [{ empfangen, tick, entitaeten: Map }]
    /**
     * Geschätzte lokale Zeit (performance.now), zu der Server-Tick 0 war. Folgt sofort, wenn ein Paket früher
     * als erwartet kommt, und driftet nur langsam nach hinten → Netzwerk-Jitter verschiebt die Darstellung nicht.
     */
    this.tickNull = null;
    this.interpolationsPool = new Map(); // id → wiederverwendetes Objekt (kein Müll pro Frame)
    this.fahrzeugStand = new Map(); // Fahrzeug-ID → letzte Position (Kacheln nur bei Änderung neu setzen)
    this.ping = null;
    this.letzterTick = 0;
    this.beendet = false;

    this.renderer.setzeWelt(this.welt, anmeldeDaten.nahtlos === true, anmeldeDaten.spielerId);
    this.renderer.setzeNachbarn((anmeldeDaten.nachbarn ?? []).map((n) => ({ id: n.zone, versatz: n.versatz, karte: n.karte })));
    this.hud.setzeSpielerDaten(this.spielerDaten, this.itemDefinitionen);
    this.abmelden = [
      verbindung.beiNachricht((n) => this.#nachricht(n)),
      verbindung.beiTrennung((grund) => this.beenden(grund)),
    ];
    // Was zwischen Login und jetzt ankam (während der Ladebildschirm stand), nachholen
    for (const n of vorabNachrichten) {
      this.#nachricht(n);
      if (this.beendet) return; // schon wieder ein Zonenwechsel darunter → die nächste Sitzung übernimmt
    }
    const pingSenden = () => this.verbindung.senden({ typ: NACHRICHT.PING, t: performance.now() });
    pingSenden();
    this.pingTimer = setInterval(pingSenden, PING_INTERVALL_MS);

    this.schleife = new SpielSchleife({
      tickDauerMs: TICK_DAUER_MS,
      festerTakt: () => this.#festerTakt(),
      zeichne: (alpha, jetzt) => this.#zeichne(alpha, jetzt),
    });
    this.schleife.starten();
    this.sound?.starteAtmosphaere();
    if (this.klaenge.ersetztMusik) this.musik?.stoppen(); // Karte bringt eigene Hintergrundmusik mit
    else this.musik?.setzeZone(this.musikOrdner);
  }

  /** Sitzung beenden (Logout, Kick, Verbindungsverlust). Idempotent. */
  beenden(grund) {
    if (this.beendet) return;
    this.#aufraeumen();
    this.musik?.stoppen();
    if (!this.verbindung.getrennt) this.verbindung.trennen('Abgemeldet');
    this.beiEnde?.(grund);
  }

  /** Zonenwechsel: alles stoppen, aber die Verbindung bleibt (die nächste ClientSpiel-Sitzung übernimmt sie). */
  uebergeben() {
    if (this.beendet) return;
    this.#aufraeumen();
  }

  #aufraeumen() {
    this.beendet = true;
    this.schleife?.stoppen();
    this.karte.speichern();
    this.karte.zeige(false);
    if (this.platzierung) this.platzierungAbbrechen();
    this.bau.stoppen();
    if (this.werkbankOffen) this.werkbankUmschalten(false);
    this.autoLaufStoppen();
    this.hud.kiste.zeige(null);
    this.hud.station.zeige(null);
    this.hud.zeigeAngeln(null);
    this.hud.zeigeAuto(null);
    this.sound?.stoppeAtmosphaere();
    this.sound?.motor(null);
    this.klaenge?.stoppe();
    clearInterval(this.pingTimer);
    for (const ab of this.abmelden) ab();
  }

  // ---------------------------------------------------------------------------
  // Aktionen (Tasten, HUD-Knöpfe) → Server

  aufheben() {
    if (this.#naechsterGegenstand()) this.#aktion(AKTIONEN.AUFHEBEN);
  }

  /**
   * Taste E / Aktions-Knopf: macht das Naheliegendste – Gegenstand aufheben, sonst Baum/Stein abbauen,
   * sonst Werkbank öffnen, sonst ins Bett legen.
   */
  interagieren() {
    if (this.platzierung) return this.platzierungBestaetigen();
    const was = this.#interaktion();
    if (!was) return;
    if (was.art === 'fahrzeug') return this.#aktion(AKTIONEN.FAHRZEUG);
    if (was.art === 'aufheben') this.#aktion(AKTIONEN.AUFHEBEN);
    else if (was.art === 'abbauen') this.#aktion(AKTIONEN.ABBAUEN);
    else if (was.art === 'bauwerk') this.#aktion(AKTIONEN.BAUWERK);
    else if (was.art === 'schlafen') this.#aktion(AKTIONEN.SCHLAFEN);
    else if (was.art === 'werkbank') this.werkbankUmschalten(true);
  }

  // --- Auto-Lauf (Karte anklicken) ----------------------------------------------

  /**
   * Klick auf die große Karte: nur erkundete, begehbare Orte. Der Charakter läuft in normalem Tempo (kein Sprint)
   * den A*-Weg ab; jede Eingabe (WASD, Stick, Angriff, Einsteigen), Tod oder Zonenwechsel bricht ab.
   */
  autoLaufStarten(tx, ty, erkundet = true) {
    if (this.spielerDaten?.tot || this.lokal.fahrzeug) return this.hud.meldung('Auto-Lauf geht nur zu Fuß');
    if (!erkundet) return this.hud.meldung('Dorthin kannst du nur, wo du schon warst');
    if (this.welt.istBlockiert(tx, ty)) return this.hud.meldung('Dort kommt man nicht hin');
    const pfad = findePfad(this.welt, this.lokal.x, this.lokal.y, (tx + 0.5) * this.welt.kachelGroesse, (ty + 0.5) * this.welt.kachelGroesse, { maxKnoten: 90000, tuerKosten: 6 });
    if (!pfad || pfad.length === 0) return this.hud.meldung(pfad ? 'Du bist schon da' : 'Dorthin gibt es keinen Weg');
    this.autoLauf = { ziel: { tx, ty }, pfad, stuck: 0, letzteX: this.lokal.x, letzteY: this.lokal.y, neuVersuche: 0 };
    this.karte.ziel = { tx, ty };
    this.karte.zeige(false);
    this.hud.zeigeAutoLauf(true);
    this.hud.meldung('🧭 Auto-Lauf – jede Taste bricht ab');
  }

  autoLaufStoppen(grund = null) {
    if (!this.autoLauf) return;
    this.autoLauf = null;
    this.karte.ziel = null;
    this.hud.zeigeAutoLauf(false);
    if (grund) this.hud.meldung(grund);
  }

  /** Bewegungsrichtung des Auto-Laufs für diesen Tick (oder null = fertig/abgebrochen). */
  #autoLaufRichtung() {
    const a = this.autoLauf;
    const { x, y } = this.lokal;
    while (a.pfad.length > 1 && Math.hypot(a.pfad[0].x - x, a.pfad[0].y - y) < AUTOLAUF_WEGPUNKT_PX) a.pfad.shift();
    const punkt = a.pfad[0];
    const abstand = Math.hypot(punkt.x - x, punkt.y - y);
    if (a.pfad.length === 1 && abstand < AUTOLAUF_ANKUNFT_PX) {
      this.autoLaufStoppen('Ziel erreicht');
      return null;
    }
    // Kommt man nicht voran (Zombie, Tür, Auto im Weg), einmal neu planen, dann aufgeben
    a.stuck = Math.hypot(x - a.letzteX, y - a.letzteY) < 0.5 * this.physik.geschwindigkeit * TICK_DAUER_S ? a.stuck + TICK_DAUER_S : 0;
    a.letzteX = x;
    a.letzteY = y;
    if (a.stuck > AUTOLAUF_STECKT_S) {
      a.stuck = 0;
      const neu = a.neuVersuche < 2 ? findePfad(this.welt, x, y, (a.ziel.tx + 0.5) * this.welt.kachelGroesse, (a.ziel.ty + 0.5) * this.welt.kachelGroesse, { maxKnoten: 90000, tuerKosten: 6 }) : null;
      if (!neu || neu.length === 0) {
        this.autoLaufStoppen('Auto-Lauf: Weg versperrt');
        return null;
      }
      a.pfad = neu;
      a.neuVersuche++;
    }
    const laenge = Math.hypot(punkt.x - x, punkt.y - y) || 1;
    return { x: (punkt.x - x) / laenge, y: (punkt.y - y) / laenge };
  }

  // --- Zombie anvisieren (Tippen / Rechtsklick) ------------------------------------

  /**
   * Tipp (Handy) bzw. Rechtsklick (PC) auf den Bildschirm: den nächsten Zombie unter dem Finger anvisieren (erneut = abwählen,
   * daneben = abwählen). Danach zielt und feuert der Charakter automatisch, bis der Zombie tot oder außer Reichweite ist.
   * @returns true, wenn ein Zombie getroffen wurde
   */
  zielAntippen(sx, sy) {
    if (this.spielerDaten?.tot || this.lokal.fahrzeug || this.bau.aktiv || this.platzierung) return false;
    const stand = this.schnappschuesse[this.schnappschuesse.length - 1];
    let bester = null;
    let bestAbstand = ZIEL_TIPP_RADIUS;
    if (stand) {
      for (const e of stand.entitaeten.values()) {
        if (e.typ !== 'zombie' || e.tot) continue;
        const p = this.renderer.kamera.weltZuBildschirm(e.x, e.y, 26 * (e.groesse ?? 1));
        const abstand = Math.hypot(p.x - sx, p.y - sy);
        if (abstand < bestAbstand) {
          bestAbstand = abstand;
          bester = e;
        }
      }
    }
    if (!bester || bester.id === this.zielZombieId) {
      this.zielZombieId = null;
      return false;
    }
    this.zielZombieId = bester.id; // roter Zielring reicht als Rückmeldung (Runde 18: keine Meldung mehr)
    return true;
  }

  /** Ziel für diesen Tick: { blick, feuer } oder null (kein Ziel / Ziel gestorben, zu weit weg, ...). */
  #autoZiel() {
    if (this.zielZombieId === null) return null;
    const stand = this.schnappschuesse[this.schnappschuesse.length - 1];
    const z = stand?.entitaeten.get(this.zielZombieId);
    const d = this.spielerDaten;
    const weg = !z || z.tot || !d || d.tot || this.lokal.fahrzeug || this.bau.aktiv || this.platzierung || this.eingabe.touch.zielWinkel() !== null;
    const abstand = weg ? Infinity : Math.hypot(z.x - this.lokal.x, z.y - this.lokal.y);
    if (weg || abstand > ZIEL_MAX_ABSTAND) {
      this.zielZombieId = null;
      return null;
    }
    const waffe = d.ausgeruestet !== null ? d.inventar[d.ausgeruestet] : null;
    const def = (waffe && this.itemDefinitionen[waffe.defId]) ?? this.itemDefinitionen.faust ?? { reichweite: 44 };
    const reichweite = def.reichweite ?? 44;
    const nah = abstand - 13 <= reichweite + (def.kategorie === 'fernkampf' ? 0 : 6);
    const feuer = nah && (def.kategorie !== 'fernkampf' || sichtlinieFrei(this.welt, this.lokal.x, this.lokal.y, z.x, z.y));
    return { blick: Math.atan2(z.y - this.lokal.y, z.x - this.lokal.x), feuer };
  }

  karteUmschalten(offen) {
    this.karte.zeige(offen);
  }

  chat(text) {
    this.#senden({ typ: NACHRICHT.CHAT, text });
  }

  /** Alle Spieler im letzten Schnappschuss mit Statistik (für die Tab-Liste), nach Name sortiert. */
  spielerStatistik() {
    const letzter = this.schnappschuesse[this.schnappschuesse.length - 1];
    if (!letzter) return [];
    return [...letzter.entitaeten.values()]
      .filter((e) => e.typ === 'spieler')
      .map((e) => ({ name: e.name, level: e.level, zombies: e.zombiesGetoetet, spieler: e.spielerGetoetet, ueberlebt: e.ueberlebt, ich: e.id === this.eigeneId, tot: e.tot }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Andere Spieler (letzter Schnappschuss) für die Karte. */
  #mitspieler() {
    const letzter = this.schnappschuesse[this.schnappschuesse.length - 1];
    if (!letzter) return [];
    const liste = [];
    for (const e of letzter.entitaeten.values()) if (e.typ === 'spieler' && e.id !== this.eigeneId && !e.tot) liste.push({ name: e.name, x: e.x, y: e.y });
    return liste;
  }

  /** Skillpunkt verteilen (Fähigkeiten-Fenster). */
  skill(name) {
    this.#senden({ typ: NACHRICHT.AKTION, art: AKTIONEN.SKILL, skill: name });
  }

  /** Developer-Modus (nur Admins – der Server prüft das). */
  entwickler(typ, daten = {}) {
    if (this.spielerDaten?.admin) this.#senden({ typ, ...daten });
  }

  /** Escape: offene Fenster schließen. */
  menuesSchliessen() {
    this.karte.zeige(false);
    this.hud.entwickler.zeige(false);
    this.hud.inventar.zeige(false);
    this.hud.skills.zeige(false);
    this.hud.einstellungen.zeige(false);
    this.hud.adminMenuUmschalten(false);
    this.werkbankUmschalten(false);
    this.kisteSchliessen();
    this.stationSchliessen();
    this.autoLaufStoppen();
    this.zielZombieId = null;
    this.platzierungAbbrechen();
    if (this.bau.aktiv && !this.bau.abbrechen()) this.bau.umschalten(false); // Esc: erst Auswahl lösen, dann Bau-Modus beenden
  }

  // --- Lagerkiste ---------------------------------------------------------------

  kisteLegen(slot) {
    this.#senden({ typ: NACHRICHT.AKTION, art: AKTIONEN.KISTE_LEGEN, slot });
  }

  kisteNehmen(slot) {
    this.#senden({ typ: NACHRICHT.AKTION, art: AKTIONEN.KISTE_NEHMEN, slot });
  }

  stationAktion(art, slot) {
    this.#senden({ typ: NACHRICHT.AKTION, art, slot });
  }

  stationSchliessen() {
    if (!this.hud.station.offen) return;
    this.hud.station.zeige(null);
    this.#senden({ typ: NACHRICHT.AKTION, art: AKTIONEN.STATION_SCHLIESSEN });
  }

  /** Im Feuer-Menü: hinsetzen – das Menü geht dabei zu. */
  /** Ä / 🪑: überall hinsetzen bzw. aufstehen (am brennenden Lagerfeuer: Feuer-Sitzen) */
  sitzen() {
    if (this.spielerDaten?.tot || this.lokal.fahrzeug) return;
    this.#senden({ typ: NACHRICHT.AKTION, art: AKTIONEN.SITZEN });
  }

  stationSitzen() {
    this.#senden({ typ: NACHRICHT.AKTION, art: AKTIONEN.STATION_SITZEN });
    this.stationSchliessen();
  }

  kisteSchliessen() {
    if (!this.hud.kiste.offen) return;
    this.hud.kiste.zeige(null);
    this.#senden({ typ: NACHRICHT.AKTION, art: AKTIONEN.KISTE_SCHLIESSEN });
  }

  /** Werkbank-Menü öffnen/schließen (nur in Reichweite einer Werkbank). */
  werkbankUmschalten(offen = !this.werkbankOffen) {
    this.werkbankOffen = offen && this.#naheWerkbank();
    this.hud.zeigeWerkbank(this.werkbankOffen ? this.rezepte : null, this.spielerDaten, this.itemDefinitionen);
  }

  herstellen(rezept) {
    this.#senden({ typ: NACHRICHT.AKTION, art: AKTIONEN.HERSTELLEN, rezept });
  }

  /** G: Kofferraum des nächsten Autos (oder des eigenen) öffnen. */
  kofferraum() {
    if (this.spielerDaten?.tot) return;
    if (this.#naheFahrzeug() || this.lokal.fahrzeug) this.#aktion(AKTIONEN.KOFFERRAUM);
  }

  /** Auto (auch besetzt/Wrack) in Einstiegsreichweite aus dem letzten Schnappschuss – für Kofferraum-Knopf & -Taste. */
  #naheFahrzeug() {
    const letzter = this.schnappschuesse[this.schnappschuesse.length - 1];
    if (!letzter) return null;
    for (const e of letzter.entitaeten.values()) if (e.typ === 'fahrzeug' && abstandZumFahrzeug(e, this.lokal.x, this.lokal.y) <= EINSTIEG_ABSTAND) return e;
    return null;
  }

  /** Was würde E gerade tun? → { art, text } oder null */
  #interaktion() {
    if (this.spielerDaten?.tot || this.spielerDaten?.arbeit) return null;
    const { x, y } = this.lokal;
    if (this.lokal.fahrzeug) return { art: 'fahrzeug', text: 'Aussteigen', symbol: '🚪' };
    const gegenstand = this.#naechsterGegenstand();
    if (gegenstand) return { art: 'aufheben', text: `${gegenstand.menge > 1 ? `${gegenstand.name} ×${gegenstand.menge}` : gegenstand.name} aufheben`, gegenstand };
    const auto = this.#naechstesFreiesFahrzeug();
    if (auto) return { art: 'fahrzeug', text: `Einsteigen (${FAHRZEUG_MODELLE[auto.modell]?.name ?? 'Auto'})`, symbol: '🚗' };
    const ressource = this.welt.naechsteRessource(x, y, ABBAU_REICHWEITE);
    if (ressource) return { art: 'abbauen', text: RESSOURCEN_OBJEKTE[ressource.typ].aktion, symbol: ressource.art === 'holz' ? '🪓' : '⛏' };
    const inventar = this.spielerDaten?.inventar ?? [];
    // Basisbau: Kisten, Türen und Betten gehören ihrem Besitzer – erst Benutzbares, dann der "gesperrt"-Hinweis
    const aktionFuer = (b) => bauwerkAktion(b, inventar, this.bau.name, this.bau.territorium.gebietBei(b.tx, b.ty));
    const bauwerk =
      this.welt.naechstesBauwerk(x, y, BAUWERK_REICHWEITE, (b) => aktionFuer(b)?.art !== undefined && aktionFuer(b).art !== 'gesperrt') ??
      this.welt.naechstesBauwerk(x, y, BAUWERK_REICHWEITE, (b) => aktionFuer(b) !== null);
    if (bauwerk) return { ...aktionFuer(bauwerk), art: 'bauwerk' };
    if (this.#naheWerkbank()) return { art: 'werkbank', text: 'Werkbank benutzen', symbol: '🔨' };
    if (this.welt.naechstesObjekt(x, y, BETT_REICHWEITE, (o) => o.typ.startsWith('bett'))) return { art: 'schlafen', text: 'Schlafen', symbol: '🛏' };
    return null;
  }

  /** Freies Fahrzeug in Einstiegsreichweite (aus dem letzten Schnappschuss) */
  #naechstesFreiesFahrzeug() {
    const letzter = this.schnappschuesse[this.schnappschuesse.length - 1];
    if (!letzter) return null;
    let bestes = null;
    let bestAbstand = EINSTIEG_ABSTAND;
    for (const e of letzter.entitaeten.values()) {
      if (e.typ !== 'fahrzeug' || e.fahrerId !== null) continue;
      const abstand = abstandZumFahrzeug(e, this.lokal.x, this.lokal.y);
      if (abstand <= bestAbstand) {
        bestes = e;
        bestAbstand = abstand;
      }
    }
    return bestes;
  }

  #naheWerkbank() {
    const { x, y } = this.lokal;
    return (
      this.welt.naechstesObjekt(x, y, WERKBANK_REICHWEITE, (o) => o.typ === 'werkbank') !== null ||
      this.welt.naechstesBauwerk(x, y, WERKBANK_REICHWEITE + 8, (b) => b.typ === 'werkbank') !== null
    );
  }

  // --- Platzieren (Bauwerke, Beet mit der Hacke) ------------------------------

  /**
   * Hacke in der Hand (kein eigener Modus mehr): die Kachel unter der Maus zeigt eine 1×1-Vorschau (grün = geht, rot = geht nicht).
   * Linksklick legt ein Ackerfeld an, Rechtsklick (bzw. 🌱 am Handy) macht ein Beet wieder zu Rasen.
   * Samen in der Hand: das Beet, in das ein Linksklick pflanzt, wird markiert (gleiche Wahl wie der Server: samenZiel).
   * @returns {{ art: 'hacke'|'samen', tx, ty, ok, beet?, grund? } | null}
   */
  #handZiel() {
    const d = this.spielerDaten;
    if (!d || d.tot || this.lokal.fahrzeug || this.bau.aktiv || this.platzierung || d.ausgeruestet == null) return null;
    const defId = d.inventar[d.ausgeruestet]?.defId;
    const kategorie = defId && this.itemDefinitionen[defId]?.kategorie;
    const { x, y, blick } = this.lokal;
    if (kategorie === 'samen') {
      const beet = samenZiel(this.welt, x, y, blick);
      return beet ? { art: 'samen', tx: beet.tx, ty: beet.ty, ok: true } : null;
    }
    if (defId !== 'hacke') return null;
    const maus = this.eingabe.mausBenutzt && this.eingabe.mausZeit >= this.eingabe.touch.letzteBenutzung;
    const punkt = maus ? this.renderer.kamera.bildschirmZuBoden(this.eingabe.mausX, this.eingabe.mausY) : null;
    const { tx, ty } = zielKachel(this.welt, x, y, blick, punkt);
    const beet = this.welt.bauwerkBei(tx, ty, 'objekt')?.typ === 'beet';
    if (!kachelInReichweite(this.welt, x, y, tx, ty)) return { art: 'hacke', tx, ty, ok: false, beet, grund: 'Zu weit weg' };
    const platz = pruefePlatz(this.welt, 'beet', tx, ty);
    return { art: 'hacke', tx, ty, ok: platz.ok, beet, grund: platz.grund };
  }

  /** Rechtsklick / 🌱 mit der Hacke: Beet unter der Vorschau wieder zu Rasen machen. @returns true, wenn gesendet */
  feldEntfernen() {
    const z = this.#handZiel();
    if (z?.art !== 'hacke' || !z.beet) {
      if (z?.art === 'hacke') this.hud.meldung('Hier ist kein Ackerfeld');
      return false;
    }
    this.#senden({ typ: NACHRICHT.AKTION, art: AKTIONEN.FELD_ENTFERNEN, tx: z.tx, ty: z.ty });
    return true;
  }

  /** Platzier-Modus an/aus. Vorschau folgt Maus bzw. Blickrichtung (#platzierungsZiel). */
  #startePlatzierung(slot, defId, def) {
    if (this.platzierung?.slot === slot) return this.platzierungAbbrechen(); // nochmal = abbrechen
    const typ = def.bauwerk;
    this.bau.umschalten(false);
    this.platzierung = { slot, defId, typ, name: `${def.name} aufstellen` };
    this.hud.inventar.zeige(false);
    this.hud.zeigePlatzierung(this.platzierung.name);
  }

  platzierungAbbrechen() {
    if (!this.platzierung) return;
    this.platzierung = null;
    this.hud.zeigePlatzierung(null);
    this.renderer.zeigeVorschau(null);
  }

  platzierungBestaetigen() {
    const ziel = this.#platzierungsZiel();
    if (!ziel) return;
    if (!ziel.ok) {
      this.sound?.spiele('ui_fehler');
      this.hud.meldung(ziel.grund ?? 'Hier nicht');
      return;
    }
    this.#senden({ typ: NACHRICHT.AKTION, art: AKTIONEN.PLATZIEREN, slot: this.platzierung.slot, tx: ziel.tx, ty: ziel.ty });
    this.platzierungAbbrechen();
  }

  /** Zielkachel + ob dort gebaut werden darf (gleiche Regeln wie der Server). */
  #platzierungsZiel() {
    const p = this.platzierung;
    if (!p) return null;
    const hatItem = this.spielerDaten?.inventar[p.slot]?.defId === p.defId;
    if (!hatItem || this.spielerDaten?.tot || this.lokal.fahrzeug) {
      this.platzierungAbbrechen();
      return null;
    }
    const { x, y, blick } = this.lokal;
    const maus = this.eingabe.mausBenutzt && this.eingabe.mausZeit >= this.eingabe.touch.letzteBenutzung;
    const punkt = maus ? this.renderer.kamera.bildschirmZuBoden(this.eingabe.mausX, this.eingabe.mausY) : null;
    const { tx, ty } = zielKachel(this.welt, x, y, blick, punkt);
    if (!kachelInReichweite(this.welt, x, y, tx, ty)) return { tx, ty, ok: false, grund: 'Zu weit weg' };
    const platz = pruefePlatz(this.welt, p.typ, tx, ty);
    if (!platz.ok) return { tx, ty, ok: false, grund: platz.grund };
    // Nicht auf sich selbst bauen (blockierende Bauwerke)
    const g = this.welt.kachelGroesse;
    const r = this.physik.radius;
    const aufMir = x + r > tx * g && x - r < (tx + 1) * g && y + r > ty * g && y - r < (ty + 1) * g;
    if (BAUWERKE[p.typ].blockiert && aufMir) return { tx, ty, ok: false, grund: 'Da stehst du selbst' };
    return { tx, ty, ok: true };
  }

  // --- Basisbau (BUILD) ---------------------------------------------------------

  /** Taste B: Bau-Modus; Admins halten Umschalt dazu für den Flugmodus. */
  bauUmschalten(flug = false) {
    if (flug && this.spielerDaten?.admin) return this.admin('fliegen');
    this.bau.umschalten();
  }

  bauAbriss() {
    this.bau.abrissModus();
  }

  bauGebiet() {
    this.bau.radiusUmschalten();
  }

  /** Rechtsklick: im Bau-Modus löst er die Auswahl, sonst bricht er das Platzieren ab. */
  rechtsklick() {
    if (this.bau.aktiv) this.bau.abbrechen();
    else if (this.platzierung) this.platzierungAbbrechen();
    else if (this.#handZiel()?.art === 'hacke') this.feldEntfernen();
    else this.zielAntippen(this.eingabe.mausX, this.eingabe.mausY); // Zombie anvisieren
  }

  nachladen() {
    if (this.bau.aktiv) return this.bau.drehen(); // R dreht im Bau-Modus das Bauteil
    this.#aktion(AKTIONEN.NACHLADEN);
  }

  /** Doppelklick im Inventar auf Essen/Trinken/Medizin: sofort verbrauchen (Server prüft Kategorie & Abklingzeit). */
  konsumieren(slot) {
    if (this.spielerDaten?.tot) return;
    this.#aktion(AKTIONEN.KONSUMIEREN, slot);
  }

  benutzen(slot) {
    if (this.bau.beiWaffenwahl(slot)) return; // Hammer ist schon in der Hand – nicht abrüsten
    this.letzterSlot = slot;
    const eintrag = this.spielerDaten?.inventar[slot];
    const def = eintrag && this.itemDefinitionen[eintrag.defId];
    if (def && def.bauwerk && !this.spielerDaten.tot) return this.#startePlatzierung(slot, eintrag.defId, def);
    this.#aktion(AKTIONEN.BENUTZEN, slot);
  }

  /** Q: Platz unter der Maus (Inventar offen) → sonst Waffe in der Hand → sonst zuletzt benutzter Schnellleisten-Platz. */
  fallenlassen(slot = null) {
    const d = this.spielerDaten;
    if (!d || d.tot) return;
    const ziel = slot ?? d.ausgeruestet ?? (d.inventar[this.letzterSlot] ? this.letzterSlot : null);
    if (ziel === null || ziel === undefined || !d.inventar[ziel]) return;
    // Aus der Hand (nicht aus dem Inventar-Fenster): bei Stapeln (Holz, Samen, Essen) nur 1 Stück
    this.ablegen(ziel, slot === null && ziel === d.ausgeruestet && d.inventar[ziel].menge > 1);
  }

  tauschen(von, nach) {
    this.#senden({ typ: NACHRICHT.AKTION, art: AKTIONEN.TAUSCHEN, slot: von, ziel: nach });
  }

  rucksackAblegen() {
    this.#aktion(AKTIONEN.RUCKSACK_ABLEGEN);
  }

  ablegen(slot, einzeln = false) {
    this.#senden({ typ: NACHRICHT.AKTION, art: AKTIONEN.ABLEGEN, slot, einzeln });
  }

  /** Taschenlampe an/aus – aus = Zombies bemerken einen erst aus der Nähe. */
  licht() {
    if (this.spielerDaten?.tot) return;
    this.sound?.spiele('taschenlampe', { lautstaerke: 0.6 }); // Klick
    this.#aktion(AKTIONEN.LICHT);
  }

  /** Taste F: nächstes Lagerfeuer an/aus (Türen gehen von selbst auf und zu). */
  tuer() {
    const f = this.#fAktion();
    if (f) this.#aktion(AKTIONEN.FEUER);
  }

  /** Was macht F gerade? → { text, symbol } oder null */
  #fAktion() {
    if (this.spielerDaten?.tot) return null;
    const { x, y } = this.lokal;
    const feuer = this.welt.naechstesBauwerk(x, y, BAUWERK_REICHWEITE, (b) => b.typ === 'lagerfeuer');
    return feuer ? { text: feuerText(feuer), symbol: '🔥' } : null;
  }

  /** Tot → sofort neu spawnen statt Countdown abzuwarten. */
  wiederbeleben() {
    if (this.spielerDaten?.tot) this.#senden({ typ: NACHRICHT.AKTION, art: AKTIONEN.WIEDERBELEBEN });
  }

  /** Admin-Befehl (siehe ADMIN_BEFEHLE) – der Server prüft das Recht, der Client zeigt den Knopf nur Admins. */
  admin(befehl) {
    if (this.spielerDaten?.admin) this.#senden({ typ: NACHRICHT.AKTION, art: AKTIONEN.ADMIN, befehl });
  }

  #aktion(art, slot) {
    if (this.spielerDaten?.tot) return;
    this.#senden(slot === undefined ? { typ: NACHRICHT.AKTION, art } : { typ: NACHRICHT.AKTION, art, slot });
  }

  #senden(nachricht) {
    if (!this.verbindung.getrennt) this.verbindung.senden(nachricht);
  }

  // ---------------------------------------------------------------------------
  // Netzwerk

  #nachricht(n) {
    switch (n.typ) {
      case NACHRICHT.ZONE_WECHSEL:
        this.beiZonenwechsel?.(n, this);
        break;
      case NACHRICHT.ZUSTAND:
        this.#zustandEmpfangen(n);
        break;
      case NACHRICHT.GEGENSTAENDE:
        this.gegenstaende = n.gegenstaende;
        break;
      case NACHRICHT.CHAT:
        this.hud.chatNachricht(n);
        if (!n.system && n.von) this.renderer.zeigeSprechblase(n.von, n.text); // Sprechblase über dem Kopf (nur sichtbar, wenn in dieser Zone)
        break;
      case NACHRICHT.DEV_WERTE:
        this.hud.entwickler.setzeWerte(n.felder, n.ueberschreibungen);
        break;
      case NACHRICHT.EINSTELLUNGEN:
        // Developer-Änderung: Vorhersage, Uhr und Item-Infos auf den neuen Stand bringen
        this.physik = n.physik ?? this.physik;
        this.tageszeitDauer = n.tageszeit ?? this.tageszeitDauer;
        this.itemDefinitionen = n.itemDefinitionen ?? this.itemDefinitionen;
        break;
      case NACHRICHT.STATION:
        this.hud.station.zeige(n.plaetze ? n : null);
        break;
      case NACHRICHT.KISTE:
        this.hud.kiste.zeige(n.inhalt, n.titel);
        if (n.inhalt) this.hud.inventar.zeige(false);
        break;
      case NACHRICHT.RESSOURCEN:
        this.welt.uebernimmAbgebaute(n.abgebaut);
        this.welt.uebernimmLaternen(n.laternen ?? []);
        break;
      case NACHRICHT.BAUWERKE:
        this.welt.uebernimmBauwerke(n.liste);
        break;
      case NACHRICHT.BAUWERKE_AENDERUNG:
        this.welt.wendeBauwerkAenderungAn(n.gesetzt, n.entfernt);
        break;
      case NACHRICHT.TUEREN:
        // Kollision der Vorhersage nutzt dieselbe Welt → Türen gelten sofort auch lokal
        this.welt.uebernimmOffeneTueren(n.offen);
        break;
      case NACHRICHT.SPIELER_DATEN:
        this.#spielerDatenEmpfangen(n);
        break;
      case NACHRICHT.MELDUNG:
        this.hud.meldung(n.text);
        break;
      case NACHRICHT.PONG:
        this.ping = Math.round(performance.now() - n.t);
        break;
      case NACHRICHT.SYSTEM:
        this.hud.meldung(n.text);
        break;
    }
  }

  #spielerDatenEmpfangen(daten) {
    const vorher = this.spielerDaten;
    if (vorher && daten.leben < vorher.leben && !daten.tot) this.effekte.schaden((vorher.leben - daten.leben) / 25);
    if (vorher) this.#datenSound(vorher, daten);
    if (vorher?.tot && !daten.tot) this.offeneEingaben = []; // Respawn: neue Position kommt vom Server
    this.spielerDaten = daten;
    this.bau.beiSpielerDaten(daten);
    this.lokal.tempoFaktor = daten.tempoFaktor ?? 1; // Skill "Schnelligkeit" → Vorhersage läuft gleich schnell wie der Server
    this.hud.setzeSpielerDaten(daten, this.itemDefinitionen);
    if (this.werkbankOffen) this.hud.zeigeWerkbank(this.rezepte, daten, this.itemDefinitionen);
  }

  #zustandEmpfangen(n) {
    if (n.tick <= this.letzterTick) return; // veraltet/doppelt
    this.letzterTick = n.tick;
    const jetzt = performance.now();
    if (Number.isFinite(n.zeit)) {
      this.serverZeit = n.zeit;
      this.zeitEmpfangen = jetzt;
      this.tag = n.tag ?? this.tag;
    }

    this.wetter = n.wetter ?? 'klar';
    const entitaeten = new Map(n.entitaeten.map((e) => [e.id, e]));
    // Runde 18 (4.2): Entitäten der Nachbarzone (schon in unseren Koordinaten, IDs "zone:id") – nur anzeigen, nie anfassen
    const fremde = n.fremde?.length ? new Map(n.fremde.map((e) => [e.id, e])) : null;
    this.schnappschuesse.push({ empfangen: jetzt, tick: n.tick, entitaeten, fremde });
    // Fahrzeuge blockieren ihre Kacheln – auch für die eigene Laufvorhersage
    const g = this.welt.kachelGroesse;
    for (const e of entitaeten.values()) {
      if (e.typ !== 'fahrzeug') continue;
      const stand = `${Math.round(e.x)}|${Math.round(e.y)}|${e.winkel.toFixed(2)}`;
      if (this.fahrzeugStand.get(e.id) === stand) continue;
      this.fahrzeugStand.set(e.id, stand);
      this.welt.setzeFahrzeugKacheln(e.id, fahrzeugKacheln(e, g));
    }
    // Außer Sicht (Server schickt nur Fahrzeuge in der Nähe, siehe server/spiel/zone.js) → Kacheln freigeben
    for (const id of this.fahrzeugStand.keys()) {
      if (entitaeten.has(id)) continue;
      this.fahrzeugStand.delete(id);
      this.welt.entferneFahrzeugKacheln(id);
    }
    const geschaetzt = jetzt - n.tick * this.#tickMs; // Editor-Debug-Zeitlupe (8.1): Tick-Abstand der Schleife
    if (this.tickNull === null || geschaetzt < this.tickNull || geschaetzt - this.tickNull > 500) this.tickNull = geschaetzt;
    else this.tickNull += (geschaetzt - this.tickNull) * 0.02;
    if (this.schnappschuesse.length > 60) this.schnappschuesse.shift();

    // Eigene Schüsse sofort zeigen, alles andere passend zur (verzögerten) Interpolation
    if (n.ereignisse?.length) {
      this.effekte.hinzufuegen(n.ereignisse, jetzt, (e) => (e.von === this.eigeneId ? 0 : INTERPOLATIONS_VERZOEGERUNG_MS));
    }

    const eigene = entitaeten.get(this.eigeneId);
    if (!eigene) return;
    this.eigeneDaten = eigene;

    // Server Reconciliation: Server-Position übernehmen, unbestätigte Eingaben nachspielen
    this.offeneEingaben = this.offeneEingaben.filter((e) => e.seq > eigene.seq);
    this.lokal.x = eigene.x;
    this.lokal.y = eigene.y;
    // Im Auto: Fahrzustand vom Server übernehmen, dann wie beim Laufen die offenen Eingaben nachspielen
    this.lokal.fahrzeug = eigene.fahrzeug ? { ...eigene.fahrzeug, x: eigene.x, y: eigene.y } : null;
    this.lokal.ausdauer = eigene.ausdauer;
    this.lokal.erschoepft = eigene.erschoepft;
    if (eigene.gleit) [this.lokal.gleitX, this.lokal.gleitY] = eigene.gleit; // Rutschen auf Eis
    this.lokal.fliegen = eigene.fliegen === true; // Admin-Flugmodus (gleiche Physik wie der Server)
    this.schlaeft = eigene.arbeit === 'schlafen'; // im Bett festgehalten: Server wendet keine Eingaben an
    if (eigene.tot || this.schlaeft) {
      this.lokalVorher.x = eigene.x;
      this.lokalVorher.y = eigene.y;
      return;
    }
    for (const eingabe of this.offeneEingaben) {
      wendeEingabeAn(this.lokal, eingabe, this.welt, this.physik, TICK_DAUER_S);
    }
  }

  // ---------------------------------------------------------------------------
  // Fester Takt: Eingabe erfassen, lokal vorhersagen, an Server schicken

  #festerTakt() {
    const tot = this.spielerDaten?.tot ?? false;
    let richtung = tot ? { x: 0, y: 0 } : this.eingabe.richtung();
    let autoBlick = null;
    if (this.autoLauf) {
      const manuell = richtung.x !== 0 || richtung.y !== 0 || this.eingabe.angriff() || this.eingabe.sprint();
      if (tot || manuell || this.lokal.fahrzeug) this.autoLaufStoppen();
      else {
        const r = this.#autoLaufRichtung();
        if (r) {
          richtung = r;
          autoBlick = Math.atan2(r.y, r.x);
        }
      }
    }
    // Im Platzier-Modus bedeutet Klick "hier aufstellen" statt Angriff
    let angriff = !tot && this.eingabe.angriff();
    const autoZiel = this.#autoZiel();
    if (autoZiel) {
      autoBlick = autoZiel.blick;
      if (autoZiel.feuer) angriff = true;
    }
    if (this.angelImpuls > 0) {
      this.angelImpuls--;
      angriff = true;
      if (this.angelBlick !== null && this.angelBlick !== undefined) autoBlick = this.angelBlick;
    }
    const hand = this.#handZiel();
    if (hand?.art === 'hacke') {
      // Hacke: Linksklick (neue Flanke) legt ein Ackerfeld an – der Server schlägt damit nicht zu
      if (angriff && !this.letzterKlick) {
        if (hand.ok) this.#senden({ typ: NACHRICHT.AKTION, art: AKTIONEN.FELD, tx: hand.tx, ty: hand.ty });
        else if (hand.beet) this.hud.meldung('Hier ist schon ein Ackerfeld (Rechtsklick = Rasen)');
        else this.hud.meldung(hand.grund ?? 'Hier geht kein Feld');
      }
      this.letzterKlick = angriff;
    }
    if (this.bau.aktiv) {
      this.bau.takt(angriff); // Klick = bauen/abreißen, kein Hammerschwung
      angriff = false;
    } else if (this.platzierung) {
      if (angriff && !this.letzterKlick) this.platzierungBestaetigen();
      this.letzterKlick = angriff;
      angriff = false;
    }
    const eingabe = {
      seq: ++this.seq,
      x: richtung.x,
      y: richtung.y,
      blick: autoBlick ?? this.#blick(),
      angriff,
      sprint: !tot && this.eingabe.sprint(),
    };
    // Ego-Ansicht: Blickneigung mitschicken (Server prüft damit Treffer auf Gelände in der Höhe)
    const neigung = this.eingabe.neigung?.();
    if (Number.isFinite(neigung)) eingabe.neigung = neigung;

    this.lokalVorher.x = this.lokal.x;
    this.lokalVorher.y = this.lokal.y;
    this.lokalVorher.winkel = this.lokal.fahrzeug?.winkel;
    if (!tot && !this.schlaeft) wendeEingabeAn(this.lokal, eingabe, this.welt, this.physik, TICK_DAUER_S);
    this.#zombieStoehnen();
    this.#feuerKnistern();
    this.#tierGeraeusche();
    this.sound?.motor(this.lokal.fahrzeug ? this.lokal.fahrzeug.tempo : null);

    this.offeneEingaben.push(eingabe);
    if (this.offeneEingaben.length > MAX_OFFENE_EINGABEN) this.offeneEingaben.shift();
    this.verbindung.senden({ typ: NACHRICHT.EINGABE, ...eingabe });
  }

  /** Blickrichtung von Maus oder Touch-Stick; ohne Vorgabe bleibt die bisherige erhalten. */
  #blick() {
    const winkel = this.eingabe.blickWinkel(this.lokal, this.renderer.kamera);
    return winkel ?? this.lokal.blick;
  }

  /** Nächster Gegenstand in Aufheb-Reichweite (für Hinweis & Taste E). */
  #naechsterGegenstand() {
    let bester = null;
    let bestAbstand = AUFHEB_REICHWEITE;
    for (const g of this.gegenstaende) {
      const abstand = Math.hypot(g.x - this.lokal.x, g.y - this.lokal.y);
      if (abstand <= bestAbstand) {
        bester = g;
        bestAbstand = abstand;
      }
    }
    return bester;
  }

  // ---------------------------------------------------------------------------
  // Sound

  /** Kampf-Auslöser der Klanglandschaft: Schuss/Treffer im Umkreis von 15 Kacheln */
  #kampfInDerNaehe(e) {
    if (Number.isFinite(e.x) && Math.hypot(e.x - this.lokal.x, e.y - this.lokal.y) < 15 * this.welt.kachelGroesse) this.klangZeit.kampf = performance.now();
  }

  /** Klanglandschaft je Bild: Hörer = eigene Figur (Kacheln), Tag/Nacht, Kampf, Horde (≥ 6 Zombies im Umkreis von 20 Kacheln) */
  #klaengeAktualisieren(jetzt, uhr, andere) {
    const z = this.klangZeit;
    const dt = z.letzte === null ? 0 : Math.min(0.25, (jetzt - z.letzte) / 1000);
    z.letzte = jetzt;
    const g = this.welt.kachelGroesse;
    const zombies = andere.filter((e) => e.typ === 'zombie' && Math.hypot(e.x - this.lokal.x, e.y - this.lokal.y) < 20 * g).length;
    this.klaenge.aktualisiere(dt, { hx: this.lokal.x / g, hy: this.lokal.y / g, nacht: uhr.istNacht, kampfSeit: (performance.now() - z.kampf) / 1000, horde: zombies >= 6, zoneSeit: (performance.now() - z.zoneSeit) / 1000 });
  }

  #ereignisSound(e) {
    if (!this.sound) return;
    switch (e.typ) {
      case 'feuer':
        this.sound.spiele(e.waffe === 'schrotflinte' || e.waffe === 'automatikgewehr' ? e.waffe : 'pistole', { x: e.x, y: e.y });
        this.#kampfInDerNaehe(e);
        break;
      case 'treffer':
        this.sound.spiele(e.ziel === 'zombie' ? 'treffer_zombie' : 'treffer_spieler', { x: e.x, y: e.y });
        this.#kampfInDerNaehe(e);
        break;
      case 'tod':
        this.sound.spiele(e.ziel === 'tier' ? 'hase_tod' : e.ziel === 'zombie' ? 'zombie_tod' : 'spieler_tod', { x: e.x, y: e.y }); // hase_tod: ohne eigene Datei lautlos
        break;
      case 'nahkampf':
        this.sound.spiele('nahkampf', { x: e.x, y: e.y });
        break;
      case 'leer':
        if (e.von === this.eigeneId) this.sound.spiele('leer');
        break;
      case 'tuer':
        this.sound.spiele(e.aufgebrochen ? 'tuer_bricht' : e.offen ? 'tuer_auf' : 'tuer_zu', { x: e.x, y: e.y });
        break;
      case 'hack':
        // Holz: Hacken · Eisenerz: heller Klang (Sample) · Stein: dumpfes Pochen (kein Metallklang)
        this.sound.spiele(e.art === 'holz' || e.art === 'zerlegen' ? 'hack_holz' : e.art === 'eisenerz' ? 'hack_stein' : 'hack_felsen', { x: e.x, y: e.y, tonhoehe: 0.9 + Math.random() * 0.2 });
        break;
      case 'abgebaut':
        this.sound.spiele(e.art === 'holz' ? 'baum_faellt' : e.art === 'eisenerz' ? 'stein_bricht' : 'felsen_bricht', { x: e.x, y: e.y });
        break;
      case 'hergestellt':
      case 'tuerVerstaerkt':
        if (e.typ === 'tuerVerstaerkt' || e.von === this.eigeneId) this.sound.spiele('werkeln', { x: e.x ?? this.lokal.x, y: e.y ?? this.lokal.y });
        break;
      case 'fahrzeug':
        this.sound.spiele('autotuer', { x: e.x, y: e.y });
        break;
      case 'laterneUmgefahren':
        this.sound.spiele('aufprall', { x: e.x, y: e.y, lautstaerke: 0.6 });
        break;
      case 'aufprall':
        this.sound.spiele('aufprall', { x: e.x, y: e.y, lautstaerke: Math.min(1, e.tempo / 250) });
        break;
      case 'gebaut':
        this.sound.spiele(e.bauwerk === 'beet' ? 'graben' : 'gebaut', { x: e.x, y: e.y });
        break;
      case 'abgerissen':
        this.sound.spiele('werkeln', { x: e.x, y: e.y, tonhoehe: 0.8 });
        break;
      case 'tuerBau':
        this.sound.spiele(e.offen ? 'tuer_auf' : 'tuer_zu', { x: e.x, y: e.y });
        break;
      case 'spawnGesetzt':
        this.sound.spiele('aufheben', { x: e.x, y: e.y, tonhoehe: 0.8 });
        break;
      case 'lagerfeuer':
        this.sound.spiele(e.an ? 'feuer_an' : 'feuer_aus', { x: e.x, y: e.y });
        break;
      case 'kochStart':
        this.sound.spiele('brutzel', { x: e.x, y: e.y });
        break;
      case 'gekocht':
        this.sound.spiele('fertig', { x: e.x, y: e.y });
        break;
      case 'verbrannt':
        this.sound.spiele('verbrannt', { x: e.x, y: e.y });
        break;
      case 'holzNachgelegt':
        this.sound.spiele('holz_nachlegen', { x: e.x, y: e.y });
        break;
      case 'werkzeugKaputt':
        this.sound.spiele('tuer_bricht', { x: e.x, y: e.y, tonhoehe: 1.3, lautstaerke: 0.7 });
        break;
      case 'falle':
        this.sound.spiele(e.gespannt ? 'falle_auf' : 'falle_zu', { x: e.x, y: e.y });
        break;
      case 'gepflanzt':
        this.sound.spiele('graben', { x: e.x, y: e.y, lautstaerke: 0.6 });
        break;
      case 'geerntet':
        this.sound.spiele('aufheben', { x: e.x, y: e.y });
        break;
      case 'angelWurf':
        this.sound.spiele('angel_wurf', { x: e.x, y: e.y });
        break;
      case 'angelBiss':
        this.sound.spiele('angel_biss', { x: e.x, y: e.y });
        break;
      case 'gefangen':
        this.sound.spiele('gefangen', { x: e.x, y: e.y });
        break;
      case 'fahrzeugSchaden':
        this.sound.spiele('fahrzeug_schaden', { x: e.x, y: e.y });
        break;
      case 'fahrzeugKaputt':
        this.sound.spiele('fahrzeug_kaputt', { x: e.x, y: e.y });
        break;
      case 'bossBeute':
        this.sound.spiele('beute', { x: e.x, y: e.y });
        break;
      case 'levelAuf':
        if (e.id === this.eigeneId) this.sound.spiele('level_auf');
        break;
      case 'tuerSchlag':
        this.sound.spiele('tuer_schlag', { x: e.x, y: e.y, tonhoehe: 0.85 + Math.random() * 0.3 });
        break;
    }
  }

  /** Geräusche aus Änderungen der eigenen Daten (Essen, Trinken, Aufheben, Nachladen …). */
  #datenSound(vorher, daten) {
    if (!this.sound) return;
    const anzahl = (d) => d.inventar.reduce((s, e) => s + (e ? e.menge : 0), 0);
    if (daten.hunger > vorher.hunger + 1) this.sound.spiele('essen');
    else if (daten.durst > vorher.durst + 1) this.sound.spiele('trinken');
    else if (daten.leben > vorher.leben + 5 && !vorher.tot) this.sound.spiele('heilen');
    else if (anzahl(daten) > anzahl(vorher) && !daten.nachladen) this.sound.spiele('aufheben');
    if (daten.nachladen && !vorher.nachladen) this.sound.spiele('nachladen');
    // Runde 18: eigener Schaden → Aufschrei je Figur (höchstens alle 0,7 s)
    const jetzt = performance.now();
    if (daten.leben < vorher.leben - 0.5 && !daten.tot && jetzt - (this.letzterSchadenTon ?? 0) > 700) {
      this.letzterSchadenTon = jetzt;
      this.sound.spiele(this.eigeneDaten?.aussehen?.koerper === 'frau' ? 'schaden_frau' : 'schaden_mann');
    }
  }

  /**
   * Runde 18: Körper- und Umgebungsgeräusche – Magenknurren/Durst (< 20 %), Keuchen (Ausdauer leer),
   * Vogelgezwitscher (Tag, draußen, kein Niederschlag, keine Schneezone), Donner (starker Regen).
   */
  #umweltGeraeusche(jetzt, uhr) {
    const d = this.spielerDaten;
    if (!this.sound || !d || d.tot) return;
    const faellig = (schluessel, minS, maxS) => {
      const naechste = this.geraeuschUhr[schluessel];
      if (naechste === undefined) {
        this.geraeuschUhr[schluessel] = jetzt + (minS + Math.random() * (maxS - minS)) * 1000;
        return false;
      }
      if (jetzt < naechste) return false;
      this.geraeuschUhr[schluessel] = jetzt + (minS + Math.random() * (maxS - minS)) * 1000;
      return true;
    };
    if (d.hunger >= 20) delete this.geraeuschUhr.hunger;
    else if (faellig('hunger', 20, 45)) this.sound.spiele('magen_knurren');
    if (d.durst >= 20) delete this.geraeuschUhr.durst;
    else if (faellig('durst', 20, 45)) this.sound.spiele('durst');
    if (this.lokal.erschoepft && !this.warErschoepft) this.sound.spiele('keuchen');
    this.warErschoepft = !!this.lokal.erschoepft;
    const draussen = !this.lokal.fahrzeug && !this.welt.istInnen(this.lokal.x, this.lokal.y);
    const vogelWetter = this.wetter === 'klar' || this.wetter === 'nebel';
    if (draussen && vogelWetter && !this.welt.schnee && (uhr.helligkeit ?? 1) > 0.6 && faellig('vogel', 8, 25)) {
      // irgendwo in 150–400 px Entfernung, damit es räumlich klingt
      const w = Math.random() * Math.PI * 2;
      const r = 150 + Math.random() * 250;
      this.sound.spiele('vogel', { x: this.lokal.x + Math.cos(w) * r, y: this.lokal.y + Math.sin(w) * r, tonhoehe: 0.85 + Math.random() * 0.3 });
    }
    if ((this.renderer.wetterEffekt?.regen ?? 0) > 0.5 && this.wetter === 'regen' && faellig('donner', 25, 70)) this.sound.spiele('donner', { lautstaerke: 0.5 + Math.random() * 0.5 });
  }

  geraeuschUhr = {};

  /** Brennende Lagerfeuer in der Nähe knistern (zufällig, räumlich). */
  #feuerKnistern() {
    if (!this.sound || Math.random() > 0.12) return;
    const g = this.welt.kachelGroesse;
    const feuer = this.welt.naechstesBauwerk(this.lokal.x, this.lokal.y, 500, (b) => b.typ === 'lagerfeuer' && b.brennt);
    if (feuer) this.sound.spiele('knistern', { x: (feuer.tx + 0.5) * g, y: (feuer.ty + 0.5) * g, lautstaerke: 0.8 });
  }

  /** Hasen, die gerade erschrecken (ruhend → flucht), hoppeln hörbar davon (Phase 10.2, Ereignis hase_flucht). */
  #tierGeraeusche() {
    const letzter = this.schnappschuesse[this.schnappschuesse.length - 1];
    if (!this.sound || !letzter || letzter === this.#tierSchnappschuss) return;
    this.#tierSchnappschuss = letzter;
    const neu = new Map();
    for (const t of letzter.entitaeten.values()) {
      if (t.typ !== 'tier') continue;
      neu.set(t.id, t.zustand);
      if (t.zustand === 'flucht' && this.#tierZustand.get(t.id) && this.#tierZustand.get(t.id) !== 'flucht' && Math.hypot(t.x - this.lokal.x, t.y - this.lokal.y) < 700) {
        this.sound.spiele('hase_flucht', { x: t.x, y: t.y });
      }
    }
    this.#tierZustand = neu;
  }

  #tierZustand = new Map();
  #tierSchnappschuss = null;

  /** Zombies in der Nähe stöhnen ab und zu – Richtung und Entfernung hört man. */
  #zombieStoehnen() {
    const jetzt = performance.now();
    if (!this.sound || jetzt - this.letztesStoehnen < STOEHN_PAUSE_MS) return;
    const letzter = this.schnappschuesse[this.schnappschuesse.length - 1];
    if (!letzter) return;
    for (const z of letzter.entitaeten.values()) {
      if (z.typ !== 'zombie') continue;
      if (Math.hypot(z.x - this.lokal.x, z.y - this.lokal.y) > STOEHN_REICHWEITE) continue;
      const chance = z.zustand === 'ruhend' ? 0.003 : 0.012; // jagende Zombies sind lauter
      if (Math.random() > chance) continue;
      this.letztesStoehnen = jetzt;
      this.sound.spiele(z.zustand === 'ruhend' ? 'zombie_stoehnen' : 'zombie_angriff', {
        x: z.x,
        y: z.y,
        tonhoehe: ZOMBIE_TONHOEHE[z.variante] ?? 1,
        lautstaerke: z.zustand === 'ruhend' ? 0.7 : 0.9,
      });
      return;
    }
  }

  // ---------------------------------------------------------------------------
  // Darstellung

  #zeichne(alpha, jetzt) {
    const dx = this.lokal.x - this.lokalVorher.x;
    const dy = this.lokal.y - this.lokalVorher.y;
    this.sound?.setzeHoerer(this.lokal.x, this.lokal.y);
    const eigen = {
      ...(this.eigeneDaten ?? { id: this.eigeneId, typ: 'spieler', name: '' }),
      x: lerp(this.lokalVorher.x, this.lokal.x, alpha),
      y: lerp(this.lokalVorher.y, this.lokal.y, alpha),
      blick: this.lokal.blick,
      geschwindigkeit: Math.hypot(dx, dy) / TICK_DAUER_S,
      bewegungsWinkel: Math.atan2(dy, dx),
      istEigener: true,
      sprintet: this.lokal.sprintet ?? this.eigeneDaten?.sprintet, // Vorhersage statt verzögertem Serverwert (Lauf-Animation)
    };
    if (this.karte.offen) this.karte.mitspieler = this.#mitspieler();
    if (!this.spielerDaten?.tot) this.karte.aktualisiere(eigen, jetzt);
    if (this.physik.ausdauerMax) this.hud.setzeAusdauer(this.lokal.ausdauer / this.physik.ausdauerMax, this.lokal.erschoepft);
    const andere = this.#interpolierteEntitaeten(jetzt);
    // Eigenes Auto: aus der Vorhersage (weich interpoliert) statt aus den verzögerten Schnappschüssen
    const fz = this.lokal.fahrzeug;
    if (fz) {
      const i = andere.findIndex((e) => e.id === fz.id);
      const winkel = this.lokalVorher.winkel !== undefined ? lerpWinkel(this.lokalVorher.winkel, fz.winkel, alpha) : fz.winkel;
      const eigenesAuto = { ...(i >= 0 ? andere[i] : { id: fz.id, typ: 'fahrzeug', modell: fz.modell, laenge: fz.laenge, breite: fz.breite }), x: eigen.x, y: eigen.y, winkel, tempo: fz.tempo, fahrerId: this.eigeneId };
      if (i >= 0) andere[i] = eigenesAuto;
      else andere.push(eigenesAuto);
      eigen.fahrzeugId = fz.id;
      eigen.fahrzeugWinkel = winkel; // für die Ich-Perspektive (Kamera schaut mit der Fahrtrichtung)
      eigen.fahrzeugTempo = fz.tempo;
    }
    const interaktion = this.#interaktion();
    const aufhebbar = interaktion?.gegenstand ?? null;
    if (this.werkbankOffen && !this.#naheWerkbank()) this.werkbankUmschalten(false); // weggegangen → zu
    const uhr = tageszeit(this.serverZeit + (jetzt - this.zeitEmpfangen) / 1000, this.tageszeitDauer);
    // Nachtgeräusche (Grillen) nur draußen-unabhängig nach Dunkelheit, in 10-%-Stufen (Ereignis nacht); in Schneezonen keine Grillen
    const nacht = this.welt.schnee ? 0 : Math.round((1 - (uhr.helligkeit ?? 1)) * 10) / 10;
    if (nacht !== this.letzteNachtStufe) {
      this.letzteNachtStufe = nacht;
      this.sound?.nacht(nacht);
    }
    if (this.klaenge.eintraege.length) this.#klaengeAktualisieren(jetzt, uhr, andere);
    this.#umweltGeraeusche(jetzt, uhr);

    if (this.platzierung) this.renderer.zeigeVorschau({ typ: this.platzierung.typ, ...this.#platzierungsZiel() });
    else if (!this.bau.aktiv) {
      const hand = this.#handZiel();
      if (hand) this.renderer.zeigeVorschau({ typ: 'erdfeld', tx: hand.tx, ty: hand.ty, ok: hand.ok });
      else this.renderer.zeigeVorschau(null);
    }
    this.bau.aktualisiere();
    this.#oberflaecheAktualisieren(eigen, jetzt);
    this.renderer.zeichne({
      fokus: eigen,
      entitaeten: [...andere, eigen],
      gegenstaende: this.gegenstaende,
      itemDefinitionen: this.itemDefinitionen,
      jetzt,
      effekte: this.effekte,
      markiertId: aufhebbar?.id ?? null,
      zielId: this.zielZombieId,
      tageszeit: uhr,
      wetter: this.wetter,
    });
    this.schritte.aktualisiere([...andere, eigen], this.welt, this.sound, this.eigeneId, eigen);
    this.hud.aktualisiere({
      serverName: this.serverName,
      verbindung: this.verbindung.beschreibung,
      ping: this.ping,
      fps: this.schleife.fps,
      tick: this.letzterTick,
      spieler: eigen,
      spielerOnline: this.#anzahl('spieler'),
      zombies: this.#anzahl('zombie'),
      gegenstaende: this.gegenstaende.length,
      offeneEingaben: this.offeneEingaben.length,
      grafik: this.hud.debug ? this.renderer.statistik?.() : null,
      interaktion,
      arbeit: this.spielerDaten?.arbeit ?? null,
      fAktion: this.#fAktion(),
      uhr: { ...uhr, tag: this.tag },
    });
  }

  /** Minikarte, Angel-Hinweis, Auto-Anzeige, Tab-Liste, Regenton – alles, was nicht jeden Frame neu muss. */
  #oberflaecheAktualisieren(eigen, jetzt) {
    this.hud.zeigeKofferraumKnopf(!this.spielerDaten?.tot && (!!this.lokal.fahrzeug || !!this.#naheFahrzeug()));
    this.hud.zeigeAuto(this.lokal.fahrzeug && this.eigeneDaten?.fahrzeug ? this.eigeneDaten.fahrzeug : null);
    this.hud.zeigeTacho(this.lokal.fahrzeug && !this.spielerDaten?.tot ? tempoZuKmh(this.lokal.fahrzeug.tempo) : null);
    const angel = this.#angelZustand(jetzt);
    const touch = this.eingabe.touch.istTouchGeraet;
    this.hud.zeigeAngelKnopf(touch ? angel : null);
    const hand = angel ? null : this.#handZiel();
    this.hud.zeigeAngeln(
      angel === 'biss'
        ? 'Einholen!'
        : angel === 'einholen'
          ? '🎣 Warten auf den Biss …'
          : !touch && angel === 'auswerfen'
            ? '🎣 Linksklick: Angel auswerfen'
            : !touch && hand?.art === 'samen'
              ? '🌱 Linksklick: Samen pflanzen'
              : null,
      angel === 'biss',
    );
    if (this.hud.minikarteAn && jetzt - this.letzteMiniKarte > 180) {
      this.letzteMiniKarte = jetzt;
      this.karte.zeichneMini(this.hud.el.minikarte, eigen, this.#minikartenPunkte());
      // Runde 18 (4.2): Kartenbild der Nachbarzone vorab malen, sobald ihr 3D-Modell steht → Wechsel ohne Ruckler
      for (const n of this.renderer.nachbarn) if (n.modell && n.welt) Karte.vorbereiten(n.welt, this.renderer.assets, 2);
    }
    if (!this.hud.el.spielerliste.hidden && jetzt - this.letzteListe > 1000) {
      this.letzteListe = jetzt;
      this.hud.zeigeSpielerliste(this.spielerStatistik());
    }
    const regen = Math.round(this.renderer.wetterEffekt.regen * 20) / 20;
    if (regen !== this.letzterRegenTon) {
      this.letzterRegenTon = regen;
      this.sound?.regen(regen);
    }
  }

  /** Zombies, Tiere und Mitspieler im Umkreis (letzter Schnappschuss) für die Minikarte. */
  #minikartenPunkte() {
    const letzter = this.schnappschuesse[this.schnappschuesse.length - 1];
    if (!letzter) return [];
    const punkte = [];
    // Runde 18: nur Mitspieler – Zombies und Tiere erscheinen nicht mehr auf der Minikarte
    for (const e of letzter.entitaeten.values()) {
      if (e.id === this.eigeneId || e.tot || e.typ !== 'spieler') continue;
      punkte.push({ x: e.x, y: e.y, art: 'spieler' });
    }
    return punkte;
  }

  /**
   * Richtung zum nächsten auswerfbaren Wasser (nächster Winkel zur aktuellen Blickrichtung) oder null.
   * Kurz zwischengespeichert – der Strahltest läuft sonst in jedem Frame mehrfach.
   */
  #angelWinkel(jetzt) {
    if (jetzt - (this.angelWinkelZeit ?? 0) < 150) return this.angelWinkelWert;
    this.angelWinkelZeit = jetzt;
    const b = this.lokal.blick;
    let ergebnis = null;
    if (wurfZiel(this.welt, this.lokal.x, this.lokal.y, b, ANGEL_REICHWEITE)) ergebnis = b;
    else {
      for (let i = 1; i <= 12 && ergebnis === null; i++) {
        for (const seite of [1, -1]) {
          const w = b + (seite * i * Math.PI) / 12;
          if (wurfZiel(this.welt, this.lokal.x, this.lokal.y, w, ANGEL_REICHWEITE)) {
            ergebnis = w;
            break;
          }
        }
      }
    }
    this.angelWinkelWert = ergebnis;
    return ergebnis;
  }

  /**
   * Angeln: Hinweis-Text (Maus) bzw. Knopf-Zustand (Touch) – 'auswerfen' | 'einholen' | 'biss' | null.
   * Ein Biss zeigt keinen großen Banner mehr: die Pose wackelt im Bild, am Handy pulsiert der Knopf.
   */
  #angelZustand(jetzt) {
    const d = this.spielerDaten;
    if (!d || d.tot || this.lokal.fahrzeug) return null;
    const a = this.eigeneDaten?.angeln;
    if (a) return a.phase === 'biss' ? 'biss' : 'einholen';
    // Runde 18: nur mit der Angel in der Hand (wie Server angelSystem.hatAngelInDerHand)
    if (this.platzierung || this.bau.aktiv || d.ausgeruestet == null || d.inventar[d.ausgeruestet]?.defId !== 'angel') return null;
    return this.#angelWinkel(jetzt) !== null ? 'auswerfen' : null;
  }

  /** Angel-Knopf (Handy): kurzer Klick-Impuls, bei "auswerfen" Richtung zum Wasser. */
  angeln() {
    const modus = this.#angelZustand(performance.now());
    if (!modus) return;
    this.angelImpuls = 3; // Ticks, in denen "Linksklick" gesendet wird
    this.angelBlick = modus === 'auswerfen' ? this.#angelWinkel(performance.now()) : null;
  }

  /** Alle fremden Entitäten zur Zeit `renderZeit` – zwischen den beiden passenden Schnappschüssen. */
  /**
   * Andere Spieler & Zombies, INTERPOLATIONS_VERZOEGERUNG_MS in der Vergangenheit zwischen zwei Schnappschüssen
   * interpoliert. Gerechnet wird in Server-Ticks (geglättete Uhr tickNull), nicht nach Ankunftszeit der Pakete –
   * sonst ruckelt alles, sobald Pakete ungleichmäßig ankommen. Ergebnis-Objekte werden wiederverwendet.
   */
  /** Tick-Abstand (ms) – normal TICK_DAUER_MS, im Editor-Debug-Testlauf (Zeitlupe, client/debug/debugLauf.js) länger */
  get #tickMs() {
    return this.schleife?.tickDauerMs ?? TICK_DAUER_MS;
  }

  #interpolierteEntitaeten(jetzt) {
    const liste = this.schnappschuesse;
    if (liste.length === 0) return [];
    const renderTick = (jetzt - INTERPOLATIONS_VERZOEGERUNG_MS * (this.#tickMs / TICK_DAUER_MS) - (this.tickNull ?? jetzt)) / this.#tickMs;

    // Alte Schnappschüsse wegwerfen, die wir nicht mehr brauchen
    while (liste.length >= 2 && liste[1].tick <= renderTick) liste.shift();

    const a = liste[0];
    const b = liste[1];
    const ergebnis = [];
    if (!b || renderTick <= a.tick) {
      for (const e of a.entitaeten.values()) if (e.id !== this.eigeneId) ergebnis.push(e);
      if (a.fremde) for (const e of a.fremde.values()) ergebnis.push(e);
      return ergebnis;
    }

    const t = Math.min(1, (renderTick - a.tick) / (b.tick - a.tick));
    const dauer = Math.max(1, b.tick - a.tick) * TICK_DAUER_S;
    const pool = this.interpolationsPool;
    const neue = b.fremde ? [...b.entitaeten.values(), ...b.fremde.values()] : b.entitaeten.values();
    for (const neu of neue) {
      if (neu.id === this.eigeneId) continue;
      const alt = neu.fremd ? a.fremde?.get(neu.id) : a.entitaeten.get(neu.id);
      if (!alt) {
        ergebnis.push(neu);
        continue;
      }
      const dx = neu.x - alt.x;
      const dy = neu.y - alt.y;
      let e = pool.get(neu.id);
      if (!e) pool.set(neu.id, (e = {}));
      Object.assign(e, neu);
      e.x = lerp(alt.x, neu.x, t);
      e.y = lerp(alt.y, neu.y, t);
      e.blick = lerpWinkel(alt.blick, neu.blick, t);
      if (neu.winkel !== undefined) e.winkel = lerpWinkel(alt.winkel, neu.winkel, t); // Fahrzeuge
      e.geschwindigkeit = Math.hypot(dx, dy) / dauer; // für Lauf-Animationen
      e.bewegungsWinkel = Math.atan2(dy, dx);
      ergebnis.push(e);
    }
    if (pool.size > b.entitaeten.size * 2 + 32) for (const id of pool.keys()) if (!b.entitaeten.has(id) && !b.fremde?.has(id)) pool.delete(id);
    return ergebnis;
  }

  #anzahl(typ) {
    const letzter = this.schnappschuesse[this.schnappschuesse.length - 1];
    if (!letzter) return 0;
    let n = 0;
    for (const e of letzter.entitaeten.values()) if (e.typ === typ) n++;
    return n;
  }
}

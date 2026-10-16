import { AUFHEB_REICHWEITE, BETT_REICHWEITE, TICK_DAUER_MS, TICK_DAUER_S, TUER_REICHWEITE, WERKBANK_REICHWEITE } from '../../gemeinsam/konstanten.js';
import { ABBAU_REICHWEITE, RESSOURCEN_OBJEKTE } from '../../gemeinsam/welt/ressourcen.js';
import { BAUWERKE, BAUWERK_REICHWEITE, bauwerkAktion, feuerText, kachelInReichweite, pruefePlatz, zielKachel } from '../../gemeinsam/welt/bauwerke.js';
import { tageszeit } from '../../gemeinsam/tageszeit.js';
import { AKTIONEN, NACHRICHT } from '../../gemeinsam/protokoll.js';
import { Welt } from '../../gemeinsam/welt/welt.js';
import { wendeEingabeAn } from '../../gemeinsam/physik/bewegung.js';
import { EINSTIEG_ABSTAND, FAHRZEUG_MODELLE, abstandZumFahrzeug, fahrzeugKacheln } from '../../gemeinsam/physik/fahrzeug.js';
import { lerp, lerpWinkel } from '../../gemeinsam/mathe.js';
import { INTERPOLATIONS_VERZOEGERUNG_MS, PING_INTERVALL_MS } from '../konfiguration.js';
import { Effekte } from '../darstellung/effekte.js';
import { SpielSchleife } from './spielSchleife.js';
import { Karte } from '../ui/karte.js';

/** Maximal gemerkte, vom Server noch nicht bestätigte Eingaben (~4 s). */
const MAX_OFFENE_EINGABEN = 120;
const SCHRITT_ABSTAND = 44; // px zwischen zwei Schrittgeräuschen
const STOEHN_REICHWEITE = 650; // Zombies in diesem Umkreis stöhnen gelegentlich
const STOEHN_PAUSE_MS = 900; // höchstens ein Stöhnen pro Pause (sonst Chor)
const ZOMBIE_TONHOEHE = { normal: 1, laeufer: 1.35, brocken: 0.7 };

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
 * Angriffe, Inventar & Co. entscheidet allein der Server – der Client schickt nur Wünsche
 * (EINGABE.angriff, AKTION) und zeigt das Ergebnis an.
 */
export class ClientSpiel {
  /**
   * @param beiZonenwechsel (daten, sitzung) → ZONE_WECHSEL kam an: main.js räumt diese Sitzung ab (uebergeben) und baut neu auf
   * @param seq             letzte Eingabe-Nummer der vorigen Zone (der Server zählt über Zonen hinweg weiter)
   */
  constructor({ verbindung, anmeldeDaten, eingabe, renderer, hud, sound, beiEnde, beiZonenwechsel, benutzername = '', vorabNachrichten = [], seq = 0 }) {
    this.verbindung = verbindung;
    this.eingabe = eingabe;
    this.renderer = renderer;
    this.hud = hud;
    this.sound = sound;
    this.beiEnde = beiEnde;
    this.beiZonenwechsel = beiZonenwechsel;
    this.benutzername = benutzername;

    this.serverName = anmeldeDaten.serverName;
    this.eigeneId = anmeldeDaten.spielerId;
    this.welt = new Welt(anmeldeDaten.karte);
    if (anmeldeDaten.tueren) this.welt.uebernimmOffeneTueren(anmeldeDaten.tueren);
    if (anmeldeDaten.abgebaut) this.welt.uebernimmAbgebaute(anmeldeDaten.abgebaut);
    if (anmeldeDaten.bauwerke) this.welt.uebernimmBauwerke(anmeldeDaten.bauwerke);
    /** Platzier-Modus (Bauwerk-Item oder Hacke benutzt): { slot, defId, typ, name } oder null */
    this.platzierung = null;
    this.letzterKlick = false;
    this.rezepte = anmeldeDaten.rezepte ?? {};
    hud.inventar.setzeRezepte(this.rezepte);
    this.karte = new Karte(document, {
      welt: this.welt,
      assets: renderer.assets,
      schluessel: `${anmeldeDaten.serverName}:${benutzername.toLowerCase()}:${this.welt.id}`,
    });
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
    this.effekte = new Effekte();
    this.effekte.beiEreignis = (e) => {
      if (e.typ === 'abgebaut' && e.art === 'holz') this.renderer.baumFaellt(e); // Baum kippt um
      this.#ereignisSound(e);
    };
    this.schrittWeg = 0;
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

    this.renderer.setzeWelt(this.welt);
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
  }

  /** Sitzung beenden (Logout, Kick, Verbindungsverlust). Idempotent. */
  beenden(grund) {
    if (this.beendet) return;
    this.#aufraeumen();
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
    if (this.werkbankOffen) this.werkbankUmschalten(false);
    this.sound?.stoppeAtmosphaere();
    this.sound?.motor(null);
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

  karteUmschalten(offen) {
    this.karte.zeige(offen);
  }

  chat(text) {
    this.#senden({ typ: NACHRICHT.CHAT, text });
  }

  /** Namen aller Spieler im letzten Schnappschuss (für die Spielerliste). */
  spielerNamen() {
    const letzter = this.schnappschuesse[this.schnappschuesse.length - 1];
    if (!letzter) return [];
    return [...letzter.entitaeten.values()]
      .filter((e) => e.typ === 'spieler')
      .map((e) => `${e.name}${e.level ? ` · Lv ${e.level}` : ''}${e.id === this.eigeneId ? ' (du)' : ''}`)
      .sort((a, b) => a.localeCompare(b));
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
    this.werkbankUmschalten(false);
    this.platzierungAbbrechen();
  }

  /** Werkbank-Menü öffnen/schließen (nur in Reichweite einer Werkbank). */
  werkbankUmschalten(offen = !this.werkbankOffen) {
    this.werkbankOffen = offen && this.#naheWerkbank();
    this.hud.zeigeWerkbank(this.werkbankOffen ? this.rezepte : null, this.spielerDaten, this.itemDefinitionen);
  }

  herstellen(rezept) {
    this.#senden({ typ: NACHRICHT.AKTION, art: AKTIONEN.HERSTELLEN, rezept });
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
    const bauwerk = this.welt.naechstesBauwerk(x, y, BAUWERK_REICHWEITE, (b) => bauwerkAktion(b, inventar) !== null);
    if (bauwerk) return { ...bauwerkAktion(bauwerk, inventar), art: 'bauwerk' };
    if (this.#naheWerkbank()) return { art: 'werkbank', text: 'Werkbank benutzen', symbol: '🔨' };
    if (this.welt.naechstesObjekt(x, y, BETT_REICHWEITE, (o) => o.typ.startsWith('bett'))) return { art: 'schlafen', text: 'Schlafen (heilt, 6 Std. vorspulen)', symbol: '🛏' };
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

  /** Platzier-Modus an/aus. Vorschau folgt Maus bzw. Blickrichtung (#platzierungsZiel). */
  #startePlatzierung(slot, defId, def) {
    if (this.platzierung?.slot === slot) return this.platzierungAbbrechen(); // nochmal = abbrechen
    const typ = def.bauwerk ?? def.baut;
    this.platzierung = { slot, defId, typ, name: def.baut ? 'Beet anlegen' : `${def.name} aufstellen` };
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
      this.sound?.spiele('leer', { tonhoehe: 0.7 });
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
    if (this.spielerDaten?.inventar[p.slot]?.defId !== p.defId || this.spielerDaten?.tot) {
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

  nachladen() {
    this.#aktion(AKTIONEN.NACHLADEN);
  }

  benutzen(slot) {
    this.letzterSlot = slot;
    const eintrag = this.spielerDaten?.inventar[slot];
    const def = eintrag && this.itemDefinitionen[eintrag.defId];
    if (def && (def.bauwerk || def.baut) && !this.spielerDaten.tot) return this.#startePlatzierung(slot, eintrag.defId, def);
    this.#aktion(AKTIONEN.BENUTZEN, slot);
  }

  /** Q: Platz unter der Maus (Inventar offen) → sonst Waffe in der Hand → sonst zuletzt benutzter Schnellleisten-Platz. */
  fallenlassen(slot = null) {
    const d = this.spielerDaten;
    if (!d || d.tot) return;
    const ziel = slot ?? d.ausgeruestet ?? (d.inventar[this.letzterSlot] ? this.letzterSlot : null);
    if (ziel !== null && ziel !== undefined && d.inventar[ziel]) this.ablegen(ziel);
  }

  tauschen(von, nach) {
    this.#senden({ typ: NACHRICHT.AKTION, art: AKTIONEN.TAUSCHEN, slot: von, ziel: nach });
  }

  rucksackAblegen() {
    this.#aktion(AKTIONEN.RUCKSACK_ABLEGEN);
  }

  ablegen(slot) {
    this.#aktion(AKTIONEN.ABLEGEN, slot);
  }

  /** Taschenlampe an/aus – aus = Zombies bemerken einen erst aus der Nähe. */
  licht() {
    if (this.spielerDaten?.tot) return;
    this.sound?.spiele('leer', { tonhoehe: 1.6, lautstaerke: 0.6 }); // Klick
    this.#aktion(AKTIONEN.LICHT);
  }

  /** Taste F: nächstes Lagerfeuer an/aus – oder die nächste Tür öffnen/schließen (was näher ist). */
  tuer() {
    const f = this.#fAktion();
    if (f) this.#aktion(f.feuer ? AKTIONEN.FEUER : AKTIONEN.TUER);
  }

  /** Was macht F gerade? → { text, symbol, feuer } oder null */
  #fAktion() {
    if (this.spielerDaten?.tot) return null;
    const { x, y } = this.lokal;
    const feuer = this.welt.naechstesBauwerk(x, y, BAUWERK_REICHWEITE, (b) => b.typ === 'lagerfeuer');
    const tuer = this.#naechsteTuer();
    const g = this.welt.kachelGroesse;
    if (feuer && (!tuer || Math.hypot((feuer.tx + 0.5) * g - x, (feuer.ty + 0.5) * g - y) < Math.hypot(tuer.x - x, tuer.y - y))) {
      return { text: feuerText(feuer), symbol: '🔥', feuer: true };
    }
    if (tuer) return { text: `Tür ${this.welt.istTuerOffen(tuer.id) ? 'schließen' : 'öffnen'}`, symbol: '🚪', feuer: false };
    return null;
  }

  #naechsteTuer() {
    if (this.spielerDaten?.tot) return null;
    return this.welt.naechsteTuer(this.lokal.x, this.lokal.y, TUER_REICHWEITE);
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
        if (!n.system && n.von) this.sound?.spiele('aufheben', { lautstaerke: 0.4 });
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
      case NACHRICHT.RESSOURCEN:
        this.welt.uebernimmAbgebaute(n.abgebaut);
        break;
      case NACHRICHT.BAUWERKE:
        this.welt.uebernimmBauwerke(n.liste);
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

    const entitaeten = new Map(n.entitaeten.map((e) => [e.id, e]));
    this.schnappschuesse.push({ empfangen: jetzt, tick: n.tick, entitaeten });
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
    const geschaetzt = jetzt - n.tick * TICK_DAUER_MS;
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
    if (eigene.tot) {
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
    const richtung = tot ? { x: 0, y: 0 } : this.eingabe.richtung();
    // Im Platzier-Modus bedeutet Klick "hier aufstellen" statt Angriff
    let angriff = !tot && this.eingabe.angriff();
    if (this.platzierung) {
      if (angriff && !this.letzterKlick) this.platzierungBestaetigen();
      this.letzterKlick = angriff;
      angriff = false;
    }
    const eingabe = {
      seq: ++this.seq,
      x: richtung.x,
      y: richtung.y,
      blick: this.#blick(),
      angriff,
      sprint: !tot && this.eingabe.sprint(),
    };

    this.lokalVorher.x = this.lokal.x;
    this.lokalVorher.y = this.lokal.y;
    this.lokalVorher.winkel = this.lokal.fahrzeug?.winkel;
    if (!tot) wendeEingabeAn(this.lokal, eingabe, this.welt, this.physik, TICK_DAUER_S);
    this.#schritte();
    this.#zombieStoehnen();
    this.#feuerKnistern();
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

  #ereignisSound(e) {
    if (!this.sound) return;
    switch (e.typ) {
      case 'feuer':
        this.sound.spiele(e.waffe === 'schrotflinte' ? 'schrotflinte' : 'pistole', { x: e.x, y: e.y });
        break;
      case 'treffer':
        this.sound.spiele(e.ziel === 'zombie' ? 'treffer_zombie' : 'treffer_spieler', { x: e.x, y: e.y });
        break;
      case 'tod':
        this.sound.spiele(e.ziel === 'zombie' ? 'zombie_tod' : 'spieler_tod', { x: e.x, y: e.y });
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
        this.sound.spiele(e.art === 'holz' ? 'hack_holz' : 'hack_stein', { x: e.x, y: e.y, tonhoehe: 0.9 + Math.random() * 0.2 });
        break;
      case 'abgebaut':
        this.sound.spiele(e.art === 'holz' ? 'baum_faellt' : 'stein_bricht', { x: e.x, y: e.y });
        break;
      case 'hergestellt':
      case 'tuerVerstaerkt':
        if (e.typ === 'tuerVerstaerkt' || e.von === this.eigeneId) this.sound.spiele('werkeln', { x: e.x ?? this.lokal.x, y: e.y ?? this.lokal.y });
        break;
      case 'fahrzeug':
        this.sound.spiele('autotuer', { x: e.x, y: e.y });
        break;
      case 'aufprall':
        this.sound.spiele('aufprall', { x: e.x, y: e.y, lautstaerke: Math.min(1, e.tempo / 250) });
        break;
      case 'gebaut':
        this.sound.spiele(e.bauwerk === 'beet' ? 'graben' : 'gebaut', { x: e.x, y: e.y });
        break;
      case 'feuer':
        this.sound.spiele(e.an ? 'feuer_an' : 'feuer_aus', { x: e.x, y: e.y });
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
      case 'gekocht':
        this.sound.spiele('brutzeln', { x: e.x, y: e.y });
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
  }

  #schritte() {
    if (this.lokal.fahrzeug) return; // im Auto keine Schritte (dafür brummt der Motor)
    const weg = Math.hypot(this.lokal.x - this.lokalVorher.x, this.lokal.y - this.lokalVorher.y);
    this.schrittWeg += weg;
    if (this.schrittWeg < SCHRITT_ABSTAND * (this.lokal.sprintet ? 1.35 : 1)) return;
    this.schrittWeg = 0;
    this.sound?.spiele('schritt', { lautstaerke: this.lokal.sprintet ? 0.5 : 0.3, tonhoehe: 0.8 + Math.random() * 0.4 });
  }

  /** Brennende Lagerfeuer in der Nähe knistern (zufällig, räumlich). */
  #feuerKnistern() {
    if (!this.sound || Math.random() > 0.12) return;
    const g = this.welt.kachelGroesse;
    const feuer = this.welt.naechstesBauwerk(this.lokal.x, this.lokal.y, 500, (b) => b.typ === 'lagerfeuer' && b.brennt);
    if (feuer) this.sound.spiele('knistern', { x: (feuer.tx + 0.5) * g, y: (feuer.ty + 0.5) * g, lautstaerke: 0.8 });
  }

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
    }
    const interaktion = this.#interaktion();
    const aufhebbar = interaktion?.gegenstand ?? null;
    if (this.werkbankOffen && !this.#naheWerkbank()) this.werkbankUmschalten(false); // weggegangen → zu
    const uhr = tageszeit(this.serverZeit + (jetzt - this.zeitEmpfangen) / 1000, this.tageszeitDauer);

    if (this.platzierung) this.renderer.zeigeVorschau({ typ: this.platzierung.typ, ...this.#platzierungsZiel() });
    this.renderer.zeichne({
      fokus: eigen,
      entitaeten: [...andere, eigen],
      gegenstaende: this.gegenstaende,
      jetzt,
      effekte: this.effekte,
      markiertId: aufhebbar?.id ?? null,
      tageszeit: uhr,
    });
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

  /** Alle fremden Entitäten zur Zeit `renderZeit` – zwischen den beiden passenden Schnappschüssen. */
  /**
   * Andere Spieler & Zombies, INTERPOLATIONS_VERZOEGERUNG_MS in der Vergangenheit zwischen zwei Schnappschüssen
   * interpoliert. Gerechnet wird in Server-Ticks (geglättete Uhr tickNull), nicht nach Ankunftszeit der Pakete –
   * sonst ruckelt alles, sobald Pakete ungleichmäßig ankommen. Ergebnis-Objekte werden wiederverwendet.
   */
  #interpolierteEntitaeten(jetzt) {
    const liste = this.schnappschuesse;
    if (liste.length === 0) return [];
    const renderTick = (jetzt - INTERPOLATIONS_VERZOEGERUNG_MS - (this.tickNull ?? jetzt)) / TICK_DAUER_MS;

    // Alte Schnappschüsse wegwerfen, die wir nicht mehr brauchen
    while (liste.length >= 2 && liste[1].tick <= renderTick) liste.shift();

    const a = liste[0];
    const b = liste[1];
    const ergebnis = [];
    if (!b || renderTick <= a.tick) {
      for (const e of a.entitaeten.values()) if (e.id !== this.eigeneId) ergebnis.push(e);
      return ergebnis;
    }

    const t = Math.min(1, (renderTick - a.tick) / (b.tick - a.tick));
    const dauer = Math.max(1, b.tick - a.tick) * TICK_DAUER_S;
    const pool = this.interpolationsPool;
    for (const neu of b.entitaeten.values()) {
      if (neu.id === this.eigeneId) continue;
      const alt = a.entitaeten.get(neu.id);
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
    if (pool.size > b.entitaeten.size * 2 + 32) for (const id of pool.keys()) if (!b.entitaeten.has(id)) pool.delete(id);
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

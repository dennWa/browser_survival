import {
  BENUTZERNAME_MUSTER,
  GAST_MUSTER,
  CHAT_MAX_LAENGE,
  CHAT_PAUSE_MS,
  INVENTAR_MAX,
  MAX_EINGABE_PUFFER,
  PROTOKOLL_VERSION,
  TICK_DAUER_MS,
  TICK_DAUER_S,
  TICK_RATE,
} from '../../gemeinsam/konstanten.js';
import { ADMIN_BEFEHLE, AKTIONEN, NACHRICHT, dekodiere, kodiere } from '../../gemeinsam/protokoll.js';
import { erstelleKonfiguration } from './konfiguration/spielKonfiguration.js';
import { GEGENSTAENDE } from './konfiguration/gegenstaende.js';
import { REZEPTE } from './konfiguration/rezepte.js';
import { pruefeAussehen } from '../../gemeinsam/spieler/aussehen.js';
import { packeErkundet } from '../../gemeinsam/welt/erkundung.js';
import { entwicklerWerte, setzeAllesZurueck, setzeEntwicklerWert, wendeGegenstandsUeberschreibungenAn } from './entwickler.js';
import { spielerDatenPrivat } from './entitaeten/spieler.js';
import { erstelleSpielstand, wendeSpielstandAn } from './spielstand.js';
import { ArbeitsspeicherSpeicher } from './speicher/arbeitsspeicherSpeicher.js';
import { KARTEN } from './karten/kartenLader.js';
import { holeZeitNach, uebernimmZeitsprung } from './systeme/arbeitSystem.js';
import { Taktgeber } from './taktgeber.js';
import { Zone } from './zone.js';
import { BAUTEILE } from '../../gemeinsam/basisbau/teile.js';
import { EBENEN } from '../../gemeinsam/welt/bauwerke.js';
import { spawnPunkt } from './systeme/spawnSystem.js';

/** Danach wird die Verbindung getrennt (Schutz gegen Passwort-Raten). */
const MAX_FEHLVERSUCHE = 5;
/** Maximal gepufferte Aktionen (Aufheben, Benutzen …) pro Spieler und Tick. */
const MAX_AKTIONS_PUFFER = 8;
const GUELTIGE_AKTIONEN = new Set(Object.values(AKTIONEN));
const GUELTIGE_ADMIN_BEFEHLE = new Set(Object.values(ADMIN_BEFEHLE));

/**
 * Autoritativer Spielserver – umgebungsunabhängig (läuft in Node UND im Browser).
 *
 * Aufgaben:
 *   - Verbindungen (Text-Kanäle, siehe netz/speicherKanal.js) annehmen
 *   - Login-Ablauf über die injizierte Authentifizierung
 *   - Eingaben prüfen und puffern
 *   - Simulation im festen Takt und Schnappschüsse an alle Clients – pro Zone (zone.js: eine Karte = eine SpielWelt)
 *   - Zonenwechsel: Spieler betritt einen Übergang → Umzug in die andere Zone (Nachricht ZONE_WECHSEL)
 *   - Spielstände laden (Login) und speichern (Logout, alle autosaveSekunden, Server-Stopp)
 *
 * Sitzungsstatus: 'wartetAufLogin' → 'prueftLogin' → 'laedtSpielstand' → 'imSpiel' (⇄ 'wechseltZone')
 * Die Weltuhr ist die der Startzone; andere Zonen laufen mit, solange jemand drin ist (sonst Pause + Nachholen).
 */
export class SpielServer {
  /**
   * @param {object} optionen
   * @param {{ pruefe: Function }} optionen.authentifizierung
   * @param {object} [optionen.konfiguration]  Überschreibungen für STANDARD_KONFIGURATION
   * @param {Console} [optionen.protokoll]     Logger (console-kompatibel)
   * @param {object} [optionen.kartenDefinition] eigene Startkarte (z. B. für Tests)
   * @param {object} [optionen.kartenDefinitionen] weitere Karten { id: Definition } zusätzlich zu KARTEN (z. B. für Tests)
   * @param {{ laden: Function, speichern: Function }} [optionen.speicher] Spielstände (Standard: nur im Arbeitsspeicher)
   * @param {{ speichern: Function }} [optionen.einstellungsSpeicher] speichert Developer-Änderungen dauerhaft
   *        (Node: server/daten/einstellungen.json, Lokal-Modus: localStorage). Ohne → nur bis zum Neustart.
   */
  constructor({ authentifizierung, konfiguration = {}, protokoll = console, kartenDefinition, kartenDefinitionen = {}, speicher, einstellungsSpeicher = null }) {
    if (!authentifizierung) throw new Error('SpielServer braucht eine Authentifizierung');
    this.authentifizierung = authentifizierung;
    this.speicher = speicher ?? new ArbeitsspeicherSpeicher();
    this.ausstehendeSpeicherungen = new Set();
    this.ticksSeitAutosave = 0;
    this.gestoppt = false;
    this.konfiguration = erstelleKonfiguration(konfiguration);
    // Developer-Modus: alle Überschreibungen (Format von einstellungen.json) – inkl. Item-Werte
    this.einstellungsSpeicher = einstellungsSpeicher;
    this.ueberschreibungen = structuredClone(konfiguration);
    wendeGegenstandsUeberschreibungenAn(konfiguration.gegenstaende);
    this.log = protokoll;
    this.kartenDefinitionen = kartenDefinitionen;
    /** kartenId → Zone; die Startzone gibt es immer, andere entstehen beim ersten Betreten */
    this.zonen = new Map();
    this.startZone = this.#erstelleZone(kartenDefinition);
    this.sitzungen = new Set();
    this.weltGeladen = this.startZone.geladen;
    this.taktgeber = new Taktgeber(TICK_DAUER_MS, () => this.tickAusfuehren());
  }

  /** Die SpielWelt der Startzone (Kurzform für Tests, Konsolen-Helfer, Developer-Werte). */
  get spielWelt() {
    return this.startZone.spielWelt;
  }

  /** SpielWelt, in der ein Spieler gerade ist (Konsolen-Helfer im Lokal-Modus) – oder null. */
  weltVon(benutzername) {
    const name = String(benutzername ?? '').toLowerCase();
    for (const s of this.sitzungen) if (s.status === 'imSpiel' && s.benutzername?.toLowerCase() === name) return s.zone.spielWelt;
    return null;
  }

  #erstelleZone(kartenDefinition) {
    const zone = new Zone({ konfiguration: this.konfiguration, kartenDefinition, speicher: this.speicher, log: this.log });
    // Fürs Schlafen: die Uhr läuft nur weiter, wenn ALLE schlafen – auch die in anderen Zonen
    zone.spielWelt.spielerAndererZonen = () => {
      const andere = [];
      for (const z of this.zonen.values()) if (z !== zone && z.aktiv) andere.push(...z.spielWelt.alleVomTyp('spieler'));
      return andere;
    };
    this.zonen.set(zone.id, zone);
    return zone;
  }

  /** Zone zur Karten-ID (wird beim ersten Mal angelegt) – oder null, wenn es die Karte nicht gibt. */
  zone(id) {
    if (this.zonen.has(id)) return this.zonen.get(id);
    const definition = Object.hasOwn(this.kartenDefinitionen, id) ? this.kartenDefinitionen[id] : Object.hasOwn(KARTEN, id) ? KARTEN[id] : null;
    return definition ? this.#erstelleZone(definition) : null;
  }

  /** Pausierte Zone wird betreten → Uhr der Startzone übernehmen und die Pause nachholen. */
  #aktiviere(zone) {
    if (zone === this.startZone || zone.aktiv) return;
    holeZeitNach(zone.spielWelt, this.startZone.spielWelt.zeit, this.startZone.spielWelt.tag);
    zone.aktiv = true;
  }

  starten() {
    this.taktgeber.starten();
    this.log.info?.(
      `[Server] "${this.konfiguration.server.name}" läuft – Startzone "${this.startZone.name}", ${Object.keys(KARTEN).length} Zonen, ${TICK_RATE} Ticks/s`,
    );
  }

  /** Stoppt die Simulation, speichert alle Spielstände und trennt alle Verbindungen. */
  async stoppen(grund = 'Server wird beendet') {
    if (this.gestoppt) return;
    this.gestoppt = true;
    this.taktgeber.stoppen();
    await this.speichereAlle();
    for (const sitzung of this.sitzungen) sitzung.kanal.trennen(grund);
  }

  /** Weltzustand einer Zone sichern (Speicher-Schlüssel "welt:<kartenId>", Laden: zone.js). */
  #speichereWelt(zone) {
    const stand = zone.spielWelt.weltzustand();
    const speichern = Promise.resolve()
      .then(() => this.speicher.speichern(zone.weltSchluessel, stand))
      .catch((fehler) => this.log.error?.(`[Server] Weltzustand von "${zone.id}" nicht gespeichert:`, fehler))
      .finally(() => this.ausstehendeSpeicherungen.delete(speichern));
    this.ausstehendeSpeicherungen.add(speichern);
  }

  /** Spielstände aller eingeloggten Spieler + alle Zonen sichern (wartet, bis alles geschrieben ist). */
  async speichereAlle() {
    for (const zone of this.zonen.values()) this.#speichereWelt(zone);
    for (const sitzung of this.sitzungen) if (sitzung.status === 'imSpiel' || sitzung.zonenStand) this.#speichere(sitzung);
    await Promise.all([...this.ausstehendeSpeicherungen]);
  }

  get spielerAnzahl() {
    let n = 0;
    for (const s of this.sitzungen) if (s.status === 'imSpiel') n++;
    return n;
  }

  /** Neue Verbindung übernehmen. `info` z. B. { adresse } fürs Logging. */
  verbindungHinzufuegen(kanal, info = {}) {
    const sitzung = {
      kanal,
      info,
      status: 'wartetAufLogin',
      benutzername: null,
      spielerId: null,
      zone: null, // Zone, in der der Spieler ist (ab Login)
      zonenStand: null, // Spielstand während eines Zonenwechsels
      loginTimer: null,
      fehlversuche: 0,
    };
    this.sitzungen.add(sitzung);

    sitzung.loginTimer = setTimeout(() => {
      if (sitzung.status !== 'imSpiel') kanal.trennen('Login-Zeitüberschreitung');
    }, this.konfiguration.server.loginTimeoutMs);

    kanal.beiNachricht((text) => this.#nachrichtEmpfangen(sitzung, text));
    kanal.beiTrennung((grund) => this.#verbindungGetrennt(sitzung, grund));
  }

  /**
   * Ein Simulationsschritt + Versand. Öffentlich, damit Tests den Takt selbst steuern können.
   * Reihenfolge: aktive Zonen bestimmen (Pause nachholen) → alle simulieren → Zonenwechsel → pro Zone versenden.
   */
  tickAusfuehren() {
    let proZone = this.#sitzungenProZone();
    for (const zone of this.zonen.values()) {
      const aktiv = zone === this.startZone || proZone.has(zone);
      if (aktiv) this.#aktiviere(zone);
      zone.aktiv = aktiv;
    }
    const aktive = [...this.zonen.values()].filter((z) => z.aktiv);
    for (const zone of aktive) {
      zone.spielWelt.aktualisiere(TICK_DAUER_S);
      zone.seitAutosave = true;
      // Alle haben ausgeschlafen → die Uhr der übrigen Zonen mitziehen (pausierte holen beim Betreten nach)
      const stunden = zone.spielWelt.zeitSprung;
      zone.spielWelt.zeitSprung = 0;
      if (stunden) for (const andere of aktive) if (andere !== zone) uebernimmZeitsprung(andere.spielWelt, stunden);
    }
    for (const [zone, sitzungen] of proZone) {
      for (const sitzung of sitzungen) {
        const spieler = zone.spielWelt.holen(sitzung.spielerId);
        if (!spieler?.zonenwechsel) continue;
        if (spieler.tot) {
          spieler.zonenwechsel = null; // im selben Tick gestorben → kein Umzug
          continue;
        }
        this.#wechsleZone(sitzung, spieler).catch((fehler) => {
          this.log.error?.('[Server] Zonenwechsel fehlgeschlagen:', fehler);
          sitzung.kanal.trennen('Zonenwechsel fehlgeschlagen');
        });
      }
    }

    if (++this.ticksSeitAutosave >= this.konfiguration.server.autosaveSekunden * TICK_RATE) {
      this.ticksSeitAutosave = 0;
      for (const sitzung of this.sitzungen) if (sitzung.status === 'imSpiel') this.#speichere(sitzung);
      for (const zone of this.zonen.values()) {
        if (!zone.seitAutosave || (zone === this.startZone && this.spielerAnzahl === 0)) continue;
        zone.seitAutosave = false;
        this.#speichereWelt(zone);
      }
    }

    proZone = this.#sitzungenProZone(); // nach den Zonenwechseln
    for (const zone of aktive) zone.versende(proZone.get(zone) ?? [], (sitzung) => this.#sendePrivateDaten(sitzung));
  }

  /** Map Zone → [Sitzungen im Spiel] */
  #sitzungenProZone() {
    const proZone = new Map();
    for (const s of this.sitzungen) {
      if (s.status !== 'imSpiel') continue;
      if (!proZone.has(s.zone)) proZone.set(s.zone, []);
      proZone.get(s.zone).push(s);
    }
    return proZone;
  }

  #spieler(sitzung) {
    return sitzung.status === 'imSpiel' ? sitzung.zone.spielWelt.holen(sitzung.spielerId) : null;
  }

  /**
   * Spieler hat einen Übergang betreten: Spielstand mitnehmen, aus der alten Zone raus, in der neuen am
   * Ankunftspunkt rein, Client baut neu auf (ZONE_WECHSEL). Unbekanntes Ziel → Weg "versperrt".
   */
  async #wechsleZone(sitzung, spieler) {
    const { ziel, ankunft, name, spawn = false } = spieler.zonenwechsel;
    spieler.zonenwechsel = null;
    const alt = sitzung.zone;
    const zone = ziel === alt.id ? null : this.zone(ziel);
    if (!zone) {
      if (spawn) spieler.spawn = null; // Bett-Zone gibt es nicht (mehr) → normaler Start
      alt.spielWelt.melde(spieler.id, `${name}: Dieser Weg ist noch versperrt`);
      return;
    }
    const stand = erstelleSpielstand(spieler, alt.id);
    const behalten = {
      blick: spieler.blick,
      ausdauer: spieler.ausdauer,
      erschoepft: spieler.erschoepft,
      lichtAn: spieler.lichtAn,
      gottmodus: spieler.gottmodus,
      unsichtbar: spieler.unsichtbar,
      letzteEmpfangeneSeq: spieler.letzteEmpfangeneSeq, // Client zählt seq weiter
      letzteVerarbeiteteSeq: spieler.letzteVerarbeiteteSeq,
    };
    alt.spielWelt.entfernen(spieler.id);
    sitzung.status = 'wechseltZone';
    sitzung.zonenStand = stand; // falls die Verbindung genau jetzt abreißt: trotzdem speichern
    sitzung.spielerId = null;
    await zone.geladen;
    if (!this.sitzungen.has(sitzung) || this.gestoppt) return;

    this.#aktiviere(zone);
    const neu = zone.spielWelt.spielerBetrittWelt(sitzung.benutzername, { admin: spieler.admin });
    wendeSpielstandAn(neu, stand, zone.spielWelt);
    // Respawn am Bett einer anderen Zone: neben dem Bett aufwachen (fehlt es inzwischen, normaler Start dieser Zone)
    let punkt = null;
    if (spawn) {
      punkt = spawnPunkt(zone.spielWelt, neu.spawn);
      if (!punkt) {
        if (neu.spawn && zone.spielWelt.welt.bauwerkBei(neu.spawn.tx, neu.spawn.ty)?.typ !== 'bett') neu.spawn = null;
        zone.spielWelt.melde(neu.id, 'Dein Bett ist weg oder zugebaut – du startest am normalen Startpunkt');
      }
    }
    punkt ??= zone.ankunft(ankunft);
    Object.assign(neu, behalten, { x: punkt.x, y: punkt.y });
    sitzung.zone = zone;
    sitzung.spielerId = neu.id;
    sitzung.zonenStand = null;
    sitzung.letzteSpielerDaten = null;
    sitzung.status = 'imSpiel';
    zone.spielWelt.melde(neu.id, `Du betrittst: ${zone.name}`);
    this.#senden(sitzung, { typ: NACHRICHT.ZONE_WECHSEL, zone: zone.name, ...this.#startDaten(zone, neu) });
    this.log.info?.(`[Server] ${sitzung.benutzername}: ${alt.id} → ${zone.id}`);
  }

  /** Alles, was der Client zum (Neu-)Aufbau braucht – ANMELDUNG_OK und ZONE_WECHSEL. */
  #startDaten(zone, spieler) {
    return {
      spielerId: spieler.id,
      serverName: this.konfiguration.server.name,
      tickRate: TICK_RATE,
      start: { x: spieler.x, y: spieler.y },
      itemDefinitionen: GEGENSTAENDE,
      spielerDaten: spielerDatenPrivat(spieler, this.konfiguration, zone.spielWelt),
      erkundet: packeErkundet(spieler.erkundet),
      rezepte: REZEPTE,
      ...zone.weltDaten(),
    };
  }

  /** Inventar, Hunger, Durst … nur an den Spieler selbst – und nur, wenn sich etwas geändert hat. */
  #sendePrivateDaten(sitzung) {
    const spieler = this.#spieler(sitzung);
    if (!spieler) return;
    const text = kodiere({ typ: NACHRICHT.SPIELER_DATEN, ...spielerDatenPrivat(spieler, this.konfiguration, sitzung.zone.spielWelt) });
    if (text === sitzung.letzteSpielerDaten) return;
    sitzung.letzteSpielerDaten = text;
    sitzung.kanal.senden(text);
  }

  // ---------------------------------------------------------------------------

  #senden(sitzung, nachricht) {
    sitzung.kanal.senden(kodiere(nachricht));
  }

  #nachrichtEmpfangen(sitzung, text) {
    const nachricht = dekodiere(text);
    if (!nachricht) return;

    switch (nachricht.typ) {
      case NACHRICHT.ANMELDEN:
        this.#anmelden(sitzung, nachricht).catch((fehler) => {
          this.log.error?.('[Server] Fehler beim Login:', fehler);
          this.#loginAblehnen(sitzung, 'Interner Serverfehler');
        });
        break;
      case NACHRICHT.EINGABE:
        if (sitzung.status === 'imSpiel') this.#eingabe(sitzung, nachricht);
        break;
      case NACHRICHT.AKTION:
        if (sitzung.status === 'imSpiel') this.#aktion(sitzung, nachricht);
        break;
      case NACHRICHT.PING:
        if (Number.isFinite(nachricht.t)) this.#senden(sitzung, { typ: NACHRICHT.PONG, t: nachricht.t });
        break;
      case NACHRICHT.CHAT:
        if (sitzung.status === 'imSpiel') this.#chat(sitzung, nachricht);
        break;
      case NACHRICHT.DEV_ABFRAGEN:
      case NACHRICHT.DEV_SETZEN:
      case NACHRICHT.DEV_ZURUECKSETZEN:
        if (sitzung.status === 'imSpiel') this.#entwickler(sitzung, nachricht);
        break;
      default:
        // Unbekannte Nachricht → ignorieren (nicht abstürzen!)
        break;
    }
  }

  async #anmelden(sitzung, nachricht) {
    if (sitzung.status !== 'wartetAufLogin') return;

    if (nachricht.protokoll !== PROTOKOLL_VERSION) {
      return this.#loginAblehnen(sitzung, 'Spielversion veraltet – bitte Seite neu laden');
    }
    const benutzername = typeof nachricht.benutzername === 'string' ? nachricht.benutzername.trim() : '';
    const passwort = typeof nachricht.passwort === 'string' ? nachricht.passwort : '';
    const alsGast = nachricht.gast === true;
    if (alsGast) {
      if (!this.konfiguration.server.gaeste) return this.#loginAblehnen(sitzung, 'Gäste sind auf diesem Server nicht erlaubt – bitte mit Account einloggen');
      if (!GAST_MUSTER.test(benutzername)) return this.#loginAblehnen(sitzung, 'Ungültiger Gastname');
    } else if (!BENUTZERNAME_MUSTER.test(benutzername)) {
      return this.#loginAblehnen(sitzung, 'Ungültiger Benutzername (2–20 Zeichen, Buchstaben/Ziffern/_/-)');
    }

    sitzung.status = 'prueftLogin';
    // Gäste: kein Passwort, nie Admin (außer die Authentifizierung erlaubt es ausdrücklich, z. B. Lokal-Modus)
    const ergebnis = alsGast
      ? ((await this.authentifizierung.pruefeGast?.(benutzername)) ?? { ok: true, benutzername, admin: false })
      : await this.authentifizierung.pruefe(benutzername, passwort);
    if (!this.sitzungen.has(sitzung)) return; // Verbindung inzwischen weg

    if (!ergebnis.ok) return this.#loginAblehnen(sitzung, ergebnis.grund ?? 'Login fehlgeschlagen');
    if (this.spielerAnzahl >= this.konfiguration.server.maxSpieler) return this.#loginAblehnen(sitzung, 'Server ist voll');

    // Name ab jetzt reserviert – auch während der Spielstand lädt, darf sich niemand zweites Mal einloggen
    const name = ergebnis.benutzername;
    const bereitsDa = [...this.sitzungen].some(
      (s) =>
        s !== sitzung &&
        (s.status === 'imSpiel' || s.status === 'laedtSpielstand' || s.status === 'wechseltZone') &&
        s.benutzername?.toLowerCase() === name.toLowerCase(),
    );
    if (bereitsDa) return this.#loginAblehnen(sitzung, 'Dieser Account ist bereits eingeloggt');
    sitzung.status = 'laedtSpielstand';
    sitzung.benutzername = name;

    let spielstand = null;
    try {
      spielstand = await this.speicher.laden(name);
    } catch (fehler) {
      this.log.error?.(`[Server] Spielstand von ${name} nicht ladbar:`, fehler);
    }
    // Weiter in der Zone vom letzten Mal (nur lebend und wenn es die Karte noch gibt), sonst Startzone
    const zone = (spielstand?.leben > 0 && typeof spielstand.karte === 'string' && this.zone(spielstand.karte)) || this.startZone;
    await zone.geladen;
    if (!this.sitzungen.has(sitzung) || this.gestoppt) return;

    this.#aktiviere(zone);
    const spieler = zone.spielWelt.spielerBetrittWelt(name, { admin: ergebnis.admin === true });
    const geladen = wendeSpielstandAn(spieler, spielstand, zone.spielWelt);
    // Beim Login gewählte Figur gilt (und landet im Spielstand)
    if (nachricht.aussehen && typeof nachricht.aussehen === 'object') spieler.aussehen = pruefeAussehen(nachricht.aussehen);
    clearTimeout(sitzung.loginTimer);
    sitzung.status = 'imSpiel';
    sitzung.zone = zone;
    sitzung.spielerId = spieler.id;
    if (geladen) zone.spielWelt.melde(spieler.id, zone === this.startZone ? 'Spielstand geladen' : `Spielstand geladen – du bist in: ${zone.name}`);
    else zone.spielWelt.melde(spieler.id, 'Tipp: Auf der Karte (K / 🗺) sind Werkbänke 🔨 markiert');

    this.#senden(sitzung, { typ: NACHRICHT.ANMELDUNG_OK, ...this.#startDaten(zone, spieler) });
    this.log.info?.(`[Server] ${name} ist beigetreten (${this.spielerAnzahl} online)`);
    this.#anAlle({ typ: NACHRICHT.CHAT, system: true, text: `${name} ist beigetreten` });
  }

  /** Spielstand sichern – Daten werden SOFORT erfasst, das Schreiben läuft im Hintergrund. */
  #speichere(sitzung) {
    const spieler = this.#spieler(sitzung);
    const stand = spieler ? erstelleSpielstand(spieler, sitzung.zone.id) : sitzung.zonenStand; // mitten im Zonenwechsel
    if (!stand) return;
    const auftrag = Promise.resolve()
      .then(() => this.speicher.speichern(sitzung.benutzername, stand))
      .catch((fehler) => this.log.error?.(`[Server] Spielstand von ${sitzung.benutzername} nicht gespeichert:`, fehler))
      .finally(() => this.ausstehendeSpeicherungen.delete(auftrag));
    this.ausstehendeSpeicherungen.add(auftrag);
  }

  #loginAblehnen(sitzung, grund) {
    sitzung.status = 'wartetAufLogin';
    sitzung.fehlversuche++;
    this.#senden(sitzung, { typ: NACHRICHT.ANMELDUNG_FEHLER, grund });
    if (sitzung.fehlversuche >= MAX_FEHLVERSUCHE) sitzung.kanal.trennen('Zu viele fehlgeschlagene Logins');
  }

  /** Eingaben NIE blind vertrauen: Typen prüfen, Reihenfolge prüfen, Puffer begrenzen. */
  #eingabe(sitzung, n) {
    const spieler = this.#spieler(sitzung);
    if (!spieler) return;
    if (!Number.isInteger(n.seq) || n.seq <= spieler.letzteEmpfangeneSeq) return;
    if (!Number.isFinite(n.x) || !Number.isFinite(n.y)) return;
    spieler.letzteEmpfangeneSeq = n.seq;
    if (spieler.eingabePuffer.length >= MAX_EINGABE_PUFFER) return; // zu viele → verwerfen
    spieler.eingabePuffer.push({
      seq: n.seq,
      x: n.x,
      y: n.y,
      blick: Number.isFinite(n.blick) ? n.blick : spieler.blick,
      angriff: n.angriff === true,
      sprint: n.sprint === true,
      // Ego-Ansicht: Blickneigung (Radiant, + = nach oben) – nur dann zählt die Höhe beim Schießen (Gelände, Editor 2.0)
      neigung: Number.isFinite(n.neigung) ? Math.max(-1.5, Math.min(1.5, n.neigung)) : null,
    });
  }

  #aktion(sitzung, n) {
    const spieler = this.#spieler(sitzung);
    if (!spieler || !GUELTIGE_AKTIONEN.has(n.art)) return;
    const slot = n.slot === undefined ? null : n.slot;
    const gueltigerSlot = (s) => Number.isInteger(s) && s >= 0 && s < INVENTAR_MAX;
    if (slot !== null && !gueltigerSlot(slot)) return;
    if (n.art === AKTIONEN.TAUSCHEN && !(gueltigerSlot(slot) && gueltigerSlot(n.ziel))) return;
    if (n.art === AKTIONEN.PLATZIEREN && !(gueltigerSlot(slot) && Number.isInteger(n.tx) && Number.isInteger(n.ty))) return;
    if (n.art === AKTIONEN.FELD && !(Number.isInteger(n.tx) && Number.isInteger(n.ty))) return;
    if (n.art === AKTIONEN.BAUEN && !(Object.hasOwn(BAUTEILE, n.teil) && Number.isInteger(n.tx) && Number.isInteger(n.ty))) return;
    if (n.art === AKTIONEN.ABREISSEN && !(Number.isInteger(n.tx) && Number.isInteger(n.ty) && (n.ebene === undefined || EBENEN.includes(n.ebene)))) return;
    if ((n.art === AKTIONEN.KISTE_LEGEN || n.art === AKTIONEN.KISTE_NEHMEN || n.art === AKTIONEN.STATION_LEGEN || n.art === AKTIONEN.STATION_NEHMEN) && slot === null) return;
    if (n.art === AKTIONEN.FELD_ENTFERNEN && !(Number.isInteger(n.tx) && Number.isInteger(n.ty))) return;
    if (n.art === AKTIONEN.ADMIN && !GUELTIGE_ADMIN_BEFEHLE.has(n.befehl)) return;
    if (n.art === AKTIONEN.HERSTELLEN && !Object.hasOwn(REZEPTE, n.rezept)) return;
    if (spieler.aktionsPuffer.length >= MAX_AKTIONS_PUFFER) return;
    const aktion = { art: n.art, slot };
    if (n.art === AKTIONEN.ADMIN) aktion.befehl = n.befehl;
    if (n.art === AKTIONEN.HERSTELLEN) aktion.rezept = n.rezept;
    if (n.art === AKTIONEN.TAUSCHEN) aktion.ziel = n.ziel;
    if (n.art === AKTIONEN.ABLEGEN) aktion.einzeln = n.einzeln === true;
    if (n.art === AKTIONEN.PLATZIEREN || n.art === AKTIONEN.FELD || n.art === AKTIONEN.FELD_ENTFERNEN) Object.assign(aktion, { tx: n.tx, ty: n.ty });
    if (n.art === AKTIONEN.BAUEN) Object.assign(aktion, { teil: n.teil, tx: n.tx, ty: n.ty, drehung: n.drehung === 0 || n.drehung === 1 ? n.drehung : null });
    if (n.art === AKTIONEN.ABREISSEN) Object.assign(aktion, { tx: n.tx, ty: n.ty, ebene: n.ebene ?? null });
    if (n.art === AKTIONEN.SKILL) aktion.skill = typeof n.skill === 'string' ? n.skill : null;
    spieler.aktionsPuffer.push(aktion);
  }

  /** Chat: Text prüfen (Länge, Steuerzeichen, Spam-Pause) und an alle verteilen. */
  #chat(sitzung, n) {
    if (typeof n.text !== 'string') return;
    // Steuerzeichen raus, Leerraum zusammenfassen
    const text = n.text.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX_LAENGE);
    const jetzt = Date.now();
    if (!text || jetzt - (sitzung.letzterChat ?? 0) < CHAT_PAUSE_MS) return;
    sitzung.letzterChat = jetzt;
    const spieler = this.#spieler(sitzung);
    this.#anAlle({ typ: NACHRICHT.CHAT, von: sitzung.benutzername, text, admin: !!spieler?.admin });
  }

  #anAlle(nachricht) {
    const text = kodiere(nachricht);
    for (const s of this.sitzungen) if (s.status === 'imSpiel') s.kanal.senden(text);
  }

  /** Developer-Modus: nur für Admins. Werte setzen → sofort wirksam, an alle verteilt, dauerhaft gespeichert. */
  #entwickler(sitzung, n) {
    const spieler = this.#spieler(sitzung);
    if (!spieler?.admin) return;
    // Konfiguration teilen sich alle Zonen; Spieler/Zombies jeder Zone bekommen die neuen Werte
    if (n.typ === NACHRICHT.DEV_SETZEN && n.werte && typeof n.werte === 'object') {
      const eintraege = Object.entries(n.werte).slice(0, 100);
      for (const zone of this.zonen.values()) {
        for (const [pfad, wert] of eintraege) setzeEntwicklerWert(zone.spielWelt, this.ueberschreibungen, pfad, wert);
      }
      this.#einstellungenGeaendert(`${eintraege.length} Wert(e) geändert`, sitzung, spieler);
    } else if (n.typ === NACHRICHT.DEV_ZURUECKSETZEN) {
      for (const zone of this.zonen.values()) setzeAllesZurueck(zone.spielWelt, this.ueberschreibungen);
      this.#einstellungenGeaendert('Alle Werte auf Standard zurückgesetzt', sitzung, spieler);
    }
    this.#senden(sitzung, { typ: NACHRICHT.DEV_WERTE, felder: entwicklerWerte(this.konfiguration), ueberschreibungen: this.ueberschreibungen });
  }

  #einstellungenGeaendert(text, sitzung, spieler) {
    const nachricht = kodiere({
      typ: NACHRICHT.EINSTELLUNGEN,
      physik: this.spielWelt.physikParameter(),
      tageszeit: this.spielWelt.tageszeitDauer(),
      itemDefinitionen: GEGENSTAENDE,
    });
    for (const s of this.sitzungen) if (s.status === 'imSpiel') s.kanal.senden(nachricht);
    sitzung.zone.spielWelt.melde(spieler.id, `🛠 ${text}`);
    this.log.info?.(`[Server] Developer (${spieler.name}): ${text}`);
    if (!this.einstellungsSpeicher) return;
    Promise.resolve()
      .then(() => this.einstellungsSpeicher.speichern(structuredClone(this.ueberschreibungen)))
      .catch((fehler) => this.log.error?.('[Server] Einstellungen nicht gespeichert:', fehler));
  }

  #verbindungGetrennt(sitzung, grund) {
    if (!this.sitzungen.has(sitzung)) return;
    this.sitzungen.delete(sitzung);
    clearTimeout(sitzung.loginTimer);
    if (sitzung.spielerId !== null || sitzung.zonenStand) {
      if (!this.gestoppt) this.#speichere(sitzung); // beim Stopp ist schon gespeichert
      if (sitzung.spielerId !== null) sitzung.zone.spielWelt.entfernen(sitzung.spielerId);
      this.log.info?.(`[Server] ${sitzung.benutzername} hat das Spiel verlassen (${grund ?? 'getrennt'})`);
      if (!this.gestoppt) this.#anAlle({ typ: NACHRICHT.CHAT, system: true, text: `${sitzung.benutzername} hat das Spiel verlassen` });
    }
  }
}

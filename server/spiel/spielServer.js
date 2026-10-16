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
import { SpielWelt } from './spielWelt.js';
import { Taktgeber } from './taktgeber.js';

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
 *   - Simulation im festen Takt (SpielWelt) und Schnappschüsse an alle Clients
 *   - Spielstände laden (Login) und speichern (Logout, alle autosaveSekunden, Server-Stopp)
 *
 * Sitzungsstatus: 'wartetAufLogin' → 'prueftLogin' → 'laedtSpielstand' → 'imSpiel'
 */
export class SpielServer {
  /**
   * @param {object} optionen
   * @param {{ pruefe: Function }} optionen.authentifizierung
   * @param {object} [optionen.konfiguration]  Überschreibungen für STANDARD_KONFIGURATION
   * @param {Console} [optionen.protokoll]     Logger (console-kompatibel)
   * @param {object} [optionen.kartenDefinition] eigene Karte (z. B. für Tests)
   * @param {{ laden: Function, speichern: Function }} [optionen.speicher] Spielstände (Standard: nur im Arbeitsspeicher)
   * @param {{ speichern: Function }} [optionen.einstellungsSpeicher] speichert Developer-Änderungen dauerhaft
   *        (Node: server/daten/einstellungen.json, Lokal-Modus: localStorage). Ohne → nur bis zum Neustart.
   */
  constructor({ authentifizierung, konfiguration = {}, protokoll = console, kartenDefinition, speicher, einstellungsSpeicher = null }) {
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
    this.spielWelt = new SpielWelt(this.konfiguration, { kartenDefinition });
    this.sitzungen = new Set();
    this.gesendeteGegenstaendeVersion = this.spielWelt.gegenstaendeVersion;
    this.gesendeteTuerenVersion = this.spielWelt.tuerenVersion;
    this.gesendeteRessourcenVersion = this.spielWelt.welt.ressourcenVersion;
    this.gesendeteBauwerkeVersion = this.spielWelt.welt.bauwerkeVersion;
    this.weltSchluessel = `welt:${this.spielWelt.karte.daten.id}`;
    this.weltGeladen = this.#ladeWelt();
    this.taktgeber = new Taktgeber(TICK_DAUER_MS, () => this.tickAusfuehren());
  }

  starten() {
    this.taktgeber.starten();
    this.log.info?.(
      `[Server] "${this.konfiguration.server.name}" läuft – Karte "${this.spielWelt.karte.daten.name}", ${TICK_RATE} Ticks/s`,
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

  /** Gebaute Sachen, Uhrzeit & Tag vom letzten Mal laden (Speicher-Schlüssel "welt:<kartenId>"). */
  async #ladeWelt() {
    try {
      const stand = await this.speicher.laden(this.weltSchluessel);
      if (stand && this.spielWelt.uebernimmWeltzustand(stand)) {
        this.log.info?.(`[Server] Welt geladen: ${this.spielWelt.welt.bauwerke.size} Bauwerke, Tag ${this.spielWelt.tag}`);
      }
    } catch (fehler) {
      this.log.error?.('[Server] Weltzustand nicht ladbar:', fehler);
    }
  }

  #speichereWelt() {
    const stand = this.spielWelt.weltzustand();
    const speichern = Promise.resolve()
      .then(() => this.speicher.speichern(this.weltSchluessel, stand))
      .catch((fehler) => this.log.error?.('[Server] Weltzustand nicht gespeichert:', fehler))
      .finally(() => this.ausstehendeSpeicherungen.delete(speichern));
    this.ausstehendeSpeicherungen.add(speichern);
  }

  /** Spielstände aller eingeloggten Spieler + die Welt sichern (wartet, bis alles geschrieben ist). */
  async speichereAlle() {
    this.#speichereWelt();
    for (const sitzung of this.sitzungen) if (sitzung.status === 'imSpiel') this.#speichere(sitzung);
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

  /** Ein Simulationsschritt + Versand. Öffentlich, damit Tests den Takt selbst steuern können. */
  tickAusfuehren() {
    this.spielWelt.aktualisiere(TICK_DAUER_S);
    if (++this.ticksSeitAutosave >= this.konfiguration.server.autosaveSekunden * TICK_RATE) {
      this.ticksSeitAutosave = 0;
      for (const sitzung of this.sitzungen) if (sitzung.status === 'imSpiel') this.#speichere(sitzung);
      if (this.spielerAnzahl > 0) this.#speichereWelt();
    }

    const zustand = kodiere({ typ: NACHRICHT.ZUSTAND, ...this.spielWelt.schnappschuss() });
    let gegenstaende = null;
    if (this.spielWelt.gegenstaendeVersion !== this.gesendeteGegenstaendeVersion) {
      this.gesendeteGegenstaendeVersion = this.spielWelt.gegenstaendeVersion;
      gegenstaende = kodiere({ typ: NACHRICHT.GEGENSTAENDE, gegenstaende: this.spielWelt.gegenstaendeListe() });
    }
    let ressourcen = null;
    if (this.spielWelt.welt.ressourcenVersion !== this.gesendeteRessourcenVersion) {
      this.gesendeteRessourcenVersion = this.spielWelt.welt.ressourcenVersion;
      ressourcen = kodiere({ typ: NACHRICHT.RESSOURCEN, abgebaut: [...this.spielWelt.welt.abgebaut] });
    }
    let bauwerke = null;
    if (this.spielWelt.welt.bauwerkeVersion !== this.gesendeteBauwerkeVersion) {
      this.gesendeteBauwerkeVersion = this.spielWelt.welt.bauwerkeVersion;
      bauwerke = kodiere({ typ: NACHRICHT.BAUWERKE, liste: [...this.spielWelt.welt.bauwerke.values()] });
    }
    let tueren = null;
    if (this.spielWelt.tuerenVersion !== this.gesendeteTuerenVersion) {
      this.gesendeteTuerenVersion = this.spielWelt.tuerenVersion;
      tueren = kodiere({ typ: NACHRICHT.TUEREN, offen: this.spielWelt.welt.offeneTueren() });
    }

    const meldungen = new Map();
    for (const { spielerId, text } of this.spielWelt.meldungen) {
      if (!meldungen.has(spielerId)) meldungen.set(spielerId, []);
      meldungen.get(spielerId).push(text);
    }
    this.spielWelt.meldungen = []; // erst nach dem Einsammeln leeren (auch Meldungen zwischen zwei Ticks kommen an)

    for (const sitzung of this.sitzungen) {
      if (sitzung.status !== 'imSpiel') continue;
      if (gegenstaende) sitzung.kanal.senden(gegenstaende);
      if (tueren) sitzung.kanal.senden(tueren);
      if (ressourcen) sitzung.kanal.senden(ressourcen);
      if (bauwerke) sitzung.kanal.senden(bauwerke);
      sitzung.kanal.senden(zustand);
      this.#sendePrivateDaten(sitzung);
      for (const text of meldungen.get(sitzung.spielerId) ?? []) this.#senden(sitzung, { typ: NACHRICHT.MELDUNG, text });
    }
  }

  /** Inventar, Hunger, Durst … nur an den Spieler selbst – und nur, wenn sich etwas geändert hat. */
  #sendePrivateDaten(sitzung) {
    const spieler = this.spielWelt.holen(sitzung.spielerId);
    if (!spieler) return;
    const text = kodiere({ typ: NACHRICHT.SPIELER_DATEN, ...spielerDatenPrivat(spieler, this.konfiguration) });
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
        (s.status === 'imSpiel' || s.status === 'laedtSpielstand') &&
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
    if (!this.sitzungen.has(sitzung) || this.gestoppt) return;

    const spieler = this.spielWelt.spielerBetrittWelt(name, { admin: ergebnis.admin === true });
    const geladen = wendeSpielstandAn(spieler, spielstand, this.spielWelt);
    // Beim Login gewählte Figur gilt (und landet im Spielstand)
    if (nachricht.aussehen && typeof nachricht.aussehen === 'object') spieler.aussehen = pruefeAussehen(nachricht.aussehen);
    clearTimeout(sitzung.loginTimer);
    sitzung.status = 'imSpiel';
    sitzung.spielerId = spieler.id;
    if (geladen) this.spielWelt.melde(spieler.id, 'Spielstand geladen');
    else this.spielWelt.melde(spieler.id, 'Tipp: Auf der Karte (K / 🗺) sind Werkbänke 🔨 markiert');

    this.#senden(sitzung, {
      typ: NACHRICHT.ANMELDUNG_OK,
      spielerId: spieler.id,
      serverName: this.konfiguration.server.name,
      tickRate: TICK_RATE,
      karte: this.spielWelt.karte.daten,
      physik: this.spielWelt.physikParameter(),
      start: { x: spieler.x, y: spieler.y },
      gegenstaende: this.spielWelt.gegenstaendeListe(),
      itemDefinitionen: GEGENSTAENDE,
      spielerDaten: spielerDatenPrivat(spieler, this.konfiguration),
      tueren: this.spielWelt.welt.offeneTueren(),
      abgebaut: [...this.spielWelt.welt.abgebaut],
      bauwerke: [...this.spielWelt.welt.bauwerke.values()],
      erkundet: packeErkundet(spieler.erkundet),
      rezepte: REZEPTE,
      tageszeit: this.spielWelt.tageszeitDauer(),
      zeit: this.spielWelt.zeit,
      tag: this.spielWelt.tag,
    });
    this.log.info?.(`[Server] ${name} ist beigetreten (${this.spielerAnzahl} online)`);
    this.#anAlle({ typ: NACHRICHT.CHAT, system: true, text: `${name} ist beigetreten` });
  }

  /** Spielstand sichern – Daten werden SOFORT erfasst, das Schreiben läuft im Hintergrund. */
  #speichere(sitzung) {
    const spieler = this.spielWelt.holen(sitzung.spielerId);
    if (!spieler) return;
    const stand = erstelleSpielstand(spieler, this.spielWelt.karte.daten.id);
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
    const spieler = this.spielWelt.holen(sitzung.spielerId);
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
    });
  }

  #aktion(sitzung, n) {
    const spieler = this.spielWelt.holen(sitzung.spielerId);
    if (!spieler || !GUELTIGE_AKTIONEN.has(n.art)) return;
    const slot = n.slot === undefined ? null : n.slot;
    const gueltigerSlot = (s) => Number.isInteger(s) && s >= 0 && s < INVENTAR_MAX;
    if (slot !== null && !gueltigerSlot(slot)) return;
    if (n.art === AKTIONEN.TAUSCHEN && !(gueltigerSlot(slot) && gueltigerSlot(n.ziel))) return;
    if (n.art === AKTIONEN.PLATZIEREN && !(gueltigerSlot(slot) && Number.isInteger(n.tx) && Number.isInteger(n.ty))) return;
    if (n.art === AKTIONEN.ADMIN && !GUELTIGE_ADMIN_BEFEHLE.has(n.befehl)) return;
    if (n.art === AKTIONEN.HERSTELLEN && !Object.hasOwn(REZEPTE, n.rezept)) return;
    if (spieler.aktionsPuffer.length >= MAX_AKTIONS_PUFFER) return;
    const aktion = { art: n.art, slot };
    if (n.art === AKTIONEN.ADMIN) aktion.befehl = n.befehl;
    if (n.art === AKTIONEN.HERSTELLEN) aktion.rezept = n.rezept;
    if (n.art === AKTIONEN.TAUSCHEN) aktion.ziel = n.ziel;
    if (n.art === AKTIONEN.PLATZIEREN) Object.assign(aktion, { tx: n.tx, ty: n.ty });
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
    const spieler = this.spielWelt.holen(sitzung.spielerId);
    this.#anAlle({ typ: NACHRICHT.CHAT, von: sitzung.benutzername, text, admin: !!spieler?.admin });
  }

  #anAlle(nachricht) {
    const text = kodiere(nachricht);
    for (const s of this.sitzungen) if (s.status === 'imSpiel') s.kanal.senden(text);
  }

  /** Developer-Modus: nur für Admins. Werte setzen → sofort wirksam, an alle verteilt, dauerhaft gespeichert. */
  #entwickler(sitzung, n) {
    const spieler = this.spielWelt.holen(sitzung.spielerId);
    if (!spieler?.admin) return;
    if (n.typ === NACHRICHT.DEV_SETZEN && n.werte && typeof n.werte === 'object') {
      const eintraege = Object.entries(n.werte).slice(0, 100);
      for (const [pfad, wert] of eintraege) setzeEntwicklerWert(this.spielWelt, this.ueberschreibungen, pfad, wert);
      this.#einstellungenGeaendert(`${eintraege.length} Wert(e) geändert`, spieler);
    } else if (n.typ === NACHRICHT.DEV_ZURUECKSETZEN) {
      setzeAllesZurueck(this.spielWelt, this.ueberschreibungen);
      this.#einstellungenGeaendert('Alle Werte auf Standard zurückgesetzt', spieler);
    }
    this.#senden(sitzung, { typ: NACHRICHT.DEV_WERTE, felder: entwicklerWerte(this.konfiguration), ueberschreibungen: this.ueberschreibungen });
  }

  #einstellungenGeaendert(text, spieler) {
    const nachricht = kodiere({
      typ: NACHRICHT.EINSTELLUNGEN,
      physik: this.spielWelt.physikParameter(),
      tageszeit: this.spielWelt.tageszeitDauer(),
      itemDefinitionen: GEGENSTAENDE,
    });
    for (const s of this.sitzungen) if (s.status === 'imSpiel') s.kanal.senden(nachricht);
    this.spielWelt.melde(spieler.id, `🛠 ${text}`);
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
    if (sitzung.spielerId !== null) {
      if (!this.gestoppt) this.#speichere(sitzung); // beim Stopp ist schon gespeichert
      this.spielWelt.entfernen(sitzung.spielerId);
      this.log.info?.(`[Server] ${sitzung.benutzername} hat das Spiel verlassen (${grund ?? 'getrennt'})`);
      if (!this.gestoppt) this.#anAlle({ typ: NACHRICHT.CHAT, system: true, text: `${sitzung.benutzername} hat das Spiel verlassen` });
    }
  }
}

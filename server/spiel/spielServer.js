import {
  BENUTZERNAME_MUSTER,
  MAX_EINGABE_PUFFER,
  PROTOKOLL_VERSION,
  TICK_DAUER_MS,
  TICK_DAUER_S,
  TICK_RATE,
} from '../../gemeinsam/konstanten.js';
import { NACHRICHT, dekodiere, kodiere } from '../../gemeinsam/protokoll.js';
import { erstelleKonfiguration } from './konfiguration/spielKonfiguration.js';
import { SpielWelt } from './spielWelt.js';
import { Taktgeber } from './taktgeber.js';

/** Danach wird die Verbindung getrennt (Schutz gegen Passwort-Raten). */
const MAX_FEHLVERSUCHE = 5;

/**
 * Autoritativer Spielserver – umgebungsunabhängig (läuft in Node UND im Browser).
 *
 * Aufgaben:
 *   - Verbindungen (Text-Kanäle, siehe netz/speicherKanal.js) annehmen
 *   - Login-Ablauf über die injizierte Authentifizierung
 *   - Eingaben prüfen und puffern
 *   - Simulation im festen Takt (SpielWelt) und Schnappschüsse an alle Clients
 *
 * Sitzungsstatus: 'wartetAufLogin' → 'prueftLogin' → 'imSpiel'
 */
export class SpielServer {
  /**
   * @param {object} optionen
   * @param {{ pruefe: Function }} optionen.authentifizierung
   * @param {object} [optionen.konfiguration]  Überschreibungen für STANDARD_KONFIGURATION
   * @param {Console} [optionen.protokoll]     Logger (console-kompatibel)
   */
  constructor({ authentifizierung, konfiguration = {}, protokoll = console }) {
    if (!authentifizierung) throw new Error('SpielServer braucht eine Authentifizierung');
    this.authentifizierung = authentifizierung;
    this.konfiguration = erstelleKonfiguration(konfiguration);
    this.log = protokoll;
    this.spielWelt = new SpielWelt(this.konfiguration);
    this.sitzungen = new Set();
    this.gesendeteGegenstaendeVersion = this.spielWelt.gegenstaendeVersion;
    this.taktgeber = new Taktgeber(TICK_DAUER_MS, () => this.tickAusfuehren());
  }

  starten() {
    this.taktgeber.starten();
    this.log.info?.(
      `[Server] "${this.konfiguration.server.name}" läuft – Karte "${this.spielWelt.karte.daten.name}", ${TICK_RATE} Ticks/s`,
    );
  }

  stoppen(grund = 'Server wird beendet') {
    this.taktgeber.stoppen();
    for (const sitzung of this.sitzungen) sitzung.kanal.trennen(grund);
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

    const zustand = kodiere({ typ: NACHRICHT.ZUSTAND, ...this.spielWelt.schnappschuss() });
    let gegenstaende = null;
    if (this.spielWelt.gegenstaendeVersion !== this.gesendeteGegenstaendeVersion) {
      this.gesendeteGegenstaendeVersion = this.spielWelt.gegenstaendeVersion;
      gegenstaende = kodiere({ typ: NACHRICHT.GEGENSTAENDE, gegenstaende: this.spielWelt.gegenstaendeListe() });
    }

    for (const sitzung of this.sitzungen) {
      if (sitzung.status !== 'imSpiel') continue;
      if (gegenstaende) sitzung.kanal.senden(gegenstaende);
      sitzung.kanal.senden(zustand);
    }
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
      case NACHRICHT.PING:
        if (Number.isFinite(nachricht.t)) this.#senden(sitzung, { typ: NACHRICHT.PONG, t: nachricht.t });
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
    if (!BENUTZERNAME_MUSTER.test(benutzername)) {
      return this.#loginAblehnen(sitzung, 'Ungültiger Benutzername (2–20 Zeichen, Buchstaben/Ziffern/_/-)');
    }

    sitzung.status = 'prueftLogin';
    const ergebnis = await this.authentifizierung.pruefe(benutzername, passwort);
    if (!this.sitzungen.has(sitzung)) return; // Verbindung inzwischen weg

    if (!ergebnis.ok) return this.#loginAblehnen(sitzung, ergebnis.grund ?? 'Login fehlgeschlagen');
    if (this.spielerAnzahl >= this.konfiguration.server.maxSpieler) return this.#loginAblehnen(sitzung, 'Server ist voll');

    const name = ergebnis.benutzername;
    const bereitsDa = [...this.sitzungen].some(
      (s) => s !== sitzung && s.status === 'imSpiel' && s.benutzername.toLowerCase() === name.toLowerCase(),
    );
    if (bereitsDa) return this.#loginAblehnen(sitzung, 'Dieser Account ist bereits eingeloggt');

    const spieler = this.spielWelt.spielerBetrittWelt(name);
    clearTimeout(sitzung.loginTimer);
    sitzung.status = 'imSpiel';
    sitzung.benutzername = name;
    sitzung.spielerId = spieler.id;

    this.#senden(sitzung, {
      typ: NACHRICHT.ANMELDUNG_OK,
      spielerId: spieler.id,
      serverName: this.konfiguration.server.name,
      tickRate: TICK_RATE,
      karte: this.spielWelt.karte.daten,
      physik: this.spielWelt.physikParameter(),
      start: { x: spieler.x, y: spieler.y },
      gegenstaende: this.spielWelt.gegenstaendeListe(),
    });
    this.log.info?.(`[Server] ${name} ist beigetreten (${this.spielerAnzahl} online)`);
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
    spieler.eingabePuffer.push({ seq: n.seq, x: n.x, y: n.y, blick: Number.isFinite(n.blick) ? n.blick : spieler.blick });
  }

  #verbindungGetrennt(sitzung, grund) {
    if (!this.sitzungen.has(sitzung)) return;
    this.sitzungen.delete(sitzung);
    clearTimeout(sitzung.loginTimer);
    if (sitzung.spielerId !== null) {
      this.spielWelt.entfernen(sitzung.spielerId);
      this.log.info?.(`[Server] ${sitzung.benutzername} hat das Spiel verlassen (${grund ?? 'getrennt'})`);
    }
  }
}

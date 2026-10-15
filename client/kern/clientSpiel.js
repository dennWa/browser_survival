import { TICK_DAUER_MS, TICK_DAUER_S } from '../../gemeinsam/konstanten.js';
import { NACHRICHT } from '../../gemeinsam/protokoll.js';
import { Welt } from '../../gemeinsam/welt/welt.js';
import { wendeEingabeAn } from '../../gemeinsam/physik/bewegung.js';
import { lerp, lerpWinkel } from '../../gemeinsam/mathe.js';
import { INTERPOLATIONS_VERZOEGERUNG_MS, PING_INTERVALL_MS } from '../konfiguration.js';
import { SpielSchleife } from './spielSchleife.js';

/** Maximal gemerkte, vom Server noch nicht bestätigte Eingaben (~4 s). */
const MAX_OFFENE_EINGABEN = 120;

/**
 * Eine laufende Spielsitzung im Client (existiert ab erfolgreichem Login bis zur Trennung).
 *
 * Netzwerk-Techniken (Stichworte zum Nachlesen: "Gabriel Gambetta Fast-Paced Multiplayer"):
 *   1. Client-Side Prediction: Der eigene Spieler bewegt sich sofort lokal (keine Eingabeverzögerung).
 *   2. Server Reconciliation:  Kommt ein Server-Zustand, wird die eigene Position übernommen und
 *                              alle noch unbestätigten Eingaben erneut angewendet.
 *   3. Entity Interpolation:   Andere Spieler/Zombies werden zwischen zwei Server-Schnappschüssen
 *                              weich interpoliert (leicht verzögert dargestellt).
 */
export class ClientSpiel {
  constructor({ verbindung, anmeldeDaten, eingabe, renderer, hud, beiEnde }) {
    this.verbindung = verbindung;
    this.eingabe = eingabe;
    this.renderer = renderer;
    this.hud = hud;
    this.beiEnde = beiEnde;

    this.serverName = anmeldeDaten.serverName;
    this.eigeneId = anmeldeDaten.spielerId;
    this.welt = new Welt(anmeldeDaten.karte);
    this.physik = anmeldeDaten.physik;
    this.gegenstaende = anmeldeDaten.gegenstaende ?? [];

    // Vorhergesagter eigener Spieler (+ Position vom vorherigen Takt für weiche Darstellung)
    this.lokal = { x: anmeldeDaten.start.x, y: anmeldeDaten.start.y, blick: 0 };
    this.lokalVorher = { x: this.lokal.x, y: this.lokal.y };
    this.eigeneDaten = null; // letzter Server-Stand des eigenen Spielers (Leben, Name …)
    this.seq = 0;
    this.offeneEingaben = [];

    this.schnappschuesse = []; // [{ empfangen, tick, entitaeten: Map }]
    this.ping = null;
    this.letzterTick = 0;
    this.beendet = false;

    this.renderer.setzeWelt(this.welt);
    this.abmelden = [
      verbindung.beiNachricht((n) => this.#nachricht(n)),
      verbindung.beiTrennung((grund) => this.beenden(grund)),
    ];
    const pingSenden = () => this.verbindung.senden({ typ: NACHRICHT.PING, t: performance.now() });
    pingSenden();
    this.pingTimer = setInterval(pingSenden, PING_INTERVALL_MS);

    this.schleife = new SpielSchleife({
      tickDauerMs: TICK_DAUER_MS,
      festerTakt: () => this.#festerTakt(),
      zeichne: (alpha, jetzt) => this.#zeichne(alpha, jetzt),
    });
    this.schleife.starten();
  }

  /** Sitzung beenden (Logout, Kick, Verbindungsverlust). Idempotent. */
  beenden(grund) {
    if (this.beendet) return;
    this.beendet = true;
    this.schleife.stoppen();
    clearInterval(this.pingTimer);
    for (const ab of this.abmelden) ab();
    if (!this.verbindung.getrennt) this.verbindung.trennen('Abgemeldet');
    this.beiEnde?.(grund);
  }

  // ---------------------------------------------------------------------------
  // Netzwerk

  #nachricht(n) {
    switch (n.typ) {
      case NACHRICHT.ZUSTAND:
        this.#zustandEmpfangen(n);
        break;
      case NACHRICHT.GEGENSTAENDE:
        this.gegenstaende = n.gegenstaende;
        break;
      case NACHRICHT.PONG:
        this.ping = Math.round(performance.now() - n.t);
        break;
      case NACHRICHT.SYSTEM:
        console.info('[Server]', n.text);
        break;
    }
  }

  #zustandEmpfangen(n) {
    if (n.tick <= this.letzterTick) return; // veraltet/doppelt
    this.letzterTick = n.tick;

    const entitaeten = new Map(n.entitaeten.map((e) => [e.id, e]));
    this.schnappschuesse.push({ empfangen: performance.now(), tick: n.tick, entitaeten });
    if (this.schnappschuesse.length > 60) this.schnappschuesse.shift();

    const eigene = entitaeten.get(this.eigeneId);
    if (!eigene) return;
    this.eigeneDaten = eigene;

    // Server Reconciliation: Server-Position übernehmen, unbestätigte Eingaben nachspielen
    this.offeneEingaben = this.offeneEingaben.filter((e) => e.seq > eigene.seq);
    this.lokal.x = eigene.x;
    this.lokal.y = eigene.y;
    for (const eingabe of this.offeneEingaben) {
      wendeEingabeAn(this.lokal, eingabe, this.welt, this.physik, TICK_DAUER_S);
    }
  }

  // ---------------------------------------------------------------------------
  // Fester Takt: Eingabe erfassen, lokal vorhersagen, an Server schicken

  #festerTakt() {
    const richtung = this.eingabe.richtung();
    const eingabe = { seq: ++this.seq, x: richtung.x, y: richtung.y, blick: this.#blickZurMaus() };

    this.lokalVorher.x = this.lokal.x;
    this.lokalVorher.y = this.lokal.y;
    wendeEingabeAn(this.lokal, eingabe, this.welt, this.physik, TICK_DAUER_S);

    this.offeneEingaben.push(eingabe);
    if (this.offeneEingaben.length > MAX_OFFENE_EINGABEN) this.offeneEingaben.shift();
    this.verbindung.senden({ typ: NACHRICHT.EINGABE, ...eingabe });
  }

  #blickZurMaus() {
    const maus = this.renderer.kamera.bildschirmZuWelt(this.eingabe.mausX, this.eingabe.mausY);
    return Math.atan2(maus.y - this.lokal.y, maus.x - this.lokal.x);
  }

  // ---------------------------------------------------------------------------
  // Darstellung

  #zeichne(alpha, jetzt) {
    const eigen = {
      ...(this.eigeneDaten ?? { id: this.eigeneId, typ: 'spieler', name: '' }),
      x: lerp(this.lokalVorher.x, this.lokal.x, alpha),
      y: lerp(this.lokalVorher.y, this.lokal.y, alpha),
      blick: this.lokal.blick,
      istEigener: true,
    };
    const andere = this.#interpolierteEntitaeten(jetzt - INTERPOLATIONS_VERZOEGERUNG_MS);

    this.renderer.zeichne({ fokus: eigen, entitaeten: [...andere, eigen], gegenstaende: this.gegenstaende });
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
    });
  }

  /** Alle fremden Entitäten zur Zeit `renderZeit` – zwischen den beiden passenden Schnappschüssen. */
  #interpolierteEntitaeten(renderZeit) {
    const liste = this.schnappschuesse;
    if (liste.length === 0) return [];

    // Alte Schnappschüsse wegwerfen, die wir nicht mehr brauchen
    while (liste.length >= 2 && liste[1].empfangen <= renderZeit) liste.shift();

    const a = liste[0];
    const b = liste[1];
    const ergebnis = [];
    if (!b || renderZeit <= a.empfangen) {
      for (const e of a.entitaeten.values()) if (e.id !== this.eigeneId) ergebnis.push(e);
      return ergebnis;
    }

    const t = (renderZeit - a.empfangen) / (b.empfangen - a.empfangen);
    for (const neu of b.entitaeten.values()) {
      if (neu.id === this.eigeneId) continue;
      const alt = a.entitaeten.get(neu.id);
      if (!alt) {
        ergebnis.push(neu);
        continue;
      }
      ergebnis.push({ ...neu, x: lerp(alt.x, neu.x, t), y: lerp(alt.y, neu.y, t), blick: lerpWinkel(alt.blick, neu.blick, t) });
    }
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

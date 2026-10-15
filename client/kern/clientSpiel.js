import { AUFHEB_REICHWEITE, TICK_DAUER_MS, TICK_DAUER_S } from '../../gemeinsam/konstanten.js';
import { AKTIONEN, NACHRICHT } from '../../gemeinsam/protokoll.js';
import { Welt } from '../../gemeinsam/welt/welt.js';
import { wendeEingabeAn } from '../../gemeinsam/physik/bewegung.js';
import { lerp, lerpWinkel } from '../../gemeinsam/mathe.js';
import { INTERPOLATIONS_VERZOEGERUNG_MS, PING_INTERVALL_MS } from '../konfiguration.js';
import { Effekte } from '../darstellung/effekte.js';
import { SpielSchleife } from './spielSchleife.js';

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
  constructor({ verbindung, anmeldeDaten, eingabe, renderer, hud, sound, beiEnde }) {
    this.verbindung = verbindung;
    this.eingabe = eingabe;
    this.renderer = renderer;
    this.hud = hud;
    this.sound = sound;
    this.beiEnde = beiEnde;

    this.serverName = anmeldeDaten.serverName;
    this.eigeneId = anmeldeDaten.spielerId;
    this.welt = new Welt(anmeldeDaten.karte);
    this.physik = anmeldeDaten.physik;
    this.gegenstaende = anmeldeDaten.gegenstaende ?? [];
    this.itemDefinitionen = anmeldeDaten.itemDefinitionen ?? {};
    this.spielerDaten = anmeldeDaten.spielerDaten;
    this.effekte = new Effekte();
    this.effekte.beiEreignis = (e) => this.#ereignisSound(e);
    this.schrittWeg = 0;
    this.letztesStoehnen = 0;

    // Vorhergesagter eigener Spieler (+ Position vom vorherigen Takt für weiche Darstellung)
    this.lokal = { x: anmeldeDaten.start.x, y: anmeldeDaten.start.y, blick: 0 };
    this.lokalVorher = { x: this.lokal.x, y: this.lokal.y };
    this.eigeneDaten = null; // letzter öffentlicher Server-Stand des eigenen Spielers
    this.seq = 0;
    this.offeneEingaben = [];

    this.schnappschuesse = []; // [{ empfangen, tick, entitaeten: Map }]
    this.ping = null;
    this.letzterTick = 0;
    this.beendet = false;

    this.renderer.setzeWelt(this.welt);
    this.hud.setzeSpielerDaten(this.spielerDaten, this.itemDefinitionen);
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
    this.sound?.starteAtmosphaere();
  }

  /** Sitzung beenden (Logout, Kick, Verbindungsverlust). Idempotent. */
  beenden(grund) {
    if (this.beendet) return;
    this.beendet = true;
    this.schleife.stoppen();
    this.sound?.stoppeAtmosphaere();
    clearInterval(this.pingTimer);
    for (const ab of this.abmelden) ab();
    if (!this.verbindung.getrennt) this.verbindung.trennen('Abgemeldet');
    this.beiEnde?.(grund);
  }

  // ---------------------------------------------------------------------------
  // Aktionen (Tasten, HUD-Knöpfe) → Server

  aufheben() {
    if (this.#naechsterGegenstand()) this.#aktion(AKTIONEN.AUFHEBEN);
  }

  nachladen() {
    this.#aktion(AKTIONEN.NACHLADEN);
  }

  benutzen(slot) {
    this.#aktion(AKTIONEN.BENUTZEN, slot);
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
      case NACHRICHT.ZUSTAND:
        this.#zustandEmpfangen(n);
        break;
      case NACHRICHT.GEGENSTAENDE:
        this.gegenstaende = n.gegenstaende;
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
    this.hud.setzeSpielerDaten(daten, this.itemDefinitionen);
  }

  #zustandEmpfangen(n) {
    if (n.tick <= this.letzterTick) return; // veraltet/doppelt
    this.letzterTick = n.tick;
    const jetzt = performance.now();

    const entitaeten = new Map(n.entitaeten.map((e) => [e.id, e]));
    this.schnappschuesse.push({ empfangen: jetzt, tick: n.tick, entitaeten });
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
    const eingabe = {
      seq: ++this.seq,
      x: richtung.x,
      y: richtung.y,
      blick: this.#blick(),
      angriff: !tot && this.eingabe.angriff(),
      sprint: !tot && this.eingabe.sprint(),
    };

    this.lokalVorher.x = this.lokal.x;
    this.lokalVorher.y = this.lokal.y;
    if (!tot) wendeEingabeAn(this.lokal, eingabe, this.welt, this.physik, TICK_DAUER_S);
    this.#schritte();
    this.#zombieStoehnen();

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
    const weg = Math.hypot(this.lokal.x - this.lokalVorher.x, this.lokal.y - this.lokalVorher.y);
    this.schrittWeg += weg;
    if (this.schrittWeg < SCHRITT_ABSTAND * (this.lokal.sprintet ? 1.35 : 1)) return;
    this.schrittWeg = 0;
    this.sound?.spiele('schritt', { lautstaerke: this.lokal.sprintet ? 0.5 : 0.3, tonhoehe: 0.8 + Math.random() * 0.4 });
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
    if (this.physik.ausdauerMax) this.hud.setzeAusdauer(this.lokal.ausdauer / this.physik.ausdauerMax, this.lokal.erschoepft);
    const andere = this.#interpolierteEntitaeten(jetzt - INTERPOLATIONS_VERZOEGERUNG_MS);
    const aufhebbar = this.spielerDaten?.tot ? null : this.#naechsterGegenstand();

    this.renderer.zeichne({
      fokus: eigen,
      entitaeten: [...andere, eigen],
      gegenstaende: this.gegenstaende,
      jetzt,
      effekte: this.effekte,
      markiertId: aufhebbar?.id ?? null,
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
      aufhebbar: aufhebbar ? (aufhebbar.menge > 1 ? `${aufhebbar.name} ×${aufhebbar.menge}` : aufhebbar.name) : null,
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
    const dauer = Math.max(1, b.tick - a.tick) * TICK_DAUER_S;
    for (const neu of b.entitaeten.values()) {
      if (neu.id === this.eigeneId) continue;
      const alt = a.entitaeten.get(neu.id);
      if (!alt) {
        ergebnis.push(neu);
        continue;
      }
      const dx = neu.x - alt.x;
      const dy = neu.y - alt.y;
      ergebnis.push({
        ...neu,
        x: lerp(alt.x, neu.x, t),
        y: lerp(alt.y, neu.y, t),
        blick: lerpWinkel(alt.blick, neu.blick, t),
        geschwindigkeit: Math.hypot(dx, dy) / dauer, // für Lauf-Animationen
        bewegungsWinkel: Math.atan2(dy, dx),
      });
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

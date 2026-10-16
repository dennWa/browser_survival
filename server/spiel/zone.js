import { NACHRICHT, kodiere } from '../../gemeinsam/protokoll.js';
import { SpielWelt } from './spielWelt.js';

/**
 * Interest Management: Zombies & Autos gehen nur an Spieler, die sie sehen könnten (Quadrat ± NETZ_SICHTWEITE px).
 * Maximal sichtbar: rausgezoomt + im Auto auf 21:9 ≈ 2100 px seitlich (Kamera: renderer.js) → 2400 mit Reserve.
 * Mitspieler gehen immer raus (Karte K, Spielerliste).
 */
export const NETZ_SICHTWEITE = 2400;

/**
 * Eine Zone der offenen Welt = eine Karte mit eigener SpielWelt (Zombies, Loot, Bauwerke, Autos …).
 * Der SpielServer hält alle Zonen (Map kartenId → Zone), schickt jedem Spieler nur die Daten SEINER Zone
 * und zieht Spieler um, wenn sie einen Übergang betreten (spieler.zonenwechsel, siehe systeme/zonenSystem.js).
 *
 * Gespeichert wird pro Zone unter "welt:<kartenId>" (Bauwerke, Autos, Uhrzeit).
 * Zonen ohne Spieler pausieren (außer der Startzone, deren Uhr die Weltuhr ist) – beim Betreten wird nachgeholt.
 */
export class Zone {
  /**
   * @param {object} o
   * @param {object} o.konfiguration  gemeinsame Konfiguration (alle Zonen teilen sich dasselbe Objekt)
   * @param {object} [o.kartenDefinition] Karte (sonst konfiguration.welt.karte)
   * @param {{ laden: Function }} o.speicher
   * @param {Console} o.log
   */
  constructor({ konfiguration, kartenDefinition, speicher, log }) {
    this.spielWelt = new SpielWelt(konfiguration, { kartenDefinition });
    this.id = this.spielWelt.karte.daten.id;
    this.name = this.spielWelt.karte.daten.name;
    this.weltSchluessel = `welt:${this.id}`;
    this.log = log;
    this.aktiv = false; // wurde im letzten Tick simuliert
    this.#merkeVersionen();
    this.geladen = this.#ladeWelt(speicher);
  }

  /** Gebaute Sachen, Uhrzeit & Tag vom letzten Mal (Speicher-Schlüssel "welt:<kartenId>"). */
  async #ladeWelt(speicher) {
    try {
      const stand = await speicher.laden(this.weltSchluessel);
      if (stand && this.spielWelt.uebernimmWeltzustand(stand)) {
        this.log.info?.(`[Server] Zone "${this.id}" geladen: ${this.spielWelt.welt.bauwerke.size} Bauwerke, Tag ${this.spielWelt.tag}`);
      }
    } catch (fehler) {
      this.log.error?.(`[Server] Weltzustand von "${this.id}" nicht ladbar:`, fehler);
    }
  }

  #merkeVersionen() {
    const w = this.spielWelt;
    this.gesendet = { gegenstaende: w.gegenstaendeVersion, tueren: w.tuerenVersion, ressourcen: w.welt.ressourcenVersion, bauwerke: w.welt.bauwerkeVersion };
  }

  /**
   * Nachrichten dieses Ticks an alle Sitzungen der Zone: Listen nur bei Änderung, Schnappschuss immer.
   * @param sitzungen  Sitzungen im Spiel, die in dieser Zone sind
   * @param privat     (sitzung) → private Spielerdaten senden (macht der SpielServer)
   */
  versende(sitzungen, privat) {
    const w = this.spielWelt;
    const g = this.gesendet;
    const pakete = [];
    if (w.gegenstaendeVersion !== g.gegenstaende) pakete.push(kodiere({ typ: NACHRICHT.GEGENSTAENDE, gegenstaende: w.gegenstaendeListe() }));
    if (w.tuerenVersion !== g.tueren) pakete.push(kodiere({ typ: NACHRICHT.TUEREN, offen: w.welt.offeneTueren() }));
    if (w.welt.ressourcenVersion !== g.ressourcen) pakete.push(kodiere({ typ: NACHRICHT.RESSOURCEN, abgebaut: [...w.welt.abgebaut] }));
    if (w.welt.bauwerkeVersion !== g.bauwerke) {
      // Wenige Änderungen (ein Hammerschlag) → nur das Delta; sehr viele (Weltstand geladen) → ganze Liste
      const delta = w.nimmBauwerkAenderungen();
      pakete.push(kodiere(delta ? { typ: NACHRICHT.BAUWERKE_AENDERUNG, ...delta } : { typ: NACHRICHT.BAUWERKE, liste: w.bauwerkeOeffentlich() }));
    }
    this.#merkeVersionen();
    const schnappschuss = w.schnappschuss();
    let alle = null; // ungefiltert, nur einmal kodiert (wenn jemand alles sieht – auf kleinen Karten der Normalfall)

    const meldungen = new Map();
    for (const { spielerId, text } of w.meldungen) {
      if (!meldungen.has(spielerId)) meldungen.set(spielerId, []);
      meldungen.get(spielerId).push(text);
    }
    w.meldungen = []; // erst nach dem Einsammeln leeren (auch Meldungen zwischen zwei Ticks kommen an)
    const kisten = new Map(); // Kisten-Ansichten (nur der Öffner bekommt den Inhalt)
    for (const k of w.kistenNachrichten) {
      if (!kisten.has(k.spielerId)) kisten.set(k.spielerId, []);
      kisten.get(k.spielerId).push(k);
    }
    w.kistenNachrichten = [];

    for (const sitzung of sitzungen) {
      for (const paket of pakete) sitzung.kanal.senden(paket);
      const ich = w.holen(sitzung.spielerId);
      const sichtbar = ich ? schnappschuss.entitaeten.filter((e) => e.typ === 'spieler' || (Math.abs(e.x - ich.x) < NETZ_SICHTWEITE && Math.abs(e.y - ich.y) < NETZ_SICHTWEITE)) : schnappschuss.entitaeten;
      if (sichtbar.length === schnappschuss.entitaeten.length) sitzung.kanal.senden((alle ??= kodiere({ typ: NACHRICHT.ZUSTAND, ...schnappschuss })));
      else sitzung.kanal.senden(kodiere({ typ: NACHRICHT.ZUSTAND, ...schnappschuss, entitaeten: sichtbar }));
      privat(sitzung);
      for (const k of kisten.get(sitzung.spielerId) ?? []) sitzung.kanal.senden(kodiere({ typ: NACHRICHT.KISTE, id: k.id, inhalt: k.inhalt }));
      for (const text of meldungen.get(sitzung.spielerId) ?? []) sitzung.kanal.senden(kodiere({ typ: NACHRICHT.MELDUNG, text }));
    }
  }

  /** Was der Client zum Aufbauen der Zone braucht (Teil von ANMELDUNG_OK / ZONE_WECHSEL). */
  weltDaten() {
    const w = this.spielWelt;
    return {
      karte: w.karte.daten,
      physik: w.physikParameter(),
      gegenstaende: w.gegenstaendeListe(),
      tueren: w.welt.offeneTueren(),
      abgebaut: [...w.welt.abgebaut],
      bauwerke: w.bauwerkeOeffentlich(),
      tageszeit: w.tageszeitDauer(),
      zeit: w.zeit,
      tag: w.tag,
    };
  }

  /** Ankunftspunkt (Pixel) – oder ein Spieler-Start der Karte, wenn es die Ankunft nicht gibt. */
  ankunft(name) {
    const karte = this.spielWelt.karte;
    return karte.ankuenfte?.[name] ?? this.spielWelt.zufall.auswahl(karte.spielerStarts);
  }
}

import { TICK_DAUER_S } from '../../gemeinsam/konstanten.js';
import { Welt } from '../../gemeinsam/welt/welt.js';
import { ladeKarte, verarbeiteKarte } from './karten/kartenLader.js';
import { Zufall } from './zufall.js';
import { erzeugeSpieler, spielerZuNetzwerk } from './entitaeten/spieler.js';
import { erzeugeZombie, waehleZombieVariante, zombieZuNetzwerk } from './entitaeten/zombie.js';
import { gegenstandZuNetzwerk } from './entitaeten/gegenstand.js';
import { verarbeiteSpielerEingaben } from './systeme/bewegungsSystem.js';
import { verarbeiteAktionen, aktualisiereNachladen, gibStartausruestung } from './systeme/inventarSystem.js';
import { aktualisiereKampf } from './systeme/kampfSystem.js';
import { aktualisiereZombies } from './systeme/zombieSystem.js';
import { aktualisiereUeberleben } from './systeme/ueberlebenSystem.js';
import { verteileStartLoot, aktualisiereLoot } from './systeme/lootSystem.js';
import { aktualisiereTageszeit } from './systeme/tageszeitSystem.js';
import { aktualisiereArbeit } from './systeme/arbeitSystem.js';
import { aktualisiereBauwerke } from './systeme/bauSystem.js';
import { aktualisiereFahrzeuge, aussteigen } from './systeme/fahrzeugSystem.js';
import { erzeugeFahrzeug, fahrzeugZuNetzwerk } from './entitaeten/fahrzeug.js';
import { FAHRZEUG_MODELLE, fahrzeugAusObjekt, passt } from '../../gemeinsam/physik/fahrzeug.js';
import { BAUWERKE, PFLANZEN, pruefePlatz } from '../../gemeinsam/welt/bauwerke.js';

/** Welche Entitätstypen jeden Tick im Schnappschuss landen (dynamisch) – und wie sie serialisiert werden. */
const NETZWERK_SERIALISIERER = {
  spieler: spielerZuNetzwerk,
  zombie: zombieZuNetzwerk,
  fahrzeug: fahrzeugZuNetzwerk,
};

/**
 * Der komplette autoritative Spielzustand: Karte, alle Entitäten, Tick-Zähler.
 * Kennt KEINE Verbindungen oder Accounts – das macht der SpielServer.
 *
 * Pro Tick gesammelt (und danach vom SpielServer verschickt):
 *   ereignisse  → an alle (Schüsse, Treffer, Tode … für Effekte)
 *   meldungen   → { spielerId, text } nur an den jeweiligen Spieler (sammeln sich bis zum Versand)
 */
export class SpielWelt {
  /** @param optionen.kartenDefinition  eigene Karte statt konfiguration.welt.karte (z. B. für Tests) */
  constructor(konfiguration, { kartenDefinition } = {}) {
    this.konfiguration = konfiguration;
    this.zufall = new Zufall(konfiguration.server.zufallsStartwert ?? undefined);
    const karte = kartenDefinition ? verarbeiteKarte(kartenDefinition) : ladeKarte(konfiguration.welt.karte);
    // Autos auf der Karte werden zu Fahrzeugen (Entitäten) – aus den Möbeln raus, auch für den Client (karte.daten)
    const autos = karte.daten.objekte.filter((o) => FAHRZEUG_MODELLE[o.typ]);
    this.karte = { ...karte, daten: { ...karte.daten, objekte: karte.daten.objekte.filter((o) => !FAHRZEUG_MODELLE[o.typ]) } };
    this.welt = new Welt(this.karte.daten);
    this.entitaeten = new Map();
    this.tick = 0;
    /** Wird erhöht, wenn Gegenstände hinzukommen/verschwinden/sich ändern → Server schickt neue Liste. */
    this.gegenstaendeVersion = 0;
    this.naechsteId = 1;
    this.naechsteBauwerkId = 1;
    this.ereignisse = [];
    this.meldungen = [];
    this.zombieRespawns = []; // [{ spawnIndex, rest }]
    this.lootZustand = [];
    /** Wird bei jeder Türänderung erhöht → Server schickt TUEREN */
    this.tuerenVersion = 0;
    this.tuerLeben = new Map(); // Tür-ID → verbleibende Lebenspunkte (nur angeschlagene Türen)
    this.ressourcenNachwuchs = new Map(); // Ressourcen-ID → Sekunden bis zum Nachwachsen
    if (konfiguration.welt.tuerenGeschlossen) for (const t of this.welt.tueren) this.welt.setzeTuer(t.id, false);
    /** Sekunden seit Tagesbeginn (siehe gemeinsam/tageszeit.js) und Tageszähler */
    this.zeit = konfiguration.welt.startZeit ?? 0;
    this.tag = 1;
    this.istNacht = false;

    for (const o of autos) this.hinzufuegen(erzeugeFahrzeug({ id: this.neueId(), ...fahrzeugAusObjekt(o, this.welt.kachelGroesse) }));
    this.karte.zombieSpawns.forEach((spawn, spawnIndex) => this.spawneZombie(spawnIndex));
    verteileStartLoot(this);
  }

  neueId() {
    return this.naechsteId++;
  }

  neueBauwerkId() {
    return this.naechsteBauwerkId++;
  }

  /**
   * Was von der Welt einen Server-Neustart überlebt (gespeichert als "welt:<kartenId>" im Speicher):
   * gebaute Sachen (inkl. Beete & Pflanzen), Uhrzeit und Tag.
   */
  weltzustand() {
    const fahrzeuge = [...this.alleVomTyp('fahrzeug')].map(({ modell, x, y, winkel }) => ({ modell, x, y, winkel }));
    return { version: 1, karte: this.karte.daten.id, zeit: this.zeit, tag: this.tag, bauwerke: [...this.welt.bauwerke.values()], fahrzeuge };
  }

  /** Gespeicherten Weltzustand übernehmen – alles wird geprüft (Datei kann alt oder kaputt sein). */
  uebernimmWeltzustand(stand) {
    if (!stand || stand.version !== 1 || stand.karte !== this.karte.daten.id) return false;
    if (Number.isFinite(stand.zeit) && stand.zeit >= 0) this.zeit = stand.zeit;
    if (Number.isInteger(stand.tag) && stand.tag >= 1) this.tag = stand.tag;
    for (const roh of Array.isArray(stand.bauwerke) ? stand.bauwerke : []) {
      const b = pruefeBauwerk(roh);
      if (!b || !pruefePlatz(this.welt, b.typ, b.tx, b.ty).ok) continue;
      b.id = this.neueBauwerkId();
      this.welt.setzeBauwerk(b);
    }
    // Autos stehen da, wo sie zuletzt geparkt wurden (Anzahl & Modelle wie auf der Karte)
    const gespeichert = Array.isArray(stand.fahrzeuge) ? stand.fahrzeuge : [];
    const vorhanden = [...this.alleVomTyp('fahrzeug')];
    for (const fz of vorhanden) {
      const i = gespeichert.findIndex((f) => f?.modell === fz.modell && Number.isFinite(f.x) && Number.isFinite(f.y) && Number.isFinite(f.winkel));
      if (i < 0) continue;
      const [f] = gespeichert.splice(i, 1);
      const probe = { ...fz, x: f.x, y: f.y, winkel: f.winkel };
      if (passt(probe, f.x, f.y, this.welt)) Object.assign(fz, { x: f.x, y: f.y, winkel: f.winkel, letzteKacheln: '' });
    }
    return true;
  }

  hinzufuegen(entitaet) {
    this.entitaeten.set(entitaet.id, entitaet);
    if (entitaet.typ === 'gegenstand') this.gegenstaendeVersion++;
    return entitaet;
  }

  entfernen(id) {
    const entitaet = this.entitaeten.get(id);
    if (!entitaet) return;
    if (entitaet.fahrzeug) aussteigen(this, entitaet, { erzwingen: true }); // Spieler geht offline im Auto
    if (entitaet.typ === 'fahrzeug') this.welt.entferneFahrzeugKacheln(id);
    this.entitaeten.delete(id);
    if (entitaet.typ === 'gegenstand') this.gegenstaendeVersion++;
  }

  holen(id) {
    return this.entitaeten.get(id);
  }

  *alleVomTyp(typ) {
    for (const e of this.entitaeten.values()) if (e.typ === typ) yield e;
  }

  anzahlVomTyp(typ) {
    let n = 0;
    for (const _ of this.alleVomTyp(typ)) n++;
    return n;
  }

  /** Bewegungsparameter für Spieler – gehen beim Login auch an den Client (für die Vorhersage). */
  physikParameter() {
    const { geschwindigkeit, radius, sprintFaktor, ausdauerMax, ausdauerVerbrauch, ausdauerRegeneration, sprintMinimum } =
      this.konfiguration.spieler;
    return { geschwindigkeit, radius, sprintFaktor, ausdauerMax, ausdauerVerbrauch, ausdauerRegeneration, sprintMinimum };
  }

  /** Zombie an einem Spawnpunkt der Karte erzeugen (Variante zufällig nach Gewicht). */
  spawneZombie(spawnIndex) {
    const spawn = this.karte.zombieSpawns[spawnIndex];
    return this.hinzufuegen(
      erzeugeZombie({
        id: this.neueId(),
        x: spawn.x,
        y: spawn.y,
        konfiguration: this.konfiguration,
        spawnIndex,
        variante: waehleZombieVariante(this.zufall, this.konfiguration),
      }),
    );
  }

  spielerBetrittWelt(benutzername, { admin = false } = {}) {
    const start = this.zufall.auswahl(this.karte.spielerStarts);
    const spieler = gibStartausruestung(erzeugeSpieler({ id: this.neueId(), benutzername, x: start.x, y: start.y, konfiguration: this.konfiguration, admin }), this.konfiguration);
    spieler.erkundet = new Uint8Array(this.welt.breite * this.welt.hoehe); // Karte (K), siehe gemeinsam/welt/erkundung.js
    return this.hinzufuegen(spieler);
  }

  ereignis(ereignis) {
    this.ereignisse.push(ereignis);
  }

  melde(spielerId, text) {
    this.meldungen.push({ spielerId, text });
  }

  /** Startet eine Aktion für Animationen (Schuss, Nachladen, Angriff …); läuft nach `dauer` Sekunden ab. */
  setzeAktion(entitaet, art, dauer) {
    entitaet.aktion = art;
    entitaet.aktionTick = this.tick;
    entitaet.aktionDauer = dauer;
  }

  planeZombieRespawn(spawnIndex) {
    if (spawnIndex === null || spawnIndex === undefined) return;
    this.zombieRespawns.push({ spawnIndex, rest: this.konfiguration.zombie.respawnZeit });
  }

  /** Ein Simulationsschritt. Reihenfolge der Systeme ist bewusst festgelegt. */
  aktualisiere(dt) {
    this.tick++;
    this.ereignisse = []; // Meldungen leert der SpielServer nach dem Versand
    this.#beendeAbgelaufeneAktionen();
    verarbeiteSpielerEingaben(this);
    aktualisiereFahrzeuge(this, dt);
    verarbeiteAktionen(this);
    aktualisiereNachladen(this, dt);
    aktualisiereKampf(this, dt);
    aktualisiereArbeit(this, dt);
    aktualisiereBauwerke(this, dt);
    aktualisiereZombies(this, dt);
    aktualisiereUeberleben(this, dt);
    aktualisiereLoot(this, dt);
    aktualisiereTageszeit(this, dt);
  }

  /** Dauer von Tag und Nacht – geht auch an die Clients (Uhr, Licht). */
  tageszeitDauer() {
    const { tagSekunden, nachtSekunden } = this.konfiguration.welt;
    return { tagSekunden, nachtSekunden };
  }

  #beendeAbgelaufeneAktionen() {
    for (const e of this.entitaeten.values()) {
      if (e.aktion && (this.tick - e.aktionTick) * TICK_DAUER_S >= e.aktionDauer) e.aktion = null;
    }
  }

  schnappschuss() {
    const entitaeten = [];
    for (const e of this.entitaeten.values()) {
      const serialisierer = NETZWERK_SERIALISIERER[e.typ];
      if (serialisierer) entitaeten.push(serialisierer(e));
    }
    return { tick: this.tick, zeit: Math.round(this.zeit * 10) / 10, tag: this.tag, entitaeten, ereignisse: this.ereignisse };
  }

  gegenstaendeListe() {
    return [...this.alleVomTyp('gegenstand')].map(gegenstandZuNetzwerk);
  }
}

/** Ein Bauwerk aus einem (evtl. manipulierten) Spielstand: nur bekannte Felder, gültige Werte. */
function pruefeBauwerk(roh) {
  if (!roh || !BAUWERKE[roh.typ] || !Number.isInteger(roh.tx) || !Number.isInteger(roh.ty)) return null;
  const b = { typ: roh.typ, tx: roh.tx, ty: roh.ty, besitzer: typeof roh.besitzer === 'string' ? roh.besitzer.slice(0, 20) : '' };
  if (b.typ === 'lagerfeuer') Object.assign(b, { brennt: roh.brennt === true, brennRest: Number.isFinite(roh.brennRest) ? Math.max(0, roh.brennRest) : 0 });
  if (b.typ === 'falle') b.gespannt = roh.gespannt !== false;
  if (b.typ === 'beet') {
    b.pflanze = PFLANZEN[roh.pflanze] ? roh.pflanze : null;
    b.wachstum = b.pflanze && Number.isFinite(roh.wachstum) ? Math.min(1, Math.max(0, roh.wachstum)) : 0;
  }
  return b;
}

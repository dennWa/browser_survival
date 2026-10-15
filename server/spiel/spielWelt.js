import { TICK_DAUER_S } from '../../gemeinsam/konstanten.js';
import { Welt } from '../../gemeinsam/welt/welt.js';
import { ladeKarte, verarbeiteKarte } from './karten/kartenLader.js';
import { Zufall } from './zufall.js';
import { erzeugeSpieler, spielerZuNetzwerk } from './entitaeten/spieler.js';
import { erzeugeZombie, waehleZombieVariante, zombieZuNetzwerk } from './entitaeten/zombie.js';
import { gegenstandZuNetzwerk } from './entitaeten/gegenstand.js';
import { verarbeiteSpielerEingaben } from './systeme/bewegungsSystem.js';
import { verarbeiteAktionen, aktualisiereNachladen } from './systeme/inventarSystem.js';
import { aktualisiereKampf } from './systeme/kampfSystem.js';
import { aktualisiereZombies } from './systeme/zombieSystem.js';
import { aktualisiereUeberleben } from './systeme/ueberlebenSystem.js';
import { verteileStartLoot, aktualisiereLoot } from './systeme/lootSystem.js';

/** Welche Entitätstypen jeden Tick im Schnappschuss landen (dynamisch) – und wie sie serialisiert werden. */
const NETZWERK_SERIALISIERER = {
  spieler: spielerZuNetzwerk,
  zombie: zombieZuNetzwerk,
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
    this.karte = kartenDefinition ? verarbeiteKarte(kartenDefinition) : ladeKarte(konfiguration.welt.karte);
    this.welt = new Welt(this.karte.daten);
    this.entitaeten = new Map();
    this.tick = 0;
    /** Wird erhöht, wenn Gegenstände hinzukommen/verschwinden/sich ändern → Server schickt neue Liste. */
    this.gegenstaendeVersion = 0;
    this.naechsteId = 1;
    this.ereignisse = [];
    this.meldungen = [];
    this.zombieRespawns = []; // [{ spawnIndex, rest }]
    this.lootZustand = [];

    this.karte.zombieSpawns.forEach((spawn, spawnIndex) => this.spawneZombie(spawnIndex));
    verteileStartLoot(this);
  }

  neueId() {
    return this.naechsteId++;
  }

  hinzufuegen(entitaet) {
    this.entitaeten.set(entitaet.id, entitaet);
    if (entitaet.typ === 'gegenstand') this.gegenstaendeVersion++;
    return entitaet;
  }

  entfernen(id) {
    const entitaet = this.entitaeten.get(id);
    if (!entitaet) return;
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

  spielerBetrittWelt(benutzername) {
    const start = this.zufall.auswahl(this.karte.spielerStarts);
    return this.hinzufuegen(
      erzeugeSpieler({ id: this.neueId(), benutzername, x: start.x, y: start.y, konfiguration: this.konfiguration }),
    );
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
    verarbeiteAktionen(this);
    aktualisiereNachladen(this, dt);
    aktualisiereKampf(this, dt);
    aktualisiereZombies(this, dt);
    aktualisiereUeberleben(this, dt);
    aktualisiereLoot(this, dt);
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
    return { tick: this.tick, entitaeten, ereignisse: this.ereignisse };
  }

  gegenstaendeListe() {
    return [...this.alleVomTyp('gegenstand')].map(gegenstandZuNetzwerk);
  }
}

import { Welt } from '../../gemeinsam/welt/welt.js';
import { ladeKarte } from './karten/kartenLader.js';
import { Zufall } from './zufall.js';
import { erzeugeSpieler, spielerZuNetzwerk } from './entitaeten/spieler.js';
import { erzeugeZombie, zombieZuNetzwerk } from './entitaeten/zombie.js';
import { gegenstandZuNetzwerk } from './entitaeten/gegenstand.js';
import { verarbeiteSpielerEingaben } from './systeme/bewegungsSystem.js';
import { aktualisiereZombies } from './systeme/zombieSystem.js';
import { aktualisiereKampf } from './systeme/kampfSystem.js';
import { verteileStartLoot } from './systeme/lootSystem.js';

/** Welche Entitätstypen jeden Tick im Schnappschuss landen (dynamisch) – und wie sie serialisiert werden. */
const NETZWERK_SERIALISIERER = {
  spieler: spielerZuNetzwerk,
  zombie: zombieZuNetzwerk,
};

/**
 * Der komplette autoritative Spielzustand: Karte, alle Entitäten, Tick-Zähler.
 * Kennt KEINE Verbindungen oder Accounts – das macht der SpielServer.
 */
export class SpielWelt {
  constructor(konfiguration) {
    this.konfiguration = konfiguration;
    this.zufall = new Zufall(konfiguration.server.zufallsStartwert ?? undefined);
    this.karte = ladeKarte(konfiguration.welt.karte);
    this.welt = new Welt(this.karte.daten);
    this.entitaeten = new Map();
    this.tick = 0;
    /** Wird erhöht, wenn Gegenstände hinzukommen/verschwinden → Server schickt neue Liste. */
    this.gegenstaendeVersion = 0;
    this.naechsteId = 1;

    for (const spawn of this.karte.zombieSpawns) {
      this.hinzufuegen(erzeugeZombie({ id: this.neueId(), x: spawn.x, y: spawn.y, konfiguration }));
    }
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
    const { geschwindigkeit, radius } = this.konfiguration.spieler;
    return { geschwindigkeit, radius };
  }

  spielerBetrittWelt(benutzername) {
    const start = this.zufall.auswahl(this.karte.spielerStarts);
    return this.hinzufuegen(
      erzeugeSpieler({ id: this.neueId(), benutzername, x: start.x, y: start.y, konfiguration: this.konfiguration }),
    );
  }

  /** Ein Simulationsschritt. Reihenfolge der Systeme ist bewusst festgelegt. */
  aktualisiere(dt) {
    this.tick++;
    verarbeiteSpielerEingaben(this);
    aktualisiereZombies(this, dt);
    aktualisiereKampf(this, dt);
  }

  schnappschuss() {
    const entitaeten = [];
    for (const e of this.entitaeten.values()) {
      const serialisierer = NETZWERK_SERIALISIERER[e.typ];
      if (serialisierer) entitaeten.push(serialisierer(e));
    }
    return { tick: this.tick, entitaeten };
  }

  gegenstaendeListe() {
    return [...this.alleVomTyp('gegenstand')].map(gegenstandZuNetzwerk);
  }
}

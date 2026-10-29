import { KISTE_PLAETZE, TICK_DAUER_S } from '../../gemeinsam/konstanten.js';
import { Welt } from '../../gemeinsam/welt/welt.js';
import { ladeKarte, verarbeiteKarte } from './karten/kartenLader.js';
import { Zufall } from './zufall.js';
import { erzeugeSpieler, spielerZuNetzwerk } from './entitaeten/spieler.js';
import { erzeugeZombie, waehleZombieVariante, zombieZuNetzwerk } from './entitaeten/zombie.js';
import { tierZuNetzwerk } from './entitaeten/tier.js';
import { gegenstandZuNetzwerk } from './entitaeten/gegenstand.js';
import { verarbeiteSpielerEingaben } from './systeme/bewegungsSystem.js';
import { aktualisiereBots } from './systeme/botSystem.js';
import { verarbeiteAktionen, aktualisiereNachladen, gibStartausruestung } from './systeme/inventarSystem.js';
import { aktualisiereKampf } from './systeme/kampfSystem.js';
import { aktualisiereZombies } from './systeme/zombieSystem.js';
import { aktualisiereUeberleben } from './systeme/ueberlebenSystem.js';
import { verteileStartLoot, aktualisiereLoot } from './systeme/lootSystem.js';
import { aktualisiereTageszeit } from './systeme/tageszeitSystem.js';
import { aktualisiereArbeit } from './systeme/arbeitSystem.js';
import { aktualisiereBauwerke, neuesBauwerk } from './systeme/bauSystem.js';
import { aktualisiereWuerfe } from './systeme/explosionSystem.js';
import { zonenKonfiguration } from './karten/zonenEinstellungen.js';
import { pruefePlaetze } from './systeme/stationSystem.js';
import { aktualisiereFahrzeuge, aussteigen } from './systeme/fahrzeugSystem.js';
import { aktualisiereTueren } from './systeme/tuerSystem.js';
import { aktualisiereTiere, spawneStartTiere } from './systeme/tierSystem.js';
import { aktualisiereAngeln } from './systeme/angelSystem.js';
import { aktualisiereWetter } from './systeme/wetterSystem.js';
import { pruefeEintrag } from './spielstand.js';
import { pruefeUebergaenge } from './systeme/zonenSystem.js';
import { erzeugeFahrzeug, fahrzeugZuNetzwerk } from './entitaeten/fahrzeug.js';
import { FAHRZEUG_MODELLE, fahrzeugAusObjekt, passt } from '../../gemeinsam/physik/fahrzeug.js';
import { BAUWERKE, PFLANZEN, pruefePlatz } from '../../gemeinsam/welt/bauwerke.js';
import { aktualisiereTutorial, erstelleTutorial, tutorialKonfiguration } from './systeme/tutorialSystem.js';
import { erzeugeTerritorium, territoriumLaden, territoriumSpeichern } from './systeme/territoriumSystem.js';

/** Welche Entitätstypen jeden Tick im Schnappschuss landen (dynamisch) – und wie sie serialisiert werden. */
const NETZWERK_SERIALISIERER = {
  spieler: spielerZuNetzwerk,
  zombie: zombieZuNetzwerk,
  tier: tierZuNetzwerk,
  fahrzeug: fahrzeugZuNetzwerk,
};

/**
 * Der komplette autoritative Spielzustand: Karte, alle Entitäten, Tick-Zähler.
 * Kennt KEINE Verbindungen oder Accounts – das macht der SpielServer.
 *
 * v0.10 zusätzlich: wetter {art, rest}, tierRespawns, kistenNachrichten (private Kisten-Ansichten), bauwerkeOeffentlich().
 * v0.11 Basisbau: territorium (Baugebiete der Zone, im Weltzustand gespeichert), bauwerkAenderungen + nimmBauwerkAenderungen() (Delta fürs Netz).
 *
 * Pro Tick gesammelt (und danach vom SpielServer verschickt):
 *   ereignisse  → an alle (Schüsse, Treffer, Tode … für Effekte)
 *   meldungen   → { spielerId, text } nur an den jeweiligen Spieler (sammeln sich bis zum Versand)
 */
export class SpielWelt {
  /** @param optionen.kartenDefinition  eigene Karte statt konfiguration.welt.karte (z. B. für Tests) */
  constructor(konfiguration, { kartenDefinition } = {}) {
    this.zufall = new Zufall(konfiguration.server.zufallsStartwert ?? undefined);
    const karte = kartenDefinition ? verarbeiteKarte(kartenDefinition) : ladeKarte(konfiguration.welt.karte);
    /** Zonen-Werte der Karte (einstellungen) liegen über der gemeinsamen Konfiguration (zonenEinstellungen.js) */
    this.konfiguration = zonenKonfiguration(konfiguration, karte.einstellungen);
    // Tutorial-Zone: eigene Regeln (kein Hunger, schnelle Ressourcen, keine Horde …) – systeme/tutorialSystem.js
    if (karte.tutorial) this.konfiguration = tutorialKonfiguration(this.konfiguration);
    konfiguration = this.konfiguration;
    // Autos auf der Karte werden zu Fahrzeugen (Entitäten) – aus den Möbeln raus, auch für den Client (karte.daten)
    const autos = karte.daten.objekte.filter((o) => FAHRZEUG_MODELLE[o.typ]);
    this.karte = { ...karte, daten: { ...karte.daten, objekte: karte.daten.objekte.filter((o) => !FAHRZEUG_MODELLE[o.typ]) } };
    this.welt = new Welt(this.karte.daten);
    /** Baugebiete (Basis-Flaggen) dieser Zone – gemeinsam/basisbau/territorium.js, Logik: systeme/territoriumSystem.js */
    this.territorium = erzeugeTerritorium();
    /** IDs der Bauwerke, die sich seit dem letzten Versand geändert haben (Zone.versende schickt daraus BAUWERKE_AENDERUNG) */
    this.bauwerkAenderungen = new Set();
    this.welt.beiBauwerkAenderung = (id) => this.bauwerkAenderungen.add(id);
    this.entitaeten = new Map();
    this.tick = 0;
    /** Wird erhöht, wenn Gegenstände hinzukommen/verschwinden/sich ändern → Server schickt neue Liste. */
    this.gegenstaendeVersion = 0;
    this.naechsteId = 1;
    this.naechsteBauwerkId = 1;
    this.ereignisse = [];
    this.meldungen = [];
    this.zombieRespawns = []; // [{ spawnIndex, rest }]
    this.spuckeFluege = []; // Runde 24: fliegende Spucke der Spucker (sonderZombieSystem)
    this.wuerfe = []; // Runde 24: fliegende Rohrbomben/Molotows (explosionSystem)
    this.braende = []; // Runde 24: brennende Flächen (Molotow)
    this.tierRespawns = []; // [{ rest, bereich }] Sekunden bis ein erlegter Hase nachkommt (bereich = Index in karte.tierBereiche oder null)
    /** Wetter dieser Zone (systeme/wetterSystem.js): art 'klar' | 'regen' | 'schnee' (nur Schneezonen) | 'nebel', rest = Sekunden bis zum Wechsel */
    this.wetter = { art: 'klar', rest: 30 + this.zufall.zahl() * 120 };
    /** Offene Kisten-Ansichten, die der Zone-Versand abholt: [{ spielerId, id, inhalt | null }] */
    this.kistenNachrichten = [];
    this.lootZustand = [];
    /** Wird bei jeder Türänderung erhöht → Server schickt TUEREN */
    this.tuerenVersion = 0;
    this.tuerLeben = new Map(); // Tür-ID → verbleibende Lebenspunkte (nur angeschlagene Türen)
    this.tuerHaltOffen = new Map(); // Tür-ID → Sekunden, die eine aufgebrochene Tür noch offen bleibt
    this.ressourcenNachwuchs = new Map(); // Ressourcen-ID → Sekunden bis zum Nachwachsen
    this.laternenNachwuchs = new Map(); // Laternen-ID (welt.laternen) → Sekunden bis die umgefahrene Laterne wieder steht
    if (konfiguration.welt.tuerenGeschlossen) for (const t of this.welt.tueren) this.welt.setzeTuer(t.id, false);
    /** Tutorial (Orte, gesperrte Türen) oder null */
    this.tutorial = karte.tutorial ? erstelleTutorial(this, karte.tutorial) : null;
    /** Sekunden seit Tagesbeginn (siehe gemeinsam/tageszeit.js) und Tageszähler */
    this.zeit = konfiguration.welt.startZeit ?? 0;
    this.tag = 1;
    this.istNacht = false;
    /** Gesetzt, wenn hier alle ausgeschlafen haben (Stunden) → SpielServer spult die anderen Zonen mit vor. */
    this.zeitSprung = 0;
    /** Hook vom SpielServer: Spieler der übrigen Zonen (fürs zonenübergreifende Schlafen). Ohne Server: keine. */
    this.spielerAndererZonen = null;

    // Kartenfeste Bauwerke (Map-Editor): ohne Besitzer → alle dürfen sie benutzen, niemand abreißen
    for (const b of karte.bauwerke ?? []) if (pruefePlatz(this.welt, b.typ, b.tx, b.ty, false).ok) this.welt.setzeBauwerk(neuesBauwerk(this, b.typ, b.tx, b.ty, null, b.drehung ? { drehung: 1 } : {}));
    this.bauwerkAenderungen.clear();
    for (const o of autos) this.hinzufuegen(erzeugeFahrzeug({ id: this.neueId(), ...fahrzeugAusObjekt(o, this.welt.kachelGroesse), haltbarkeit: konfiguration.fahrzeug.haltbarkeit }));
    this.karte.zombieSpawns.forEach((spawn, spawnIndex) => this.spawneZombie(spawnIndex));
    verteileStartLoot(this);
    spawneStartTiere(this);
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
    const fahrzeuge = [...this.alleVomTyp('fahrzeug')].map(({ modell, x, y, winkel, laenge, breite, leben, maxLeben, kaputt, kofferraum }) => ({ modell, x, y, winkel, laenge, breite, leben, maxLeben, kaputt, kofferraum }));
    // fahrzeugeAlle: die Liste ist vollständig (Autos können seit Runde 21 die Zone wechseln) – beim Laden ersetzt sie die Kartenautos
    return { version: 1, karte: this.karte.daten.id, zeit: this.zeit, tag: this.tag, bauwerke: [...this.welt.bauwerke.values()], flaggen: territoriumSpeichern(this.territorium), fahrzeuge, fahrzeugeAlle: true };
  }

  /** Gespeicherten Weltzustand übernehmen – alles wird geprüft (Datei kann alt oder kaputt sein). */
  uebernimmWeltzustand(stand) {
    if (!stand || stand.version !== 1 || stand.karte !== this.karte.daten.id) return false;
    if (Number.isFinite(stand.zeit) && stand.zeit >= 0) this.zeit = stand.zeit;
    if (Number.isInteger(stand.tag) && stand.tag >= 1) this.tag = stand.tag;
    territoriumLaden(this, stand.flaggen);
    for (const roh of Array.isArray(stand.bauwerke) ? stand.bauwerke : []) {
      const b = pruefeBauwerk(roh, this.konfiguration);
      if (!b) continue;
      // Kartenfestes Bauwerk (ohne Besitzer) gibt es schon frisch von der Karte → gespeicherten Zustand übernehmen (z. B. Kisteninhalt)
      const fest = b.besitzer ? null : this.welt.bauwerkeAn(b.tx, b.ty).find((x) => x.typ === b.typ && !x.besitzer);
      if (fest) this.welt.entferneBauwerk(fest.id);
      if (!pruefePlatz(this.welt, b.typ, b.tx, b.ty, false).ok) continue;
      b.id = this.neueBauwerkId();
      this.welt.setzeBauwerk(b);
    }
    // Autos stehen da, wo sie zuletzt geparkt wurden. Neuer Stand (fahrzeugeAlle): genau die gespeicherten Autos (auch zugezogene);
    // alter Stand: Anzahl & Modelle wie auf der Karte
    const gespeichert = Array.isArray(stand.fahrzeuge) ? stand.fahrzeuge : [];
    if (stand.fahrzeugeAlle === true) {
      for (const fz of [...this.alleVomTyp('fahrzeug')]) this.entfernen(fz.id);
      for (const f of gespeichert) {
        const ok = FAHRZEUG_MODELLE[f?.modell] && [f.x, f.y, f.winkel, f.laenge, f.breite].every(Number.isFinite) && f.laenge > 0 && f.laenge < 400 && f.breite > 0 && f.breite < 200;
        if (!ok) continue;
        const maxLeben = Number.isFinite(f.maxLeben) && f.maxLeben > 0 ? f.maxLeben : this.konfiguration.fahrzeug.haltbarkeit;
        const fz = erzeugeFahrzeug({ id: this.neueId(), modell: f.modell, x: f.x, y: f.y, winkel: f.winkel, laenge: f.laenge, breite: f.breite, haltbarkeit: maxLeben });
        if (Number.isFinite(f.leben)) fz.leben = Math.min(fz.maxLeben, Math.max(0, f.leben));
        fz.kaputt = f.kaputt === true || fz.leben <= 0;
        if (Array.isArray(f.kofferraum)) f.kofferraum.slice(0, fz.kofferraum.length).forEach((e, k) => (fz.kofferraum[k] = pruefeEintrag(e)));
        this.hinzufuegen(fz);
      }
      return true;
    }
    const vorhanden = [...this.alleVomTyp('fahrzeug')];
    for (const fz of vorhanden) {
      const i = gespeichert.findIndex((f) => f?.modell === fz.modell && Number.isFinite(f.x) && Number.isFinite(f.y) && Number.isFinite(f.winkel));
      if (i < 0) continue;
      const [f] = gespeichert.splice(i, 1);
      const probe = { ...fz, x: f.x, y: f.y, winkel: f.winkel };
      if (passt(probe, f.x, f.y, this.welt)) Object.assign(fz, { x: f.x, y: f.y, winkel: f.winkel, letzteKacheln: '' });
      if (Number.isFinite(f.leben)) fz.leben = Math.min(fz.maxLeben, Math.max(0, f.leben));
      fz.kaputt = f.kaputt === true || fz.leben <= 0;
      if (Array.isArray(f.kofferraum)) f.kofferraum.slice(0, fz.kofferraum.length).forEach((e, k) => (fz.kofferraum[k] = pruefeEintrag(e)));
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
    const { geschwindigkeit, radius, sprintFaktor, joggFaktor, ausdauerMax, ausdauerVerbrauch, ausdauerRegeneration, sprintMinimum } =
      this.konfiguration.spieler;
    return { geschwindigkeit, radius, sprintFaktor, joggFaktor, ausdauerMax, ausdauerVerbrauch, ausdauerRegeneration, sprintMinimum };
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
        variante: waehleZombieVariante(this.zufall, this.konfiguration, this.tag ?? 1),
      }),
    );
  }

  spielerBetrittWelt(benutzername, { admin = false } = {}) {
    const start = this.zufall.auswahl(this.karte.spielerStarts);
    const neu = erzeugeSpieler({ id: this.neueId(), benutzername, x: start.x, y: start.y, konfiguration: this.konfiguration, admin });
    // Im Tutorial beginnt man mit leeren Taschen (Items kommen Schritt für Schritt)
    const spieler = this.tutorial ? neu : gibStartausruestung(neu, this.konfiguration);
    spieler.erkundet = new Uint8Array(this.welt.breite * this.welt.hoehe); // Karte (K), siehe gemeinsam/welt/erkundung.js
    spieler.erkundetAndere = {}; // Erkundung der anderen Zonen (gepackt, siehe spielstand.js)
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
    this.zombieRespawns.push({ spawnIndex, rest: this.karte.zombieSpawns[spawnIndex]?.respawnZeit ?? this.konfiguration.zombie.respawnZeit });
  }

  /** Ein Simulationsschritt. Reihenfolge der Systeme ist bewusst festgelegt. */
  aktualisiere(dt) {
    this.tick++;
    this.ereignisse = []; // Meldungen leert der SpielServer nach dem Versand
    this.#beendeAbgelaufeneAktionen();
    aktualisiereBots(this, dt); // Runde 23: Bots füllen ihre Eingabe-/Aktionspuffer wie echte Spieler
    verarbeiteSpielerEingaben(this);
    aktualisiereFahrzeuge(this, dt);
    pruefeUebergaenge(this, dt);
    verarbeiteAktionen(this);
    aktualisiereNachladen(this, dt);
    aktualisiereKampf(this, dt);
    aktualisiereArbeit(this, dt);
    aktualisiereBauwerke(this, dt);
    aktualisiereWuerfe(this, dt);
    aktualisiereTueren(this, dt);
    aktualisiereZombies(this, dt);
    aktualisiereTiere(this, dt);
    aktualisiereAngeln(this, dt);
    aktualisiereWetter(this, dt);
    aktualisiereUeberleben(this, dt);
    aktualisiereLoot(this, dt);
    aktualisiereTageszeit(this, dt);
    aktualisiereTutorial(this, dt);
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
    return { tick: this.tick, zeit: Math.round(this.zeit * 10) / 10, tag: this.tag, ...(this.istNacht && this.nachtArt && this.nachtArt !== 'normal' ? { nachtArt: this.nachtArt } : {}), wetter: this.wetter.art, wind: Math.round((this.wetter.wind ?? 0.35) * 100) / 100, entitaeten, ereignisse: this.ereignisse };
  }

  /** Bauwerke fürs Netz: ohne privaten Kisten-Inhalt (der geht nur per KISTE an den, der die Kiste offen hat). */
  bauwerkeOeffentlich() {
    return [...this.welt.bauwerke.values()].map(({ inhalt, plaetze, ...rest }) => rest);
  }

  /**
   * Änderungen seit dem letzten Aufruf als Paket für BAUWERKE_AENDERUNG: { gesetzt: [Bauwerke], entfernt: [IDs] } – oder null, wenn so viel
   * passiert ist (> maxAenderungen), dass die ganze Liste kleiner/einfacher ist. Leert die Merkliste.
   */
  nimmBauwerkAenderungen(maxAenderungen = 200) {
    const ids = this.bauwerkAenderungen;
    this.bauwerkAenderungen = new Set();
    if (ids.size > maxAenderungen) return null;
    const gesetzt = [];
    const entfernt = [];
    for (const id of ids) {
      const b = this.welt.bauwerke.get(id);
      if (!b) entfernt.push(id);
      else {
        const { inhalt, plaetze, ...rest } = b;
        gesetzt.push(rest);
      }
    }
    return { gesetzt, entfernt };
  }

  gegenstaendeListe() {
    return [...this.alleVomTyp('gegenstand')].map(gegenstandZuNetzwerk);
  }
}

/** Ein Bauwerk aus einem (evtl. manipulierten) Spielstand: nur bekannte Felder, gültige Werte. */
function pruefeBauwerk(roh, konfiguration) {
  if (!roh || !BAUWERKE[roh.typ] || !Number.isInteger(roh.tx) || !Number.isInteger(roh.ty)) return null;
  const b = { typ: roh.typ, tx: roh.tx, ty: roh.ty, besitzer: typeof roh.besitzer === 'string' ? roh.besitzer.slice(0, 20) : '' };
  if (b.typ === 'lagerfeuer') Object.assign(b, { brennt: roh.brennt === true, brennRest: Number.isFinite(roh.brennRest) ? Math.max(0, roh.brennRest) : 0, plaetze: pruefePlaetze(b.typ, roh.plaetze, konfiguration.bauen) });
  if (b.typ === 'schmelzofen') Object.assign(b, { brennt: roh.brennt === true, brennRest: Number.isFinite(roh.brennRest) ? Math.max(0, roh.brennRest) : 0, brennstoff: Number.isInteger(roh.brennstoff) ? Math.min(10, Math.max(0, roh.brennstoff)) : 0, plaetze: pruefePlaetze(b.typ, roh.plaetze, konfiguration.bauen) });
  if (b.typ === 'falle') b.gespannt = roh.gespannt !== false;
  if (b.typ === 'beet') {
    b.pflanze = PFLANZEN[roh.pflanze] ? roh.pflanze : null;
    b.wachstum = b.pflanze && Number.isFinite(roh.wachstum) ? Math.min(1, Math.max(0, roh.wachstum)) : 0;
  }
  if (b.typ === 'kiste') b.inhalt = pruefeKistenInhalt(roh.inhalt);
  if (BAUWERKE[b.typ].schaltbar) b.offen = roh.offen === true;
  if (roh.drehung === 0 || roh.drehung === 1) b.drehung = roh.drehung;
  return b;
}

/** Inhalt einer Lagerkiste aus dem Spielstand: KISTE_PLAETZE Plätze, jeder Eintrag geprüft. */
function pruefeKistenInhalt(roh) {
  const inhalt = new Array(KISTE_PLAETZE).fill(null);
  if (Array.isArray(roh)) roh.slice(0, KISTE_PLAETZE).forEach((e, i) => (inhalt[i] = pruefeEintrag(e)));
  return inhalt;
}

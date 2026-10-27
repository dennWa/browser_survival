import { FUNK, HILFE_NACH, HINWEIS_NACH, KAPITEL } from '../tutorial/skript.js';
import { GEGENSTAENDE } from '../konfiguration/gegenstaende.js';
import { erzeugeZombie } from '../entitaeten/zombie.js';
import { fuegeZumInventarHinzu, legeAufBoden, aktualisiereAusruestung } from './inventarSystem.js';
import { gibXp } from './levelSystem.js';
import { aussteigen } from './fahrzeugSystem.js';
import { brecheArbeitAb } from './arbeitSystem.js';

/**
 * Tutorial-Engine (Zone mit `tutorial` in der Kartendefinition, z. B. server/spiel/karten/tutorial.js).
 * Liest den Ablauf aus server/spiel/tutorial/skript.js, prüft pro Tick die Aufgaben des aktuellen Schritts und führt Aktionen aus
 * (Items hinlegen, Türen öffnen, Zombies schicken, Uhrzeit). Zustand je Spieler in `spieler.tutorial` – der Client bekommt ihn über
 * spielerDatenPrivat (tutorialFuerClient). Sicherheitsnetz: kein Tod (Ohnmacht → Checkpoint), Munition wird nachgefüllt,
 * Werkzeuge gehen nicht kaputt, Hunger/Durst sinken nicht (tutorialKonfiguration).
 */

/** Zonen-Konfiguration fürs Tutorial: über der gemeinsamen, per Prototyp (nicht Überschriebenes liest weiter live). */
export function tutorialKonfiguration(basis) {
  const zone = Object.create(basis);
  const ueber = (bereich, werte) => (zone[bereich] = Object.assign(Object.create(basis[bereich] ?? {}), werte));
  ueber('spieler', { hungerProMinute: 0, durstProMinute: 0, respawnZeit: 3 });
  ueber('zombie', { nachtHorde: 0, respawnZeit: 99999, angriffsSchaden: 7, verlierRadius: 700, aggroRadius: 260 });
  ueber('wetter', { aktiv: false });
  ueber('ressourcen', {
    holz: { menge: 2, mengeGross: 2, chanceAufMehr: 0.3, dauer: 3, nachwachsen: 12 },
    stein: { menge: 1, mengeGross: 2, chanceAufMehr: 0.4, dauer: 3, nachwachsen: 12 },
    eisenerz: { menge: 1, chanceAufMehr: 0.2, dauer: 4, nachwachsen: 12 },
  });
  // Beet: ~18 echte Sekunden statt eines Spieltags; Kochen schneller (Wachstum rechnet mit Spielsekunden → Zyklus 900 s)
  ueber('bauen', { wachstumsTage: 18 / 900, kochDauer: 8, verbrennDauer: 40 });
  ueber('loot', { spawnChance: 0 });
  ueber('tiere', { hasenProTausend: 0, hasenMax: 0 });
  return zone;
}

/** Tutorial-Daten der Zone (Orte aus der Karte) – SpielWelt hängt das Ergebnis an `spielWelt.tutorial`. */
export function erstelleTutorial(spielWelt, def) {
  const g = spielWelt.welt.kachelGroesse;
  const punkte = {};
  for (const [name, p] of Object.entries(def.punkte ?? {})) punkte[name] = { x: (p.x + 0.5) * g, y: (p.y + 0.5) * g };
  const bereiche = {};
  for (const [name, b] of Object.entries(def.bereiche ?? {})) {
    bereiche[name] = { x0: b.x * g, y0: b.y * g, x1: (b.x + b.b) * g, y1: (b.y + b.h) * g };
    punkte[name] ??= { x: (b.x + b.b / 2) * g, y: (b.y + b.h / 2) * g };
  }
  const tueren = {};
  for (const [name, t] of Object.entries(def.tueren ?? {})) {
    const id = spielWelt.welt.tuerBei(t.x, t.y);
    if (id !== undefined) tueren[name] = id;
  }
  const tutorial = { punkte, bereiche, tueren, gesperrt: new Set(Object.values(tueren)) };
  for (const id of tutorial.gesperrt) spielWelt.welt.setzeTuer(id, false);
  spielWelt.tuerenVersion++;
  return tutorial;
}

/** Gesperrte Tür (Tutorial-Gate)? – tuerSystem öffnet sie dann nicht. */
export function tuerGesperrt(spielWelt, tuerId) {
  return spielWelt.tutorial?.gesperrt.has(tuerId) === true;
}

// ---------------------------------------------------------------------------

export function aktualisiereTutorial(spielWelt, dt) {
  const tut = spielWelt.tutorial;
  if (!tut) return;
  for (const spieler of spielWelt.alleVomTyp('spieler')) {
    if (!spieler.tutorial) starteKapitel(spielWelt, spieler, 0);
    const t = spieler.tutorial;
    sicherheitsnetz(spielWelt, spieler);
    halteUhr(spielWelt, t);
    if (t.fertig || spieler.tot) continue;
    const schritt = aktuellerSchritt(t);
    if (!schritt) continue;
    t.sekunden += dt;
    t.ohneFortschritt += dt;
    if (spieler.sprintet) t.merker.sprint = true;
    if (spieler.nachladenRest > 0) t.merker.nachgeladen = true;
    for (const e of spielWelt.ereignisse) t.ereignisse.push(e);
    let neu = false;
    schritt.aufgaben.forEach((a, i) => {
      if (t.erledigt[i] || !erfuellt(spielWelt, spieler, t, a.wenn)) return;
      t.erledigt[i] = true;
      neu = true;
    });
    if (neu) t.ohneFortschritt = 0;
    if (t.erledigt.every(Boolean)) {
      fuehreAus(spielWelt, spieler, schritt.beiEnde);
      naechsterSchritt(spielWelt, spieler);
      continue;
    }
    if (schritt.hilfe && !t.hilfeGegeben && t.ohneFortschritt >= HILFE_NACH) {
      t.hilfeGegeben = true;
      funk(t, schritt.hilfe);
    }
    t.hinweis = t.ohneFortschritt >= HINWEIS_NACH;
  }
}

function aktuellerSchritt(t) {
  return KAPITEL[t.kapitel]?.schritte[t.schritt] ?? null;
}

/** Uhr steht (Kapitel-Uhrzeit) – Stunde h (0–24) in Sekunden seit Tagesbeginn (06:00), wie konsolenHelfer.zeit. */
function halteUhr(spielWelt, t) {
  const stunde = KAPITEL[t.kapitel]?.stunde;
  if (!Number.isFinite(stunde)) return;
  const { tagSekunden, nachtSekunden } = spielWelt.tageszeitDauer();
  const h = (stunde - 6 + 24) % 24;
  spielWelt.zeit = h <= 15 ? (h / 15) * tagSekunden : tagSekunden + ((h - 15) / 9) * nachtSekunden;
}

function sicherheitsnetz(spielWelt, spieler) {
  if (spieler.tot) return;
  // Munition geht nie aus (Magazin leert sich trotzdem → Nachladen lernen)
  const pistole = spieler.inventar.some((e) => e?.defId === 'pistole');
  const munition = spieler.inventar.reduce((n, e) => n + (e?.defId === 'munition_9mm' ? e.menge : 0), 0);
  if (pistole && munition < 15) fuegeZumInventarHinzu(spieler, 'munition_9mm', 30 - munition);
  // Werkzeuge nutzen sich nicht ab
  for (const e of spieler.inventar) if (e && e.haltbarkeit !== undefined) delete e.haltbarkeit;
}

function erfuellt(spielWelt, spieler, t, w) {
  if (!w) return true;
  if (w.bereich) {
    const b = spielWelt.tutorial.bereiche[w.bereich];
    if (!b || spieler.x < b.x0 || spieler.x >= b.x1 || spieler.y < b.y0 || spieler.y >= b.y1) return false;
    if (w.imAuto && !spieler.fahrzeug) return false;
    return true;
  }
  if (w.imAuto) return !!spieler.fahrzeug;
  if (w.hat) return Object.entries(w.hat).every(([defId, n]) => anzahl(spieler, defId) >= n);
  if (w.inHand) return spieler.ausgeruestet !== null && spieler.inventar[spieler.ausgeruestet]?.defId === w.inHand;
  if (w.mindestens) return Object.entries(w.mindestens).every(([wert, n]) => spieler[wert] >= n);
  if (w.ui) return t.ui.has(w.ui);
  if (w.sprint) return t.merker.sprint === true;
  if (w.nachgeladen) return t.merker.nachgeladen === true;
  if (w.skill) return Object.values(spieler.skills ?? {}).some((n) => n > 0);
  if (w.kills) return spieler.statistik.zombies - t.killsStart >= w.kills;
  if (w.warte) return t.sekunden >= w.warte;
  if (w.ereignis) {
    const passt = t.ereignisse.filter((e) => e.typ === w.ereignis && Object.entries(w.wo ?? {}).every(([k, v]) => e[k] === v) && (e.von === undefined || e.von === null || e.von === spieler.id));
    return passt.length >= (w.anzahl ?? 1);
  }
  return false;
}

function anzahl(spieler, defId) {
  return spieler.inventar.reduce((n, e) => n + (e?.defId === defId ? e.menge : 0), 0);
}

function naechsterSchritt(spielWelt, spieler) {
  const t = spieler.tutorial;
  if (t.fertig) return;
  if (t.schritt + 1 < KAPITEL[t.kapitel].schritte.length) starteSchritt(spielWelt, spieler, t.schritt + 1);
  else if (t.kapitel + 1 < KAPITEL.length) starteKapitel(spielWelt, spieler, t.kapitel + 1);
  else t.fertig = true;
}

/** Kapitel starten (auch beim Überspringen/Kapitel-Sprung): Mindest-Items, dann erster Schritt. */
export function starteKapitel(spielWelt, spieler, nr, { springen = false } = {}) {
  const kapitel = KAPITEL[nr];
  if (!kapitel) return;
  const alt = spieler.tutorial;
  spieler.tutorial = {
    kapitel: nr,
    schritt: 0,
    erledigt: [],
    sekunden: 0,
    ohneFortschritt: 0,
    hilfeGegeben: false,
    hinweis: false,
    merker: {},
    ui: new Set(),
    ereignisse: [],
    killsStart: spieler.statistik.zombies,
    funkNr: alt?.funkNr ?? 0,
    funk: alt?.funk ?? [],
    checkpoint: alt?.checkpoint ?? kapitel.start,
    fertig: false,
  };
  if (springen) {
    // Alles, was frühere Kapitel freigeschaltet/hingelegt hätten, nachholen (Türen) – Items über `sichere`
    for (let k = 0; k < nr; k++) for (const s of KAPITEL[k].schritte) for (const a of [...(s.beiStart ?? []), ...(s.beiEnde ?? [])]) if (a.oeffne) oeffne(spielWelt, a.oeffne);
    for (const z of [...spielWelt.alleVomTyp('zombie')]) spielWelt.entfernen(z.id);
    teleportiere(spielWelt, spieler, kapitel.start);
    spieler.tutorial.checkpoint = kapitel.start;
    // Werkzeuge/Items der übersprungenen Kapitel, die für spätere gebraucht werden
    for (let k = 0; k < nr; k++) for (const s of KAPITEL[k].schritte) for (const a of s.beiStart ?? []) if (a.boden && GEGENSTAENDE[a.boden.defId]?.kategorie !== 'nahrung' && GEGENSTAENDE[a.boden.defId]?.kategorie !== 'getraenk') sichere(spieler, { [a.boden.defId]: a.boden.menge ?? 1 }, a.boden.magazin);
  }
  sichere(spieler, kapitel.sichere ?? {});
  starteSchritt(spielWelt, spieler, 0);
}

function sichere(spieler, liste, magazin = 0) {
  for (const [defId, n] of Object.entries(liste)) {
    if (!GEGENSTAENDE[defId]) continue;
    const fehlt = n - anzahl(spieler, defId);
    if (fehlt > 0) fuegeZumInventarHinzu(spieler, defId, fehlt, GEGENSTAENDE[defId].kategorie === 'fernkampf' ? (magazin || GEGENSTAENDE[defId].magazin) : 0);
  }
}

function starteSchritt(spielWelt, spieler, nr) {
  const t = spieler.tutorial;
  const schritt = KAPITEL[t.kapitel].schritte[nr];
  Object.assign(t, { schritt: nr, erledigt: schritt.aufgaben.map(() => false), sekunden: 0, ohneFortschritt: 0, hilfeGegeben: false, hinweis: false, merker: {}, ereignisse: [], killsStart: spieler.statistik.zombies });
  t.ui.clear();
  for (const id of schritt.funk ?? []) funk(t, id);
  fuehreAus(spielWelt, spieler, schritt.beiStart);
}

function funk(t, id) {
  if (!FUNK[id]) return;
  t.funkNr++;
  t.funk = [...t.funk, { nr: t.funkNr, id }].slice(-4);
}

function fuehreAus(spielWelt, spieler, aktionen = []) {
  const tut = spielWelt.tutorial;
  for (const a of aktionen ?? []) {
    if (a.boden) {
      const p = tut.punkte[a.boden.punkt];
      if (p) legeAufBoden(spielWelt, { defId: a.boden.defId, menge: a.boden.menge ?? 1, magazin: a.boden.magazin }, p.x + (spielWelt.zufall.zahl() - 0.5) * 16, p.y + (spielWelt.zufall.zahl() - 0.5) * 16);
    }
    if (a.gib) sichere(spieler, a.gib);
    if (a.setze) for (const [k, v] of Object.entries(a.setze)) if (['hunger', 'durst', 'leben'].includes(k)) spieler[k] = Math.min(k === 'leben' ? spieler.maxLeben : 100, v);
    if (a.oeffne) oeffne(spielWelt, a.oeffne);
    if (a.sperre) {
      const id = tut.tueren[a.sperre];
      if (id !== undefined) {
        tut.gesperrt.add(id);
        spielWelt.welt.setzeTuer(id, false);
        spielWelt.tuerenVersion++;
      }
    }
    if (a.zombies) schickeZombies(spielWelt, spieler, a.zombies);
    if (a.zombiesWeg) for (const z of [...spielWelt.alleVomTyp('zombie')]) spielWelt.entfernen(z.id);
    if (a.checkpoint) spieler.tutorial.checkpoint = a.checkpoint;
    if (a.funk) funk(spieler.tutorial, a.funk);
    if (a.levelMindestens && spieler.level < a.levelMindestens) {
      // Wer Zombies anders erledigt hat (oder Kapitel übersprang), bekommt die fehlende Erfahrung geschenkt
      let schutz = 10;
      while (spieler.level < a.levelMindestens && schutz-- > 0) gibXp(spielWelt, spieler, 20);
    }
    if (a.ende) spieler.tutorial.fertig = true;
  }
}

function oeffne(spielWelt, name) {
  const id = spielWelt.tutorial.tueren[name];
  if (id !== undefined) spielWelt.tutorial.gesperrt.delete(id);
}

function schickeZombies(spielWelt, spieler, { punkt, variante = 'normal', anzahl: n = 1, gefesselt = false, jagt = false }) {
  const p = spielWelt.tutorial.punkte[punkt];
  if (!p) return;
  for (let i = 0; i < n; i++) {
    const versatz = n > 1 ? (i - (n - 1) / 2) * 34 : 0;
    const z = erzeugeZombie({ id: spielWelt.neueId(), x: p.x + versatz, y: p.y, konfiguration: spielWelt.konfiguration, variante });
    z.tutorialSchritt = `${spieler.tutorial.kapitel}:${spieler.tutorial.schritt}`;
    if (gefesselt) Object.assign(z, { gefesselt: true, rueckstossFaktor: 0, blick: Math.PI / 2 });
    if (jagt) Object.assign(z, { zielId: spieler.id, zustand: 'verfolgend', letztesZielX: spieler.x, letztesZielY: spieler.y });
    spielWelt.hinzufuegen(z);
  }
}

function teleportiere(spielWelt, spieler, punktName) {
  const p = spielWelt.tutorial.punkte[punktName];
  if (!p) return;
  if (spieler.fahrzeug) aussteigen(spielWelt, spieler, { erzwingen: true });
  spieler.x = p.x;
  spieler.y = p.y;
  spieler.eingabePuffer.length = 0;
}

/**
 * Hook aus kampfSystem.fuegeSchadenZu: Im Tutorial stirbt man nicht – bei tödlichem Schaden wird man ohnmächtig und wacht am
 * Checkpoint auf; der aktuelle Schritt startet neu (seine Zombies kommen wieder). @returns true = Schaden ist erledigt
 */
export function tutorialVorSchaden(spielWelt, spieler, menge) {
  if (!spielWelt.tutorial || !spieler.tutorial || spieler.leben - menge > 0) return false;
  const t = spieler.tutorial;
  if (spieler.arbeit) brecheArbeitAb(spielWelt, spieler, null);
  for (const z of [...spielWelt.alleVomTyp('zombie')]) if (!z.gefesselt) spielWelt.entfernen(z.id);
  teleportiere(spielWelt, spieler, t.checkpoint);
  spieler.leben = spieler.maxLeben;
  spielWelt.ereignis({ typ: 'treffer', x: spieler.x, y: spieler.y, winkel: 0, ziel: 'spieler' });
  funk(t, 'ohnmacht');
  // Zombies dieses Schritts neu schicken (die gefesselten bleiben)
  const schritt = aktuellerSchritt(t);
  const nurZombies = (schritt?.beiStart ?? []).filter((a) => a.zombies && !a.zombies.gefesselt);
  fuehreAus(spielWelt, spieler, nurZombies);
  t.killsStart = spieler.statistik.zombies;
  return true;
}

/**
 * AKTION tutorial { befehl, wert }: 'ui' (Client meldet geöffnetes Fenster: inventar|karte|skills), 'ueberspringen' (nächstes Kapitel),
 * 'kapitel' (Sprung zu Kapitel wert, 0-basiert).
 */
export function tutorialAktion(spielWelt, spieler, befehl, wert) {
  if (!spielWelt.tutorial || !spieler.tutorial) return;
  const t = spieler.tutorial;
  if (befehl === 'ui' && ['inventar', 'karte', 'skills'].includes(wert)) t.ui.add(wert);
  else if (befehl === 'ueberspringen') {
    if (t.kapitel + 1 < KAPITEL.length) starteKapitel(spielWelt, spieler, t.kapitel + 1, { springen: true });
    else t.fertig = true;
  } else if (befehl === 'kapitel' && Number.isInteger(wert) && wert >= 0 && wert < KAPITEL.length && wert !== t.kapitel) {
    starteKapitel(spielWelt, spieler, wert, { springen: true });
  }
  aktualisiereAusruestung(spieler);
}

/** Für spielerDatenPrivat (nur bei Änderung verschickt – darum keine laufenden Sekunden). */
export function tutorialFuerClient(spielWelt, spieler) {
  const t = spieler.tutorial;
  if (!t) return undefined;
  const kapitel = KAPITEL[t.kapitel];
  const schritt = aktuellerSchritt(t);
  const ziel = schritt?.ziel ? spielWelt.tutorial.punkte[schritt.ziel] : null;
  return {
    kapitel: t.kapitel,
    kapitelAnzahl: KAPITEL.length,
    titel: kapitel?.titel ?? '',
    schritt: schritt?.id ?? null,
    aufgaben: (schritt?.aufgaben ?? []).map((a, i) => ({ text: a.text, taste: a.taste, fertig: !!t.erledigt[i] })),
    tipp: schritt?.tipp ?? null,
    ziel: ziel && !t.erledigt.every(Boolean) ? { x: Math.round(ziel.x), y: Math.round(ziel.y) } : null,
    funk: t.funk.map((f) => ({ nr: f.nr, id: f.id, text: FUNK[f.id] })),
    hinweis: t.hinweis,
    fertig: t.fertig,
  };
}

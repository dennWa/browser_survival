import { BETT_REICHWEITE } from '../../../gemeinsam/konstanten.js';
import { ABBAU_REICHWEITE } from '../../../gemeinsam/welt/ressourcen.js';
import { sekundenFuerStunden, tageszeit } from '../../../gemeinsam/tageszeit.js';
import { fuegeZumInventarHinzu, legeAufBoden } from './inventarSystem.js';
import { GEGENSTAENDE } from '../konfiguration/gegenstaende.js';
import { sammelFaktor } from '../../../gemeinsam/spieler/skills.js';
import { aktualisiereBauwerke, kochenFertig } from './bauSystem.js';

/**
 * Arbeiten, die Zeit brauchen: Bäume fällen / Steine abbauen (Werkzeug nötig) und Schlafen im Bett.
 *
 *   spieler.arbeit = { art: 'holz' | 'stein' | 'schlafen', dauer, rest, x, y, ressourceId?, ort?, naechsterSchlag }
 *
 * Schlafen geht in jedem Bett, dauert konfiguration.schlafen.dauer Sekunden und spult die Uhr vor – aber nur,
 * wenn alle lebenden Spieler schlafen (wer früher fertig ist, bleibt liegen, bis alle soweit sind).
 *
 * Abbruch: Bewegung (> ABBRUCH_WEG px), Angriff, Tod, Schaden (kampfSystem.fuegeSchadenZu) oder wenn die
 * Ressource weg ist. Werte (Menge, Dauer, Nachwachsen, Heilung) in konfiguration.ressourcen / .schlafen.
 */
const ABBRUCH_WEG = 6;
const SCHLAG_TAKT = 0.85; // Sekunden zwischen zwei Hack-Geräuschen (passt zur Animation)

/** AKTION 'abbauen': nächsten Baum/Stein in Reichweite bearbeiten. */
export function starteAbbau(spielWelt, spieler) {
  const r = spielWelt.welt.naechsteRessource(spieler.x, spieler.y, ABBAU_REICHWEITE);
  if (!r) {
    spielWelt.melde(spieler.id, 'Hier gibt es nichts abzubauen');
    return;
  }
  if (!spieler.inventar.some((e) => e?.defId === r.werkzeug)) {
    spielWelt.melde(spieler.id, `Du brauchst ${r.werkzeug === 'axt' ? 'eine Axt' : 'eine Spitzhacke'}`);
    return;
  }
  const dauer = spielWelt.konfiguration.ressourcen[r.art].dauer * sammelFaktor(spieler.skills);
  spieler.arbeit = { art: r.art, dauer, rest: dauer, x: spieler.x, y: spieler.y, ressourceId: r.id, naechsterSchlag: SCHLAG_TAKT * 0.6 };
  spieler.nachladenRest = 0;
}

/** AKTION 'schlafen': in ein Bett in Reichweite legen (nicht, wenn Zombies hinter einem her sind). */
export function starteSchlafen(spielWelt, spieler) {
  const bett = naechstesBett(spielWelt.welt, spieler.x, spieler.y);
  if (!bett) {
    spielWelt.melde(spieler.id, 'Kein Bett in der Nähe');
    return;
  }
  const k = spielWelt.konfiguration.schlafen;
  const gejagt = [...spielWelt.alleVomTyp('zombie')].some(
    (z) => z.zielId === spieler.id && Math.hypot(z.x - spieler.x, z.y - spieler.y) < k.zombieAbstand,
  );
  if (gejagt) {
    spielWelt.melde(spieler.id, 'Du kannst nicht schlafen – Zombies sind hinter dir her!');
    return;
  }
  const dauer = Math.max(0.5, k.dauer);
  spieler.arbeit = { art: 'schlafen', dauer, rest: dauer, x: spieler.x, y: spieler.y, ort: bett };
  spieler.nachladenRest = 0;
}

/** Bricht eine laufende Arbeit ab (z. B. bei Schaden). */
export function brecheArbeitAb(spielWelt, spieler, grund) {
  if (!spieler.arbeit) return;
  spieler.arbeit = null;
  if (grund) spielWelt.melde(spieler.id, grund);
}

/** Pro Tick: Arbeiten fortschreiten lassen, Ressourcen nachwachsen lassen. */
export function aktualisiereArbeit(spielWelt, dt) {
  for (const spieler of spielWelt.alleVomTyp('spieler')) {
    const a = spieler.arbeit;
    if (!a) continue;
    if (spieler.tot || spieler.angriff || Math.hypot(spieler.x - a.x, spieler.y - a.y) > ABBRUCH_WEG) {
      spieler.arbeit = null;
      continue;
    }
    if (a.art === 'schlafen') {
      schlafe(spielWelt, spieler, dt);
      continue;
    }
    if (a.art === 'kochen') {
      a.rest -= dt;
      if (a.rest <= 0) kochenFertig(spielWelt, spieler);
      continue;
    }
    if (!spielWelt.welt.istRessourceDa(a.ressourceId)) {
      spieler.arbeit = null;
      continue;
    }
    const r = spielWelt.welt.ressourcen[a.ressourceId];
    spieler.blick = Math.atan2(r.y - spieler.y, r.x - spieler.x);
    a.naechsterSchlag -= dt;
    if (a.naechsterSchlag <= 0) {
      a.naechsterSchlag += SCHLAG_TAKT;
      spielWelt.ereignis({ typ: 'hack', art: a.art, x: r.x, y: r.y });
    }
    a.rest -= dt;
    if (a.rest <= 0) schliesseAbbauAb(spielWelt, spieler, r);
  }
  aktualisiereNachwachsen(spielWelt, dt);
}

function schliesseAbbauAb(spielWelt, spieler, r) {
  const k = spielWelt.konfiguration.ressourcen[r.art];
  const menge = k.menge + (spielWelt.zufall.zahl() < (k.chanceAufMehr ?? 0) ? 1 : 0);
  const nachwachsen = k.nachwachsen;
  spieler.arbeit = null;
  const rest = fuegeZumInventarHinzu(spieler, r.art, menge);
  if (rest > 0) {
    legeAufBoden(spielWelt, { defId: r.art, menge: rest }, spieler.x, spieler.y);
    spielWelt.melde(spieler.id, 'Inventar voll – liegt am Boden');
  }
  spielWelt.welt.setzeRessource(r.id, false);
  spielWelt.ressourcenNachwuchs.set(r.id, nachwachsen);
  spielWelt.ereignis({ typ: 'abgebaut', art: r.art, x: r.x, y: r.y, id: r.id, von: spieler.id, sx: spieler.x, sy: spieler.y });
  spielWelt.melde(spieler.id, `+${menge} ${GEGENSTAENDE[r.art]?.name ?? r.art}${menge > 1 ? ' – Glück gehabt!' : ''}`);
}

/** Ein Tick Schlaf: Heilung verteilt sich über die Schlafdauer; am Ende aufwachen (und evtl. Zeit vorspulen). */
function schlafe(spielWelt, spieler, dt) {
  const k = spielWelt.konfiguration.schlafen;
  const a = spieler.arbeit;
  const schritt = Math.min(dt, a.rest);
  spieler.leben = Math.min(spieler.maxLeben, spieler.leben + (k.heilung / a.dauer) * schritt);
  a.rest -= dt;
  if (a.rest > 0) return;
  a.fertig = true; // wartet evtl. noch auf die anderen (Zeit läuft nur, wenn ALLE schlafen)
  a.rest = 0;

  const lebende = [...spielWelt.alleVomTyp('spieler')].filter((s) => !s.tot);
  const alleFertig = lebende.every((s) => s.arbeit?.art === 'schlafen' && s.arbeit.fertig);
  const alleSchlafen = lebende.every((s) => s.arbeit?.art === 'schlafen');
  if (alleFertig) {
    spuleZeitVor(spielWelt, k.stunden);
    for (const s of lebende) wacheAuf(spielWelt, s, k, true);
  } else if (!alleSchlafen) {
    wacheAuf(spielWelt, spieler, k, false);
  }
  // sonst: andere schlafen noch → liegen bleiben, bis sie auch fertig sind
}

function wacheAuf(spielWelt, spieler, k, zeitVergangen) {
  spieler.arbeit = null;
  if (zeitVergangen) {
    spieler.hunger = Math.max(0, spieler.hunger - k.hungerKosten);
    spieler.durst = Math.max(0, spieler.durst - k.durstKosten);
  }
  const { uhrzeit } = tageszeit(spielWelt.zeit, spielWelt.tageszeitDauer());
  spielWelt.melde(
    spieler.id,
    zeitVergangen ? `Ausgeschlafen – ${k.stunden} Stunden später, es ist ${uhrzeit}` : 'Ausgeruht – die Zeit vergeht nur, wenn alle schlafen',
  );
}

/** Uhr um `stunden` Spielstunden vorstellen (über Mitternacht hinweg → neuer Tag); Bäume wachsen derweil nach. */
export function spuleZeitVor(spielWelt, stunden) {
  if (!(stunden > 0)) return;
  const dauer = spielWelt.tageszeitDauer();
  const zyklus = dauer.tagSekunden + dauer.nachtSekunden;
  const sekunden = sekundenFuerStunden(spielWelt.zeit, stunden, dauer);
  spielWelt.zeit += sekunden;
  while (spielWelt.zeit >= zyklus) {
    spielWelt.zeit -= zyklus;
    spielWelt.tag++;
  }
  aktualisiereNachwachsen(spielWelt, sekunden);
  aktualisiereBauwerke(spielWelt, 0, sekunden); // Pflanzen wachsen im Schlaf mit
}

/** Abgebaute Bäume/Steine wachsen nach – aber nicht, wenn gerade jemand an der Stelle steht. */
function aktualisiereNachwachsen(spielWelt, dt) {
  for (const [id, rest] of spielWelt.ressourcenNachwuchs) {
    const neu = rest - dt;
    if (neu > 0) {
      spielWelt.ressourcenNachwuchs.set(id, neu);
      continue;
    }
    const r = spielWelt.welt.ressourcen[id];
    const besetzt = [...spielWelt.entitaeten.values()].some(
      (e) => (e.typ === 'spieler' || e.typ === 'zombie') && Math.hypot(e.x - r.x, e.y - r.y) < r.radius + 20,
    );
    if (besetzt) {
      spielWelt.ressourcenNachwuchs.set(id, 5);
      continue;
    }
    spielWelt.ressourcenNachwuchs.delete(id);
    spielWelt.welt.setzeRessource(id, true);
  }
}

/** Nächstes Bett in Reichweite → { x, y, laengs } (laengs = Bett liegt in y-Richtung) oder null */
function naechstesBett(welt, x, y) {
  const treffer = welt.naechstesObjekt(x, y, BETT_REICHWEITE, (o) => o.typ.startsWith('bett'));
  return treffer && { x: treffer.x, y: treffer.y, laengs: treffer.objekt.h >= treffer.objekt.b };
}

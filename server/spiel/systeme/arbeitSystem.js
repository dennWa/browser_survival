import { BETT_REICHWEITE } from '../../../gemeinsam/konstanten.js';
import { ABBAU_REICHWEITE } from '../../../gemeinsam/welt/ressourcen.js';
import { fuegeZumInventarHinzu, legeAufBoden } from './inventarSystem.js';

/**
 * Arbeiten, die Zeit brauchen: Bäume fällen / Steine abbauen (Werkzeug nötig) und Schlafen im Bett.
 *
 *   spieler.arbeit = { art: 'holz' | 'stein' | 'schlafen', dauer, rest, x, y, ressourceId?, ort?, naechsterSchlag }
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
    spielWelt.melde(spieler.id, r.werkzeug === 'axt' ? 'Du brauchst eine Axt' : 'Du brauchst eine Spitzhacke');
    return;
  }
  const { dauer } = spielWelt.konfiguration.ressourcen[r.art];
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
  if (spieler.leben >= spieler.maxLeben) {
    spielWelt.melde(spieler.id, 'Du bist ausgeruht – Schlafen heilt nur Verletzungen');
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
  const dauer = (spieler.maxLeben - spieler.leben) / k.heilungProSekunde;
  spieler.arbeit = { art: 'schlafen', dauer, rest: dauer, x: spieler.x, y: spieler.y, ort: bett };
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
  const { menge, nachwachsen } = spielWelt.konfiguration.ressourcen[r.art];
  spieler.arbeit = null;
  const rest = fuegeZumInventarHinzu(spieler, r.art, menge);
  if (rest > 0) {
    legeAufBoden(spielWelt, { defId: r.art, menge: rest }, spieler.x, spieler.y);
    spielWelt.melde(spieler.id, 'Inventar voll – liegt am Boden');
  }
  spielWelt.welt.setzeRessource(r.id, false);
  spielWelt.ressourcenNachwuchs.set(r.id, nachwachsen);
  spielWelt.ereignis({ typ: 'abgebaut', art: r.art, x: r.x, y: r.y });
  spielWelt.melde(spieler.id, `+${menge} ${r.art === 'holz' ? 'Holz' : 'Stein'}`);
}

function schlafe(spielWelt, spieler, dt) {
  const k = spielWelt.konfiguration.schlafen;
  spieler.leben = Math.min(spieler.maxLeben, spieler.leben + k.heilungProSekunde * dt);
  spieler.arbeit.rest -= dt;
  if (spieler.leben >= spieler.maxLeben) {
    spieler.arbeit = null;
    spielWelt.melde(spieler.id, 'Ausgeschlafen – du bist wieder fit');
  }
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

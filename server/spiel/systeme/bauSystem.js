import { BAUWERKE, BAUWERK_REICHWEITE, KOCHBAR, PFLANZEN, bauwerkAktion, feldKacheln, kachelInReichweite, pruefePlatz } from '../../../gemeinsam/welt/bauwerke.js';
import { GEGENSTAENDE } from '../konfiguration/gegenstaende.js';
import { fuegeZumInventarHinzu, legeAufBoden, verbrauche } from './inventarSystem.js';
import { toeten } from './kampfSystem.js';
import { aktualisiereKisten, leererKistenInhalt, oeffneKiste } from './kistenSystem.js';
import { WACHSTUM_REGEN_FAKTOR } from './wetterSystem.js';

/**
 * Bauwerke (Werkbank, Lagerfeuer, Falle, Beet) – Regeln & Daten: gemeinsam/welt/bauwerke.js.
 * Gespeichert in spielWelt.welt.bauwerke (Map) – die Welt-Klasse kümmert sich um Kollision.
 *
 *   AKTION platzieren { slot, tx, ty }  Item aus dem Inventar aufstellen
 *   AKTION feld { tx, ty }              mit der Spitzhacke (im Inventar genügt) ein Erdfeld FELD_GROESSE² um (tx, ty) anlegen
 *   AKTION feuer                        nächstes Lagerfeuer an (braucht Feuerzeug) / aus
 *   AKTION bauwerk                      E am nächsten Bauwerk: Falle aufnehmen/spannen, kochen, pflanzen, ernten
 *
 * Pro Tick: Feuer brennen herunter, gespannte Fallen schnappen zu, Pflanzen wachsen (Regen: doppelt so schnell = halbe Zeit).
 * Werte: konfiguration.bauen (Brenndauer, Kochdauer, Fallen-Radius, Wachstum, Ertrag).
 */
const FALLEN_RADIUS = 13; // px um die Kachelmitte, in denen ein Zombie hineintritt

export function platziere(spielWelt, spieler, slot, tx, ty) {
  const eintrag = spieler.inventar[slot];
  const def = eintrag && GEGENSTAENDE[eintrag.defId];
  const typ = def?.bauwerk;
  if (!typ || !BAUWERKE[typ]) return;
  const welt = spielWelt.welt;
  if (!Number.isInteger(tx) || !Number.isInteger(ty) || !kachelInReichweite(welt, spieler.x, spieler.y, tx, ty)) {
    spielWelt.melde(spieler.id, 'Zu weit weg');
    return;
  }
  const platz = pruefePlatz(welt, typ, tx, ty);
  if (!platz.ok) {
    spielWelt.melde(spieler.id, platz.grund);
    return;
  }
  if (BAUWERKE[typ].blockiert && kachelBesetzt(spielWelt, tx, ty)) {
    spielWelt.melde(spieler.id, 'Da steht jemand');
    return;
  }
  const b = { id: spielWelt.neueBauwerkId(), typ, tx, ty, besitzer: spieler.name };
  if (typ === 'lagerfeuer') Object.assign(b, { brennt: false, brennRest: 0 });
  if (typ === 'falle') b.gespannt = true;
  if (typ === 'beet') Object.assign(b, { pflanze: null, wachstum: 0 });
  if (typ === 'kiste') b.inhalt = leererKistenInhalt();
  welt.setzeBauwerk(b);
  if (def.kategorie === 'bauwerk') verbrauche(spieler, slot);
  const g = welt.kachelGroesse;
  spielWelt.ereignis({ typ: 'gebaut', bauwerk: typ, x: (tx + 0.5) * g, y: (ty + 0.5) * g, von: spieler.id });
  spielWelt.melde(spieler.id, typ === 'beet' ? 'Beet angelegt – jetzt Samen pflanzen (E)' : `${BAUWERKE[typ].name} aufgestellt`);
}

/**
 * AKTION feld { tx, ty }: Spitzhacke im Inventar → um (tx, ty) entsteht ein quadratisches Erdfeld aus FELD_GROESSE² Beeten.
 * Nur auf Rasen, nur wenn alle Kacheln frei sind (Client zeigt die Vorschau grün/rot – der Server prüft nochmal).
 */
export function legeFeldAn(spielWelt, spieler, tx, ty) {
  if (!Number.isInteger(tx) || !Number.isInteger(ty)) return;
  if (!spieler.inventar.some((e) => e?.defId === 'spitzhacke')) {
    spielWelt.melde(spieler.id, 'Du brauchst eine Spitzhacke');
    return;
  }
  const welt = spielWelt.welt;
  const kacheln = feldKacheln(tx, ty);
  if (!kachelInReichweite(welt, spieler.x, spieler.y, tx, ty)) {
    spielWelt.melde(spieler.id, 'Zu weit weg');
    return;
  }
  for (const k of kacheln) {
    const platz = pruefePlatz(welt, 'beet', k.tx, k.ty);
    if (!platz.ok) {
      spielWelt.melde(spieler.id, `Hier geht kein Feld: ${platz.grund}`);
      return;
    }
  }
  for (const k of kacheln) welt.setzeBauwerk({ id: spielWelt.neueBauwerkId(), typ: 'beet', tx: k.tx, ty: k.ty, besitzer: spieler.name, pflanze: null, wachstum: 0 });
  const g = welt.kachelGroesse;
  spielWelt.ereignis({ typ: 'gebaut', bauwerk: 'beet', x: (tx + 0.5) * g, y: (ty + 0.5) * g, von: spieler.id });
  spielWelt.melde(spieler.id, 'Erdfeld angelegt – jetzt Samen pflanzen (E)');
}

/** F am Lagerfeuer: anzünden (nur mit Feuerzeug) bzw. löschen. @returns true, wenn ein Feuer in Reichweite war */
export function feuer(spielWelt, spieler) {
  const b = spielWelt.welt.naechstesBauwerk(spieler.x, spieler.y, BAUWERK_REICHWEITE, (x) => x.typ === 'lagerfeuer');
  if (!b) return false;
  if (b.brennt) {
    Object.assign(b, { brennt: false, brennRest: 0 });
    spielWelt.melde(spieler.id, 'Feuer gelöscht');
  } else {
    if (!spieler.inventar.some((e) => e?.defId === 'feuerzeug')) {
      spielWelt.melde(spieler.id, 'Du brauchst ein Feuerzeug');
      return true;
    }
    Object.assign(b, { brennt: true, brennRest: spielWelt.konfiguration.bauen.brennDauer });
    spielWelt.melde(spieler.id, 'Das Feuer brennt');
  }
  spielWelt.welt.setzeBauwerk(b);
  spielWelt.ereignis({ typ: 'feuer', an: b.brennt, x: mitteX(spielWelt, b), y: mitteY(spielWelt, b) });
  return true;
}

/**
 * E an einem Bauwerk – macht genau das, was bauwerkAktion() (auch im Client) anzeigt.
 * @param bauwerkId    bestimmtes Bauwerk (sonst das nächste mit möglicher Aktion)
 * @param wunschPflanze beim Pflanzen diese Sorte nehmen (Samen im Inventar benutzt)
 */
export function benutzeBauwerk(spielWelt, spieler, bauwerkId = null, wunschPflanze = null) {
  const welt = spielWelt.welt;
  const b =
    bauwerkId !== null
      ? welt.bauwerke.get(bauwerkId)
      : welt.naechstesBauwerk(spieler.x, spieler.y, BAUWERK_REICHWEITE, (x) => bauwerkAktion(x, spieler.inventar) !== null);
  if (!b || !bauwerkAktion(b, spieler.inventar)) return;
  const aktion = bauwerkAktion(b, spieler.inventar);
  const k = spielWelt.konfiguration.bauen;
  switch (aktion.art) {
    case 'aufnehmen': {
      const rest = fuegeZumInventarHinzu(spieler, 'falle', 1);
      if (rest > 0) {
        spielWelt.melde(spieler.id, 'Inventar voll');
        return;
      }
      welt.entferneBauwerk(b.id);
      spielWelt.melde(spieler.id, 'Falle eingepackt');
      return;
    }
    case 'spannen':
      b.gespannt = true;
      welt.setzeBauwerk(b);
      spielWelt.ereignis({ typ: 'falle', gespannt: true, x: mitteX(spielWelt, b), y: mitteY(spielWelt, b) });
      spielWelt.melde(spieler.id, 'Falle gespannt');
      return;
    case 'oeffnen':
      oeffneKiste(spielWelt, spieler, b);
      return;
    case 'kochen':
      spieler.arbeit = { art: 'kochen', dauer: k.kochDauer, rest: k.kochDauer, x: spieler.x, y: spieler.y, bauwerkId: b.id, naechsterSchlag: 99 };
      return;
    case 'pflanzen': {
      const hatSamen = (x) => spieler.inventar.some((e) => e?.defId === x.samen);
      const [pflanze, p] =
        wunschPflanze && hatSamen(PFLANZEN[wunschPflanze]) ? [wunschPflanze, PFLANZEN[wunschPflanze]] : Object.entries(PFLANZEN).find(([, x]) => hatSamen(x));
      verbrauche(spieler, spieler.inventar.findIndex((e) => e?.defId === p.samen));
      Object.assign(b, { pflanze, wachstum: 0 });
      welt.setzeBauwerk(b);
      spielWelt.ereignis({ typ: 'gepflanzt', x: mitteX(spielWelt, b), y: mitteY(spielWelt, b), von: spieler.id });
      spielWelt.melde(spieler.id, `${p.name} gepflanzt – braucht einen Tag (24 h), bei Regen die Hälfte`);
      return;
    }
    case 'ernten': {
      const p = PFLANZEN[b.pflanze];
      const rest = fuegeZumInventarHinzu(spieler, p.ernte, k.ernteMenge);
      if (rest > 0) legeAufBoden(spielWelt, { defId: p.ernte, menge: rest }, spieler.x, spieler.y);
      Object.assign(b, { pflanze: null, wachstum: 0 });
      welt.setzeBauwerk(b);
      spielWelt.ereignis({ typ: 'geerntet', x: mitteX(spielWelt, b), y: mitteY(spielWelt, b), von: spieler.id });
      spielWelt.melde(spieler.id, `+${k.ernteMenge} ${GEGENSTAENDE[p.ernte].name}`);
    }
  }
}

/** Kochen fertig (vom arbeitSystem aufgerufen): ein rohes Lebensmittel → gebratene Variante. */
export function kochenFertig(spielWelt, spieler) {
  const b = spielWelt.welt.bauwerke.get(spieler.arbeit?.bauwerkId);
  spieler.arbeit = null;
  if (!b?.brennt) {
    spielWelt.melde(spieler.id, 'Das Feuer ist aus');
    return;
  }
  const slot = spieler.inventar.findIndex((e) => e && KOCHBAR[e.defId]);
  if (slot < 0) return;
  const gekocht = KOCHBAR[spieler.inventar[slot].defId];
  verbrauche(spieler, slot);
  const rest = fuegeZumInventarHinzu(spieler, gekocht, 1);
  if (rest > 0) legeAufBoden(spielWelt, { defId: gekocht, menge: rest }, spieler.x, spieler.y);
  spielWelt.ereignis({ typ: 'gekocht', von: spieler.id, x: mitteX(spielWelt, b), y: mitteY(spielWelt, b) });
  spielWelt.melde(spieler.id, `${GEGENSTAENDE[gekocht].name} fertig`);
}

/** Pro Tick: Feuer, Fallen, Pflanzen. @param spielSekunden vergangene Spielzeit (Schlafen spult vor) */
export function aktualisiereBauwerke(spielWelt, dt, spielSekunden = dt) {
  const welt = spielWelt.welt;
  if (dt > 0) aktualisiereKisten(spielWelt);
  if (welt.bauwerke.size === 0) return;
  const wachstumFaktor = spielWelt.wetter?.art === 'regen' ? WACHSTUM_REGEN_FAKTOR : 1;
  const k = spielWelt.konfiguration.bauen;
  const zyklus = spielWelt.konfiguration.welt.tagSekunden + spielWelt.konfiguration.welt.nachtSekunden;
  for (const b of welt.bauwerke.values()) {
    if (b.typ === 'lagerfeuer' && b.brennt) {
      b.brennRest -= dt;
      if (b.brennRest <= 0) {
        Object.assign(b, { brennt: false, brennRest: 0 });
        welt.setzeBauwerk(b);
        spielWelt.ereignis({ typ: 'feuer', an: false, x: mitteX(spielWelt, b), y: mitteY(spielWelt, b) });
      }
    } else if (b.typ === 'falle' && b.gespannt) {
      pruefeFalle(spielWelt, b);
    } else if (b.typ === 'beet' && b.pflanze && b.wachstum < 1) {
      // 24 Spielstunden = ein ganzer Tag-Nacht-Zyklus (Faktor in konfiguration.bauen.wachstumsTage)
      const vorher = Math.floor(b.wachstum * 4);
      b.wachstum = Math.min(1, b.wachstum + (spielSekunden * wachstumFaktor) / (zyklus * k.wachstumsTage));
      // Nur bei sichtbaren Stufen (Keimling, klein, groß, reif) neu verschicken
      if (Math.floor(b.wachstum * 4) !== vorher || b.wachstum >= 1) welt.setzeBauwerk(b);
    }
  }
}

function pruefeFalle(spielWelt, b) {
  const g = spielWelt.welt.kachelGroesse;
  const x = (b.tx + 0.5) * g;
  const y = (b.ty + 0.5) * g;
  for (const z of spielWelt.alleVomTyp('zombie')) {
    if (Math.hypot(z.x - x, z.y - y) > FALLEN_RADIUS + z.radius * 0.5) continue;
    b.gespannt = false;
    spielWelt.welt.setzeBauwerk(b);
    spielWelt.ereignis({ typ: 'falle', gespannt: false, x, y });
    // XP bekommt, wer die Falle gestellt hat (falls online)
    const besitzer = [...spielWelt.alleVomTyp('spieler')].find((s) => s.name === b.besitzer && !s.tot) ?? null;
    toeten(spielWelt, z, besitzer);
    return;
  }
}

function kachelBesetzt(spielWelt, tx, ty) {
  const g = spielWelt.welt.kachelGroesse;
  for (const e of spielWelt.entitaeten.values()) {
    if (e.typ !== 'spieler' && e.typ !== 'zombie') continue;
    if (e.tot) continue;
    const r = e.radius ?? 12;
    if (e.x + r > tx * g && e.x - r < (tx + 1) * g && e.y + r > ty * g && e.y - r < (ty + 1) * g) return true;
  }
  return false;
}

const mitteX = (spielWelt, b) => (b.tx + 0.5) * spielWelt.welt.kachelGroesse;
const mitteY = (spielWelt, b) => (b.ty + 0.5) * spielWelt.welt.kachelGroesse;

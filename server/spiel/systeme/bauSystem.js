import { BEET_TYPEN } from '../../../gemeinsam/welt/bauwerke.js';
import { FALLEN_TYPEN, aktualisiereFalle, neueFallenWerte } from './fallenSystem.js';
import { BAUWERKE, BAUWERK_REICHWEITE, PFLANZEN, bauwerkAktion, feldKacheln, kachelInReichweite, pruefePlatz } from '../../../gemeinsam/welt/bauwerke.js';
import { flaggeFuerBauteil, gebietBei } from './territoriumSystem.js';
import { RECHT, hatRecht } from '../../../gemeinsam/basisbau/rechte.js';
import { setzeSpawn } from './spawnSystem.js';
import { starteSchlafen } from './arbeitSystem.js';
import { GEGENSTAENDE } from '../konfiguration/gegenstaende.js';
import { fuegeZumInventarHinzu, legeAufBoden, nutzeWerkzeug, verbrauche } from './inventarSystem.js';
import { lasseVerderben } from './gesundheitSystem.js';
import { aktualisiereStation, aktualisiereStationen, leerePlaetze, oeffneStation } from './stationSystem.js';
import { toeten } from './kampfSystem.js';
import { aktualisiereKisten, leererKistenInhalt, oeffneKiste } from './kistenSystem.js';
import { WACHSTUM_REGEN_FAKTOR, regnet } from './wetterSystem.js';

/**
 * Bauwerke (Werkbank, Lagerfeuer, Falle, Beet; Basisbau-Teile werden von basisbauSystem.js gesetzt) – Regeln & Daten:
 * gemeinsam/welt/bauwerke.js. Gespeichert in spielWelt.welt.bauwerke (Map) – die Welt-Klasse kümmert sich um Kollision.
 * E an einem Bauwerk (benutzeBauwerk) gilt auch für Basisbau-Teile: Tür öffnen/schließen, Kiste öffnen, Bett (Spawn Point) –
 * geschützte Teile (Kiste, Tür, Bett) nur für ihren Besitzer bzw. Berechtigte (gemeinsam/basisbau/rechte.js).
 *
 *   AKTION platzieren { slot, tx, ty }  Item aus dem Inventar aufstellen
 *   AKTION feld { tx, ty }              mit der Hacke (in der Hand) ein Ackerfeld (FELD_GROESSE², jetzt 1×1) anlegen
 *   AKTION feldEntfernen { tx, ty }     mit der Hacke (in der Hand) ein Beet wieder zu Rasen machen
 *   AKTION feuer                        nächstes Lagerfeuer an (braucht Feuerzeug) / aus
 *   AKTION bauwerk                      E am nächsten Bauwerk: Falle aufnehmen/spannen, Feuer-/Ofen-Menü (→ stationSystem.js), pflanzen, ernten
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
  if (fremdesGebiet(spielWelt, spieler, tx, ty)) return;
  if (BAUWERKE[typ].blockiert && kachelBesetzt(spielWelt, tx, ty)) {
    spielWelt.melde(spieler.id, 'Da steht jemand');
    return;
  }
  welt.setzeBauwerk(neuesBauwerk(spielWelt, typ, tx, ty, spieler.name));
  if (def.kategorie === 'bauwerk') verbrauche(spieler, slot);
  const g = welt.kachelGroesse;
  spielWelt.ereignis({ typ: 'gebaut', bauwerk: typ, x: (tx + 0.5) * g, y: (ty + 0.5) * g, von: spieler.id });
  spielWelt.melde(spieler.id, typ === 'beet' ? 'Beet angelegt – jetzt Samen pflanzen (E)' : `${BAUWERKE[typ].name} aufgestellt`);
}

/** Liegt die Kachel im Baugebiet eines anderen (ohne BAUEN-Recht)? Dann meldet das und gibt true zurück. */
function fremdesGebiet(spielWelt, spieler, tx, ty) {
  const gebiet = gebietBei(spielWelt, tx, ty);
  if (!gebiet || hatRecht(gebiet, spieler.name, RECHT.BAUEN)) return false;
  spielWelt.melde(spieler.id, 'Fremdes Baugebiet');
  return true;
}

/** Frisches Bauwerk mit den Startwerten seines Typs (id vergibt die Welt). Auch für den Basisbau. */
export function neuesBauwerk(spielWelt, typ, tx, ty, besitzer, zusatz = {}) {
  const b = { id: spielWelt.neueBauwerkId(), typ, tx, ty, besitzer, ...zusatz };
  if (typ === 'lagerfeuer') Object.assign(b, { brennt: false, brennRest: 0, plaetze: leerePlaetze(typ) });
  if (typ === 'schmelzofen') Object.assign(b, { brennt: false, brennRest: 0, brennstoff: 0, plaetze: leerePlaetze(typ) });
  if (typ === 'falle') b.gespannt = true;
  if (FALLEN_TYPEN.has(typ)) Object.assign(b, neueFallenWerte(typ, spielWelt.konfiguration.fallen));
  if (BEET_TYPEN.has(typ)) Object.assign(b, { pflanze: null, wachstum: 0 });
  if (typ === 'huehnerstall') b.eier = 0;
  if (typ === 'bienenstock') b.honig = 0;
  if (BAUWERKE[typ]?.kiste) b.inhalt = leererKistenInhalt();
  if (BAUWERKE[typ].schaltbar) b.offen = false;
  return b;
}

/**
 * AKTION feld { tx, ty }: Hacke in der Hand → um (tx, ty) entsteht ein quadratisches Erdfeld aus FELD_GROESSE² Beeten.
 * Nur auf Rasen, nur wenn alle Kacheln frei sind (Client zeigt die Vorschau grün/rot – der Server prüft nochmal).
 */
export function legeFeldAn(spielWelt, spieler, tx, ty) {
  if (!Number.isInteger(tx) || !Number.isInteger(ty)) return;
  if (spieler.inventar[spieler.ausgeruestet ?? -1]?.defId !== 'hacke') {
    spielWelt.melde(spieler.id, 'Nimm die Hacke in die Hand, um ein Erdfeld anzulegen');
    return;
  }
  const welt = spielWelt.welt;
  const kacheln = feldKacheln(tx, ty);
  if (!kachelInReichweite(welt, spieler.x, spieler.y, tx, ty)) {
    spielWelt.melde(spieler.id, 'Zu weit weg');
    return;
  }
  for (const k of kacheln) {
    if (fremdesGebiet(spielWelt, spieler, k.tx, k.ty)) return;
    const platz = pruefePlatz(welt, 'beet', k.tx, k.ty);
    if (!platz.ok) {
      spielWelt.melde(spieler.id, `Hier geht kein Feld: ${platz.grund}`);
      return;
    }
  }
  for (const k of kacheln) welt.setzeBauwerk({ id: spielWelt.neueBauwerkId(), typ: 'beet', tx: k.tx, ty: k.ty, besitzer: spieler.name, pflanze: null, wachstum: 0 });
  nutzeWerkzeug(spielWelt, spieler, 'hacke');
  const g = welt.kachelGroesse;
  hackeSchlag(spielWelt, spieler, tx, ty);
  spielWelt.ereignis({ typ: 'gebaut', bauwerk: 'beet', x: (tx + 0.5) * g, y: (ty + 0.5) * g, von: spieler.id });
}

/** AKTION feldEntfernen { tx, ty }: Hacke in der Hand → Beet (auch mit Pflanze) wird wieder Rasen. */
export function entferneFeld(spielWelt, spieler, tx, ty) {
  if (!Number.isInteger(tx) || !Number.isInteger(ty)) return;
  if (spieler.inventar[spieler.ausgeruestet ?? -1]?.defId !== 'hacke') return;
  const welt = spielWelt.welt;
  if (!kachelInReichweite(welt, spieler.x, spieler.y, tx, ty)) return;
  const beet = welt.bauwerkBei(tx, ty, 'objekt');
  if (beet?.typ !== 'beet') return;
  if (fremdesGebiet(spielWelt, spieler, tx, ty)) return;
  welt.entferneBauwerk(beet.id);
  const g = welt.kachelGroesse;
  hackeSchlag(spielWelt, spieler, tx, ty);
  spielWelt.ereignis({ typ: 'gebaut', bauwerk: 'beet', x: (tx + 0.5) * g, y: (ty + 0.5) * g, von: spieler.id });
}

/** Kurzer Hacken-Schlag (nur Animation, kein Schaden): Figur dreht sich zur Kachel, Aktion 'hacke' (Clip „hacke“ im Renderer). */
export const HACKE_ANIMATION = 0.6;
function hackeSchlag(spielWelt, spieler, tx, ty) {
  const g = spielWelt.welt.kachelGroesse;
  spieler.blick = Math.atan2((ty + 0.5) * g - spieler.y, (tx + 0.5) * g - spieler.x);
  spielWelt.setzeAktion(spieler, 'hacke', HACKE_ANIMATION);
}

/** Runde 24: Kamin an (Feuerzeug) / aus – brennt `kaminDauer` s, Holz in der Hand legt nach (stationSystem.schuereFeuer). */
function zuendeKamin(spielWelt, spieler, b) {
  if (b.brennt) Object.assign(b, { brennt: false, brennRest: 0 });
  else if (!spieler.inventar.some((e) => e?.defId === 'feuerzeug')) {
    spielWelt.melde(spieler.id, 'Du brauchst ein Feuerzeug');
    return;
  } else Object.assign(b, { brennt: true, brennRest: spielWelt.konfiguration.bauen.kaminDauer });
  spielWelt.welt.setzeBauwerk(b);
  spielWelt.ereignis({ typ: 'lagerfeuer', an: b.brennt, x: mitteX(spielWelt, b), y: mitteY(spielWelt, b) });
}

/** Runde 24: Generator starten (verbraucht 1 Benzin, falls der Tank leer ist) / ausschalten. */
function schalteGenerator(spielWelt, spieler, b) {
  if (b.laeuft) b.laeuft = false;
  else {
    if ((b.brennRest ?? 0) <= 0) {
      const slot = spieler.inventar.findIndex((e) => e?.defId === 'benzin');
      if (slot < 0) {
        spielWelt.melde(spieler.id, 'Der Tank ist leer – du brauchst Benzin');
        return;
      }
      verbrauche(spieler, slot);
      b.brennRest = spielWelt.konfiguration.bauen.generatorDauer;
    }
    b.laeuft = true;
    spielWelt.melde(spieler.id, `⚡ Generator läuft (${Math.ceil(b.brennRest / 60)} min Benzin)`);
  }
  spielWelt.welt.setzeBauwerk(b);
  spielWelt.ereignis({ typ: 'generator', an: b.laeuft, x: mitteX(spielWelt, b), y: mitteY(spielWelt, b) });
}

/** F am Lagerfeuer: anzünden (nur mit Feuerzeug) bzw. löschen. @returns true, wenn ein Feuer in Reichweite war */
export function feuer(spielWelt, spieler) {
  const kamin = spielWelt.welt.naechstesBauwerk(spieler.x, spieler.y, BAUWERK_REICHWEITE, (x) => x.typ === 'kamin');
  if (kamin) {
    zuendeKamin(spielWelt, spieler, kamin); // Runde 24: F geht auch am Kamin
    return true;
  }
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
    if (regnet(spielWelt.wetter?.art)) {
      spielWelt.melde(spieler.id, 'Bei Regen brennt nichts');
      return true;
    }
    Object.assign(b, { brennt: true, brennRest: spielWelt.konfiguration.bauen.brennDauer });
    spielWelt.melde(spieler.id, 'Das Feuer brennt');
  }
  spielWelt.welt.setzeBauwerk(b);
  spielWelt.ereignis({ typ: 'lagerfeuer', an: b.brennt, x: mitteX(spielWelt, b), y: mitteY(spielWelt, b) });
  return true;
}

/**
 * E an einem Bauwerk – macht genau das, was bauwerkAktion() (auch im Client) anzeigt.
 * @param bauwerkId    bestimmtes Bauwerk (sonst das nächste mit möglicher Aktion)
 * @param wunschPflanze beim Pflanzen diese Sorte nehmen (Samen im Inventar benutzt)
 */
export function benutzeBauwerk(spielWelt, spieler, bauwerkId = null, wunschPflanze = null) {
  const welt = spielWelt.welt;
  const aktionFuer = (x) => bauwerkAktion(x, spieler.inventar, spieler.name, flaggeFuerBauteil(spielWelt, x));
  // Erst Benutzbares, erst danach "gesperrt" (eine fremde Kiste in der Nähe soll das eigene Bett nicht verdecken)
  const b =
    bauwerkId !== null
      ? welt.bauwerke.get(bauwerkId)
      : (welt.naechstesBauwerk(spieler.x, spieler.y, BAUWERK_REICHWEITE, (x) => aktionFuer(x) !== null && aktionFuer(x).art !== 'gesperrt') ??
        welt.naechstesBauwerk(spieler.x, spieler.y, BAUWERK_REICHWEITE, (x) => aktionFuer(x) !== null));
  const aktion = b && aktionFuer(b);
  if (!aktion) return;
  const k = spielWelt.konfiguration.bauen;
  switch (aktion.art) {
    case 'gesperrt':
      spielWelt.melde(spieler.id, aktion.text);
      return;
    case 'tuerSchalten':
      schalteTuer(spielWelt, spieler, b);
      return;
    case 'spawn':
      setzeSpawn(spielWelt, spieler, b, true);
      starteSchlafen(spielWelt, spieler); // Runde 24: gebaute Betten/Schlafsack = schlafen (Bett-Qualität)
      return;
    case 'station':
      oeffneStation(spielWelt, spieler, b);
      return;
    case 'aufnehmen': {
      const rest = fuegeZumInventarHinzu(spieler, BAUWERKE[b.typ].item ?? 'falle', 1);
      if (rest > 0) {
        spielWelt.melde(spieler.id, 'Inventar voll');
        return;
      }
      welt.entferneBauwerk(b.id);
      spielWelt.melde(spieler.id, `${BAUWERKE[b.typ].name} eingepackt`);
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
    // Runde 24 (Cozy)
    case 'licht':
      b.an = b.an === false;
      welt.setzeBauwerk(b);
      spielWelt.ereignis({ typ: 'schalter', x: mitteX(spielWelt, b), y: mitteY(spielWelt, b) });
      return;
    case 'kamin':
      zuendeKamin(spielWelt, spieler, b);
      return;
    case 'generator':
      schalteGenerator(spielWelt, spieler, b);
      return;
    case 'musik':
    case 'info':
    case 'handwerk':
      return; // Auswahl-Fenster im Client → AKTION musik (musikSystem) / herstellen (Station) bzw. nur Hinweis
    case 'wasser':
      fuelleFlasche(spielWelt, spieler, b);
    case 'eier':
    case 'honig': {
      const feld = aktion.art === 'eier' ? 'eier' : 'honig';
      const defId = aktion.art === 'eier' ? 'ei' : 'honig';
      const rest = fuegeZumInventarHinzu(spieler, defId, b[feld]);
      if (rest > 0) legeAufBoden(spielWelt, { defId, menge: rest }, spieler.x, spieler.y);
      spielWelt.melde(spieler.id, `+${b[feld]} ${GEGENSTAENDE[defId].name}`);
      b[feld] = 0;
      welt.setzeBauwerk(b);
      spielWelt.ereignis({ typ: aktion.art === 'eier' ? 'gackern' : 'summen', x: mitteX(spielWelt, b), y: mitteY(spielWelt, b) });
      return;
    }
    case 'pflanzen': {
      const hatSamen = (x) => spieler.inventar.some((e) => e?.defId === x.samen);
      const [pflanze, p] =
        wunschPflanze && hatSamen(PFLANZEN[wunschPflanze]) ? [wunschPflanze, PFLANZEN[wunschPflanze]] : Object.entries(PFLANZEN).find(([, x]) => hatSamen(x));
      verbrauche(spieler, spieler.inventar.findIndex((e) => e?.defId === p.samen));
      Object.assign(b, { pflanze, wachstum: 0 });
      welt.setzeBauwerk(b);
      spielWelt.ereignis({ typ: 'gepflanzt', x: mitteX(spielWelt, b), y: mitteY(spielWelt, b), von: spieler.id });
      spielWelt.melde(spieler.id, spielWelt.tutorial ? `${p.name} gepflanzt – im Tutorial gleich reif` : `${p.name} gepflanzt – braucht einen Tag (24 h), bei Regen die Hälfte`);
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

/** Holztür (Basisbau) öffnen/schließen. Zu geht nicht, solange jemand im Durchgang steht. */
function schalteTuer(spielWelt, spieler, tuer) {
  if (tuer.offen && kachelBesetzt(spielWelt, tuer.tx, tuer.ty)) {
    spielWelt.melde(spieler.id, 'Da steht jemand im Weg');
    return;
  }
  tuer.offen = !tuer.offen;
  spielWelt.welt.setzeBauwerk(tuer);
  spielWelt.ereignis({ typ: 'tuerBau', offen: tuer.offen, x: mitteX(spielWelt, tuer), y: mitteY(spielWelt, tuer) });
}

/** Pro Tick: Feuer, Fallen, Pflanzen. @param spielSekunden vergangene Spielzeit (Schlafen spult vor) */
const REGENTONNE_MAX = 6;
const REGENTONNE_PRO_STUNDE = 1;

/** Runde 24 (P12): E an Regentonne/Brunnen mit leerer Flasche → Wasser (Tonne: sauber, Brunnen: dreckig – abkochen!). */
function fuelleFlasche(spielWelt, spieler, b) {
  const slot = spieler.inventar.findIndex((e) => e?.defId === 'leere_flasche');
  if (slot < 0) return;
  if (b.typ === 'regentonne') {
    if ((b.wasser ?? 0) < 1) return spielWelt.melde(spieler.id, 'Die Tonne ist leer – warte auf Regen');
    b.wasser -= 1;
    spielWelt.welt.setzeBauwerk(b);
  }
  const ergebnis = b.typ === 'regentonne' ? 'wasserflasche' : 'wasser_dreckig';
  verbrauche(spieler, slot);
  const rest = fuegeZumInventarHinzu(spieler, ergebnis, 1);
  if (rest > 0) legeAufBoden(spielWelt, { defId: ergebnis, menge: rest }, spieler.x, spieler.y);
  spielWelt.ereignis({ typ: 'wasserFuellen', x: mitteX(spielWelt, b), y: mitteY(spielWelt, b), von: spieler.id });
  spielWelt.melde(spieler.id, b.typ === 'regentonne' ? '💧 Sauberes Regenwasser abgefüllt' : '💧 Brunnenwasser abgefüllt – vor dem Trinken abkochen');
}

export function aktualisiereBauwerke(spielWelt, dt, spielSekunden = dt) {
  const welt = spielWelt.welt;
  if (dt > 0) aktualisiereKisten(spielWelt);
  if (dt > 0) aktualisiereStationen(spielWelt);
  if (welt.bauwerke.size === 0) return;
  const wachstumFaktor = regnet(spielWelt.wetter?.art) ? WACHSTUM_REGEN_FAKTOR : 1;
  const k = spielWelt.konfiguration.bauen;
  const zyklus = spielWelt.konfiguration.welt.tagSekunden + spielWelt.konfiguration.welt.nachtSekunden;
  for (const b of welt.bauwerke.values()) {
    if (b.typ === 'lagerfeuer' || b.typ === 'schmelzofen') {
      if (b.typ === 'lagerfeuer' && b.brennt) {
        b.brennRest -= dt;
        const regen = regnet(spielWelt.wetter?.art);
        if (b.brennRest <= 0 || regen) {
          Object.assign(b, { brennt: false, brennRest: 0 });
          welt.setzeBauwerk(b);
          spielWelt.ereignis({ typ: 'lagerfeuer', an: false, x: mitteX(spielWelt, b), y: mitteY(spielWelt, b), geloescht: regen });
        }
      }
      if (dt > 0) aktualisiereStation(spielWelt, b, dt);
    } else if ((b.typ === 'kamin' && b.brennt) || (b.typ === 'generator' && b.laeuft)) {
      // Runde 24: Kamin brennt herunter, Generator verbraucht Benzin
      b.brennRest -= dt;
      if (b.brennRest <= 0) {
        Object.assign(b, b.typ === 'kamin' ? { brennt: false, brennRest: 0 } : { laeuft: false, brennRest: 0 });
        welt.setzeBauwerk(b);
        spielWelt.ereignis({ typ: b.typ === 'kamin' ? 'lagerfeuer' : 'generator', an: false, x: mitteX(spielWelt, b), y: mitteY(spielWelt, b) });
      }
    } else if (b.typ === 'falle' && b.gespannt) {
      pruefeFalle(spielWelt, b);
    } else if (FALLEN_TYPEN.has(b.typ) && dt > 0) {
      aktualisiereFalle(spielWelt, b, dt);
    } else if (b.typ === 'regentonne' && wachstumFaktor > 1) {
      // Runde 24 (P12): Regen füllt die Tonne (REGENTONNE_PRO_STUNDE Flaschen je Spielstunde, max REGENTONNE_MAX)
      const vorher = Math.floor(b.wasser ?? 0);
      b.wasser = Math.min(REGENTONNE_MAX, (b.wasser ?? 0) + (spielSekunden * REGENTONNE_PRO_STUNDE * 24) / zyklus);
      if (Math.floor(b.wasser) !== vorher) welt.setzeBauwerk(b);
    } else if (BAUWERKE[b.typ].kiste && b.inhalt && spielSekunden > 0) {
      // Runde 24 (P12): Essen in Kisten verdirbt (Vorratsschrank nur zu vorratFaktor)
      b.verderbTakt = (b.verderbTakt ?? 0) + spielSekunden;
      if (b.verderbTakt >= 5) {
        lasseVerderben(b.inhalt, b.verderbTakt * (b.typ === 'vorratsschrank' ? spielWelt.konfiguration.gesundheit?.vorratFaktor ?? 1 : 1));
        b.verderbTakt = 0;
      }
    } else if (b.typ === 'huehnerstall' || b.typ === 'bienenstock') {
      // Runde 24: Eier/Honig sammeln sich an (spielSekunden → auch beim Schlafen)
      erzeugeErtrag(spielWelt, b, spielSekunden, zyklus);
    } else if (BEET_TYPEN.has(b.typ) && b.pflanze && b.wachstum < 1) {
      // 24 Spielstunden = ein ganzer Tag-Nacht-Zyklus (Faktor in konfiguration.bauen.wachstumsTage); Gewächshaus doppelt so schnell
      const vorher = Math.floor(b.wachstum * 4);
      const faktor = b.typ === 'gewaechshaus' ? 2 : wachstumFaktor;
      b.wachstum = Math.min(1, b.wachstum + (spielSekunden * faktor) / (zyklus * k.wachstumsTage));
      // Nur bei sichtbaren Stufen (Keimling, klein, groß, reif) neu verschicken
      if (Math.floor(b.wachstum * 4) !== vorher || b.wachstum >= 1) welt.setzeBauwerk(b);
    }
  }
}

/** Runde 24: Hühnerstall legt alle `farm.eierStunden` Spielstunden ein Ei (max. eierMax), Bienenstock Honig (Beete in der Nähe ×2). */
function erzeugeErtrag(spielWelt, b, spielSekunden, zyklus) {
  const f = spielWelt.konfiguration.farm;
  const ei = b.typ === 'huehnerstall';
  const feld = ei ? 'eier' : 'honig';
  if ((b[feld] ?? 0) >= (ei ? f.eierMax : f.honigMax)) return;
  let tempo = 1;
  if (!ei) {
    const welt = spielWelt.welt;
    let bluehend = 0;
    for (const x of welt.bauwerke.values()) if (BEET_TYPEN.has(x.typ) && x.pflanze && Math.hypot(x.tx - b.tx, x.ty - b.ty) <= 6) bluehend++;
    tempo = bluehend >= 2 ? 2 : 1;
  }
  b.fortschritt = (b.fortschritt ?? 0) + (spielSekunden * tempo) / ((zyklus / 24) * (ei ? f.eierStunden : f.honigStunden));
  if (b.fortschritt < 1) return;
  b.fortschritt -= 1;
  b[feld] = (b[feld] ?? 0) + 1;
  spielWelt.welt.setzeBauwerk(b);
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

/** Steht ein lebender Spieler/Zombie auf der Kachel? (blockierende Bauwerke dürfen nicht auf jemanden gesetzt werden) */
export function kachelBesetzt(spielWelt, tx, ty) {
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

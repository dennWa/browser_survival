import { KACHELN } from './kacheln.js';
import { darfBenutzen } from '../basisbau/rechte.js';

/**
 * Bauwerke = von Spielern in die Welt gesetzte Dinge (eine Kachel groß): Werkbank, Lagerfeuer, Falle, Beet und
 * die Basisbau-Teile (Boden, Wand, Dach, Tür, Kiste, Bett – Menü/Kosten: gemeinsam/basisbau/teile.js).
 * Server UND Client nutzen diese Regeln (Vorschau grün/rot im Client = Prüfung auf dem Server).
 *
 * Ein Bauwerk (Daten, so auch im Netzwerk und im Welt-Spielstand):
 *   { id, typ, tx, ty, besitzer,            ← immer
 *     brennt, brennRest,                    ← lagerfeuer
 *     gespannt,                             ← falle
 *     pflanze, wachstum,                    ← beet (pflanze = 'tomate' | 'gurke' | 'kartoffel' | 'paprika' | null, wachstum 0..1)
 *     drehung,                              ← Teile mit `ausrichtung`: 0 = Öffnung/Rahmen läuft Ost-West, 1 = Nord-Süd
 *     offen }                               ← holztuer (schaltbar)
 *
 *   item        → Item, das beim Bauen verbraucht wird (null = entsteht anders: Beet mit der Hacke, Basisbau über das Menü)
 *   ebene       → Schicht auf der Kachel (EBENEN): pro Kachel liegt je Ebene höchstens EIN Bauwerk, z. B. Boden + Wand + Dach
 *                 übereinander. Standard 'objekt' (Werkbank, Feuer, Falle, Beet, Kiste, Bett).
 *   blockiert   → Kollision (Spieler, Zombies, Pfadsuche); `schaltbar` + offen → durchlässig
 *   sichtBlockiert → blockiert Sicht & Schüsse (Wand, geschlossene Tür) – Fenster nicht
 *   draussen    → nur auf Außenböden (Lagerfeuer im Haus? Lieber nicht.)
 *   nurAuf      → nur auf diesen Kachelnamen (BAUBARER_UNTERGRUND = Rasen)
 *   anschluss   → Snapping: { kachel: [Ebenen auf DERSELBEN Kachel], nachbarn: [Ebenen auf einer der 4 Nachbarkacheln],
 *                 diagonal: [Ebenen auf einer der 4 Diagonalkacheln] } – mindestens eine Bedingung muss stimmen
 *                 (Wand dockt an Boden/Wand, Eckwand auch diagonal an einen Boden; Dach an Boden/Wand/Dach)
 *   rahmen      → Türöffnung: nimmt eine holztuer auf
 *   geschuetzt  → nur Besitzer (bzw. Berechtigte, rechte.js) dürfen es benutzen
 */
export const EBENEN = Object.freeze(['boden', 'objekt', 'wand', 'tuer', 'dach']);
/** Worauf gebaut werden darf (Kachelnamen aus KACHELN). Später z. B. 'erde', 'sand' ergänzen. */
export const BAUBARER_UNTERGRUND = Object.freeze(['gras']);
const BASIS = { item: null, nurAuf: BAUBARER_UNTERGRUND };

export const BAUWERKE = Object.freeze({
  werkbank: { name: 'Werkbank', item: 'werkbank', blockiert: true },
  lagerfeuer: { name: 'Lagerfeuer', item: 'lagerfeuer', blockiert: true, draussen: true },
  falle: { name: 'Falle', item: 'falle', blockiert: false },
  beet: { name: 'Beet', item: null, blockiert: false, nurAuf: ['gras'] },
  // --- Basisbau (Teile mit Kosten: gemeinsam/basisbau/teile.js) ---
  holzboden: { ...BASIS, name: 'Holzboden', ebene: 'boden', blockiert: false },
  holzwand: { ...BASIS, name: 'Holzwand', ebene: 'wand', blockiert: true, sichtBlockiert: true, anschluss: { kachel: ['boden'], nachbarn: ['boden', 'wand'], diagonal: ['boden'] } },
  holzwand_fenster: { ...BASIS, name: 'Wand mit Fenster', ebene: 'wand', blockiert: true, anschluss: { kachel: ['boden'], nachbarn: ['boden', 'wand'], diagonal: ['boden'] } },
  holzwand_tuer: { ...BASIS, name: 'Wand mit Türöffnung', ebene: 'wand', blockiert: false, rahmen: true, anschluss: { kachel: ['boden'], nachbarn: ['boden', 'wand'], diagonal: ['boden'] } },
  holztuer: { ...BASIS, name: 'Holztür', ebene: 'tuer', blockiert: true, schaltbar: true, sichtBlockiert: true, geschuetzt: true },
  holzdach: { ...BASIS, name: 'Holzdach', ebene: 'dach', blockiert: false, anschluss: { kachel: ['boden', 'wand'], nachbarn: ['dach'] } },
  // Zaun & Zauntor: blockieren Bewegung (Zombies bleiben draußen), aber nicht die Sicht; Tor = schaltbar wie die Holztür
  zaun: { ...BASIS, name: 'Zaun', ebene: 'wand', blockiert: true },
  zauntor: { ...BASIS, name: 'Zauntor', ebene: 'wand', blockiert: true, schaltbar: true, geschuetzt: true },
  // Lagerkiste: 16 Plätze, Inhalt steht in b.inhalt (nur der Server kennt ihn – geht per KISTE-Nachricht an den, der sie öffnet)
  kiste: { ...BASIS, name: 'Lagerkiste', blockiert: true, geschuetzt: true },
  bett: { ...BASIS, name: 'Bett', blockiert: true, geschuetzt: true },
});

/** Ebene eines Bauwerk-Typs. */
export const ebeneVon = (typ) => BAUWERKE[typ]?.ebene ?? 'objekt';

/** Blockiert dieses Bauwerk gerade die Bewegung? (offene Türen nicht) */
export function blockiertBauwerk(b) {
  const def = BAUWERKE[b.typ];
  return def?.blockiert === true && !(def.schaltbar && b.offen === true);
}

/** Blockiert dieses Bauwerk gerade Sicht & Schüsse? (Wand ja, Fenster/Türöffnung nein, Tür nur geschlossen) */
export function sichtBlockiertBauwerk(b) {
  const def = BAUWERKE[b.typ];
  return def?.sichtBlockiert === true && !(def.schaltbar && b.offen === true);
}

/** Erdfeld (Spitzhacke, Taste G): quadratisch, FELD_GROESSE × FELD_GROESSE Kacheln, jede Kachel ein Beet. */
export const FELD_GROESSE = 3;

/** Kacheln eines Erdfelds um die Mittelkachel (tx, ty). */
export function feldKacheln(tx, ty) {
  const r = Math.floor(FELD_GROESSE / 2);
  const liste = [];
  for (let y = ty - r; y < ty - r + FELD_GROESSE; y++) for (let x = tx - r; x < tx - r + FELD_GROESSE; x++) liste.push({ tx: x, ty: y });
  return liste;
}

/** So weit (px, Spieler → Kachelmitte) darf man von sich weg bauen. */
export const BAU_REICHWEITE = 84;
/** So nah (px) muss man an einem Bauwerk stehen, um es zu benutzen (E/F). */
export const BAUWERK_REICHWEITE = 52;

/** Pflanzen: Samen-Item → was wächst, was man erntet, Farbe der Früchte (Darstellung). */
export const PFLANZEN = Object.freeze({
  tomate: { name: 'Tomate', samen: 'samen_tomate', ernte: 'tomate', farbe: 0xd8392b },
  gurke: { name: 'Gurke', samen: 'samen_gurke', ernte: 'gurke', farbe: 0x4f9a2a },
  kartoffel: { name: 'Kartoffel', samen: 'samen_kartoffel', ernte: 'kartoffel', farbe: 0xc9a26a },
  paprika: { name: 'Paprika', samen: 'samen_paprika', ernte: 'paprika', farbe: 0xe8a317 },
});

/** Kochen am brennenden Lagerfeuer: roh → gebraten (gebraten macht 30 % mehr satt, siehe gegenstaende.js). */
export const KOCHBAR = Object.freeze({
  tomate: 'tomate_gebraten',
  gurke: 'gurke_gebraten',
  kartoffel: 'ofenkartoffel',
  paprika: 'paprika_gebraten',
  fleisch: 'fleisch_gebraten',
  fisch_barsch: 'fisch_barsch_gebraten',
  fisch_forelle: 'fisch_forelle_gebraten',
  fisch_hecht: 'fisch_hecht_gebraten',
});

/**
 * Darf an Kachel (tx, ty) ein Bauwerk vom Typ `typ` physisch hin? Prüft Untergrund, Hindernisse und die Ebene –
 * NICHT Gebiet, Anschluss, Kosten, Reichweite oder Entitäten (das macht der Server zusätzlich, Snapping: basisbau/platzierung.js).
 * Wird auch beim Laden eines Weltstands benutzt (dort `streng = false`: der Untergrund wird nicht mehr geprüft, damit ältere Bauten erhalten bleiben).
 * @returns {{ ok: boolean, grund?: string }}
 */
export function pruefePlatz(welt, typ, tx, ty, streng = true) {
  const def = BAUWERKE[typ];
  const zeichen = welt.kachelAn(tx, ty);
  if (!def || zeichen === null) return { ok: false, grund: 'Hier nicht' };
  const kachel = KACHELN[zeichen];
  const ebene = def.ebene ?? 'objekt';
  if (streng && def.nurAuf && !def.nurAuf.includes(kachel?.name)) return { ok: false, grund: 'Nur auf Rasen' };
  if (welt.tuerBei(tx, ty) >= 0) return { ok: false, grund: 'Nicht in eine Tür' };
  if (ebene === 'tuer') {
    // Die Tür sitzt in einer Türöffnung (Wand mit Türöffnung) – sonst nirgends
    if (!BAUWERKE[welt.bauwerkBei(tx, ty, 'wand')?.typ]?.rahmen) return { ok: false, grund: 'Nur in eine Türöffnung' };
    if (welt.bauwerkBei(tx, ty, 'tuer')) return { ok: false, grund: 'Da ist schon eine Tür' };
    return { ok: true };
  }
  if (welt.bauwerkBei(tx, ty, ebene)) return { ok: false, grund: 'Da steht schon etwas' };
  // Wand und Objekt (Kiste, Bett …) teilen sich keine Kachel
  if (ebene === 'wand' && welt.bauwerkBei(tx, ty, 'objekt')) return { ok: false, grund: 'Da steht schon etwas' };
  if (ebene === 'objekt' && welt.bauwerkBei(tx, ty, 'wand')) return { ok: false, grund: 'Da steht schon eine Wand' };
  // Boden & Dach liegen auch unter/über anderen Bauteilen – nur Karten-Hindernisse (Wand, Möbel, Baum …) stören
  const frei = ebene === 'boden' || ebene === 'dach' ? !welt.istKartenBlockiert(tx, ty) : !welt.istBlockiert(tx, ty);
  if (!frei) return { ok: false, grund: 'Kein Platz' };
  if (def.draussen && kachel?.innen) return { ok: false, grund: 'Nur draußen' };
  return { ok: true };
}

/** Kachel, auf die man gerade baut: unter der Maus (wenn in Reichweite), sonst die Kachel vor einem. */
export function zielKachel(welt, x, y, blick, zielpunkt = null) {
  const g = welt.kachelGroesse;
  if (zielpunkt && Math.hypot(zielpunkt.x - x, zielpunkt.y - y) <= BAU_REICHWEITE) {
    return { tx: Math.floor(zielpunkt.x / g), ty: Math.floor(zielpunkt.y / g) };
  }
  return { tx: Math.floor((x + Math.cos(blick) * 38) / g), ty: Math.floor((y + Math.sin(blick) * 38) / g) };
}

export function kachelInReichweite(welt, x, y, tx, ty, reichweite = BAU_REICHWEITE) {
  const g = welt.kachelGroesse;
  return Math.hypot((tx + 0.5) * g - x, (ty + 0.5) * g - y) <= reichweite;
}

/**
 * Was würde E an diesem Bauwerk tun? (Server führt genau das aus, Client zeigt den Text)
 * @param inventar   Inventar des Spielers (Items als { defId, menge })
 * @param name       Name des Spielers (für geschützte Bauwerke: Kiste, Tür, Bett) – null = nicht prüfen
 * @param flaggeDort Flagge des Gebiets, in dem das Bauwerk steht (für Berechtigte, rechte.js)
 * @returns {{ art, text, symbol } | null}  art 'gesperrt' = gehört jemand anderem (E tut nichts, zeigt nur den Hinweis)
 */
export function bauwerkAktion(b, inventar, name = null, flaggeDort = null) {
  const hat = (defId) => inventar.some((e) => e?.defId === defId);
  if (name !== null && BAUWERKE[b.typ]?.geschuetzt && b.besitzer && !darfBenutzen(b, name, flaggeDort)) {
    return { art: 'gesperrt', text: `Gehört ${b.besitzer}`, symbol: '🔒' };
  }
  switch (b.typ) {
    case 'falle':
      return b.gespannt ? { art: 'aufnehmen', text: 'Falle aufnehmen', symbol: '🪤' } : { art: 'spannen', text: 'Falle spannen', symbol: '🪤' };
    case 'lagerfeuer': {
      const roh = b.brennt ? inventar.find((e) => e && KOCHBAR[e.defId]) : null;
      if (roh) return { art: 'kochen', text: roh.defId === 'kartoffel' ? 'Kartoffel backen' : 'Braten', symbol: '🍳' };
      if (b.brennt) return { art: 'sitzen', text: 'Ans Feuer setzen', symbol: '🔥' };
      return null;
    }
    case 'kiste':
      return { art: 'oeffnen', text: 'Kiste öffnen', symbol: '📦' };
    case 'holztuer':
      return { art: 'tuerSchalten', text: b.offen ? 'Tür schließen' : 'Tür öffnen', symbol: '🚪' };
    case 'zauntor':
      return { art: 'tuerSchalten', text: b.offen ? 'Tor schließen' : 'Tor öffnen', symbol: '🚧' };
    case 'bett':
      return { art: 'spawn', text: 'Spawn Point setzen (Unterkunft)', symbol: '🛏' };
    case 'beet': {
      if (!b.pflanze) {
        const samen = Object.entries(PFLANZEN).find(([, p]) => hat(p.samen));
        return samen ? { art: 'pflanzen', text: `${samen[1].name} pflanzen`, symbol: '🌱' } : null;
      }
      if (b.wachstum >= 1) return { art: 'ernten', text: `${PFLANZEN[b.pflanze].name} ernten`, symbol: '🧺' };
      return null;
    }
    default:
      return null;
  }
}

/** Text für F am Lagerfeuer */
export function feuerText(b) {
  return b.brennt ? 'Feuer löschen' : 'Feuer anzünden';
}

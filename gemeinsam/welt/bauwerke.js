import { KACHELN } from './kacheln.js';

/**
 * Bauwerke = von Spielern in die Welt gesetzte Dinge (eine Kachel groß): Werkbank, Lagerfeuer, Falle, Beet.
 * Server UND Client nutzen diese Regeln (Vorschau grün/rot im Client = Prüfung auf dem Server).
 *
 * Ein Bauwerk (Daten, so auch im Netzwerk und im Welt-Spielstand):
 *   { id, typ, tx, ty, besitzer,            ← immer
 *     brennt, brennRest,                    ← lagerfeuer
 *     gespannt,                             ← falle
 *     pflanze, wachstum }                   ← beet (pflanze = 'tomate' | 'gurke' | 'kartoffel' | null, wachstum 0..1)
 *
 *   item      → Item, das beim Bauen verbraucht wird (null = entsteht anders, z. B. Beet mit der Hacke)
 *   blockiert → Kollision (Spieler, Zombies, Pfadsuche)
 *   draussen  → nur auf Außenböden (Lagerfeuer im Haus? Lieber nicht.)
 *   nurAuf    → nur auf diesen Kachelnamen (Beet nur auf Rasen)
 */
export const BAUWERKE = Object.freeze({
  werkbank: { name: 'Werkbank', item: 'werkbank', blockiert: true },
  lagerfeuer: { name: 'Lagerfeuer', item: 'lagerfeuer', blockiert: true, draussen: true },
  falle: { name: 'Falle', item: 'falle', blockiert: false },
  beet: { name: 'Beet', item: null, blockiert: false, nurAuf: ['gras'] },
  // Lagerkiste: 16 Plätze, Inhalt steht in b.inhalt (nur der Server kennt ihn – geht per KISTE-Nachricht an den, der sie öffnet)
  kiste: { name: 'Lagerkiste', item: 'kiste', blockiert: true },
  // Basisbau (Grundgerüst): Wand blockiert, Boden ist begehbar und darf auch auf Gras/Erde liegen
  holzwand: { name: 'Holzwand', item: 'holzwand', blockiert: true },
  holzboden: { name: 'Holzboden', item: 'holzboden', blockiert: false, nurAuf: ['gras'] },
});

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
 * Darf an Kachel (tx, ty) ein Bauwerk vom Typ `typ` hin? (ohne Entitäten – die prüft der Server zusätzlich)
 * @returns {{ ok: boolean, grund?: string }}
 */
export function pruefePlatz(welt, typ, tx, ty) {
  const def = BAUWERKE[typ];
  const zeichen = welt.kachelAn(tx, ty);
  if (!def || zeichen === null) return { ok: false, grund: 'Hier nicht' };
  const kachel = KACHELN[zeichen];
  if (welt.tuerBei(tx, ty) >= 0) return { ok: false, grund: 'Nicht in eine Tür' };
  if (welt.bauwerkBei(tx, ty)) return { ok: false, grund: 'Da steht schon etwas' };
  if (welt.istBlockiert(tx, ty)) return { ok: false, grund: 'Kein Platz' };
  if (def.draussen && kachel?.innen) return { ok: false, grund: 'Nur draußen' };
  if (def.nurAuf && !def.nurAuf.includes(kachel?.name)) return { ok: false, grund: 'Nur auf Rasen' };
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

export function kachelInReichweite(welt, x, y, tx, ty) {
  const g = welt.kachelGroesse;
  return Math.hypot((tx + 0.5) * g - x, (ty + 0.5) * g - y) <= BAU_REICHWEITE;
}

/**
 * Was würde E an diesem Bauwerk tun? (Server führt genau das aus, Client zeigt den Text)
 * @param inventar  Inventar des Spielers (Items als { defId, menge })
 * @returns {{ art, text, symbol } | null}
 */
export function bauwerkAktion(b, inventar) {
  const hat = (defId) => inventar.some((e) => e?.defId === defId);
  switch (b.typ) {
    case 'falle':
      return b.gespannt ? { art: 'aufnehmen', text: 'Falle aufnehmen', symbol: '🪤' } : { art: 'spannen', text: 'Falle spannen', symbol: '🪤' };
    case 'lagerfeuer': {
      const roh = b.brennt ? inventar.find((e) => e && KOCHBAR[e.defId]) : null;
      if (roh) return { art: 'kochen', text: roh.defId === 'kartoffel' ? 'Kartoffel backen' : 'Braten', symbol: '🍳' };
      return null;
    }
    case 'kiste':
      return { art: 'oeffnen', text: 'Kiste öffnen', symbol: '📦' };
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

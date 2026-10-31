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
export const BAUBARER_UNTERGRUND = Object.freeze(['gras', 'schnee', 'rasen', 'wiese', 'erde', 'waldboden', 'sand', 'kies']); // Runde 26: + Naturböden
const BASIS = { item: null, nurAuf: BAUBARER_UNTERGRUND };
const MOEBEL = { item: null, moebel: true }; // Runde 24: Einrichtung – jeder freie Boden, auch drinnen

export const BAUWERKE = Object.freeze({
  werkbank: { name: 'Werkbank', item: 'werkbank', blockiert: true },
  lagerfeuer: { name: 'Lagerfeuer', item: 'lagerfeuer', blockiert: true, draussen: true },
  schmelzofen: { name: 'Schmelzofen', item: 'schmelzofen', blockiert: true, draussen: true },
  falle: { name: 'Falle', item: 'falle', blockiert: false },
  // Runde 24: Fallen (server/spiel/systeme/fallenSystem.js) – blockieren nicht, Zombies laufen hinein
  sprengfalle: { name: 'Sprengfalle', item: 'sprengfalle', blockiert: false },
  stacheldraht: { name: 'Stacheldraht', item: 'stacheldraht', blockiert: false },
  fallgrube: { name: 'Fallgrube', item: 'fallgrube', blockiert: false, draussen: true },
  dosenalarm: { name: 'Dosenalarm', item: 'dosenalarm', blockiert: false },
  beet: { name: 'Beet', item: null, blockiert: false, nurAuf: ['gras', 'rasen', 'wiese', 'erde'] },
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
  kiste: { ...BASIS, name: 'Lagerkiste', blockiert: true, geschuetzt: true, kiste: true },
  // Runde 24 (P12): Vorratsschrank = Kiste, in der Essen kaum verdirbt (gesundheit.vorratFaktor)
  vorratsschrank: { ...MOEBEL, name: 'Vorratsschrank', blockiert: true, geschuetzt: true, kiste: true },
  // Runde 24 (P12/P13): Wasser & Handwerks-Stationen (gemeinsam/spieler/handwerk.js)
  regentonne: { item: null, name: 'Regentonne', blockiert: true, draussen: true },
  brunnen: { item: null, name: 'Brunnen', blockiert: true, draussen: true },
  amboss: { ...MOEBEL, name: 'Amboss', blockiert: true, station: 'amboss' },
  webstuhl: { ...MOEBEL, name: 'Webstuhl', blockiert: true, station: 'webstuhl' },
  chemietisch: { ...MOEBEL, name: 'Chemie-Tisch', blockiert: true, station: 'chemie' },
  bett: { ...BASIS, name: 'Bett', blockiert: true, geschuetzt: true },
  doppelbett: { ...BASIS, name: 'Doppelbett', blockiert: true, geschuetzt: true },
  schlafsack: { item: null, name: 'Schlafsack', blockiert: false, geschuetzt: true },
  // Runde 24: Farm (Bau-Menü „Farm“)
  gewaechshaus: { item: null, name: 'Gewächshaus-Beet', blockiert: false, nurAuf: ['gras', 'schnee', 'rasen', 'wiese', 'erde'] },
  huehnerstall: { item: null, name: 'Hühnerstall', blockiert: true, draussen: true },
  bienenstock: { item: null, name: 'Bienenstock', blockiert: true, draussen: true },
  // Runde 24 (Cozy): Möbel & Deko – auch in Karten-Häusern auf jedem freien Boden (kein nurAuf), Licht/Strom: welt/einrichtung.js
  sofa: { ...MOEBEL, name: 'Sofa', blockiert: true },
  sessel: { ...MOEBEL, name: 'Sessel', blockiert: true },
  stuhl: { ...MOEBEL, name: 'Stuhl', blockiert: true },
  tisch: { ...MOEBEL, name: 'Couchtisch', blockiert: true },
  esstisch: { ...MOEBEL, name: 'Esstisch', blockiert: true },
  regal: { ...MOEBEL, name: 'Bücherregal', blockiert: true, sichtBlockiert: false },
  teppich: { ...MOEBEL, name: 'Teppich', blockiert: false },
  bild: { ...MOEBEL, name: 'Gemälde', blockiert: false },
  pflanze: { ...MOEBEL, name: 'Zimmerpflanze', blockiert: true },
  vorhang: { ...MOEBEL, name: 'Vorhang', blockiert: false },
  kerze: { ...MOEBEL, name: 'Kerzen', blockiert: false, schaltbarLicht: true },
  oellampe: { ...MOEBEL, name: 'Öllampe', blockiert: false, schaltbarLicht: true },
  stehlampe: { ...MOEBEL, name: 'Stehlampe', blockiert: true, schaltbarLicht: true },
  lichterkette: { ...MOEBEL, name: 'Lichterkette', blockiert: false, schaltbarLicht: true },
  kamin: { ...MOEBEL, name: 'Kamin', blockiert: true },
  generator: { ...MOEBEL, name: 'Generator', blockiert: true, geschuetzt: true },
  radio: { ...MOEBEL, name: 'Radio', blockiert: false },
  plattenspieler: { ...MOEBEL, name: 'Plattenspieler', blockiert: false },
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

/** Ackerfeld (Hacke in der Hand: Linksklick): FELD_GROESSE × FELD_GROESSE Kacheln, jede Kachel ein Beet (1 = eine Kachel). */
export const FELD_GROESSE = 1;

/** Kacheln eines Erdfelds um die Mittelkachel (tx, ty). */
export function feldKacheln(tx, ty) {
  const r = Math.floor(FELD_GROESSE / 2);
  const liste = [];
  for (let y = ty - r; y < ty - r + FELD_GROESSE; y++) for (let x = tx - r; x < tx - r + FELD_GROESSE; x++) liste.push({ tx: x, ty: y });
  return liste;
}

/**
 * Beet, in das Samen aus der Hand gepflanzt würden (Server UND Client-Indikator): das freie Beet in Reichweite, das dem Punkt
 * vor der Figur (in Blickrichtung) am nächsten liegt – oder null.
 */
export function samenZiel(welt, x, y, blick) {
  const g = welt.kachelGroesse;
  const px = x + Math.cos(blick) * 30;
  const py = y + Math.sin(blick) * 30;
  let bestes = null;
  let bestAbstand = Infinity;
  for (const b of welt.bauwerke.values()) {
    if (!BEET_TYPEN.has(b.typ) || b.pflanze) continue;
    const bx = (b.tx + 0.5) * g;
    const by = (b.ty + 0.5) * g;
    if (Math.hypot(bx - x, by - y) > BAUWERK_REICHWEITE + 12) continue;
    const abstand = Math.hypot(bx - px, by - py);
    if (abstand < bestAbstand) {
      bestAbstand = abstand;
      bestes = b;
    }
  }
  return bestes;
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
  // Runde 24: mehr Pflanzen
  weizen: { name: 'Weizen', samen: 'samen_weizen', ernte: 'weizen', farbe: 0xd8b84a },
  karotte: { name: 'Karotte', samen: 'samen_karotte', ernte: 'karotte', farbe: 0xe8761e },
  kuerbis: { name: 'Kürbis', samen: 'samen_kuerbis', ernte: 'kuerbis', farbe: 0xe07a1a },
  erdbeere: { name: 'Erdbeere', samen: 'samen_erdbeere', ernte: 'erdbeere', farbe: 0xd02a3a },
});

/** Runde 24: Bauwerke, die wie ein Beet funktionieren (pflanzen/ernten). Gewächshaus = Beet unter Glas: wächst doppelt so schnell, auch im Schnee. */
export const BEET_TYPEN = new Set(['beet', 'gewaechshaus']);

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
  ei: 'spiegelei', // Runde 24
  karotte: 'karotte_gebraten',
  kuerbis: 'kuerbis_gebraten',
  wasser_dreckig: 'wasserflasche', // Runde 24: abkochen
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
    case 'sprengfalle':
    case 'stacheldraht':
    case 'fallgrube':
    case 'dosenalarm':
      // Runde 24: nur der Besitzer baut sie wieder ab (sonst „gesperrt“-Hinweis)
      if (name !== null && b.besitzer && b.besitzer !== name) return { art: 'gesperrt', text: `Gehört ${b.besitzer}`, symbol: '🔒' };
      return { art: 'aufnehmen', text: `${BAUWERKE[b.typ].name} abbauen`, symbol: '🪤' };
    case 'lagerfeuer': {
      return { art: 'station', text: b.brennt ? 'Feuer: braten & hinsetzen' : 'Lagerfeuer-Menü', symbol: '🔥' };
    }
    case 'schmelzofen':
      return { art: 'station', text: 'Schmelzofen benutzen', symbol: '🏭' };
    case 'kiste':
      return { art: 'oeffnen', text: 'Kiste öffnen', symbol: '📦' };
    case 'vorratsschrank':
      return { art: 'oeffnen', text: 'Vorratsschrank öffnen', symbol: '🗄' };
    case 'regentonne':
      return hat('leere_flasche') ? { art: 'wasser', text: (b.wasser ?? 0) >= 1 ? `Flasche füllen (${Math.floor(b.wasser)}× Wasser)` : 'Regentonne leer – warte auf Regen', symbol: '🛢' } : { art: 'info', text: `Regentonne: ${Math.floor(b.wasser ?? 0)}× Wasser (leere Flasche nötig)`, symbol: '🛢' };
    case 'brunnen':
      return hat('leere_flasche') ? { art: 'wasser', text: 'Flasche füllen (Brunnenwasser abkochen!)', symbol: '🪣' } : { art: 'info', text: 'Brunnen (leere Flasche nötig)', symbol: '🪣' };
    case 'amboss':
    case 'webstuhl':
    case 'chemietisch':
      return { art: 'handwerk', station: BAUWERKE[b.typ].station, text: `${BAUWERKE[b.typ].name} benutzen`, symbol: { amboss: '⚒', webstuhl: '🧵', chemietisch: '⚗' }[b.typ] };
    case 'holztuer':
      return { art: 'tuerSchalten', text: b.offen ? 'Tür schließen' : 'Tür öffnen', symbol: '🚪' };
    case 'zauntor':
      return { art: 'tuerSchalten', text: b.offen ? 'Tor schließen' : 'Tor öffnen', symbol: '🚧' };
    case 'bett':
    case 'doppelbett':
    case 'schlafsack': // Runde 24: E = schlafen + Spawn Point (Qualität: konfiguration.gesundheit.bettQualitaet)
      return { art: 'spawn', text: 'Schlafen (setzt Spawn Point)', symbol: '🛏' };
    // Runde 24 (Cozy)
    case 'kerze':
    case 'oellampe':
    case 'stehlampe':
    case 'lichterkette':
      return { art: 'licht', text: b.an === false ? 'Licht an' : 'Licht aus', symbol: '💡' };
    case 'kamin':
      if (b.brennt) return { art: 'handwerk', station: 'feuer', text: 'Am Kamin kochen', symbol: '🍲' }; // Runde 24: Kochstelle (brennt von selbst aus)
      return { art: 'kamin', text: b.brennt ? 'Kaminfeuer löschen' : hat('feuerzeug') ? 'Kamin anzünden' : 'Kamin (Feuerzeug nötig)', symbol: '🔥' };
    case 'generator':
      return { art: 'generator', text: b.laeuft ? 'Generator aus' : hat('benzin') || (b.brennRest ?? 0) > 0 ? 'Generator starten' : 'Generator (Benzin nötig)', symbol: '⚡' };
    case 'radio':
    case 'plattenspieler':
      return { art: 'musik', text: b.musik ? 'Musik ändern / aus' : 'Musik auflegen', symbol: '🎵' };
    // Runde 24: Farm
    case 'huehnerstall':
      return (b.eier ?? 0) > 0 ? { art: 'eier', text: `${b.eier} Eier einsammeln`, symbol: '🥚' } : { art: 'info', text: 'Hühnerstall – die Hühner legen bald', symbol: '🐔' };
    case 'bienenstock':
      return (b.honig ?? 0) > 0 ? { art: 'honig', text: `${b.honig} Honig ernten`, symbol: '🍯' } : { art: 'info', text: 'Bienenstock – die Bienen sammeln (Beete in der Nähe helfen)', symbol: '🐝' };
    case 'gewaechshaus':
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

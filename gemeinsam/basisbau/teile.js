/**
 * Basisbau – Registry der Bauteile (Build-Menü). Server UND Client nutzen sie.
 *
 * Neues Bauteil (Möbel, Ofen, Stein-Tier …) = ein Eintrag hier + ein Eintrag in BAUWERKE (gemeinsam/welt/bauwerke.js:
 * Ebene, Kollision, Untergrund) + ein 3D-Modell (client/darstellung/basisbauModelle.js). Mehr nicht: Menü, Kostenabzug,
 * Rechte, Abriss mit Rückerstattung, Netz und Speicherung laufen generisch über diese Tabelle.
 *
 *   id          = Bauwerk-Typ (BAUWERKE[id]) – Ausnahme: 'flagge' (art 'flagge', setzt das Territorium)
 *   kategorie   = Reiter im Menü (KATEGORIEN)
 *   tier        = Material-Stufe (1 = Holz; später Stein, Metall …) – nur Anzeige/Sortierung
 *   kosten      = { itemId: Menge } – wird beim Bauen aus dem Inventar genommen, beim Abriss zu RUECKGABE_ANTEIL zurückgegeben
 *   block       = true: wird (bei konfiguration.basisbau.blockGroesse = 2) als Block 2×2 Kacheln gesetzt, Preis siehe kostenFuer()
 *   ausrichtung = true: Teil hat eine Richtung (Öffnung/Rahmen) → Taste R dreht, sonst automatisch (platzierung.js)
 */
export const KATEGORIEN = Object.freeze(['Basis', 'Struktur', 'Einrichtung', 'Gemütlich', 'Farm']);

export const BAUTEILE = Object.freeze({
  flagge: {
    art: 'flagge',
    name: 'Basis-Flagge',
    symbol: '🚩',
    kategorie: 'Basis',
    kosten: {},
    beschreibung: 'Legt dein Baugebiet fest (nur eine pro Spieler, nur auf flachem Rasen).',
  },
  holzboden: { art: 'bauwerk', name: 'Holzboden', symbol: '🟫', kategorie: 'Struktur', tier: 1, block: true, kosten: { holz: 8 }, beschreibung: 'Begehbarer Boden – die Grundlage für Wände.' },
  holzwand: { art: 'bauwerk', name: 'Holzwand', symbol: '🧱', kategorie: 'Struktur', tier: 1, block: true, kosten: { holz: 8 }, beschreibung: 'Dockt an Boden oder Wand an. Hält Zombies draußen.' },
  holzwand_fenster: { art: 'bauwerk', name: 'Wand mit Fenster', symbol: '🪟', kategorie: 'Struktur', tier: 1, kosten: { holz: 8 }, ausrichtung: true, beschreibung: 'Wand mit Fensteröffnung – man kann hindurchschauen und -schießen.' },
  holzwand_tuer: { art: 'bauwerk', name: 'Wand mit Türöffnung', symbol: '🚪', kategorie: 'Struktur', tier: 1, kosten: { holz: 8 }, ausrichtung: true, beschreibung: 'Türrahmen – die Tür kommt extra hinein.' },
  holztuer: { art: 'bauwerk', name: 'Holztür', symbol: '🚪', kategorie: 'Struktur', tier: 1, kosten: { holz: 6 }, ausrichtung: true, beschreibung: 'Passt in eine Türöffnung. Nur du darfst sie öffnen (E).' },
  holzdach: { art: 'bauwerk', name: 'Holzdach', symbol: '🛖', kategorie: 'Struktur', tier: 1, block: true, kosten: { holz: 8 }, beschreibung: 'Deckt Boden und Wände ab. Wird durchsichtig, wenn du darunter stehst.' },
  zaun: { art: 'bauwerk', name: 'Zaun', symbol: '🚧', kategorie: 'Struktur', tier: 2, kosten: { eisenerz: 2 }, beschreibung: 'Hält Zombies fern (schießen und sehen geht durch). Schließt sich an Nachbarzäune und Wände an.' },
  zauntor: { art: 'bauwerk', name: 'Zauntor', symbol: '⛩', kategorie: 'Struktur', tier: 2, kosten: { eisenerz: 4, holz: 2 }, ausrichtung: true, beschreibung: 'Tor im Zaun – nur du darfst es öffnen (E).' },
  kiste: { art: 'bauwerk', name: 'Lagerkiste', symbol: '📦', kategorie: 'Einrichtung', tier: 1, kosten: { holz: 8 }, beschreibung: '16 Plätze. Nur du kommst dran (E).' },
  bett: { art: 'bauwerk', name: 'Bett', symbol: '🛏', kategorie: 'Einrichtung', tier: 1, kosten: { holz: 5, stein: 2, stoff: 2 }, ausrichtung: true, beschreibung: 'E: Spawn Point setzen – hier wachst du nach dem Tod wieder auf.' },
  // Runde 24 (Cozy): Möbel & Deko (auch in Karten-Häusern), Licht, Wärme, Musik – Kategorie „Gemütlich“
  sofa: { art: 'bauwerk', name: 'Sofa', symbol: '🛋', kategorie: 'Gemütlich', tier: 1, kosten: { holz: 6, stoff: 3 }, ausrichtung: true, beschreibung: 'Bequem. Drei Möbel im Raum machen ihn gemütlich (heilt schneller).' },
  sessel: { art: 'bauwerk', name: 'Sessel', symbol: '💺', kategorie: 'Gemütlich', tier: 1, kosten: { holz: 4, stoff: 2 }, ausrichtung: true, beschreibung: 'Ohrensessel für lange Abende.' },
  stuhl: { art: 'bauwerk', name: 'Stuhl', symbol: '🪑', kategorie: 'Gemütlich', tier: 1, kosten: { holz: 3 }, ausrichtung: true, beschreibung: 'Ein einfacher Holzstuhl.' },
  tisch: { art: 'bauwerk', name: 'Couchtisch', symbol: '🟤', kategorie: 'Gemütlich', tier: 1, kosten: { holz: 4 }, beschreibung: 'Runder Tisch fürs Wohnzimmer.' },
  esstisch: { art: 'bauwerk', name: 'Esstisch', symbol: '🍽', kategorie: 'Gemütlich', tier: 1, kosten: { holz: 6 }, beschreibung: 'Großer Tisch für die Küche.' },
  regal: { art: 'bauwerk', name: 'Bücherregal', symbol: '📚', kategorie: 'Gemütlich', tier: 1, kosten: { holz: 6 }, ausrichtung: true, beschreibung: 'Voller Bücher – sieht nach Zuhause aus.' },
  teppich: { art: 'bauwerk', name: 'Teppich', symbol: '🟥', kategorie: 'Gemütlich', tier: 1, kosten: { stoff: 4 }, ausrichtung: true, beschreibung: 'Wollteppich – darüber kann man laufen.' },
  bild: { art: 'bauwerk', name: 'Gemälde', symbol: '🖼', kategorie: 'Gemütlich', tier: 1, kosten: { holz: 1, stoff: 1 }, ausrichtung: true, beschreibung: 'Ein Bild auf der Staffelei.' },
  pflanze: { art: 'bauwerk', name: 'Zimmerpflanze', symbol: '🪴', kategorie: 'Gemütlich', tier: 1, kosten: { stein: 2, holz: 1 }, beschreibung: 'Ein bisschen Grün im Haus.' },
  vorhang: { art: 'bauwerk', name: 'Vorhang', symbol: '🪟', kategorie: 'Gemütlich', tier: 1, kosten: { stoff: 3 }, ausrichtung: true, beschreibung: 'Vor ein Fenster stellen.' },
  kerze: { art: 'bauwerk', name: 'Kerzen', symbol: '🕯', kategorie: 'Gemütlich', tier: 1, kosten: { stoff: 1 }, beschreibung: 'Warmes, kleines Licht. E: an/aus.' },
  oellampe: { art: 'bauwerk', name: 'Öllampe', symbol: '🏮', kategorie: 'Gemütlich', tier: 2, kosten: { eisenbarren: 1, alkohol: 1 }, beschreibung: 'Helles, warmes Licht ohne Strom. E: an/aus.' },
  kamin: { art: 'bauwerk', name: 'Kamin', symbol: '🔥', kategorie: 'Gemütlich', tier: 2, kosten: { stein: 12, eisenbarren: 1 }, ausrichtung: true, beschreibung: 'Wärmt, leuchtet und knistert – auch drinnen. E mit Feuerzeug anzünden, Holz in der Hand + Klick legt nach.' },
  generator: { art: 'bauwerk', name: 'Generator', symbol: '⚡', kategorie: 'Gemütlich', tier: 3, kosten: { eisenbarren: 4, schrott: 4 }, beschreibung: `Strom für Stehlampen und Lichterketten im Umkreis. Läuft mit Benzin (E).` },
  stehlampe: { art: 'bauwerk', name: 'Stehlampe', symbol: '💡', kategorie: 'Gemütlich', tier: 3, kosten: { eisenbarren: 1, schrott: 1 }, beschreibung: 'Helles Licht – braucht einen laufenden Generator.' },
  lichterkette: { art: 'bauwerk', name: 'Lichterkette', symbol: '✨', kategorie: 'Gemütlich', tier: 3, kosten: { schrott: 2 }, ausrichtung: true, beschreibung: 'Gemütliches Funkeln – braucht einen laufenden Generator.' },
  gewaechshaus: { art: 'bauwerk', name: 'Gewächshaus-Beet', symbol: '🪴', kategorie: 'Farm', tier: 1, kosten: { holz: 4, stein: 2, stoff: 1 }, beschreibung: 'Beet unter Glas: Pflanzen wachsen doppelt so schnell – auch im Schnee.' },
  huehnerstall: { art: 'bauwerk', name: 'Hühnerstall', symbol: '🐔', kategorie: 'Farm', tier: 1, kosten: { holz: 8, huhn: 2 }, beschreibung: 'Zwei eingefangene Hühner legen Eier (E: einsammeln). Hühner fängst du mit Samen.' },
  bienenstock: { art: 'bauwerk', name: 'Bienenstock', symbol: '🐝', kategorie: 'Farm', tier: 2, kosten: { holz: 6, stoff: 1 }, beschreibung: 'Bienen machen Honig – schneller, wenn Beete in der Nähe blühen (E: ernten).' },
  radio: { art: 'bauwerk', name: 'Radio', symbol: '📻', kategorie: 'Gemütlich', tier: 2, kosten: { schrott: 3 }, beschreibung: 'E: Musik aus dem Musik-Ordner oder einen YouTube-Link abspielen – alle in der Nähe hören mit.' },
  plattenspieler: { art: 'bauwerk', name: 'Plattenspieler', symbol: '💿', kategorie: 'Gemütlich', tier: 2, kosten: { holz: 3, schrott: 2 }, beschreibung: 'E: Platte auflegen (Musik-Ordner oder YouTube-Link).' },
});

/** Blöcke (Boden, Wand, Dach) kosten als 2×2-Block nur die Hälfte der vier Einzelteile – und geben beim Abriss pro Kachel entsprechend weniger zurück. */
const BLOCK_RABATT = 0.5;

/** Kantenlänge (in Kacheln) des Blocks, in dem dieses Bauteil gesetzt wird (1 = einzelne Kachel). */
export function blockGroesseFuer(teilId, blockGroesse = 1) {
  return BAUTEILE[teilId]?.block === true && blockGroesse > 1 ? Math.floor(blockGroesse) : 1;
}

/** Kosten beim Setzen: Einzelteil = kosten, Block n×n = kosten × n² × Rabatt. */
export function kostenFuer(teilId, blockGroesse = 1) {
  const kosten = BAUTEILE[teilId]?.kosten ?? {};
  const n = blockGroesseFuer(teilId, blockGroesse);
  if (n === 1) return kosten;
  return Object.fromEntries(Object.entries(kosten).map(([id, m]) => [id, Math.max(1, Math.round(m * n * n * BLOCK_RABATT))]));
}

/** Kosten, die auf EINE Kachel eines Blocks entfallen (Grundlage der Rückerstattung beim Abriss). */
export function kostenProKachel(teilId, blockGroesse = 1) {
  const kosten = BAUTEILE[teilId]?.kosten ?? {};
  return blockGroesseFuer(teilId, blockGroesse) === 1 ? kosten : Object.fromEntries(Object.entries(kosten).map(([id, m]) => [id, m * BLOCK_RABATT]));
}

/** Kacheln, die das Bauteil beim Setzen auf (tx, ty) belegt: bei Blöcken das 2×2-Feld im festen Raster, sonst nur die Kachel. */
export function fussabdruck(teilId, tx, ty, blockGroesse = 1) {
  const n = blockGroesseFuer(teilId, blockGroesse);
  if (n === 1) return [{ tx, ty }];
  const ax = tx - (((tx % n) + n) % n);
  const ay = ty - (((ty % n) + n) % n);
  const liste = [];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) liste.push({ tx: ax + x, ty: ay + y });
  return liste;
}

/** Beim Abriss bekommt man so viel der Baukosten zurück (abgerundet pro Material). Wert in konfiguration.basisbau.rueckgabe. */
export const RUECKGABE_ANTEIL = 0.75;

/** So weit (px, Spieler → Kachelmitte) darf man mit dem Hammer bauen/abreißen. Weiter als BAU_REICHWEITE (Einzel-Bauwerke), damit man Wände abschreiten kann. */
export const BAU_REICHWEITE_BASIS = 150;

/** Bauteile eines Menü-Reiters, in Registry-Reihenfolge. */
export function teileDerKategorie(kategorie) {
  return Object.entries(BAUTEILE)
    .filter(([, t]) => t.kategorie === kategorie)
    .map(([id, t]) => ({ id, ...t }));
}

/** Menge eines Items im Inventar (Einträge: null | { defId, menge }). */
export function zaehleItem(inventar, defId) {
  let n = 0;
  for (const e of inventar) if (e?.defId === defId) n += e.menge;
  return n;
}

/** Fehlendes Material: [{ defId, fehlt }] – leer = bezahlbar. */
export function fehlendesMaterial(inventar, kosten) {
  const fehlt = [];
  for (const [defId, menge] of Object.entries(kosten)) {
    const hat = zaehleItem(inventar, defId);
    if (hat < menge) fehlt.push({ defId, fehlt: menge - hat });
  }
  return fehlt;
}

/** Rückerstattung beim Abriss: { itemId: floor(menge × anteil) }, Nullen weggelassen. */
export function rueckerstattung(kosten, anteil = RUECKGABE_ANTEIL) {
  const ergebnis = {};
  for (const [defId, menge] of Object.entries(kosten)) {
    const m = Math.floor(menge * anteil + 1e-9);
    if (m > 0) ergebnis[defId] = m;
  }
  return ergebnis;
}

/** Kosten für die Anzeige: "8× Holz, 2× Stein". */
export function kostenText(kosten, itemName = (id) => id) {
  const teile = Object.entries(kosten).map(([id, m]) => `${m}× ${itemName(id)}`);
  return teile.length ? teile.join(', ') : 'kostenlos';
}

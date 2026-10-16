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
 *   ausrichtung = true: Teil hat eine Richtung (Öffnung/Rahmen) → Taste R dreht, sonst automatisch (platzierung.js)
 */
export const KATEGORIEN = Object.freeze(['Basis', 'Struktur', 'Einrichtung']);

export const BAUTEILE = Object.freeze({
  flagge: {
    art: 'flagge',
    name: 'Basis-Flagge',
    symbol: '🚩',
    kategorie: 'Basis',
    kosten: {},
    beschreibung: 'Legt dein Baugebiet fest (nur eine pro Spieler, nur auf flachem Rasen).',
  },
  holzboden: { art: 'bauwerk', name: 'Holzboden', symbol: '🟫', kategorie: 'Struktur', tier: 1, kosten: { holz: 8 }, beschreibung: 'Begehbarer Boden – die Grundlage für Wände.' },
  holzwand: { art: 'bauwerk', name: 'Holzwand', symbol: '🧱', kategorie: 'Struktur', tier: 1, kosten: { holz: 8 }, beschreibung: 'Dockt an Boden oder Wand an. Hält Zombies draußen.' },
  holzwand_fenster: { art: 'bauwerk', name: 'Wand mit Fenster', symbol: '🪟', kategorie: 'Struktur', tier: 1, kosten: { holz: 8 }, ausrichtung: true, beschreibung: 'Wand mit Fensteröffnung – man kann hindurchschauen und -schießen.' },
  holzwand_tuer: { art: 'bauwerk', name: 'Wand mit Türöffnung', symbol: '🚪', kategorie: 'Struktur', tier: 1, kosten: { holz: 8 }, ausrichtung: true, beschreibung: 'Türrahmen – die Tür kommt extra hinein.' },
  holztuer: { art: 'bauwerk', name: 'Holztür', symbol: '🚪', kategorie: 'Struktur', tier: 1, kosten: { holz: 6 }, ausrichtung: true, beschreibung: 'Passt in eine Türöffnung. Nur du darfst sie öffnen (E).' },
  holzdach: { art: 'bauwerk', name: 'Holzdach', symbol: '🛖', kategorie: 'Struktur', tier: 1, kosten: { holz: 8 }, beschreibung: 'Deckt Boden und Wände ab. Wird durchsichtig, wenn du darunter stehst.' },
  kiste: { art: 'bauwerk', name: 'Lagerkiste', symbol: '📦', kategorie: 'Einrichtung', tier: 1, kosten: { holz: 8 }, beschreibung: '16 Plätze. Nur du kommst dran (E).' },
  bett: { art: 'bauwerk', name: 'Bett', symbol: '🛏', kategorie: 'Einrichtung', tier: 1, kosten: { holz: 5, stein: 2, stoff: 2 }, ausrichtung: true, beschreibung: 'E: Spawn Point setzen – hier wachst du nach dem Tod wieder auf.' },
});

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

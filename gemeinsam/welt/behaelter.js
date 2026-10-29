/**
 * Runde 25: Durchsuchbare Behälter auf der Karte (Schränke, Kisten, Kühlschränke …) – umgebungsfrei, Server UND Client.
 *
 * Ein Kartenobjekt ist ein Behälter, wenn
 *   • sein Typ in BEHAELTER steht (eingebaute Typen; die neuen Modell-Typen bringen ihr .glb über BEHAELTER_TYPEN mit), oder
 *   • es ein Editor-Typ ist, dessen Modell (`typen[typ].glbDatei`) in BEHAELTER_MODELLE steht (z. B. die Schneeland-Schränke).
 * `findeBehaelter(daten)` liefert die Liste in fester Reihenfolge (Reihenfolge der Objekte) mit IDs 'm<Nr>' – Server und Client
 * rechnen dasselbe, darum reicht im Netz die ID. Inhalt/Nachfüllen: server/spiel/systeme/kistenSystem.js (offeneKiste 'm<Nr>').
 */
export const BEHAELTER = {
  // schon vorhandene Deko-Kisten der Karten
  kiste: { name: 'Kiste', symbol: '📦', plaetze: 8, loot: 'holzkiste', anzahl: [0, 3] },
  kiste_klein: { name: 'Kiste', symbol: '📦', plaetze: 6, loot: 'holzkiste', anzahl: [0, 2] },
  fass: { name: 'Fass', symbol: '🛢', plaetze: 4, loot: 'tankstelle', anzahl: [0, 1] },
  // neue Modell-Typen (Modelle aus client/assets/eigene, Quaternius/Poly-Pizza-Möbel)
  truhe: { name: 'Truhe', symbol: '🧰', plaetze: 10, loot: 'truhe', anzahl: [1, 3] },
  holzkiste: { name: 'Holzkiste', symbol: '📦', plaetze: 8, loot: 'holzkiste', anzahl: [1, 3] },
  werkzeugkiste: { name: 'Werkzeugkiste', symbol: '🧰', plaetze: 6, loot: 'werkzeugkiste', anzahl: [1, 2] },
  kleiderschrank: { name: 'Kleiderschrank', symbol: '🚪', plaetze: 12, loot: 'schrank', anzahl: [1, 4] },
  kommode: { name: 'Kommode', symbol: '🗄', plaetze: 8, loot: 'kommode', anzahl: [0, 3] },
  kuechenschrank: { name: 'Küchenschrank', symbol: '🗄', plaetze: 8, loot: 'vorratsregal', anzahl: [1, 3] },
  kuehlschrank: { name: 'Kühlschrank', symbol: '🧊', plaetze: 8, loot: 'kuehlschrank', anzahl: [0, 3] },
};

/**
 * Eingebaute Objekttypen mit Modell (für Karten, die sie benutzen, ohne sie selbst unter `typen` zu definieren).
 * Maße: b × h Kacheln (Fußabdruck), hoehe3d in Kacheln. Der Kartenlader ergänzt sie in `daten.typen`.
 */
export const BEHAELTER_TYPEN = {
  truhe: { glbDatei: 'assets/eigene/chest.glb', b: 1, h: 0.7, hoehe3d: 0.7 },
  holzkiste: { glbDatei: 'assets/eigene/crate-1.glb', b: 0.9, h: 0.9, hoehe3d: 0.9 },
  werkzeugkiste: { glbDatei: 'assets/eigene/toolbox.glb', b: 0.6, h: 0.4, hoehe3d: 0.35 },
  kleiderschrank: { glbDatei: 'assets/eigene/medium-wardrobe.glb', b: 2, h: 0.8, hoehe3d: 2.2 },
  kommode: { glbDatei: 'assets/eigene/wide-dresser.glb', b: 1.5, h: 0.6, hoehe3d: 0.9 },
  kuechenschrank: { glbDatei: 'assets/eigene/double-door-tall-cabinet.glb', b: 0.9, h: 0.7, hoehe3d: 1.8 },
  kuehlschrank: { glbDatei: 'assets/eigene/fridge.glb', b: 1.1, h: 0.7, hoehe3d: 2.1 },
};

/** Editor-Modelle, die automatisch durchsuchbar sind (Pfad → Behälter-Art). */
export const BEHAELTER_MODELLE = {
  'assets/eigene/chest.glb': 'truhe',
  'assets/eigene/chest-2.glb': 'truhe',
  'assets/eigene/crate.glb': 'holzkiste',
  'assets/eigene/crate-1.glb': 'holzkiste',
  'assets/eigene/crate-2.glb': 'holzkiste',
  'assets/eigene/toolbox.glb': 'werkzeugkiste',
  'assets/eigene/large-wardrobe.glb': 'kleiderschrank',
  'assets/eigene/medium-wardrobe.glb': 'kleiderschrank',
  'assets/eigene/small-wardrobe.glb': 'kleiderschrank',
  'assets/eigene/closet.glb': 'kleiderschrank',
  'assets/eigene/bachelor-dresser.glb': 'kommode',
  'assets/eigene/wide-dresser.glb': 'kommode',
  'assets/eigene/lingerie-dresser.glb': 'kommode',
  'assets/eigene/cube-cabinet.glb': 'kommode',
  'assets/eigene/double-door-tall-cabinet.glb': 'kuechenschrank',
  'assets/eigene/double-door-base-cabinet.glb': 'kuechenschrank',
  'assets/eigene/drawers-base-cabinet.glb': 'kuechenschrank',
  'assets/eigene/drawers-double-door-bas.glb': 'kuechenschrank',
  'assets/eigene/single-door-base-cabinet.glb': 'kuechenschrank',
  'assets/eigene/sink-kitchen-cabinet.glb': 'kuechenschrank',
  'assets/eigene/fridge.glb': 'kuehlschrank',
  'assets/eigene/fridge-2.glb': 'kuehlschrank',
  'assets/eigene/fridge-3.glb': 'kuehlschrank',
};

/** Behälter-Art eines Kartenobjekts oder null. */
export function behaelterArt(objekt, typen) {
  if (BEHAELTER[objekt.typ]) return objekt.typ;
  return BEHAELTER_MODELLE[typen?.[objekt.typ]?.glbDatei] ?? null;
}

/**
 * Alle Behälter einer Karte (Kartendaten mit objekte/typen; Koordinaten in Kacheln).
 * @returns {{ id: string, nr: number, art: string, x: number, y: number, objekt: object }[]}  x/y = Mitte in Kacheln
 */
export function findeBehaelter(daten) {
  const liste = [];
  for (const o of daten.objekte ?? []) {
    const art = behaelterArt(o, daten.typen);
    if (!art) continue;
    const nr = liste.length;
    liste.push({ id: `m${nr}`, nr, art, x: o.x + o.b / 2, y: o.y + o.h / 2, objekt: o });
  }
  return liste;
}

/** Reichweite zum Öffnen in px (wie Bauwerke) – plus halbe Objektgröße, damit große Schränke von vorn erreichbar sind. */
export const BEHAELTER_REICHWEITE = 52;

/** Abstand Punkt (px) → Behälter (px, bis zum Rand des Fußabdrucks). */
export function abstandZumBehaelter(b, x, y, kachel) {
  const o = b.objekt;
  const dx = Math.max(o.x * kachel - x, 0, x - (o.x + o.b) * kachel);
  const dy = Math.max(o.y * kachel - y, 0, y - (o.y + o.h) * kachel);
  return Math.hypot(dx, dy);
}

/** Nächster Behälter in Reichweite oder null. */
export function naechsterBehaelter(liste, x, y, kachel, reichweite = BEHAELTER_REICHWEITE) {
  let bester = null;
  let bestAbstand = reichweite;
  for (const b of liste) {
    const d = abstandZumBehaelter(b, x, y, kachel);
    if (d <= bestAbstand) {
      bestAbstand = d;
      bester = b;
    }
  }
  return bester;
}

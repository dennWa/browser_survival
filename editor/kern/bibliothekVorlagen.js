/**
 * Bibliothek & Vorlagen (Editor 2.0, Schritt 7.4) – umgebungsfrei, getestet in tests/bibliothekVorlagen.test.js.
 * Eine Bibliothek im Asset-Browser: Assets + Prefabs (eingebaut/eigen, mit Ordnern) + Loot-Vorlagen + Audio.
 *   prefabEintraege(prefabs)          [{ name, vorlage, eigen?, beschreibung? }] → Asset-Einträge { id: 'prefab:<name>', art: 'prefab', … }
 *   lootVorlagenEintraege(vorlagen)   { id: { name, ordner? } } → Aktions-Einträge (öffnen die Loot-Vorlagen-Verwaltung)
 *   prefabOrdner(liste, suche)        eigene/eingebaute Prefabs nach Ordner gruppiert + gefiltert: [{ ordner, eintraege }]
 *   vorschauDaten(vorlage, farbeVon)  Pixel je Kachel + Objekt-Rechtecke → das UI malt daraus ein Vorschaubild (Canvas)
 */
const normal = (t) => String(t ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss');

export function passtVorlage(e, suche) {
  const woerter = normal(suche).split(/\s+/).filter(Boolean);
  const heu = normal(`${e.name} ${e.ordner ?? ''} ${e.beschreibung ?? ''} prefab vorlage`);
  return woerter.every((w) => heu.includes(w));
}

export function prefabEintraege(prefabs) {
  return prefabs.map(({ name, vorlage, eigen = false, beschreibung = '' }) => ({
    id: `prefab:${eigen ? 'eigen' : 'eingebaut'}:${name}`,
    art: 'prefab',
    name,
    kategorie: 'Prefabs',
    symbol: '🏠',
    ordner: vorlage.ordner ?? (eigen ? 'Eigene' : 'Eingebaut'),
    beschreibung,
    eigen,
    vorlage,
    b: vorlage.b,
    h: vorlage.h,
    tags: ['prefab', 'vorlage', vorlage.ordner ?? ''].filter(Boolean),
  }));
}

export function lootVorlagenEintraege(vorlagen = {}) {
  return Object.entries(vorlagen).map(([id, v]) => ({ id: `lootVorlage:${id}`, art: 'aktion', aktion: 'lootVorlagen', name: `Loot-Vorlage: ${v.name ?? id}`, kategorie: 'Loot', symbol: '📚', tags: ['loot', 'vorlage', v.ordner ?? ''].filter(Boolean) }));
}

/** Gruppiert nach Ordner (alphabetisch, „Eingebaut“ zuletzt), gefiltert nach Suche */
export function prefabOrdner(liste, suche = '') {
  const gruppen = new Map();
  for (const e of liste) {
    if (suche && !passtVorlage(e, suche)) continue;
    if (!gruppen.has(e.ordner)) gruppen.set(e.ordner, []);
    gruppen.get(e.ordner).push(e);
  }
  return [...gruppen]
    .sort(([a], [b]) => (a === 'Eingebaut') - (b === 'Eingebaut') || a.localeCompare(b, 'de'))
    .map(([ordner, eintraege]) => ({ ordner, eintraege: eintraege.sort((a, b) => a.name.localeCompare(b.name, 'de')) }));
}

/**
 * Daten für ein Vorschaubild: pixel[y*b+x] = Farbe der Kachel (bzw. Bemalung), rechtecke = Objekte/Bauwerke (Farbe aus objektFarbe(typ)).
 * @param farbeVon (zeichen) → '#rrggbb'
 */
export function vorschauDaten(vorlage, farbeVon, objektFarbe = () => '#d0b080') {
  const { b, h } = vorlage;
  const pixel = vorlage.zellen.map((z) => farbeVon(z) ?? '#888888');
  for (const [x, y, f] of vorlage.bemalung ?? []) if (x >= 0 && y >= 0 && x < b && y < h && typeof f === 'string') pixel[y * b + x] = f;
  const rechtecke = [
    ...(vorlage.objekte ?? []).filter((o) => o.ebene !== 'oben').map((o) => ({ x: o.x, y: o.y, b: o.b, h: o.h, farbe: objektFarbe(o.typ) })),
    ...(vorlage.bauwerke ?? []).map((w) => ({ x: w.tx, y: w.ty, b: 1, h: 1, farbe: objektFarbe(w.typ) })),
  ];
  return { b, h, pixel, rechtecke };
}

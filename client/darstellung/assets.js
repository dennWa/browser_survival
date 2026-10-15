/**
 * Lädt alle Grafiken (client/assets/atlas.json + Spritesheets) und bietet bequemen Zugriff.
 *
 * Der Atlas wird von werkzeuge/assets/baue_assets.py erzeugt. Fehlt eine Grafik, zeichnet der
 * Renderer automatisch Platzhalter (farbige Formen) – das Spiel bleibt also immer spielbar.
 */
const BASIS = new URL('../assets/', import.meta.url);

export class Assets {
  constructor(atlas, bilder) {
    this.atlas = atlas;
    this.bilder = bilder; // Pfad → HTMLImageElement
  }

  bild(pfad) {
    return this.bilder.get(pfad) ?? null;
  }

  /** Animation einer Figur, z. B. figur('survivor', 'pistole_laufen') oder figur('zombie', 'angriff'). */
  figur(figur, animation) {
    return this.atlas.figuren[figur]?.animationen[animation] ?? null;
  }

  fuesse(aktion) {
    return this.atlas.figuren.survivor?.fuesse[aktion] ?? null;
  }

  /** { x, y, b, h, weltGroesse } im Item-Sheet */
  item(defId) {
    return this.atlas.items.icons[defId] ?? null;
  }

  get itemBild() {
    return this.bild(this.atlas.items.bild);
  }

  get umgebungBild() {
    return this.bild(this.atlas.umgebung.bild);
  }

  /** Bodentextur-Varianten einer Bodenart: [{ x, y, b, h }] */
  boden(art) {
    return this.atlas.umgebung.boden[art] ?? null;
  }

  objekt(name) {
    return this.atlas.umgebung.objekte[name] ?? null;
  }

  get lizenzen() {
    return this.atlas.lizenzen ?? [];
  }
}

/**
 * @param {(anteil: number) => void} [beiFortschritt]  0..1
 * @returns {Promise<Assets>}
 */
export async function ladeAssets(beiFortschritt = () => {}) {
  const antwort = await fetch(new URL('atlas.json', BASIS));
  if (!antwort.ok) throw new Error(`atlas.json nicht ladbar (${antwort.status})`);
  const atlas = await antwort.json();

  const pfade = new Set([atlas.items.bild, atlas.umgebung.bild]);
  for (const figur of Object.values(atlas.figuren)) {
    for (const gruppe of [figur.animationen, figur.fuesse ?? {}]) {
      for (const animation of Object.values(gruppe)) pfade.add(animation.bild);
    }
  }

  const bilder = new Map();
  let fertig = 0;
  await Promise.all(
    [...pfade].map(async (pfad) => {
      const bild = new Image();
      bild.src = new URL(pfad, BASIS).href;
      try {
        await bild.decode();
        bilder.set(pfad, bild);
      } catch {
        console.warn(`[Assets] Grafik fehlt: ${pfad} – nutze Platzhalter`);
      }
      beiFortschritt(++fertig / pfade.size);
    }),
  );
  return new Assets(atlas, bilder);
}

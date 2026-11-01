import * as THREE from 'three';
import { verarbeiteKarte } from '../../server/spiel/karten/kartenLader.js';
import { Welt } from '../../gemeinsam/welt/welt.js';
import { KartenModell } from '../../client/darstellung/kartenModell.js';
import { ladeAssets } from '../../client/darstellung/assets.js';

/**
 * „Spiel-Optik“ der Studio-Ansicht: baut die Zone mit dem ECHTEN Kartenmodell des Spiels (client/darstellung/kartenModell.js –
 * Bodentexturen, Wände, Möbel, Bäume, Laternen, Türen, eigene Modelle) und hängt es auf 1 Kachel = 1 Einheit skaliert in die
 * Szene. Die Platzhalter des Studios bleiben unsichtbar darunter (für Treffer/Auswahl), Overlays/Gizmo liegen obendrauf.
 * Gebaut wird in Portionen (Seite bleibt bedienbar); nach Änderungen verzögert neu (`planen`). Dächer sind aus (man will hineinsehen).
 */
const NEUBAU_VERZOEGERUNG = 700;

export class SpielOptik {
  constructor(viewport) {
    this.v = viewport;
    this.gruppe = new THREE.Group();
    this.gruppe.visible = false;
    viewport.szene.add(this.gruppe);
    this.modell = null;
    this.an = false;
    this.lauf = 0;
    this.beiStatus = null; // (text|null) → Statusanzeige
  }

  async #assets() {
    this.assets ??= await ladeAssets().catch(() => null);
    return this.assets;
  }

  setze(an, definition) {
    this.an = an;
    this.gruppe.visible = an;
    this.v.gruppen.boden.visible = !an;
    this.v.gruppen.waende.visible = !an;
    this.v.spielOptikAn = an;
    if (an) this.baue(definition);
    this.v.anfordern();
  }

  /** Nach Kartenänderungen: verzögert neu bauen */
  planen(holeDefinition) {
    if (!this.an) return;
    clearTimeout(this.zeit);
    this.zeit = setTimeout(() => this.baue(holeDefinition()), NEUBAU_VERZOEGERUNG);
  }

  async baue(definition) {
    if (!definition) return;
    const nr = ++this.lauf;
    this.beiStatus?.('Spiel-Optik wird gebaut …');
    try {
      const assets = await this.#assets();
      const { daten } = verarbeiteKarte(definition);
      const welt = new Welt(daten);
      const bauer = KartenModell.baueSchrittweise({ welt, assets, gl: this.v.renderer, mitSchnitt: (m) => m, bodenMassstab: 0.5 });
      bauer.next();
      let schritt = { done: false };
      while (!schritt.done) {
        const ende = performance.now() + 30;
        while (performance.now() < ende && !(schritt = bauer.next()).done);
        if (nr !== this.lauf) return; // überholt
        await new Promise((r) => setTimeout(r, 0));
      }
      const modell = schritt.value;
      modell.bodenHochladen(0, 0, Infinity);
      if (modell.daecher) modell.daecher.gruppe.visible = false;
      this.#entsorge();
      this.modell = modell;
      this.welt = welt;
      const s = 1 / welt.kachelGroesse;
      this.gruppe.scale.set(s, s, s);
      this.gruppe.add(modell.statisch, modell.beweglich);
      // Das Spiel friert Matrizen ein (einfrieren: matrixWorldAutoUpdate = false) – kurz auftauen, damit die
      // Skalierung der Gruppe in allen Welt-Matrizen landet, dann wieder einfrieren (schnell beim Zeichnen)
      const gefroren = [];
      this.gruppe.traverse((o) => {
        if (o.matrixWorldAutoUpdate === false) {
          o.matrixWorldAutoUpdate = true;
          gefroren.push(o);
        }
      });
      this.gruppe.updateMatrixWorld(true);
      for (const o of gefroren) o.matrixWorldAutoUpdate = false;
      modell.kulle(new THREE.Vector3(), Infinity); // Sichtweiten-Culling aus: im Editor ist alles sichtbar
      modell.aktualisiere(0, this.v.dunkel ?? 0);
      this.beiStatus?.(null);
      this.v.anfordern();
    } catch (f) {
      console.warn('Spiel-Optik:', f);
      this.beiStatus?.(`Spiel-Optik: ${f.message}`);
    }
  }

  aktualisiere(dunkel) {
    if (this.an && this.modell) this.modell.aktualisiere(0, dunkel);
  }

  #entsorge() {
    if (!this.modell) return;
    this.gruppe.remove(this.modell.statisch, this.modell.beweglich);
    for (const teil of [this.modell.statisch, this.modell.beweglich]) teil.traverse((o) => o.geometry?.dispose());
    for (const t of this.modell.bodenTexturen ?? []) t.dispose();
    this.modell = null;
  }
}

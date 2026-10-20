import { KACHELN } from '../../gemeinsam/welt/kacheln.js';

/**
 * Schritt-Geräusche: wer über Schnee läuft, knirscht (Ereignis `schritt_schnee`, Kenney-Samples bzw. Synthese); auf Gras `schritt_gras` (6 eigene Aufnahmen).
 * Rein clientseitig und nur Atmosphäre – gezählt wird die zurückgelegte Strecke je Spieler/Zombie (interpolierte Entitäten),
 * alle SCHRITT px gibt es einen Tritt. Ton räumlich (Entfernung/Stereo macht sound.spiele).
 * Untergrund: Kachel `schnee` = voll, Straße/Gehweg in einer Schneezone (welt.schnee) = leiser (verschneit), drinnen/anderswo = nichts.
 * Weitere Untergründe (Gras, Holz …) später hier ergänzen: `untergrundFuer` liefert Ereignis + Pegel.
 */
const SCHRITT = 60; // px zwischen zwei Tritten (Gehen ≈ 2,5/s, Sprinten ≈ 4/s)
const ZOMBIE_SCHRITT = 70;
const ZOMBIE_WEITE = 520; // Zombies knirschen nur in dieser Nähe zum Hörer (spart Geräusche)
const MAX_PRO_BILD = 6;

/** @returns {{ ereignis: string, pegel: number } | null} */
export function untergrundFuer(welt, x, y) {
  const g = welt.kachelGroesse;
  const k = KACHELN[welt.kachelAn(Math.floor(x / g), Math.floor(y / g))];
  if (!k || k.innen || k.blockiert || k.wasser) return null;
  if (k.name === 'schnee') return { ereignis: 'schritt_schnee', pegel: 1 };
  if (welt.schnee && (k.name === 'strasse' || k.name === 'asphalt' || k.name === 'gehweg')) return { ereignis: 'schritt_schnee', pegel: 0.55 };
  if (k.name === 'gras') return { ereignis: 'schritt_gras', pegel: 1 };
  return null;
}

export class Schritte {
  #figuren = new Map(); // id → { x, y, weg }

  /**
   * @param entitaeten interpolierte Entitäten dieses Bildes (inkl. eigener Figur)
   * @param hoerer { x, y } Position des Hörers (eigene Figur)
   */
  aktualisiere(entitaeten, welt, sound, eigeneId, hoerer) {
    if (!sound) return;
    const gesehen = new Set();
    let gespielt = 0;
    for (const e of entitaeten) {
      if (e.typ !== 'spieler' && e.typ !== 'zombie') continue;
      gesehen.add(e.id);
      let f = this.#figuren.get(e.id);
      if (!f) {
        f = { x: e.x, y: e.y, weg: 0 };
        this.#figuren.set(e.id, f);
      }
      const strecke = Math.hypot(e.x - f.x, e.y - f.y);
      f.x = e.x;
      f.y = e.y;
      if (strecke > 60 || e.tot || e.arbeit === 'schlafen' || e.fahrzeug || e.fahrzeugId) {
        f.weg = 0; // Teleport, tot, im Bett oder im Auto
        continue;
      }
      f.weg += strecke;
      const zombie = e.typ === 'zombie';
      if (f.weg < (zombie ? ZOMBIE_SCHRITT : SCHRITT)) continue;
      f.weg = 0;
      if (zombie && Math.hypot(e.x - hoerer.x, e.y - hoerer.y) > ZOMBIE_WEITE) continue;
      if (gespielt >= MAX_PRO_BILD) continue;
      const boden = untergrundFuer(welt, e.x, e.y);
      if (!boden) continue;
      gespielt++;
      const eigene = e.id === eigeneId;
      sound.spiele(boden.ereignis, { x: e.x, y: e.y, lautstaerke: boden.pegel * (zombie ? 0.35 : eigene ? 0.5 : 0.6), tonhoehe: 0.94 + Math.random() * 0.12 });
    }
    for (const id of this.#figuren.keys()) if (!gesehen.has(id)) this.#figuren.delete(id);
  }
}

import { innenRaster } from '../kern/innen.js';

/**
 * Sammelpunkt der Funktionen späterer Phasen (Zonen-Übersicht, Prefabs, KI-Export/-Import, Testen, 3D, Texturen …).
 * main.js bleibt so schlank; jede Phase hängt hier ihre Aktionen (sonderAktionen) und Panel-Reiter ein.
 * @returns { innenRaster(), ansicht3d?, nachStart? }
 */
export function erweiterungen({ zustand }) {
  const erw = {
    innenRaster: () => (zustand.karte ? innenRaster(zustand.karte) : null),
  };
  return erw;
}

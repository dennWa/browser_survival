import { innenRaster } from '../kern/innen.js';
import { prefabUi } from './prefabUi.js';
import { raeumeUi } from './raeumeUi.js';
import { zonenUi } from './zonenUi.js';
import { kiUi } from './kiUi.js';

/**
 * Sammelpunkt der Funktionen späterer Phasen (Zonen-Übersicht, Prefabs, KI-Export/-Import, Testen, 3D, Texturen …).
 * main.js bleibt so schlank; jede Phase hängt hier ihre Aktionen (sonderAktionen) und Panel-Reiter ein.
 * @returns { innenRaster(), ansicht3d?, nachStart? }
 */
export function erweiterungen({ zustand, zeichner, panel, aktionen, sonderAktionen, auswahlBereich, projektZonen }) {
  const erw = {
    innenRaster: () => (zustand.karte ? innenRaster(zustand.karte) : null),
  };
  // Phase 6: Prefabs
  prefabUi({ zustand, panel, aktionen, auswahlBereich });
  sonderAktionen.prefabs = () => panel.zeige('Prefabs');
  raeumeUi({ zustand, panel, aktionen });
  // Phase 7: Zonen verbinden
  zonenUi({ zustand, panel, aktionen, sonderAktionen, zeichner, projektZonen });
  // Phase 8: KI-Export/-Import
  kiUi({ zustand, panel, aktionen, sonderAktionen, zeichner, auswahlBereich });
  return erw;
}

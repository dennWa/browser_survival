import { innenRaster } from '../kern/innen.js';
import { prefabUi } from './prefabUi.js';
import { raeumeUi } from './raeumeUi.js';
import { zonenUi } from './zonenUi.js';
import { kiUi } from './kiUi.js';
import { testUi } from './testUi.js';
import { eigeneUi } from './eigeneUi.js';
import { Ansicht3D, webglVerfuegbar } from './ansicht3d.js';

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
  // Phase 9: Karte testen
  const test = testUi({ zustand, panel, aktionen, sonderAktionen, projektZonen });
  erw.nachStart = () => test.nachStart();
  // Phase 10: 3D-Ansicht, eigene Objekte, Bild → 3D, Grafik-Antrag, Texturen
  eigeneUi({ zustand, sonderAktionen, aktionen });
  if (webglVerfuegbar()) {
    try {
      erw.ansicht3d = new Ansicht3D(document.getElementById('leinwand3d'), zustand, { zeichner2d: zeichner });
      zustand.bei('ansicht', () => {
        // 3D → 2D: Blickpunkt mitnehmen (Auswahl ist ohnehin gemeinsam)
        if (zustand.ansicht === '2d') {
          zeichner.kamera = { x: erw.ansicht3d.blick.x, y: erw.ansicht3d.blick.z };
          zeichner.anfordern();
        }
      });
    } catch (e) {
      console.warn('[Editor] 3D nicht verfügbar:', e);
    }
  }
  return erw;
}

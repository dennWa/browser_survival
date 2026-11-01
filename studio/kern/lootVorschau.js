import { verarbeiteKarte } from '../../server/spiel/karten/kartenLader.js';
import { wuerfleAusZone } from '../../server/spiel/karten/lootZonen.js';
import { wuerfleSpawnpunkt, TABELLEN_PRAEFIX } from '../../server/spiel/karten/spawnpunkte.js';
import { LOOT_TABELLEN } from '../../server/spiel/konfiguration/lootTabellen.js';
import { GEGENSTAENDE } from '../../server/spiel/konfiguration/gegenstaende.js';
import { Zufall } from '../../server/spiel/zufall.js';

/**
 * Loot-Vorschau des Studios (Phase 3.1) – umgebungsfrei, Tests: tests/studioModelle.test.js.
 * Nimmt die Loot-Punkte genau so, wie der Spiel-Lader sie baut (verarbeiteKarte: Raum-Marker, Loot-Zonen, Spawnpunkte) und
 * würfelt je Punkt EIN Beispiel-Item mit denselben Regeln wie server/spiel/systeme/lootSystem.js – nur mit festem Startwert
 * (`saat`), damit die Vorschau beim Bauen nicht flackert. „Neu würfeln“ = andere Saat.
 * Anders als im Spiel liegt an jedem Punkt etwas (Chance-Würfe, die leer ausgehen, werden bis zu VERSUCHE-mal wiederholt) –
 * die Vorschau zeigt, WAS dort liegen kann, nicht wie viel.
 *   beispielItems(definition, saat) → [{ x, y, hoehe (Kacheln), defId, quelle: 'raum'|'zone'|'spawnpunkt', sicher }]
 *   festesItem(inhalt)              → Item-ID, wenn ein Spawnpunkt genau ein Item legt (sonst null)
 */
const VERSUCHE = 12;

export const festesItem = (inhalt) => (typeof inhalt === 'string' && !inhalt.startsWith(TABELLEN_PRAEFIX) && Object.hasOwn(GEGENSTAENDE, inhalt) ? inhalt : null);

function wuerfle(punkt, zufall) {
  for (let i = 0; i < VERSUCHE; i++) {
    if (punkt.lootZone) {
      const w = wuerfleAusZone(punkt.lootZone, zufall, 1);
      if (w) return w.id;
    } else if (punkt.spawnPunkt) {
      const w = wuerfleSpawnpunkt({ ...punkt.spawnPunkt, chance: 100 }, zufall);
      if (w) return w.id;
    } else if (LOOT_TABELLEN[punkt.lootTabelle]?.length) return zufall.gewichteteAuswahl(LOOT_TABELLEN[punkt.lootTabelle]).id;
  }
  return null;
}

export function beispielItems(definition, saat = 1) {
  let lootPunkte;
  try {
    ({ lootPunkte } = verarbeiteKarte(definition));
  } catch {
    return []; // Karte gerade nicht ladbar (Prüfung meldet das) → keine Vorschau
  }
  const zufall = new Zufall(saat);
  const kg = 32;
  const liste = [];
  for (const p of lootPunkte) {
    const defId = wuerfle(p, zufall);
    if (!defId || !GEGENSTAENDE[defId]) continue;
    liste.push({
      x: p.x / kg,
      y: p.y / kg,
      hoehe: (p.hoehe ?? 0) / kg,
      defId,
      quelle: p.lootZone ? 'zone' : p.spawnPunkt ? 'spawnpunkt' : 'raum',
      sicher: !!p.spawnPunkt && !p.spawnPunkt.inhalt.startsWith(TABELLEN_PRAEFIX),
    });
  }
  return liste;
}

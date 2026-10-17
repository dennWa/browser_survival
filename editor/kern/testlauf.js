import { nachDefinition } from './format.js';
import { verarbeiteKarte } from '../../server/spiel/karten/kartenLader.js';

/**
 * Karte testen (Phase 9): Daten, die das Spiel im Testmodus (client/?editorTest=1, client/ui/editorTest.js) liest.
 * Schlüssel in localStorage – gleicher Wert wie TEST_SCHLUESSEL in client/ui/editorTest.js.
 */
export const TEST_SCHLUESSEL = 'browserSurvival.editorTest';

/**
 * Alle Zonen des Projekts als Spiel-Definitionen: { start, karten: { id: Definition }, zeit }. Zonen, die der Spiel-Lader
 * ablehnt, fallen mit Grund heraus (Startzone → Fehler).
 */
export function testDaten(zonen, startId, jetzt = Date.now()) {
  const karten = {};
  const probleme = [];
  for (const [id, k] of zonen) {
    const def = nachDefinition(k);
    try {
      verarbeiteKarte(def);
      karten[id] = def;
    } catch (e) {
      if (id === startId) throw e;
      probleme.push(`Zone „${id}“ lädt nicht und fehlt im Test: ${e.message}`);
    }
  }
  return { daten: { start: startId, karten, zeit: jetzt }, probleme };
}

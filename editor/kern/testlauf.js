import { nachDefinition } from './format.js';
import { verarbeiteKarte } from '../../server/spiel/karten/kartenLader.js';
import { startInDerMitte } from './platzierung.js';

/**
 * Karte testen (Phase 9): Daten, die das Spiel im Testmodus (client/?editorTest=1, client/ui/editorTest.js) liest.
 * Ablage: IndexedDB (client/ui/editorTestSpeicher.js).
 * Feedback 6.8: Nur die Start-Zone braucht einen Spieler-Start. Andere Zonen ohne `S` bekommen NUR in den Testdaten einen
 * Ersatz-Start (erste freie Ankunft, sonst Kartenmitte) – der Spiel-Lader (server/spiel/karten/kartenLader.js
 * `verarbeiteKarte`) verlangt sonst je Zone ein `S` und würfe die Zone aus dem Test. Die Karte im Editor bleibt unverändert,
 * es gibt dafür keine Warnung mehr (Spieler kommen über Übergänge/Ankünfte hinein).
 */

const hatStart = (k) => [...k.s('marker').values()].some((m) => m.art === 'start');

/** Ersatz-Start einer Zone ohne `S`: erste Ankunft ohne Marker (dort kommen Spieler ohnehin an), sonst Kartenmitte */
export function ersatzStart(karte) {
  for (const [, a] of karte.s('ankuenfte')) if (karte.imFeld(a.x, a.y) && !karte.markerAn(a.x, a.y)) return { x: a.x, y: a.y };
  return startInDerMitte(karte);
}

/** Definition mit `S` an (x, y) (Kopie; nur das Kachel-ASCII ändert sich) */
function mitStart(def, { x, y }) {
  const kacheln = [...def.kacheln];
  kacheln[y] = `${kacheln[y].slice(0, x)}S${kacheln[y].slice(x + 1)}`;
  return { ...def, kacheln };
}

/**
 * Alle Zonen des Projekts als Spiel-Definitionen: { start, karten: { id: Definition }, zeit }. Zonen, die der Spiel-Lader
 * ablehnt, fallen mit Grund heraus (Startzone → Fehler). ersatzStarts = { zonenId: {x,y} } (nur Info, keine Warnung).
 */
export function testDaten(zonen, startId, jetzt = Date.now()) {
  const karten = {};
  const probleme = [];
  const ersatzStarts = {};
  for (const [id, k] of zonen) {
    let def = nachDefinition(k);
    let ersatz = null;
    if (id !== startId && !hatStart(k)) {
      ersatz = ersatzStart(k);
      if (ersatz) def = mitStart(def, ersatz);
    }
    try {
      verarbeiteKarte(def);
      karten[id] = def;
      if (ersatz) ersatzStarts[id] = ersatz;
    } catch (e) {
      if (id === startId) throw e;
      probleme.push(`Zone „${id}“ lädt nicht und fehlt im Test: ${e.message}`);
    }
  }
  return { daten: { start: startId, karten, zeit: jetzt }, probleme, ersatzStarts };
}

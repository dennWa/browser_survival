import { Welt } from '../../gemeinsam/welt/welt.js';
import { verarbeiteKarte } from '../../server/spiel/karten/kartenLader.js';
import { KACHEL_GROESSE } from '../../gemeinsam/konstanten.js';
import { nachDefinition } from './format.js';
import { BAUWERKE } from '../../gemeinsam/welt/bauwerke.js';

/**
 * Innen/Außen-Erkennung GENAU wie das Spiel: die Karte wird mit dem Spiel-Lader geladen, als Welt aufgebaut (inkl. der
 * kartenfesten Bauwerke) und für jede Kachel `Welt.istInnen` gefragt (Innenboden-Kachel oder Dach darüber).
 * @returns Uint8Array (1 = innen), Index y * breite + x
 */
export function innenRaster(karte) {
  const ergebnis = new Uint8Array(karte.breite * karte.hoehe);
  const welt = pruefWelt(karte)?.welt;
  if (!welt) return ergebnis;
  const g = KACHEL_GROESSE;
  for (let y = 0; y < karte.hoehe; y++) for (let x = 0; x < karte.breite; x++) ergebnis[y * karte.breite + x] = welt.istInnen((x + 0.5) * g, (y + 0.5) * g) ? 1 : 0;
  return ergebnis;
}

/**
 * Karte so laden, wie das Spiel sie sähe – auch wenn sie noch unfertig ist: fehlt der Start, wird fürs Prüfen einer gedacht
 * (nur im Speicher), unfertige Übergänge/Ankünfte werden weggelassen (die meldet die Validierung selbst).
 * @returns {{ geladen, welt } | null}  geladen = Ergebnis von verarbeiteKarte (spielerStarts, zombieSpawns, lootPunkte …)
 */
export function pruefWelt(karte) {
  try {
    const def = nachDefinition(karte);
    def.uebergaenge = (def.uebergaenge ?? []).filter((u) => u.ziel && u.ankunft && Number.isInteger(u.x) && Number.isInteger(u.y) && u.x >= 0 && u.y >= 0 && u.x + u.b <= karte.breite && u.y + u.h <= karte.hoehe);
    def.ankuenfte = Object.fromEntries(Object.entries(def.ankuenfte ?? {}).filter(([, p]) => karte.imFeld(p.x, p.y)));
    const ohneStart = !karte.s('marker').size || ![...karte.s('marker').values()].some((m) => m.art === 'start');
    if (ohneStart) def.kacheln[0] = `S${def.kacheln[0].slice(1)}`;
    const geladen = verarbeiteKarte(def, KACHEL_GROESSE);
    if (ohneStart) geladen.spielerStarts = [];
    const welt = new Welt(geladen.daten);
    let id = 1;
    for (const b of karte.s('bauwerke').values()) if (BAUWERKE[b.typ]) welt.setzeBauwerk({ id: id++, typ: b.typ, tx: b.tx, ty: b.ty });
    return { geladen, welt };
  } catch {
    return null;
  }
}

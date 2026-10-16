import { fuegeZumInventarHinzu, legeAufBoden } from '../../server/spiel/systeme/inventarSystem.js';

/**
 * Helfer für die Browser-Konsole (nur Lokal-Modus, der Server läuft dann im Tab) – zum Testen & Ausprobieren:
 *   browserSurvival.tp(30, 27)          eigene Figur auf Kachel 30|27 setzen
 *   browserSurvival.gib('rucksack', 1)  Item ins Inventar (Rest fällt auf den Boden)
 *   browserSurvival.boden('apfel', 3)   Item vor die Füße legen
 *   browserSurvival.zeit(21)            Uhr auf 21:00 stellen
 *   browserSurvival.ich()               eigene Spieler-Entität auf dem Server (zum Ändern: .leben = 1 …)
 *   browserSurvival.welt()              die SpielWelt
 * Auch genutzt von den Playwright-Skripten in werkzeuge/test/.
 */
export function konsolenHelfer({ spiel, server }) {
  const welt = () => server()?.spielWelt ?? null;
  const ich = () => welt()?.holen(spiel()?.eigeneId) ?? null;
  const ohneServer = () => console.warn('Nur im Lokal-Modus verfügbar');
  return {
    ich,
    welt,
    tp(tx, ty) {
      const s = ich();
      if (!s) return ohneServer();
      const g = welt().welt.kachelGroesse;
      s.x = tx * g + g / 2;
      s.y = ty * g + g / 2;
    },
    gib(defId, menge = 1) {
      const s = ich();
      if (!s) return ohneServer();
      const rest = fuegeZumInventarHinzu(s, defId, menge);
      if (rest > 0) legeAufBoden(welt(), { defId, menge: rest }, s.x, s.y);
    },
    boden(defId, menge = 1) {
      const s = ich();
      if (!s) return ohneServer();
      legeAufBoden(welt(), { defId, menge }, s.x + Math.cos(s.blick) * 30, s.y + Math.sin(s.blick) * 30);
    },
    zeit(stunde) {
      const w = welt();
      if (!w) return ohneServer();
      const { tagSekunden, nachtSekunden } = w.tageszeitDauer();
      // 06–21 Uhr = Tag, 21–06 Uhr = Nacht
      const h = (((stunde - 6) % 24) + 24) % 24;
      w.zeit = h <= 15 ? (h / 15) * tagSekunden : tagSekunden + ((h - 15) / 9) * nachtSekunden;
    },
  };
}

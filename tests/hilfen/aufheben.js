import { AKTIONEN } from '../../gemeinsam/protokoll.js';
import { AUFHEB_REICHWEITE } from '../../gemeinsam/konstanten.js';
import { TICK_DAUER_S } from '../../gemeinsam/konstanten.js';

/**
 * Runde 38: Holz/Stein/Eisenerz fallen beim Abbauen als Gegenstände zu Boden – Tests, die „was kam heraus?“ prüfen,
 * heben alles in Aufheb-Reichweite wieder auf (AKTION aufheben, ein Gegenstand je Tick).
 * @returns Anzahl aufgehobener Gegenstands-Entitäten
 */
export function hebeAlleAuf(welt, spieler, maxVersuche = 30) {
  let n = 0;
  for (let i = 0; i < maxVersuche; i++) {
    const nah = [...welt.alleVomTyp('gegenstand')].some((g) => Math.hypot(g.x - spieler.x, g.y - spieler.y) <= AUFHEB_REICHWEITE);
    if (!nah) break;
    spieler.aktionsPuffer.push({ art: AKTIONEN.AUFHEBEN, slot: null });
    welt.aktualisiere(TICK_DAUER_S);
    n++;
  }
  return n;
}

/** Wie viel von `defId` liegt in Aufheb-Reichweite am Boden? (Summe der Stapel) */
export function amBoden(welt, spieler, defId) {
  return [...welt.alleVomTyp('gegenstand')].filter((g) => g.defId === defId && Math.hypot(g.x - spieler.x, g.y - spieler.y) <= AUFHEB_REICHWEITE).reduce((s, g) => s + g.menge, 0);
}

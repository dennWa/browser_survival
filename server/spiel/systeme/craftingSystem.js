import { WERKBANK_REICHWEITE } from '../../../gemeinsam/konstanten.js';
import { HANDWERK_ORTE, naheHandwerk, ortVon } from '../../../gemeinsam/spieler/handwerk.js';
import { REZEPTE } from '../konfiguration/rezepte.js';
import { GEGENSTAENDE } from '../konfiguration/gegenstaende.js';
import { aktualisiereAusruestung, fuegeZumInventarHinzu, legeAufBoden } from './inventarSystem.js';

/**
 * Crafting: AKTION 'herstellen' { rezept } an einer Werkbank (Kartenobjekt oder gebaute) in Reichweite –
 * Rezepte mit ort: 'inventar' gehen überall (Inventar-Fenster → Bauen). Runde 24: weitere Orte (Amboss, Webstuhl,
 * Chemie-Tisch, Kochstelle) → gemeinsam/spieler/handwerk.js.
 * Rezepte: server/spiel/konfiguration/rezepte.js. Der Server prüft Level (rezept.level), Werkbank-Nähe und Zutaten.
 */

export function stelleHer(spielWelt, spieler, rezeptName) {
  const rezept = REZEPTE[rezeptName];
  if (!rezept || !GEGENSTAENDE[rezept.ergebnis]) return;
  if ((rezept.level ?? 1) > spieler.level) {
    spielWelt.melde(spieler.id, `${rezept.name} kannst du erst ab Level ${rezept.level} herstellen`);
    return;
  }
  const ort = ortVon(rezept);
  if (!naheHandwerk(spielWelt.welt, spieler.x, spieler.y, ort)) {
    spielWelt.melde(spieler.id, `Dafür brauchst du ${HANDWERK_ORTE[ort]?.hinweis ?? `eine(n) ${HANDWERK_ORTE[ort]?.name ?? 'Werkbank'}`}`);
    return;
  }
  const fehlt = Object.entries(rezept.zutaten).filter(([item, anzahl]) => zaehle(spieler, item) < anzahl);
  if (fehlt.length > 0) {
    spielWelt.melde(spieler.id, `Es fehlt: ${fehlt.map(([item, anzahl]) => `${anzahl - zaehle(spieler, item)}× ${GEGENSTAENDE[item]?.name ?? item}`).join(', ')}`);
    return;
  }
  for (const [item, anzahl] of Object.entries(rezept.zutaten)) entnehme(spieler, item, anzahl);
  const menge = rezept.menge ?? 1;
  const magazin = GEGENSTAENDE[rezept.ergebnis].kategorie === 'fernkampf' ? 0 : undefined;
  const rest = fuegeZumInventarHinzu(spieler, rezept.ergebnis, menge, magazin ?? 0);
  if (rest > 0) {
    legeAufBoden(spielWelt, { defId: rezept.ergebnis, menge: rest }, spieler.x, spieler.y);
    spielWelt.melde(spieler.id, 'Inventar voll – liegt am Boden');
  }
  spielWelt.ereignis({ typ: 'hergestellt', von: spieler.id, rezept: rezeptName });
  spielWelt.melde(spieler.id, `${rezept.name}${menge > 1 ? ` ×${menge}` : ''} hergestellt`);
}

/** Steht an (x, y) eine Werkbank in Reichweite? (fest auf der Karte oder selbst gebaut) */
export function naeheWerkbank(welt, x, y) {
  return (
    welt.naechstesObjekt(x, y, WERKBANK_REICHWEITE, (o) => o.typ === 'werkbank') !== null ||
    welt.naechstesBauwerk(x, y, WERKBANK_REICHWEITE + 8, (b) => b.typ === 'werkbank') !== null
  );
}

function zaehle(spieler, defId) {
  return spieler.inventar.reduce((summe, e) => summe + (e?.defId === defId ? e.menge : 0), 0);
}

function entnehme(spieler, defId, anzahl) {
  let rest = anzahl;
  for (let slot = spieler.inventar.length - 1; slot >= 0 && rest > 0; slot--) {
    const e = spieler.inventar[slot];
    if (e?.defId !== defId) continue;
    const weg = Math.min(rest, e.menge);
    e.menge -= weg;
    rest -= weg;
    if (e.menge <= 0) {
      spieler.inventar[slot] = null;
      if (spieler.ausgeruestet === slot) {
        spieler.ausgeruestet = null;
        aktualisiereAusruestung(spieler);
      }
    }
  }
}

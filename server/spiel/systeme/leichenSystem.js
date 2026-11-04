import { KISTE_PLAETZE } from '../../../gemeinsam/konstanten.js';

/**
 * Runde 32: Leichen toter Spieler.
 * Stirbt ein Spieler, fällt sein Zeug nicht mehr verstreut auf den Boden: Inventar (inkl. Rucksack-Plätze), Rucksack und Kleidung
 * liegen in einer Leiche (Entität typ 'leiche'), die man wie eine Kiste durchsucht (AKTION leiche { ziel: ID }, offeneKiste 'l<ID>').
 * Nach `loot.leicheLiegt` Sekunden (120) verschwindet der Körper – übrig bleibt ein Rucksack mit dem restlichen Inhalt, der bis zum
 * Server-Neustart liegen bleibt (nicht im Weltstand gespeichert). Leer geräumt verschwindet er.
 * Zombie-Leichen sind reine Darstellung (Client, renderer: 2 min liegen) – der Server entfernt Zombies weiter sofort.
 */
export const LEICHE_REICHWEITE = 60; // px

/** Inhalt des Toten einsammeln und eine Leiche anlegen. Leert Inventar, Rucksack und Kleidung des Spielers. @returns Leiche oder null (nichts dabei) */
export function legeLeicheAn(spielWelt, spieler) {
  const inhalt = [];
  for (let i = 0; i < spieler.inventar.length; i++) {
    if (spieler.inventar[i]) inhalt.push({ ...spieler.inventar[i] });
    spieler.inventar[i] = null;
  }
  for (const [stelle, defId] of Object.entries(spieler.kleidung ?? {})) {
    if (!defId) continue;
    inhalt.push({ defId, menge: 1 });
    spieler.kleidung[stelle] = null;
  }
  if (spieler.rucksack) {
    inhalt.push({ defId: spieler.rucksack, menge: 1 });
    spieler.rucksack = null;
  }
  const plaetze = Math.min(44, Math.max(KISTE_PLAETZE, Math.ceil(inhalt.length / 4) * 4)); // Kistenfenster zeigt bis 44
  const leiche = {
    id: spielWelt.neueId(),
    typ: 'leiche',
    x: spieler.x,
    y: spieler.y,
    radius: 0,
    name: spieler.name ?? 'Unbekannt',
    aussehen: spieler.aussehen ?? null,
    blick: spieler.blick ?? 0,
    inhalt: [...inhalt, ...new Array(plaetze - inhalt.length).fill(null)],
    rest: spielWelt.konfiguration.loot.leicheLiegt ?? 120,
    rucksack: false,
  };
  spielWelt.hinzufuegen(leiche);
  return leiche;
}

/** Pro Tick: Körper → Rucksack nach Ablauf; leere Rucksäcke (niemand schaut hinein) verschwinden. */
export function aktualisiereLeichen(spielWelt, dt) {
  for (const l of [...spielWelt.alleVomTyp('leiche')]) {
    const leer = l.inhalt.every((e) => e === null);
    const offen = [...spielWelt.alleVomTyp('spieler')].some((s) => s.offeneKiste === `l${l.id}`);
    if (!l.rucksack) {
      l.rest -= dt;
      if (l.rest <= 0) l.rucksack = true;
    }
    if (leer && !offen && (l.rucksack || l.rest < (spielWelt.konfiguration.loot.leicheLiegt ?? 120) - 2)) {
      if (l.rucksack) spielWelt.entfernen(l.id);
    }
  }
}

/** Fürs Netz (Schnappschuss): Position, Name, Aussehen, Körper oder Rucksack – Inhalt bleibt privat (KISTE-Nachricht). */
export function leicheZuNetzwerk(l) {
  return { id: l.id, typ: 'leiche', x: Math.round(l.x), y: Math.round(l.y), blick: Math.round(l.blick * 100) / 100, name: l.name, ...(l.aussehen ? { aussehen: l.aussehen } : {}), ...(l.rucksack ? { rucksack: true } : {}) };
}

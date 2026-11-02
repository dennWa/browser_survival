import { pruefeAussehen } from '../../gemeinsam/spieler/aussehen.js';

/**
 * Runde 28: Spielstand-Verwaltung im Browser (Hauptmenü).
 *
 *   Singleplayer: SLOT_ANZAHL getrennte Slots. Je Slot eigener Speicher-Präfix `browserSurvival.slot<N>.` (Spielerstand +
 *                 Weltzustand, siehe browserSpeicher.js) und Kopfdaten in `browserSurvival.slots` { "<N>": SlotMeta }.
 *   Multiplayer:  je Server-ID genau ein Charakter, Kopfdaten in `browserSurvival.mpCharaktere` { serverId: MpMeta } –
 *                 der eigentliche Spielstand liegt auf dem jeweiligen Server (Konto bzw. Gastname).
 *
 * SlotMeta = { name, aussehen, erstellt (ISO), zuletzt (ISO) }
 * MpMeta   = { name, aussehen, erstellt, zuletzt, konto (Benutzername) | null, gast (Gastname) | null }
 * Getrennte Schlüsselräume → Singleplayer und Multiplayer kommen sich nie in die Quere; neue Server = neuer Eintrag.
 */
export const SLOT_ANZAHL = 3;
const SLOTS = 'browserSurvival.slots';
const MP = 'browserSurvival.mpCharaktere';
const ALT_PRAEFIX = 'browserSurvival.spielstand.'; // Lokal-Spielstand vor Runde 28 (ein Stand je Gastname)

export const slotPraefix = (nr) => `browserSurvival.slot${nr}.`;

function lese(schluessel) {
  try {
    const wert = JSON.parse(localStorage.getItem(schluessel) ?? '{}');
    return wert && typeof wert === 'object' ? wert : {};
  } catch {
    return {};
  }
}

function schreibe(schluessel, wert) {
  try {
    localStorage.setItem(schluessel, JSON.stringify(wert));
  } catch {
    // privates Fenster / voll → egal
  }
}

function pruefeMeta(m) {
  if (!m || typeof m !== 'object' || typeof m.name !== 'string') return null;
  return { name: m.name, aussehen: pruefeAussehen(m.aussehen), erstellt: m.erstellt ?? null, zuletzt: m.zuletzt ?? null, konto: m.konto ?? null, gast: m.gast ?? null };
}

/** [Meta | null] für Slot 1 … SLOT_ANZAHL */
export function ladeSlots() {
  const alle = lese(SLOTS);
  return Array.from({ length: SLOT_ANZAHL }, (_, i) => pruefeMeta(alle[i + 1]));
}

export function slotMeta(nr) {
  return ladeSlots()[nr - 1] ?? null;
}

export function speichereSlotMeta(nr, meta) {
  const alle = lese(SLOTS);
  alle[nr] = meta;
  schreibe(SLOTS, alle);
}

/** „Zuletzt gespielt“ (und Aussehen) nach jedem gespeicherten Spielerstand nachtragen. */
export function slotGespielt(nr, stand) {
  const meta = slotMeta(nr);
  if (!meta) return;
  speichereSlotMeta(nr, { ...meta, zuletzt: new Date().toISOString(), ...(stand?.aussehen ? { aussehen: pruefeAussehen(stand.aussehen) } : {}) });
}

/** Slot komplett leeren (Spielerstand, Welt, Kopfdaten). */
export function loescheSlot(nr) {
  try {
    const praefix = slotPraefix(nr);
    const weg = [];
    for (let i = 0; i < localStorage.length; i++) if (localStorage.key(i)?.startsWith(praefix)) weg.push(localStorage.key(i));
    for (const k of weg) localStorage.removeItem(k);
  } catch {
    // egal
  }
  const alle = lese(SLOTS);
  delete alle[nr];
  schreibe(SLOTS, alle);
}

/**
 * Einmalig: alter Lokal-Spielstand (vor Runde 28) → Slot 1, damit niemand seinen Fortschritt verliert.
 * Nimmt den zuletzt gespeicherten Spieler + alle Welt-Stände; alte Schlüssel werden danach entfernt (Platz im localStorage).
 */
export function migriereAltenSpielstand() {
  try {
    if (Object.keys(lese(SLOTS)).length) return false;
    const alt = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(ALT_PRAEFIX)) alt.push(k);
    }
    if (!alt.length) return false;
    let spieler = null;
    for (const k of alt) {
      const rest = k.slice(ALT_PRAEFIX.length);
      if (rest.startsWith('welt:')) continue;
      const stand = JSON.parse(localStorage.getItem(k) ?? 'null');
      if (stand && (!spieler || (stand.gespeichert ?? '') > (spieler.stand.gespeichert ?? ''))) spieler = { name: rest, stand };
    }
    if (!spieler) return false;
    const ziel = slotPraefix(1);
    for (const k of alt) {
      const rest = k.slice(ALT_PRAEFIX.length);
      if (rest.startsWith('welt:') || rest === spieler.name) localStorage.setItem(ziel + rest, localStorage.getItem(k));
    }
    // Gastname „Gast-1234“ passt auch als Charaktername
    const datum = spieler.stand.gespeichert ?? new Date().toISOString();
    speichereSlotMeta(1, { name: spieler.name.replace(/^gast-/, 'Gast-'), aussehen: pruefeAussehen(spieler.stand.aussehen), erstellt: datum, zuletzt: datum });
    for (const k of alt) localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- Multiplayer

export function ladeMpCharakter(serverId) {
  return pruefeMeta(lese(MP)[serverId]);
}

export function speichereMpCharakter(serverId, meta) {
  const alle = lese(MP);
  alle[serverId] = meta;
  schreibe(MP, alle);
}

export function loescheMpCharakter(serverId) {
  const alle = lese(MP);
  delete alle[serverId];
  schreibe(MP, alle);
}

/** Datum hübsch: „02.11.2026, 14:05“ */
export function datumText(iso) {
  if (!iso) return '–';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '–';
  return d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

import { neuerCode } from './p2p.js';

/**
 * Runde 47: Selbst gehostete Server („Server hosten“ im Hauptmenü). Liste im Browser des Hosts (localStorage
 * `browserSurvival.hostWelten`), Welt & Spielstände ALLER Mitspieler mit eigenem Präfix `browserSurvival.host.<id>.`
 * (BrowserSpeicher) – alles bleibt beim Host gespeichert. Jede Welt behält ihren Einladungscode (Freunde können ihn wiederverwenden).
 * Eintrag: { id, name, code, pvp, passwort, maxSpieler, erstellt, zuletzt, charakter: { name, aussehen } | null }
 */
const SCHLUESSEL = 'browserSurvival.hostWelten';
export const hostPraefix = (id) => `browserSurvival.host.${id}.`;
export const MAX_SPIELER = Object.freeze([2, 3, 4, 5, 6, 8]);

function lies() {
  try {
    const liste = JSON.parse(localStorage.getItem(SCHLUESSEL) ?? '[]');
    return Array.isArray(liste) ? liste.filter((w) => w && typeof w.id === 'string' && typeof w.code === 'string') : [];
  } catch {
    return [];
  }
}

function schreib(liste) {
  try {
    localStorage.setItem(SCHLUESSEL, JSON.stringify(liste));
  } catch {
    /* egal */
  }
}

/** Gespeicherte Server, zuletzt gespielte zuerst. */
export function ladeHostWelten() {
  return lies().sort((a, b) => String(b.zuletzt ?? '').localeCompare(String(a.zuletzt ?? '')));
}

export function ladeHostWelt(id) {
  return lies().find((w) => w.id === id) ?? null;
}

/** Neuen Server anlegen (Einstellungen gelten fest – so wie der Host sie beim Erstellen wählt). */
export function neueHostWelt({ name, pvp = false, passwort = '', maxSpieler = 4 }) {
  const jetzt = new Date().toISOString();
  const welt = {
    id: Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36),
    name: String(name ?? '').trim().slice(0, 30) || 'Mein Server',
    code: neuerCode(),
    pvp: pvp === true,
    passwort: String(passwort ?? '').slice(0, 40),
    maxSpieler: MAX_SPIELER.includes(maxSpieler) ? maxSpieler : 4,
    erstellt: jetzt,
    zuletzt: jetzt,
    charakter: null,
  };
  schreib([...lies(), welt]);
  return welt;
}

export function aktualisiereHostWelt(id, aenderung) {
  const liste = lies();
  const i = liste.findIndex((w) => w.id === id);
  if (i < 0) return null;
  liste[i] = { ...liste[i], ...aenderung };
  schreib(liste);
  return liste[i];
}

/** Server samt Welt und allen Spielständen löschen. */
export function loescheHostWelt(id) {
  try {
    const praefix = hostPraefix(id);
    const weg = [];
    for (let i = 0; i < localStorage.length; i++) if (localStorage.key(i)?.startsWith(praefix)) weg.push(localStorage.key(i));
    for (const k of weg) localStorage.removeItem(k);
  } catch {
    /* egal */
  }
  schreib(lies().filter((w) => w.id !== id));
}

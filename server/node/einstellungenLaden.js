import { readFileSync, existsSync } from 'node:fs';

/** Liest server/daten/einstellungen.json (optional). Fehlt die Datei, gelten die Standardwerte. */
export function ladeEinstellungen(dateipfad) {
  if (!existsSync(dateipfad)) return {};
  try {
    return JSON.parse(readFileSync(dateipfad, 'utf8'));
  } catch (fehler) {
    throw new Error(`Einstellungen "${dateipfad}" sind kein gültiges JSON: ${fehler.message}`);
  }
}

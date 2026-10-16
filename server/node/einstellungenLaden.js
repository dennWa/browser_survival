import { readFileSync, existsSync } from 'node:fs';
import { writeFile, rename, mkdir } from 'node:fs/promises';
import path from 'node:path';

/** Liest server/daten/einstellungen.json (optional). Fehlt die Datei, gelten die Standardwerte. */
export function ladeEinstellungen(dateipfad) {
  if (!existsSync(dateipfad)) return {};
  try {
    return JSON.parse(readFileSync(dateipfad, 'utf8'));
  } catch (fehler) {
    throw new Error(`Einstellungen "${dateipfad}" sind kein gültiges JSON: ${fehler.message}`);
  }
}

/**
 * Developer-Modus: Überschreibungen dauerhaft in einstellungen.json schreiben (atomar: erst Temp-Datei, dann umbenennen).
 * Beim nächsten Serverstart gelten sie automatisch.
 */
export function dateiEinstellungsSpeicher(dateipfad) {
  return {
    async speichern(ueberschreibungen) {
      await mkdir(path.dirname(dateipfad), { recursive: true });
      const temp = `${dateipfad}.tmp`;
      await writeFile(temp, JSON.stringify(ueberschreibungen, null, 2) + '\n');
      await rename(temp, dateipfad);
    },
  };
}

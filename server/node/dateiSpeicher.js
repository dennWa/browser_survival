import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Spielstände als JSON-Dateien: <ordner>/<benutzername>.json
 * Schreiben erst in eine Temp-Datei, dann umbenennen → ein Absturz hinterlässt nie eine halbe Datei.
 * Schnittstelle: siehe server/spiel/speicher/arbeitsspeicherSpeicher.js
 */
export class DateiSpeicher {
  constructor(ordner) {
    this.ordner = ordner;
  }

  async laden(benutzername) {
    try {
      return JSON.parse(await readFile(this.#datei(benutzername), 'utf8'));
    } catch (fehler) {
      if (fehler.code === 'ENOENT') return null;
      if (fehler instanceof SyntaxError) return null; // kaputte Datei → neu anfangen statt Absturz
      throw fehler;
    }
  }

  async speichern(benutzername, stand) {
    await mkdir(this.ordner, { recursive: true });
    const ziel = this.#datei(benutzername);
    const temp = `${ziel}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temp, JSON.stringify(stand, null, 1));
    await rename(temp, ziel);
  }

  #datei(benutzername) {
    // Namen sind schon geprüft (BENUTZERNAME_MUSTER); encodeURIComponent als zweite Sicherung gegen "../"
    return path.join(this.ordner, `${encodeURIComponent(benutzername.toLowerCase())}.json`);
  }
}

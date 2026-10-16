import { readFile } from 'node:fs/promises';
import { pruefePasswort } from './passwort.js';

/**
 * Accounts aus einer JSON-Datei (Standard: server/daten/konten.json).
 * Format: { "konten": [ { "benutzername": "Dennis", "passwortHash": "scrypt$…", "admin": true } ] }
 * Anlegen per: npm run konto -- <name> <passwort> [--admin]
 *
 * Die Datei wird bei jedem Login frisch gelesen → neue Accounts gelten ohne Server-Neustart.
 */
export class KontenAuthentifizierung {
  /**
   * @param dateipfad   konten.json
   * @param kontenJson  alternativ: Inhalt als Text (z. B. Umgebungsvariable KONTEN_JSON beim Online-Hoster,
   *                    wo es keine dauerhafte Datei gibt)
   */
  constructor(dateipfad, { kontenJson = null } = {}) {
    this.dateipfad = dateipfad;
    this.kontenJson = kontenJson;
  }

  async pruefe(benutzername, passwort) {
    const konten = await this.#ladeKonten();
    const konto = konten.find((k) => k.benutzername.toLowerCase() === benutzername.toLowerCase());
    // Gleiche Fehlermeldung für "unbekannt" und "falsches Passwort" → verrät nicht, welche Accounts existieren
    const fehler = { ok: false, grund: 'Benutzername oder Passwort falsch' };
    if (!konto || !passwort) return fehler;
    if (!(await pruefePasswort(passwort, konto.passwortHash))) return fehler;
    return { ok: true, benutzername: konto.benutzername, admin: konto.admin === true };
  }

  async #ladeKonten() {
    if (this.kontenJson) {
      const inhalt = JSON.parse(this.kontenJson);
      return Array.isArray(inhalt.konten) ? inhalt.konten : [];
    }
    try {
      const inhalt = JSON.parse(await readFile(this.dateipfad, 'utf8'));
      return Array.isArray(inhalt.konten) ? inhalt.konten : [];
    } catch (fehler) {
      if (fehler.code === 'ENOENT') return [];
      throw fehler;
    }
  }
}

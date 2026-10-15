import { readFile } from 'node:fs/promises';
import { pruefePasswort } from './passwort.js';

/**
 * Accounts aus einer JSON-Datei (Standard: server/daten/konten.json).
 * Format: { "konten": [ { "benutzername": "Dennis", "passwortHash": "scrypt$…" } ] }
 * Anlegen per: npm run konto -- <name> <passwort>
 *
 * Die Datei wird bei jedem Login frisch gelesen → neue Accounts gelten ohne Server-Neustart.
 */
export class KontenAuthentifizierung {
  constructor(dateipfad) {
    this.dateipfad = dateipfad;
  }

  async pruefe(benutzername, passwort) {
    const konten = await this.#ladeKonten();
    const konto = konten.find((k) => k.benutzername.toLowerCase() === benutzername.toLowerCase());
    // Gleiche Fehlermeldung für "unbekannt" und "falsches Passwort" → verrät nicht, welche Accounts existieren
    const fehler = { ok: false, grund: 'Benutzername oder Passwort falsch' };
    if (!konto || !passwort) return fehler;
    if (!(await pruefePasswort(passwort, konto.passwortHash))) return fehler;
    return { ok: true, benutzername: konto.benutzername };
  }

  async #ladeKonten() {
    try {
      const inhalt = JSON.parse(await readFile(this.dateipfad, 'utf8'));
      return Array.isArray(inhalt.konten) ? inhalt.konten : [];
    } catch (fehler) {
      if (fehler.code === 'ENOENT') return [];
      throw fehler;
    }
  }
}

import { readFile, writeFile, rename } from 'node:fs/promises';
import { timingSafeEqual } from 'node:crypto';
import { hashePasswort, pruefePasswort } from './passwort.js';
import { GAST_MUSTER } from '../../gemeinsam/konstanten.js';

/**
 * Accounts aus einer JSON-Datei (Standard: server/daten/konten.json, Vorlage: konten.beispiel.json).
 *
 * Format – Passwort einfach im Klartext eintragen:
 *   { "konten": [ { "benutzername": "Dennis", "passwort": "geheim123", "admin": true },
 *                 { "benutzername": "Max", "passwort": "zombies!" } ] }
 *
 * Beim nächsten Login liest der Server die Datei, VERSCHLÜSSELT Klartext-Passwörter (scrypt) und schreibt sie
 * zurück ("passwort" → "passwortHash"). Ist die Datei schreibgeschützt (z. B. Render "Secret File"), klappt
 * der Login trotzdem – dann wird nur im Speicher verglichen.
 * Alternativ: npm run konto -- <name> <passwort> [--admin]
 *
 * Die Datei wird bei jedem Login frisch gelesen → neue Accounts gelten ohne Server-Neustart.
 */
export class KontenAuthentifizierung {
  #gewarnt = false;

  /**
   * @param dateipfad   konten.json
   * @param kontenJson  alternativ: Inhalt als Text (z. B. Umgebungsvariable KONTEN_JSON beim Online-Hoster)
   * @param protokoll   für Hinweise (console)
   */
  constructor(dateipfad, { kontenJson = null, protokoll = console } = {}) {
    this.dateipfad = dateipfad;
    this.kontenJson = kontenJson;
    this.log = protokoll;
  }

  async pruefe(benutzername, passwort) {
    const konten = await this.#ladeKonten();
    const konto = konten.find((k) => typeof k.benutzername === 'string' && k.benutzername.toLowerCase() === benutzername.toLowerCase());
    // Gleiche Fehlermeldung für "unbekannt" und "falsches Passwort" → verrät nicht, welche Accounts existieren
    const fehler = { ok: false, grund: 'Benutzername oder Passwort falsch' };
    if (!konto || !passwort || GAST_MUSTER.test(konto.benutzername)) return fehler;
    const stimmt = konto.passwortHash ? await pruefePasswort(passwort, konto.passwortHash) : vergleicheKlartext(passwort, konto.passwort);
    if (!stimmt) return fehler;
    return { ok: true, benutzername: konto.benutzername, admin: konto.admin === true };
  }

  async #ladeKonten() {
    let inhalt;
    if (this.kontenJson) {
      inhalt = JSON.parse(this.kontenJson);
    } else {
      try {
        inhalt = JSON.parse(await readFile(this.dateipfad, 'utf8'));
      } catch (fehler) {
        if (fehler.code === 'ENOENT') return [];
        if (fehler instanceof SyntaxError) {
          this.log.error?.(`[Konten] ${this.dateipfad} ist kein gültiges JSON: ${fehler.message}`);
          return [];
        }
        throw fehler;
      }
    }
    const konten = Array.isArray(inhalt?.konten) ? inhalt.konten : [];
    if (!this.kontenJson && konten.some((k) => typeof k.passwort === 'string' && !k.passwortHash)) await this.#verschluessele(inhalt);
    return konten;
  }

  /** Klartext-Passwörter in der Datei durch Hashes ersetzen (atomar schreiben). */
  async #verschluessele(inhalt) {
    const kopie = structuredClone(inhalt);
    let anzahl = 0;
    for (const k of kopie.konten) {
      if (typeof k.passwort !== 'string' || k.passwortHash) continue;
      k.passwortHash = await hashePasswort(k.passwort);
      delete k.passwort;
      anzahl++;
    }
    try {
      const temp = `${this.dateipfad}.tmp`;
      await writeFile(temp, JSON.stringify(kopie, null, 2) + '\n');
      await rename(temp, this.dateipfad);
      this.log.info?.(`[Konten] ${anzahl} Passwort${anzahl === 1 ? '' : 'e'} in ${this.dateipfad} verschlüsselt`);
    } catch {
      if (!this.#gewarnt) this.log.warn?.(`[Konten] ${this.dateipfad} ist schreibgeschützt – Klartext-Passwörter werden nur im Speicher geprüft`);
      this.#gewarnt = true;
    }
  }
}

function vergleicheKlartext(eingabe, gespeichert) {
  if (typeof gespeichert !== 'string' || gespeichert.length === 0) return false;
  const a = Buffer.from(eingabe);
  const b = Buffer.from(gespeichert);
  return a.length === b.length && timingSafeEqual(a, b);
}

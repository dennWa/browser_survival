/**
 * Authentifizierungs-Schnittstelle (vom SpielServer genutzt):
 *
 *   async pruefe(benutzername, passwort) → { ok: true, benutzername } | { ok: false, grund }
 *
 * Implementierungen:
 *   - GastAuthentifizierung (hier)              jeder Name, kein Passwort – Lokal-Modus
 *   - server/node/kontenAuthentifizierung.js     Accounts aus server/daten/konten.json
 *   - später z. B. Datenbank-Anbindung, ohne den SpielServer anzufassen
 */
export class GastAuthentifizierung {
  async pruefe(benutzername) {
    return { ok: true, benutzername };
  }
}

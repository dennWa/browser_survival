/**
 * Authentifizierungs-Schnittstelle (vom SpielServer genutzt):
 *
 *   async pruefe(benutzername, passwort) → { ok: true, benutzername, admin? } | { ok: false, grund }
 *   admin: true = darf Admin-Befehle (Gottmodus …) benutzen
 *
 * Implementierungen:
 *   - GastAuthentifizierung (hier)              jeder Name, kein Passwort – Lokal-Modus (dort mit admin: true)
 *   - server/node/kontenAuthentifizierung.js     Accounts aus server/daten/konten.json
 *   - später z. B. Datenbank-Anbindung, ohne den SpielServer anzufassen
 */
export class GastAuthentifizierung {
  /** @param {{ admin?: boolean }} optionen  admin = alle Gäste sind Admins (nur für den Lokal-Modus gedacht!) */
  constructor({ admin = false } = {}) {
    this.admin = admin;
  }

  async pruefe(benutzername) {
    return { ok: true, benutzername, admin: this.admin };
  }
}

/**
 * Authentifizierungs-Schnittstelle (vom SpielServer genutzt):
 *
 *   async pruefe(benutzername, passwort) → { ok: true, benutzername, admin? } | { ok: false, grund }
 *   admin: true = darf Admin-Befehle (Gottmodus …) benutzen
 *   optional: async pruefeGast(gastname) → wie oben; fehlt sie, sind Gäste erlaubt, aber nie Admin
 *   (ob Gäste überhaupt dürfen, steuert konfiguration.server.gaeste)
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

  /** "Als Gast spielen" (Name Gast-1234) – hier genauso wie ein normaler Login. */
  async pruefeGast(benutzername) {
    return this.pruefe(benutzername);
  }
}

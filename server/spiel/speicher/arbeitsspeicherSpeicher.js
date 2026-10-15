/**
 * Speicher-Schnittstelle für Spielstände (vom SpielServer genutzt):
 *
 *   async laden(benutzername)          → Spielstand-Objekt oder null
 *   async speichern(benutzername, stand)
 *
 * Implementierungen:
 *   - ArbeitsspeicherSpeicher (hier)        hält Stände nur, solange der Server läuft (Standard, Tests)
 *   - server/node/dateiSpeicher.js          JSON-Datei pro Spieler (Mehrspieler-Server)
 *   - client/netzwerk/browserSpeicher.js    localStorage (Lokal-Modus)
 *
 * Schlüssel ist der Benutzername in Kleinbuchstaben (Anmeldung ignoriert Groß-/Kleinschreibung).
 */
export class ArbeitsspeicherSpeicher {
  #staende = new Map();

  async laden(benutzername) {
    const stand = this.#staende.get(benutzername.toLowerCase());
    return stand ? structuredClone(stand) : null;
  }

  async speichern(benutzername, stand) {
    this.#staende.set(benutzername.toLowerCase(), structuredClone(stand));
  }
}

/**
 * Spielstände im Lokal-Modus: im localStorage des Browsers.
 * Schnittstelle: siehe server/spiel/speicher/arbeitsspeicherSpeicher.js
 * (privates Fenster / gesperrter Speicher → es wird einfach nichts gespeichert)
 */
const PRAEFIX = 'browserSurvival.spielstand.';

export class BrowserSpeicher {
  async laden(benutzername) {
    try {
      const text = localStorage.getItem(PRAEFIX + benutzername.toLowerCase());
      return text ? JSON.parse(text) : null;
    } catch {
      return null;
    }
  }

  async speichern(benutzername, stand) {
    try {
      localStorage.setItem(PRAEFIX + benutzername.toLowerCase(), JSON.stringify(stand));
    } catch {
      // Speicher voll oder gesperrt → ignorieren
    }
  }
}

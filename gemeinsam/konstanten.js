/**
 * Globale Konstanten, die Client UND Server kennen müssen.
 * Änderungen hier betreffen beide Seiten – nach Änderung Server neu starten.
 */

export const SPIEL_NAME = 'Browser Survival';
export const SPIEL_VERSION = '0.1.0';

/** Wird beim Login verglichen. Erhöhen, sobald sich das Nachrichtenformat inkompatibel ändert. */
export const PROTOKOLL_VERSION = 1;

/** Simulationstakt (Ticks pro Sekunde). Server-Simulation und Client-Vorhersage laufen im selben Takt. */
export const TICK_RATE = 30;
export const TICK_DAUER_MS = 1000 / TICK_RATE;
export const TICK_DAUER_S = 1 / TICK_RATE;

/** Maximal gepufferte Eingaben pro Spieler auf dem Server (Schutz gegen Flooding/Speedhacks). */
export const MAX_EINGABE_PUFFER = 8;

/** Größe einer Kachel (Tile) in Weltpixeln. */
export const KACHEL_GROESSE = 32;

/** Benutzernamen: 2–20 Zeichen, Buchstaben, Ziffern, _ und -. */
export const BENUTZERNAME_MUSTER = /^[A-Za-z0-9_\-äöüÄÖÜß]{2,20}$/;

/**
 * Globale Konstanten, die Client UND Server kennen müssen.
 * Änderungen hier betreffen beide Seiten – nach Änderung Server neu starten.
 */

export const SPIEL_NAME = 'Browser Survival';
export const SPIEL_VERSION = '0.6.0';

/** Wird beim Login verglichen. Erhöhen, sobald sich das Nachrichtenformat inkompatibel ändert. */
export const PROTOKOLL_VERSION = 3;

/** Simulationstakt (Ticks pro Sekunde). Server-Simulation und Client-Vorhersage laufen im selben Takt. */
export const TICK_RATE = 30;
export const TICK_DAUER_MS = 1000 / TICK_RATE;
export const TICK_DAUER_S = 1 / TICK_RATE;

/** Maximal gepufferte Eingaben pro Spieler auf dem Server (Schutz gegen Flooding/Speedhacks). */
export const MAX_EINGABE_PUFFER = 8;

/** Größe einer Kachel (Tile) in Weltpixeln. */
export const KACHEL_GROESSE = 32;

/** Anzahl Inventarplätze (Schnellleiste 1–8). */
export const INVENTAR_PLAETZE = 8;

/** So nah (px) muss man an einem Gegenstand stehen, um ihn aufzuheben. */
export const AUFHEB_REICHWEITE = 48;

/** So nah (px, bis zur Türkante) muss man an einer Tür stehen, um sie zu öffnen/schließen. */
export const TUER_REICHWEITE = 40;

/** Reichweite (px, bis zum Rand) für Werkbank (Crafting) und Bett (Schlafen). */
export const WERKBANK_REICHWEITE = 48;
export const BETT_REICHWEITE = 56;

/** Benutzernamen: 2–20 Zeichen, Buchstaben, Ziffern, _ und -. */
export const BENUTZERNAME_MUSTER = /^[A-Za-z0-9_\-äöüÄÖÜß]{2,20}$/;

/**
 * Globale Konstanten, die Client UND Server kennen müssen.
 * Änderungen hier betreffen beide Seiten – nach Änderung Server neu starten.
 */

export const SPIEL_NAME = 'Browser Survival';
export const SPIEL_VERSION = '0.14.0';

/** Wird beim Login verglichen. Erhöhen, sobald sich das Nachrichtenformat inkompatibel ändert. */
export const PROTOKOLL_VERSION = 10;

/** Simulationstakt (Ticks pro Sekunde). Server-Simulation und Client-Vorhersage laufen im selben Takt. */
export const TICK_RATE = 30;
export const TICK_DAUER_MS = 1000 / TICK_RATE;
export const TICK_DAUER_S = 1 / TICK_RATE;

/** Maximal gepufferte Eingaben pro Spieler auf dem Server (Schutz gegen Flooding/Speedhacks). */
export const MAX_EINGABE_PUFFER = 8;

/** Größe einer Kachel (Tile) in Weltpixeln. */
export const KACHEL_GROESSE = 32;

/** Schnellleiste (Tasten 1–9 und 0 für Platz 10) = die ersten Inventarplätze. */
export const HOTBAR_PLAETZE = 10;
/** Grund-Inventar: Schnellleiste (10) + Tasche (6). Ein Rucksack hängt weitere Plätze hinten an. */
export const INVENTAR_PLAETZE = 16;
/** Obergrenze inkl. größtem Rucksack (für die Prüfung von Slot-Nummern). */
export const INVENTAR_MAX = 32;

/** Stapelgrößen: Munition bis 50, alles andere Stapelbare bis 20 (Waffen/Werkzeug/Rucksack einzeln). */
export const STAPEL_MUNITION = 50;
export const STAPEL_STANDARD = 20;
/** Lagerkiste: so viele Plätze. */
export const KISTE_PLAETZE = 16;
/** Plätze im Kofferraum eines Autos (E-Taste G): eigenes Inventar je Fahrzeug, bleibt im Welt-Spielstand erhalten. */
export const KOFFERRAUM_PLAETZE = 10;

/** So nah (px) muss man an einem Gegenstand stehen, um ihn aufzuheben. */
export const AUFHEB_REICHWEITE = 48;

/** So nah (px, bis zur Türkante) muss man an einer Tür stehen, um sie zu öffnen/schließen. */
export const TUER_REICHWEITE = 40; // Bretter annageln
export const TUER_AUTO_OEFFNEN = 44; // px Abstand zur Tür, ab dem sie von selbst aufgeht (etwas Vorlauf gegen Latenz)
export const TUER_AUTO_SCHLIESSEN = 66; // erst weiter weg als das schließt sie wieder (Hysterese)
export const TUER_BRUCH_OFFEN = 20; // s, die eine aufgebrochene Tür offen bleibt

/** Reichweite (px, bis zum Rand) für Werkbank (Crafting) und Bett (Schlafen). */
export const WERKBANK_REICHWEITE = 48;
export const BETT_REICHWEITE = 56;

/** Chat: maximale Länge einer Nachricht und Mindestabstand zwischen zwei Nachrichten (Spam-Schutz). */
export const CHAT_MAX_LAENGE = 160;
export const CHAT_PAUSE_MS = 700;

/** Benutzernamen: 2–20 Zeichen, Buchstaben, Ziffern, _ und -. */
export const BENUTZERNAME_MUSTER = /^[A-Za-z0-9_\-äöüÄÖÜß]{2,20}$/;

/** Gast-Namen ("Gast-4821"): vom Client zufällig erzeugt und im Browser gemerkt → Gäste behalten ihren Spielstand. */
export const GAST_MUSTER = /^Gast-\d{4,6}$/;

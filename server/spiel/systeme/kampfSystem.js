/**
 * Kampfsystem (Platzhalter – Phase 2).
 *
 * Geplant:
 *   - Nahkampf: Treffer-Kegel vor dem Spieler (blick ± Winkel, Reichweite der Waffe)
 *   - Fernkampf: Hitscan-Strahl (Raycast) gegen Wände und Zombies, Munition aus dem Inventar
 *   - fuegeSchadenZu(ziel, menge, quelle) als einzige Stelle, an der Leben verändert wird
 *   - Tod: Entität entfernen / Spieler respawnen
 *
 * Alles serverseitig – der Client schickt nur "Angriffstaste gedrückt" als Teil der Eingabe.
 */
export function aktualisiereKampf(spielWelt, dt) {
  // Absichtlich leer.
}

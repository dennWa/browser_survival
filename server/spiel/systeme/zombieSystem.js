/**
 * Zombie-KI (Platzhalter – Phase 2).
 *
 * Geplanter Ablauf pro Tick:
 *   1. 'ruhend':      nächsten Spieler im konfiguration.zombie.aggroRadius suchen → 'verfolgend'
 *   2. 'verfolgend':  auf Ziel zubewegen (bewegeKoerper aus gemeinsam/physik/bewegung.js),
 *                     Ziel weg/zu weit → zurück zu 'ruhend'
 *   3. 'angreifend':  in angriffsReichweite → Schaden über kampfSystem, Abklingzeit beachten
 */
export function aktualisiereZombies(spielWelt, dt) {
  // Absichtlich leer: Zombies stehen vorerst nur herum.
}

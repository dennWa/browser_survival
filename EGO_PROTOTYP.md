# Ego-Prototyp (Ich-Perspektive) – Experiment, Taste C (nur PC)

Zum Entfernen, falls es nicht gefällt:
1. Ordner `client/ego/` löschen (enthält `egoModus.js`)
2. `client/main.js`: die zwei mit `EGO-PROTOTYP` markierten Zeilen (Import + `new EgoModus(...)`) löschen
3. `client/darstellung/renderer.js`: die Zeile `this.egoHaken?.(...)` in `zeichne()` löschen
4. Diese Datei löschen

Sonst wurde nichts verändert (kein Server-, Protokoll-, Test-Code).
Funktionsweise: Kamera ins Auge (Höhe 54), Pointer-Lock-Maus (Yaw/Pitch), WASD relativ zur Blickrichtung, Linksklick schießt waagerecht,
eigene Figur ausgeblendet. Wand-Schnitt aus. Basisbau/Zielring/Touch sind in Ego NICHT angepasst.

# Hinweise für KI-Sitzungen

1. **Zuerst `project_manifest.md` lesen** – dort stehen Architektur, Dateistruktur, "Wo ändere ich …?" und der Entwicklungsstand.
2. Nach jeder strukturellen Änderung (neue Datei, neues System, neue Nachricht, Phase abgeschlossen) das Manifest aktualisieren, inkl. Änderungsprotokoll.
3. Code-Sprache: Deutsch (Bezeichner ohne Umlaute, Kommentare mit Umlauten erlaubt). Vanilla JS, ES-Module, kein Build-Schritt.
4. Spiellogik nur in `server/spiel/` (autoritativ, umgebungsfrei – keine `node:`-Importe, kein DOM).
5. Grafiken nur über `werkzeuge/assets/baue_assets.py` + `npm run assets:3d` ändern (nie direkt in `client/assets/` oder `client/vendor/`). Nur CC0/CC-BY-Quellen, Credits-Dialog nicht entfernen.
   Neue Renderer-Funktion? Beide Renderer (2D `client/darstellung/`, 3D `client/darstellung3d/`) mitdenken.
6. Touch-Bedienung (Handy/Tablet) bei jeder neuen Aktion mitdenken.
7. Vor jedem Commit: `npm test`.
8. Am Ende jeder Antwort den Link zum Spiel posten: https://dennwa.github.io/browser_survival/

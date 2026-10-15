# Hinweise für KI-Sitzungen

1. **Zuerst `project_manifest.md` lesen** – dort stehen Architektur, Dateistruktur, "Wo ändere ich …?" und der Entwicklungsstand.
2. Nach jeder strukturellen Änderung (neue Datei, neues System, neue Nachricht, Phase abgeschlossen) das Manifest aktualisieren, inkl. Änderungsprotokoll.
3. Code-Sprache: Deutsch (Bezeichner ohne Umlaute, Kommentare mit Umlauten erlaubt). Vanilla JS, ES-Module, kein Build-Schritt.
4. Spiellogik nur in `server/spiel/` (autoritativ, umgebungsfrei – keine `node:`-Importe, kein DOM).
5. Vor jedem Commit: `npm test`.

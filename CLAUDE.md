# Hinweise für KI-Sitzungen

1. **Zuerst `project_manifest.md` lesen** – dort stehen Architektur, Dateistruktur, "Wo ändere ich …?" und der Entwicklungsstand.
2. **`KI_INDEX.md` (abgekürzte Karte für KIs) lesen und nutzen**, um Änderungsstellen zu finden. **Am Ende jedes Auftrags** `KI_INDEX.md` kurz und knapp (nur für KIs verständlich) nachziehen: neue/verschobene Dateien, Systeme, Nachrichten, Fallen/Invarianten, Tests. Auch Datei-Kopfkommentare bei geänderten Dateien aktuell halten.
3. Nach jeder strukturellen Änderung (neue Datei, neues System, neue Nachricht, Phase abgeschlossen) das Manifest aktualisieren, inkl. Änderungsprotokoll.
4. Code-Sprache: Deutsch (Bezeichner ohne Umlaute, Kommentare mit Umlauten erlaubt). Vanilla JS, ES-Module, kein Build-Schritt.
5. Spiellogik nur in `server/spiel/` (autoritativ, umgebungsfrei – keine `node:`-Importe, kein DOM).
6. Grafiken nur über `werkzeuge/assets/baue_assets.py` + `npm run assets:3d` ändern (nie direkt in `client/assets/` oder `client/vendor/`). Nur CC0/CC-BY-Quellen, Credits-Dialog nicht entfernen.
   **Ausnahme (Nutzer-Entscheidung):** Eigene 3D-Modelle (`.glb`) aus dem Map-Editor landen über `npm run karte:editor` unverändert unter `client/assets/eigene/` – ohne Lizenzprüfung. Die Rechte liegen bei der hochladenden Person; Urheber/Lizenz sind optionale Felder am Typ.
   Darstellung ist **nur 3D** (Three.js, `client/darstellung/renderer.js`) – kein 2D-Renderer mehr.
7. Touch-Bedienung (Handy/Tablet) bei jeder neuen Aktion mitdenken.
8. Vor jedem Commit: `npm test`.
9. **Immer direkt auf `main` arbeiten, committen und pushen** (keine Feature-Branches, keine PRs) – GitHub Pages liefert `main` aus.
10. Am Ende jeder Antwort den Link zum Spiel posten: https://dennwa.github.io/browser_survival/

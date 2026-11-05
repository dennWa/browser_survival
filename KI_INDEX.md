# KI_INDEX – Kompaktkarte für KI-Sitzungen (v0.29.0-dev · Proto v12)

> Dicht & abgekürzt, für Maschinen gedacht. Für Menschen: `project_manifest.md` → Teile in `ki/handbuch/` („Wo ändere ich …?“ = `ki/handbuch/wo_aendere_ich.md`).
> Legende: `→` führt zu/ruft · `S:` Server (`server/spiel/`) · `C:` Client (`client/`) · `G:` gemeinsam (`gemeinsam/`) · `K:` Konfig (`server/spiel/konfiguration/`) · `⚠` Falle/Invariante · `★` häufigste Änderungsstelle

## 0 · Regeln (aus CLAUDE.md, hart)
- Code DE, Bezeichner ohne Umlaute; Vanilla ESM, kein Build; Node ≥20 + `ws`; Three.js nur 3D (`C:darstellung/renderer.js`).
- Spiellogik NUR `S:` (autoritativ, umgebungsfrei: kein `node:`, kein DOM). `G:` = von beiden importiert → ebenfalls umgebungsfrei.
- Grafik nur via `werkzeuge/assets/baue_assets.py` + `npm run assets:3d` (danach `git checkout client/assets/3d/animationen.json`, falls nur Rauschen). Nur CC0/CC-BY; Credits-Dialog bleibt. Ausnahme: Editor-Modelle `.glb` → `client/assets/eigene/` (keine Sperre, Nutzer-Entscheidung; Editor warnt bei fehlender Lizenz; `schreibeEigeneModelle` schreibt Urheber/Lizenz nach `client/assets/eigene/LIZENZEN.md`).
- Touch für jede neue Aktion (HUD-Knopf, `.nur-touch`). Vor Commit `npm test`. Manifest + Changelog pflegen. Spiel-Link am Antwortende laut CLAUDE.md (Runde 18 hieß es „keinen“ – CLAUDE.md gilt).
- Runde 19: Nutzer will Statusmeldungen nur am Phasenende (Stichpunkte), nicht nach jedem Schritt.
- ⚠ `server/daten/konten.json`, `einstellungen.json`, `spielstaende/` nie committen (gitignored).

- **Übergabe/Plan Editor 2.0:** `editor/ROADMAP.md` Abschnitt „🔁 Übergabe“ (Stand, nächster Schritt) – nach jeder Phase aktualisieren.

- **Free-KI-Starterpaket:** `docs/FREE_KI_STARTPAKET.md` (Kopiervorlage + Dateiliste für KIs mit kleinem Limit; KI_INDEX/Manifest sind dafür zu groß).

## 1 · Befehle
`npm test` (node:test, ~200 Tests, ~3 s) · `npm run rauchtest:editor [-- --schnell]` (Map-Editor im Browser, Screens `werkzeuge/test/ausgabe/editor-*.png`) · `npm run karte:editor -- x.karte.json` (Editor-Export → `server/spiel/karten/<id>.js` + KARTEN) · `npm run rauchtest [-- --online]` (Playwright: Login→laufen→I→K→Zonenwechsel, Screens `werkzeuge/test/ausgabe/`) · `npm run start:gast` (Port `PORT`, Standard 8080) · `npm run karte:export -- <id>` / `karte:import -- x.tmj` (Tiled) · `python3 werkzeuge/karten/{stadtrand,waldweg}.py` (⚠ überschreibt Karten-JS) · `npm run konto -- name pw [--admin]` · `npm run musik:index` (client/musik → musik.json).
Browser-Konsole (nur Lokal-Modus): `browserSurvival.{tp(tx,ty), gib(defId,n), boden(defId,n), zeit(h), zone(id[,ankunft]), ich(), welt(), spiel, server}`. F3 = Draw-Calls/Qualität.
Playwright-Skripte: nach Login auf `#laden` hidden warten (Aufwärmphase), sonst gehen Tasten verloren.

## Themenkarte – nur die Datei lesen, die du brauchst
> Dieser Router ist absichtlich klein. NICHT alles unter `ki/` lesen – gezielt per Thema/Grep einsteigen (z.B. `grep -rn "stichwort" ki/`).
> Die §-Nummern in den Überschriften der Teil-Dateien sind die alten Nummern (Querverweise „s. §20“ etc. per Grep auffindbar).

| Datei | Inhalt |
|---|---|
| `ki/kern.md` | Architektur in 12 Zeilen, Protokoll (Nachrichten), Datenformen (Spieler/Welt/Spielstand) |
| `ki/dateikarte.md` | Welche Datei macht was („Wo ändere ich …?“) |
| `ki/fallen.md` | Fallen & Invarianten (⚠ schon reingetappt) – vor Änderungen überfliegen |
| `ki/tests.md` | Test → Thema, offene Baustellen, Ego-Prototyp |
| `ki/editor.md` | Map-Editor `editor/` (Editor 2.0) |
| `ki/editor_audio.md` | Audio-Zentrale, Sounds, lokaler Editor-Server |
| `ki/baum_modell.md` | Bäume/tree.glb (Spiel-Seite) |
| `ki/runden_14_17.md` | Runde 14: Hauptspiel, Schneezone/Tanne/`!verteilen`, Zoom/Lampe, Figuren Quaternius |
| `ki/runden_18_19.md` | Runde 18/19, Spielordner-Modelle |
| `ki/zonen_runde20_21.md` | Zonen/Ladebild, Runde 20 (Performance, Auto, Zombies, Villa), Runde 21 |
| `ki/tutorial.md` | Tutorial |
| `ki/runde23.md` | Runde 23 |
| `ki/runde24.md` | Runde 24 (Gruppen, Handel, Sprachchat, …) |
| `ki/runde25.md` | Runde 25 |
| `ki/runde26_27.md` | Runde 26/27 (Waffen, Böden, KI-Karten-Anleitung, Haustiere) |
| `ki/studio.md` | Studio `studio/` (Desktop-Editor, MCP, Werkstatt, Audio) + Phase 4 |
| `ki/runde28.md` | Runde 28 (Hauptmenü, Slots, Kleidung, Nässe/Blutung) |
| `ki/runde29.md` | Runde 29 ( Sound-Paket, Wasser, Konsum-Dauer, Bots wehren sich, Autos beschießbar, Einschusslöcher) |
| `ki/runde30.md` | Runde 30 (Zombie-Atlas-Textur, UV-Umprojektion `zombieTextur.js`) |
| `ki/runde31.md` | Runde 31 (Ast/Rinde/Feuerbohrer, Zombie-/Asphalt-Sounds, Lautstärken, Auto-Zusammenstoß, Ego-Sicht, Regen-Graustich) |
| `ki/runde33.md` | Runde 33 (neueste: Ego-Sichtradius, Rasen aus, Busch-Modelle, Fleisch-Textur, Doppelaxt/Dynamit/RPG) |
| `ki/runde34.md` | Runde 34 (Baumstümpfe aus Modellpaket, Pools je Form/Textur) |
| `ki/runde35.md` | Runde 35 (neueste: Fässer/Erz/Steine texturiert, Leichen-Timing, Masten-Balken, Baum-Fix) |
| `ki/runde32.md` | Runde 32 ( Nutzer-Modellpakete → Bäume/Gras/Steine/Items/Waffen/Tiere/Figuren, Zelt, Sound/Wetter/Licht, Gameplay) |

**Faustregel:** Spiellogik/Netz → `ki/kern.md` + `ki/fallen.md`. Datei suchen → `ki/dateikarte.md`. Neueste Änderungen → `ki/runde35.md`. Editor → `ki/editor.md`.
Ausführliches Handbuch (für Menschen): `project_manifest.md` (ebenfalls aufgeteilt unter `ki/handbuch/`).

## Pflege (Pflicht am Auftragsende)
Neue Erkenntnisse in die **passende** Themen-Datei schreiben (kurz, KI-dicht) – nie diesen Router aufblähen. Neue Runde = neue Datei `ki/rundeNN.md` + eine Zeile in der Tabelle oben.

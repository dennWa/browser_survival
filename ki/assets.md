# Assets · Modelle · Texturen · Icons · Lizenzen
> Lesen bei: neues 3D-Modell/Textur/Icon, Nutzer liefert Dateien („!verteilen“), Modellpakete umbauen, Credits/Lizenzen.
> Sounds → ki/audio.md · Figuren-Rigging → ki/figuren.md

## Regeln (CLAUDE.md, Nutzer-Entscheidungen)
- Nur CC0/CC-BY; Quelle + Lizenz in `client/assets/eigene/credits.json` [{paket,urheber,lizenz,url}] (→ Credits-Dialog `C:ui/credits.js`, nie entfernen). Ausnahme: Editor-/Studio-`.glb` → `client/assets/eigene/` ohne Lizenzprüfung (Urheber/Lizenz optional am Typ, `LIZENZEN.md` via `schreibeEigeneModelle`).
- Internet erlaubt: passend Low-Poly, Texturen 256–512 px, wenige Polygone, kleine Dateien. kenney.nl ist per Proxy gesperrt (403) → OpenGameArt-Spiegel; Poly Haven/ambientCG gehen.
- Erzeugte Dateien nie von Hand in `client/assets/` bzw. `client/vendor/` ändern – immer über die Skripte unten.
- glTF-Pflicht: NORMAL-Attribut (three berechnet keine → schwarz), Laub `alphaMode MASK`, Texturen behalten statt auf Vertexfarben backen (sonst verpixelt).

## Pipelines (`werkzeuge/assets/`)
| Ziel | Befehl | ⚠ |
|---|---|---|
| 2D-Atlas: Item-Icons, Böden-/Möbel-Draufsichten | `python3 werkzeuge/assets/baue_assets.py --nur-items` · neue Icon-Anträge `editor_grafiken/*.grafik.json` → `--editor-items` | OHNE Flag löscht `main()` ganz `client/assets/` (auch eigene/!) → danach `git diff --name-only --diff-filter=D -- client/assets \| xargs -d '\n' git checkout --`. Python: PIL, cairosvg, py7zr (Wheels `werkzeuge/python-pakete/`) |
| 3D-Sammlung (Natur/Gras …) | `npm run assets:3d` (`baue_3d.mjs`) | danach `git checkout client/assets/3d/animationen.json`, falls nur Rauschen |
| Boden-Fotos | `python3 werkzeuge/assets/baue_boeden.py` → `client/assets/boden/<name>.jpg` + `boden.json` | Quellen `quellen/boden/<ambientCG-ID>.jpg` |
| Bäume/Stümpfe/Steine/Erz/Essen/Waffen (Sammel-GLBs `r32_*`) | `python werkzeuge/assets/r32/baue_r32.py <teil>` (`modellwerk.py`, `sichte.py` Kontaktbogen) | Quellen lokal in `verteilen bitte/` (gitignored), braucht trimesh |
| Figuren, Skelett-Zombie, Modellpakete `si-/sp-/gp-/ph-blume-/lg-*` | `werkzeuge/assets/r44/*.py` (Blender headless, `glbwerk.py` glTF ohne trimesh) | s. ki/figuren.md |
| UI-Icons (game-icons.net, CC BY) | `node werkzeuge/assets/baue_ui_icons.mjs` → `eigene/ui-icons.svg` | |
| UV-Vorlagen | `python3 werkzeuge/assets/uv_vorlage.py <glb>` · `katze_vorlage.py` | |

## Spielordner-Modelle (`client/assets/eigene/*.glb`, ~560 Stück)
- Katalog `index.json` (kategorie, zielHoehe, masse{b,h,hoehe}) ← `npm run eigene:index` (Kategorien/Höhen von Hand in `werkzeuge/assets/eigene_kategorien.mjs`: `HOEHEN` in m, `REGELN` nach Namensmuster) · Vorschaubilder `eigene/vorschau/<name>.png` ← `npm run eigene:vorschau` (Playwright; ⚠ überschreibt index.json → danach erneut `eigene:index`). Generatoren brauchen `masse`.
- Nach JEDEM Modell hinzufügen/entfernen: `npm run eigene:index && npm run eigene:vorschau && npm run eigene:index && npm run ki:anleitung`. Namen klein mit Bindestrichen, nicht `<karteId>_…` (räumt `karte:editor` weg).
- Im Spiel: Karten-Typ `sf_<stem>_<hoehe·10>` mit `glbDatei` (→ ki/karten.md); Möbel als Bauwerk über `moebelModelle.js`; Items über `itemModelle.js`/`glbGeometrien.js`.

## Nutzer-Ablage `!verteilen` / `verteilen bitte` (gitignored, nie committen)
Nutzer legt Dateien + `Credits.txt` hinein. Ablauf: `.glb` → `client/assets/eigene/<name>.glb`, Texturen/Sounds in den passenden Client-Ordner, Credits („Name by Autor [Lizenz] via Quelle“) → `credits.json`, im Spiel einbauen (+ Karte), Index-Befehle oben, Ordner leeren (Credits.txt bleibt). ⚠ OneDrive „Nur online“-Dateien sind nicht lesbar – vorher prüfen.

## KI-Karten-Anleitung
`npm run ki:anleitung` → `editor/KI_KARTEN_ANLEITUNG.md` (Regeln + Katalog für fremde KIs; Test `kiAnleitung` prüft Aktualität). Pflicht nach neuen Modellen/Texturen/Sounds/Items/Kacheln. Datei selbst nie lesen (60 KB).

## Tests
`inhalte` (jede Grafik/Icon vorhanden, Karten-Typen mit existierender `glbDatei`), `eigeneModelle` (karte:editor + LIZENZEN.md), `spielordner`, `kiAnleitung`, `studioModelle`.

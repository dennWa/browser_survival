# Konzept: Performance & einfachere KI-Arbeit (Runde 43, Vorschlag – noch nichts umgesetzt)

Stand: 2026-11-07. Grundlage: Code-Stand nach Runde 43 (Three.js, Vanilla ESM, kein Build). Reihenfolge = Nutzen/Aufwand.

## Teil A – Performance (flüssig im Browser, auch auf Handy)

### Ist-Zustand (gemessen/gesehen)
- Lokal-Modus: `SpielServer` läuft **im selben Thread** wie Renderer, UI und Audio (`client/netzwerk/lokalerServer.js`). Jeder Server-Tick (30/s, Zombies, A*, Loot, Wetter …) klaut dem Bild Zeit → Ruckler.
- Karten-Deko-GLBs (`typen` sf_…) werden **pro Objekt geklont**, nicht instanziert (`eigeneModelle.js`). 380 Deko-Objekte = 380+ Meshes/Draw-Calls.
- `client/assets/eigene/` = 560 GLBs, **151 MB** (unkomprimiert, viele mit großen Texturen).
- `renderer.js` 2.800 Zeilen, `clientSpiel.js` 2.000 Zeilen: viel läuft „jedes Bild“, auch wenn sich nichts ändert.
- Schon gut: Boden in Blöcken, Bäume instanziert, Lichtbudget/Pool, Auto-Qualität, Frustum-/Weiten-Culling.

### Stufe 1 – große Hebel ohne Engine-Wechsel (empfohlen, je 1 Runde)
1. **Server in einen Web Worker** (Lokal-Modus): `lokalerServer.js` startet `new Worker('serverWorker.js', { type: 'module' })`; der Kanal ist schon nachrichtenbasiert (`speicherKanal`) → passt fast 1:1 auf `postMessage`. Spiellogik ist bereits umgebungsfrei (Regel 5) – genau dafür gemacht. Erwartung: deutlich ruhigere Bildzeiten, v. a. bei Horden.
2. **Deko instanzieren**: gleiche `typ` (+ gleiche Drehung egal) → ein `InstancedMesh` je Mesh-Teil statt Klone. Bei Zäunen/Stühlen/Blumen spart das 90 % der Draw-Calls. Animierte Modelle (Skelett) bleiben Klone.
3. **Assets verkleinern**: Build-Schritt nur für Assets (kein JS-Build): `gltf-transform` → Meshopt/Draco-Kompression + Texturen als KTX2/WebP, max. 512 px. Erwartung: 151 MB → ~20–30 MB, schnellere Ladezeit, weniger Grafikspeicher (Handy!).
4. **„Nur wenn nötig“-Updates**: Schatten nur neu rendern, wenn sich Licht/Kamera spürbar bewegt hat; HUD/Minikarte/Beschriftungen in festen Takten (z. B. 10/s) statt pro Bild; Figuren-Animationen weit weg mit halber Rate (gibt es für Zombies – auch für Spieler/Tiere).
5. **Netz-Deltas schlanker**: Schnappschüsse als Binär-Paket (`ArrayBuffer`, feste Felder) statt JSON; nur Entitäten im Sichtbereich (Interest Management) – entlastet Handy-CPU beim Parsen.

### Stufe 2 – mittlere Umbauten
6. **Räumliche Raster überall** (Spatial Hash): Zombies/Kollision/`naechstesObjekt`/`findeSitz` fragen nur Nachbarzellen ab statt alle Objekte (Stadtrand: tausende Objekte).
7. **Zombie-KI staffeln**: A* nur für nahe Zombies, Ferne laufen per Flussfeld (ein BFS je Spieler, alle Zombies lesen daraus) – skaliert für Horden.
8. **Statische Welt „backen“**: Wände/Möbel/Zaun je Block zu einem Mesh vereinen (wie Boden) + Lightmap fürs Feuer/Lampen-Grundlicht statt Echtzeit-Lichter → weniger Lichter im Shader.
9. **Profil-Modus**: F3-Overlay um Zeiten je System erweitern (Server-Tick ms, Render ms, Draw-Calls, Dreiecke, JS-Heap) – damit jede Optimierung messbar ist.

### Stufe 3 – „eigene Engine“? Ehrliche Einschätzung
- **Eigene Engine von Null: nicht empfohlen.** Three.js ist nicht der Flaschenhals; Draw-Calls, Haupt-Thread-Last und Asset-Größe sind es. Eine Eigenentwicklung kostet viele Runden und bringt erst nach Stufe 1+2 messbar etwas.
- Sinnvolle Zwischenschritte statt Engine-Wechsel:
  - **WebGPU-Renderer von Three.js** (`three/webgpu`) testweise – gleiche API, auf neuen Browsern schneller; WebGL bleibt Fallback.
  - **Heiße Rechenkerne in WASM** (z. B. Pfadfindung/Flussfeld, Kollision) – nur wenn das Profil sie als Engpass zeigt.
- Wenn je ein Wechsel, dann zu **Babylon.js oder PlayCanvas** (fertige Instancing/LOD/Asset-Pipeline) – aber nur bei klarem Messergebnis.

## Teil B – Einfachere Bearbeitung für KIs (weniger lesen, schneller starten)

### Probleme heute
- Einstieg: CLAUDE.md → KI_INDEX → Themen-Datei → oft noch Runden-Dateien; Wissen ist **nach Runden** sortiert (ki/runde23…43, 32 Dateien, ~220 KB), nicht **nach Systemen**. Wer „Sitzen“ ändern will, muss wissen, dass es in Runde 18, 24 und 42 steckt.
- Doppelte Quellen: `project_manifest.md` + `ki/handbuch/*` + `ki/*` + Datei-Kopfkommentare beschreiben teils dasselbe.
- Generatoren (`werkzeuge/karten/*.py`) und erzeugte Karten-JS (`server/spiel/karten/*.js`) müssen beide gepflegt werden (z. B. `stadtrand.js` UND `stadtrand.py` bei Übergängen).
- Riesige Dateien (renderer.js 2.800 Zeilen) zwingen zum Lesen großer Teile.

### Vorschläge (je klein, nacheinander umsetzbar)
1. **Wissen nach System statt nach Runde**: `ki/systeme/<system>.md` (z. B. `sitzen.md`, `zonen.md`, `licht.md`, `figuren.md`, `karten-generatoren.md`) – je ≤ 3 KB: Dateien, Datenformen, Fallen, Tests. Runden-Dateien wandern nach `archiv/ki_runden/` (nur Historie). Neue Runde = nur noch die betroffenen System-Dateien ergänzen + 1 Zeile Changelog.
2. **Ein Router, eine Tabelle**: `KI_INDEX.md` = nur Regeln + Befehle + Tabelle „Stichwort → System-Datei → Haupt-Code-Dateien“. Manifest/Handbuch für Menschen bleibt, KIs lesen es nie.
3. **Code ist die Doku**: Kopfkommentar jeder Datei = 5–10 Zeilen „Wofür, Ein-/Ausgänge, Fallen“. Ein Skript `npm run ki:karte` erzeugt daraus automatisch `ki/dateikarte.md` (nie veraltet).
4. **Große Dateien teilen**: `renderer.js` → `licht.js`, `figurenDarstellung.js`, `kamera.js`, `himmelUndWetter.js` …; `clientSpiel.js` → `interaktion.js`, `vorhersage.js`, `oberflaeche.js`. Ziel ≤ 800 Zeilen je Datei → gezieltes Lesen.
5. **Generatoren als einzige Quelle**: Übergänge/Ankünfte aller Zonen in **einer** Datei `server/spiel/karten/weltNetz.js` (Zone ↔ Zone, Rand, Ankunft); Lader hängt sie an. Dann nie wieder „in .py UND .js eintragen“.
6. **Rezept-Dateien für häufige Aufträge**: `ki/rezepte/neue-zone.md`, `neues-modell.md`, `neue-aktion-mit-touch.md`, `neuer-sound.md` – Checkliste mit Befehlen und Testnamen (5–15 Zeilen). Spart das Zusammensuchen.
7. **Prüf-Skripte bündeln**: `npm run screens -- --zone lager --zeit 20 --sitzen` (Playwright: Singleplayer → Zone → Kamera/Seitenansicht → PNG). Die Hilfsskripte dieser Runde (Übersicht, Seitenansicht beim Sitzen) gehören ins Repo statt jedes Mal neu geschrieben.
8. **Ein-Befehl-Check**: `npm run fertig` = Tests + `ki:anleitung` + Format/Lint + Rauchtest-Kurzform → eine Zeile Ergebnis.

### Vorgeschlagene Reihenfolge
B7 + B8 (sofort spürbar) → A1 (Worker) → B1/B2 (Doku nach Systemen) → A2 + A3 (Instancing, Assets) → B4 (Dateien teilen) → A6/A7 (Raster, Flussfeld).

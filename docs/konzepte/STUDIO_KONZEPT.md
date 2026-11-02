# Konzept: „Browser Survival Studio“ – lokales Bearbeitungsprogramm

Stand 2026-11-01 · Status: **Phase 1 (Karten) umgesetzt** – Anleitung `studio/LIESMICH.md`, Umsetzungsstand §13 · **Phase 3 (Modell-Werkstatt) und Phase 2 (Audio-Zentrale) umgesetzt – Konzept vollständig** – Plan §14/§15 (Reihenfolge: Nutzer-Entscheidung 2026-11-01)

> Ein eigenständiges Programm, das lokal läuft, das Spiel kennt und Karten, Audio und Modelle bearbeitet –
> professionell wie Unity/Godot, aber so einfach, dass Neue ohne Vorwissen mitbauen können.
> Arbeitstitel: **Browser Survival Studio** (Alternative: „Browser Survival Editor“).

---

## 1. Ziele & Leitlinien

| # | Ziel | Woran man's merkt |
|---|---|---|
| Z1 | **Schnell** – auch bei großen Zonen flüssig | 60 FPS beim Kamerafahren auf 1500×1500 Kacheln, Undo < 50 ms |
| Z2 | **Professionell** – wirkt wie ein echtes Programm | eigenes Fenster, dunkles Theme, einheitliche Linien-Icons, Andock-Panels, kein Emoji-Look |
| Z3 | **Einfach** – Neue finden sich zurecht | Willkommensbildschirm, Tooltips mit Kürzel, „Was ist das?“-Hilfe, sinnvolle Standardwerte |
| Z4 | **Spieltreu** – was man sieht, ist was das Spiel macht | dieselben Regeln (`gemeinsam/`, `server/spiel/`), Testlauf mit echter Spiel-Engine |
| Z5 | **KI-fähig** – Claude & Co. können direkt mitarbeiten | eingebauter MCP-Server + optional API-Schlüssel |
| Z6 | **Nichts geht kaputt** | Undo für alles, Autosave, Versionen, Prüfung vor dem Export |

**Bewusst einfach halten:** lieber wenige Werkzeuge, die perfekt sitzen, als 40 halbe. Ausbau später.

---

## 2. Technik-Entscheidung

### Empfehlung: **Electron** (Desktop-Hülle um Chromium + Node)

| Option | + | − | Urteil |
|---|---|---|---|
| **Electron** | Gleiche Sprache (JS/ESM), Three.js + `gemeinsam/` + `server/spiel/` direkt nutzbar, voller Dateizugriff, Node im Hintergrund (für MCP, Spiel-Testserver), `.exe`-Installer möglich | ~100 MB Download | ✅ **passt am besten** |
| Tauri | klein, schnell | Rust-Werkzeugkette, zweite Sprache, WebView je nach System unterschiedlich | ❌ zu viel Neues |
| Godot/Unity | echte Engine | alles neu schreiben, Spiellogik doppelt → Spieltreue (Z4) futsch | ❌ |
| Weiter nur Browser | nichts Neues | genau das bremst gerade | ❌ |

Kein Build-Schritt für den Code (Electron lädt ES-Module direkt). Nur zum **Verteilen** gibt es optional einen
Paket-Befehl (`npm run studio:paket` → Windows-Installer). Starten im Repo: `npm run studio`.

### Ehrlich: Warum wird es schneller?
Electron ist auch Chromium – **die Hülle allein macht nichts schneller.** Schneller wird es durch die Architektur:

1. **Echte Dateien statt IndexedDB** – kein Serialisieren riesiger Entwürfe in den Browser-Speicher.
2. **Sektoren (64×64 Kacheln)** mit Instancing – nur geänderte Sektoren werden neu gebaut, nie die ganze Karte.
3. **Undo als Befehle (Diffs)** statt Kopien des ganzen Zustands.
4. **Schwere Arbeit im Hintergrund** (Worker/Node-Prozess): Prüfung, Loot-Vorschau, Export, Vorschaubilder.
5. **Kein DOM-Overhead pro Kachel** – UI nur für Panels, Karte komplett in WebGL (2D-Ansicht = orthografische Kamera).

---

## 3. Architektur

```
┌─────────────────────────── Electron-Fenster (Renderer) ───────────────────────────┐
│  UI-Shell (Panels, Menüs, Icons)   ·   Viewport (Three.js: 3D + 2D-Draufsicht)    │
│                         ▲  ruft nur Befehle auf, nie direkt Daten ändern           │
│                ┌────────┴─────────┐                                                │
│                │  BEFEHLSSCHICHT  │ ← ein Befehl = Name + Parameter + Undo         │
│                └────────┬─────────┘   (UI, Tastenkürzel, KI und MCP nutzen DENSELBEN Weg)
│                    Dokument-Modell (Zonen, Objekte, Klänge, Vorlagen)              │
└────────────────────────┬──────────────────────────────────────────────────────────┘
                         │ IPC
┌────────────────────────┴──────────── Hauptprozess (Node) ─────────────────────────┐
│ Projekt-Dateien · Asset-Import + Credits · Export ins Spiel · MCP-Server (localhost)│
│ Test-Spielserver (echte SpielWelt aus server/spiel/) · KI-API-Anbindung            │
└────────────────────────────────────────────────────────────────────────────────────┘
```

**Kernidee Befehlsschicht:** Jede Änderung ist ein Befehl wie `objekt.platzieren {typ, x, y, drehung, skalierung}`.
Dadurch bekommen wir *gratis*: Undo/Redo, Makros, Befehlspalette (Strg+K), Protokoll – und **die KI kann exakt das
Gleiche wie ein Mensch**, nicht mehr und nicht weniger.

**Wiederverwendung:** `editor/kern/` ist zu 47 von 49 Dateien DOM-frei → zieht weitgehend um (Validierung, Auto-Fix,
Wand, Terrain, Loot, Prefabs, Versionen, KI-Anleitung …). Neu geschrieben werden UI und Viewport.

**Ordner im Repo:**
```
studio/
  main/        Hauptprozess (Fenster, Dateien, Export, MCP, Testserver)
  oberflaeche/ UI-Shell, Panels, Icons (SVG), Theme
  ansicht/     Viewport, Kamera, Gizmos, Sektor-Renderer
  befehle/     Befehlsschicht + alle Befehle
  dokument/    Datenmodell (aus editor/kern übernommen/erweitert)
  mcp/         MCP-Server (Werkzeug-Definitionen)
```
Spiellogik bleibt in `server/spiel/` (Regel 5) – das Studio **importiert** sie nur.

---

## 4. Projektordner & Assets

- Beim ersten Start: **Spielordner wählen** (Standard = das Repo). Pfad ist später in den Einstellungen änderbar.
- Das Studio liest direkt: `server/spiel/karten/` (Zonen), `client/assets/` (Modelle/Texturen), `client/audio/`, `client/musik/`,
  Item-/Kachel-Definitionen aus `gemeinsam/` und `server/spiel/konfiguration/`.
- **Import neuer Assets** (Modell/Textur/Sound) per Ziehen ins Fenster → Dialog:
  - Name, Kategorie, Tags · Maße (bei Modellen: Vorschau + Grundfläche in Kacheln)
  - **Credits**: Urheber, Quelle (URL), Lizenz (Auswahl CC0 / CC-BY / eigene) → wird automatisch in
    `client/assets/eigene/credits.json` eingetragen (Credits-Dialog im Spiel bleibt, Regel 6)
  - Datei landet automatisch im richtigen Ordner (`client/assets/eigene/`, `client/audio/eigene/` …), Indizes
    (`npm run sounds`, `eigene:index`, `ki:anleitung`) laufen im Hintergrund mit.
- Warnung (nicht Sperre) bei fehlender Lizenz – wie heute.

---

## 5. Oberfläche

### 5.1 Startbildschirm
```
┌──────────────────────────────────────────────────────────────┐
│  BROWSER SURVIVAL STUDIO                          v0.1       │
│                                                              │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐                │
│  │  ▦ Karten  │ │  ♪ Audio   │ │  ◇ Modelle │                │
│  │ bearbeiten │ │  Zentrale  │ │  Werkstatt │                │
│  └────────────┘ └────────────┘ └────────────┘                │
│                   (Phase 2)      (Phase 3)                   │
│  Zuletzt geöffnet:  Stadtrand · Waldweg · Schneeland         │
│  Spielordner: C:\…\browser_survival   [Ändern]               │
└──────────────────────────────────────────────────────────────┘
```

### 5.2 Kartenbearbeitung (Hauptfenster)
```
┌ Datei  Bearbeiten  Ansicht  Zone  Werkzeuge  KI  Hilfe ─────────── [▶ Testen] ┐
├ [Auswählen][Bewegen][Drehen][Skalieren] │ [Boden][Wand][Objekt][Fläche][Klang] ┤
├──────────────┬──────────────────────────────────────────────┬────────────────┤
│ ZONEN        │                                              │ EIGENSCHAFTEN  │
│ ● Stadtrand  │                                              │ Baum (groß)    │
│ ○ Waldweg    │            3D-VIEWPORT                       │ Position 12/40 │
│ ○ Schneeland │      (Umschalten 3D ⇄ 2D: Taste Tab)         │ Drehung  35°   │
│ + Neue Zone  │                                              │ Größe   1,4×   │
│──────────────│                                              │ Kollision ☑    │
│ SZENE        │                                              │ Klang: Rauschen│
│ ▸ Boden      │                                              │                │
│ ▸ Wände      │                                              │                │
│ ▸ Objekte    │                                              │                │
│ ▸ Flächen    │                                              │                │
│ ▸ Klänge     │                                              │                │
├──────────────┴──────────────────────────────────────────────┴────────────────┤
│ ASSETS  [Suche…]  Böden · Wände · Natur · Möbel · Items · Vorlagen · Klänge  │
│ [▣][▣][▣][▣][▣][▣][▣][▣]  (Vorschaubilder, per Ziehen in die Szene)          │
├──────────────────────────────────────────────────────────────────────────────┤
│ Prüfung: ✔ 0 Fehler · ⚠ 2 Hinweise │ Kachel 112/58 │ Autosave vor 12 s │ KI ● │
└──────────────────────────────────────────────────────────────────────────────┘
```
- Panels andockbar/einklappbar, Layout wird gespeichert.
- **Design:** dunkles Theme (Graphit + ein Akzent, z. B. Signal-Orange), **ein** Icon-Satz (Linien-Icons, SVG, z. B. Lucide/Tabler –
  MIT-/ISC-Lizenz, in Credits), keine Emojis in der Oberfläche.
- **Einsteiger-Hilfen:** Hover-Tooltips mit Kürzel, kurze „Erste Schritte“-Tour (abschaltbar), leere Zustände mit Hinweis
  („Noch keine Klänge – zieh eine Datei hier rein“).

---

## 6. Phase 1 – Kartenbearbeitung (Fokus)

### 6.1 Zonen
- Linke Liste: **alle Zonen des Spiels** (aus `server/spiel/karten/`) + eigene Entwürfe. Klick = öffnen.
- **Mehrere Zonen nebeneinander** laden (wie Weltkarte): inaktive Zonen ausgegraut, aktive bearbeitbar.
  Baut auf `editor/kern/weltLayout.js`/`zonenVerbund.js` auf.
- Neue Zone: Assistent (Name, Größe, Grundboden, Biom-Vorlage: Wald/Stadt/Schnee/leer).
- **Übergänge/Teleports:** Fläche markieren → „Ziel: Zone ▾ + Ankunftspunkt“. Im Viewport als farbiger Rahmen mit
  Beschriftung „→ Waldweg“; Doppelklick springt zur Zielzone und zeigt den Ankunftspunkt. (Später: Schleusen-Gestaltung.)

### 6.2 Werkzeuge (bewusst knapp)
| Werkzeug | Kürzel | Was |
|---|---|---|
| Auswählen | Q | Klick, Rahmen, Umschalt = hinzufügen |
| Bewegen / Drehen / Skalieren | W / E / R | 3D-Gizmo wie Unity; Raster-Einrasten an/aus (Strg hält aus) |
| Boden malen | B | Pinsel/Rechteck/Füllen, Pinselgröße mit `[` `]` |
| Wand ziehen | N | Linie ziehen, Türen/Fenster per Klick in die Wand |
| Gelände | T | heben/senken/glätten (vorhandenes Terrain-System) |
| Objekt platzieren | O | aus Asset-Leiste; Vorschau-Geist, Kollision rot/grün |
| Fläche markieren | F | Rechteck/Polygon → Typ: Raum · Loot-Zone · Zombie-Spawn · Tierbereich · Übergang · Klangzone |
| Klang setzen | K | Punkt- oder Flächenklang (siehe 6.6) |
| Messen | M | Maßband (vorhanden) |

### 6.3 Größe einzelner Objekte (Skalieren) 🎮
- Neues Feld je Objekt: `skalierung` (0,25×–4×), optional getrennt Breite/Höhe/Tiefe (Standard: gleichmäßig).
- **Kollision** passt sich an: Grundfläche wird mitskaliert und auf Kacheln gerundet (großer Baum blockiert 2×2 statt 1×1).
- Spiel-Seite: Lader + Darstellung (`kartenModell.js`, eigene Modelle) lesen das Feld; ohne Feld = 1 (abwärtskompatibel).
- Zufalls-Knopf „Variieren“: markierte Bäume bekommen leicht unterschiedliche Größe/Drehung → natürlicher Wald.

### 6.4 Items auf Möbel legen („Draufstellen“) 🎮
- Beim Platzieren eines Items über einem Möbel (Tisch, Regal, Theke) **rastet es auf dessen Oberfläche ein** (Höhe aus der
  Modell-Bounding-Box bzw. einem Feld `ablageHoehe` am Typ; Regale mit mehreren Böden → mehrere Höhen).
- Gespeichert als `hoehe` (rein optisch). Spiel-Logik bleibt 2D: Aufheben wie gewohnt über die Kachel.

### 6.5 Item-Spawnpunkte mit Wahrscheinlichkeit 🎮
Neuer Objekttyp **Spawnpunkt** (ein Item oder eine Loot-Tabelle an genau einer Stelle):

| Feld | Bedeutung | Beispiel |
|---|---|---|
| `inhalt` | Item-ID oder Loot-Vorlage | `konserve` / `spiel:kueche` |
| `chance` | Wahrscheinlichkeit pro Versuch in % | 35 |
| `intervall` | alle wie viele Minuten (Spielzeit/Echtzeit, s. Rückfrage) ein neuer Versuch | 10 |
| `menge` | min–max | 1–2 |
| `max` | höchstens so viele gleichzeitig liegen lassen | 1 |
| `hoehe` | optisch auf Möbel (6.4) | 0,9 |

Ablauf im Spiel: Alle `intervall` Minuten prüft der Server jeden leeren Punkt → würfelt `chance` → legt ggf. das Item hin.
Liegt schon was da (oder `max` erreicht), passiert nichts. Baut auf `lootZonen.js` (Chance/Respawn-Logik vorhanden) auf.
Im Editor: Punkt zeigt Item-Vorschau + Prozent-Schild; Ansicht „Loot-Dichte“ (Heatmap) bleibt.

### 6.6 Klänge direkt in der Karte (Brücke zu Phase 2)
Schon in Phase 1, mit dem vorhandenen Klanglandschaft-Format (`gemeinsam/audio/klanglandschaft.js`):
- **Klangzone** (Fläche): Musik oder Ambiente (z. B. Wald-Vögel, Höhlen-Hall) mit Lautstärke + weichem Übergangsrand.
- **Punktklang** (Radius): Lagerfeuer-Knistern, Generator-Brummen.
- **Klang am Objekt:** an ein Objekt hängen → wandert mit, wird mitkopiert (z. B. jeder Brunnen plätschert).
- Lautstärke, Radius, Loop/Intervall direkt im Eigenschaften-Panel; ▶-Vorhören im Viewport (mit echtem Ton, abhängig
  von Kameraposition).

### 6.7 Vorlagen bauen (Prefab-Editor)
- „Neue Vorlage“ öffnet eine **leere Mini-Szene** mit denselben Werkzeugen (Boden, Wände, Möbel, Items, Klänge, Spawnpunkte).
- Speichern → erscheint in der Asset-Leiste unter „Vorlagen“ mit Vorschaubild; per Ziehen in jede Zone.
- **Verknüpft:** Vorlage ändern → Frage „Alle 7 Häuser aktualisieren?“. Einzelne Instanz lösbar („entkoppeln“).
- Baut auf vorhandenen Prefabs (`editor/kern/prefabs.js`, `bibliothekVorlagen.js`) auf.

### 6.8 Testen
- **▶ Testen** (F5): startet die echte Spiel-Engine lokal (Testserver im Hauptprozess, `server/spiel/`) mit der aktuellen
  Zone, in einem Spiel-Fenster oder direkt im Viewport. Spawn an der Kameraposition. Esc = zurück, Änderungen bleiben.
- Debug-Overlays wie heute (Zeitlupe, Pfade, Spawns, Loot-Timer) – `server/spiel/debugAnsicht.js` ist schon da.

### 6.9 Sicherheit & Export
- Autosave (alle 30 s, im Projektordner `.studio/autosave/`), Versionen + Diff (vorhanden: `versionen.js`).
- **Prüfung** live in der Statusleiste (vorhanden: `validierung.js` + Auto-Fix).
- **Ins Spiel übernehmen:** schreibt `server/spiel/karten/<id>.js` + Assets direkt (Ablauf von `npm run karte:editor`), aktualisiert
  `KI_KARTEN_ANLEITUNG.md`, zeigt danach „`npm test` ausführen?“ mit Ergebnis. Commit macht weiterhin der Mensch/die KI.
- Export/Import als `.karte.json` (gleiches Format wie heute → alter Browser-Editor bleibt kompatibel).

---

## 7. KI-Anbindung

### 7.1 Geht MCP? – **Ja.**
MCP (Model Context Protocol) ist genau dafür gebaut: Ein Programm bietet „Werkzeuge“ an, eine KI ruft sie auf.
Claude Desktop, Claude Code, Cursor, VS Code u. a. können lokale MCP-Server einbinden. Es wird nichts Besonderes
gebraucht außer dem offiziellen MCP-SDK (`@modelcontextprotocol/sdk`, MIT) im Hauptprozess.

**Aufbau:**
- Das Studio startet beim Öffnen einen MCP-Server auf `127.0.0.1` (Streamable HTTP, nur lokal, mit Zugangs-Token).
- Für Clients, die nur stdio können: kleines Brückenskript `npm run studio:mcp` (verbindet sich mit dem laufenden Studio).
- Menü **KI → Mit Claude verbinden** zeigt den fertigen Konfig-Schnipsel zum Kopieren (Claude Desktop / Claude Code).

**Werkzeuge (Auszug) – alle laufen durch die Befehlsschicht → Undo-fähig, live sichtbar:**
| Werkzeug | Zweck |
|---|---|
| `zonen_liste`, `zone_lesen`, `zone_oeffnen` | Überblick, Kartenausschnitt als Text/JSON |
| `katalog` | alle Kacheln, Objekte, Items, Vorlagen, Klänge |
| `boden_malen`, `wand_ziehen`, `objekt_platzieren`, `objekt_aendern`, `loeschen` | Bauen |
| `flaeche_markieren`, `spawnpunkt_setzen`, `klang_setzen`, `vorlage_einsetzen` | Logik & Atmosphäre |
| `pruefen` | Fehlerliste (Validierung) |
| `ansicht_bild` | Screenshot des Viewports → die KI **sieht**, was sie gebaut hat |
| `rueckgaengig` | eigene Schritte zurücknehmen |

**Schutz:** KI-Änderungen landen als eigene Undo-Gruppe („KI: Dorf gebaut“) und sind in der Szene kurz markiert.
Optional „Nur Vorschlag“-Modus: Änderungen erst nach Klick auf „Übernehmen“. Dateien außerhalb des Projekts: kein Zugriff.

### 7.2 Eingebauter Assistent (API-Schlüssel) – zusätzlich
- Chat-Panel im Studio; Anbieter wählbar (Claude, Gemini – wie heute –, OpenAI-kompatibel). Schlüssel lokal verschlüsselt
  (Electron `safeStorage`).
- Nutzt **dieselben Werkzeuge** wie MCP → eine Werkzeugliste, zwei Wege. Beispiel: „Bau mir eine Tankstelle mit 3 Zombies
  und Loot hinter der Theke.“

---

## 8. Phase 2 – Audio-Zentrale (Ausblick)
- Bibliothek aller Sounds/Musik mit Wellenform, Suche, Tags.
- **Schneiden** (Start/Ende, Fades, Normalisieren), Ausschnitte als neue Datei, Lautstärke/Streuung/Verzögerung
  (vorhandene `einstellungen.json`-Felder). Dekodieren direkt im Programm (kein Browser-Umweg mehr nötig).
- Zuordnung zu **Ereignissen** (Schritte je Untergrund, Waffen, Tiere), **Modellen** und **Zonen/Flächen**.
- **Umgebung/Environment:** Regen, Wind, Nacht, Gewitter – Schichten mit Pegeln je Wetterlage und Zone, live vorhörbar.
- Musik je Bereich/Zone mit Überblendung.

## 9. Phase 3 – Modell-Werkstatt (Ausblick)
- „Blender in einfach“: Modell importieren, Maße/Ursprung/Ausrichtung korrigieren, Grundfläche + Kollision festlegen,
  Farben/Texturen tauschen, einfache Teile (Kiste, Zylinder) zusammensetzen, Leerlauf-Animation, Vorschaubild.
- Baut auf vorhandener Werkstatt (`editor/kern/werkstatt.js`, Malen, Animation) auf.

---

## 10. Umsetzungsplan Phase 1 (Meilensteine)

| # | Meilenstein | Ergebnis | Größe |
|---|---|---|---|
| 1.0 | **Grundgerüst** | Electron-Fenster, Startbildschirm, Theme + Icons, Spielordner wählen, Befehlsschicht + Undo | M |
| 1.1 | **Viewport** | Sektor-Renderer, 3D-Kamera (Fliegen/Orbit), 2D-Draufsicht, Raster, Zone laden (nur ansehen) | L |
| 1.2 | **Bauen** | Auswählen/Bewegen/Drehen/Skalieren (Gizmo), Boden, Wände, Objekte, Asset-Leiste, Eigenschaften | L |
| 1.3 | **Flächen & Logik** | Räume, Loot-Zonen, Zombie-/Tierbereiche, Übergänge mit Zielzone, Spawnpunkte (🎮 Spiel-Teil) | M |
| 1.4 | **Spiel-Erweiterungen** 🎮 | `skalierung`, `hoehe` (Draufstellen), Spawnpunkt-System im Server + Tests | M |
| 1.5 | **Klänge in der Karte** | Klangzonen/Punktklänge/Klang am Objekt, Vorhören | S |
| 1.6 | **Vorlagen-Editor** | Mini-Szene, speichern, verknüpfte Instanzen | M |
| 1.7 | **Testen & Export** | Testserver, Prüfung live, „Ins Spiel übernehmen“, Autosave/Versionen | M |
| 1.8 | **Import & Credits** | Assets reinziehen, Credits-Dialog, automatische Ablage + Indizes | S |
| 1.9 | **KI** | MCP-Server + Werkzeuge + Screenshot, danach API-Assistent | M |
| 1.10 | **Feinschliff** | Erste-Schritte-Tour, Tastenkürzel-Übersicht, Installer, Doku (LIESMICH, KI_INDEX, Manifest) | S |

Jeder Meilenstein: `npm test` grün, eigener Rauchtest (Playwright kann Electron steuern), Doku nachgezogen, Commit + Push.

---

## 11. Risiken & offene Punkte
- **Touch:** Ein Desktop-Programm ist Maus/Tastatur-first. Der alte Browser-Editor bleibt für Handy/Tablet erhalten (Regel 7).
- **Zwei Editoren pflegen** kostet. Vorschlag: alter Editor wird eingefroren (nur noch Fehlerbehebungen), Kernlogik liegt einmal.
- **Spiel-Änderungen** (Skalierung, Höhe, Spawnpunkte) sind 🎮 → Protokoll/Lader/Darstellung + Tests, abwärtskompatibel.
- **Electron-Größe:** ~100 MB, nur als devDependency; GitHub Pages liefert das Spiel unverändert aus.
- MCP-Server nur auf `127.0.0.1` + Token, damit keine fremde Webseite/Netzwerk-Gerät mitbaut.

---

## 12. Entscheidungen (Nutzer, 2026-11-01)
1. Name: **Browser Survival Studio**.
2. Erst nur **Desktop** (alter Browser-Editor bleibt für Handy/Tablet).
3. **Windows + Linux** (macOS läuft mit, ungetestet).
4. Spawn-Intervall in **Echtzeit**.
5. Skalierte Modelle **nehmen mehr Platz ein** (Grundfläche/Kollision wächst mit).
6. Erst **einzelne Zonen** (kein Bauen über Zonengrenzen).
7. KI: erst **MCP**, dann **API-Assistent**; Anbieter Claude, Gemini, OpenAI, Grok, DeepSeek.
8. Mitbauende arbeiten **im Repo** (kein Installer nötig).

## 13. Umsetzungsstand Phase 1 (2026-11-01)

| # | Meilenstein | Stand |
|---|---|---|
| 1.0 | Grundgerüst | ✅ `studio/main/start.mjs` (Electron), Startbildschirm, Theme + eigene Icons, Spielordner wählbar, Befehlsschicht `kern/befehle.js` + Dokument/Undo `kern/dokument.js` |
| 1.1 | Viewport | ✅ `ansicht/viewport.js`: Sektoren 32×32 (Boden-Textur + Höhen), Wände instanziert, Objekte instanziert/echte .glb, 3D-Orbit/Fliegen + 2D-Draufsicht |
| 1.2 | Bauen | ✅ `ansicht/werkzeuge.js`: Auswahl/Bewegen/Drehen/Größe (Gizmo), Boden, Wand, Raum, Gelände, Objekt; Assets, Inspektor, Szene-Baum |
| 1.3 | Flächen & Logik | ✅ Loot-Zonen, Hasen, Übergänge (Ziel-Beschriftung, „Zur Zielzone springen“), Punkte, Räume |
| 1.4 | Spiel-Erweiterungen 🎮 | ✅ `objekte[].skalierung`, `spawnpunkte` (`server/spiel/karten/spawnpunkte.js`, lootSystem), Item-`hoehe` (Netz + Renderer) |
| 1.5 | Klänge | ✅ Punktklang, Klangzone, Klang am Objekt (wird beim Export zum Punktklang) |
| 1.6 | Vorlagen | ✅ Vorlagen-Szene, aus Auswahl, bearbeiten/löschen (`studio/vorlagen/`); ⏳ verknüpfte Instanzen |
| 1.7 | Testen & Export | ✅ Testlauf im echten Spiel (eigenes Fenster), Prüfung live, Ins Spiel, Autosave/Entwürfe |
| 1.8 | Import & Credits | ✅ Modelle (.glb + Vorschau + index.json + credits.json), Klänge je Zone |
| 1.9 | KI | ✅ MCP (Streamable HTTP + stdio-Brücke, 24 Werkzeuge), Assistent mit 5 Anbietern (Attrappen-getestet) |
| 1.10 | Feinschliff | ✅ Befehlspalette, Tooltips, Tastenkürzel-Hilfe, Startskripte, Doku; ⏳ Installer (nicht nötig, Repo) |

| 1.11 | Spiel-Optik & Stimmung | ✅ `ansicht/spielOptik.js` (echtes `KartenModell` im Editor), `ansicht/stimmung.js` (Tag/Abend/Nacht + Lampenlicht, Nebel/Regen/Schnee) |
| 1.12 | Bau-Hilfen | ✅ `kern/bauhilfen.js`: Streuen/Radieren (S), Straße (L), Ersetzen, Generator Wald/Dorf |
| 1.13 | Vorlagen & Überblick | ✅ verknüpfte Vorlagen (alle Kopien aktualisieren), Weltkarte, Versionen + Vergleich, Notiz-Pins (Z) |
| 1.14 | Prüfen | ✅ `kern/analyse.js`: Laufweg (eingesperrte Flächen rot), Balance aller Zonen, Loot-Heatmap, Laufmodus (F6) |
| 1.15 | Komfort | ✅ Messen (M), Ebenen ein-/ausblenden + sperren, Hilfslinien + Einrasten, Zuletzt-Reiter |
| 1.16 | Item-Editor & Zombie-Bereiche 🎮 | ✅ `oberflaeche/itemEditor.js` → `server/spiel/konfiguration/studioDaten.js`; `zombieBereiche` (Mischung, Tageszeit, Route) in Lader/SpielWelt/zombieSystem |

Tests: `tests/studio.test.js` (Aktionen, Bau-Hilfen, Analysen, Dokument, Projekt-Dateien, MCP, KI-Schleifen), `tests/spawnpunkte.test.js`, `tests/zombieBereiche.test.js`,
Rauchtest `npm run rauchtest:studio` (Electron + Playwright, inkl. Testlauf-Fenster und MCP von außen).

## 14. Umsetzungsplan Phase 3 – Modell-Werkstatt (vor Phase 2, Nutzer-Entscheidung)

Ziel: Modelle so sehen, wie das Spiel sie zeigt, und ohne Blender anpassen. Arbeitet direkt auf den Dateien im Spielordner
(`client/assets/eigene/<stem>.glb` + `index.json` + `vorschau/` + `credits.json`) – keine Browser-Bibliothek wie im alten Editor.

| # | Meilenstein | Ergebnis | Stand |
|---|---|---|---|
| 3.1 | **Echte Items & Bauwerke in der Ansicht** | Spawnpunkte mit festem Item zeigen das echte Item-Modell (`client/darstellung/itemModelle.js`), Bauwerke (Kamin, Sofa, Werkbank, Holzwand …) das echte Spiel-Modell; **Loot-Vorschau** (`Umschalt+V`): Beispiel-Items an allen Loot-Punkten, gewürfelt mit den Spiel-Regeln (`studio/kern/lootVorschau.js`), „neu würfeln“ | ✅ |
| 3.2 | **Werkstatt-Arbeitsbereich** | Startbild-Kachel aktiv, eigener Bereich: Bibliothek aller Modelle (Vorschaubild, Suche, Bereiche, „benutzt in Zonen“), Bühne (Orbit, Raster 1 m = 1 Kachel, Licht, Spielfigur zum Größenvergleich), Infos (Maße, Dreiecke, Datei, Lizenz) | ✅ |
| 3.3 | **Maße, Ursprung, Ausrichtung, Grundfläche & Kollision** | Höhe im Spiel, auf den Boden, Drehpunkt unten mittig, 90°-Drehen/Spiegeln, Teile mit Gizmo + Zahlenfeldern; Fußabdruck (Kacheln) + Kollision an/aus + Ebene → `index.json` → `spielordnerTyp` (🎮 neue Objekte übernehmen es) | ✅ |
| 3.4 | **Farben & Texturen** | Material-Liste, Farbe/Rauheit/Metall, Textur ersetzen/entfernen, Farbton für das ganze Modell verschieben | ✅ |
| 3.5 | **Zusammensetzen** | Neues Modell aus Grundkörpern (Kiste, Zylinder, Kugel, Kegel, Keil, Ring), Teile duplizieren/löschen/umbenennen, anderes Modell als Teil einfügen | ✅ |
| 3.6 | **Leerlauf-Animation** | Drehen/Wippen/Pendeln/Pulsieren/Flackern (vorhandene Regeln `editor/kern/animation.js`), Vorschau, „im Spiel abspielen“ → `index.json leerlauf` → Typ `animation` (🎮) | ✅ |
| 3.7 | **Speichern & Vorschaubild** | GLB schreiben (alte Datei → `.studio/modelle/` gesichert), „als Kopie“, Vorschaubild neu, Index/Credits/KI-Anleitung nachziehen; KI-/MCP-Werkzeuge `modelle_liste`, `modell_info`, `modell_einstellen` | ✅ |

Umsetzung Phase 3: `studio/werkstatt/modellWerk.js` (Bühne, alle Bearbeitungen mit Undo), `studio/werkstatt/werkstatt.js`
(Arbeitsbereich), `studio/kern/modelle.js` (Regeln, getestet), `studio/kern/kiModelle.js` (16 KI-/MCP-Werkzeuge, dieselben
Methoden wie die Oberfläche), `Projekt.speichereModell/einstellenModell/modellSicherungen`. 🎮 `index.json`-Felder `blockiert`,
`ebene`, `fuss`, `leerlauf` → `editor/kern/spielordner.spielordnerTyp`. Nicht drin: Malen auf dem Modell, Knochen/Rigging
(gibt es im alten Browser-Editor). Tests `tests/studioModelle.test.js`, Rauchtest-Abschnitt „Phase 3“.

## 15. Umsetzungsplan Phase 2 – Audio-Zentrale (nach Phase 3)

| # | Meilenstein | Ergebnis | Stand |
|---|---|---|---|
| 2.1 | **Bibliothek** | alle Sounds/Musik (`client/audio/eigene`, `audio/karten`, `musik`) mit Wellenform, Dauer, Suche, Ordner/Tags, Vorhören, Verwendung (Ereignis/Zone) | ✅ |
| 2.2 | **Schneiden** | Start/Ende, Ein-/Ausblenden, Normalisieren, Lautstärke; Ausschnitt als neue Datei (WAV/OGG) – Dekodieren im Programm, kein Browser-Umweg | ✅ |
| 2.3 | **Ereignisse** | Zuordnung Sounds ↔ Spiel-Ereignisse (Schritte je Untergrund, Waffen, Tiere …) mit Lautstärke/Streuung/Verzögerung (`einstellungen.json`) | ✅ |
| 2.4 | **Umgebung & Wetter** | Schichten (Regen, Wind, Nacht, Gewitter …) mit Pegel je Wetterlage und Zone, live vorhörbar | ✅ |
| 2.5 | **Musik je Zone/Bereich** | Musik je Zone und Fläche mit Überblendung (Klanglandschaft), Vorhören | ✅ |

Umsetzung Phase 2: `studio/audio/audioWerk.js` (Dekodieren, Analyse, Wellenform, Schnitt über `editor/kern/audioSchnitt.js`,
Opus-Kodierung `editor/ui/audioKodierer.js`, Mischpult mit dem echten `client/audio/sound.js`), `studio/audio/audioZentrale.js`
(Arbeitsbereich), `studio/kern/audio.js` (Mischpult/Pfade, getestet), `studio/kern/kiAudio.js` (11 KI-/MCP-Werkzeuge),
`Projekt.schreibeAudio/kopiereAudio/loescheAudio/speichereAudioEinstellungen`. 🎮 Spiel: Umgebungs-Regel nach
`gemeinsam/audio/umgebung.js` gezogen (Spiel + Mischpult rechnen gleich), Pegel-Faktor je Zone (`einstellungen.json zonen` →
`Sound.setzeZone`), Musik-Überblendung/Pause je Ordner (`client/musik/einstellungen.json` → `zonenMusik.js`).
Tests `tests/studioAudio.test.js`, Rauchtest-Abschnitt „Phase 2“.

## 16. Phase 4 – Nutzer-Feedback 2026-11-02 (Reihenfolge = Umsetzung)

| # | Punkt | Stand |
|---|---|---|
| 4.1 | Spiel: Keuchen raus; Auto-Lenkung weicher (~5 % Trägheit), auf Eis weniger Grip, Baum bremst mind. so stark wie Laterne, Laterne härter | ✅ |
| 4.2 | Boden-Pinsel: Vorschau = gemalte Fläche, Pinselgröße 1×1 … n×n in der Optionsleiste; Wände/Türen/Fenster beim Bodenmalen geschützt (Haus wird nicht „durchgeschnitten“) | ✅ |
| 4.3 | Gelände-Werkzeug in 3D sichtbar machen (Fehler) | ✅ |
| 4.4 | Echte Vorschaubilder für alle Bausteine (Gebäude, Möbel, Natur …), im Studio gerendert und zwischengespeichert | ✅ |
| 4.5 | Papierkorb mit automatischem Leeren nach 20 Tagen (Modelle, Audio, gelöschte Dateien) + Modelle in der Werkstatt richtig löschen | ✅ |
| 4.6 | Ein-Klick-Veröffentlichen: Tests → Commit → Push auf main (GitHub Pages) | ✅ |
| 4.7 | Vorschlagsmodus für KI-Änderungen: farbige Vorschau, einzelne Änderungen wegklicken, Rest übernehmen | ⏳ |
| 4.8 | KI-Werkzeuge für Items, Loot-Tabellen, Rezepte | ⏳ |
| 4.9 | Notizen als Auftragsliste: KI arbeitet offene Notizen ab (auch „beim nächsten Mal“) | ⏳ |
| 4.10 | Werkstatt: Knochen & Gelenke (anlegen, Ketten, binden, Skelett, Pose, eigene Keyframe-Animationen), Malen aufs Modell, Textur-Effekte (dunkler, Dreck, Blut, Rost, Moos) – alles auch für die KI; Testmodell mit eigener Animation | ⏳ |
| 4.11 | Asset-Suche: CC0-Modelle/Sounds im Internet suchen, importieren, Credits automatisch (Studio + KI) | ⏳ |
| 4.12 | Räume bearbeiten (anklicken → Wände/Boden/Tür ändern), mehr Wandarten | ⏳ |
| 4.13 | Weiche Übergänge zwischen Böden (kein Minecraft-Look) + neuer wilder Waldboden (Mischboden mit Pilzen) | ⏳ |
| 4.14 | MCP verständlicher (Dialog + Anleitung), Speicher-Status klarer | ⏳ |
| 4.15 | Spiel: mehr Survival, mehr Grusel, Ziele/Fortschritt („man will etwas erreichen“) | ⏳ |

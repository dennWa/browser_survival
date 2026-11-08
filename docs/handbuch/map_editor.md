# Map-Editor (Handbuch)

> 

## 8. Map-Editor (`editor/`, eigener Einstieg `editor/index.html`)

> Getrennt vom Spiel: liest Spielcode (Kacheln, Registries, Kartenlader), schreibt nie Repo-Dateien. Anleitung: `editor/LIESMICH.md`, KI-Kurzfassung: `KI_INDEX.md` §10.

| Phase | Stand |
|---|---|
| 0 Bestandsaufnahme | ✅ `editor/BESTANDSAUFNAHME.md` (alle Kacheln, Objekte, Bauwerke, Spawn-/Loot-/Wetterwerte) |
| 1 Einstieg & Hülle | ✅ Login → „🗺 Map-Editor“ (`client/index.html` `#login-editor`), Kopfleiste/Fläche/Bauleiste, Öffnen (Spielzone als Vorlage, Entwurf, Datei), Entwürfe in IndexedDB → localStorage → Arbeitsspeicher (Warnung) |
| 2 Zonen als Rechteck | ✅ Neu = Rechteck aufziehen (Rasen), Griffe/Dialog zum Vergrößern/Verkleinern mit Abschneide-Warnung, Name/ID/Größe im Panel |
| 3 Bauleiste & Kacheln | ✅ Kategorien → Bauleiste, Pinsel/Rechteck/Linie (Mauern rasten ein)/Füllen/Radierer, unbegrenztes Undo, Auswahl kopieren/ausschneiden/einfügen/löschen/verschieben |
| 4 Objekte | ✅ Katalog aus Spiel-Registries, Platzieren mit grün/rot, verschieben/löschen/duplizieren/Mehrfachauswahl, drehen 90° + frei, Eigenschaften-Panel |
| 5 Spawns/Loot/Tiere/Wetter | ✅ Start, Zombie-Spawns (nur draußen; Anzahl, Respawn, Horden-Punkt), Zonen-Dichte/Nacht-Tempo/Horde, Loot-Räume (Tabelle, Chance, Nachschub, Wahrscheinlichkeiten), Hasen-Bereiche, Wetter, Musik-Ordner – leer = globaler Standard (im Panel angezeigt). **Spiel wertet alles aus** (s. u.) |
| 6 Räume & Gebäude | ✅ Räume markieren (Rechteck / Füllen bis zu Wänden) mit Name + Loot-Tabelle, Reiter „Räume“, Innen/Außen-Anzeige (Welt.istInnen), Prefabs: eingebaut (Wohnhaus, Werkstatt, Hütte, Garten mit Zaun, Parkplatz) + eigene (lokal, als Datei), Einfügen hängt an der Maus (R dreht, stempelt den Bereich), Räume reisen mit (Buchstaben-Konflikte werden umbenannt) |
| 7 Zonen verbinden | ✅ Reiter „Zonen“: Weltkarte (Zonen ziehen/einrasten, Klick öffnet, Übergänge als Linien), Nachbarn, „Aus Übergängen anordnen“, **Übergänge vorschlagen** an gemeinsamen Kanten (Wege bevorzugt, Rückweg + Ankunft automatisch), Prüfung aller Zonen (Ziel, Ankunft nicht im Übergang, Rückweg), Nachbarzone als Ausschnitt am Rand |
| 8 Export/Import & KI | ✅ Ganze Karte als JSON (`format`, `formatVersion`, `_liesmich` + LIESMICH.txt mit Aktionsformat), **Ausschnitt** (markierter Bereich: „x 20–40, y 10–25“, ASCII mit Achsen, Belegungsraster, Objekte mit IDs, Spawns/Loot/Übergänge, Prüfsumme) als Text/JSON, **KI-Import** (Aktionsliste oder veränderter Ausschnitt) → Diff-Vorschau (neu/weg/geändert/ungültig mit Grund, farbig auf der Karte) → erst nach Bestätigung übernehmen (1 Verlaufsschritt); nur der markierte Bereich, Rest wird abgelehnt |
| 9 Testen im Spiel | ✅ „▶ Testen“: Prüfung (Start, Zombie im Haus, Übergänge, Objekte außerhalb …; Fehlerliste mit Koordinaten, Klick springt hin) → alle Projekt-Entwürfe nach localStorage `browserSurvival.editorTest` → `client/?editorTest=1` startet den Lokal-Server mit den Entwürfen als Zonen (`lokalerServer.setzeTestKarten`, Spielstände nur im Arbeitsspeicher), Auto-Login, Banner „⟵ Zurück zum Editor“ (`client/ui/editorTest.js`) → `editor/?vonTest=<id>` |
| 10 Texturen, 2D/3D, Terrain | ✅ **3D-Ansicht** (Taste 3, Spielperspektive/von oben, Terrain-Höhen, Bemalung, Objekte, Auswahl synchron mit 2D, Maus + Touch), **Bemalung** (Kategorie Farbe: Palette, Pinsel, Füllen, Entfernen → 2D, 3D **und Spiel**: `bemalung` → `bodenTextur.js`), Farbe/Textur je Objekt und je Typ, **eigene Objekttypen** (Name, Größe, Kollision, Ebene, Kategorie), **Bild → 3D** (Extrusion nach Alpha-Maske oder Billboard; KI-Umwandlung nur gekennzeichneter Platzhalter), **Grafik-Antrag** (`<id>.grafik.json` mit Pflicht-Lizenz CC0/CC-BY → `werkzeuge/assets/editor_grafiken/` → `baue_assets.py` prüft, packt Atlas, schreibt Credits fort), **Terrain** (heben/senken/glätten/ebnen mit Stärke; Entscheidung: Höhen nur Darstellung, steile Hänge = blockiert im Spiel) |
| **2.0** Umbau | 🚧 Plan `editor/ROADMAP.md` (Phasen 1–9). **Phase 1:** Fehlersuche (B1–B12), Befehlsregister, neues Layout (Menüleiste, Asset-Browser mit Suche/Favoriten, Optionsleiste, Inspektor/Ebenen/Prüfung rechts, KI-Leiste, Handy-Schubladen), Ebenen sperren/ausblenden, Kontextmenü, Alt-Pipette, Trackpad, Autosave-Anzeige, Komplett-Backup ✅ |
| 11 KI-Helfer (Gemini) | ✅ Reiter „🤖 Helfer“: eigener Gemini-API-Schlüssel (⚙, nur im Browser), Chat mit Kontext (markierter Bereich/Zone, Auswahl, Objekttypen), Schnellfragen (Beschreiben, Texturen, Dekorieren, Spawns), Änderungsvorschläge als Aktionsliste → „Änderungen prüfen“ → gleiche Vorschau wie KI-Import; neue KI-Aktionen `typtextur` (Farbe/Muster je Objekttyp) und `bemale` (Bodenfarbe). Code: `editor/kern/gemini.js`, `editor/ui/geminiUi.js` |

**Aufbau:**
```
editor/
├── index.html, editor.css, main.js   Einstieg + Verdrahtung (Kopfleiste, Tasten, Dialoge, Veröffentlichen)
├── LIESMICH.md                       Anleitung für Menschen  ·  BESTANDSAUFNAHME.md  Phase 0 (für KIs)
├── kern/   (umgebungsfrei, getestet in tests/editor*.test.js)
│   ├── karte.js        EditorKarte: Raster + Sammlungen, ALLE Änderungen als Operationen (anwenden → alt/neu)
│   ├── verlauf.js      Undo/Redo (JSON, im Entwurf gespeichert), Gruppen (Pinselstrich = 1 Schritt)
│   ├── format.js       Spielformat ⇄ Editor (ausDefinition/nachDefinition), Entwurf, Export (+Version, LIESMICH-Text)
│   ├── katalog.js      Bauleiste: Kacheln/Objekte/Bauwerke/Marker/Bereiche/Werkzeuge je Kategorie
│   ├── raster.js       Linie, Einrasten, Rechteck, Pinsel, Füllen, Rechteck-Zerlegung
│   ├── zone.js         neue Zone, Größe ändern (+ Abgeschnittenes)
│   ├── auswahl.js      Kopieren/Einfügen (stempelt, Räume reisen mit: raumZuordnung)/Löschen/Drehen von Bereichen (= Prefab-Vorlagen)
│   ├── prefabs.js      eingebaute Prefabs (als Mini-Karten im Spielformat), Prefab-Datei
│   ├── zonenVerbund.js gemeinsame Kanten (Weltanordnung), Übergangs-Vorschläge, Anordnung aus Übergängen
│   ├── ausschnitt.js   KI-Ausschnitt (Raster mit Achsen, Belegung, IDs, Prüfsumme, AKTIONEN_ANLEITUNG)
│   ├── gemini.js       Gemini-Helfer: Kontext/Anfrage/Antwort (fetch injizierbar)
│   ├── kiImport.js     KI-Antwort lesen (leseKiAntwort) → prüfen + Diff (pruefeAenderungen, auf Kopie simuliert)
│   ├── testlauf.js     testDaten (Projekt → { start, karten } für den Testmodus), TEST_SCHLUESSEL
│   └── bild3d.js       Bild → 3D: Alpha-Maske, Extrusion (reine Funktion)
│   ├── platzierung.js  grün/rot-Prüfung (Möbel-Kollision wie Spiel)
│   ├── validierung.js  Live-Prüfung über echten Lader + Welt (blockiert, innen, Erreichbarkeit, Übergänge)
│   ├── innen.js        innenRaster (Welt.istInnen), pruefWelt (lädt auch unfertige Karten)
│   ├── terrain.js      Höhen-Pinsel, Plateau, Rampe/Treppe, Bereichshöhe, Klippen (Regel aus gemeinsam/welt/gelaende.js)
│   └── veroeffentlichen.js  <id>.js im Kartenstil (alsJsModul) + KARTEN-Zeilen
│   ├── bearbeiten.js   verschieben/drehen/duplizieren der Auswahl (Rand- und Rasterregeln)          (Editor 2.0)
│   ├── ebenen.js       Ebenen (sichtbar/gesperrt), Zuordnung Operation → Ebene, Filter                 (Editor 2.0)
│   ├── wand.js         Wände am Stück ziehen (Einrasten, Raum-Umriss, Tür-Grenze, Ausrichtung)       (Editor 2.0)
│   ├── backup.js       Komplett-Backup (alle Entwürfe, Prefabs, Modelle, Einstellungen-Whitelist, ohne API-Schlüssel) (Editor 2.0)
│   ├── bibliothek.js   3D-Modell- + Audio-Bibliothek: Inhalts-ID, GLB lesen/bauen (.gltf→.glb), Audio-Signatur/Wellenform, Metadaten, asset→glb / audio→daten, Abhängigkeiten (Editor 2.0)
│   ├── werkstattKi.js  Werkstatt-KI: Kontext (nur Modell), Anfragen, strenge Prüfung von Farb-/Animationsvorschlägen (Editor 2.0, 5.4)
│   ├── animation.js    Werkstatt-Animationen: Drehen/Wippen/Pendeln/Pulsieren/Flackern als Keyframes (Editor 2.0, 5.3)
│   ├── malen.js        Werkstatt-Malen: Leinwandgröße, Pinsel-Zwischenpunkte (UV-Naht), Aufkleber-Maße (Editor 2.0, 5.2)
│   ├── werkstatt.js    Modell-Werkstatt: Undo-Schnappschüsse, Versionsname/-Meta, Boden/Drehpunkt, Typen umstellen (Editor 2.0, 5.1)
│   ├── lootZonenEditor.js Loot-Zonen im Editor: freie Kacheln, Punkt-Vorschau, Loot-Dichte (Editor 2.0, 6.2/6.4)
│   ├── anordnen.js     Mehrfachauswahl ausrichten/verteilen/spiegeln (Editor 2.0, 7.2)
│   ├── messen.js       Maßband, Einrasten, Hilfslinien (Editor 2.0, 7.3)
│   ├── bibliothekVorlagen.js  Prefabs/Loot-Vorlagen als Bibliotheks-Einträge, Ordner, Vorschau (7.4)
│   ├── versionen.js    Versionen, Diff, Wiederherstellen (7.5)
│   ├── modellKi.js     Modell → Metadaten: Anfrage (Maße + Vorschaubild) und strenge Prüfung (9.8)
│   ├── lueckenfinder.js Lückenfinder: Sackgassen, Haus ohne Eingang, Raum/Zone ohne Loot, Spawn in Sichtweite (9.3)
│   ├── kiPipeline.js   KI-Pipeline: Kontext je Aufgabe → Anfrage → geprüfte Vorschau (9.1)
│   ├── autoFix.js      Auto-Fix: eindeutige Prüfungsfälle beheben, alle in einem Undo-Schritt (8.2)
│   ├── touchBauen.js   Touch-Regeln: Fadenkreuz, Langdruck, Lupe, Griffe, Skalieren, Raster am Finger (7.6)
│   ├── lootVorlagen.js Loot-Vorlagen: eingebaut/eigene, verknüpfen + nachziehen, Datei (Editor 2.0, 6.3)
│   ├── zonenManager.js Zonen-Manager: Bereichs-Zonen, Anzeige je Zone, Ablage/Einsetzen, Sperre (Editor 2.0, 6.1)
│   └── quellen.js      Externe Modell-Quellen (Poly Pizza, nur CC0/CC-BY, fetch injizierbar)                       (Editor 2.0)
├── ROADMAP.md          Plan Editor 2.0 (Phasen 1–9, Fehlerliste, Entscheidungen)
└── ui/     (Browser) zustand.js (Projekt, Auswahl, Ebenen, Autosave) · zeichner2d.js (Canvas, Lineale) · werkzeuge.js (Zeiger/Touch/Trackpad) · touchBauen.js (7.6: Fadenkreuz, Lupe, ✓/✕, Griffe, Langdruck)
            befehle.js (Befehlsregister, Tastenkürzel) · befehlsliste.js (ALLE Befehle + Menüs/Leisten/Kontextmenü) · menue.js (Menüleiste, Dropdown)
            aktionen.js (Bearbeiten/Zone/Räume) · dateiAktionen.js (Neu/Öffnen/Export/Veröffentlichen) · layout.js (Seitenleisten, Fokus, Handy-Schubladen)
            seitenleiste.js (Reiter) · assetBrowser.js (Suche, Favoriten, Gruppen) · optionsleiste.js (Werkzeug-Optionen) · inspektor.js · ebenenUi.js · pruefungUi.js
            dialoge.js · speicher.js (IndexedDB …)
            prefabUi.js (Reiter Prefabs) · raeumeUi.js (Reiter Räume) · zonenUi.js (Reiter Zonen, Weltkarte, Nachbarn) · kiUi.js (Ausschnitt-Dialog, Reiter KI-Import) · geminiUi.js (Reiter 🤖 Helfer, Chat + Schlüssel) · testUi.js (▶ Testen)
            ansicht3d.js (Three.js-Ansicht) · bild3d.js (Extrusion/Muster-Texturen) · eigeneUi.js (Platzhalter-Typen, Texturen; Bild→3D/Grafik-Antrag ausgeblendet) · bibliothek.js (Modelle in IndexedDB) · modellImport.js (Datei→.glb, Maße, Vorschaubild) · modelleUi.js (Reiter 📦 Modelle, Poly Pizza, Löschen mit Abhängigkeiten)
            werkstatt.js (🛠 Modell-Werkstatt: Orbit-Kamera, Gizmo, Teile/Materialien, Undo, Speichern als neue Version) · werkstattMalen.js (Material, Textur, Malen 3D/UV, Aufkleber) · werkstattAnimation.js (Clips, Leerlauf, Keyframes, Gelenke, Knochen, Übernehmen) · werkstattKi.js (🤖 Farbschema, Animation, Textur aus Text)
            audioUi.js (Reiter 🔊 Audio: Upload, Vorhören, Klänge setzen, Klang-Inspektor mit Wellenform-Trimmen, Löschen mit Abhängigkeiten) · zonenManagerUi.js (Reiter ▭ Bereiche: Zonen einzeln ein-/ausblenden, sperren, färben, Ablage) · lootUi.js (Loot-Zonen-Inspektor, Vorlagen) · hilfeUi.js (Hilfe mit eigenen Tasten, Befehlspalette Strg+K)
```
**Touch-Bauen (7.6, ersetzt die frühere Touch-Ausnahme):** Fadenkreuz über dem Finger + Lupe, Platzieren mit Geist → ✓ Setzen/⟳/✕, große Griffe (verschieben/drehen/skalieren), Langdruck = Kontextmenü, Handy-Leiste mit Schubladen; zwei Finger = schwenken/zoomen (`editor/kern/touchBauen.js`, `editor/ui/touchBauen.js`).
**Terrain-Entscheidung (Editor 2.0, F4):** Höhen sind im Spiel sichtbar und begehbar (`gemeinsam/welt/gelaende.js`). Eine Kachel ist gesperrt, wenn ein 4er-Nachbar mehr als 1 m höher liegt (Klippenfuß) → unsichtbare `hang`-Objekte, Bewegung/Pfadsuche unverändert. Treffer in der Draufsicht bleiben 2D; die Ego-Ansicht prüft die Neigung (`kampfSystem.trifftHoehe`). Alte Karten ohne Höhen bleiben flach (`terrain.steil` wird weiter gelesen).

**Spiel-Seite (Phase 5, abwärtskompatibel – Karten ohne die Felder verhalten sich wie bisher):** `server/spiel/karten/zonenEinstellungen.js` (ZONEN_EINSTELLUNGEN = welche Werte eine Zone überschreiben darf, `zonenKonfiguration` legt sie per Prototyp über die gemeinsame Konfiguration → `spielWelt.konfiguration`),
`kartenLader.verarbeiteKarte` liefert zusätzlich `einstellungen`, `bauwerke`, `tierBereiche`, Spawns mit `respawnZeit/horde` (× Anzahl × Dichte), Loot-Punkte mit `spawnChance/respawnZeit`, feste `groesse`, `terrain.steil` → Objekte `hang` (ebene `unsichtbar`, Renderer/Karte überspringen), `daten.musik`;
SpielWelt setzt kartenfeste Bauwerke (Besitzer null; Weltstand übernimmt ihren Zustand), `planeZombieRespawn` je Spawn, `tageszeitSystem.schickeHorde` nur an Horden-Punkten, `lootSystem` je Punkt, `tierSystem` Hasen-Bereiche (`tierRespawns` = `[{rest, bereich}]`), Client-Musik `karte.musik`.
Weiter: `statischerServer.js` liefert `editor/` aus,
`werkzeuge/karten/editorImport.mjs` (`npm run karte:editor -- x.karte.json`), `registrieren.mjs` (KARTEN-Eintrag, auch von tiled.mjs),
`werkzeuge/test/editorRauchtest.mjs` (`npm run rauchtest:editor`).

---

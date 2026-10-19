# Roadmap Map-Editor 2.0 (Lastenheft vom 2026-10-19)

> Arbeitsplan für das große Editor-Update. Wird nach jedem Schritt abgehakt (☐ offen · ◐ in Arbeit · ☑ fertig).
> Reihenfolge = Abarbeitungsreihenfolge. Größen: S klein · M mittel · L groß · XL sehr groß.
> Jeder Schritt endet mit: `npm test` grün · Editor-Rauchtest (`npm run rauchtest:editor`) grün und erweitert ·
> LIESMICH/KI_INDEX/Manifest + Datei-Kopfkommentare nachgezogen · Commit + Push · kurze Rückmeldung mit Spiel-Link.
> 🎮 = Schritt ändert auch das Spiel (Server/Client), nicht nur den Editor.

## 🔁 Übergabe – aktueller Stand (wird nach jeder Phase/jedem Schritt aktualisiert)
> Falls die Arbeit abbricht: hier weitermachen. Regeln: `CLAUDE.md` (direkt auf `main`, `npm test` vor jedem Commit,
> KI_INDEX/Manifest/LIESMICH nachziehen). Prüfen: `npm test`, `npm run rauchtest:editor`, `npm run rauchtest`.

**Erledigt (auf `main`):**
- Phase 1 komplett (1.1–1.6): Bugs B1–B12, Befehlsregister/Menüs/Kontextmenü/Hilfe, neues Layout, Ebenen, Backup.
- Phase 2 komplett (2.1–2.5): Licht (kein Sichtkegel, dunkle Nächte, Kegel-Lampen), Wände ziehen, Gelände-Werkzeuge,
  Gelände im Spiel begehbar/sichtbar (`gemeinsam/welt/gelaende.js`), Ego-Zielen mit Neigung.

- Phase 3 komplett (3.1–3.5): Modell-Bibliothek (`editor/kern/bibliothek.js`, `editor/ui/bibliothek.js`, IndexedDB-Bereich
  `assets`), Typen verweisen per `asset` (Export/Test/Veröffentlichen betten `glb` ein), Upload .glb/.gltf/.obj/.fbx mit Maßen,
  Vorschaubild, Ordnern, Tags (`ui/modellImport.js`, `ui/modelleUi.js`), Löschen mit Abhängigkeiten (mitlöschen/ersetzen),
  `karte:editor` räumt verwaiste Modelle auf, Poly Pizza (`kern/quellen.js`; echte API ungetestet – ohne Schlüssel, Preflight
  ohne CORS-Kopf → Rückfall Link + „Datei mit Lizenzangaben“ ist eingebaut), Bild→3D + Grafik-Antrag ausgeblendet.

- Phase 4 komplett (4.1–4.5, 2026-10-19): Klanglandschaft `gemeinsam/audio/klanglandschaft.js` (Pegel, Auslöser, Loop/Intervall/
  Einmal, Pitch, Schnitt), Lader `daten.klaenge`, Spiel-Abspieler `client/audio/klaenge.js` (Busse, Stereo, nächste N Quellen,
  `ersetztMusik`), Editor: Audio-Bibliothek (IndexedDB `audio`), Reiter „🔊 Audio“ (`ui/audioUi.js`: Upload + Probe-Dekodierung,
  Ordner/Tags/Suche, Vorhören, Löschen mit Abhängigkeiten), Katalog „Klänge“, Inspektor mit Wellenform-Trimmen/Fades/Auslösern,
  Radius-Griffe, 2D- und 3D-Anzeige, Prüfung (`klang-*`), Verschieben/Duplizieren, `karte:editor` → `client/audio/karten/<karte>/`.
  Doku: LIESMICH „🔊 Klänge“, KI_INDEX §10, Manifest. Prüfung: `npm test` 238/238, `rauchtest:editor` + `rauchtest` grün.
  Bekannt/offen: echte Musikdateien auf dem Handy nicht geprüft (nur WAV im Rauchtest); Klang-Vorschau in 3D ohne Ton.

- 5.1 Modell-Werkstatt fertig (2026-10-19): `editor/kern/werkstatt.js` + `editor/ui/werkstatt.js`, Vendor-Addons
  OrbitControls/TransformControls (`baue_3d.mjs --nur-vendor`), `metaNormal` mit `basis`/`version`, Einstiege 🛠 (Modelle-Reiter,
  ✎-Dialog, Inspektor, Befehl `bearbeiten.werkstatt` im Menü/Kontextmenü), `tests/werkstatt.test.js`, Rauchtest „Phase 5.1“.
  Offen/bekannt: Gizmo-Ziehen selbst nicht im Rauchtest (nur Zahlenfelder/Knöpfe); Handy-Layout nur per CSS (≤ 900 px gestapelt).

- 5.2 Texturen & Grafiken fertig (2026-10-19): `editor/ui/werkstattMalen.js` (Texturwerk: Material Farbe/Rauheit/Metall,
  Textur ersetzen/entfernen, Malen 3D + UV-Ansicht, Aufkleber per DecalGeometry), `editor/kern/malen.js`, Vendor DecalGeometry,
  Undo-Stand mit Materialien, Rauchtest „Phase 5.2“ + Handy-Malen. Offen/bekannt: kein Pinsel-Radierer/Füllen; Aufkleber auf
  animierten (Skinned) Teilen folgen der Animation nicht; UV-Ansicht zeigt max. 20 000 Dreiecke.

- 5.3 Animationen & Rigging fertig (2026-10-19): `editor/ui/werkstattAnimation.js`, `editor/kern/animation.js`, Meta `leerlauf` →
  Typ `animation`, Spiel spielt Leerlauf-Animationen (`client/darstellung/eigeneModelle.js` `leerlaufMischer`, `kartenModell.mischer`,
  `renderer.js` reicht `fokus` durch, `kartenLader` prüft `animation`). ✅ Spieldateien mit Nutzer-Freigabe (2026-10-19: „ja, sofern
  vermerkt“) geändert – Liste „Fremde Dateien (Editor-Linie)“ in `KI_INDEX.md` §10. Rauchtest „Phase 5.3“ (Gelenk, Pendeln,
  Vorschau, Undo, Leerlauf, Mixer im Editor-Testlauf). Bewusst weggelassen (Browser-Umfang): automatisches Rigging, Gewichte malen,
  Knochenketten, die ein Netz biegen; Übernehmen nur bei gleichen Knochennamen (`SkeletonUtils.retargetClip` für andere Namen =
  späterer Ausbau). Die Editor-3D-Ansicht zeigt die Leerlauf-Animation nicht.

**Nächster Schritt: Phase 5 – 5.4 KI im Modul** (noch nicht begonnen). Idee: in der Werkstatt Knopf „🤖 KI“ mit drei Aufgaben –
Farbschema (Materialliste + Vorschaubild → Palette als JSON `{material: farbe}`), Textur aus Text (Gemini-Bildmodell, falls
verfügbar → `Texturwerk`), Animation vorschlagen (JSON `{art, ziel, achse, dauer, staerke}` → `baueAnimation`). Immer
Vorschau → „Übernehmen“ als 1 Werkstatt-Undo-Schritt. Schlüssel/Modell wie `ui/geminiUi.js` (`browserSurvival.editorGemini`,
`kern/gemini.js frageGemini`, fetch injizierbar → Test mit Mock). Danach 5.5 Free-Modus (🎮).

**Danach:** Phasen 5–9 laut Tabellen unten (5 3D-Modul, 6 Zonen/Loot, 7 UX, 8 Testlauf, 9 KI).

## Ausgangslage (Analyse 2026-10-19)
- Editor v0.14: Phasen 0–11 fertig, ~10 000 Zeilen in `editor/`, 210 Tests grün, Rauchtest grün.
- Gute Basis: jede Änderung läuft über Operationen (`karte.anwenden`) → Undo, Autosave und KI-Vorschau hängen daran.
- Schwächen UI: 17 Kategorien flach untereinander, 7 Panel-Reiter in zwei Zeilen, Kopfleiste mit doppelten KI-Knöpfen
  bricht bei 1280 px um, Werkzeugleiste liegt **auf** der Karte, Bauleiste unten frisst Höhe, Handy-Layout gequetscht.
- Schwächen Code: `main.js` (586 Z.) verdrahtet alles, Phasen-Hook `erweiterungen.js`/`sonderAktionen`, Panel baut bei
  jeder Kartenänderung per `innerHTML` neu, Tastenkürzel an zwei Stellen hart verdrahtet, keine zentrale Befehlsliste.
- Bekannte Bugs (bestätigt):
  - B1 Klick auf „🤖 Helfer“/„KI-Import“/„▶ Testen“ meldet zusätzlich rot „… fehlt“ (`?? meldung` auf `undefined`-Rückgabe).
  - B2 Kopfleiste bricht bei 1280 px Breite um (Speicherstatus rutscht in 2. Zeile), Handy: 3 Zeilen Kopf.
  - B3 Werkzeugleiste überdeckt den linken Kartenrand.
  - B4 Prüfungs-Zähler im Reiter wird über `children[2]` gesetzt (falsch, sobald sich Reiter ändern).
  - B5 Trackpad: Zwei-Finger-Wischen zoomt statt zu schwenken (`wheel` wertet `deltaX` nicht aus).
  - B6 KI-Helfer schickt bei Zonen ≤ 2500 Kacheln die ganze Karte mit (widerspricht neuer KI-Vorgabe).
- Spielseite: Terrain-Höhen sind im Spiel nur „steil = blockiert“ (flacher Boden), Licht: Sichtkegel-Schleier
  (`client/darstellung/sichtkegel.js`) + Taschenlampe/Scheinwerfer, nur 6 echte Lampen gleichzeitig (`LAMPEN_POOL`).

---

## Phase 1 – Aufräumen, Fehlersuche, Fundament
| # | Schritt | Größe |
|---|---|---|
| ☑ 1.1 | **Fehlersuche systematisch:** Prüfliste aller Werkzeuge/Knöpfe/Dialoge/Tasten bei 1400/1280/390 px + Touch durchgehen, Fehler B1–B6 + neue Funde hier eintragen, je Fehler Regressionstest | M |
| ☑ 1.2 | **Befehlsregister** `editor/ui/befehle.js`: jede Aktion einmal (ID, Name, Symbol, Gruppe, Standard-Kürzel, `ausfuehren`, `verfuegbar`). Menüs, Werkzeugleiste, Kontextmenü, Tastatur (und später Hilfe/Befehlspalette/eigene Kürzel) lesen nur daraus. `main.js` zerfällt in Module (datei, bearbeiten, ansicht, zone), `erweiterungen.js`/`sonderAktionen` entfallen | L |
| ☑ 1.3 | **Neues Layout** (Vorbild Tiled/LDtk/Godot): Menüleiste (Datei · Bearbeiten · Ansicht · Einfügen · Werkzeuge · KI · Hilfe) + schlanke Schnellleiste (↶ ↷, 2D/3D, ▶ Testen, 🚀 Veröffentlichen); links feste Werkzeugleiste (nicht mehr über der Karte) + **Asset-Browser** mit Suche und 7 Gruppen statt 17 Kategorien (Gelände · Bauen · Natur · Einrichtung · Gameplay · Zonen & Logik · Eigene), Raster mit Vorschau statt Bauleiste unten; über der Karte **Werkzeug-Optionsleiste** (Pinselgröße, Modus, Einrasten, Stärke, Farbe, Drehung); rechts Inspektor · Ebenen · Prüfung; Projekt (Zonen/Weltkarte, Prefabs, Räume) als Reiter links; KI-Helfer als eigene, einklappbare Seitenleiste; Panels einklapp- und in der Breite ziehbar (gemerkt); Fokus-Modus | XL |
| ☑ 1.4 | **Ebenen-System:** Boden · Bemalung · Terrain · Objekte · Bauwerke · Marker · Bereiche/Zonen · Nachbarn – je Ebene sichtbar/gesperrt (gesperrt = ausgegraut, nicht anklickbar). Grundlage für Phase 6 | M |
| ☑ 1.5 | **Arbeitsabläufe:** Rechtsklick-Kontextmenü (Kopieren, Duplizieren, Drehen, Löschen, Als Prefab, KI-Ausschnitt …), zuletzt benutzte Assets + Favoriten (Schnellwahl per Taste → 7.1), Alt+Klick = Pipette in jedem Malwerkzeug, Trackpad-Gesten (2 Finger schwenken, Pinch zoomen), Statusleiste mit Objekt unter der Maus + Auswahlgröße, klare Meldungen statt stiller Abbrüche | M |
| ☑ 1.6 | **Datensicherheit vorgezogen** (aus Phase 7, weil Phase 3 das Speicherformat erweitert): sichtbare Autosave-Anzeige (● ungespeichert · ⟳ speichert · ✓ gespeichert hh:mm · ⚠ Fehler + Wiederholen), Speicherplatz-Anzeige, **Komplett-Backup** aller Entwürfe (+ Verlauf, Prefabs, Einstellungen) als eine Datei + Wiederherstellen | M |

## Phase 2 – Map Building & Terrain
| # | Schritt | Größe |
|---|---|---|
| ☑ 2.1 | 🎮 **Beleuchtung:** Sichtkegel-Schleier komplett entfernen (Datei, Renderer, ⚙-Knopf), Nacht deutlich dunkler (Mond/Umgebungslicht), Licht nur noch aus platzierten Quellen; Taschenlampe: kleinerer, schwächerer Kegel (düster, F2). Lampen bekommen Art **Punkt/Kegel** (Richtung, Öffnungswinkel), Editor zeigt Radius/Kegel in 2D/3D; Lampen-Pool vergrößern bzw. statische Lampen günstiger (Lichtkarte im Boden), damit auch viele Lampen leuchten; Prüfung warnt bei Zonen ohne Licht | M |
| ☑ 2.2 | **Wände ziehen:** Mauer-Einträge (Wand, Fenster, Tür, Zaun, Holzwand) bauen bei gedrückter linker Maustaste am Stück – Live-Vorschau, Länge, Einrasten waagerecht/senkrecht/45° (Umschalt = frei), Alt = Rechteck-Umriss (Raum), Bauwerke je Kachel grün/rot geprüft, Tür-Regel (max. 4), 1 Undo-Schritt | M |
| ☑ 2.3 | **Terrain-Werkzeuge:** Heben/Senken (bleibt) + Plateau auf Zielhöhe (Höhen-Pipette), **Rampe** A→B mit Breite, Treppe/Stufen, Bereich auf Höhe setzen, numerische Höhe im Inspektor; 2D-Anzeige mit Schattierung, Höhenlinien und Steigungsfarbe (begehbar/steil); Warnung „Plateau ohne Zugang“ | M |
| ☑ 2.4 | 🎮 **Terrain begehbar (Logik):** gemeinsame Höhenfunktion `gemeinsam/welt/terrain.js` (Höhe an jeder Position, interpoliert); Sperre wird **kantenbasiert** (Klippe zwischen zwei Kacheln) statt ganze Kachel → Plateau-Oberseite begehbar, Kanten blockieren, Rampen verbinden; Bewegung (`bewegung.js`), Zombie-Pfadsuche + Auto-Lauf (`pfadfindung.js`), Fahrzeuge, Lader (`terrain.hoehen` statt nur `steil`); alte Karten bleiben flach und unverändert | L |
| ☑ 2.5 | 🎮 **Terrain im Spiel sichtbar:** Boden-Mesh mit Höhen, Figuren/Zombies/Items/Objekte/Bäume/Bauwerke/Lampen/Autos auf Geländehöhe, Kamera folgt; Leistung prüfen (Rauchtest + FPS). Treffer Top-Down weiter 2D; **Ego-Ansicht: Neigung muss zur Höhe des Ziels passen** (nach oben zielen) | L |

## Phase 3 – Asset-Management (Modelle, Sounds, Importe)
| # | Schritt | Größe |
|---|---|---|
| ☑ 3.1 | **Projekt-Bibliothek:** IndexedDB-Speicher `assets` (Dateien als Blob statt Base64 in der Karte), Metadaten (Name, Art, Ordner/Kategorie, Tags, Maße, Dreiecke, Animationen, Lizenz, Urheber, Quelle, Vorschaubild); Karten verweisen per Asset-ID; automatische Übernahme vorhandener `glb`-Typen; Test/Export/Veröffentlichen betten ein bzw. legen Dateien ab | L |
| ☑ 3.2 | **„Eigene“ nur 3D-Formate:** .glb, .gltf (eingebettet), optional .obj/.fbx → intern zu .glb; Prüfung per Datei-Signatur + Probe-Laden, Größen-/Dreieckswarnung; **Bild → 3D und Grafik-Antrag deaktiviert** (ausgeblendet, Code bleibt) | M |
| ☑ 3.3 | **Löschen:** Modell in Bibliothek/Typ löschen mit Abhängigkeitsprüfung („wird in 2 Zonen von 14 Objekten benutzt“ → mitlöschen oder ersetzen); verschwindet aus dem Browser-Speicher; aus dem Repo beim nächsten `npm run karte:editor` (räumt verwaiste Dateien in `client/assets/eigene/` + LIZENZEN.md auf) – je nach Entscheidung F3 zusätzlich direkt | M |
| ☑ 3.4 | **GLB-Upload & Kategorien:** Drag & Drop (mehrere Dateien), Zuordnung zu Kategorie/eigenem Ordner + Tags, automatische Maße/Kollisionsbox aus dem Modell, Vorschaubild (3D-Render), sofort im Asset-Browser auffindbar (Suche nach Name/Tag) | M |
| ☑ 3.5 | **Externe Bibliotheken:** Poly Pizza (CC0/CC-BY, eigener kostenloser API-Schlüssel nur im Browser wie bei Gemini): Suche, Vorschau, Lizenzanzeige, „Übernehmen“ → Bibliothek mit Urheber/Lizenz/Quelle (→ LIZENZEN.md/Credits). Quellen als Adapter (weitere später); Fallback ohne CORS: Link + Datei-Import | M |
| – 3.6 | Audio → eigene Phase 4 (Nutzer-Zusatz 2026-10-19) | – |

## Phase 4 – Audio-Engine & Soundscape (Zusatzmodul)
> Nicht-destruktiv: die Originaldatei bleibt, Schnitt/Fades/Lautstärke sind Einstellungen am Sound und werden beim Abspielen
> angewendet (Editor-Vorschau und Spiel benutzen denselben Abspiel-Kern `gemeinsam`-frei in `client/audio/`).
| # | Schritt | Größe |
|---|---|---|
| ☑ 4.1 | **Upload & Verwaltung:** Musik/Effekte (.mp3, .wav, .ogg, .m4a, .flac – Probe-Dekodierung, Dauer, Größe) in die Projekt-Bibliothek (3.1), eigene **Ordner + Tags**, Suche, Vorhören, Löschen mit Abhängigkeitsprüfung | M |
| ☑ 4.2 | **Audio-Bearbeitung im Editor:** Wellenform-Ansicht, **Start-/Endpunkt** (Trimmen per Ziehen), **Fade-In/Fade-Out**, **Grundlautstärke**, Loop-Vorhören mit Übergang; alles als Sound-Einstellungen (1 Undo-Schritt je Änderung) | M |
| ☑ 4.3 | 🎮 **Räumliches Audio & Zuweisung:** *objektbasiert* (Sound an ein Objekt/einen Punkt hängen: Huhn, Maschine) mit **sichtbarem Falloff** in 2D/3D (innerer Radius = volle Lautstärke, äußerer = unhörbar, per Griff ziehbar); *zonenbasiert* (Ambiente in markierten Zonen, weiches Ein-/Ausblenden an der Grenze); *global* (Hintergrundmusik/BGM der Karte, ersetzt bzw. ergänzt den Musik-Ordner). Spiel: Abstand/Stereo-Panorama zur eigenen Figur, Busse aus `sound.js` (Effekte/Atmosphäre/Musik), Leistungsgrenze (nur die nächsten N Quellen) | L |
| ☑ 4.4 | 🎮 **Wiedergabe-Logik & Trigger:** Endlos-Loop oder **zufällige Intervalle** (z. B. alle 5–15 s), **Ereignis-Trigger** (Zone betreten/verlassen, Annäherung auf X m, Tag-/Nacht-Wechsel, Kampfbeginn, Horde, Übergang), einmalig/wiederholbar mit Abklingzeit, **automatische Pitch-Variation** (±x %) für kurze, wiederkehrende Sounds | M |
| ☑ 4.5 | 🎮 **Veröffentlichen & Test:** Editor-Test spielt die Soundscape (Dateien eingebettet), `npm run karte:editor` legt die Dateien unter `client/audio/karten/<zone>/` ab (verwaiste werden entfernt), Lader prüft alle Felder, Tests (Lader, Trigger-Logik, Intervall/Pitch deterministisch mit festem Zufall) | M |

## Phase 5 – 3D-Bearbeitungsmodul & Objekt-Handling
| # | Schritt | Größe |
|---|---|---|
| ☑ 5.1 | **Modell-Werkstatt** (großes eigenes Fenster): Orbit-Kamera, Raster, Licht, Drahtgitter, Gizmo zum freien Drehen/Skalieren/Verschieben, Bodenausrichtung + Drehpunkt, Fußabdruck/Kollisionsbox sichtbar, Teile-/Material-Liste; Speichern als neue Asset-Version (Original bleibt), Undo im Modul | L |
| ☑ 5.2 | **Texturen & Grafiken:** Materialfarbe/Rauheit/Metall, Textur ersetzen (Bild hochladen), einfaches Malen auf der Textur (UV-Ansicht + Pinsel), **Aufkleber/Decals** projizieren (Logos, Schilder, Schmutz) | L |
| ☑ 5.3 | 🎮 **Animationen & Rigging:** vorhandene Clips abspielen/benennen/als Leerlauf-Animation fürs Spiel wählen; einfache Keyframe-Animationen (Drehen, Wippen, Pendeln, Pulsieren, Flackern + Zeitleiste) für Modell oder Teile; Skelett anzeigen, Teile an Knochen hängen, einfache Knochenketten für Requisiten (Tür, Fahne), Animationen auf kompatible Skelette übertragen (Retargeting). Spiel spielt Modell-Animationen ab. ⚠ Automatisches Rigging + Gewichte malen wie in Blender ist **nicht** realistisch im Browser-Umfang | XL |
| ☐ 5.4 | **KI im Modul (Knopfdruck):** Farbschema vorschlagen (Materialliste + Vorschaubild → Palette), Textur aus Text erzeugen (Gemini-Bildmodell, falls der Schlüssel es erlaubt), Animation vorschlagen (Keyframe-JSON) – immer Vorschau → Übernehmen als 1 Undo-Schritt | M |
| ☐ 5.5 | 🎮 **Free-Modus:** Umschalter Raster ⇄ Frei in der Optionsleiste: stufenlose Position, freie Drehung mit Drehgriff/Mausrad/Zahlenfeld (Umschalt = 15°-Raster); Kollision gedrehter Objekte im Spiel korrekt (gedrehtes Rechteck statt achsparallel, `gemeinsam/welt`) und in der grün/rot-Prüfung | M |

## Phase 6 – Zonen- & Loot-System
| # | Schritt | Größe |
|---|---|---|
| ☐ 6.1 | **Zonen-Manager:** Liste aller Bereichs-Zonen (Räume, Loot-, Tier-, Audio-Zonen, Übergänge) mit Auge (ausblenden), Sperre (ausgegraut, nicht anklickbar), Farbe, Umbenennen, Löschen, **Zwischenspeichern** (Ablage/Vorlage, später wieder einsetzen); Welt-Zonen (Karten) archivieren statt löschen, Löschen mit Bestätigung + Backup | M |
| ☐ 6.2 | 🎮 **Loot-Zonen neu:** Bereich markieren (Rechteck/Pinsel) → Item-Liste mit **exakter Chance je Item** (oder Gewicht), Menge von–bis, Dichte bzw. Anzahl Punkte, nur innen/außen, Nachschub, Höchstzahl; Inspektor zeigt erwartete Ausbeute; Spiel: Lader erzeugt Loot-Punkte auf begehbaren Kacheln mit der Zonen-Tabelle, `lootSystem` würfelt daraus; Prüfung (unbekannte Items, Summe, keine Fläche) | L |
| ☐ 6.3 | **Loot-Vorlagen:** Konfiguration als Vorlage speichern (Ordner, Suche), in anderen Zonen/Karten wiederverwenden (verknüpft oder als Kopie), Import/Export; vorhandene `LOOT_TABELLEN` als eingebaute Vorlagen | M |
| ☐ 6.4 | **Loot ein-/ausblenden per Klick** (Schalter + Taste), optional Dichte-Heatmap | S |

## Phase 7 – UX, Bedienung & QoL
| # | Schritt | Größe |
|---|---|---|
| ☐ 7.1 | **Tastenkürzel überall + Hilfe:** alle Befehle aus dem Register mit Kürzel, **anpassbar** (Konflikterkennung, Zurücksetzen, gespeichert), Hilfe-Übersicht mit **Suche** – zugleich Befehlspalette (Strg+K) | M |
| ☐ 7.2 | **Mehrfachauswahl:** Ausrichten (links/rechts/oben/unten/Mitte), Verteilen (gleiche Abstände), Spiegeln (waagerecht/senkrecht, inkl. Kacheln und Drehungen) – je 1 Undo-Schritt | M |
| ☐ 7.3 | **Messen & Ausrichten:** Maßband (Strecke, Pfadlänge, Winkel), Lineale mit herausziehbaren Hilfslinien, einstellbares Raster (Weite, Hauptlinien), Einrasten an Raster/Objektkanten/-mitten/Hilfslinien, 3D-Ausrichtungshilfen (Raster, Achsen-Gizmo, auf Gelände einrasten) | M |
| ☐ 7.4 | **Bibliothek & Vorlagen:** Prefabs in Ordnern, Suche, automatische Vorschaubilder für eigene Prefabs/Objekte, Favoriten, Ziehen aus der Bibliothek auf die Karte (eine Bibliothek für Assets, Prefabs, Loot-Vorlagen, Audio) | M |
| ☐ 7.5 | **Versionskontrolle:** benannte Versionen (manuell + automatisch bei Export/Veröffentlichen), Versionsliste, **„Diff zu Version X“** (Liste + farbig auf der Karte), **„Wiederherstellungspunkt laden“** (als rückgängig machbarer Schritt), vor dem Veröffentlichen **Änderungsübersicht seit dem letzten Export** | L |
| ☐ 7.6 | **Touch-Bauen:** Fadenkreuz-Cursor über dem Finger, **Lupe**, Snap-to-Grid, große **Griffe** (verschieben/drehen/skalieren), Bestätigen/Abbrechen-Knöpfe, Langdruck = Kontextmenü, Schubladen-Layout fürs Handy; hebt die bisherige „Touch-Ausnahme“ auf (Doku) | L |

## Phase 8 – Testlauf & Debugging
| # | Schritt | Größe |
|---|---|---|
| ☐ 8.1 | 🎮 **Debug-Testlauf:** Zeitlupe (0,1×–1×), Pause, Schritt-für-Schritt (1/10 Ticks), Overlays: Zombie-Pfade (A*), Ziele/Sichtradius, Spawn-Punkte mit Respawn-Timern, Loot-Punkte, Audio-Zonen, Übergänge; Klick auf Zombie = Info. Nur im Editor-Test (Lokal-Server im selben Tab), nie online | L |
| ☐ 8.2 | **Auto-Fix:** Prüfungseinträge bekommen „Automatisch beheben“ für eindeutige Fälle (Übergang an den Rand/nächste Kachel, Ankunft aus dem Übergang, Zombie-Spawn nach draußen, Objekt aus Blockade/vor Tür befreien, Objekt in die Zone, Loot-Punkt ohne Raum, Marker auf Wand) + „Alle eindeutigen beheben“ – mit Vorschau, 1 Undo-Schritt, je Fall ein Test | M |

## Phase 9 – KI-Assistent
| # | Schritt | Größe |
|---|---|---|
| ☐ 9.1 | **KI-Fundament:** zentrale Pipeline „KI-Vorschlag → Vorschau → 1 Undo-Schritt“ für **alle** KI-Funktionen; Kontext-Baukasten je Aufgabe (nur markierter Bereich/Auswahl/Statistik, **nie die ganze Karte**, nie der Schlüssel), Anzeige „Das wird gesendet“, strukturierte JSON-Antworten; neue Aktionen `wert` (Zonen-Werte inkl. Wetter, Whitelist), `lootzone`, `name`, `prefab` | M |
| ☐ 9.2 | **Text zu Karte:** Prompt → Aktionsliste (nutzt Prefabs als Bausteine) → Geister-Vorschau auf der Karte → Übernehmen/Verwerfen (neue Zone oder markierter Bereich) | L |
| ☐ 9.3 | **Lückenfinder:** erst lokal berechnet (Sackgassen, Häuser ohne Eingang, Zonen/Räume ohne Loot, Spawns in Sichtweite des Starts – mit der Spiel-Sichtlinie), dann erklärt/priorisiert die KI und schlägt Korrekturen als Aktionsliste vor | M |
| ☐ 9.4 | **KI-Fehlerbehebung:** je Prüfungsfehler „🤖 Erklären“ → ein verständlicher Satz + Korrektur als Aktionsliste (nur die Umgebung des Fehlers als Kontext) | S |
| ☐ 9.5 | **Loot-Balance:** Loot-Tabellen/Dichte gegen Schwierigkeit (Zombie-Dichte, Horde, Tempo) → Vorschlagswerte als Tabelle → Übernehmen | M |
| ☐ 9.6 | **Zonen-Themen:** „Mach diese Zone winterlich“ → gebündelt Bodenfarben, Typ-Texturen, Wetter-Werte, Musik → Vorschau → 1 Undo-Schritt | M |
| ☐ 9.7 | **Beschriftung:** Namen für Zonen/Räume/Objekte, Release-Notes/Beschreibung aus der Änderungsübersicht (7.5) im Veröffentlichen-Dialog | S |
| ☐ 9.8 | **Modell → Metadaten:** beim Upload lokal Maße/Dreiecke messen + Vorschaubild an die KI → Vorschlag Name, Kategorie, Größe, Kollisionsbox, Ebene, Tags (im Upload-Dialog vorausgefüllt) | M |
| ☐ 9.9 | **Abschluss:** Sicherheitsprüfung (Schlüssel nie in Entwurf/Export/Backup/Log, Kontextgrenzen getestet), Version + Doku | S |

---

## Entscheidungen (Nutzer, 2026-10-19)
- F1 Git: **direkt auf `main`** (CLAUDE.md gilt).
- F2 Licht: **nur der Sichtkegel-Schleier** fliegt raus. Taschenlampe bleibt, aber **kleinerer, schwächerer, realistischer Kegel** (düsterer). Autoscheinwerfer bleiben.
- F3 Repo-Dateien: **vorerst wie gehabt** (Editor schreibt nie ins Repo; Aufräumen beim `npm run karte:editor`). Ein **lokaler Editor-Server** (direkt ins Repo schreiben/löschen) kommt **später** – nicht jetzt.
- F4 Terrain: Höhen sichtbar + begehbar + Klippen blockieren. **Top-Down:** Treffer bleiben 2D (wer rechts oben auf der Klippe steht, wird beim Zielen nach rechts getroffen). **Ego-Ansicht:** man muss **nach oben zielen** (Neigung zählt) → Teil von 2.5.
- F5 **Durcharbeiten** ohne Halt, zwischendurch testen (Tests + Screenshots).

## Später (nicht im aktuellen Umfang)
- Lokaler Editor-Server (`npm run editor:lokal`): Modelle/Sounds direkt ins Repo schreiben und löschen, Veröffentlichen ohne Download.

## Fehlerliste (1.1, Browser-Suche mit Grenzfällen)
| # | Fehler | Stand |
|---|---|---|
| B1 | „🤖 Helfer“ meldete zusätzlich rot „Helfer fehlt“ (`?.() ?? meldung` auf `undefined`) | ☑ behoben (main.js) |
| B2 | Kopfleiste bricht bei 1280 px um, Handy 3 Zeilen | ☑ 1.3 (Menüleiste, ☰ am Handy) |
| B3 | Werkzeugleiste überdeckt den linken Kartenrand | ☑ 1.3 (feste Spalte) |
| B4 | Prüfungs-Zähler im Reiter über `children[2]` | ☑ 1.3 (Seitenleiste `beschriftung`) |
| B5 | Trackpad: Zwei-Finger-Wischen zoomte statt zu schwenken | ☑ `istMausrad` (werkzeuge.js) |
| B6 | KI-Helfer schickt kleine Zonen ganz mit | → 9.1 |
| B7 | Drehen von 2×1-Objekten → halbe Kacheln (x 17,5), driftet bei mehrfachem Drehen | ☑ `kern/bearbeiten.js dreheObjekt` (Raster, 4× = Ausgangslage) |
| B8 | Pfeiltasten/Ziehen schoben Objekte über den Zonenrand, Abbruch ohne Meldung | ☑ `verschiebeOps` (Rand + Grund) |
| B9 | Duplizieren von Markern/Ankünften tat still nichts | ☑ `dupliziereOps` |
| B10 | Werkzeug-Tasten (B, U, L …) wechselten in 3D unsichtbar das 2D-Werkzeug | ☑ Meldung statt Wechsel |
| B11 | Autosave speicherte nur die aktive Zone (Übergangs-Vorschläge/Umbenennen ändern auch andere) | ☑ Menge geänderter Zonen (zustand.js) |
| B12 | Prefab drehen: Türen/Fenster ohne gesetzte `drehung` kippten nicht | ☑ `dreheVorlage` |

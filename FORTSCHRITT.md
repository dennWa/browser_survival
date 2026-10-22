# FORTSCHRITT – Feedback-Runde 18 (Start 2026-10-22)

> Neue Sitzung? Hier zuerst lesen und beim ersten offenen Punkt weitermachen.
> Status: ⬜ offen · 🔄 in Arbeit · ✅ fertig · ⏸ blockiert
> Arbeitsweise: pro Schritt `npm test`, Rauchtest gesammelt am Phasenende, dann Doku + Commit + Push auf `main`.

## Phase 1 – Schnelle Werte & UI
| # | Punkt | Status | Vermerk |
|---|---|---|---|
| 1.1 | Zoom: weniger raus, dafür näher ran | ✅ | renderer.js `ZOOM_MIN` 0,32 / `ZOOM_MAX` 1,12, Ego-Sicht eigene Konstante `EGO_SICHT_ZOOM` 1,35 |
| 1.2 | Tempo: Gehen / Joggen (Shift ohne Ausdauer) / Rennen (= altes Joggen); Zombies ≈ 80 % vom Rennen | ✅ | Gehen 80, Joggen 115 (`joggFaktor`), Rennen 150 (`sprintFaktor` 1,875); Zombie jagd 120 / Läufer 135 / Brocken 90, Nacht ×1,1 (bleibt < Rennen). bewegung.js, spielKonfiguration, entwicklerFelder, spielWelt.physikParameter, Tests. Geh-Clip folgt in Phase 2 |
| 1.3 | Taschenlampe: kürzer, breiter, weiche Ränder | ✅ | `TASCHENLAMPE` Winkel 0,56 / penumbra 0,95 / Reichweite 330 / Kegel 200; sichtbarer Kegel = ShaderMaterial mit Rand-Ausblendung |
| 1.4 | Laternen etwas kleiner | ✅ | kartenModell `LATERNEN_LICHTHOEHE` 124 (150), Mast/Schale/Dach schlanker |
| 1.5 | Mengenanzeige (Hotbar) weiß + dunkle Umrandung | ✅ | stil.css `.slot-menge`, `#hud-munition` |
| 1.6 | „Ziel erfasst“ weg | ✅ | clientSpiel `zielAntippen` |
| 1.7 | Infos unten rechts weg | ✅ | hud.js `#hud-hilfe` hidden |
| 1.8 | Keine Zombies auf der Minimap | ✅ | clientSpiel `#minikartenPunkte` nur Mitspieler (auch keine Tiere) |
| 1.9 | Nacht minimal heller | ✅ | renderer `NACHT_MOND` 0,11 / `NACHT_UMGEBUNG` 0,1, Nachtfarben etwas heller |
| 1.10 | Bug: nach Respawn nachts alles unsichtbar | ✅ | Repro: nachts + Regen/Nebel war das Regengrau heller als die Szene und der Nebel begann vor der Figur → alles grau. Fix `#tageslicht` (Grau × hell², fog.near ≥ 1,04·Kameraabstand), Eigenleuchten 0,4, zusätzlich NaN-Schutz Kamera |
| 1.11 | Wand-Durchsicht nur nahe Sichtwände (Süd), nur drinnen | ✅ | wandDurchsicht.js neu: je Kachel, `verdecktFigur` (südlich ≤4, seitlich ≤3+), Vertex-Alpha; Test erweitert |
| 1.12 | Chat-Sprechblase über dem Charakter | ✅ | beschriftung.js `zeichneSprechblase`, renderer `zeigeSprechblase`, clientSpiel CHAT; 4 s + 60 ms/Zeichen (max 10 s) |
| 1.E | Phase-Ende: Test, Rauchtest, Doku, Commit | ✅ | Rauchtest im Browser-Pane: Sprechblase, Hotbar-Zahlen, Durchsicht Südwand, Nacht+Regen nach Respawn, Konsole ohne Fehler |

## Phase 2 – Charakter & Animationen (Blender)
> Blender-Clips (gehen, sitzen, spitzhacke, hacke, abbauen, nahkampf) baut ein Subagent in `werkzeuge/assets/figuren/` → `client/assets/3d/figur_*.glb`; Einbau in Renderer/Haltung macht die Hauptsitzung.
| # | Punkt | Status | Vermerk |
|---|---|---|---|
| 2.1 | Sitz-Animation neu (Blender), Taste „ä“ überall, Lagerfeuer im Sitzen nutzbar | ✅ | AKTION `sitzen` (Ä = `Quote`, Touch 🪑 `#hud-sitzen`), `stationSystem.setzeHin/sitztAmFeuer`, Tarnung+Heilung nur am Feuer, Linksklick steht nicht auf; Clip `sitzen` (Boden-Sitz, Gesäß auf Höhe 0, kein SITZ_TIEFE nötig) |
| 2.2 | Leerer Quickslot wählbar (Hand leer) | ✅ | inventarSystem `benutzen` leerer Platz → `ausgeruestet = null` |
| 2.3 | Ruhehaltung lässig; Waffe/Pistole(10 s)/Nahkampf beidhändig/Messer einhändig/Lampe | ✅ | figurHaltung: `locker`, `pistoleUnten` + `anschlag` (PISTOLE_OBEN_MS 10 s), `nahkampf` beidhändig, `messer` einhändig, Lampe nur nachts+an; beidhändiger Schlag = Clip `nahkampf` (renderer `nahkampfBis`, `istBeidhaendigerSchlag`) |
| 2.4 | Abbau-Animationen passend zu Händen/Werkzeug | ✅ | Clips `hacken`/`spitzhacke`/`abbauen` (Hammer Hüfthöhe), Werkzeug per `platziereHackwerkzeug`; Geh-Clip `gehen`, `GEH_TEMPO` je Figur (Mann 47/Frau 38), `LAUF_TEMPO` Frau 83 |
| 2.5 | Hacke: kurzer Schlag beim Feld anlegen/entfernen | ✅ | Server `setzeAktion('hacke', 0,6)`; Renderer Clip `hacke` (LoopOnce) bzw. prozedural |
| 2.6 | Platzierte Objekte mit Axt/Spitzhacke/Hammer abbauen (5 s) | ✅ | Linksklick mit Werkzeug vor eigenem Lagerfeuer/Werkbank/Ofen/Falle → arbeit `zerlegen` (arbeitSystem `starteZerlegen/zerlegeWeiter`), Item zurück, Inhalt fällt; Clip `abbauen` sobald da; Tests `tests/runde18.test.js` |
| 2.E | Phase-Ende | 🔄 | Nahkampf-Clip im Browser-Pane geprüft (Axt, Space); gesammelter Rauchtest beim Abschluss |

## Phase 3 – Weltmechaniken & Sounds
| # | Punkt | Status | Vermerk |
|---|---|---|---|
| 3.1 | Eis begehbar mit Rutschen, kein Angeln auf Eis | ✅ | `welt.istBlockiert` (schnee+wasser=frei), `welt.istEis`, bewegung.js `EIS_GRIFF` 2,2 + `gleitX/Y` (Netz `gleit` exakt, clientSpiel übernimmt), wasser.js `istOffenesWasser` für wurfZiel; Test in runde18 |
| 3.2 | Angeln nur mit Angel in der Hand, Dauer ×2 | ✅ | `angelSystem.hatAngelInDerHand`, Client `#angelZustand` gleich; warten 6–18 s; Tests mechaniken/runde13 rüsten die Angel aus |
| 3.3 | Auto bremst an Laternen | ✅ | `konfiguration.fahrzeug.laterneBremse` 0,6 (vorher ×0,97) in `fahrzeugSystem.fahreHindernisseUm`; Test runde14 |
| 3.4 | Vogelgezwitscher (Tag, draußen) | ✅ | Ereignis `vogel`, clientSpiel `#umweltGeraeusche` (Helligkeit > 0,6, nicht drinnen/Auto, klar/Nebel, keine Schneezone, 8–25 s, 150–400 px weg) |
| 3.5 | Sound-Platzhalter: Magenknurren, Durst, Schaden m/w, Keuchen, Donner, Automatikgewehr | ✅ | Ereignisse + Synth-Rezepte; Hunger/Durst < 20 alle 20–45 s, Keuchen bei Erschöpfung, Schaden je Figur (≥ 0,7 s Abstand), Donner bei Regen > 0,5 alle 25–70 s, `automatikgewehr` bei `feuer.waffe` (Waffe fehlt noch) |
| 3.E | Phase-Ende | 🔄 | Tests grün; Rauchtest gesammelt beim Abschluss |

## Phase 4 – Performance & nahtlose Zonen
> Nutzer (2026-10-22): Phase 4 erst GANZ ZUM SCHLUSS (nach 5–7) – vorher dem Nutzer Bescheid geben, er stellt den Aufwand um.
| # | Punkt | Status | Vermerk |
|---|---|---|---|
| 4.1 | Render-Culling Sichtradius + Puffer (Messung vorher/nachher) | ⬜ | |
| 4.2 | Zonenwechsel ruckelfrei, Nachbar inkrementell vorladen, Entitäten drüben sichtbar | ⬜ | |
| 4.3 | Übergang überall an der Zonenkante | ⬜ | |
| 4.E | Phase-Ende | ⬜ | |

## Phase 5 – Assets verteilen
| # | Punkt | Status | Vermerk |
|---|---|---|---|
| 5.1 | `!verteilen` + `weitere` verteilen, Duplikate prüfen, Credits | ⏸ | 2026-10-22 (2): 453 + 54 GLBs liegen da, sind aber OneDrive-„Nur online“-Platzhalter (Lesen: „Clouddateianbieter wird nicht ausgeführt“) → Nutzer: Rechtsklick `!verteilen` → „Immer auf diesem Gerät behalten“. Credits.txt hat keine Zeilen für die neuen Modelle. Editor-Bibliothek liegt nur in IndexedDB (kein Repo-Index) → Weg klären. Analyse-Skript im Scratchpad (`skripte/analyse.mjs`) |

## Phase 6 – Editor
> Läuft parallel per Subagent (nur `editor/**`, Editor-Tests); 6.2 macht die Hauptsitzung (Spiel-Bodentextur).
| # | Punkt | Status | Vermerk |
|---|---|---|---|
| 6.1 | Boden-Pinsel (Schnee, Rasen …) | ✅ | Pinsel rund/eckig + Fransen (`kern/raster.js pinsel/pinselStrich`, `zustand.setzePinsel`), alle Bodenkacheln als Pinsel im Katalog |
| 6.2 | Weicher Übergang Rasen → Asphalt/Holz | ✅ | `bodenTextur.js #grasRand` (eigener Durchgang; Verlauf 7 px + Büschel, Eckfleck diagonal; Böden `GRAS_RAND_BOEDEN`) |
| 6.3 | Bug: Messen bleibt in der Hand | ✅ | Werkzeugwechsel leert Maßband, Esc → Auswahl, Enter nur bei laufender Messung |
| 6.4 | Zonen: anfügen als Standard, nicht überlappen, verschieben/skalieren, max 10000² | ✅ | `kern/weltLayout.js`, Anfügen Standard, max 10000, verschieben (Z/Weltkarte, „Lage eingeben“), Größe ändern in andere Zone wird abgelehnt |
| 6.5 | Strg+C: Objekte + Text in Eingabefeldern | ✅ | `auswahl.kopiereElemente`; Textfelder/markierter Text bleiben beim Browser (`befehle.istTextEingabe`) |
| 6.6 | Im Spiel (3D) direkt mappen: hinzufügen/entfernen | ✅ | `ui/ansicht3d.js` Klick setzt Objekte/Bauwerke/Marker (grün/rot), Touch: 1. Tipp Vorschau, 2. Tipp setzen |
| 6.7 | Werkstatt: Gelenke (Armature/Bones) | ✅ | `kern/knochen.js` + `ui/werkstattKnochen.js`, in `werkstatt.zeigeListen` eingebunden; Export als glTF-Extras |
| 6.8 | Editor-Spielstart: keine Spawn-Warnung für andere Zonen | ✅ | `kern/testlauf.js ersatzStart` nur in den Testdaten |
| 6.E | Phase-Ende | ✅ | `npm test` 377 grün, `rauchtest:editor --schnell` ohne Fehler; Tests `tests/editorRunde18.test.js`. Offen: 6.6/6.7 nicht von Hand geprüft, Zonen-Verschieben nicht per Strg+Z |

## Phase 7 – KI im Editor
> Läuft im selben Editor-Subagenten wie Phase 6.
| # | Punkt | Status | Vermerk |
|---|---|---|---|
| 7.1 | Kachel-/Größenlimit entfernen | ✅ | 2500-Kachel-Grenze weg (`gemini.baueKontext`, `kiPipeline.rahmenUm`, Text-zu-Karte); ab 40 000 nur Warnung |
| 7.2 | Markieren aus dem KI-Chat, auch außerhalb der Zonen | ✅ | Chat-Knopf „⬚ Bereich für die KI markieren“, `zustand.kiBereich` darf außerhalb liegen; „Zone vergrößern“/„Neue Zone dort“ |
| 7.3 | Loot-Balance-Vorschläge werden alle abgelehnt → Fix | ✅ | Ursache: ohne Markierung fehlte das Aktionsformat → `ortloseAnleitung()` immer; `kiImport.js` toleranter (Zone per Name, wert-Varianten, %) |
| 7.E | Phase-Ende | ✅ | siehe 6.E |

## Abschluss
| # | Punkt | Status | Vermerk |
|---|---|---|---|
| A.1 | Gesamt-Rauchtest, Bericht | ⬜ | |

## Entscheidungen / Defaults (kurz)
- (wird beim Arbeiten ergänzt)

## ⏸ SICHERUNGSPUNKT 2026-10-22 (Limit fast leer) – HIER WEITERMACHEN
- Commit „Runde 18 Zwischenstand Phase 2/3“ enthält Phase-2-Server/Client + Eis. Phase 1 ist committed + gepusht.
- **Laufende Subagenten (Ergebnisse evtl. verloren, ggf. neu starten):**
  - Blender-Agent: Clips `gehen, sitzen, spitzhacke, hacke, abbauen, nahkampf` in `werkzeuge/assets/figuren/figuren_bauen.py` → `client/assets/3d/figur_*.glb` (`npm run assets:figuren`). Prüfen: Clipnamen in den GLBs (node, JSON-Chunk). Renderer nutzt sie schon automatisch (Fallback, wenn fehlen). Danach `GEH_TEMPO` (renderer.js, Platzhalter 55) an Fußtempo des Walk-Clips anpassen; Sitz-Hüfthöhe prüfen (mit Clip KEIN `SITZ_TIEFE`).
  - Editor-Agent: Phase 6 (ohne 6.2) + Phase 7 in `editor/**` – uncommittete Editor-Änderungen liegen im Arbeitsbaum (nicht von mir committet!). Prüfen mit `git status`/`npm test`, Rauchtest `npm run rauchtest:editor -- --schnell`, dann committen.
- **Offen Phase 2:** Rauchtest (Haltungen Pistole unten/10 s, Nahkampf beidhändig, Messer, Lampe nur nachts; Sitzen mit Ä; Zerlegen per Linksklick; Hacken-Schlag).
- **Offen Phase 3:** 3.2 Angeln nur mit Angel IN DER HAND (angelSystem `behandleAngelKlick`: `spieler.inventar.some(angel)` → ausgerüsteter Slot prüfen; Client-Hinweis `#angelWinkel` in clientSpiel ebenso) + Dauer ×2 (`konfiguration.angeln` wartenMin/Max 6/18, bissMin/Max bleiben); 3.3 Auto an Laternen bremsen (`G:physik/fahrzeug.js` / `fahreHindernisseUm` → Tempo z. B. ×0,6 beim Umfahren); 3.4 Vogelgezwitscher (clientSpiel: Tag + draußen + nicht Schnee? → Ereignis `vogel` in `eigeneSounds.EREIGNISSE` + Synth-Rezept in `sound.js`, zufällig alle 8–25 s); 3.5 Sound-Platzhalter `magen_knurren, durst, schaden_mann, schaden_frau, keuchen, donner, automatikgewehr` (EREIGNISSE + Rezept; auslösen: Hunger<20, Durst<20, eigener Schaden je Körper, Ausdauer leer, Gewitter/Regen zufällig, Automatikwaffe-Schuss falls vorhanden).
- **Dann:** Phase 5 (wartet auf Dateien in `!verteilen`), Phase 6/7 (Editor-Agent einsammeln + 6.2 weicher Rasenrand in `client/darstellung/bodenTextur.js`), **Phase 4 erst ganz zum Schluss und vorher Nutzer Bescheid geben** (Aufwand umstellen).
- Commits: `git -c user.name=Claude -c user.email=noreply@anthropic.com commit …` (keine Git-Identität gesetzt), nur eigene Dateien adden.

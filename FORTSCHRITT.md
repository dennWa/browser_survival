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
| 2.1 | Sitz-Animation neu (Blender), Taste „ä“ überall, Lagerfeuer im Sitzen nutzbar | ⬜ | |
| 2.2 | Leerer Quickslot wählbar (Hand leer) | ⬜ | |
| 2.3 | Ruhehaltung lässig; Waffe/Pistole(10 s)/Nahkampf beidhändig/Messer einhändig/Lampe | ⬜ | |
| 2.4 | Abbau-Animationen passend zu Händen/Werkzeug | ⬜ | |
| 2.5 | Hacke: kurzer Schlag beim Feld anlegen/entfernen | ⬜ | |
| 2.6 | Platzierte Objekte mit Axt/Spitzhacke/Hammer abbauen (5 s) | ⬜ | |
| 2.E | Phase-Ende | ⬜ | |

## Phase 3 – Weltmechaniken & Sounds
| # | Punkt | Status | Vermerk |
|---|---|---|---|
| 3.1 | Eis begehbar mit Rutschen, kein Angeln auf Eis | ⬜ | |
| 3.2 | Angeln nur mit Angel in der Hand, Dauer ×2 | ⬜ | |
| 3.3 | Auto bremst an Laternen | ⬜ | |
| 3.4 | Vogelgezwitscher (Tag, draußen) | ⬜ | |
| 3.5 | Sound-Platzhalter: Magenknurren, Durst, Schaden m/w, Keuchen, Donner, Automatikgewehr | ⬜ | |
| 3.E | Phase-Ende | ⬜ | |

## Phase 4 – Performance & nahtlose Zonen
| # | Punkt | Status | Vermerk |
|---|---|---|---|
| 4.1 | Render-Culling Sichtradius + Puffer (Messung vorher/nachher) | ⬜ | |
| 4.2 | Zonenwechsel ruckelfrei, Nachbar inkrementell vorladen, Entitäten drüben sichtbar | ⬜ | |
| 4.3 | Übergang überall an der Zonenkante | ⬜ | |
| 4.E | Phase-Ende | ⬜ | |

## Phase 5 – Assets verteilen
| # | Punkt | Status | Vermerk |
|---|---|---|---|
| 5.1 | `!verteilen` + `weitere` verteilen, Duplikate prüfen, Credits | ⏸ | 2026-10-22: `!verteilen` enthält nur `Credits.txt`, kein Ordner `weitere` → Nutzer muss Dateien ablegen |

## Phase 6 – Editor
> Läuft parallel per Subagent (nur `editor/**`, Editor-Tests); 6.2 macht die Hauptsitzung (Spiel-Bodentextur).
| # | Punkt | Status | Vermerk |
|---|---|---|---|
| 6.1 | Boden-Pinsel (Schnee, Rasen …) | ⬜ | |
| 6.2 | Weicher Übergang Rasen → Asphalt/Holz | ⬜ | |
| 6.3 | Bug: Messen bleibt in der Hand | ⬜ | |
| 6.4 | Zonen: anfügen als Standard, nicht überlappen, verschieben/skalieren, max 10000² | ⬜ | |
| 6.5 | Strg+C: Objekte + Text in Eingabefeldern | ⬜ | |
| 6.6 | Im Spiel (3D) direkt mappen: hinzufügen/entfernen | ⬜ | |
| 6.7 | Werkstatt: Gelenke (Armature/Bones) | ⬜ | |
| 6.8 | Editor-Spielstart: keine Spawn-Warnung für andere Zonen | ⬜ | |
| 6.E | Phase-Ende | ⬜ | |

## Phase 7 – KI im Editor
> Läuft im selben Editor-Subagenten wie Phase 6.
| # | Punkt | Status | Vermerk |
|---|---|---|---|
| 7.1 | Kachel-/Größenlimit entfernen | ⬜ | |
| 7.2 | Markieren aus dem KI-Chat, auch außerhalb der Zonen | ⬜ | |
| 7.3 | Loot-Balance-Vorschläge werden alle abgelehnt → Fix | ⬜ | |
| 7.E | Phase-Ende | ⬜ | |

## Abschluss
| # | Punkt | Status | Vermerk |
|---|---|---|---|
| A.1 | Gesamt-Rauchtest, Bericht | ⬜ | |

## Entscheidungen / Defaults (kurz)
- (wird beim Arbeiten ergänzt)

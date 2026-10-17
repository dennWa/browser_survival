# Bestandsaufnahme (Phase 0) – Grundlage des Objektkatalogs

> Kurz, für KIs. Stand v0.13.1. Quelle: `server/spiel/karten/{stadtrand,waldweg}.js`, `kartenLader.js`, `gemeinsam/welt/*`,
> `gemeinsam/basisbau/teile.js`, `konfiguration/*`, `client/darstellung/kartenModell.js`. Maschinenlesbar: `editor/kern/katalog.js`.

## Kartenformat (Spiel, `kartenLader.verarbeiteKarte`)
`{ id, name, kacheln: string[] (ASCII, alle Zeilen gleich lang), raeume: { a–z: { name, lootTabelle } }, objekte: [...], uebergaenge?: [...], ankuenfte?: {...} }`
- Koordinaten in **Kacheln** (1 Kachel = 32 px = 1 m). x nach rechts, y nach unten, (0,0) oben links.
- Objekt: `{ typ, x, y, b, h, blockiert?, ebene?, drehung?, ... }` – x/y/b/h dürfen Brüche sein (Bäume 3.5 …).
  Lader setzt `blockiert` (bool), `ebene` (Standard `'moebel'`), `drehung` (Standard 0), bei `baum|baum_herbst|stein` `groesse` (per Hash), bei `licht` `radius 4, farbe '#ffd9a0', staerke .85, flackern, mast`.
  Alle anderen Felder werden vom Lader **verworfen** (außer Licht-Felder).
- Kollision Möbel: jede Kachel, deren **Mittelpunkt** im Rechteck liegt (`berechneMoebelKollision`). Ressourcen (Stein/Erz) eigene Kollision.
- Autos (`FAHRZEUG_MODELLE`) werden beim Laden zu Fahrzeug-Entitäten (fahrbar), nicht Möbel.
- Übergang: `{ x, y, b, h, ziel, ankunft, name }` (Kachel-Rechteck, ganz in der Karte). Ankunft: `{ name: { x, y } }` nicht in Wand.
- `ladeKarte` dünnt Wälder aus (35 % der Bäume weg, fester Hash) – nur echte Zonen, nicht Tests/Editor-Test.

## Kacheln (`gemeinsam/welt/kacheln.js`)
| Zeichen | Name | blockiert | Besonderes | Editor-Kategorie |
|---|---|---|---|---|
| `,` | gras | nein | baubar (Basisbau), Hasen | Böden / Umwelt |
| `_` | asphalt | nein | | Wege |
| `=` | strasse | nein | Markierungen prozedural | Wege |
| `-` | gehweg | nein | Platten prozedural | Wege |
| `.` | fliesen | nein | **innen** | Böden |
| `:` | beton | nein | **innen** | Böden |
| `+` | holz | nein | **innen** | Böden |
| `T` | tuer | nein (Tür-Logik) | nebeneinander = 1 Tür (max 4) | Mauern |
| `#` | wand | ja | Sicht blockiert | Mauern |
| `F` | fenster | ja | Sicht blockiert (Glas) | Mauern |
| `~` | wasser | ja | `sichtFrei`, Angeln | Umwelt |

Marker (werden beim Laden durch Untergrund = erster begehbarer Nachbar L,R,O,U ersetzt):
`S` Spieler-Start (≥1 Pflicht) · `Z` Zombie-Spawn (Konvention: nur draußen) · `a`–`z` Loot-Punkt des Raums (Raum muss in `raeume` stehen).
Innen = Kachel mit `innen: true` (`Welt.istInnen`) oder Bauwerk-Dach. Zombies sehen nicht hinein.
Nicht vorhanden: Schotter, Sand, Erde (neuer Kacheltyp = `kacheln.js` + `bodenTextur.js` + `TILESET_FARBEN` – nicht Teil des Editors).

## Kartenobjekte (in Karten benutzt; Anzahl stadtrand+waldweg)
| typ | Größe (b×h) typ. | blockiert | ebene | Darstellung | Editor-Kategorie |
|---|---|---|---|---|---|
| baum (380) | 3.5×3.5 | nein | oben | prozedural, Ressource Holz (Axt) | Ressourcen + Umwelt |
| baum_herbst (185) | 3.5×3.5 | nein | oben | dto. | Ressourcen + Umwelt |
| busch (138) | 1.5×1.5 | nein | oben | prozedural | Umwelt |
| stein (72) | 1×1 | ja | moebel | Fels, Ressource Stein (Spitzhacke) | Ressourcen |
| eisenerz (58) | 1×1 | ja | moebel | Fels, Ressource Eisenerz | Ressourcen |
| licht (67) | 1×1 | nein | licht | Lampe (+`radius,farbe,staerke,flackern,mast`) | Gebäude |
| werkbank (5) | 2×1 | ja | moebel | Quader, Crafting | Gebäude |
| bett (14), bett_orange (3) | 2×4 / 1×2 | ja | moebel | Sprite-Deckel | Möbel |
| tisch (17) | 2×1, 3×1, 3×2 | ja | moebel | Sprite | Möbel |
| tisch_rund (7) | 1×1, 2×2 | ja | moebel | Sprite | Möbel |
| stuhl (11) | 1×1 | **nein** | moebel | Sprite | Möbel |
| sessel (5), sessel_blau (6) | 1×1 | ja | moebel | Sprite, drehung 0/180/270 | Möbel |
| sofa (6), sofa_dunkel (5) | 3×1, 8×1 | ja | moebel | Sprite | Möbel |
| kiste (31), kiste_klein (16) | 1×1 | ja | moebel | Sprite | Möbel |
| pflanze (13) | 1×1 | ja | moebel | Sprite (Topfpflanze) | Möbel |
| kueche_theke (16) | 1×n / n×1 | ja | moebel | Sprite | Möbel |
| kueche_herd/spuele/kochfeld | 1×1 | ja | moebel | Sprite | Möbel |
| fass (6) | 0.9×0.9 | ja | moebel | Sprite | Möbel |
| pylone (4) | 0.8×0.8 | nein | moebel | Sprite | Wege |
| teppich (3), teppich_gruen (1) | 4×3, 9×3 | nein | boden | Bodentextur | Böden |
| blutfleck (3), blutlache (4), oelfleck (2) | ~1.5×1.5 | nein | boden | Bodentextur | Böden |
| markierung (20) | 0.12×3.4 | nein | boden | weiße Linie | Wege |
| auto_schwarz/blau/rot/gruen/gelb, transporter | 5.5×3 (quer) | ja | moebel | **Fahrzeug-Entität** | Fahrzeuge |

Möbelhöhen (3D): `MOEBEL_HOEHE` in `kartenModell.js`. Unbekannter Typ → Quader 20 hoch, Ersatzfarbe.

## Bauwerke (Spieler-gebaut, `gemeinsam/welt/bauwerke.js` BAUWERKE; 1 Kachel, je Ebene boden|objekt|wand|tuer|dach)
werkbank, lagerfeuer, schmelzofen, falle, beet, holzboden, holzwand, holzwand_fenster, holzwand_tuer, holztuer, holzdach, zaun, zauntor, kiste (Lagerkiste), bett.
Kosten/Menü: `gemeinsam/basisbau/teile.js`. In Karten bisher nicht vorhanden → Editor-Erweiterung `bauwerke: [{ typ, tx, ty, drehung? }]` (kartenfest, ohne Besitzer).

## Spawns / Loot / Tiere / Wetter (heute global, `spielKonfiguration.js`)
- zombie: respawnZeit 120, nachtHorde 8, nachtTempoFaktor 1.2, respawnMindestAbstand 360, varianten normal/laeufer/brocken. Ein Zombie je `Z`.
- loot: spawnChance 0.7, respawnZeit 300. Tabellen (`lootTabellen.js`): apotheke op labor lager patientenzimmer kantine sicherheit eingangshalle notaufnahme zombie boss verwaltung kueche wohnung tankstelle werkstatt supermarkt polizei waffenkammer kiosk angler huette.
- tiere (Hasen): hasenProTausend 2 (je 1000 Graskacheln), hasenMax 12, hasenRespawn 150; überall auf Gras.
- wetter: dauerMin 60, dauerMax 300, pauseMin 90, pauseMax 420, regenAnteil 0.6 (Rest Nebel), aktiv.
- Musik: Ordner `client/musik/<zonenId>/` + `alle/`.

## Items (für Loot-Tabellen, `gegenstaende.js`)
nahrung, getraenk, medizin, nahkampf, fernkampf, munition, material, rucksack, bauwerk, werkzeug, samen (64 Items).

## Darstellung (`client/darstellung/`)
Nur 3D (Three.js). Boden = Canvas-Textur der ganzen Karte (`bodenTextur.js`, Atlas `client/assets/atlas.json` → `umgebung.boden` gras/beton/fliesen/holz, `umgebung.objekte` = Möbel-Draufsichten). Wände instanziert, Bäume prozedural (`baumModell.js`).

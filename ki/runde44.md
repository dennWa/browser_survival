# Runde 44 (2026-11-08) – Figuren neu gerigged, Skelett-Zombie, Modellpakete, Lager mit Palisade/Tor/Buffet
Werkzeuge alle unter `werkzeuge/assets/r44/` (numpy; `glbwerk.py` = glTF lesen/schreiben ohne trimesh/scipy, läuft auch in Blender-Python). Lokal: kein trimesh/scipy, Blender 5.2 unter `C:/Program Files/Blender Foundation/Blender 5.2/blender.exe` (`-b --factory-startup --python … -- args`), PIL nur im System-Python.

## Spielerfiguren (`client/assets/3d/figuren/*.glb`, „Characters_ Extras“)
- `baue_figuren_r44.py` (Blender) ersetzt `r32/baue_figuren_r32.py`. Quelle `!!!verteilen/characters__extras.glb` (statisch, keine Clips).
- ⚠ r32-Fehler (Ursache „Arme steif/verbuggt“): A-Pose-Suche nahm den WEITESTEN Punkt (Mantelsaum) als Fingerspitze → Arm-Knochen senkrecht → Arme hingen an UpperArm/Shoulder. Jetzt: seitlich äußerster Punkt (y > 0,6).
- Gewichte: Blender Automatic Weights (Bone Heat) auf verschweißter Kopie (`bone_heat(v, f, strecken)`), ≤ 4 Einflüsse; Rückfall Abstandsformel. Textur Original 512 PNG (vorher 256 JPEG), Normalen übernommen.
- ⚠ Weiß-Glühen: `renderer.#survivorMaterial` setzte emissive = color (weiß bei Texturfiguren) → abends weiß. Jetzt `emissiveMap = map`.
- Clips weiter zur Laufzeit aus `figur_mann.glb` (gleiche Knochennamen) → laufen/hacken/sitzen/zielen 1:1 wie Standardfigur, für Mann + Frau.

## Skelett-Zombie (`client/assets/3d/zombies/skelett.glb`)
- `baue_skelett_r44.py` (2 Stufen: `python … texturen`, dann Blender `-- modell`). Quelle `model_0.obj` + `ZombieBB_MAT_*.png` (ssaraksh, CC-BY), in LAUFPOSE modelliert.
- Rig = Mann-Skelett per FK auf `LANDMARKEN` (cm, OBJ-Raum, von Hand gemessen) gelegt; eigene Knochenlängen → Clips nur Rotationen (+ Root/Body/Hips-Translation). Füße am Schienbein (Quaternius-`Foot.*` = IK-Ziel am Root!).
- Clips aus Mann-Clips mit Welt-Achsen-Versatz (`baue_clips`): stehen (Buckel, Schwanken, Kopf zuckt), gehen (×1,45 langsamer, Arme vor, Hinken), rennen, angriff, sterben. Textur 1024 JPEG (Albedo×AO) + Normalmap.
- C `renderer.ZOMBIE_MODELLE.skelett` (`eigeneTextur: true` → kein Zombie-Atlas; Clip `sterben` → Leiche bleibt). `zombieModellFuer`: normal + laeufer → skelett; Sonder-Varianten bleiben `gruen` (Tönung/Anbauteile), brocken/halb unverändert. GLB-Zombies: `angriff`/`sterben` LoopOnce.

## Modellpakete → `client/assets/eigene/` (Spielordner-Modelle, Editor/Studio-Katalog)
- `zerlege_pakete_r44.py`: Some interior pack → `si-*` (14 Möbel, Front +z; Kühlschrank mit Türen; Automat ohne offene Tür), Stone Pack → `sp-fels-gross-1..5`, `sp-fels-1..5`, `sp-stein-1..8`, `sp-runenstein-1..7` (Normalmap, Runen leuchten), Grass patches → `gp-gras-1..3` (cm→m, Alpha MASK). Texturen ≤ 512 px.
- `baue_blumen_r44.py` (Blender): Poly Haven flower_empodium/gazania → `ph-blume-*` (8 blühende, ≤ 900 △).
- `baue_lager_modelle_r44.py`: prozedural + Poly-Haven-Texturen (CC0) → `lg-palisade` (3,6 m Segment, Querbalken auf Modell −z), `lg-palisadentor` (zu), `lg-zelt`, `lg-zelt-gruen`.
- Höhen/Kategorien: `eigene_kategorien.mjs` (HOEHEN, Regeln `^si-` möbel, `^lg-` bau, `^sp-|^gp-|^ph-blume-` natur). ⚠ `npm run eigene:vorschau` braucht globales Playwright (fehlt) → Maße/Vorschau-PNGs per Browser-Pane mit `editor/ui/modellImport.js` (`vorschauBild`, `messeModell`) + `masseAusGroesse` erzeugt; `index.json` braucht `masse`, sonst KeyError in Generatoren.
- Credits: `credits.json` (photon, ashkan.fancy, DJMaesen, ssaraksh, Poly Haven).

## Büsche unsichtbar (Fix)
- `baumModell.ladeBaumVariante` lieferte `null`, wenn ein GLB keine `rinde` hat – `busch_*.glb` sind reine Laubkronen → alle Büsche unsichtbar. Jetzt `rinde || laub`; `kartenModell` setzt fehlende Rinde auf leere Geometrie.

## Lagerplatz (`werkzeuge/karten/lager.py` → `S:karten/lager.js`)
- 93×89: `RING = 30` Wald drumherum. Palisade (`lg-palisade`, Drehung N 180 / S 0 / W 90 / O 270 → Balken innen), Tor `lg-palisadentor` blockiert. Übergang = 2×3 Kacheln INNEN vor dem Tor (`uebergangSekunden` 5 s Countdown wie überall), Ankunft `ost` 5 Kacheln davor.
- Gartenbänke auch Nord/Süd (hell), Tischbänke am langen Tisch NICHT blockierend (Buffet erreichbar). Zelte `lg-zelt*`, 4 Bäume innen, Steine/Runensteine, 22 Grasbüschel, 13 Blumengruppen; Natur-Streuung `naturKonfiguration.ZONEN.lager` (Gras + wenige Blumenkarten).
- **Buffet:** Kartenfeld `spawnpunkte` mit `buffet: true` → `spawnpunkte.pruefeSpawnpunkt` erlaubt Intervall ab `BUFFET_INTERVALL_MIN` (10 s); `lootSystem` legt Buffet-Punkte auch nach, wenn Spieler daneben stehen. `hoehe` = Tischhöhe. ⚠ Generator: Spawnpunkte mit `schiebe()` verschieben (Innen-Raum → Karte).
- **Objekt-Feld `z`** (m, nur Optik): `kartenLader` → `objekt.z`; `kartenModell.#eigeneLage` hebt das Modell an (Teller/Becher auf Tischen).
- Renderer: Items mit `hoehe` (auf Möbeln) ×`ITEM_AUF_MOEBEL` 0,5 (Boden-Items sind absichtlich groß).
- Stimmung dunkler: `SONNENUNTERGANG.sonnenStaerke 1,25 / umgebungStaerke 0,62`, Hintergrund 0x8a4a3c (vorher Sonne ≥ 2,1, Umgebung ≥ 1,0).

## Performance
- `kartenModell.#baueEigeneModelle`: gleiche eigene Modelle (Typ + Maße + Skalierung, ohne Animation, kein abbaubarer Fels) ab `INSTANZ_AB` 3 → InstancedMesh je Teil-Mesh (`#eigeneInstanziert`); Rest einzeln (`#eigenesEinzeln`). Lager ~170 Draw-Calls je Render-Durchgang.

## Tests / Prüfen
- `tests/runde44.test.js`; angepasst: `runde42` (≤ 100 Kacheln, Buffet statt „kein Loot“, Blick per cos), `runde43` (Palisade zu, Übergang innen, Ring ≥ 25), `inhalte`/`karte` (Items mit `hoehe` auf Möbeln: Greifweite statt freie Kachel).
- Screens ohne sichtbares Fenster: Canvas `toDataURL` → `PUT /api/editor/datei?pfad=client/audio/karten/<ordner>/<name>.wav` (nur Audio-Endungen erlaubt, Inhalt egal) → nach `.jpg` kopieren, lesen, Ordner danach löschen.

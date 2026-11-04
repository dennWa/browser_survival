# Runde 32 (2026-11-04) – Nutzer-Modellpakete + viele Einzelwünsche
> Quellen NICHT im Repo: `verteilen bitte/*.zip` (OBJ-Rips, entpackt nach `verteilen bitte/_entpackt/<Paket>/model_N.obj`) + Sketchfab-Sammlung „survival“ (dennWa) per API (Token nur lokal, NIE committen) nach `verteilen bitte/_sketchfab/<uid>.glb`. Credits: `client/assets/eigene/credits.json`.

## Werkzeuge
- `werkzeuge/assets/r32/modellwerk.py`: OBJ/GLB laden (trimesh), Farben backen (Textur→Flächenfarbe), `ohne_splitter` (Rip-Artefakte: lange flächenlose Dreiecke), Zerlegen (`komponenten`, `gruppiere`, `gruppiere_nah` KD-Baum), Software-Renderer `render/kontaktbogen` zum Sichten, `schreibe_glb` (flach, NORMAL float, COLOR_0 Uint8-VEC4 linear, optional UV+Textur, Alpha=MASK, RGBA-Texturen als Palette-PNG).
  ⚠ NORMAL muss rein: three.js-GLTFLoader berechnet fehlende Normalen NICHT (Modelle schwarz).
- `sichte.py <quelle> <png> [--zerlege d --nah --splitter k --bild tex]` = Kontaktbogen.
- `baue_r32.py [baeume steine gras essen steak waffen tiere deko]` → Ausgaben unten. `baue_figuren_r32.py` → Figuren.

## Ausgaben / Einbau
- Bäume `client/assets/3d/baeume/`: `laubbaum_00..11` (Trees Low Poly, Laubkarten ×1,7 vergrößert), `kiefer_n0..2`, `kiefer_herbst`, `nadel_0..7` (nur Rinde), `busch_0..3`. Alte Quaternius-Bäume gelöscht. `baumModell.BAUM_MISCHUNG` inkl. `busch` (Büsche sind jetzt Modellbäume). ⚠ `kartenModell`: Laub-Material JE VARIANTE (verschiedene Texturen).
- Gras `3d/natur/` (gras, gras_hoch, gras_wispy_a/b, blumen): Karten aus Atlas „Gras, Blumen…“ (VIS-All), grün getönt, fächernd geneigt (von oben sichtbar). `naturModell` grasMaterial `alphaTest 0.5`. `naturKonfiguration`: RASEN für gras/wiese/rasen, ZONEN stadtrand+waldweg an. ⚠ Profil „niedrig“ (auch Auto-Absenkung) blendet Gras aus.
- `client/darstellung/glbGeometrien.js`: `ladeGlbGeometrien(datei)` (Map name→{geometrie, material|null}), `einpassen`, `R32_MATERIAL`.
- Steine: `r32_steine.glb` (3 Varianten je Block), Eisenerz `r32_eisenerz.glb` (Fels + ROTE Brocken = Object_17 aus „Ore and crystals“); Steine nur noch um y gedreht.
- Items (`itemModelle.ladeR32ItemModelle`, `itemMaterialFuer` – Renderer nutzt das Material): `r32_essen.glb` (ESSEN-Tabelle in baue_r32.py, texturiert), `r32_steaks.glb` (fleisch = roh_*, fleisch_gebraten = gebraten_*, Varianten nach Item-ID), `r32_rohstoffe.glb` (stein, eisenerz). steak-1/2.glb gelöscht.
- Waffen `r32_waffen.glb` (WAFFEN-Rechtecke im Layout des Rips): `waffenModelle.R32_WAFFEN` (laenge px, griff-Anteil, muendung, dreh) → katana, speer, (vorschlag)hammer, bogen, sturmgewehr/mp, pistole/revolver, granate, taschenlampe. Rest (Schilde, Doppelaxt, Dynamit, RPG) nur `r32_waffe_*.glb` (Editor). `ladeR32Waffen` beim Renderer-Start. `geometrie.vereineGeometrien` übernimmt vorhandene Vertexfarben, wenn `farbe` null.
- Haustiere: Hund/Katze = `r32_tier_hund/katze.glb` (PS1-Pack, statisch, Bewegung prozedural). Übrige PS1-Tiere `r32_tier_*.glb` als Deko.
- Figuren: `client/assets/3d/figuren/<id>.glb` (+figuren.json) = „Characters_ Extras“ auf das Skelett von figur_mann.glb gerigged (A-Pose: Oberarme gedreht, Gewichte 2 nächste Knochenstrecken, Seiten getrennt, IBM = Inverse der A-Pose). Clips kommen aus figur_mann (gleiche Knochennamen). `aussehen.figur` (standard + mann_33..45, sheriff, sheriff_b, frau_34..46; Option `koerper`, `pruefeAussehen` setzt unpassende zurück). Renderer `#r32Figur` lädt lazy, `#figurSchluessel` → Neubau nach dem Laden; eigene Figuren ohne Kleidungsschichten/Frisur. Charakter-Editor blendet Figuren des anderen Geschlechts aus, Vorschau baut nach dem Laden neu (`figur.wartet`).
- Zelt: Bauwerk `zelt` (teile.js Kosten `ast: 5`, Einrichtung; Schlafplatz + Spawn wie Schlafsack, `bettQualitaet.zelt 0.8`), Modell `r32_zelt.glb` (moebelModelle case 'zelt').
- Deko im Editor-Katalog: r32_fels_*, r32_erzpack_*, r32_fass_*, r32_eichenstamm, r32_stumpf_0..7, r32_holzbau_*, r32_hazmat_0/6, r32_vorrat (Packungen), r32_tier_*.
- Nicht nutzbar (gesichtet): Low Poly Landscape Set (Terrain ohne Farben), Trees & Bushes Pack (ohne Farben), Gras-Demo-Modelle (Rip kaputt), Military Tents (zerfallen).

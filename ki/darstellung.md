# 3D-Darstellung (Renderer, Karte, Boden, Bäume, Effekte, Kamera, Ego)
> Lesen bei: Optik/Grafik/Performance im Spiel. Licht/Himmel/Wetter → ki/licht_wetter.md · Figuren/Animation → ki/figuren.md · Modelle beschaffen → ki/assets.md
> Nur 3D (Three.js r186, `client/vendor/three/`, importmap). Kürzel: C: `client/` · G: `gemeinsam/`
> ⚠ `C:darstellung/renderer.js` (2.900 Z.), `kartenModell.js` (1.200 Z.) nie ganz lesen: `npm run ki:gliederung -- --ohne-konst <datei>` → gezielt `sed -n`.

## Renderer (`C:darstellung/renderer.js`, Klasse `Renderer`)
- Ablauf je Bild `zeichne(tageszeit, …)`: Kamera-Lerp (`KAMERA_VERSATZ`, `zoom` ∈ `ZOOM_MIN..ZOOM_MAX`, `istAbstand`) → `#tageslicht` → Figuren `#aktualisiereFiguren` → Fahrzeuge/Tiere/Leichen/Bauwerke/Items/Effekte → Lampen-Pool → `karte.kulle` + `blendeMastenAusserhalb` → `gl.render` → Silhouette/Tür-Umrisse → Overlay (`C:darstellung/beschriftung.js`: Namen, Sprechblasen, Item-Namen ≤ `ITEM_NAMEN_RADIUS`).
- Ladebild: `bereiteVor(welt, fortschritt)` baut `KartenModell.baueSchrittweise` in 40-ms-Portionen → `setzeWelt` (Texturen hoch, `#vorkompilieren` alle Shader) → `warteBisRuhig`.
- Qualität: `GRAFIK_PROFILE` hoch/mittel/niedrig + „auto“ (`C:darstellung/geraet.js erkenneGeraet`, gelernt in localStorage `browserSurvival.grafikAuto`), adaptive `QUALITAETS_STUFEN` (`#passeAufloesungAn`, Schattentakt, Baum-Details), MSAA nur beim Anlegen. ⚠ Profilwerte nur über `#profil()` (auto hat keine eigenen). FPS-Limit `C:kern/spielSchleife.js MAX_FPS` 60 (`localStorage.bs_maxfps`). F3 = `statistik()` (Draw-Calls, Stufe).
- WebGL-Kontextverlust: `webglcontextlost` (preventDefault) → `kontextVerloren`, Kasten `#grafik-absturz` (main.js).
- Kamera-Adapter `KameraAdapter` (unten in renderer.js): `weltZuBildschirm`, `bildschirmZuWelt` (Brusthöhe `ZIELHOEHE`), `bildschirmZuBoden`.

## Karte (`C:darstellung/kartenModell.js`, Klasse `KartenModell`)
- Boden in `BODEN_BLOCK`-Blöcken (Textur aus `C:darstellung/bodenTextur.js renderePortionen`, Speicherdeckel `BODEN_SPEICHER_MB`), Culling `C:darstellung/bloecke.js` (`BlockInstanzen`, `kulle(kamera, weite)`).
- Wände `#baueWaende` (Ziegel/Holz/Putz `C:darstellung/wandTexturen.js`), Dächer `C:darstellung/dachModell.js` (Walmdach je Gebäude, `offenesGebaeude` beim Betreten, Ego: Decke `dachDoppelseitig`), Wand-Durchsicht `C:darstellung/wandDurchsicht.js` (nur Südwände des eigenen Raums), Innen-Abschirmung `renderer.#innenAbschirmung` (4 Clipping-Planes, immer gesetzt; draußen `INNEN_WEIT`), Türen schwingen + Schimmer (Layer `TUER_EBENE`, ≤96 px).
- Ressourcen `#baueRessourcen` (Bäume/Büsche/Steine/Erz in 12×12-Kachel-Chunks, InstancedMesh je Variante; Stümpfe als Pools aus `assets/3d/baeume/stumpf.glb`; Rinde-Helligkeit), Lampen/Laternen (Mast-Instanzen, Bodenschein `lampenSchein`), Lichterketten, Wasser `#baueWasser` + nasse Straßen/Dachtropfen `C:darstellung/nasseStrassen.js`.
- Eigene Modelle (Karten-`typen` mit `glbDatei`): `C:darstellung/eigeneModelle.js` (Laden/Klonen, Animationen `leerlaufMischer`, Skelett-Messung) → `#baueEigeneModelle`: gleiche Modelle ab `INSTANZ_AB` 3 instanziert, Rest einzeln; Objekt-`z` hebt an; abbaubare Felsen über `ressourcenGruppen`.

## Boden · Bäume · Natur
- `C:darstellung/bodenTextur.js`: prozedurale Kacheln (Asphalt-Tönung `#weicherTon`, Innenböden `#innenBoden`, Steg, Schnee/Eis) + Fotos `client/assets/boden/<name>.jpg` (← `werkzeuge/assets/baue_boeden.py`, `#fotoStueck` weltfest), weiche Übergänge `#weicheRaender`/`WEICHE_BOEDEN`, Malschicht `C:darstellung/malSchicht.js`. ⚠ Alles deterministisch aus Weltkoordinaten (Blöcke müssen nahtlos passen) – nie `Math.random`.
- Bäume `C:darstellung/baumModell.js`: Varianten `client/assets/3d/baeume/*.glb` + `baeume.json`, `BAUM_MISCHUNG` je Zone (`standard`, `waldweg`), `LAUB_AUSGELASSEN`, Büsche `BUESCHE`, Wind-Shader `baumWindMaterial` (`BAUM_WIND`), Stammdicke `STAMM_BREITE`. Laub-Material je Variante; Platzhalter-Map → kein Shader-Neubau beim Tausch.
- Gras/Blumen `C:darstellung/naturModell.js` + `naturKonfiguration.js` (`ZONEN`: nur `lager` an; Profil niedrig = aus). Blätter `blaetterEffekt.js`, Bodennebel `bodenNebel.js` (morgens).

## Effekte & Kleinkram
`effekte.js` (Ereignisse → Partikel/Licht) · `sonderEffekte.js` (Spucke, Explosion, Würfe, Brände) · `einschlaege.js` · `blutspuren.js` · `fussspuren.js` · `reifenspuren.js` · `muellEffekt.js` · `itemModelle.js` (Bodenitems: prozedural + `r32_*`-GLBs; auf Möbeln ×`ITEM_AUF_MOEBEL`) · `geometrie.js vereineGeometrien` · `glbGeometrien.js`.

## Ego-Ansicht (`C:ego/egoModus.js`, Taste C / Knopf `#hud-ego`)
- Kamera im Kopf via `renderer.egoHaken`; Sichtweite `#egoSichtweite` (= Draufsicht bei `ZOOM_MAX`); Dächer bleiben zu (Decke); im Auto Fahrtrichtung; beim Abbau Blick fixiert; im Sitzen Kamera am Kopf-Knochen (`#kopfAugen`). Entfernbar laut `docs/EGO_PROTOTYP.md`.

## Fallen ⚠
- Silhouette: `szene.background` während des Stencil-Passes auf null (sonst löscht render() den Puffer).
- Jede neue Schattenkarte (Licht neu/umgebaut) braucht `shadow.needsUpdate = true`, wenn `autoUpdate` zeitweise aus ist (sonst Schwarzbild nachts – Repro `node werkzeuge/test/qualitaetswechsel.mjs`).
- Nebel/`camera.far`/Himmel-Schnitt aus `istAbstand`, nicht aus `zoom`. Kamera-Lerp läuft im Ego nicht.
- InstancedMesh mit aus-/einblendbaren Instanzen: `frustumCulled = false` (oder Chunks mit fester boundingSphere). `renderOrder`/Schatten bei `BlockInstanzen` an den `meshes` setzen.
- Skelett-GLBs erst nach `updateMatrixWorld(true)` + `skeleton.update()` messen (`Box3.setFromObject(…, true)`), sonst ~100× falsch; Skinned Meshes `frustumCulled=false`. GLBs brauchen NORMAL (three berechnet keine → schwarz).
- `#mitSchnitt` = No-Op bei `SCHNITT_RADIUS` 0 (`discard` killt Early-Z).
- Software-GL (Playwright) ≈ 2–10 FPS: Klicks ≥ 600 ms halten, Messungen über Frames.

## Prüfen
`npm run ansicht -- --kamera spiel,oben,weit [--zone …] [--zeit 22]`. Tests (meist Quelltext-Prüfungen): `bloecke`, `wandDurchsicht`, `runde26` (Kontextverlust, Innen), `runde36`–`runde38`, `runde44`.

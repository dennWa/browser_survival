# 3D-Darstellung (Renderer, Karte, Boden, Bäume, Effekte, Kamera, Ego)
> Lesen bei: Optik/Grafik/Performance im Spiel. Licht/Himmel/Wetter → ki/licht_wetter.md · Figuren/Animation → ki/figuren.md · Modelle beschaffen → ki/assets.md
> Nur 3D (Three.js r186, `client/vendor/three/`, importmap). Kürzel: C: `client/` · G: `gemeinsam/`
> ⚠ `C:darstellung/renderer.js` (2.900 Z.), `kartenModell.js` (1.200 Z.) nie ganz lesen: `npm run ki:gliederung -- --ohne-konst <datei>` → gezielt `sed -n`.

## Renderer (`C:darstellung/renderer.js`, Klasse `Renderer`)
- Ablauf je Bild `zeichne(tageszeit, …)`: Kamera-Lerp (`KAMERA_VERSATZ`, `zoom` ∈ `ZOOM_MIN..ZOOM_MAX`, `istAbstand`) → `#tageslicht` → Figuren `#aktualisiereFiguren` → Fahrzeuge/Tiere/Leichen/Bauwerke/Items/Effekte → Lampen-Pool → `karte.kulle` + `blendeMastenAusserhalb` → `gl.render` → Silhouette/Tür-Umrisse → Overlay (`C:darstellung/beschriftung.js`: Namen, Sprechblasen, Item-Namen ≤ `ITEM_NAMEN_RADIUS`).
- Ladebild: `bereiteVor(welt, fortschritt)` baut `KartenModell.baueSchrittweise` in 40-ms-Portionen → `setzeWelt` (Texturen hoch, `#vorkompilieren` alle Shader) → `warteBisRuhig`.
- Qualität: `GRAFIK_PROFILE` hoch/mittel/niedrig + „auto“ (`C:darstellung/geraet.js erkenneGeraet`, gelernt in localStorage `browserSurvival.grafikAuto`), adaptive `QUALITAETS_STUFEN` (`#passeAufloesungAn`: Schattengröße/-takt, Baum-Details – nie die Auflösung). ⚠ Profilwerte nur über `#profil()` (auto hat keine eigenen).
- Grafik-Details (⚙ → „Details anpassen“): `C:darstellung/grafikEinstellungen.js` `GRAFIK_DETAILS` (Bildrate, Akku sparen, Auflösung, Schatten `SCHATTEN_WAHL`, Lichtquellen `LICHTER_WAHL`→`LICHT_BUDGET`, Kantenglättung, Bodentexturen, Gras), localStorage `browserSurvival.grafikDetails` (+ `bs_maxfps`). „auto“ = Profil; Renderer `setzeDetail` → `#wendeProfilAn` (Profil-Klick `setzeGrafik` setzt Bild-Details auf auto). Wer liest was: `#lichtBudget`, `#schattenWahl`/`#schattenArt`, `#naturAn`, `#stufenAufloesung`, `#bodenMassstab`, `#kantenglaettung` (MSAA nur beim Anlegen; auto aus ab 1,75-facher Pixeldichte), `detailAuto` (Markierung in der UI). `akku: 'immer'` → `powerPreference: 'low-power'` (ab Start).
- Bildrate: `C:kern/spielSchleife.js` fragt je Bild `grenze()` = `bildrateGrenze(details, { amAkku, fensterOffen, imHintergrund })` (clientSpiel: `beobachteAkku` Battery-API, `#spielVerdeckt` = Spielfenster außer ⚙, `document.hasFocus`) → `AKKU_FPS`/`RUHE_FPS` 30. Charakter-Vorschau (Inventar) ≤ 30 FPS.
- Licht-Sätze `LICHT_SAETZE` aus/nah/halb/voll (`#waehleLichtSatz` nach allen Lichtstärken, `#setzeLichtSatz`): Lichter mit Stärke 0 kosten im Shader wie leuchtende → nur der nötige Satz ist `visible` (nah = Taschenlampen/Scheinwerfer/Mündung/Streulicht, halb = + erste Hälfte Lampen-Pool + Kegel, voll = ganzer Pool; Pool ist von vorn belegt). Größer sofort, kleiner nach `LICHT_RUHE_S` und nur wenn kompiliert (`#vorkompilieren` übersetzt die kleinen Sätze ohne Benutzung, `isReady`). Lampen-Pool nur Lampen, deren Lichtkugel das Kamera-Sichtfeld schneidet (+`LAMPEN_RAND`, Pool sortiert nur alle 250 ms). Gemessen: Tag ≈ +55–70 % Bildrate, Pixelvergleich 0 Abweichung.
- F3 = `statistik()`: Draw-Calls/Dreiecke über ALLE Durchgänge des Bildes (`info.autoReset = false`, Reset in `zeichne`), Licht-Satz, MSAA, angepasste Details.
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
- Gras/Blumen `C:darstellung/naturModell.js` + `naturKonfiguration.js` (`ZONEN`: nur `lager` an; Profil niedrig = aus). Draufsicht: Block-Sichtweite = echter Bildausschnitt (`renderer #sichtRadiusBoden`, gedeckelt `NATUR_SICHTWEITE_MAX`), keine LOD-Stufen im Bild → kein Ein-/Ausploppen; Ego bleibt kurz. Blätter `blaetterEffekt.js`, Bodennebel `bodenNebel.js` (morgens).

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
- Neues Licht in der Szene: `layers.enableAll()` (sonst sieht der Silhouetten-/Tür-Durchgang andere Lichter → Licht-Zustand kippt je Bild → three.js sucht für jedes Material das Programm neu, ms-teuer) und in `#setzeLichtSatz`/`#waehleLichtSatz` einordnen. Lichtanzahl/Schattenlicht ändern = neue Shader → nur mit `#vorkompilieren`.
- Zusatz-Durchgänge (`#zusatzDurchgang`) laufen ohne Matrix-Update und mit ausgeblendeten Kartengruppen: dort nichts verschieben; Objekte auf `TUER_EBENE` nicht in `karte.statisch` hängen.
- Software-GL (Playwright) ≈ 2–10 FPS: Klicks ≥ 600 ms halten, Messungen über Frames.

## Prüfen
`npm run ansicht -- --kamera spiel,oben,weit [--zone …] [--zeit 22]`. Leistung messen: `--js` mit `spiel.renderer.statistik()`, Bildrate über Frames; Software-GL ist pixelgebunden (Lichter/Auflösung zeigen sich deutlich, CPU-Gewinne kaum). Tests (meist Quelltext-Prüfungen): `bloecke`, `wandDurchsicht`, `runde26` (Kontextverlust, Innen), `runde36`–`runde38`, `runde44`, `grafikEinstellungen` (Details, Bildrate, Licht-Sätze). Schwarzbild nach Wechsel: `node werkzeuge/test/qualitaetswechsel.mjs`.

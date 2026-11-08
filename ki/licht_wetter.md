# Licht · Tageszeit · Wetter · Himmel
> Lesen bei: zu hell/dunkel, Lichter/Lampen/Taschenlampe, Tag/Nacht/Abendstimmung, Regen/Schnee/Wind/Nebel, Himmel.
> Kürzel: S: `server/spiel/` · C: `client/` · G: `gemeinsam/` · K: `server/spiel/konfiguration/`

## Tageszeit
- Rechnerei `G:tageszeit.js` (helligkeit, istNacht, `morgen`-Rampe, `tageszeitUm(stunde, dauer)`), Uhr `S:systeme/tageszeitSystem.js` (Horde nachts, Blutmond). Zonen mit `festeZeit` (Lager 20.75): Client gibt dem Renderer `licht` statt `uhr` (nur Optik; HUD-Uhr/Server echt).
- Renderer `#tageslicht()` (renderer.js) = Sonne/Mond (`mond` = DirectionalLight mit Schatten), Umgebung, Nebel, Hintergrund nach Paletten `TAG`/`NACHT`/`DAEMMERUNG`/`SPAETABEND` (festeZeit) + `NACHT_MOND`/`NACHT_UMGEBUNG`, Morgen-Dunst, Blutmond, Wolken (`#windWolken`), Gewitter-Blitz. Gibt `dunkel` 0..1 zurück (Lampen, Eigenleuchten). Nachts sollen Nächte dunkel sein: Licht nur aus Lampen/Feuer/Taschenlampe/Scheinwerfer.
- Eigenleuchten nachts: Spieler `NACHT_EIGENLEUCHTEN` (emissiveMap = map), Zombies `ZOMBIE_GRUND_LEUCHTEN` + `ZOMBIE_NACHT_LEUCHTEN`×dunkel.

## Lichter (feste Anzahl → keine Shader-Neubauten)
- `LICHT_BUDGET` je Grafik-Basis (lampen/kegel/taschen/muendung + 2 Scheinwerfer), `#baueLichter()` bei Basiswechsel (→ `#vorkompilieren`). ⚠ three rechnet jedes Licht in jedem Pixel, auch mit Stärke 0.
- Lampen-Pool `#aktualisiereLampenPool`: nur die nächsten Kartenlampen (`karte.lampen`, `licht`-Objekte, Lichterketten, Kerzen, Fackeln, brennende Bauwerke `feuerLampen`, Kamine ×`glanz`) bekommen echtes Licht; Rang-Sortierung, ewiges Lagerfeuer hat `vorrang` (bis `FEUER_VORRANG_WEITE`). Alle Lampen zusätzlich mit additivem Bodenschein.
- Taschenlampen `#aktualisiereTaschenlampen` (`TASCHENLAMPE`, `TASCHENLAMPEN_ANSATZ`, sichtbarer Kegel `#neuerLichtKegel` endet an der ersten Wand, Streulicht drinnen `STREULICHT`); weitere Spieler über dem Budget → `fremdeLampen` (nur Strahl + Bodenfleck `#neuerLichtFleck`). Scheinwerfer `SCHEINWERFER` (nächstes gefahrenes Auto). Fackel in der Hand belegt Pool-Lichter.
- Schatten: `schattenTakt` je Profil/Stufe (`#schattenDran`), Sonne nur bei Intensität > 0,25 aktualisiert, Spot-Schatten nur eigene Lampe. ⚠ Leuchtende Lampe nie mit eingefrorener Schattenkarte (Geisterschatten); neue Schattenkarte → `needsUpdate` (Schwarzbild-Bug Runde 36).

## Wetter
- Server `S:systeme/wetterSystem.js` je Zone: Arten klar|regen|starkregen|gewitter|sturm|nebel (+ Schneezone schnee|schneesturm), Dauer/Pause in Spielzeit (`spuleWetterVor` bei Zeitsprüngen), Wind `aktualisiereWind` (`WIND_STUFEN`, `wetter.windstill` = 0), Nässe `wetter.nass` (Anstieg/Trocknen) → Schnappschuss `wetter`, `wind`, `nass`. Zonen-Einstellungen `einstellungen.wetter` (aktiv, Anteile). `regnet(art)` löscht Feuer, ×2 Wachstum. Konsole `browserSurvival.wetter(art)`.
- Client `C:darstellung/wetterEffekt.js` (Regen/Schnee als GPU-Shader rund um die Kamera, Innen-Maske `setzeInnenMaske` + `aussen`, Blitze `beiBlitz` → Donner, `windStufe` für Bäume/Gras/Blätter, `bewoelkt`, `graustich` → `renderer.#setzeGraustich` CSS-Filter), nasse Straßen `C:darstellung/nasseStrassen.js`, Müll im Wind `muellEffekt.js`. Wetter-Töne → ki/audio.md.

## Himmel · Nebel
- `C:darstellung/himmel.js` (Bildschirm-Shader: Verlauf, Sterne, Wolken) via `#zeichneHimmel`: Kamera schaut nie zum Horizont → `camera.far = HIMMEL_FERNE × Kameraabstand`, Weltkante = Horizont am oberen Bildrand, Dunstband `HIMMEL_DUNST`; Ego: eigene Sichtweite.
- ⚠ Nebel/far aus `istAbstand` (nicht `zoom`); nachts + Regen/Nebel Wettergrau mit Helligkeit² skalieren (sonst „nichts sichtbar“); `fog.near ≥ Kameraabstand·1,04` (Figur nie im Nebel); NaN-Schutz in `#tageslicht`/`wetterEffekt`. Bodennebel drinnen × (1 − innenAnteil).

## Prüfen
`npm run ansicht -- --zeit 22 --kamera spiel` (Nacht), `--js "bs.wetter('gewitter')"`; Lager hat feste Abendzeit. Tests: `runde23` (Wetterarten), `runde24` (Wind P1, Horde P2), `runde26`, `runde38` (Wetter in Spielzeit, Nässe), `runde43`/`runde44_2` (festeZeit, windstill), `mechaniken`.

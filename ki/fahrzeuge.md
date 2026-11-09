# Fahrzeuge (Autos)
> Lesen bei: Fahrphysik, Lenkung, Unfälle/Schaden, Anfahren, Kofferraum/Beifahrer, Auto-Modelle, Scheinwerfer, Reifenspuren.
> Kürzel: S: `server/spiel/` · C: `client/` · G: `gemeinsam/` · K: `server/spiel/konfiguration/` (Werte K `fahrzeug`)

## Dateien
- Physik (Server + Vorhersage, deterministisch): `G:physik/fahrzeug.js` – `FAHRZEUG` {beschleunigung, bremse, rollReibung, lenkWinkel/lenkAbfall/radstand (Einspurmodell), lenkTempo/lenkZurueck, abprallen…}, `fahre`, `passt`, `fahrzeugKacheln`, `ausstiegsPunkt`, `hinterFahrzeug`, `tempoZuKmh` (340 px/s = 70 km/h), `FAHRZEUG_MODELLE`.
- Server: `S:systeme/fahrzeugSystem.js` (ein-/aussteigen, Beifahrer `mitfahrt`/`beifahrerId`, Aufprall `verarbeiteAufprall` + `verletzeInsassen`, `schlageFahrzeug(…, {leise})` (10 Schläge, Wrack + Auswurf), `fahreHindernisseUm` (Bäume ab 10 km/h, Laternen ab 70 km/h), `fahreSpielerAn` (ab 4 km/h, Tod ab 110 km/h), `fahreTiereUeber`, Bombenzombie überfahren, `stosseFahrzeugAn` (unbesetzte schieben), Zonenwechsel mit Auto `loeseFahrzeugFuerWechsel`/`setzeFahrzeugEin`). Entität `S:entitaeten/fahrzeug.js` (leben/maxLeben/kaputt, kofferraum[10], lenkung, tank/reifen/batterie, antrieb).
- Auto-Teile `S:systeme/autoTeileSystem.js` (K `fahrzeug.teile` {tankMax 40, verbrauchProPx, kanisterLiter 20, spawnVoll}): `fz.tank` (Liter), `fz.reifen` 0–4, `fz.batterie`; `aktualisiereTeile` (Verbrauch je gefahrenem px mit Fahrer) setzt `fz.antrieb` – false = in `fahre` kein Gas, nur Ausrollen/Bremsen. AKTION `auto` {was: tanken|reifenRein|reifenRaus|batterieRein|batterieRaus} (Items `benzin`, `reifen`, `autobatterie`; Loot Tankstelle/Werkstatt). Auto-Menü = Kofferraum-Ansicht mit Feld `auto` (`kistenSystem`, `kisteFenster #zeigeAuto`, Taste G/Tab), Einsteigen ohne Teile meldet „springt nicht an – es fehlt: …“, HUD-Tacho zeigt ⛽. `spawnVoll: true` = alle Autos starten komplett (Nutzer-Wunsch; false = ohne Sprit/Reifen/Batterie, für später).
- Client: Modelle `C:darstellung/fahrzeugModelle.js` (prozedural sofort, `GLB_AUTOS` ersetzt Karosserie, `altere()` Rost-Shader, `faerbeWrack`), Renderer `#aktualisiereFahrzeuge` (Neigung), Scheinwerfer `#aktualisiereScheinwerfer`, Reifenspuren `C:darstellung/reifenspuren.js`, Tacho `hud.zeigeTacho` (setzt `.im-auto` → Touch-Layout fürs Fahren).

## Fallen ⚠
- `fz.lenkung` muss über `spielerZuNetzwerk` (Reconciliation) UND `fahrzeugZuNetzwerk` mit; Ein-/Aussteigen setzt 0.
- Lenkung nur in freie Pose drehen (`passt(…, winkel)`, Fallback ½/¼) – nie Winkel ungeprüft ändern; `steckt` = Freifahr-Modus.
- Fahrzeug-Kacheln blockieren auch die Vorhersage; Client entfernt Kacheln von Autos, die nicht mehr im (gefilterten) Schnappschuss sind.
- `fz.antrieb` muss im Fahrer-Paket (`spielerZuNetzwerk`) mit, sonst sagt die Vorhersage „Vollgas“ und der Server „kein Sprit“ → Ruckeln. Teile laufen über Weltstand (`pruefeTeile`, alte Stände = voll) und Zonenwechsel mit.
- Crash/Laterne/Überfahren sind stumm (`fahrzeugSchaden.leise`), Zombie-Schläge/Schüsse aufs Auto nicht.

## Tests
`fahrzeuge`, `runde14` (Aufprall, Bäume/Laternen, Roadkill), `runde38` (Anfahren), `zonen` (Auto fährt mit, Kofferraum drüben), `runde29` (beschießbar), `runde47` (Teile, Verbrauch, Tanken, Antrieb).

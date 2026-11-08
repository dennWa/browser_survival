# Fahrzeuge (Autos)
> Lesen bei: Fahrphysik, Lenkung, Unfälle/Schaden, Anfahren, Kofferraum/Beifahrer, Auto-Modelle, Scheinwerfer, Reifenspuren.
> Kürzel: S: `server/spiel/` · C: `client/` · G: `gemeinsam/` · K: `server/spiel/konfiguration/` (Werte K `fahrzeug`)

## Dateien
- Physik (Server + Vorhersage, deterministisch): `G:physik/fahrzeug.js` – `FAHRZEUG` {beschleunigung, bremse, rollReibung, lenkWinkel/lenkAbfall/radstand (Einspurmodell), lenkTempo/lenkZurueck, abprallen…}, `fahre`, `passt`, `fahrzeugKacheln`, `ausstiegsPunkt`, `hinterFahrzeug`, `tempoZuKmh` (340 px/s = 70 km/h), `FAHRZEUG_MODELLE`.
- Server: `S:systeme/fahrzeugSystem.js` (ein-/aussteigen, Beifahrer `mitfahrt`/`beifahrerId`, Aufprall `verarbeiteAufprall` + `verletzeInsassen`, `schlageFahrzeug(…, {leise})` (10 Schläge, Wrack + Auswurf), `fahreHindernisseUm` (Bäume ab 10 km/h, Laternen ab 70 km/h), `fahreSpielerAn` (ab 4 km/h, Tod ab 110 km/h), `fahreTiereUeber`, Bombenzombie überfahren, `stosseFahrzeugAn` (unbesetzte schieben), Zonenwechsel mit Auto `loeseFahrzeugFuerWechsel`/`setzeFahrzeugEin`). Entität `S:entitaeten/fahrzeug.js` (leben/maxLeben/kaputt, kofferraum[10], lenkung).
- Client: Modelle `C:darstellung/fahrzeugModelle.js` (prozedural sofort, `GLB_AUTOS` ersetzt Karosserie, `altere()` Rost-Shader, `faerbeWrack`), Renderer `#aktualisiereFahrzeuge` (Neigung), Scheinwerfer `#aktualisiereScheinwerfer`, Reifenspuren `C:darstellung/reifenspuren.js`, Tacho `hud.zeigeTacho` (setzt `.im-auto` → Touch-Layout fürs Fahren).

## Fallen ⚠
- `fz.lenkung` muss über `spielerZuNetzwerk` (Reconciliation) UND `fahrzeugZuNetzwerk` mit; Ein-/Aussteigen setzt 0.
- Lenkung nur in freie Pose drehen (`passt(…, winkel)`, Fallback ½/¼) – nie Winkel ungeprüft ändern; `steckt` = Freifahr-Modus.
- Fahrzeug-Kacheln blockieren auch die Vorhersage; Client entfernt Kacheln von Autos, die nicht mehr im (gefilterten) Schnappschuss sind.
- Crash/Laterne/Überfahren sind stumm (`fahrzeugSchaden.leise`), Zombie-Schläge/Schüsse aufs Auto nicht.

## Tests
`fahrzeuge`, `runde14` (Aufprall, Bäume/Laternen, Roadkill), `runde38` (Anfahren), `zonen` (Auto fährt mit, Kofferraum drüben), `runde29` (beschießbar).

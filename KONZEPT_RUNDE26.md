# Konzept Runde 26

Stand: 31.10.2026. Erst das Konzept, umgesetzt wird nach Freigabe. Gearbeitet wird direkt auf `main`.

## Block A – Bugs und Sound (schnelle Siege)

| # | Problem | Vermutete Ursache | Plan |
|---|---|---|---|
| A1 | Draußen ist kein Regen mehr zu hören | Die neue Innen-Dämpfung (Runde 25) schaltet den Regen-Kanal wohl zu früh oder dauerhaft auf 0 (z. B. `istInnen` bleibt hängen oder der Wert wird beim Zonenwechsel nicht zurückgesetzt) | Regen-Lautstärke = Wetterstärke × (innen ? gedämpft : 1), mit weicher Überblendung. Dazu ein Test für „draußen ist Regen hörbar“ |
| A2 | Wind ist konstant und der Loop zu kurz | Ein einziger kurzer Clip, der immer mit gleicher Lautstärke läuft | **Windstärke als Wetterwert vom Server** (0 = Flaute, 0,3 = leises Säuseln, 1 = stürmisch), der sich langsam ändert. Neue CC0-Windaufnahme mit **60–120 s Länge, nahtlos geschnitten** (Überblendung am Loop-Punkt, per Browser-Decoder wie in CLAUDE.md). Zwei Ebenen: ein leiser Grundwind und gelegentliche Böen als One-Shots mit zufälligem Abstand. Bei gutem Wetter oft ganz still |
| A3 | Nach den Einstellungen ist alles neblig | Beim Schließen des Menüs werden Nebel und Sichtweite neu gesetzt, wahrscheinlich mit dem Zoom- bzw. Kameraabstand 0 oder einem veralteten Wert (`renderer.js` ~254/508), oder der Wetter-Übergang startet bei 0 | Nachstellen (Einstellungen öffnen und schließen, auch mit Größenänderung oder Qualitätswechsel), dann Nebel nach dem Schließen sofort vom aktuellen Kameraabstand und Wetter neu berechnen. Rauchtest „Einstellungen → zurück → Spielfigur sichtbar“ |
| A4 | Zombies zu laut | – | Zombie-Lautstärke um etwa 25 % senken (eigener Faktor im Mixer) |
| A5 | Im Haus | Der Regen ist zwar weg, aber der Blick nach draußen wirkt unstimmig | **Variante B (dein Vorschlag):** Ist man innen, wird alles außerhalb des Gebäudes **abgedunkelt** (dunkler Schleier, Außenwelt fast schwarz, kein Regen sichtbar). Das passt gut zum Survival-Gefühl, denn man weiß nicht, was draußen lauert. Technisch nutzen wir die vorhandene Innen-Erkennung: Außenblöcke werden per Shader/Overlay stark verdunkelt, Fenster lassen später vielleicht etwas Licht durch. *Alternative A* (Regen draußen weiter sichtbar, nur nicht im Raum) ginge auch, ist aber aufwendiger (Regen-Maske pro Raum) |

## Block B – KI-Export aus dem Map-Editor

Ziel: Eine fremde KI ohne Projektwissen bekommt **2 Dateien** und kann damit eine Zone sinnvoll bearbeiten.

1. **`editor/KI_REGELN.md`** (fest, wird immer mitgeschickt), generiert und von Hand ergänzt:
   - Worum es geht (Spiel, Kachelraster, Koordinaten, Ebenen: Boden, Wände, Möbel, Objekte, Zonen, Spawns, Übergänge)
   - Das **Antwortformat**: Die KI antwortet ausschließlich mit einem JSON-Block im Schema `ki-aenderung v1` (`hinzufuegen` / `entfernen` / `aendern`, jeweils mit ID oder Position). Den Block kann der Editor per „KI-Antwort einfügen“ direkt übernehmen, inklusive Vorschau und Rückgängig
   - Regeln: nur bekannte Typ-IDs verwenden, im Bereich bleiben, keine Wege zubauen usw.
   - **Katalog:** alle Bodentexturen, Modelle, Möbel, Gegenstände und Sounds mit ID, Kurzbeschreibung, Größe und Kategorie
2. **Katalog automatisch statt per Hand:** `npm run ki:katalog` erzeugt den Katalogteil aus den echten Registern (Asset-Liste, `client/assets/eigene/`, Sounds, Möbeltypen). Ein **Test schlägt fehl, wenn der Katalog veraltet ist**. Damit landen neue Modelle oder Sounds garantiert in der Datei, und das ist ab jetzt Pflicht (kommt so auch in `CLAUDE.md`).
3. **Zonen-Export** („Für KI exportieren“): enthält **alles** im markierten Rechteck, also jede Kachel (Boden), Wände, Türen, Möbel und Objekte mit genauer Position, Drehung und Freiposition, Ressourcen, Spawns, Loot, Übergänge, Dächer bzw. Innenräume, Höhen und Zonen-Eigenschaften. Kompaktes, aber eindeutiges Format (Legende oben, Boden als Lauflängen-Raster, Objekte als Liste). Für dich kaum lesbar, für die KI glasklar 😄

## Block C – Bauen im 3D-Modus des Editors

- Im 3D-Ansichtsfenster kann man Objekte setzen, auswählen, verschieben und drehen. Per Raycast auf den Boden gibt es eine Vorschau als halbtransparentes „Geister“-Modell
- **Freie Platzierung:** Objekte bekommen optional `frei: {x, y, dreh}` (Bruchteile von Kacheln). **Raster-Einrasten bleibt Standard**, mit gedrückter Shift-Taste (oder per Schalter) wird frei platziert. Kollision wird aus der Modellgröße berechnet, der Server (`server/spiel/`) lernt die Freipositionen kennen
- Gizmo zum Verschieben und Drehen (Three.js `TransformControls`), dazu Tasten R = drehen, Entf = löschen. Touch: tippen = setzen, halten und ziehen = verschieben
- Kartenexport (`npm run karte:editor`) übernimmt die Freipositionen

## Block D – Neue Assets

- **Untergründe:** ein CC0-Pack mit Gras, Erde, Kies, Asphalt, Gehweg, Pflaster, Waldboden und Schlamm, z. B. von **ambientCG** oder **Poly Haven** (CC0), heruntergerechnet auf 256–512 px und passend zum Low-Poly-Stil. Dazu **weiche Übergänge** zwischen den Böden (Blend-Kanten), damit es nicht nach Schachbrett aussieht. Eingepflegt wird über den Editor bzw. die Asset-Pipeline, damit das Spiel sie übernimmt. Credits kommen nach `credits.json` und in den Katalog
- **Waffen:** ein Low-Poly-Pack, z. B. **Quaternius** oder **Kenney** (CC0): Messer, Machete, Axt, Baseballschläger, Pistole, Gewehr, Schrotflinte, Bogen. Sounds von **Kenney** oder **freesound** (CC0, Schüsse, Nachladen, Schläge). Animationen: Schwingen, Rückstoß und Nachladen machen wir prozedural, weil Packs selten passende Animationen mitbringen. Spiellogik: neue Waffentypen mit Schaden, Reichweite, Munition und Haltbarkeit
- Ich prüfe vor dem Download Lizenz, Größe und Stil und liste dir die Kandidaten kurz auf, bevor ich sie einbaue

## Reihenfolge (Vorschlag)

1. **A1–A5** (Bugs und Sound, sofort spürbar)
2. **B** (KI-Export und Katalog, die Grundlage für alles Weitere)
3. **D: Untergründe** (danach gleich im Editor nutzbar)
4. **C** (3D-Bauen, das größte Paket)
5. **D: Waffen**

## Später (vorgemerkt, noch nicht dran)

- **Map-Editor als lokales Programm**, z. B. als Electron- oder Tauri-Hülle um den bestehenden Web-Editor: direkt auf Dateien arbeiten, schneller, offline. Deshalb bauen wir den Editor jetzt schon so, dass er nicht vom Spielserver abhängt.

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

## Block B – KI-Karten-Anleitung und Zonen-Export

Ziel: Eine fremde KI ohne Projektwissen bekommt **2 Dateien**, baut damit eine Karte bzw. Zone und antwortet so, dass ich die Antwort **1:1 in den Editor einfügen** kann (der vorhandene Import `editor/kern/kiImport.js` macht daraus eine Vorschau mit Rückgängig).

### Datei 1: `editor/KI_KARTEN_ANLEITUNG.md` (immer mitschicken)
Der Fokus liegt auf dem Karte-Bauen, das Spiel wird nur kurz erklärt.
1. **Worum es geht (5 Zeilen):** ein Low-Poly-Zombie-Survival von oben bzw. in 3D, Zonen wie Stadtrand oder Waldweg, Häuser zum Durchsuchen, Loot, Übergänge zwischen Zonen
2. **So ist eine Karte aufgebaut:** Kachelraster (Größe, Koordinaten x/y, Ursprung oben links), Ebenen (Boden → Wände/Türen → Möbel/Objekte → Ressourcen → Räume/Dächer/Innen → Loot-Zonen → Spawns → Übergänge), dazu Drehung, Freiposition und Zonen-Werte (Wetter, Musik …)
3. **Darauf achten (Bauregeln):** Wege nicht zubauen, Türen brauchen freie Kacheln davor und dahinter, Häuser sind geschlossen und haben einen Raum mit Dach, Übergänge liegen am Rand, Loot passt zum Raum (Küche → Essen), nur IDs aus dem Katalog, nur im markierten Bereich ändern, Dichte und Abwechslung beachten
4. **So antwortest du (das Wichtigste):**
   - nur ein einziger ```json-Block, sonst nichts
   - Format `browser-survival-ki-aenderungen` mit `meta` (Zone, Bereich) und `aktionen` (setze / entferne / aendere / kachel / raum / lootzone / prefab …), zu jeder Aktion ein Beispiel
   - ein vollständiges Mini-Beispiel (z. B. „kleine Hütte mit Tür, Tisch, Kiste und Kiesweg“)
   - Fehler, die der Editor ablehnt (unbekannte ID, außerhalb des Bereichs, belegte Kachel)
5. **Katalog: was es alles gibt**, eine Tabelle je Kategorie mit ID, Kurzbeschreibung, Größe in Kacheln und Hinweis. Kategorien: Bodentexturen, Wände/Türen/Fenster, Möbel, durchsuchbare Behälter, Natur (Bäume, Büsche, Steine), Fahrzeuge/Wracks, Prefabs (fertige Häuser), Gegenstände/Loot-Tabellen, Zombie- und Tier-Spawns, Sounds/Musik/Ambiente, eigene `.glb`-Modelle

### Katalog bleibt automatisch aktuell
- Teil 5 erzeugt `npm run ki:katalog` aus den echten Registern, die Teile 1–4 schreibe ich von Hand
- Ein Test schlägt fehl, wenn der Katalog veraltet ist. **Jedes neue Modell, jede Textur und jeder Sound landet so zwangsläufig in der Datei** (kommt als Regel auch in `CLAUDE.md` und `KI_INDEX.md`)
- Im Editor gibt es einen Knopf „Anleitung kopieren/herunterladen“

### Datei 2: Zonen-Export („Für KI exportieren“)
Der Export enthält **alles** im markierten Rechteck: jede Bodenkachel, Wände, Türen, Möbel und Objekte (ID, Position, Drehung, Freiposition, Inhalt), Ressourcen, Räume/Dächer/Innen, Loot-Zonen, Spawns, Übergänge, Höhen, Zonen-Werte und die Nachbarschaft am Rand (was direkt außerhalb anschließt). Das Format ist kompakt, aber eindeutig: oben eine Legende, der Boden als Raster mit Kürzeln, Objekte als Liste. Für Menschen kryptisch, für die KI ein offenes Buch 📖

## Block C – Bauen im 3D-Modus des Editors

- Im 3D-Ansichtsfenster kann man Objekte setzen, auswählen, verschieben und drehen. Per Raycast auf den Boden gibt es eine Vorschau als halbtransparentes „Geister“-Modell
- **Freie Platzierung:** Objekte bekommen optional `frei: {x, y, dreh}` (Bruchteile von Kacheln). **Raster-Einrasten bleibt Standard**, mit gedrückter Shift-Taste (oder per Schalter) wird frei platziert. Kollision wird aus der Modellgröße berechnet, der Server (`server/spiel/`) lernt die Freipositionen kennen
- Gizmo zum Verschieben und Drehen (Three.js `TransformControls`), dazu Tasten R = drehen, Entf = löschen. Touch: tippen = setzen, halten und ziehen = verschieben
- Kartenexport (`npm run karte:editor`) übernimmt die Freipositionen

## Block D – Neue Assets

- **Untergründe:** ein CC0-Pack mit Gras, Erde, Kies, Asphalt, Gehweg, Pflaster, Waldboden und Schlamm, z. B. von **ambientCG** oder **Poly Haven** (CC0), heruntergerechnet auf 256–512 px und passend zum Low-Poly-Stil. Dazu **weiche Übergänge** zwischen den Böden (Blend-Kanten), damit es nicht nach Schachbrett aussieht. Eingepflegt wird über den Editor bzw. die Asset-Pipeline, damit das Spiel sie übernimmt. Credits kommen nach `credits.json` und in den Katalog
- **Waffen:** ein Low-Poly-Pack, z. B. **Quaternius** oder **Kenney** (CC0): Messer, Machete, Axt, Baseballschläger, Pistole, Gewehr, Schrotflinte, Bogen. Sounds von **Kenney** oder **freesound** (CC0, Schüsse, Nachladen, Schläge). Animationen: Schwingen, Rückstoß und Nachladen machen wir prozedural, weil Packs selten passende Animationen mitbringen. Spiellogik: neue Waffentypen mit Schaden, Reichweite, Munition und Haltbarkeit
- Ich prüfe vor dem Download Lizenz, Größe und Stil und liste dir die Kandidaten kurz auf, bevor ich sie einbaue

## Reihenfolge (vom Nutzer festgelegt)

1. **A1–A5** Bugs/Sound + Innen-Abdunkeln + Performance drinnen ✅ (Innen = abdunkeln, entschieden)
2. **D: Untergründe**
3. **C** 3D-Bauen im Editor
4. **D: Waffen**
5. **B** KI-Karten-Anleitung + Zonen-Export – **ganz zum Schluss**

## Später (vorgemerkt, noch nicht dran)

- **Map-Editor als lokales Programm**, z. B. als Electron- oder Tauri-Hülle um den bestehenden Web-Editor: direkt auf Dateien arbeiten, schneller, offline. Deshalb bauen wir den Editor jetzt schon so, dass er nicht vom Spielserver abhängt.

# Konzept: Mit Freunden spielen (DayZ-Anlehnung)

Stand 2026-11-09 · Status: **Teil A in Runde 47 umgesetzt** (Details in den `ki/*.md`), Teil B ist die Merkliste.

## 1. Entscheidungen (Nutzer)

- **Funkgerät:** Jeder startet mit einem Funkgerät im Inventar. Man kann es an-/ausschalten und eine Frequenz einstellen; wer auf derselben Frequenz funkt, hört sich – egal wie weit weg. Push-to-Talk-Taste stellt jeder selbst in den Einstellungen ein (C war doppelt belegt).
- **Kartenmarker:** Auf der großen Karte (M) per Rechtsklick eine Markierung setzen und einen Text hineinschreiben.
- **Emotes:** Vorerst keine Körper-Animation – eine Taste öffnet eine Emoji-Auswahl, das Emoji schwebt kurz über dem Kopf.
- **Andere verarzten:** Verband & Co. auch am Mitspieler benutzen.
- **Ducken/Schleichen:** Langsamer (≈ normales Gehen), passende Hock-Animation auf allen Charaktermodellen; Tempo später feinjustieren.
- **Auto-Teile:** Autos brauchen Sprit, Reifen und Batterie. Vorerst spawnen sie zu 100 % fahrbereit; die Teile liegen als Loot auf der Karte. Ein Auto-Menü zeigt, was fehlt.
- **Heli-Absturz:** Ca. alle 10 Minuten stürzt in einer zufälligen Zone ein Helikopter ab – Wrack mit Loot, ~5 Zombies stehen schon drumherum.
- **Server hosten:** Multiplayer → „Server hosten“: Einstellungen (u. a. PvP an/aus) beim Erstellen festlegen, Freunde per Einladungscode/Link einladen, der Host kann kicken, alles wird beim Host gespeichert.

## 2. Teil A – Runde 47 (Umsetzung)

| Thema | Kern | Status |
|---|---|---|
| Tastenbelegung | Sprechen, Funken, Ducken, Emotes … frei belegbar (⚙ Einstellungen) | ✅ umgesetzt |
| Funkgerät | Item im Start-Inventar, an/aus, Frequenz, Funk-PTT, Funk-Klang | ✅ umgesetzt |
| Emotes | Emoji-Auswahl, Emoji über dem Kopf für alle sichtbar | ✅ umgesetzt |
| Kartenmarker | Rechtsklick auf Karte → Text; Gruppe sieht die Marker | ✅ umgesetzt |
| Verarzten | Verband/Schiene/Medizin am Mitspieler | ✅ umgesetzt |
| Ducken | Tempo ≈ Gehen, Zombies bemerken einen später, Hock-Haltung | ✅ umgesetzt |
| Auto-Teile | Tank, 4 Reifen, Batterie, Verbrauch, Auto-Menü, Loot | ✅ umgesetzt |
| Heli-Absturz | Event ~10 min, zufällige Zone, Wrack + Rauch + Loot + 5 Zombies | ✅ umgesetzt |
| Server hosten | Browser-Host per WebRTC, Einladungscode/Link, Kick, PvP-Schalter | ✅ umgesetzt |

## 3. Teil B – Merkliste (später)

- Dauerhafter Online-Server ohne Datenverlust (Render Free vergisst Spielstände bei Neustart).
- Namen über Köpfen + Mitspieler-Punkte auf der Karte nur für die Gruppe (mit PvP sonst eingebauter Wallhack).
- Kompass/GPS als Items, Ping auf der Karte.
- Raiden: Zahlenschloss für Türen/Kisten, Brechstange/Säge statt nur Sprengstoff.
- Militär-Zone/Flugplatz als Endgame mit Hochrisiko-Loot.
- Verstecke vergraben (Stash), Fesseln & Ausrauben (nur PvP).
- Server-Rekorde (längstes Leben), Gruppenziele (Funkturm, Generator, Auto zusammenbauen).
- Echte Emote-Animationen (winken, Hände hoch, zeigen).

# Map-Editor – Anleitung

Der Map-Editor baut Zonen (Karten) für Browser Survival – im Browser, ohne Server und ohne Konto.
Start: im Anmeldebildschirm des Spiels auf **🗺 Map-Editor** (oder direkt `…/editor/`).

> **Grundsatz:** Alles, was du tust, landet in einem **Entwurf** (lokal im Browser gespeichert, IndexedDB).
> Das Spiel ändert sich erst, wenn du **veröffentlichst** und die heruntergeladene Datei ins Repo legst.
> Der Editor selbst schreibt nie Repo-Dateien – auch nicht auf dem Server.

## Aufbau

| Bereich | Wofür |
|---|---|
| **Kopfleiste** | Zone wählen · ➕ Neu · 📂 Öffnen · 💾 Speichern · 📤 Export · 🤖 KI-Import · ▶ Testen · ↶ ↷ · 2D/3D · ? |
| **Seitenleiste links** | Kategorien: Wege, Mauern, Böden, Umwelt, Gebäude, Ressourcen, Möbel, Fahrzeuge, Spawns, Loot, Tiere, Wetter, Terrain, Räume, Zonen, Eigene |
| **Bauleiste unten** | Einträge der gewählten Kategorie (z. B. Wege → Asphalt, Straße, Gehweg, Laterne …) |
| **Werkzeugleiste** (auf der Fläche) | Auswahl, Schwenken, Pinsel, Rechteck, Linie, Füllen, Radierer, Pipette, Zone, Drehen, Pinselgröße |
| **Fläche** | Lineale oben/links mit Kachelnummern; die Koordinate unter der Maus steht unten in der Statusleiste |
| **Panel rechts** | Eigenschaften der Auswahl · Zone (Name, ID, Größe, Zonen-Werte) · Prüfung (Fehlerliste, Klick springt hin) · Zonen · Prefabs |

Koordinaten sind **Kacheln** (1 Kachel = 1 m = 32 px im Spiel), x nach rechts, y nach unten, (0|0) oben links.

## Zone anlegen und öffnen

- **➕ Neu → Rechteck aufziehen:** Ziehe auf der Fläche ein Rechteck – die Zone wird mit **Rasen** gefüllt, sonst nichts.
  Oder „Größe eingeben“. ID: nur `a–z`, `0–9`, `_` (wird der Dateiname im Spiel).
- **📂 Öffnen:** eine Zone aus dem Spiel (Stadtrand, Waldweg …) als **Vorlage** (verlustfrei), einen Entwurf des Projekts
  oder eine Datei (`*.entwurf.json`, `*.karte.json` oder eine rohe Kartendefinition).
- **Größe ändern:** Werkzeug ⤡ (Taste **Z**) und an den Griffen (Ecken/Kanten) ziehen – oder Panel „Zone → Größe ändern…“
  (Ränder einzeln ±). Beim Verkleinern zeigt der Editor, was abgeschnitten würde, und fragt nach.
- Außerhalb der Zone (weißer Rahmen) gibt es nichts zu bauen.

## Malen und Bauen

- **Kacheln:** Kategorie wählen (z. B. Wege), Eintrag anklicken, dann Pinsel (**B**, Größe mit `[` `]`), Rechteck (**U**,
  Umschalt = nur Rand), Linie (**L**), Füllen (**G**). **Mauern** (Wand, Fenster, Tür, Zaun) rasten beim Linienziehen
  waagerecht/senkrecht/45° ein (Umschalt = frei). Radierer (**E**) macht Rasen und entfernt Objekte.
- **Objekte** (Möbel, Bäume, Steine, Lampen, Autos …): Eintrag wählen, Vorschau ist **grün** (passt) oder **rot**
  (blockiert/außerhalb, Grund steht dabei). Klick setzt, **R** dreht um 90°, Umschalt = mehrere hintereinander.
- **Auswahl (V):** Klick wählt, Umschalt = dazu, Ziehen verschiebt (Alt = feine 0,1-Schritte), ins Leere ziehen markiert
  einen **Bereich wie in Excel** (Koordinaten werden angezeigt). Strg+C/X/V, Strg+D duplizieren, Entf löschen, Pfeiltasten.
- **Eigenschaften** im Panel: Typ, Name, x/y/b/h, Drehung (90er-Raster oder frei, z. B. 95°), blockiert, Ebene
  (Möbel/Boden/Krone/Licht), Größe (Bäume/Steine), Licht (Radius, Farbe, Stärke, Flackern, Mast), Farbe/Textur.
- **Rückgängig/Wiederholen** (Strg+Z / Strg+Y) ist unbegrenzt und bleibt über Sitzungen erhalten (steht im Entwurf).

## Speichern

- Automatisch: jede Änderung landet nach ~1 s im Browser (IndexedDB, sonst localStorage). Oben rechts steht der Status.
  Gibt es keinen Speicher (privates Fenster), warnt der Editor – dann **💾 Speichern** (lädt `<id>.entwurf.json` herunter).
- **💾 Speichern** lädt immer zusätzlich die Entwurfsdatei herunter (inkl. Verlauf).

## Touch (Handy/Tablet) – bewusste Ausnahme

Ansehen, **Schwenken und Zoomen** gehen überall (zwei Finger; Hand-Werkzeug ✋ für einen Finger). Malen und Bauen
funktionieren per Tippen, sind aber für **Maus und Tastatur** gebaut – das ist eine bewusste Ausnahme von der
Projektregel „Touch mitdenken“: Kartenbau braucht Präzision, Tastenkürzel und große Bildschirme.

## Veröffentlichen (Karte → Spiel)

📤 Export → **🚀 Veröffentlichen**. Der Editor prüft zuerst (Fehler müssen weg) und bietet zwei Dateien an:

1. **Empfohlen:** `<id>.karte.json` herunterladen, im Repo `npm run karte:editor -- <id>.karte.json` ausführen →
   schreibt `server/spiel/karten/<id>.js` und trägt die Zone in `KARTEN` ein (wie `npm run karte:import` für Tiled).
2. Von Hand: `<id>.js` nach `server/spiel/karten/` legen und in `kartenLader.js` Import + `KARTEN`-Eintrag ergänzen
   (der Dialog zeigt die Zeilen).

Danach `npm test`. Neue Zone mit Übergang? Die Nachbarzone braucht einen Übergang zurück (Prüfung meldet es).

## Tastenkürzel

`?` zeigt alle. Wichtigste: V Auswahl · H Schwenken · B Pinsel · U Rechteck · L Linie · G Füllen · E Radierer · I Pipette ·
Z Zonengröße · R drehen · Strg+Z/Y · Strg+C/X/V · Strg+D · Entf · F ganze Zone · 3 = 2D/3D · Esc.

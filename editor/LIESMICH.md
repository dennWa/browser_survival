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

## Spawns, Loot, Tiere, Wetter (pro Zone)

- **Spawns:** Spieler-Start (mind. einer), Zombie-Spawn (nur draußen – die Vorschau wird im Haus rot), Horden-Spawnpunkt
  (nachts kommt die Horde nur dort, wenn es welche gibt). Am gewählten Zombie-Spawn im Panel: **Anzahl**, **Respawn**, Horde.
- **Loot:** Loot-Punkte gehören zu einem **Raum** (Buchstabe a–z) mit Loot-Tabelle aus `lootTabellen.js`. Im Panel: Tabelle,
  **Loot-Chance** (liegt dort etwas?) und **Nachschub** (Sekunden) je Raum; die Wahrscheinlichkeiten der Tabelle stehen darunter.
- **Tiere:** Hasen-Bereich aufziehen (Kategorie Tiere) – dann spawnen Hasen nur in diesen Bereichen, mit Anzahl und Respawn.
  Ohne Bereiche verteilt das Spiel sie wie bisher auf allen Rasen.
- **Zonen-Werte** (Panel „Zone“): Wetter (an/aus, Regen-Anteil, Dauer, Pausen), Zombies (Dichte, Respawn, Nacht-Horde,
  Nacht-Tempo), Hasen, Loot, Musik-Ordner. **Leer = globaler Standard** – der steht unter jedem Feld; gesetzte Felder sind grün.
- Das Spiel wertet all das aus (`server/spiel/karten/zonenEinstellungen.js`, `kartenLader.js`). Alte Karten ohne diese
  Felder verhalten sich unverändert.

## Räume und Gebäude

- **Räume markieren:** Kategorie „Räume“ → Rechteck aufziehen oder 🪣 Füllen (füllt bis zu Wänden/Türen). Danach Raum wählen
  oder neu anlegen (Name + Loot-Tabelle). Reiter **Räume** zeigt alle Räume mit Loot-Punkten und Flächen.
- **Innen/Außen:** Panel „Zone → Anzeige → Innen/Außen“ färbt alles blau, was das Spiel als „drinnen“ wertet
  (Innenboden oder Dach). Dort sehen Zombies nicht hinein, und dort dürfen keine Zombie-Spawns liegen.
- **Prefabs:** Reiter **Prefabs** – eingebaute Vorlagen (Wohnhaus, Werkstatt, Hütte, Garten mit Zaun, Parkplatz) und eigene.
  Eigene: Bereich markieren → „🏠 Als Prefab“. Einfügen hängt die Vorlage an die Maus (R dreht, Klick setzt, Umschalt =
  mehrfach). Der Zielbereich wird überstempelt; Räume kommen mit (bei Buchstaben-Konflikt wird umbenannt).
  Prefabs lassen sich als `*.prefab.json` speichern und laden.

## Zonen verbinden

- Mehrere Zonen = ein Projekt. Zone wechseln: Auswahlfeld oben. Reiter **Zonen** zeigt die **Weltkarte**: Zonen ziehen
  (rasten an Kanten ein), Klick öffnet sie. Liegen zwei Zonen **Kante an Kante**, sind sie Nachbarn – die Nachbarzone
  erscheint dann blass am Rand der Fläche (Anzeige abschaltbar unter Zone → Anzeige).
- **🔗 Aus Übergängen anordnen** legt Zonen anhand vorhandener Übergänge passend aneinander (z. B. Waldweg nördlich vom Stadtrand).
- **💡 Übergänge vorschlagen** sucht an gemeinsamen Kanten Stellen, die auf beiden Seiten begehbar sind (Straßen und Wege
  zuerst) und legt Übergang + Rückweg + Ankunftspunkte (3 Kacheln landeinwärts) in beiden Zonen an.
- Von Hand: Kategorie **Zonen** → „Übergang (am Rand)“ aufziehen, Zielzone und Ankunft wählen; im Panel „📍 Ankunft in
  der Zielzone setzen“. Die Prüfung meldet: Ziel fehlt, Ankunft fehlt/liegt im Übergang (Ping-Pong), kein Rückweg.

## Mit einer KI arbeiten (Export / Import)

1. **Bereich markieren** wie in Excel: Auswahl-Werkzeug ⬚ (V), ins Leere ziehen. Die Koordinaten („x 20–40, y 10–25“)
   stehen am Rahmen und in der Statusleiste.
2. **📤 Export → 🤖 Ausschnitt für KI** (oder Panel-Knopf): Der Editor erzeugt einen Text mit Bereich, ASCII-Raster mit
   Achsen-Beschriftung, Belegungsraster (welches Objekt wo), Objektliste mit **IDs** und Eigenschaften, Spawns, Loot,
   Übergängen, Räumen – und einer Anleitung, wie die KI antworten soll. „📋 Text kopieren“ und in den KI-Chat einfügen
   (oder die JSON-Datei geben). Ganze Karte: „📄 Ganze Karte als JSON“ + „📝 LIESMICH.txt“ (Feld-Erklärung).
3. Die KI antwortet mit einer **Aktionsliste**, z. B.
   ```json
   [{"aktion":"bereich","zone":"waldweg","x0":20,"x1":40,"y0":10,"y1":25,"pruefsumme":"…"},
    {"aktion":"setze","typ":"baum","x":23,"y":14},
    {"aktion":"entferne","id":17},
    {"aktion":"aendere","id":5,"x":24,"drehung":90},
    {"aktion":"kachel","x":20,"y":12,"b":5,"h":1,"zeichen":"="},
    {"aktion":"linie","von":[20,10],"bis":[30,10],"zeichen":"#"},
    {"aktion":"marker","art":"zombie","x":25,"y":20},
    {"aktion":"bauwerk","typ":"zaun","x":21,"y":11},
    {"aktion":"raum","buchstabe":"d","name":"Scheune","lootTabelle":"werkstatt"}]
   ```
   Alternativ darf sie den Ausschnitt (JSON) verändert zurückgeben – der Editor rechnet die Unterschiede aus.
4. **🤖 KI-Import**: Antwort einfügen (Text drumherum und ```json-Blöcke sind egal) → **Prüfen**. Der Reiter „KI-Import“
   zeigt den **Diff**: ＋ neu (grün), － weg (rot), ～ geändert (gelb), ✗ ungültig (orange, mit Grund) – und hebt alles auf
   der Karte hervor. Ungültige Einträge (unbekannter Typ, außerhalb des Bereichs, Zombie im Haus, Wand im Weg …) werden
   gemeldet und **nicht** übernommen. Nur der markierte Bereich darf sich ändern.
5. **✔ Übernehmen** → ein einziger Verlaufsschritt (Strg+Z macht alles rückgängig). Hat sich die Karte seit dem Export
   geändert, warnt der Editor (Prüfsumme).

## Karte testen

**▶ Testen** prüft zuerst (Spieler-Start vorhanden, keine Zombies im Haus, Übergänge gültig, keine Objekte außerhalb,
Loot-Tabellen bekannt …). Fehler erscheinen als Liste mit Koordinaten – ein Klick springt zur Stelle. Ist alles gut,
öffnet sich das Spiel im **Lokal-Modus mit deinem Entwurf** (alle Zonen des Projekts sind dabei, Übergänge funktionieren).
Der echte Spielstand wird dabei nicht angefasst. Oben im Spiel: **⟵ Zurück zum Editor** – dein Entwurf ist unverändert da.

## 2D/3D, Farben, Gelände, eigene Objekte

- **3D** (Knopf oben oder Taste **3**): dieselbe Karte in der Spielperspektive. Ziehen = schieben, Rechts-/Alt-Ziehen =
  drehen, Mausrad / zwei Finger = Zoom, Klick = auswählen. Die Auswahl ist in 2D und 3D dieselbe. „🎮 Spielperspektive“
  stellt den Kamerawinkel des Spiels wieder her, „⬇ Von oben“ schaut senkrecht.
- **Farbe** (Kategorie Farbe): Palette oder eigene Farbe (Panel), **Pinsel**, **Füllen** (zusammenhängende gleiche Kacheln),
  **Entfernen**. Die Farbe liegt halbtransparent auf dem Boden – in 2D, in 3D **und im Spiel**.
  Farbe/Textur **je Objekt**: Eigenschaften-Panel; **je Objekttyp**: Kategorie Farbe → „🎨 Farbe/Textur je Objekttyp“.
- **Gelände** (Kategorie Terrain): heben, senken (Umschalt kehrt um), glätten, einebnen – Stärke und Pinselgröße im Panel.
  **Entscheidung:** Höhen sind vorerst nur Darstellung (3D); das Spiel bleibt flach. **Steile Hänge** (über 1,5 m
  Unterschied zur Nachbarkachel, rot schraffiert) sind im Spiel **blockiert**. Weitere Wirkung wird separat entschieden.
- **Eigene Objekte** (Kategorie Eigene): „✚ Neues Objekt anlegen“ (Name, Größe, Kollision, Ebene, Kategorie, Farbe,
  3D-Höhe) – erscheint danach in der Bauleiste seiner Kategorie. Im Spiel ist es ein Platzhalter-Quader, bis es eine Grafik gibt.
- **🖼 Bild → 3D:** Bild hochladen (PNG mit Transparenz am besten) → **Extrusion** (jeder deckende Pixel wird ein kleiner
  Quader) oder **Billboard** (Bild schaut immer zur Kamera). Danach bearbeitbar wie andere Objekte. Eine KI-Umwandlung
  ist bewusst noch nicht eingebaut (im Dialog als „später“ gekennzeichnet).
- **🎨 Neue Grafik (Antrag):** Für echte Spielgrafik erzeugt der Editor `<id>.grafik.json` (Bild, **Lizenz CC0/CC-BY –
  Pflicht**, Urheber, Quelle). Datei nach `werkzeuge/assets/editor_grafiken/`, dann `python3 werkzeuge/assets/baue_assets.py`
  und `npm run assets:3d`. Die Pipeline prüft die Lizenz nochmals und schreibt die Credits fort.

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

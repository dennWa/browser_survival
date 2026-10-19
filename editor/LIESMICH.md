# Map-Editor – Anleitung

Der Map-Editor baut Zonen (Karten) für Browser Survival – im Browser, ohne Server und ohne Konto.
Start: im Anmeldebildschirm des Spiels auf **🗺 Map-Editor** (oder direkt `…/editor/`).

> **Grundsatz:** Alles, was du tust, landet in einem **Entwurf** (lokal im Browser gespeichert, IndexedDB).
> Das Spiel ändert sich erst, wenn du **veröffentlichst** und die heruntergeladene Datei ins Repo legst.
> Der Editor selbst schreibt nie Repo-Dateien – auch nicht auf dem Server.

## Aufbau

| Bereich | Wofür |
|---|---|
| **Menüleiste** | Datei · Bearbeiten · Ansicht · Einfügen · Werkzeuge · Zone · KI · Hilfe – jeder Befehl mit Tastenkürzel (am Handy: ☰) |
| **Schnellleiste** (oben) | Zone wählen · ↶ ↷ · 🧊 3D · ▶ Testen · 🚀 Veröffentlichen · 🤖 Helfer · ◧ ◨ Seitenleisten · Speicherstatus |
| **Werkzeugleiste** (ganz links) | Auswahl, Schwenken, Pinsel, Rechteck, Linie, Füllen, Radierer, Pipette, Gelände, Farbe, Zonengröße |
| **Seitenleiste links** | 🧱 **Assets** (Suche, ★ Favoriten, 🕘 Zuletzt, 7 Gruppen: Gelände · Bauen · Natur · Einrichtung · Gameplay · Zonen & Logik · Eigene) · 🏠 Prefabs · 🗺 Zonen · 🚪 Räume |
| **Optionsleiste** (über der Karte) | Einstellungen des aktiven Werkzeugs: Pinselgröße, Mal-Modus, Drehung, „mehrfach setzen“, Farbe, Stärke + Bedienhinweis |
| **Fläche** | Lineale oben/links mit Kachelnummern; Koordinate, Kachel und Objekt unter der Maus stehen unten in der Statusleiste |
| **Seitenleiste rechts** | **Inspektor** (Auswahl – oder ohne Auswahl: Zone mit Name, ID, Größe, Zonen-Werte) · **Ebenen** (👁 ein-/ausblenden, 🔒 sperren) · **Prüfung** |
| **KI-Seitenleiste** | 🤖 Gemini-Helfer (Strg+J), ein-/ausklappbar |

Seitenleisten lassen sich ein-/ausklappen (◧ ◨) und an der Innenkante in der Breite ziehen (Doppelklick = Standard).
**Tab** (auf der Karte) = Fokus-Modus: nur die Karte. **Rechtsklick** = Kontextmenü (Duplizieren, Drehen, Kopieren, Als Prefab …),
**Rechts-Ziehen** = schwenken. Am Handy sind die Seitenleisten Schubladen über der Karte.

**Ebenen:** Boden, Bemalung, Gelände, Räume & Bereiche, Objekte, Bauwerke, Spawns/Loot/Ankünfte, Übergänge. Ausgeblendete Ebenen
werden nicht gezeichnet, gesperrte ausgegraut – beide sind nicht anklickbar, und Werkzeuge verändern sie nicht (Meldung unten).
Dazu Anzeigen: Raster, Innen/Außen, steile Hänge, Nachbarzonen.

Koordinaten sind **Kacheln** (1 Kachel = 1 m = 32 px im Spiel), x nach rechts, y nach unten, (0|0) oben links.

## Zone anlegen und öffnen

- **➕ Neu → Rechteck aufziehen:** Ziehe auf der Fläche ein Rechteck – die Zone wird mit **Rasen** gefüllt, sonst nichts.
  Oder „Größe eingeben“. ID: nur `a–z`, `0–9`, `_` (wird der Dateiname im Spiel).
- **📂 Öffnen:** eine Zone aus dem Spiel (Stadtrand, Waldweg …) als **Vorlage** (verlustfrei), einen Entwurf des Projekts
  oder eine Datei (`*.entwurf.json`, `*.karte.json` oder eine rohe Kartendefinition).
- **Größe ändern:** Werkzeug ⤡ (Taste **Z**) und an den Griffen (Ecken/Kanten) ziehen – oder Menü Zone → „Größe ändern…“
  (Ränder einzeln ±). Beim Verkleinern zeigt der Editor, was abgeschnitten würde, und fragt nach.
- Außerhalb der Zone (weißer Rahmen) gibt es nichts zu bauen.

## Malen und Bauen

- **Kacheln:** im Asset-Browser einen Eintrag anklicken (oder suchen), dann Pinsel (**B**, Größe mit `[` `]`), Rechteck (**U**,
  Umschalt = nur Rand), Linie (**L**), Füllen (**G**). **Mauern** (Wand, Fenster, Tür, Zaun) rasten beim Linienziehen
  waagerecht/senkrecht/45° ein (Umschalt = frei). Radierer (**E**) macht Rasen und entfernt Objekte.
- **Objekte** (Möbel, Bäume, Steine, Lampen, Autos …): Eintrag wählen, Vorschau ist **grün** (passt) oder **rot**
  (blockiert/außerhalb, Grund steht dabei). Klick setzt, **R** dreht um 90°, Umschalt = mehrere hintereinander.
- **Auswahl (V):** Klick wählt, Umschalt = dazu, Ziehen verschiebt (Alt = feine 0,1-Schritte), ins Leere ziehen markiert
  einen **Bereich wie in Excel** (Koordinaten werden angezeigt). Strg+C/X/V, Strg+D duplizieren, Entf löschen, Pfeiltasten.
  Objekte bleiben in der Zone (Rand-Meldung); Drehen bleibt im Raster (viermal drehen = Ausgangslage).
- **Eigenschaften** im Inspektor (rechts): Typ, Name, x/y/b/h, Drehung (90er-Raster oder frei, z. B. 95°), blockiert, Ebene
  (Möbel/Boden/Krone/Licht), Größe (Bäume/Steine), Licht (Radius, Farbe, Stärke, Flackern, Mast), Farbe/Textur.
- **Rückgängig/Wiederholen** (Strg+Z / Strg+Y) ist unbegrenzt und bleibt über Sitzungen erhalten (steht im Entwurf).

## Spawns, Loot, Tiere, Wetter (pro Zone)

- **Spawns:** Spieler-Start (mind. einer), Zombie-Spawn (nur draußen – die Vorschau wird im Haus rot), Horden-Spawnpunkt
  (nachts kommt die Horde nur dort, wenn es welche gibt). Am gewählten Zombie-Spawn im Inspektor: **Anzahl**, **Respawn**, Horde.
- **Loot:** Loot-Punkte gehören zu einem **Raum** (Buchstabe a–z) mit Loot-Tabelle aus `lootTabellen.js`. Im Inspektor: Tabelle,
  **Loot-Chance** (liegt dort etwas?) und **Nachschub** (Sekunden) je Raum; die Wahrscheinlichkeiten der Tabelle stehen darunter.
- **Tiere:** Hasen-Bereich aufziehen (Kategorie Tiere) – dann spawnen Hasen nur in diesen Bereichen, mit Anzahl und Respawn.
  Ohne Bereiche verteilt das Spiel sie wie bisher auf allen Rasen.
- **Zonen-Werte** (Inspektor ohne Auswahl, aufklappbare Gruppen; Menü Zone → Zonen-Werte): Wetter (an/aus, Regen-Anteil, Dauer, Pausen), Zombies (Dichte, Respawn, Nacht-Horde,
  Nacht-Tempo), Hasen, Loot, Musik-Ordner. **Leer = globaler Standard** – der steht unter jedem Feld; gesetzte Felder sind grün.
- Das Spiel wertet all das aus (`server/spiel/karten/zonenEinstellungen.js`, `kartenLader.js`). Alte Karten ohne diese
  Felder verhalten sich unverändert.

## Räume und Gebäude

- **Räume markieren:** Assets → Zonen & Logik → Räume → Rechteck aufziehen oder 🪣 Füllen (füllt bis zu Wänden/Türen). Danach Raum wählen
  oder neu anlegen (Name + Loot-Tabelle). Reiter **Räume** zeigt alle Räume mit Loot-Punkten und Flächen.
- **Innen/Außen:** Reiter Ebenen → Anzeigen → „Innen/Außen“ färbt alles blau, was das Spiel als „drinnen“ wertet
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
- Von Hand: Assets → Zonen & Logik → „Übergang (am Rand)“ aufziehen (oder Menü Einfügen), Zielzone und Ankunft wählen; im Inspektor „📍 Ankunft in
  der Zielzone setzen“. Die Prüfung meldet: Ziel fehlt, Ankunft fehlt/liegt im Übergang (Ping-Pong), kein Rückweg.

## Mit einer KI arbeiten (Export / Import)

1. **Bereich markieren** wie in Excel: Auswahl-Werkzeug ⬚ (V), ins Leere ziehen. Die Koordinaten („x 20–40, y 10–25“)
   stehen am Rahmen und in der Statusleiste.
2. **Menü KI → Ausschnitt für KI** (oder Rechtsklick → „KI-Ausschnitt“): Der Editor erzeugt einen Text mit Bereich, ASCII-Raster mit
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
4. **Menü KI → KI-Antwort importieren**: Antwort einfügen (Text drumherum und ```json-Blöcke sind egal) → **Prüfen**. Der Reiter „KI-Import“
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

## Licht (Nächte sind dunkel)

Nachts ist es im Spiel **dunkel** – Licht gibt es nur dort, wo Lichtquellen stehen: **Lampe** (rundum), **Straßenlaterne** (mit Mast),
**Scheinwerfer (Kegel)** (leuchtet in eine Richtung: R dreht um 90°, im Inspektor Richtung 0° = Osten, 90° = Süden … und
Öffnungswinkel), **Lagerfeuer** – sowie die Taschenlampe der Spieler und Autoscheinwerfer. Im Inspektor: Radius, Farbe, Stärke,
Flackern, Lichtform (Punkt/Kegel). Die 2D-Ansicht zeigt Radius bzw. Kegel. Die Prüfung warnt, wenn eine Zone gar kein Licht hat.

## 2D/3D, Farben, Gelände, eigene Objekte

- **3D** (Knopf oben oder Taste **3**): dieselbe Karte in der Spielperspektive. Ziehen = schieben, Rechts-/Alt-Ziehen =
  drehen, Mausrad / zwei Finger = Zoom, Klick = auswählen. Die Auswahl ist in 2D und 3D dieselbe. „🎮 Spielperspektive“
  stellt den Kamerawinkel des Spiels wieder her, „⬇ Von oben“ schaut senkrecht.
- **Farbe** (Werkzeug 🎨, Taste K): Palette oder eigene Farbe (Optionsleiste), **Pinsel**, **Füllen** (zusammenhängende gleiche Kacheln),
  **Entfernen**. Die Farbe liegt halbtransparent auf dem Boden – in 2D, in 3D **und im Spiel**.
  Farbe/Textur **je Objekt**: Inspektor; **je Objekttyp**: Assets → Gelände → Farbe → „🎨 Farbe/Textur je Objekttyp“.
- **Gelände** (Werkzeug ⛰, Taste T): heben, senken (Umschalt kehrt um), glätten, einebnen – Stärke und Pinselgröße in der Optionsleiste.
  **Entscheidung:** Höhen sind vorerst nur Darstellung (3D); das Spiel bleibt flach. **Steile Hänge** (über 1,5 m
  Unterschied zur Nachbarkachel, rot schraffiert) sind im Spiel **blockiert**. Weitere Wirkung wird separat entschieden.
- **Eigene Objekte** (Assets → Eigene): „✚ Neues Objekt anlegen“ (Name, Größe, Kollision, Ebene, Kategorie, Farbe,
  3D-Höhe) – erscheint danach im Asset-Browser in seiner Kategorie. Im Spiel ist es ein Platzhalter-Quader, bis es eine Grafik gibt.
- **🖼 Bild → 3D:** Bild hochladen (PNG mit Transparenz am besten) → **Extrusion** (jeder deckende Pixel wird ein kleiner
  Quader) oder **Billboard** (Bild schaut immer zur Kamera). Danach bearbeitbar wie andere Objekte. Eine KI-Umwandlung
  ist bewusst noch nicht eingebaut (im Dialog als „später“ gekennzeichnet).
- **🎨 Neue Grafik (Antrag):** Für echte Spielgrafik erzeugt der Editor `<id>.grafik.json` (Bild, **Lizenz CC0/CC-BY –
  Pflicht**, Urheber, Quelle). Datei nach `werkzeuge/assets/editor_grafiken/`, dann `python3 werkzeuge/assets/baue_assets.py`
  und `npm run assets:3d`. Die Pipeline prüft die Lizenz nochmals und schreibt die Credits fort.

## Speichern und Sichern

- **Automatisch:** jede Änderung landet nach ~1 s im Browser (IndexedDB, sonst localStorage) – für **alle** geänderten Zonen.
  Die Anzeige oben rechts zeigt den Zustand: ● ungespeichert · ⟳ speichert · ✓ gespeichert 14:32 · ⚠ Fehler (Klick = erneut versuchen)
  · ⚠ nur Arbeitsspeicher (privates Fenster). Klick auf die Anzeige öffnet Speichern/Backup.
- **Strg+S** speichert sofort lokal, **Strg+Umschalt+S** lädt den Entwurf der aktiven Zone als Datei herunter (inkl. Verlauf).
- **🛟 Komplett-Backup** (Datei → Sicherung): **eine** Datei mit allen Entwürfen samt Verlauf, eigenen Prefabs, Weltanordnung und
  Editor-Einstellungen (Ebenen, Layout, Favoriten). Der Gemini-Schlüssel kommt **nie** hinein. **♻ Backup wiederherstellen** zeigt,
  was zurückkommt (Häkchen je Zone; gleiche IDs werden ersetzt). So zieht man auch auf ein anderes Gerät um.
- **💽 Speicherplatz & Status:** belegt/frei, und ob der Browser die Daten dauerhaft hält (sonst darf er bei Speichermangel löschen –
  dann regelmäßig ein Backup ziehen).

## Touch (Handy/Tablet) – bewusste Ausnahme

Ansehen, **Schwenken und Zoomen** gehen überall (zwei Finger; Hand-Werkzeug ✋ für einen Finger). Malen und Bauen
funktionieren per Tippen, sind aber für **Maus und Tastatur** gebaut – das ist eine bewusste Ausnahme von der
Projektregel „Touch mitdenken“: Kartenbau braucht Präzision, Tastenkürzel und große Bildschirme.

## Veröffentlichen (Karte → Spiel)

**🚀 Veröffentlichen** (Schnellleiste oder Menü Datei). Der Editor prüft zuerst (Fehler müssen weg) und bietet zwei Dateien an:

1. **Empfohlen:** `<id>.karte.json` herunterladen, im Repo `npm run karte:editor -- <id>.karte.json` ausführen →
   schreibt `server/spiel/karten/<id>.js` und trägt die Zone in `KARTEN` ein (wie `npm run karte:import` für Tiled).
2. Von Hand: `<id>.js` nach `server/spiel/karten/` legen und in `kartenLader.js` Import + `KARTEN`-Eintrag ergänzen
   (der Dialog zeigt die Zeilen).

Danach `npm test`. Neue Zone mit Übergang? Die Nachbarzone braucht einen Übergang zurück (Prüfung meldet es).

## Tastenkürzel

`?` (oder F1) zeigt **alle** Befehle mit Kürzeln – mit Suchfeld. Wichtigste: V Auswahl · H Schwenken · B Pinsel · U Rechteck ·
L Linie · G Füllen · E Radierer · I Pipette (oder Alt+Klick) · T Gelände · K Farbe · Z Zonengröße · R drehen · Strg+Z/Y ·
Strg+C/X/V · Strg+D · Strg+A ganze Zone · Entf · Pfeile verschieben (Umschalt = 5) · F ganze Zone · 3 = 2D/3D · Tab Fokus ·
Strg+F Assets suchen · Strg+J KI-Helfer · Strg+Enter testen · Strg+S speichern · Esc.
Trackpad: zwei Finger = schwenken, Pinch = zoomen.

## 🤖 KI-Helfer (Gemini)

Ein Chat an deiner Seite: Zone markieren (⬚), Wunsch schreiben, die KI schlägt Änderungen vor – **übernommen wird erst nach deiner Vorschau**.

1. **Schlüssel:** kostenlos auf <https://aistudio.google.com/apikey>. Im Editor **🤖 Helfer** → ⚙ → Schlüssel einfügen (Modell Standard `gemini-2.5-flash`, `gemini-2.5-pro` ist schlauer, aber langsamer/teurer).
   Der Schlüssel bleibt **nur in diesem Browser** (localStorage), steht in keinem Entwurf/Export und geht nur an Google. Auf fremden Rechnern danach „Schlüssel löschen“.
2. **Kontext:** Die KI sieht immer, was oben im Reiter steht – den **markierten Bereich** (sonst die Umgebung der **Auswahl**, sonst die ganze Zone, wenn sie klein genug ist ≤ 2500 Kacheln), dazu die ausgewählten Objekte und alle erlaubten Objekttypen. Mit den Haken kannst du das abschalten.
3. **Fragen:** z. B. „Mach hier einen verlassenen Campingplatz“, „Welche Farben passen zum Holzhaus?“, „Ist die Zombie-Verteilung zu dicht?“. Objekt auswählen + „🎨 Texturen vorschlagen“ hilft bei Farben/Mustern.
4. **Vorschläge:** Antwortet die KI mit Änderungen, erscheint **„🔍 N Änderungen prüfen“** → Vorschau (grün neu, rot weg, gelb geändert, orange ungültig mit Grund) → **Übernehmen** (ein Schritt, Strg+Z macht alles rückgängig).
   Neben Objekten/Kacheln/Marker kann die KI auch Farbe/Muster **je Objekttyp** (`typtextur`) und **Bodenfarbe** (`bemale`) setzen.

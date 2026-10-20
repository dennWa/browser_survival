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
| **Seitenleiste links** | 🧱 **Assets** (Suche, ★ Favoriten, 🕘 Zuletzt, 7 Gruppen: Gelände · Bauen · Natur · Einrichtung · Gameplay · Zonen & Logik · Eigene) · 📦 Modelle · 🏠 Prefabs · 🗺 Zonen · 🚪 Räume |
| **Optionsleiste** (über der Karte) | Einstellungen des aktiven Werkzeugs: Pinselgröße, Mal-Modus, Drehung, „mehrfach setzen“, Farbe, Stärke + Bedienhinweis |
| **Fläche** | Lineale oben/links mit Kachelnummern; Koordinate, Kachel und Objekt unter der Maus stehen unten in der Statusleiste |
| **Seitenleiste rechts** | **Inspektor** (Auswahl – oder ohne Auswahl: Zone mit Name, ID, Größe, Zonen-Werte) · **Ebenen** (👁 ein-/ausblenden, 🔒 sperren) · **Prüfung** · **▭ Bereiche** (Zonen-Manager) |
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

- **Wände am Stück:** Mauer-Einträge (Wand, Fenster, Tür, Zaun, Zauntor, Holzwand …) wählen und mit **gedrückter linker
  Maustaste ziehen** – die Wand rastet waagerecht/senkrecht/45° ein (Umschalt = frei), **Strg = Raum-Umriss** (Rechteck) oder
  Haken „Raum“ in der Optionsleiste. Bauwerke werden je Kachel geprüft (rote Kacheln werden übersprungen), Fenster/Türöffnungen/
  Tore richten sich automatisch nach dem Wandverlauf aus. Türen: höchstens 4 nebeneinander. Ein Zug = ein Rückgängig-Schritt.
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
- **Anordnen** (mehrere gewählt – Inspektor, Menü Bearbeiten → Anordnen oder Rechtsklick): **ausrichten** links/Mitte/rechts,
  oben/Mitte/unten (am gemeinsamen Rahmen), **verteilen** waagerecht/senkrecht (ab 3 Elementen gleiche Abstände, die äußeren
  bleiben stehen), **spiegeln** links⇄rechts bzw. oben⇄unten – Drehungen und Lampen-Richtungen spiegeln mit. Liegt die Auswahl in
  einem markierten Bereich (oder ist nur ein Bereich markiert), werden auch dessen **Kacheln, Höhen und Bemalung** gespiegelt.
  Jede Aktion ist ein Undo-Schritt; Tasten dafür lassen sich in der Hilfe (⌨) frei belegen.
- **Rückgängig/Wiederholen** (Strg+Z / Strg+Y) ist unbegrenzt und bleibt über Sitzungen erhalten (steht im Entwurf).

## Spawns, Loot, Tiere, Wetter (pro Zone)

- **Spawns:** Spieler-Start (mind. einer), Zombie-Spawn (nur draußen – die Vorschau wird im Haus rot), Horden-Spawnpunkt
  (nachts kommt die Horde nur dort, wenn es welche gibt). Am gewählten Zombie-Spawn im Inspektor: **Anzahl**, **Respawn**, Horde.
- **Loot:** Loot-Punkte gehören zu einem **Raum** (Buchstabe a–z) mit Loot-Tabelle aus `lootTabellen.js`. Im Inspektor: Tabelle,
  **Loot-Chance** (liegt dort etwas?) und **Nachschub** (Sekunden) je Raum; die Wahrscheinlichkeiten der Tabelle stehen darunter.
- **🎁 Loot-Zonen** (Assets → Loot → „Loot-Zone (Bereich)“, Rechteck ziehen): eigene Item-Liste statt Raum-Tabelle.
  Im Inspektor: **Wahrscheinlichkeit** als *Gewicht* (relativ, plus Spawn-Chance je Punkt) oder *exakte Chance je Item in %*
  (Rest bis 100 % = nichts), **Menge von–bis** je Item, **Loot-Punkte** (Anzahl), **Wo** (überall / nur innen / nur außen),
  **Nachschub** (s) und **Höchstens gleichzeitig**. „Tabelle übernehmen“ setzt eine Spiel-Tabelle als Startliste.
  Die gewählte Zone zeigt ihre Punkte auf der Karte (genau dort liegt im Spiel Loot: freie Kacheln, nicht in Wänden, Wasser
  oder unter blockierenden Möbeln), darunter die **erwartete Ausbeute** je Befüllung. Die Prüfung meldet unbekannte Items,
  Chancen über 100 % und Zonen ohne freie Kachel.
- **📚 Loot-Vorlagen:** oben im Loot-Inspektor eine Vorlage wählen → **Übernehmen** (Kopie) oder **🔗** (verknüpft: Änderungen
  an der Vorlage kommen automatisch in alle verknüpften Zonen des Projekts). **💾 Als Vorlage speichern** legt die Einstellungen
  der Zone als Vorlage ab (mit Ordner); bei verknüpften Zonen bringt **💾 Vorlage aktualisieren** die Vorlage auf den Stand
  dieser Zone und zieht alle anderen nach. Ändert man eine verknüpfte Zone selbst, wird die Verknüpfung gelöst (Meldung).
  Die Loot-Tabellen des Spiels stehen als eingebaute Vorlagen bereit. Verwaltung (Suche, Ordner, Umbenennen, Löschen,
  Import/Export als Datei): Assets → Loot → „📚 Loot-Vorlagen“. Eigene Vorlagen stecken im Komplett-Backup.
- **🎁 Loot ein-/ausblenden:** Knopf in der Schnellleiste oder Taste **O** (Loot-Punkte und Loot-Zonen). **Umschalt+O** zeigt
  die **Loot-Dichte** als Heatmap (gelb = wenig, rot = viel; Raum-Loot und Loot-Zonen zusammen). Beides auch unter Ansicht.
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

- **Zone entfernen** (🗄 in der Liste oder Datei → Zone entfernen): **Archivieren** ist der Standard – die Zone verschwindet
  aus dem Projekt, bleibt aber mit Verlauf erhalten (Reiter Zonen → **🗄 Archiv** → ♻ Zurück; das Archiv steckt auch im
  Komplett-Backup). **Endgültig löschen** fragt nach und lädt vorher automatisch eine Sicherung (`<zone>.entwurf.json`).

## ▭ Bereiche (Zonen-Manager)

Reiter **▭ Bereiche** (rechts) listet alle Bereichs-Zonen der aktiven Zone: Räume (alle Flächen eines Raums zusammen),
Loot-Zonen, Tier-Bereiche, Klänge und Übergänge. Je Zeile:
- **👁** ein-/ausblenden · **🔒** sperren (ausgegraut, nicht anklickbar, wird bei Änderungen ausgelassen) · **Farbe** (nur im Editor)
- **Name** anklicken = auswählen und hinspringen · **✎** umbenennen (bei Räumen der Raumname)
- **📥** in die **Ablage** legen (zwischenspeichern) → unten „📤 Einsetzen“ setzt sie wieder ein, auch in einer anderen Zone
  (an der gespeicherten Stelle, notfalls in die Zone geschoben; Räume bekommen bei Namenskonflikt einen freien Buchstaben)
- **🗑** löschen (Räume: nur die Flächen, Name/Loot-Tabelle bleiben im Reiter Räume)
Alles ist rückgängig machbar (Strg+Z). Die Einstellungen gehören zum Entwurf, nicht zur Spielkarte.

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

**🐞 Debug-Panel** (links oben, nur im Test – nie online): **Zeitlupe** 0,1× / 0,25× / 0,5× / 1×, **⏸ Pause** und dann
**+1 / +10** Ticks einzeln weiter. Overlays zum Ankreuzen: **Pfade (A\*)** der Zombies, **Ziele/Sicht** (Linie zum Ziel,
Bemerk-Radius; beim gewählten Zombie auch Verlier- und Hörradius), **Spawns** mit lebenden Zombies und Respawn-Timern,
**Loot**-Punkte (gelb = liegt etwas, sonst Sekunden bis Nachschub), **Klänge**, **Übergänge**. **🔍 Zombie-Info** an →
Zombie anklicken/antippen (es wird dabei nicht geschossen) zeigt Leben, Zustand, Ziel und Pfad live.

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
- **Gelände** (Werkzeug ⛰, Taste T): heben, senken (Umschalt kehrt um), glätten, einebnen, **Plateau** (Fläche ziehen →
  auf Zielhöhe), **Rampe** (von A nach B ziehen, Breite in der Optionsleiste) und **Treppe** (Rampe in Stufen). **Alt+Klick**
  übernimmt die Höhe einer Kachel als Zielhöhe. Eine gewählte Raum-/Bereichsfläche bekommt im Inspektor „Geländehöhe (m)“.
  Ab Zoom ~26 zeigt die 2D-Ansicht Höhenlinien und Zahlen. 1 m = 1 Kachel.
  **Im Spiel:** Gelände ist sichtbar und **begehbar** – Plateau-Oberseiten, Hänge und Rampen auch. Ist eine Nachbarkachel
  **mehr als 1 m höher**, ist die untere Kachel der **Fuß einer Klippe** und gesperrt (rot schraffiert). Die Prüfung warnt
  bei einem „Plateau ohne Zugang“ (Rampe vergessen). Treffer von oben bleiben 2D; in der Ego-Ansicht muss man nach oben/unten zielen.
- **Platzhalter-Objekt** (Assets → Eigene → „✚ Platzhalter-Objekt anlegen“): Name, Größe, Kollision, Ebene, Kategorie, Farbe,
  3D-Höhe – im Spiel ein farbiger Quader. Für echte Optik: 3D-Modell (nächster Abschnitt).

## Free-Modus (frei drehen und platzieren)

- **Einschalten:** in der Optionsleiste beim Platzieren **„Frei“** – dann rastet nichts mehr auf halbe Kacheln ein, und der
  **Winkel** steht daneben als Zahl. Ohne „Frei“ bleibt alles wie gewohnt im Raster.
- **Drehen:** **R** = 15° (ohne Frei: 90°), **Alt + Mausrad** = 5° (mit Umschalt 15°). Gewählte Objekte haben einen
  **Drehgriff** (Kreis über dem Objekt) – ziehen dreht frei. Im Inspektor steht der Winkel als Zahl (0–359°).
- **Im Spiel:** 0°, 90°, 180° und 270° verhalten sich genau wie vorher. Schräg gestellte Möbel stoßen auch schräg an
  (Spieler, Zombies, Schüsse), der Boden darunter ist entsprechend belegt. Die Prüfung meldet Überschneidungen gedreht.
- **Touch:** Winkel über die Optionsleiste oder den Inspektor eintippen, oder den großen ⟳-Griff mit dem Finger ziehen (15°-Schritte).

## 3D-Modelle (Reiter 📦 Modelle)

- **Hochladen:** Dateien in die gestrichelte Fläche ziehen (mehrere auf einmal) oder **📂 Dateien wählen**. Erlaubt sind nur
  3D-Formate: **.glb**, **.gltf** (alles eingebettet), **.obj** und **.fbx** (werden in .glb umgewandelt – externe Texturen fehlen
  dann). Der Editor prüft die Datei (Signatur, Probe-Laden), misst **Maße** (1 m = 1 Kachel), zählt **Dreiecke/Animationen**, macht
  ein **Vorschaubild** und warnt bei sehr großen Dateien (> 3 MB) oder vielen Dreiecken (> 60 000). Grenze: 8 MB.
- **Versionen (Reiter 🕓 Versionen, Datei → Version speichern):** benannte Stände der Zone; beim Export und Veröffentlichen
entsteht automatisch eine Version. **Δ Diff** markiert alle Änderungen bis jetzt auf der Karte (grün neu, rot entfernt, gelb
geändert), **↺ Laden** setzt die Zone auf den Stand zurück (der jetzige Stand wird vorher gesichert, Strg+Z geht). Der
Veröffentlichen-Dialog listet die Änderungen seit dem letzten Export.

**Bibliothek:** Modelle liegen **einmal im Projekt** (alle Zonen), nicht in jeder Karte. Ordner, Tags (Suche mit `#tag`),
  Kategorie (Gruppe im Asset-Browser), Lizenz/Urheber/Quelle: **✎** an der Karte. Modelle stehen auch im **🧱 Asset-Browser**.
- **Platzieren:** Modell anklicken → Klick auf die Karte setzt es (R dreht). Beim ersten Mal legt der Editor in der Zone einen Typ
  an (Größe aus den Maßen, im Inspektor über „✎ Typ bearbeiten“ änderbar).
- **Löschen:** ✎ → 🗑. Ist das Modell benutzt, zeigt der Editor wo („2 Zonen, 14 Objekte“) und bietet **Mitlöschen** (Objekte + Typ
  je Zone, rückgängig machbar) oder **Ersetzen** durch ein anderes Modell. Das Modell selbst ist danach weg (nicht rückgängig –
  vorher ggf. Komplett-Backup). Im Repo räumt der nächste `npm run karte:editor` die alte Datei aus `client/assets/eigene/` auf.
- **🌐 Poly Pizza:** kostenlose Modelle, nur **CC0/CC-BY**. Eigenen kostenlosen API-Schlüssel eintragen (bleibt nur in diesem
  Browser, nie in Backup/Export) → suchen → Klick übernimmt das Modell mit Urheber, Lizenz und Quelle (landet beim Veröffentlichen
  in `client/assets/eigene/LIZENZEN.md`). Blockiert der Browser den Zugriff, zeigt der Dialog einen Link zur Seite und
  „📂 Datei mit Lizenzangaben“ (Datei herunterladen und mit Urheber/Lizenz/Quelle importieren).
- **Mitnehmen:** Entwurf-Download und Komplett-Backup enthalten die Modelle, Öffnen/Wiederherstellen übernimmt sie. Export,
  Testen und Veröffentlichen betten die Modelle ein. Alte Entwürfe mit eingebetteten Modellen wandern beim Laden automatisch in die
  Bibliothek.
- **🛠 Werkstatt** (🛠 an der Modell-Karte, ✎-Dialog, Inspektor oder Rechtsklick auf ein Objekt mit Modell): großes Fenster mit
  drehbarer Kamera (ziehen = drehen, rechts/2 Finger = schieben, Rad/Pinch = Zoom), Raster (1 m = 1 Kachel), Drahtgitter,
  Fußabdruck und Kollisionsbox. Das Gizmo verschiebt (W), dreht (E) oder skaliert (R) das ganze Modell oder ein Teil –
  Umschalt rastet ein (0,1 m / 15° / 0,1). Genaue Werte über die Zahlenfelder, „⤢ Größe gleichmäßig“ (z. B. 0.01 für cm-Modelle),
  **⬇ Boden** (Unterkante auf y = 0), **⊙ Drehpunkt** (unten mittig). Teile lassen sich ein-/ausblenden (ausgeblendete fehlen
  in der neuen Version). Eigenes Rückgängig (Strg+Z / Strg+Y), Esc schließt. **💾 Speichern** legt eine **neue Version** an
  („Name v2“) – das Original bleibt. Benutzen Zonen das Original, fragt der Editor, ob sie die neue Version zeigen sollen
  (optional mit neuer Größe; je Zone rückgängig machbar).
- **Texturen & Malen (Werkstatt):** Material in der Liste anklicken → **Farbe**, **Rauheit**, **Metall** (Regler), **🖼 Textur
  ersetzen** (PNG/JPG/WebP, höchstens 1024 px) oder **✖ Textur weg**. **🖌 Malen** (Taste B): Farbe, Größe, Deckkraft oben wählen
  und direkt auf dem Modell ziehen (daneben ziehen dreht weiter die Kamera; Alt+Klick nimmt eine Farbe auf) – oder in der
  **UV-Ansicht** unter dem Material malen. Jeder Strich ist ein Rückgängig-Schritt. Teile ohne UV-Koordinaten lassen sich
  nicht bemalen. **🏷 Aufkleber** (Taste K): Bild wählen (PNG mit Transparenz für Logos, Schilder, Schmutz), Breite und Drehung
  einstellen, aufs Modell klicken/tippen – der Aufkleber wird ein eigenes Teil („Aufkleber 1“, in der Teile-Liste ausblendbar).
  Alles landet beim Speichern in der neuen Version (Texturen eingebettet; zu große Versionen > 8 MB werden abgelehnt).
- **Animationen (Werkstatt, Bereich „Animation & Gelenke“):** vorhandene Clips mit ▶ ansehen (■ stoppt, die Pose kommt zurück),
  ✎ umbenennen, 🗑 löschen, **⭐ = Leerlauf**: diese Animation läuft im Spiel als Schleife. **➕ Animation…** erzeugt Drehen,
  Wippen, Pendeln, Pulsieren oder Flackern für das ganze Modell, ein Teil oder ein Gelenk (Achse, Dauer, Stärke) – als neuer Clip
  oder in einen vorhandenen gemischt. **⊕ Gelenk…** setzt einen Drehpunkt an die Mitte oder eine Kante des gewählten Teils (Tür:
  linke Kante) und hängt das Teil daran; dann „Pendeln“ fürs Gelenk erzeugen. **Hängt an** hängt das gewählte Teil an das Modell,
  ein Gelenk, einen Knochen oder ein anderes Teil. **🦴 Skelett zeigen** bei Figuren mit Knochen. **⇄ Übernehmen…** holt Clips
  eines anderen Modells mit gleichen Knochennamen. Welche Animation ein platziertes Objekt im Spiel spielt, steht auch im
  Typ-Dialog (Inspektor → ✎ Typ, „Animation im Spiel“) und als Standard im ✎-Dialog des Modells („Leerlauf-Animation“).
  Nicht möglich: automatisches Rigging/Gewichte malen und Knochenketten, die ein Netz biegen (dafür Blender).
- **🤖 KI in der Werkstatt** (braucht den Gemini-Schlüssel aus dem 🤖 Helfer): **Farbschema vorschlagen** (Materialfarben,
  Rauheit, Metall – schickt ein kleines Vorschaubild mit), **Animation vorschlagen** (z. B. „Windrad dreht sich langsam“),
  **Textur aus Text** für das gewählte Material (Bildmodell; nicht jeder Schlüssel darf Bilder erzeugen). Der Dialog zeigt
  vorher, was gesendet wird – nur dieses Modell, nie die Karte oder der Schlüssel. Das Ergebnis erscheint als **Vorschau**:
  „Übernehmen“ ist ein Rückgängig-Schritt, „Verwerfen“ stellt alles zurück.
- **Ausgeblendet:** „Bild → 3D“ und „Neue Grafik (Antrag)“ (nur noch 3D-Formate). Vorhandene Bild-Objekte werden weiter angezeigt.

## 🔊 Klänge (Reiter 🔊 Audio)

- **Hochladen:** Audio-Dateien in die gestrichelte Fläche ziehen oder **📂 Dateien wählen** – **mp3, wav, ogg, m4a, flac, opus,
  webm**, höchstens 15 MB. Der Editor prüft die Datei (Signatur) und spielt sie probeweise ab (Dauer, Mono/Stereo, Wellenform).
  Lange (> 5 min) oder große (> 5 MB) Dateien bekommen einen Hinweis – fürs Handy lieber kurze Schleifen.
- **Bibliothek:** Audio liegt **einmal im Projekt** (alle Zonen). ▶ hört vor, **✎** ändert Name, Ordner, Tags (Suche mit `#tag`),
  Lizenz/Urheber/Quelle. Die Dateien stehen auch im **🧱 Asset-Browser** (Gruppe 🔊 Klang).
- **Drei Arten:**
  - **📍 Punkt-Klang** (Huhn, Maschine, Lagerfeuer): Klick auf die Karte, auf ein Objekt = an dessen Mitte. Innerer Kreis = volle
    Lautstärke, gestrichelter äußerer Kreis = Hörweite. Beide Kreise haben Griffe zum Ziehen. Im Spiel kommt der Klang von links
    oder rechts (Stereo).
  - **▭ Ambiente** (Wald, Halle, Bach): Rechteck auf der Karte ziehen. „Übergang“ = so viele Kacheln weich ein- bzw. ausblenden.
  - **🌐 Global** (Karten-Musik/Atmo): gilt in der ganzen Zone. „Ersetzt Zonen-Musik“ schaltet die Ordner-Musik ab.
- **Bearbeiten (Inspektor, nicht-destruktiv – die Datei bleibt unverändert):** Wellenform mit Griffen für **Anfang/Ende** (ziehen;
  Doppelklick setzt zurück), **Einblenden/Ausblenden**, **Lautstärke** (bis 2×), **Regler** (Effekte · Wind & Regen · Musik – der
  Lautstärke-Regler im Spiel), **▶ Vorhören** / **🔁 Loop hören**. Jede Änderung ist ein Schritt für Rückgängig.
- **Wiedergabe & Auslöser:** Endlos-Schleife, **zufällige Abstände** (Pause min–max) oder **einmal je Auslösung** (mit Abklingzeit).
  Auslöser: immer, drinnen/verlassen (Ambiente), Annäherung auf X Kacheln, Tag, Nacht, Kampf in der Nähe, Horde, Zonen-Wechsel.
  **Tonhöhe ± %** variiert kurze, wiederkehrende Geräusche bei jedem Abspielen.
- **Prüfung:** warnt bei fehlender Datei (anderer Browser → Backup/Entwurf-Datei mit Audio öffnen), Hörweite ≤ „Voll bis“, Ende vor
  dem Start, mehreren Musik-Ersatz-Klängen; Klänge außerhalb der Zone sind Fehler.
- **Mitnehmen & Veröffentlichen:** Entwurf-Datei, Komplett-Backup, Export und **▶ Testen** enthalten die Audio-Dateien.
  `npm run karte:editor` legt sie unter `client/audio/karten/<karte>/` ab und räumt nicht mehr benutzte auf.
- **Löschen:** ✎ → 🗑. Ist die Datei benutzt, zeigt der Editor wo und bietet **Mitlöschen** oder **Ersetzen** (Position, Schnitt und
  Auslöser bleiben). Die Ebene **🔊 Klänge** blendet alle Klänge auf der Karte aus oder sperrt sie.

## Speichern und Sichern

- **Automatisch:** jede Änderung landet nach ~1 s im Browser (IndexedDB, sonst localStorage) – für **alle** geänderten Zonen.
  Die Anzeige oben rechts zeigt den Zustand: ● ungespeichert · ⟳ speichert · ✓ gespeichert 14:32 · ⚠ Fehler (Klick = erneut versuchen)
  · ⚠ nur Arbeitsspeicher (privates Fenster). Klick auf die Anzeige öffnet Speichern/Backup.
- **Strg+S** speichert sofort lokal, **Strg+Umschalt+S** lädt den Entwurf der aktiven Zone als Datei herunter (inkl. Verlauf).
- **🛟 Komplett-Backup** (Datei → Sicherung): **eine** Datei mit allen Entwürfen samt Verlauf, eigenen Prefabs, 3D-Modellen,
  Audio-Dateien, Weltanordnung und Editor-Einstellungen (Ebenen, Layout, Favoriten). Der Gemini-Schlüssel kommt **nie** hinein. **♻ Backup wiederherstellen** zeigt,
  was zurückkommt (Häkchen je Zone; gleiche IDs werden ersetzt). So zieht man auch auf ein anderes Gerät um.
- **💽 Speicherplatz & Status:** belegt/frei, und ob der Browser die Daten dauerhaft hält (sonst darf er bei Speichermangel löschen –
  dann regelmäßig ein Backup ziehen).

## Touch (Handy/Tablet) – Touch-Bauen

Der Editor lässt sich mit dem Finger bedienen (die frühere „Touch-Ausnahme“ ist aufgehoben):

- **Zwei Finger** schwenken und zoomen immer (bricht eine laufende Aktion ab); ✋ Hand-Werkzeug = mit einem Finger schwenken.
- **Fadenkreuz über dem Finger:** Beim Bauen erscheint das Fadenkreuz etwas **über** dem Finger, damit man sieht, wo es
  landet – dazu eine **Lupe** in der Ecke. Gebaut wird am Fadenkreuz, nicht unter dem Finger.
- **Platzieren/Einfügen:** Finger auflegen → der Geist folgt dem Fadenkreuz (grün/rot), loslassen → unten erscheint
  **✓ Setzen · ⟳ Drehen · ✕ Abbrechen**. Neu auflegen verschiebt den Geist. Am Finger rastet alles ins Raster ein
  (im Free-Modus ¼ Kachel).
- **Pinsel, Radierer, Gelände, Farbe, Bereiche, Wände, Maßband:** ziehen = Strich am Fadenkreuz, tippen = ein Punkt.
- **Auswahl:** tippen wählt, ziehen verschiebt bzw. zieht einen Rahmen. Um die Auswahl liegen **große Griffe**:
  ✥ verschieben · ⟳ tippen = drehen (Free-Modus: ziehen = frei drehen in 15°-Schritten) · ⤡ Größe (ein Objekt).
  Jeder Griff-Zug ist ein Undo-Schritt.
- **Langdruck** (Finger ruhig liegen lassen) = Kontextmenü (wie Rechtsklick).
- **Handy-Leiste** unten (schmale Bildschirme): 🧱 Assets-Schublade · ↶ ↷ · ⋯ Kontextmenü · ◨ Inspektor-Schublade.
  Tippen auf die Karte schließt die Schublade.

## Veröffentlichen (Karte → Spiel)

**🚀 Veröffentlichen** (Schnellleiste oder Menü Datei). Der Editor prüft zuerst (Fehler müssen weg) und bietet zwei Dateien an:

1. **Empfohlen:** `<id>.karte.json` herunterladen, im Repo `npm run karte:editor -- <id>.karte.json` ausführen →
   schreibt `server/spiel/karten/<id>.js` und trägt die Zone in `KARTEN` ein (wie `npm run karte:import` für Tiled).
2. Von Hand: `<id>.js` nach `server/spiel/karten/` legen und in `kartenLader.js` Import + `KARTEN`-Eintrag ergänzen
   (der Dialog zeigt die Zeilen).

Danach `npm test`. Neue Zone mit Übergang? Die Nachbarzone braucht einen Übergang zurück (Prüfung meldet es).

## Tastenkürzel

`?` (oder F1) zeigt **alle** Befehle mit Kürzeln – mit Suchfeld. **Eigene Tasten:** dort **⌨** an einem Befehl, dann die
neue Taste drücken (Esc = abbrechen; hatte ein anderer Befehl die Taste, verliert er sie – Meldung), **✕** = Taste weg,
**↺** = Standard, „Alle Tasten zurücksetzen“. Gilt für diesen Browser und steckt im Komplett-Backup.
**Bibliothek:** Im Asset-Browser stehen auch alle **🏠 Prefabs** (mit automatischem Vorschaubild) und – über die Suche – deine
Loot-Vorlagen; ☆ macht sie zu Favoriten. Assets und Prefabs lassen sich mit der Maus direkt **auf die Karte ziehen**. Im
Prefab-Reiter: Suche, Ordner, ✎ benennt um / verschiebt in einen Ordner. Am Handy: antippen, dann auf die Karte tippen.

**Messen & Ausrichten:** 📏 Maßband (Taste M): Punkte klicken, Doppelklick oder Enter = fertig, Esc = löschen – zeigt jede
Strecke in Metern mit Winkel und die Gesamtlänge. **Hilfslinien** aus dem oberen/linken Lineal in die Karte ziehen; mit dem
Auswahl-Werkzeug verschieben, zurück ins Lineal = löschen (Umschalt+H blendet sie aus). 🧲 **Einrasten** (Umschalt+G):
Objekte rasten beim Platzieren/Verschieben an Kanten und Mitten anderer Objekte und an Hilfslinien ein (Strg gedrückt = aus).
Ansicht → „Raster-Weite wechseln“ (½ bis 8 Kacheln, kräftigere Hauptlinien). In 3D gibt es Raster und Achsen.

**Strg+K** öffnet die **Befehlspalette**: tippen, Pfeiltasten, Enter = ausführen. Wichtigste: V Auswahl · H Schwenken · B Pinsel · U Rechteck ·
L Linie · G Füllen · E Radierer · I Pipette (oder Alt+Klick) · T Gelände · K Farbe · Z Zonengröße · R drehen · Strg+Z/Y ·
Strg+C/X/V · Strg+D · Strg+A ganze Zone · Entf · Pfeile verschieben (Umschalt = 5) · F ganze Zone · 3 = 2D/3D · Tab Fokus ·
Strg+F Assets suchen · Strg+J KI-Helfer · Strg+Enter testen · Strg+S speichern · O Loot ein/aus · Umschalt+O Loot-Dichte · Esc.
Trackpad: zwei Finger = schwenken, Pinch = zoomen.

## 🤖 KI-Helfer (Gemini)

Ein Chat an deiner Seite: Zone markieren (⬚), Wunsch schreiben, die KI schlägt Änderungen vor – **übernommen wird erst nach deiner Vorschau**.

1. **Schlüssel:** kostenlos auf <https://aistudio.google.com/apikey>. Im Editor **🤖 Helfer** → ⚙ → Schlüssel einfügen (Modell Standard `gemini-2.5-flash`, `gemini-2.5-pro` ist schlauer, aber langsamer/teurer).
   Der Schlüssel bleibt **nur in diesem Browser** (localStorage), steht in keinem Entwurf/Export und geht nur an Google. Auf fremden Rechnern danach „Schlüssel löschen“.
2. **Kontext:** Die KI sieht immer, was oben im Reiter steht – den **markierten Bereich** (sonst die Umgebung der **Auswahl**, sonst die ganze Zone, wenn sie klein genug ist ≤ 2500 Kacheln), dazu die ausgewählten Objekte und alle erlaubten Objekttypen. Mit den Haken kannst du das abschalten.
3. **Fragen:** z. B. „Mach hier einen verlassenen Campingplatz“, „Welche Farben passen zum Holzhaus?“, „Ist die Zombie-Verteilung zu dicht?“. Objekt auswählen + „🎨 Texturen vorschlagen“ hilft bei Farben/Mustern.
4. **Vorschläge:** Antwortet die KI mit Änderungen, erscheint **„🔍 N Änderungen prüfen“** → Vorschau (grün neu, rot weg, gelb geändert, orange ungültig mit Grund) → **Übernehmen** (ein Schritt, Strg+Z macht alles rückgängig).
   Neben Objekten/Kacheln/Marker kann die KI auch Farbe/Muster **je Objekttyp** (`typtextur`) und **Bodenfarbe** (`bemale`) setzen.

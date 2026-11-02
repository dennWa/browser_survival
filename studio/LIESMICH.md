# Browser Survival Studio – Anleitung

Das Studio ist der Editor für Browser Survival als **eigenes Programm** (Windows, Linux, macOS). Es arbeitet direkt im
Spielordner: Zonen öffnen, in 3D oder 2D bauen, im echten Spiel testen und mit einem Klick ins Spiel übernehmen.
Bereiche: **Karten** (Phase 1), **Audio-Zentrale** (Phase 2) und **Modell-Werkstatt** (Phase 3) – Plan: `docs/konzepte/STUDIO_KONZEPT.md`.

## Starten

| System | So geht's |
|---|---|
| Windows | Doppelklick auf **`Studio starten.bat`** (Hauptordner). Beim ersten Mal wird Electron installiert (~100 MB). |
| Linux / macOS | `studio/starten.sh` oder im Spielordner `npm run studio` |

Voraussetzung: Node.js ≥ 20 und einmal `npm install`. Das Studio braucht **keinen** laufenden Spielserver.

## Oberfläche

```
┌ Menü: Datei · Bearbeiten · Ansicht · Zone · Werkzeuge · KI · Hilfe ──────────── [▶ Testen] ┐
├ Werkzeugleiste (Q W E R │ B N H T │ O G K I P)                  Rückgängig · Speichern · Ins Spiel ┤
├ Optionsleiste (Einstellungen des aktiven Werkzeugs)                                         ┤
├ ZONEN / SZENE │            3D-/2D-ANSICHT                 │ EIGENSCHAFTEN · PRÜFUNG · KI   ┤
│               ├──────────────────────────────────────────┤                                │
│               │ ASSETS: Böden · Wände · Natur · Möbel …   │                                │
└ Statusleiste: Meldungen · Prüfung · Kachel/Höhe · Speicherstand · MCP ──────────────────────┘
```

- **Zonen** (links oben): alle Zonen des Spiels. *Im Spiel* = eingetragen, *Datei* = Kartendatei ohne Eintrag,
  *Entwurf* = gespeicherter Arbeitsstand. Klick öffnet, Rechtsklick zeigt Aktionen.
- **Szene** (links): alles in der Zone als Baum (Objekte, Spawnpunkte, Punkte, Loot-Zonen, Räume, Übergänge, Klänge …).
  Klick wählt, Doppelklick zeigt es in der Ansicht.
- **Eigenschaften** (rechts): Werte der Auswahl bearbeiten. Ohne Auswahl: Zonen-Einstellungen.
- **Prüfung** (rechts): Fehler/Hinweise wie im Spiel-Lader (Spawn in der Wand, fehlender Rückweg …). Klick springt hin.
- **Befehlspalette** `Strg+K`: jeden Befehl per Suche finden.

## Kamera

| Aktion | Steuerung |
|---|---|
| Drehen (3D) | Rechte Maustaste ziehen (oder Alt + Links) |
| Schieben | Mittlere Maustaste oder Leertaste + Links |
| Zoomen | Mausrad (zoomt zum Mauszeiger) |
| Fliegen | Rechte Maustaste halten + W A S D, Q/E = Höhe |
| 3D ⇄ 2D (Draufsicht) | `Tab` oder Knöpfe oben links |
| Auswahl zeigen / ganze Zone | `F` / `Pos1` |
| **Spiel-Optik** (echte Modelle & Texturen des Spiels) | `V` oder Knopf oben rechts |
| Tag / Abend / Nacht, Wetter (Nebel, Regen, Schnee) | Knöpfe oben rechts (nachts leuchten die Lampen der Zone) |
| **Als Spieler herumlaufen** | `F6` – Maus schaut, W A S D, Umschalt rennt, Esc beendet |
| Loot-Heatmap | `Umschalt+H` (grün = wenig, rot = viel) |
| **Loot-Vorschau** (Beispiel-Items an allen Loot-Punkten, gewürfelt wie im Spiel) | `Umschalt+V` oder Knopf *Loot* oben rechts; Würfel-Knopf = neu würfeln. Gelber Ring = zufällig (Tabelle/Zone), grün = festes Item |
| Wände niedrig (in Räume schauen) | `X` |

## Werkzeuge

| Taste | Werkzeug | Bedienung |
|---|---|---|
| Q | Auswählen | Klick wählt, Umschalt = dazu, Ziehen auf freier Fläche = Rahmen, Ziehen auf Gewähltem = verschieben (Strg = ganze Kacheln) |
| W | Bewegen | Gizmo-Pfeile ziehen (Spawnpunkte auch in der Höhe) |
| E | Drehen | Ring ziehen, rastet in 15°-Schritten |
| R | Größe | Größer/kleiner – **die Grundfläche (Kollision) wächst mit** (0,25× – 4×) |
| B | Boden malen | Kachel unten in *Böden* wählen; Pinsel / Rechteck / Füllen; `[` `]` = Pinselgröße |
| N | Wand ziehen | Wand, Fenster oder Tür als gerade Linie |
| H | Raum bauen | Rechteck ziehen → Wände, Innenboden, Tür und (optional) Loot-Raum in einem Schritt |
| T | Gelände | Heben, senken, glätten, ebnen (Radius/Stärke in der Optionsleiste) |
| L | Straße | Linie ziehen → Fahrbahn, Gehwege, Mittelmarkierung, Laternen; Objekte auf der Fahrbahn verschwinden |
| S | Streuen | Wald, Nadelwald, Gebüsch, Felsen oder das gewählte Asset „aufsprühen“ (nur Naturboden, kein Überlappen). Umschalt = radieren, `[` `]` = Radius |
| O | Objekt platzieren | Asset wählen (Natur, Möbel, Modelle, Vorlagen …), Klick setzt. `Strg+Rad` dreht, Umschalt = weiter setzen, „Variieren“ = zufällige Größe/Drehung (natürlicher Wald) |
| G | Bereich markieren | Rechteck: Loot-Zone, Hasen-Bereich, Übergang (Zielzone + Ankunft) oder Klangzone |
| K | Klang setzen | Punktklang mit Hörweite – **Klick auf ein Objekt hängt den Klang ans Objekt** (wandert und kopiert sich mit) |
| I | Item-Spawnpunkt | Item oder Loot-Tabelle mit Chance und Intervall; **über einem Möbel wird es automatisch draufgelegt** |
| P | Punkt setzen | Spieler-Start, Zombie, Horde (nachts) oder Ankunftspunkt (Name für Übergänge) |
| M | Messen | Klicks setzen Messpunkte (Meter je Abschnitt + Summe), Doppelklick/Enter beendet, Esc löscht |
| Z | Notiz | Notiz-Pin („hier fehlt eine Tankstelle“) – sieht auch die KI (`notizen_liste`) |

Alles ist rückgängig machbar: `Strg+Z` / `Strg+Y`. Kopieren `Strg+C`, Einfügen `Strg+V` (an der Maus), Duplizieren `Strg+D`, Löschen `Entf`.

## Mehr Bau-Hilfen

- **Zone → Generieren**: Wald/Nadelwald (Waldboden, Bäume, Lichtung, See) oder Dorf (Straße + Häuser, auf Wunsch aus deinen Vorlagen) als Startpunkt – ein Undo-Schritt. Mit einer Auswahl gilt ihr Rahmen als Bereich.
- **Zone → Ersetzen** (`Strg+H`): z. B. alle Herbstbäume → Tannen oder Gras → Schnee, in der ganzen Zone oder im Rahmen der Auswahl.
- **Hilfslinien**: Rechtsklick → *Hilfslinie waagerecht/senkrecht*. Objekte rasten beim Setzen an Hilfslinien und Kanten anderer Objekte ein (Schalter in der Optionsleiste).
- **Ebenen** (oben im Szene-Baum): Ebenen ein-/ausblenden und **sperren** – gesperrte Ebenen nehmen keine Änderungen an (auch nicht von der KI).
- **Zuletzt** (erster Assets-Reiter): die zuletzt benutzten Bausteine.

## Zombie-Bereiche

Werkzeug **G → Zombies**: Rechteck ziehen. Im Inspektor: **Anzahl**, **Tageszeit** (immer / nur tagsüber / nur nachts),
**Mischung** (Gewichte je Typ: normal, laeufer, halb, sprinter, spucker, gepanzert, explosiv, brocken), Respawn und
**Route zeichnen** (Punkte anklicken, Enter): ruhende Zombies laufen die Route ab – „nur nachts“ + Route = wandernde Nacht-Horde.

## Prüfen

| Befehl | Was |
|---|---|
| Zone → **Laufweg prüfen** (`Strg+R`) | Was ist vom Start und den Ankünften zu Fuß erreichbar? Eingesperrte Flächen (Raum ohne Tür), unerreichbare Loot-/Spawnpunkte und Übergänge rot markiert + in der Prüfung gelistet |
| Zone → **Balance** | Alle Zonen im Vergleich: Gefahr (Zombies je 1000 Kacheln), Versorgung, Loot je Stunde nach Essen/Trinken/Medizin/Waffen/Munition/Material |
| Zone → **Weltkarte** (`Strg+M`) | Alle Zonen mit Übergängen; rote Linien = fehlende Ankunft oder Rückweg; Klick öffnet die Zone |
| Zone → **Versionen** | Benannte Stände (`Strg+Umschalt+S`), vor „Ins Spiel“ automatisch; **Vergleichen** färbt neu/weg/geändert in der Karte, **Wiederherstellen** |

## Items, Loot & Rezepte (`Strg+I`)

Items (Werte wie Nährwert, Schaden, Magazin …), **neue Items** (leihen sich das Icon eines vorhandenen), Loot-Tabellen
(Item + Gewicht, Prozente werden angezeigt) und Rezepte (Zutaten, Ergebnis, Ort, Level) – ohne Code. Gespeichert wird
nur in `server/spiel/konfiguration/studioDaten.js` (wird über die handgeschriebenen Dateien gelegt); die KI-Anleitung
wird automatisch erneuert. Danach `npm test` und das Spiel neu starten.

## Item-Spawnpunkte

Ein Spawnpunkt legt **genau ein** Item an genau diese Stelle. Beispiel: *Konservendose, 35 %, alle 10 Minuten*:
Alle 10 Minuten (Echtzeit) wird gewürfelt, solange der Punkt leer ist – mit 35 % liegt danach eine Dose dort.
Beim Start der Zone wird einmal gewürfelt. Inhalt kann auch eine ganze Loot-Tabelle sein (`Tabelle: kueche`).
Liegt der Punkt auf einem Tisch/Regal, sieht man das Item im Spiel auch oben drauf (Feld *Ablagehöhe*).

## Übergänge zwischen Zonen

Werkzeug **G → Übergang**: Rechteck am Rand ziehen, Zielzone und Ankunftsname wählen. In der Ansicht steht dann
„→ Zielzone · Ankunft“. In den Eigenschaften springt **„Zur Zielzone springen“** direkt zum Ankunftspunkt dort
(fehlt er, mit **P → Ankunft** anlegen). Die Prüfung meldet fehlende Rückwege.

## Vorlagen (Prefabs)

- **Verknüpft:** Eigene Vorlagen merken sich ihre Kopien. Speicherst du die Vorlage neu, fragt das Studio „Alle Kopien aktualisieren?“ – in allen Zonen. Im Zonen-Inspektor (nichts gewählt) stehen die Kopien mit *Zeigen / Aktualisieren / Entkoppeln*.
- **Zone → Neue Vorlage bauen**: öffnet eine kleine leere Fläche – Haus bauen, einrichten, Loot/Spawnpunkte setzen,
  **Speichern** (`Strg+S`). Danach steht sie unter *Assets → Vorlagen* bereit und wird mit dem Objekt-Werkzeug gesetzt.
- **Auswahl als Vorlage**: gewählte Objekte (wahlweise mit Boden & Wänden darunter) als Vorlage speichern.
- Rechtsklick auf eine eigene Vorlage: *Bearbeiten* oder *Löschen*. Gespeichert wird in `studio/vorlagen/` (gehört ins Repo).

## Testen, Speichern, Ins Spiel

| Knopf | Was passiert |
|---|---|
| **Speichern** `Strg+S` | Arbeitsstand als Entwurf in `.studio/entwuerfe/` (nicht im Repo). Autosave jede Minute. |
| **Testen** `F5` | Startet das echte Spiel mit deinen Zonen in einem eigenen Fenster (Debug-Panel inklusive). Datei → *Am Kamerapunkt starten* setzt den Start an die Kamera. |
| **Ins Spiel übernehmen** `Strg+Umschalt+E` | Prüft die Zone, schreibt `server/spiel/karten/<id>.js` und trägt sie in `KARTEN` ein. Danach `npm test` und committen. |

## Modelle und Klänge importieren

- **Datei → Modell importieren**: `.glb` wählen → Vorschau + Maße, Name, Bereich, Höhe im Spiel, **Urheber, Lizenz, Quelle**.
  Das Studio kopiert die Datei nach `client/assets/eigene/`, trägt sie in `index.json` ein, speichert ein Vorschaubild
  und schreibt die Credits nach `client/assets/eigene/credits.json` (Credits-Dialog im Spiel).
- **Datei → Klang importieren**: Audiodatei für die offene Zone (`client/audio/karten/<zone>/`) + Credits.
  Wählt man im Klang-Werkzeug eine Datei aus einem anderen Ordner, kopiert das Studio sie automatisch in den Zonenordner.

## Modell-Werkstatt (`Strg+Umschalt+M`, Startbildschirm oder Doppelklick auf ein Modell in der Asset-Leiste)

Links alle Modelle des Spiels (Suche, Bereich), in der Mitte die Bühne **so wie im Spiel**: das Spiel passt jedes Modell
in Grundfläche × Höhe ein – 1 Rasterkästchen = 1 Kachel = 1 m, daneben eine 1,8-m-Figur, die Grundfläche ist orange.

| Reiter | Was |
|---|---|
| **Modell** | Name, Bereich, **Höhe im Spiel**, **Kollision** (steht im Weg / man läuft hindurch), **Ebene** (normal, Boden, oben), **eigene Grundfläche** in Kacheln, ganzes Modell drehen/kippen/spiegeln, Credits, „benutzt in“ Zonen |
| **Teile** | Grundkörper anfügen (Kiste, Zylinder, Kugel, Kegel, Keil, Ring, Platte), anderes Modell als Teil einfügen; Teil wählen → W/E/R (Schieben/Drehen/Größe) oder Zahlenfelder, umbenennen, an anderes Teil hängen, duplizieren (`Strg+D`), löschen (`Entf`), ein-/ausblenden |
| **Material** | Farbe, Rauheit, Metall je Material, Textur ersetzen/entfernen, „eigenes Material“ für ein Teil, Farbton/Sättigung/Helligkeit fürs ganze Modell |
| **Animation** | Drehen, Wippen, Pendeln, Pulsieren, Flackern für Modell oder Teil – die gewählte läuft im Spiel als Leerlauf-Schleife |

**Neues Modell** (+ oben links) startet mit einer Kiste – aus Grundkörpern zusammensetzen. **Speichern** (`Strg+S`) schreibt
`client/assets/eigene/<name>.glb` + Vorschaubild + `index.json`; die alte Fassung landet in `.studio/modelle/` (Uhr-Knopf =
zurückholen). **Als Kopie** legt eine neue Datei an. Offene Zonen, die das Modell benutzen, übernehmen Kollision/Ebene/Animation
sofort (je Zone ein Undo-Schritt); neue Objekte im Karten-Editor bekommen alles automatisch. Alles in der Werkstatt hat
eigenes Rückgängig (`Strg+Z` / `Strg+Y`). `Esc` = zurück zu den Karten.

## Audio-Zentrale (`Strg+Umschalt+A` oder Startbildschirm)

Links alle Klänge des Spiels nach Gruppen (Musik, Atmosphäre & Wetter, Tiere, Waffen …, Karten-Klänge) mit Suche,
rechts die Details. `Leertaste` = anhören/stoppen, `Esc` = zurück.

| Bereich | Was |
|---|---|
| **Ereignis** (z. B. `pistole`, `schritt_gras`) | Anhören (Datei, Sample oder Synthese – genau der Spielklang), **Pegel**, Tonhöhen-Streuung, Verzögerung, max. Dauer, „einmal“, **Faktor je Zone** (z. B. Wind im Schneeland ×1,5); Dateien anhören, schneiden, löschen (Papierkorb `.studio/audio-papierkorb/`), Datei importieren oder vorhandene zuordnen |
| **Schneiden** (Schere-Knopf an einer Datei oder nach dem Import) | Wellenform, Griffe ziehen = Start/Ende, Ein-/Ausblenden, Lautstärke (dB), Normalisieren, nahtlose Schleife mit Überblendung, „Stille abschneiden“, Vorhören → speichern als neue Variante, als Ersatz, als Musik-Titel oder über die Datei (Opus-`.ogg`) |
| **Musik-Ordner** (je Zone, „Alle Zonen“, Hauptmenü) | Titel anhören/schneiden/löschen, Reihenfolge ▲▼, zufällig, **Überblendung** und **Pause** zwischen Stücken; Musik nur in einem Teil einer Zone = Klangzone (G → Klangzone, Bus Musik) im Karten-Editor |
| **Mischpult** | Wetter × Tageszeit × Ort (draußen/Haus/Auto) × Zone: zeigt, welche Umgebungs-Schichten (Wind, Regen, Sturm, Vögel, Grillen …) wie stark laufen – **gleiche Regel wie im Spiel** – und spielt sie mit dem echten Spiel-Sound ab. Regler: Pegel für alle Zonen und Faktor für die gewählte Zone |

Alles wird sofort in den Spielordner geschrieben (`client/audio/eigene/` + `einstellungen.json`, `client/musik/<ordner>/` +
`einstellungen.json`), die Indexe (`eigene.json`, `musik.json`) baut das Studio selbst neu. Importierte Dateien können
Credits (Urheber, Lizenz, Quelle) mitbringen → `credits.json`.

## KI

**Eingebauter Assistent** (Reiter *KI* rechts, `Strg+L`): Zahnrad → Anbieter (Claude, Gemini, OpenAI, Grok, DeepSeek),
Modell und API-Schlüssel. Der Schlüssel wird verschlüsselt auf dem Rechner gespeichert, nie im Repo. Dann einfach
schreiben, z. B. *„Bau eine kleine Tankstelle mit Kiosk und zwei Autos bei 40|30, Loot hinter der Theke“*.

**Claude & Co. direkt verbinden (MCP)**: *KI → Mit Claude & Co. verbinden* zeigt fertige Befehle:
- Claude Code: `claude mcp add --transport http browser-survival-studio http://127.0.0.1:8766/mcp --header "Authorization: Bearer <token>"`
- Claude Desktop: Konfiguration mit `node <Spielordner>/studio/mcp-bruecke.mjs` (Brücke liest Port/Token aus `.studio/mcp.json`)
- Andere (Cursor, VS Code …): Streamable HTTP auf derselben URL mit Token.

Solange das Studio läuft, kann die KI Zonen öffnen, bauen, prüfen und Screenshots der Ansicht anschauen – und in der
**Modell-Werkstatt** Modelle laden, aus Grundkörpern bauen, umfärben, animieren, Höhe/Kollision/Grundfläche einstellen,
Bilder der Bühne ansehen und speichern (`modelle_liste`, `werkstatt_oeffnen`, `modell_*`) – und in der **Audio-Zentrale**
Klänge analysieren (Dauer, Pegel, Stille), schneiden, Ereignissen zuordnen, Pegel/Zonen-Faktoren und Musik-Überblendung
einstellen und das Mischpult abfragen (`audio_*`, `musik_*`, `mischpult`). Jede
KI-Aktion ist ein eigener Undo-Schritt („KI: …“). Der Server ist nur auf diesem Rechner erreichbar und braucht das Token.

## Ordner & Dateien

| Ort | Inhalt |
|---|---|
| `studio/` | Programm (Electron-Hauptprozess `main/`, Oberfläche `oberflaeche/`, Ansicht `ansicht/`, Logik `kern/`) |
| `studio/vorlagen/` | gespeicherte Vorlagen (ins Repo committen) |
| `studio/werkstatt/` | Modell-Werkstatt (Bühne `modellWerk.js`, Oberfläche `werkstatt.js`) |
| `studio/audio/` | Audio-Zentrale (Werk `audioWerk.js`, Oberfläche `audioZentrale.js`) |
| `.studio/` | lokal: Entwürfe, Versionen, Modell-Sicherungen (`modelle/`), Audio-Papierkorb, MCP-Verbindung (gitignored) |
| Einstellungen | Benutzerordner des Programms (Spielordner, KI-Anbieter, verschlüsselte Schlüssel, MCP-Token) |

Spielordner wechseln: Startbildschirm → *Ändern* (oder Datei → Spielordner wechseln).

## Bekannte Grenzen (Phase 1)

- Mehrere Zonen gleichzeitig offen ja, aber **nebeneinander bauen** über Zonengrenzen gibt es noch nicht (Nutzerwunsch: erst einzelne Zonen).
- Beim Bauen zeigt die Standard-Ansicht schnelle Platzhalter; **Spiel-Optik** (`V`) zeigt das echte Aussehen (baut nach Änderungen kurz neu).
- Tiere: das Spiel kennt in Bereichen nur Hasen.
- Die KI-Anbieter sind mit Attrappen getestet; echte Schlüssel waren in der Testumgebung nicht vorhanden.
- Der alte Browser-Editor (`editor/`) bleibt für Handy/Tablet erhalten.

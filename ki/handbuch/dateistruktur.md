# Dateistruktur

> Alle Dateien/Ordner mit Zweck.

## 3. Dateistruktur

```
browser_survival/
├── project_manifest.md            ← DIESE DATEI
├── CLAUDE.md                      Arbeitsanweisung für KI-Sitzungen (verweist hierher)
├── README.md                      Kurzanleitung
├── KI_INDEX.md                    ★ Kompaktkarte für KI-Sitzungen (Architektur, Dateien, Protokoll, Fallen)
├── render.yaml                    Render-Blueprint
├── package.json                   Skripte: start, start:gast, konto, test
├── index.html                     Weiterleitung → client/ (für reine Datei-Hoster)
├── Spiel starten.bat              Windows: Server starten + Browser öffnen
├── Studio starten.bat             Windows: Browser Survival Studio (Desktop-Editor) starten
│
├── studio/                        ── Browser Survival Studio (Electron-Desktop-Editor, Anleitung studio/LIESMICH.md) ──
│   ├── main/                      Hauptprozess (Node): start.mjs (Fenster, IPC, Einstellungen), projekt.mjs (Dateien,
│   │                              Ins Spiel, Import+Credits), dateiServer.mjs, mcp.mjs (MCP-Server), ki.mjs (Assistent), vorab.cjs
│   ├── kern/                      umgebungsfrei: aktionen.js (Bau-Ops), dokument.js (Zonen/Undo/Auswahl), befehle.js,
│   │                              kiWerkzeuge.js (EINE Werkzeugliste für MCP+Assistent), kiAusfuehren.js, kiModelle.js,
│   │                              modelle.js (Werkstatt-Regeln), lootVorschau.js, audio.js, kiAudio.js
│   ├── ansicht/                   viewport.js (Three.js 3D/2D, Sektoren, Gizmo), werkzeuge.js (Q W E R B N H T O G K I P)
│   ├── oberflaeche/               icons.js (eigene SVG), menue.js, panels.js, inspektor.js, kiPanel.js (+ MCP-Dialog), dialoge.js, startbild.js, papierkorb.js, veroeffentlichen.js, assetSuche.js, itemEditor.js
│   ├── MCP_ANLEITUNG.md           KI per MCP verbinden + Speicher-Stufen, für Menschen
│   ├── werkstatt/                 (Phase 3) Modell-Werkstatt: modellWerk.js (Bühne + Bearbeitung, Undo), werkstatt.js (Arbeitsbereich)
│   ├── audio/                     (Phase 2) Audio-Zentrale: audioWerk.js (Dekodieren/Schnitt/Opus/Mischpult), audioZentrale.js
│   ├── app.js · index.html · studio.css · mcp-bruecke.mjs (stdio→MCP) · starten.sh
│   └── vorlagen/                  gespeicherte Vorlagen (Prefabs) des Studios
│
├── docs/                          (Runde 27) aktuelle Neben-Doku, Übersicht docs/README.md
│   ├── ONLINE_STELLEN.md          ★ Checkliste: Server online bringen (Render, Konten-Datei, Umgebungsvariablen)
│   ├── FREE_KI_STARTPAKET.md      Kopiervorlage für KIs mit kleinem Limit
│   ├── EGO_PROTOTYP.md            Ego-Ansicht: alle berührten Stellen
│   └── konzepte/                  TUTORIAL_KONZEPT.md, ZONEN_KONZEPT.md (umgesetzt, Code verweist darauf)
├── archiv/                        (Runde 27) Abgelegtes, vom Spiel NICHT geladen (Übersicht archiv/README.md):
│                                  runden/ (FORTSCHRITT, KONZEPT_RUNDE23/24/26), audio/keuchen_alt/, werkzeuge-reste/
│
├── gemeinsam/                     ── Client UND Server ──
│   ├── konstanten.js              Tickrate, Kachelgröße, Protokollversion, Namensregeln
│   ├── protokoll.js               Alle Nachrichtentypen + kodiere/dekodiere
│   ├── mathe.js                   lerp, Winkel-Interpolation, normalisiere …
│   ├── tageszeit.js               Uhrzeit, Tag/Nacht, Helligkeit aus Sekunden (Server-Logik + Client-Licht)
│   ├── welt/kacheln.js            Kacheltypen (Zeichen → Name, blockiert?) + Marker (S, Z, a–z)
│   ├── welt/welt.js               Klasse Welt: Kachelabfragen, istBlockiert, Türen, Ressourcen-Knoten, naechstesObjekt
│   ├── welt/ressourcen.js         Welche Kartenobjekte abbaubar sind (Baum → Holz/Axt, Stein → Stein/Spitzhacke)
│   ├── welt/wasser.js             (v0.10) istWasserKachel, wurfZiel – Wo landet die Angel-Pose? (Server + Client-Hinweis)
│   ├── welt/gelaende.js           (Editor 2.0) Höhen: KLIPPE 1 m, klippenFuesse, hoeheAn (bilinear), liesHoehen
│   ├── audio/klanglandschaft.js   (Editor 2.0 Phase 4) Klänge der Karte: Felder/Prüfung, Pegel (Punkt/Bereich), Auslöser, Loop/Intervall/Einmal, Pitch, Schnitt
│   ├── basisbau/                  (v0.11) Basisbau – von Server UND Client geteilte Regeln
│   │   ├── teile.js               BAUTEILE-Registry (Menü, Kosten, Kategorien), Rückerstattung, Material-Hilfen
│   │   ├── rechte.js              RECHT, hatRecht/darfBenutzen/darfAbreissen (Gruppen vorbereitet)
│   │   ├── territorium.js         Territorium (Flaggen einer Zone), pruefeFlaggenPlatz
│   │   └── platzierung.js         pruefeBauteil, pruefeAnschluss, snappe (Magnet), autoDrehung, findeAbrissZiel
│   └── physik/
│       ├── bewegung.js            wendeEingabeAn, bewegeKoerper (Kollision) – deterministisch!
│       ├── pfadfindung.js         (v0.10, früher server) A* auf dem Kachelraster – Zombies UND Auto-Lauf per Kartenklick
│       └── strahl.js              Raycasts: strahlGegenWaende, sichtlinieFrei, wegFrei, strahlTrifftKreis
│
├── server/
│   ├── spiel/                     ── Autoritative Spiellogik (läuft in Node UND Browser) ──
│   │   ├── spielServer.js         Sitzungen, Login, Nachrichten-Routing, Chat, Developer-Modus, Tick → Versand
│   │   ├── entwickler.js          Developer-Werte lesen/setzen/zurücksetzen (inkl. Wirkung auf laufende Figuren)
│   │   ├── zone.js                Zone = eine Karte + SpielWelt: Weltzustand laden, Versand pro Tick (Interest Mgmt), Start-/Ankunftsdaten
│   │   ├── spielWelt.js           Spielzustand: Entitäten-Map, Tick, Systemreihenfolge, Schnappschuss, Welt-Speicherstand
│   │   ├── taktgeber.js           Fester Simulationstakt (setTimeout-basiert)
│   │   ├── zufall.js              Seedbarer Zufall (mulberry32)
│   │   ├── entitaeten/
│   │   │   ├── spieler.js         erzeugeSpieler + spielerZuNetzwerk
│   │   │   ├── zombie.js          erzeugeZombie + zombieZuNetzwerk
│   │   │   ├── tier.js            (v0.10) erzeugeTier (Hase) + tierZuNetzwerk
│   │   │   ├── fahrzeug.js        Fahrzeug-Entität (leben/maxLeben/kaputt = Haltbarkeit, Wrack)
│   │   │   └── gegenstand.js      erzeugeGegenstand + gegenstandZuNetzwerk
│   │   ├── systeme/
│   │   │   ├── bewegungsSystem.js Spieler-Eingaben anwenden (inkl. Angriffstaste)
│   │   │   ├── inventarSystem.js  Aufheben, Benutzen, Ausrüsten, Ablegen, Nachladen + Verteiler aller AKTIONEN
│   │   │   ├── adminSystem.js     Admin-Befehle (Gottmodus, Unsichtbar, Heilen, Ausrüsten, Zombies spawnen/töten)
│   │   │   ├── kampfSystem.js     Schüsse (Strahl), Nahkampf (Kegel), fuegeSchadenZu, toeten, Lärm → Zombies
│   │   │   ├── zombieSystem.js    Zombie-KI: Sicht, Verfolgen, Angriff, Türen aufbrechen, Horde, Respawn
│   │   │   ├── tuerSystem.js      Automatiktüren (auf/zu nach Spieler-Nähe), Aufbrechen durch Zombies
│   │   │   ├── tageszeitSystem.js Uhr, Nachtbeginn (Horde) / Morgen (Horde zieht ab)
│   │   │   ├── arbeitSystem.js    Arbeiten mit Dauer: Abbauen (Holz/Stein), Schlafen (+ Zeit vorspulen); Nachwachsen
│   │   │   ├── levelSystem.js     XP & Level (gibXp, xpFuerNaechstesLevel, Zurücksetzen beim Tod)
│   │   │   ├── craftingSystem.js  Herstellen an der Werkbank (prüft Nähe & Zutaten)
│   │   │   ├── tierSystem.js      (v0.10) Hasen: Spawn auf Rasen, Fluchtverhalten, Nachschub
│   │   │   ├── angelSystem.js     (v0.10) Angeln: Auswerfen (Linksklick), Biss-Fenster, Fang (10 % doppelt)
│   │   │   ├── wetterSystem.js    (v0.10) Wetter pro Zone (klar/Regen/Nebel, 1–5 min), WACHSTUM_REGEN_FAKTOR
│   │   │   ├── kistenSystem.js    (v0.10) Lagerkisten: öffnen, einlegen/entnehmen, schließen
│   │   │   ├── bauSystem.js       Bauwerke platzieren, Lagerfeuer, Fallen, Beete/Wachstum, Kochen, E am Bauwerk (Tür, Bett, Kiste), neuesBauwerk()
│   │   │   ├── basisbauSystem.js  (v0.11) AKTION bauen/abreissen: Hammer, Gebiet, Anschluss, Kosten, Abriss mit 75 %
│   │   │   ├── territoriumSystem.js (v0.11) Basis-Flagge setzen/entfernen, Radius (+Skill-Haken), Speichern/Laden der Flaggen
│   │   │   ├── spawnSystem.js     (v0.11) Bett = Spawn Point (setzen, Respawn-Punkt, Bett weg → vergessen)
│   │   │   ├── fahrzeugSystem.js  Ein-/Aussteigen, Fahren, Zombies anfahren
│   │   │   ├── zonenSystem.js     Übergangs-Rechtecke erkennen → spieler.zonenwechsel
│   │   │   ├── ueberlebenSystem.js Hunger, Durst, Heilung, Wiederbelebung
│   │   │   ├── zielSystem.js      Überlebens-Tagebuch: zählt Ereignisse, hakt Kapitel-Ziele ab (XP), bleibt über den Tod (Daten: konfiguration/ziele.js)
│   │   │   └── lootSystem.js      Start-Loot, Nachschub an Loot-Punkten, Zombie-Beute
│   │   ├── karten/
│   │   │   ├── kartenLader.js     Kartenregister + ASCII → Kacheln/Spawns/Loot-Punkte
│   │   │   ├── tutorial.js        Tutorial-Zone „Kreisklinik Hohenfeld“ (generiert: werkzeuge/karten/tutorial.py, NICHT in KARTEN)
│   │   │   ├── lootZonen.js       (Editor 2.0, 6.2) Loot-Zonen: Prüfung, feste Punkte, Würfeln (Chance/Gewicht), erwartete Ausbeute
│   │   │   ├── stadtrand.js       Startzone (110×86, GENERIERT von werkzeuge/karten/stadtrand.py)
│   │   │   └── waldweg.js         Zone Waldweg (160×120: Ringstraße mit Autos, Wald, See, Angelhütte; GENERIERT von werkzeuge/karten/waldweg.py)
│   │   ├── konfiguration/
│   │   │   ├── spielKonfiguration.js  Balancing-Standardwerte + Überschreib-Logik
│   │   │   ├── rezepte.js         ★ Crafting-Rezepte (einfach selbst anpassbar, Anleitung im Kopf der Datei)
│   │   │   ├── entwicklerFelder.js ★ Welche Werte der Developer-Modus anbietet
│   │   │   ├── gegenstaende.js    Item-Datenbank (Essen, Trinken, Medizin, Waffen, Munition)
│   │   │   └── lootTabellen.js    Welcher Raumtyp welche Items (gewichtet)
│   │   ├── netz/speicherKanal.js  In-Memory-Kanal (Lokal-Modus, Tests) + Kanal-Schnittstelle
│   │   ├── spielstand.js          Spielstand erstellen / prüfen & übernehmen
│   │   ├── speicher/arbeitsspeicherSpeicher.js  Speicher-Schnittstelle + Variante im Arbeitsspeicher
│   │   └── authentifizierung/gastAuthentifizierung.js   Auth-Schnittstelle + Gast-Variante
│   ├── node/                      ── Nur Node.js ──
│   │   ├── start.js               Einstieg: liest Einstellungen, startet HTTP + WS + Spiel
│   │   ├── statischerServer.js    Liefert client/, gemeinsam/, server/spiel/ aus (sonst nichts!)
│   │   ├── websocketAnbindung.js  ws-Socket → Text-Kanal, Herzschlag, Größenlimits
│   │   ├── kontenAuthentifizierung.js  Login gegen konten.json (Klartext → automatisch gehasht)
│   │   ├── passwort.js            scrypt-Hashing
│   │   ├── dateiSpeicher.js       Spielstände als JSON-Dateien (atomar geschrieben)
│   │   └── einstellungenLaden.js  einstellungen.json laden + Developer-Änderungen zurückschreiben
│   ├── werkzeuge/kontoAnlegen.js  CLI: npm run konto -- <name> <passwort>
│   └── daten/                     konten.json, einstellungen.json, spielstaende/ (gitignored) + *.beispiel.json (Vorlagen)
│
├── editor/                        ★ Map-Editor (eigener Einstieg, Details §8, Anleitung editor/LIESMICH.md)
├── werkzeuge/karten/              Kartengeneratoren (Python), Tiled-Export/-Import (`tiled.mjs`, `tiledKarte.mjs`), Editor-Import (`editorImport.mjs` + `eigeneModelle.mjs` / `eigeneKlaenge.mjs`), README
├── werkzeuge/test/rauchtest.mjs   Browser-Rauchtest (Playwright) → `npm run rauchtest`
├── werkzeuge/musik/indexieren.mjs (v0.10) schreibt client/musik/musik.json → `npm run musik:index`
├── werkzeuge/assets/              ── Grafik-Pipeline ──
│   ├── baue_assets.py             (Python) Quellen, Item-/Möbel-Zuordnung, Spritesheets, 3D-Figur → client/assets/
│   ├── baue_3d.mjs                (Node, danach) 3D-Animationen → JSON, Three.js verkleinert → client/vendor/three/
│   └── anforderungen.txt          pip-Pakete (pillow, numpy, cairosvg, py7zr)
│
├── werkzeuge/python-pakete/       (Runde 27) Offline-Wheels für py7zr (`pip install --no-index --find-links werkzeuge/python-pakete py7zr`)
│
├── client/                        ── Nur Browser ──
│   ├── assets/                    GENERIERT: atlas.json, items.webp, umgebung.webp, 3d/ (Figur, Skins, Animationen), LIZENZEN.md
│   ├── vendor/three/              GENERIERT: Three.js (MIT)
│   ├── musik/                     (v0.10) Musik-Ordner: stadtrand/, waldweg/, alle/ + musik.json (siehe README dort; NICHT generiert, nicht überschrieben)
│   ├── index.html                 Canvas, Touch-Sticks, HUD, Ladebildschirm, Login, Credits-Dialog
│   ├── stil.css                   Gesamtes UI-Styling
│   ├── main.js                    Einstieg: verdrahtet Login → Verbindung → ClientSpiel
│   ├── konfiguration.js           Serverliste (★ ONLINE_SERVER für die Pages-Version), Interpolation, Lokal-Latenz
│   ├── kern/
│   │   ├── clientSpiel.js         Laufende Sitzung: Vorhersage, Reconciliation, Interpolation
│   │   ├── grusel.js              Grusel-Direktor: Herzschlag + roter Puls, Geräusche aus dem Dunkeln, Lampen-Flackern (nur Client)
│   │   ├── bauModus.js            (v0.11) Bau-Modus: BUILD, Hologramm, Snapping-Ziel, Klicks, Gebiets-Ring
│   │   ├── spielSchleife.js       requestAnimationFrame-Loop mit festem Takt
│   │   ├── eingabe.js             Tastatur/Maus/Touch vereint: richtung(), blickWinkel(), Tastenbelegung (TASTEN)
│   │   └── touchSteuerung.js      Virtuelle Joysticks (Pointer Events)
│   ├── netzwerk/
│   │   ├── verbindungAufbauen.js  Fabrik: Lokal vs. WebSocket
│   │   ├── jsonVerbindung.js      Text-Kanal → Objekt-Nachrichten
│   │   ├── websocketKanal.js      Browser-WebSocket als Text-Kanal
│   │   ├── lokalerServer.js       Startet SpielServer im Tab (Lokal-Modus) + Wegwerf-Server fürs Tutorial (oeffneTutorialKanal)
│   │   ├── browserSpeicher.js     Spielstände im localStorage (Lokal-Modus)
│   │   └── anmeldung.js           Login-Handshake (Promise)
│   ├── audio/
│   │   ├── zonenMusik.js          (v0.10) Zonen-Musik aus client/musik/<zone>/ (Index musik.json, Überblenden, Zufall)
│   │   ├── klaenge.js             (Editor 2.0 Phase 4) Klanglandschaft der Karte abspielen (Busse, Nähe, Stereo, Auslöser, nächste N Quellen); Dateien in client/audio/karten/<karte>/
│   │   └── sound.js               Synthetisierte Geräusche (Rezepte), räumlicher Klang, Wind/Atmosphäre (eigener Bus am Kompressor vorbei), Lautstärke-Kanäle (gesamt/effekte/atmosphaere), keine Schritte mehr
│   ├── darstellung/
│   │   ├── renderer.js            Three.js: Kamera, Figuren, Licht/Tageszeit, Lampen-Pool, Effekte, Wand-Schnitt, Overlay, Vorkompilieren
│   │   ├── tierModelle.js         (v0.10) Hase (Comic-Platzhalter, prozedurale Textur) – hier echte Modelle einhängen
│   │   ├── basisbauModelle.js     (v0.11) Basisbau-3D: Geometrien, instanzierte Schicht (Boden/Wand/Dach), Gebiets-Ring, Dach-Ausblendung
│   │   ├── angelModell.js         (v0.10) Rute, Schnur, Pose (wackelt beim Biss)
│   │   ├── wetterEffekt.js        (v0.10) Regen-Striche + weiche Übergänge Regen/Nebel (Licht, Nebelweite, Ton)
│   │   ├── kartenModell.js        Statische Karte in wenigen Draw-Calls: Boden, Wände, Möbel, Türen, Bäume/Steine (abbaubar), Lampen
│   │   ├── baumModell.js          Baum-Varianten (GLB, Mischung je Karte, Wind), Büsche/Stümpfe prozedural
│   │   ├── itemModelle.js         ★ 3D-Modelle der Items am Boden (neues Modell = Eintrag in BAUPLAENE) + Rucksack
│   │   ├── fussspuren.js          Fußspuren (InstancedMesh mit Deckkraft pro Abdruck)
│   │   ├── reifenspuren.js        Reifenspuren der Autos auf Gras/Schnee (InstancedMesh, Runde 20)
│   │   ├── geraet.js              Auto-Grafik: Leistungsklasse aus Grafikchip/Kernen/Speicher (Runde 20)
│   │   ├── geometrie.js           Geometrien zusammenfassen, Matrizen, Einfrieren
│   │   ├── figurHaltung.js        Prozedurale Arm-Haltung (Zielen, Rückstoß, Schlag) + Waffe in der Hand
│   │   ├── waffenModelle.js       Waffen-/Lampenmodelle aus einfachen Körpern
│   │   ├── bodenTextur.js         Boden der ganzen Karte als Canvas (Texturen, Markierungen, Gehweg, Schwellen)
│   │   ├── effekte.js             Zustand für Mündungsfeuer, Leuchtspuren, Blut, Blutlachen, Schadensblitz
│   │   ├── beschriftung.js        Namen & Lebensbalken auf dem Overlay
│   │   ├── assets.js              Atlas + Bilder laden (Items, Böden, Möbel)
│   │   └── farben.js              Farben für Prozedurales + Ersatzfarben
│   └── ui/
│       ├── loginBildschirm.js     Login-Formular, Serverauswahl, "Als Gast spielen" (gastName())
│       ├── hud.js                 Uhr, Balken, Schnellleiste, Aktions-/Tür-Knopf, Fortschritt, Chat, Spielerliste, Tod, Admin, Debug
│       ├── werkbankMenue.js       Crafting-Menü (Kategorien, Zutaten, Herstellen)
│       ├── inventarFenster.js     Inventar (Tab): Schnellleiste/Tasche/Rucksack, Drag & Drop, Rauswerfen
│       ├── bauMenue.js            (v0.11) Bau-Menü (Reiter, Karten aus der Registry, Werkzeuge)
│       ├── kisteFenster.js        (v0.10) Lagerkiste: 16 Plätze + Inventar, Antippen = verschieben
│       ├── karte.js               Karte mit Nebel (erkundete Bereiche, localStorage), Minikarte (zeichneMini), Klick → Auto-Lauf
│       ├── entwicklerFenster.js   Developer-Modus (Werte ändern, Export/Import)
│       └── credits.js             Credits-Dialog (Grafik-Lizenzen)
│
└── tests/                         node:test – Karte, Bewegung, Server-Ablauf, Konten, Inhalte (Erreichbarkeit, Grafiken)
```

---

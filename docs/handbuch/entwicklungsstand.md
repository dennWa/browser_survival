# Entwicklungsstand

> Phasen 1–11, Ideen, nächste Schritte, bekannte Grenzen.

## 6. Entwicklungsstand

### ✅ Phase 1 – Grundgerüst (fertig, v0.1.0)
- Modulare Struktur Client / Server / Gemeinsam
- Autoritativer SpielServer mit festem 30-Hz-Takt, läuft in Node und im Browser
- WebSocket-Mehrspieler + Lokal-Modus über identische Kanal-Schnittstelle
- Login-Flow: Serverauswahl, Account-Login (scrypt), Gastmodus lokal, Doppel-Login-Sperre, Fehlversuchslimit
- WASD-Bewegung mit Kachel-Kollision, Client-Side Prediction + Reconciliation, Interpolation fremder Entitäten
- Krankenhauskarte (64×46 Kacheln, 11 Räume, Türen, Fenster), Raumbeschriftungen
- Zombies werden gespawnt (stehen still), Loot wird nach Raumtyp verteilt (liegt nur herum)
- Item-Datenbank: Essen, Trinken, Medizin, Nahkampf, Fernkampf, Munition
- HUD (Server, Spieler online, Ping, Leben), Debug-Overlay F3, Abmelden
- Tests: Karte, Bewegung/Kollision, Server-Ablauf, Konten (14 Tests)

### ✅ Phase 1.5 – Grafik & Mobil (fertig, v0.2.0)
- Grafik-Pipeline mit 9 freien Paketen, WebP-Spritesheets, Atlas, Credits-Dialog
- Animierter Survivor (4 Ausrüstungen × bis zu 5 Aktionen + Beinanimationen), animierter Zombie (idle/laufen/angriff)
- 23 Items mit Icons (Essen, Trinken, Medizin, Nahkampf, Fernkampf, Munition)
- Texturierte Böden je Raumtyp (Fliesen, Beton, Holz, Gras), Wände mit Kanten & Schattenwurf, Fenster, Türschwellen
- Möbel mit Kollision (Betten, Tische, Küche, Sofas, Kisten …), Parkplatz mit Autos, Bäume mit Kronen über den Figuren
- Touch-Steuerung (2 Joysticks), adaptiver Zoom, Vollbild, Handy-taugliches Login, Ladebildschirm
- Tests: Erreichbarkeit aller Loot-/Spawnpunkte, jede Grafik vorhanden (19 Tests)

### ✅ Phase 2 – Core Gameplay (fertig, v0.3.0)
- Zombie-KI: Sicht mit Wandblockade, Gehör für Schüsse, direkte Verfolgung oder A*-Umweg, Angriff, Abstand untereinander, Respawn
- Inventar (8 Plätze, Stapel), Aufheben (E), Benutzen/Ausrüsten (1–8), Ablegen (Rechtsklick / lange tippen), Nachladen (R)
- Fernkampf per Strahl (Pistole, Schrotflinte mit Streuung), Nahkampf-Kegel (Messer, Hammer, Machete, Beil, Taschenlampe)
- Hunger & Durst, Regeneration, Tod mit Item-Verlust, Respawn; Loot-Nachschub & Zombie-Beute
- Aktionsanimationen (Schießen/Nachladen/Nahkampf/Zombie-Biss), Effekte, HUD mit Schnellleiste & Balken, Todesbildschirm
- Touch: rechter Stick voll = Angriff, Knöpfe für Aufheben/Nachladen, Schnellleiste antippbar
- Tests: 36 (u. a. Strahlen, A*, Inventar, Kampf, Zombie-KI inkl. Umweg um Möbel, Tod/Respawn)

### ✅ Phase 3 – Tiefe, Atmosphäre, Spielstand, 3D-Prototyp (fertig, v0.4.0)
- Handy: Seite scrollt beim Steuern nicht mehr (Fixierung + nicht-passive Touch-Listener)
- Sprinten mit Ausdauer (deterministisch für die Vorhersage), Sprint-Lärm; Zombie-Varianten Läufer & Brocken; Umherschlurfen
- Spielstände: Datei (Server) / localStorage (Lokal), Autosave, Prüfung beim Laden
- Dunkelheit mit Taschenlampen-Sichtpolygonen, flackernde Lampen; synthetischer Sound mit Richtung
- 3D-Prototyp mit Three.js (im Login wählbar), gleiche Renderer-Schnittstelle
- Tests: 47

### ✅ Phase 3.5 – Fairer & Admin (fertig, v0.5.0)
- Zombies: 16 → 5, nur noch draußen; langsamer (Jagd 85 / Läufer 115 / Brocken 62), Respawn 120 s
- Faustschlag statt Taschenlampen-Hieb (5 Schaden); Taschenlampe an/aus (L, 🔦) – im Dunkeln schlechter sichtbar
- Tod: Knopf "Sofort wiederbeleben" (Enter); Countdown läuft weiter als Alternative
- Admin-Modus: Recht aus der Authentifizierung, Admin-Menü 🛡 (P), alle Befehle serverseitig geprüft
- Fix: Marker-Kacheln (S/Z/Loot) erben nie eine Wand als Untergrund
- Tests: 53

### ✅ Phase 4 – 3D, Stadtrand, Türen, Tag & Nacht (fertig, v0.6.0)
- **Nur noch 3D:** 2D-Renderer, 2D-Licht, Sprite-Figuren (1,1 MB) entfernt; Grafik-Auswahl im Login weg
- Neue Karte „Stadtrand“ (110×86): logisches Krankenhaus (Eingangshalle → Hauptflur → Mittel-/Stationsflure,
  Notaufnahme mit eigenem Eingang, Kantine + Küche), Straßen, Parkplatz, 2 Wohnhäuser, Tankstelle + Werkstatt,
  Supermarkt, Polizeiwache mit Waffenkammer, Park mit Kiosk; 22 Räume, Gehweg-Kachel, neue Loot-Tabellen
- Türen: Automatik (öffnen beim Näherkommen, schließen dahinter), blockieren Laufen/Sicht/Schüsse, Zombies brechen sie auf, 3D-Flügel
- Tag (10 min) & Nacht (5 min): wandernde Sonne, Dämmerung, Laternen nachts, HUD-Uhr, Nacht-Horde, Taschenlampe zählt nachts
- Waffen sichtbar in der Hand + Zielhaltung, Rückstoß, Nachladen, Schwung, Faustschlag; Zombie-Arme
- Wand-Schnitt (Figur nie hinter Wänden versteckt), Kamera zoomt auf Handys raus
- Admin: Tag ⇄ Nacht; Protokoll v3 (TUEREN, Uhrzeit, AKTION `tuer`)
- Tests: 58

### ✅ Phase 5 – Ressourcen, Crafting, Performance, Developer, Multiplayer-Basis (fertig, v0.7.0)
- Performance: ~1000+ → ~95 Draw-Calls, Lampen-Pool, Shader vorkompiliert, adaptive Auflösung, A*-Budget
- Holz & Stein abbauen (Axt/Spitzhacke, 5 s, Hack-Animation), Nachwachsen; Steine auf der Karte
- Crafting an Werkbänken (Menü mit Kategorien), Rezeptdatei zum Selbst-Bearbeiten; Bretter verstärken Türen
- Schlafen im Bett heilt; Spawn im Wohnhaus neben dem Bett; Startausrüstung Pistole/Axt/Spitzhacke
- Todes-Loot verschwindet nach 3 min; Waffen (selten) in Wohnhäusern
- Karte mit Nebel des Krieges (K); Chat (T), Spielerliste (Tab), Beitritt/Verlassen-Ansage
- Developer-Modus mit dauerhafter Speicherung, Export/Import; Online-Deploy: `render.yaml`, `KONTEN_JSON`
- Protokoll v4; Tests: 69

### ✅ Phase 6 – Inventar, Level, Online-fertig, Feinschliff (fertig, v0.8.0)
- Türen: Ecken-Gleiten in Öffnungen (weniger Zielen nötig), Zombies verkeilen sich nicht (Vorfahrt + Ausweichen)
- Nahkampf: größere Reichweiten (bis zum Rand des Ziels), breiterer Kegel; Reichweite im Developer-Modus
- Cartoon-3D-Bäume (Toon + Umriss) statt flacher Kronen; Stümpfe sichtbar; zwei versteckte Steine unter Bäumen verlegt
- Sound ohne Knistern (Anschlag-Hüllkurven, Vorlauf), leise Schritte; adaptive Auflösung mit Hysterese (kein Ruckeln)
- Schlafen in jedem Bett: 6 Std. vorspulen (Mehrspieler: wenn alle schlafen), Abblende; Blutflecken 2 min
- Level-System (10 XP/Zombie, 50/70/90 …, Tod = Level 1), HUD + Spielerliste
- Inventar-Fenster (I/🎒): Schnellleiste + Tasche + Rucksack (+8, am Rücken sichtbar), Drag & Drop, Rauswerfen, Q
- 3D-Items am Boden mit Leuchtring, Fußspuren (~8 m)
- Multiplayer startklar: „Als Gast spielen“, Konten-Datei mit Klartext → Auto-Hash, Render Secret File,
  `DATEN_ORDNER`/`GAESTE`/`SERVER_NAME`, Mitspieler & Werkbänke auf der Karte, `docs/ONLINE_STELLEN.md`
- Protokoll v5 (AKTION `tauschen`, `rucksackAblegen`, ANMELDEN `gast`); Tests: 82

### ✅ Phase 7 – Bauen, Farmen, Skills, Autos, Open World (fertig, v0.9.0)
- Kamera: Mausrad-Zoom; Bild-Unschärfe-Bug (Qualitätsstufen + Aufwärmphase), Ladebildschirm bis alles vorkompiliert ist
- Ruckeln: geglättete Tick-Uhr, Objekt-Pool, Maus-hängt-Fix (Touch überschrieb Maus)
- Zombies: sehen nicht ins Haus, Tür-Engstellen (kein Verkeilen zu zweit), verschwinden am Todesort, XP je Variante (10/12/15)
- Ressourcen: je 1 (+20 % auf 2), Baum 6 s, Stein 8 s, **Eisenerz** 10 s; Baum fällt mit Knack-Geräusch
- **Bauen** im Inventar (Werkbank 4 Holz, Lagerfeuer 3 Holz, Falle) + Platzier-Modus; Lagerfeuer mit F + Feuerzeug
- **Farmen:** Hacke, Beete, Samen (Loot), Wachstum 1 Tag, Ernte 2, Kochen am Feuer +30 %
- **Skills** (U), Rucksäcke 4/6/8, **Charakter Mann/Frau** (+ Grundgerüst Haare/Gesicht/Farben)
- **Autos fahren** (gemeinsame Physik, Vorhersage, Anfahren, Scheinwerfer, Motorsound)
- Spielstand: Erkundung & Aussehen & Skills auf dem Server (geräteübergreifend), Welt pro Zone gespeichert
- **Open World:** Zonen (`zone.js`), Übergänge, 2. Zone Waldweg, `ZONE_WECHSEL` (Protokoll v7), Tiled-Import, Kartengeneratoren
- Performance: Schnappschüsse gerundet/kompakt, Interest Management, WebSocket-Kompression (~5× kleiner)
- Werkzeuge/Doku: `KI_INDEX.md`, `npm run rauchtest`, `werkzeuge/karten/README.md`; Tests: 118

### ✅ Phase 8 – Welt, Jagd & Wetter (fertig, v0.10.0, Protokoll 8)
- **Große Zone Waldweg** (160×120): Ringstraße mit 5 Autos, See (Angeln), Angelhütte, dichter Wald; Auto-Lauf per Kartenklick (A*)
- **Autos:** 10 Schläge Haltbarkeit, Überfahren 0,5, Wrack + Auswurf; **Boss-Zombies** zäher/stärker, 50 % Waffe + Munition
- **Hasen** (Fleisch), **Angeln** (3 Fische, 10 % doppelt), **Wetter** (Regen/Nebel 1–5 min, Regen halbiert Pflanzenzeit)
- **XP** fürs Abbauen (3), **Crafting-Level**, **Stapelgrößen** (Munition 50, sonst 20), **Statistik** im Tab, **Lagerkiste**,
  **Erdfeld** mit der Spitzhacke (+ Paprika), **Basisbau-Gerüst** (Holzwand/-boden)
- HUD: FPS, Minikarte (ein/aus), Auto-Haltbarkeit; **Musik**-Ordnersystem, leiserer Wind, Regenton
- Fix: „extrem dunkel im Norden im Auto“ = fast schwarzer Rasen jenseits des Kartenrands + Nebel, der beim Rauszoomen nicht mitwuchs

### ✅ Phase 9 – Basisbau (fertig, v0.11.0, Protokoll 9)
- **BUILD-Modus** (Knopf/Taste B): Hammer wird ausgerüstet, Bau-Menü, Hologramm grün/rot, Snapping (Magnet), Drehen (R), Abriss (X) mit 75 % Rückgabe
- **Territorium:** Basis-Flagge (eine pro Spieler, flacher freier Rasen), Baugebiet 15 m, roter Ring nur für den Besitzer (V schaltet), Rechteprüfung zentral (`rechte.js`, Gruppen vorbereitet)
- **Teile Tier 1 (Holz):** Boden, Dach, Wand, Wand mit Fenster, Wand mit Türöffnung, Tür, Lagerkiste, Bett (+ neues Item **Stoff**); Ebenen-System (Boden/Objekt/Wand/Tür/Dach pro Kachel)
- **Bett = Spawn Point** (auch zonenübergreifend), Weltstand speichert Flaggen, Tür-Zustand, Drehung; Delta-Pakete `BAUWERKE_AENDERUNG`
- Performance: Böden/Wände/Dächer als InstancedMesh (1 Draw-Call je Typ), Dach-Ausblendung per Flood-Fill nur bei Änderung, Karte zeichnet Struktur als Farbfelder
- Tests: `tests/basisbau.test.js` (152 insgesamt)

### ✅ Phase 10 – Handy & Komfort (fertig, v0.12.0, Protokoll 9 unverändert)
- **Handy-HUD:** kompakte Statusbalken ohne Symbole (Standard am Handy), je Balken ein-/ausblendbar (⚙ → Handy); Ausrufezeichen bei Leben/Hunger/Durst < 20 %
- **Touch-Steuerung:** Sticks fest unten links/rechts (Abstand/Höhe einstellbar) oder „Frei (Daumen)“ wie früher; Pinch-Zoom mit zwei Fingern; Tippen auf Zombie = anvisieren (Auto-Aim + Dauerfeuer bis er fällt, roter Ring; PC: Rechtsklick)
- **Angeln:** Knopf „Auswerfen/Einholen“ (Handy) statt riesigem Biss-Banner
- **Zombies:** Sichtradius 240→170, Tempo −10 %; im Haus (auch selbstgebaut: Dach) unsichtbar/unhörbar, außer sie jagen schon; am Lagerfeuer sitzend übersehen; geben hinter Zäunen auf (4 s)
- **Basisbau:** Boden/Wand/Dach als 2×2-Block (`basisbau.blockGroesse`, halber Preis), Baugebiet 8 m, **Zaun** (2 Eisenerz) + **Zauntor** (4 Eisenerz + 2 Holz)
- **Welt:** Stadtrand 155×130 mit 5 Kacheln breiten Straßen, Straßenlaternen (Mast, kleines warmes Licht, jede dritte flackert), fallende Blätter, weniger Hasen, Schlafen ohne Zeitsprung (`schlafen.stunden` = 0)
- Admin-Menü hat ✕ und schließt bei Tipp daneben

### ✅ Phase 11 – Feedback-Runde 13 (fertig, v0.13.0, Protokoll 10)
Stationen (Lagerfeuer-Kochen, Schmelzofen) mit eigenem Menü, Haltbarkeit, Hand-Items (Essen, Holz, Samen, Hacke), Kofferraum, Angel-Beute, klein/groß, Sichtkegel, Performance-Culling, Audio-Korrekturen, Admin-Werkzeuge. Details: KI_INDEX.md §6 „v0.13“.

### 💡 Ideen-Sammlung (für später, grob nach Aufwand)
**Schnell umsetzbar**
- Eisen (in der Werkstatt/Autos ausschlachten) → bessere Rezepte (Machete, Nägel, Munition)
- Lagerfeuer bauen: Wärme in der Nacht, Essen braten (rohes Fleisch von Tieren)
- Fenster verbarrikadieren, Fallen (Stacheldraht, Bärenfalle), Kiste als Lager im Haus
- Waffenhaltbarkeit, Reparieren an der Werkbank
- Tutorial-Hinweise beim ersten Start (E benutzen, Tür, Werkbank …), Erfolge/Statistik (Tage überlebt, Kills)
- Level-Belohnungen (z. B. +5 Max-Leben pro Level, schnelleres Abbauen, Rezepte ab Level X)
- Größere Rucksäcke (Wanderrucksack +16), Kisten als Lager im Haus
**Mittel**
- Bauen: Wände/Türen selbst setzen (Raster), Basis mit Spielern teilen
- Tiere (Rehe, Hunde) zum Jagen; Fischen am Teich; Garten (Saatgut → Gemüse)
- Fahrzeuge reparieren und fahren (Benzin von der Tankstelle)
- Wetter (Regen, Nebel) – beeinflusst Sicht & Geräusche; Krankheiten/Infektion durch Bisse
- Quests per Funkgerät ("Hole Medikamente aus der Apotheke") mit Belohnung
**Groß**
- Mehrere Karten (Stadt, Wald, Militärbasis) mit Übergängen; Evakuierungs-Finale
- Gruppen/Clans, Handel zwischen Spielern, PvP-Zonen
- Interest Management & Server-Sichtlinie (nur Sichtbares senden) für viele Spieler online

### ⏳ Nächste Schritte (wartet auf Entscheidung)
- Online stellen (Checkliste `docs/ONLINE_STELLEN.md`) und mit Freunden testen
- Musik & echte Geräusch-Aufnahmen (statt Synthese)

### 🔭 Später
- Sichtlinie / Nebel des Krieges serverseitig (aktuell sieht der Client alle Zombies, nur die Grafik verdeckt sie)
- Innenräume ohne Sicht nach außen abdunkeln; Zombies erkennen selbstgebaute Häuser (`istInnen` + Dach) als „Haus“; Zombies greifen Wände/Türen an
- Basisbau-Ausbau: Gruppen/Einladen (Rechte sind vorbereitet), Skill „Baugebiet erweitern“ (`radiusZuschlag`), Stein-/Metall-Tier, Möbel/Öfen, Verfall, Flagge verschieben/entfernen für Spieler
- Interest Management (nur nahe Entitäten senden), Delta-Kompression – sobald Spielerzahl/Karte wächst
- Treffer-Vorhersage im Client (sofortiges Feedback trotz Ping)
- Mehrere Karten / Serverbrowser mit Live-Status
- HTTPS/WSS hinter Reverse Proxy (z. B. Caddy/nginx) für Betrieb im Internet

### Bekannte Grenzen (bewusst, für später)
- Login-Daten gehen über `ws://` unverschlüsselt → im Internet nur über `wss://` (HTTPS-Proxy) betreiben
- Eingabepuffer verwirft bei extremem Lag Eingaben (Schutz vor Speedhacks) → leichte Korrektur-Ruckler möglich
- Spieler werden zonenweit immer gesendet; Zombies/Autos nur im Umkreis 2400 px (Client sieht sonst nichts davon)
- Zonen ohne Spieler pausieren (Zombies/Loot dort bleiben eingefroren), Zeit wird beim Betreten nachgeholt
- Schuss-/Treffer-Feedback kommt erst nach einer Server-Runde (bei 50 ms Ping kaum spürbar, bei 200 ms schon)
- Nahkampf trifft sofort beim Tastendruck (nicht erst im passenden Animationsframe)
- Figuren-Animationen nur stehen/rennen; Arme werden prozedural gedreht (keine echte Animations-Mischung)
- Leistung auf schwachen Handys: Schatten + große Bodentextur (3520×2752) – ggf. Qualitätsstufe nachrüsten
- Basisbau-Wände füllen eine ganze Kachel (kein dünnes Kanten-Raster) – Kollision, Pfadsuche und Sicht bleiben kachelbasiert; Zombies kennen selbstgebaute Wände nur als Hindernis
- Die Basis-Flagge lässt sich nur per Admin-Befehl entfernen (Admin-Menü); Gebiete mehrerer Flaggen dürfen sich am Rand überlappen (näheste Flagge gewinnt)
- Abgebaute Ressourcen und Türen werden nicht gespeichert (Uhr, Bauwerke, Beete, Autos schon, pro Zone)
- Developer-Werte gelten im Lokal-Modus nur in diesem Browser (Export/Import zum Übertragen)
- Render-Free-Plan: keine dauerhafte Festplatte → Spielstände & Einstellungen gehen beim Neustart verloren

---

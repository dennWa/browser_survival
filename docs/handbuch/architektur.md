# Architektur

> Datenfluss, Gameplay-Regeln, Spielstände, Grafik-Pipeline, Darstellung, Sound, Login.

## 2. Architektur

```
 ┌──────────────── Browser ────────────────┐            ┌──────────── Node.js ────────────┐
 │ client/                                 │            │ server/node/                    │
 │  UI (Login, HUD) → ClientSpiel          │  WebSocket │  start.js  (HTTP + /ws)         │
 │  Eingabe → Vorhersage → Renderer        │◄──────────►│  websocketAnbindung.js          │
 │        │                                │   JSON     │  kontenAuthentifizierung.js     │
 │        ▼ JsonVerbindung                 │            │            │                    │
 │  ┌─ Lokal-Modus ──────────────────────┐ │            │            ▼                    │
 │  │ Speicher-Kanal → server/spiel/ ... │ │            │      server/spiel/ (identisch)  │
 │  └────────────────────────────────────┘ │            └─────────────────────────────────┘
 └─────────────────────────────────────────┘
            gemeinsam/  ← von BEIDEN Seiten importiert (Protokoll, Welt, Physik, Konstanten)
```

**Kernidee:** `server/spiel/` ist reines JavaScript ohne Node- oder Browser-APIs. Dieselbe Spiellogik läuft
im Node-Server (Mehrspieler) und im Browser (Lokal-Modus). Client und Server sprechen *immer* über einen
**Text-Kanal** – ob WebSocket oder Speicher-Kanal ist für beide Seiten unsichtbar.

**Zonen (offene Welt):** Der `SpielServer` hält pro Karte eine `Zone` (`server/spiel/zone.js`) mit eigener `SpielWelt`.
Jede Sitzung gehört zu genau einer Zone (`sitzung.zone`) und bekommt nur deren Daten (Chat nur in der Zone, `/a` an alle; Spielerliste serverweit). Betritt ein Spieler zu Fuß ein
Übergangs-Rechteck (`uebergaenge` der Karte, `systeme/zonenSystem.js`), zieht der Server ihn um: Spielstand mitnehmen →
alte Zone verlassen → in der Zielzone am Ankunftspunkt neu erzeugen → `ZONE_WECHSEL` (Client baut mit Ladebildschirm neu
auf, Verbindung bleibt). Die **Startzone läuft immer** und ist die Weltuhr; andere Zonen laufen nur mit Spielern und holen
beim Betreten die verpasste Zeit nach (Pflanzen wachsen, Bäume wachsen nach). Schlafen spult nur vor, wenn **alle**
Spieler aller Zonen schlafen; der Zeitsprung gilt dann für alle aktiven Zonen. Chat ist zonenübergreifend.

### Datenfluss pro Tick (30×/s)
1. Client: Tasten lesen → `EINGABE {seq, x, y, blick, angriff}` senden **und** Bewegung sofort lokal anwenden (Vorhersage).
   Einmalige Aktionen (aufheben, benutzen, ablegen, nachladen, tuer, abbauen, schlafen, herstellen, licht, wiederbeleben,
   admin) gehen als `AKTION {art, slot?, befehl?, rezept?}`. Chat: `CHAT {text}`; Developer: `DEV_ABFRAGEN/SETZEN/ZURUECKSETZEN`.
2. Server: Eingaben/Aktionen prüfen → Puffer des Spielers (je max. 8)
3. Server-Tick `SpielWelt.aktualisiere()` – Systeme in fester Reihenfolge:
   Aktionen ablaufen lassen → Bewegung → Inventar-Aktionen → Nachladen → Kampf (Spielerangriffe)
   → Arbeit (Abbauen, Schlafen, Nachwachsen) → Zombie-KI → Überleben (Hunger/Durst/Respawn) → Loot-Nachschub → Tageszeit (Uhr, Horde)
4. Server sendet an alle Spieler **der Zone**: `ZUSTAND` (Spieler, Zombies, Autos, Uhrzeit `zeit`/`tag` + `ereignisse` des
   Ticks: Schüsse, Treffer, Tode, Türen, Hacken …) – **Interest Management:** Zombies/Autos nur im Umkreis
   `NETZ_SICHTWEITE` (2400 px) um den Empfänger, Mitspieler immer; Zahlen gerundet (außer eigene Vorhersagewerte).
   `GEGENSTAENDE`, `TUEREN`, `RESSOURCEN`, `BAUWERKE` nur bei Änderung; `CHAT` und
   `EINSTELLUNGEN` (nach Developer-Änderungen: Physik, Tageslänge, Item-Werte) an alle. An jeden einzeln: `SPIELER_DATEN` (Inventar, Hunger, Durst … nur bei Änderung)
   und `MELDUNG`en ("Inventar voll"). WebSockets komprimieren (permessage-deflate, Schnappschuss ~4,4 KB → ~0,9 KB).
5. Client: eigene Position übernehmen + unbestätigte Eingaben nachspielen (Reconciliation); andere Entitäten
   100 ms verzögert interpolieren; Ereignisse → Effekte (fremde ebenfalls 100 ms verzögert, eigene sofort).

### Gameplay-Regeln (Kurzfassung)
- **Zombies:** sehen Spieler im `aggroRadius` nur bei freier Sicht (Wände/Fenster blockieren, Möbel nicht) und **nie
  ins Haus hinein** (Spieler auf Innenboden = versteckt, Geräusche locken trotzdem), hören
  Schüsse im `hoerRadius`. Laufen direkt aufs Ziel, wenn der Weg begehbar ist (3 Strahlen in Körperbreite), sonst A*
  um Wände & Möbel. Geben auf jenseits `verlierRadius` oder wenn das Ziel unerreichbar ist. Respawn am Spawnpunkt,
  aber nie in Spielernähe. Lassen mit `lootChance` etwas fallen. Spawnpunkte (`Z`) liegen nur draußen. Engstellen
  (Türen) werden reserviert – wer wartet, macht Platz. Stirbt ein Spieler, verschwinden die Zombies im
  `spieler.todesZombieRadius` (480 px) um den Todesort (kommen regulär wieder).
- **Tag & Nacht** (`gemeinsam/tageszeit.js`, `tageszeitSystem.js`): Tag 10 min (06–21 Uhr), Nacht 5 min (21–06 Uhr),
  Werte in `konfiguration.welt`. Nachts: Zombies jagen schneller (`nachtTempoFaktor`), eine **Horde** (`nachtHorde`)
  taucht an freien Spawnpunkten auf, wittert Spieler bis 1100 px (auch ohne Sicht) und zieht morgens wieder ab.
- **Taschenlampe:** L / 🔦 schaltet sie (Server-Zustand `lichtAn`, für alle sichtbar). Zählt nur **nachts**: an →
  sichtbar bis `aggroRadius × nachtLichtFaktor`, aus → erst ab `aggroRadius × dunkelFaktor` (0,45). Tagsüber egal.
- **Türen** (`welt.js` → `tueren`, `tuerSystem.js`): nebeneinanderliegende `T` = eine Tür (Doppeltür). Start: alle zu.
  **Automatiktüren** (`tuerSystem.aktualisiereTueren`): gehen auf, wenn ein lebender Spieler (nicht im Auto) ≤ `TUER_AUTO_OEFFNEN` nahekommt, schließen sich ab `TUER_AUTO_SCHLIESSEN` (Hysterese) und nie, wenn jemand drinsteht. Zombies öffnen nichts – sie brechen geschlossene Türen auf; aufgebrochene bleiben `TUER_BRUCH_OFFEN` s offen (`spielWelt.tuerHaltOffen`). Bretter lassen sich auch an offene Türen nageln. AKTION `tuer` ist veraltet (Server ignoriert sie).
  Geschlossen = blockiert Laufen, Sicht und Schüsse. Zombies planen per A* durch Türen (`tuerKosten`) und schlagen
  sie auf (`welt.tuerLeben` Schaden), danach ist die Tür offen.
- **Start:** im Schlafzimmer eines Wohnhauses neben dem Bett, mit Pistole (15 Schuss, in der Hand), Axt und
  Spitzhacke (`spieler.startInventar`) – nach dem Tod wieder. Das alte Inventar liegt `loot.todesVerfall` (180 s) am Boden.
- **Taste E / Aktions-Knopf** macht das Naheliegendste: Auto (ein/aus) → Gegenstand aufheben → Bauwerk (Falle, Kochen,
  Pflanzen, Ernten) → Baum/Stein/Erz abbauen → Werkbank → Schlafen. **F**: Lagerfeuer an/aus.
- **Ressourcen** (`gemeinsam/welt/ressourcen.js`, `arbeitSystem.js`): Baum (Axt, 6 s) → Holz, Stein (Spitzhacke, 8 s) →
  Stein, Eisenerz (Spitzhacke, 10 s) → Eisenerz; je 1 Stück + 20 % Chance auf 2 (`konfiguration.ressourcen`). Bewegung/
  Angriff/Schaden bricht ab. Nachwachsen 300/240/420 s. Gefällter Baum kippt um (Animation + Knack-Geräusch `baum_faellt`).
- **Bauen** (`gemeinsam/welt/bauwerke.js`, `bauSystem.js`): Im Inventar (Abschnitt „Bauen“, Rezepte mit `ort: 'inventar'`)
  Werkbank (4 Holz), Lagerfeuer (3 Holz), Bärenfalle herstellen → Item benutzen → Platzier-Modus mit grün/roter Vorschau
  (Maus/Tippen setzt, Rechtsklick/✕ bricht ab). Lagerfeuer nur draußen, mit **F + Feuerzeug** anzünden (bei Regen geht es nicht, Regen löscht es), brennt 3 min; **Holz in der Hand + Linksklick** = +3 min
  (stapelt). **E** öffnet das Feuer-Menü (`stationFenster.js`): 3 Koch-Slots – rohes Fleisch/Fisch/Gemüse ist nach 20 s gar, nach 30 s
  **verkohlt** (unbrauchbar); Brutzeln beim Garen, Glöckchen wenn fertig; dort auch **Hinsetzen** (Zombies übersehen einen). Der **Schmelzofen**
  (Werkbank-Rezept, draußen) schmilzt Eisenerz zu Eisenbarren (Holz = Brennstoff, 15 s je Erz). Falle: tötet Zombies sofort, mit E aufnehmen/spannen.
- **Farmen** (v0.13): **Hacke in die Hand** (Zahlentaste) → 1×1-Vorschau (grün/rot) unter der Maus, **Linksklick** legt ein Ackerfeld an
  (AKTION `feld`, `bauSystem.legeFeldAn`; `FELD_GROESSE` = 1), **Rechtsklick** (Handy 🌱) macht es wieder zu Rasen (`feldEntfernen`). Werkzeuge nutzen sich
  ab (`haltbarkeit`: Axt/Spitzhacke 40, Hacke 30 Einsätze, Balken am Platz) und gehen kaputt. Samen (Tomate, Gurke, Kartoffel, **Paprika**; Loot)
  in die Hand nehmen: das Ziel-Beet leuchtet, Linksklick pflanzt; wächst in 1 Spieltag (24 h, Schlafen spult mit),
  **bei Regen doppelt so schnell** (= halbe Zeit, `WACHSTUM_REGEN_FAKTOR`), Ernte 2 Früchte (`konfiguration.bauen`).
- **Lagerkiste** (v0.10, ab v0.11 übers Bau-Menü): 8 Holz, **E** öffnet (Fenster `kisteFenster.js`, 16 Plätze, Antippen
  schiebt Stapel; Inhalt privat, nur per `KISTE`-Nachricht an den Öffner; schließt sich beim Weggehen; wird mit der Zone gespeichert).
  Nur der Besitzer (bzw. Berechtigte) kommt dran.
- **Basisbau** (v0.11, Protokoll 9): **BUILD-Knopf / Taste B** → Hammer in die Hand + Bau-Menü (Reiter Basis · Struktur · Einrichtung).
  1. **Basis-Flagge** (kostenlos, eine pro Spieler über alle Zonen): nur auf flachem Rasen, 2 Kacheln Freiraum ohne Gebäude/Hindernisse/Wasser,
     ≥ 15 Kacheln Abstand zu fremden Flaggen. Danach verschwindet die Flagge – es bleibt das **Baugebiet** (Radius 15 m, `basisbau.radiusKacheln`,
     Haken `radiusZuschlag` für spätere Skillpunkte). Der **rote Ring** ist rein clientseitig (nur der Besitzer erfährt das Gebiet,
     `SPIELER_DATEN.flagge`), sichtbar mit Hammer in der Hand, Taste **V** schaltet ihn.
  2. **Bauteile** (Registry `gemeinsam/basisbau/teile.js`): Holzboden/-dach/-wand/-wand mit Fenster/-wand mit Türöffnung je 8 Holz, Holztür 6 Holz
     (nur in eine Türöffnung), Lagerkiste 8 Holz, Bett 5 Holz + 2 Stein + 2 **Stoff** (neues Item, Loot in Wohnungen/Lagern). Das Raster ist die Kachel
     (1 Kachel = 1 m): Boden frei auf dem Raster, **Wand dockt an Boden oder Wand an** (Eckwände auch diagonal am Boden – Wandring in beliebiger Reihenfolge), Dach über Boden/Wand bzw. neben Dach, Türrahmen/Fenster
     richten sich automatisch aus (Taste **R** dreht), bei knappem Zielen **springt das Hologramm auf die nächste gültige Kachel** (Magnet).
     Hologramm **grün = baubar, rot = blockiert / außerhalb des Gebiets / Material fehlt / zu weit weg** (dieselbe Prüfung wie der Server).
     Pro Kachel liegt je **Ebene** (Boden, Objekt, Wand, Tür, Dach) ein Teil – ein Haus ist also Boden + Wandring + Dach auf denselben Kacheln.
     Wände blockieren Laufen + Sicht + Schüsse (Fenster nur Laufen), geschlossene Türen alles; **Dächer werden unsichtbar, solange man darunter steht**.
  3. **Abriss** (Menü „Abriss“ / Taste X): mit dem Hammer ein eigenes Bauteil anvisieren (orange Markierung), Klick → **75 % der Kosten** (abgerundet)
     ins Inventar (voll → vor die Füße). Reihenfolge Tür → Möbel → Wand → Dach → Boden; ein Türrahmen nimmt seine Tür mit; eine Kiste verstreut ihren Inhalt.
  4. **Rechte** (`gemeinsam/basisbau/rechte.js`): nur der Besitzer der Flagge baut/reißt ab im Gebiet und öffnet eigene Kisten/Türen/Betten.
     `flagge.mitglieder = { name: [RECHT…] }` ist für Gruppen schon vorbereitet (wird gespeichert und von `hatRecht` ausgewertet).
  5. **Bett**: E → „Spawn Point setzen (Unterkunft)“ (`spieler.spawn`, im Spielstand). Nach dem Tod wacht man neben dem Bett auf (auch aus einer
     anderen Zone: der Server zieht um); fehlt das Bett, gilt der normale Start. Hammer: im Start-Inventar, auch im Inventar herstellbar (2 Holz + 2 Stein).
  Kein Bauen in der freien Welt (ohne Flagge/außerhalb des Radius). Werkbank/Lagerfeuer/Falle/Beet bleiben wie gehabt über Inventar-Items.
- **Crafting-Level** (v0.10): Rezepte haben optional `level` (Standard 1); Server prüft `spieler.level`, Menüs zeigen „Level N“
  und sperren den Knopf. Aktuell: Machete/Falle/Schrotpatronen 2, Kampfbeil 3, Holzwand/-boden 3.
- **Jagen** (v0.10): **Hasen** (`entitaeten/tier.js`, `tierSystem.js`; ~6 je 1000 Rasenkacheln, max. 40) hoppeln umher, fliehen
  ab 150 px, 10 Leben, geben **1× Fleisch** (am Feuer braten); kommen nach 150 s nach. Comic-Platzhalter-Modell `tierModelle.js`.
- **Angeln** (v0.10, `angelSystem.js`, `gemeinsam/welt/wasser.js`): Angel im Inventar genügt (auto-ausgerüstet). **Linksklick**
  Richtung Wasser = auswerfen (statt Angriff; nicht, wenn ein Zombie jagt), nach 3–9 s **wackelt die Pose** 2–3 s → **erneut
  klicken** = Fang (Barsch/Forelle/Hecht nach Gewicht, **10 % Doppelfang**); zu früh/zu spät/Bewegung = nichts. See = Kachel `~`
  (`wasser: true`: nicht begehbar, Sicht & Schüsse gehen drüber). Fische am Feuer braten (`KOCHBAR`).
- **Wetter** (v0.10, `wetterSystem.js`): pro Zone klar → **Regen/Nebel** (1–5 min, `konfiguration.wetter`) → Pause; im Schnappschuss
  (`wetter`). Client: Regen-Striche + Regenton, Nebel/Dämmerlicht (`wetterEffekt.js`, Renderer `#tageslicht`).
- **Boss-Zombies** (Variante `brocken`): 420 Leben, 40 Schaden, 40 XP, **50 % Waffe + Munition** (`lootSystem.lasseBossLootFallen`,
  Tabelle `boss`).
- **Statistik** (Tab): pro Spieler Level, getötete Zombies, getötete Spieler, **Zeit überlebt** (seit dem letzten Tod); im Spielstand.
- **XP fürs Abbauen:** `level.xpProAbbau` = 3 pro Baum/Stein/Erz.
- **Stapel:** Munition bis 50, alles andere Stapelbare bis 20, Waffen/Werkzeug/Rucksack einzeln (`normalisiere()` in `gegenstaende.js`).
- **HUD** (v0.10): FPS oben rechts, **Minikarte** (±20 Kacheln, nur Erkundetes, Zombies rot/Mitspieler blau; ⚙ ein/aus),
  Auto-Haltbarkeit, Angel-Hinweis (gelber „JETZT klicken!“), **Auto-Lauf**: große Karte → erkundeten Ort anklicken/antippen → der
  Charakter läuft per A* in normalem Tempo hin (jede Eingabe bricht ab, Banner mit ✕).
- **Musik** (v0.10): Ordner `client/musik/<zonenId>/` (+ `alle/`), Index `npm run musik:index` → `musik.json`; zufällige Stücke,
  Überblendung beim Zonenwechsel, Regler „Musik“ in den Einstellungen (`audio/zonenMusik.js`). Wind ist leiser (Regler „Wind & Regen“).
- **Autos** (`gemeinsam/physik/fahrzeug.js`, `fahrzeugSystem.js`): Kartenautos sind Fahrzeuge; E steigt ein/aus,
  W/S Gas/Bremse, A/D lenken (Touch: linker Stick). Gemeinsame Physik → Vorhersage wie beim Laufen. Zombies anfahren
  macht Schaden je Tempo (+XP) und kostet das Auto nur **0,5** Haltbarkeit; **Haltbarkeit 10 Zombie-Schläge** (Boss-Schlag
  zählt nach Angriffsschaden mehr) – Zombies schlagen auf die Karosserie, der Fahrer bleibt unverletzt. Bei 0: Fahrer wird
  **ausgeworfen**, das Auto bleibt als **Wrack** (kaputt, qualmt, nicht einsteigbar, wird gespeichert). Zwei Scheinwerfer, Motorsound,
  Kamera zoomt raus. Runde 20: Fahrmodell mit Lenkrad-Trägheit (`fz.lenkung`) + Einspurmodell (enge Kurven nur langsam), sanfteres
  Anfahren, Tacho bis 120 km/h, Karosserie neigt sich, Reifenspuren auf Gras/Schnee (`client/darstellung/reifenspuren.js`). Parkposition wird gespeichert. Durch Zonen-Übergänge geht es nur zu Fuß.
- **Crafting** (`craftingSystem.js`, Rezepte in `konfiguration/rezepte.js`): an einer Werkbank (Wohnhäuser, Werkstatt);
  Menü mit Kategorien. Bretter verstärken geschlossene Türen (+`welt.tuerVerstaerkung`, max. 4× Haltbarkeit).
- **Schlafen:** in jedem Bett, jederzeit (keine jagenden Zombies in `schlafen.zombieAbstand`): dauert `schlafen.dauer`
  (6 s), heilt `schlafen.heilung`, kostet etwas Hunger/Durst und spult die Uhr um `schlafen.stunden` (6 h) vor –
  im Mehrspieler nur, wenn **alle** lebenden Spieler schlafen (wer früher fertig ist, wartet liegend). Bild wird
  dunkel (`#schlafblende`). Bewegung oder Schaden weckt auf. Umrechnung Stunden → Sekunden: `sekundenFuerStunden()`.
- **Level** (`levelSystem.js`, `konfiguration.level`): XP pro getötetem Zombie je Variante (normal 10, Läufer 12,
  Brocken 40; Abbauen 3), Level 2 bei 50 XP, dann +20 pro Stufe (70, 90 …). **Tod = zurück auf Level 1, Skills weg.** HUD:
  goldene Plakette + XP-Balken, Spielerliste zeigt das Level.
- **Skills** (`gemeinsam/spieler/skills.js`, Fenster U / ⭐): 1 Punkt pro Level-Aufstieg; Schnelligkeit (+3 % Tempo),
  Stärke (+8 % Nahkampf), Zähigkeit (+10 max. Leben), Sammeln (6 % schneller abbauen), je max. 10.
- **Charakter** (`gemeinsam/spieler/aussehen.js`): Mann/Frau im Login wählbar; Grundgerüst für Haare/Gesicht/Hautfarbe/
  Kleidung (Merkmale mit `aktiv: false` warten auf Grafik). Im Spielstand gespeichert, für alle sichtbar.
- **Kampf:** Schusswaffen = Strahl (Hitscan) bis zur ersten Wand, Schrotflinte mit 7 Projektilen + Streuung;
  leeres Magazin → automatisch nachladen (falls Munition da), sonst "Klick". Nahkampf = Trefferkegel ±66°
  (`NAHKAMPF_KEGEL`) vor der Figur, Reichweite bis zum Rand des Ziels (Faust 44, Messer ~50, Hammer/Axt 54,
  Machete/Beil 62 – Zombies beißen ab 42); ohne Waffe **Faustschlag** (`UNBEWAFFNET`). PvP standardmäßig aus (`kampf.pvp`).
- **Inventar** (`inventarSystem.js`, Fenster `inventarFenster.js`, Taste Tab / 🎒): Plätze 0–7 = Schnellleiste
  (Tasten 1–8), 8–15 = Tasche, mit **Rucksack** (Item `rucksack`, `plaetze: 8`) +8 (Plätze 16–23). Rucksack wird
  beim Aufheben angelegt (sichtbar am Rücken), "ablegen" schiebt den Inhalt ins Grund-Inventar (Rest fällt).
  Drag & Drop = AKTION `tauschen` (gleiche Stapel werden zusammengelegt, Waffe in der Hand wandert mit), aus dem
  Fenster ziehen bzw. **Q** = `ablegen`. Stapel bis `stapelbar`, erste Waffe wird automatisch ausgerüstet.
  Tod: alles inkl. Rucksack fällt zu Boden.
- **Überleben:** Hunger/Durst sinken; bei 0 → Schaden. Beide ≥ 70 → langsame Heilung. Tod → Inventar fällt auf
  den Boden, Respawn nach `respawnZeit` am Startpunkt – oder sofort per Knopf "Sofort wiederbeleben" (Enter).
- **Admin:** Gottmodus = kein Schaden (`fuegeSchadenZu`) + kein Hunger/Durst; Unsichtbar = Zombies ignorieren einen
  (`server/spiel/systeme/adminSystem.js`).
- **Gangarten (Runde 18):** ohne Shift **gehen** (80 px/s), **Shift = rennen** (150 px/s, `sprintFaktor` 1,875; Touch: linken Stick über den Rand ziehen), kostet Ausdauer; Shift bei leerer Ausdauer = **joggen** (115 px/s, `joggFaktor`). Zombies jagen mit 120 px/s (≈ 80 % vom Rennen). Bei 0 erschöpft →
  erst ab `sprintMinimum` wieder. Ausdauer wird in `gemeinsam/physik/bewegung.js` berechnet (Server + Vorhersage
  identisch). Sprinten ist laut (`sprintHoerRadius`).
- **Zombie-Varianten** (`konfiguration.zombie.varianten`): normal, Läufer (schnell, schwach, blass), Brocken
  (langsam, zäh, starker Biss, groß). Ruhende Zombies schlurfen im `wanderRadius` um ihren Spawnpunkt.
- **Karte** (K / 🗺, `client/ui/karte.js`): zeigt die aktuelle Zone, nur erkundete Bereiche (Umkreis 9 Kacheln);
  Erkundung liegt **auf dem Server** (Spielstand, pro Zone – auch auf anderen Geräten da) und im Browser. Werkbänke 🔨,
  Bauwerke, Mitspieler (blau) und Übergänge (blaue Pfeile mit Zonenname) sind immer zu sehen; öffnet zentriert auf die Figur.
- **Zonen-Übergänge:** am Kartenrand, im Spiel mit Wegweiser-Schild markiert; einfach hineinlaufen.
  **Chat** (T / 💬), **Spielerliste** mit Level (Tab / Statuszeile antippen), Beitritt/Verlassen wird angesagt.

### Spielstände
Beim Login lädt der SpielServer den Stand über eine austauschbare **Speicher-Schnittstelle**
(`laden(name)`, `speichern(name, stand)`), geprüft und bereinigt durch `server/spiel/spielstand.js`.
Gespeichert wird beim Logout, alle `server.autosaveSekunden` und beim Server-Stopp (Strg+C wartet aufs Schreiben).
Inhalt: Zone (`karte`) + Position, Leben, Hunger, Durst, Inventar (inkl. Rucksack + Inhalt), ausgerüsteter Platz, Level,
XP, Skills, Aussehen, Erkundung pro Zone (`erkundet: { kartenId: base64 }`). Login landet in der Zone vom letzten Mal
(tot oder Zone unbekannt → Startzone). Gäste (`Gast-1234`) haben auch einen Spielstand – ihr Name bleibt im Browser gemerkt.
**Welt pro Zone** (Schlüssel `welt:<kartenId>`): Uhrzeit/Tag, Bauwerke (inkl. Beete & Pflanzen), Autos (Parkposition) –
geladen beim ersten Betreten bzw. Serverstart, gespeichert per Autosave (wenn die Zone aktiv war) und beim Stopp.
| Umgebung | Speicher |
|---|---|
| Node-Server | `server/node/dateiSpeicher.js` → `server/daten/spielstaende/<name>.json` (Ordner per `DATEN_ORDNER`/`SPIELSTAENDE`) |
| Lokal-Modus | `client/netzwerk/browserSpeicher.js` → localStorage |
| Tests / Fallback | `server/spiel/speicher/arbeitsspeicherSpeicher.js` |

### Grafik-Pipeline
`werkzeuge/assets/baue_assets.py` (Python, nur bei Grafik-Änderungen nötig) lädt die Quellpakete, schneidet zu,
verkleinert, packt WebP-Spritesheets (Item-Icons, Böden, Möbel-Draufsichten), kopiert die 3D-Figur (Kenney FBX +
Skins) und schreibt `client/assets/atlas.json` + `LIZENZEN.md`. Danach **immer** `npm run assets:3d`
(`baue_3d.mjs`: Animationen stehen/rennen → JSON, Three.js verkleinert → `client/vendor/three/`).

**Lizenzpflicht:** CC-BY-Grafiken (Survival Props) verlangen Namensnennung → Credits-Dialog im Login
(Daten aus `atlas.json → lizenzen`). Nicht entfernen!

### Darstellung (Three.js, `client/darstellung/renderer.js` + `kartenModell.js`)
Gameplay bleibt flach (x/y); Weltpixel x → three.x, y → three.z, Höhe → three.y (1 Einheit = 1 Weltpixel).
**Performance (Ziel 60 FPS):** Karte in ~100 Draw-Calls (Möbel zusammengefasst, Bäume/Steine/Wände instanziert,
statische Matrizen eingefroren), feste Lichteranzahl (6er Lampen-Pool für die nächsten Kartenlampen, 3 Taschenlampen,
2 Mündungsblitze → keine Shader-Neubauten), alle Shader beim Laden vorkompiliert, adaptive Auflösung, Vignette/
Schadensblitz per CSS, ferne Figuren werden nicht animiert. F3 zeigt Draw-Calls & Auflösung.
- Boden = `BodenTextur` (Texturen, Asphalt, Straßenmarkierungen, Gehwegplatten, Teppiche, Türschwellen); Innenräume
  abgedunkelt (kein Dach). **Seit Runde 19 in Blöcken** zu `BODEN_BLOCK` = 32 × 32 Kacheln (je ≈ 4 MB statt einer
  80-MB-Textur je Zone); ein Block wird sichtbar, sobald seine Textur hochgeladen ist (`KartenModell.bodenHochladen`,
  Renderer lädt `BODEN_UPLOADS_JE_BILD` pro Bild, nächste zuerst)
- **Zonenwechsel mit Ladebild (2026-10-22):** kein nahtloser Übergang mehr; `renderer.bereiteVor` baut die Karte hinter dem
  Ladebild in Portionen (echter Fortschritt), danach Texturen/Shader/Aufwärmen. Zone max. 1500 × 1500 (`ZONE_MAX_KACHELN`).
- Wände = InstancedMesh-Blöcke (+ Sturz über Türen), Fenster mit Glas; Möbel = Quader mit Sprite-Deckel
  (`MOEBEL_HOEHE`), Werkbank aus Quadern; Steine als Felsbrocken
- **Bäume** (Runde 25) = Low-Poly-Modelle aus dem Quaternius „Stylized Nature MegaKit“ (CC0), aufbereitet von
  `werkzeuge/assets/baue_baeume.py` → `client/assets/3d/baeume/*.glb` (Rinde = Vertexfarben, Laub = 256-px-Cutout);
  je Karte eine Mischung (`baumModell.baumVarianten`: Stadtrand Laubbäume, Waldweg + Kiefern/tote Bäume), Herbst =
  getöntes Laub, Wind per Shader. Je Variante + Block 2 InstancedMeshes (Rinde, Laub). **Büsche** = prozedurale
  Cartoon-Wolken mit Umriss, Tannen = `tanne_schnee.glb`; gefällt → Stumpf mit Jahresringen.
  Ressourcen-Meshes haben `frustumCulled = false` (Instanzen werden ein-/ausgeblendet)
- **Items am Boden** = 3D-Modelle (`itemModelle.js`, je 1 Mesh mit Vertexfarben, Waffen aus `waffenModelle.js`
  liegen auf der Seite); Leuchtring + Hüpfen beim Item, das E aufheben würde; ohne Bauplan → flaches Icon
- **Fußspuren** (`fussspuren.js`): ~18 Abdrücke (≈ 8 m) pro Spieler, verblassen nach hinten und mit der Zeit, 1 Draw-Call
- **Reifenspuren** (`reifenspuren.js`, Runde 20): Hinterräder auf Gras/Schnee (Schneezone: auch Straßen), ≈ 25 m je Auto, 90 s, 1 Draw-Call
- **Grafik „Auto“** (`geraet.js` + `renderer.js`, Runde 20): Standardprofil; erkennt schwache Grafikchips (Intel-Onboard, alte GeForce/Radeon,
  Software-GL) → Basis mittel/niedrig; Lichtbudget je Profil (`LICHT_BUDGET`), Schatten in sparsamen Stufen nur jedes 2. Bild
- **Rucksack** am Rücken der Figur, wenn getragen (`spieler.rucksack` im Schnappschuss)
- **Türen** = Flügel mit Scharnier, schwingen weich auf/zu (folgen `welt.istTuerOffen`)
- **Wand-Schnitt:** Wände/Türen zwischen Kamera und eigener Figur werden nahe der Figur per Shader weggeschnitten
  (`#mitSchnitt`, `SCHNITT_RADIUS`) – man sieht sich auch hinter Südwänden
- **Figuren** = Kenney "Animated Characters 3" (Skins pro Zombie-Variante), Animationen stehen/rennen; darüber
  prozedurale **Arm-Haltung** (`figurHaltung.js`): Pistole beidhändig, Flinte an der Schulter, Rückstoß beim Schuss,
  Nachladen, Nahkampf-Schwung, Faustschlag, Hacken mit Axt/Spitzhacke, Taschenlampe in der linken Hand,
  Zombies mit ausgestreckten Armen; Schlafende liegen im Bett
- **Waffen** = prozedurale Modelle (`waffenModelle.js`), Auswahl über `spieler.waffe` (Item-ID, z. B. `hammer`)
- **Licht:** Sonne/Mond wandern mit der Tageszeit, Himmel-/Nebelfarbe Tag → Dämmerung → Nacht (`#tageslicht`);
  Taschenlampen als SpotLights aus der Lampe/Mündung; Kartenlampen nur bei Dunkelheit; Mündungsfeuer
- 2D-Overlay (`#spielflaeche`): Eingaben, Namen (`beschriftung.js`), Lebensbalken, Vignette, Schadensblitz

### Sound
`client/audio/sound.js`: Vorrang eigene Dateien (`client/audio/eigene/`, Dateiname = Ereignis, `_1/_2/…` = Zufallsvarianten, `lautstaerke.txt` 0–100+ bzw. `einstellungen.json` (Pegel, Streuung, Loop), Index per `npm run sounds` oder automatisch über `npm run editor:lokal`) > Samples > Synthese (Web Audio). Räumlich (Entfernung + Stereo). Dauergeräusche Wind/Regen/Nacht/Motor als Schleifen (auch ersetzbar). Alles bearbeitbar in der 🎵 Audio-Zentrale des Map-Editors.
Hüllkurven mit kurzem Anschlag + 12 ms Vorlauf (kein Klicken/Knistern), Schritte als leises "Tapp".
Auslöser: Server-Ereignisse (`feuer`, `treffer`, `tod`, `nahkampf`, `leer`, `tuer`, `tuerSchlag`, `hack`, `abgebaut`,
`hergestellt`, `tuerVerstaerkt`, `levelAuf`), Chat, Änderungen der
eigenen Daten (essen, trinken, aufheben, nachladen), Schritte (Vorhersage), zufälliges Zombie-Stöhnen. Taste M / 🔊.

### Login-Ablauf
`LoginBildschirm` → `verbindungAufbauen()` (Lokal oder WebSocket) → `anmelden()` sendet `ANMELDEN`
→ Server: Protokollversion prüfen → Name prüfen → `authentifizierung.pruefe()` (bzw. bei `gast: true`:
`server.gaeste` erlaubt? Name `Gast-1234`? → `pruefeGast()` oder ok, nie Admin) → Doppel-Login/Server-voll prüfen
→ `ANMELDUNG_OK` (Karte, Startposition, Physik, Gegenstände, offene Türen, abgebaute Ressourcen, Rezepte, Uhrzeit)
→ `ClientSpiel` startet.
Schutz: 20 s Login-Timeout, nach 5 Fehlversuchen Verbindung trennen, gleiche Fehlermeldung für
"unbekannter Name" und "falsches Passwort".
**Konten** (`kontenAuthentifizierung.js`): `konten.json` mit `passwort` (Klartext) oder `passwortHash`; Klartext wird
beim Lesen automatisch gehasht und zurückgeschrieben (schreibgeschützt → Vergleich nur im Speicher). Pfad:
`KONTEN_DATEI`, sonst `/etc/secrets/konten.json` (Render Secret File), sonst `server/daten/konten.json`.
**Gäste:** Client erzeugt `Gast-<4 Ziffern>` und merkt ihn (localStorage `browserSurvival.gastName`); ist der Name
schon online (zweiter Tab), wird automatisch ein neuer gewählt. Online-Checkliste: **`docs/ONLINE_STELLEN.md`**.

---

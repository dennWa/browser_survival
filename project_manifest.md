# Project Manifest – Browser Survival

> **Zweck dieser Datei:** Zentrale Landkarte des Projekts. Hier steht, *wo* welches System liegt,
> *wie* die Teile zusammenhängen und *was* der aktuelle Stand ist.
> **Pflegeregel:** Jede Änderung an Struktur, Protokoll oder Entwicklungsstand wird hier nachgetragen.
> **Für KI-Sitzungen:** Schnellüberblick in **`KI_INDEX.md`** (kompakt, mit Fallen & Invarianten) – danach hier vertiefen.

---

## 1. Überblick

Top-Down-Survival in **3D** (schräge Vogelperspektive, Three.js) im Browser – für PC/Laptop, spielbar auch auf
Handy & Tablet. Gameplay bleibt flach (2D auf dem Boden), nur die Darstellung ist 3D.
**Offene Welt aus Zonen** (wie die großen Maps in Guild Wars 2): Startzone **Stadtrand mit dem St.-Elisabeth-Krankenhaus**
(110 × 86 Kacheln), im Norden die Zone **Waldweg** (64 × 52, Wald, Försterhütte, viel Erz). Tag & Nacht, Türen, Horde,
Ressourcen (Holz, Stein, Eisenerz), Crafting an Werkbänken, Bauen (Werkbank, Lagerfeuer, Fallen), Farmen, Kochen,
Autos fahren, Skills, Charakterwahl (Mann/Frau), Schlafen, Karte mit Erkundung, Chat, Developer-Modus.

| Thema | Entscheidung |
|---|---|
| Sprache | Vanilla JavaScript (ES-Module), kein Build-Schritt. Bezeichner & Kommentare **Deutsch** (ohne Umlaute in Bezeichnern) |
| Darstellung | **Nur 3D**: Three.js (WebGL, lokal in `client/vendor/three/`), 2D-Canvas als durchsichtiges Overlay (Namen, Vignette) |
| Grafiken | Freie Pakete (CC0 / CC-BY), aufbereitet durch `werkzeuge/assets/baue_assets.py` → `client/assets/` (~0,4 MB); Waffen prozedural |
| Geräte | Tastatur + Maus; Touch: zwei virtuelle Joysticks (links laufen, rechts zielen), Kamera zoomt auf kleinen Bildschirmen raus |
| Server | Node.js (≥ 20) + Paket `ws` (WebSockets), eingebauter HTTP-Server liefert auch die Spieldateien |
| Netzwerkmodell | **Autoritativer Server** – Client schickt nur Eingaben; Positionen, Treffer, Schaden und Loot bestimmt der Server |
| Netcode | Fester Tick (30/s), Client-Side Prediction + Server Reconciliation (eigener Spieler), Entity Interpolation (alle anderen) |
| Modi | **Lokal**: echter SpielServer läuft im Browser-Tab (ohne Account) · **Mehrspieler**: Node-Server, Login mit Account |
| Accounts | Keine Registrierung. Admin legt Accounts an: `npm run konto -- <name> <passwort> [--admin]` (scrypt-Hash in `server/daten/konten.json`) |
| Admin-Recht | `"admin": true` im Konto (bzw. `--admin`) → Admin-Menü 🛡 (Taste P): Gottmodus, Unsichtbar, Heilen, Waffen, Zombie spawnen/alle töten, Tag ⇄ Nacht, Nachtsicht. Lokal-Modus: immer Admin. Der Server prüft jeden Befehl. |
| Developer-Modus | Admin-Menü → 🛠 Developer: Werte aus `entwicklerFelder.js` ingame ändern; dauerhaft in `server/daten/einstellungen.json` (Node) bzw. im Browser (Lokal) |
| Online stellen | `render.yaml` (Render-Blueprint), Accounts per Umgebungsvariable `KONTEN_JSON` (Text gibt `npm run konto` aus) |
| Zielgröße | Einige bis ein paar Dutzend gleichzeitige Spieler pro Server (Standard: max. 32) |
| Welt | Zonen = Karten (`server/spiel/karten/`), verbunden über Übergänge am Rand; jede Zone eigene SpielWelt (`server/spiel/zone.js`). Karten auch mit **Tiled** bauen (`werkzeuge/karten/README.md`) |

### Starten
```bash
npm install                              # einmalig (installiert nur "ws")
npm run konto -- Spieler1 meinPasswort   # Account anlegen (beliebig oft)
npm run konto -- Chef meinPasswort --admin   # Account mit Admin-Recht (--kein-admin nimmt es weg)
npm start                                # → http://localhost:8080
npm run start:gast                       # Server ohne Account-Pflicht (nur Tests!)
npm test                                 # automatische Tests
npm run rauchtest                        # Browser-Rauchtest (Playwright): Login, laufen, Fenster, Zonenwechsel, Screenshots
npm run karte:export -- waldweg          # Zone nach Tiled exportieren (karte:import zurück)
```
Port ändern: `PORT=3000 npm start`. Andere Spieler im LAN verbinden sich über `http://<deine-IP>:8080`.

---

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
Jede Sitzung gehört zu genau einer Zone (`sitzung.zone`) und bekommt nur deren Daten. Betritt ein Spieler zu Fuß ein
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
  (Maus/Tippen setzt, Rechtsklick/✕ bricht ab). Lagerfeuer nur draußen, mit **F + Feuerzeug** anzünden, brennt 5 min,
  daran mit E **kochen** (gebraten = +30 % Sättigung). Falle: tötet Zombies sofort, mit E aufnehmen/spannen.
- **Farmen** (v0.10): **Spitzhacke** (im Inventar genügt, „auto-ausgerüstet“) + **G / 🌱** → Vorschau eines quadratischen
  **Erdfelds** (`FELD_GROESSE`² = 3×3 Beete, grün/rot) → Klick/E legt es an (AKTION `feld`, `bauSystem.legeFeldAn`). Samen
  (Tomate, Gurke, Kartoffel, **Paprika**; Loot) mit E bzw. Benutzen pflanzen; wächst in 1 Spieltag (24 h, Schlafen spult mit),
  **bei Regen doppelt so schnell** (= halbe Zeit, `WACHSTUM_REGEN_FAKTOR`), Ernte 2 Früchte (`konfiguration.bauen`).
- **Lagerkiste** (v0.10): 8 Holz (Inventar → Bauen), aufstellen, **E** öffnet (Fenster `kisteFenster.js`, 16 Plätze, Antippen
  schiebt Stapel; Inhalt privat, nur per `KISTE`-Nachricht an den Öffner; schließt sich beim Weggehen; wird mit der Zone gespeichert).
- **Basisbau-Gerüst** (v0.10): Holzwand (blockiert) + Holzboden (begehbar, nur Rasen) als Bauwerke/Items/Rezepte (Level 3) –
  die tiefen Mechaniken (Räume, Türen, Verfall …) kommen später (`gemeinsam/welt/bauwerke.js`).
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
  **ausgeworfen**, das Auto bleibt als **Wrack** (kaputt, qualmt, nicht einsteigbar, wird gespeichert). Scheinwerfer, Motorsound,
  Kamera zoomt raus. Parkposition wird gespeichert. Durch Zonen-Übergänge geht es nur zu Fuß.
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
- **Inventar** (`inventarSystem.js`, Fenster `inventarFenster.js`, Taste I / 🎒): Plätze 0–7 = Schnellleiste
  (Tasten 1–8), 8–15 = Tasche, mit **Rucksack** (Item `rucksack`, `plaetze: 8`) +8 (Plätze 16–23). Rucksack wird
  beim Aufheben angelegt (sichtbar am Rücken), "ablegen" schiebt den Inhalt ins Grund-Inventar (Rest fällt).
  Drag & Drop = AKTION `tauschen` (gleiche Stapel werden zusammengelegt, Waffe in der Hand wandert mit), aus dem
  Fenster ziehen bzw. **Q** = `ablegen`. Stapel bis `stapelbar`, erste Waffe wird automatisch ausgerüstet.
  Tod: alles inkl. Rucksack fällt zu Boden.
- **Überleben:** Hunger/Durst sinken; bei 0 → Schaden. Beide ≥ 70 → langsame Heilung. Tod → Inventar fällt auf
  den Boden, Respawn nach `respawnZeit` am Startpunkt – oder sofort per Knopf "Sofort wiederbeleben" (Enter).
- **Admin:** Gottmodus = kein Schaden (`fuegeSchadenZu`) + kein Hunger/Durst; Unsichtbar = Zombies ignorieren einen
  (`server/spiel/systeme/adminSystem.js`).
- **Sprinten:** Shift (Touch: linken Stick über den Rand ziehen) = 1,6× Tempo, kostet Ausdauer. Bei 0 erschöpft →
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
- Boden = `BodenTextur` (ganze Karte in ein Canvas: Texturen, Asphalt, Straßenmarkierungen, Gehwegplatten, Teppiche,
  Türschwellen) als Textur; Innenräume abgedunkelt (kein Dach)
- Wände = InstancedMesh-Blöcke (+ Sturz über Türen), Fenster mit Glas; Möbel = Quader mit Sprite-Deckel
  (`MOEBEL_HOEHE`), Werkbank aus Quadern; Steine als Felsbrocken
- **Bäume/Büsche** = prozedurale Cartoon-Modelle (`baumModell.js`: Stamm, Äste, Wolken-Krone, Toon-Shading,
  schwarzer Umriss), pro Typ 2 InstancedMeshes, zufällig gedreht/skaliert; gefällt → Stumpf mit Jahresringen.
  Ressourcen-Meshes haben `frustumCulled = false` (Instanzen werden ein-/ausgeblendet)
- **Items am Boden** = 3D-Modelle (`itemModelle.js`, je 1 Mesh mit Vertexfarben, Waffen aus `waffenModelle.js`
  liegen auf der Seite); Leuchtring + Hüpfen beim Item, das E aufheben würde; ohne Bauplan → flaches Icon
- **Fußspuren** (`fussspuren.js`): ~18 Abdrücke (≈ 8 m) pro Spieler, verblassen nach hinten und mit der Zeit, 1 Draw-Call
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
`client/audio/sound.js`: komplett synthetisch (Web Audio, keine Dateien). Räumlich (Entfernung + Stereo).
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
schon online (zweiter Tab), wird automatisch ein neuer gewählt. Online-Checkliste: **`ONLINE_STELLEN.md`**.

---

## 3. Dateistruktur

```
browser_survival/
├── project_manifest.md            ← DIESE DATEI
├── CLAUDE.md                      Arbeitsanweisung für KI-Sitzungen (verweist hierher)
├── README.md                      Kurzanleitung
├── KI_INDEX.md                    ★ Kompaktkarte für KI-Sitzungen (Architektur, Dateien, Protokoll, Fallen)
├── ONLINE_STELLEN.md              ★ Checkliste: Server online bringen (Render, Konten-Datei, Umgebungsvariablen)
├── render.yaml                    Render-Blueprint
├── package.json                   Skripte: start, start:gast, konto, test
├── index.html                     Weiterleitung → client/ (für reine Datei-Hoster)
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
│   │   │   ├── bauSystem.js       Bauwerke platzieren, Lagerfeuer, Fallen, Beete/Wachstum, Kochen
│   │   │   ├── fahrzeugSystem.js  Ein-/Aussteigen, Fahren, Zombies anfahren
│   │   │   ├── zonenSystem.js     Übergangs-Rechtecke erkennen → spieler.zonenwechsel
│   │   │   ├── ueberlebenSystem.js Hunger, Durst, Heilung, Wiederbelebung
│   │   │   └── lootSystem.js      Start-Loot, Nachschub an Loot-Punkten, Zombie-Beute
│   │   ├── karten/
│   │   │   ├── kartenLader.js     Kartenregister + ASCII → Kacheln/Spawns/Loot-Punkte
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
├── werkzeuge/karten/              Kartengeneratoren (Python), Tiled-Export/-Import (`tiled.mjs`, `tiledKarte.mjs`), README
├── werkzeuge/test/rauchtest.mjs   Browser-Rauchtest (Playwright) → `npm run rauchtest`
├── werkzeuge/musik/indexieren.mjs (v0.10) schreibt client/musik/musik.json → `npm run musik:index`
├── werkzeuge/assets/              ── Grafik-Pipeline ──
│   ├── baue_assets.py             (Python) Quellen, Item-/Möbel-Zuordnung, Spritesheets, 3D-Figur → client/assets/
│   ├── baue_3d.mjs                (Node, danach) 3D-Animationen → JSON, Three.js verkleinert → client/vendor/three/
│   └── anforderungen.txt          pip-Pakete (pillow, numpy, cairosvg, py7zr)
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
│   │   ├── spielSchleife.js       requestAnimationFrame-Loop mit festem Takt
│   │   ├── eingabe.js             Tastatur/Maus/Touch vereint: richtung(), blickWinkel(), Tastenbelegung (TASTEN)
│   │   └── touchSteuerung.js      Virtuelle Joysticks (Pointer Events)
│   ├── netzwerk/
│   │   ├── verbindungAufbauen.js  Fabrik: Lokal vs. WebSocket
│   │   ├── jsonVerbindung.js      Text-Kanal → Objekt-Nachrichten
│   │   ├── websocketKanal.js      Browser-WebSocket als Text-Kanal
│   │   ├── lokalerServer.js       Startet SpielServer im Tab (Lokal-Modus)
│   │   ├── browserSpeicher.js     Spielstände im localStorage (Lokal-Modus)
│   │   └── anmeldung.js           Login-Handshake (Promise)
│   ├── audio/
│   │   ├── zonenMusik.js          (v0.10) Zonen-Musik aus client/musik/<zone>/ (Index musik.json, Überblenden, Zufall)
│   │   └── sound.js               Synthetisierte Geräusche (Rezepte), räumlicher Klang, Wind/Atmosphäre (eigener Bus am Kompressor vorbei), Lautstärke-Kanäle (gesamt/effekte/atmosphaere), keine Schritte mehr
│   ├── darstellung/
│   │   ├── renderer.js            Three.js: Kamera, Figuren, Licht/Tageszeit, Lampen-Pool, Effekte, Wand-Schnitt, Overlay, Vorkompilieren
│   │   ├── tierModelle.js         (v0.10) Hase (Comic-Platzhalter, prozedurale Textur) – hier echte Modelle einhängen
│   │   ├── angelModell.js         (v0.10) Rute, Schnur, Pose (wackelt beim Biss)
│   │   ├── wetterEffekt.js        (v0.10) Regen-Striche + weiche Übergänge Regen/Nebel (Licht, Nebelweite, Ton)
│   │   ├── kartenModell.js        Statische Karte in wenigen Draw-Calls: Boden, Wände, Möbel, Türen, Bäume/Steine (abbaubar), Lampen
│   │   ├── baumModell.js          Prozedurale Cartoon-Bäume/Büsche/Stümpfe (Toon + Umriss)
│   │   ├── itemModelle.js         ★ 3D-Modelle der Items am Boden (neues Modell = Eintrag in BAUPLAENE) + Rucksack
│   │   ├── fussspuren.js          Fußspuren (InstancedMesh mit Deckkraft pro Abdruck)
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
│       ├── inventarFenster.js     Inventar (I): Schnellleiste/Tasche/Rucksack, Drag & Drop, Rauswerfen
│       ├── kisteFenster.js        (v0.10) Lagerkiste: 16 Plätze + Inventar, Antippen = verschieben
│       ├── karte.js               Karte mit Nebel (erkundete Bereiche, localStorage), Minikarte (zeichneMini), Klick → Auto-Lauf
│       ├── entwicklerFenster.js   Developer-Modus (Werte ändern, Export/Import)
│       └── credits.js             Credits-Dialog (Grafik-Lizenzen)
│
└── tests/                         node:test – Karte, Bewegung, Server-Ablauf, Konten, Inhalte (Erreichbarkeit, Grafiken)
```

---

## 4. "Wo ändere ich …?" (Schnellnachschlag)

| Wunsch | Datei(en) |
|---|---|
| Zombie-Verhalten (Aggro, Verfolgen, Angriff, Umherschlurfen) | `server/spiel/systeme/zombieSystem.js` (+ Werte in `spielKonfiguration.js` → `zombie`) |
| **Crafting-Rezepte** | `server/spiel/konfiguration/rezepte.js` (Anleitung steht oben in der Datei) |
| **Werte ingame ändern** | Admin-Menü → 🛠 Developer; weitere Werte freischalten: `server/spiel/konfiguration/entwicklerFelder.js` |
| Startausrüstung | `spielKonfiguration.js` → `spieler.startInventar` |
| Abbau (Menge, Dauer, Nachwachsen) / was abbaubar ist | `spielKonfiguration.js` → `ressourcen`; Objekt→Ressource/Werkzeug: `gemeinsam/welt/ressourcen.js` |
| Schlafen (Dauer, Heilung, vorgespulte Stunden) | `spielKonfiguration.js` → `schlafen`; Logik `arbeitSystem.js` (`schlafe`, `spuleZeitVor`) |
| **Level / XP** (XP pro Zombie, Stufen) | `spielKonfiguration.js` → `level`; Logik `server/spiel/systeme/levelSystem.js`; HUD `#zeigeLevel` in `hud.js` |
| **Accounts / Gäste** | Datei `server/daten/konten.json` (Vorlage `konten.beispiel.json`), online: siehe `ONLINE_STELLEN.md`; Gäste an/aus: `server.gaeste` bzw. `GAESTE=0` |
| Inventar-Fenster, Rucksack-Größe | `client/ui/inventarFenster.js`; Größen `gemeinsam/konstanten.js` (`HOTBAR_PLAETZE`, `INVENTAR_PLAETZE`, `INVENTAR_MAX`), Rucksack `gegenstaende.js` → `rucksack.plaetze` |
| 3D-Modell eines Items am Boden | `client/darstellung/itemModelle.js` → `BAUPLAENE` (Größe `ITEM_SKALA`) |
| Baum-Aussehen | `client/darstellung/baumModell.js` (`BAUM_KRONE`, `FARBEN`) |
| Fußspuren (Länge, Abstand, Deckkraft) | `client/darstellung/fussspuren.js` |
| Blutflecken-Dauer | `client/darstellung/effekte.js` → `FLECK_LEBENSDAUER` (120 s) |
| Werkbänke, Steine, Betten, Spawn platzieren | `server/spiel/karten/stadtrand.js` (`objekte`: `werkbank`, `stein`; `S` = Start) |
| Interaktion mit E (Reihenfolge) | `client/kern/clientSpiel.js` → `#interaktion` |
| Karte (Sichtradius, Aussehen) | `client/ui/karte.js` |
| Chat (Länge, Spam-Pause) | `gemeinsam/konstanten.js` → `CHAT_MAX_LAENGE`, `CHAT_PAUSE_MS`; UI `client/ui/hud.js` |
| Grafik-Performance (Lampen-Pool, Auflösung, Sichtweite) | `client/darstellung/renderer.js` → `LAMPEN_POOL`, `AUFLOESUNG_MIN`, `SICHTWEITE` |
| Zombie-Typen (Werte, Häufigkeit) | `spielKonfiguration.js` → `zombie.varianten`; Aussehen: `SKINS` in `client/darstellung/renderer.js` |
| Tag-/Nachtlänge, Horde, Nacht-Wahrnehmung | `spielKonfiguration.js` → `welt.tagSekunden/nachtSekunden`, `zombie.nachtHorde/nachtTempoFaktor/nachtLichtFaktor/dunkelFaktor` |
| Licht-Stimmung (Farben Tag/Nacht/Dämmerung) | `client/darstellung/renderer.js` → `TAG`, `NACHT`, `DAEMMERUNG`, `#tageslicht` |
| Türen (Auto-Radius, Haltbarkeit, Startzustand) | `gemeinsam/konstanten.js` → `TUER_AUTO_OEFFNEN/SCHLIESSEN/BRUCH_OFFEN`, `TUER_REICHWEITE` (nur Bretter); `spielKonfiguration.js` → `welt.tuerLeben/tuerenGeschlossen`; Logik `tuerSystem.js` |
| Sprint / Ausdauer | Werte: `spielKonfiguration.js` → `spieler`; Logik: `aktualisiereAusdauer` in `gemeinsam/physik/bewegung.js` |
| Zombie-Wegfindung / Auto-Lauf-Weg | `gemeinsam/physik/pfadfindung.js` (A*), "geradeaus oder Umweg?" → `wegFrei` in `gemeinsam/physik/strahl.js` |
| Waffenwerte (Schaden, Magazin, Streuung, Nachladezeit) | `server/spiel/konfiguration/gegenstaende.js`; Schlag ohne Waffe: `UNBEWAFFNET` |
| Wirkung von Essen/Trinken/Medizin | `gegenstaende.js` (`naehrwert`, `durstwert`, `heilung`), Logik: `inventarSystem.js` → `benutzen` |
| Hunger-/Durst-Tempo, Heilung, Respawn-Zeit | `spielKonfiguration.js` → `spieler` |
| Aufheb-Reichweite | `gemeinsam/konstanten.js` → `AUFHEB_REICHWEITE` |
| Loot-Nachschub, Zombie-Beute | `lootSystem.js`; Zeiten in `spielKonfiguration.js` → `loot`, `zombie.lootChance`; Tabelle `zombie` in `lootTabellen.js` |
| Effekte (Blut, Mündungsfeuer …) | `client/darstellung/effekte.js` |
| Taschenlampe (3D-Kegel) | `client/darstellung/renderer.js` → `#aktualisiereTaschenlampen`, `#neueTaschenlampe` |
| Lampen auf der Karte | Kartendatei → `objekte` mit `typ: 'licht'` (radius, farbe, staerke, flackern) |
| Einstellungen (⚙: Ton-Regler, Grafikstufen, Abmelden, Vollbild) | `client/ui/einstellungen.js`, HTML `#einstellungen` in `client/index.html`; Grafikprofile `GRAFIK_PROFILE` in `renderer.js` (hoch/mittel/niedrig, gemerkt in `localStorage browserSurvival.grafik`) |
| Frisur/Aussehen der Figur (3D-Anbauteile) | `client/darstellung/haarModell.js` (`FRISUREN`), Zuordnung `frisur` je Körper-Option in `gemeinsam/spieler/aussehen.js`, Anbau `renderer.js → #setzeFrisur` |
| Geräusche ändern / neue Geräusche | `client/audio/sound.js` → `REZEPTE`; Auslöser in `clientSpiel.js` (`#ereignisSound`, `#datenSound`) |
| Schnellleiste, Balken, Todesbildschirm | `client/ui/hud.js`, Markup `client/index.html`, Stil `client/stil.css` |
| Haltung beim Zielen/Schlagen, Zombie-Arme | `client/darstellung/figurHaltung.js` → `HALTUNGEN`, `veraendereFuerAktion` |
| Waffenmodell (Form, Größe) | `client/darstellung/waffenModelle.js` → `BAUPLAENE`, `SICHTBARKEIT` |
| Neue Grafik / anderes Icon / Möbelstück | `werkzeuge/assets/baue_assets.py` (`ITEMS`, `OBJEKTE`, `EINZEL_OBJEKTE`) → Skript ausführen |
| Möbel/Deko platzieren | `server/spiel/karten/stadtrand.js` → `objekte` (Kollision über `blockiert`) |
| Touch-Steuerung | `client/kern/touchSteuerung.js`, Optik in `client/stil.css` (`.stick`) |
| Kamera, Wandhöhe, Möbelhöhen, Wand-Schnitt | `client/darstellung/renderer.js` (`KAMERA_VERSATZ`, `WANDHOEHE`, `MOEBEL_HOEHE`, `SCHNITT_RADIUS` …) |
| Bodentexturen, Straßenmarkierung, Gehweg | `client/darstellung/bodenTextur.js` |
| Andere Figuren/Animationen | `baue_assets.py` (`baue_3d_figuren`) + `baue_3d.mjs` (`ANIMATIONEN`), dann `npm run assets:3d` |
| Schaden, Lebenspunkte, Geschwindigkeit | `server/spiel/konfiguration/spielKonfiguration.js` oder `server/daten/einstellungen.json` |
| Neues Item | `server/spiel/konfiguration/gegenstaende.js` + Icon in `baue_assets.py` (`ITEMS`) + in `lootTabellen.js` eintragen |
| Was wo spawnt | `server/spiel/konfiguration/lootTabellen.js`, Raumzuordnung in der Kartendatei |
| Karte bearbeiten | `server/spiel/karten/stadtrand.js` (ASCII; Tests prüfen Erreichbarkeit & Möbel nicht in Türen) |
| Neue Karte / Zone | Tiled: `werkzeuge/karten/README.md` (`npm run karte:import`), oder Datei in `server/spiel/karten/` + in `KARTEN` (`kartenLader.js`) eintragen; Übergänge: `uebergaenge` + `ankuenfte` in der Kartendatei |
| Skills / Fähigkeiten | `gemeinsam/spieler/skills.js` (Werte), Wirkung in `levelSystem.js`, `kampfSystem.js`, `arbeitSystem.js`, `gemeinsam/physik/bewegung.js` |
| Bauwerke, Pflanzen, Kochen | `gemeinsam/welt/bauwerke.js`, `bauSystem.js`; Rezepte `rezepte.js` (`ort: 'inventar'`); Modelle `client/darstellung/bauwerkModelle.js` |
| Autos | Physik `gemeinsam/physik/fahrzeug.js`, Logik `fahrzeugSystem.js`, Modelle `client/darstellung/fahrzeugModelle.js` |
| Charakter-Aussehen | `gemeinsam/spieler/aussehen.js` (Merkmale), Auswahl `client/ui/loginBildschirm.js`, Skin `renderer.js` |
| Netzwerk-Last (Reichweite, Rundung, Kompression) | `server/spiel/zone.js` (`NETZ_SICHTWEITE`), `…ZuNetzwerk`, `server/node/websocketAnbindung.js` |
| Neuer Kacheltyp (z. B. Wasser `~`) | `gemeinsam/welt/kacheln.js` (Flags `blockiert`, `sichtFrei`, `wasser`) + Textur in `baue_assets.py` (`BODEN`) oder Farbe in `farben.js`/`bodenTextur.js` (`#wasser`) |
| **Auto-Haltbarkeit, Überfahr-Schaden** | `spielKonfiguration.js` → `fahrzeug`; Logik `fahrzeugSystem.js` (`schlageFahrzeug`), Zombie-Schläge `zombieSystem.js` (`autoAnlaufpunkt`), `kampfSystem.js` |
| Boss-Werte & Beute | `zombie.varianten.brocken` (`waffenChance`), Tabelle `boss` in `lootTabellen.js`, `lootSystem.lasseBossLootFallen` |
| Hasen / Tiere (Anzahl, Tempo, Scheu) | `spielKonfiguration.js` → `tiere`; `tierSystem.js`, `entitaeten/tier.js`; Modell `client/darstellung/tierModelle.js` |
| Angeln (Zeiten, Fische, Doppelfang) | `spielKonfiguration.js` → `angeln`; `angelSystem.js`, `gemeinsam/welt/wasser.js`; Darstellung `angelModell.js`; Hinweis `clientSpiel.js → #angelHinweis` |
| Wetter (Dauer, Häufigkeit) | `spielKonfiguration.js` → `wetter`; `wetterSystem.js`; Darstellung `wetterEffekt.js` + `renderer.js → #tageslicht`; Ton `sound.js → regen()` |
| Erdfeld-Größe, Samen/Pflanzen | `gemeinsam/welt/bauwerke.js` (`FELD_GROESSE`, `PFLANZEN`), `bauSystem.legeFeldAn`, Taste `G` (`eingabe.js`) |
| Lagerkiste (Plätze) / Basisbau-Teile | `KISTE_PLAETZE` in `konstanten.js`, `kistenSystem.js`, `kisteFenster.js`; Bauwerke `holzwand`/`holzboden` in `bauwerke.js` |
| Crafting-Level je Rezept | `rezept.level` in `rezepte.js` (Server prüft in `craftingSystem.js`, Menüs zeigen es) |
| Stapelgrößen | `STAPEL_MUNITION`/`STAPEL_STANDARD` in `konstanten.js` (angewendet in `gegenstaende.js → normalisiere`) |
| XP fürs Abbauen | `spielKonfiguration.js` → `level.xpProAbbau` |
| Minikarte / FPS-Anzeige / Auto-Lauf | `client/ui/karte.js` (`zeichneMini`, Klick), `hud.js`, `clientSpiel.js` (`autoLaufStarten`, `#oberflaecheAktualisieren`) |
| Zonen-Musik hinzufügen | Dateien in `client/musik/<zonenId>/` legen, `npm run musik:index`, committen (`audio/zonenMusik.js`) |
| Kollision / Bewegungsphysik | `gemeinsam/physik/bewegung.js` (wirkt auf Server UND Client-Vorhersage) |
| Kampf, Treffer, Schaden zufügen | `server/spiel/systeme/kampfSystem.js` (`fuegeSchadenZu` = einzige Schadensstelle) |
| Neue Aktion (z. B. "werfen") | `AKTIONEN` in `gemeinsam/protokoll.js` → `inventarSystem.js` (`verarbeiteAktionen`) → `clientSpiel.js` + Taste in `eingabe.js` + Touch-Knopf im HUD |
| Neue Netzwerk-Nachricht | `gemeinsam/protokoll.js` → Server: `spielServer.js` (`#nachrichtEmpfangen`) → Client: `clientSpiel.js` (`#nachricht`) |
| Neuer Entitätstyp | `server/spiel/entitaeten/<typ>.js`, Serialisierer in `spielWelt.js` (`NETZWERK_SERIALISIERER`), Darstellung in `renderer.js` |
| Tastenbelegung | `client/kern/eingabe.js` → `TASTEN`, `SLOT_TASTEN`; Touch-Feuerschwelle `TOUCH_FEUER_SCHWELLE` |
| Login-Formular / Serverliste | `client/index.html`, `client/ui/loginBildschirm.js`, `client/konfiguration.js` → `SERVER_LISTE` |
| Was im Spielstand steht / Prüfung beim Laden | `server/spiel/spielstand.js` |
| Wo Spielstände liegen | `server/node/start.js` (DateiSpeicher), `client/netzwerk/lokalerServer.js` (BrowserSpeicher) |
| Admin-Befehl hinzufügen | `ADMIN_BEFEHLE` in `gemeinsam/protokoll.js` → `adminSystem.js` → Knopf `data-befehl` im `#admin-panel` (`client/index.html`) |
| Zombie-Anzahl / Spawnorte | `Z` in `server/spiel/karten/stadtrand.js` (nur draußen!), Tempo/Sicht in `spielKonfiguration.js` → `zombie` |
| Login-Prüfung / Accounts | `server/node/kontenAuthentifizierung.js`, `server/werkzeuge/kontoAnlegen.js` |
| HUD / Anzeigen | `client/ui/hud.js`, `client/index.html`, `client/stil.css` |
| Tickrate | `gemeinsam/konstanten.js` → `TICK_RATE` |
| Port, Server starten | `server/node/start.js` |

---

## 5. Konventionen

- **Server-Autorität:** Spielrelevante Entscheidungen *nur* in `server/spiel/`. Der Client stellt dar und sagt voraus, entscheidet aber nichts.
- **`server/spiel/` bleibt umgebungsfrei:** keine `node:`-Importe, kein `document`/`window`. Nur `setTimeout`, `performance.now`, `Math`.
- **Entitäten = Datenobjekte, Verhalten = Systeme.** Neue Logik als System in `systeme/`, in `SpielWelt.aktualisiere()` einhängen.
- **Netzwerk-Serialisierer** (`…ZuNetzwerk`) bestimmen, was Clients sehen – interne Felder (Puffer, Ziele) nie mitschicken.
- **Eingaben nie vertrauen:** Server prüft Typen, Wertebereiche, Reihenfolge, Puffergröße.
- **Physik deterministisch:** fester Zeitschritt `TICK_DAUER_S`; Client und Server nutzen dieselbe Funktion.
- **Protokoll inkompatibel geändert?** → `PROTOKOLL_VERSION` erhöhen.
- **Grafiken nie von Hand in `client/assets/` ändern** – immer über `baue_assets.py` (sonst beim nächsten Lauf weg).
- **Nur frei lizenzierte Grafiken** (CC0/CC-BY); neue Quelle → in `LIZENZEN` im Skript eintragen.
- **Ohne Grafik spielbar:** Fehlt eine Textur, nutzt der Renderer Ersatzfarben. WebGL ist Pflicht (Login meldet es sonst).
- **Touch mitdenken:** Jede neue Aktion braucht auch eine Touch-Bedienung.
- Bezeichner deutsch, ohne Umlaute (`groesse`, `gegenstaende`); Kommentare/Texte dürfen Umlaute haben.
- Tests: `npm test` muss grün sein, bevor etwas committet wird.

---

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
  `DATEN_ORDNER`/`GAESTE`/`SERVER_NAME`, Mitspieler & Werkbänke auf der Karte, `ONLINE_STELLEN.md`
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
- Online stellen (Checkliste `ONLINE_STELLEN.md`) und mit Freunden testen
- Musik & echte Geräusch-Aufnahmen (statt Synthese)

### 🔭 Später
- Sichtlinie / Nebel des Krieges serverseitig (aktuell sieht der Client alle Zombies, nur die Grafik verdeckt sie)
- Dächer, die beim Betreten ausgeblendet werden; Innenräume ohne Sicht nach außen abdunkeln
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
- Abgebaute Ressourcen und Türen werden nicht gespeichert (Uhr, Bauwerke, Beete, Autos schon, pro Zone)
- Developer-Werte gelten im Lokal-Modus nur in diesem Browser (Export/Import zum Übertragen)
- Render-Free-Plan: keine dauerhafte Festplatte → Spielstände & Einstellungen gehen beim Neustart verloren

---

## 7. Änderungsprotokoll

| Version | Datum | Änderung |
|---|---|---|
| 0.1.0 | 2026-10-15 | Grundgerüst: Architektur, Netzwerk, Login, Bewegung, Krankenhauskarte, Platzhalter für Zombies/Loot |
| 0.2.0 | 2026-10-15 | Echte Grafiken & Animationen, Möbel mit Kollision, Parkplatz, Touch-Steuerung, adaptiver Zoom, Credits |
| 0.3.0 | 2026-10-15 | Gameplay: Zombie-KI mit A*, Inventar, Fern-/Nahkampf, Hunger/Durst, Tod & Respawn, Effekte, HUD (Protokoll v2) |
| 0.4.0 | 2026-10-15 | Handy-Scroll-Fix, Sprint/Ausdauer, Zombie-Varianten, Umherschlurfen, Spielstände, Dunkelheit + Taschenlampe, Sound, 3D-Prototyp |
| 0.5.0 | 2026-10-15 | Weniger/langsamere Zombies (nur draußen), Faust, Taschenlampe schaltbar (Tarnung), Sofort-Wiederbeleben, Admin-Modus (Gottmodus …) |
| 0.6.0 | 2026-10-15 | Nur noch 3D, Karte „Stadtrand“, Türen (öffnen/schließen/aufbrechen), Tag & Nacht mit Horde, Waffen in der Hand + Haltungen, Wand-Schnitt (Protokoll v3) |
| 0.7.0 | 2026-10-16 | Performance (~95 Draw-Calls), Holz & Stein abbauen, Crafting an Werkbänken, Schlafen, Start im Haus mit Pistole/Axt/Spitzhacke, Todes-Loot 3 min, Karte mit Erkundung, Developer-Modus, Chat & Spielerliste, Render-Deploy (Protokoll v4) |
| 0.8.0 | 2026-10-16 | Türen großzügiger + Zombies verkeilen nicht, Nahkampf-Reichweite, 3D-Cartoon-Bäume & Stümpfe, Sound ohne Knistern, Schlafen spult 6 h vor, Level-System, Inventar-Fenster mit Drag & Drop + Rucksack, 3D-Items, Fußspuren, Gast-Login, Konten-Datei (Klartext → Hash), Online-Checkliste (Protokoll v5) |
| 0.9.0 | 2026-10-16 | Zoom/Schärfe/Ruckeln/Maus-Fixes, Zombies (Haus, Türen, Despawn), Eisenerz, Bauen/Farmen/Kochen, Skills, Rucksäcke, Charakterwahl, Autos, Server-Spielstand (Erkundung, Skills), **Zonen/Open World** (Waldweg, Tiled-Import), Netzwerk-Diät (Rundung, Interest Mgmt, Kompression), KI_INDEX + Rauchtest (Protokoll v7) |
| 0.9.1 | 2026-10-16 | Wind bricht nicht mehr ab (eigener Bus am Kompressor vorbei, 12-s-Schleife), Schritte entfernt, **Einstellungen ⚙** (Lautstärke Gesamt/Effekte/Wind, Grafik hoch/mittel/niedrig, Vollbild, Abmelden – auch am Handy), Unschärfe-Bug (Auflösung wird im Profil „hoch“ nicht mehr automatisch gesenkt), **Automatiktüren**, Frau mit langen Haaren (`haarModell.js`), Fix: eigene Figur wurde manchmal mit falschem Geschlecht gebaut |
| 0.10.0 | 2026-10-16 | Große Zone Waldweg (160×120, Ringstraße, See, Angelhütte), Auto-Haltbarkeit + Wrack, Boss-Beute, Hasen, Angeln, Wetter (Regen/Nebel), Abbau-XP, Crafting-Level, Stapelgrößen, Statistik, Lagerkiste, Erdfeld (Spitzhacke) + Paprika, Basisbau-Gerüst, FPS/Minikarte, Auto-Lauf per Karte, Musik-Ordnersystem, Wind leiser, Fix Dunkelheit im Auto (Protokoll v8) |

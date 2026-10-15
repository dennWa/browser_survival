# Project Manifest – Browser Survival

> **Zweck dieser Datei:** Zentrale Landkarte des Projekts. Hier steht, *wo* welches System liegt,
> *wie* die Teile zusammenhängen und *was* der aktuelle Stand ist.
> **Pflegeregel:** Jede Änderung an Struktur, Protokoll oder Entwicklungsstand wird hier nachgetragen.

---

## 1. Überblick

Top-Down-Survival (2D, Vogelperspektive) im Browser – für PC/Laptop, spielbar auch auf Handy & Tablet.
Echte Grafiken (animierte Figuren, Texturen, Möbel, Item-Icons) aus freien Paketen.
Startkarte: **St.-Elisabeth-Krankenhaus**.

| Thema | Entscheidung |
|---|---|
| Sprache | Vanilla JavaScript (ES-Module), kein Build-Schritt. Bezeichner & Kommentare **Deutsch** (ohne Umlaute in Bezeichnern) |
| Darstellung | HTML5 Canvas 2D, Spritesheets (WebP) + Atlas, Karte in vorgerenderten 16×16-Blöcken |
| Grafiken | Freie Pakete (CC0 / CC-BY), aufbereitet durch `werkzeuge/assets/baue_assets.py` → `client/assets/` (~0,8 MB) |
| Geräte | Tastatur + Maus; Touch: zwei virtuelle Joysticks (links laufen, rechts zielen), Zoom passt sich der Bildschirmgröße an |
| Server | Node.js (≥ 20) + Paket `ws` (WebSockets), eingebauter HTTP-Server liefert auch die Spieldateien |
| Netzwerkmodell | **Autoritativer Server** – Client schickt nur Eingaben; Positionen, Treffer, Schaden und Loot bestimmt der Server |
| Netcode | Fester Tick (30/s), Client-Side Prediction + Server Reconciliation (eigener Spieler), Entity Interpolation (alle anderen) |
| Modi | **Lokal**: echter SpielServer läuft im Browser-Tab (ohne Account) · **Mehrspieler**: Node-Server, Login mit Account |
| Accounts | Keine Registrierung. Admin legt Accounts an: `npm run konto -- <name> <passwort>` (scrypt-Hash in `server/daten/konten.json`) |
| Zielgröße | Einige bis ein paar Dutzend gleichzeitige Spieler pro Server (Standard: max. 32) |

### Starten
```bash
npm install                              # einmalig (installiert nur "ws")
npm run konto -- Spieler1 meinPasswort   # Account anlegen (beliebig oft)
npm start                                # → http://localhost:8080
npm run start:gast                       # Server ohne Account-Pflicht (nur Tests!)
npm test                                 # automatische Tests
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

### Datenfluss pro Tick (30×/s)
1. Client: Tasten lesen → `EINGABE {seq, x, y, blick, angriff}` senden **und** Bewegung sofort lokal anwenden (Vorhersage).
   Einmalige Aktionen (aufheben, benutzen, ablegen, nachladen) gehen als `AKTION {art, slot?}`.
2. Server: Eingaben/Aktionen prüfen → Puffer des Spielers (je max. 8)
3. Server-Tick `SpielWelt.aktualisiere()` – Systeme in fester Reihenfolge:
   Aktionen ablaufen lassen → Bewegung → Inventar-Aktionen → Nachladen → Kampf (Spielerangriffe)
   → Zombie-KI → Überleben (Hunger/Durst/Respawn) → Loot-Nachschub
4. Server sendet an alle: `ZUSTAND` (Spieler & Zombies + `ereignisse` des Ticks: Schüsse, Treffer, Tode …),
   `GEGENSTAENDE` nur bei Änderung. An jeden einzeln: `SPIELER_DATEN` (Inventar, Hunger, Durst … nur bei Änderung)
   und `MELDUNG`en ("Inventar voll").
5. Client: eigene Position übernehmen + unbestätigte Eingaben nachspielen (Reconciliation); andere Entitäten
   100 ms verzögert interpolieren; Ereignisse → Effekte (fremde ebenfalls 100 ms verzögert, eigene sofort).

### Gameplay-Regeln (Kurzfassung)
- **Zombies:** sehen Spieler im `aggroRadius` nur bei freier Sicht (Wände/Fenster blockieren, Möbel nicht), hören
  Schüsse im `hoerRadius`. Laufen direkt aufs Ziel, wenn der Weg begehbar ist (3 Strahlen in Körperbreite), sonst A*
  um Wände & Möbel. Geben auf jenseits `verlierRadius` oder wenn das Ziel unerreichbar ist. Respawn am Spawnpunkt,
  aber nie in Spielernähe. Lassen mit `lootChance` etwas fallen.
- **Kampf:** Schusswaffen = Strahl (Hitscan) bis zur ersten Wand, Schrotflinte mit 7 Projektilen + Streuung;
  leeres Magazin → automatisch nachladen (falls Munition da), sonst "Klick". Nahkampf = Trefferkegel ±57° vor der
  Figur; ohne Waffe Schlag mit der Taschenlampe. PvP standardmäßig aus (`kampf.pvp`).
- **Inventar:** 8 Plätze, Stapel bis `stapelbar`, erste Waffe wird automatisch ausgerüstet, Schusswaffen merken ihr
  Magazin auch beim Ablegen.
- **Überleben:** Hunger/Durst sinken; bei 0 → Schaden. Beide ≥ 70 → langsame Heilung. Tod → Inventar fällt auf
  den Boden, Respawn nach `respawnZeit` am Startpunkt.
- **Sprinten:** Shift (Touch: linken Stick über den Rand ziehen) = 1,6× Tempo, kostet Ausdauer. Bei 0 erschöpft →
  erst ab `sprintMinimum` wieder. Ausdauer wird in `gemeinsam/physik/bewegung.js` berechnet (Server + Vorhersage
  identisch). Sprinten ist laut (`sprintHoerRadius`).
- **Zombie-Varianten** (`konfiguration.zombie.varianten`): normal, Läufer (schnell, schwach, blass), Brocken
  (langsam, zäh, starker Biss, groß). Ruhende Zombies schlurfen im `wanderRadius` um ihren Spawnpunkt.

### Spielstände
Beim Login lädt der SpielServer den Stand über eine austauschbare **Speicher-Schnittstelle**
(`laden(name)`, `speichern(name, stand)`), geprüft und bereinigt durch `server/spiel/spielstand.js`.
Gespeichert wird beim Logout, alle `server.autosaveSekunden` und beim Server-Stopp (Strg+C wartet aufs Schreiben).
| Umgebung | Speicher |
|---|---|
| Node-Server | `server/node/dateiSpeicher.js` → `server/daten/spielstaende/<name>.json` (Ordner per `SPIELSTAENDE=…`) |
| Lokal-Modus | `client/netzwerk/browserSpeicher.js` → localStorage |
| Tests / Fallback | `server/spiel/speicher/arbeitsspeicherSpeicher.js` |

### Grafik-Pipeline
`werkzeuge/assets/baue_assets.py` (Python, nur bei Grafik-Änderungen nötig) lädt die Quellpakete, ermittelt per
Template-Matching den Drehpunkt (Kopfmitte) jeder Figuren-Animation, schneidet zu, verkleinert, packt WebP-Spritesheets
und schreibt `client/assets/atlas.json` + `LIZENZEN.md`. Der Client lädt beim Start den Atlas (Ladebalken);
fehlt eine Grafik, zeichnet er Platzhalter-Formen – das Spiel bleibt immer lauffähig.

**Lizenzpflicht:** CC-BY-Grafiken (Survivor, Survival Props) verlangen Namensnennung → Credits-Dialog im Login
(Daten aus `atlas.json → lizenzen`). Nicht entfernen!

### Darstellung pro Frame
Welt-Blöcke (Böden, Teppiche, Schatten, Möbel, Wände – gecacht) → Blut am Boden → Gegenstände → Figuren (Schatten,
Füße, Oberkörper, gedreht um den Kopf) → Baumkronen → **Dunkelheit mit Lichtern** → Schüsse/Partikel →
Namen/Lebensbalken → Vignette → Schadensblitz.

### Licht & Sound
- **Licht** (`client/darstellung/licht.js`): Dunkelheitsebene in halber Auflösung; Grunddunkelheit pro Kachel
  (drinnen/draußen, weiche Übergänge). Taschenlampen als **Sichtpolygon** (Strahlen bis zur Wand → echte Schatten),
  Lampen der Karte (`typ: 'licht'`, mit Farbe/Flackern), Mündungsfeuer. Werte: `LICHT` in `client/konfiguration.js`, Taste L.
- **Sound** (`client/audio/sound.js`): komplett synthetisch (Web Audio, keine Dateien). Räumlich (Entfernung +
  Stereo). Auslöser: Server-Ereignisse (`feuer`, `treffer`, `tod`, `nahkampf`, `leer`), Änderungen der eigenen
  Daten (essen, trinken, aufheben, nachladen), Schritte (Vorhersage), zufälliges Zombie-Stöhnen. Taste M / 🔊.
Animationen: `${ausruestung}_${aktion}` für den Survivor (taschenlampe/messer/pistole/schrotflinte × idle/laufen/
schiessen/nachladen/nahkampf), Füße je nach Laufrichtung relativ zur Blickrichtung (vor/zurück/seitwärts).

### Login-Ablauf
`LoginBildschirm` → `verbindungAufbauen()` (Lokal oder WebSocket) → `anmelden()` sendet `ANMELDEN`
→ Server: Protokollversion prüfen → Name prüfen → `authentifizierung.pruefe()` → Doppel-Login/Server-voll prüfen
→ `ANMELDUNG_OK` (Karte, Startposition, Physik, Gegenstände) → `ClientSpiel` startet.
Schutz: 20 s Login-Timeout, nach 5 Fehlversuchen Verbindung trennen, gleiche Fehlermeldung für
"unbekannter Name" und "falsches Passwort".

---

## 3. Dateistruktur

```
browser_survival/
├── project_manifest.md            ← DIESE DATEI
├── CLAUDE.md                      Arbeitsanweisung für KI-Sitzungen (verweist hierher)
├── README.md                      Kurzanleitung
├── package.json                   Skripte: start, start:gast, konto, test
├── index.html                     Weiterleitung → client/ (für reine Datei-Hoster)
│
├── gemeinsam/                     ── Client UND Server ──
│   ├── konstanten.js              Tickrate, Kachelgröße, Protokollversion, Namensregeln
│   ├── protokoll.js               Alle Nachrichtentypen + kodiere/dekodiere
│   ├── mathe.js                   lerp, Winkel-Interpolation, normalisiere …
│   ├── welt/kacheln.js            Kacheltypen (Zeichen → Name, blockiert?) + Marker (S, Z, a–z)
│   ├── welt/welt.js               Klasse Welt: Kachelabfragen, istBlockiert
│   └── physik/
│       ├── bewegung.js            wendeEingabeAn, bewegeKoerper (Kollision) – deterministisch!
│       └── strahl.js              Raycasts: strahlGegenWaende, sichtlinieFrei, wegFrei, strahlTrifftKreis
│
├── server/
│   ├── spiel/                     ── Autoritative Spiellogik (läuft in Node UND Browser) ──
│   │   ├── spielServer.js         Sitzungen, Login, Nachrichten-Routing, Tick → Versand
│   │   ├── spielWelt.js           Spielzustand: Entitäten-Map, Tick, Systemreihenfolge, Schnappschuss
│   │   ├── taktgeber.js           Fester Simulationstakt (setTimeout-basiert)
│   │   ├── zufall.js              Seedbarer Zufall (mulberry32)
│   │   ├── entitaeten/
│   │   │   ├── spieler.js         erzeugeSpieler + spielerZuNetzwerk
│   │   │   ├── zombie.js          erzeugeZombie + zombieZuNetzwerk
│   │   │   └── gegenstand.js      erzeugeGegenstand + gegenstandZuNetzwerk
│   │   ├── systeme/
│   │   │   ├── bewegungsSystem.js Spieler-Eingaben anwenden (inkl. Angriffstaste)
│   │   │   ├── inventarSystem.js  Aufheben, Benutzen, Ausrüsten, Ablegen, Nachladen
│   │   │   ├── kampfSystem.js     Schüsse (Strahl), Nahkampf (Kegel), fuegeSchadenZu, toeten, Lärm → Zombies
│   │   │   ├── zombieSystem.js    Zombie-KI: Sicht, Verfolgen, Angriff, Abstand halten, Respawn
│   │   │   ├── pfadfindung.js     A* auf dem Kachelraster
│   │   │   ├── ueberlebenSystem.js Hunger, Durst, Heilung, Wiederbelebung
│   │   │   └── lootSystem.js      Start-Loot, Nachschub an Loot-Punkten, Zombie-Beute
│   │   ├── karten/
│   │   │   ├── kartenLader.js     Kartenregister + ASCII → Kacheln/Spawns/Loot-Punkte
│   │   │   └── krankenhaus.js     Krankenhaus-Karte (ASCII) + Raumdefinitionen
│   │   ├── konfiguration/
│   │   │   ├── spielKonfiguration.js  Balancing-Standardwerte + Überschreib-Logik
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
│   │   ├── kontenAuthentifizierung.js  Login gegen konten.json
│   │   ├── passwort.js            scrypt-Hashing
│   │   ├── dateiSpeicher.js       Spielstände als JSON-Dateien (atomar geschrieben)
│   │   └── einstellungenLaden.js  einstellungen.json → Konfiguration
│   ├── werkzeuge/kontoAnlegen.js  CLI: npm run konto -- <name> <passwort>
│   └── daten/                     konten.json, einstellungen.json, spielstaende/ (gitignored) + einstellungen.beispiel.json
│
├── werkzeuge/assets/              ── Grafik-Pipeline (Python) ──
│   ├── baue_assets.py             Quellen, Item-/Möbel-Zuordnung, Drehpunkte, Spritesheets → client/assets/
│   └── anforderungen.txt          pip-Pakete (pillow, numpy, cairosvg, py7zr)
│
├── client/                        ── Nur Browser ──
│   ├── assets/                    GENERIERT: atlas.json, Spritesheets (figuren/, items.webp, umgebung.webp), LIZENZEN.md
│   ├── index.html                 Canvas, Touch-Sticks, HUD, Ladebildschirm, Login, Credits-Dialog
│   ├── stil.css                   Gesamtes UI-Styling
│   ├── main.js                    Einstieg: verdrahtet Login → Verbindung → ClientSpiel
│   ├── konfiguration.js           Serverliste, Zoom, Interpolationsverzögerung, Lokal-Latenz
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
│   │   └── sound.js               Synthetisierte Geräusche (Rezepte), räumlicher Klang, Atmosphäre
│   ├── darstellung/
│   │   ├── renderer.js            Szene zeichnen, Ebenen, adaptiver Zoom, HiDPI, Culling, Vignette
│   │   ├── licht.js               Dunkelheit, Taschenlampen-Sichtpolygone, Lampen, Mündungslicht
│   │   ├── effekte.js             Mündungsfeuer, Leuchtspuren, Blut, Blutlachen, Schadensblitz
│   │   ├── assets.js              Atlas + Bilder laden, Zugriff auf Figuren/Items/Böden/Objekte
│   │   ├── animationen.js         Frame-Zustand pro Figur, zeichneFrame()
│   │   ├── kamera.js              Folgt Spieler, Welt ↔ Bildschirm
│   │   ├── weltZeichner.js        Karte in Blöcken vorrendern: Texturen, Wände, Schatten, Möbel; Baumkronen
│   │   ├── entitaetZeichner.js    Survivor (Füße+Körper), Zombie, Items, Namen/Lebensbalken, Platzhalter
│   │   └── farben.js              Farben für Prozedurales (Wände, Asphalt) + Ersatzfarben
│   └── ui/
│       ├── loginBildschirm.js     Login-Formular, Serverauswahl
│       ├── hud.js                 Balken, Schnellleiste, Munition, Aufheben/Nachladen-Knöpfe, Meldungen, Tod, Debug
│       └── credits.js             Credits-Dialog (Grafik-Lizenzen)
│
└── tests/                         node:test – Karte, Bewegung, Server-Ablauf, Konten, Inhalte (Erreichbarkeit, Grafiken)
```

---

## 4. "Wo ändere ich …?" (Schnellnachschlag)

| Wunsch | Datei(en) |
|---|---|
| Zombie-Verhalten (Aggro, Verfolgen, Angriff, Umherschlurfen) | `server/spiel/systeme/zombieSystem.js` (+ Werte in `spielKonfiguration.js` → `zombie`) |
| Zombie-Typen (Werte, Häufigkeit) | `spielKonfiguration.js` → `zombie.varianten`; Farbe der Sprites: `ZOMBIE_FARBEN` in `baue_assets.py` |
| Sprint / Ausdauer | Werte: `spielKonfiguration.js` → `spieler`; Logik: `aktualisiereAusdauer` in `gemeinsam/physik/bewegung.js` |
| Zombie-Wegfindung | `server/spiel/systeme/pfadfindung.js` (A*), "geradeaus oder Umweg?" → `wegFrei` in `gemeinsam/physik/strahl.js` |
| Waffenwerte (Schaden, Magazin, Streuung, Nachladezeit) | `server/spiel/konfiguration/gegenstaende.js`; Schlag ohne Waffe: `UNBEWAFFNET` |
| Wirkung von Essen/Trinken/Medizin | `gegenstaende.js` (`naehrwert`, `durstwert`, `heilung`), Logik: `inventarSystem.js` → `benutzen` |
| Hunger-/Durst-Tempo, Heilung, Respawn-Zeit | `spielKonfiguration.js` → `spieler` |
| Inventargröße / Aufheb-Reichweite | `gemeinsam/konstanten.js` → `INVENTAR_PLAETZE`, `AUFHEB_REICHWEITE` |
| Loot-Nachschub, Zombie-Beute | `lootSystem.js`; Zeiten in `spielKonfiguration.js` → `loot`, `zombie.lootChance`; Tabelle `zombie` in `lootTabellen.js` |
| Effekte (Blut, Mündungsfeuer …) | `client/darstellung/effekte.js` |
| Dunkelheit, Taschenlampe | `client/darstellung/licht.js`, Werte `LICHT` in `client/konfiguration.js` |
| Lampen auf der Karte | Kartendatei → `objekte` mit `typ: 'licht'` (radius, farbe, staerke, flackern) |
| Geräusche ändern / neue Geräusche | `client/audio/sound.js` → `REZEPTE`; Auslöser in `clientSpiel.js` (`#ereignisSound`, `#datenSound`) |
| Schnellleiste, Balken, Todesbildschirm | `client/ui/hud.js`, Markup `client/index.html`, Stil `client/stil.css` |
| Zombie-Aussehen / Animationen | Grafik: `werkzeuge/assets/baue_assets.py` (`baue_zombie`); Auswahl der Animation: `client/darstellung/entitaetZeichner.js` → `zeichneZombie` |
| Spieler-Animationen / Waffen in der Hand | `entitaetZeichner.js` → `zeichneSpieler`; Ausrüstung je Waffe: `gegenstaende.js` → `ausruestung` |
| Neue Grafik / anderes Icon / Möbelstück | `werkzeuge/assets/baue_assets.py` (`ITEMS`, `OBJEKTE`, `EINZEL_OBJEKTE`) → Skript ausführen |
| Möbel/Deko platzieren | `server/spiel/karten/krankenhaus.js` → `objekte` (Kollision über `blockiert`) |
| Touch-Steuerung | `client/kern/touchSteuerung.js`, Optik in `client/stil.css` (`.stick`) |
| Zoom / Sichtweite | `client/konfiguration.js` → `KAMERA_SICHTFELD`, `ZOOM_MIN/MAX` |
| Wände, Schatten, Böden | `client/darstellung/weltZeichner.js` |
| Schaden, Lebenspunkte, Geschwindigkeit | `server/spiel/konfiguration/spielKonfiguration.js` oder `server/daten/einstellungen.json` |
| Neues Item | `server/spiel/konfiguration/gegenstaende.js` + Icon in `baue_assets.py` (`ITEMS`) + in `lootTabellen.js` eintragen |
| Was wo spawnt | `server/spiel/konfiguration/lootTabellen.js`, Raumzuordnung in der Kartendatei |
| Karte bearbeiten | `server/spiel/karten/krankenhaus.js` (ASCII) |
| Neue Karte | neue Datei in `server/spiel/karten/` + in `KARTEN` (`kartenLader.js`) registrieren; Auswahl via `welt.karte` |
| Neuer Kacheltyp (z. B. Wasser) | `gemeinsam/welt/kacheln.js` + Textur in `baue_assets.py` (`BODEN`) oder Farbe in `farben.js` |
| Kollision / Bewegungsphysik | `gemeinsam/physik/bewegung.js` (wirkt auf Server UND Client-Vorhersage) |
| Kampf, Treffer, Schaden zufügen | `server/spiel/systeme/kampfSystem.js` (`fuegeSchadenZu` = einzige Schadensstelle) |
| Neue Aktion (z. B. "werfen") | `AKTIONEN` in `gemeinsam/protokoll.js` → `inventarSystem.js` (`verarbeiteAktionen`) → `clientSpiel.js` + Taste in `eingabe.js` + Touch-Knopf im HUD |
| Neue Netzwerk-Nachricht | `gemeinsam/protokoll.js` → Server: `spielServer.js` (`#nachrichtEmpfangen`) → Client: `clientSpiel.js` (`#nachricht`) |
| Neuer Entitätstyp | `server/spiel/entitaeten/<typ>.js`, Serialisierer in `spielWelt.js` (`NETZWERK_SERIALISIERER`), Zeichner in `entitaetZeichner.js` |
| Tastenbelegung | `client/kern/eingabe.js` → `TASTEN`, `SLOT_TASTEN`; Touch-Feuerschwelle `TOUCH_FEUER_SCHWELLE` |
| Login-Formular / Serverliste | `client/index.html`, `client/ui/loginBildschirm.js`, `client/konfiguration.js` → `SERVER_LISTE` |
| Was im Spielstand steht / Prüfung beim Laden | `server/spiel/spielstand.js` |
| Wo Spielstände liegen | `server/node/start.js` (DateiSpeicher), `client/netzwerk/lokalerServer.js` (BrowserSpeicher) |
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
- **Ohne Grafik spielbar:** Jeder Zeichner hat einen Platzhalter-Fallback.
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

### ⏳ Phase 3 – Vorschläge (wartet auf Entscheidung)
- 3D-Prototyp (Three.js, schräge Kamera) zum Vergleich mit 2D – siehe Gespräch: Logik bleibt, nur `client/darstellung/` wechselt
- ~~Dunkelheit + Taschenlampen-Lichtkegel, Sound~~ ✅ (v0.4.0) – Musik & echte Aufnahmen später
- ~~Persistenz pro Account (Inventar/Position bleiben nach Logout)~~ ✅ (v0.4.0)
- ~~Sprinten mit Ausdauer, Zombie-Varianten, umherwandernde Zombies~~ ✅ (v0.4.0)

### 🔭 Später
- Sichtlinie / Nebel des Krieges serverseitig (aktuell sieht der Client alle Zombies, nur die Grafik verdeckt sie)
- Eigene Animationen für Hammer/Beil/Machete (aktuell nutzen alle Nahkampfwaffen das Messer-Set)
- Türen öffnen/schließen, Inventar-Fenster mit Drag & Drop, Crafting
- Interest Management (nur nahe Entitäten senden), Delta-Kompression – sobald Spielerzahl/Karte wächst
- Treffer-Vorhersage im Client (sofortiges Feedback trotz Ping)
- Mehrere Karten / Serverbrowser mit Live-Status
- HTTPS/WSS hinter Reverse Proxy (z. B. Caddy/nginx) für Betrieb im Internet

### Bekannte Grenzen (bewusst, für später)
- Login-Daten gehen über `ws://` unverschlüsselt → im Internet nur über `wss://` (HTTPS-Proxy) betreiben
- Eingabepuffer verwirft bei extremem Lag Eingaben (Schutz vor Speedhacks) → leichte Korrektur-Ruckler möglich
- Schnappschüsse enthalten alle Spieler + Zombies (für ~32 Spieler auf einer Karte unkritisch)
- Schuss-/Treffer-Feedback kommt erst nach einer Server-Runde (bei 50 ms Ping kaum spürbar, bei 200 ms schon)
- Nahkampf trifft sofort beim Tastendruck (nicht erst im passenden Animationsframe)

---

## 7. Änderungsprotokoll

| Version | Datum | Änderung |
|---|---|---|
| 0.1.0 | 2026-10-15 | Grundgerüst: Architektur, Netzwerk, Login, Bewegung, Krankenhauskarte, Platzhalter für Zombies/Loot |
| 0.2.0 | 2026-10-15 | Echte Grafiken & Animationen, Möbel mit Kollision, Parkplatz, Touch-Steuerung, adaptiver Zoom, Credits |
| 0.3.0 | 2026-10-15 | Gameplay: Zombie-KI mit A*, Inventar, Fern-/Nahkampf, Hunger/Durst, Tod & Respawn, Effekte, HUD (Protokoll v2) |

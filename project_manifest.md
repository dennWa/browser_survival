# Project Manifest – Browser Survival

> **Zweck dieser Datei:** Zentrale Landkarte des Projekts. Hier steht, *wo* welches System liegt,
> *wie* die Teile zusammenhängen und *was* der aktuelle Stand ist.
> **Pflegeregel:** Jede Änderung an Struktur, Protokoll oder Entwicklungsstand wird hier nachgetragen.

---

## 1. Überblick

Top-Down-Survival (2D, Vogelperspektive) im Browser. Platzhaltergrafik (Kreise/Rechtecke).
Startkarte: **St.-Elisabeth-Krankenhaus**.

| Thema | Entscheidung |
|---|---|
| Sprache | Vanilla JavaScript (ES-Module), kein Build-Schritt. Bezeichner & Kommentare **Deutsch** (ohne Umlaute in Bezeichnern) |
| Darstellung | HTML5 Canvas 2D |
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
1. Client: Tasten lesen → `EINGABE {seq, x, y, blick}` senden **und** sofort lokal anwenden (Vorhersage)
2. Server: Eingabe prüfen → in Puffer des Spielers (max. 8)
3. Server-Tick: `SpielWelt.aktualisiere()` → Systeme in fester Reihenfolge: Bewegung → Zombies → Kampf
4. Server: `ZUSTAND` (Schnappschuss aller Spieler & Zombies) an alle; `GEGENSTAENDE` nur bei Änderung
5. Client: eigene Position vom Server übernehmen, unbestätigte Eingaben nachspielen (Reconciliation);
   andere Entitäten 100 ms verzögert zwischen zwei Schnappschüssen interpolieren

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
│   └── physik/bewegung.js         wendeEingabeAn, bewegeKoerper (Kollision) – deterministisch!
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
│   │   │   ├── bewegungsSystem.js Spieler-Eingaben anwenden
│   │   │   ├── zombieSystem.js    Zombie-KI (PLATZHALTER)
│   │   │   ├── kampfSystem.js     Nah-/Fernkampf, Schaden (PLATZHALTER)
│   │   │   └── lootSystem.js      Start-Loot verteilen
│   │   ├── karten/
│   │   │   ├── kartenLader.js     Kartenregister + ASCII → Kacheln/Spawns/Loot-Punkte
│   │   │   └── krankenhaus.js     Krankenhaus-Karte (ASCII) + Raumdefinitionen
│   │   ├── konfiguration/
│   │   │   ├── spielKonfiguration.js  Balancing-Standardwerte + Überschreib-Logik
│   │   │   ├── gegenstaende.js    Item-Datenbank (Essen, Trinken, Medizin, Waffen, Munition)
│   │   │   └── lootTabellen.js    Welcher Raumtyp welche Items (gewichtet)
│   │   ├── netz/speicherKanal.js  In-Memory-Kanal (Lokal-Modus, Tests) + Kanal-Schnittstelle
│   │   └── authentifizierung/gastAuthentifizierung.js   Auth-Schnittstelle + Gast-Variante
│   ├── node/                      ── Nur Node.js ──
│   │   ├── start.js               Einstieg: liest Einstellungen, startet HTTP + WS + Spiel
│   │   ├── statischerServer.js    Liefert client/, gemeinsam/, server/spiel/ aus (sonst nichts!)
│   │   ├── websocketAnbindung.js  ws-Socket → Text-Kanal, Herzschlag, Größenlimits
│   │   ├── kontenAuthentifizierung.js  Login gegen konten.json
│   │   ├── passwort.js            scrypt-Hashing
│   │   └── einstellungenLaden.js  einstellungen.json → Konfiguration
│   ├── werkzeuge/kontoAnlegen.js  CLI: npm run konto -- <name> <passwort>
│   └── daten/                     konten.json, einstellungen.json (beide gitignored) + einstellungen.beispiel.json
│
├── client/                        ── Nur Browser ──
│   ├── index.html                 Canvas, HUD, Login-Formular
│   ├── stil.css                   Gesamtes UI-Styling
│   ├── main.js                    Einstieg: verdrahtet Login → Verbindung → ClientSpiel
│   ├── konfiguration.js           Serverliste, Zoom, Interpolationsverzögerung, Lokal-Latenz
│   ├── kern/
│   │   ├── clientSpiel.js         Laufende Sitzung: Vorhersage, Reconciliation, Interpolation
│   │   ├── spielSchleife.js       requestAnimationFrame-Loop mit festem Takt
│   │   └── eingabe.js             Tastatur/Maus, Tastenbelegung (TASTEN)
│   ├── netzwerk/
│   │   ├── verbindungAufbauen.js  Fabrik: Lokal vs. WebSocket
│   │   ├── jsonVerbindung.js      Text-Kanal → Objekt-Nachrichten
│   │   ├── websocketKanal.js      Browser-WebSocket als Text-Kanal
│   │   ├── lokalerServer.js       Startet SpielServer im Tab (Lokal-Modus)
│   │   └── anmeldung.js           Login-Handshake (Promise)
│   ├── darstellung/
│   │   ├── renderer.js            Zeichnet Szene, Fenstergröße/HiDPI, Culling, Ebenen
│   │   ├── kamera.js              Folgt Spieler, Welt ↔ Bildschirm
│   │   ├── weltZeichner.js        Karte einmalig vorrendern
│   │   ├── entitaetZeichner.js    Zeichenfunktion pro Entitätstyp
│   │   └── farben.js              Platzhalter-Farben (später: Sprites/Texturen)
│   └── ui/
│       ├── loginBildschirm.js     Login-Formular, Serverauswahl
│       └── hud.js                 Statusleiste, Leben, Debug-Overlay (F3)
│
└── tests/                         node:test – Karte, Bewegung, Server-Ablauf, Konten
```

---

## 4. "Wo ändere ich …?" (Schnellnachschlag)

| Wunsch | Datei(en) |
|---|---|
| Zombie-Verhalten (Aggro, Verfolgen, Angriff) | `server/spiel/systeme/zombieSystem.js` (+ Werte in `spielKonfiguration.js` → `zombie`) |
| Zombie-Aussehen | `client/darstellung/entitaetZeichner.js` → `zeichneZombie`, Farben in `farben.js` |
| Schaden, Lebenspunkte, Geschwindigkeit | `server/spiel/konfiguration/spielKonfiguration.js` oder `server/daten/einstellungen.json` |
| Neues Item | `server/spiel/konfiguration/gegenstaende.js` + in `lootTabellen.js` eintragen |
| Was wo spawnt | `server/spiel/konfiguration/lootTabellen.js`, Raumzuordnung in der Kartendatei |
| Karte bearbeiten | `server/spiel/karten/krankenhaus.js` (ASCII) |
| Neue Karte | neue Datei in `server/spiel/karten/` + in `KARTEN` (`kartenLader.js`) registrieren; Auswahl via `welt.karte` |
| Neuer Kacheltyp (z. B. Wasser) | `gemeinsam/welt/kacheln.js` + Farbe in `client/darstellung/farben.js` |
| Kollision / Bewegungsphysik | `gemeinsam/physik/bewegung.js` (wirkt auf Server UND Client-Vorhersage) |
| Kampf, Treffer, Schaden zufügen | `server/spiel/systeme/kampfSystem.js` |
| Neue Netzwerk-Nachricht | `gemeinsam/protokoll.js` → Server: `spielServer.js` (`#nachrichtEmpfangen`) → Client: `clientSpiel.js` (`#nachricht`) |
| Neuer Entitätstyp | `server/spiel/entitaeten/<typ>.js`, Serialisierer in `spielWelt.js` (`NETZWERK_SERIALISIERER`), Zeichner in `entitaetZeichner.js` |
| Tastenbelegung | `client/kern/eingabe.js` → `TASTEN` |
| Login-Formular / Serverliste | `client/index.html`, `client/ui/loginBildschirm.js`, `client/konfiguration.js` → `SERVER_LISTE` |
| Login-Prüfung / Accounts | `server/node/kontenAuthentifizierung.js`, `server/werkzeuge/kontoAnlegen.js` |
| HUD / Anzeigen | `client/ui/hud.js`, `client/index.html`, `client/stil.css` |
| Kamera / Zoom | `client/darstellung/kamera.js`, `KAMERA_ZOOM` in `client/konfiguration.js` |
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
- **Platzhalter-Grafik:** Farben nur in `client/darstellung/farben.js`.
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

### ⏳ Phase 2 – Core Gameplay (nächster Schritt, wartet auf Freigabe)
- [ ] Zombie-KI: Aggro-Radius, Verfolgen (zuerst direkt, später Pfadfindung A*), Angriff
- [ ] Aufsammeln von Items (Taste E, Server prüft Reichweite) + Inventar
- [ ] Nahkampf (Treffer-Kegel) und Fernkampf (Hitscan/Raycast, Munition)
- [ ] Spielertod & Respawn
- [ ] Hunger/Durst (Essen & Trinken bekommen Sinn)

### 🔭 Später
- Sichtlinie / Nebel des Krieges (Räume nur sichtbar, wenn man drin ist)
- Türen öffnen/schließen, Loot-Respawn
- Interest Management (nur nahe Entitäten senden), Delta-Kompression – sobald Spielerzahl/Karte wächst
- Persistenz pro Account (Position, Inventar) – Datei oder SQLite
- Sprites/Texturen statt Farben, Sound
- Mehrere Karten / Serverbrowser mit Live-Status
- HTTPS/WSS hinter Reverse Proxy (z. B. Caddy/nginx) für Betrieb im Internet

### Bekannte Grenzen (bewusst, für später)
- Login-Daten gehen über `ws://` unverschlüsselt → im Internet nur über `wss://` (HTTPS-Proxy) betreiben
- Eingabepuffer verwirft bei extremem Lag Eingaben (Schutz vor Speedhacks) → leichte Korrektur-Ruckler möglich
- Schnappschüsse enthalten alle Spieler + Zombies (für ~32 Spieler auf einer Karte unkritisch)

---

## 7. Änderungsprotokoll

| Version | Datum | Änderung |
|---|---|---|
| 0.1.0 | 2026-10-15 | Grundgerüst: Architektur, Netzwerk, Login, Bewegung, Krankenhauskarte, Platzhalter für Zombies/Loot |

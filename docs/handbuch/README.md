# Project Manifest – Browser Survival

> **Zweck dieser Datei:** Zentrale Landkarte des Projekts. Hier steht, *wo* welches System liegt,
> *wie* die Teile zusammenhängen und *was* der aktuelle Stand ist.
> **Für KI-Sitzungen:** NICHT hier lesen – Einstieg ist `CLAUDE.md` → `ki/<thema>.md` (kompakt, aktuell).
> **Stand:** Handbuch für Menschen, eingefroren auf Runde 44 (wird nicht mehr bei jeder Runde nachgezogen). Laufend gepflegt wird nur `docs/handbuch/aenderungsprotokoll.md`.

---

## 1. Überblick

Top-Down-Survival in **3D** (schräge Vogelperspektive, Three.js) im Browser – für PC/Laptop, spielbar auch auf
Handy & Tablet. Gameplay bleibt flach (2D auf dem Boden), nur die Darstellung ist 3D.
**Offene Welt aus Zonen** (wie die großen Maps in Guild Wars 2): Startzone **Stadtrand mit dem St.-Elisabeth-Krankenhaus**
(155 × 130 Kacheln), im Norden die Zone **Waldweg** (160 × 120, Wald, Försterhütte, viel Erz), im Osten die Schneezone **Schneeland** (155 × 130). Tag & Nacht, Türen, Horde,
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

## Handbuch-Teile (aufgeteilt, um Tokens zu sparen)
> Nicht alles lesen – nur den passenden Teil. Für KIs ist `CLAUDE.md` der Einstieg.

| Datei | Inhalt |
|---|---|
| `docs/handbuch/architektur.md` | Architektur, Gameplay-Regeln, Spielstände, Darstellung, Sound, Login |
| `docs/handbuch/dateistruktur.md` | Dateistruktur |
| `docs/handbuch/wo_aendere_ich.md` | „Wo ändere ich …?“ Schnellnachschlag |
| `docs/handbuch/entwicklungsstand.md` | Phasen, Ideen-Sammlung, bekannte Grenzen |
| `docs/handbuch/map_editor.md` | Map-Editor (Handbuch) |
| `docs/handbuch/aenderungsprotokoll.md` | Änderungsprotokoll (groß – nur gezielt greppen/lesen) |

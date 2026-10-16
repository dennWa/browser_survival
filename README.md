# Browser Survival

Top-Down-Survival in 3D im Browser – Mehrspieler mit autoritativem Node.js-Server.
Karte: ein Stadtrand rund ums St.-Elisabeth-Krankenhaus. Plündern, Holz & Stein sammeln, an der Werkbank bauen,
Türen verrammeln, die Nacht überleben – allein oder mit Freunden.

## Schnellstart

```bash
npm install
cp server/daten/konten.beispiel.json server/daten/konten.json   # Accounts eintragen (Passwort im Klartext –
                                                               # der Server verschlüsselt es beim ersten Login)
npm start                                # → http://localhost:8080
```

Im Login **"Lokal (im Browser)"** wählen, um ohne Account allein zu testen,
oder **"Dieser Server"** für Mehrspieler – mit Account oder per **"Als Gast spielen"** (Zufallsname `Gast-1234`). Das Spiel braucht WebGL (jeder aktuelle Browser).
Ein Tag dauert 10 Minuten, eine Nacht 5 – nachts kommt eine Horde. Türen sind zu und lassen sich öffnen/schließen.
Im Lokal-Modus bist du automatisch Admin (🛡-Menü). Spielstände werden automatisch gespeichert (Server: `server/daten/spielstaende/`, Lokal: im Browser).

Steuerung: **WASD** laufen · **Maus** zielen · **Klick/Leertaste** Angriff · **E** benutzen (aufheben, Baum fällen, Stein abbauen, Werkbank, schlafen) · **F** Tür auf/zu · **R** nachladen ·
**I** Inventar (ziehen = umsortieren, aus dem Fenster ziehen = fallen lassen) · **Q** fallen lassen · **K** Karte · **T** Chat · **Tab** Spielerliste ·
**1–8** Schnellleiste benutzen/ausrüsten · **Rechtsklick** auf Platz = ablegen · **Shift** sprinten · **L** Taschenlampe an/aus (nachts: aus = Zombies sehen dich schlechter) · **Enter** (tot) sofort wiederbeleben · **P** Admin-Menü · **M** Ton · **F3** Debug
Handy/Tablet: **linker Daumen** laufen · **rechter Daumen** zielen (ganz durchdrücken = Angriff) · Knöpfe für Aktion/Tür/Nachladen/🎒/🗺/💬/🔦/🛡 · Inventar: antippen = benutzen, ziehen = umsortieren/fallen lassen · Schnellleiste lange drücken = ablegen

## Weitere Befehle

| Befehl | Zweck |
|---|---|
| `npm run start:gast` | Server ohne Account-Pflicht (nur zum Testen) |
| `npm run konto -- Name Passwort [--admin]` | Account per Befehl anlegen (Alternative zur Datei) |
| `npm test` | Automatische Tests |
| `PORT=3000 npm start` | Anderer Port |

Werte anpassen ohne Code: im Spiel **Admin-Menü → 🛠 Developer** (Lokal-Modus: man ist immer Admin). Änderungen bleiben gespeichert
(Server: `server/daten/einstellungen.json`, Lokal: im Browser). **Crafting-Rezepte:** `server/spiel/konfiguration/rezepte.js`.

## Online stellen (mit Freunden spielen)

Schritt-für-Schritt-Checkliste: **[`ONLINE_STELLEN.md`](ONLINE_STELLEN.md)** (Render, kostenlos, ~15 Minuten).
Kurz: Render → New + → Blueprint → dieses Repo · Secret File `konten.json` anlegen · Link an Freunde schicken.

Grafiken neu erzeugen (nur bei Grafik-Änderungen, braucht Python 3):
`python3 -m venv .venv && .venv/bin/pip install -r werkzeuge/assets/anforderungen.txt && .venv/bin/python werkzeuge/assets/baue_assets.py && npm run assets:3d`
Lizenzen der Grafiken: [`client/assets/LIZENZEN.md`](client/assets/LIZENZEN.md).

**Architektur, Dateistruktur und Entwicklungsstand:** siehe [`project_manifest.md`](project_manifest.md).

## Für Entwickler & KIs
- `KI_INDEX.md` – kompakte Übersicht (Architektur, Dateien, Protokoll, Fallen) · `project_manifest.md` – ausführlich
- `npm test` · `npm run rauchtest` (Browser-Test) · `werkzeuge/karten/README.md` (neue Zonen mit Tiled)

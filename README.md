# Browser Survival

Top-Down-Survival in 3D im Browser – Mehrspieler mit autoritativem Node.js-Server.
Karte: ein Stadtrand rund ums St.-Elisabeth-Krankenhaus. Plündern, Holz & Stein sammeln, an der Werkbank bauen,
Türen verrammeln, die Nacht überleben – allein oder mit Freunden.

## Schnellstart

```bash
npm install
npm run konto -- Spieler1 meinPasswort   # Account anlegen (keine Registrierung im Spiel)
npm run konto -- Chef meinPasswort --admin   # Account mit Admin-Menü (Gottmodus & Co.)
npm start                                # → http://localhost:8080
```

Im Login **"Lokal (im Browser)"** wählen, um ohne Account allein zu testen,
oder **"Dieser Server"** für Mehrspieler mit Account. Das Spiel braucht WebGL (jeder aktuelle Browser).
Ein Tag dauert 10 Minuten, eine Nacht 5 – nachts kommt eine Horde. Türen sind zu und lassen sich öffnen/schließen.
Im Lokal-Modus bist du automatisch Admin (🛡-Menü). Spielstände werden automatisch gespeichert (Server: `server/daten/spielstaende/`, Lokal: im Browser).

Steuerung: **WASD** laufen · **Maus** zielen · **Klick/Leertaste** Angriff · **E** benutzen (aufheben, Baum fällen, Stein abbauen, Werkbank, schlafen) · **F** Tür auf/zu · **R** nachladen ·
**K** Karte · **T** Chat · **Tab** Spielerliste ·
**1–8** Inventar benutzen/ausrüsten · **Rechtsklick** auf Inventarplatz = ablegen · **Shift** sprinten · **L** Taschenlampe an/aus (nachts: aus = Zombies sehen dich schlechter) · **Enter** (tot) sofort wiederbeleben · **P** Admin-Menü · **M** Ton · **F3** Debug
Handy/Tablet: **linker Daumen** laufen · **rechter Daumen** zielen (ganz durchdrücken = Angriff) · Knöpfe für Aktion/Tür/Nachladen/🗺/💬/🔦/🛡 · Inventarplatz lange drücken = ablegen

## Weitere Befehle

| Befehl | Zweck |
|---|---|
| `npm run start:gast` | Server ohne Account-Pflicht (nur zum Testen) |
| `npm test` | Automatische Tests |
| `PORT=3000 npm start` | Anderer Port |

Werte anpassen ohne Code: im Spiel **Admin-Menü → 🛠 Developer** (Lokal-Modus: man ist immer Admin). Änderungen bleiben gespeichert
(Server: `server/daten/einstellungen.json`, Lokal: im Browser). **Crafting-Rezepte:** `server/spiel/konfiguration/rezepte.js`.

## Online stellen (mit Freunden spielen)

1. Bei [Render](https://render.com) anmelden → **New + → Blueprint** → dieses Repository wählen (liest `render.yaml`).
2. Accounts anlegen: lokal `npm run konto -- Name Passwort` (mit `--admin` für dich) – die letzte Ausgabezeile
   ist der Wert für die Umgebungsvariable **`KONTEN_JSON`** → in Render unter *Environment* eintragen.
3. Im Spiel als Server **„Dieser Server“** wählen. Der kostenlose Plan hat keine dauerhafte Festplatte (Spielstände
   gehen bei Neustarts verloren) – für dauerhaftes Speichern einen Plan mit *Disk* nehmen.

Grafiken neu erzeugen (nur bei Grafik-Änderungen, braucht Python 3):
`python3 -m venv .venv && .venv/bin/pip install -r werkzeuge/assets/anforderungen.txt && .venv/bin/python werkzeuge/assets/baue_assets.py && npm run assets:3d`
Lizenzen der Grafiken: [`client/assets/LIZENZEN.md`](client/assets/LIZENZEN.md).

**Architektur, Dateistruktur und Entwicklungsstand:** siehe [`project_manifest.md`](project_manifest.md).

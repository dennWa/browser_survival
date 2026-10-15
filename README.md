# Browser Survival

Top-Down-Survival im Browser – Mehrspieler mit autoritativem Node.js-Server.
Aktuelle Testkarte: ein Krankenhaus voller Zombies. Plündern, kämpfen, satt bleiben, überleben.

## Schnellstart

```bash
npm install
npm run konto -- Spieler1 meinPasswort   # Account anlegen (keine Registrierung im Spiel)
npm start                                # → http://localhost:8080
```

Im Login **"Lokal (im Browser)"** wählen, um ohne Account allein zu testen,
oder **"Dieser Server"** für Mehrspieler mit Account. Unter **Grafik** gibt es neben 2D einen **3D-Prototyp**.
Spielstände werden automatisch gespeichert (Server: `server/daten/spielstaende/`, Lokal: im Browser).

Steuerung: **WASD** laufen · **Maus** zielen · **Klick/Leertaste** Angriff · **E** aufheben · **R** nachladen ·
**1–8** Inventar benutzen/ausrüsten · **Rechtsklick** auf Inventarplatz = ablegen · **Shift** sprinten · **L** Dunkelheit an/aus · **M** Ton · **F3** Debug
Handy/Tablet: **linker Daumen** laufen · **rechter Daumen** zielen (ganz durchdrücken = Angriff) · Knöpfe für Aufheben/Nachladen · Inventarplatz lange drücken = ablegen

## Weitere Befehle

| Befehl | Zweck |
|---|---|
| `npm run start:gast` | Server ohne Account-Pflicht (nur zum Testen) |
| `npm test` | Automatische Tests |
| `PORT=3000 npm start` | Anderer Port |

Server-Balancing anpassen: `server/daten/einstellungen.beispiel.json` nach `einstellungen.json` kopieren und Werte ändern.

Grafiken neu erzeugen (nur bei Grafik-Änderungen, braucht Python 3):
`python3 -m venv .venv && .venv/bin/pip install -r werkzeuge/assets/anforderungen.txt && .venv/bin/python werkzeuge/assets/baue_assets.py && npm run assets:3d`
Lizenzen der Grafiken: [`client/assets/LIZENZEN.md`](client/assets/LIZENZEN.md).

**Architektur, Dateistruktur und Entwicklungsstand:** siehe [`project_manifest.md`](project_manifest.md).

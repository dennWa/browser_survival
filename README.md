# Browser Survival

Top-Down-Survival im Browser – Mehrspieler mit autoritativem Node.js-Server.
Aktuelle Testkarte: ein Krankenhaus voller Zombies (die vorerst nur herumstehen).

## Schnellstart

```bash
npm install
npm run konto -- Spieler1 meinPasswort   # Account anlegen (keine Registrierung im Spiel)
npm start                                # → http://localhost:8080
```

Im Login **"Lokal (im Browser)"** wählen, um ohne Account allein zu testen,
oder **"Dieser Server"** für Mehrspieler mit Account.

Steuerung: **WASD** bewegen · **Maus** zielen · **F3** Debug-Overlay

## Weitere Befehle

| Befehl | Zweck |
|---|---|
| `npm run start:gast` | Server ohne Account-Pflicht (nur zum Testen) |
| `npm test` | Automatische Tests |
| `PORT=3000 npm start` | Anderer Port |

Server-Balancing anpassen: `server/daten/einstellungen.beispiel.json` nach `einstellungen.json` kopieren und Werte ändern.

**Architektur, Dateistruktur und Entwicklungsstand:** siehe [`project_manifest.md`](project_manifest.md).

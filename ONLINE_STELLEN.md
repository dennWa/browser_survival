# Online stellen – Checkliste

Ziel: Ein Server im Internet, auf dem du und deine Freunde gleichzeitig spielt – mit Account **oder** als Gast.
Alles Nötige ist im Code fertig; du musst nur noch die Schritte unten abhaken. Dauer: ca. 15 Minuten.

## Was schon fertig ist

- **Mehrspieler-Server** (`npm start`): liefert das Spiel aus *und* ist der WebSocket-Spielserver (`/ws`).
- **Login mit Account** (Name + Passwort) – Accounts stehen in einer Datei, die du selbst schreibst.
- **„Als Gast spielen“**: Zufallsname wie `Gast-4821`, kein Passwort, nie Admin. Der Name bleibt im Browser
  gespeichert → auch Gäste behalten ihren Spielstand (solange sie denselben Browser nutzen).
- **Spielstand pro Account/Gast**: Position, Leben, Hunger, Durst, Inventar inkl. Rucksack, Level & XP.
  Wird alle 30 s, beim Ausloggen und beim Server-Stopp gespeichert.
- **Mitspieler finden**: Tab = Spielerliste (mit Level), K = Karte mit allen Mitspielern (blaue Punkte), T = Chat.

## 1. Accounts anlegen (deine Datei)

Vorlage: [`server/daten/konten.beispiel.json`](server/daten/konten.beispiel.json)

```json
{
  "konten": [
    { "benutzername": "Dennis", "passwort": "dein-passwort", "admin": true },
    { "benutzername": "Kumpel", "passwort": "sein-passwort" }
  ]
}
```

- `benutzername`: 2–20 Zeichen (Buchstaben, Ziffern, `_`, `-`). Namen wie `Gast-1234` sind für Gäste reserviert.
- `passwort`: einfach im Klartext eintragen. Läuft der Server mit einer **beschreibbaren** Datei (z. B. lokal),
  ersetzt er beim ersten Login alle Klartext-Passwörter automatisch durch sichere Hashes (`passwortHash`).
- `"admin": true` → Admin-Menü (🛡, Taste P) und Developer-Modus.
- Neue Accounts gelten sofort, ohne Neustart.
- **Niemals ins Repository committen!** (`server/daten/konten.json` ist in `.gitignore`.)

Lokal testen: Vorlage nach `server/daten/konten.json` kopieren, Namen/Passwörter anpassen, `npm start`,
<http://localhost:8080> öffnen, Server **„Dieser Server (Mehrspieler)“** wählen.

## 2. Bei Render hochladen (kostenlos)

1. [ ] Auf <https://render.com> mit deinem GitHub-Konto anmelden.
2. [ ] **New + → Blueprint** → Repository `browser_survival` wählen → Branch wählen (der mit diesem Stand) →
       **Apply**. Render liest `render.yaml` und baut den Server (dauert ein paar Minuten).
3. [ ] Im neuen Service **browser-survival → Environment → Secret Files → Add Secret File**:
       Dateiname `konten.json`, Inhalt = deine Datei aus Schritt 1 → **Save**.
       (Der Server findet sie automatisch unter `/etc/secrets/konten.json`.)
4. [ ] **Manual Deploy → Deploy latest commit** (damit die Secret File geladen wird).
5. [ ] Adresse öffnen, z. B. `https://browser-survival.onrender.com` → Server **„Dieser Server (Mehrspieler)“** →
       mit Account einloggen oder **„Als Gast spielen“**.
6. [ ] Link an Freunde schicken. Fertig! 🎉

Optional:
- [ ] **Nur Accounts, keine Gäste:** Environment → `GAESTE` = `0`.
- [ ] **Servername:** Environment → `SERVER_NAME`.
- [ ] **Auch über GitHub Pages spielbar machen:** in [`client/konfiguration.js`](client/konfiguration.js)
      `ONLINE_SERVER = 'wss://browser-survival.onrender.com/ws'` eintragen (deine Render-Adresse, mit `wss://` und
      `/ws`), committen → auf <https://dennwa.github.io/browser_survival/> erscheint dann „Online-Server“.

## 3. Wichtig zu wissen (kostenloser Plan)

| Punkt | Free-Plan | Lösung |
|---|---|---|
| Spielstände & Developer-Werte | gehen bei Neustart/Deploy **verloren** | Plan *Starter* + **Disk** (Mount Path `/var/data`), dann Environment `DATEN_ORDNER` = `/var/data` |
| Einschlafen | nach 15 min ohne Besucher; erster Aufruf danach ~1 min | bezahlter Plan oder einfach kurz warten |
| Accounts | bleiben (Secret File) | – |

Andere Hoster gehen genauso: Node 20, `npm install --omit=dev`, `npm start`, Port aus `PORT`.
Konten per `KONTEN_DATEI=/pfad/konten.json` oder `KONTEN_JSON='{"konten":[…]}'`, dauerhafter Speicher per `DATEN_ORDNER`.

## Alle Umgebungsvariablen

| Variable | Bedeutung |
|---|---|
| `PORT` | Port (setzt der Hoster selbst) |
| `KONTEN_DATEI` | Pfad zur Konten-Datei (Standard: `/etc/secrets/konten.json`, sonst `server/daten/konten.json`) |
| `KONTEN_JSON` | Konten direkt als JSON-Text (Alternative zur Datei) |
| `GAESTE` | `0` = keine Gäste |
| `SERVER_NAME` | Anzeigename des Servers |
| `DATEN_ORDNER` | Ordner für Spielstände + Developer-Einstellungen (dauerhafte Disk) |
| `SPIELSTAENDE` | nur der Spielstand-Ordner |
| `GAST_MODUS` | `1` = jeder Name ohne Passwort (nur zum Testen!) |

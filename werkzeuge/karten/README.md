# Karten & Zonen bauen

Die Spielwelt besteht aus **Zonen** (eine Karte = eine Zone, wie die großen Maps in Guild Wars 2).
Zonen hängen über **Übergänge** zusammen: Wer das Übergangs-Rechteck am Kartenrand betritt, landet
in der Nachbarzone am **Ankunftspunkt**. Jede Zone hat ihre eigenen Zombies, ihren eigenen Loot und
ihre eigenen Bauwerke. Gespeichert wird sie unter `welt:<id>`, und im Spielstand steht, in welcher
Zone der Spieler zuletzt war.

| Datei | Wofür |
|---|---|
| `server/spiel/karten/<id>.js` | die Karte selbst (ASCII-Kacheln + Objekte + Übergänge), in `kartenLader.js` → `KARTEN` eingetragen |
| `werkzeuge/karten/stadtrand.py`, `waldweg.py` | Generatoren der beiden Zonen (`python3 werkzeuge/karten/waldweg.py`) |
| `werkzeuge/karten/tiled.mjs` | Export/Import für den Karten-Editor **Tiled** |
| `werkzeuge/karten/tiledKarte.mjs` | Umwandlungsregeln Tiled ⇄ Spiel (reine Funktionen, getestet in `tests/tiled.test.js`) |

## Mit Tiled arbeiten (empfohlen für neue Zonen)

1. [Tiled](https://www.mapeditor.org) installieren (kostenlos).
2. Vorhandene Zone exportieren: `npm run karte:export -- waldweg` → `werkzeuge/karten/tiled/waldweg.tmj`
   und `kacheln.png`.
3. In Tiled öffnen, bearbeiten und **als JSON (.tmj)** speichern. Neue Zone: „Speichern unter …“
   und die Karten-Eigenschaft `id` ändern.
4. Importieren: `npm run karte:import -- werkzeuge/karten/tiled/meinezone.tmj`
   → schreibt `server/spiel/karten/meinezone.js` und trägt die Zone in `KARTEN` ein.
5. `npm test`. Das prüft Spawns, Loot-Tabellen, Übergänge (Ziel vorhanden, Ankunft frei, Weg zurück)
   und den Import selbst.

### Regeln in Tiled

- **Kachel-Ebene `boden`**: Tileset `kacheln` (eingebettet). Jede Kachel hat die Eigenschaft `zeichen`
  (`,` Gras, `_` Asphalt, `=` Straße, `-` Gehweg, `.` Fliesen, `:` Beton, `+` Holz, `T` Tür,
  `#` Wand, `F` Fenster).
- **Objekte**: Die Klasse (bei älteren Tiled-Versionen „Typ“) entscheidet, was ein Objekt ist.
  - `start` / `zombie` als Punkt: Spieler-Start bzw. Zombie-Spawn (Zombies nur draußen!)
  - `loot` als Punkt + Eigenschaft `raum` (`a`–`z`): Loot-Punkt. Den Raum legt die Karten-Eigenschaft
    `raeume` fest (JSON, z. B. `{"a":{"name":"Hütte","lootTabelle":"huette"}}`).
  - `uebergang` als Rechteck + `ziel` (Zonen-ID) + `ankunft` (Name des Ankunftspunkts dort).
    Der Objektname ist der Schildtext.
  - `ankunft` als Punkt. Der Objektname ist der Name, auf den die Nachbarzone verweist (z. B. `sued`).
  - Alles andere ist ein Möbelstück, Baum, Licht usw. (Klasse = `typ`, z. B. `bett`, `baum`, `licht`).
    Eigenschaften wie `blockiert`, `ebene`, `drehung` (0/90/180/270), `radius` und `farbe` werden
    1:1 übernommen.
- Drehung bitte als Eigenschaft `drehung` setzen, nicht mit dem Drehwerkzeug von Tiled.

### Zwei Zonen verbinden

Zone A bekommt am Rand einen `uebergang` mit `ziel: B` und `ankunft: x`. Zone B bekommt einen
Ankunftspunkt `x`, ein paar Kacheln vom Rand entfernt und **nicht** im Übergang selbst, und
umgekehrt genauso. Mit dem Auto geht es nicht durch Übergänge, man muss aussteigen.

## Testen im Spiel

Lokal-Modus, Browser-Konsole: `browserSurvival.zone('waldweg')` wechselt sofort die Zone.
`browserSurvival.tp(x, y)` setzt die Figur auf eine Kachel.

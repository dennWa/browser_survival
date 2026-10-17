# Eigene Sounds

Hier kannst du eigene Soundeffekte ablegen. Sie ersetzen automatisch die mitgelieferten Sounds.
(Diese README wird aus `README.vorlage.md` + `client/audio/eigeneSounds.js` erzeugt – nicht direkt bearbeiten.)

## So geht's

1. Audiodatei hier in den Ordner legen (`.ogg`, `.mp3`, `.wav`, `.m4a`, `.webm`, `.opus`, `.flac`).
2. **Dateiname = Ereignis** (Liste unten), z. B. `baum_faellt.ogg`.
3. **Abwechslung:** mehrere Dateien mit angehängter Nummer: `hack_holz_1.ogg`, `hack_holz_2.ogg`, `hack_holz_3.ogg`.
   Bei jedem Ereignis wird zufällig eine gewählt (nie zweimal dieselbe hintereinander).
4. **Lautstärke:** in `lautstaerke.txt` pro Ereignis eine Zahl, z. B. `baum_faellt 80`.
   100 = Originallautstärke, 0 = stumm, über 100 = lauter (bis 300). Gilt auch für mitgelieferte Sounds (ohne eigene Datei).
5. `npm run sounds` ausführen (baut `eigene.json`, prüft Tippfehler), dann committen und pushen.

Eigene Dateien werden unverändert abgespielt (keine zufällige Tonhöhe); Entfernung und Stereo-Position wirken weiter.
Tipp: kurze Dateien (< 3 s), Lautstärke der Aufnahme selbst eher normalisiert.

## Ereignisse

### Waffen & Kampf

| Dateiname (ohne Endung) | Wann? |
|---|---|
| `pistole` | Pistolenschuss |
| `schrotflinte` | Schrotflintenschuss |
| `leer` | Klick: Magazin leer / nichts zu tun |
| `nachladen` | Nachladen |
| `nahkampf` | Schlag / Hieb in die Luft |
| `treffer_zombie` | Zombie wird getroffen |
| `treffer_spieler` | Spieler wird getroffen |

### Zombies & Tod

| Dateiname (ohne Endung) | Wann? |
|---|---|
| `zombie_stoehnen` | Zombie ruhend / schlurfend (Stöhnen) |
| `zombie_angriff` | Zombie greift an |
| `zombie_tod` | Zombie stirbt |
| `spieler_tod` | Spieler stirbt |

### Sammeln & Bauen

| Dateiname (ohne Endung) | Wann? |
|---|---|
| `hack_holz` | Axt trifft Baum (jeder Hieb) |
| `baum_faellt` | Baum fällt um (Holzfällen fertig) |
| `hack_stein` | Spitzhacke trifft Eisenerz |
| `stein_bricht` | Eisenerz ist abgebaut |
| `hack_felsen` | Spitzhacke trifft Fels/Stein |
| `felsen_bricht` | Fels/Stein ist abgebaut |
| `aufheben` | Item aufheben (leises Rascheln) |
| `beute` | Beute / Kiste durchsucht |
| `gebaut` | Bauwerk platziert |
| `werkeln` | Herstellen / Basteln / Reparieren |
| `graben` | Beet anlegen / Hacke / Rasen abtragen |

### Türen

| Dateiname (ohne Endung) | Wann? |
|---|---|
| `tuer_auf` | Tür öffnen |
| `tuer_zu` | Tür schließen |
| `tuer_schlag` | Zombie schlägt auf Tür |
| `tuer_bricht` | Tür bricht auf |

### Fahrzeuge

| Dateiname (ohne Endung) | Wann? |
|---|---|
| `autotuer` | Ein-/Aussteigen |
| `aufprall` | Auto kracht gegen Hindernis |
| `fahrzeug_schaden` | Auto nimmt Schaden |
| `fahrzeug_kaputt` | Auto geht kaputt |

### Essen, Feuer, Angeln, Fallen

| Dateiname (ohne Endung) | Wann? |
|---|---|
| `essen` | Essen |
| `trinken` | Trinken |
| `heilen` | Heilen (Verband/Medizin) |
| `feuer_an` | Lagerfeuer anzünden |
| `feuer_aus` | Lagerfeuer erlischt |
| `knistern` | Feuer knistert in der Nähe (zufällig) |
| `holz_nachlegen` | Holz ins Feuer legen |
| `brutzel` | Essen wird gekocht (Start) |
| `brutzeln` | Essen brutzelt (Dauergeräusch am Feuer) |
| `fertig` | Essen ist gar |
| `verbrannt` | Essen ist verkohlt |
| `angel_wurf` | Angel auswerfen |
| `angel_biss` | Fisch beißt an |
| `gefangen` | Fisch gefangen |
| `falle_auf` | Falle gespannt |
| `falle_zu` | Falle schnappt zu |

### Sonstiges

| Dateiname (ohne Endung) | Wann? |
|---|---|
| `level_auf` | Level-Aufstieg |

Nicht hier: Zonen-Musik (`client/musik/`), Wind/Regen/Motor (laufende Geräusche, noch nicht ersetzbar).

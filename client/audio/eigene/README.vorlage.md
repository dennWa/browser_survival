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
{{EREIGNISSE}}

Nicht hier: Zonen-Musik (`client/musik/`), Wind/Regen/Motor (laufende Geräusche, noch nicht ersetzbar).

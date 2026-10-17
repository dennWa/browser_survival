# Grafik-Anträge aus dem Map-Editor

Der Map-Editor („Eigene → 🎨 Neue Grafik (Antrag)“) erzeugt Dateien `<id>.grafik.json` (Bild als data-URL, Lizenz,
Urheber, Quelle). Hierher legen, dann:

```bash
python3 werkzeuge/assets/baue_assets.py   # prüft Lizenz (nur CC0 / CC-BY), packt das Bild in den Atlas, schreibt Credits
npm run assets:3d
```

`baue_assets.py` bricht mit klarer Meldung ab, wenn Lizenz, Urheber, Quelle oder Bild fehlen bzw. nicht erlaubt sind.
Grafiken nie direkt nach `client/assets/` kopieren (Projektregel 6).

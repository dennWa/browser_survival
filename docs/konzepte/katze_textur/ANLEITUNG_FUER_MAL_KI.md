# Katzen-Textur malen – Anleitung für eine Bild-KI / einen Menschen

Ziel: **eine einzige PNG, 1024 × 1024 px**, die auf das fertige 3D-Katzenmodell (Low-Poly, ~600 Dreiecke) gelegt wird.
Das Modell ist eckig gebaut; die Textur bestimmt nur die Farbe/Zeichnung. Datei danach: `katze.png`.

## Wichtigste Regel
Die Datei besteht aus **15 festen Rechtecken (Zonen)**. Jede Zone gehört zu einem Körperteil. Die Positionen sind in
`katze_vorlage.png` (beschriftet) bzw. `katze_vorlage_leer.png` (nur Rahmen) zu sehen und **dürfen nicht verschoben werden**.
Alles außerhalb der Zonen ist egal (neutral grau-braun lassen). Zonen **bis an den Rand ausmalen** (kein weißer Rand, kein Schlagschatten, keine Beschriftung ins Endbild!).

## Zonen (Pixel: x, y, Breite × Höhe) – y zählt von oben
| Zone | Position | Größe | Inhalt |
|---|---|---|---|
| KOERPER SEITE | 16, 16 | 560 × 213 | Flanke. **Kopf = rechts**, Rücken = oben, Bauchkante = unten. Gilt für beide Seiten (gespiegelt) |
| BRUST | 592, 16 | 165 × 213 | Vorderseite des Rumpfs (Latz/Brust), oben = Hals |
| HINTERTEIL | 773, 16 | 165 × 213 | Po-Ansicht von hinten, oben = Rücken |
| RUECKEN | 16, 245 | 560 × 165 | Rücken von oben gesehen, **Kopf = rechts** |
| BAUCH | 16, 426 | 560 × 165 | Bauch von unten gesehen, **Kopf = rechts** |
| BEIN | 592, 245 | 128 × 346 | **alle vier Beine** teilen sich diese Zone. Oben = Schulter/Hüfte, **unten = Pfote** (hier Socken/helle Pfoten malen) |
| SCHWANZ | 736, 245 | 96 × 346 | **oben = Spitze**, unten = Ansatz. Ringe/Streifen waagerecht malen |
| OHR aussen | 848, 245 | 96 × 96 | Außenseite beider Ohren (Fellfarbe) |
| AUGE | 848, 357 | 64 × 64 | **eine einfarbige Fläche** (Irisfarbe, z. B. gelb/grün/blau), keine Details |
| ROSA DETAILS | 848, 437 | 64 × 64 | **eine einfarbige Fläche** für Nase, Ohr-Innenseite und Pfotenballen (z. B. rosa) |
| KOPF GESICHT | 16, 607 | 176 × 192 | Gesicht von vorn (Stirn, Wangen, Schnauze; Augen/Nase sind eigene Zonen, hier nur Fell/Zeichnung) |
| KOPF SEITE | 208, 607 | 272 × 192 | Kopf von der Seite, **Nase = rechts**, gilt beide Seiten |
| KOPF HINTEN | 496, 607 | 176 × 192 | Hinterkopf |
| KOPF OBEN | 688, 607 | 160 × 224 | Kopf von oben, Schnauze = rechts |
| KOPF UNTEN | 864, 607 | 144 × 224 | Kinn/Hals von unten, Schnauze = rechts |

## Gestaltungstipps
- **Nahtstellen:** Fellfarbe/-muster an den Zonenrändern ähnlich halten (z. B. RUECKEN-Rand = SEITE-Oberkante), sonst sieht man Kanten.
- Das Modell ist **klein im Spiel** (Draufsicht-Kamera): kräftige Farben, grobe Muster (Streifen, Flecken), keine Haarstrukturen.
- Muster nicht zu klein (Streifen ≥ 20 px breit). Kontrast zwischen Fell und Bauch/Pfoten hilft beim Erkennen.
- Beispiele: getigert (graue Streifen auf Braun, weiße Brust+Socken), schwarz (gelbe Augen), Calico (weiß/orange/schwarz Flecken), Siam (cremefarben, dunkles Gesicht/Beine/Schwanz).

## Abgabe
`katze.png` (RGB, 1024×1024). Ablegen unter `client/assets/3d/skins/katze.png` – sonst kümmert sich die Spiel-KI darum.
Technik (für KIs im Projekt): `client/darstellung/katzeTextur.js`, Zonen `client/assets/3d/skins/katze_zonen.json`, Vorlage per `python3 werkzeuge/assets/katze_vorlage.py`.

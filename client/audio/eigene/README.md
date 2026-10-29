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

Eigene Dateien werden unverändert abgespielt (Tonhöhe nur mit „Streuung“ aus `einstellungen.json`); Entfernung und Stereo wirken weiter.
Tipp: kurze Dateien (< 3 s), Lautstärke der Aufnahme selbst eher normalisiert.

## Ereignisse

### Atmosphäre & Wetter

| Dateiname (ohne Endung) | Wann? |
|---|---|
| `wind` | Wind draußen (immer, Schleife; Regler „Wind & Regen“) |
| `regen` | Regen (Schleife, Lautstärke folgt der Regenstärke) |
| `nacht` | Nachtgeräusche – Grillen (Schleife, nur nachts) |
| `schritt_schnee` | Schritte im Schnee (Knirschen, jeder Tritt; Schneefall selbst ist lautlos) |
| `schritt_gras` | Schritte im Gras (jeder Tritt; 6 Aufnahmen, zufällig) |
| `donner` | Ferner Donner bei Gewitter (verzögert nach dem Blitz) |
| `donner_nah` | Naher Donnerschlag (Blitz ganz in der Nähe) |
| `regen_stark` | Starkregen bei Gewitter (Schleife, zusätzlich zum Regen) |
| `wind_leicht` | Wind leicht – sanftes Rauschen draußen (Schleife, Stärke folgt Wind + Böen wie die Bäume) |
| `wind_stark` | Wind stark – kräftige Böen (Schleife, kommt bei starkem Wind/Böen dazu) |
| `sturm` | Sturm – starker, böiger Wind (Schleife; Wetter Sturm/Gewitter) |
| `schneesturm` | Schneesturm – heulender, kalter Wind (Schleife) |
| `tag` | Tag draußen – Vogelkulisse (Schleife, nur bei gutem Wetter, nicht in Schneezonen) |
| `nacht_wind` | Nacht – leises, unheimliches Pfeifen des Windes (Schleife) |

### Tiere

| Dateiname (ohne Endung) | Wann? |
|---|---|
| `hase_flucht` | Hase erschrickt und hoppelt davon |
| `vogel` | Vogelgezwitscher (tagsüber draußen, zufällig alle 8–25 s; nicht in Schneezonen) |
| `hase_tod` | Hase wird erlegt (ohne eigene Datei lautlos) |
| `hase_schreck` | Hase erschrickt – kurzes Fiepen (ohne eigene Datei lautlos) |
| `eule` | Eule ruft (nachts draußen, zufällig, fern) |
| `heulen` | Fernes Heulen (Wolf/Hund, nachts, selten) |

### Waffen & Kampf

| Dateiname (ohne Endung) | Wann? |
|---|---|
| `pistole` | Pistolenschuss |
| `schrotflinte` | Schrotflintenschuss |
| `automatikgewehr` | Automatikgewehr-Schuss (Platzhalter, Waffe kommt später) |
| `leer` | Klick: Magazin leer / nichts zu tun |
| `nachladen` | Nachladen |
| `nahkampf` | Schlag / Hieb in die Luft |
| `treffer_zombie` | Zombie wird getroffen |
| `treffer_spieler` | Spieler wird getroffen |
| `schaden_mann` | Eigene Figur (Mann) nimmt Schaden – Aufschrei |
| `schaden_frau` | Eigene Figur (Frau) nimmt Schaden – Aufschrei |
| `keuchen` | Keuchen, wenn die Ausdauer leer ist (Mann) |
| `keuchen_frau` | Keuchen, wenn die Ausdauer leer ist (Frau) |
| `spieler_tod` | Spieler stirbt (Mann) |
| `spieler_tod_frau` | Spieler stirbt (Frau) |
| `zittern` | Frierender Atem bei Unterkühlung (zusammen mit „zaehneklappern“) |
| `zaehneklappern` | Zähneklappern bei Unterkühlung |
| `husten` | Husten bei starker Kälte |

### Inventar & Items

| Dateiname (ohne Endung) | Wann? |
|---|---|
| `anziehen` | Kleidung an-/ausziehen |

### Zombies

| Dateiname (ohne Endung) | Wann? |
|---|---|
| `zombie_stoehnen` | Zombie ruhend / schlurfend (Stöhnen, zufällig in der Nähe) |
| `zombie_angriff` | Zombie jagt / greift an |
| `zombie_tod` | Zombie stirbt |
| `zombie_schrei` | Zombie entdeckt dich – Schrei/Brüllen (räumlich) |
| `spucke` | Spucker spuckt Säure (Gurgeln) |
| `spucke_trifft` | Säure klatscht auf den Boden |
| `zuendung` | Explosiv-Zombie zündet – Zischen der Lunte |

### Waffen & Kampf

| Dateiname (ohne Endung) | Wann? |
|---|---|
| `gewehr` | Schuss Jagdgewehr (laut, hallt) |
| `bogen` | Bogen – Pfeil schwirrt los (leise) |
| `armbrust` | Armbrust – Sehne schnellt (leise) |
| `schuss_leise` | Schuss mit Schalldämpfer |
| `nachladen_gewehr` | Gewehr nachladen (Repetieren) |
| `molotow` | Molotowcocktail zerspringt und entflammt |
| `brand` | Brennende Fläche (Molotow) – Fauchen |

### Bauen, Handwerk & Arbeit

| Dateiname (ohne Endung) | Wann? |
|---|---|
| `dosenalarm` | Dosenalarm klappert (Zombie an der Basis) |
| `grube` | Zombie fällt in die Fallgrube |

### Waffen & Kampf

| Dateiname (ohne Endung) | Wann? |
|---|---|
| `explosion` | Explosion (Explosiv-Zombie, später Granaten/Sprengfallen) |

### Zombies

| Dateiname (ohne Endung) | Wann? |
|---|---|
| `treffer_panzer` | Treffer auf einen gepanzerten Zombie (Metall) |
| `zombie_ferne` | Fernes Zombie-Stöhnen in der Nacht (Horror-Kulisse) |
| `tuer_schlag` | Zombie schlägt auf Tür |
| `tuer_bricht` | Tür bricht auf |

### Fahrzeuge

| Dateiname (ohne Endung) | Wann? |
|---|---|
| `motor` | Motor beim Fahren (Schleife, Tonhöhe folgt dem Tempo) |
| `autotuer` | Ein-/Aussteigen |
| `aufprall` | Auto kracht gegen Hindernis |
| `fahrzeug_schaden` | Auto nimmt Schaden |
| `fahrzeug_kaputt` | Auto geht kaputt (Explosion/Blech) |
| `ueberfahren` | Zombie/Tier wird überfahren (matschig) |

### Bauen, Handwerk & Arbeit

| Dateiname (ohne Endung) | Wann? |
|---|---|
| `hack_holz` | Axt trifft Baum (jeder Hieb) |
| `baum_faellt` | Baum fällt um (Holzfällen fertig) |
| `hack_stein` | Spitzhacke trifft Eisenerz |
| `stein_bricht` | Eisenerz ist abgebaut |
| `hack_felsen` | Spitzhacke trifft Fels/Stein |
| `felsen_bricht` | Fels/Stein ist abgebaut |
| `gebaut` | Bauwerk platziert |
| `werkeln` | Herstellen / Basteln / Reparieren |
| `graben` | Beet anlegen / Hacke / Rasen abtragen |
| `tuer_auf` | Tür öffnen |
| `tuer_zu` | Tür schließen |
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

### Inventar & Items

| Dateiname (ohne Endung) | Wann? |
|---|---|
| `aufheben` | Item aufheben (leises Rascheln) |
| `beute` | Beute / Kiste durchsucht |
| `essen` | Essen |
| `trinken` | Trinken |
| `magen_knurren` | Magenknurren bei großem Hunger (unter 20 %, zufällig) |
| `durst` | Trockenes Räuspern/Schlucken bei großem Durst (unter 20 %, zufällig) |
| `heilen` | Heilen (Verband/Medizin) |
| `taschenlampe` | Taschenlampe an/aus (L) |
| `inventar_auf` | Inventar öffnen (Tab) |
| `inventar_zu` | Inventar schließen |

### Oberfläche & Menüs

| Dateiname (ohne Endung) | Wann? |
|---|---|
| `ui_klick` | Klick auf einen Knopf (Login, Menüs, HUD) |
| `ui_fehler` | Geht hier nicht (z. B. Bauen an falscher Stelle) |
| `level_auf` | Level-Aufstieg |

Dauergeräusche (Wind, Regen, Nacht, Motor) sind Schleifen: Datei so schneiden, dass Ende und Anfang zusammenpassen –
am einfachsten in der **🎵 Audio-Zentrale** des Map-Editors (Loop mit Überblendung). Nicht hier: Musik (`client/musik/`).

**Am bequemsten:** Map-Editor lokal starten (`npm run editor:lokal`) → 🎵 Audio-Zentrale: anhören, ersetzen, kürzen, Lautstärke –
Dateien, `einstellungen.json` und Index landen dann automatisch hier.

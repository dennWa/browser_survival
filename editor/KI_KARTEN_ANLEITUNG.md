# Anleitung für KIs: Karten für „Browser Survival“ bauen

> Diese Datei wird **automatisch erzeugt** (`npm run ki:anleitung`) – nicht von Hand ändern. Schicke sie zusammen mit einem
> **Zonen-Export** aus dem Map-Editor (Menü KI → „Ausschnitt für KI“). Die KI antwortet mit EINEM JSON-Block, den man im
> Editor unter KI → „KI-Antwort einfügen“ einfügt (Vorschau + Rückgängig).

## 1. Worum es geht
Ein Zombie-Survival-Spiel im Browser (Low-Poly-3D, Kamera schräg von oben). Die Welt besteht aus **Zonen** (Karten), z. B.
Stadtrand oder Waldweg, verbunden über **Übergänge** am Rand. Spieler plündern Häuser (Loot in Räumen, Schränken, Kisten),
kämpfen gegen Zombies, fällen Bäume, bauen Basen. Deine Aufgabe: einen markierten **Bereich** einer Zone gestalten oder ändern.

## 2. So ist eine Karte aufgebaut
- **Raster:** jede Kachel = 1 × 1 m (im Spiel 32 px). Koordinaten in Kacheln: `x` nach rechts (Osten), `y` nach unten (Süden), (0,0) = oben links.
- **Boden** = ein Zeichen pro Kachel (siehe Katalog „Kacheln“). Wände `#`, Fenster `F` und Türen `T` sind ebenfalls Kacheln. Innenböden (`. : +`) machen eine Fläche zum **Innenraum** (bekommt im Spiel ein Dach).
- **Objekte** (Möbel, Bäume, Autos, Deko, 3D-Modelle): `{ typ, x, y, b, h, drehung, blockiert, ebene }` – `x/y` = linke obere Ecke, `b/h` = Fußabdruck in Kacheln, Bruchteile erlaubt (frei platziert, z. B. 12.35). `drehung` in Grad (0/90/180/270 oder frei). `ebene: "oben"` = Baumkrone (man läuft darunter), `"boden"` = flach (Teppich).
- **Bauwerke** (kartenfest, 1 Kachel): Zaun, Tor, Kiste, Bett, Werkbank, Lagerfeuer, Beet … (Katalog „Bauwerke“).
- **Marker:** `S` Spieler-Start, `Z` Zombie-Spawn (nur draußen; `horde: true` = nachts), `a–z` Loot-Punkt eines Raums (Raum = Buchstabe mit Name + Loot-Tabelle).
- **Loot:** Räume (`raeume.<buchstabe>.lootTabelle`) und Loot-Zonen (Rechteck mit Item-Chancen). Durchsuchbare Möbel (Katalog „Behälter“) haben eigenen Loot.
- **Übergänge** (Rechteck am Kartenrand → andere Zone) und **Ankünfte** (wo man aus einer Nachbarzone ankommt).
- **Gelände:** optionale Höhen je Kachel in Metern (`hoehen`); ein Sprung > 1 m zwischen Nachbarn = Klippe (unbegehbar).
- **Bemalung:** Bodenfarbe je Kachel (Tönung über der Textur). **Klänge:** Punkt- oder Flächen-Geräuschquellen. **Zonen-Werte:** Wetter, Zombie-Dichte, Hasen, Loot, Musik (Katalog „Zonen-Werte“).
- Im Export bedeutet `?` = außerhalb der Zone (noch keine Karte; darf gestaltet werden, die Zone wächst beim Einfügen).

## 3. Bauregeln (darauf achten)
- Nur im markierten Bereich ändern; geschützte Flächen (`geschuetzt`) nicht anfassen.
- Nur IDs/Zeichen aus dem Katalog unten verwenden (unbekannte werden abgelehnt).
- Häuser: geschlossene Wände (`#`/`F`), mindestens eine Tür `T`, Innenboden (`.` Fliesen, `:` Beton, `+` Holz) drinnen. Türen nicht zustellen (Kachel davor und dahinter frei).
- Möbel nicht in Wände stellen, Wege frei lassen (mind. 1 Kachel breit, besser 2). Blockierende Objekte nicht auf Türen, Übergänge oder Ankünfte.
- Zombie-Spawns nur draußen, nicht direkt am Spieler-Start. Loot passend zum Raum (Küche → `kueche`, Werkstatt → `werkstatt` …).
- Natürlich wirken: Wege aus `&` Erde, `%` Kies oder `^` Pflaster, Wiesen `0`, Waldboden `;` unter Bäumen; Bäume nicht im Raster, sondern locker verteilt (Bruchteil-Koordinaten).
- Abwechslung statt Kopien, aber nicht überladen: lieber wenige, gut platzierte Objekte.

## 4. So antwortest du (WICHTIG)
Antworte **nur mit EINEM ```json-Block** – eine Liste von Aktionen. Erste Aktion ist IMMER die `bereich`-Zeile aus dem Export (genau übernehmen).
Mögliche Aktionen:
- Antworte mit einer JSON-Liste von Aktionen (nur Koordinaten INNERHALB des Bereichs sind erlaubt). Beispiele:
- {"aktion":"setze","typ":"baum","x":23,"y":14}  – Objekt setzen (typ aus objektTypen; Größe/Kollision kommen aus dem Katalog, b/h/drehung/blockiert optional)
- {"aktion":"modell","modell":"wolf","x":23,"y":14,"hoehe":0.9,"drehung":90}  – 3D-Modell aus dem Spielordner (Liste spielordnerModelle im Kontext; "hoehe" = Zielhöhe in m, Fußabdruck skaliert mit; Mensch ≈ 1.8 m, Hund ≈ 0.6, Baum 4–8; "blockiert":false für Deko)
- {"aktion":"entferne","id":17}  oder  {"aktion":"entferne","typ":"stein","x":30,"y":12}  – Objekt entfernen
- {"aktion":"aendere","id":17,"x":24,"y":15,"drehung":90}  – Objekt verschieben/drehen/Eigenschaften ändern
- {"aktion":"kachel","x":20,"y":10,"zeichen":"="}  oder mit "b"/"h" für ein Rechteck – Boden setzen (Zeichen siehe legende)
- {"aktion":"linie","von":[20,10],"bis":[30,10],"zeichen":"#"}  – Kachel-Linie (z. B. Mauer)
- {"aktion":"marker","art":"zombie","x":25,"y":20}  (art: start | zombie | loot + "raum":"a"; zombie optional "anzahl","horde":true)
- {"aktion":"entferne","marker":"zombie","x":25,"y":20}  – Marker entfernen
- {"aktion":"bauwerk","typ":"zaun","x":21,"y":11}  – kartenfestes Bauwerk (zaun, zauntor, kiste, bett, werkbank, lagerfeuer, beet …)
- {"aktion":"raum","buchstabe":"d","name":"Scheune","lootTabelle":"werkstatt"}  – Raum für Loot-Punkte anlegen/ändern
- {"aktion":"aendere","id":17,"farbe":"#8b5a2b","textur":"holz"}  – Farbe/Muster EINES Objekts (muster: holz, stein, metall, stoff, gras, streifen, punkte)
- {"aktion":"typtextur","typ":"baum","farbe":"#3a6b35","muster":"gras"}  – Farbe/Muster für ALLE Objekte dieses Typs in der Zone (null = Standard)
- {"aktion":"bemale","x":20,"y":10,"b":6,"h":4,"farbe":"#7a6a4f"}  – Bodenfarbe (Bemalung) für ein Rechteck; "farbe":null entfernt sie
- {"aktion":"wert","pfad":"wetter.regenAnteil","wert":0.8}  – Zonen-Wert (wetter.*, zombie.*, tiere.*, loot.* wie im Inspektor, oder "musik"); "wert":null = Standard
- {"aktion":"lootzone","x":20,"y":10,"b":5,"h":4,"name":"Lager","modus":"chance","items":[{"id":"konserve","chance":30,"menge":[1,2]}],"punkte":4,"ort":"innen"}  – Loot-Zone (oder "tabelle":"lager" als Startliste)
- {"aktion":"name","ziel":"raum","buchstabe":"a","name":"Scheune"}  – Namen für zone | raum | objekt/uebergang/lootzone (mit "id")
- {"aktion":"bodenton","zeichen":",","farbe":"#e8eef2"}  – ALLE Kacheln dieses Zeichens in der Zone einfärben (Thema, z. B. Schnee); null = entfernen
- {"aktion":"prefab","name":"Wohnhaus","x":20,"y":10}  – Prefab einsetzen (linke obere Ecke); Namen siehe "prefabs" im Kontext
- Zombies nur draußen (nicht auf Innenböden . : +). Türen T nicht zustellen. Jede Aktion wird vor dem Übernehmen geprüft und als Vorschau gezeigt.

Vollständiges Mini-Beispiel (kleine Hütte mit Kiesweg im Bereich x 20–31, y 10–19):
```json
[
  {"aktion":"bereich","zone":"waldweg","x0":20,"x1":31,"y0":10,"y1":19,"pruefsumme":"<aus dem Export>"},
  {"aktion":"kachel","x":22,"y":11,"b":6,"h":5,"zeichen":"#"},
  {"aktion":"kachel","x":23,"y":12,"b":4,"h":3,"zeichen":"+"},
  {"aktion":"kachel","x":24,"y":15,"zeichen":"T"},
  {"aktion":"kachel","x":24,"y":16,"b":1,"h":4,"zeichen":"%"},
  {"aktion":"raum","buchstabe":"h","name":"Hütte","lootTabelle":"huette"},
  {"aktion":"marker","art":"loot","raum":"h","x":23,"y":12},
  {"aktion":"setze","typ":"tisch","x":25,"y":12.4},
  {"aktion":"bauwerk","typ":"kiste","x":26,"y":13},
  {"aktion":"setze","typ":"baum","x":29.3,"y":11.6},
  {"aktion":"marker","art":"zombie","x":30,"y":18}
]
```
Häufige Ablehnungen: unbekannte ID, Koordinate außerhalb des Bereichs, Kachel schon belegt, Zombie auf Innenboden, Tür zugestellt.

## 5. Katalog – was es alles gibt

### Kacheln (Boden, Wände)
| Zeichen | Name | Kategorie | Eigenschaft |
|---|---|---|---|
| `0` | Wiese | Böden | begehbar |
| `,` | Rasen | Böden | begehbar |
| `*` | Schnee | Böden | begehbar |
| `_` | Asphalt | Wege | begehbar |
| `=` | Straße | Wege | begehbar |
| `-` | Gehweg | Wege | begehbar |
| `.` | Fliesen (innen) | Böden | innen |
| `:` | Beton (innen) | Böden | innen |
| `+` | Holzboden (innen) | Böden | innen |
| `T` | Tür | Mauern | begehbar |
| `#` | Wand | Mauern | blockiert |
| `F` | Fenster | Mauern | blockiert |
| `$` | Rasen (gepflegt) | Böden | begehbar |
| `&` | Erdweg | Wege | begehbar |
| `%` | Kies | Wege | begehbar |
| `^` | Pflaster | Wege | begehbar |
| `;` | Waldboden | Böden | begehbar |
| `!` | Sand | Böden | begehbar |
| `~` | Wasser (See) | Umwelt | blockiert |

### Objekttypen (Aktion `setze`, Feld `typ`)
| typ | Name | Kategorie | b × h | Eigenschaft |
|---|---|---|---|---|
| `baum` | Baum (Holz) | Ressourcen | 3.5 × 3.5 | begehbar, ebene oben, abbaubar |
| `tanne` | Tanne mit Schnee (Holz) | Ressourcen | 3 × 3 | begehbar, ebene oben, abbaubar |
| `baum_herbst` | Herbstbaum (Holz) | Ressourcen | 3.5 × 3.5 | begehbar, ebene oben, abbaubar |
| `stein` | Stein | Ressourcen | 1 × 1 | blockiert, abbaubar |
| `eisenerz` | Eisenerz | Ressourcen | 1 × 1 | blockiert, abbaubar |
| `busch` | Busch | Umwelt | 1.5 × 1.5 | begehbar, ebene oben |
| `licht` | Lampe | Gebäude | 1 × 1 | begehbar, ebene licht |
| `werkbank` | Werkbank (Crafting) | Gebäude | 2 × 1 | blockiert |
| `bett` | Bett | Möbel | 2 × 4 | blockiert |
| `bett_orange` | Bett (orange) | Möbel | 1 × 2 | blockiert |
| `tisch` | Tisch | Möbel | 2 × 1 | blockiert |
| `tisch_rund` | Runder Tisch | Möbel | 1 × 1 | blockiert |
| `stuhl` | Stuhl | Möbel | 1 × 1 | begehbar |
| `sessel` | Sessel | Möbel | 1 × 1 | blockiert |
| `sessel_blau` | Sessel (blau) | Möbel | 1 × 1 | blockiert |
| `sofa` | Sofa | Möbel | 3 × 1 | blockiert |
| `sofa_dunkel` | Sofa (dunkel) | Möbel | 3 × 1 | blockiert |
| `kiste` | Kiste | Möbel | 1 × 1 | blockiert |
| `kiste_klein` | Kiste (klein) | Möbel | 1 × 1 | blockiert |
| `pflanze` | Topfpflanze | Möbel | 1 × 1 | blockiert |
| `kueche_theke` | Küchentheke | Möbel | 3 × 1 | blockiert |
| `kueche_herd` | Herd | Möbel | 1 × 1 | blockiert |
| `kueche_spuele` | Spüle | Möbel | 1 × 1 | blockiert |
| `kueche_kochfeld` | Kochfeld | Möbel | 1 × 1 | blockiert |
| `fass` | Fass | Möbel | 0.9 × 0.9 | blockiert |
| `truhe` | Truhe (durchsuchbar) | Möbel | 1 × 0.7 | blockiert, durchsuchbar |
| `holzkiste` | Holzkiste (durchsuchbar) | Möbel | 0.9 × 0.9 | blockiert, durchsuchbar |
| `werkzeugkiste` | Werkzeugkiste (durchsuchbar) | Möbel | 0.6 × 0.4 | blockiert, durchsuchbar |
| `kleiderschrank` | Kleiderschrank (durchsuchbar) | Möbel | 2 × 0.8 | blockiert, durchsuchbar |
| `kommode` | Kommode (durchsuchbar) | Möbel | 1.5 × 0.6 | blockiert, durchsuchbar |
| `kuechenschrank` | Küchenschrank (durchsuchbar) | Möbel | 0.9 × 0.7 | blockiert, durchsuchbar |
| `kuehlschrank` | Kühlschrank (durchsuchbar) | Möbel | 1.1 × 0.7 | blockiert, durchsuchbar |
| `pylone` | Pylone | Wege | 0.8 × 0.8 | begehbar |
| `markierung` | Fahrbahnmarkierung | Wege | 0.12 × 3.4 | begehbar, ebene boden |
| `teppich` | Teppich | Böden | 4 × 3 | begehbar, ebene boden |
| `teppich_gruen` | Teppich (grün) | Böden | 4 × 3 | begehbar, ebene boden |
| `blutfleck` | Blutfleck | Böden | 1.2 × 1.2 | begehbar, ebene boden |
| `blutlache` | Blutlache | Böden | 1.6 × 1.6 | begehbar, ebene boden |
| `oelfleck` | Ölfleck | Böden | 1.6 × 1.4 | begehbar, ebene boden |
| `auto_schwarz` | Auto (schwarz) | Fahrzeuge | 5.5 × 3 | blockiert |
| `auto_blau` | Auto (blau) | Fahrzeuge | 5.5 × 3 | blockiert |
| `auto_rot` | Auto (rot) | Fahrzeuge | 5.5 × 3 | blockiert |
| `auto_gruen` | Auto (gruen) | Fahrzeuge | 5.5 × 3 | blockiert |
| `auto_gelb` | Auto (gelb) | Fahrzeuge | 5.5 × 3 | blockiert |
| `transporter` | Transporter (transporter) | Fahrzeuge | 5.5 × 3 | blockiert |

### Bauwerke (Aktion `bauwerk`, 1 Kachel)
| typ | Name | Eigenschaft |
|---|---|---|
| `werkbank` | Werkbank | blockiert, ebene objekt |
| `lagerfeuer` | Lagerfeuer | blockiert, ebene objekt |
| `schmelzofen` | Schmelzofen | blockiert, ebene objekt |
| `falle` | Falle | begehbar, ebene objekt |
| `sprengfalle` | Sprengfalle | begehbar, ebene objekt |
| `stacheldraht` | Stacheldraht | begehbar, ebene objekt |
| `fallgrube` | Fallgrube | begehbar, ebene objekt |
| `dosenalarm` | Dosenalarm | begehbar, ebene objekt |
| `beet` | Beet | begehbar, ebene objekt |
| `holzboden` | Holzboden | begehbar, ebene boden |
| `holzwand` | Holzwand | blockiert, ebene wand |
| `holzwand_fenster` | Wand mit Fenster | blockiert, ebene wand |
| `holzwand_tuer` | Wand mit Türöffnung | begehbar, ebene wand |
| `holztuer` | Holztür | blockiert, ebene tuer |
| `holzdach` | Holzdach | begehbar, ebene dach |
| `zaun` | Zaun | blockiert, ebene wand |
| `zauntor` | Zauntor | blockiert, ebene wand |
| `kiste` | Lagerkiste | blockiert, ebene objekt |
| `vorratsschrank` | Vorratsschrank | blockiert, ebene objekt |
| `regentonne` | Regentonne | blockiert, ebene objekt |
| `brunnen` | Brunnen | blockiert, ebene objekt |
| `amboss` | Amboss | blockiert, ebene objekt |
| `webstuhl` | Webstuhl | blockiert, ebene objekt |
| `chemietisch` | Chemie-Tisch | blockiert, ebene objekt |
| `bett` | Bett | blockiert, ebene objekt |
| `doppelbett` | Doppelbett | blockiert, ebene objekt |
| `schlafsack` | Schlafsack | begehbar, ebene objekt |
| `gewaechshaus` | Gewächshaus-Beet | begehbar, ebene objekt |
| `huehnerstall` | Hühnerstall | blockiert, ebene objekt |
| `bienenstock` | Bienenstock | blockiert, ebene objekt |
| `sofa` | Sofa | blockiert, ebene objekt |
| `sessel` | Sessel | blockiert, ebene objekt |
| `stuhl` | Stuhl | blockiert, ebene objekt |
| `tisch` | Couchtisch | blockiert, ebene objekt |
| `esstisch` | Esstisch | blockiert, ebene objekt |
| `regal` | Bücherregal | blockiert, ebene objekt |
| `teppich` | Teppich | begehbar, ebene objekt |
| `bild` | Gemälde | begehbar, ebene objekt |
| `pflanze` | Zimmerpflanze | blockiert, ebene objekt |
| `vorhang` | Vorhang | begehbar, ebene objekt |
| `kerze` | Kerzen | begehbar, ebene objekt |
| `oellampe` | Öllampe | begehbar, ebene objekt |
| `stehlampe` | Stehlampe | blockiert, ebene objekt |
| `lichterkette` | Lichterkette | begehbar, ebene objekt |
| `kamin` | Kamin | blockiert, ebene objekt |
| `generator` | Generator | blockiert, ebene objekt |
| `radio` | Radio | begehbar, ebene objekt |
| `plattenspieler` | Plattenspieler | begehbar, ebene objekt |

### Durchsuchbare Behälter (Objekt-typ → Behälter mit eigenem Loot)
| typ | Behälter | Plätze | Loot-Tabelle |
|---|---|---|---|
| `truhe` |  |  |  |
| `holzkiste` |  |  |  |
| `werkzeugkiste` |  |  |  |
| `kleiderschrank` |  |  |  |
| `kommode` |  |  |  |
| `kuechenschrank` |  |  |  |
| `kuehlschrank` |  |  |  |

### Prefabs (Aktion `prefab`, fertige Gebäude/Flächen)
| name | Beschreibung | Größe |
|---|---|---|
| `Wohnhaus` | Haus mit Schlafzimmer, Küche, Wohnzimmer – Loot „wohnung“ | 11 × 9 |
| `Werkstatt` | Betonhalle mit Werkbank, Kisten, Fässern – Loot „werkstatt“ | 10 × 7 |
| `Hütte` | Kleine Holzhütte im Wald – Loot „huette“ | 6 × 5 |
| `Garten mit Zaun` | Rasenfläche mit Zaun, Tor, Beeten und Lagerfeuer (kartenfeste Bauwerke) | 8 × 6 |
| `Parkplatz` | Asphalt mit Markierungen und zwei Autos (fahrbar) | 10 × 7 |

### Loot-Tabellen (für Räume `lootTabelle` bzw. Loot-Zonen `tabelle`)
| Tabelle | typische Items |
|---|---|
| `apotheke` | verband, schmerzmittel, antibiotika, erste_hilfe_kasten, wasserflasche, schiene, aktivkohle |
| `op` | skalpell, verband, erste_hilfe_kasten, antibiotika, schiene |
| `labor` | schmerzmittel, wasserflasche, kaffee, skalpell, antibiotika, aktivkohle |
| `lager` | konservendose, wasserflasche, leere_flasche, marmelade, hammer, stoff, arbeitsweste, machete |
| `patientenzimmer` | apfel, milch, broetchen, stoff, schmerzmittel |
| `kantine` | konservendose, sandwich, kaese, broetchen, kuechenmesser, kaffee, milch |
| `sicherheit` | munition_9mm, pistole, munition_12, energydrink, schrotflinte |
| `eingangshalle` | energydrink, muesliriegel, wasserflasche |
| `notaufnahme` | verband, schmerzmittel, erste_hilfe_kasten, feuerwehrbeil |
| `zombie` | munition_9mm, munition_12, verband, muesliriegel, energydrink, pfeil, munition_gewehr, munition_357 |
| `boss` | pistole, schrotflinte, machete, feuerwehrbeil, hammer, munition_357, gewehr, armbrust |
| `verwaltung` | kaffee, muesliriegel, energydrink, munition_9mm |
| `kueche` | kuechenmesser, konservendose, kaese, milch, bratpfanne, hammer |
| `wohnung` | apfel, wasserflasche, stoff, broetchen, konservendose, milch, marmelade, rucksack_klein |
| `tankstelle` | energydrink, muesliriegel, benzin, wasserflasche, feuerzeug, sandwich, kaffee, rucksack_klein |
| `werkstatt` | hammer, wasserflasche, falle, brecheisen, arbeitsweste, benzin, handschuhe, feuerwehrbeil |
| `supermarkt` | konservendose, wasserflasche, broetchen, apfel, kaese, milch, marmelade, feuerzeug |
| `polizei` | munition_9mm, munition_357, verband, kaffee, revolver, schutzweste, pistole, rucksack_gross |
| `waffenkammer` | munition_9mm, munition_12, munition_357, pistole, schrotflinte, munition_gewehr, revolver, gewehr |
| `kiosk` | energydrink, muesliriegel, sandwich, wasserflasche, feuerzeug, alkohol, samen_tomate |
| `angler` | angel, konservendose, wasserflasche, kaffee, verband, feuerzeug, rucksack_klein |
| `huette` | konservendose, wasserflasche, stoff, feuerzeug, munition_gewehr, pfeil, winterjacke, thermohose |
| `schrank` | kapuzenpulli, jeans, stoff, muetze, turnschuhe, handschuhe, winterjacke, lederjacke |
| `kommode` | stoff, verband, muetze, handschuhe, schmerzmittel, feuerzeug, alkohol, munition_9mm |
| `kuehlschrank` | milch, kaese, wasserflasche, ei, apfel, verdorben, sandwich, energydrink |
| `vorratsregal` | konservendose, marmelade, muesliriegel, wasserflasche, brot, kaffee, leere_flasche, mehl |
| `holzkiste` | holz, bretter, schrott, konservendose, stoff, wasserflasche, hammer, munition_9mm |
| `werkzeugkiste` | schrott, hammer, eisenbarren, brecheisen, feuerzeug, lederhandschuhe, vorschlaghammer, schwarzpulver |
| `truhe` | munition_9mm, munition_12, doerrfleisch, munition_gewehr, erste_hilfe_kasten, eisenbarren, antibiotika, machete |

### Items (für Loot-Zonen `items[].id`)
| Kategorie | Items |
|---|---|
| nahrung | `konservendose` Konservendose, `marmelade` Glas Marmelade, `apfel` Äpfel, `broetchen` Brötchen, `kaese` Käse, `muesliriegel` Müsliriegel, `sandwich` Sandwich, `tomate` Tomate, `gurke` Gurke, `kartoffel` Kartoffel, `tomate_gebraten` Gebratene Tomate, `gurke_gebraten` Gebratene Gurke, `ofenkartoffel` Ofenkartoffel, `paprika` Paprika, `paprika_gebraten` Gebratene Paprika, `karotte` Karotte, `karotte_gebraten` Gebratene Karotte, `kuerbis` Kürbis, `kuerbis_gebraten` Ofenkürbis, `erdbeere` Erdbeeren, `ei` Ei, `spiegelei` Spiegelei, `honig` Honig, `fleisch` Hasenfleisch, `fleisch_gebraten` Hasenbraten, `fisch_barsch` Barsch, `fisch_forelle` Forelle, `fisch_hecht` Hecht, `fisch_barsch_gebraten` Gebratener Barsch, `fisch_forelle_gebraten` Gebratene Forelle, `fisch_hecht_gebraten` Gebratener Hecht, `verdorben` Verdorbenes Essen, `brot` Brot, `eintopf` Eintopf, `fischsuppe` Fischsuppe, `kuerbissuppe` Kürbissuppe, `pfannkuchen` Pfannkuchen, `doerrfleisch` Dörrfleisch, `raeucherfisch` Räucherfisch, `eingelegte_gurken` Eingelegte Gurken, `trockenobst` Trockenobst |
| getraenk | `wasserflasche` Wasserflasche, `energydrink` Energydrink, `milch` Milch, `kaffee` Kaffee, `leere_flasche` Leere Flasche, `wasser_dreckig` Dreckiges Wasser |
| medizin | `verband` Verband, `schmerzmittel` Schmerzmittel, `erste_hilfe_kasten` Erste-Hilfe-Kasten, `antibiotika` Antibiotika, `schiene` Schiene, `aktivkohle` Aktivkohle |
| nahkampf | `skalpell` Skalpell, `kuechenmesser` Küchenmesser, `hammer` Hammer, `machete` Machete, `feuerwehrbeil` Feuerwehrbeil, `baseballschlaeger` Baseballschläger, `brecheisen` Brecheisen, `speer` Speer, `axt` Axt, `spitzhacke` Spitzhacke, `hacke` Hacke, `vorschlaghammer` Vorschlaghammer, `katana` Katana, `bratpfanne` Bratpfanne, `golfschlaeger` Golfschläger, `kampfmesser` Kampfmesser |
| fernkampf | `pistole` Pistole (9 mm), `schrotflinte` Schrotflinte (Kal. 12), `gewehr` Jagdgewehr, `bogen` Bogen, `revolver` Revolver (.357), `mp` Maschinenpistole, `sturmgewehr` Sturmgewehr, `armbrust` Armbrust |
| munition | `munition_9mm` Munition 9 mm, `munition_12` Schrotpatronen Kal. 12, `munition_gewehr` Gewehrpatronen, `munition_357` Revolverpatronen .357, `pfeil` Pfeile, `bolzen` Armbrustbolzen |
| mod | `mod_zielfernrohr` Zielfernrohr, `mod_magazin` Erweitertes Magazin, `mod_schalldaempfer` Schalldämpfer |
| material | `holz` Holz, `stein` Stein, `eisenerz` Eisenerz, `eisenbarren` Eisenbarren, `verkohlt` Verkohltes Essen, `muell` Müll, `schrott` Schrott, `bretter` Bretter, `schwarzpulver` Schwarzpulver, `huhn` Huhn, `benzin` Benzinkanister, `alkohol` Hochprozentiges, `weizen` Weizen, `mehl` Mehl, `stoff` Stoff |
| rucksack | `rucksack_klein` Kleiner Rucksack, `rucksack` Rucksack, `rucksack_gross` Großer Rucksack |
| kleidung | `muetze` Wollmütze, `kapuzenpulli` Kapuzenpulli, `winterjacke` Winterjacke, `arbeitsweste` Arbeitsweste, `handschuhe` Handschuhe, `jeans` Jeans, `thermohose` Thermohose, `stiefel` Winterstiefel, `turnschuhe` Turnschuhe, `lederjacke` Lederjacke, `schutzweste` Schutzweste, `regenmantel` Regenmantel, `helm` Bauhelm, `motorradhelm` Motorradhelm, `kampfhose` Cargohose mit Polstern, `gummistiefel` Gummistiefel, `lederhandschuhe` Lederhandschuhe |
| bauwerk | `werkbank` Werkbank, `lagerfeuer` Lagerfeuer, `schmelzofen` Schmelzofen, `falle` Bärenfalle, `sprengfalle` Sprengfalle, `stacheldraht` Stacheldraht, `fallgrube` Fallgrube (Bausatz), `dosenalarm` Dosenalarm |
| wurf | `granate` Rohrbombe, `molotow` Molotowcocktail |
| werkzeug | `feuerzeug` Feuerzeug, `angel` Angel |
| samen | `samen_tomate` Tomatensamen, `samen_gurke` Gurkensamen, `samen_kartoffel` Saatkartoffeln, `samen_paprika` Paprikasamen, `samen_weizen` Weizenkörner, `samen_karotte` Karottensamen, `samen_kuerbis` Kürbiskerne, `samen_erdbeere` Erdbeersamen |

### Eigene 3D-Modelle (Aktion `modell`, Feld `modell` = Name ohne .glb; `hoehe` = Zielhöhe in m) – 464 Stück
| modell | Name | Kategorie | Standardhöhe m | Fußabdruck m |
|---|---|---|---|---|
| `arrow-sign` | Arrow Sign | bau | 2.05 | 1.9 × 0.4 |
| `barrier-single` | Barrier Single | bau | 0.63 | 1.9 × 0.7 |
| `brick-wall-2` | Brick Wall 2 | bau | 0.34 | 2.2 × 0.2 |
| `brick-wall` | Brick Wall | bau | 0.7 | 2.2 × 0.2 |
| `bricks` | Bricks | bau | 0.48 | 1.3 × 1.2 |
| `broken-window` | Broken Window | bau | 0.6 | 0.1 × 0.6 |
| `building-l` | Building L | bau | 8 | 7.8 × 7.8 |
| `building` | Building | bau | 6 | 2 × 2 |
| `bus-stop-sign` | Bus Stop Sign | bau | 2.5 | 4 × 0.9 |
| `bus-stop` | Bus Stop | bau | 2.8 | 38.3 × 24.8 |
| `cinder-block` | Cinder Block | bau | 0.23 | 0.5 × 0.2 |
| `cinder-blocks` | Cinder Blocks | bau | 0.85 | 1.7 × 1.9 |
| `container-green` | Container Green | bau | 2.6 | 5.7 × 2.6 |
| `container-red` | Container Red | bau | 2.6 | 5.7 × 2.6 |
| `corrugated-iron-sheet` | Corrugated Iron Sheet | bau | 1 | 0.1 × 2 |
| `crane` | Crane | bau | 14 | 1.6 × 21.1 |
| `cross-walk` | Cross Walk | bau | 0.1 | 8 × 8 |
| `dock` | Dock | bau | 0.57 | 0.7 × 0.7 |
| `door-double` | Door Double | bau | 2.2 | 3.5 × 0.4 |
| `dumpster` | Dumpster | bau | 2.03 | 2.4 × 1.3 |
| `fence-long` | Fence Long | bau | 1.05 | 2.7 × 0.6 |
| `fire-hydrant` | Fire Hydrant | bau | 0.77 | 0.5 × 0.4 |
| `floor-tile` | Floor Tile | bau | 0.25 | 2 × 2 |
| `fountain` | Fountain | bau | 1.6 | 4 × 4 |
| `gas-station` | Gas Station | bau | 5 | 8.7 × 8.3 |
| `house` | House | bau | 9.93 | 10.6 × 7.5 |
| `ladder` | Ladder | bau | 2.25 | 1.2 × 0.7 |
| `mailbox` | Mailbox | bau | 0.46 | 0.2 × 0.2 |
| `market-stalls-compact` | Market Stalls Compact | bau | 0.66 | 1.9 × 2 |
| `metal-bars` | Metal Bars | bau | 0.3 | 0.4 × 1.6 |
| `metal-fence` | Metal Fence | bau | 2.88 | 3.5 × 0.1 |
| `metal-scaffold` | Metal Scaffold | bau | 1.47 | 0.4 × 0.4 |
| `pipes` | Pipes | bau | 0.96 | 1 × 4.3 |
| `pipes4-b` | Pipes4 B | bau | 0.67 | 0.7 × 3.4 |
| `plastic-barrier` | Plastic Barrier | bau | 0.6 | 1 × 0.3 |
| `post` | Post | bau | 3.01 | 0.4 × 0.4 |
| `rock-path-round-small-2` | Rock Path Round Small 2 | bau | 0.1 | 1.1 × 1.4 |
| `rock-path-round-small-3` | Rock Path Round Small 3 | bau | 0.11 | 1.1 × 1.5 |
| `rock-path-round-small` | Rock Path Round Small | bau | 0.11 | 1.2 × 1.3 |
| `rock-path-round-thin` | Rock Path Round Thin | bau | 0.11 | 1.5 × 2.1 |
| `rock-path-round-wide` | Rock Path Round Wide | bau | 0.11 | 2.1 × 2.1 |
| `rock-path-square-smal-2` | Rock Path Square Smal 2 | bau | 0.15 | 1 × 1 |
| `rock-path-square-smal-3` | Rock Path Square Smal 3 | bau | 0.15 | 1 × 1 |
| `rock-path-square-smal` | Rock Path Square Smal | bau | 0.17 | 0.8 × 1.1 |
| `rock-path-square-thin` | Rock Path Square Thin | bau | 0.18 | 1.6 × 2 |
| `rock-path-square-wide` | Rock Path Square Wide | bau | 0.18 | 2.1 × 2 |
| `sandbox` | Sandbox | bau | 0.2 | 0.5 × 0.5 |
| `scaffolding` | Scaffolding | bau | 6 | 2.6 × 26.6 |
| `seasaw` | Seasaw | bau | 0.7 | 0.6 × 2.2 |
| `shrine` | Shrine | bau | 1.79 | 1.1 × 1.1 |
| `sign` | Sign | bau | 1.03 | 0.6 × 0.5 |
| `steampunk-pipes` | Steampunk Pipes | bau | 5.14 | 1.7 × 2.7 |
| `steel-beam` | Steel Beam | bau | 0.39 | 3.2 × 0.3 |
| `steel-cable-anchor-point` | Steel Cable Anchor Point | bau | 0.39 | 0.1 × 0.1 |
| `stone-wall` | Stone Wall | bau | 0.45 | 1.6 × 0.2 |
| `stop-sign` | Stop Sign | bau | 2.4 | 8 × 40 |
| `street-light-b` | Street Light B | bau | 5.65 | 0.4 × 2.1 |
| `street-light` | Street Light | bau | 6.64 | 0.4 × 2.9 |
| `street-straight-crack-2` | Street Straight Crack 2 | bau | 0.58 | 8 × 8 |
| `street-straight-crack` | Street Straight Crack | bau | 0.29 | 8 × 8 |
| `street-straight` | Street Straight | bau | 0.12 | 8 × 8 |
| `street-t` | Street T | bau | 0.1 | 8 × 8 |
| `street-turn` | Street Turn | bau | 0.12 | 8 × 8 |
| `tent` | Tent | bau | 2.2 | 14.6 × 24.9 |
| `town-sign` | Town Sign | bau | 5.35 | 6 × 1.7 |
| `traffic-barrier-2` | Traffic Barrier 2 | bau | 1.11 | 1.6 × 0.9 |
| `traffic-barrier` | Traffic Barrier | bau | 0.8 | 1.6 × 0.8 |
| `traffic-cone-2` | Traffic Cone 2 | bau | 0.74 | 0.6 × 0.6 |
| `traffic-cone` | Traffic Cone | bau | 0.67 | 0.5 × 0.5 |
| `traffic-light-b` | Traffic Light B | bau | 4.66 | 1.5 × 1.5 |
| `traffic-light` | Traffic Light | bau | 4.66 | 5.3 × 1.9 |
| `trash-container-open` | Trash Container Open | bau | 3.34 | 3.2 × 2.6 |
| `wall-doorway` | Wall Doorway | bau | 1.29 | 1 × 0.1 |
| `water-tower` | Water Tower | bau | 9 | 2.6 × 2.7 |
| `window` | Window | bau | 0.6 | 0.1 × 0.6 |
| `wood-base-1` | Wood Base 1 | bau | 2.05 | 2 × 2.2 |
| `wood-base-2` | Wood Base 2 | bau | 2.05 | 2.1 × 2.2 |
| `wood-base-3` | Wood Base 3 | bau | 2.05 | 2.1 × 2.2 |
| `wood-base-4` | Wood Base 4 | bau | 2.09 | 2 × 2.2 |
| `wood-base-5` | Wood Base 5 | bau | 2.82 | 2 × 2.2 |
| `wood-base-6` | Wood Base 6 | bau | 2.09 | 2 × 2.2 |
| `wood-doorway-1` | Wood Doorway 1 | bau | 2.03 | 2 × 0.2 |
| `wood-doorway-2` | Wood Doorway 2 | bau | 2.04 | 2 × 0.2 |
| `wood-fence-1` | Wood Fence 1 | bau | 2.04 | 2 × 0.2 |
| `wood-fence-2` | Wood Fence 2 | bau | 2.05 | 2 × 0.2 |
| `wood-fence-3` | Wood Fence 3 | bau | 2.03 | 2 × 0.3 |
| `wood-fence-4` | Wood Fence 4 | bau | 2.04 | 2 × 0.2 |
| `wood-fence-5` | Wood Fence 5 | bau | 2.03 | 2 × 0.2 |
| `wood-floor-1` | Wood Floor 1 | bau | 0.15 | 2 × 2 |
| `wood-floor-2` | Wood Floor 2 | bau | 0.16 | 2 × 2 |
| `wood-floor-3` | Wood Floor 3 | bau | 0.19 | 2 × 2 |
| `wood-floor-4` | Wood Floor 4 | bau | 0.15 | 2 × 2 |
| `wood-floor-5` | Wood Floor 5 | bau | 0.16 | 2 × 2 |
| `wood-planks` | Wood Planks | bau | 0.12 | 0.7 × 1.7 |
| `wood-stairs-1` | Wood Stairs 1 | bau | 2.05 | 2 × 2.2 |
| `wood-stairs-2` | Wood Stairs 2 | bau | 2.05 | 2 × 2.2 |
| `wood-tent-1` | Wood Tent 1 | bau | 1.13 | 1.8 × 2.1 |
| `wood-tent-2` | Wood Tent 2 | bau | 1.19 | 1.9 × 2.1 |
| `wood-window-1` | Wood Window 1 | bau | 2.05 | 2 × 0.2 |
| `wood-window-2` | Wood Window 2 | bau | 2.05 | 2 × 0.2 |
| `wood-window-3` | Wood Window 3 | bau | 2.05 | 2 × 0.2 |
| `wooden-fence` | Wooden Fence | bau | 1.03 | 1.8 × 0.9 |
| `wooden-sign` | Wooden Sign | bau | 1.98 | 1.1 × 0.3 |
| `wooden-wall` | Wooden Wall | bau | 0.53 | 1.4 × 0.1 |
| `americanfootball-ball` | Americanfootball Ball | deko | 0.42 | 0.2 × 0.2 |
| `banner-wall` | Banner Wall | deko | 2.85 | 1.6 × 0.6 |
| `basket-ball` | Basket Ball | deko | 0.42 | 0.4 × 0.4 |
| `blood-splat-2` | Blood Splat 2 | deko | 0.05 | 1.7 × 1.3 |
| `blood-splat` | Blood Splat | deko | 0.05 | 3.4 × 3.6 |
| `blood` | Blood | deko | 0.05 | 1.7 × 2.1 |
| `bone` | Bone | deko | 0.34 | 1 × 0.2 |
| `bonfire` | Bonfire | deko | 0.8 | 2.2 × 2 |
| `candle-melted` | Candle Melted | deko | 0.63 | 0.3 × 0.3 |
| `chalice` | Chalice | deko | 0.75 | 0.5 × 0.5 |
| `debris-papers-2` | Debris Papers 2 | deko | 0.05 | 1.2 × 1 |
| `debris-papers` | Debris Papers | deko | 0.05 | 0.6 × 0.7 |
| `debris-pile` | Debris Pile | deko | 0.16 | 2.1 × 2.6 |
| `eight-vases` | Eight Vases | deko | 0.5 | 11.5 × 9 |
| `fire-pit-1-2` | Fire Pit 1 2 | deko | 0.29 | 0.9 × 1 |
| `fire-pit-1` | Fire Pit 1 | deko | 0.38 | 1 × 1 |
| `fire-pit-3` | Fire Pit 3 | deko | 1.02 | 1.5 × 1 |
| `fish-bowl` | Fish Bowl | deko | 0.17 | 0.1 × 0.2 |
| `flag` | Flag | deko | 4.06 | 2.1 × 0.3 |
| `football` | Football | deko | 0.32 | 0.3 × 0.3 |
| `fox-statue` | Fox Statue | deko | 1 | 1.4 × 1.7 |
| `gem-blue` | Gem Blue | deko | 0.79 | 0.4 × 0.3 |
| `gem-green` | Gem Green | deko | 0.57 | 0.6 × 0.6 |
| `gem-pink` | Gem Pink | deko | 0.73 | 0.4 × 0.4 |
| `painting-canvas` | Painting Canvas | deko | 1.89 | 1 × 1.5 |
| `plant-2` | Plant 2 | deko | 0.25 | 1 × 1 |
| `plant` | Plant | deko | 1.01 | 1.3 × 1.4 |
| `planter--bushes` | Planter  Bushes | deko | 1.12 | 2.4 × 0.8 |
| `tennis-ball` | Tennis Ball | deko | 0.07 | 9.4 × 9.4 |
| `volleyball-ball` | Volleyball Ball | deko | 0.49 | 0.5 × 0.5 |
| `air-fryer` | Air Fryer | essen | 0.6 | 0.5 × 0.6 |
| `blender` | Blender | essen | 0.66 | 0.4 × 0.3 |
| `bottle-2` | Bottle 2 | essen | 0.3 | 0.3 × 0.3 |
| `bottle` | Bottle | essen | 0.3 | 0.5 × 0.5 |
| `bowl` | Bowl | essen | 0.12 | 0.2 × 0.2 |
| `burger` | Burger | essen | 0.12 | 1.7 × 1.7 |
| `can-broken` | Can Broken | essen | 0.15 | 0.5 × 0.5 |
| `can-red` | Can Red | essen | 0.15 | 0.5 × 0.5 |
| `can` | Can | essen | 0.15 | 0.5 × 0.5 |
| `coffee-cup` | Coffee Cup | essen | 0.22 | 0.3 × 0.3 |
| `coffee-machine` | Coffee Machine | essen | 0.92 | 0.7 × 0.9 |
| `crate-lettuce` | Crate Lettuce | essen | 1 | 2 × 2 |
| `crate-of-buns` | Crate Of Buns | essen | 0.8 | 2 × 2 |
| `crate-of-carrots` | Crate Of Carrots | essen | 0.94 | 2 × 2 |
| `crate-of-potatoes` | Crate Of Potatoes | essen | 0.97 | 2 × 2 |
| `crate-of-tomatoes` | Crate Of Tomatoes | essen | 0.92 | 2 × 2 |
| `crushed-soda-can` | Crushed Soda Can | essen | 0.07 | 0.1 × 0.1 |
| `donut` | Donut | essen | 0.29 | 0.9 × 0.9 |
| `fork` | Fork | essen | 0.05 | 0.1 × 0.3 |
| `fry-pan` | Fry Pan | essen | 0.17 | 0.7 × 1.3 |
| `glass-cup` | Glass Cup | essen | 0.19 | 0.1 × 0.1 |
| `ice-cream` | Ice Cream | essen | 0.2 | 0.5 × 0.5 |
| `milkjar` | Milkjar | essen | 0.49 | 0.3 × 0.4 |
| `pan` | Pan | essen | 0.34 | 1.7 × 2.8 |
| `pizza` | Pizza | essen | 0.16 | 3.4 × 3.4 |
| `plastic-cup` | Plastic Cup | essen | 0.24 | 0.1 × 0.1 |
| `plate` | Plate | essen | 0.05 | 0.5 × 0.5 |
| `pot-2` | Pot 2 | essen | 0.42 | 1.2 × 1.4 |
| `pot` | Pot | essen | 0.3 | 1.7 × 2 |
| `pot2` | Pot2 | essen | 0.33 | 0.8 × 0.5 |
| `sauce-pan` | Sauce Pan | essen | 0.22 | 0.3 × 0.7 |
| `soda-can` | Soda Can | essen | 0.12 | 6.1 × 6.1 |
| `soda` | Soda | essen | 0.3 | 0.9 × 0.9 |
| `spoon` | Spoon | essen | 0.05 | 0.1 × 0.3 |
| `tea-cup` | Tea Cup | essen | 0.11 | 0.2 × 0.2 |
| `toaster` | Toaster | essen | 0.27 | 0.4 × 0.2 |
| `water-bottle` | Water Bottle | essen | 0.3 | 0.5 × 0.5 |
| `boat` | Boat | fahrzeuge | 0.53 | 1.3 × 3.2 |
| `car-2` | Car 2 | fahrzeuge | 1.15 | 1.6 × 3.3 |
| `car` | Car | fahrzeuge | 1.18 | 1.8 × 4.2 |
| `dump-truck` | Dump Truck | fahrzeuge | 3.5 | 6 × 10.5 |
| `fire-truck` | Fire Truck | fahrzeuge | 3 | 1 × 0.4 |
| `forklift` | Forklift | fahrzeuge | 1.42 | 0.8 × 2.3 |
| `police-car` | Police Car | fahrzeuge | 1.24 | 1.8 × 3.7 |
| `raft-paddle` | Raft Paddle | fahrzeuge | 0.3 | 1.7 × 14.9 |
| `raft` | Raft | fahrzeuge | 0.5 | 12 × 23.6 |
| `sports-car-2` | Sports Car 2 | fahrzeuge | 1.2 | 1.9 × 3.9 |
| `sports-car` | Sports Car | fahrzeuge | 1.16 | 1.8 × 4 |
| `sushi-truck` | Sushi Truck | fahrzeuge | 3.2 | 5.1 × 8 |
| `suv` | Suv | fahrzeuge | 1.53 | 2.1 × 4.2 |
| `taxi` | Taxi | fahrzeuge | 1.31 | 1.8 × 4.2 |
| `tires` | Tires | fahrzeuge | 1.09 | 1.8 × 1.1 |
| `truck-tank` | Truck Tank | fahrzeuge | 3.5 | 10.9 × 4.4 |
| `wheel` | Wheel | fahrzeuge | 0.2 | 0.6 × 0.6 |
| `wheels-stack` | Wheels Stack | fahrzeuge | 0.61 | 0.7 × 0.6 |
| `angle-brush` | Angle Brush | gegenstaende | 0.31 | 0.1 × 0.1 |
| `axe-1` | Axe 1 | gegenstaende | 0.68 | 0.3 × 0.1 |
| `axe` | Axe | gegenstaende | 0.09 | 0.3 × 1.3 |
| `axe2` | Axe2 | gegenstaende | 0.9 | 1.3 × 0.2 |
| `backpack` | Backpack | gegenstaende | 0.5 | 3.3 × 1.7 |
| `bag-open` | Bag Open | gegenstaende | 0.1 | 0.2 × 0.2 |
| `bag` | Bag | gegenstaende | 0.06 | 0.2 × 0.1 |
| `barbell` | Barbell | gegenstaende | 0.66 | 3.2 × 0.7 |
| `barrel-1` | Barrel 1 | gegenstaende | 0.73 | 0.6 × 0.6 |
| `barrel` | Barrel | gegenstaende | 1.14 | 0.7 × 0.7 |
| `baseball-bat` | Baseball Bat | gegenstaende | 0.9 | 1.3 × 1.3 |
| `baseball-bat2` | Baseball Bat2 | gegenstaende | 0.9 | 0.1 × 1 |
| `bass-speakers` | Bass Speakers | gegenstaende | 0.98 | 0.4 × 0.3 |
| `bass` | Bass | gegenstaende | 1.55 | 0.4 × 0.1 |
| `battery-2` | Battery 2 | gegenstaende | 0.46 | 0.2 × 0.2 |
| `battery` | Battery | gegenstaende | 0.46 | 0.3 × 0.3 |
| `bear-trap` | Bear Trap | gegenstaende | 0.68 | 3 × 3.5 |
| `big-arm` | Big Arm | gegenstaende | 1.46 | 1.7 × 1.1 |
| `box-b` | Box B | gegenstaende | 0.18 | 0.2 × 0.2 |
| `box` | Box | gegenstaende | 0.6 | 3.4 × 2.2 |
| `boxing-gloves` | Boxing Gloves | gegenstaende | 0.33 | 0.4 × 0.3 |
| `cable-long` | Cable Long | gegenstaende | 2.51 | 0.3 × 0.1 |
| `cardboard-boxes-2` | Cardboard Boxes 2 | gegenstaende | 0.9 | 1.4 × 1 |
| `cardboard-boxes` | Cardboard Boxes | gegenstaende | 0.51 | 1 × 0.7 |
| `chest-2` | Chest 2 | gegenstaende | 0.41 | 0.9 × 0.5 |
| `chest` | Chest | gegenstaende | 0.41 | 0.6 × 0.5 |
| `colored-pencil` | Colored Pencil | gegenstaende | 0.22 | 0.1 × 0.1 |
| `compass` | Compass | gegenstaende | 0.81 | 0.9 × 0.7 |
| `crate-1` | Crate 1 | gegenstaende | 0.62 | 0.6 × 0.6 |
| `crate-2` | Crate 2 | gegenstaende | 0.64 | 0.6 × 0.6 |
| `crate-3` | Crate 3 | gegenstaende | 0.8 | 2 × 2 |
| `crate` | Crate | gegenstaende | 1 | 1 × 1 |
| `drum-set` | Drum Set | gegenstaende | 1.75 | 2.4 × 1.8 |
| `dry-erase-board` | Dry Erase Board | gegenstaende | 0.8 | 0.1 × 1.1 |
| `dumbell` | Dumbell | gegenstaende | 0.25 | 0.7 × 0.2 |
| `eraser` | Eraser | gegenstaende | 0.05 | 0.1 × 0.1 |
| `fan-brush` | Fan Brush | gegenstaende | 0.34 | 0.1 × 0.1 |
| `filbert-brush` | Filbert Brush | gegenstaende | 0.31 | 0.1 × 0.1 |
| `first-aid-kit-2` | First Aid Kit 2 | gegenstaende | 0.2 | 1.6 × 0.7 |
| `first-aid-kit` | First Aid Kit | gegenstaende | 0.2 | 1.9 × 0.7 |
| `flare-gun` | Flare Gun | gegenstaende | 0.2 | 2.5 × 0.6 |
| `flute` | Flute | gegenstaende | 0.05 | 0.1 × 0.6 |
| `gas-can` | Gas Can | gegenstaende | 0.4 | 1.9 × 0.6 |
| `glue` | Glue | gegenstaende | 0.19 | 0.1 × 0.1 |
| `guitar` | Guitar | gegenstaende | 1 | 0.7 × 1.8 |
| `guitar2` | Guitar2 | gegenstaende | 1.28 | 0.5 × 0.2 |
| `gymmat` | Gymmat | gegenstaende | 0.05 | 0.8 × 1.7 |
| `health` | Health | gegenstaende | 0.36 | 0.3 × 0.2 |
| `knife` | Knife | gegenstaende | 0.08 | 0.2 × 0.8 |
| `knife2` | Knife2 | gegenstaende | 0.3 | 0.3 × 0.1 |
| `knife3` | Knife3 | gegenstaende | 0.05 | 0.1 × 0.4 |
| `light-stand` | Light Stand | gegenstaende | 2.99 | 0.8 × 0.8 |
| `link-chain` | Link Chain | gegenstaende | 0.94 | 0.8 × 0.6 |
| `match-burnt` | Match Burnt | gegenstaende | 0.05 | 0.1 × 0.1 |
| `match` | Match | gegenstaende | 0.05 | 0.1 × 0.1 |
| `matchbox` | Matchbox | gegenstaende | 0.05 | 0.5 × 0.2 |
| `monitor` | Monitor | gegenstaende | 0.69 | 0.9 × 0.3 |
| `mouse` | Mouse | gegenstaende | 0.05 | 0.1 × 0.2 |
| `notebook` | Notebook | gegenstaende | 0.37 | 0.5 × 0.4 |
| `pallet-broken` | Pallet Broken | gegenstaende | 0.16 | 0.9 × 1.2 |
| `pallet` | Pallet | gegenstaende | 0.14 | 0.9 × 1.2 |
| `pencil` | Pencil | gegenstaende | 0.27 | 0.1 × 0.1 |
| `phone` | Phone | gegenstaende | 0.15 | 0.4 × 0.1 |
| `pickaxe-1` | Pickaxe 1 | gegenstaende | 0.65 | 0.6 × 0.1 |
| `pistol` | Pistol | gegenstaende | 0.34 | 0.1 × 1 |
| `propane-tank` | Propane Tank | gegenstaende | 1.2 | 2.2 × 2 |
| `protein-powder` | Protein Powder | gegenstaende | 0.27 | 0.2 × 0.2 |
| `punching-bag` | Punching Bag | gegenstaende | 1.82 | 0.6 × 0.6 |
| `radio` | Radio | gegenstaende | 0.3 | 1.7 × 0.6 |
| `rifle` | Rifle | gegenstaende | 0.52 | 0.1 × 1.6 |
| `round-brush` | Round Brush | gegenstaende | 0.33 | 0.1 × 0.1 |
| `scissors` | Scissors | gegenstaende | 0.24 | 0.1 × 0.1 |
| `shotgun` | Shotgun | gegenstaende | 0.34 | 0.1 × 1.1 |
| `shovel-b` | Shovel B | gegenstaende | 1.11 | 0.4 × 0.1 |
| `shovel` | Shovel | gegenstaende | 1.3 | 0.8 × 0.2 |
| `smg` | Smg | gegenstaende | 0.47 | 0.2 × 1 |
| `speakers` | Speakers | gegenstaende | 0.46 | 1 × 0.4 |
| `spear` | Spear | gegenstaende | 0.15 | 0.1 × 2 |
| `toolbox` | Toolbox | gegenstaende | 0.3 | 4.3 × 9.9 |
| `torch-1` | Torch 1 | gegenstaende | 0.63 | 0.1 × 0.1 |
| `torch` | Torch | gegenstaende | 2.51 | 0.7 × 0.7 |
| `trash-bag` | Trash Bag | gegenstaende | 0.56 | 0.5 × 0.5 |
| `trash-bags` | Trash Bags | gegenstaende | 0.53 | 0.9 × 0.5 |
| `tv` | Tv | gegenstaende | 0.7 | 2.2 × 0.1 |
| `wash-brush` | Wash Brush | gegenstaende | 0.36 | 0.1 × 0.1 |
| `wooden-bat-barbed` | Wooden Bat Barbed | gegenstaende | 0.19 | 0.2 × 1.2 |
| `wooden-bat-saw` | Wooden Bat Saw | gegenstaende | 0.21 | 0.4 × 1.4 |
| `wooden-pallet` | Wooden Pallet | gegenstaende | 1.12 | 6.1 × 7.2 |
| `wooden-torch` | Wooden Torch | gegenstaende | 2.69 | 0.5 × 0.4 |
| `bachelor-dresser` | Bachelor Dresser | moebel | 0.79 | 0.9 × 0.5 |
| `bed-single` | Bed Single | moebel | 0.75 | 2 × 3.9 |
| `bedside-lamp` | Bedside Lamp | moebel | 0.42 | 0.3 × 0.3 |
| `bench` | Bench | moebel | 0.5 | 0.7 × 0.2 |
| `bunk-bed` | Bunk Bed | moebel | 1.8 | 1.4 × 3.6 |
| `ceiling-lamp-2` | Ceiling Lamp 2 | moebel | 0.22 | 0.7 × 0.7 |
| `ceiling-lamp-3` | Ceiling Lamp 3 | moebel | 0.4 | 1.6 × 1.6 |
| `ceiling-lamp-4` | Ceiling Lamp 4 | moebel | 0.4 | 1.7 × 1.1 |
| `ceiling-lamp-5` | Ceiling Lamp 5 | moebel | 0.4 | 0.6 × 0.6 |
| `ceiling-lamp` | Ceiling Lamp | moebel | 0.32 | 0.6 × 0.6 |
| `chair` | Chair | moebel | 0.95 | 0.8 × 0.8 |
| `closet` | Closet | moebel | 2.1 | 1.6 × 0.9 |
| `club-arm-chair` | Club Arm Chair | moebel | 1.1 | 1.1 × 0.9 |
| `computer-desk` | Computer Desk | moebel | 0.74 | 1.8 × 1 |
| `cube-cabinet` | Cube Cabinet | moebel | 1.79 | 0.9 × 0.7 |
| `damaged-couch` | Damaged Couch | moebel | 1.24 | 3 × 1.2 |
| `desk-lamp` | Desk Lamp | moebel | 0.48 | 0.6 × 0.2 |
| `desk` | Desk | moebel | 0.75 | 0.7 × 0.4 |
| `dish-washer` | Dish Washer | moebel | 0.91 | 0.6 × 0.7 |
| `double-bed` | Double Bed | moebel | 1.21 | 2 × 2.4 |
| `double-door-base-cabinet` | Double Door Base Cabinet | moebel | 0.91 | 1 × 0.6 |
| `double-door-tall-cabinet` | Double Door Tall Cabinet | moebel | 1.79 | 0.9 × 0.7 |
| `double-door-upper-cabin` | Double Door Upper Cabin | moebel | 0.78 | 1 × 0.4 |
| `drawer` | Drawer | moebel | 1.33 | 2.8 × 1.2 |
| `drawers-base-cabinet` | Drawers Base Cabinet | moebel | 0.91 | 0.5 × 0.6 |
| `drawers-double-door-bas` | Drawers Double Door Bas | moebel | 0.91 | 1 × 0.6 |
| `executive-chair` | Executive Chair | moebel | 1.24 | 0.7 × 0.8 |
| `executive-desk` | Executive Desk | moebel | 0.87 | 2 × 1.1 |
| `fireplace` | Fireplace | moebel | 1.5 | 1.9 × 0.7 |
| `floating-shelf` | Floating Shelf | moebel | 0.05 | 1.4 × 0.4 |
| `floor-lamp` | Floor Lamp | moebel | 2.15 | 0.5 × 0.5 |
| `fridge-2` | Fridge 2 | moebel | 2.22 | 1.8 × 0.8 |
| `fridge-3` | Fridge 3 | moebel | 2.15 | 1.3 × 0.8 |
| `fridge` | Fridge | moebel | 2.15 | 1.1 × 0.7 |
| `garden-bench` | Garden Bench | moebel | 0.49 | 0.9 × 0.5 |
| `gas-stove` | Gas Stove | moebel | 0.94 | 0.7 × 0.9 |
| `kenney-badschrank` | Kenney Badschrank | moebel | 0.9 | 0.2 × 0.1 |
| `kenney-bildschirm` | Kenney Bildschirm | moebel | 0.45 | 0.4 × 0.1 |
| `kenney-buerostuhl` | Kenney Buerostuhl | moebel | 1 | 0.3 × 0.3 |
| `kenney-dusche` | Kenney Dusche | moebel | 2.1 | 0.6 × 0.6 |
| `kenney-garderobe` | Kenney Garderobe | moebel | 1.8 | 0.3 × 0.3 |
| `kenney-laptop` | Kenney Laptop | moebel | 0.25 | 0.3 × 0.2 |
| `kenney-muelleimer` | Kenney Muelleimer | moebel | 0.6 | 0.2 × 0.2 |
| `kenney-nachttisch` | Kenney Nachttisch | moebel | 0.6 | 0.5 × 0.2 |
| `kenney-spiegel` | Kenney Spiegel | moebel | 0.7 | 0.3 × 0.1 |
| `kenney-toilette` | Kenney Toilette | moebel | 0.8 | 0.3 × 0.5 |
| `kenney-waschbecken` | Kenney Waschbecken | moebel | 0.95 | 0.3 × 0.3 |
| `kenney-waschmaschine` | Kenney Waschmaschine | moebel | 0.9 | 0.4 × 0.4 |
| `kitchen-stool` | Kitchen Stool | moebel | 0.82 | 0.4 × 0.5 |
| `l-shaped-desk` | L Shaped Desk | moebel | 0.86 | 2.5 × 3 |
| `large-book-shelf` | Large Book Shelf | moebel | 2.44 | 3.9 × 0.5 |
| `large-wardrobe` | Large Wardrobe | moebel | 2.1 | 2.5 × 0.7 |
| `lingerie-dresser` | Lingerie Dresser | moebel | 1.4 | 0.5 × 0.4 |
| `medium-book-shelf` | Medium Book Shelf | moebel | 2.36 | 2.8 × 0.4 |
| `medium-wardrobe` | Medium Wardrobe | moebel | 2.22 | 2 × 0.8 |
| `minimalist-modern-chair` | Minimalist Modern Chair | moebel | 1.22 | 0.8 × 0.9 |
| `mirror` | Mirror | moebel | 1.73 | 0.8 × 0.6 |
| `modern-kitchen-table` | Modern Kitchen Table | moebel | 0.98 | 2.1 × 1.2 |
| `open-base-cabinet` | Open Base Cabinet | moebel | 0.91 | 0.5 × 0.6 |
| `ottoman-coffe-table` | Ottoman Coffe Table | moebel | 0.46 | 1.6 × 1.4 |
| `oven-solo` | Oven Solo | moebel | 0.41 | 0.8 × 0.5 |
| `park-bench` | Park Bench | moebel | 0.68 | 1.3 × 1 |
| `rounded-coffee-table` | Rounded Coffee Table | moebel | 0.58 | 1.6 × 1.6 |
| `single-bed` | Single Bed | moebel | 1 | 1.4 × 2.7 |
| `single-door-base-cabinet-2` | Single Door Base Cabinet 2 | moebel | 0.91 | 0.5 × 0.7 |
| `single-door-base-cabinet` | Single Door Base Cabinet | moebel | 0.91 | 0.5 × 0.6 |
| `single-door-tall-cabine` | Single Door Tall Cabine | moebel | 1.79 | 0.5 × 0.8 |
| `single-door-upper-cabinet` | Single Door Upper Cabinet | moebel | 0.78 | 0.5 × 0.4 |
| `sink-kitchen-cabinet` | Sink Kitchen Cabinet | moebel | 1.26 | 1 × 0.6 |
| `small-bookshelf` | Small Bookshelf | moebel | 2.1 | 1.3 × 0.3 |
| `small-wardrobe` | Small Wardrobe | moebel | 2.19 | 1.3 × 0.6 |
| `sofa-small` | Sofa Small | moebel | 1.32 | 2 × 1.5 |
| `sofa` | Sofa | moebel | 1.32 | 3.3 × 1.5 |
| `standing-desk` | Standing Desk | moebel | 0.94 | 1.5 × 0.8 |
| `steel-sink-kitchen-cabinet` | Steel Sink Kitchen Cabinet | moebel | 1.27 | 1 × 0.6 |
| `table-1` | Table 1 | moebel | 0.62 | 0.9 × 0.9 |
| `table-2` | Table 2 | moebel | 0.64 | 0.9 × 0.9 |
| `table-7qaygzneryt` | Table 7qaygzneryt | moebel | 0.78 | 1.7 × 1 |
| `table-big` | Table Big | moebel | 0.85 | 1.6 × 3.3 |
| `table-lamp` | Table Lamp | moebel | 0.46 | 0.3 × 0.3 |
| `table` | Table | moebel | 0.75 | 11.7 × 19.8 |
| `three-seater-couch` | Three Seater Couch | moebel | 1.1 | 2.6 × 1.2 |
| `two-seater-couch` | Two Seater Couch | moebel | 1.18 | 2 × 1 |
| `vanity` | Vanity | moebel | 1 | 0.6 × 0.9 |
| `vending-machine` | Vending Machine | moebel | 1.85 | 1.3 × 1.1 |
| `wall-shelf` | Wall Shelf | moebel | 0.46 | 0.8 × 2.3 |
| `wide-dresser` | Wide Dresser | moebel | 0.9 | 1.5 × 0.6 |
| `wood-kitchen-chair` | Wood Kitchen Chair | moebel | 0.5 | 2.3 × 0.6 |
| `wood-kitchen-table` | Wood Kitchen Table | moebel | 0.89 | 2.4 × 1.3 |
| `wooden-arm-chair` | Wooden Arm Chair | moebel | 1.1 | 1.2 × 1.2 |
| `wooden-chair` | Wooden Chair | moebel | 1.04 | 0.5 × 0.5 |
| `wooden-kitchen-sink` | Wooden Kitchen Sink | moebel | 1.26 | 1 × 0.6 |
| `wool-carpet` | Wool Carpet | moebel | 0.05 | 3.3 × 2.1 |
| `bush-with-flowers` | Bush With Flowers | natur | 1.58 | 1.9 × 2 |
| `bush` | Bush | natur | 1.58 | 1.9 × 2 |
| `clover-2` | Clover 2 | natur | 0.3 | 0.9 × 0.8 |
| `clover` | Clover | natur | 0.3 | 0.8 × 0.8 |
| `dead-tree-2` | Dead Tree 2 | natur | 7 | 8.4 × 8.4 |
| `dead-tree-3` | Dead Tree 3 | natur | 7 | 6.7 × 6.4 |
| `dead-tree-4` | Dead Tree 4 | natur | 7 | 6.1 × 5.7 |
| `dead-tree-5` | Dead Tree 5 | natur | 7 | 8 × 7.7 |
| `dead-tree` | Dead Tree | natur | 7 | 6.4 × 6.4 |
| `fern` | Fern | natur | 0.9 | 9 × 8.5 |
| `flower-group-2` | Flower Group 2 | natur | 0.6 | 1.5 × 1.6 |
| `flower-group` | Flower Group | natur | 0.6 | 1.8 × 1.4 |
| `flower-petal-2` | Flower Petal 2 | natur | 0.19 | 0.6 × 0.6 |
| `flower-petal-3` | Flower Petal 3 | natur | 0.24 | 0.5 × 0.5 |
| `flower-petal-4` | Flower Petal 4 | natur | 0.25 | 0.3 × 0.2 |
| `flower-petal-5` | Flower Petal 5 | natur | 0.29 | 0.8 × 0.8 |
| `flower-petal` | Flower Petal | natur | 0.24 | 0.7 × 0.6 |
| `flower-single-2` | Flower Single 2 | natur | 0.5 | 1.1 × 0.8 |
| `flower-single` | Flower Single | natur | 0.5 | 0.9 × 0.9 |
| `grass-wispy-2` | Grass Wispy 2 | natur | 1.07 | 1.3 × 1.2 |
| `grass-wispy` | Grass Wispy | natur | 1.67 | 1.5 × 1.6 |
| `grass` | Grass | natur | 0.5 | 0.6 × 0.7 |
| `hedge` | Hedge | natur | 1.63 | 1.8 × 1.2 |
| `mushroom-laetiporus` | Mushroom Laetiporus | natur | 0.77 | 1.4 × 1.1 |
| `mushroom` | Mushroom | natur | 0.46 | 0.6 × 0.8 |
| `pebble-round-2` | Pebble Round 2 | natur | 0.1 | 0.5 × 0.4 |
| `pebble-round-3` | Pebble Round 3 | natur | 0.1 | 0.4 × 0.5 |
| `pebble-round-4` | Pebble Round 4 | natur | 0.09 | 0.4 × 0.4 |
| `pebble-round-5` | Pebble Round 5 | natur | 0.1 | 0.4 × 0.3 |
| `pebble-round` | Pebble Round | natur | 0.1 | 0.4 × 0.5 |
| `pebble-square-2` | Pebble Square 2 | natur | 0.16 | 0.4 × 0.3 |
| `pebble-square-3` | Pebble Square 3 | natur | 0.13 | 0.4 × 0.4 |
| `pebble-square-4` | Pebble Square 4 | natur | 0.14 | 0.5 × 0.3 |
| `pebble-square-5` | Pebble Square 5 | natur | 0.14 | 0.4 × 0.3 |
| `pebble-square-6` | Pebble Square 6 | natur | 0.15 | 0.4 × 0.5 |
| `pebble-square` | Pebble Square | natur | 0.17 | 0.3 × 0.3 |
| `pine-2` | Pine 2 | natur | 7.39 | 3.6 × 4 |
| `pine-3` | Pine 3 | natur | 10.24 | 5.8 × 5.4 |
| `pine-4` | Pine 4 | natur | 7.32 | 4.9 × 4.5 |
| `pine-b` | Pine B | natur | 8.72 | 6.4 × 6.2 |
| `pine` | Pine | natur | 7.38 | 5.7 × 5.2 |
| `plant-big-2` | Plant Big 2 | natur | 1.5 | 2.9 × 3.1 |
| `plant-big` | Plant Big | natur | 0.25 | 1.3 × 1.4 |
| `rock-medium-2` | Rock Medium 2 | natur | 2.32 | 3.4 × 3.5 |
| `rock-medium-3` | Rock Medium 3 | natur | 2.26 | 3.2 × 3 |
| `rock-medium` | Rock Medium | natur | 1.9 | 3 × 2.5 |
| `tall-grass` | Tall Grass | natur | 1.87 | 0.9 × 1 |
| `tanne_schnee` | Tanne_schnee | natur | 0.75 | 0.4 × 0.4 |
| `tree-2` | Tree 2 | natur | 7.64 | 4.5 × 4.3 |
| `tree-3` | Tree 3 | natur | 7.26 | 4.3 × 4.6 |
| `tree-4` | Tree 4 | natur | 7.01 | 3.7 × 4.2 |
| `tree-5` | Tree 5 | natur | 9.44 | 3.8 × 3.8 |
| `tree` | Tree | natur | 9.43 | 4.1 × 4.2 |
| `trees` | Trees | natur | 6.87 | 24.9 × 3 |
| `twisted-tree-2` | Twisted Tree 2 | natur | 8 | 10.4 × 11.3 |
| `twisted-tree-3` | Twisted Tree 3 | natur | 8 | 11.4 × 11.5 |
| `twisted-tree-4` | Twisted Tree 4 | natur | 8 | 9.5 × 9.4 |
| `twisted-tree-5` | Twisted Tree 5 | natur | 8 | 10.6 × 9.2 |
| `twisted-tree` | Twisted Tree | natur | 8 | 13.5 × 11.5 |
| `wood-log` | Wood Log | natur | 0.45 | 4.6 × 4.6 |
| `alpaca` | Alpaca | tiere | 1.7 | 1.3 × 4.3 |
| `apatosaurus` | Apatosaurus | tiere | 8 | 5.7 × 40 |
| `bird` | Bird | tiere | 0.3 | 0.8 × 0.6 |
| `bull` | Bull | tiere | 1.6 | 2.7 × 8.1 |
| `cat` | Cat | tiere | 0.35 | 17.5 × 40 |
| `characters-matt` | Characters Matt | tiere | 1.4 | 1.1 × 0.9 |
| `characters-pug` | Characters Pug | tiere | 0.75 | 0.4 × 1.1 |
| `characters-sam` | Characters Sam | tiere | 1.43 | 1.1 × 1.2 |
| `characters-shaun` | Characters Shaun | tiere | 1.43 | 1.2 × 1.3 |
| `chicken` | Chicken | tiere | 0.45 | 40 × 40 |
| `cow` | Cow | tiere | 1.5 | 2.3 × 8.1 |
| `deer` | Deer | tiere | 1.4 | 1.4 × 4.4 |
| `donkey` | Donkey | tiere | 1.3 | 1.2 × 4.7 |
| `duck` | Duck | tiere | 0.4 | 10.8 × 5.9 |
| `fox` | Fox | tiere | 0.5 | 1.1 × 5.6 |
| `german-shepard` | German Shepard | tiere | 0.65 | 0.5 × 1.5 |
| `horse` | Horse | tiere | 1.7 | 1.4 × 5.7 |
| `husky` | Husky | tiere | 0.6 | 1 × 3.9 |
| `lis` | Lis | tiere | 0.5 | 1.1 × 1.4 |
| `lowpoly-squirrel` | Lowpoly Squirrel | tiere | 0.3 | 0.8 × 0.8 |
| `parasaurolophus` | Parasaurolophus | tiere | 5 | 2 × 11.8 |
| `penguin` | Penguin | tiere | 0.7 | 5.2 × 4.4 |
| `shiba-inu` | Shiba Inu | tiere | 0.4 | 1.1 × 4.2 |
| `stag` | Stag | tiere | 1.6 | 2.6 × 4.8 |
| `stegosaurus` | Stegosaurus | tiere | 4 | 5.1 × 22.9 |
| `t-rex` | T Rex | tiere | 5 | 8 × 30.9 |
| `triceratops` | Triceratops | tiere | 3 | 5.8 × 21 |
| `velociraptor` | Velociraptor | tiere | 1.6 | 2.6 × 12.7 |
| `white-horse` | White Horse | tiere | 1.7 | 1.4 × 5.7 |
| `wolf` | Wolf | tiere | 0.9 | 1.1 × 5.3 |
| `zombie-2` | Zombie 2 | tiere | 1.19 | 1.3 × 0.7 |
| `zombie-half` | Zombie Half | tiere | 0.93 | 0.5 × 0.4 |
| `zombie` | Zombie | tiere | 1.52 | 1.6 × 0.8 |

### Sounds im Spiel (Info: was es schon gibt – Karten-Klänge setzt man im Editor)
| Gruppe | Ereignisse |
|---|---|
| Atmosphäre & Wetter | wind, regen, nacht, schritt_schnee, schritt_gras, donner, donner_nah, regen_stark, wind_leicht, wind_stark, regen_dach, kamin, sturm, schneesturm, tag, nacht_wind |
| Tiere | schnurren, summen, hase_flucht, vogel, hase_tod, hase_schreck, eule, heulen, bellen, miau, gackern |
| Bauen, Handwerk & Arbeit | generator, dosenalarm, grube, hack_holz, baum_faellt, hack_stein, stein_bricht, hack_felsen, felsen_bricht, gebaut, werkeln, graben, tuer_auf, tuer_zu, feuer_an, feuer_aus, knistern, holz_nachlegen, brutzel, brutzeln, fertig, verbrannt, angel_wurf, angel_biss, gefangen, falle_auf, falle_zu |
| Waffen & Kampf | pistole, schrotflinte, automatikgewehr, revolver, mp, sturmgewehr, leer, nachladen, nahkampf, treffer_zombie, treffer_spieler, schaden_mann, schaden_frau, keuchen, keuchen_frau, spieler_tod, spieler_tod_frau, zittern, zaehneklappern, husten, gewehr, bogen, armbrust, schuss_leise, nachladen_gewehr, molotow, brand, explosion |
| Inventar & Items | anziehen, aufheben, beute, essen, trinken, magen_knurren, durst, heilen, taschenlampe, inventar_auf, inventar_zu |
| Zombies | zombie_stoehnen, zombie_angriff, zombie_tod, zombie_schrei, spucke, spucke_trifft, zuendung, treffer_panzer, zombie_ferne, tuer_schlag, tuer_bricht |
| Fahrzeuge | motor, autotuer, aufprall, fahrzeug_schaden, fahrzeug_kaputt, ueberfahren |
| Oberfläche & Menüs | ui_klick, ui_fehler, level_auf |

### Musik-Ordner (Zonen-Wert `musik`)
| Ordner | Stücke |
|---|---|
| `alle` | 0 |
| `hauptmenue` | 1 |
| `radio` | 3 |
| `stadtrand` | 0 |
| `waldweg` | 0 |

### Zonen-Werte (Aktion `wert`, `pfad` = gruppe.name)
| pfad | Bedeutung | Bereich | Hinweis |
|---|---|---|---|
| `wetter.aktiv` | Wetter an | true/false |  |
| `wetter.regenAnteil` | Regen-Anteil | 0–1 | Rest = Nebel/Sturm |
| `wetter.gewitterAnteil` | Gewitter-Anteil | 0–1 | vom Regen: Gewitter (Schneezone: Schneesturm) |
| `wetter.sturmAnteil` | Sturm-Anteil | 0–1 | vom Rest: Sturm statt Nebel |
| `wetter.dauerMin` | Dauer min | 10–3600 s |  |
| `wetter.dauerMax` | Dauer max | 10–3600 s |  |
| `wetter.pauseMin` | Pause min | 10–7200 s | kürzer = häufiger Regen/Nebel |
| `wetter.pauseMax` | Pause max | 10–7200 s |  |
| `zombie.dichte` | Dichte | 0–5 | Faktor Zombies je Spawnpunkt |
| `zombie.respawnZeit` | Respawn | 5–3600 s |  |
| `zombie.nachtHorde` | Nacht-Horde | 0–60 | Zombies, die nachts zusätzlich kommen |
| `zombie.nachtTempoFaktor` | Nacht-Tempo | 0.5–3 | Faktor Jagdtempo nachts |
| `tiere.hasenProTausend` | Hasen je 1000 Gras | 0–50 | nur ohne Hasen-Bereiche |
| `tiere.hasenMax` | Hasen max | 0–200 |  |
| `tiere.hasenRespawn` | Respawn | 5–3600 s |  |
| `loot.spawnChance` | Loot-Chance | 0–1 | liegt an einem Loot-Punkt etwas? |
| `loot.respawnZeit` | Nachschub | 5–7200 s | bis geplünderte Punkte neu gewürfelt werden |

_Kachel-Zeichen gesamt: `0` `,` `*` `_` `=` `-` `.` `:` `+` `T` `#` `F` `$` `&` `%` `^` `;` `!` `~`_


# „Wo ändere ich …?“

> Schnellnachschlag: Wunsch → Datei(en).

## 4. "Wo ändere ich …?" (Schnellnachschlag)

| Wunsch | Datei(en) |
|---|---|
| **Studio (Desktop-Editor)**: Werkzeug / Bau-Aktion / KI-Werkzeug | `studio/ansicht/werkzeuge.js` · `studio/kern/aktionen.js` · `studio/kern/kiWerkzeuge.js` + `kiAusfuehren.js` (Anleitung `studio/LIESMICH.md`) |
| **Items / Loot-Tabellen / Rezepte ohne Code** | Studio → Datei → Items, Loot & Rezepte (`Strg+I`) → `server/spiel/konfiguration/studioDaten.js` (überlagert gegenstaende/lootTabellen/rezepte) |
| Zombie-Bereiche (Mischung, Tageszeit, Patrouille) | Regeln `server/spiel/karten/zombieBereiche.js`, Lader → `zombieSpawns`, Spawnen `spielWelt.spawneZombie`, Route `zombieSystem.schlurfe` |
| Item-Spawnpunkte (Chance, Intervall, Höhe) | Regeln `server/spiel/karten/spawnpunkte.js`, Spawnen `server/spiel/systeme/lootSystem.js` (`punkt.spawnPunkt`) |
| Zombie-Verhalten (Aggro, Verfolgen, Angriff, Umherschlurfen) | `server/spiel/systeme/zombieSystem.js` (+ Werte in `spielKonfiguration.js` → `zombie`) |
| **Crafting-Rezepte** | `server/spiel/konfiguration/rezepte.js` (Anleitung steht oben in der Datei) |
| **Werte ingame ändern** | Admin-Menü → 🛠 Developer; weitere Werte freischalten: `server/spiel/konfiguration/entwicklerFelder.js` |
| Startausrüstung | `spielKonfiguration.js` → `spieler.startInventar` |
| Abbau (Menge, Dauer, Nachwachsen) / was abbaubar ist | `spielKonfiguration.js` → `ressourcen`; Objekt→Ressource/Werkzeug: `gemeinsam/welt/ressourcen.js` |
| Schlafen (Dauer, Heilung, vorgespulte Stunden) | `spielKonfiguration.js` → `schlafen`; Logik `arbeitSystem.js` (`schlafe`, `spuleZeitVor`) |
| **Überlebens-Tagebuch** (Kapitel, Ziele, XP-Belohnung) | Daten `server/spiel/konfiguration/ziele.js` (KAPITEL, Zähler-Namen im Kopf); Logik `server/spiel/systeme/zielSystem.js`; an/aus `spielKonfiguration.js` → `ziele.aktiv`; HUD `client/ui/tagebuchAnzeige.js` (Taste J) |
| **Grusel** (Herzschlag, Nacht-Geräusche, Flackern) | `client/kern/grusel.js` (GRUSEL-Werte); Klänge `ziel_geschafft`, `herzschlag`, `grusel_*` in `client/audio/sound.js` (REZEPTE, ersetzbar über Audio-Zentrale) |
| **Level / XP** (XP pro Zombie, Stufen) | `spielKonfiguration.js` → `level`; Logik `server/spiel/systeme/levelSystem.js`; HUD `#zeigeLevel` in `hud.js` |
| **Accounts / Gäste** | Datei `server/daten/konten.json` (Vorlage `konten.beispiel.json`), online: siehe `docs/ONLINE_STELLEN.md`; Gäste an/aus: `server.gaeste` bzw. `GAESTE=0` |
| Inventar-Fenster, Rucksack-Größe | `client/ui/inventarFenster.js`; Größen `gemeinsam/konstanten.js` (`HOTBAR_PLAETZE`, `INVENTAR_PLAETZE`, `INVENTAR_MAX`), Rucksack `gegenstaende.js` → `rucksack.plaetze` |
| Kleidung (Wärme, Taschen, Farbe) / Kälte-Raten | Items `server/spiel/konfiguration/gegenstaende.js` (Kategorie `kleidung`), Icons `werkzeuge/assets/baue_assets.py --nur-items`; Kälte `spielKonfiguration.js` → `kaelte`, Logik `ueberlebenSystem.aktualisiereKaelte`; Optik `renderer.#setzeKleidung` |
| 3D-Modell eines Items am Boden | `client/darstellung/itemModelle.js` → `BAUPLAENE` (Größe `ITEM_SKALA`) |
| Baum-Aussehen / -Mischung je Karte | `client/darstellung/baumModell.js` (`BAUM_MISCHUNG`, `BAUM_VARIANTE_INFO`, `BAUM_LAUB_TOENE`); neue Modelle: `werkzeuge/assets/baue_baeume.py` (`BAEUME`) |
| Durchsuchbare Schränke/Kisten (Art, Plätze, Loot) | `gemeinsam/welt/behaelter.js` (`BEHAELTER`, Modelle `BEHAELTER_TYPEN`, Editor-Modelle `BEHAELTER_MODELLE`); Loot `lootTabellen.js`; Nachfüllen `loot.behaelterNachfuellen` |
| Fußspuren (Länge, Abstand, Deckkraft) | `client/darstellung/fussspuren.js` |
| Blutflecken-Dauer | `client/darstellung/effekte.js` → `FLECK_LEBENSDAUER` (120 s) |
| Werkbänke, Steine, Betten, Spawn platzieren | `server/spiel/karten/stadtrand.js` (`objekte`: `werkbank`, `stein`; `S` = Start) |
| Interaktion mit E (Reihenfolge) | `client/kern/clientSpiel.js` → `#interaktion` |
| Karte (Sichtradius, Aussehen) | `client/ui/karte.js` |
| Chat (Länge, Spam-Pause) | `gemeinsam/konstanten.js` → `CHAT_MAX_LAENGE`, `CHAT_PAUSE_MS`; UI `client/ui/hud.js` |
| Grafik-Performance (Lichtbudget, Auflösung, Sichtweite) | `client/darstellung/renderer.js` → `LICHT_BUDGET`, `QUALITAETS_STUFEN`, `GRAFIK_PROFILE`, `AUTO_STUFEN`, `SICHTWEITE`; Geräteerkennung `client/darstellung/geraet.js` |
| Fahrgefühl Auto (Beschleunigung, Lenkung, Tacho) | `gemeinsam/physik/fahrzeug.js` → `FAHRZEUG`, `FAHRZEUG_MAX_KMH` |
| Zombie-Typen (Werte, Häufigkeit) | `spielKonfiguration.js` → `zombie.varianten`; Aussehen: `SKINS`, `ZOMBIE_MODELLE`, `zombieModellFuer` in `client/darstellung/renderer.js` |
| Tag-/Nachtlänge, Horde, Nacht-Wahrnehmung | `spielKonfiguration.js` → `welt.tagSekunden/nachtSekunden`, `zombie.nachtHorde/nachtTempoFaktor/nachtLichtFaktor/dunkelFaktor` |
| Licht-Stimmung (Farben Tag/Nacht/Dämmerung) | `client/darstellung/renderer.js` → `TAG`, `NACHT`, `DAEMMERUNG`, `#tageslicht` |
| Türen (Auto-Radius, Haltbarkeit, Startzustand) | `gemeinsam/konstanten.js` → `TUER_AUTO_OEFFNEN/SCHLIESSEN/BRUCH_OFFEN`, `TUER_REICHWEITE` (nur Bretter); `spielKonfiguration.js` → `welt.tuerLeben/tuerenGeschlossen`; Logik `tuerSystem.js` |
| Sprint / Ausdauer | Werte: `spielKonfiguration.js` → `spieler`; Logik: `aktualisiereAusdauer` in `gemeinsam/physik/bewegung.js` |
| Zombie-Wegfindung / Auto-Lauf-Weg | `gemeinsam/physik/pfadfindung.js` (A*), "geradeaus oder Umweg?" → `wegFrei` in `gemeinsam/physik/strahl.js` |
| Waffenwerte (Schaden, Magazin, Streuung, Nachladezeit) | `server/spiel/konfiguration/gegenstaende.js`; Schlag ohne Waffe: `UNBEWAFFNET` |
| Wirkung von Essen/Trinken/Medizin | `gegenstaende.js` (`naehrwert`, `durstwert`, `heilung`), Logik: `inventarSystem.js` → `benutzen` |
| Hunger-/Durst-Tempo, Heilung, Respawn-Zeit | `spielKonfiguration.js` → `spieler` |
| Aufheb-Reichweite | `gemeinsam/konstanten.js` → `AUFHEB_REICHWEITE` |
| Loot-Zonen aus dem Editor (Chance je Item, Punkte, innen/außen, max) | `server/spiel/karten/lootZonen.js` (Regeln), Lader `kartenLader.js`, `lootSystem.wuerfleZonenLoot`; Editor `editor/ui/lootUi.js` |
| Loot-Nachschub, Zombie-Beute | `lootSystem.js`; Zeiten in `spielKonfiguration.js` → `loot`, `zombie.lootChance`; Tabelle `zombie` in `lootTabellen.js` |
| Effekte (Blut, Mündungsfeuer …) | `client/darstellung/effekte.js` |
| Taschenlampe (3D-Kegel) | `client/darstellung/renderer.js` → `#aktualisiereTaschenlampen`, `#neueTaschenlampe` |
| **Dächer** (Form, Neigung, Farbe, Schindeln, Raum-Aufklappen) | `client/darstellung/dachModell.js` (`ANSTIEG_*`, `DACH_FARBEN`); Einbindung `kartenModell.js → #baueDaecher`, `aktualisiereDaecher` |
| **Himmel** (Tag blau / Regen grau / Nacht Sterne), Weltkante als Horizont | `client/darstellung/himmel.js` (Shader) + `renderer.js → #zeichneHimmel`, Paletten `TAG/NACHT/DAEMMERUNG.zenit/wolken`, `HIMMEL_FERNE`, `HIMMEL_DUNST` |
| **Gras & Pflanzen auf der Karte** (3D-Modelle streuen) | `client/darstellung/naturKonfiguration.js` (`STREUUNG`, `ZONEN`), Logik `naturModell.js`; neue `.glb` nach `werkzeuge/assets/quellen/natur/` + `npm run assets:3d` |
| Straßenlaternen (Höhe, Position, Licht) | Höhe/Licht `kartenModell.js` (`LATERNEN_LICHTHOEHE`, `#baueLampen`); Position `werkzeuge/karten/stadtrand.py → rueckeLaternenAufGehweg` (nur Gehweg `-`) |
| Tür-Röntgen (Schimmer durch Wände) | `kartenModell.js` (`TUER_SCHIMMER_WEITE`, `aktualisiereTuerSchimmer`), Zeichnen `renderer.js → #zeichneTuerUmrisse` |
| Schnellleiste (10 Plätze, Tasten 1–0), Doppelklick-Konsum | `gemeinsam/konstanten.js` (`HOTBAR_PLAETZE`), `client/kern/eingabe.js` (`SLOT_TASTEN`), `client/ui/inventarFenster.js` (Doppelklick), AKTION `konsumieren` (`inventarSystem.js`) |
| Fahrzeug-Tacho, km/h, Aufprall-Schwelle | `gemeinsam/physik/fahrzeug.js` (`FAHRZEUG_MAX_KMH`, `AUFPRALL_MIN_KMH`, `tempoZuKmh`), Anzeige `hud.js → zeigeTacho` |
| Fahrzeug-Schaden (Wand/Fahrzeug), Bäume/Laternen umfahren, Roadkill-XP | `fahrzeugSystem.js` (`verarbeiteAufprall`, `fahreHindernisseUm`), Werte `spielKonfiguration.js → fahrzeug.aufprallSchaden`; XP-Sperre `kampfSystem.js → toeten(…, {ohneXp})` |
| Brocken/Tank (Häufigkeit, Leben) | `spielKonfiguration.js → zombie.varianten.brocken` (`gewicht`, `leben` = 10 Pistolentreffer) |
| Lampen auf der Karte | Kartendatei → `objekte` mit `typ: 'licht'` (radius, farbe, staerke, flackern) |
| Einstellungen (⚙: Ton-Regler, Grafikstufen, Abmelden, Vollbild) | `client/ui/einstellungen.js`, HTML `#einstellungen` in `client/index.html`; Grafikprofile `GRAFIK_PROFILE` in `renderer.js` (hoch/mittel/niedrig, gemerkt in `localStorage browserSurvival.grafik`) |
| Frisur/Aussehen der Figur (3D-Anbauteile) | `client/darstellung/haarModell.js` (`FRISUREN`), Zuordnung `frisur` je Körper-Option in `gemeinsam/spieler/aussehen.js`, Anbau `renderer.js → #setzeFrisur` |
| Geräusche ändern / neue Geräusche | `client/audio/sound.js` → `REZEPTE`; Auslöser in `clientSpiel.js` (`#ereignisSound`, `#datenSound`) |
| Schnellleiste, Balken, Todesbildschirm | `client/ui/hud.js`, Markup `client/index.html`, Stil `client/stil.css` |
| Haltung beim Zielen/Schlagen, Zombie-Arme | `client/darstellung/figurHaltung.js` → `HALTUNGEN`, `veraendereFuerAktion` |
| Waffenmodell (Form, Größe) | `client/darstellung/waffenModelle.js` → `BAUPLAENE`, `SICHTBARKEIT` |
| Neue Grafik / anderes Icon / Möbelstück | `werkzeuge/assets/baue_assets.py` (`ITEMS`, `OBJEKTE`, `EINZEL_OBJEKTE`) → Skript ausführen |
| Möbel/Deko platzieren | `server/spiel/karten/stadtrand.js` → `objekte` (Kollision über `blockiert`) |
| Touch-Steuerung | `client/kern/touchSteuerung.js`, Optik in `client/stil.css` (`.stick`) |
| Kamera, Wandhöhe, Möbelhöhen, Wand-Schnitt | `client/darstellung/renderer.js` (`KAMERA_VERSATZ`, `WANDHOEHE`, `MOEBEL_HOEHE`, `SCHNITT_RADIUS` …) |
| Bodentexturen, Straßenmarkierung, Gehweg | `client/darstellung/bodenTextur.js` |
| Neue Untergrund-Fototextur (Runde 26) | Bild nach `werkzeuge/assets/quellen/boden/`, Eintrag `BOEDEN` in `werkzeuge/assets/baue_boeden.py`, Zeichen in `kacheln.js`, Farbe `farben.js`, Editor `katalog.js` (`KACHEL_KATEGORIE`), dann `npm run ki:anleitung` |
| KI-Anleitung / Katalog für fremde KIs | `editor/kern/kiAnleitung.js` → `npm run ki:anleitung` → `editor/KI_KARTEN_ANLEITUNG.md`; Export `editor/kern/ausschnitt.js` |
| Andere Figuren/Animationen | `baue_assets.py` (`baue_3d_figuren`) + `baue_3d.mjs` (`ANIMATIONEN`), dann `npm run assets:3d` |
| Schaden, Lebenspunkte, Geschwindigkeit | `server/spiel/konfiguration/spielKonfiguration.js` oder `server/daten/einstellungen.json` |
| Neues Item | `server/spiel/konfiguration/gegenstaende.js` + Icon in `baue_assets.py` (`ITEMS`) + in `lootTabellen.js` eintragen |
| Was wo spawnt | `server/spiel/konfiguration/lootTabellen.js`, Raumzuordnung in der Kartendatei |
| Karte bearbeiten | `server/spiel/karten/stadtrand.js` (ASCII; Tests prüfen Erreichbarkeit & Möbel nicht in Türen) |
| **Karte im Map-Editor bauen** | `…/editor/` (Login → 🗺 Map-Editor), veröffentlichen mit `npm run karte:editor -- <id>.karte.json`; Editor-Code: `editor/` (§8) |
| **Tutorial** (Texte, Aufgaben, Reihenfolge, Funksprüche) | `server/spiel/tutorial/skript.js` (Daten); Engine `server/spiel/systeme/tutorialSystem.js`; Karte `werkzeuge/karten/tutorial.py` → `server/spiel/karten/tutorial.js`; UI `client/ui/tutorialAnzeige.js`; Stimme `client/audio/tutorial/<id>.ogg` (`werkzeuge/audio/tutorial_stimme.py`), Funk-Klang `client/audio/funkstimme.js`; Konzept `docs/konzepte/TUTORIAL_KONZEPT.md` |
| Neue Karte / Zone | Tiled: `werkzeuge/karten/README.md` (`npm run karte:import`), oder Datei in `server/spiel/karten/` + in `KARTEN` (`kartenLader.js`) eintragen; Übergänge: `uebergaenge` + `ankuenfte` in der Kartendatei |
| Skills / Fähigkeiten | `gemeinsam/spieler/skills.js` (Werte), Wirkung in `levelSystem.js`, `kampfSystem.js`, `arbeitSystem.js`, `gemeinsam/physik/bewegung.js` |
| Bauwerke, Pflanzen, Kochen | `gemeinsam/welt/bauwerke.js`, `bauSystem.js`; Rezepte `rezepte.js` (`ort: 'inventar'`); Modelle `client/darstellung/bauwerkModelle.js` |
| Autos | Physik `gemeinsam/physik/fahrzeug.js`, Logik `fahrzeugSystem.js`, Modelle `client/darstellung/fahrzeugModelle.js` |
| Charakter-Aussehen | `gemeinsam/spieler/aussehen.js` (Merkmale), Auswahl `client/ui/loginBildschirm.js`, Skin `renderer.js` |
| Netzwerk-Last (Reichweite, Rundung, Kompression) | `server/spiel/zone.js` (`NETZ_SICHTWEITE`), `…ZuNetzwerk`, `server/node/websocketAnbindung.js` |
| Neuer Kacheltyp (z. B. Wasser `~`) | `gemeinsam/welt/kacheln.js` (Flags `blockiert`, `sichtFrei`, `wasser`) + Textur in `baue_assets.py` (`BODEN`) oder Farbe in `farben.js`/`bodenTextur.js` (`#wasser`) |
| **Auto-Haltbarkeit, Überfahr-Schaden** | `spielKonfiguration.js` → `fahrzeug`; Logik `fahrzeugSystem.js` (`schlageFahrzeug`), Zombie-Schläge `zombieSystem.js` (`autoAnlaufpunkt`), `kampfSystem.js` |
| Boss-Werte & Beute | `zombie.varianten.brocken` (`waffenChance`), Tabelle `boss` in `lootTabellen.js`, `lootSystem.lasseBossLootFallen` |
| Hasen / Tiere (Anzahl, Tempo, Scheu) | `spielKonfiguration.js` → `tiere`; `tierSystem.js`, `entitaeten/tier.js`; Modell `client/darstellung/tierModelle.js` |
| Angeln (Zeiten, Fische, Doppelfang) | `spielKonfiguration.js` → `angeln`; `angelSystem.js`, `gemeinsam/welt/wasser.js`; Darstellung `angelModell.js`; Hinweis `clientSpiel.js → #angelHinweis` |
| Wetter (Dauer, Häufigkeit) | `spielKonfiguration.js` → `wetter`; `wetterSystem.js`; Darstellung `wetterEffekt.js` + `renderer.js → #tageslicht`; Ton `sound.js → regen()` |
| Erdfeld-Größe, Samen/Pflanzen | `gemeinsam/welt/bauwerke.js` (`FELD_GROESSE`, `PFLANZEN`), `bauSystem.legeFeldAn`/`entferneFeld` (Hacke in der Hand: Links = anlegen, Rechts = Rasen; `clientSpiel.#handZiel`) |
| Lagerfeuer-/Ofen-Menü (Garzeiten, Plätze), Rezepte Braten/Schmelzen | `server/spiel/systeme/stationSystem.js` (`rezept()`, `PLAETZE`), Zeiten `konfiguration.bauen` (`kochDauer` 20, `verbrennDauer` 30, `schmelzDauer`, `brennDauer` 180), Client `ui/stationFenster.js` |
| Werkzeug-Haltbarkeit | `haltbarkeit` in `gegenstaende.js`, `inventarSystem.nutzeWerkzeug`, Balken `ui/haltbarkeit.js` |
| Kofferraum | `fahrzeug.kofferraum` (`KOFFERRAUM_PLAETZE`), `kistenSystem.oeffneKofferraum`, Taste G |
| Angel-Beute | `konfiguration.angeln.beute/muell/munition`, `angelSystem.faenge` |
| Nacht-Helligkeit / Taschenlampe / Lampen-Pool / Kamerawinkel | `renderer.js` (`#tageslicht`, `NACHT`, `TASCHENLAMPE`, `SCHEINWERFER`, `LAMPEN_POOL`, `KEGEL_POOL`, `KAMERA_VERSATZ`); Bodenschein `kartenModell.js #baueLampen` (Sichtkegel entfernt, Editor 2.0) |
| Admin-Befehle (∞ Munition, +12 h) | `ADMIN_BEFEHLE` (`protokoll.js`), `adminSystem.js`, Buttons in `index.html` |
| Lagerkiste (Plätze) | `KISTE_PLAETZE` in `konstanten.js`, `kistenSystem.js`, `kisteFenster.js` |
| **Basisbau: neues Bauteil (Möbel, Ofen …)** | 1) Eintrag in `gemeinsam/basisbau/teile.js` (Menü, Kosten) · 2) Eintrag in `BAUWERKE` (`gemeinsam/welt/bauwerke.js`: Ebene, Kollision, `anschluss`) · 3) Geometrie in `client/darstellung/basisbauModelle.js` (`GEO_BAUPLAN`) + Fall in `bauwerkModelle.erzeugeBauwerk` · 4) bei E-Aktion: `bauwerkAktion` + `bauSystem.benutzeBauwerk`; Zustand speichern: `spielWelt.pruefeBauwerk` |
| Basisbau: Kosten, Rückgabe, Radius, Reichweite | Kosten `teile.js` (`kosten`); Rückgabe/Radius/Flaggen-Freiraum `spielKonfiguration.js` → `basisbau` (auch im Developer-Fenster); Reichweite `BAU_REICHWEITE_BASIS` |
| Basisbau: Rechte / Gruppen | `gemeinsam/basisbau/rechte.js` (`hatRecht`), Flaggen-Daten `territoriumSystem.js` (`mitglieder`) |
| Basisbau: Snapping-Regeln (was dockt woran) | `anschluss` je Typ in `BAUWERKE` + `platzierung.js` (`pruefeAnschluss`, `snappe`, `autoDrehung`) |
| Basisbau: Bau-Menü / Hologramm / Tasten | `client/ui/bauMenue.js`, `client/kern/bauModus.js`; Tasten `TASTEN.bauen/abriss/gebiet` (+ R dreht) in `eingabe.js` |
| Spawn Point / Respawn | `spawnSystem.js`, `ueberlebenSystem.wiederbeleben`, Zonenwechsel `spielServer.#wechsleZone`; Daten `spieler.spawn` (Spielstand) |
| Crafting-Level je Rezept | `rezept.level` in `rezepte.js` (Server prüft in `craftingSystem.js`, Menüs zeigen es) |
| Stapelgrößen | `STAPEL_MUNITION`/`STAPEL_STANDARD` in `konstanten.js` (angewendet in `gegenstaende.js → normalisiere`) |
| XP fürs Abbauen | `spielKonfiguration.js` → `level.xpProAbbau` |
| Minikarte / FPS-Anzeige / Auto-Lauf | `client/ui/karte.js` (`zeichneMini`, Klick), `hud.js`, `clientSpiel.js` (`autoLaufStarten`, `#oberflaecheAktualisieren`) |
| Eigene Sounds / Lautstärke je Ereignis | Dateien + `lautstaerke.txt` in `client/audio/eigene/` (README dort), `npm run sounds`, committen (`audio/eigeneSounds.js` = Ereignisliste, `sound.js`) |
| Zonen-Musik hinzufügen | Dateien in `client/musik/<zonenId>/` legen, `npm run musik:index`, committen (`audio/zonenMusik.js`) |
| Kollision / Bewegungsphysik | `gemeinsam/physik/bewegung.js` (wirkt auf Server UND Client-Vorhersage) |
| Kampf, Treffer, Schaden zufügen | `server/spiel/systeme/kampfSystem.js` (`fuegeSchadenZu` = einzige Schadensstelle) |
| Neue Aktion (z. B. "werfen") | `AKTIONEN` in `gemeinsam/protokoll.js` → `inventarSystem.js` (`verarbeiteAktionen`) → `clientSpiel.js` + Taste in `eingabe.js` + Touch-Knopf im HUD |
| Neue Netzwerk-Nachricht | `gemeinsam/protokoll.js` → Server: `spielServer.js` (`#nachrichtEmpfangen`) → Client: `clientSpiel.js` (`#nachricht`) |
| Neuer Entitätstyp | `server/spiel/entitaeten/<typ>.js`, Serialisierer in `spielWelt.js` (`NETZWERK_SERIALISIERER`), Darstellung in `renderer.js` |
| Tastenbelegung | `client/kern/eingabe.js` → `TASTEN`, `SLOT_TASTEN`; Touch-Feuerschwelle `TOUCH_FEUER_SCHWELLE` |
| Login-Formular / Serverliste | `client/index.html`, `client/ui/loginBildschirm.js`, `client/konfiguration.js` → `SERVER_LISTE` |
| Was im Spielstand steht / Prüfung beim Laden | `server/spiel/spielstand.js` |
| Wo Spielstände liegen | `server/node/start.js` (DateiSpeicher), `client/netzwerk/lokalerServer.js` (BrowserSpeicher) |
| Admin-Befehl hinzufügen | `ADMIN_BEFEHLE` in `gemeinsam/protokoll.js` → `adminSystem.js` → Knopf `data-befehl` im `#admin-panel` (`client/index.html`) |
| Zombie-Anzahl / Spawnorte | `Z` in `server/spiel/karten/stadtrand.js` (nur draußen!), Tempo/Sicht in `spielKonfiguration.js` → `zombie` |
| Login-Prüfung / Accounts | `server/node/kontenAuthentifizierung.js`, `server/werkzeuge/kontoAnlegen.js` |
| HUD / Anzeigen | `client/ui/hud.js`, `client/index.html`, `client/stil.css` |
| Tickrate | `gemeinsam/konstanten.js` → `TICK_RATE` |
| Port, Server starten | `server/node/start.js` |

---

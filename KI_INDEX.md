# KI_INDEX – Kompaktkarte für KI-Sitzungen (v0.10.0 · Proto v8)

> Dicht & abgekürzt, für Maschinen gedacht. Für Menschen: `project_manifest.md` (ausführlich, „Wo ändere ich …?“ §4).
> Legende: `→` führt zu/ruft · `S:` Server (`server/spiel/`) · `C:` Client (`client/`) · `G:` gemeinsam (`gemeinsam/`) · `K:` Konfig (`server/spiel/konfiguration/`) · `⚠` Falle/Invariante · `★` häufigste Änderungsstelle

## 0 · Regeln (aus CLAUDE.md, hart)
- Code DE, Bezeichner ohne Umlaute; Vanilla ESM, kein Build; Node ≥20 + `ws`; Three.js nur 3D (`C:darstellung/renderer.js`).
- Spiellogik NUR `S:` (autoritativ, umgebungsfrei: kein `node:`, kein DOM). `G:` = von beiden importiert → ebenfalls umgebungsfrei.
- Grafik nur via `werkzeuge/assets/baue_assets.py` + `npm run assets:3d` (danach `git checkout client/assets/3d/animationen.json`, falls nur Rauschen). Nur CC0/CC-BY; Credits-Dialog bleibt.
- Touch für jede neue Aktion (HUD-Knopf, `.nur-touch`). Vor Commit `npm test`. Manifest + Changelog pflegen. Antwortende: Spiel-Link.
- ⚠ `server/daten/konten.json`, `einstellungen.json`, `spielstaende/` nie committen (gitignored).

## 1 · Befehle
`npm test` (node:test, ~120 Tests, <2 s) · `npm run rauchtest [-- --online]` (Playwright: Login→laufen→I→K→Zonenwechsel, Screens `werkzeuge/test/ausgabe/`) · `npm run start:gast` (Port `PORT`, Standard 8080) · `npm run karte:export -- <id>` / `karte:import -- x.tmj` (Tiled) · `python3 werkzeuge/karten/{stadtrand,waldweg}.py` (⚠ überschreibt Karten-JS) · `npm run konto -- name pw [--admin]` · `npm run musik:index` (client/musik → musik.json).
Browser-Konsole (nur Lokal-Modus): `browserSurvival.{tp(tx,ty), gib(defId,n), boden(defId,n), zeit(h), zone(id[,ankunft]), ich(), welt(), spiel, server}`. F3 = Draw-Calls/Qualität.
Playwright-Skripte: nach Login auf `#laden` hidden warten (Aufwärmphase), sonst gehen Tasten verloren.

## 2 · Architektur in 12 Zeilen
- Client↔Server immer über Text-Kanal (WS `server/node/websocketAnbindung.js` [permessage-deflate] | Speicher-Kanal `S:netz/speicherKanal.js` im Lokal-Modus = derselbe Server im Tab).
- `S:spielServer.js` Sitzungen/Login/Routing → Zonen (`S:zone.js`, 1 Karte = 1 `SpielWelt`), Map `zonen`; `startZone` immer aktiv (= Weltuhr), andere nur mit Spielern (sonst Pause, beim Betreten `holeZeitNach`).
- Tick 30 Hz (`S:taktgeber.js`) → `tickAusfuehren`: aktive Zonen → `SpielWelt.aktualisiere(dt)` → Zonenwechsel (`spieler.zonenwechsel`) → Autosave → `Zone.versende` (Interest Mgmt: Zombies/Autos nur ±`NETZ_SICHTWEITE`=2400 px, Spieler immer).
- `SpielWelt.aktualisiere` Reihenfolge: Aktionsende → `verarbeiteSpielerEingaben` → `aktualisiereFahrzeuge` → `pruefeUebergaenge` → `verarbeiteAktionen` → Nachladen → Kampf (→ `behandleAngelKlick` zuerst!) → Arbeit → Bauwerke (+Kisten) → Türen → Zombies → Tiere → Angeln → Wetter → Überleben → Loot → Tageszeit.
- C: Vorhersage (G:physik/bewegung.js bzw. fahrzeug.js, deterministisch) + Reconciliation (seq) + Interpolation anderer (geglättete Tick-Uhr `tickNull`, 100 ms Verzug, Objekt-Pool).
- Entität = Datenobjekt, Verhalten = System (`S:systeme/*`). Netz sieht nur, was `…ZuNetzwerk` liefert.
- Welt (`G:welt/welt.js`): Kacheln, Möbelkollision, Türen, Ressourcen (abbaubar), Bauwerke (Kachel-Index), Fahrzeug-Kacheln, `istInnen`, `uebergaenge`.

## 3 · Dateikarte (nur Nicht-Offensichtliches)
**G:** `konstanten.js` (Tick, Kachel 32, Inventar 8/16/max 32, Reichweiten, Proto/Spielversion, Namensmuster) · `protokoll.js` (NACHRICHT, AKTIONEN, ADMIN_BEFEHLE) · `tageszeit.js` · `physik/bewegung.js` (`wendeEingabeAn`, Ausdauer) · `physik/fahrzeug.js` (`fahre`, `passt`, `fahrzeugKacheln`, `ausstiegsPunkt`, FAHRZEUG_MODELLE) · `physik/strahl.js` (Raycasts, `sichtlinieFrei`, `wegFrei`) · `physik/pfadfindung.js` (A*, Server-Zombies + Client-Auto-Lauf) · `welt/wasser.js` (`wurfZiel`, `istWasserKachel`) · `welt/kacheln.js` (Zeichen) · `welt/ressourcen.js` (baum→holz/axt, stein, eisenerz→spitzhacke) · `welt/bauwerke.js` (BAUWERKE inkl. kiste/holzwand/holzboden, PFLANZEN (+paprika), KOCHBAR (+Fleisch/Fische), `FELD_GROESSE`/`feldKacheln` (Erdfeld 3×3), `pruefePlatz`, `bauwerkAktion`, `feuerText`) · `welt/erkundung.js` (Bitfeld base64) · `spieler/skills.js` ★ · `spieler/aussehen.js` (+`aussehenKompakt` fürs Netz).
**S:** `spielServer.js` (Login, `#wechsleZone`, `#startDaten`, Dev-Modus) · `zone.js` (laden/versenden/`weltDaten`/`ankunft`) · `spielWelt.js` (Entitäten, `weltzustand`/`uebernimmWeltzustand` = Bauwerke+Autos+Uhr, Schnappschuss) · `spielstand.js` (Spielerstand inkl. `karte`, `erkundet{kartenId:b64}`, Skills, Aussehen; prüft alles) · `entwickler.js` · `entitaeten/{spieler,zombie,gegenstand,fahrzeug,tier}.js` (Fahrzeug: `leben/maxLeben/kaputt`; Spieler: `statistik{zombies,spieler,ueberlebt}`, `angeln`, `offeneKiste`) · `karten/kartenLader.js` (KARTEN-Register ★, ASCII→Daten, Übergänge/Ankünfte) · `karten/{stadtrand,waldweg}.js` (generiert!).
**S:systeme:** `bewegungsSystem` (Eingaben, Erkundung markieren) · `inventarSystem` (Dispatcher ALLER AKTIONEN, Aufheben/Benutzen/Tauschen/Rucksack/Pflanzen, `verbrauche`) · `kampfSystem` (`fuegeSchadenZu` = einzige Schadensstelle; Tod→Level-Reset, Zombies im `todesZombieRadius` weg; Fahrer immun gg. Bisse) · `zombieSystem` (Fahrer im Auto → Zombie läuft zum `autoAnlaufpunkt` und schlägt aufs Auto; Sicht – nicht ins Haus `istInnen`, A*, Tür-Engstellen-Reservierung, Stuck-Erkennung nach `trenneZombies`, Horde) · `arbeitSystem` (Abbau mit `chanceAufMehr`/`sammelFaktor`, Kochen, Schlafen zonenübergreifend, `spuleZeitVor`, `holeZeitNach`, `uebernimmZeitsprung`) · `bauSystem` (Platzieren, `legeFeldAn`, Feuer, Fallen, Beete/Wachstum (Regen ×2), Kochen) · `fahrzeugSystem` (ein/aus, Fahren, Anfahren = Schaden/XP + `schlageFahrzeug`: 10 Schläge, Überfahren 0,5, Wrack+Auswurf) · `tierSystem` (Hasen) · `angelSystem` (Linksklick auswerfen/Biss/Fang) · `wetterSystem` (klar/regen/nebel; `WACHSTUM_REGEN_FAKTOR`) · `kistenSystem` (Lagerkiste; privat, `KISTE`-Nachricht) · `levelSystem` (XP je Variante, Skillpunkte, `wendeSkillsAn`) · `zonenSystem` (Übergang betreten → `zonenwechsel`) · `craftingSystem` (prüft `rezept.level`) · `lootSystem` · `tuerSystem` (Automatiktüren: `aktualisiereTueren` nach Spieler-Nähe, Zombies brechen auf, `tuerHaltOffen`; AKTION `tuer` = veraltet/ignoriert) · `tageszeitSystem` · `ueberlebenSystem` · `adminSystem` · `pfadfindung`.
**K:** `spielKonfiguration.js` ★ (alle Balancingwerte) · `gegenstaende.js` ★ (Items; Kategorien nahrung…samen) · `rezepte.js` ★ (`ort: 'inventar'` = im Inventar baubar) · `lootTabellen.js` · `entwicklerFelder.js`.
**C:** `main.js` (Login→`spielStarten`→ClientSpiel; Zonenwechsel = `uebergeben()` + neues ClientSpiel, seq läuft weiter) · `kern/clientSpiel.js` (Netz, Vorhersage, Interaktion E/F, Platzier-Modus (+`feldModus` G), Fahrzeuge, Sounds, Auto-Lauf `autoLaufStarten`, Minikarte/Angel-Hinweis `#oberflaecheAktualisieren`, Kiste, Wetter) · `kern/eingabe.js` (TASTEN) · `kern/touchSteuerung.js` · `kern/konsolenHelfer.js` · `darstellung/renderer.js` (Qualitätsstufen, Aufwärmen, Zoom, Lampen-Pool, Figuren, Bauwerke, Autos, Baumfall) · `darstellung/kartenModell.js` (statische Karte, InstancedMesh Bäume/Erze, Wegweiser) · `darstellung/{bauwerkModelle,fahrzeugModelle (+Wrack),itemModelle,waffenModelle,baumModell,tierModelle,angelModell,wetterEffekt}.js` (prozedural) · `ui/{hud (FPS, Minikarte-Schalter, Tab-Statistik),inventarFenster,kisteFenster,skillFenster,einstellungen,werkbankMenue,karte (Minikarte `zeichneMini`, Klick→Ziel),loginBildschirm,entwicklerFenster}.js` (`einstellungen.js` = ⚙: Ton-Regler, Grafik, Vollbild, Abmelden; Buttons `#hud-ton/-vollbild/-abmelden` liegen darin) · `audio/sound.js` (synthetisch, REZEPTE; Busse: effekte→Kompressor, atmosphaere+musik am Kompressor vorbei; `lautstaerken{gesamt,effekte,atmosphaere,musik}`; `regen()`, `spieleMusik()`; keine Schritt-Sounds) · `audio/zonenMusik.js` (Ordner `client/musik/<zone>|alle/`, Index `musik.json`) · `darstellung/haarModell.js` (Frisuren, Anbau an Knochen `Head` via `attach`).
**Werkzeuge:** `werkzeuge/assets/` (Grafik) · `werkzeuge/karten/` (Generatoren, Tiled ⇄, README) · `werkzeuge/test/rauchtest.mjs`.

## 4 · Protokoll v8 (Kurz)
C→S: `anmelden{benutzername,passwort,protokoll,gast?,aussehen?}` · `eingabe{seq,x,y,blick,angriff,sprint}` · `aktion{art,slot?,ziel?,tx?,ty?,rezept?,befehl?,skill?}` · `ping{t}` · `chat{text}` · `dev*`.
S→C: `anmeldungOk`/`zoneWechsel` {spielerId, karte, start, physik, gegenstaende, tueren, abgebaut, bauwerke, erkundet, rezepte, itemDefinitionen, spielerDaten, tageszeit, zeit, tag (+zone)} · `zustand{tick,zeit,tag,wetter,entitaeten,ereignisse}` (30/s, gefiltert; Entitäten: spieler zombie fahrzeug tier) · `kiste{id,inhalt|null}` (nur an den Öffner) · `spielerDaten` (privat, bei Änderung) · `gegenstaende`/`tueren`/`ressourcen`/`bauwerke` (bei Änderung, pro Zone) · `meldung` · `chat` (global) · `einstellungen` · `devWerte` · `system` · `pong`.
AKTIONEN: aufheben benutzen ablegen tauschen rucksackAblegen platzieren feld kisteLegen kisteNehmen kisteSchliessen feuer bauwerk skill fahrzeug nachladen tuer abbauen schlafen herstellen licht wiederbeleben admin. ⚠ Neue Aktion: G:protokoll → S:spielServer `#aktion` (Validierung!) → S:inventarSystem Dispatcher → C:clientSpiel + eingabe TASTEN + HUD-Touchknopf. Inkompatibel? `PROTOKOLL_VERSION`++.

## 5 · Datenformen
- Spieler (S): x,y,blick,leben/maxLeben,hunger,durst,ausdauer,inventar[] {defId,menge,magazin?}, ausgeruestet, rucksack(defId|null), level,xp,skills{tempo,staerke,leben,sammeln},skillPunkte,tempoFaktor,aussehen,arbeit{art,…},fahrzeug(Entität|null),erkundet(Uint8Array),erkundetAndere{id:b64},zonenwechsel?,imUebergang,eingabePuffer,aktionsPuffer,letzteEmpfangeneSeq.
- Zombie: variante(normal|laeufer|brocken=Boss), zustand, ziel, pfad… · Fahrzeug: modell,x,y,winkel(0=rechts),tempo,laenge,breite,fahrerId,leben/maxLeben(10),kaputt · Tier: art 'hase',x,y,blick,zustand ruhend|flucht · Gegenstand: defId,menge,x,y,verfall?
- Bauwerk: {id,typ,tx,ty,besitzer, brennt/brennRest | gespannt | pflanze/wachstum0..1 | inhalt[16] (kiste, nur Server/Weltzustand – `bauwerkeOeffentlich()` strippt ihn)}.
- Spielstand v1: {karte,x,y,leben,hunger,durst,inventar,rucksack,ausgeruestet,level,xp,skills,skillPunkte,aussehen,statistik{zombies,spieler,ueberlebt},erkundet{kartenId:b64}} (altes erkundet{karte,daten} wird gelesen). Welt-Stand `welt:<kartenId>`: {version:1,karte,zeit,tag,bauwerke,fahrzeuge{…,leben,kaputt}}.
- Kartendefinition: {id,name,kacheln[ASCII],raeume{a:{name,lootTabelle}},objekte[{typ,x,y,b,h,blockiert?,ebene?,drehung?,…}],uebergaenge[{x,y,b,h,ziel,ankunft,name}],ankuenfte{name:{x,y}}} (Kacheln). Marker: S Start, Z Zombie (nur draußen), a–z Loot.

## 6 · Fallen & Invarianten (⚠ schon reingetappt)
- Objekt-Spread: `{ ...bauwerkAktion(), art: 'bauwerk' }` – `art` NACH dem Spread, sonst überschrieben.
- Spielstand: `leben` erst NACH Skills setzen (maxLeben hängt an Zähigkeit).
- Zombie-Stuck-Check NACH Separation messen (`tickStartX/Y`), sonst falsche „steckt fest“-Erkennung an Türen.
- FBX-Knochen haben Skala 100 → Anbauteile (Rucksack) an die Figurgruppe hängen, nicht an Knochen.
- InstancedMesh mit aus-/einblendbaren Instanzen: `frustumCulled = false`.
- Zonenwechsel: neue Entitäts-ID in neuer Zone; Server übernimmt `letzteEmpfangeneSeq`, Client zählt seq weiter (sonst werden Eingaben verworfen).
- Fahrzeug-Kacheln blockieren auch die Vorhersage; C entfernt Kacheln von Autos, die nicht mehr im (gefilterten) Schnappschuss sind.
- Schnappschuss: Zombie/Auto-Werte gerundet (0,01 px); eigener Spieler + `spieler.fahrzeug` exakt (Reconciliation!). Nicht runden.
- Karten-JS `stadtrand.js`/`waldweg.js` sind generiert → Generator ändern, nicht die JS-Datei (oder via Tiled importieren & Generator nicht mehr nutzen).
- Ankunftspunkt nie im Übergangsrechteck (Ping-Pong) – Test `tests/zonen.test.js` prüft.
- `aussehen` im Netz kompakt (nur Abweichungen) → C immer über `skinFuer`/`pruefeAussehen` lesen.
- Tests mit eigener Karte: `new SpielServer({ kartenDefinition, kartenDefinitionen })`; `server.spielWelt` = Startzone, `server.weltVon(name)` = Zone des Spielers.

- Renderer-Grafik: `GRAFIK_PROFILE` (hoch/mittel/niedrig, `setzeGrafik`, localStorage `browserSurvival.grafik`). Profil „hoch“ = Auflösung fix (adaptiv nur Schatten/Baumdetail bis Stufe 4) → kein „mal unscharf“. Bodentextur live umstellbar (`KartenModell.setzeBodenMassstab`).
- Eigene Figur kann vor dem ersten Server-Stand gebaut werden (kein `aussehen`) → `#aktualisiereFiguren` baut bei geändertem `koerper` neu.
- Türen: Tests, die Türen manuell öffnen, müssen `welt.tuerHaltOffen.set(id, 999)` setzen, sonst schließt `aktualisiereTueren` sie wieder.

- Linksklick-Flanke: `behandleAngelKlick` läuft im Kampf-Loop VOR dem Angriff und pflegt `spieler.angriffVorher` – nie davor `continue`n (Tote/Auto räumt es selbst ab).
- Wasser `~` blockiert die Bewegung, aber `istSichtBlockiert` ignoriert `sichtFrei`-Kacheln (Schüsse/Zombie-Sicht gehen drüber).
- Autos blockieren kachelweise → Zombies schlagen schon ab `AUTO_SCHLAG_ABSTAND` (22 px) zur Karosserie, laufen zum `autoAnlaufpunkt`, nicht zur Fahrer-Mitte (A* zu blockierter Kachel = aufgeben).
- Kisten-Inhalt nie ins Netz (`bauwerkeOeffentlich`), `weltzustand()` speichert ihn; Items in Kisten laufen über `pruefeEintrag` (spielstand.js).
- `GEGENSTAENDE`-Einträge NICHT einfrieren (Developer-Modus schreibt Werte); Stapelgrößen kommen aus `normalisiere()`.
- Karte `waldweg.js` wird von `waldweg.py` erzeugt (160×120, Zufall mit festem Seed) – `git checkout` der JS-Datei nach jedem Probelauf unnötig, Ergebnis ist deterministisch.
- Client-Lichtfalle: Boden jenseits des Kartenrands nicht fast schwarz machen und Nebel (`#tageslicht`) mit Zoom/`fahrZoom` skalieren, sonst wirkt es im Auto „extrem dunkel“.
- Playwright-Tests: Software-GL schafft ~2 FPS → Klicks ≥ 600 ms halten, Zombies entfernen/Gottmodus, Wetter direkt über `renderer.wetterEffekt.regen = 1` setzen.

## 7 · Tests → Thema
`mechaniken` (v0.10: Auto-Haltbarkeit/Wrack, Boss-Beute, Abbau-XP, Stapel, Crafting-Level, Basisbau, Statistik, Hasen, Angeln, Wetter) · `bauen` (+Erdfeld, Regen-Wachstum, Lagerkiste) · `karte` (jede Karte gültig) · `zonen` (Übergänge, Wechsel, Spielstand/Erkundung pro Zone, Zeit-Nachholen, Schlafen zonenübergreifend) · `tiled` (⇄ Rundreise) · `bewegung` · `gameplay` (Kampf, KI, Türen-Stress, Haus-Tarnung, Ressourcen, Tod) · `bauen` (Bauwerke, Feuer, Fallen, Beete, Kochen) · `skills` (Skills, Aussehen, Erkundung) · `fahrzeuge` · `inhalte` (Grafiken, Erreichbarkeit) · `spielServer` (Login, Chat, Dev) · `spielstand` · `konten`.

## 8 · Offene Baustellen / Ideen
Zonen-Grundlage steht (2 Zonen, Waldweg groß mit See). Nächstes sinnvoll: Basisbau ausbauen (Räume/Türen/Verfall), mehr Tiere/Jagdwaffen, echte Musik in `client/musik`, mehr Zonen (Tiled), Zonen-Chat/-Liste, Fahrzeug durch Übergang (aktuell: aussteigen), Server-Sichtlinie (Nebel serverseitig), Delta-Kompression bei >30 Spielern, Charakter-Editor ausbauen (aussehen.js `aktiv:false`-Merkmale), Ideen-Liste im Manifest §6.

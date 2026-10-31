# Konzept Runde 23 – Atmosphäre, Inventar-Umbau, Wetter, Bots, Kälte

Stand 2026-10-29 · Status: **alle 9 Phasen umgesetzt** (Details & Abweichungen: KI_INDEX §23; Kleidung = Feld `spieler.kleidung`, Optik per Umfärben + Mütze/Handschuhe an Knochen). Wunschliste des Nutzers in 9 Phasen sortiert (Reihenfolge = Umsetzung).
Regeln für alle Phasen: nur CC0/CC-BY, jede Quelle sofort in `client/assets/eigene/credits.json` bzw. `client/audio/eigene/LIZENZEN.md` + Credits-Dialog; kleine Dateien (Texturen ≤512 px, Sounds als kurze Ogg/WAV); Touch mitdenken; `npm test` vor jedem Commit; direkt auf `main`; KI_INDEX/Manifest pro Phase nachziehen.
Statusmeldungen während der Arbeit: nur Stichpunkte am Phasenende.

## 0. Quellen (Reihenfolge der Suche)

| Was | Quellen (nur CC0/CC-BY) |
|---|---|
| Sounds | freesound.org (Filter CC0/CC-BY), OpenGameArt, Sonniss GDC-Pakete (frei nutzbar), Kenney Audio |
| Icons | game-icons.net (CC-BY 3.0, SVG → in ein Sprite/Inline-SVG), Kenney Game Icons (CC0) |
| Modelle | Quaternius, Kenney, Poly Pizza (CC0/CC-BY) |
| Fallback | Findet sich nichts Brauchbares/Lizenzklares → synthetisch (`sound.js`-Rezept) bzw. prozedural, und das im Phasenbericht erwähnen |

Alles wird beim Einbauen lizenziert vermerkt (Titel, Autor, Link, Lizenz). Ohne Lizenzeintrag kommt nichts ins Repo.

## Phase 1 · Fehler & Kleinkram (schnell, wenig Risiko)

1. **Schneeflecken in Wänden:** Reproduzieren in Schneeland-Villa (Playwright-Screenshot, Schnitt-/Silhouetten-Modus). Verdacht: Schnee-Bodenkachel/`#schnee`-Verwehung liegt über Wandhöhe oder die Silhouette (Layer 1) zeichnet Boden mit. Fix im Renderer (Schnee nur auf Außenkacheln ≠ `istInnen`, Wand-Material `polygonOffset`/Renderreihenfolge). Regressionstest nur wo rechnerisch möglich.
2. **Schlafen mit Esc abbrechen:** `main.js` Esc → `clientSpiel` sendet AKTION `schlafen` (Abbruch); Server: `arbeitSystem` bricht ab, Zeit bleibt bis dahin vorgespult.
3. **Kein Schuss beim Zurückklicken ins Spiel:** Der Klick, der das Fenster/den Canvas fokussiert (oder ein Menü schließt), darf keinen Angriff auslösen → Angriffs-Flanke erst nach `mouseup` des Fokusklicks; bei `blur`/Menü offen `angriff=false`.
4. **Offener Punkt (Wunschzettel abgeschnitten):** „manchmal ist es so, wenn man was auswählt im spiel und es z.b. …“ – Satz endet. **→ Rückfrage an den Nutzer**, wird nach Antwort in Phase 1 aufgenommen.
5. **Essen/Trinken seltener:** Loot-Gewichte in `lootTabellen.js` (nahrung/getraenk) senken, Spawn-Chance prüfen (Zahl + Vorher/Nachher im Bericht).
6. **Früchte/Gemüse geben 1/3 Wasser:** in `gegenstaende.js` bei Apfel, Gurke, Tomate, Karotte, Paprika … `durst` = ⅓ des `hunger`-Werts (Tabelle im Bericht). Die Gurke bleibt wie bisher (Hunger = Durst).
7. **Baum fällen → 10 % Apfel:** `arbeitSystem` Abbau-Ende bei `baum`: Zusatzwurf `konfiguration.ressourcen.apfelChance = 0.1`, Apfel zusätzlich zum Holz, im Chat/Popup sichtbar.
8. **Auto-Texturen „abgeranzt“:** in `fahrzeugModelle.js` (Platzhalter + `GLB_AUTOS`-Lackfarben): matter/ausgeblichener Lack, Rost-/Dreckflecken per Canvas-Textur (Overlay-Map, 256 px), leicht dunklere Scheiben, Kratzer. Kein neues Modell nötig.
9. **Kofferraum-Hinweis:** Wenn man hinter dem Auto steht (`hinterFahrzeug`), Hinweis „[Tab] Kofferraum“ (Touch: 🧳 hervorheben) – analog zum Interaktions-Hinweis.

## Phase 2 · UI-Umbau (HUD, Inventar, Chat, Popups)

1. **Neues Inventar (`ui/inventarFenster.js`, Tab):** Zweispaltig. **Links** Charakter-Vorschau (kleiner eigener Three.js-Renderer mit der echten Figur inkl. Haare/Rucksack/Kleidung, langsam drehbar per Maus) mit **Ausrüstungs-Slots drumherum** (Kopf, Oberkörper, Beine, Füße, Rücken = Rucksack, Hand). **Rechts** Item-Raster (Kategorien-Tabs oder Filter, Tooltip mit Werten) + Gewicht/Platz-Anzeige. Drag&Drop wie bisher; Rechtsklick/Doppelklick = Anlegen/Benutzen. Touch: Tippen = auswählen, Knopf „Anlegen“. Bestehende Aktionen (`tauschen`, `benutzen`, `ablegen`) bleiben, nur Ausrüstung kommt neu (Phase 9).
2. **Neue Icons:** Essen, Trinken, Energie, Leben, XP (HUD-Balken) und die obere Leiste: Quelle game-icons.net/Kenney → als SVG-Sprite in `client/assets/` (einheitlicher Stil, einfarbig + Verlauf, passend zum Dunkelthema). Alte Emoji-Icons ersetzen. Neues „Kälte“-Icon für Phase 9.
3. **Obere Leiste entschlacken:** Weg: Chat-, Rucksack-, Farm-, Karte- und Lampen-Icon (Tasten bleiben: Tab/M/Enter; Touch behält seine Knöpfe über `.nur-touch`). Das „BUILD“-Label neben dem Hammer-Icon fällt weg (nur Icon). Rest bleibt.
4. **Abbau-Anzeige:** Neues Welt-Popup `+2` / `+3` an der Abbau-Stelle (Bildschirmposition über `kamera.weltZuBildschirm`, steigt auf & blendet aus) mit dem Item-Icon dahinter. Gilt für Baum, Stein, Eisen (und Ernte). Quelle: bestehendes Ereignis „abgebaut“ + Menge.
5. **Baum-Fällen-Balken:** Statt Text „Baum fällen …“ nur ein schmaler Fortschrittsbalken über dem Baum (Welt-gebunden wie das Popup).
6. **Chat Direkt/Global:** Chat öffnen wie bisher; darin **Tab = Wechsel Direkt ↔ Global** (Chip im Eingabefeld). *Direkt* = nur Spieler der eigenen Zone (heutiges Verhalten), *Global* = alle Zonen (heute `/a`). Außerhalb des Chats bleibt Tab = Inventar. (Annahme: „baum Chat“ im Wunschzettel = Tippfehler für „den Chat“, siehe Frage 2.)
7. **Karte:** `M` öffnet/schließt die Vollkarte; Klick auf die Minikarte öffnet sie ebenfalls (heute: Klick = Ziel setzen → bleibt in der Vollkarte erhalten).

## Phase 3 · Wetter-Modi (unabhängig von Tag/Nacht)

Erweiterung `wetterSystem.js` (Zone-Wetter, ≙ `ZUSTAND.wetter`): neue Arten **`gewitter`**, **`sturm`** (Wind), **`schneesturm`**; vorhandene `regen`, `schnee`, `nebel`, `klar` bleiben.
- **Zonen-Logik:** normale Zonen: klar/regen/gewitter/nebel/sturm. Schneezonen: klar/schnee/schneesturm/nebel/sturm. Wechsel zufällig wie bisher, Admin kann jeden Modus setzen (`setzeWetter` + Admin-Knopf-Reihe, Konsole `browserSurvival.wetter(art)`).
- **Gewitter:** dichter Regen + Blitze (zufälliges Aufleuchten über `#tageslicht`/Himmelslicht, 1–3 Flackern), Donner verzögert nach Abstand, Regen löscht Feuer wie bisher, Wachstum ×2, **Sicht leicht eingeschränkt**. Optional später: Blitz kann einzelne Bäume/Autos treffen (nicht in dieser Runde).
- **Wind/Sturm:** Bäume/Gras schwanken stärker (Shader-/Uniform-Faktor in `baumModell`/`natur`), Blätter-/Staub-Partikel (`blaetterEffekt`), Regen/Schnee schräg; Wind-Sound-Loop. Spieler-Tempo bleibt unverändert (kein Gameplay-Nachteil in dieser Runde).
- **Schneesturm:** sehr dichter, schräger Schnee, Nebel nah, starker Wind-Loop, **erhöht Auskühlung** (Phase 9).
- Client: `wetterEffekt.js` bekommt Parameter `intensitaet`, `windStaerke`, `blitz`; Audio-Schichten in `sound.js` (Regen leicht/stark, Donner nah/fern, Wind leicht/stark, Schneesturm-Heulen) – Atmosphäre-Bus.
- Protokoll: `wetter` bleibt ein String → nur neue Werte, kein Format-Bruch (Client ohne Kenntnis fällt auf `klar` zurück).
- Test: `wetterSystem` Übergänge je Zonentyp, Admin-Setzen, Kältefaktor je Modus.

## Phase 4 · Audio-Atmosphäre (Tag/Nacht/Umgebung)

- **Tag:** Vogelgezwitscher-Loops (2–3 Arten, Waldanteil → mehr), vereinzelt Krähe, Insekten/Bienen, leiser Wind. Heute gibt es nur einen synthetischen Vogel (clientSpiel `vogel`-Ereignis) – wird durch echte Samples ersetzt, per Zufall gestreut statt Dauerschleife. Nicht in Schneezonen (dort: leiser Wind, selten Krähe).
- **Nacht:** Grillen (nur bei klarem Wetter, Gras), Eulen (selten), Fledermaus-Flattern, fernes Hundebellen/Heulen sehr selten; dunklere Stimmung: Nachtluft-Drone leise, Nachtlichtfarbe etwas kälter/dunkler (Parameter in `tageszeit`/Client-Lichtfalle beachten! Kein „fast schwarz“ am Kartenrand).
- **Regeln:** Alle über `Sound.spieleAtmosphaere` (Atmosphäre-Bus, am Kompressor vorbei); Wetter blendet passende Schichten aus (Regen/Gewitter → keine Grillen/Vögel); Einstellungen: bestehender Atmosphäre-Regler. Räumlich: zufällige Panoramaposition pro Einzelruf.
- Sounds kommen als `client/audio/eigene/<ereignis>_N.ogg` + `npm run sounds` (bestehender Mechanismus, neue Namen in `eigeneSounds.js EREIGNISSE`).

## Phase 5 · Sound-Paket Aktionen, Zombies, Spieler, Auto

1. **Zombie-Horror:** Neue Angriffs-, Brüll-, Sterbe-Sounds (tief, gurgelnd, kehlig; Pitch-Variation je Variante: Brocken tiefer, Läufer heiser), gelegentlich Zombie-Rufen aus der Ferne. Alte Samples bleiben als Varianten, wenn passend.
2. **Proximity + Richtung:** Zombie-Sounds über `PannerNode` (HRTF, `distanceModel: inverse`, `refDistance`≈1 Kachel, `maxDistance` = Sichtweite). Position relativ zur Kamera/Figur, Hörer = Blickrichtung. Mono/Stereo-Fallback: einfacher `StereoPanner` + Lautstärke nach Entfernung (Kopfhörer ohne HRTF). Gilt auch für Zombie-Tod, Schüsse anderer Spieler, Auto-Motor anderer.
3. **Abbau-Sounds:** Stein (Spitzhacke auf Fels) und Eisen (metallisch, heller) als Loops/Einzelschläge **an die Animation gekoppelt**: ein Schlag-Sample pro Schwung, kein Nachklingen über das Ende hinaus; beim Abbruch/Fertig sofort `stoppeKurze()`. Dasselbe für **Holzhacken**: Schlagzahl = Animationsschläge, Sound endet mit dem Fall des Baums (`seitSchwung`/Baumfall-Zeitpunkt aus dem Renderer als Taktgeber; Server liefert `abbauEnde`).
4. **Spieler-Stimme:** `atem_ausser` (nach Sprint, ausgepowert), `schaden_0–3`, `tod` (m/w je nach `aussehen`, sonst neutral), optional `husten` (Kälte). Auslöser: Ausdauer < Grenze, Treffer-Ereignis, Tod-Ereignis.
5. **Auto:** `crash_leicht/schwer` (nach Aufprallstärke aus `AUFPRALL_MIN_KMH`…), `ueberfahren_zombie` (matschig/dumpf), `auto_zerstoert` (Explosion/Knall + Metall). Ereignisse kommen schon vom Server (`schlageFahrzeug`, Überfahren, Wrack) → nur Ereignis-Mapping + Samples.

## Phase 6 · Hase (Tier 2.0)

- Echtes Modell (Quaternius/Kenney, CC0) mit Hoppel-Animation (Clip oder prozedural: Sprungbogen) ersetzt `tierModelle.js`-Hase; Größe wie bei jedem Modell nachmessen (Höhe via Vertex-Box, Ziel ≈0,3 Spielerhöhe) und in `HOEHEN` eintragen.
- **Schüchterner:** `hasenScheuRadius` 150 → ~280, Wahrnehmung schon bei Gehen/Rennen, Erschrecken durch Schüsse (Radius 600) und Autos. Flucht: nicht nur Radius verlassen, sondern **Fluchtstrecke ~800–1200 px**, im Zickzack, bleibt erst nach „Sicherheitsabstand + Wartezeit“ stehen; Zickzack-Hoppeln (`hasenTempo` ~150, kurze Sprints mit Pausen), verlässt das Sichtfeld sauber. Ruhezustand: Schnuppern/Ohren, hoppelt in Gruppen von 1–2.
- Sounds: leises Rascheln/Hoppeln, Fieps bei Schreck/Tod (CC0 Tier-Foleys), Aufprall beim Überfahren (Phase 5). Proximity wie Zombies.
- Tests: Flucht-Strecke, Schreck durch Schuss, Respawn bleibt.

## Phase 7 · Häuser & Dächer (Optik)

- **Bestandsaufnahme zuerst (Bericht):** Karten-Häuser = `kartenModell.#baueDaecher`/Wände (Flat-Quader mit Prozedural-Texturen), Basisbau = `basisbauModelle` (GEO_BAUPLAN), Villa nutzt GLB-Modelle. Ziel: **Karten-Häuser und Basisbau-Wände/Dächer** wirken hochwertiger.
- **Vorgehen:** Material-Upgrade statt komplettem Neubau: CC0-PBR-Texturen (ambientCG/Kenney, 256–512 px: Putz, Holz, Backstein, Ziegeldach, Wellblech) mit Normalmap-Light; Fensterrahmen/Sockelleiste/Dachüberstand als Zusatz-Geometrie. Falls ein Modul-Paket (Quaternius „Modular Buildings“/Kenney „Building Kit“) deutlich besser aussieht und in die Kachelraster (32 px) passt, als zusätzliche Optik per `INSTANZ_TYPEN`.
- **Muss erhalten bleiben:** Wand = ganze Kachel (Kollision/Sicht), durchsichtige Wände beim Betreten (Silhouette), Dach-Flood-Fill-Ausblenden, Instanzierung (Performance), Draw-Call-Budget (F3). Vorher/Nachher-Screenshots + FPS-Vergleich im Bericht.
- Reihenfolge nach Phase 1 (Schneeflecken-Fix gehört hierhin mit rein).

## Phase 8 · Bots (Test-Spieler)

- **Zwei Bots pro Karte** (Config `bots.proKarte: 2`), Server-seitig als „Spieler ohne Verbindung“ (`bot: true`) in der Zone; erscheinen in der Spielerliste (Name `Bot-Anna` o. ä., Marker 🤖), im Chat stumm.
- **Verhalten** (`systeme/botSystem.js`, Zustandsautomat, nutzt vorhandenes `pfadfindung`/A*, Sicht `sichtlinieFrei`, denselben Eingabepfad wie Spieler → keine Sonderphysik):
  `wandern` (Wegpunkte, Pausen, Blick schweifen) → `looten` (Lootpunkte/Items in Reichweite, Rucksack-Platz prüfen, Essen/Trinken bei Bedarf) → `kaempfen` (Zombie in Sicht: Pistole auf Distanz, Nahkampf wenn leer; Rückzug bei <35 % Leben; Nachladen) → `fliehen`/`heilen` → `schlafen` nachts. Reaktionszeit 0,3–0,6 s, leichte Zielungenauigkeit, kein Wallhack, vergisst Ziele nach Verlust der Sicht.
- Sie bleiben „menschlich“: kleine Umwege, nicht perfekt, gehen keine toten Winkel in Zombie-Horden.
- **Admin:** Knopf „Bot hinzufügen (Linksklick auf Karte)“ → Klick in der Welt setzt Bot dort (ADMIN_BEFEHLE `BOT_SETZEN {x,y}` / `BOT_ENTFERNEN {id}`), Liste mit „entfernen“ im Admin-Fenster. Bots werden nicht gespeichert (kein Konto), starten bei Zonenstart neu.
- Bots können nicht Konten/Spielstände beschädigen (`bot` überspringt Autosave) und zählen nicht in „online“-Statistik/Chatlogs.
- Tests: Bot überlebt X Minuten gegen Zombies, löst nie Exceptions aus, Entfernen/Setzen via Admin, Pfad-Stuck-Erkennung.

## Phase 9 · Kälte & Kleidung

1. **Kälte-Mechanik:** Neuer Wert `kaelte` (0 = warm, 100 = erfroren; im HUD ein Eis-Icon-Balken, nur sichtbar, wenn > 0 oder in Kältezonen).
   - Auskühlung/s = Basis (Schneezone `0,4`, Nacht `0,15`, Regen `+0,15`, Gewitter `+0,25`, Schneesturm `+1,0`, Wind `+0,1`, Wasser `+0,5`) − `Wärme` aus Kleidung.
   - Aufwärmen: Nähe zu brennendem Lagerfeuer/Schmelzofen (≤ 3 Kacheln), Innen (`istInnen`), Schlafen im Bett, Auto (drinnen), warmes Essen.
   - Folgen: ab 60 % Ausdauer-Regeneration schlechter + Zittern (Kamera/Atem-Sound), ab 85 % langsam Leben verlieren (`fuegeSchadenZu`, Quelle `kaelte`), 100 % → kein sofortiger Tod, sondern Dauerschaden ~1 HP/2 s.
   - Konfiguration in `spielKonfiguration.js` (`kaelte: {…}`); Tutorial-Konfig: aus.
2. **Kleidung (Ausrüstungs-System):** Neue Item-Kategorie `kleidung` mit `slot` (`kopf`/`oberkoerper`/`beine`/`fuesse`), Werten `waerme` und `platz` (zusätzliche Inventarslots, wirkt wie Rucksack addiert) – **keine Rüstung, nur Wärme + Platz** (laut Wunsch). Beispiele: Mütze, Wollmütze, Jacke, Winterjacke, Weste mit Taschen, Jeans, Thermohose, Stiefel, Handschuhe(Schlüsselwert später).
   - Datenmodell: Spielerfeld `ausruestung {kopf,oberkoerper,beine,fuesse}` (Item-Referenzen); Spielstand erweitert (v1, abwärtskompatibel: fehlendes Feld = leer); Netz: `spielerDaten.ausruestung` privat, `aussehenKompakt` bekommt Kleidungs-IDs für andere Spieler. AKTIONEN: `anlegen{slot,von}` / `ablegenAusruestung{slot}` → `PROTOKOLL_VERSION`++. Anlegen aus dem Inventar per Drag&Drop auf den Charakter-Slot (Phase 2).
   - Inventargröße = Basis + `rucksack` + Σ`platz`; beim Ablegen mit vollem Inventar: Kleidungsstück bleibt angelegt, Rückgabe-Check wie beim Rucksack.
   - **Loot:** auffindbar in Lootkisten/Schränken (Kleiderschrank-Räume), Schneeland-Villa mit Wintersachen, Zombies droppen selten Kleidung. Eintrag in `lootTabellen.js` (Räume j/k + neue Kategorie `kleidung`).
3. **Optik am Charakter:** Kleidungs-Set aus dem Netz (z. B. Quaternius „Modular Character Outfits“, Kenney „Blocky Characters“/Poly-Pizza-Kleidungsstücke, CC0/CC-BY). **Machbarkeit:** `figur_mann.glb`/`figur_frau.glb` (und FBX-Figur) sind geriggt. Pfad A: Kleidung als Skinned-Mesh teilt das Skelett (wenn Rigs kompatibel) → am besten; Pfad B (Fallback): Zubehör pro Knochen anhängen wie `haarModell` (Mütze → `Head`, Jacke als dünne Hülle auf `Spine`, Stiefel `Foot`). Kann ein Teil nicht sauber angepasst werden, wird es **Textur-Overlay/Farbtönung** der Körper-Textur (`skins/humanMaleA.webp`) – Optik lieber schlicht als kaputt. Entscheidung nach 30-Minuten-Technikspike zu Beginn von Phase 9; Bericht.
4. **Tests:** Kälte-Raten je Wetter/Ort, Aufwärmen, Schaden, Ausrüsten/Ablegen, Platzgewinn, Spielstand-Roundtrip/Altstand, Protokoll-Validierung (unbekannter Slot, fremdes Item).

## Reihenfolge, Aufwand, Risiken

| Phase | Aufwand | Risiko | Abhängigkeit |
|---|---|---|---|
| 1 Fehler/Kleinkram | klein | niedrig | – |
| 2 UI | mittel–groß | mittel (Charakter-Vorschau, Touch) | Icons (Quellen) |
| 3 Wetter | mittel | niedrig–mittel | Sounds aus 4/5 |
| 4+5 Audio | mittel (viel Suche/Schnitt) | Quellenlage/Lizenz | Browser-Dekodier-Workflow (CLAUDE.md §6) |
| 6 Hase | klein–mittel | niedrig | Modell finden |
| 7 Häuser | mittel–groß | Performance/Look | nach 1 |
| 8 Bots | groß | mittel (Verhalten glaubwürdig) | – |
| 9 Kälte+Kleidung | groß | Rig-Kompatibilität | UI (2), Wetter (3) |

- Jede Phase: eigener Commit auf `main` + Push, `npm test` grün, KI_INDEX §23+ und Manifest-Changelog nachgezogen, Credits aktualisiert.
- Internetzugriff läuft über den Proxy; scheitert ein Download (Netz/Rechte), wird das Item ohne Notlösung nicht erfunden, sondern gemeldet.
- Alles Spielbalancing (Kälterate, Hasentempo, Lootgewichte) in `spielKonfiguration.js`, damit der Developer-Modus es live anpassen kann.

## Offene Fragen an den Nutzer (nur wo es das Ergebnis ändert)

1. Abgeschnittener Punkt „… wenn man was auswählt im spiel und es z.b. …“ – bitte vervollständigen.
2. „baum Chat öffnen … TAB … direkt/global“: Meinst du den **Chat**, und soll Tab *im geöffneten Chat* umschalten (außerhalb bleibt Tab = Inventar)?
3. Kältetod: sanfter Dauerschaden (Vorschlag) oder echter Tod bei 100 %?
4. Bots: dürfen sie auch Autos fahren? (Vorschlag: nein, erstmal nur zu Fuß.)

Vorschlag: ohne Gegenrede starte ich mit Phase 1 und nehme meine Vorschläge bei 2–4.

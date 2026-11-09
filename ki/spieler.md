# Spieler · Inventar · Items · Überleben · Mehrspieler
> Lesen bei: Items/Inventar/Kleidung, Essen/Trinken, Hunger/Kälte/Nässe/Gesundheit, Schlafen/Sitzen, Tod/Respawn, Skills, Gruppe/Handel/Chat, Tutorial/Tagebuch.
> Kürzel: S: `server/spiel/` · C: `client/` · G: `gemeinsam/` · K: `server/spiel/konfiguration/` · Werte = K:`spielKonfiguration.js` ★

## Bewegung
- `G:physik/bewegung.js wendeEingabeAn` (Server + Vorhersage identisch): Grundtempo K `spieler.geschwindigkeit` 100 (leichtes Joggen), Shift+Ausdauer `sprintFaktor` 1,7, erschöpft `joggFaktor` 1,25; Wasser `wasserFaktor` 0,5 (`gehBlockiert`); `tempoFaktor` (Skills × Bein × Erschöpfung, gesetzt von `gesundheitSystem` jeden Tick). Admin-Flug `spieler.fliegen`. Autorun Taste `^`. Runde 47: Ducken (Eingabe `ducken`, Umschalter im Client `clientSpiel.duckenSetzen`) → `duckFaktor` 0,55 (über `physikParameter`!), Shift hebt es auf, `koerper.duckt` → öffentlich `duckt` (Clips ducken/schleichen, ki/figuren.md), Zombies `zombie.duckSichtFaktor` 0,55.

## Items & Inventar
- Items: K:`gegenstaende.js` ★ (Kategorie, `inHand`, `haltbarkeit`, `naehrwert`/`durstwert`, `heilt[]`, `buff`, `verdirbt`/`verdirbtZu`, `slot`+`waerme`/`schutz`/`regenschutz`/`plaetze` bei Kleidung, Waffenwerte → ki/kampf.md). ⚠ `GEGENSTAENDE`-Einträge nicht einfrieren (Developer-Modus schreibt); Stapelgrößen aus `normalisiere()`. Studio-Item-Editor schreibt `K:studioDaten.js` (nicht von Hand).
- Neues Item: Eintrag in `gegenstaende.js` + Icon (`werkzeuge/assets/baue_assets.py --nur-items` bzw. `--editor-items`, s. ki/assets.md) + optional 3D-Bodenmodell `C:darstellung/itemModelle.js` + Loot `K:lootTabellen.js` / Rezept `K:rezepte.js` → `npm run ki:anleitung` → Test „Jeder Gegenstand hat ein Icon“ (`tests/inhalte`).
- `S:systeme/inventarSystem.js` = Dispatcher ALLER AKTIONEN (`verarbeiteAktionen`) + aufheben/ablegen/tauschen/benutzen/Rucksack/Kleidung (`zieheAn`/`zieheAus`, `inventarGroesse` = 16 + Rucksack + Taschen, max `INVENTAR_MAX` 32, `passeInventarAn`). `HOTBAR_PLAETZE` 10 (Taste 0 = Platz 10). Zusatzdaten wandern mit `zusatzVon` (haltbarkeit, mods, verderb) → `fuegeZumInventarHinzu(…, magazin, zusatz)`.
- Konsum: `starteKonsum` → `spieler.arbeit {art:'konsum'}` (K `konsum.dauer` 5 s, Abbruch bei Bewegung/Schaden) → `konsumiere` → `gesundheitSystem.wendeItemAn`. Doppelklick im Inventar = konsumieren. Tests setzen `STANDARD_KONFIGURATION.konsum.dauer = 0`.
- Hand-Items (`inHand`): Linksklick-Aktionen laufen in `kampfSystem` (Essen, Holz ins Feuer `schuereFeuer`, Samen pflanzen, Flasche füllen); Hacke = Feld (AKTION `feld`, Taste G nur Kofferraum!). Q wirft 1 Stück. Haltbarkeit: `nutzeWerkzeug`; ⚠ Kiste/Boden/Station geben den Wert nicht weiter.
- Boden-Drops: Ressourcen fallen einzeln (menge 1) neben den Fundort (`arbeitSystem.lasseRessourceFallen`, Verfall 600 s); Aufheben stapelt; Umgebungsliste `#inventar-umgebung` (Radius 110). Tests: `tests/hilfen/aufheben.js` (`hebeAlleAuf`).

## Überleben (`S:systeme/ueberlebenSystem.js`, `gesundheitSystem.js`)
- Hunger/Durst (K `spieler.hunger/durstProMinute`), Regeneration erst ab 80 % Hunger UND Durst. Kälte `kaelte` 0–100 (Schneezone/Nacht/Wetter × max(minFaktor, 1−Wärme/100); drinnen/Auto/Bett/Feuer baut ab). Nässe 5 Stufen → Erkältung (K `naesse`, `regenSekunden`; trocknet nur bei klar + Tag). Blutung (Schlag 20 %, Schuss immer; `blutfleck`-Ereignis), Infektion, Bruch, Vergiftung, Müdigkeit, Buffs satt/warm/kraft, `gemuetlich` (Kamin/Möbel, `G:welt/einrichtung.js istGemuetlich`).
- `welt.istUnterDach` = kein Regen/Schnee (auch Türzargen). Gottmodus hält alles voll; `friedlich`-Zonen pausieren alles.
- Client: HUD-Werte `#hud-werte` (Kälte/Müdigkeit/Nässe nur wenn relevant), Zustands-Chips `#hud-zustand`.

## Schlafen · Sitzen · Spawn
- Betten `G:welt/einrichtung.js BETT_TYPEN` (bett, doppelbett, schlafsack, zelt) + `bettBei`; Schlafen `arbeitSystem` (6 h vorspulen, zonenübergreifend `spuleZeitVor`/`holeZeitNach`, Wetter `spuleWetterVor`), nur Schaden weckt. E am eigenen Bett = Spawn (`S:systeme/spawnSystem.js`, `spieler.spawn`).
- Sitzen: AKTION sitzen (Taste Ä / 🪑) → `S:systeme/stationSystem.setzeHin`: Stuhl/Bank in Reichweite (`G:welt/sitze.js findeSitz`, belegt = `sitzBelegt`) → `arbeit.ort {x,y,blick,hoehe,sitz:true}` (= öffentlich `arbeitOrt`), sonst Boden; Feuer ≤150 px = „am Feuer“ (heilt, Zombies ignorieren Sitzende). Darstellung → ki/figuren.md.

## Tod · Niederstrecken · Leiche
- Schaden nur über `kampfSystem.fuegeSchadenZu` (→ ki/kampf.md). `toeten` → mit anderen lebenden Menschen in der Zone erst `streckeNieder` (K `mehrspieler.niederDauer`; nie für Bots; Tests: `toeten(…, {endgueltig:true})` oder `niederDauer: 0`) → Leiche `S:systeme/leichenSystem.js` (Inventar+Kleidung, AKTION `leiche`, nach 120 s nur Rucksack) → Respawn Startzone/Bett (`wiederbeleben`; fremde Zone via `zonenwechsel {spawn:true}`). Level-Reset bei Tod.

## Skills · Level · Erkundung
- `S:systeme/levelSystem.js` (XP je Zombie-Variante, Abbau-XP), Skills `G:spieler/skills.js` ★ (tempo, staerke, leben, sammeln) → `wendeSkillsAn`. Fenster `C:ui/skillFenster.js` (U).
- Erkundung `G:welt/erkundung.js` (Bitfeld base64 je Karte), Karte `C:ui/karte.js` (M/K).

## Mehrspieler (`S:systeme/mehrspielerSystem.js`, K `mehrspieler`)
- Gruppe (Flaggen-Besitzer + `flagge.mitglieder`), Handel (`spielWelt.handel`, Slots, bereit), Wiederbeleben (`helfen`, Erste-Hilfe-Kasten), Verarzten (AKTION `verarzten` {ziel, slot} → Arbeit 'verarzten' = konsum.dauer, bricht ab bei > reichweite×1,5; Kasten an Niedergestreckten = `helfen`). UI `C:ui/mehrspielerFenster.js` (E an Mitspieler: Handeln, Einladen, 🩹 je Medizin).
- Chat nur Zone (`spielServer.#chat`), `/a Text` global; Sprechblasen `renderer.zeigeSprechblase`. Bot-Befehle im Zonen-Chat → ki/npc.md. Spielerliste `SPIELER_LISTE` ~1/s (Taste I; `anzeige` = Charaktername).
- Emotes: AKTION `emote` {wert = Index in `G:spieler/emotes.js` EMOTES (nur hinten anhängen!)}, Sperre `EMOTE_PAUSE_TICKS`, Ereignis `emote` → `renderer.zeigeEmote` (Overlay, `beschriftung.zeichneEmote`).
- Kartenmarker `S:systeme/markerSystem.js`: `spieler.marker` [{id, karte, x, y, text, sicht ich|gruppe|alle}] (Spielstand, max 20), AKTION `marker`, `SpielServer.#sendeMarker` (alle 10 Ticks, Gruppen aus ALLEN Zonen-Flaggen) → NACHRICHT.MARKER → `karte.marker` (große Karte + Minikarte, Rechtsklick/langes Tippen = Dialog).
- Funkgerät `S:systeme/funkSystem.js`: Item `funkgeraet` (Startausrüstung; alte Stände bekommen es einmalig), `spieler.funk` {an, frequenz 875–1080 (Zehntel-MHz)} im Spielstand, AKTION `funk` {was an|aus|frequenz|senden}; `SpielServer.#sendeFunk` → NACHRICHT.FUNK {an, bereit, geraet, frequenz, funkt, partner[{sid,name,funkt}]} (zonenübergreifend). Heli-Absturz schickt Funkgeräten einen Mayday.
- Sprach-/Funk-Audio `C:audio/stimmChat.js` (WebRTC P2P; Adresse = Sitzungs-ID `sid` (bleibt über Zonenwechsel), Signal NACHRICHT.STIMME – Server erlaubt gleiche Zone ODER Funkpartner). Je Verbindung 2 Transceiver in fester Reihenfolge: 0 = Nähe (Abstand/Stereo), 1 = Funk (Bandpass + Sättigung, Knacken, Rauschen). `zustand()` für Tests. Tasten V (Nähe) / Z (Funk), 🎤/📻-Knöpfe.
- Kick: Admin-Befehl `kick` {wert: Name} → `SpielServer.kicke` (Name bis Neustart in `gesperrt`).

## Tutorial · Tagebuch
- Tutorial = eigener SpielServer im Tab (`lokalerServer.oeffneTutorialKanal`, Karte `S:karten/tutorial.js` ← `tutorial.py`), Ablauf als Daten `S:tutorial/skript.js` (KAPITEL/aufgaben/FUNK), Engine `S:systeme/tutorialSystem.js` (liest `spielWelt.ereignisse`), UI `C:ui/tutorialAnzeige.js`, Stimme `C:audio/funkstimme.js` (`werkzeuge/audio/tutorial_stimme.py`). Tests `tests/tutorial.test.js` (Durchspiel-Bot). ⚠ Zombies öffnen keine Türen (brechen auf).
- Tagebuch/Ziele: K:`ziele.js` (KAPITEL, Zähler) → `S:systeme/zielSystem.js` → `C:ui/tagebuchAnzeige.js` (J). Tests `tests/ziele.test.js`.

## Tests
`gameplay` (Kampf, Tod, Ressourcen), `skills`, `spielstand`, `runde13` (Hand-Items, Haltbarkeit), `runde23` (Kälte/Kleidung), `runde24` (Gesundheit P11, Wasser P12, Miteinander P14), `runde28` (Nässe/Blutung), `runde29` (Konsum), `runde42`/`runde44_2` (Sitzen), `runde45` (Sitzpose-Darstellung), `runde47` (Tasten, Funk, Emotes, Marker, Verarzten, Ducken, Auto-Teile, Absturz, Hosten).

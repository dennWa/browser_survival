# Zombies · Tiere · Haustiere · Bots
> Lesen bei: Zombie-Verhalten/Varianten/Horde/Spawns, Hasen/Wild/Haustiere, Bot-Verhalten oder Bot-Chat-Befehle.
> Kürzel: S: `server/spiel/` · C: `client/` · G: `gemeinsam/` · K: `server/spiel/konfiguration/` (Werte K:`spielKonfiguration.js` → `zombie`, `horde`, `tiere`, `haustiere`, `bots`)

## Zombies
- Entität `S:entitaeten/zombie.js` (`waehleZombieVariante(zufall, konf, tag, extra)`; ⚠ ohne Tag = Tag 1). Varianten K `zombie.varianten`: normal, laeufer, halb, brocken (Boss) + Sonder mit `abTag`: sprinter 3, spucker 5, gepanzert 8, explosiv 10.
- KI `S:systeme/zombieSystem.js`: Sicht (`siehtZiel`, nicht ins Haus `istInnen` – außer eigenes Ziel), Hören (`alarmiereZombies`, `wittere`), A* `G:physik/pfadfindung.js` (watet), Tür-Engstellen-Reservierung, Stuck-Check NACH `trenneZombies` (`tickStartX/Y`), `gibAuf` bei unerreichbarem Ziel, Autos: Anlaufpunkt `autoAnlaufpunkt` + Schlag ab 22 px. Sitzende/Innen-Spieler werden nicht gewittert. Türen brechen sie auf (`tuerSystem`), öffnen nie.
- Sonder-Verhalten `S:systeme/sonderZombieSystem.js` (Spucke als Flug, Explosion via `explosionSystem`, Panzer in `fuegeSchadenZu`).
- Horde/Progression `S:systeme/tageszeitSystem.js hordeFuer(konf, tag)` (normal|boss|blutmond) → `schickeHorde`; `spielWelt.nachtArt` → Client Blutmond.
- Spawns: Karten-`Z`-Marker + `zombieBereiche` (`S:karten/zombieBereiche.js`), Zonen-Einstellung `zombie.dichte/respawnZeit/nachtHorde`.
- Darstellung (Renderer `ZOMBIE_MODELLE` + `zombieModellFuer(e)`): normal/laeufer → `skelett` (`client/assets/3d/zombies/skelett.glb`, eigene Textur, eigene Clips inkl. sterben), Sonder → `gruen` (`eigene/zombie-2.glb`) + Tönung `SONDER_TOENE` + Anbauteile `#sonderTeile`, brocken → `koloss`, halb → `halb`; UV-Atlas `C:darstellung/zombieTextur.js` (für die Quaternius-GLBs). Kenney-FBX nur Fallback. Leichen bleiben 120 s (Client, `ZOMBIE_LEICHEN_MAX` 25). Fern = halbe Animationsrate, Pool `#holeFigur`, max. 2 neue Figuren je Bild.
- Sounds: `clientSpiel.#zombieSound` (räumlich, dumpf ohne Sichtlinie), Ereignisse zombie_stoehnen/angriff/schrei/tod/ferne.

## Wild & Hasen (`S:systeme/tierSystem.js`, Entität `S:entitaeten/tier.js`)
- `WILD_ARTEN` hase|reh|hirsch|fuchs, Werte `wildWerte(k, art)` aus K `tiere.wild[art]` (Hase = alte `hasen*`-Felder). Sehr scheu: `schreckQuelle` (Spieler im scheuRadius, Sprint/Auto ×, Schüsse), Flucht im Zickzack + Haken, Herde flieht mit (380 px). Spawn nur in `tierBereiche` mit `art`. ⚠ Tiere ignorieren unsichtbare Spieler (`ich().unsichtbar = true` zum Nah-Prüfen).
- Modelle: Hase `C:darstellung/tierModelle.js` (`hase.glb` mit Clips), Wild `C:darstellung/haustierModelle.js` `MODELLE` + `WILD_CLIPS` (deer/stag/fox.glb, Clips Idle/Eating/Walk/Gallop).

## Haustiere (`S:systeme/haustierSystem.js`, K `haustiere`)
- hund|katze|huhn: zähmen mit Futter (`zaehmChance` 0,1 je Futter; Tests: 1), Huhn fangen (Item), Bleib/Folgen, Freilassen (`haustierFreilassen`), `begleite` über Zonen (spieler.haustiere). Hund bellt/beißt Zombies; Katze schläft beim sitzenden Besitzer. Streuner `spawneWildeTiere` nur auf Karten ≥ 4000 Kacheln und ohne Karten-Start-Tiere; Karten-Feld `tiere` → `spawneStartTiere` (Lager-Katze).
- Modelle `C:darstellung/haustierModelle.js` (r32_tier_hund/katze.glb statisch + prozedurales Wippen); Katzen-Textur optional `katzeTextur.js` (`assets/3d/skins/katze.png`).

## Bots (Spieler-Entitäten ohne Verbindung, `spieler.bot`)
- `S:systeme/botSystem.js` (`spawneBot`, `aktualisiereBots` vor den Eingaben): schieben je Tick 1 Eingabe (seq) + AKTIONEN; A*, Sicht, Loot, Flucht, Nahkampf; wehren sich (`bot.feindId`). K `bots.proKarte` (Standard 0! `server/node/start.js` setzt 2 bzw. Env `BOTS`, Lokal-Modus 2). Kein Zonenwechsel, zählen nicht beim Schlafen, nicht gespeichert, nie niedergestreckt. Admin `botSetzen/botEntfernen`.
- Lager-Alltag `S:systeme/botLager.js` (friedliche Zone oder `bot.befehl==='feuer'`, aus `botSystem.folgeZiel`): sitzen (freier Sitz, 25–70 s), wärmen, anschauen, schlendern. Chat-Befehle `botBefehl(spielWelt, von, text)` ← `spielServer.#chat` (nur Zonen-Chat; Regex SETZEN/AUFSTEHEN; Bot-Name im Text = nur dieser), Antwort als CHAT `{von: botName, bot:true}`. Test-Chat: `browserSurvival.spiel.chat('setzt euch')`.

## Tests
`gameplay` (KI, Türen-Stress, Haus-Tarnung), `runde24` (P2 Sonder/Horde, P9 Haustiere), `runde27` (Zähmen), `runde41` (Wild), `runde23` (Hase, Bots), `runde29` (Bots wehren sich), `runde44_2` (Bot-Alltag/Befehle, Lager-Katze), `zombieBereiche`.

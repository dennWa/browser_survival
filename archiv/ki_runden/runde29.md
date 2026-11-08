# Runde 29 (2026-11-03, neueste)

> Tests tests/runde29.test.js. Sound-Paket, Wasser, Konsum-Dauer, Bots wehren sich, Autos beschießbar, Effekte.

- **Audio neu** (`client/audio/eigene/`, alte Dateien `archiv/audio/runde29/`): regen (leicht), regen_stark (nur Starkregen/Gewitter, Überblendung in `G:audio/umgebung.js`), nacht, tag, wind_leicht/stark, blizzard_a/b (Schneezone statt wind_*, Wechsel `zeit`, BLIZZARD_ZYKLUS 100 s), donner_0-3, baum_faellt, spieler_tod_frau, zombie_stoehnen_8-13, schritt_innen_0-7, menue_klick (`main.js`: ohne `aktuellesSpiel`), essen/trinken/verband. Schnitt im Browser (Bezugspegel = RMS alte Datei, Loops mit Equal-Power-Crossfade, Opus über `editor/ui/audioKodierer.js`).
- **`anziehen`:** alte Red-Library-Dateien hatten Sprache (vermutlich „red shoulder“) → archiviert, jetzt Rezept in `sound.js`. ⚠ Red-Library-Files können Ansagen enthalten; vor Einbau anhören. Bots: Tod/Husten/Anziehen im Client stumm (`#istBot`), Treffer = `treffer_zombie`.
- **Drinnen:** `Sound.setzeDrinnen` → Tiefpass `#draussenFilter` auf Draußen-Schichten (`DRAUSSEN_SCHICHTEN`, wind, regen, nacht); Kurz-Geräusche `spiele({draussen:true})`. Pegel weiter in `wetterSchichten` (`DRINNEN_LEISE`). Türzarge zählt als drinnen: Client + Nässe nutzen `welt.istUnterDach`.
- **Weg:** einzelnes `vogel`, `heulen` (Ereignisse bleiben, nicht mehr ausgelöst). Schaden-Schrei nur noch am `treffer`-Ereignis mit `id` (vorher Lebens-Differenz in `#datenSound`, kam beim Essen).
- **Wetter:** neue Art `starkregen` (K:`wetter.starkregenAnteil`, Wind ≥ 0,7, kaelte `starkregen`) in `WETTER_ARTEN`, `WETTER_ZIELE`, `wetterDerZone`. Donner 0,5–2 s nach Blitz.
- **Wasser:** Kachel bleibt für `istBlockiert` blockiert (Autos, Bauen, Spawn, Bot-Ziele). `welt.istWatbar/istWasser`, `bewegung.js gehBlockiert` (Tiere nicht, außer Hund), `wasserFaktor` 0,5 (Spieler, Zombies, Hund), `findePfad` `waten` (Standard an, Kosten +1). Renderer `WASSER_TIEFE` 15 px.
- **Konsum:** `inventarSystem.starteKonsum` → `spieler.arbeit {art:'konsum',klang,slot,defId,handLeeren}`, K:`konsum.dauer` 5 s, Ereignis `konsumTakt`, Ende `arbeitSystem.konsumiereWeiter` → `konsumiere` (wirkt sofort, Tests setzen `STANDARD_KONFIGURATION.konsum.dauer = 0`). Abbruch: Bewegung > 6 px, Schaden. Linksklick bricht nicht ab.
- **Nässe:** `regenSekunden` 15; draußen trocknen nur `klar` und Tag (120 s je Stufe).
- **Bots:** `streckeNieder` nie für Bots (lagen sonst mit Arm-Haltung zuckend da; Renderer zeigt am Boden keine Haltung/Waffe). `wehreDich` (aus `fuegeSchadenZu`) → `bot.feindId` 30 s, geht in `nimmWahr` vor Zombies. `moeglicheZiele`: Bots immer treffbar, Bot trifft Feind auch ohne PvP.
- **Autos:** `feuereStrahl` prüft `strahlTrifftBox`, `schlageFahrzeug(def.schaden × K:fahrzeug.schussFaktor 0,02)`, Ereignis `schuss.fz`.
- **Optik:** `C:darstellung/einschlaege.js` (Wand: InstancedMesh-Ring, Normale aus Kachelkante; Auto: Raycast aufs Modell, Kind-Mesh), `muellEffekt.js` (Sturm/Regen + Wind, längs der Straße), `blaetterEffekt` folgt Windstufe.
- **UI:** Autorun Taste ^ (`Backquote`, `clientSpiel.autorun`), `#inventar-umgebung` + AKTION aufheben `{ziel}` (K:`UMGEBUNG_RADIUS` 110), Nässe in `#hud-werte`, Admin als `#admin-tabelle`.
- ⚠ YouTube-Sounds: Lizenz nicht geprüft (credits.json sagt das). `tests/studio.test.js` „Ins Spiel schreibt die Kartendatei“ scheitert unter Windows schon vorher.

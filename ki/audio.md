# Audio · Sounds · Musik
> Lesen bei: neues Geräusch, Lautstärke ändern, Sound tauschen/schneiden, Atmosphäre (Wind/Regen/Nacht), Musik/Radio, Sprachchat.
> Kürzel: C: `client/` · G: `gemeinsam/`

## Sound-System (`C:audio/sound.js`, 1.500 Z. → `npm run ki:gliederung`)
- Vorrang je Ereignis: eigene Datei `client/audio/eigene/<ereignis>[_N].ogg|wav` > Sample `client/audio/samples/` > Synthese-Rezept (`REZEPTE`). `sound.spiele(name, {dumpf, raeumlich (HRTF), weite, kurve, draussen})`, Schleifen/Schichten `sound.schicht(name, staerke)`, `starteAtmosphaere`, `regen()`, `spieleMusik(url,{schleife,ab})`, `setzeDrinnen` (Tiefpass auf Draußen-Schichten), Busse effekte→Kompressor, atmosphäre+musik daran vorbei, `lautstaerken{gesamt,effekte,atmosphaere,musik}`. `sound.quelleVon(name)` (Tests: `browserSurvival.sound`).
- Handy: Musik über AudioBuffer statt `<audio>` (`MISCHEN`, kein Audiofokus → Spotify läuft weiter), Wachhund baut Kontext bei Tonausfall neu, `#nachholen` nach Entsperren.
- ★ Neues Geräusch: Ereignis in `C:audio/eigeneSounds.js EREIGNISSE[name] = [gruppe, wann, {loop?, stumm?}]` + Synthese-Rezept in `sound.js REZEPTE` (Test: jedes nicht-stumme Ereignis hat eins) + Auslöser im Client (meist `clientSpiel`: Ereignis-Auswertung, `#umweltGeraeusche`, `#atmosphaereSchichten`, `#zombieSound`, `SCHUSS_KLANG`) + Datei(en) → `npm run sounds` → `npm run ki:anleitung`.
- Einstellungen je Ereignis `client/audio/eigene/einstellungen.json` {lautstaerke 0..3, streuung, loop, verzoegerung, maxDauer, einmal, dateiPegel{datei:0..3}} → ⚠ nach JEDER Änderung `npm run sounds` (schreibt `eigene.json` + README aus `README.vorlage.md`), sonst wirkt sie nicht. Pegel-Faustregel: Nutzer nennt „−20 %“ → Wert ×0,8.
- Atmosphäre/Wetter-Pegel: `G:audio/umgebung.js` (Regen/Wind/Nacht/Blizzard überblenden, `HAUS_REGEN`, drinnen-Faktoren) ← `clientSpiel.#atmosphaereSchichten`. Schritte `C:audio/schritte.js` (`untergrundFuer`: gras/schnee/asphalt/innen…), Klanglandschaft der Karte `C:audio/klaenge.js`.
- Musik: Zonenmusik `C:audio/zonenMusik.js` (Ordner `client/musik/<zone>|alle|hauptmenue/`, Index `musik.json` ← `npm run musik:index`, Reihenfolge `client/musik/einstellungen.json`), Haus-Musik Radio/Plattenspieler `C:audio/hausMusik.js` (+ YouTube IFrame), Funkstimme Tutorial `C:audio/funkstimme.js`, Sprach- & Funkchat `C:audio/stimmChat.js` (WebRTC je Mitspieler 2 Transceiver: Nähe räumlich, Funk mit Hochpass 420 Hz → Tiefpass 2,9 kHz → Sättigung + synthetischem Knacken/Rauschen; Regeln → ki/spieler.md Mehrspieler).

## Sounds beschaffen & schneiden
- Quellen CC0/CC-BY (Red Library auf archive.org, OpenGameArt, Freesound …), Eintrag in `client/assets/eigene/credits.json` (Quelle + Lizenz). ⚠ Red-Library-Dateien können Ansagen enthalten → vorher prüfen. Mono 32 kHz Ogg, Loops mit Equal-Power-Crossfade.
- Werkzeuge: In Cloud-Sitzungen meist `ffmpeg` vorhanden (`volumedetect` für Pegel). Ohne ffmpeg (CLAUDE.md): Browser als Decoder – Datei kurz unter `client/` ablegen, im Browser `fetch` + `AudioContext.decodeAudioData`, WAV/Opus bauen (Opus-Encoder `editor/ui/audioKodierer.js`), per `PUT /api/editor/datei?pfad=client/audio/eigene/<name>.wav` (Kopf `X-Editor: 1`, Spielserver lokal) speichern, dann `npm run sounds`, Temp-Datei löschen.
- Alte Dateien beim Ersetzen nach `archiv/audio/<runde>/`.

## Audio-Zentrale (Editor/Studio)
- Editor: `editor/ui/audioZentrale.js` (Katalog `audioKatalog.js`, Live-Pegel, Takt/Verzögerung/maxDauer/einmal, Speichern über lokale Editor-API `werkzeuge/editor/api.mjs` – nur Loopback, Kopf `X-Editor: 1`; Server `npm run editor:lokal` oder normaler `npm start`). Studio: `studio/audio/audioZentrale.js` (→ ki/studio.md).

## Tests
`eigeneSounds` (Index, Parser, Pegel), `klanglandschaft`, `studioAudio`, `audioZentrale`, `runde26`/`runde31`/`runde38` (Pegel-Werte in umgebung.js).

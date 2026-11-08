# Karten · Zonen · Generatoren · Kacheln
> Lesen bei: Karte/Zone ändern oder neu, Übergänge, Kartenfelder, Untergründe/Kacheln, Sitze/Behälter auf Karten.
> Kürzel: S: `server/spiel/` · C: `client/` · G: `gemeinsam/` · K: `server/spiel/konfiguration/`

## Zonen (Registry `S:karten/kartenLader.js` → `KARTEN`)
| id | Generator (⚠ überschreibt die JS!) | Größe | Besonderes |
|---|---|---|---|
| `lager` | `werkzeuge/karten/lager.py` | 93×89 | Start neuer Charaktere (K `welt.ankunftsKarte`, gesetzt von `server/node/start.js` + Lokal-Modus; Standard `null` für Tests), `friedlich`, `festeZeit 20.75`, windstill, Palisade + Tor, Buffet, Lager-Katze, Bots-Alltag |
| `stadtrand` | `stadtrand.py` | 155×130 | Krankenhaus, Wohnhäuser, Teich (Angeltest), Laternen; Übergänge zu allen anderen |
| `waldweg` | `waldweg.py` (fester Seed) | 160×120 | Wald, See, Försterhütte, viel Erz |
| `schneeland` | `schneeland.py` | 155×130 | `schnee:true`, Villa (Spielordner-Modelle) |
| `waldsee` | `waldsee.py` | 150×130 | See mit Stegen `|`, Hütten, Wild-Bereiche |
| `tutorial` | `tutorial.py` | – | ⚠ NICHT in KARTEN; eigener Server (s. ki/spieler.md → Tutorial) |
- Generierte Karten-JS (`S:karten/<id>.js`) NIE von Hand ändern und nie ganz lesen (riesig). Generator ändern → `python3 werkzeuge/karten/<id>.py`. Alternative Quellen: Studio/Editor-Export `npm run karte:editor -- x.karte.json` (schreibt `S:karten/<id>.js` + KARTEN via `werkzeuge/karten/registrieren.mjs`), Tiled `npm run karte:import|export`. Deko-Nachträge Stadtrand/Waldweg: `werkzeuge/karten/r32_deko.mjs` (idempotente Marker-Blöcke).
- Übergänge stehen in BEIDEN Generatoren der Nachbarn (z. B. `stadtrand.py` UND `lager.py`). Stadtrand-Westrand y 46–48 ↔ lager `ost`; Stadtrand x0 y86–94 ↔ waldsee `ost`; Stadtrand Ost ↔ schneeland.

## Kartendefinition (Eingabe des Laders)
`{id,name,kacheln[ASCII-Zeilen],raeume{a:{name,lootTabelle}},objekte[{typ,x,y,b,h,blockiert?,ebene?,drehung?,skalierung?,z?}],typen{sf_…:{glbDatei,hoehe,…}},uebergaenge[{x,y,b,h,ziel,ankunft,name}],ankuenfte{name:{x,y}},einstellungen{…},…}` – Koordinaten in Kacheln (32 px). Marker im ASCII: `S` Start, `Z` Zombie (nur draußen), `a–z` Loot-Raum.
- Vollständige Feldliste aller optionalen Kartenfelder: Kopfkommentar von `S:karten/kartenLader.js` (Z. 30–70).
- Lader (`verarbeiteKarte`/`ladeKarte`) liefert `{daten, spielerStarts, zombieSpawns, lootPunkte, ankuenfte, einstellungen, bauwerke, tierBereiche, …}`; `ladeKarte` dünnt Wald aus (`BAUM_AUSDUENNUNG`), Tests mit `verarbeiteKarte` nicht.
- Optionale Felder (Lader prüft, reicht nach `G:Welt`/Client durch): `schnee` · `friedlich` (kein Schaden an Spielern, Hunger/Durst/Kälte pausiert) · `festeZeit` (Stunde, nur Client-Optik; HUD-Uhr echt) · `lichterketten[{von,bis,hoehe,durchhang,birnen,farbe}]` · `licht`-Objekte (`hoehe` m, `art:'kegel'`+`richtung`/`oeffnung`, `mast:true` = Laterne) · `tiere[{art,x,y}]` (Start-Tiere → `tierSystem.spawneStartTiere`; ⚠ dann KEINE zufälligen Streuner) · `tierBereiche[{x,y,b,h,art,anzahl}]` (hase|reh|hirsch|fuchs) · `zombieBereiche` (`S:karten/zombieBereiche.js`) · `spawnpunkte` (`S:karten/spawnpunkte.js`; `buffet:true` = Nachlegen ab 10 s, auch neben Spielern; `hoehe` = Tischhöhe) · `lootZonen` (`S:karten/lootZonen.js`) · `klaenge` (Klanglandschaft) · `bodenMalerei` (`G:welt/bodenMalerei.js`, nur Optik) · Objekt-`z` (m, hebt Modell an, z. B. Teller auf Tisch) · Objekt-`skalierung`.
- Zonen-Einstellungen (Kartenfeld `einstellungen`, Whitelist `S:karten/zonenEinstellungen.js` = Schnittstelle zu Editor/Studio): wetter{aktiv, windstill, regenAnteil, …}, zombie{dichte, respawnZeit, nachtHorde}, tiere{hasenMax …}, loot{…}. Prototyp-Erbe der globalen Konfig.
- Deko-Modelle: Karten-`typen` `sf_<stem>_<hoehe·10>` mit `glbDatei` (Generator-Helfer `modell(...)`/`deko(stem,cx,cy,hoehe,drehung,blockiert)` lesen `client/assets/eigene/index.json` – braucht `masse`). Drehung 0 = Front Süd, 90 West, 180 Nord, 270 Ost. Gleiche Modelle ab 3× instanziert (`kartenModell.#eigeneInstanziert`).

## Kacheln & Untergründe (`G:welt/kacheln.js`)
- Zeichen → Kachel (Name, blockiert, Wand, Wasser, Innen …). Untergründe: `,` gras · `$` rasen · `0` wiese · `&` erde · `%` kies · `^` pflaster · `;` waldboden · `!` sand · `*` schnee · `~` wasser (blockiert, watbar: `istWatbar`, Tempo ×0,5) · `|` steg (begehbar, kein Wasser).
- ⚠ Neue Zeichen ans ENDE von KACHELN (Tiled-Index stabil). `?` = Editor-AUSSEN, `_` = Asphalt, `@` bricht Asset-IDs. Neue Kachel braucht: Textur (`C:darstellung/bodenTextur.js` bzw. Foto `werkzeuge/assets/baue_boeden.py`), Farbe `C:darstellung/farben.js`, Editor/Studio-Katalog `editor/kern/katalog.js`, Schritte `C:audio/schritte.js untergrundFuer`, ggf. `BAUBARER_UNTERGRUND`, danach `npm run ki:anleitung`.

## Welt-Objekte mit Regeln (umgebungsfrei, Server + Client)
- Sitze `G:welt/sitze.js`: `sitzHoeheFuer` (stuhl/sessel/sofa/bank + Modellnamen chair/bench/stool/couch/wood-log; Typ-Feld `sitz` gewinnt, 0 = kein Sitz), `sitzPlaetze` (lange Bänke = mehrere), `sitzFrontFuer` (Typ-Feld `sitzFront`° oder `MODELL_FRONT`, garden-bench 180°), `findeSitz(welt,x,y,belegt)` (Reichweite 1,7 Kacheln).
- Behälter `G:welt/behaelter.js` (Schränke/Kühlschränke durchsuchbar, IDs `m<Nr>` in Objekt-Reihenfolge – S & C identisch; Logik in ki/bauen.md → Kisten).
- Ressourcen-Knoten `G:welt/ressourcen.js` (baum/tanne/busch/stein/eisenerz/`FELSEN` r32_fels_*) → ki/bauen.md.
- Gelände-Höhen `G:welt/gelaende.js` (Editor 2.0), frei gedrehte Objekte `G:welt/drehung.js` (`beruehrteKacheln`: Kachel blockiert ab 0,3 Überlappung).
- Übergänge: `S:systeme/zonenSystem.js` (5 s Countdown `welt.uebergangSekunden`, im Auto Front/Mitte/Heck; HUD `#hud-uebergang`). Auto fährt mit (`fahrzeugSystem.loeseFahrzeugFuerWechsel`/`setzeFahrzeugEin`). Bots wechseln nie Zonen.

## Fallen ⚠
- Ankunftspunkt nie im Übergangsrechteck (Ping-Pong) – `tests/zonen.test.js` prüft. Bei verschobenen Generator-Koordinaten (lager.py `schiebe()`) Spawnpunkte/Übergänge mitschieben.
- Zone > `ZONE_MAX_KACHELN` (1500 je Seite) wirft im Lader.
- Laternen-Position: `stadtrand.py rueckeLaternenAufGehweg` (nur `-`).
- Haustier-Streuner nur auf Karten ≥ `mindestKacheln` 4000 (Test-Karten bleiben tierfrei).

## Prüfen
- Alle Karten laufen automatisch durch `tests/karte`, `inhalte` (Erreichbarkeit, Möbel/Türen, Grafiken), `zonen`, `tiled`, `editor` (Rundreise). Zonen-spezifisch: `runde40` (waldsee), `runde42–44_2` (lager).
- Ansehen: `npm run ansicht -- --zone waldsee --tp 120,60 --kamera spiel,weit`. Übersicht von oben: `--kamera weit` oder per `--js` eigene Kamera.

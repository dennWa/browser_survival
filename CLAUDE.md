# Browser Survival – Einstieg für KI-Sitzungen

Top-Down-Survival in 3D (Three.js) im Browser, autoritativer Server (Node + `ws`, im Singleplayer derselbe Server im Browser-Tab).
Kürzel in `ki/`: S: `server/spiel/` · C: `client/` · G: `gemeinsam/` · K: `server/spiel/konfiguration/`

## So arbeitest du token-sparsam (Pflicht)
1. Diese Datei reicht zum Start. Dann NUR die passende `ki/<thema>.md` (Tabelle unten) – oder `grep -rn "stichwort" ki/`. Nie mehrere Themen „zur Sicherheit“ lesen.
2. Große Dateien nie ganz lesen: `npm run ki:gliederung -- <datei>` (Funktionen/Methoden + Zeilen, `--ohne-konst` ohne Konstanten) → gezielt `sed -n 'a,bp'`. Definition finden: `npm run ki:gliederung -- --wo <name>`. Ordnerüberblick (Kopfkommentare): `npm run ki:gliederung -- <ordner>`.
3. Tests: `npm run t` (1 Zeile bei Erfolg) bzw. `npm run t -- runde45 zonen`. Im Spiel ansehen/messen: `npm run ansicht -- …` (Screens + Konsolenfehler, `--js` für Messungen; ki/tests.md). Keine eigenen Playwright-Skripte schreiben, wenn `ansicht` reicht.
4. Nie lesen (generiert/riesig/Historie): `server/spiel/karten/{stadtrand,waldweg,waldsee,schneeland,lager,tutorial}.js` (← `werkzeuge/karten/*.py`), `editor/KI_KARTEN_ANLEITUNG.md`, `client/assets/**`, `client/vendor/**`, `package-lock.json`, `archiv/**`, `docs/handbuch/**` (Handbuch für Menschen, eingefroren).
5. Am Auftragsende: Checkliste „Auftrag abschließen“ in `ki/rezepte.md` (Tests → betroffene `ki/<thema>.md` aktualisieren: Stand ersetzen statt anhängen, keine Runden-Historie → 1 Zeile `docs/handbuch/aenderungsprotokoll.md` → Commit + Push). Keine neuen `rundeNN.md`-Dateien mehr.

## Themenkarte
| Thema | Datei | Wichtigste Code-Stellen |
|---|---|---|
| Häufige Aufträge als Checklisten | `ki/rezepte.md` | – |
| Architektur, Netz, Protokoll, AKTIONEN, Spielstand, Lokal-Modus, Admin | `ki/architektur.md` | S:`spielServer.js` `zone.js` `spielWelt.js` · G:`protokoll.js` · C:`kern/clientSpiel.js` `main.js` |
| Karten, Zonen, Generatoren, Kacheln, Kartenfelder, Sitze/Behälter | `ki/karten.md` | S:`karten/kartenLader.js` · `werkzeuge/karten/*.py` · G:`welt/{welt,kacheln,sitze}.js` |
| Spieler: Items, Inventar, Überleben, Schlafen/Sitzen, Tod, Skills, Mehrspieler, Tutorial | `ki/spieler.md` | K:`gegenstaende.js` `spielKonfiguration.js` · S:`systeme/{inventar,ueberleben,gesundheit,arbeit,station,mehrspieler}System.js` |
| Kampf, Waffen, Explosionen, Fallen, Gottmodus | `ki/kampf.md` | S:`systeme/{kampf,waffen,explosion,fallen,admin}System.js` |
| Zombies, Wild, Haustiere, Bots | `ki/npc.md` | S:`systeme/{zombie,sonderZombie,tier,haustier,bot}System.js` `botLager.js` |
| Bauen, Crafting, Ressourcen/Abbau, Farm, Angeln, Kisten | `ki/bauen.md` | G:`basisbau/*` `welt/{bauwerke,ressourcen}.js` · S:`systeme/{bau,basisbau,crafting,kisten,arbeit}…` · K:`rezepte.js` |
| Autos | `ki/fahrzeuge.md` | G:`physik/fahrzeug.js` · S:`systeme/fahrzeugSystem.js` |
| 3D-Darstellung: Renderer, Karte, Boden, Bäume, Effekte, Kamera, Ego, Performance | `ki/darstellung.md` | C:`darstellung/{renderer,kartenModell,bodenTextur,baumModell}.js` |
| Licht, Tageszeit, Wetter, Himmel | `ki/licht_wetter.md` | C:`renderer.js #tageslicht/#aktualisiereLampenPool` `darstellung/wetterEffekt.js` · S:`systeme/wetterSystem.js` |
| Figuren, Animation, Haltung/Sitzpose, Kleidung, Zombie-/Tiermodelle | `ki/figuren.md` | C:`darstellung/figurHaltung.js` · `renderer.js #aktualisiereFiguren` |
| Audio, Sounds, Musik | `ki/audio.md` | C:`audio/{sound,eigeneSounds,schritte}.js` · G:`audio/umgebung.js` |
| UI, HUD, Menüs, Tasten, Touch | `ki/ui.md` | C:`ui/*` `kern/{eingabe,touchSteuerung}.js` · `client/index.html` · `client/stil.css` |
| Assets, Modelle, Icons, Lizenzen, Pipelines | `ki/assets.md` | `werkzeuge/assets/*` · `client/assets/eigene/{index,credits}.json` |
| Map-Editor (Web) | `ki/editor.md` (nur Überblick oben lesen, Rest greppen) | `editor/` |
| Studio (Desktop, Electron) | `ki/studio.md` (dito) | `studio/` |
| Tests, Prüf- & Browser-Werkzeuge | `ki/tests.md` | `tests/` · `werkzeuge/test/` · `werkzeuge/ki/` |

## Harte Regeln (Nutzer-Entscheidungen – nicht ändern)
- Code-Sprache Deutsch (Bezeichner ohne Umlaute, Kommentare mit Umlauten). Vanilla JS, ES-Module, kein Build-Schritt. Node ≥ 20.
- Spiellogik nur in `server/spiel/` (autoritativ, umgebungsfrei – keine `node:`-Importe, kein DOM); `gemeinsam/` ebenso. Darstellung nur 3D (Three.js, `client/darstellung/renderer.js`).
- Grafiken nur über die Skripte in `werkzeuge/assets/` (`baue_assets.py`, `npm run assets:3d` …), nie direkt in `client/assets/` oder `client/vendor/`. Nur CC0/CC-BY, Credits-Dialog nicht entfernen. Ausnahme: eigene `.glb` aus Editor/Studio landen unverändert unter `client/assets/eigene/` ohne Lizenzprüfung (Rechte bei der hochladenden Person; Urheber/Lizenz optional am Typ).
- Internetzugriff erlaubt für neue Texturen/Modelle/Sounds (CC0/CC-BY; Quelle + Lizenz in `client/assets/eigene/credits.json`; Low-Poly-Stil: Texturen 256–512 px, wenige Polygone, kleine Dateien).
- Sounds schneiden ohne ffmpeg: Browser als Decoder (`decodeAudioData`) + Editor-API-Upload (`PUT /api/editor/datei?pfad=…`, Kopf `X-Editor: 1`) → `npm run sounds` (Details ki/audio.md).
- Touch-Bedienung (Handy/Tablet) bei jeder neuen Aktion mitdenken (HUD-Knopf `.nur-touch`).
- Vor jedem Commit `npm run t`. Neue Modelle/Texturen/Sounds/Items/Kacheln → `npm run ki:anleitung` (sonst Test rot).
- Immer direkt auf `main` arbeiten, committen und pushen (keine Feature-Branches, keine PRs) – GitHub Pages liefert `main` aus.
- Nie committen: `server/daten/konten.json`, `einstellungen.json`, `spielstaende/`, Nutzer-Ablagen `!verteilen`/`verteilen bitte` (gitignored).
- Hauptordner schlank halten: neue Konzepte/Pläne nach `docs/konzepte/`, erledigte nach `archiv/runden/`.
- Am Ende jeder Antwort den Link zum Spiel posten: https://dennwa.github.io/browser_survival/

## Befehle (Auswahl)
`npm run t` · `npm run ansicht -- …` · `npm run ki:gliederung -- …` · `npm run start:gast` (Port `PORT`, Standard 8080) · `npm run rauchtest [-- --online]` · `npm run karte:editor -- x.karte.json` · `python3 werkzeuge/karten/<zone>.py` (⚠ überschreibt Karten-JS) · `npm run sounds` · `npm run eigene:index` · `npm run ki:anleitung` · `npm run studio`.
Browser-Konsole (Lokal-Modus): `browserSurvival.{tp(tx,ty), gib(defId,n), zeit(h), zone(id), wetter(art), ich(), spiel, server}` · F3 = Debug.

## Globale Fallen ⚠
- Three.js `PropertyMixer` schreibt konstante Clip-Spuren nur einmal → prozedural verbogene Knochen selbst zurücksetzen, nie relativ je Bild weiterdrehen (ki/figuren.md).
- Neue AKTION-/Nachrichtenfelder → Whitelist in `S:spielServer.js`, sonst still verworfen. Neue Bauwerk-Felder → `spielWelt.pruefeBauwerk`. Neue Spielstand-Felder → `spielstand.js` prüft alles.
- Generierte Dateien (Karten-JS, KI-Anleitung, `eigene.json`, `index.json`) nur über ihren Generator ändern.

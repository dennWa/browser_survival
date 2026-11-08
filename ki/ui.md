# UI · HUD · Menüs · Touch · Tasten
> Lesen bei: Fenster/HUD/Knöpfe, Hauptmenü/Spielstände, Tastenbelegung, Handy-/Tablet-Bedienung, CSS.
> Kürzel: C: `client/` · Struktur in `client/index.html` (HUD-Elemente mit IDs), Stil `client/stil.css` (1.800 Z. → gezielt greppen)

## Tasten (`C:kern/eingabe.js` TASTEN)
W/A/S/D laufen · Shift sprint · Leertaste/LMB angriff · E aufheben/interagieren · F Tür/Feuer · R nachladen (Bau-Modus: drehen) · Tab Inventar (hinter Auto: Kofferraum) · G Kofferraum · B bauen · X abriss · V Gebiet · M/K Karte · U Skills · J Tagebuch · I Spielerliste · T Chat · Q fallen lassen · L Licht · Ä sitzen · ^ Autorun · Enter wiederbeleben · P Admin · F3 Debug · Esc Menü/Fenster zu · 1–9,0 Schnellleiste · C Ego-Ansicht (`ego/egoModus.js`) ⚠ C ist zugleich Sprachchat-Sprechen (Doppelbelegung, offen).

## Touch (Pflicht für jede neue Aktion!)
- `C:kern/touchSteuerung.js`: zwei Sticks (Modus fest/frei, localStorage `browserSurvival.touch`), 2 Finger = Zoom, Tipp = Ziel antippen / Tipp-Laufen (`clientSpiel.tippLaufen`, `renderer.laufRing`). Kompatibilitäts-Mausereignisse nach Touch ignoriert.
- Jede Tastatur-Aktion braucht einen HUD-Knopf (in `client/index.html`, Klasse `.nur-touch`, Handler in `C:ui/hud.js`/`main.js`) – auf dem Handy ins ☰-Menü: `hud.#ordneMehrMenue(istTouch)`. Im Auto blendet `.im-auto` Unpassendes aus (`hud.zeigeTacho`). Aktions-Knopf (E) nutzt dieselbe Interaktion wie die Taste (`clientSpiel.#interaktion`).

## Fenster & Anzeigen (`C:ui/`)
- `hauptmenue.js` (Singleplayer/Multiplayer/Developer, Slots `C:netzwerk/spielstandSlots.js`, Menümusik) · `charakterErstellung.js` + `charakterVorschau.js` · `hud.js` (1.000 Z.: Werte/Status-Chips, Minikarte, Uhr, Tacho, Übergang-Countdown, Angeln, Admin-Schalter gelb, Mehr-Menü, Status-Erklärung) · `inventarFenster.js` (Tab: Charakter links, Ausrüstungs-Slots, Drag & Drop, Doppelklick = konsumieren, Rechtsklick-Kontextmenü `itemKontextEintraege`, Umgebung) · `kisteFenster.js` · `stationFenster.js` · `werkbankMenue.js` · `bauMenue.js` · `einstellungen.js` (⚙ Ton/Grafik + „Details anpassen“ je Regler aus `GRAFIK_DETAILS` (ki/darstellung.md), gestrichelt = was „Auto“ gerade heißt; ab 900 px zweispaltig, z-index über dem Tagebuch/Vollbild/Haustiere/Stimme) · `karte.js` (M/K, Minikarte `zeichneMini`, Klick → Auto-Lauf) · `skillFenster.js` · `mehrspielerFenster.js` · `musikFenster.js` · `tagebuchAnzeige.js` · `tutorialAnzeige.js` · `entwicklerFenster.js` · `credits.js` (Credits-Dialog – nie entfernen!) · `weltPopups.js` (+N, Abbau-Balken) · `haltbarkeit.js` · `uiIcons.js` (Sprite `client/assets/eigene/ui-icons.svg`, `uiIcon(id)`).
- Esc-Reihenfolge `main.js`: offene Fenster (`clientSpiel.etwasOffen()`) → Tutorial-Pause → Menü. Klicks bei offenem Fenster lösen keinen Schuss aus (`eingabe.klickGesperrt`).
- Meldungen: Server `melde` → `meldung`; Chat-Modus Direkt/Global (localStorage `browserSurvival.chatModus`).

## Fallen ⚠
- Neue Aktionsfelder → Server-Whitelist (ki/architektur.md). Neue Fenster in `clientSpiel.etwasOffen()/fensterOffen()` aufnehmen (sonst schießt Klick durch / Esc schließt nicht).
- Playwright: nach Login auf `#laden` hidden warten (Aufwärmphase), sonst gehen Tasten verloren; Editor-Touch: erster Tipp nach Wisch wird verschluckt (≥ 400 ms warten).

## Tests
`touchBauen`, `runde23` (UI P2), `runde27` (Handy-UI), `runde28` (Hauptmenü/Slots, Rauchtest-Helfer `werkzeuge/test/menueHelfer.mjs`), Rauchtest `npm run rauchtest`.

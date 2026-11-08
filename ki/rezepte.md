# Rezepte – Checklisten für häufige Aufträge
> Kurz abhaken statt zusammensuchen. Details in der genannten `ki/<thema>.md`. Am Ende immer „Auftrag abschließen“.

**Neues Item** (ki/spieler.md): Eintrag `K:gegenstaende.js` → Icon (`editor_grafiken/<id>.grafik.json` + `python3 werkzeuge/assets/baue_assets.py --editor-items` oder `--nur-items`) → Bodenmodell `C:darstellung/itemModelle.js` (optional) → Loot `K:lootTabellen.js` und/oder Rezept `K:rezepte.js` → `npm run ki:anleitung` → `npm run t` (inhalte: Icon-Pflicht).

**Neue Waffe** (ki/kampf.md): wie Item + Kampfwerte + Modell `waffenModelle.js` (BAUPLAN/`R32_WAFFEN`, `haltungFuer`) + Sound (`eigeneSounds.EREIGNISSE`, Rezept `sound.js`, Datei, `clientSpiel SCHUSS_KLANG`, `npm run sounds`) + Munition-Item.

**Geräusch neu/tauschen/lauter** (ki/audio.md): Datei `client/audio/eigene/<ereignis>_N.ogg` (+ `credits.json`) bzw. Pegel in `client/audio/eigene/einstellungen.json` → `npm run sounds` (Pflicht!) → neues Ereignis zusätzlich `EREIGNISSE` + `REZEPTE` + Auslöser → `npm run ki:anleitung`.

**Neues 3D-Modell** (ki/assets.md): CC0/CC-BY suchen (klein, Low-Poly) → `client/assets/eigene/<name>.glb` + `credits.json` → Höhe/Kategorie `werkzeuge/assets/eigene_kategorien.mjs` → `npm run eigene:index && npm run eigene:vorschau && npm run eigene:index && npm run ki:anleitung` → einbauen (Karte: Generator-`deko()`/`modell()`; Möbel: `moebelModelle.js`; Item: `itemModelle.js`) → `npm run ansicht` ansehen.

**Karte/Zone ändern** (ki/karten.md): Generator `werkzeuge/karten/<id>.py` ändern (nie die JS) → `python3 werkzeuge/karten/<id>.py` → Übergänge in beiden Nachbar-Generatoren → `npm run t` (karte/inhalte/zonen) → `npm run ansicht -- --zone <id> --kamera spiel,weit`. Neue Zone: Generator + `KARTEN` in `S:karten/kartenLader.js` + Übergänge + Musik-Ordner optional.

**Neue Aktion/Taste** (ki/architektur.md, ki/ui.md): `G:protokoll.js AKTIONEN` → `S:spielServer` Whitelist + Feldprüfung → Dispatcher `inventarSystem.verarbeiteAktionen` → System → `C:kern/clientSpiel.js` Methode → Taste `C:kern/eingabe.js TASTEN` → **Touch-Knopf** (`client/index.html` `.nur-touch` + `hud.js`, ggf. ☰-Menü) → Test.

**Neues Fenster/HUD-Element** (ki/ui.md): Markup `client/index.html`, Logik `C:ui/<name>.js`, Stil `client/stil.css`, Verdrahtung `main.js`/`hud.js`, in `clientSpiel.etwasOffen()` aufnehmen, Handy-Layout prüfen (`--groesse 400x800`).

**Neues Bauteil/Bauwerk** (ki/bauen.md): `G:basisbau/teile.js` (Kosten, Kategorie) + `G:welt/bauwerke.js` (BAUWERKE, Aktion) + Modell (`basisbauModelle.js`/`moebelModelle.js`/`bauwerkModelle.js`) + neue Bauwerk-Felder in `spielWelt.pruefeBauwerk` (Weltstand-Whitelist) + Test `basisbau`/`bauen`.

**Optik-/Animations-Bug** (ki/darstellung.md, ki/figuren.md): reproduzieren mit `npm run ansicht` (+ `--js` Messung über Frames) → Ursache im Code per `ki:gliederung --wo` → Fix → gleiche Messung vorher/nachher → wenn möglich Node-Test (Modul importieren).

**Bot-Verhalten/Chat-Befehl** (ki/npc.md): `S:systeme/botLager.js` (Alltag/`botBefehl`) bzw. `botSystem.js`; Test `runde44_2`.

**Auftrag abschließen (Pflicht):**
1. `npm run t` grün (bei Assets/Items/Kacheln/Sounds vorher `npm run ki:anleitung`).
2. Betroffene `ki/<thema>.md` auf den neuen Stand bringen: ersetzen statt anhängen, keine Historie, Fallen ⚠ dazu. Neue Datei → Dateizeiger dort. Datei-Kopfkommentare geänderter Dateien aktuell.
3. 1 Zeile `docs/handbuch/aenderungsprotokoll.md` anhängen, ohne die Datei zu lesen: `printf '| 0.NN.0-dev | JJJJ-MM-TT | Runde NN: … |\n' >> docs/handbuch/aenderungsprotokoll.md`.
4. Commit auf `main` + Push (keine Branches/PRs). Antwort endet mit https://dennwa.github.io/browser_survival/

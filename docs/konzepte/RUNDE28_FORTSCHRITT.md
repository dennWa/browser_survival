# Runde 28 – Fortschritt (Abhakliste)

> **Für KI-Sitzungen nach einem Abbruch:** Hier steht, was erledigt ist und was noch fehlt. Erst diese Datei lesen,
> dann beim ersten offenen Punkt (☐) weitermachen. Nach jedem erledigten Schritt hier abhaken (☑) und committen.
> Auftrag = Nutzer-Liste „Charaktererstellung, Hauptmenü und Spielstände“ (Abschnitt 1) + „Handy-Version“ (10 Punkte).
> Tests: `tests/runde28.test.js`. Rauchtest-Helfer fürs neue Menü: `werkzeuge/test/menueHelfer.mjs`.

## Abschnitt 1 – Hauptmenü & Spielstände (Commit `fb8e780`, gepusht)

- ☑ 1 Hauptmenü neu (`client/ui/hauptmenue.js`, `#hauptmenue` in `client/index.html`, CSS „Hauptmenü“ in `stil.css`): Singleplayer / Multiplayer, Developer-Knopf oben rechts → Passwort (ohne Prüfung) → Map-Editor; keine Emojis
- ☑ 2 Singleplayer: 3 Slots (Erstellt, Zuletzt gespielt, Figur-Foto), Laden / Neu erstellen / Löschen (`client/netzwerk/spielstandSlots.js`, Präfix je Slot in `browserSpeicher.js`, alter Stand → Slot 1)
- ☑ 3 Charaktererstellung (`client/ui/charakterErstellung.js`, Merkmale in `gemeinsam/spieler/aussehen.js`): Geschlecht, Frisur + Haarfarbe, Oberteil, Hose, Schuhe, Name, Live-3D-Vorschau, Knopf „Laden“
- ☑ 4 Autosave 90 s, gestaffelt (1 Auftrag je Tick), Schreiben im Leerlauf, Sichern beim Verlassen/Hintergrund (`lokalSichern`, `stoppeLokal`)
- ☑ 5 Multiplayer: Serverliste → Anmeldung (Konto/Gast) → Charakter je Server (Beitreten / Neu erstellen / Konto-Charakter laden); Server: `charakterName`, `neuerCharakter`, Anzeigename
- ☑ 6 Handy-Tonausfall: Audio-Wachhund in `client/audio/sound.js` (resume in Gesten, stehende Uhr, NaN → Kontext neu bauen)

## Abschnitt 2 – Handy-Punkte (Teil B)

1. Steuerung & UI
   - ☑ Tippen auf freie Fläche → hinlaufen (`clientSpiel.tippLaufen`, Ring `renderer.laufRing`)
   - ☑ Sticks tiefer und mittiger (`touchSteuerung.js` rand/hoehe 'auto')
   - ☑ Inventar am Handy scrollbar (`touch-action: pan-y`, touchmove-Sperre lässt Scroll-Container durch)
   - ☑ Schnellleiste/Icons ~10 % größer; Hochformat: Leiste über den Sticks
   - ☑ Rucksack-Knopf unter der Minikarte
   - ☑ Blickrichtung bleibt beim Antippen der Schnellleiste (Kompatibilitäts-Mausereignisse ignoriert, `eingabe.js`)
   - ☑ Ego-Modus am Handy (Knopf `#hud-ego`, rechter Stick dreht Blick)
2. Inventar & Crafting
   - ☑ Baumenü vollständig sichtbar/scrollbar (`#bau-menue` max-height + overflow)
   - ☑ Verband aus 2 Stofffetzen (Rezept `verband_stofffetzen`, Item `stoff` heißt jetzt „Stofffetzen“)
   - ☑ Admin: Waffe spawnen aus Liste mit Munition (`ADMIN_BEFEHLE.WAFFE_GEBEN`)
   - ☑ Doppelklick zuverlässig (eigene Konsum-Sperre statt Angriffs-Abklingzeit; Doppeltipp auch in der Schnellleiste)
3. Wetter & Kälte
   - ☑ Frieren: nur Zähneklappern, kein Atem
   - ☑ Kein Regen/Schnee in Türzargen (`welt.istUnterDach`)
   - ☑ Kamine: Karten-Kamin-Modelle (fireplace.glb) werden anzündbare Kamin-Bauwerke (`karteObjekt`)
   - ☑ Nässe 5 Stufen, Symbol oben, trocknen 1 Stufe/min drinnen (`gesundheitSystem.aktualisiereNaesse`)
4. ☑ Erkältung (5 min feucht → erkältet, Husten, Sprint 80 % ab 30 %, Schaden ab 50 %, Antibiotika)
5. ☑ Blutung: Schlag 20 %, Schuss immer, Blutflecken 1/s, ~60 s sichtbar (`client/darstellung/blutspuren.js`)
6. ☑ Wind doppelt: Nachtwind aus, leicht/stark überblenden (`gemeinsam/audio/umgebung.js`)
7. ☑ Statusleiste antippen → große Erklärung (`#status-erklaerung`); Nässe-Symbol; Tagebuch rutscht am Handy unter die Statusleiste
8. ☑ Kleidung als echte Schicht + Mütze neu (`client/darstellung/kleidungModell.js`) – ☐ Sichtprüfung Mütze/Handschuhe/Weste im Spiel (Screenshot)
9. ☑ Fahrzeug: „Kofferraum öffnen“/„Einsteigen“ unten ohne Emoji, oberer Knopf weg, 2. Spieler = Beifahrer (`mitfahrt`, `beifahrerId`)
10. ☑ Regeneration erst ab 80 % Essen UND Trinken

## Abschluss

- ☑ Unit-Tests `tests/runde28.test.js` (13 Tests, grün)
- ☑ `npm run ki:anleitung` gelaufen
- ☐ Teil B committen + pushen (main)
- ☐ `KI_INDEX.md` (neuer Abschnitt Runde 28) + `project_manifest.md` (Änderungsprotokoll) nachziehen
- ☐ Sichtprüfung Mütze/Kleidung (siehe 8), danach diese Datei nach `archiv/runden/` verschieben

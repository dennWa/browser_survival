# Konzept: Tutorial „Station 3“ (eigene Krankenhaus-Zone)

Stand 2026-10-27 · Status: **Phasen 0–4 umgesetzt** (Funker heißt **Jelke**, Ziel ≤ 12 min, Angeln/Basisbau nur optional). Offen: Phase 5 (Erstbesuch-Automatik beim ersten Login), 6 (direkt im Spiel). Wo was liegt: KI_INDEX §22.

## 1. Vorgaben des Nutzers (fix)

- Tutorial = **eigene Zone**: ein **Krankenhaus** + kleiner **Außenbereich mit Grünfläche** (Sammeln, Farmen) + **Parkplatz**.
- Start **vorerst übers Hauptmenü** (Knopf „Tutorial“); *später* automatisch beim ersten Einloggen und noch später ins Spiel eingebaut.
- Jederzeit **überspringbar (Esc)**.
- Am Ende: Frage **„Story jetzt starten?“** → Ja = normale Map (Stadtrand), Nein = Hauptmenü.
- **Alle Spielmöglichkeiten** werden vermittelt (Sammeln → Schießen → Anbauen → Auto …); **Munition geht nie aus**, nichts darf einen festsetzen.
- Immer **aufploppende Nachrichten** („was muss ich jetzt tun?“) + **ernste Erzählerstimme über Funk**; Stimme/Texte/Sounds später **austauschbar**.
- Story: Man **wacht allein im Krankenhaus auf**, erst ruhig, **Zombies kommen erst später**, dann Flucht im Auto = Tutorial-Ende.
- Modelle: vorhandene nutzen, **Größen angleichen** (manche zu groß/klein), Editor ist erlaubt.

## 2. Meine Empfehlungen zu offenen Punkten (alles änderbar)

| Frage | Empfehlung | Warum |
|---|---|---|
| Wo läuft das Tutorial? | **Lokal im Browser-Tab** (eigener, wegwerfbarer `SpielServer` im Arbeitsspeicher, wie der Editor-Test) | Das Spiel kennt **keine Instanzen** (1 Karte = 1 geteilte Zone). Online würden sich alle Anfänger Zombies/Beete/Loot teilen. Lokal: privat, offline, kein Eingriff in Konto/Spielstand. |
| Esc | Erst Menüs schließen (wie bisher), sonst **Pause-Dialog** „Weiter · Kapitel überspringen · Tutorial beenden“ | Esc schließt heute schon Menüs (`TASTEN.menue`) – ein Sofort-Abbruch würde Fehlklicks bestrafen. Touch: ⏸-Knopf. |
| Name des Krankenhauses | Neue Klinik **„Kreisklinik Hohenfeld“**; Funker schickt am Ende zum **St.-Elisabeth** (= Startzone Stadtrand) | Stadtrand hat schon das St.-Elisabeth als Spielstart – so entsteht keine Doppelung, und das Ende führt logisch in die Story. |
| Figur | Aussehen (Mann/Frau) aus dem Hauptmenü übernehmen | Gibt es schon (`login-aussehen`). |
| Basisbau (B) | Nur **Kurzvorstellung** (1 Wand setzen, optional) | Zu komplex für den Pflichtweg; wird in der Story vertieft. |
| Stimme | **Vorab erzeugte Sprachdateien + Funk-Filter im Spiel** (§9) | Browser-Sprachausgabe kann man nicht durch Audio-Filter schicken → kein Funk-Klang. |
| Tutorial-Beute | Nichts nehmen die Spielenden mit; in der Story gilt das normale Startinventar | Hält die Balance, kein Exploit. Nur ein „Tutorial geschafft“-Flag wird gemerkt. |

## 3. Ablauf (Sicht der Spielenden)

```
Hauptmenü ──[🎓 Tutorial]──► Ladebild ──► Intro (Aufwachen, ~20 s, Esc = sofort weiter)
   ▲                                          │
   │                                   Kapitel 1 … 9  (Aufgaben + Funk)   ◄── Esc: Pause-Dialog
   │                                          │
   │                              Finale: Horde → Auto → Ausfahrt
   │                                          ▼
   └──[Nein / Hauptmenü]◄──  „Tutorial geschafft! Story jetzt starten?“  ──[Ja]──► normaler Login/Start (Stadtrand)
```

- **Erstbesuch** (kein Flag `browserSurvival.tutorialFertig`): Knopf „Tutorial“ pulsiert, Login-Knopf fragt einmal „Erst das Tutorial? (empfohlen)“.
- **Ja** startet mit den im Hauptmenü gewählten Daten (Gast/Lokal sofort; sonst Formular mit Fokus auf Login).
- Zusätzlich im Hauptmenü: **Kapitel wählen** (für Wiederholer, z. B. nur „Farmen“). Jedes Kapitel hat ein eigenes Start-Inventar → Sprung ohne Vorlauf möglich (und gut testbar).
- Dauer-Ziel: **12–15 Minuten** am Stück; jedes Kapitel 1–2 min.

## 4. Technischer Rahmen

**4.1 Eigene Zone, private Instanz.** Karte `server/spiel/karten/tutorial.js` (Name `tutorial`), **nicht** in `KARTEN` der Online-Welt registriert. `client/netzwerk/lokalerServer.js` bekommt eine zweite, wegwerfbare Instanz (wie `testKarten`/`ArbeitsspeicherSpeicher`) – der echte Lokal-Spielstand bleibt unberührt. Ende/Abbruch = Instanz stoppen.
Später (Phase 5) „beim ersten Einloggen“: Konto neu → Client startet erst das lokale Tutorial, danach der echte Login. Flag zusätzlich im Spielstand (`tutorialFertig`, optionales Feld). „Ganz ins Spiel einbauen“ hieße Zonen-Instanzen pro Spieler – größerer Umbau, bewusst vertagt.

**4.2 Tutorial-Regeln (Zonen-Schalter `tutorial: true`)** – das Sicherheitsnetz:
- **Kein Verlieren:** Tod → 3 s „bewusstlos“, Funker ruft, Neustart am Kapitel-Checkpoint; **Inventar, Level, Fortschritt bleiben**.
- **Munition:** Reserve wird auf ≥ 30 aufgefüllt, das **Magazin leert sich normal** → man lernt Nachladen (R). (Der Admin-Schalter `unendlichMunition` füllt das Magazin automatisch auf, würde also *kein* Nachladen lehren → nicht verwenden.)
- **Hunger/Durst** laufen nicht ab (außer ein Kapitel setzt Werte bewusst, z. B. Hunger 45 beim Essen-Lernen).
- **Werkzeuge** gehen nicht kaputt; Ressourcen (Baum/Stein) wachsen in ~10 s nach; verlorene Pflichtitems liefert der Funker nach („Ich lege dir was hin …“, Item erscheint nahe der Figur).
- **Zombies:** nur per Skript (kein Zufalls-Respawn, keine Nacht-Horde außer im Finale), nie mehr als 3 gleichzeitig vor dem Finale, Schaden ×0,5.
- **Wetter aus, Uhrzeit fest** (Morgen → Dämmerung gegen Ende).
- Kein Chat/Admin/Developer, kein Online-Zugriff.

**4.3 Skript statt Code.** Ablauf, Texte, Bedingungen und Funkzeilen stehen als **reine Daten** in `server/spiel/tutorial/skript.js` (umgebungsfrei, wie `rezepte.js`): nichts davon ist im Code versteckt, alles per Textänderung anpassbar. Eine kleine Engine `S:systeme/tutorialSystem.js` wertet die Bedingungen aus und schickt `NACHRICHT.TUTORIAL` an den Client (UI + Stimme: Client).

```js
{ id: 'k4_schiessen', kapitel: 4, ort: 'sicherheitsdienst',
  aufgabe: 'Triff die Zielscheibe 3×',
  taste: { pc: 'Linksklick / Leertaste', touch: 'Rechter Stick' },
  fertigWenn: { ereignis: 'treffer', ziel: 'uebungsziel', anzahl: 3 },
  funk: ['k4_01', 'k4_02'],                         // Zeilen-IDs → Text + Sprachdatei
  hilfe: [{ nachSek: 20, funk: 'k4_h1' }, { nachSek: 45, marker: true }],
  beiStart: [{ gib: { munition_9mm: 30 } }] }
```

**4.4 Bedingungen** (alles Bestehende lässt sich nutzen): `bereich` (Spieler im Rechteck) · `hat` (Item im Inventar) · `ausgeruestet` · `wert` (Hunger/Durst/Leben/Ausdauer/Level) · `ereignis` mit Zähler (**vorhanden:** `treffer schuss nahkampf abgebaut hergestellt gebaut kochStart gekocht gepflanzt geerntet gefangen fahrzeug tuer levelAuf tod aufprall`) · `kills` · `fahrzeug` (sitzt im Auto) · `ui` (Client-only: Inventar/Karte/Skills geöffnet → Client meldet kurze Whitelist-Aktion) · `zeit` · `und/oder`. Fehlende Ereignisse (`aufgehoben`, `nachgeladen`, `konsumiert`, `geschlafen`, `skillVerteilt`) ersetzt meist die Zustandsabfrage; sonst kleine Ergänzung am Server.

**4.5 Neue kleine Bausteine** (alle optional im Editor/Skript nutzbar): **Übungsziel** (unbewegliche Zielpuppe/Scheibe, nimmt Schaden, zählt Treffer; Modell `punching-bag` ist da) · **Gate-Türen** (verschlossen, bis Schritt erledigt; Hinweistext „Stromausfall – erst …“) · **Trigger-Bereiche** (Rechtecke mit ID) · **Skript-Spawns** (Zombie-Variante, Ort, Anzahl) · **Beet-Zeitraffer** (~20 s statt 1 Spieltag, nur Tutorial) · **Marker** (§8) · **Kapitel-Checkpoints** · **Ausfahrts-Übergang** (bestehendes `uebergaenge`-System; die Wartezeit ist heute global `welt.uebergangSekunden` = 5 s → pro Zone auf 0 stellbar machen; Ziel `__tutorialEnde` → Client zeigt „Story starten?“).

## 5. Story & Figuren

- **Du:** Patient/in auf Zimmer 12, leicht verletzt (Leben ~70) – du weißt nicht, *was passiert ist*.
- **Der Funker „Jelke“ (Leitstelle Katastrophenschutz):** ruhig, ernst, trocken. Spricht über das **Funkgerät auf dem Nachttisch** (Modell `radio` ist vorhanden) – er sieht die Lage über Kameras/Meldungen, kann nicht helfen außer mit Anweisungen. Er weiß mehr, als er sagt (Hook für die Story).
- **Spannungsbogen:** Ruhe & Rätsel (Kap. 1–4) → **Stromausfall**, erster Zombie (Kap. 5) → Flucht ins Freie, Ruhe vor dem Sturm (Kap. 7–8) → **Horde, Auto, Aufbruch** (Kap. 9). Funk bricht am Ende mitten im Satz ab: „… fahr nach Süden, zum St.-Elisabeth. Dort …“ (Rauschen) → knüpft an die Story-Startzone an.

Beispielzeilen (Ton!): 
- Intro: *„… Leitstelle an alle Stationen. … Niemand? … Patient auf Zimmer zwölf, falls Sie mich hören: Bleiben Sie ruhig. Stehen Sie langsam auf.“*
- Kap. 1 (nach den ersten Schritten): *„Gut. Die Beine funktionieren. Das ist mehr, als ich von den meisten hier sagen kann.“*
- Kap. 4: *„Das ist eine Pistole, kein Spielzeug. Jeder Schuss ist weit zu hören – und hören tun hier inzwischen einige.“*
- Kap. 5: *„Die Notstromversorgung … Taschenlampe, schnell. Und ab jetzt: leise.“*
- Finale: *„Die Horde ist durch das Tor. Der Wagen auf dem Parkplatz – der Schlüssel steckt. Nach Süden, zum St.-Elisabeth …“*

## 6. Die Karte (Zone `tutorial`, ca. 110 × 75 Kacheln – bewusst klein)

```
 Norden
 ┌───────────── Kreisklinik Hohenfeld (eine Ebene) ──────────────┬─ Parkplatz ──────┐
 │ Zi.12  Zi.13  Zi.14 │ Station 3 – Schwesternzimmer / Apotheke │  Auto ► Ausfahrt  │
 │ ═════════ Hauptflur (Kap. 2) ════════════════ │ Sicherheitsdienst (Kap. 4)          │
 │ Hausmeister/Technik (Kap. 3) │ Notaufnahme │ Eingangshalle + Automat/Kaffee         │
 ├────────────── Notausgang ► Hinterhof ───────────────────────────────────────────┤
 │ Hinterhof: Bäume, Steine, Werkbank-Platz (Kap. 7)   │  Garten: Beete, Feuer, Teich (Kap. 8) │
 └──────────────────────────────────────────────────────────────────────────────────┘
 Süden
```

- **Wegführung linear mit Gates** (kein Verlaufen, aber Nebenräume zum Stöbern mit Extra-Loot und kleinen Funk-Kommentaren).
- **Bauweise:** Grundriss-Vorlage aus dem Stadtrand-Krankenhaus (Editor: *Zone als Vorlage öffnen*, Ausschnitt/Prefabs) kürzen und umbauen – spart Zeit, gleicher Stil. Wahlweise als reproduzierbarer Generator `werkzeuge/karten/tutorial.py` (wie Stadtrand/Schneeland; danach Feinschliff im Editor → ab dann ist die Editor-Datei die Quelle).
- Innenräume mit Dächern/Raumnamen (bestehendes System), Licht per `licht`-Objekte (flackern, beim **Stromausfall** über Skript aus → Notlicht-Kegel rot).
- Eigene Musik-/Klang-Ordner für die Zone (`client/musik/tutorial/`, Klanglandschaft: Monitor-Piepen, Lüftung, entferntes Stöhnen erst ab Kap. 5).

## 7. Kapitel (Lernpfad)

Pflicht = ✔ · Kurz = ein Satz Hinweis · Bonus = optional. „Netz“ = Sicherheitsnetz.

| # | Ort | Lernziel (Tasten · Touch) | Aufgabe → Erfolg | Netz |
|---|---|---|---|---|
| 0 | Zimmer 12 | Intro (Aufwachen, Funkgerät) | – (Kino, Esc = skip) | – |
| 1 | Zimmer 12 → Flur | ✔ Gehen WASD · linker Stick, Blick/Zielen Maus · rechter Stick, Sprinten Shift + Ausdauerbalken | „Geh zum Kreis“, „Sprinte kurz“ (`bereich`, Ausdauer fällt) | Leuchtring + Pfeil |
| 2 | Hauptflur | ✔ Türen (E), Aufheben (E), Inventar (Tab/🎒), Schnellleiste 1–0, Essen/Trinken (Item in Hand, Linksklick), Hunger/Durst, Verband, Karte (K/🗺), Auto-Lauf (Karte antippen) · Kurz: Bett schlafen (E), Rucksack | Wasser trinken, Riegel essen, Verband nutzen, Karte öffnen (`hat`/`wert`/`ui`) | Start: Hunger 45, Leben 70; Items liegen sichtbar |
| 3 | Hausmeister/Technik | ✔ Nahkampf: Waffe ausrüsten, schlagen (Linksklick/Space · rechter Stick), Reichweite, Werkzeug-Haltbarkeit | Übungsziel 5× treffen (`nahkampf`/`treffer`) | Ziel ist wehrlos |
| 4 | Sicherheitsdienst | ✔ Pistole, Zielen, Schießen, **Nachladen (R/↻)**, Munitionsanzeige, **Lärm lockt Zombies** | 3 Treffer, danach leer schießen und nachladen (`treffer`, Magazin) | Reserve ≥ 30 (§4.2) |
| 5 | Station 3 → Flur | ✔ **Stromausfall**: Taschenlampe (L/🔦), Dunkelheit/Sicht · ✔ erster Zombie (Variante *halb*: langsam, schwach), dann 2–3 mehr (+1 Läufer) · ✔ XP/Level → **Skills (U/⭐)** | Zombie(s) erledigen (`kills`), Skillpunkt verteilen (`ui`) | max. 3 gleichzeitig, Schaden ×0,5, Tod = Checkpoint |
| 6 | Treppenhaus → Notausgang | ✔ Fliehen: Sprinten + Ausdauer, **Türen schließen**, Bretter (4 Holz→2) · Kurz: Tür-Verstärkung | Zombies abschütteln, Notausgang erreichen (`bereich`) | Zombies verlieren schnell (`verlierRadius`) |
| 7 | Hinterhof | ✔ **Sammeln:** Axt → Baum (Holz), Spitzhacke → Stein/Erz, Haltbarkeitsbalken, Nachwachsen · ✔ **Basteln:** Werkbank (Rezept im Inventar-Reiter „Bauen“), platzieren (Vorschau grün, R dreht), E → Menü, **Munition selbst gießen** (3 Stein+1 Holz → 6 Schuss) | 4 Holz, 3 Stein sammeln; Werkbank bauen; Munition herstellen (`abgebaut`, `gebaut`, `hergestellt`) | Ressourcen wachsen schnell nach |
| 8 | Garten | ✔ **Lagerfeuer** (3 Holz, F + Feuerzeug) · ✔ **Kochen** (E → Station, 20 s, nicht verbrennen lassen) · ✔ **Farmen:** Hacke → Beet (Linksklick), Samen in die Hand → pflanzen, **Zeitraffer 20 s**, ernten (E), braten; Rechtsklick = Rasen zurück · Kurz: Hinsetzen (Ä) · Bonus: **Angeln** am Teich (Klick, Biss, Klick), Hase jagen | Feuer an, Tomate gebraten gegessen (`kochStart`,`gepflanzt`,`geerntet`,`gekocht`) | Samen/Holz liegen bereit |
| 9 | Hof → Parkplatz | ✔ **Alarm & Horde** (Nacht-Horde-Mechanik, Dämmerung), ✔ **Auto:** E einsteigen, WASD fahren, Tacho, Auto-Leben, Überfahren/Aufprall, **Kofferraum (G/Tab hinterm Auto)** · Kurz: Zombies greifen Autos an | Zum Auto laufen, einsteigen, zur Ausfahrt fahren (`fahrzeug`, `bereich`) | Auto robust (Leben ×3), Tor offen, Horde langsamer als Auto |

Hinweis „Bonus“-Kapitel (Angeln, Basisbau B, Rucksack/Kiste) laufen als optionale Ecken **ohne Pflichtfortschritt** – Funker: „Wenn du Zeit hast …“.

## 8. Anzeige & Bedienung (UI)

- **Aufgabenliste** (oben links unter der Minikarte): aktuelles Ziel + Häkchen, „Kapitel 4/9“. Erledigt = grünes ✔ + kurzer Ton.
- **Hinweis-Pop-ups** (Mitte unten, über der Schnellleiste): *Tastenkappe + Satz*, z. B. „**[E]** Tür öffnen“. Auf Touch-Geräten automatisch **Knopf-Symbole** statt Tasten (`touch.istTouchGeraet`).
- **Funk-Untertitel** immer sichtbar (auch bei Stumm), Lesedauer ≈ Sprechblasen-Regel (4 s + 60 ms/Zeichen).
- **Marker:** pulsierender Ring am Ziel (3D) + Randpfeil + Punkt auf Minikarte/Karte.
- **Eskalation bei Leerlauf:** 20 s → Erinnerung (Funk), 45 s → Marker verstärkt, 90 s → „Hilfe? Kapitel überspringen“.
- **Esc/⏸:** Pause-Dialog (§2). Weiterspielen ist Standard; „Kapitel überspringen“ gibt das Start-Inventar des nächsten Kapitels.
- Nie Kamera/Steuerung zwingen; Text kurz (≤ 12 Wörter), **eine Aufgabe zugleich**.

## 9. Erzählerstimme & Funk

- **Zeilen-IDs** (`k4_01` …) verbinden Text ↔ Datei: `client/audio/tutorial/<id>.ogg`. Neue Aufnahme/andere Stimme = Datei gleichen Namens ersetzen; fehlende Datei = nur Untertitel + Funk-Piep (nichts bricht).
- **Funk-Effekt zur Laufzeit** (Web Audio, nicht eingebacken → jede Stimme klingt automatisch nach Funk): Bandpass ~350–3200 Hz, leichte Sättigung, Kompressor, leises Rauschbett, **Squelch-Klick** bei Start/Ende, Musik/Wind während des Sprechens leiser (Ducking). Eigener Regler „Funk“ in den Einstellungen.
- ⚠ **Browser-Sprachausgabe (`speechSynthesis`) geht nicht:** ihre Ausgabe lässt sich nicht durch Web-Audio-Filter schicken, klingt je Gerät anders und ist auf manchen Systemen für Deutsch unbrauchbar. Höchstens als abschaltbarer Notbehelf.
- **Erzeugung:** lokal vorab per Offline-TTS, z. B. **Piper mit der deutschen „Thorsten“-Stimme (CC0)** – Skript `werkzeuge/audio/tutorial_stimme.*` liest `skript.js` und erzeugt alle Zeilen; Ergebnisse werden eingecheckt, Quelle/Lizenz kommt nach `client/assets/eigene/credits.json`. Alternativ eigene Aufnahme oder ein anderer TTS – Pipeline bleibt gleich. (Umsetzung prüfen: Piper-Lizenz, Installierbarkeit im Container.)
- **Größe:** ~60 Zeilen × ~7 s. Ogg/Opus (~12 KB/s) ≈ 5 MB – der Editor hat bereits einen Ogg-Opus-Kodierer (`editor/kern/oggOpus.js`, Audio-Zentrale). Dateien **kapitelweise nachladen**, nicht beim Start.
- Browser-Autoplay: Start kommt aus einem Klick (Menü) → Ton erlaubt.
- `npm run tutorial:stimme` listet fehlende/verwaiste Dateien (analog `npm run sounds`).

## 10. Modelle & Größen

**Bestand (`client/assets/eigene/`, 452 Modelle) reicht für ein glaubwürdiges Krankenhaus:**
Betten (`single-bed`, `bed-single`, `bunk-bed`, `double-bed`, `bedside-lamp`) · Empfang/Büro (`executive-desk`, `computer-desk`, `l-shaped-desk`, `monitor`, `phone`, `radio`, `tv`, `dry-erase-board`, Bürostühle) · Wartebereich (`sofa`, `two-/three-seater-couch`, `club-arm-chair`, `bench`, `vending-machine`, `coffee-machine`, Pflanzen) · Apotheke/Schränke (Hoch-/Unterschränke, `cube-cabinet`, `first-aid-kit`, `scissors`) · Kantine (`fridge*`, Herd, Spüle, Tische) · Technik/Keller (`toolbox`, `gas-can`, `propane-tank`, `pipes`, `metal-scaffold`, `ladder`, `pallet`, `crate*`, `barrel`) · Verfall (`blood-splat*`, `debris-papers*`, `debris-pile`, `broken-window`, `trash-bags`, `barrier`) · Außen (`car`, `suv`, `taxi`, `police-car`, `street-light`, `fence`, `hedge`, Bäume, `park-bench`, `crate-of-tomatoes/-potatoes`, `fountain`) · Training (`punching-bag`).

**Lücken (typisch Krankenhaus):** Krankenbett mit Rollen, Rollstuhl, Infusionsständer, Trage, OP-Lampe, Toilette/Waschbecken/Dusche, Defibrillator, Medikamentenwagen, Krankenwagen.
→ Erst **Kombi-Prefabs aus vorhandenen Teilen** im Editor (z. B. Rollstuhl ≈ `chair` + 2× `wheel`; Infusionsständer ≈ `post` + `bag`; Trage ≈ `gymmat` + `metal-bars`). Echte Zusatzmodelle nur CC0/CC-BY (Poly Pizza, Quaternius, Kenney) mit Eintrag in `credits.json`; die Websuche hat **keinen bestätigten CC0-Treffer** geliefert → in Phase 0 gezielt auf den Seiten prüfen.

**Größen-Audit (Phase 0):** Originalmaße der Modelle sind teils absurd; maßgeblich ist die handgepflegte `zielHoehe` (`werkzeuge/assets/eigene_kategorien.mjs` → `npm run eigene:index` → `index.json`). Stichproben, die ich auffällig finde: `chair` 1,77 m · `can` 0,64 m · `pot` 1,04 m · `ceiling-lamp-3/-4` 1,4–1,65 m · `plant-big` 0,25 m vs. `plant-big-2` 3,76 m · `clover` 1,26 m · `flower-single` 2,1 m · `axe2` 3,26 m · `fire-truck` Originalmaß 1×0,4. Vorgehen:
1. **Modellschau-Karte** (Testzone): alle ~70 Krankenhaus-/Garten-Modelle in Reihe neben der **Referenzfigur** (Spielerhöhe messen: `browserSurvival.spiel.renderer.figuren`), Screenshot per Rauchtest.
2. Soll-Tabelle (Tür 2,1 · Bett ~0,9 · Stuhl ~0,9 · Tisch 0,75 · Schrank 1,9 · Kühlschrank 1,8 · Automat 1,8 · Deckenlampe < 0,4 …) gegen Ist prüfen, Abweichungen in `HOEHEN` korrigieren.
3. Sicher für Bestehendes: Typ-IDs enthalten die Höhe (`sf_<name>_<dm>`), bereits platzierte Objekte in Stadtrand/Schneeland ändern sich dadurch **nicht**. Einzelstücke zusätzlich im Editor-Inspektor skalierbar.
4. Neuer Test: `zielHoehe` je Kategorie in plausiblem Bereich (Ausreißer-Liste statt stiller Fehler).

## 11. Balancing & Regeln (Kurzfassung)

- **Munition** nie leer (§4.2), Nachladen trotzdem Pflicht; im Finale kurzer Hinweis „In der Story ist Munition knapp – bastle selbst welche (Kap. 7)“.
- **Zombies** sparsam und gestaffelt (halb → normal → Läufer; **kein Brocken**); Ruhe in Kap. 1–4.
- **Kein Soft-Lock:** Pflichtitems nachliefern, Gates nur mit lösbaren Bedingungen, Respawn am Checkpoint, Kapitel-Sprung jederzeit.
- **Zeit:** Skript darf Uhrzeit setzen (Morgen → Dämmerung → Nacht im Finale; `zeit(h)`-Helfer existiert).

## 12. Austauschbarkeit (wo liegt was)

| Was | Wo | Ändern durch |
|---|---|---|
| Texte, Aufgaben, Reihenfolge, Bedingungen | `server/spiel/tutorial/skript.js` | Text/Daten editieren (Test prüft Referenzen) |
| Funkzeilen (Ton) | `client/audio/tutorial/<id>.ogg` | Datei ersetzen |
| Funk-Klang | `client/audio/funkstimme.js` (Filter-Parameter) | Zahlen anpassen |
| Karte, Möbel, Zombies, Marker | `server/spiel/karten/tutorial.js` (Editor/Generator) | Map-Editor |
| Regeln (Munition, Schaden, Tod) | Zonen-Werte `tutorial` | Konfiguration |
| UI-Optik | `client/ui/tutorialAnzeige.js` + CSS | – |

## 13. Umsetzung in Phasen

| Phase | Inhalt | Ergebnis |
|---|---|---|
| 0 | Größen-Audit + Modellschau, Krankenhaus-Prefabs (Rollstuhl, Infusionsständer …), ggf. CC0-Modelle | Möbel passen, Baukasten-Set „Krankenhaus“ |
| 1 | Gerüst: Hauptmenü-Knopf, lokale Wegwerf-Instanz, Skript-Engine, Aufgabenliste/Hinweise/Marker, Esc-Dialog, Ende-Dialog, **Mini-Karte mit Kap. 1–2** | Durchstich ohne Stimme, testbar |
| 2 | Krankenhaus bauen (Generator/Editor), Kap. 3–6 inkl. Übungsziel, Stromausfall, Skript-Spawns, Gates | Innenteil komplett |
| 3 | Außenbereich: Kap. 7–8 (Sammeln, Werkbank, Feuer, Farm, Teich), Beet-Zeitraffer; Finale Kap. 9 mit Auto/Horde/Ausfahrt | Tutorial komplett spielbar |
| 4 | Funkstimme: Texte finalisieren, Sprachdateien, Funk-Filter, Ducking, Regler, Tutorial-Musik/Klänge | Atmosphäre |
| 5 | Erstbesuch-Automatik (Flag, später „beim ersten Einloggen“), Kapitel-Auswahl, Touch-Feinschliff, Feedback-Runde | Rund |
| 6 | (später) Direkt im Spiel / Zonen-Instanzen pro Spieler | – |

## 14. Tests

`tests/tutorial.test.js`: Skript-Validierung (alle Items/Rezepte/Ereignisse existieren, jeder Schritt hat Text, Zeilen-IDs eindeutig, Dateien ↔ IDs, Kapitel erreichbar) · **Durchspiel-Bot** (lokaler `SpielServer` mit Tutorial-Karte, setzt Zustand/Ereignisse je Schritt und prüft Fortschritt bis zum Ende) · Karten-Prüfung (Spawn, Ankunft, Ausfahrt, Gates lösbar) · Sicherheitsnetz (Tod → Checkpoint ohne Verlust, Munition-Nachschub, Soft-Lock-Nachlieferung) · Größen-Test (§10) · Rauchtest im Browser (Hauptmenü → Tutorial → Esc → Ende-Dialog), auch mit Touch-Emulation.

## 15. Risiken & offene Punkte

- **Performance:** viele Möbel-Modelle in einer Zone → Draw-Calls/Lichtbudget im Blick (F3), Instancing/Chunks nutzen; Ziel ≥ 30 FPS auf schwachen Geräten.
- **Enge Flure:** Zombie-Pfadfindung und Tür-Engstellen vorher im Debug-Lauf prüfen.
- **Touch:** Aufgabenliste + Pop-ups dürfen Sticks/Schnellleiste nicht überdecken; Tastenkappen → Symbole.
- **Esc-Konflikt** mit Menü-Schließen und Browser-Vollbild (siehe §2) sauber testen.
- **Stimmenrechte/Lizenz** der TTS-Stimme vor dem Einchecken verifizieren (Quelle in `credits.json`).
- Neues Protokoll-Element (`NACHRICHT.TUTORIAL`, kleine Whitelist-Aktion `tutorial`) → `PROTOKOLL_VERSION` erhöhen, falls Online-Clients betroffen wären (Tutorial läuft lokal → vermutlich nicht nötig).
- Entscheidungen offen für dich: Name der Klinik, Länge (12–15 min ok?), ob Angeln/Basisbau Pflicht werden sollen.

## Quellen (Recherche)

- Allgemeine Onboarding-Regeln (eine Mechanik nach der anderen, Lernen durch Tun, Überspringen mit Rückweg): [wayline.io – Tutorials as UX](https://www.wayline.io/blog/tutorials-as-ux-player-onboarding), [Best Practices for Mobile Game Onboarding](https://adriancrook.com/?p=8055)
- Browser-Sprachausgabe & deutsche Stimmen: [MDN Web Speech API](https://developer.mozilla.org/docs/Web/API/Web_Speech_API), [Cross-Browser Speech Synthesis](https://dev.to/jankapunkt/cross-browser-speech-synthesis-the-hard-way-and-the-easy-way-353)
- Offline-Stimme Piper „Thorsten“ (CC0): [rhasspy/piper-voices Model Card](https://huggingface.co/rhasspy/piper-voices/blob/main/de/de_DE/thorsten/medium/MODEL_CARD), [Thorsten-Voice](https://github.com/thorstenMueller/Thorsten-Voice)

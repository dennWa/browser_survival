# Konzept: Große Zonen, Ladebildschirm statt Vorladen, keine Ruckler

Stand 2026-10-22 · Status: **Phase A + B umgesetzt** (Rückbau, Ladebild mit Fortschritt, Max. 1500 × 1500, Zonen-Chat). Offen: C (Ruckel-Messung), D (Sektor-Streaming/LOD für schärferen Boden auf großen Zonen), E (Schleusen).

## 1. Entscheidungen (Nutzer)

- Jede Zone (z. B. Schneeland) ist **eine große, im Editor frei bearbeitbare Karte**.
- **Kein nahtloses Vorladen der Nachbarzone mehr** – das bringt Ruckler mitten im Spiel.
- Zonenwechsel = **kurzer Ladebildschirm**, der alles vorbereitet, was geht.
- In der Zone selbst: **keine Ruckler**. Nur kleine Details (Animationen, Partikel, Geräusche, KI-Kram) kommen erst in Spielernähe dazu.
- Übergänge werden später als „Schleusen“ gestaltet (Camp, Tunnel, Pass, Grenzposten …): rein ins Camp → Ladebild → raus in die neue Zone.

## 2. Warum es heute ruckelt

Ein Frame darf ~16 ms (60 FPS) dauern. Ruckler entstehen, wenn *während des Spielens* eines davon passiert:

| Ursache | Typischer Spike | Heute ausgelöst durch |
|---|---|---|
| Shader kompilieren (neue Material-Variante) | 50–500 ms | Nachbarzone, Wetter/Nacht, neue Modelle |
| Textur hochladen (GPU) | 20–200 ms | Boden-Textur der Nachbarzone |
| Geometrie bauen + hochladen | 5–100 ms | Nachbar-Chunks, Bauwerke |
| Garbage Collection | 10–50 ms | viele Wegwerf-Objekte beim Bauen |

**Regel für alles Neue:** Diese vier Dinge passieren entweder im Ladebildschirm – oder in so kleinen, gedeckelten Portionen, dass kein Frame über Budget kommt.

## 3. Rückbau (Phase A)

Raus bzw. stillgelegt:
- Übergang-Feld `nahtlos`, `randKante`/`kante` (ganze Kante als Übergang), `startDaten.nachbarn`, `ZONE_WECHSEL.nahtlos`
- Client: `renderer.setzeNachbarn` / `#aktualisiereNachbarn`, `NACHBAR_*`, `#nachbarTiefe`, Überlappungsstreifen
- Nachricht `fremdeGegenstaende` + Server `#sendeFremdeGegenstaende`, `#nahtloseNachbarn`, Mitlaufen der Nachbarzone in Grenznähe
- Tests „Nahtloser Übergang“ → ersetzt durch Tests für Übergang mit Ladebild

Bleibt: Zonen-System (1 Karte = 1 `SpielWelt`), klassische Übergänge (Bereich/Tür → Zielzone + Ankunft), Editor-Weltkarte (Layout bleibt als Planungshilfe).

## 4. Der Ladebildschirm, der wirklich alles vorlädt (Phase B)

Ablauf beim Zonenwechsel (und beim Login), mit **echtem Fortschrittsbalken** je Schritt:

1. **Daten** – Server schickt Karte kompakt (Typed Arrays, gzip). Client cached je Zone + Version in IndexedDB → beim zweiten Mal fast sofort.
2. **Geometrie** – alle Sektoren (s. §5) der Zone bauen, bevorzugt in einem **Web Worker** (blockiert die Seite nicht, Balken läuft flüssig).
3. **Texturen** – alle Texturen der Zone + Atlas per `renderer.initTexture` auf die GPU.
4. **Shader** – `renderer.compileAsync` für **alle** Material-Varianten: Tag/Nacht, Schatten an/aus, Wetter, Nebel, jede Qualitätsstufe, alle Figuren/Waffen/Fahrzeuge/Tiere, die in der Zone vorkommen können.
5. **Aufwärmen** – ein paar unsichtbare Frames von mehreren Punkten der Zone rendern (zwingt Treiber, wirklich alles fertig zu machen).
6. **Puffer-Pools** anlegen (Partikel, Projektile, Zombies, Fußspuren …) → während des Spielens wird nichts mehr neu erzeugt, nur wiederverwendet → keine GC-Spikes.

Erst danach verschwindet das Ladebild. Ziel: **< 5 s** bei Erstbesuch, **< 2 s** aus dem Cache (Intel Iris Xe).

## 5. Riesige Zonen (bis 10 000 × 10 000 Kacheln)

Ehrlich gesagt: 10 000² = **100 Mio. Kacheln**. Alles komplett auf die GPU zu legen, schafft kein Handy und auch kein normaler Laptop. Darum zwei Größenklassen mit demselben System:

**Sektoren:** Zone wird in feste Sektoren à 64 × 64 Kacheln geteilt (passt zu `BLOCK_KACHELN` 64).

- **Normale Zone (bis ca. 1500 × 1500):** Alles wird im Ladebild komplett gebaut und auf die GPU gelegt. Während des Spielens nur noch Culling (Frustum + Weite). → null Nachladen.
- **Riesen-Zone (darüber):** Im Ladebild wird *alles CPU-seitig* fertig gerechnet (Sektor-Geometrie als fertige Puffer, im Worker, gecacht). Auf der GPU liegt nur ein Ring um den Spieler (z. B. 7 × 7 Sektoren). Nachgeladen wird
  - **weit vor** der Sichtweite (Spieler merkt nichts),
  - aus **Fertig-Puffern** (kein Bauen mehr, nur Kopieren),
  - in **wiederverwendete GPU-Puffer** (Pool, keine neuen Objekte),
  - mit **hartem Budget** (z. B. max. 2 ms pro Frame, notfalls einen Frame später),
  - Shader/Texturen sind schon da → kein Kompilier-Spike möglich.
- **LOD in der Ferne:** Boden ferner Sektoren als grobe Kachel, Bäume als einfache Billboards, Häuser als Klötze. Nah = volles Detail.
- **Details nur in Nähe:** Animationen (Bäume, Wasser, Tiere), Partikel, Umgebungsgeräusche, Innenräume, Loot-Darstellung erst im Radius ~1–2 Sektoren – aber aus vorbereiteten Pools, nicht neu gebaut.

**Server:** Simuliert nur Sektoren mit Spielern in der Nähe (Zombies/Tiere „schlafen“ sonst), Interest-Management wie heute (`NETZ_SICHTWEITE`).

**Editor:** Speichert große Karten sektorweise (nur geänderte Sektoren neu), zeigt in der Übersicht ein verkleinertes Bild, bearbeitet nur den sichtbaren Ausschnitt in voller Auflösung. Ab Riesen-Größe ist das der aufwendigste Teil.

> Empfehlung: Mit Normal-Zonen (z. B. 1000 × 1000) starten, Riesen-Zone (Phase D) erst bauen, wenn wirklich gebraucht. Größe wird fürs Spielgefühl selten das Problem – eher, sie sinnvoll zu füllen.

## 6. Übergänge als „Schleusen“ (Phase E, später)

- Neuer Übergangstyp im Editor: **Schleuse** (Bereich + Zielzone + Ankunft), optisch z. B. Camp-Tor, Höhle, Tunnel, Bergpass.
- Die Schleuse existiert **in beiden Zonen** (gleiches Prefab), damit es sich wie ein Ort anfühlt.
- Optional: Ladebild mit Motiv der Zielzone + Tipp-Text; Nebel/Abblende statt hartem Schnitt.
- Touch: Betreten reicht (kein Extra-Knopf); optional Abfrage „Weiterreisen?“ mit großem Knopf.

## 7. Umsetzung in Phasen

| Phase | Inhalt | Ergebnis |
|---|---|---|
| A | Nahtlos-Rückbau (§3) | Keine Hintergrund-Ruckler mehr |
| B | Ladebild-Pipeline (§4) inkl. Shader-/Textur-Vorladen, Pools, IndexedDB-Cache | Flüssig ab Spielstart |
| C | Ruckel-Messung im Rauchtest: längster Frame beim Ablaufen der ganzen Zone, Ziel **max. 33 ms**, 99 % der Frames < 20 ms | Ruckler werden messbar, Regressionen fallen auf |
| D | Sektor-Streaming + LOD für Riesen-Zonen (§5), Editor sektorweise | Zonen > 1500² möglich |
| E | Schleusen-Übergänge (§6) | Schöne Übergänge |

## 8. Entschieden

1. Maximum 1500 × 1500 Kacheln je Zone (Editor + Kartenlader).
2. Chat nur in der eigenen Zone, `/a Text` an alle Zonen. Spielerliste (Tab) serverweit mit Zone.
3. Ladebild schlicht mit Balken unten; Bilder/Tipps kommen später in `#lade-motiv`.

**Hinweis Speicher:** Bis Phase D wird die Bodentextur großer Zonen automatisch gröber (Budget 512 MB PC / 192 MB Handy), damit alles hinter dem Ladebild auf die Grafikkarte passt. Ab etwa 400 × 400 Kacheln sieht man das.

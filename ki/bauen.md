# Bauen · Handwerk · Ressourcen · Farm · Kisten
> Lesen bei: Basisbau/Bauteile/Flaggen, Bauwerke (Lagerfeuer, Werkbank, Möbel …), Crafting/Rezepte/Kochen, Abbau (Bäume/Steine/Erz/Felsen/Büsche), Farm/Angeln/Wasser, Kisten/Behälter/Kofferraum.
> Kürzel: S: `server/spiel/` · C: `client/` · G: `gemeinsam/` · K: `server/spiel/konfiguration/`

## Basisbau (Taste B, Hammer in der Hand)
- Regeln gemeinsam (Server prüft, Client zeigt Hologramm mit derselben Funktion): `G:basisbau/teile.js` (BAUTEILE-Registry ★ Kosten/Menü-Kategorien Basis·Struktur·Einrichtung·Gemütlich·Farm·Handwerk·Fallen, `block`, `fussabdruck`, `kostenFuer`, `kostenProKachel`), `platzierung.js` (`pruefeBauteil`, `pruefeAnschluss`, `snappe`, `autoDrehung`, `findeAbrissZiel`), `rechte.js`, `territorium.js`.
- Server: `S:systeme/basisbauSystem.js` (AKTION bauen/abreissen, Abriss 75 % Rückerstattung, `setzeBauBlock` 1/2/4/8 je Spieler – Rechtsklick-Popup), `territoriumSystem.js` (Flagge, Radius), Client `C:kern/bauModus.js` + `C:ui/bauMenue.js`, 3D `C:darstellung/basisbauModelle.js` (`INSTANZ_TYPEN` instanziert, Dächer per Flood-Fill ausgeblendet, Zäune mit `zaunMaske`).
- Welt speichert Bauwerke je **Ebene** (`welt.ebenenAnKachel[idx] = {objekt,boden,wand,tuer,dach}`, `bauwerkBei(tx,ty,ebene)`); Wand = ganze Kachel (Kollision/Sicht), Boden/Dach blockieren nie. Delta: `welt.beiBauwerkAenderung(id)` → `SpielWelt.nimmBauwerkAenderungen()` (genau 1× je Version in `Zone.versende`) → Client `wendeBauwerkAenderungAn`.
- ⚠ Flaggen sind KEIN Bauwerk: nur `spielWelt.territorium` + `spieler.flaggeKarte`, an den Besitzer als `spielerDaten.flagge`; roter Ring nur Client (`renderer.zeigeGebiet`). Bauen verlangt `hammerInHand`; `bauModus` rüstet per `benutzen` aus (toggelt!). Neue Aktionsfelder in die Whitelist von `spielServer`.

## Bauwerke (`G:welt/bauwerke.js` BAUWERKE, `bauwerkAktion`, `pruefePlatz`)
- `S:systeme/bauSystem.js` (platzieren, `neuesBauwerk`, Feuer/Zünden `zuendQuelle` Feuerzeug>Feuerbohrer, Beete/Wachstum (Regen ×2), Ertrag Eier/Honig, Wasser `fuelleFlasche`, `aktualisiereBauwerke` = Brennen/Verderb/Fallen/Behälter-Nachfüllen). Weltstand-Felder: Whitelist `spielWelt.pruefeBauwerk` (neues Bauwerk-Feld dort eintragen!).
- Stationen `S:systeme/stationSystem.js`: Lagerfeuer (Koch-Plätze, Garzeit nur bei `brennt`, Holz-Hand + LMB legt nach) + Schmelzofen; NACHRICHT `station` nur an den Öffner; UI `C:ui/stationFenster.js`. Ewiges Lagerfeuer (Kartenbauwerk `ewig`, Lager-Zone). Sitzen → ki/spieler.md.
- Möbel/Cozy (`moebel:true`, `G:welt/einrichtung.js`: Licht, Strom/Generator, Kamin, `istGemuetlich`), Modelle `C:darstellung/moebelModelle.js` (GLB aus `assets/eigene` + prozedural; Kaminfeuer `baueKaminFeuer` mit Ein-/Ausblenden), Musik `S:systeme/musikSystem.js` + `C:audio/hausMusik.js`. Fallen → ki/kampf.md. Zelt = Schlafplatz. Ereignis-Bauwerke `heliwrack`/`absturzkiste` (`ereignis: true`, Feld `bis`) → ki/npc.md.
- 3D: `C:darstellung/bauwerkModelle.js erzeugeBauwerk` (default-Hook → moebelModelle).

## Crafting · Kochen
- Rezepte K:`rezepte.js` ★ (`ort`: werkbank|amboss|webstuhl|chemie|feuer|inventar, `level`, Kategorien) – Orte `G:spieler/handwerk.js` (`HANDWERK_ORTE`, `naheHandwerk`, `rezepteFuerOrt`), Server `S:systeme/craftingSystem.js stelleHer`, UI `C:ui/werkbankMenue.js` (Reiter, Reparieren). KOCHBAR in `bauwerke.js`.

## Ressourcen & Abbau
- Knoten `G:welt/ressourcen.js RESSOURCEN_OBJEKTE` (baum/baum_herbst/tanne → holz+axt, stein/eisenerz → spitzhacke, `FELSEN` r32_fels_* abbaubar, busch → ast `ohneWerkzeug`). `abbauArtFuer(r, handId, hat, rindeAb)` + `abbauText` = EINE Regel für Server (`arbeitSystem.starteAbbau`) und Client (`clientSpiel.#interaktion`). Rinde (Messer in der Hand, max 3 je Baum, `Welt.rindeAb`).
- `S:systeme/arbeitSystem.js`: Abbau-Arbeit, `chanceAufMehr`/`sammelFaktor`, klein/groß (`mengeGross`), Nachwachsen, Drops als Bodenitems (`lasseRessourceFallen`; Ast/Rinde direkt ins Inventar), Apfel-Bonus. Blick-Fixierung beim Abbau (`spielerDaten.arbeit.ziel` → `clientSpiel.abbauBlick()`).
- Darstellung: `C:darstellung/kartenModell.js #baueRessourcen` (Chunks 12×12, InstancedMesh je Variante, Stumpf-Pools `Block#Gruppe#Form` aus `stumpf.glb`), Bäume `C:darstellung/baumModell.js` (→ ki/darstellung.md). Neue abbaubare Deko = `RESSOURCEN_OBJEKTE`-Eintrag (+ Modellgruppe läuft automatisch über `welt.ressourcen`).

## Farm · Angeln · Wasser
- PFLANZEN/BEET_TYPEN (`bauwerke.js`), Hacke-Feld (`FELD_GROESSE` 1, `clientSpiel.#handZiel`), Samen aus der Hand (`pflanzeSamenAusHand`), Gewächshaus, Hühnerstall, Bienenstock (K `farm`).
- Angeln `S:systeme/angelSystem.js` (Angel IN der Hand, Linksklick wirft, Biss/Fang, K `angeln.beute`), Regeln `G:welt/wasser.js`, Darstellung `C:darstellung/angelModell.js`.
- Wasser: `leere_flasche` füllen (dreckig) → abkochen am Feuer; Regentonne/Brunnen.

## Kisten · Behälter · Kofferraum · Leiche
- `S:systeme/kistenSystem.js`: Lagerkiste (Bauwerk, `KISTE_PLAETZE` 16, Inhalt nie ins Netz außer an den Öffner), Karten-Behälter (`G:welt/behaelter.js`, `oeffneBehaelter` würfelt Loot beim 1. Öffnen, Nachfüllen nach K `loot.behaelterNachfuellen`), Kofferraum (`spieler.offeneKiste = 'f<fzId>'`, Taste G/Tab hinter dem Auto), Leiche (`'l<ID>'`). Kofferraum-Ansicht trägt zusätzlich `auto` (Auto-Menü, ki/fahrzeuge.md). Gemeinsame Nachricht `kiste{id,inhalt,titel}`; UI `C:ui/kisteFenster.js` (2 Spalten, „Alles nehmen“). Items in Kisten laufen über `spielstand.pruefeEintrag`.
- Loot: `S:systeme/lootSystem.js` + K:`lootTabellen.js` ★ (Raumtypen), Loot-Zonen/Spawnpunkte (→ ki/karten.md).

## Tests
`basisbau` (Flaggen, Kosten, Snapping, Rechte, Abriss, Blöcke), `bauen` (Feuer, Fallen, Beete, Kochen, Kiste), `mechaniken`, `runde13` (Stationen/Kofferraum), `runde24` (P7 Cozy, P10 Farm, P12 Wasser, P13 Handwerk), `runde25` (Behälter), `runde31` (Ast/Rinde/Feuerbohrer), `runde38` (Bodenitems, Felsen), `touchBauen`.

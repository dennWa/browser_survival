# Architektur · Netz · Protokoll · Spielstand
> Lesen bei: Spiellogik-Grundgerüst, neue Nachricht/AKTION, Zonenwechsel, Spielstand, Lokal-Modus, Tests mit eigener Karte.
> Kürzel: S: `server/spiel/` · C: `client/` · G: `gemeinsam/` · K: `server/spiel/konfiguration/`

## Aufbau
- Client↔Server immer über Text-Kanal: WebSocket (`server/node/websocketAnbindung.js`, permessage-deflate) oder im **Lokal-Modus** `S:netz/speicherKanal.js` = derselbe `SpielServer` läuft im Browser-Tab (`C:netzwerk/lokalerServer.js`; Singleplayer, Tutorial, Editor-Test). GitHub Pages = nur Lokal-Modus.
- `S:spielServer.js` (Login, Sitzungen, Routing, `#aktion`-Validierung, `#wechsleZone`, `#chat`, `#startDaten`) → Zonen `S:zone.js` (1 Karte = 1 `SpielWelt`, Interest-Management: Zombies/Autos nur ±`NETZ_SICHTWEITE` 2400 px, Spieler immer). `startZone` läuft immer (= Weltuhr), andere nur mit Spielern (sonst Pause, beim Betreten `holeZeitNach`).
- Tick 30 Hz (`S:taktgeber.js`) → aktive Zonen `SpielWelt.aktualisiere(dt)` → Zonenwechsel → Autosave → `Zone.versende`.
- `SpielWelt.aktualisiere`-Reihenfolge: Aktionsende → Bots (`aktualisiereBots`) → `verarbeiteSpielerEingaben` → Fahrzeuge → `pruefeUebergaenge` → `verarbeiteAktionen` → Nachladen → Kampf (`behandleAngelKlick` zuerst!) → Arbeit → Bauwerke/Kisten → Türen → Zombies → Tiere → Angeln → Wetter → Überleben → Loot → Tageszeit → Tutorial/Ziele (lesen `spielWelt.ereignisse`).
- Entität = Datenobjekt (`S:entitaeten/*`), Verhalten = System (`S:systeme/*`). Netz sieht nur, was `…ZuNetzwerk` liefert. Welt-Regeln (Kacheln, Kollision, Türen, Ressourcen, Bauwerk-Ebenen, `istInnen`/`istUnterDach`) in `G:welt/welt.js`.
- Client: `C:main.js` (Verdrahtung, Hauptmenü → `anmeldungStarten` → `ClientSpiel`; Zonenwechsel = Ladebild + neues ClientSpiel, seq läuft weiter) · `C:kern/clientSpiel.js` (Netz, Vorhersage, Interaktion, Sounds, HUD-Daten; 2.000 Z. → `npm run ki:gliederung`) · Vorhersage mit `G:physik/bewegung.js`/`fahrzeug.js` (deterministisch) + Reconciliation (seq) + Interpolation anderer (100 ms Verzug).

## Protokoll (`G:protokoll.js`, `PROTOKOLL_VERSION` in `G:konstanten.js`)
- C→S: `anmelden` · `eingabe{seq,x,y,blick,angriff,sprint,abstand}` · `aktion{art,…}` · `chat` · `ping` · `dev*` · `stimme`.
- S→C: `anmeldungOk`/`zoneWechsel` (Startdaten: karte, physik, gegenstaende, tueren, abgebaut, bauwerke, rinde, laternen, erkundet, rezepte, itemDefinitionen, spielerDaten, tageszeit …) · `zustand{tick,zeit,tag,wetter,wind,nass,nachtArt,entitaeten,ereignisse}` 30/s · `bauwerkeAenderung` (Delta) · `kiste`/`station` (nur an den Öffner) · `spielerDaten` (privat, bei Änderung) · `spielerListe` · `meldung` · `chat` · `system` · `pong`.
- **Neue AKTION:** G:`AKTIONEN` → S:`spielServer` Whitelist `GUELTIGE_AKTIONEN` + Feld-Validierung in `#aktion` (⚠ unbekannte Felder werden verworfen!) → Dispatcher `S:systeme/inventarSystem.js` (`verarbeiteAktionen`) → System → C: `clientSpiel`-Methode + Taste in `C:kern/eingabe.js` (TASTEN) + **Touch-Knopf** (HUD, `.nur-touch`). Inkompatibel? `PROTOKOLL_VERSION`++.
- Ereignisse (`spielWelt.ereignisse`, im Zustand mitgeschickt) sind global benannt (⚠ Schuss = `feuer`, Lagerfeuer = `lagerfeuer`). Client wertet sie in `clientSpiel` aus (Sounds/Effekte).

## Datenformen
- Spieler (S, `S:entitaeten/spieler.js`): x,y,blick,leben/maxLeben,hunger,durst,ausdauer,kaelte,naesse,erkaeltung,muedigkeit,zustand{blutung,infektion,bruch,…},buffs,inventar[{defId,menge,magazin?,haltbarkeit?,mods?,verderb?}],ausgeruestet,rucksack,kleidung{kopf…},level,xp,skills,arbeit{art,…,ort?},fahrzeug,haustiere,erkundet,bot?,gottmodus?.
- Weitere Entitäten: zombie (variante, zustand, ziel, pfad) · fahrzeug · tier (art hase|reh|hirsch|fuchs|hund|katze|huhn) · gegenstand · leiche.
- Bauwerk `{id,typ,tx,ty,besitzer,drehung?,…}` – privates (Kisten-`inhalt`, Station-`plaetze`) strippt `bauwerkeOeffentlich()`.
- Spielstand (`S:spielstand.js`, prüft ALLES): Spielerwerte + `karte` + `erkundet{kartenId:b64}` + Gesundheit/Nässe/Haustiere. ⚠ `leben` erst NACH Skills setzen (maxLeben hängt dran). Neues Feld → `erstelleSpielstand` + Laden/Prüfen + `tests/spielstand.test.js`.
- Weltstand je Zone `welt:<kartenId>` (`spielWelt.weltzustand/uebernimmWeltzustand`): zeit, tag, bauwerke (Feld-Whitelist `pruefeBauwerk`!), fahrzeuge (`fahrzeugeAlle`), behaelter, Kisten-Inhalt.
- Lokal: Spielstände im Browser (`C:netzwerk/browserSpeicher.js`, 3 Slots `spielstandSlots.js`, Autosave 90 s); Node: `server/daten/spielstaende/` (⚠ nie committen, ebenso `konten.json`, `einstellungen.json`).

## Fallen ⚠
- Zonenwechsel: neue Entitäts-ID in neuer Zone; Server übernimmt `letzteEmpfangeneSeq`, Client zählt seq weiter.
- Schnappschuss rundet Zombie/Auto-Werte (0,01 px); eigener Spieler + sein Fahrzeug exakt (Reconciliation) – nicht runden.
- Neue Bewegungsparameter immer über `physikParameter` an den Client geben (sonst Vorhersage ≠ Server).
- Zonen-Konfiguration erbt per Prototyp → nie `{...konfig}` spreaden (for…in nutzen).
- Objekt-Spread: `{ ...bauwerkAktion(), art: 'bauwerk' }` – `art` NACH dem Spread.
- Spiellogik (S:, G:) bleibt umgebungsfrei (kein `node:`, kein DOM) – läuft auch im Browser.

## Tests & Hilfen
- Eigene Karte im Test: `new SpielServer({ kartenDefinition, kartenDefinitionen, konfiguration })`; `server.spielWelt` = Startzone, `server.weltVon(name)`. Sofort-Zonenwechsel: `konfiguration.welt.uebergangSekunden = 0`. Muster: `tests/runde24.test.js` exportiert `neueWelt`, `KARTE`, `ticks`.
- Konsole (Lokal-Modus, `C:kern/konsolenHelfer.js`): `browserSurvival.{tp(tx,ty), gib(defId,n), boden(defId,n), zeit(h), zone(id[,ankunft]), wetter(art), ich(), welt(), spiel, server}`. F3 = Debug-Statistik.
- Server-Zone der eigenen Figur im Browser: `[...browserSurvival.server.zonen.values()].find(z => z.spielWelt.welt.id === browserSurvival.spiel.welt.id)` (⚠ eigene ID gibt es evtl. in mehreren Zonen).
- Admin/Dev: `S:systeme/adminSystem.js` (ADMIN_BEFEHLE, Gottmodus koppelt ∞ Munition/Ausdauer + `GOTT_AUSRUESTUNG`), Developer-Werte `S:entwickler.js` + `K:entwicklerFelder.js`, Debug-Testlauf `C:debug/debugLauf.js` (nur `?editorTest=1`).
- Tests: `tests/spielServer`, `spielstand`, `zonen`, `zonenManager`, `lokalerServer`, `konten`.

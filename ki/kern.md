# Kern: Architektur · Protokoll · Datenformen

> Grundverständnis von Server/Client/Netz. Lesen, wenn du Spiellogik, Nachrichten oder Spielstände anfasst.

## 2 · Architektur in 12 Zeilen
- Client↔Server immer über Text-Kanal (WS `server/node/websocketAnbindung.js` [permessage-deflate] | Speicher-Kanal `S:netz/speicherKanal.js` im Lokal-Modus = derselbe Server im Tab).
- `S:spielServer.js` Sitzungen/Login/Routing → Zonen (`S:zone.js`, 1 Karte = 1 `SpielWelt`), Map `zonen`; `startZone` immer aktiv (= Weltuhr), andere nur mit Spielern (sonst Pause, beim Betreten `holeZeitNach`).
- Tick 30 Hz (`S:taktgeber.js`) → `tickAusfuehren`: aktive Zonen → `SpielWelt.aktualisiere(dt)` → Zonenwechsel (`spieler.zonenwechsel`) → Autosave → `Zone.versende` (Interest Mgmt: Zombies/Autos nur ±`NETZ_SICHTWEITE`=2400 px, Spieler immer).
- `SpielWelt.aktualisiere` Reihenfolge: Aktionsende → `verarbeiteSpielerEingaben` → `aktualisiereFahrzeuge` → `pruefeUebergaenge` → `verarbeiteAktionen` → Nachladen → Kampf (→ `behandleAngelKlick` zuerst!) → Arbeit → Bauwerke (+Kisten) → Türen → Zombies → Tiere → Angeln → Wetter → Überleben → Loot → Tageszeit.
- C: Vorhersage (G:physik/bewegung.js bzw. fahrzeug.js, deterministisch) + Reconciliation (seq) + Interpolation anderer (geglättete Tick-Uhr `tickNull`, 100 ms Verzug, Objekt-Pool).
- Entität = Datenobjekt, Verhalten = System (`S:systeme/*`). Netz sieht nur, was `…ZuNetzwerk` liefert.
- Welt (`G:welt/welt.js`): Kacheln, Möbelkollision, Türen, Ressourcen (abbaubar), Bauwerke (Kachel-Index), Fahrzeug-Kacheln, `istInnen`, `uebergaenge`.

## 4 · Protokoll v8 (Kurz)
C→S: `anmelden{benutzername,passwort,protokoll,gast?,aussehen?}` · `eingabe{seq,x,y,blick,angriff,sprint}` · `aktion{art,slot?,ziel?,tx?,ty?,rezept?,befehl?,skill?}` · `ping{t}` · `chat{text}` · `dev*`.
S→C: `anmeldungOk`/`zoneWechsel` {spielerId, karte, start, physik, gegenstaende, tueren, abgebaut, bauwerke, erkundet, rezepte, itemDefinitionen, spielerDaten, tageszeit, zeit, tag (+zone)} · `zustand{tick,zeit,tag,wetter,entitaeten,ereignisse}` (30/s, gefiltert; Entitäten: spieler zombie fahrzeug tier) · `bauwerkeAenderung{gesetzt[],entfernt[ids]}` (Delta; >200 Änderungen → ganze `bauwerke`-Liste) · `kiste{id,inhalt|null,titel?}` (nur an den Öffner; id 'f<n>' = Kofferraum) · `station{id,art,brennt,brennRest,brennstoff,plaetze|null}` (nur an den Öffner) · `spielerDaten` (privat, bei Änderung; + `flagge{tx,ty,radius}|null`, `spawn{karte,tx,ty}|null`, `bauRadius`) · `gegenstaende`/`tueren`/`ressourcen`/`bauwerke` (bei Änderung, pro Zone) · `meldung` · `chat` (global) · `einstellungen` · `devWerte` · `system` · `pong`.
AKTIONEN: aufheben benutzen **konsumieren{slot}** ablegen tauschen rucksackAblegen platzieren **bauen{teil,tx,ty,drehung?} abreissen{tx,ty,ebene?}** feld kisteLegen kisteNehmen kisteSchliessen kofferraum stationLegen stationNehmen stationSchliessen stationSitzen feldEntfernen feuer bauwerk skill fahrzeug nachladen tuer abbauen schlafen herstellen licht wiederbeleben admin. ⚠ Neue Aktion: G:protokoll → S:spielServer `#aktion` (Validierung!) → S:inventarSystem Dispatcher → C:clientSpiel + eingabe TASTEN + HUD-Touchknopf. Inkompatibel? `PROTOKOLL_VERSION`++.

## 5 · Datenformen
- Spieler (S): x,y,blick,leben/maxLeben,hunger,durst,ausdauer,inventar[] {defId,menge,magazin?}, ausgeruestet, rucksack(defId|null), level,xp,skills{tempo,staerke,leben,sammeln},skillPunkte,tempoFaktor,aussehen,arbeit{art,…},fahrzeug(Entität|null),erkundet(Uint8Array),erkundetAndere{id:b64},zonenwechsel?,imUebergang,eingabePuffer,aktionsPuffer,letzteEmpfangeneSeq.
- Zombie: variante(normal|laeufer|brocken=Boss), zustand, ziel, pfad… · Fahrzeug: modell,x,y,winkel(0=rechts),tempo,laenge,breite,fahrerId,leben/maxLeben(10),kaputt · Tier: art 'hase',x,y,blick,zustand ruhend|flucht · Gegenstand: defId,menge,x,y,verfall?
- Bauwerk: {id,typ,tx,ty,besitzer, brennt/brennRest | gespannt | pflanze/wachstum0..1 | drehung 0/1 (Fenster/Rahmen/Tür/Bett) | offen (holztuer) | inhalt[16] (kiste, nur Server/Weltzustand – `bauwerkeOeffentlich()` strippt ihn)}.
- Spielstand v1: {karte,x,y,leben,hunger,durst,inventar,rucksack,ausgeruestet,level,xp,skills,skillPunkte,aussehen,statistik{zombies,spieler,ueberlebt},erkundet{kartenId:b64}} (altes erkundet{karte,daten} wird gelesen). Welt-Stand `welt:<kartenId>`: {version:1,karte,zeit,tag,bauwerke,fahrzeuge{…,leben,kaputt}}.
- Kartendefinition: {id,name,kacheln[ASCII],raeume{a:{name,lootTabelle}},objekte[{typ,x,y,b,h,blockiert?,ebene?,drehung?,…}],uebergaenge[{x,y,b,h,ziel,ankunft,name}],ankuenfte{name:{x,y}}} (Kacheln). Marker: S Start, Z Zombie (nur draußen), a–z Loot.

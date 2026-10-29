# Konzept Runde 24 – Wind, Progression, Waffen, Cozy, Überleben, Multiplayer

Stand 2026-10-29 · Wunschliste des Nutzers in Phasen (Reihenfolge = Umsetzung). Status je Phase: ⬜ offen · 🔄 · ✅.
Regeln: nur CC0/CC-BY (Quelle sofort in `client/assets/eigene/credits.json`), kleine Dateien, Touch mitdenken, `npm test` vor jedem Commit, direkt `main`, KI_INDEX §24 pro Phase nachziehen. Fehlt ein brauchbares lizenzklares Asset → prozedural/synthetisch.

| # | Phase | Inhalt |
|---|---|---|
| 1 | Wind & Wände | Server-Windstärke (ruhig/leicht/stark, wechselt langsam) → Client: gemeinsame Böen-Kurve für Ton (echte CC0-Windaufnahmen leicht/stark, überblendet) UND Bäume/Gras/Blätter. Seitenwände nicht mehr durchsichtig (nur Wand direkt vor der Figur). |
| 2 | Progression | Hordennächte wachsen (Tag 5/10/20: mehr + stärkere), Boss-Nacht (Brocken-Rudel), Blutmond (rot, doppelte Horde). Neue Zombies: Spucker (Fernkampf-Säure), Sprinter, Gepanzert (langsam, Rüstung), Explosiv (sprengt Wände). |
| 3 | Nahkampf | Baseballschläger, Machete, Brecheisen, Speer (Reichweite) mit Haltbarkeit; Reparatur an der Werkbank (Material je Waffe). |
| 4 | Fernkampf | Schrotflinte (Streuung), Gewehr, Bogen, Armbrust (leise), Pfeile/Bolzen craftbar; Mods Zielfernrohr/Magazin/Schalldämpfer (Lautstärke = Zombie-Lockradius). |
| 5 | Sprengstoff & Fallen | Granate, Molotow (Feuerfläche), Sprengfalle; Stacheldraht, Bärenfalle, Fallgrube, Dosen-Alarm. |
| 6 | Rüstung | Schutzwert (Schaden ↓), Regenschutz (Kälte bei Regen ↓); Lederjacke, Polizeiweste, Helm, Regenmantel … |
| 7 | Cozy-Haus | Möbel/Deko (Sofa, Teppich, Regal, Tisch, Stuhl, Bild, Pflanze, Vorhang), Kamin (Wärme/Licht/Knistern), Kerzen/Öllampe/Lichterkette, Generator+Lampen, drinnen: Regen aufs Dach, gedämpfter Wind, „gemütlich“-Buff. |
| 8 | Musik im Haus | Radio/Plattenspieler: spielt Musik aus `client/musik` räumlich im Haus; YouTube-Link (eingebetteter Player, Lautstärke nach Abstand). |
| 9 | Haustiere | Hund (bellt bei Zombies, kämpft mit, folgt), Katze (folgt/schläft, Cozy). Zähmen per Futter. |
| 10 | Farm | Mehr Pflanzen (Kartoffel, Weizen, Kürbis …), Gewächshaus (wächst auch im Winter/schneller), Hühner (Eier), Bienenstock (Honig). |
| 11 | Gesundheit & Schlaf | Blutung (Verband), Infektion (Antibiotika), Bruch (Schiene), Vergiftung (rohes Fleisch/dreckiges Wasser); Müdigkeit als Wert, Bettqualität. |
| 12 | Wasser & Küche | Dreckiges Wasser, abkochen, Regentonne, Brunnen, Filter; Räuchern/Trocknen, Einmachen, Vorratsschrank (langsamerer Verderb); Rezepte Eintopf/Brot/Gebratenes mit Buffs. |
| 13 | Handwerk-Kette | Amboss/Schmied (Barren → Werkzeug/Waffen), Webstuhl (Stoff → Kleidung), Chemietisch (Medizin/Sprengstoff), Generator (Strom für Lampen). |
| 14 | Multiplayer | Gruppen (teilen Bau-/Kisten-/Türrechte), Tauschfenster zwischen Spielern, Wiederbeleben: niedergestreckt statt sofort tot, Freund hilft mit Verbandskasten. |
| 15 | Voice Chat | Proximity-Voice per WebRTC (Signal über den Spielserver), Lautstärke nach Abstand, Push-to-Talk (Taste V / Touch-Knopf) oder Dauer an. |

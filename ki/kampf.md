# Kampf · Waffen · Explosionen · Fallen · Admin
> Lesen bei: neue Waffe/Munition, Schaden/Treffer, Nahkampf, Granaten/Molotow/Raketen, Fallen, Gottmodus/Admin-Befehle.
> Kürzel: S: `server/spiel/` · C: `client/` · G: `gemeinsam/` · K: `server/spiel/konfiguration/`

## Schaden-Pipeline
- **Einzige Schadensstelle:** `S:systeme/kampfSystem.js fuegeSchadenZu(welt, ziel, schaden, quelle, winkel, optionen)` (Optionen `rueckstoss`, `durchschlag`, `explosion`, `ohneXp`). Darin: Rüstung `kleidungsSchutz` (≤60 %), Panzer-Zombies, `friedlich`-Zone (kein Spielerschaden), Gottmodus, Tutorial-Ohnmacht, Bots wehren sich (`wehreDich`), Gesundheit `nachTreffer` (Blutung/Bruch/Infektion). Hund & Katze unsterblich. → `toeten` (XP, Leiche/Niederstrecken, Wild-Fleisch `wildWerte().fleisch`).
- PvP: K `kampf.pvp` (Standard false); `moeglicheZiele` (gezähmte Tiere nie, Bots immer treffbar).
- Schuss: `aktualisiereKampf` → `schiessen` → `feuereStrahl` (DDA `G:physik/strahl.js`, erste Wand stoppt; Autos `strahlTrifftBox` → `schlageFahrzeug` × K `fahrzeug.schussFaktor`; Höhen-Treffer `trifftHoehe` bei Gelände). Ereignisse `feuer{item,leise}`, `schuss{stoff,treffer,fz,pfeil}` → C: Sound (`clientSpiel SCHUSS_KLANG`), Einschusslöcher `C:darstellung/einschlaege.js`, Mündungsblitz.
- Lärm: `alarmiereZombies` (Hörweite × Waffe `laerm`). Nach Spielertod `raeumeZombiesWeg`.
- ⚠ Linksklick-Flanke: `behandleAngelKlick` läuft VOR dem Angriff und pflegt `spieler.angriffVorher` – nie davor `continue`n.

## Waffen (Items in K:`gegenstaende.js`)
- Felder: `schaden`, `reichweite`, `abklingzeit` (klein = Dauerfeuer bei gehaltener Taste), `magazin`/`munition`, `laerm`, `kegel` (Speer), `rueckstoss`, `durchschlag`, `haltbarkeit` (Nahkampf nutzt je Treffer ab), `sprengRadius/sprengSchaden` (Raketenwerfer), `pfeil`+`bergen` (Geschoss bleibt liegen), Kategorie `wurf` (granate/molotow/dynamit: `zuender`, `brand*`).
- Mods/Reparatur: `S:systeme/waffenSystem.js` (`MODS`, `waffenWerte(eintrag, def)` ⚠ IMMER dafür nehmen: Magazin/Reichweite in kampf/nachladen/spielstand), Kosten `G:spieler/reparatur.js`, AKTIONEN `reparieren`, `modsAbnehmen`; an Werkbank/Amboss.
- Darstellung: 3D-Modell `C:darstellung/waffenModelle.js` (BAUPLAENE prozedural + `R32_WAFFEN` aus `r32_waffen.glb`/`r32_waffe_*.glb`, `haltungFuer(name)` → pistole|gewehr|nahkampf|messer|seitlich|lampe|halten), Haltung/Anschlag `C:darstellung/figurHaltung.js` (→ ki/figuren.md). Icon s. ki/assets.md. Sound: `client/audio/eigene/<ereignis>_N.ogg` + `eigeneSounds.EREIGNISSE` + `SCHUSS_KLANG`.
- Neue Waffe = Item + Loot/Rezept + Modell/Haltung + Icon + Sound + `npm run ki:anleitung` (Checkliste ki/rezepte.md).

## Explosionen · Würfe · Fallen
- `S:systeme/explosionSystem.js explosion(welt,x,y,{radius,schaden,kachelRadius,quelle,ohneId})` = EINZIGE Explosionsstelle (Explosiv-Zombie, Rohrbombe, Dynamit, Rakete, Sprengfalle; Wände halbieren, zerstört Spieler-Bauwerke im `kachelRadius`). `werfe` (Weite = `spieler.zielAbstand` aus Eingabe `abstand`), `spielWelt.wuerfe`/`braende`.
- Fallen `S:systeme/fallenSystem.js` (`FALLEN_TYPEN` sprengfalle|stacheldraht|fallgrube|dosenalarm, K `fallen`), aufgestellt als Bauwerk; ⚠ Flächen-/Fallen-Schaden mit `{rueckstoss: 0}`.
- Effekte C: `C:darstellung/effekte.js` (Ereignisse → Listen) → `sonderEffekte.js` (Spuckbogen, Feuerball, Würfe, Brände, Kamerawackeln).

## Admin · Gottmodus
- `S:systeme/adminSystem.js` (ADMIN_BEFEHLE in `G:protokoll.js`, spielServer validiert): Gottmodus (koppelt ∞ Munition + ∞ Ausdauer, füllt Werte, `GOTT_AUSRUESTUNG`), fliegen, waffeGeben, botSetzen/-Entfernen, zeitVor12, spieltagVor, wetter. Client `clientSpiel.admin()`, Tabelle `#admin-tabelle` in `client/index.html`.

## Tests
`gameplay` (Kampf, Gottmodus), `runde24` (P2–P5 Waffen/Sprengstoff/Fallen), `runde26` (Waffenpaket), `runde29` (Bots wehren sich, Autos beschießbar), `runde13` (Admin).

# Figuren · Animation · Haltung · Kleidung · Zombie-/Tiermodelle
> Lesen bei: Spielerfigur/Animationen/Clips, Arme/Waffe in der Hand, Sitzen/Liegen-Darstellung, Kleidung/Frisur/Rucksack, Zombie- oder Tiermodell.
> Kürzel: C: `client/` · G: `gemeinsam/`

## Spielerfiguren
- Standard: `client/assets/3d/figur_mann.glb` / `figur_frau.glb` (Quaternius „Adventurer“, CC0) mit ALLEN Clips: stehen, gehen, laufen, hacken, spitzhacke, abbauen, hacke, nahkampf, sitzen (Boden), sterben. Bau: `npm run assets:figuren` (Blender, `werkzeuge/assets/figuren/`).
- Zusatzfiguren `client/assets/3d/figuren/<id>.glb` + `figuren.json` (`aussehen.figur` mann_33…/frau_34…; gerigged mit `werkzeuge/assets/r44/baue_figuren_r44.py`, Bone Heat, Textur 512) – Clips kommen zur Laufzeit aus `figur_mann.glb` (gleiche Knochennamen). Lazy geladen (`renderer.#r32Figur`), keine Kleidungsschichten/Frisur.
- Hock-Clips `ducken`/`schleichen`: zur Laufzeit gebacken aus stehen/gehen (`C:darstellung/hockClips.js ergaenzeHockClips` in `renderer.#ladeSurvivor`; `HOCKE` = Beckentiefe, Vorlage, Kopf; Beine per Zwei-Knochen-IK auf die Fußspur) → alle Figuren mit dem Survivor-Rig, auch Zusatzfiguren.
- Aussehen `G:spieler/aussehen.js` (Geschlecht, Frisur, Farben, Figur; im Netz kompakt → Client immer über `pruefeAussehen`/`skinFuer`), Erstellung `C:ui/charakterErstellung.js` + Vorschau `C:ui/charakterVorschau.js` (`renderer.vorschauFigur`).
- Knochennamen (GLTFLoader entfernt Punkte): `UpperArmR/LowerArmR/WristR/Middle1R`, `Index1R`, `Pinky1R`, `UpperLegR/LowerLegR/FootR`, `Chest`, `Head` (…L). ⚠ `Foot*`/`PT*` sind IK-Ziele am `Root` (keine Kinder des Unterschenkels) → Fuß selbst ans Schienbein setzen.

## Clipwahl (`renderer.#aktualisiereFiguren`, Spielerzweig)
sterben (tot/niedergestreckt, LoopOnce clamp) > Stuhl/Bank-Sitzen → **stehen** (+ prozedurale Sitzpose) > Boden-Sitzen → sitzen > Arbeits-Clip (`ARBEIT_KLIP` holz→hacken, stein/eisenerz→spitzhacke, rinde/ast/zerlegen→abbauen) > hacke (einmal je `aktionTick`) > nahkampf (beidhändige Waffe, `istBeidhaendigerSchlag`) > ducken/schleichen (`e.duckt`; schleichen ab Tempo 12, timeScale nach Tempo) > gehen/laufen (timeScale nach Tempo, `GEH_GRENZE`) > stehen. Werkzeug-Treffer-Zeitpunkt `AUFSCHLAG` → `#merkeAufschlag` → Hack-Sounds.

## Prozedurale Haltung (`C:darstellung/figurHaltung.js`, NACH `mixer.update`)
- `HALTUNGEN` (Richtungen Oberarm/Unterarm im Figur-Raum: +z vorn, +y oben, −x rechts): pistole, gewehr, *Unten-Varianten, seitlich, messer, nahkampf, faust, locker, lampe, zombie, sitzen, hacken. Waffen hängen locker und gehen beim Schießen/Schlagen in den Anschlag (`ANSCHLAG_MS` 5 s); Arbeitswerkzeuge (`WERKZEUGE`) bleiben vorn; Werkzeug-Clips: nur `platziereHackwerkzeug`. Waffe in die Hand: `setzeWaffe` (Modell aus `waffenModelle.js`), Mündung `figur.muendung`.
- **Pistole/Gewehr** (`schusswaffeHalten`, nur Rigs mit Fingergliedern `figur.greifer`): Waffe liegt fest im Figur-Raum relativ zur rechten Schulter (`SCHUSS_GRIFF`: anschlag/unten/stuetze/pol/kick/rueck), Handgelenke per `zweiKnochenIK` an Griff bzw. Vorderschaft (`HAND_AN_WAFFE` im Waffenrahmen f/u/x, `HAND_MASS`), Hand absolut zur Waffe gedreht (`richteHandAnWaffe`, Teil der Verdrehung im Unterarm), Finger gekrümmt (`kruemmeFinger`, `FINGER_KRUEMMUNG`; Glied 1 = Mittelhand am Handgelenk → Handfläche über die Knöchel Glied 2). Pistole unten einhändig am Clip-Arm (pendelt), Gewehr unten beidhändig. Basis je Bild: `basisFuerGriff` (Knochen unverändert seit letztem Setzen → `figur.ruhe`), Verlassen `loeseGriff`. Gewehre sind ×1,5 groß → nah an der Körpermitte, sonst reicht der linke Arm nicht.
- Zombies (`zombie`): Arme hängen, pendeln leicht; Angriff hebt sie nur bis `ZOMBIE_ANGRIFF`.
- Arme loslassen: `loeseArm` → `armRuhe` (= Steh-Pose, gemerkt NACH `mixer.setTime`).
- **Stuhl/Bank** (`stuhlSitz`, Renderer setzt Gruppe auf die Sitzfläche): Modell so verschoben, dass Hüftmitte `STUHL_SITZ.ueberSitz` über/`zurueck` hinter der Sitzmitte liegt; Beine `stuhlBeine` (Oberschenkel waagerecht, Unterschenkel über +Y senkrecht, Fuß mit gemerkter Länge/Drehung `merkeFuesse`); Arme JEDES Bild ab `armRuhe` (`setzeArmAufRuhe`), Hände per Zwei-Knochen-IK auf den Oberschenkel (`handAufOberschenkel`, Maße `STUHL_HAND` × Oberschenkellänge) und absolut flach (`legeHandFlach`: Finger Hüfte→Knie, Handfläche aus Index1/Middle1/Pinky1 nach unten, `unterarmAnteil` der Drehung im Unterarm). Aufstehen: `setzeStuhlZurueck` (Modell, Füße, Arme). Quaternius-Arme reichen aufrecht nur knapp → Arme fast gestreckt.
- Boden-Sitzen: Clip „sitzen“. Liegen im Bett: Gruppe gedreht im Renderer.

## ⚠ Three.js-Animation (kostet sonst Stunden)
- `PropertyMixer` schreibt eine Clip-Spur nur, wenn sich ihr Wert ÄNDERT. Konstante Spuren (Steh-Clip: UpperArm/LowerArm/Wrist/Finger, alle `.position`, `Foot*`/`PT*`) werden nie neu geschrieben → prozedurale Änderungen bleiben stehen. Darum: Knochen selbst zurücksetzen (`armRuhe`, `merkeFuesse`/`setzeStuhlZurueck`) und **nie relativ je Bild weiterdrehen** (Runde 45: `drehUmAchse(hand, …, −1,4)` je Bild → Hand drehte 80°/Bild = „Hände zittern wie verrückt“). Immer: feste Basis setzen → absolut ausrichten. Prüfen: `tests/runde45.test.js` (Mini-Skelett ohne Clip = Worst Case).
- Clips backen: nie über `mixer.setTime` (konstante Spuren der Vorlage bleiben stehen → Figur kopfüber/versinkt), sondern Ruhepose setzen und jede Spur direkt auswerten (`spur.createInterpolant().evaluate(t)`, `hockClips.setzePose`).
- Animierte Box-Knoten nicht skalieren (Mixer überschreibt) – Meshes skalieren.

## Anbauteile
- Kleidung als Schichten `C:darstellung/kleidungModell.js` (`KLEIDUNG_MESH`, Mütze an `Head`, Handschuhe an `Wrist*`), Färben `renderer.#setzeKleidung`/`#kleidungsMaterial` (⚠ Regex nicht auf „Brown“ matchen). Frisuren `C:darstellung/haarModell.js` (attach an `Head`).
- Rucksack `renderer.#setzeRucksack` + `#legeRucksackAn`: an `Chest` per `attach` (erst in aufrechter Pose), Maße `RUCKSACK_SITZ`; ohne `Chest` fest an der Gruppe.
- Materialien `#survivorMaterial` (Nacht-Eigenleuchten über `emissiveMap`, sonst weiß glühende Texturfiguren).

## Zombie- & Tiermodelle
- Zombies: `ZOMBIE_MODELLE` (skelett, gruen, koloss, halb; Clips je Modell, `#neueGlbZombie`), Skelett-Zombie gebaut mit `werkzeuge/assets/r44/baue_skelett_r44.py`, UV-Atlas `zombieTextur.js` (`INSELN`), Sonder-Anbauteile `#sonderTeile`. Details ki/npc.md.
- Tiere: `C:darstellung/tierModelle.js` (Hase), `haustierModelle.js` (Hund/Katze/Huhn, Wild mit `WILD_CLIPS`), Angel `angelModell.js`.

## Prüfen
`npm run ansicht -- --sitzen --kamera seite,vorn,nah` · Zittern messen per `--js` (Weltquaternion über 20 rAF-Frames, s. ki/tests.md). Tests: `runde45`, `runde48` (Waffengriff, Zombie-Arme), `runde44_2` (Sitzen), `runde23` (Kleidung), `runde47` (Hock-Clips am Mini-Skelett). Hocke ansehen: `--js "spiel.duckenSetzen(true)"`.

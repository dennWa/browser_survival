"""
Generator für server/spiel/karten/tutorial.js – Tutorial-Zone „Kreisklinik Hohenfeld“ (docs/konzepte/TUTORIAL_KONZEPT.md).

    python3 werkzeuge/karten/tutorial.py

100 × 66 Kacheln: Krankenhaus (Zimmer 12, Station 3, Sicherheitsdienst, Hausmeister, Notaufnahme, Eingangshalle, hinterer Flur),
Hinterhof (Bäume, Steine, Schuppen), Garten (Beete, Teich), Parkplatz mit Krankenwagen und Ausfahrt im Osten.
Orte für das Tutorial-Skript (server/spiel/tutorial/skript.js) stehen unten in PUNKTE/BEREICHE/TUEREN.
Modelle aus client/assets/eigene/index.json (wie schneeland.py), Höhen bei Bedarf hier fest.
"""
import json
import re
from pathlib import Path

WURZEL = Path(__file__).resolve().parents[2]
ZIEL = WURZEL / 'server' / 'spiel' / 'karten' / 'tutorial.js'
INDEX = {e['datei'][:-4]: e for e in json.loads((WURZEL / 'client' / 'assets' / 'eigene' / 'index.json').read_text(encoding='utf-8'))}
B, H = 100, 66
g = [[',' for _ in range(B)] for _ in range(H)]
objekte = []
typen = {}


def fuell(x0, y0, x1, y1, z):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            g[y][x] = z


def rahmen(x0, y0, x1, y1, boden):
    """Raum mit Wänden auf dem Rand (inklusive)."""
    fuell(x0, y0, x1, y1, '#')
    fuell(x0 + 1, y0 + 1, x1 - 1, y1 - 1, boden)


def setze(punkte, z):
    for x, y in punkte:
        g[y][x] = z


def o(typ, x, y, b, h, **extra):
    objekte.append({'typ': typ, 'x': x, 'y': y, 'b': b, 'h': h, **extra})


def modell(stem, x, y, drehung=0, blockiert=True, hoehe=None, ebene=None):
    """Spielordner-Modell, linke obere Ecke (x, y); drehung 0 = Vorderseite Süden, 180 Norden, 90 Westen, 270 Osten."""
    e = INDEX[stem]
    m = e['masse']
    ziel = hoehe or e.get('zielHoehe') or m['hoehe']
    f = ziel / m['hoehe']
    b, t = round(m['b'] * f, 2), round(m['h'] * f, 2)
    eb, et = b, t
    if drehung in (90, 270):
        b, t = t, b
    typ_id = f"sf_{re.sub('[^a-z0-9]+', '_', stem)[:28]}_{round(ziel * 10)}"
    typen[typ_id] = {'name': e.get('name', stem), 'kategorie': 'Spielordner', 'b': eb, 'h': et, 'hoehe3d': round(ziel, 3), 'blockiert': blockiert,
                     'farbe': '#c080ff', 'glbDatei': f'assets/eigene/{stem}.glb'}
    extra = {'drehung': drehung} if drehung else {}
    if ebene:
        extra['ebene'] = ebene
    o(typ_id, round(x, 2), round(y, 2), b, t, blockiert=blockiert, **extra)


def deko(stem, x, y, drehung=0, hoehe=None):
    modell(stem, x, y, drehung, blockiert=False, hoehe=hoehe, ebene='boden')


def licht(x, y, radius=4, farbe='#fff2d0', staerke=0.8, **extra):
    o('licht', x, y, 1, 1, radius=radius, farbe=farbe, staerke=staerke, **extra)


# Realistische Höhen (Originalmaße einiger Modelle sind absurd – siehe werkzeuge/assets/eigene_kategorien.mjs)
BETT = 1.0          # single-bed → ~2 m lang
STUHL = 0.95
AUTOMAT = 1.85

# ============================================================================================
# Krankenhaus (x 2–63, y 2–34)
# ============================================================================================
rahmen(2, 2, 63, 34, '.')
# Flur Nord (y 13–15) – Wände y 12 und y 16
fuell(3, 12, 62, 12, '#')
fuell(3, 16, 62, 16, '#')
# Zimmerwände Reihe A
for x in (14, 24, 38, 52):
    fuell(x, 3, x, 11, '#')
# Reihe B: Hausmeister | Notaufnahme | Eingangshalle; Wand y 26 (hinterer Flur darunter), Halle bis unten
fuell(16, 17, 16, 25, '#')
fuell(44, 17, 44, 33, '#')
fuell(3, 26, 43, 26, '#')
fuell(3, 17, 15, 25, ':')   # Hausmeister: Beton
# Türen
setze([(8, 12)], 'T')            # Zimmer 12
setze([(19, 12)], 'T')           # Zimmer 14
setze([(31, 12)], 'T')           # Schwesternzimmer
setze([(45, 12)], 'T')           # Sicherheitsdienst (Gate)
setze([(57, 12)], 'T')           # Personalraum
setze([(9, 16)], 'T')            # Hausmeister (Gate)
setze([(30, 16), (31, 16)], 'T')  # Notaufnahme (Gate)
setze([(53, 16), (54, 16)], 'T')  # Eingangshalle ↔ Flur
setze([(25, 26), (26, 26)], 'T')  # Notaufnahme ↔ hinterer Flur
setze([(6, 34)], 'T')            # Notausgang (Gate) → Hinterhof
setze([(53, 34), (54, 34), (55, 34)], 'T')  # Haupteingang (verbarrikadiert, bleibt zu)
# Fenster
setze([(5, 2), (10, 2), (18, 2), (21, 2), (28, 2), (34, 2), (42, 2), (48, 2), (56, 2), (60, 2), (63, 6), (63, 22), (63, 28), (2, 6), (2, 21), (2, 30), (20, 34), (32, 34), (47, 34), (60, 34)], 'F')

# Zimmer 12 (Start, x 3–13, y 3–11)
modell('single-bed', 3.2, 4.2, hoehe=BETT)
modell('kenney-nachttisch', 4.8, 3.2)
modell('radio', 4.9, 3.25, blockiert=False, ebene='oben')
modell('bedside-lamp', 3.3, 3.2, blockiert=False)
modell('single-bed', 10.6, 4.2, hoehe=BETT)
modell('kenney-nachttisch', 9.6, 3.2)
modell('kenney-garderobe', 12.8, 3.2)
modell('chair', 7.4, 8.6, hoehe=STUHL)
modell('closet', 12.6, 8.4, drehung=90)
modell('plant', 3.2, 9.6)
deko('debris-papers', 9.5, 8.8)
o('teppich', 6, 5, 2.5, 3, ebene='boden')
g[6][6] = 'S'
licht(7, 6, radius=4.5, farbe='#fff6e0', staerke=0.6)

# Bad / WC (x 15–23) – Kenney Furniture Kit
for x in (15.3, 17.3):
    modell('kenney-toilette', x, 3.2)
modell('kenney-dusche', 21.6, 3.1)
for x in (15.3, 16.8):
    modell('kenney-waschbecken', x, 10.3, drehung=180)
modell('kenney-spiegel', 15.5, 11.6, drehung=180, blockiert=False)
modell('kenney-muelleimer', 22.6, 10.6)
modell('kenney-badschrank', 19.5, 3.2)
deko('blood-splat-2', 17, 7)

# Schwesternzimmer / Apotheke (x 25–37)
modell('executive-desk', 27.5, 6.0)
modell('monitor', 28.0, 6.2, blockiert=False, ebene='oben')
modell('executive-chair', 28.2, 7.4)
modell('double-door-tall-cabinet', 25.2, 3.1)
modell('single-door-tall-cabine', 26.4, 3.1)
modell('cube-cabinet', 33.5, 3.1)
modell('double-door-tall-cabinet', 34.6, 3.1)
modell('first-aid-kit', 35.0, 8.4, blockiert=False)
modell('steel-sink-kitchen-cabinet', 36.6, 8.0, drehung=90)
modell('coffee-machine', 25.3, 9.6)
modell('kenney-garderobe', 37.1, 10.6)
modell('kenney-muelleimer', 26.6, 10.7)
modell('dry-erase-board', 37.6, 5.0, drehung=90, blockiert=False)
deko('debris-papers', 31, 9)
licht(31, 7, radius=5, farbe='#fff6e0', staerke=0.6)

# Sicherheitsdienst (x 39–51)
modell('computer-desk', 40.0, 3.1)
modell('kenney-bildschirm', 40.3, 3.3, blockiert=False, ebene='oben')
modell('kenney-bildschirm', 41.2, 3.3, blockiert=False, ebene='oben')
modell('kenney-laptop', 40.9, 3.6, blockiert=False, ebene='oben')
modell('kenney-buerostuhl', 40.8, 4.5)
modell('double-door-tall-cabinet', 43.4, 3.1)      # Waffenschrank
modell('single-door-tall-cabine', 44.4, 3.1)
modell('cardboard-boxes', 39.2, 10.0)
modell('pipes', 50.6, 4.0)                           # Heizungsrohr – hier sind die zwei angekettet
deko('blood-splat', 47, 6)
modell('barrier-single', 46.5, 8.5, hoehe=0.7)

# Personalraum (x 53–62): Küche
modell('fridge', 53.2, 3.1)
modell('sink-kitchen-cabinet', 54.4, 3.1)
modell('modern-kitchen-table', 57.0, 6.0)
modell('wooden-chair', 56.5, 6.4)
modell('wooden-chair', 59.2, 6.4)
modell('vending-machine', 61.2, 3.1, hoehe=AUTOMAT)
modell('trash-bags', 53.3, 10.2)

# Flur: Bänke, Pflanzen, Liegen, Unordnung
modell('bench', 12, 13.15)
modell('bench', 36, 13.15)
modell('plant', 23.0, 13.1)
modell('bunk-bed', 47.0, 14.6, drehung=90)    # abgestellte Liege
deko('blood', 40, 14)
deko('debris-papers', 26, 14.2)
deko('debris-papers', 50, 13.4)
licht(20, 14, radius=4, farbe='#fff2d0', staerke=0.5)
licht(44, 14, radius=4, farbe='#fff2d0', staerke=0.5, flackern=True)

# Hausmeister / Technik (x 3–15, y 17–25)
modell('metal-scaffold', 3.3, 17.3)
modell('toolbox', 4.6, 17.4)
modell('gas-can', 5.4, 17.4)
modell('propane-tank', 14.0, 17.2)
modell('pipes', 14.5, 19.5)                   # Kette hängt hier
modell('cardboard-boxes-2', 3.2, 23.8)
modell('pallet', 5.2, 24.4)
modell('barrel', 7.0, 24.2)
modell('ladder', 10.6, 24.6)
modell('kenney-waschmaschine', 12.6, 17.3)
modell('crate', 3.3, 21.0)
deko('blood-splat-2', 12, 21)
licht(9, 21, radius=4, farbe='#ffe2b0', staerke=0.55, flackern=True)

# Notaufnahme (x 17–43, y 17–25): Betten-Reihen, Rotlicht (Notstrom)
for x in (17.6, 21.6, 34.6, 38.6):
    modell('single-bed', x, 17.3, hoehe=BETT)
for x in (17.6, 21.6, 34.6):
    modell('single-bed', x, 22.6, hoehe=BETT, drehung=180)
modell('cube-cabinet', 41.6, 17.2)
modell('medium-book-shelf', 26.5, 17.1, hoehe=1.9)
modell('l-shaped-desk', 27.5, 20.5, hoehe=0.86)
deko('blood-splat', 24, 19)
deko('blood', 36, 21)
deko('debris-pile', 31, 23)
modell('trash-bags', 42.2, 24.2)
for x, y in ((20, 20), (32, 18), (40, 22)):
    licht(x, y, radius=3.5, farbe='#ff3b2f', staerke=0.55, flackern=(x == 32))

# Eingangshalle (x 45–62, y 17–33): Empfang, Wartebereich, Automat, verbarrikadierter Eingang
modell('l-shaped-desk', 47.0, 19.0, hoehe=0.86)
modell('executive-chair', 48.6, 20.4)
modell('three-seater-couch', 56.0, 19.0)
modell('three-seater-couch', 56.0, 23.5, drehung=180)
modell('vending-machine', 61.2, 17.2, hoehe=AUTOMAT)
modell('coffee-machine', 59.8, 17.3)
modell('plant', 45.2, 31.6)
modell('plant', 61.5, 31.6)
for x in (52.2, 54.2):
    modell('barrier-single', x, 32.6, hoehe=0.7)
modell('cardboard-boxes-2', 56.4, 32.3)
modell('crate', 51.0, 32.3)
deko('blood-splat', 50, 27)
deko('debris-pile', 57, 28)
modell('dry-erase-board', 45.1, 24.0, drehung=270, blockiert=False)

# Hinterer Flur (x 3–43, y 27–33)
modell('bunk-bed', 30, 30.4, drehung=90)
modell('trash-bag', 12, 32.4)
modell('cardboard-boxes', 40, 31.8)
modell('bench', 18, 27.2)
deko('blood-splat-2', 22, 30)
licht(10, 30, radius=3.5, farbe='#ff3b2f', staerke=0.5)
licht(35, 30, radius=3.5, farbe='#ff3b2f', staerke=0.5, flackern=True)

# Raumnamen (Loot-Marker; im Tutorial liegt dort nichts: loot.spawnChance 0)
for (x, y, z) in ((9, 9, 'a'), (20, 9, 'b'), (33, 10, 'c'), (48, 10, 'd'), (59, 9, 'e'), (12, 24, 'f'), (25, 24, 'g'), (50, 29, 'h'), (14, 30, 'i')):
    g[y][x] = z

# ============================================================================================
# Außen: Hinterhof (x 0–44), Garten (x 46–70), Parkplatz (x 64–99, y 0–34)
# ============================================================================================
# Parkplatz: Asphalt neben dem Krankenhaus (östlich), Ausfahrt-Straße am Ostrand
fuell(64, 0, 99, 34, '_')
fuell(92, 0, 99, 34, '=')
fuell(0, 0, 99, 1, ',')
fuell(64, 0, 99, 1, '_')
fuell(92, 0, 99, 1, '=')
# Mauer Parkplatz ↔ Garten (y 35, x 64–71) mit Hoftor, Mauer Hinterhof ↔ Garten (x 45, y 35–65) mit Gartentor
fuell(64, 35, 71, 35, '#')
setze([(66, 35), (67, 35), (68, 35)], 'T')   # Hoftor (Gate)
fuell(45, 35, 45, H - 1, '#')
setze([(45, 49), (45, 50), (45, 51)], 'T')   # Gartentor (Gate)
fuell(71, 36, 71, H - 1, '#')                 # Garten Ostmauer
fuell(72, 35, 99, H - 1, ',')                 # Wiese hinter der Mauer (nicht erreichbar, Optik)
fuell(0, 0, 1, 34, ',')
fuell(0, 34, 1, 34, '#')                      # Westrand: Hof nicht außen herum zum Parkplatz
fuell(0, 2, 1, 2, '#')
# Weg vom Notausgang in den Hof, Gartenwege
fuell(5, 35, 7, 38, '-')
fuell(46, 49, 60, 51, '-')
fuell(66, 36, 68, 44, '-')

# Hinterhof: Schuppen, Bäume, Steine, Erz, Bänke
rahmen(10, 37, 15, 41, '+')
setze([(12, 41)], 'T')
modell('toolbox', 11.2, 38.2)
modell('shovel', 13.5, 38.2, blockiert=False)
modell('crate', 14.0, 38.1)
baeume = [(18, 40), (24, 38), (30, 41), (36, 39), (21, 46), (27, 47), (34, 46), (40, 44), (17, 53), (24, 55), (31, 53), (38, 52), (20, 60), (28, 61), (35, 59), (41, 60)]
for x, y in baeume:
    o('baum', x, y, 3.5, 3.5, ebene='oben', groesse='gross')
for x, y in ((4, 48), (7, 51), (3, 55), (9, 57), (6, 61), (12, 47), (13, 62)):
    o('stein', x, y, 1, 1, blockiert=True, groesse='gross')
for x, y in ((10, 52), (5, 58)):
    o('eisenerz', x, y, 1, 1, blockiert=True)
for x, y in ((1, 40), (1, 46), (43, 40), (43, 56), (16, 64), (32, 64)):
    o('busch', x, y, 1.5, 1.5, ebene='oben')
modell('park-bench', 8.5, 44.0)
modell('trash-bags', 2.5, 36.2)
modell('dumpster', 17.0, 35.4)
licht(8, 42, radius=4, farbe='#ffc070', staerke=0.8, mast=True)

# Garten: Hochbeete-Deko, Teich (Angeln, Bonus), Bänke, Hecke
for x, y in ((48, 38), (51, 38)):
    modell('crate-of-tomatoes', x, y)
modell('crate-of-potatoes', 54, 38)
modell('garden-bench', 62.0, 44.0)
modell('garden-bench', 62.0, 46.0)
for x in (47, 49, 51):
    modell('hedge', x, 63.4)
fuell(62, 56, 68, 61, '~')
fuell(63, 55, 67, 55, '~')
modell('shovel', 60.4, 54.0, blockiert=False)
for x, y in ((47, 45), (69, 52), (55, 62)):
    o('busch', x, y, 1.5, 1.5, ebene='oben')
o('baum', 66, 38, 3.5, 3.5, ebene='oben', groesse='gross')
licht(57, 47, radius=4.5, farbe='#ffc070', staerke=0.8, mast=True)

# Parkplatz: Krankenwagen (weißer Transporter) mit Blick nach Osten, andere Autos, Laternen, Sperren
o('transporter', 73, 16, 5.5, 3, drehung=90, blockiert=True)
o('auto_rot', 74, 4, 5.5, 3, drehung=270, blockiert=True)
o('auto_schwarz', 74, 27, 5.5, 3, drehung=270, blockiert=True)
o('auto_blau', 83, 27, 5.5, 3, drehung=270, blockiert=True)
for y in (8.6, 22.6):
    for x in range(66, 91, 3):
        o('markierung', x, y, 0.12, 3.4, ebene='boden')
for x, y in ((70, 12), (86, 12), (70, 24), (86, 24)):
    licht(x, y, radius=4, farbe='#ffc070', staerke=0.8, mast=True)
for x, y in ((90, 5), (90, 7), (90, 28), (90, 30)):
    modell('traffic-cone', x, y)
modell('container-green', 80.0, 31.0)
modell('dumpster', 65.0, 31.6)
modell('arrow-sign', 90.5, 15.0, drehung=270, blockiert=False)
deko('blood-splat', 81, 17)

ZEILEN = [''.join(r) for r in g]
assert all(len(z) == B for z in ZEILEN)

# Orte fürs Skript (Kacheln)
PUNKTE = {
    'bett': (6, 7), 'nachttisch': (6, 4), 'nachttisch2': (7, 4), 'verband': (35, 9), 'flur_west': (9, 14), 'flur_mitte': (31, 14),
    'hammer': (8, 18), 'kette': (13, 20), 'pistole': (44, 6), 'schiessstand': (49, 6), 'notaufnahme_ost': (41, 20), 'notaufnahme_west': (19, 21),
    'halle': (54, 26), 'flur_ost': (50, 14), 'notausgang': (6, 33), 'hof_start': (6, 37), 'schuppen': (12, 43), 'baeume': (24, 44), 'garten': (54, 47),
    'beet': (56, 52), 'auto': (75, 19), 'horde_west': (20, 50), 'horde_sued': (58, 62),
}
BEREICHE = {
    'fenster': (8, 3, 5, 3), 'zimmertuer': (7, 10, 3, 3), 'notaufnahme': (17, 17, 27, 9), 'hinterhof': (0, 35, 45, 31),
    'parkplatz': (64, 0, 36, 35), 'ausfahrt': (95, 2, 5, 32),
}
TUEREN = {'hausmeister': (9, 16), 'sicherheit': (45, 12), 'notaufnahme': (30, 16), 'notausgang': (6, 34), 'gartentor': (45, 49), 'hoftor': (66, 35), 'haupteingang': (53, 34)}


def zahl(v):
    return str(int(v)) if float(v).is_integer() else str(v)


def js_objekt(e):
    teile = [f"typ: '{e['typ']}'"] + [f"{k}: {zahl(e[k])}" for k in ('x', 'y', 'b', 'h')]
    for k, v in e.items():
        if k in ('typ', 'x', 'y', 'b', 'h', 'blockiert'):
            continue
        if isinstance(v, bool):
            teile.append(f"{k}: {'true' if v else 'false'}")
        elif isinstance(v, str):
            teile.append(f"{k}: '{v}'")
        else:
            teile.append(f'{k}: {zahl(v)}')
    if e.get('blockiert'):
        teile.append('...M')
    return '{ ' + ', '.join(teile) + ' }'


js = ['''/**
 * Tutorial-Zone „Kreisklinik Hohenfeld“ (erzeugt von werkzeuge/karten/tutorial.py – dort ändern!).
 * 100 × 66: Krankenhaus, Hinterhof, Garten, Parkplatz. Nicht in KARTEN der Online-Welt – läuft nur lokal (client/netzwerk/lokalerServer.js).
 * `tutorial` = Orte für das Skript (server/spiel/tutorial/skript.js): punkte/bereiche/tueren in Kacheln.
 */
const M = { blockiert: true };

export const TUTORIAL = {
  id: 'tutorial',
  name: 'Kreisklinik Hohenfeld',
  kacheln: [''']
js += [f"    '{z}'," for z in ZEILEN]
js += ['  ],', '  raeume: {',
       "    a: { name: 'Zimmer 12', lootTabelle: 'patientenzimmer' },",
       "    b: { name: 'Bad / WC', lootTabelle: 'patientenzimmer' },",
       "    c: { name: 'Schwesternzimmer', lootTabelle: 'apotheke' },",
       "    d: { name: 'Sicherheitsdienst', lootTabelle: 'sicherheit' },",
       "    e: { name: 'Personalraum', lootTabelle: 'kantine' },",
       "    f: { name: 'Hausmeister', lootTabelle: 'lager' },",
       "    g: { name: 'Notaufnahme', lootTabelle: 'patientenzimmer' },",
       "    h: { name: 'Eingangshalle', lootTabelle: 'kantine' },",
       "    i: { name: 'Hinterer Flur', lootTabelle: 'lager' },",
       '  },', '  objekte: [']
js += [f'    {js_objekt(e)},' for e in objekte]
js += ['  ],', '  typen: {']
js += [f"    {k}: {{ name: '{v['name']}', kategorie: '{v['kategorie']}', b: {zahl(v['b'])}, h: {zahl(v['h'])}, hoehe3d: {zahl(v['hoehe3d'])}, blockiert: {'true' if v['blockiert'] else 'false'}, farbe: '{v['farbe']}', glbDatei: '{v['glbDatei']}' }}," for k, v in typen.items()]
js += ['  },', '  tutorial: {', '    punkte: {']
js += [f'      {k}: {{ x: {x}, y: {y} }},' for k, (x, y) in PUNKTE.items()]
js += ['    },', '    bereiche: {']
js += [f'      {k}: {{ x: {x}, y: {y}, b: {b}, h: {h} }},' for k, (x, y, b, h) in BEREICHE.items()]
js += ['    },', '    tueren: {']
js += [f'      {k}: {{ x: {x}, y: {y} }},' for k, (x, y) in TUEREN.items()]
js += ['    },', '  },', '};']
ZIEL.write_text('\n'.join(js) + '\n', encoding='utf-8')
print(f'{ZIEL} geschrieben ({B} × {H}, {len(objekte)} Objekte, {len(typen)} Modelltypen)')

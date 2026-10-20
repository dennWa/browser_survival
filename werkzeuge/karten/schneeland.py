"""
Generator für server/spiel/karten/schneeland.js – Zone "Schneeland" östlich vom Stadtrand (Schneezone).

    python3 werkzeuge/karten/schneeland.py

155 × 130 Kacheln (so groß wie der Stadtrand), alles verschneit: Boden "*" (Schnee), Straßen "=" sind nur leicht verschneit (Optik, das
macht die Bodentextur in einer Schneezone von selbst). Wenige Häuser mit viel Platz dazwischen, wenige Tannen (in kleinen Gruppen),
ein zugefrorener See zum Angeln. Die Westseite der Hauptstraße schließt an die Ostseite des Stadtrands an (Übergang y 86–94).
Zufall mit festem Startwert → gleiche Karte bei jedem Lauf. Danach: npm test (prüft Erreichbarkeit, Überlappungen, Grafiken).
"""
import math
import random
from pathlib import Path

ZIEL = Path(__file__).resolve().parents[2] / 'server' / 'spiel' / 'karten' / 'schneeland.js'
B, H = 155, 130
zufall = random.Random(20261021)
g = [['*' for _ in range(B)] for _ in range(H)]
objekte = []
belegt = set()  # Kacheln, auf die keine Bäume/Steine/Zombies dürfen (Straße, Gebäude, See, Abstand)


def sperre(x0, y0, x1, y1, rand=0):
    for y in range(y0 - rand, y1 + rand + 1):
        for x in range(x0 - rand, x1 + rand + 1):
            belegt.add((x, y))


def o(typ, x, y, b, h, **extra):
    objekte.append({'typ': typ, 'x': x, 'y': y, 'b': b, 'h': h, **extra})


def strasse(x0, y0, x1, y1):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            g[y][x] = '='
    sperre(x0, y0, x1, y1, rand=1)


def haus(x0, y0, b, h, boden, tuer, tuer_breit=1, fenster=(), name=None):
    """Raum mit Wänden; tuer = 'N' | 'S' (Position in der Mitte), fenster = [(dx, dy), …] relativ zur linken oberen Ecke."""
    for y in range(y0, y0 + h):
        for x in range(x0, x0 + b):
            g[y][x] = '#' if x in (x0, x0 + b - 1) or y in (y0, y0 + h - 1) else boden
    ty = y0 if tuer == 'N' else y0 + h - 1
    tx = x0 + b // 2 - (tuer_breit - 1)
    for i in range(tuer_breit):
        g[ty][tx + i] = 'T'
    for dx, dy in fenster:
        g[y0 + dy][x0 + dx] = 'F'
    sperre(x0, y0, x0 + b - 1, y0 + h - 1, rand=3)
    # Trampelpfad (Gehweg) von der Tür nach draußen
    schritt = -1 if tuer == 'N' else 1
    for i in range(1, 4):
        yy = ty + schritt * i
        for k in range(tuer_breit):
            if 0 <= yy < H and g[yy][tx + k] == '*':
                g[yy][tx + k] = '-'


def loot(x, y, ch):
    g[y][x] = ch


# --- Straßen (5 breit): Hauptstraße West–Ost (Anschluss an den Stadtrand), Nord–Süd-Straße, Abzweig nach Osten ---
HAUPT_Y0, HAUPT_Y1 = 88, 92
strasse(0, HAUPT_Y0, 145, HAUPT_Y1)
V_X0, V_X1 = 68, 72
strasse(V_X0, 8, V_X1, 120)
ABZ_Y0, ABZ_Y1 = 48, 52
strasse(V_X1 + 1, ABZ_Y0, 140, ABZ_Y1)
# Wendehammer am Ostende der Hauptstraße
for y in range(HAUPT_Y0 - 2, HAUPT_Y1 + 3):
    for x in range(146, 151):
        g[y][x] = '='
sperre(146, HAUPT_Y0 - 2, 150, HAUPT_Y1 + 2, rand=1)

# --- Blockhaus (Start): nördlich der Hauptstraße, nahe der Westgrenze ---
x0, y0 = 22, 70
haus(x0, y0, 12, 9, '+', 'S', fenster=[(3, 0), (8, 0), (0, 4), (11, 4)])
g[y0 + 3][x0 + 3] = 'S'
for dx, dy in ((4, 1), (9, 5), (2, 6)):
    loot(x0 + dx, y0 + dy, 'a')
o('bett', x0 + 1, y0 + 1, 1, 2, blockiert=True)
o('werkbank', x0 + 8, y0 + 1, 2, 1, blockiert=True)
o('tisch_rund', x0 + 5, y0 + 4, 1, 1, blockiert=True)
o('kiste', x0 + 10, y0 + 7, 1, 1, blockiert=True)
o('kueche_herd', x0 + 1, y0 + 7, 1, 1, blockiert=True)
o('licht', x0 + 6, y0 + 4, 1, 1, radius=5, farbe='#ffd9a0', staerke=0.8)

# --- Wohnhaus: südlich der Hauptstraße, Tür nach Norden ---
x0, y0 = 40, 100
haus(x0, y0, 11, 8, '+', 'N', fenster=[(3, 7), (7, 7), (0, 4), (10, 4)])
for dx, dy in ((2, 2), (8, 2), (5, 5)):
    loot(x0 + dx, y0 + dy, 'b')
o('bett', x0 + 1, y0 + 4, 1, 2, blockiert=True)
o('bett_orange', x0 + 9, y0 + 4, 1, 2, blockiert=True)
o('sofa', x0 + 6, y0 + 1, 3, 1, blockiert=True)
o('tisch', x0 + 4, y0 + 4, 2, 1, blockiert=True)
o('pflanze', x0 + 9, y0 + 1, 1, 1, blockiert=True)
o('licht', x0 + 5, y0 + 3, 1, 1, radius=4.5, farbe='#ffd9a0', staerke=0.75)

# --- Laden (Kiosk): nördlich der Hauptstraße, östlich der Nord–Süd-Straße ---
x0, y0 = 78, 76
haus(x0, y0, 10, 7, '.', 'S', fenster=[(2, 0), (7, 0), (0, 3), (9, 3)])
for dx, dy in ((2, 2), (7, 2), (4, 5)):
    loot(x0 + dx, y0 + dy, 'c')
o('kueche_theke', x0 + 2, y0 + 3, 5, 1, blockiert=True)
o('kiste', x0 + 1, y0 + 1, 1, 1, blockiert=True)
o('kiste_klein', x0 + 8, y0 + 1, 1, 1, blockiert=True)
o('fass', x0 + 8, y0 + 5, 0.9, 0.9, blockiert=True)
o('licht', x0 + 5, y0 + 3, 1, 1, radius=4.5, farbe='#fff2d0', staerke=0.8)

# --- Werkstatt (Garage): südlich der Hauptstraße, Tor nach Norden ---
x0, y0 = 80, 98
haus(x0, y0, 13, 8, ':', 'N', tuer_breit=2, fenster=[(3, 7), (9, 7), (0, 4), (12, 4)])
for dx, dy in ((2, 2), (10, 2), (6, 5)):
    loot(x0 + dx, y0 + dy, 'd')
o('werkbank', x0 + 1, y0 + 1, 2, 1, blockiert=True)
o('werkbank', x0 + 9, y0 + 6, 2, 1, blockiert=True)
o('fass', x0 + 11, y0 + 1, 0.9, 0.9, blockiert=True)
o('kiste', x0 + 1, y0 + 6, 1, 1, blockiert=True)
o('oelfleck', x0 + 5.5, y0 + 3, 1.6, 1.4, ebene='boden')
o('licht', x0 + 6, y0 + 4, 1, 1, radius=5, farbe='#fff2d0', staerke=0.75)

# --- Skihütte (Lodge): nördlich des Abzweigs, Tür nach Süden (Doppeltür) ---
x0, y0 = 100, 35
haus(x0, y0, 18, 11, '+', 'S', tuer_breit=2, fenster=[(3, 0), (7, 0), (11, 0), (14, 0), (0, 4), (17, 4), (0, 7), (17, 7)])
for dx, dy in ((2, 2), (6, 2), (15, 2)):
    loot(x0 + dx, y0 + dy, 'e')   # Küche
for dx, dy in ((3, 8), (14, 8), (9, 5)):
    loot(x0 + dx, y0 + dy, 'f')   # Wohnbereich
o('kueche_theke', x0 + 1, y0 + 1, 8, 1, blockiert=True)
o('kueche_herd', x0 + 10, y0 + 1, 1, 1, blockiert=True)
o('kueche_spuele', x0 + 11, y0 + 1, 1, 1, blockiert=True)
o('tisch', x0 + 13, y0 + 3, 3, 2, blockiert=True)
o('teppich', x0 + 6, y0 + 6, 4, 3, ebene='boden')
o('sofa', x0 + 5, y0 + 9, 3, 1, blockiert=True)
o('sessel', x0 + 10, y0 + 7, 1, 1, blockiert=True)
o('bett', x0 + 1, y0 + 8, 1, 2, blockiert=True)
o('bett', x0 + 16, y0 + 8, 1, 2, blockiert=True)
o('kiste', x0 + 16, y0 + 1, 1, 1, blockiert=True)
o('pflanze', x0 + 1, y0 + 4, 1, 1, blockiert=True)
o('licht', x0 + 5, y0 + 4, 1, 1, radius=5.5, farbe='#ffd9a0', staerke=0.85)
o('licht', x0 + 13, y0 + 6, 1, 1, radius=5.5, farbe='#ffd9a0', staerke=0.85)

# --- Jagdhütte: südlich des Abzweigs, Tür nach Norden ---
x0, y0 = 84, 57
haus(x0, y0, 8, 6, '+', 'N', fenster=[(2, 5), (5, 5), (7, 3)])
for dx, dy in ((2, 2), (5, 3)):
    loot(x0 + dx, y0 + dy, 'g')
o('bett', x0 + 1, y0 + 3, 1, 2, blockiert=True)
o('kiste', x0 + 6, y0 + 1, 1, 1, blockiert=True)
o('tisch_rund', x0 + 4, y0 + 2, 1, 1, blockiert=True)
o('licht', x0 + 3, y0 + 3, 1, 1, radius=4, farbe='#ffd9a0', staerke=0.7)

# --- Zugefrorener See im Südosten (Wasser "~", blockiert; Eisangeln) ---
SEE_X, SEE_Y, SEE_RX, SEE_RY = 126, 74, 12, 7
wasser = []
for y in range(H):
    for x in range(B):
        dx = (x - SEE_X) / SEE_RX
        dy = (y - SEE_Y) / SEE_RY
        winkel = math.atan2(dy, dx)
        rand = 1 + 0.12 * math.sin(winkel * 3 + 0.7) + 0.08 * math.sin(winkel * 5 + 1.9)
        if dx * dx + dy * dy < rand * rand and (x, y) not in belegt:
            g[y][x] = '~'
            wasser.append((x, y))
for x, y in wasser:
    sperre(x, y, x, y, rand=2)

# --- Angelhütte am Westufer ---
x0, y0 = 108, 71
haus(x0, y0, 7, 5, '+', 'S', fenster=[(0, 2), (6, 2)])
for dx, dy in ((2, 2), (4, 1)):
    loot(x0 + dx, y0 + dy, 'h')
o('bett', x0 + 5, y0 + 1, 1, 2, blockiert=True)
o('kiste', x0 + 1, y0 + 1, 1, 1, blockiert=True)
o('licht', x0 + 3, y0 + 2, 1, 1, radius=3.5, farbe='#ffd9a0', staerke=0.7)

# --- Schuppen im Nordosten ---
x0, y0 = 128, 18
haus(x0, y0, 7, 5, ':', 'S', fenster=[(3, 0)])
loot(x0 + 2, y0 + 2, 'i')
loot(x0 + 4, y0 + 2, 'i')
o('kiste', x0 + 5, y0 + 1, 1, 1, blockiert=True)
o('kiste_klein', x0 + 1, y0 + 1, 1, 1, blockiert=True)

# --- Straßenlaternen (Masten) ---
def laterne(x, y, flackern=False):
    o('licht', x, y, 1, 1, radius=3.3, farbe='#ffc070', staerke=0.8, flackern=flackern, mast=True)


for i, x in enumerate(range(12, 146, 14)):
    if V_X0 - 3 <= x <= V_X1 + 3:
        continue
    laterne(x, HAUPT_Y0 - 1, flackern=(i % 5 == 2))
for i, y in enumerate(range(16, 120, 15)):
    if HAUPT_Y0 - 3 <= y <= HAUPT_Y1 + 3 or ABZ_Y0 - 3 <= y <= ABZ_Y1 + 3:
        continue
    laterne(V_X0 - 1, y, flackern=(i % 4 == 1))
for x in range(84, 140, 14):
    laterne(x, ABZ_Y0 - 1)

# --- Liegengebliebene Autos (Front waagerecht = drehung 90/270, senkrecht = 0/180) ---
o('auto_blau', 38, 89, 5.5, 3, drehung=90, blockiert=True)
o('transporter', 104, 89, 5.5, 3, drehung=270, blockiert=True)
o('auto_rot', 69, 30, 3, 5.5, drehung=0, blockiert=True)
o('auto_gelb', 118, 49, 5.5, 3, drehung=90, blockiert=True)
o('auto_schwarz', 69, 104, 3, 5.5, drehung=180, blockiert=True)
for x, y, b, h in ((38, 89, 6, 3), (104, 89, 6, 3), (69, 30, 3, 6), (118, 49, 6, 3), (69, 104, 3, 6)):
    sperre(x, y, x + b, y + h, rand=1)


def frei(x, y, b, h, rand=0):
    for yy in range(y - rand, y + h + rand):
        for xx in range(x - rand, x + b + rand):
            if not (0 <= xx < B and 0 <= yy < H) or (xx, yy) in belegt:
                return False
    return True


# --- Zombies (nie auf Straße, in Gebäuden, im See oder am Westeingang) ---
anzahl_zombies = 0
while anzahl_zombies < 26:
    x, y = zufall.randint(3, B - 4), zufall.randint(3, H - 4)
    if not frei(x, y, 1, 1, 3) or g[y][x] != '*' or (x < 22 and 78 < y < 104):
        continue
    g[y][x] = 'Z'
    sperre(x, y, x, y, rand=2)
    anzahl_zombies += 1


# --- Tannen (3 × 3) in kleinen Gruppen + ein paar Einzelne, Steine, Eisenerz ---
def setze(typ, x, y, b, h, rand, **extra):
    if not frei(x, y, int(b + 0.99), int(h + 0.99), rand):
        return False
    o(typ, x, y, b, h, **extra)
    sperre(x, y, x + int(b + 0.99) - 1, y + int(h + 0.99) - 1, rand=0)
    return True


gruppen = 0
versuche = 0
while gruppen < 15 and versuche < 600:
    versuche += 1
    cx, cy = zufall.randint(6, B - 8), zufall.randint(6, H - 8)
    if not frei(cx, cy, 3, 3, 3):
        continue
    gesetzt = 0
    for _ in range(40):
        if gesetzt >= zufall.randint(4, 8):
            break
        x = int(cx + zufall.gauss(0, 5))
        y = int(cy + zufall.gauss(0, 5))
        if 1 <= x < B - 4 and 1 <= y < H - 4 and setze('tanne', x, y, 3, 3, 0, ebene='oben'):
            gesetzt += 1
    if gesetzt:
        gruppen += 1
einzelne = 0
while einzelne < 22:
    x, y = zufall.randint(1, B - 5), zufall.randint(1, H - 5)
    if setze('tanne', x, y, 3, 3, 2, ebene='oben'):
        einzelne += 1
for typ, anzahl in (('stein', 28), ('eisenerz', 12)):
    n = 0
    while n < anzahl:
        x, y = zufall.randint(1, B - 3), zufall.randint(1, H - 3)
        if setze(typ, x, y, 1, 1, 1, blockiert=True):
            n += 1

zeilen = [''.join(z) for z in g]


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
 * Zone "Schneeland" – östlich vom Stadtrand (erzeugt von werkzeuge/karten/schneeland.py, dort ändern!).
 * 155 × 130, Schneezone (`schnee: true`): Boden "*" = Schnee, Straßen leicht verschneit, Schneefall statt Regen, knirschende Schritte,
 * wenige Häuser mit viel Platz, Tannen in kleinen Gruppen, zugefrorener See "~" zum Angeln.
 * Übergang: Westrand (Hauptstraße) ↔ Stadtrand Ostrand. Legende wie stadtrand.js.
 */
const M = { blockiert: true };

export const SCHNEELAND = {
  id: 'schneeland',
  name: 'Schneeland',
  schnee: true,
  kacheln: [''']
js += [f"    '{z}'," for z in zeilen]
js += ['  ],', '  raeume: {',
       "    a: { name: 'Blockhaus', lootTabelle: 'wohnung' },",
       "    b: { name: 'Wohnhaus', lootTabelle: 'wohnung' },",
       "    c: { name: 'Laden', lootTabelle: 'kiosk' },",
       "    d: { name: 'Werkstatt', lootTabelle: 'werkstatt' },",
       "    e: { name: 'Skihütte Küche', lootTabelle: 'kueche' },",
       "    f: { name: 'Skihütte', lootTabelle: 'wohnung' },",
       "    g: { name: 'Jagdhütte', lootTabelle: 'huette' },",
       "    h: { name: 'Angelhütte', lootTabelle: 'angler' },",
       "    i: { name: 'Schuppen', lootTabelle: 'werkstatt' },",
       '  },', '  einstellungen: {',
       '    wetter: { regenAnteil: 0.8, dauerMin: 90, dauerMax: 300, pauseMin: 60, pauseMax: 240 }, // regenAnteil = Anteil Schneefall (Rest Nebel)',
       '    tiere: { hasenProTausend: 1.5, hasenMax: 10 },',
       '  },', '  objekte: [']
js += [f'    {js_objekt(e)},' for e in objekte]
js += ['  ],', '  uebergaenge: [',
       f"    {{ x: 0, y: {HAUPT_Y0 - 2}, b: 1, h: {HAUPT_Y1 - HAUPT_Y0 + 5}, ziel: 'stadtrand', ankunft: 'ost', name: 'Stadtrand (Westen)', nahtlos: {{ dx: -153, dy: 0 }} }}},",
       '  ],', '  ankuenfte: {', f'    west: {{ x: 5, y: {(HAUPT_Y0 + HAUPT_Y1) // 2} }}, // wer vom Stadtrand kommt (Straße, nicht im Übergang)', '  },', '};']
ZIEL.write_text('\n'.join(js) + '\n', encoding='utf-8')
print(f'{ZIEL} geschrieben ({B} × {H}, {len(objekte)} Objekte, {sum(1 for o_ in objekte if o_["typ"] == "tanne")} Tannen, {len(wasser)} Eiskacheln)')

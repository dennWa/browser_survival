"""
Generator für server/spiel/karten/waldsee.js – Zone "Waldsee" westlich vom Stadtrand (Runde 40, idyllische Waldzone).

    python3 werkzeuge/karten/waldsee.py

150 × 130 Kacheln: die Hauptstraße vom Stadtrand endet im Osten an einem Wanderparkplatz, von dort führen Erdwege durch
einen Mischwald zu Hütten und zu einem großen See mit Badestrand, Holzstegen (Kachel "|" = begehbarer Steg, hier wird
geangelt), Booten, Kanus, Seerosen und Schilf. Ein Rundweg folgt dem Ufer, im Norden eine Blumenwiese mit Hirschen,
im Süden eine Hasenwiese. Hütten: Waldhütte (Start), Fischerhütte, Försterhaus (2 Räume), Holzschuppen, Ferienhütte, Jagdhütte.
Deko = Spielordner-Modelle (client/assets/eigene/*.glb, u. a. Kenney Nature Kit `nk-*`) als Karten-`typen` sf_… (wie schneeland.py).
Zufall mit festem Startwert → gleiche Karte bei jedem Lauf. Danach: npm test.
"""
import json
import math
import random
import re
from collections import deque
from pathlib import Path

WURZEL = Path(__file__).resolve().parents[2]
ZIEL = WURZEL / 'server' / 'spiel' / 'karten' / 'waldsee.js'
B, H = 150, 130
zufall = random.Random(20261107)
g = [[';' for _ in range(B)] for _ in range(H)]   # Grundboden: Waldboden
objekte = []
belegt = set()   # Kacheln ohne Bäume/Zombies (Wege, Gebäude, Wasser, Wiesen-Kern, Abstand)
deko_frei = set()  # Kacheln, auf denen keine Bodendeko (Pilze …) liegen soll (Wege, Gebäude)


def drin(x, y):
    return 0 <= x < B and 0 <= y < H


def sperre(x0, y0, x1, y1, rand=0):
    for y in range(y0 - rand, y1 + rand + 1):
        for x in range(x0 - rand, x1 + rand + 1):
            belegt.add((x, y))


def o(typ, x, y, b, h, **extra):
    objekte.append({'typ': typ, 'x': x, 'y': y, 'b': b, 'h': h, **extra})


def licht(x, y, radius=4.5, farbe='#ffd9a0', staerke=0.8, flackern=False):
    o('licht', x, y, 1, 1, radius=radius, farbe=farbe, staerke=staerke, flackern=flackern)


# ---------------------------------------------------------------------------------------------------------------------
# Spielordner-Modelle (Deko) – wie schneeland.py `modell`, aber mit Mittelpunkt statt Ecke
INDEX = {e['datei'][:-4]: e for e in json.loads((WURZEL / 'client' / 'assets' / 'eigene' / 'index.json').read_text(encoding='utf-8'))}
typen = {}


def typ_fuer(stem, hoehe=None, blockiert=False):
    e = INDEX[stem]
    m = e['masse']
    ziel = hoehe or e.get('zielHoehe') or m['hoehe']
    f = ziel / m['hoehe']
    eb, et = max(0.1, round(m['b'] * f, 2)), max(0.1, round(m['h'] * f, 2))
    typ_id = f"sf_{re.sub('[^a-z0-9]+', '_', stem)[:28]}_{round(ziel * 10)}{'_b' if blockiert else ''}"
    typen[typ_id] = {'name': e.get('name', stem), 'kategorie': 'Spielordner', 'b': eb, 'h': et, 'hoehe3d': round(ziel, 3), 'blockiert': blockiert,
                     'farbe': '#80c080', 'glbDatei': f'assets/eigene/{stem}.glb'}
    return typ_id, eb, et


def deko(stem, cx, cy, hoehe=None, drehung=0, blockiert=False):
    """Modell mit Mittelpunkt (cx, cy) in Kacheln. drehung 0 = Front Süd, 90 West, 180 Nord, 270 Ost (auch Zwischenwinkel)."""
    typ_id, b, t = typ_fuer(stem, hoehe, blockiert)
    viertel = round(drehung / 90) % 4
    if viertel % 2 == 1:
        b, t = t, b
    extra = {'drehung': drehung} if drehung else {}
    if blockiert:
        extra['blockiert'] = True
    o(typ_id, round(cx - b / 2, 2), round(cy - t / 2, 2), b, t, **extra)


# ---------------------------------------------------------------------------------------------------------------------
# Wege
def weg(punkte, breite=2, boden='&'):
    """Erdweg als Polylinie (Kachel-Punkte), leicht geschwungen."""
    for (x0, y0), (x1, y1) in zip(punkte, punkte[1:]):
        n = max(abs(x1 - x0), abs(y1 - y0)) * 2 + 1
        for i in range(n + 1):
            t = i / n
            x = x0 + (x1 - x0) * t + math.sin(t * math.pi * 2 + x0) * 0.8
            y = y0 + (y1 - y0) * t + math.cos(t * math.pi * 2 + y0) * 0.8
            for dx in range(breite):
                for dy in range(breite):
                    xx, yy = int(round(x)) + dx - breite // 2, int(round(y)) + dy - breite // 2
                    if drin(xx, yy) and g[yy][xx] not in '~|#HFT+!=_SZ' and not g[yy][xx].islower():
                        g[yy][xx] = boden
                        deko_frei.add((xx, yy))
                    if drin(xx, yy):
                        sperre(xx, yy, xx, yy, rand=1)


# --- Straße vom Stadtrand (Osten, y 88–92) bis zum Wanderparkplatz ---
STR_Y0, STR_Y1 = 88, 92
for y in range(STR_Y0, STR_Y1 + 1):
    for x in range(126, B):
        g[y][x] = '='
for y in range(STR_Y0 - 2, STR_Y1 + 3):           # Gehwege wie am Stadtrand
    for x in range(132, B):
        if g[y][x] != '=':
            g[y][x] = '-'
sperre(126, STR_Y0 - 2, B - 1, STR_Y1 + 2, rand=1)
deko_frei.update((x, y) for x in range(126, B) for y in range(STR_Y0 - 2, STR_Y1 + 3))

# Wanderparkplatz (Kies) mit Holzschild
P_X0, P_Y0, P_X1, P_Y1 = 112, 82, 125, 98
for y in range(P_Y0, P_Y1 + 1):
    for x in range(P_X0, P_X1 + 1):
        g[y][x] = '%'
sperre(P_X0, P_Y0, P_X1, P_Y1, rand=1)
deko_frei.update((x, y) for x in range(P_X0, P_X1 + 1) for y in range(P_Y0, P_Y1 + 1))
o('auto_gelb', 114, 84, 3, 5.5, drehung=0, blockiert=True)
o('transporter', 120, 92, 3, 5.5, drehung=180, blockiert=True)
deko('wooden-sign', 126.5, 86.2, blockiert=True)
deko('nk-log-stack-large', 113.5, 96.5, drehung=90, blockiert=True)
deko('trash-bag', 124.5, 97.5)
o('licht', 125, 85, 1, 1, radius=3.3, farbe='#ffc070', staerke=0.8, mast=True)

# ---------------------------------------------------------------------------------------------------------------------
# See (Wasser "~"), Insel, Ufer, Strand
SEE_X, SEE_Y, SEE_RX, SEE_RY = 60, 68, 30, 20
wasser = set()
for y in range(H):
    for x in range(B):
        dx = (x - SEE_X) / SEE_RX
        dy = (y - SEE_Y) / SEE_RY
        w = math.atan2(dy, dx)
        rand = 1 + 0.10 * math.sin(w * 3 + 0.4) + 0.07 * math.sin(w * 5 + 2.1) + 0.04 * math.sin(w * 9)
        if dx * dx + dy * dy < rand * rand:
            wasser.add((x, y))
# Insel mit einem Baum (nur watend erreichbar)
INSEL = (50, 62)
insel = {(x, y) for x in range(INSEL[0] - 4, INSEL[0] + 5) for y in range(INSEL[1] - 3, INSEL[1] + 4) if ((x - INSEL[0]) / 3.6) ** 2 + ((y - INSEL[1]) / 2.7) ** 2 < 1}
wasser -= insel
for x, y in wasser:
    g[y][x] = '~'
for x, y in insel:
    g[y][x] = ','

# Abstand zum Wasser (BFS) → Ufergras, Rundweg
abstand = {}
schlange = deque()
for p in wasser:
    abstand[p] = 0
    schlange.append(p)
while schlange:
    x, y = schlange.popleft()
    d = abstand[(x, y)]
    if d >= 9:
        continue
    for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
        if drin(nx, ny) and (nx, ny) not in abstand:
            abstand[(nx, ny)] = d + 1
            schlange.append((nx, ny))
for (x, y), d in abstand.items():
    if (x, y) in insel:
        continue
    if 1 <= d <= 3:
        g[y][x] = ','            # Ufergras
    if d <= 3:
        belegt.add((x, y))       # keine Bäume direkt am Ufer
for p in insel:
    belegt.add(p)

# Badestrand am Ostufer (Sand)
for (x, y), d in abstand.items():
    if 1 <= d <= 5 and x > SEE_X + 18 and 62 <= y <= 82:
        g[y][x] = '!'
        deko_frei.add((x, y))
        belegt.add((x, y))

# Rundweg ums Ufer (2 breit, Abstand 5–6 zum Wasser)
for (x, y), d in abstand.items():
    if d in (5, 6) and (x, y) not in insel and g[y][x] not in '!':
        g[y][x] = '&'
        deko_frei.add((x, y))
        sperre(x, y, x, y, rand=1)


# ---------------------------------------------------------------------------------------------------------------------
# Hütten (Holzwände "H", Holzboden "+")
def huette(x0, y0, b, h, tuer, fenster=(), boden='+', tuer_breit=1, wand='H'):
    """tuer = 'N' | 'S' | 'O' | 'W' (mittig); fenster = [(dx, dy)]."""
    for y in range(y0, y0 + h):
        for x in range(x0, x0 + b):
            g[y][x] = wand if x in (x0, x0 + b - 1) or y in (y0, y0 + h - 1) else boden
    if tuer in 'NS':
        ty = y0 if tuer == 'N' else y0 + h - 1
        tx = x0 + b // 2 - (tuer_breit - 1)
        tueren = [(tx + i, ty) for i in range(tuer_breit)]
        schritt = (0, -1 if tuer == 'N' else 1)
    else:
        tx = x0 if tuer == 'W' else x0 + b - 1
        ty = y0 + h // 2
        tueren = [(tx, ty + i) for i in range(tuer_breit)]
        schritt = (-1 if tuer == 'W' else 1, 0)
    for x, y in tueren:
        g[y][x] = 'T'
    for dx, dy in fenster:
        g[y0 + dy][x0 + dx] = 'F'
    sperre(x0, y0, x0 + b - 1, y0 + h - 1, rand=3)
    deko_frei.update((x, y) for x in range(x0 - 1, x0 + b + 1) for y in range(y0 - 1, y0 + h + 1))
    # Vorplatz (Erde) vor der Tür
    for x, y in tueren:
        for i in range(1, 3):
            xx, yy = x + schritt[0] * i, y + schritt[1] * i
            if drin(xx, yy) and g[yy][xx] not in '~|':
                g[yy][xx] = '&'
    return tueren[0][0] + schritt[0] * 2, tueren[0][1] + schritt[1] * 2


def loot(x, y, ch):
    g[y][x] = ch


# 1) Waldhütte (Start) – westlich vom Parkplatz, Tür nach Osten
x0, y0 = 96, 84
vor_waldhuette = huette(x0, y0, 11, 9, 'O', fenster=[(3, 0), (7, 0), (3, 8), (7, 8), (0, 4)])
g[y0 + 4][x0 + 3] = 'S'
for dx, dy in ((2, 2), (8, 6), (5, 6)):
    loot(x0 + dx, y0 + dy, 'a')
o('bett', x0 + 1, y0 + 1, 1, 2, blockiert=True)
o('kiste', x0 + 9, y0 + 1, 1, 1, blockiert=True)
o('werkbank', x0 + 4, y0 + 1, 2, 1, blockiert=True)
o('kueche_herd', x0 + 1, y0 + 7, 1, 1, blockiert=True)
deko('wood-kitchen-table', x0 + 5.5, y0 + 4.5, blockiert=True)
deko('wooden-chair', x0 + 4.4, y0 + 4.5, drehung=270, blockiert=True)
deko('wooden-chair', x0 + 6.6, y0 + 4.5, drehung=90, blockiert=True)
deko('wool-carpet', x0 + 5.5, y0 + 4.5, hoehe=0.03)
licht(x0 + 5, y0 + 3, radius=5)
# Veranda-Deko
deko('nk-log-stack', x0 + 11.6, y0 + 1.5, drehung=0, blockiert=True)
deko('garden-bench', x0 + 12, y0 + 7.2, drehung=270, blockiert=True)

# 2) Fischerhütte am Nordufer, Tür nach Süden, Steg in den See
nord_ufer = min(y for (x, y) in wasser if x == 60)
FX0, FY0 = 56, nord_ufer - 13
vor_fischer = huette(FX0, FY0, 9, 6, 'S', fenster=[(2, 0), (6, 0), (0, 2), (8, 2)])
for dx, dy in ((2, 2), (6, 3)):
    loot(FX0 + dx, FY0 + dy, 'b')
o('bett', FX0 + 7, FY0 + 1, 1, 2, blockiert=True)
o('kiste_klein', FX0 + 1, FY0 + 1, 1, 1, blockiert=True)
o('holzkiste', FX0 + 1, FY0 + 4, 0.9, 0.9, blockiert=True)
o('tisch_rund', FX0 + 4, FY0 + 2, 1, 1, blockiert=True)
licht(FX0 + 4, FY0 + 3, radius=4)
deko('nk-canoe-paddle', FX0 + 9.6, FY0 + 2, drehung=10)
deko('barrel', FX0 + 9.5, FY0 + 4.6, blockiert=True)

# 3) Försterhaus im Nordosten (Wohnraum + Küche), Tür nach Süden; Holzschuppen daneben
FHX, FHY = 92, 18
huette(FHX, FHY, 16, 11, 'S', fenster=[(3, 0), (7, 0), (11, 0), (0, 4), (15, 4), (3, 10), (12, 10)], tuer_breit=2)
for y in range(FHY + 1, FHY + 10):
    g[y][FHX + 10] = 'H'
g[FHY + 5][FHX + 10] = 'T'
for dx, dy in ((2, 3), (6, 7), (8, 2)):
    loot(FHX + dx, FHY + dy, 'c')
for dx, dy in ((12, 3), (14, 8)):
    loot(FHX + dx, FHY + dy, 'd')
X, Y = FHX, FHY
deko('fireplace', X + 5, Y + 1.5, blockiert=True)
deko('sofa', X + 5, Y + 6.3, drehung=180, blockiert=True)
deko('rounded-coffee-table', X + 5, Y + 4.4, blockiert=True)
deko('club-arm-chair', X + 2.2, Y + 4.4, drehung=270, blockiert=True)
deko('medium-book-shelf', X + 9.4, Y + 3.5, drehung=90, blockiert=True)
o('bett', X + 1, Y + 7, 1, 2, blockiert=True)
o('kleiderschrank', X + 6, Y + 8.9, 2, 0.8, blockiert=True)
deko('wool-carpet', X + 5, Y + 4.6, hoehe=0.03)
deko('floor-lamp', X + 8.6, Y + 1.5)
licht(X + 5, Y + 4, radius=5.5)
# Küche
deko('fridge', X + 14.3, Y + 1.5, blockiert=True)
deko('gas-stove', X + 12.5, Y + 1.5, blockiert=True)
deko('sink-kitchen-cabinet', X + 11.6, Y + 1.5, blockiert=True)
deko('wood-kitchen-table', X + 12.8, Y + 6, blockiert=True)
deko('wood-kitchen-chair', X + 12.8, Y + 7.3, drehung=180, blockiert=True)
o('kuechenschrank', X + 14, Y + 9, 0.9, 0.7, blockiert=True)
licht(X + 13, Y + 4, radius=4.5, farbe='#fff0d0')
# Hirschgeweih-Deko vor dem Haus: Holzstapel, Bank, Briefkasten
deko('nk-log-stack-large', X - 1.6, Y + 3, drehung=90, blockiert=True)
deko('park-bench', X + 3, Y + 12.4, blockiert=True)
deko('mailbox', X + 9.5, Y + 12.6, blockiert=True)
vor_foerster = (X + 8, Y + 12)
SX, SY = 112, 20
huette(SX, SY, 7, 6, 'W', fenster=[(3, 0)])
loot(SX + 3, SY + 2, 'e')
loot(SX + 4, SY + 4, 'e')
o('werkzeugkiste', SX + 5, SY + 1, 0.6, 0.4, blockiert=True)
o('werkbank', SX + 2, SY + 4, 2, 1, blockiert=True)
vor_schuppen = (SX - 2, SY + 3)

# 4) Ferienhütte südlich der Waldhütte, Tür nach Norden
FEX, FEY = 92, 101
vor_ferien = huette(FEX, FEY, 10, 7, 'N', fenster=[(2, 6), (7, 6), (0, 3), (9, 3), (8, 0)])
for dx, dy in ((2, 2), (7, 4)):
    loot(FEX + dx, FEY + dy, 'f')
deko('bunk-bed', FEX + 1.6, FEY + 4.3, drehung=270, blockiert=True)
deko('sofa-small', FEX + 6, FEY + 5.4, drehung=180, blockiert=True)
o('kommode', FEX + 7.3, FEY + 1.1, 1.5, 0.6, blockiert=True)
o('kuehlschrank', FEX + 1, FEY + 1, 1.1, 0.7, blockiert=True)
licht(FEX + 5, FEY + 3, radius=4.5)

# 5) Jagdhütte im Südwesten, Tür nach Osten, Hochsitz-Gefühl mit Leiter
JX, JY = 16, 104
vor_jagd = huette(JX, JY, 8, 7, 'O', fenster=[(3, 0), (0, 3), (3, 6)])
for dx, dy in ((2, 2), (4, 4)):
    loot(JX + dx, JY + dy, 'g')
o('bett', JX + 1, JY + 4, 1, 2, blockiert=True)
o('truhe', JX + 5, JY + 1, 1, 0.7, blockiert=True)
licht(JX + 3, JY + 3, radius=4)
deko('nk-log-stack', JX - 1, JY + 3, drehung=0, blockiert=True)
deko('ladder', JX + 9.5, JY + 0.5, drehung=270)

# ---------------------------------------------------------------------------------------------------------------------
# Stege ("|") – Holzplanken über dem Wasser
def steg(x0, y0, x1, y1):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            g[y][x] = '|'
            deko_frei.add((x, y))
            belegt.add((x, y))


def pfaehle(x0, y0, x1, y1):
    """Holzpfähle an den Steg-Ecken (stehen im Wasser, nicht blockierend)."""
    for x, y in ((x0 - 0.15, y0 - 0.15), (x1 + 1.15, y0 - 0.15), (x0 - 0.15, y1 + 1.15), (x1 + 1.15, y1 + 1.15)):
        deko('post', x, y, hoehe=0.9)


# Hauptsteg vom Strand nach Westen, mit T-Kopf
ost_ufer = max(x for (x, y) in wasser if y == 72)
steg(ost_ufer - 13, 71, ost_ufer + 1, 73)
steg(ost_ufer - 16, 67, ost_ufer - 14, 77)
pfaehle(ost_ufer - 16, 67, ost_ufer - 14, 77)
deko('wooden-torch', ost_ufer - 15.5, 67.4)
deko('wooden-torch', ost_ufer - 15.5, 77.6)
licht(ost_ufer - 16, 67, radius=3.5, farbe='#ffb060', staerke=0.7, flackern=True)
licht(ost_ufer - 16, 77, radius=3.5, farbe='#ffb060', staerke=0.7, flackern=True)
deko('bench', ost_ufer - 14.4, 72, drehung=90, blockiert=True)
o('fass', ost_ufer - 2, 73.1, 0.9, 0.9, blockiert=True)
deko('boat', ost_ufer - 8, 69.2, drehung=90)        # Ruderboot am Steg (liegt im Wasser)
deko('nk-canoe', ost_ufer - 10, 75.3, drehung=95)

# Fischersteg vom Nordufer nach Süden
steg(60, nord_ufer - 2, 61, nord_ufer + 9)
pfaehle(60, nord_ufer - 2, 61, nord_ufer + 9)
deko('crate', 60.5, nord_ufer + 8.5, hoehe=0.6, blockiert=True)
deko('nk-canoe', 63.4, nord_ufer + 5, drehung=10)
deko('wooden-torch', 59.6, nord_ufer + 9.7)
licht(60, nord_ufer + 9, radius=3.2, farbe='#ffb060', staerke=0.65, flackern=True)

# Kleiner Bootssteg am Südufer (westlich der Ferienhütte)
sued_ufer = max(y for (x, y) in wasser if x == 70)
steg(69, sued_ufer - 6, 71, sued_ufer + 1)
pfaehle(69, sued_ufer - 6, 71, sued_ufer + 1)
deko('boat', 73.4, sued_ufer - 4, drehung=15)
deko('raft', 66, sued_ufer - 3, hoehe=0.4, drehung=30)

# ---------------------------------------------------------------------------------------------------------------------
# Wiesen (Gras/Wiese, Blumen, Tiere als Deko)
def wiese(cx, cy, rx, ry, boden='0'):
    kacheln = []
    for y in range(cy - ry - 2, cy + ry + 3):
        for x in range(cx - rx - 2, cx + rx + 3):
            if not drin(x, y) or g[y][x] not in ';@,':
                continue
            d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2
            rausch = 0.15 * math.sin(x * 0.7 + y * 0.3) + 0.1 * math.cos(y * 0.9)
            if d < 1 + rausch:
                g[y][x] = boden if d < 0.7 + rausch else ','
                belegt.add((x, y))
                kacheln.append((x, y))
    return kacheln


blumenwiese = wiese(24, 26, 15, 11)
hasenwiese = wiese(62, 112, 13, 8)
lichtung = wiese(128, 50, 9, 8, boden=',')
# Ruhige Lichtung am Westufer mit Lagerfeuer
lagerplatz = wiese(20, 66, 6, 6, boden=',')

# ---------------------------------------------------------------------------------------------------------------------
# Wegenetz (Erde): Parkplatz → Rundweg, Hütten, Wiesen
rundweg_ost = (SEE_X + SEE_RX + 6, SEE_Y + 2)
weg([(P_X0, 90), (106, 90), vor_waldhuette])
weg([(106, 90), (100, 80), (96, 74), rundweg_ost])
weg([(100, 80), (104, 60), (102, 45), (100, 34), vor_foerster])
weg([(100, 34), (108, 28), vor_schuppen])
weg([(104, 60), (116, 54), (128, 50)])
weg([(106, 90), (106, 96), (vor_ferien[0], vor_ferien[1] - 1)])
weg([vor_fischer, (vor_fischer[0], vor_fischer[1] + 3)])
weg([(FX0 - 2, nord_ufer - 9), (44, 38), (30, 32), (24, 26)])
weg([(28, 66), (22, 66)])
weg([(62, 92), (62, 106)])
weg([(36, 84), (28, 96), vor_jagd])

# Lagerplatz: Feuerstelle mit Baumstämmen, Zelt
deko('nk-campfire-stones', 19.5, 66.5, blockiert=True)
deko('bonfire', 19.5, 66.5, hoehe=0.6)
licht(19, 66, radius=4.5, farbe='#ff9a40', staerke=0.9, flackern=True)
deko('wood-log', 19.5, 64, hoehe=0.4, blockiert=True)
deko('wood-log', 19.5, 69, hoehe=0.4, drehung=180, blockiert=True)
deko('wood-log', 16.8, 66.5, hoehe=0.4, drehung=90, blockiert=True)
deko('nk-tent-detailed-open', 15.5, 61.5, drehung=200, blockiert=True)
deko('nk-log-stack', 24.5, 62.5, blockiert=True)
deko('backpack', 17.3, 63.5)

# Badestrand: Liegeplatz, Sonnenschirm-Ersatz (Busch), Bänke am Ufer
deko('nk-canoe', ost_ufer + 3.5, 79.5, drehung=170)
deko('volleyball-ball', ost_ufer + 4, 66, hoehe=0.25)
deko('garden-bench', ost_ufer + 5.5, 70, drehung=270, blockiert=True)
deko('garden-bench', ost_ufer + 5.5, 75, drehung=270, blockiert=True)

# Wegweiser an Kreuzungen
deko('arrow-sign', 107.5, 87.5, blockiert=True)
deko('arrow-sign', 101.5, 78.2, drehung=90, blockiert=True)
deko('arrow-sign', 105.5, 58.5, drehung=180, blockiert=True)
deko('wooden-sign', FX0 - 3.5, nord_ufer - 11, blockiert=True)

# Bänke entlang des Rundwegs (Blick auf den See)
for winkel in (0.6, 1.9, 2.6, 3.6, 4.4, 5.3):
    bx = SEE_X + math.cos(winkel) * (SEE_RX + 4.5)
    by = SEE_Y + math.sin(winkel) * (SEE_RY + 4.5)
    bx, by = int(bx), int(by)
    if drin(bx, by) and g[by][bx] in ',;&' and (bx, by) not in wasser:
        drehung = (round(math.degrees(winkel + math.pi / 2) / 90) * 90) % 360
        deko('park-bench', bx + 0.5, by + 0.5, drehung=drehung, blockiert=True)
        belegt.add((bx, by))

# ---------------------------------------------------------------------------------------------------------------------
# Wasser-Deko: Seerosen, Schilf am Ufer, Enten
ufer_wasser = [p for p in wasser if any((p[0] + dx, p[1] + dy) not in wasser for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))]
ufer_wasser.sort()
lilien = 0
versuche = 0
gesetzt_wasser = set()
while lilien < 34 and versuche < 2000:
    versuche += 1
    x, y = zufall.choice(sorted(wasser))
    if g[y][x] != '~':
        continue
    # Seerosen-Felder nahe am Ufer (2–6 Kacheln), nicht am Strand/Steg
    nah = min((abs(x - ux) + abs(y - uy) for ux, uy in ufer_wasser[::7]), default=99)
    if not (1 <= nah <= 6) or x > SEE_X + 18 or any(abs(x - a) < 2 and abs(y - b) < 2 for a, b in gesetzt_wasser):
        continue
    if any(g[yy][xx] == '|' for xx in range(x - 2, x + 3) for yy in range(y - 2, y + 3) if drin(xx, yy)):
        continue
    gesetzt_wasser.add((x, y))
    deko('nk-lily-large' if zufall.random() < 0.6 else 'nk-lily-small', x + zufall.random(), y + zufall.random(), drehung=zufall.randrange(0, 360, 15))
    if zufall.random() < 0.5:
        deko('nk-lily-small', x + zufall.random() + 0.8, y + zufall.random() + 0.6, drehung=zufall.randrange(0, 360, 15))
    lilien += 1

schilf = 0
for i, (x, y) in enumerate(ufer_wasser):
    if schilf >= 46 or g[y][x] != '~' or x > SEE_X + 18:
        continue
    if (i * 7919) % 5 > 1:
        continue
    if any(drin(xx, yy) and g[yy][xx] == '|' for xx in range(x - 3, x + 4) for yy in range(y - 3, y + 4)):
        continue
    deko('nk-grass-large', x + 0.5, y + 0.5, hoehe=zufall.choice((0.75, 0.9, 1.05)), drehung=zufall.randrange(0, 360, 30))
    schilf += 1

for ex, ey, dr in ((55, 74, 30), (56.5, 75, 60), (54.2, 75.6, 10), (70, 58, 200), (71.2, 57.4, 230), (40, 70, 120)):
    if (int(ex), int(ey)) in wasser:
        deko('duck', ex, ey, drehung=dr)
# Baum auf der Insel
o('baum', INSEL[0] - 1.5, INSEL[1] - 1.5, 3, 3, ebene='oben', groesse='gross')

# Tiere: Hirsch/Reh/Fuchs sind seit Runde 41 echte, animierte Wild-Tiere (tierBereiche unten), keine Deko mehr
deko('lowpoly-squirrel', 104.5, 40.5, drehung=90)
deko('lis', 70, 36, drehung=30)
deko('bird', 46, 52.5, drehung=180)
deko('vogelscheuche', 66, 108, drehung=0, blockiert=True)


# ---------------------------------------------------------------------------------------------------------------------
# Wald: Bäume (instanziert, fällbar), Büsche, Bodendeko
def frei(x, y, b, h, rand=0):
    for yy in range(y - rand, y + h + rand):
        for xx in range(x - rand, x + b + rand):
            if not drin(xx, yy) or (xx, yy) in belegt or g[yy][xx] not in ';@,0':
                return False
    return True


def setze(typ, x, y, b, h, rand, **extra):
    if not frei(x, y, int(b + 0.99), int(h + 0.99), rand):
        return False
    o(typ, x, y, b, h, **extra)
    sperre(x, y, x + int(b + 0.99) - 1, y + int(h + 0.99) - 1, rand=0)
    return True


# Wildwald-Flecken (Laub, Moos) im tiefen Wald
for _ in range(26):
    cx, cy = zufall.randint(4, B - 5), zufall.randint(4, H - 5)
    r = zufall.uniform(3, 7)
    for y in range(int(cy - r), int(cy + r) + 1):
        for x in range(int(cx - r), int(cx + r) + 1):
            if drin(x, y) and g[y][x] == ';' and (x - cx) ** 2 + (y - cy) ** 2 < r * r * (0.8 + 0.4 * math.sin(x + y)):
                g[y][x] = '@'

# Zombies (Wald, nie am Parkplatz/Eingang, nicht in Hütten/Wasser)
anzahl_zombies = 0
while anzahl_zombies < 16:
    x, y = zufall.randint(3, B - 4), zufall.randint(3, H - 4)
    if not frei(x, y, 1, 1, 2) or (x > 104 and 76 < y < 104):
        continue
    g[y][x] = 'Z'
    sperre(x, y, x, y, rand=3)
    anzahl_zombies += 1

baeume = 0
versuche = 0
while baeume < 520 and versuche < 40000:
    versuche += 1
    x, y = zufall.randint(0, B - 4), zufall.randint(0, H - 4)
    typ = 'baum_herbst' if zufall.random() < 0.12 else 'baum'
    if setze(typ, x, y, 3.5, 3.5, 0, ebene='oben'):
        baeume += 1
buesche = 0
versuche = 0
while buesche < 240 and versuche < 20000:
    versuche += 1
    x, y = zufall.randint(0, B - 2), zufall.randint(0, H - 2)
    if setze('busch', x, y, 1.5, 1.5, 0, ebene='oben'):
        buesche += 1
for typ, anzahl in (('stein', 22), ('eisenerz', 9)):
    n = 0
    while n < anzahl:
        x, y = zufall.randint(1, B - 3), zufall.randint(1, H - 3)
        if setze(typ, x, y, 1, 1, 1, blockiert=True):
            n += 1
# Bodendeko im Wald: Farne, Pilze, Stümpfe, Felsen (nicht blockierend außer Felsen)
WALD_DEKO = [('fern', 26, None, False), ('nk-mushroom-red-group', 18, None, False), ('nk-mushroom-tan-group', 14, None, False),
             ('mushroom-laetiporus', 6, 0.5, False), ('nk-stump-round-detailed', 10, None, True), ('nk-grass-leafs-large', 20, None, False),
             ('rock-medium', 6, 1.2, True), ('nk-plant-bush-detailed', 14, None, False)]
BUSCH_STATT = {'nk-grass-leafs-large', 'nk-plant-bush-detailed'}  # Runde 41: Platz bleibt (gleiche Zufallsfolge), Modell wird Busch
for stem, anzahl, hoehe, block in WALD_DEKO:
    n = 0
    v = 0
    while n < anzahl and v < 4000:
        v += 1
        x, y = zufall.randint(1, B - 2), zufall.randint(1, H - 2)
        if (x, y) in deko_frei or g[y][x] not in ';@' or (block and (x, y) in belegt):
            continue
        if any(abs(e['x'] - x) < 1.2 and abs(e['y'] - y) < 1.2 for e in objekte[-40:]):
            continue
        drehung = zufall.randrange(0, 360, 30) if not block else zufall.choice((0, 90, 180, 270))
        if stem in BUSCH_STATT:
            # Runde 41: Kenney-Büsche (Flachfarbe, wirkten wie Bäume ohne Textur) → normaler Busch wie auf der Startkarte
            setze('busch', x, y, 1.5, 1.5, 0, ebene='oben')  # nur auf freiem Platz (keine Überlappung mit Bäumen/Steinen)
        else:
            deko(stem, x + 0.5, y + 0.5, hoehe=hoehe, drehung=drehung, blockiert=block)
        if block:
            belegt.add((x, y))
        n += 1

# Blumen auf den Wiesen
for kacheln, anzahl in ((blumenwiese, 46), (hasenwiese, 22), (lichtung, 10), (lagerplatz, 4)):
    for x, y in zufall.sample(kacheln, min(anzahl, len(kacheln))):
        if (x, y) in deko_frei or g[y][x] not in '0,':
            continue
        stem = zufall.choice(('nk-flower-purple-a', 'nk-flower-red-a', 'nk-flower-yellow-a', 'nk-flower-yellow-a', 'flower-group', 'clover', 'bush-with-flowers'))
        hoehe = 0.9 if stem == 'bush-with-flowers' else None
        deko(stem, x + zufall.uniform(0.2, 0.8), y + zufall.uniform(0.2, 0.8), hoehe=hoehe, drehung=zufall.randrange(0, 360, 30))

# Zaun um die Hasenwiese (Weide) – Nordseite mit Tor am Weg
hx0, hx1 = 52, 72
zy = 102
for x in range(hx0, hx1, 3):
    if abs(x + 1.5 - 62) < 2:
        deko('nk-fence-gate', x + 1.5, zy, blockiert=False)
        continue
    if all(g[zy][xx] in ',0;@' for xx in range(x, x + 3)):
        deko('nk-fence-simple', x + 1.5, zy, blockiert=True)

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


def rechteck_tiere(kacheln, anzahl, art='hase'):
    xs = [p[0] for p in kacheln]
    ys = [p[1] for p in kacheln]
    x0, y0 = min(xs) + 2, min(ys) + 2
    return {'x': x0, 'y': y0, 'b': max(xs) - x0 - 1, 'h': max(ys) - y0 - 1, 'art': art, 'anzahl': anzahl}


tiere = [rechteck_tiere(hasenwiese, 5), rechteck_tiere(blumenwiese, 4),
         # Runde 41: Wild (sehr scheu, flieht im Galopp; tierSystem + konfiguration.tiere.wild)
         rechteck_tiere(blumenwiese, 4, 'reh'), rechteck_tiere(blumenwiese, 1, 'hirsch'), rechteck_tiere(hasenwiese, 3, 'reh'),
         {'x': 118, 'y': 40, 'b': 18, 'h': 14, 'art': 'fuchs', 'anzahl': 2}]

js = ['''/**
 * Zone "Waldsee" – westlich vom Stadtrand (erzeugt von werkzeuge/karten/waldsee.py, dort ändern!).
 * 150 × 130, idyllischer Mischwald: Wanderparkplatz am Ostrand, Erdwege, großer See mit Badestrand, Holzstegen ("|", begehbar,
 * zum Angeln), Booten/Kanus/Seerosen/Schilf, Rundweg am Ufer, Blumenwiese mit Hirschen, Hasenweide, Lagerplatz mit Zelt.
 * Hütten: Waldhütte (Start), Fischerhütte, Försterhaus, Holzschuppen, Ferienhütte, Jagdhütte.
 * Deko = Spielordner-Modelle (`typen`, glbDatei unter client/assets/eigene/, u. a. Kenney Nature Kit nk-*).
 * Übergang: Ostrand (Straße) ↔ Stadtrand Westrand. Legende wie stadtrand.js.
 */
const M = { blockiert: true };

export const WALDSEE = {
  id: 'waldsee',
  name: 'Waldsee',
  kacheln: [''']
js += [f"    '{z}'," for z in zeilen]
js += ['  ],', '  raeume: {',
       "    a: { name: 'Waldhütte', lootTabelle: 'huette' },",
       "    b: { name: 'Fischerhütte', lootTabelle: 'angler' },",
       "    c: { name: 'Försterhaus', lootTabelle: 'wohnung' },",
       "    d: { name: 'Försterhaus Küche', lootTabelle: 'kueche' },",
       "    e: { name: 'Holzschuppen', lootTabelle: 'werkstatt' },",
       "    f: { name: 'Ferienhütte', lootTabelle: 'wohnung' },",
       "    g: { name: 'Jagdhütte', lootTabelle: 'huette' },",
       '  },', '  einstellungen: {',
       '    wetter: { regenAnteil: 0.35, dauerMin: 60, dauerMax: 200, pauseMin: 240, pauseMax: 600 },',
       '    tiere: { hasenProTausend: 1.2, hasenMax: 12 },',
       '  },',
       '  tierBereiche: [']
js += [f"    {{ x: {t['x']}, y: {t['y']}, b: {t['b']}, h: {t['h']}, art: '{t['art']}', anzahl: {t['anzahl']} }}," for t in tiere]
js += ['  ],', '  objekte: [']
js += [f'    {js_objekt(e)},' for e in objekte]
js += ['  ],', '  // Spielordner-Modelle (nur Anzeige; Kollision über blockiert am Objekt)', '  typen: {']
js += [f"    {k}: {{ name: '{v['name']}', kategorie: '{v['kategorie']}', b: {zahl(v['b'])}, h: {zahl(v['h'])}, hoehe3d: {zahl(v['hoehe3d'])}, blockiert: {'true' if v['blockiert'] else 'false'}, farbe: '{v['farbe']}', glbDatei: '{v['glbDatei']}' }}," for k, v in typen.items()]
js += ['  },', '  uebergaenge: [',
       f"    {{ x: {B - 1}, y: {STR_Y0 - 2}, b: 1, h: {STR_Y1 - STR_Y0 + 5}, ziel: 'stadtrand', ankunft: 'west', name: 'Stadtrand (Osten)' }},",
       '  ],', '  ankuenfte: {', f'    ost: {{ x: {B - 6}, y: {(STR_Y0 + STR_Y1) // 2} }}, // wer vom Stadtrand kommt (Straße, nicht im Übergang)', '  },', '};']
ZIEL.write_text('\n'.join(js) + '\n', encoding='utf-8')
print(f'{ZIEL} geschrieben ({B} × {H}, {len(objekte)} Objekte, {baeume} Bäume, {buesche} Büsche, {len(wasser)} Wasser, '
      f'{sum(z.count("|") for z in zeilen)} Steg, {len(typen)} Modell-Typen, {sum(1 for e in objekte if e["typ"].startswith("sf_"))} Deko-Modelle)')

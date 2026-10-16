"""
Generator für server/spiel/karten/waldweg.js – Zone "Waldweg" nördlich vom Stadtrand (große Wald-Zone).

    python3 werkzeuge/karten/waldweg.py

160 × 120 Kacheln: eine 5 Kacheln breite RINGSTRASSE (zum Autofahren/Testen, mit geparkten Autos), innen ein dichter
Wald mit einem SEE (Angeln!), im Norden die Lichtung mit Försterhütte & Schuppen, am See eine Angelhütte, viel Holz,
Steine und Eisenerz. Der Südrand (Straße) führt zurück zum Stadtrand. Zufall mit festem Startwert → gleiche Karte
bei jedem Lauf. Danach: npm test (prüft Erreichbarkeit, Überlappungen, Grafiken).
"""
import math
import random
from pathlib import Path

ZIEL = Path(__file__).resolve().parents[2] / 'server' / 'spiel' / 'karten' / 'waldweg.js'
B, H = 160, 120
zufall = random.Random(20261016)
g = [[',' for _ in range(B)] for _ in range(H)]
objekte = []
belegt = set()  # Kacheln, auf die keine Bäume/Steine/Zombies dürfen (Straße, Gebäude, See, Abstand)


def sperre(x0, y0, x1, y1, rand=0):
    for y in range(y0 - rand, y1 + rand + 1):
        for x in range(x0 - rand, x1 + rand + 1):
            belegt.add((x, y))


def raum(x0, y0, x1, y1, boden):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            g[y][x] = '#' if x in (x0, x1) or y in (y0, y1) else boden
    sperre(x0, y0, x1, y1, rand=2)


def o(typ, x, y, b, h, **extra):
    objekte.append({'typ': typ, 'x': x, 'y': y, 'b': b, 'h': h, **extra})


# --- Ringstraße (5 breit, Asphalt "=" mit automatischen Markierungen): West (= Zufahrt vom Stadtrand), Nord, Ost, Süd ---
STRASSE = 5
WEST_X0, OST_X0 = 29, 137
NORD_Y0, SUED_Y0 = 20, 96
for y in range(NORD_Y0, H):  # Westseite + Zufahrt bis zum Südrand
    for x in range(WEST_X0, WEST_X0 + STRASSE):
        g[y][x] = '='
for x in range(WEST_X0, OST_X0 + STRASSE):  # Nordseite
    for y in range(NORD_Y0, NORD_Y0 + STRASSE):
        g[y][x] = '='
for y in range(NORD_Y0, SUED_Y0 + STRASSE):  # Ostseite
    for x in range(OST_X0, OST_X0 + STRASSE):
        g[y][x] = '='
for x in range(WEST_X0, OST_X0 + STRASSE):  # Südseite
    for y in range(SUED_Y0, SUED_Y0 + STRASSE):
        g[y][x] = '='
sperre(WEST_X0, NORD_Y0, WEST_X0 + STRASSE - 1, H - 1, rand=1)
sperre(WEST_X0, NORD_Y0, OST_X0 + STRASSE - 1, NORD_Y0 + STRASSE - 1, rand=1)
sperre(OST_X0, NORD_Y0, OST_X0 + STRASSE - 1, SUED_Y0 + STRASSE - 1, rand=1)
sperre(WEST_X0, SUED_Y0, OST_X0 + STRASSE - 1, SUED_Y0 + STRASSE - 1, rand=1)

# --- Lichtung im Norden: Försterhütte (Holzboden) und Schuppen (Beton) ---
for y in range(4, 20):
    for x in range(34, 60):
        belegt.add((x, y))
raum(36, 12, 47, 19, '+')  # Hütte
g[19][41] = 'T'  # Tür nach Süden zur Straße
for x, y in ((38, 12), (45, 12), (36, 15), (47, 15)):
    g[y][x] = 'F'
g[14][38] = 'S'  # Startpunkt (nur nötig, falls die Zone mal Startzone wird)
for x, y in ((43, 14), (45, 17), (39, 17)):
    g[y][x] = 'a'
o('bett', 37, 13, 1, 2, blockiert=True)
o('werkbank', 44, 13, 2, 1, blockiert=True)
o('tisch_rund', 40, 15, 2, 2, blockiert=True)
o('kiste', 46, 18, 1, 1, blockiert=True)
o('licht', 41, 16, 1, 1, radius=5, farbe='#ffd9a0', staerke=0.8)
raum(50, 14, 55, 19, ':')  # Schuppen
g[19][53] = 'T'
for x, y in ((51, 15), (54, 18)):
    g[y][x] = 'b'
o('kiste_klein', 54, 15, 1, 1, blockiert=True)
for y in range(19, 20):  # Gehweg vor den Türen
    for x in (40, 41, 42, 52, 53, 54):
        if g[y][x] == ',':
            g[y][x] = '-'

# --- See in der Mitte (leicht unregelmäßig); Wasser "~" ist nicht begehbar, aber man kann hier angeln ---
SEE_X, SEE_Y, SEE_RX, SEE_RY = 85, 60, 25, 14
wasser = []
for y in range(H):
    for x in range(B):
        dx = (x - SEE_X) / SEE_RX
        dy = (y - SEE_Y) / SEE_RY
        winkel = math.atan2(dy, dx)
        rand = 1 + 0.13 * math.sin(winkel * 3 + 1.0) + 0.08 * math.sin(winkel * 5 + 2.2)
        if dx * dx + dy * dy < rand * rand and (x, y) not in belegt:
            g[y][x] = '~'
            wasser.append((x, y))
for x, y in wasser:  # erst nach dem Füllen sperren (sonst blockieren sich die Wasserkacheln gegenseitig)
    sperre(x, y, x, y, rand=1)

# --- Angelhütte am Südufer (Tür zum See) ---
raum(72, 80, 81, 86, '+')
g[80][76] = 'T'
for x, y in ((72, 83), (81, 83)):
    g[y][x] = 'F'
for x, y in ((74, 83), (79, 84)):
    g[y][x] = 'c'
o('bett', 79, 82, 1, 2, blockiert=True)
o('kiste', 80, 85, 1, 1, blockiert=True)
o('licht', 76, 83, 1, 1, radius=4, farbe='#ffd9a0', staerke=0.7)
for y in range(76, 80):  # Trampelpfad zum Wasser
    if g[y][76] == ',':
        g[y][76] = '-'

# --- Geparkte Autos auf der Ringstraße (Front waagerecht = drehung 90/270, senkrecht = 0/180) ---
o('auto_rot', 60, 21, 5.5, 3, drehung=90, blockiert=True)
o('transporter', 108, 22, 5.5, 3, drehung=270, blockiert=True)
o('auto_blau', 62, 97, 5.5, 3, drehung=270, blockiert=True)
o('auto_gelb', 104, 98, 5.5, 3, drehung=90, blockiert=True)
o('auto_schwarz', 138, 58, 3, 5.5, drehung=0, blockiert=True)

# --- Zombies im Wald (nie auf Straße, in Gebäuden oder im See) ---
def frei(x, y, b, h, rand=0):
    for yy in range(y - rand, y + h + rand):
        for xx in range(x - rand, x + b + rand):
            if not (0 <= xx < B and 0 <= yy < H) or (xx, yy) in belegt:
                return False
    return True


zahl_zombies = 0
while zahl_zombies < 34:
    x, y = zufall.randint(3, B - 4), zufall.randint(3, H - 4)
    if not frei(x, y, 1, 1, 3) or g[y][x] != ',':
        continue
    g[y][x] = 'Z'
    sperre(x, y, x, y, rand=2)
    zahl_zombies += 1


# --- Bäume (3,5 × 3,5), Büsche, Steine, Eisenerz – zufällig, ohne Überlappung ---
def setze(typ, anzahl, b, h, rand, **extra):
    gesetzt = 0
    for _ in range(anzahl * 40):
        if gesetzt >= anzahl:
            break
        x = zufall.randint(1, int(B - b - 1))
        y = zufall.randint(1, int(H - h - 1))
        if not frei(x, y, int(b + 0.99), int(h + 0.99), rand):
            continue
        o(typ, x, y, b, h, **extra)
        sperre(x, y, x + int(b + 0.99) - 1, y + int(h + 0.99) - 1, rand=0)
        gesetzt += 1


setze('eisenerz', 40, 1, 1, 1, blockiert=True)
setze('stein', 36, 1, 1, 1, blockiert=True)
for _ in range(330):
    setze(zufall.choice(('baum', 'baum', 'baum_herbst')), 1, 3.5, 3.5, 0, ebene='oben')
setze('busch', 120, 1.5, 1.5, 0, ebene='oben')

zeilen = [''.join(z) for z in g]


def zahl(v):
    return str(int(v)) if float(v).is_integer() else str(v)


def js_objekt(e):
    teile = [f"typ: '{e['typ']}'"] + [f"{k}: {zahl(e[k])}" for k in ('x', 'y', 'b', 'h')]
    for k, v in e.items():
        if k in ('typ', 'x', 'y', 'b', 'h', 'blockiert'):
            continue
        teile.append(f"{k}: '{v}'" if isinstance(v, str) else f'{k}: {zahl(v)}')
    if e.get('blockiert'):
        teile.append('...M')
    return '{ ' + ', '.join(teile) + ' }'


js = ['''/**
 * Zone "Waldweg" – nördlich vom Stadtrand (erzeugt von werkzeuge/karten/waldweg.py, dort ändern!).
 * 160 × 120: Ringstraße mit geparkten Autos, Wald, See zum Angeln, Lichtung mit Försterhütte & Schuppen, Angelhütte.
 * Übergang: Südrand (Straße) ↔ Stadtrand Nordrand (Straße x 94–98). Legende wie stadtrand.js; ~ = Wasser (See).
 */
const M = { blockiert: true };

export const WALDWEG = {
  id: 'waldweg',
  name: 'Waldweg',
  kacheln: [''']
js += [f"    '{z}'," for z in zeilen]
js += ['  ],', '  raeume: {', "    a: { name: 'Försterhütte', lootTabelle: 'huette' },", "    b: { name: 'Schuppen', lootTabelle: 'werkstatt' },", "    c: { name: 'Angelhütte', lootTabelle: 'angler' },", '  },', '  objekte: [']
js += [f'    {js_objekt(e)},' for e in objekte]
js += ['  ],', '  uebergaenge: [', f"    {{ x: {WEST_X0}, y: {H - 1}, b: {STRASSE}, h: 1, ziel: 'stadtrand', ankunft: 'nord', name: 'Stadtrand (Süden)' }},", '  ],',
       '  ankuenfte: {', f'    sued: {{ x: {WEST_X0 + 2}, y: {H - 4} }}, // wer vom Stadtrand kommt', '  },', '};']
ZIEL.write_text('\n'.join(js) + '\n')
print(f'{ZIEL} geschrieben ({B} × {H}, {len(objekte)} Objekte, {len(wasser)} Wasserkacheln)')

"""
Generator für server/spiel/karten/waldweg.js – Zone "Waldweg" nördlich vom Stadtrand (Open-World-Beispiel).

    python3 werkzeuge/karten/waldweg.py

Wald mit Schotterpfad vom Südrand (Übergang zum Stadtrand) zu einer Lichtung mit Försterhütte und Schuppen,
viel Holz, Steine und reichlich Eisenerz. Zufall mit festem Startwert → gleiche Karte bei jedem Lauf.
Danach: npm test (prüft Erreichbarkeit, Überlappungen, Grafiken).
"""
import random
from pathlib import Path

ZIEL = Path(__file__).resolve().parents[2] / 'server' / 'spiel' / 'karten' / 'waldweg.js'
B, H = 64, 52
zufall = random.Random(20261016)
g = [[',' for _ in range(B)] for _ in range(H)]
objekte = []
belegt = set()  # Kacheln, auf die keine Bäume/Steine dürfen (Pfad, Gebäude, Abstand)


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


# --- Schotterpfad: vom Südrand (x 29–33) schlängelnd nach Norden zur Lichtung ---
pfad_x = 31
for y in range(H - 1, 21, -1):
    if y % 7 == 0:
        pfad_x += zufall.choice((-1, 1))
    for x in range(pfad_x - 1, pfad_x + 2):
        g[y][x] = '-'
    sperre(pfad_x - 1, y, pfad_x + 1, y, rand=1)
# Am Rand gerade, damit der Übergang sauber passt
for y in range(H - 4, H):
    for x in range(29, 34):
        g[y][x] = '-'
    sperre(29, y, 33, y, rand=1)

# --- Lichtung mit Försterhütte (Holzboden) und Schuppen (Beton) ---
for y in range(10, 24):
    for x in range(22, 50):
        belegt.add((x, y))
raum(34, 12, 45, 19, '+')  # Hütte
g[19][39] = 'T'  # Tür nach Süden
for x in (36, 43):
    g[12][x] = 'F'
g[15][34] = 'F'
g[15][45] = 'F'
g[14][36] = 'S'  # Startpunkt (nur nötig, falls die Zone mal Startzone wird)
for x, y in ((41, 14), (43, 17), (37, 17)):
    g[y][x] = 'a'
o('bett', 35, 13, 1, 2, blockiert=True)
o('werkbank', 42, 13, 2, 1, blockiert=True)
o('tisch_rund', 38, 15, 2, 2, blockiert=True)
o('kiste', 44, 18, 1, 1, blockiert=True)
o('licht', 39, 16, 1, 1, radius=5, farbe='#ffd9a0', staerke=0.8)
raum(24, 14, 29, 19, ':')  # Schuppen
g[19][27] = 'T'
for x, y in ((25, 15), (28, 18)):
    g[y][x] = 'b'
o('kiste_klein', 28, 15, 1, 1, blockiert=True)
# Pfad von der Lichtung zu den Türen
for y in range(20, 23):
    for x in range(26, 41):
        if g[y][x] == ',':
            g[y][x] = '-'

# --- Zombies im Wald ---
for x, y in ((10, 8), (54, 9), (8, 34), (55, 36), (20, 44), (46, 46)):
    g[y][x] = 'Z'
    sperre(x, y, x, y, rand=1)

# --- Bäume (3,5 × 3,5), Büsche, Steine, Eisenerz – zufällig, ohne Überlappung ---
def frei(x, y, b, h, rand=0):
    for yy in range(y - rand, y + h + rand):
        for xx in range(x - rand, x + b + rand):
            if not (0 <= xx < B and 0 <= yy < H) or (xx, yy) in belegt:
                return False
    return True


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


setze('eisenerz', 12, 1, 1, 1, blockiert=True)
setze('stein', 10, 1, 1, 1, blockiert=True)
for _ in range(60):
    setze(zufall.choice(('baum', 'baum', 'baum_herbst')), 1, 3.5, 3.5, 0, ebene='oben')
setze('busch', 25, 1.5, 1.5, 0, ebene='oben')

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
 * Wald mit Schotterpfad, Lichtung mit Försterhütte & Schuppen, viel Holz, Steine und Eisenerz.
 * Übergang: Südrand (Pfad) ↔ Stadtrand Nordrand (Straße x 94–98). Legende wie stadtrand.js.
 */
const M = { blockiert: true };

export const WALDWEG = {
  id: 'waldweg',
  name: 'Waldweg',
  kacheln: [''']
js += [f"    '{z}'," for z in zeilen]
js += ['  ],', '  raeume: {', "    a: { name: 'Försterhütte', lootTabelle: 'huette' },", "    b: { name: 'Schuppen', lootTabelle: 'werkstatt' },", '  },', '  objekte: [']
js += [f'    {js_objekt(e)},' for e in objekte]
js += ['  ],', '  uebergaenge: [', "    { x: 29, y: 51, b: 5, h: 1, ziel: 'stadtrand', ankunft: 'nord', name: 'Stadtrand (Süden)' },", '  ],',
       '  ankuenfte: {', '    sued: { x: 31, y: 48 }, // wer vom Stadtrand kommt', '  },', '};']
ZIEL.write_text('\n'.join(js) + '\n')
print(f'{ZIEL} geschrieben ({B} × {H}, {len(objekte)} Objekte)')
print('\n'.join(zeilen))

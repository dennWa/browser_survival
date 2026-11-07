"""
Generator für server/spiel/karten/lager.js – Zone "Lagerplatz" (Runde 42): kleiner, gemütlicher Startplatz für neue Charaktere.

    python3 werkzeuge/karten/lager.py

40 × 34 Kacheln: eine Waldlichtung mit einem Lagerfeuer in der Mitte (kartenfestes Bauwerk, `ewig` = brennt immer, auch bei
Regen), Bänken im Kreis ums Feuer, Lichterketten zwischen Holzpfosten (Kartenfeld `lichterketten` + `licht`-Objekte mit
`hoehe` für das echte Licht), einem langen Holztisch mit Bänken, zwei kleinen Tischen mit Stühlen, Zelten und Brennholz.
Auf allen Bänken/Stühlen kann man sitzen (Ä / ☰ Sitzen, gemeinsam/welt/sitze.js; Typ-Feld `sitz` = Sitzhöhe in m).
Keine Zombies, kein Loot – hier trifft man sich. Ausgang: Erdweg nach Osten → Stadtrand (Westrand, Ankunft `lager`).
Deko = Spielordner-Modelle (client/assets/eigene/*.glb) als Karten-`typen` sf_… (wie waldsee.py).
Zufall mit festem Startwert → gleiche Karte bei jedem Lauf. Danach: npm test.
"""
import json
import math
import random
import re
from pathlib import Path

WURZEL = Path(__file__).resolve().parents[2]
ZIEL = WURZEL / 'server' / 'spiel' / 'karten' / 'lager.js'
B, H = 40, 34
FX, FY = 20, 17                     # Lagerfeuer (Kachel); Mitte = (20.5, 17.5)
MX, MY = FX + 0.5, FY + 0.5
zufall = random.Random(20261108)
g = [[';' for _ in range(B)] for _ in range(H)]
objekte = []
belegt = set()     # Kacheln ohne Bäume/Büsche/Bodendeko


def drin(x, y):
    return 0 <= x < B and 0 <= y < H


def o(typ, x, y, b, h, **extra):
    objekte.append({'typ': typ, 'x': x, 'y': y, 'b': b, 'h': h, **extra})


def sperre_rund(cx, cy, r):
    for y in range(int(cy - r) - 1, int(cy + r) + 2):
        for x in range(int(cx - r) - 1, int(cx + r) + 2):
            if (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r:
                belegt.add((x, y))


# ---------------------------------------------------------------------------------------------------------------------
# Spielordner-Modelle (Deko) – wie waldsee.py, zusätzlich `sitz` (Sitzhöhe in m) für Bänke/Stühle
INDEX = {e['datei'][:-4]: e for e in json.loads((WURZEL / 'client' / 'assets' / 'eigene' / 'index.json').read_text(encoding='utf-8'))}
typen = {}


def typ_fuer(stem, hoehe=None, blockiert=False, sitz=None):
    e = INDEX[stem]
    m = e['masse']
    ziel = hoehe or e.get('zielHoehe') or m['hoehe']
    f = ziel / m['hoehe']
    eb, et = max(0.1, round(m['b'] * f, 2)), max(0.1, round(m['h'] * f, 2))
    typ_id = f"sf_{re.sub('[^a-z0-9]+', '_', stem)[:28]}_{round(ziel * 10)}{'_b' if blockiert else ''}"
    typen[typ_id] = {'name': e.get('name', stem), 'kategorie': 'Spielordner', 'b': eb, 'h': et, 'hoehe3d': round(ziel, 3), 'blockiert': blockiert,
                     'farbe': '#80c080', 'glbDatei': f'assets/eigene/{stem}.glb'}
    if sitz is not None:
        typen[typ_id]['sitz'] = sitz
    return typ_id, eb, et


def deko(stem, cx, cy, hoehe=None, drehung=0, blockiert=False, sitz=None):
    """Modell mit Mittelpunkt (cx, cy) in Kacheln. drehung 0 = Front Süd, 90 West, 180 Nord, 270 Ost."""
    typ_id, b, t = typ_fuer(stem, hoehe, blockiert, sitz)
    viertel = round(drehung / 90) % 4
    if viertel % 2 == 1:
        b, t = t, b
    extra = {'drehung': drehung} if drehung else {}
    if blockiert:
        extra['blockiert'] = True
    o(typ_id, round(cx - b / 2, 2), round(cy - t / 2, 2), b, t, **extra)
    sperre_rund(cx, cy, max(b, t) / 2 + 0.3)


def licht(cx, cy, hoehe, radius=4.0, farbe='#ffcf8a', staerke=0.7, flackern=False):
    """Echtes Licht (Lampen-Pool im Renderer) – Mittelpunkt (cx, cy), Höhe in m."""
    o('licht', round(cx - 0.5, 2), round(cy - 0.5, 2), 1, 1, radius=radius, farbe=farbe, staerke=staerke, flackern=flackern, hoehe=hoehe)


# ---------------------------------------------------------------------------------------------------------------------
# Boden: Lichtung (Gras) im Wald, festgetretene Erde ums Feuer, Erdwege
LX, LY = 12.5, 10.5   # Halbachsen der Lichtung
for y in range(H):
    for x in range(B):
        dx, dy = (x + 0.5 - MX) / LX, (y + 0.5 - MY) / LY
        w = math.atan2(dy, dx)
        rand = 1 + 0.07 * math.sin(w * 3 + 1.1) + 0.05 * math.sin(w * 5 + 0.3)
        d = dx * dx + dy * dy
        if d < rand * rand:
            g[y][x] = ','
        elif d < (rand + 0.25) ** 2 and zufall.random() < 0.5:
            g[y][x] = ','
# Wildwald-Flecken am Rand
for _ in range(8):
    cx, cy = zufall.choice([(zufall.randint(1, 8), zufall.randint(1, H - 2)), (zufall.randint(B - 8, B - 2), zufall.randint(1, H - 2)),
                            (zufall.randint(1, B - 2), zufall.randint(0, 4)), (zufall.randint(1, B - 2), zufall.randint(H - 5, H - 1))])
    r = zufall.uniform(2, 4)
    for y in range(int(cy - r), int(cy + r) + 1):
        for x in range(int(cx - r), int(cx + r) + 1):
            if drin(x, y) and g[y][x] == ';' and (x - cx) ** 2 + (y - cy) ** 2 < r * r:
                g[y][x] = '@'
# Erde ums Feuer (Radius ~3,6) – unregelmäßig
for y in range(FY - 5, FY + 6):
    for x in range(FX - 5, FX + 6):
        d = math.hypot(x + 0.5 - MX, y + 0.5 - MY)
        if d < 3.2 or (d < 4.0 and zufall.random() < 0.55):
            g[y][x] = '&'


def weg(punkte, breite=2):
    for (x0, y0), (x1, y1) in zip(punkte, punkte[1:]):
        n = int(max(abs(x1 - x0), abs(y1 - y0)) * 3) + 1
        for i in range(n + 1):
            t = i / n
            x = x0 + (x1 - x0) * t + math.sin(t * math.pi * 2 + x0) * 0.4
            y = y0 + (y1 - y0) * t + math.cos(t * math.pi * 2 + y0) * 0.4
            for dx in range(breite):
                for dy in range(breite):
                    xx, yy = int(round(x)) + dx - breite // 2, int(round(y)) + dy - breite // 2
                    if drin(xx, yy):
                        g[yy][xx] = '&'
                        belegt.add((xx, yy))


# Ausgang nach Osten (Stadtrand) + Trampelpfade zu Tisch, Zelten und Brennholz
weg([(23, 17.5), (30, 17.2), (35, 17.6), (B - 1, 17.5)], breite=3)
weg([(21, 15), (20, 11), (19.5, 8.5)])
weg([(17, 19), (13, 21)])
weg([(23, 19.5), (27, 21.5)])

# ---------------------------------------------------------------------------------------------------------------------
# Lagerfeuer (kartenfestes Bauwerk, brennt immer) + Steinkreis
bauwerke = [{'typ': 'lagerfeuer', 'tx': FX, 'ty': FY, 'ewig': True}]
sperre_rund(MX, MY, 2.2)

# Bänke im Kreis ums Feuer (Blick zum Feuer): Norden/Süden lange Bank, Osten/Westen Gartenbank mit Lehne, dazwischen Hocker
R = 3.0
deko('bench', MX, MY - R, hoehe=0.5, drehung=0, blockiert=True, sitz=0.42)            # Norden, Blick nach Süden
deko('bench', MX, MY + R, hoehe=0.5, drehung=180, blockiert=True, sitz=0.42)          # Süden, Blick nach Norden
deko('garden-bench', MX - R - 0.1, MY, hoehe=0.78, drehung=270, blockiert=True, sitz=0.44)  # Westen, Blick nach Osten
deko('garden-bench', MX + R + 0.1, MY, hoehe=0.78, drehung=90, blockiert=True, sitz=0.44)   # Osten, Blick nach Westen
for winkel in (45, 135, 225, 315):
    w = math.radians(winkel)
    hx, hy = MX + math.cos(w) * (R - 0.1), MY + math.sin(w) * (R - 0.1)
    # Blick zum Feuer: drehung so, dass sitzBlick = π/2 + drehung zum Feuer zeigt
    blick = math.degrees(math.atan2(MY - hy, MX - hx))
    deko('nk-stump-round-detailed', hx, hy, hoehe=0.42, drehung=round(blick - 90) % 360, blockiert=True, sitz=0.42)
deko('guitar2', MX + R + 0.75, MY - 0.95, hoehe=1.0, drehung=100)                     # Gitarre lehnt an der Ostbank

# ---------------------------------------------------------------------------------------------------------------------
# Lichterketten: Holzpfosten im Ring, Leinen von Pfosten zu Pfosten + zwei quer übers Feuer (wie auf dem Foto)
PFOSTEN = []
for i, winkel in enumerate((-100, -40, 20, 80, 140, 200)):
    w = math.radians(winkel)
    r = 7.6 + (0.6 if i % 2 else 0)
    PFOSTEN.append((round(MX + math.cos(w) * r * 1.12, 2), round(MY + math.sin(w) * r * 0.92, 2)))
for px, py in PFOSTEN:
    deko('post', px, py, hoehe=3.2, blockiert=True)
lichterketten = []
AUF = 3.0  # Aufhängehöhe (m)
for a, b in zip(PFOSTEN, PFOSTEN[1:] + PFOSTEN[:1]):
    lichterketten.append({'von': list(a), 'bis': list(b), 'hoehe': AUF, 'durchhang': 0.55})
lichterketten.append({'von': list(PFOSTEN[0]), 'bis': list(PFOSTEN[3]), 'hoehe': AUF, 'durchhang': 0.75})
lichterketten.append({'von': list(PFOSTEN[1]), 'bis': list(PFOSTEN[4]), 'hoehe': AUF, 'durchhang': 0.75})
# Echtes Licht: unter jeder Ring-Leine eins (Mitte, am tiefsten Punkt)
for a, b in zip(PFOSTEN, PFOSTEN[1:] + PFOSTEN[:1]):
    licht((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, hoehe=AUF - 0.55 - 0.15, radius=4.2, staerke=0.62)

# ---------------------------------------------------------------------------------------------------------------------
# Langer Holztisch im Südosten (wie die Kabeltrommel-Tische auf dem Foto) mit Bänken und Stühlen an den Enden
TX, TY = 29.0, 23.2
deko('table-big', TX, TY, hoehe=0.8, blockiert=True)
deko('bench', TX - 1.25, TY, hoehe=0.5, drehung=270, blockiert=True, sitz=0.42)   # Westseite, Blick nach Osten
deko('bench', TX + 1.25, TY, hoehe=0.5, drehung=90, blockiert=True, sitz=0.42)    # Ostseite, Blick nach Westen
deko('wooden-chair', TX, TY - 2.25, drehung=0, blockiert=True, sitz=0.46)          # Nordende
deko('wooden-chair', TX, TY + 2.25, drehung=180, blockiert=True, sitz=0.46)        # Südende
deko('table-lamp', TX + 0.1, TY - 0.6, hoehe=0.45)
licht(TX + 0.1, TY - 0.6, hoehe=1.2, radius=3.0, farbe='#ffc070', staerke=0.55, flackern=True)
deko('barrel-1', TX + 2.6, TY + 1.9, blockiert=True)
deko('crate-1', TX + 2.5, TY + 0.9, blockiert=True)

# Zwei kleine Tische mit je vier Stühlen im Südwesten
for cx, cy in ((11.4, 21.0), (14.6, 25.0)):
    deko('table-1', cx, cy, hoehe=0.72, blockiert=True)
    for dx, dy, dreh in ((0, -1.05, 0), (0, 1.05, 180), (-1.05, 0, 270), (1.05, 0, 90)):
        deko('wooden-chair', cx + dx, cy + dy, drehung=dreh, blockiert=True, sitz=0.46)
deko('candle-melted', 11.4, 21.0, hoehe=0.25)
licht(11.4, 21.0, hoehe=1.1, radius=2.6, farbe='#ffb060', staerke=0.45, flackern=True)

# ---------------------------------------------------------------------------------------------------------------------
# Zelte im Norden, Holzgestell, Brennholz im Nordosten
deko('tent', 12.0, 9.0, hoehe=2.2, drehung=20, blockiert=True)
deko('nk-tent-detailed-open', 19.6, 6.6, hoehe=1.8, drehung=0, blockiert=True)
deko('nk-tent-detailed-open', 27.6, 8.6, hoehe=1.7, drehung=335, blockiert=True)
deko('wood-tent-1', 31.6, 12.4, hoehe=1.3, drehung=90, blockiert=True)            # Holzgestell (Trockengestell)
deko('nk-log-stack-large', 33.2, 15.0, drehung=90, blockiert=True)
deko('nk-log-stack-large', 31.4, 27.4, drehung=0, blockiert=True)
deko('nk-log-stack', 33.0, 26.6, drehung=90, blockiert=True)
deko('nk-campfire-stones', MX, MY, hoehe=0.24)
deko('crate', 8.0, 14.6, hoehe=0.7, drehung=15, blockiert=True)
deko('barrel', 9.0, 13.7, hoehe=1.0, blockiert=True)

# Fackeln am Eingang (Osten) + Wegweiser
for fy in (15.8, 19.4):
    deko('wooden-torch', 33.6, fy, hoehe=2.3, blockiert=True)
    licht(33.6, fy, hoehe=2.2, radius=3.2, farbe='#ff9a40', staerke=0.6, flackern=True)
deko('wooden-sign', 35.4, 15.4, blockiert=True)

# Spieler-Starts (neue Charaktere) im Kreis um die Feuerstelle, außerhalb der Bänke
STARTS = [(15, 17), (25, 17), (20, 23), (20, 12), (16, 13), (24, 13)]
for sx, sy in STARTS:
    belegt.add((sx, sy))

# ---------------------------------------------------------------------------------------------------------------------
# Wald drumherum: Bäume (fällbar), Büsche am Lichtungsrand, Bodendeko
def frei(x, y, b, h):
    for yy in range(y, y + h):
        for xx in range(x, x + b):
            if not drin(xx, yy) or (xx, yy) in belegt or g[yy][xx] not in ';@,':
                return False
    return True


def lichtung(x, y):
    return ((x + 0.5 - MX) / (LX - 0.5)) ** 2 + ((y + 0.5 - MY) / (LY - 0.5)) ** 2 < 1


baeume = 0
versuche = 0
while baeume < 120 and versuche < 20000:
    versuche += 1
    x, y = zufall.randint(0, B - 3), zufall.randint(0, H - 3)
    if any(lichtung(xx, yy) for xx in (x, x + 2) for yy in (y, y + 2)) or not frei(x, y, min(4, B - x), min(4, H - y)):
        continue
    o('baum_herbst' if zufall.random() < 0.1 else 'baum', x, y, 3.5, 3.5, ebene='oben')
    for yy in range(y, y + 4):
        for xx in range(x, x + 4):
            belegt.add((xx, yy))
    baeume += 1
buesche = 0
versuche = 0
while buesche < 26 and versuche < 6000:
    versuche += 1
    x, y = zufall.randint(1, B - 3), zufall.randint(1, H - 3)
    rand_d = ((x + 0.5 - MX) / LX) ** 2 + ((y + 0.5 - MY) / LY) ** 2
    if not 0.8 < rand_d < 1.35 or not frei(x, y, 2, 2):
        continue
    o('busch', x, y, 1.5, 1.5, ebene='oben')
    for yy in range(y, y + 2):
        for xx in range(x, x + 2):
            belegt.add((xx, yy))
    buesche += 1
# Blumen, Grasbüschel, Pilze
for stem, anzahl, wo in (('nk-flower-yellow-a', 10, ','), ('nk-flower-purple-a', 7, ','), ('nk-flower-red-a', 5, ','),
                         ('nk-mushroom-red-group', 6, ';@'), ('nk-mushroom-tan-group', 6, ';@'), ('fern', 12, ';@')):
    n = v = 0
    while n < anzahl and v < 3000:
        v += 1
        x, y = zufall.randint(2, B - 3), zufall.randint(2, H - 3)
        if (x, y) in belegt or g[y][x] not in wo:
            continue
        deko(stem, x + zufall.uniform(0.2, 0.8), y + zufall.uniform(0.2, 0.8), drehung=zufall.randrange(0, 360, 30))
        n += 1

for sx, sy in STARTS:
    assert g[sy][sx] in ',&;@', (sx, sy, g[sy][sx])
    g[sy][sx] = 'S'
zeilen = [''.join(z) for z in g]


# ---------------------------------------------------------------------------------------------------------------------
def zahl(v):
    return str(int(v)) if float(v).is_integer() else str(round(v, 2))


def js_wert(v):
    if isinstance(v, bool):
        return 'true' if v else 'false'
    if isinstance(v, str):
        return f"'{v}'"
    if isinstance(v, list):
        return '[' + ', '.join(js_wert(x) for x in v) + ']'
    return zahl(v)


def js_objekt(e):
    teile = [f"typ: '{e['typ']}'"] + [f"{k}: {zahl(e[k])}" for k in ('x', 'y', 'b', 'h')]
    for k, v in e.items():
        if k in ('typ', 'x', 'y', 'b', 'h', 'blockiert'):
            continue
        teile.append(f'{k}: {js_wert(v)}')
    if e.get('blockiert'):
        teile.append('...M')
    return '{ ' + ', '.join(teile) + ' }'


def js_flach(d):
    return '{ ' + ', '.join(f'{k}: {js_wert(v)}' for k, v in d.items()) + ' }'


js = ['''/**
 * Zone "Lagerplatz" – gemütlicher Startplatz für neue Charaktere (erzeugt von werkzeuge/karten/lager.py, dort ändern!).
 * 40 × 34: Waldlichtung, Lagerfeuer in der Mitte (Bauwerk `ewig` = brennt immer), Bänke im Kreis, Lichterketten zwischen
 * Holzpfosten (`lichterketten` + `licht` mit `hoehe`), langer Holztisch, zwei Tische mit Stühlen, Zelte, Brennholz.
 * Sitzen auf Bänken/Stühlen: Ä bzw. ☰ Sitzen (gemeinsam/welt/sitze.js, Typ-Feld `sitz`). Keine Zombies, kein Loot.
 * Übergang: Ostrand (Erdweg) ↔ Stadtrand Westrand (Ankunft `lager`). Neue Charaktere starten hier
 * (konfiguration.welt.ankunftsKarte, spielServer). Legende wie stadtrand.js.
 */
const M = { blockiert: true };

export const LAGER = {
  id: 'lager',
  name: 'Lagerplatz',
  kacheln: [''']
js += [f"    '{z}'," for z in zeilen]
js += ['  ],', '  raeume: {},', '  einstellungen: {',
       '    wetter: { regenAnteil: 0.15, dauerMin: 40, dauerMax: 120, pauseMin: 400, pauseMax: 900 },',
       '  },',
       '  bauwerke: [']
js += [f'    {js_flach(b)},' for b in bauwerke]
js += ['  ],', '  lichterketten: [']
js += [f'    {js_flach(k)},' for k in lichterketten]
js += ['  ],', '  objekte: [']
js += [f'    {js_objekt(e)},' for e in objekte]
js += ['  ],', '  // Spielordner-Modelle (nur Anzeige; Kollision über blockiert am Objekt; sitz = Sitzhöhe in m)', '  typen: {']
for k, v in typen.items():
    sitz = f", sitz: {zahl(v['sitz'])}" if 'sitz' in v else ''
    js.append(f"    {k}: {{ name: '{v['name']}', kategorie: '{v['kategorie']}', b: {zahl(v['b'])}, h: {zahl(v['h'])}, hoehe3d: {zahl(v['hoehe3d'])}, blockiert: {'true' if v['blockiert'] else 'false'}, farbe: '{v['farbe']}', glbDatei: '{v['glbDatei']}'{sitz} }},")
js += ['  },', '  uebergaenge: [',
       f"    {{ x: {B - 1}, y: 15, b: 1, h: 5, ziel: 'stadtrand', ankunft: 'lager', name: 'Stadtrand (Osten)' }},",
       '  ],', '  ankuenfte: {', f'    ost: {{ x: {B - 5}, y: 17 }}, // wer vom Stadtrand kommt (Erdweg, nicht im Übergang)', '  },', '};']
ZIEL.write_text('\n'.join(js) + '\n', encoding='utf-8')
print(f'{ZIEL} geschrieben ({B} × {H}, {len(objekte)} Objekte, {baeume} Bäume, {buesche} Büsche, {len(typen)} Modell-Typen, '
      f'{len(lichterketten)} Lichterketten, {sum(1 for e in objekte if e["typ"] == "licht")} Lichter)')

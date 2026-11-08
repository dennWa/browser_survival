"""
Generator für server/spiel/karten/lager.js – Zone "Lagerplatz" (Runde 42/43): kleiner, gemütlicher Startplatz für neue Charaktere.

    python3 werkzeuge/karten/lager.py

Runde 43: ein Holzzaun (wooden-fence) umschließt den Platz, draußen nur Rasen + Bäume (8 Kacheln Ring); Tor im Osten mit
Fackeln.
Runde 44: hohe Palisade (lg-palisade, Rundhölzer) statt Zaun, geschlossenes Palisadentor im Osten – wer 5 s davor steht, reist
zum Stadtrand (Übergang innen vor dem Tor, Countdown wie alle Übergänge). Wald-Ring RING Kacheln breit (man sieht beim
Rauszoomen kein Kartenende). Neue Zelte (lg-zelt*), Gartenbänke rundum, Buffet auf den Tischen (spawnpunkte `buffet`: Essen/
Trinken kommt nach ~10 s wieder), Teller/Krüge mit Objekt-Feld `z` (Höhe in m), Grasbüschel (gp-gras-*), Steine (sp-*),
ein paar Bäume im Lager. Blumen = Natur-Streuung (client/darstellung/naturKonfiguration.js ZONEN.lager).
Zonen-Felder `friedlich` (niemand nimmt Schaden, Hunger/Durst/Kälte pausieren) und `festeZeit` (Licht/Himmel immer
Sonnenuntergang; Server-Uhr läuft normal weiter). Gartenbänke: Modell-Front ist hinten → drehung +180 (sitze.js MODELL_FRONT).
Gebaut wird im „Innen-Raum“ (alte 40×34-Koordinaten), am Ende um (SX, SY) verschoben und mit dem Rasenring umgeben.
Runde 44: späte Dämmerung (festeZeit 20.75), Wetter aus + windstill, keine Hasen (einstellungen), Lager-Katze (Kartenfeld `tiere`),
geparktes Auto (Deko), zwei große Bäume (tree-3/tree-2, Stamm = unsichtbares `hang`-Hindernis), Kerze auf jedem Tisch und die
Tischlampe auf der Platte (Objektfeld `z` in m).

Innen: ein Lagerfeuer in der Mitte (kartenfestes Bauwerk, `ewig` = brennt immer, auch bei
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
g = [[',' for _ in range(B)] for _ in range(H)]   # Innen-Raum (wird am Ende verschoben)
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


def deko(stem, cx, cy, hoehe=None, drehung=0, blockiert=False, sitz=None, z=None, sperre=True):
    """Modell mit Mittelpunkt (cx, cy) in Kacheln. drehung 0 = Front Süd, 90 West, 180 Nord, 270 Ost. z = Aufstellhöhe (m)."""
    typ_id, b, t = typ_fuer(stem, hoehe, blockiert, sitz)
    viertel = round(drehung / 90) % 4
    if viertel % 2 == 1:
        b, t = t, b
    extra = {'drehung': drehung} if drehung else {}
    if z:
        extra['z'] = z
    if blockiert:
        extra['blockiert'] = True
    o(typ_id, round(cx - b / 2, 2), round(cy - t / 2, 2), b, t, **extra)
    if sperre:
        sperre_rund(cx, cy, max(b, t) / 2 + 0.3)


def licht(cx, cy, hoehe, radius=4.0, farbe='#ffcf8a', staerke=0.7, flackern=False):
    """Echtes Licht (Lampen-Pool im Renderer) – Mittelpunkt (cx, cy), Höhe in m."""
    o('licht', round(cx - 0.5, 2), round(cy - 0.5, 2), 1, 1, radius=radius, farbe=farbe, staerke=staerke, flackern=flackern, hoehe=hoehe)


# ---------------------------------------------------------------------------------------------------------------------
# Zaun (Innen-Raum-Koordinaten): Rechteck ZX0..ZX1 × ZY0..ZY1 (Kachelreihen), Tor im Osten (Reihen TOR)
ZX0, ZX1, ZY0, ZY1 = 5, 37, 3, 31
TOR = (16, 17, 18)
RING = 30                                  # Runde 44: Rasen + Wald außerhalb der Palisade (breit → kein Kartenende beim Rauszoomen)
SX, SY = RING - ZX0, RING - ZY0            # Verschiebung Innen-Raum → Karte
B2, H2 = ZX1 + SX + 1 + RING, ZY1 + SY + 1 + RING


def im_zaun(x, y):
    return ZX0 < x < ZX1 and ZY0 < y < ZY1


# Boden innen: Gras, festgetretene Erde ums Feuer (Radius ~3,6, unregelmäßig), Trampelpfade
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
                    if drin(xx, yy) and im_zaun(xx, yy):
                        g[yy][xx] = '&'
                        belegt.add((xx, yy))


# Weg zum Tor (Osten) + Trampelpfade zu Zelten und Tischen
weg([(23, 17.5), (30, 17.2), (ZX1 - 1, 17.5)], breite=3)
weg([(21, 15), (20, 11), (19.5, 8.5)])
weg([(17, 19), (13, 21)])
weg([(23, 19.5), (27, 21.5)])

# ---------------------------------------------------------------------------------------------------------------------
# Lagerfeuer (kartenfestes Bauwerk, brennt immer) + Steinkreis
bauwerke = [{'typ': 'lagerfeuer', 'tx': FX, 'ty': FY, 'ewig': True}]
sperre_rund(MX, MY, 2.2)

# Bänke im Kreis ums Feuer – ALLE mit Blick zum Feuer: Norden/Süden lange Bank (ohne Lehne), Osten/Westen Gartenbank mit Lehne
# (⚠ Gartenbank-Modell: Front zeigt nach hinten → drehung +180, die Sitzrichtung korrigiert sitze.js MODELL_FRONT), dazwischen Stümpfe
R = 3.0
# Runde 44: auch Norden/Süden die hellen Gartenbänke (vorher dunkle Bank ohne Lehne)
deko('garden-bench', MX, MY - R - 0.1, hoehe=0.78, drehung=180, blockiert=True, sitz=0.44)  # Norden, Lehne im Norden, Blick nach Süden
deko('garden-bench', MX, MY + R + 0.1, hoehe=0.78, drehung=0, blockiert=True, sitz=0.44)    # Süden, Lehne im Süden, Blick nach Norden
deko('garden-bench', MX - R - 0.1, MY, hoehe=0.78, drehung=90, blockiert=True, sitz=0.44)   # Westen, Lehne im Westen, Blick nach Osten
deko('garden-bench', MX + R + 0.1, MY, hoehe=0.78, drehung=270, blockiert=True, sitz=0.44)  # Osten, Lehne im Osten, Blick nach Westen
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
# Langer Holztisch im Südosten mit Bänken und Stühlen an den Enden (Stühle mit Blick zum Tisch)
TX, TY = 29.0, 23.2
deko('table-big', TX, TY, hoehe=0.8, blockiert=True)
# Runde 44: Tischbänke nicht blockierend – man tritt an den Tisch heran und greift ans Buffet
deko('bench', TX - 1.25, TY, hoehe=0.5, drehung=270, sitz=0.42)   # Westseite, Blick nach Osten
deko('bench', TX + 1.25, TY, hoehe=0.5, drehung=90, sitz=0.42)    # Ostseite, Blick nach Westen
deko('wooden-chair', TX, TY - 2.25, drehung=0, blockiert=True, sitz=0.46)          # Nordende
deko('wooden-chair', TX, TY + 2.25, drehung=180, blockiert=True, sitz=0.46)        # Südende
deko('table-lamp', TX + 0.1, TY - 0.6, hoehe=0.45, z=0.8, sperre=False)
licht(TX + 0.1, TY - 0.6, hoehe=1.2, radius=3.0, farbe='#ffc070', staerke=0.55, flackern=True)
# Runde 44 (2): Kerze auf jeden Tisch (Gemütlichkeit) – auf der Platte (z), neben dem Buffet; Licht knapp über der Flamme
deko('candle-melted', TX + 0.55, TY + 0.25, hoehe=0.22, z=0.8, sperre=False)
licht(TX + 0.55, TY + 0.25, hoehe=1.15, radius=2.4, farbe='#ffb060', staerke=0.42, flackern=True)
deko('barrel-1', TX + 2.6, TY + 1.9, blockiert=True)
deko('crate-1', TX + 2.5, TY + 0.9, blockiert=True)

# Zwei kleine Tische mit je vier Stühlen im Südwesten
for cx, cy in ((11.4, 21.0), (14.6, 25.0)):
    deko('table-1', cx, cy, hoehe=0.72, blockiert=True)
    for dx, dy, dreh in ((0, -1.05, 0), (0, 1.05, 180), (-1.05, 0, 270), (1.05, 0, 90)):
        deko('wooden-chair', cx + dx, cy + dy, drehung=dreh, blockiert=True, sitz=0.46)
    deko('candle-melted', cx + 0.2, cy + 0.25, hoehe=0.22, z=0.72, sperre=False)   # Runde 44 (2): auf jedem Tisch eine Kerze
    licht(cx + 0.2, cy + 0.25, hoehe=1.05, radius=2.6, farbe='#ffb060', staerke=0.45, flackern=True)

# ---------------------------------------------------------------------------------------------------------------------
# Runde 44: Buffet – Essen/Trinken auf den Tischen (Spawnpunkte `buffet`: kommt ~10 s nach dem Nehmen wieder, auch wenn
# Leute daneben stehen). Dazu Teller/Krüge/Flaschen als Deko (Objekt-Feld z = Tischhöhe).
spawnpunkte = []


def buffet(x, y, inhalt, hoehe, menge=None):
    p = {'x': round(x, 2), 'y': round(y, 2), 'inhalt': inhalt, 'chance': 100, 'intervall': round(10 / 60, 4), 'hoehe': hoehe, 'buffet': True}
    if menge:
        p['menge'] = menge
    spawnpunkte.append(p)


LANG = 0.8  # Höhe table-big (m)
for dy, inhalt in ((-1.45, 'brot'), (-0.85, 'kaese'), (-0.25, 'fleisch_gebraten'), (0.35, 'pfannkuchen'), (0.95, 'apfel'), (1.5, 'erdbeere')):
    buffet(TX - 0.18, TY + dy, inhalt, LANG)
for dy, inhalt in ((-1.2, 'milch'), (-0.3, 'wasserflasche'), (0.6, 'kaffee'), (1.35, 'energydrink')):
    buffet(TX + 0.22, TY + dy, inhalt, LANG)
for dy in (-1.1, 0.0, 1.1):
    deko('plate', TX - 0.2, TY + dy + 0.3, hoehe=0.03, z=LANG, sperre=False)
deko('glass-cup', TX + 0.25, TY - 0.75, hoehe=0.12, z=LANG, sperre=False)
deko('bottle', TX + 0.3, TY + 0.15, hoehe=0.3, z=LANG, sperre=False)
deko('coffee-cup', TX + 0.2, TY + 1.0, hoehe=0.1, z=LANG, sperre=False)
for (cx, cy), (essen, trinken) in zip(((11.4, 21.0), (14.6, 25.0)), (('sandwich', 'wasserflasche'), ('broetchen', 'milch'))):
    buffet(cx - 0.22, cy + 0.15, essen, 0.72)
    buffet(cx + 0.24, cy - 0.12, trinken, 0.72)
    deko('plate', cx - 0.22, cy + 0.15, hoehe=0.03, z=0.72, sperre=False)
deko('tea-cup', 14.6 + 0.05, 25.0 - 0.3, hoehe=0.1, z=0.72, sperre=False)

# ---------------------------------------------------------------------------------------------------------------------
# Zelte im Norden, Holzgestell, Brennholz
# Runde 44: eigene Firstzelte mit Leinwand-Textur (werkzeuge/assets/r44/baue_lager_modelle_r44.py), Eingang nach Süden
deko('lg-zelt-gruen', 12.0, 9.0, drehung=20, blockiert=True)
deko('lg-zelt', 19.6, 6.6, drehung=0, blockiert=True)
deko('lg-zelt', 27.6, 8.6, drehung=335, blockiert=True)
deko('wood-tent-1', 31.6, 12.4, hoehe=1.3, drehung=90, blockiert=True)            # Holzgestell (Trockengestell)
deko('nk-log-stack-large', 33.2, 14.0, drehung=90, blockiert=True)
deko('nk-log-stack-large', 31.4, 27.4, drehung=0, blockiert=True)
deko('nk-log-stack', 33.0, 26.6, drehung=90, blockiert=True)
deko('nk-campfire-stones', MX, MY, hoehe=0.24)
deko('crate', 8.0, 14.6, hoehe=0.7, drehung=15, blockiert=True)

# Runde 44: geparktes Auto (Deko, nicht fahrbar) im Nordosten neben dem Holzgestell, Schnauze Richtung Tor
deko('car', 33.6, 7.4, drehung=270, blockiert=True)
deko('cardboard-boxes', 30.4, 6.0, drehung=20, blockiert=True)

# Runde 44: zwei große Bäume im Lager (nur der Stamm blockiert – unsichtbares Hindernis darunter)
for stem, bx, by, bh, dreh in (('tree-3', 8.6, 6.6, 12.0, 30), ('tree-2', 24.4, 28.2, 11.0, 200)):
    deko(stem, bx, by, hoehe=bh, drehung=dreh)
    o('hang', int(bx), int(by), 1, 1, ebene='unsichtbar', blockiert=True)
    sperre_rund(bx, by, 1.6)
deko('barrel', 9.0, 13.7, hoehe=1.0, blockiert=True)

# Tor im Osten: Fackeln links/rechts innen am Zaun, Wegweiser
for fy in (TOR[0] - 0.5, TOR[-1] + 1.5):
    deko('wooden-torch', ZX1 - 0.6, fy, hoehe=2.3, blockiert=True)
    licht(ZX1 - 0.6, fy, hoehe=2.2, radius=3.2, farbe='#ff9a40', staerke=0.6, flackern=True)
deko('wooden-sign', ZX1 - 1.6, TOR[0] - 1.6, blockiert=True)

# Runde 44: Lager-Katze startet am Feuer (Südwestseite, frei begehbar)
KATZE = (FX - 2, FY + 2)

# Spieler-Starts (neue Charaktere) im Kreis um die Feuerstelle, außerhalb der Bänke
STARTS = [(15, 17), (25, 17), (20, 23), (20, 12), (16, 13), (24, 13)]
for sx, sy in STARTS:
    belegt.add((sx, sy))

# Büsche innen am Zaun entlang, Blumen im Gras
def frei(x, y, b, h):
    for yy in range(y, y + h):
        for xx in range(x, x + b):
            if not drin(xx, yy) or (xx, yy) in belegt or g[yy][xx] != ',' or not im_zaun(xx, yy):
                return False
    return True


buesche = 0
versuche = 0
while buesche < 14 and versuche < 6000:
    versuche += 1
    x, y = zufall.randint(ZX0 + 1, ZX1 - 2), zufall.randint(ZY0 + 1, ZY1 - 2)
    am_zaun = x <= ZX0 + 1 or x >= ZX1 - 2 or y <= ZY0 + 1 or y >= ZY1 - 2
    if not am_zaun or abs(y - 17) < 4 and x > ZX1 - 4 or not frei(x, y, 2, 2):
        continue
    o('busch', x, y, 1.5, 1.5, ebene='oben')
    for yy in range(y - 1, y + 3):
        for xx in range(x - 1, x + 3):
            belegt.add((xx, yy))
    buesche += 1
# Runde 44: ein paar Bäume im Lager (gemütlich), Steine (Stone Pack) und Grasbüschel (Grass patches) statt Kenney-Blumen –
# Blumen kommen aus der Natur-Streuung (naturKonfiguration ZONEN.lager)
for bx, by in ((7.2, 26.0), (33.0, 5.6), (7.0, 5.4), (24.5, 28.2)):
    if all((xx, yy) not in belegt for xx in range(int(bx), int(bx) + 3) for yy in range(int(by), int(by) + 3)):
        o('baum', bx, by, 3.0, 3.0, ebene='oben')
        sperre_rund(bx + 1.5, by + 1.5, 2.0)
for stem, cx, cy, dreh in (('sp-fels-2', 7.4, 29.0, 30), ('sp-stein-3', 9.6, 29.4, 80), ('sp-stein-1', 34.6, 29.0, 200), ('sp-fels-4', 35.0, 4.8, 120),
                           ('sp-stein-6', 33.6, 6.6, 10), ('sp-stein-5', 6.4, 9.8, 300), ('sp-runenstein-5', ZX1 - 2.0, TOR[0] - 2.4, 270),
                           ('sp-runenstein-6', ZX1 - 2.0, TOR[-1] + 3.2, 270), ('sp-stein-8', 16.4, 4.6, 45)):
    if (int(cx), int(cy)) not in belegt:
        deko(stem, cx, cy, drehung=dreh, blockiert=True)
gras = v = 0
while gras < 22 and v < 4000:
    v += 1
    x, y = zufall.randint(ZX0 + 1, ZX1 - 2), zufall.randint(ZY0 + 1, ZY1 - 2)
    if (x, y) in belegt or g[y][x] != ',':
        continue
    deko(f'gp-gras-{zufall.randint(1, 3)}', x + 0.5, y + 0.5, drehung=zufall.randrange(0, 360, 15), sperre=False)
    belegt.add((x, y))
    gras += 1
# Blumen (Poly Haven, CC0) in kleinen Gruppen – echte Modelle statt Kenney-Würfelblumen
BLUMEN = ['ph-blume-empodium-a', 'ph-blume-empodium-b', 'ph-blume-empodium-c', 'ph-blume-gazania-d', 'ph-blume-gazania-e',
          'ph-blume-gazania-f', 'ph-blume-gazania-g', 'ph-blume-gazania-h']
gruppen = v = 0
while gruppen < 13 and v < 4000:
    v += 1
    x, y = zufall.randint(ZX0 + 1, ZX1 - 2), zufall.randint(ZY0 + 1, ZY1 - 2)
    if (x, y) in belegt or g[y][x] != ',':
        continue
    art = zufall.choice(BLUMEN[:3]) if zufall.random() < 0.45 else zufall.choice(BLUMEN[3:])
    for _ in range(zufall.randint(3, 5)):
        deko(art, x + zufall.uniform(0.1, 0.9), y + zufall.uniform(0.1, 0.9), drehung=zufall.randrange(0, 360, 20), sperre=False)
    belegt.add((x, y))
    gruppen += 1

for sx, sy in STARTS:
    assert g[sy][sx] in ',&', (sx, sy, g[sy][sx])
    g[sy][sx] = 'S'

# ---------------------------------------------------------------------------------------------------------------------
# Verschieben: Innen-Raum → Karte (B2 × H2) mit Rasenring
def schiebe(x, y):
    return round(x + SX, 2), round(y + SY, 2)


for e in objekte:
    e['x'], e['y'] = schiebe(e['x'], e['y'])
for b in bauwerke:
    b['tx'], b['ty'] = b['tx'] + SX, b['ty'] + SY
for k in lichterketten:
    k['von'], k['bis'] = list(schiebe(*k['von'])), list(schiebe(*k['bis']))
for p in spawnpunkte:
    p['x'], p['y'] = schiebe(p['x'], p['y'])
innen_g = g
B, H = B2, H2
g = [[',' for _ in range(B)] for _ in range(H)]
for y in range(len(innen_g)):
    for x in range(len(innen_g[0])):
        if im_zaun(x, y):
            g[y + SY][x + SX] = innen_g[y][x]

# Holzzaun (blockiert, je Segment 1,8 m, mittig auf der Zaun-Kachelreihe → genau eine Reihe gesperrt)
zx0, zx1, zy0, zy1 = ZX0 + SX, ZX1 + SX, ZY0 + SY, ZY1 + SY
tor = {t + SY for t in TOR}
zaun = 0


PALISADE = 3.6  # Segmentbreite (m) von lg-palisade


def zaun_strecke(a, b, fest, waagerecht, drehung):
    """Palisaden-Segmente von Kachel a bis b (inkl.) entlang der Reihe/Spalte `fest`. Querbalken (Modell -z) zeigen nach innen:
    Norden 180, Süden 0, Westen 90, Osten 270."""
    global zaun
    laenge = b - a + 1
    n = max(1, math.ceil(laenge / PALISADE))
    schritt = laenge / n
    for i in range(n):
        m = a + schritt * (i + 0.5)
        if waagerecht:
            deko('lg-palisade', m, fest + 0.5, drehung=drehung, blockiert=True)
        else:
            deko('lg-palisade', fest + 0.5, m, drehung=drehung, blockiert=True)
        zaun += 1


zaun_strecke(zx0, zx1, zy0, True, 180)
zaun_strecke(zx0, zx1, zy1, True, 0)
zaun_strecke(zy0 + 1, zy1 - 1, zx0, False, 90)
zaun_strecke(zy0 + 1, min(tor) - 1, zx1, False, 270)
zaun_strecke(max(tor) + 1, zy1 - 1, zx1, False, 270)
# Geschlossenes Tor (blockiert) – davor innen der Übergang zum Stadtrand (5 s warten)
deko('lg-palisadentor', zx1 + 0.5, (min(tor) + max(tor) + 1) / 2, drehung=270, blockiert=True)

# Draußen: nur Rasen und Bäume (Gang vom Tor zum Ostrand bleibt frei)
belegt = set()
for y in range(zy0 - 2, zy1 + 3):   # Rasenstreifen direkt am Zaun bleibt frei
    for x in range(zx0 - 2, zx1 + 3):
        belegt.add((x, y))
baeume = 0
versuche = 0
gesetzt = []
RASTER = [(gx + zufall.uniform(-0.15, 0.15), gy + zufall.uniform(-0.15, 0.15)) for gy in [i * 3.55 for i in range(int(H / 3.55) + 1)] for gx in [i * 3.55 for i in range(int(B / 3.55) + 1)]]
for x, y in RASTER:   # dichter Waldrand auf einem leicht verwackelten Raster (Lücken lässt der Zufall)
    x, y = round(min(max(0, x), B - 3.5), 2), round(min(max(0, y), H - 3.5), 2)
    if zufall.random() < 0.06:
        continue
    if any((xx, yy) in belegt for xx in range(int(x), math.ceil(x + 3.5)) for yy in range(int(y), math.ceil(y + 3.5))):
        continue
    if any(x < a + 3.5 and a < x + 3.5 and y < b + 3.5 and b < y + 3.5 for a, b in gesetzt):
        continue
    gesetzt.append((x, y))
    o('baum_herbst' if zufall.random() < 0.12 else 'baum', x, y, 3.5, 3.5, ebene='oben')
    baeume += 1
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
 * Runde 43: Holzzaun rundherum, draußen nur Rasen + Bäume; `friedlich` (kein Schaden) + `festeZeit` (feste Abendstimmung).
 * Runde 44: späte Dämmerung, immer klar + windstill, keine Hasen, Lager-Katze (`tiere`), Auto, große Bäume, Kerze je Tisch.
 * Lagerfeuer in der Mitte (Bauwerk `ewig` = brennt immer), Bänke im Kreis, Lichterketten zwischen
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
js += ['  ],', '  raeume: {},',
       '  friedlich: true, // Runde 43: niemand nimmt Schaden, Hunger/Durst/Kälte pausieren',
       '  festeZeit: 20.75, // Runde 44: späte Dämmerung, fast Nacht (Runde 43: 20.45 Sonnenuntergang); Server-Uhr läuft normal',
       '  einstellungen: {',
       '    wetter: { aktiv: false, windstill: true }, // Runde 44: immer klar, kein Wind (Ton/Bäume/Blätter still)',
       '    tiere: { hasenMax: 0 }, // Runde 44: keine Kaninchen im Lager',
       '  },',
       f"  tiere: [{{ art: 'katze', x: {KATZE[0] + SX}, y: {KATZE[1] + SY} }}], // Runde 44: streunende Lager-Katze (startTiere, haustierSystem)",
       '  bauwerke: [']
js += [f'    {js_flach(b)},' for b in bauwerke]
js += ['  ],', '  // Runde 44: Buffet (Essen/Trinken auf den Tischen, kommt nach ~10 s wieder)', '  spawnpunkte: [']
js += [f'    {js_flach(p)},' for p in spawnpunkte]
js += ['  ],', '  lichterketten: [']
js += [f'    {js_flach(k)},' for k in lichterketten]
js += ['  ],', '  objekte: [']
js += [f'    {js_objekt(e)},' for e in objekte]
js += ['  ],', '  // Spielordner-Modelle (nur Anzeige; Kollision über blockiert am Objekt; sitz = Sitzhöhe in m)', '  typen: {']
for k, v in typen.items():
    sitz = f", sitz: {zahl(v['sitz'])}" if 'sitz' in v else ''
    js.append(f"    {k}: {{ name: '{v['name']}', kategorie: '{v['kategorie']}', b: {zahl(v['b'])}, h: {zahl(v['h'])}, hoehe3d: {zahl(v['hoehe3d'])}, blockiert: {'true' if v['blockiert'] else 'false'}, farbe: '{v['farbe']}', glbDatei: '{v['glbDatei']}'{sitz} }},")
js += ['  },', '  uebergaenge: [',
       f"    {{ x: {zx1 - 2}, y: {min(tor)}, b: 2, h: {len(tor)}, ziel: 'stadtrand', ankunft: 'lager', name: 'Stadtrand' }}, // Runde 44: innen vor dem geschlossenen Tor",
       '  ],', '  ankuenfte: {', f'    ost: {{ x: {zx1 - 5}, y: {min(tor) + 1} }}, // wer vom Stadtrand kommt (innen, ein Stück vor dem Tor)', '  },', '};']
ZIEL.write_text('\n'.join(js) + '\n', encoding='utf-8')
print(f'{ZIEL} geschrieben ({B} × {H}, {len(objekte)} Objekte, {baeume} Bäume, {buesche} Büsche, {zaun} Zaunteile, {len(typen)} Modell-Typen, '
      f'{len(lichterketten)} Lichterketten, {sum(1 for e in objekte if e["typ"] == "licht")} Lichter)')

"""
Generator für server/spiel/karten/stadtrand.js – erzeugt die komplette Karte (Kacheln, Räume, Möbel, Lampen,
Bäume, Steine, Erz, Werkbänke, Übergänge zu anderen Zonen).

    python3 werkzeuge/karten/stadtrand.py

Größere Umbauten am besten HIER machen und neu erzeugen (die JS-Datei wird überschrieben).
Kleine Änderungen gehen auch direkt in der JS-Datei – dann aber hier nachziehen, sonst gehen sie beim
nächsten Erzeugen verloren. Danach immer: npm test (prüft Erreichbarkeit, Überlappungen, Grafiken).
"""
import json
from pathlib import Path

ZIEL = Path(__file__).resolve().parents[2] / 'server' / 'spiel' / 'karten' / 'stadtrand.js'

B, H = 110, 86
g = [[',' for _ in range(B)] for _ in range(H)]
objekte = []


def fill(x0, y0, x1, y1, ch):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            g[y][x] = ch


def setz(x, y, ch):
    g[y][x] = ch


def raum(x0, y0, x1, y1, boden):
    """Wände auf dem Rand, Boden innen. Benachbarte Räume teilen sich die Wandlinie."""
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            rand = x in (x0, x1) or y in (y0, y1)
            g[y][x] = '#' if rand else boden


def wand_h(x0, x1, y):
    for x in range(x0, x1 + 1):
        g[y][x] = '#'


def wand_v(x, y0, y1):
    for y in range(y0, y1 + 1):
        g[y][x] = '#'


def o(typ, x, y, b, h, block=True, **kw):
    e = {'typ': typ, 'x': x, 'y': y, 'b': b, 'h': h}
    e.update(kw)
    if block:
        e['blockiert'] = True
    objekte.append(e)


def licht(x, y, radius, farbe, staerke, flackern=False):
    e = {'typ': 'licht', 'x': x, 'y': y, 'b': 1, 'h': 1, 'radius': radius, 'farbe': farbe, 'staerke': staerke}
    if flackern:
        e['flackern'] = True
    objekte.append(e)


def baum(x, y, herbst=False, gross=3.5):
    o('baum_herbst' if herbst else 'baum', x, y, gross, gross, block=False, ebene='oben')


def busch(x, y, s=1.5):
    o('busch', x, y, s, s, block=False, ebene='oben')


# =============================================================================
# Straßen & Wege
fill(24, 0, 26, 58, '=')          # Klinikstraße (West, senkrecht)
fill(23, 0, 23, 58, '-')
fill(27, 0, 27, 58, '-')
fill(95, 0, 97, 58, '=')          # Parkstraße (Ost, senkrecht)
fill(94, 0, 94, 58, '-')
fill(98, 0, 98, 58, '-')
fill(0, 59, B - 1, 59, '-')       # Gehweg Nord
fill(0, 60, B - 1, 62, '=')       # Hauptstraße
fill(0, 63, B - 1, 63, '-')       # Gehweg Süd
fill(24, 59, 26, 59, '=')         # Einmündungen
fill(95, 59, 97, 59, '=')

# Lieferweg hinter dem Krankenhaus
fill(28, 2, 93, 4, '_')
# Vorplatz (Gehweg) vor dem Haupteingang + Parkplatz + Zufahrt
fill(28, 43, 93, 44, '-')
fill(32, 45, 91, 57, '_')
fill(58, 58, 65, 59, '_')
# Kleiner Teich mitten auf dem Parkplatz (Angeln): Grasufer mit Wasser darin
for ty in range(45, 58):
    for tx in range(32, 92):
        d = ((tx - 62) / 8.0) ** 2 + ((ty - 51) / 4.6) ** 2
        if d <= 1.0:
            g[ty][tx] = '~' if d <= 0.45 else ','
# Krankenwagen-Zufahrt zur Notaufnahme (Westseite)
fill(28, 33, 31, 42, '_')

# =============================================================================
# KRANKENHAUS  (x 32..91, y 6..42)
raum(32, 6, 91, 42, ':')
# --- Nordteil: zwei Flügel mit je einem Stationsflur, Mittelflur dazwischen ---
wand_h(32, 91, 16)
wand_h(32, 91, 19)
wand_h(32, 91, 28)
wand_h(32, 91, 32)
wand_v(59, 6, 28)
wand_v(64, 6, 28)
fill(60, 7, 63, 27, ':')                     # Mittelflur
fill(33, 17, 58, 18, ':')                    # Stationsflur West
fill(65, 17, 90, 18, ':')                    # Stationsflur Ost
fill(59, 17, 59, 18, ':')                    # Durchgänge Mittelflur ↔ Stationsflure
fill(64, 17, 64, 18, ':')
fill(60, 28, 63, 28, ':')                    # Mittelflur → Hauptflur
fill(33, 29, 90, 31, ':')                    # Hauptflur
# West-Flügel
wand_v(46, 6, 16)
wand_v(46, 19, 28)
fill(33, 7, 45, 15, '.')                     # OP-Saal
fill(47, 7, 58, 15, '.')                     # Apotheke
fill(33, 20, 45, 27, '.')                    # Labor
fill(47, 20, 58, 27, ':')                    # Lager
setz(39, 16, 'T'); setz(52, 16, 'T')
setz(39, 19, 'T'); setz(52, 19, 'T')
setz(55, 28, 'T')                            # Lager ↔ Hauptflur
# Ost-Flügel: Patientenzimmer oben, Verwaltung & Sicherheitsdienst unten
wand_v(73, 6, 16)
wand_v(82, 6, 16)
fill(65, 7, 72, 15, '.')
fill(74, 7, 81, 15, '.')
fill(83, 7, 90, 15, '.')
setz(68, 16, 'T'); setz(77, 16, 'T'); setz(86, 16, 'T')
wand_v(78, 19, 28)
fill(65, 20, 77, 27, '+')                    # Verwaltung
fill(79, 20, 90, 27, '+')                    # Sicherheitsdienst
setz(70, 19, 'T'); setz(84, 19, 'T')
# Hintereingang (Anlieferung) im Norden
setz(61, 6, 'T'); setz(62, 6, 'T')
# --- Südteil: Notaufnahme · Eingangshalle · Kantine · Küche ---
wand_v(51, 32, 42)
wand_v(72, 32, 42)
wand_v(84, 32, 42)
fill(33, 33, 50, 41, '.')                    # Notaufnahme
fill(52, 33, 71, 41, '.')                    # Eingangshalle
fill(73, 33, 83, 41, '+')                    # Kantine
fill(85, 33, 90, 41, '.')                    # Küche
fill(54, 32, 69, 32, '.')                    # Halle offen zum Hauptflur
setz(61, 42, 'T'); setz(62, 42, 'T')         # Haupteingang
setz(32, 36, 'T'); setz(32, 37, 'T')         # Notaufnahme: Krankenwagen-Eingang
setz(41, 32, 'T')                            # Notaufnahme ↔ Hauptflur
setz(51, 38, 'T')                            # Notaufnahme ↔ Halle
setz(72, 37, 'T'); setz(72, 38, 'T')         # Halle ↔ Kantine
setz(78, 32, 'T')                            # Kantine ↔ Hauptflur
setz(84, 36, 'T')                            # Kantine ↔ Küche
setz(91, 39, 'T')                            # Küche: Lieferantentür
setz(91, 30, 'T')                            # Hauptflur: Ostausgang
setz(32, 30, 'T')                            # Hauptflur: Westausgang

# =============================================================================
# WOHNHÄUSER (West)
for (y0, tuer) in ((8, 13), (28, 33)):
    raum(3, y0, 20, y0 + 14, '+')
    wand_v(12, y0, y0 + 14)
    wand_h(12, 20, y0 + 7)
    setz(12, y0 + 4, '+')                    # Wohnzimmer ↔ Küche (offen)
    setz(12, y0 + 11, 'T')                   # Wohnzimmer ↔ Schlafzimmer
    setz(16, y0 + 7, 'T')                    # Küche ↔ Bad/Flur
    setz(20, tuer, 'T')                      # Haustür zur Straße
    fill(13, y0 + 1, 19, y0 + 6, '.')        # Küche gefliest
fill(21, 13, 22, 13, '-'); fill(21, 33, 22, 33, '-')   # Gartenwege

# =============================================================================
# KIOSK im Park (Ost)
raum(101, 24, 108, 31, ':')
setz(101, 27, 'T')

# =============================================================================
# SÜDSEITE: Tankstelle · Supermarkt · Polizeiwache
fill(2, 64, 28, 69, '_')                     # Tankstellen-Vorplatz
raum(3, 70, 15, 80, '.')                     # Tankstellen-Shop
raum(15, 70, 27, 80, ':')                    # Werkstatt
setz(8, 70, 'T'); setz(9, 70, 'T')
setz(20, 70, 'T'); setz(21, 70, 'T')
setz(15, 75, 'T')

fill(30, 64, 66, 65, '-')                    # Vorplatz Supermarkt
raum(32, 66, 64, 82, '.')                    # Supermarkt
wand_h(32, 64, 77)
fill(33, 78, 63, 81, ':')                    # Lager
setz(56, 77, 'T')
setz(47, 66, 'T'); setz(48, 66, 'T')         # Eingang
setz(40, 82, 'T')                            # Hinterausgang

fill(68, 64, 96, 65, '-')
raum(70, 66, 94, 82, '+')                    # Polizeiwache
wand_h(70, 94, 73)
wand_v(81, 73, 82)
fill(82, 74, 93, 81, ':')                    # Waffenkammer
setz(80, 66, 'T'); setz(81, 66, 'T')         # Eingang
setz(76, 73, 'T')                            # Empfang ↔ Büro
setz(88, 73, 'T')                            # Empfang ↔ Waffenkammer

# =============================================================================
# Fenster: Außenwände, deren Innenseite Boden ist, bekommen Fensterbänder


def ist_innen(ch):
    return ch in '.:+'


def fenster(x0, y0, x1, y1, abstand=4):
    """Fenster in eine Außenwand-Linie (waagerecht oder senkrecht)."""
    punkte = [(x, y) for y in range(y0, y1 + 1) for x in range(x0, x1 + 1)]
    for i, (x, y) in enumerate(punkte):
        if g[y][x] != '#' or i % abstand not in (1, 2):
            continue
        waagerecht = y0 == y1
        nb = [(x - 1, y), (x + 1, y)] if waagerecht else [(x, y - 1), (x, y + 1)]
        quer = [(x, y - 1), (x, y + 1)] if waagerecht else [(x - 1, y), (x + 1, y)]
        if not all(0 <= a < B and 0 <= b < H and g[b][a] in '#F' for a, b in nb):
            continue
        if not any(0 <= a < B and 0 <= b < H and ist_innen(g[b][a]) for a, b in quer):
            continue
        g[y][x] = 'F'


fenster(32, 6, 91, 6)
fenster(32, 42, 91, 42)
fenster(32, 6, 32, 42)
fenster(91, 6, 91, 42)
for y0 in (8, 28):
    fenster(3, y0, 20, y0)
    fenster(3, y0 + 14, 20, y0 + 14)
    fenster(3, y0, 3, y0 + 14)
    fenster(20, y0, 20, y0 + 14, 5)
fenster(101, 24, 108, 24)
fenster(108, 24, 108, 31)
fenster(3, 70, 27, 70, 5)
fenster(3, 80, 27, 80)
fenster(32, 66, 64, 66, 3)
fenster(70, 66, 94, 66)
fenster(94, 66, 94, 82)
fenster(70, 66, 70, 82)

# =============================================================================
# Marker: Spieler-Start, Zombies (nur draußen), Loot
# Spieler starten im Schlafzimmer der Wohnhäuser, direkt neben dem Bett
for x, y in ((7, 19), (7, 20), (7, 39), (7, 40)):
    setz(x, y, 'S')
for x, y in ((20, 51), (25, 6), (44, 50), (82, 51), (12, 68), (52, 63), (88, 63), (104, 12), (103, 45), (70, 1)):
    setz(x, y, 'Z')

RAEUME = {
    'a': ('Apotheke', 'apotheke'), 'b': ('OP-Saal', 'op'), 'c': ('Labor', 'labor'), 'd': ('Lager', 'lager'),
    'e': ('Zimmer 101', 'patientenzimmer'), 'f': ('Zimmer 102', 'patientenzimmer'), 'g': ('Kantine', 'kantine'),
    'h': ('Sicherheitsdienst', 'sicherheit'), 'i': ('Eingangshalle', 'eingangshalle'), 'j': ('Notaufnahme', 'notaufnahme'),
    'k': ('Verwaltung', 'verwaltung'), 'l': ('Küche', 'kueche'), 'm': ('Zimmer 103', 'patientenzimmer'),
    'n': ('Haus Lindner', 'wohnung'), 'o': ('Haus Becker', 'wohnung'), 'p': ('Tankstelle', 'tankstelle'),
    'q': ('Supermarkt', 'supermarkt'), 'r': ('Polizeiwache', 'polizei'), 's': ('Kiosk', 'kiosk'),
    't': ('Werkstatt', 'werkstatt'), 'u': ('Waffenkammer', 'waffenkammer'), 'v': ('Supermarkt-Lager', 'lager'),
}
LOOT = {
    'a': [(49, 9), (55, 9), (50, 13), (57, 13)],
    'b': [(35, 9), (43, 13), (37, 14)],
    'c': [(35, 22), (43, 22), (40, 26)],
    'd': [(49, 22), (56, 22), (50, 26), (57, 26)],
    'e': [(67, 9), (71, 13)],
    'f': [(76, 9), (80, 13)],
    'm': [(85, 9), (89, 13)],
    'k': [(67, 22), (74, 26)],
    'h': [(81, 22), (88, 22), (86, 26)],
    'j': [(35, 35), (45, 34), (40, 40), (48, 40)],
    'i': [(55, 35), (68, 35), (57, 40)],
    'g': [(75, 34), (81, 40)],
    'l': [(87, 34), (89, 40)],
    'n': [(5, 10), (14, 10), (9, 17), (17, 19)],
    'o': [(5, 30), (14, 30), (9, 37), (17, 39)],
    's': [(104, 26), (106, 29)],
    'p': [(5, 72), (12, 78), (6, 78)],
    't': [(17, 72), (25, 78), (24, 72)],
    'q': [(35, 68), (41, 71), (52, 74), (60, 68), (45, 75), (58, 75)],
    'v': [(35, 80), (50, 79), (62, 80)],
    'r': [(73, 68), (91, 68), (78, 80), (79, 76)],
    'u': [(84, 76), (91, 79), (87, 80)],
}
for raum_id, punkte in LOOT.items():
    for x, y in punkte:
        assert ist_innen(g[y][x]), f'Loot {raum_id} {x}|{y} nicht auf Innenboden: {g[y][x]!r}'
        setz(x, y, raum_id)

# =============================================================================
# Möbel & Deko (Kachelkoordinaten: linke obere Ecke)
# --- OP-Saal ---
o('bett', 38, 9, 2, 4)
o('kueche_spuele', 33, 7, 1, 1); o('kueche_spuele', 34, 7, 1, 1)
o('tisch', 42, 8, 2, 1)
o('blutlache', 36, 11, 1.6, 1.6, block=False, ebene='boden')
# --- Apotheke: Regale an den Wänden, Theke ---
o('kueche_theke', 47, 7, 5, 1); o('kueche_theke', 53, 7, 5, 1)
o('tisch', 51, 11, 3, 1)
o('kiste', 47, 15, 1, 1); o('kiste_klein', 58, 15, 1, 1)
# --- Labor ---
o('tisch', 35, 24, 3, 2); o('tisch', 41, 24, 3, 2)
o('kueche_spuele', 45, 20, 1, 1)
# --- Lager ---
for x in (47, 48, 49, 53, 54, 58):
    o('kiste', x, 20 if x < 52 else 27, 1, 1)
o('kiste_klein', 52, 23, 1, 1); o('kiste_klein', 53, 23, 1, 1)
o('fass', 58, 21.1, 0.9, 0.9)
# --- Patientenzimmer ---
for x0, farbe in ((65, 'bett'), (74, 'bett_orange'), (83, 'bett')):
    o(farbe, x0, 7, 2, 4)
    o(farbe, x0 + 5, 7, 2, 4)
    o('kiste_klein', x0 + 2, 7, 1, 1)
    o('sessel_blau' if farbe == 'bett' else 'sessel', x0 + 3, 14, 1, 1, drehung=180)
o('blutfleck', 77, 11, 1.2, 1.2, block=False, ebene='boden')
# --- Verwaltung ---
o('teppich', 66, 21, 4, 3, block=False, ebene='boden')
o('tisch', 71, 21, 3, 2); o('stuhl', 72, 23, 1, 1, block=False, drehung=180)
o('sofa_dunkel', 65, 27, 3, 1, drehung=180)
o('pflanze', 77, 20, 1, 1); o('kiste', 77, 27, 1, 1)
# --- Sicherheitsdienst ---
o('tisch', 82, 24, 3, 2); o('stuhl', 83, 26, 1, 1, block=False, drehung=180)
o('kiste', 90, 20, 1, 1); o('kiste', 90, 21, 1, 1); o('kiste_klein', 79, 27, 1, 1)
o('sofa_dunkel', 87, 27, 3, 1, drehung=180)
# --- Flure ---
for x in (33, 58, 65, 90):
    o('pflanze', x, 17, 1, 1)
o('sessel', 44, 29, 1, 1); o('sessel', 45, 29, 1, 1)
o('sessel_blau', 80, 29, 1, 1); o('sessel_blau', 81, 29, 1, 1)
o('blutfleck', 50, 30, 1.2, 1.2, block=False, ebene='boden')
o('blutfleck', 61, 12, 1.2, 1.2, block=False, ebene='boden')
# --- Notaufnahme ---
for x in (34, 38, 42):
    o('bett', x, 37, 2, 4)
o('kiste_klein', 50, 33, 1, 1); o('tisch', 46, 36, 2, 1)
o('blutlache', 40, 34.5, 1.6, 1.6, block=False, ebene='boden')
# --- Eingangshalle: Empfangstresen, Wartebereich ---
o('teppich_gruen', 60, 35, 4, 3, block=False, ebene='boden')
o('kueche_theke', 64, 36, 1, 4)              # Empfangstresen
o('sofa', 53, 33, 3, 1); o('sofa', 53, 38, 1, 3, drehung=90)
o('sessel_blau', 68, 40, 1, 1, drehung=270); o('sessel_blau', 70, 40, 1, 1, drehung=270)
o('pflanze', 52, 41, 1, 1); o('pflanze', 71, 41, 1, 1); o('pflanze', 71, 33, 1, 1)
# --- Kantine ---
for x in (75, 79):
    for y in (35, 39):
        o('tisch_rund', x, y, 1, 1)
        o('stuhl', x, y - 1, 1, 1, block=False)
        o('stuhl', x, y + 1, 1, 1, block=False, drehung=180)
# --- Küche ---
o('kueche_herd', 90, 33, 1, 1, drehung=270); o('kueche_kochfeld', 90, 34, 1, 1, drehung=270)
o('kueche_spuele', 90, 35, 1, 1, drehung=270); o('kueche_theke', 86, 37, 3, 1)
# --- Wohnhäuser ---
for y0 in (8, 28):
    o('teppich', 5, y0 + 3, 4, 3, block=False, ebene='boden')
    o('sofa', 4, y0 + 1, 3, 1)
    o('tisch', 9, y0 + 6, 2, 1)
    o('sessel', 10, y0 + 2, 1, 1, drehung=270)
    o('kueche_herd', 19, y0 + 1, 1, 1, drehung=270); o('kueche_spuele', 19, y0 + 2, 1, 1, drehung=270)
    o('kueche_theke', 19, y0 + 3, 1, 2, drehung=0)
    o('tisch_rund', 15, y0 + 3, 1, 1)
    o('bett_orange' if y0 == 8 else 'bett', 4, y0 + 10, 2, 4)
    o('kiste_klein', 8, y0 + 13, 1, 1)
    o('pflanze', 13, y0 + 13, 1, 1)
    o('sofa_dunkel', 15, y0 + 13, 3, 1, drehung=180)
# --- Werkbänke (Crafting) ---
for y0 in (8, 28):
    o('werkbank', 18, y0 + 8, 2, 1)
o('werkbank', 22, 71, 2, 1)
# --- Steine zum Abbauen (Spitzhacke) ---
for x, y in ((101, 9), (107, 15), (102, 20), (100, 40), (107, 43), (106, 56), (5, 46), (12, 48), (17, 55),
             (3, 57), (35, 84), (60, 84), (97, 80), (105, 73), (50, 5), (75, 5), (5, 26), (89, 84)):
    o('stein', x, y, 1, 1)
# --- Eisenerz (Spitzhacke, 10 s) – Plätze per Skript auf freiem Rasen gesucht ---
for x, y in ((107, 78), (106, 2), (26, 83), (66, 68), (103, 40), (30, 6), (30, 31), (21, 57), (7, 82)):
    o('eisenerz', x, y, 1, 1)
# --- Kiosk ---
o('kueche_theke', 103, 25, 1, 2)
o('kiste', 107, 30, 1, 1); o('kiste_klein', 107, 25, 1, 1)
# --- Tankstelle ---
for x in (6, 12, 18):
    o('kiste', x, 66, 1, 1)                   # Zapfsäulen (als Kiste dargestellt)
o('fass', 23, 66, 0.9, 0.9); o('fass', 24, 66.2, 0.9, 0.9)
o('pylone', 26, 68, 0.8, 0.8, block=False)
o('auto_rot', 8, 67.2, 3, 1.7, drehung=0)    # klein? → siehe unten ersetzt
objekte.pop()                                  # (doch kein Auto auf dem Vorplatz – Weg frei halten)
o('kueche_theke', 4, 75, 5, 1); o('kueche_theke', 4, 77, 5, 1)
o('tisch', 11, 71, 3, 1)
o('auto_blau', 18, 74, 5.5, 3, drehung=90)    # Auto in der Werkstatt
o('kiste', 26, 79, 1, 1); o('fass', 16, 79.1, 0.9, 0.9)
o('oelfleck', 21, 72, 1.6, 1.4, block=False, ebene='boden')
# --- Supermarkt: Regalreihen, Kassen ---
for x in (36, 43, 50, 57):
    o('kueche_theke', x, 69, 1, 6)
o('kueche_theke', 34, 76, 6, 1); o('kueche_theke', 58, 76, 5, 1)
o('tisch', 44, 67, 2, 1); o('tisch', 50, 67, 2, 1)   # Kassen
for x in (34, 38, 44, 48, 52, 60):
    o('kiste', x, 81, 1, 1)
o('blutlache', 47, 72, 1.6, 1.6, block=False, ebene='boden')
# --- Polizeiwache ---
o('kueche_theke', 77, 69, 6, 1)               # Empfangstresen
o('sofa_dunkel', 71, 67, 3, 1)
o('pflanze', 93, 67, 1, 1)
o('tisch', 72, 75, 3, 2); o('tisch', 72, 79, 3, 2)
o('stuhl', 73, 77, 1, 1, block=False, drehung=180)
o('kiste', 93, 74, 1, 1); o('kiste', 93, 75, 1, 1); o('kiste', 82, 81, 1, 1); o('kiste_klein', 83, 81, 1, 1)
# --- Parkplatz: Markierungen + Autos (Bucht 4 bleibt frei = Weg Spawn → Eingang) ---
for reihe_y, belegt in ((45.6, {0: 'auto_rot', 1: 'auto_gruen', 2: 'auto_schwarz', 5: 'transporter', 6: 'auto_gelb', 8: 'auto_blau'}),
                        (53.4, {0: 'auto_blau', 3: 'auto_schwarz', 6: 'auto_rot', 7: 'auto_gruen'})):
    for i in range(10):
        objekte.append({'typ': 'markierung', 'x': 33 + i * 6.5 - 0.06, 'y': reihe_y, 'b': 0.12, 'h': 3.4, 'ebene': 'boden'})
    for bucht, typ in belegt.items():
        o(typ, 33.5 + bucht * 6.5, reihe_y + 0.2, 5.5, 3, drehung=270 if bucht % 2 else 90)
o('oelfleck', 47, 50.5, 1.6, 1.4, block=False, ebene='boden')
o('blutlache', 72, 51, 1.4, 1.4, block=False, ebene='boden')
# --- Straße: Unfall, Pylonen ---
o('auto_schwarz', 40, 60.2, 5.5, 3, drehung=95)
o('auto_gelb', 99.5, 60.3, 5.5, 2.6, drehung=270)
o('pylone', 47, 61, 0.8, 0.8, block=False); o('pylone', 48.3, 61.8, 0.8, 0.8, block=False)
o('auto_rot', 24.2, 18, 2.6, 5.5, drehung=0)   # quer auf der Klinikstraße
o('transporter', 95.2, 35, 2.6, 5.5, drehung=180)
o('fass', 29.5, 38, 0.9, 0.9); o('pylone', 30.5, 34, 0.8, 0.8, block=False)
# --- Lieferweg Nord ---
o('transporter', 56, 2.2, 5.5, 2.6, drehung=90)
o('kiste', 66, 5, 1, 1); o('kiste', 67, 5, 1, 1)

# --- Bäume & Büsche ---
for x, y, h in ((0, 2, 0), (8, 0, 1), (15, 2, 0), (0, 23, 1), (14, 23, 0), (0, 44, 0), (6, 47, 1), (13, 50, 0), (18, 46, 1),
                (2, 53, 0), (10, 54, 1), (29, 0, 0), (36, 0, 1), (79, 0, 0), (88, 0, 1), (100, 2, 0), (105, 6, 1), (100, 14, 0),
                (106, 18, 0), (100, 34, 1), (106, 38, 0), (101, 46, 0), (106, 51, 1), (100, 55, 0), (1, 82, 0), (29, 82, 1),
                (66, 82.5, 0), (97, 70, 0), (104, 66, 1), (101, 77, 0), (106, 81, 1)):
    baum(x, y, bool(h))
for x, y in ((28.3, 45), (28.3, 49), (28.3, 53), (92.2, 45), (92.2, 50), (92.2, 54), (34, 58.1), (42, 58.1), (70, 58.2),
             (80, 58.1), (88, 58.2), (21, 10), (21, 17), (21, 30), (21, 37), (66, 64.2), (29, 64.3), (68, 64.2)):
    busch(x, y)

# --- Licht: Notbeleuchtung drinnen, Laternen draußen ---
ROT, GRUEN, KALT, WARM, LATERNE = '#ff3b2f', '#46ff8a', '#bfe4ff', '#ffc46b', '#ffb35c'
for x, f in ((40, True), (52, False), (61, False), (74, True), (86, False)):
    licht(x, 30, 3.5, ROT, 0.55, f)
licht(61, 12, 3.5, ROT, 0.5, True); licht(45, 17, 3, GRUEN, 0.45); licht(78, 17, 3, ROT, 0.5)
licht(61, 37, 5, KALT, 0.7, True); licht(41, 36, 3.5, ROT, 0.5, True); licht(78, 37, 3.5, WARM, 0.5)
licht(84, 23, 3, KALT, 0.45, True); licht(52, 23, 2.5, GRUEN, 0.35)
licht(8, 12, 3, WARM, 0.45, True); licht(46, 72, 4, KALT, 0.5, True); licht(82, 70, 3.5, KALT, 0.55)
licht(9, 74, 3, KALT, 0.45); licht(104, 27, 2.5, WARM, 0.45, True)
for x in (8, 30, 52, 74, 96):
    licht(x, 59, 5.5, LATERNE, 0.75, x == 52)
for y in (10, 30, 50):
    licht(23, y, 5, LATERNE, 0.7, y == 30)
    licht(98, y, 5, LATERNE, 0.7)
licht(46, 51, 6, LATERNE, 0.75); licht(77, 51, 6, LATERNE, 0.75, True); licht(61, 44, 4, LATERNE, 0.6)
licht(13, 67, 5, '#fff2c8', 0.7)

# =============================================================================
zeilen = [''.join(r) for r in g]


def zahl(v):
    return int(v) if float(v).is_integer() else round(v, 2)


def js_objekt(e):
    teile = []
    for k, v in e.items():
        if k == 'blockiert':
            continue
        if isinstance(v, str):
            teile.append(f"{k}: '{v}'")
        elif isinstance(v, bool):
            teile.append(f'{k}: {"true" if v else "false"}')
        else:
            teile.append(f'{k}: {zahl(v)}')
    if e.get('blockiert'):
        teile.append('...M')
    return '{ ' + ', '.join(teile) + ' }'


js = []
js.append('''/**
 * Karte: Stadtrand mit dem St.-Elisabeth-Krankenhaus (Standardkarte).
 *
 * Aufbau (Kachelkoordinaten, 110 × 86):
 *   Krankenhaus (x 32–91, y 6–42)  Haupteingang Süd → Eingangshalle → Hauptflur (y 29–31)
 *     Nordteil: Mittelflur (x 60–63) + Stationsflure (y 17–18): OP, Apotheke, Labor, Lager | Zimmer 101–103,
 *               Verwaltung, Sicherheitsdienst · Hintereingang Nord (Lieferweg)
 *     Südteil:  Notaufnahme (eigener Krankenwagen-Eingang West) · Eingangshalle · Kantine · Küche
 *   Parkplatz südlich, Klinikstraße (West) und Parkstraße (Ost), Hauptstraße (y 60–62)
 *   Westen: zwei Wohnhäuser · Osten: Park mit Kiosk · Süden: Tankstelle + Werkstatt, Supermarkt, Polizeiwache
 *
 * Legende (siehe gemeinsam/welt/kacheln.js):
 *   ,  Gras        _  Asphalt (Parkplatz)   =  Straße       -  Gehweg
 *   .  Fliesen     :  Beton                 +  Holzboden
 *   #  Wand        F  Fenster (blockiert)   T  Tür (öffnen/schließen; nebeneinander = Doppeltür)
 *   S  Spieler-Start    Z  Zombie-Spawn (nur draußen!)
 *   a–v  Loot-Punkte, gehören zum gleichnamigen Raum unten in `raeume`
 *
 * Bearbeiten: Zeichen einfach austauschen. Alle Zeilen müssen gleich lang sein
 * (der Kartenlader prüft das und meldet Fehler mit Zeilennummer).
 *
 * `objekte`: Möbel & Deko in Kachelkoordinaten (x/y = linke obere Ecke, b/h = Größe).
 *   typ        Grafikname aus client/assets/atlas.json → umgebung.objekte
 *   blockiert  true = Kollision (alle Kacheln, deren Mitte im Objekt liegt)
 *   ebene      'boden' (unter allem, z. B. Teppich/Blut) · 'moebel' (Standard) · 'oben' (über Figuren, z. B. Baumkronen)
 *   drehung    0 | 90 | 180 | 270 Grad
 *
 * Lampen: { typ: 'licht', x, y, b: 1, h: 1, radius (Kacheln), farbe, staerke (0..1), flackern }
 */
const M = { blockiert: true }; // Kurzschreibweise für Möbel mit Kollision

export const STADTRAND = {
  id: 'stadtrand',
  name: 'Stadtrand · St.-Elisabeth-Krankenhaus',
  kacheln: [''')
for z in zeilen:
    js.append(f"    '{z}',")
js.append('  ],')
js.append('  raeume: {')
for k, (name, tab) in RAEUME.items():
    js.append(f"    {k}: {{ name: '{name}', lootTabelle: '{tab}' }},")
js.append('  },')
js.append('  objekte: [')
for e in objekte:
    js.append(f'    {js_objekt(e)},')
js.append('  ],')
# Übergänge zu anderen Zonen (Open World, siehe server/spiel/karten/weltkarte.js): Bereich in Kacheln → Zielzone + Ankunftspunkt
js.append('  uebergaenge: [')
js.append("    { x: 94, y: 0, b: 5, h: 1, ziel: 'waldweg', ankunft: 'sued', name: 'Waldweg (Norden)' },")
js.append('  ],')
js.append('  ankuenfte: {')
js.append('    nord: { x: 96, y: 3 }, // wer vom Waldweg kommt')
js.append('  },')
js.append('};')
ZIEL.write_text('\n'.join(js) + '\n')
print(f'{ZIEL} geschrieben ({B} × {H})')

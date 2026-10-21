"""Zeichnet die Survivor-Texturen (Palette + Gesicht) -> werkzeuge/assets/quellen/survivor/atlas_<variante>.png
Aufruf:  python werkzeuge/assets/survivor/survivor_textur.py   (braucht Pillow)"""
import os
import random
import sys

from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(__file__))
import survivor_konstanten as K

SS = 4  # Überabtastung beim Zeichnen
AUSGABE = os.path.join(os.path.dirname(__file__), '..', 'quellen', 'survivor')
SPIEL_SKINS = os.path.join(os.path.dirname(__file__), '..', '..', '..', 'client', 'assets', '3d', 'skins')


def mix(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def zeichne(variante):
    farben = K.FARBEN[variante]
    haut, schatten = farben['haut'], farben['haut_schatten']
    gross = K.ATLAS * SS
    bild = Image.new('RGB', (gross, gross), haut)
    d = ImageDraw.Draw(bild, 'RGBA')

    # Farbfelder
    for i, name in enumerate(K.PALETTE):
        x, y = (i % 16) * K.ZELLE * SS, (i // 16) * K.ZELLE * SS
        d.rectangle([x, y, x + K.ZELLE * SS - 1, y + K.ZELLE * SS - 1], fill=farben[name] + (255,))
    # unter den Feldern: Hautfläche (Gesicht + Ränder)
    d.rectangle([0, 64 * SS, gross, gross], fill=haut + (255,))

    def P(x, z):
        px, py = K.kopf_pixel(x, z)
        return px * SS, py * SS

    def meter(m):  # Länge in Metern -> Pixel (Überabtastung)
        return m * (K.FACE_W / (K.KOPF_X[1] - K.KOPF_X[0])) * SS

    def ellipse(x, z, rx, rz, fill):
        cx, cy = P(x, z)
        d.ellipse([cx - meter(rx), cy - meter(rz), cx + meter(rx), cy + meter(rz)], fill=fill)

    def linie(punkte, breite, fill):
        d.line([P(x, z) for x, z in punkte], fill=fill, width=max(1, int(meter(breite))), joint='curve')

    # Seitliche Abdunklung (Wangen/Schläfen rund machen)
    for seite in (-1, 1):
        for k in range(6):
            x = seite * (0.105 - k * 0.006)
            cx, _ = P(x, 0)
            _, y0 = P(0, K.KOPF_Z[1])
            _, y1 = P(0, K.KOPF_Z[0])
            d.rectangle([cx - meter(0.004), y0, cx + meter(0.004), y1], fill=schatten + (28,))
    # Unterkiefer/Hals dunkler
    ellipse(0, 1.545, 0.075, 0.025, schatten + (150,))

    rnd = random.Random(7 if variante == 'mann' else 11)
    mann = variante == 'mann'
    haar = farben['haar']
    for seite in (-1, 1):
        ex = seite * 0.043
        # Augenhöhle (Schatten) + Auge
        ellipse(ex, 1.702, 0.030, 0.019, schatten + (110,))
        ellipse(ex, 1.7, 0.021, 0.0115, (250, 246, 238, 255))
        # Iris/Pupille – Blick leicht nach vorn-innen
        iris = (84, 112, 120) if mann else (92, 74, 48)
        ellipse(ex - seite * 0.001, 1.7, 0.0085, 0.0095, iris + (255,))
        ellipse(ex - seite * 0.001, 1.7, 0.0045, 0.0052, (14, 12, 12, 255))
        ellipse(ex + seite * 0.003, 1.7045, 0.0022, 0.0022, (255, 255, 255, 255))
        # Oberlid-Linie + Unterlid
        linie([(ex - seite * 0.021, 1.699), (ex - seite * 0.012, 1.7085), (ex + seite * 0.004, 1.7115), (ex + seite * 0.021, 1.704)], 0.0035, (40, 28, 22, 255))
        linie([(ex - seite * 0.019, 1.694), (ex, 1.6905), (ex + seite * 0.019, 1.696)], 0.0018, schatten + (190,))
        if not mann:  # Wimpern
            linie([(ex + seite * 0.021, 1.704), (ex + seite * 0.027, 1.709)], 0.0025, (30, 22, 18, 255))
        # Augenbrauen: etwas zusammengezogen, müder Überlebenden-Blick
        dicke = 0.0095 if mann else 0.0055
        linie([(ex - seite * 0.003, 1.728), (ex + seite * 0.016, 1.7335), (ex + seite * 0.035, 1.7285)], dicke, haar + (255,))
        # Tränensack / Müdigkeit
        linie([(ex - seite * 0.012, 1.6865), (ex + seite * 0.012, 1.6835)], 0.004, schatten + (110,))

    # Nase: Seitenschatten und Nasenlöcher
    linie([(-0.012, 1.708), (-0.0155, 1.668), (-0.019, 1.652)], 0.004, schatten + (130,))
    linie([(0.012, 1.708), (0.0155, 1.668), (0.019, 1.652)], 0.004, schatten + (130,))
    ellipse(-0.0105, 1.6525, 0.0055, 0.0032, (84, 52, 42, 220))
    ellipse(0.0105, 1.6525, 0.0055, 0.0032, (84, 52, 42, 220))
    ellipse(0, 1.639, 0.014, 0.004, schatten + (120,))  # Schatten unter der Nase

    # Mund
    lip = farben['lippen']
    ellipse(0, 1.6085, 0.02, 0.0065, mix(lip, haut, 0.1) + (255,))  # Unterlippe
    ellipse(0, 1.6205, 0.017, 0.0042, mix(lip, schatten, 0.3) + (255,))  # Oberlippe
    linie([(-0.027, 1.6165), (-0.012, 1.6145), (0.0, 1.6135), (0.012, 1.6145), (0.027, 1.6175)], 0.0028, (84, 40, 36, 255) if mann else (116, 40, 48, 255))
    ellipse(0, 1.597, 0.016, 0.004, schatten + (90,))  # Kinn-Schatten

    if mann:
        # Dreitagebart: viele feine Punkte im Kiefer-/Kinnbereich
        for _ in range(900):
            x = rnd.uniform(-0.085, 0.085)
            z = rnd.uniform(1.56, 1.66)
            rand = 0.085 - (1.66 - z) * 0.42  # Kiefer wird nach unten schmaler
            if abs(x) > rand or (abs(x) < 0.03 and 1.6 < z < 1.632):
                continue
            ellipse(x, z, 0.0016, 0.0016, (48, 34, 26, rnd.randint(70, 140)))
        # Narbe durch die linke Augenbraue
        linie([(0.078, 1.758), (0.072, 1.73), (0.067, 1.7)], 0.0032, (196, 120, 110, 220))
        for t in (0.0, 0.5, 1.0):
            linie([(0.0725 - 0.007, 1.742 + t * 0.002), (0.0725 + 0.007, 1.742 + t * 0.002 - 0.0015)], 0.0014, (220, 160, 150, 160))
    else:
        # Sommersprossen + Lippenstift
        for _ in range(60):
            x = rnd.uniform(-0.07, 0.07)
            z = rnd.uniform(1.655, 1.69)
            if abs(x) < 0.012:
                continue
            ellipse(x, z, 0.0016, 0.0016, (170, 108, 80, 150))
        linie([(-0.027, 1.6165), (0.0, 1.6135), (0.027, 1.6175)], 0.0035, (120, 36, 46, 255))

    # Dreck/Schmutz im Gesicht
    for _ in range(14):
        x = rnd.uniform(-0.08, 0.08)
        z = rnd.uniform(1.58, 1.77)
        ellipse(x, z, rnd.uniform(0.006, 0.014), rnd.uniform(0.004, 0.009), (86, 62, 44, rnd.randint(28, 60)))
    # Wangenröte (Kälte)
    for seite in (-1, 1):
        ellipse(seite * 0.058, 1.662, 0.02, 0.014, (214, 110, 96, 60))
    # Stirn leicht heller
    ellipse(0, 1.77, 0.07, 0.03, (255, 235, 215, 28))

    bild = bild.resize((K.ATLAS, K.ATLAS), Image.LANCZOS)
    # Farbfelder scharf (nicht von Nachbarn verwaschen): Mitte nochmal exakt setzen
    px = bild.load()
    for i, name in enumerate(K.PALETTE):
        x0, y0 = (i % 16) * K.ZELLE, (i // 16) * K.ZELLE
        for y in range(y0 + 3, y0 + K.ZELLE - 3):
            for x in range(x0 + 3, x0 + K.ZELLE - 3):
                px[x, y] = farben[name]
    return bild


if __name__ == '__main__':
    os.makedirs(AUSGABE, exist_ok=True)
    for v in K.FARBEN:
        pfad = os.path.join(AUSGABE, f'atlas_{v}.png')
        bild = zeichne(v)
        bild.save(pfad)
        # fürs Spiel: verlustfreies WebP (die Farbfelder müssen exakt bleiben)
        ziel = os.path.join(SPIEL_SKINS, f'survivor{v.capitalize()}.webp')
        os.makedirs(SPIEL_SKINS, exist_ok=True)
        bild.save(ziel, 'WEBP', lossless=True, quality=100, method=6)
        print('geschrieben:', pfad, '+', ziel)

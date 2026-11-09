"""Runde 47: eigene Item-Icons (selbst gezeichnet, CC0) als Grafik-Anträge für den Atlas.

    python3 werkzeuge/assets/r47_icons.py               # schreibt werkzeuge/assets/editor_grafiken/<id>.grafik.json
    python3 werkzeuge/assets/baue_assets.py --editor-items  # hängt sie an den bestehenden Atlas an

Funkgerät, Autoreifen, Autobatterie – gezeichnet mit PIL in 4-facher Größe und verkleinert (weiche Kanten).
"""
import base64
import io
import json
from pathlib import Path

from PIL import Image, ImageDraw

WURZEL = Path(__file__).resolve().parents[2]
ZIEL = WURZEL / 'werkzeuge' / 'assets' / 'editor_grafiken'
G = 288  # Zeichenfläche (wird auf 72 px verkleinert)


def leer():
    bild = Image.new('RGBA', (G, G), (0, 0, 0, 0))
    return bild, ImageDraw.Draw(bild)


def funkgeraet():
    bild, d = leer()
    # Antenne (oben links) mit Gummikappe
    d.rounded_rectangle((92, 14, 118, 112), radius=12, fill=(38, 40, 44))
    d.rounded_rectangle((88, 8, 122, 34), radius=14, fill=(58, 60, 66))
    # Drehknopf oben rechts
    d.rounded_rectangle((162, 40, 194, 84), radius=8, fill=(70, 72, 78))
    for y in range(46, 82, 8):
        d.line((166, y, 190, y), fill=(44, 46, 50), width=3)
    # Gehäuse
    d.rounded_rectangle((64, 76, 224, 282), radius=26, fill=(36, 40, 46))
    d.rounded_rectangle((72, 84, 216, 274), radius=20, fill=(56, 62, 70))
    # Gelbe Kante (Outdoor-Funkgerät)
    d.rounded_rectangle((64, 76, 224, 104), radius=18, fill=(226, 170, 40))
    # Display
    d.rounded_rectangle((88, 116, 200, 160), radius=8, fill=(18, 22, 20))
    d.rounded_rectangle((94, 122, 194, 154), radius=5, fill=(120, 196, 120))
    for x in (104, 128, 152, 176):
        d.rectangle((x, 130, x + 12, 146), fill=(40, 90, 50))
    # Lautsprecher-Gitter
    for y in range(178, 262, 14):
        d.rounded_rectangle((92, y, 196, y + 6), radius=3, fill=(26, 28, 32))
    # Sprechtaste an der Seite
    d.rounded_rectangle((44, 150, 68, 214), radius=8, fill=(200, 60, 50))
    return bild


def reifen():
    bild, d = leer()
    m = G // 2
    # Profil: dunkler Ring mit Stollen
    d.ellipse((10, 10, G - 10, G - 10), fill=(28, 28, 30))
    import math
    for i in range(28):
        w = i / 28 * math.tau
        x0, y0 = m + math.cos(w) * 118, m + math.sin(w) * 118
        x1, y1 = m + math.cos(w) * 136, m + math.sin(w) * 136
        d.line((x0, y0, x1, y1), fill=(52, 52, 56), width=10)
    d.ellipse((34, 34, G - 34, G - 34), fill=(44, 44, 48))
    d.ellipse((50, 50, G - 50, G - 50), fill=(24, 24, 26))
    # Felge
    d.ellipse((76, 76, G - 76, G - 76), fill=(170, 176, 184))
    d.ellipse((90, 90, G - 90, G - 90), fill=(132, 138, 148))
    for i in range(5):
        w = i / 5 * math.tau - math.pi / 2
        x, y = m + math.cos(w) * 34, m + math.sin(w) * 34
        d.ellipse((x - 9, y - 9, x + 9, y + 9), fill=(70, 74, 80))
    d.ellipse((m - 16, m - 16, m + 16, m + 16), fill=(200, 204, 210))
    return bild


def autobatterie():
    bild, d = leer()
    # Pole
    d.rounded_rectangle((60, 48, 104, 92), radius=8, fill=(190, 194, 200))
    d.rounded_rectangle((184, 48, 228, 92), radius=8, fill=(190, 194, 200))
    # Gehäuse
    d.rounded_rectangle((20, 80, 268, 262), radius=18, fill=(30, 32, 36))
    d.rounded_rectangle((20, 80, 268, 118), radius=16, fill=(48, 50, 56))
    # Etikett
    d.rounded_rectangle((44, 136, 244, 236), radius=10, fill=(40, 110, 200))
    d.rectangle((44, 170, 244, 186), fill=(240, 200, 50))
    # Plus (rot) / Minus
    d.rectangle((70, 196, 110, 208), fill=(230, 60, 50))
    d.rectangle((84, 182, 96, 222), fill=(230, 60, 50))
    d.rectangle((180, 196, 220, 208), fill=(235, 235, 240))
    # Blitz
    d.polygon([(150, 142), (124, 192), (146, 192), (134, 232), (172, 176), (150, 176), (164, 142)], fill=(250, 250, 250))
    return bild


ICONS = {
    'funkgeraet': ('Funkgerät', funkgeraet, 20),
    'reifen': ('Autoreifen', reifen, 26),
    'autobatterie': ('Autobatterie', autobatterie, 24),
}


def main():
    ZIEL.mkdir(parents=True, exist_ok=True)
    for item_id, (name, zeichne, welt) in ICONS.items():
        bild = zeichne().resize((96, 96), Image.LANCZOS)
        puffer = io.BytesIO()
        bild.save(puffer, 'PNG')
        antrag = {
            'format': 'browser-survival-grafik', 'id': item_id, 'name': name, 'art': 'item', 'lizenz': 'CC0',
            'urheber': 'Browser Survival (eigene Zeichnung, Runde 47)', 'quelle': 'https://github.com/dennwa/browser_survival',
            'zweck': f'Item-Icon {name}', 'weltGroesse': welt,
            'bild': 'data:image/png;base64,' + base64.b64encode(puffer.getvalue()).decode('ascii'),
        }
        (ZIEL / f'{item_id}.grafik.json').write_text(json.dumps(antrag, ensure_ascii=False), encoding='utf-8')
        print('  +', item_id)


if __name__ == '__main__':
    main()

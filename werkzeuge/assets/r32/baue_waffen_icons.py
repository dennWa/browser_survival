"""Runde 33: Item-Icons (Anträge) für Doppelaxt, Dynamit, Raketenwerfer, Rakete → werkzeuge/assets/editor_grafiken/*.grafik.json.
Danach: python werkzeuge/assets/baue_assets.py --editor-items. Rendert die r32_waffe_*.glb mit dem Software-Renderer (Hintergrund wird freigestellt)."""
import sys, os, json, base64, io
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from PIL import Image, ImageDraw
import modellwerk as mw

W = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
AUS = os.path.join(W, 'werkzeuge', 'assets', 'editor_grafiken')
KEY = (255, 0, 255)


def freistellen(img):
    a = np.array(img.convert('RGB'))
    maske = (a == np.array(KEY)).all(axis=2)
    rgba = np.dstack([a, np.where(maske, 0, 255).astype(np.uint8)])
    return Image.fromarray(rgba, 'RGBA')


def schreibe(id_, name, bild, welt):
    puf = io.BytesIO()
    bild.save(puf, 'PNG')
    d = {'format': 'browser-survival-grafik', 'id': id_, 'name': name, 'art': 'item', 'lizenz': 'CC0',
         'urheber': 'Low poly Weapons Pack 001 (Nutzer-Paket, Runde 32)', 'quelle': 'https://github.com/dennwa/browser_survival',
         'zweck': 'Item-Icon ' + name, 'weltGroesse': welt, 'bild': 'data:image/png;base64,' + base64.b64encode(puf.getvalue()).decode()}
    with open(os.path.join(AUS, id_ + '.grafik.json'), 'w', encoding='utf-8') as f:
        json.dump(d, f, indent=1, ensure_ascii=False)


for datei, id_, name, welt, blick in (('r32_waffe_axt_doppel.glb', 'doppelaxt', 'Doppelaxt', 34, (0.2, 0.3, 1.0)),
                                       ('r32_waffe_dynamit.glb', 'dynamit', 'Dynamit', 20, (0.5, 0.5, 1.0)),
                                       ('r32_waffe_raketenwerfer.glb', 'raketenwerfer', 'Raketenwerfer', 38, (0.2, 0.3, 1.0))):
    t = mw.lade_glb(os.path.join(W, 'client', 'assets', 'eigene', datei))[0]
    fc = t.get('fc')
    if fc is None:
        fc = mw.farben_backen(t)
    img = mw.render(t['v'], t['f'], fc, 256, blick=blick, hinter=KEY)
    schreibe(id_, name, freistellen(img), welt)

# Rakete (Munition): einfache Zeichnung
img = Image.new('RGBA', (256, 256), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
d.polygon([(40, 150), (150, 110), (150, 190)], fill=(200, 200, 205, 255))  # Kopf (zeigt nach links)
d.rectangle([(150, 110), (226, 190)], fill=(120, 130, 80, 255))
d.polygon([(40, 150), (80, 134), (80, 166)], fill=(190, 40, 30, 255))
d.polygon([(226, 110), (246, 80), (246, 110)], fill=(70, 70, 75, 255))
d.polygon([(226, 190), (246, 220), (246, 190)], fill=(70, 70, 75, 255))
schreibe('rakete', 'Rakete', img, 20)
print('ok')

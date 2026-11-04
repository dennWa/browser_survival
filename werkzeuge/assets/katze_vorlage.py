#!/usr/bin/env python3
"""
Erzeugt die Mal-Vorlage für die Katzen-Textur aus client/assets/3d/skins/katze_zonen.json:
  docs/konzepte/katze_textur/katze_vorlage.png        beschriftete Zonen (Referenz für Mensch/KI)
  docs/konzepte/katze_textur/katze_vorlage_leer.png   nur dünne Zonenrahmen auf neutralem Grund (zum Übermalen)
Aufruf: python3 werkzeuge/assets/katze_vorlage.py   (Pillow nötig)
Die fertige Textur kommt nach client/assets/3d/skins/katze.png (1024×1024, Zonen exakt wie in der Vorlage).
"""
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

W = Path(__file__).resolve().parents[2]
Z = json.loads((W / 'client/assets/3d/skins/katze_zonen.json').read_text())
G = Z['groesse']
OUT = W / 'docs/konzepte/katze_textur'
OUT.mkdir(parents=True, exist_ok=True)
# Name, Farbe, Hinweis (Kopf = rechts bei Seiten/Rücken/Bauch, Oben = oben)
INFO = {
    'seite': ('KOERPER SEITE', (150, 190, 235), 'Kopf rechts, Ruecken oben. Gilt fuer BEIDE Seiten (gespiegelt)'),
    'brust': ('BRUST (Vorderseite)', (240, 200, 140), 'Latz/Brust, oben = Hals'),
    'hinterteil': ('HINTERTEIL', (200, 160, 220), 'Po, oben = Ruecken'),
    'ruecken': ('RUECKEN (von oben)', (150, 220, 160), 'Kopf rechts'),
    'bauch': ('BAUCH (von unten)', (245, 245, 200), 'Kopf rechts'),
    'bein': ('BEIN (alle 4 Beine)', (235, 170, 170), 'oben = Schulter/Hueft, UNTEN = Pfote (Socken!)'),
    'schwanz': ('SCHWANZ', (170, 220, 220), 'oben = Spitze, unten = Ansatz. Ringe waagerecht!'),
    'ohr': ('OHR aussen', (220, 200, 150), 'beide Ohren'),
    'auge': ('AUGE', (200, 220, 90), 'EINE Volltonfarbe (Iris), keine Details'),
    'rosa': ('ROSA DETAILS', (250, 170, 200), 'EINE Volltonfarbe: Nase, Ohr innen, Pfotenballen'),
    'kopf_gesicht': ('KOPF GESICHT (vorn)', (255, 215, 120), 'Gesicht frontal: Augenpartie, Schnauze'),
    'kopf_seite': ('KOPF SEITE', (180, 210, 255), 'Kopf rechts = Nase. Gilt fuer beide Seiten'),
    'kopf_hinten': ('KOPF HINTEN', (210, 180, 240), 'Hinterkopf'),
    'kopf_oben': ('KOPF OBEN', (170, 235, 180), 'Schnauze rechts'),
    'kopf_unten': ('KOPF UNTEN', (250, 235, 190), 'Kinn/Hals, Schnauze rechts'),
}
try:
    F = ImageFont.truetype('DejaVuSans-Bold.ttf', 15)
    F2 = ImageFont.truetype('DejaVuSans.ttf', 12)
except OSError:
    F = F2 = ImageFont.load_default()

def zeichne(beschriftet):
    im = Image.new('RGB', (G, G), (128, 120, 112))
    d = ImageDraw.Draw(im)
    for k, (x, y, w, h) in Z['zonen'].items():
        name, farbe, hinweis = INFO[k]
        if beschriftet:
            d.rectangle([x, y, x + w - 1, y + h - 1], fill=farbe, outline=(0, 0, 0), width=2)
            d.text((x + 6, y + 5), name, fill=(0, 0, 0), font=F)
            d.text((x + 6, y + h - 18), f'{w}x{h}px', fill=(60, 60, 60), font=F2)
            # Pfeil „Kopf →“ für Zonen mit Blickrichtung
            if k in ('seite', 'ruecken', 'bauch', 'kopf_seite', 'kopf_oben', 'kopf_unten'):
                d.line([x + w // 2 - 40, y + h // 2, x + w // 2 + 40, y + h // 2], fill=(0, 0, 0), width=3)
                d.polygon([(x + w // 2 + 40, y + h // 2 - 8), (x + w // 2 + 40, y + h // 2 + 8), (x + w // 2 + 56, y + h // 2)], fill=(0, 0, 0))
                d.text((x + w // 2 + 60, y + h // 2 - 7), 'Kopf' if k != 'kopf_seite' and not k.startswith('kopf_') else 'Nase', fill=(0, 0, 0), font=F2)
            if k in ('bein', 'schwanz'):
                d.line([x + w // 2, y + 30, x + w // 2, y + h - 50], fill=(0, 0, 0), width=3)
                d.text((x + 6, y + 22), 'oben' if k == 'schwanz' else 'oben', fill=(0, 0, 0), font=F2)
                d.text((x + 6, y + h - 36), 'Pfote' if k == 'bein' else 'Ansatz', fill=(0, 0, 0), font=F2)
        else:
            d.rectangle([x, y, x + w - 1, y + h - 1], fill=(150, 142, 134), outline=(90, 90, 90), width=1)
    return im

zeichne(True).save(OUT / 'katze_vorlage.png')
zeichne(False).save(OUT / 'katze_vorlage_leer.png')
print('geschrieben:', OUT)

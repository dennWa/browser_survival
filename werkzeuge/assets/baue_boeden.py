#!/usr/bin/env python3
"""
Runde 26: Bodentexturen (Untergründe) für die Welt bauen.

  python3 werkzeuge/assets/baue_boeden.py

Quellen: werkzeuge/assets/quellen/boden/<ambientCG-ID>.jpg (512 px, CC0, ambientCG.com)
Ausgabe: client/assets/boden/<name>.jpg (256 px, nahtlos kachelbar) + client/assets/boden/boden.json
         { name: { datei, kacheln, quelle, lizenz } } – `kacheln` = so viele Spielkacheln deckt ein Bild (je Richtung).
Im Spiel: client/darstellung/assets.js lädt boden.json, bodenTextur.js malt weltfest + weiche Übergänge.
wildwald (Phase 4.13): zusammengesetzt in wildwald() – Waldboden + Laub + Moos + Pilze + Zweige.
Neue Böden: Eintrag in BOEDEN + Zeichen in gemeinsam/welt/kacheln.js (+ Farbe farben.js, Editor-Katalog katalog.js).
"""
import json
from pathlib import Path

import math
import random

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

WURZEL = Path(__file__).resolve().parents[2]
QUELLEN = WURZEL / 'werkzeuge/assets/quellen/boden'
ZIEL = WURZEL / 'client/assets/boden'
GROESSE = 256

# name: (ambientCG-ID, Kacheln je Bild, Sättigung, Helligkeit) – leicht entsättigt, passend zum Low-Poly-Look
BOEDEN = {
    'rasen': ('Grass004', 4, 0.85, 0.9),
    'gras': ('Grass001', 4, 1.0, 1.0),  # Runde 36: Standard-Rasen der Welt (Zeichen ,) – vorher flache Atlas-Kachel (Schachbrett-Optik)
    'wiese': ('Ground037', 4, 0.9, 0.95),
    'erde': ('Ground106', 4, 0.9, 1.0),
    'kies': ('Gravel043', 3, 0.8, 1.0),
    'pflaster': ('PavingStones138', 4, 0.85, 0.95),
    'waldboden': ('Ground078', 4, 0.85, 0.85),
    'sand': ('Ground054', 4, 0.9, 1.05),
}


def rauschen(groesse, zellen, saat):
    """Nahtlos kachelbares, weiches Rauschen 0..255 (Graustufen-Bild)"""
    zufall = random.Random(saat)
    gitter = [[zufall.random() for _ in range(zellen)] for _ in range(zellen)]
    bild = Image.new('L', (zellen, zellen))
    bild.putdata([int(gitter[y][x] * 255) for y in range(zellen) for x in range(zellen)])
    # 3×3 kacheln, glatt hochskalieren, Mitte ausschneiden → nahtlos
    gross = Image.new('L', (zellen * 3, zellen * 3))
    for gy in range(3):
        for gx in range(3):
            gross.paste(bild, (gx * zellen, gy * zellen))
    gross = gross.resize((groesse * 3, groesse * 3), Image.BICUBIC).filter(ImageFilter.GaussianBlur(groesse / zellen / 3))
    return gross.crop((groesse, groesse, groesse * 2, groesse * 2))


def wildwald(groesse=512):
    """Phase 4.13: wilder Waldboden – Waldboden (Ground078) + Laub (ScatteredLeaves008) + Moosflecken + Pilze + Zweige.
    Alles nahtlos (Rauschen kachelbar, Pilze/Zweige mit Umbruch über die Bildkante)."""
    basis = Image.open(QUELLEN / 'Ground078.jpg').convert('RGB').resize((groesse, groesse), Image.LANCZOS)
    laub = Image.open(QUELLEN / 'ScatteredLeaves008.jpg').convert('RGB').resize((groesse, groesse), Image.LANCZOS)
    laub = ImageEnhance.Color(laub).enhance(0.55)
    laub = ImageEnhance.Brightness(laub).enhance(0.7)
    maske = rauschen(groesse, 6, 11).point(lambda v: max(0, min(255, int((v - 110) * 2.2))))
    bild = Image.composite(laub, basis, maske)
    moos = Image.new('RGB', (groesse, groesse), (62, 92, 38))
    moos_maske = rauschen(groesse, 9, 23).point(lambda v: max(0, min(160, int((v - 150) * 3))))
    bild = Image.composite(moos, bild, moos_maske)
    z = random.Random(5)
    zeichner = ImageDraw.Draw(bild, 'RGBA')

    def umbrochen(f, x, y, r):
        for dx in (-groesse, 0, groesse):
            for dy in (-groesse, 0, groesse):
                if -r <= x + dx <= groesse + r and -r <= y + dy <= groesse + r:
                    f(x + dx, y + dy)

    # Zweige
    for _ in range(14):
        x, y = z.random() * groesse, z.random() * groesse
        w = z.random() * math.pi
        laenge = 18 + z.random() * 40
        def zweig(px, py, w=w, laenge=laenge):
            zeichner.line([(px, py), (px + math.cos(w) * laenge, py + math.sin(w) * laenge)], fill=(58, 40, 24, 220), width=3)
        umbrochen(zweig, x, y, 60)
    # Pilze: Gruppen kleiner Hüte (rot mit Tupfen, braun, beige) mit Schatten
    farben = [((150, 30, 24), True), ((112, 74, 42), False), ((196, 170, 120), False), ((132, 46, 30), True)]
    for _ in range(9):
        gx, gy = z.random() * groesse, z.random() * groesse
        farbe, tupfen = z.choice(farben)
        for _ in range(z.randint(2, 5)):
            x, y = gx + z.uniform(-22, 22), gy + z.uniform(-22, 22)
            r = z.uniform(5, 10)
            def pilz(px, py, r=r, farbe=farbe, tupfen=tupfen):
                zeichner.ellipse([px - r + 2, py - r + 3, px + r + 2, py + r + 3], fill=(20, 16, 10, 120))
                zeichner.ellipse([px - r, py - r, px + r, py + r], fill=farbe + (255,))
                zeichner.ellipse([px - r * 0.55, py - r * 0.65, px + r * 0.15, py - r * 0.05], fill=tuple(min(255, c + 50) for c in farbe) + (150,))
                if tupfen:
                    for wi in range(4):
                        a = wi * 1.7
                        zeichner.ellipse([px + math.cos(a) * r * 0.5 - 1.6, py + math.sin(a) * r * 0.5 - 1.6, px + math.cos(a) * r * 0.5 + 1.6, py + math.sin(a) * r * 0.5 + 1.6], fill=(240, 236, 220, 255))
            umbrochen(pilz, x, y, 12)
    return bild


def main():
    ZIEL.mkdir(parents=True, exist_ok=True)
    index = {}
    for name, (quelle, kacheln, saett, hell) in BOEDEN.items():
        bild = Image.open(QUELLEN / f'{quelle}.jpg').convert('RGB').resize((GROESSE, GROESSE), Image.LANCZOS)
        bild = ImageEnhance.Color(bild).enhance(saett)
        bild = ImageEnhance.Brightness(bild).enhance(hell)
        bild.save(ZIEL / f'{name}.jpg', quality=82, optimize=True)
        index[name] = {'datei': f'boden/{name}.jpg', 'kacheln': kacheln, 'quelle': f'https://ambientcg.com/view?id={quelle}', 'lizenz': 'CC0'}
    # Phase 4.13: zusammengesetzter Boden (Quellen: Ground078 + ScatteredLeaves008, Pilze/Moos/Zweige prozedural)
    bild = wildwald().resize((GROESSE, GROESSE), Image.LANCZOS)
    bild = ImageEnhance.Color(bild).enhance(0.9)
    bild.save(ZIEL / 'wildwald.jpg', quality=84, optimize=True)
    index['wildwald'] = {'datei': 'boden/wildwald.jpg', 'kacheln': 4, 'quelle': 'https://ambientcg.com/view?id=Ground078 + ScatteredLeaves008 (Pilze/Moos prozedural)', 'lizenz': 'CC0'}
    (ZIEL / 'boden.json').write_text(json.dumps(index, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'{len(index)} Böden → {ZIEL.relative_to(WURZEL)}')


if __name__ == '__main__':
    main()

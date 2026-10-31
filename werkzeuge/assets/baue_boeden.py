#!/usr/bin/env python3
"""
Runde 26: Bodentexturen (Untergründe) für die Welt bauen.

  python3 werkzeuge/assets/baue_boeden.py

Quellen: werkzeuge/assets/quellen/boden/<ambientCG-ID>.jpg (512 px, CC0, ambientCG.com)
Ausgabe: client/assets/boden/<name>.jpg (256 px, nahtlos kachelbar) + client/assets/boden/boden.json
         { name: { datei, kacheln, quelle, lizenz } } – `kacheln` = so viele Spielkacheln deckt ein Bild (je Richtung).
Im Spiel: client/darstellung/assets.js lädt boden.json, bodenTextur.js malt weltfest + weiche Übergänge.
Neue Böden: Eintrag in BOEDEN + Zeichen in gemeinsam/welt/kacheln.js (+ Farbe farben.js, Editor-Katalog katalog.js).
"""
import json
from pathlib import Path

from PIL import Image, ImageEnhance

WURZEL = Path(__file__).resolve().parents[2]
QUELLEN = WURZEL / 'werkzeuge/assets/quellen/boden'
ZIEL = WURZEL / 'client/assets/boden'
GROESSE = 256

# name: (ambientCG-ID, Kacheln je Bild, Sättigung, Helligkeit) – leicht entsättigt, passend zum Low-Poly-Look
BOEDEN = {
    'rasen': ('Grass004', 4, 0.85, 0.9),
    'wiese': ('Ground037', 4, 0.9, 0.95),
    'erde': ('Ground106', 4, 0.9, 1.0),
    'kies': ('Gravel043', 3, 0.8, 1.0),
    'pflaster': ('PavingStones138', 4, 0.85, 0.95),
    'waldboden': ('Ground078', 4, 0.85, 0.85),
    'sand': ('Ground054', 4, 0.9, 1.05),
}


def main():
    ZIEL.mkdir(parents=True, exist_ok=True)
    index = {}
    for name, (quelle, kacheln, saett, hell) in BOEDEN.items():
        bild = Image.open(QUELLEN / f'{quelle}.jpg').convert('RGB').resize((GROESSE, GROESSE), Image.LANCZOS)
        bild = ImageEnhance.Color(bild).enhance(saett)
        bild = ImageEnhance.Brightness(bild).enhance(hell)
        bild.save(ZIEL / f'{name}.jpg', quality=82, optimize=True)
        index[name] = {'datei': f'boden/{name}.jpg', 'kacheln': kacheln, 'quelle': f'https://ambientcg.com/view?id={quelle}', 'lizenz': 'CC0'}
    (ZIEL / 'boden.json').write_text(json.dumps(index, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'{len(index)} Böden → {ZIEL.relative_to(WURZEL)}')


if __name__ == '__main__':
    main()

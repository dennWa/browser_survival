"""
Asset-Pipeline: lädt freie Grafikpakete herunter, schneidet zu, verkleinert, packt Spritesheets (WebP:
Item-Icons, Böden, Möbel-Draufsichten), kopiert die 3D-Figur und schreibt client/assets/atlas.json + LIZENZEN.md.

Nur nötig, wenn Grafiken hinzukommen oder sich ändern – die fertigen Dateien liegen im Repo.

Einmalig einrichten:
    python3 -m venv .venv
    .venv/bin/pip install -r werkzeuge/assets/anforderungen.txt
Ausführen:
    .venv/bin/python werkzeuge/assets/baue_assets.py

Downloads werden in werkzeuge/assets/.cache zwischengespeichert (gitignored).
Danach IMMER:  npm run assets:3d  (Animationen der 3D-Figur extrahieren, Three.js bereitstellen)
"""
import io
import json
import math
import shutil
import urllib.request
import zipfile
from pathlib import Path

import numpy as np
from PIL import Image

WURZEL = Path(__file__).resolve().parents[2]
CACHE = Path(__file__).resolve().parent / '.cache'
ZIEL = WURZEL / 'client' / 'assets'
WEBP_QUALITAET = 88

# ---------------------------------------------------------------------------
# Quellen (alle frei nutzbar – Lizenzen siehe LIZENZEN unten)

OGA = 'https://opengameart.org/sites/default/files/'
QUELLEN = {
    'kenney_tds': 'https://kenney.nl/media/pages/assets/top-down-shooter/230204340a-1677694684/kenney_top-down-shooter.zip',
    'kenney_items': OGA + 'kenney_genericItems_updatedCross.zip',
    'kenney_racing': 'https://kenney.nl/media/pages/assets/racing-pack/c4cd68480a-1677662443/kenney_racing-pack.zip',
    'kenney_ac3': OGA + 'kenney_animated-characters-3.zip',
    'props': OGA + 'survival_props_pack_free.zip',
    'guns': OGA + 'guns_gameassets.zip',
    'glitch_food': OGA + 'food_0.7z',
    'glitch_drink': OGA + 'drink.7z',
}

LIZENZEN = [
    ('Top-down Shooter', 'Kenney (kenney.nl)', 'CC0', 'https://kenney.nl/assets/top-down-shooter', 'Böden, Möbel, Pflanzen'),
    ('Racing Pack', 'Kenney (kenney.nl)', 'CC0', 'https://kenney.nl/assets/racing-pack', 'Autos, Pylonen, Ölflecken, Stein'),
    ('Animated Characters 3', 'Kenney (kenney.nl)', 'CC0', 'https://opengameart.org/content/animated-characters-3', '3D-Figuren (Spieler & Zombies)'),
    ('Generic Items', 'Kenney (kenney.nl)', 'CC0', 'https://opengameart.org/content/generic-items', 'Erste-Hilfe-Kasten, Messer, Beil, Axt, Spitzhacke, Bretter'),
    ('Free Survival Props Pack', 'Olga Bikmullina (http://ahninniah.graphics)', 'CC-BY 3.0',
     'https://opengameart.org/content/free-survival-props-pack', 'Verband, Pillen, Hammer, Machete, Schrotpatronen, Rucksack'),
    ('2D Guns', 'opengameart.org/content/2d-guns', 'CC0', 'https://opengameart.org/content/2d-guns', 'Pistole, Schrotflinte, Munitionsbox'),
    ('Glitch Food & Drink Items', 'Tiny Speck (Glitch)', 'CC0',
     'https://opengameart.org/content/glitch-food-drink-items-svg', 'Essen & Getränke, Holz'),
]

# ---------------------------------------------------------------------------
# Gegenstände (Item-Icons): defId → (Quelle, Pfad im Paket, Weltgröße in px)

ITEMS = {
    'konservendose': ('glitch_drink', 'drink/crabato_juice.svg', 24),
    'marmelade': ('glitch_food', 'food/whortleberry_jelly.svg', 20),
    'apfel': ('glitch_food', 'food/apple.svg', 18),
    'broetchen': ('glitch_food', 'food/bun.svg', 22),
    'kaese': ('glitch_food', 'food/cheese.svg', 20),
    'muesliriegel': ('glitch_food', 'food/oaty_cake.svg', 20),
    'sandwich': ('glitch_food', 'food/sammich.svg', 24),
    'wasserflasche': ('glitch_drink', 'drink/milk_butterfly.svg', 24),
    'energydrink': ('glitch_drink', 'drink/beer.svg', 18),
    'milch': ('glitch_drink', 'drink/milk_whale.svg', 22),
    'kaffee': ('glitch_drink', 'drink/coffee.svg', 18),
    'verband': ('props', 'PNG/256px/bandage.png', 22),
    'schmerzmittel': ('props', 'PNG/256px/pills_2.png', 18),
    'erste_hilfe_kasten': ('kenney_items', 'PNG/Colored/genericItem_color_102.png', 26),
    'skalpell': ('kenney_items', 'PNG/Colored/genericItem_color_131.png', 20),
    'kuechenmesser': ('kenney_items', 'PNG/Colored/genericItem_color_134.png', 24),
    'hammer': ('props', 'PNG/256px/hammer.png', 26),
    'machete': ('props', 'PNG/256px/machete.png', 32),
    'feuerwehrbeil': ('kenney_items', 'PNG/Colored/genericItem_color_020.png', 28),
    'pistole': ('guns', 'PNG/pistol.png', 24),
    'schrotflinte': ('guns', 'PNG/shotgun2.png', 40),
    'munition_9mm': ('guns', 'PNG/ammobox.png', 22),
    'munition_12': ('props', 'PNG/256px/ammo_3.png', 24),
    'axt': ('kenney_items', 'PNG/Colored/genericItem_color_006.png', 28),
    'spitzhacke': ('kenney_items', 'PNG/Colored/genericItem_color_021.png', 30),
    'holz': ('glitch_food', 'food/plank.svg', 26),
    'stein': ('kenney_racing', 'PNG/Objects/rock1.png', 22),
    'eisenerz': ('kenney_racing', 'PNG/Objects/rock2.png', 22, (1.25, 0.75, 0.55)),  # 4. Wert = Einfärbung (R, G, B)
    'rucksack_klein': ('props', 'PNG/256px/backpack.png', 24, (1.35, 1.1, 0.6)),
    'rucksack_gross': ('props', 'PNG/256px/backpack.png', 32, (0.55, 0.65, 1.4)),
    'feuerzeug': ('kenney_items', 'PNG/Colored/genericItem_color_095.png', 18),
    'tomate': ('glitch_food', 'food/tomato.svg', 18),
    'gurke': ('glitch_food', 'food/cucumber.svg', 20),
    'kartoffel': ('glitch_food', 'food/potato.svg', 18),
    'tomate_gebraten': ('glitch_food', 'food/tomato.svg', 18, (0.62, 0.38, 0.25)),
    'gurke_gebraten': ('glitch_food', 'food/cucumber.svg', 20, (1.1, 0.75, 0.35)),
    'ofenkartoffel': ('glitch_food', 'food/hot_potatoes.svg', 22),
    # Selbst gezeichnet (siehe PROZEDURALE_ICONS unten) – keine Fremdgrafik, keine Lizenzfrage
    'samen_tomate': ('prozedural', 'samen:#d84a3a', 16),
    'samen_gurke': ('prozedural', 'samen:#5aa83a', 16),
    'samen_kartoffel': ('prozedural', 'samen:#b98a4a', 16),
    'samen_paprika': ('prozedural', 'samen:#e0a020', 16),
    'paprika': ('prozedural', 'paprika:#d8392b', 20),
    'paprika_gebraten': ('prozedural', 'paprika:#8a4a22', 20),
    'fleisch': ('glitch_food', 'food/meat.svg', 22),
    'fleisch_gebraten': ('glitch_food', 'food/ixstyle_braised_meat.svg', 22),
    'fisch_barsch': ('prozedural', 'fisch:#6f8f3a', 26),
    'fisch_forelle': ('prozedural', 'fisch:#c9788f', 28),
    'fisch_hecht': ('prozedural', 'fisch:#3f7a5a', 34),
    'fisch_barsch_gebraten': ('prozedural', 'fisch:#9a6a2a', 26),
    'fisch_forelle_gebraten': ('prozedural', 'fisch:#a86a30', 28),
    'fisch_hecht_gebraten': ('prozedural', 'fisch:#8a5a28', 34),
    'angel': ('prozedural', 'angel', 30),
    'kiste': ('prozedural', 'kiste', 30),
    'holzwand': ('prozedural', 'holzwand', 28),
    'holzboden': ('prozedural', 'holzboden', 28),
    'falle': ('prozedural', 'falle', 26),
    'lagerfeuer': ('prozedural', 'lagerfeuer', 28),
    'werkbank': ('prozedural', 'werkbank', 30),
    'bretter': ('kenney_items', 'PNG/Colored/genericItem_color_133.png', 26),
    'rucksack': ('props', 'PNG/256px/backpack.png', 28),
}
ITEM_ICON_GROESSE = 72

# ---------------------------------------------------------------------------
# Umgebung aus dem Kenney-Tilesheet (64-px-Raster): name → (spalte, zeile, breite, hoehe) in Kacheln

KENNEY_KACHEL = 64
BODEN = {  # Bodentexturen: mehrere Varianten werden zufällig gemischt
    'gras': [(0, 0), (1, 0), (2, 0), (3, 0)],
    'beton': [(6, 0), (7, 0)],
    'fliesen': [(11, 0)],
    'holz': [(14, 3)],
}
OBJEKTE = {
    'bett': (21, 0, 2, 4),
    'bett_orange': (24, 0, 2, 4),
    'kiste': (20, 4, 1, 1),
    'kiste_klein': (21, 4, 1, 1),
    'pflanze': (25, 4, 1, 1),
    'baum': (18, 6, 2, 2),
    'baum_herbst': (21, 6, 2, 2),
    'busch': (20, 6, 1, 1),
    'tisch': (24, 12, 3, 2),
    'kueche_theke': (23, 10, 2, 1),
    'kueche_herd': (25, 10, 1, 1),
    'kueche_spuele': (25, 11, 1, 1),
    'kueche_kochfeld': (26, 11, 1, 1),
    'sofa': (14, 16, 3, 1),
    'sofa_dunkel': (14, 18, 3, 1),
    'sessel': (17, 16, 1, 1),
    'sessel_blau': (18, 16, 1, 1),
    'stuhl': (14, 19, 1, 1),
    'tisch_rund': (19, 18, 1, 1),
    'teppich': (18, 13, 3, 3),
    'teppich_gruen': (21, 13, 3, 3),
    'blutfleck': (22, 11, 1, 1),
    'blutlache': (21, 11, 1, 1),
}
BLUT_OBJEKTE = {'blutfleck', 'blutlache'}  # werden dunkelrot eingefärbt

# Einzelbilder aus anderen Paketen: name → (Quelle, Pfad)
EINZEL_OBJEKTE = {
    'auto_schwarz': ('kenney_racing', 'PNG/Cars/car_black_1.png'),
    'auto_blau': ('kenney_racing', 'PNG/Cars/car_blue_1.png'),
    'auto_rot': ('kenney_racing', 'PNG/Cars/car_red_2.png'),
    'auto_gruen': ('kenney_racing', 'PNG/Cars/car_green_3.png'),
    'auto_gelb': ('kenney_racing', 'PNG/Cars/car_yellow_1.png'),
    'transporter': ('kenney_racing', 'PNG/Cars/car_black_4.png'),
    'oelfleck': ('kenney_racing', 'PNG/Objects/oil.png'),
    'pylone': ('kenney_racing', 'PNG/Objects/cone_straight.png'),
    'fass': ('kenney_racing', 'PNG/Objects/barrel_red.png'),
}


# ===========================================================================

def lade(name):
    """Lädt und entpackt eine Quelle in den Cache (nur beim ersten Mal)."""
    ordner = CACHE / name
    if ordner.exists():
        return ordner
    url = QUELLEN[name]
    print(f'  ↓ {name}: {url}')
    anfrage = urllib.request.Request(url, headers={'User-Agent': 'browser-survival-assets/1.0'})
    daten = urllib.request.urlopen(anfrage, timeout=120).read()
    ordner.mkdir(parents=True)
    if url.endswith('.7z'):
        import py7zr
        with py7zr.SevenZipFile(io.BytesIO(daten)) as archiv:
            archiv.extractall(ordner)
    else:
        with zipfile.ZipFile(io.BytesIO(daten)) as archiv:
            archiv.extractall(ordner)
    return ordner


def finde(ordner, relativ):
    treffer = [p for p in ordner.rglob('*') if p.as_posix().endswith(relativ)]
    if not treffer:
        raise FileNotFoundError(f'{relativ} nicht in {ordner}')
    return treffer[0]


def rendere_svg(pfad, groesse):
    import cairosvg
    png = cairosvg.svg2png(url=str(pfad), output_width=groesse * 3)
    return Image.open(io.BytesIO(png)).convert('RGBA')


def zeichne_prozedural(art, groesse):
    """Einfache selbst gezeichnete Icons (4-fach gezeichnet, dann weich verkleinert)."""
    from PIL import ImageDraw
    g = groesse * 4
    bild = Image.new('RGBA', (g, g), (0, 0, 0, 0))
    d = ImageDraw.Draw(bild)
    u = g / 72  # Einheit: Koordinaten unten für ein 72er-Raster
    def r(x0, y0, x1, y1):
        return [x0 * u, y0 * u, x1 * u, y1 * u]
    rand = (30, 22, 14, 255)
    if art.startswith('samen:'):
        farbe = art.split(':')[1]
        d.rounded_rectangle(r(16, 8, 56, 66), radius=5 * u, fill=(236, 222, 186, 255), outline=rand, width=int(2.5 * u))
        d.rectangle(r(16, 8, 56, 18), fill=(196, 170, 120, 255), outline=rand, width=int(2.5 * u))
        d.ellipse(r(24, 26, 48, 50), fill=farbe, outline=rand, width=int(2.5 * u))
        for x, y in ((24, 56), (34, 58), (44, 55)):
            d.ellipse(r(x, y, x + 5, y + 4), fill=(110, 80, 40, 255))
    elif art == 'falle':
        d.ellipse(r(8, 16, 64, 60), fill=(110, 114, 120, 255), outline=rand, width=int(3 * u))
        d.ellipse(r(22, 28, 50, 48), fill=(70, 74, 80, 255), outline=rand, width=int(2 * u))
        for i in range(7):
            x = 12 + i * 8
            d.polygon([(x * u, 22 * u), ((x + 4) * u, 12 * u), ((x + 8) * u, 22 * u)], fill=(200, 205, 210, 255), outline=rand)
            d.polygon([(x * u, 54 * u), ((x + 4) * u, 64 * u), ((x + 8) * u, 54 * u)], fill=(200, 205, 210, 255), outline=rand)
    elif art == 'lagerfeuer':
        for a, b in (((10, 52), (58, 62)), ((14, 62), (62, 50))):
            d.line([a[0] * u, a[1] * u, b[0] * u, b[1] * u], fill=(110, 70, 36, 255), width=int(9 * u))
        for x, y in ((14, 60), (24, 63), (36, 64), (48, 63), (58, 60)):
            d.ellipse(r(x - 5, y - 4, x + 5, y + 4), fill=(130, 132, 136, 255), outline=rand)
        d.polygon([(22 * u, 52 * u), (36 * u, 10 * u), (50 * u, 52 * u)], fill=(240, 110, 40, 255))
        d.polygon([(28 * u, 52 * u), (36 * u, 26 * u), (44 * u, 52 * u)], fill=(255, 210, 80, 255))
    elif art == 'werkbank':
        d.rectangle(r(6, 22, 66, 34), fill=(150, 100, 52, 255), outline=rand, width=int(2.5 * u))
        for x in (10, 56):
            d.rectangle(r(x, 34, x + 7, 64), fill=(120, 78, 40, 255), outline=rand, width=int(2 * u))
        d.rectangle(r(10, 46, 63, 51), fill=(120, 78, 40, 255), outline=rand, width=int(2 * u))
        d.rectangle(r(44, 12, 58, 22), fill=(90, 94, 100, 255), outline=rand, width=int(2 * u))
        d.line([18 * u, 18 * u, 34 * u, 10 * u], fill=(90, 94, 100, 255), width=int(4 * u))
    elif art.startswith('paprika:'):
        farbe = art.split(':')[1]
        d.rounded_rectangle(r(18, 18, 54, 62), radius=14 * u, fill=farbe, outline=rand, width=int(2.5 * u))
        d.line([30 * u, 22 * u, 28 * u, 56 * u], fill=(255, 255, 255, 70), width=int(3 * u))
        d.rectangle(r(32, 8, 40, 20), fill=(70, 130, 50, 255), outline=rand, width=int(2 * u))
    elif art.startswith('fisch:'):
        farbe = art.split(':')[1]
        d.polygon([(54 * u, 36 * u), (68 * u, 22 * u), (68 * u, 50 * u)], fill=farbe, outline=rand)
        d.ellipse(r(4, 22, 62, 50), fill=farbe, outline=rand, width=int(2.5 * u))
        d.ellipse(r(40, 30, 46, 36), fill=(255, 255, 255, 235))
        d.ellipse(r(41, 31, 45, 35), fill=(20, 20, 20, 255))
        d.arc(r(14, 26, 30, 46), 100, 260, fill=(255, 255, 255, 140), width=int(2 * u))
    elif art == 'angel':
        d.line([8 * u, 64 * u, 58 * u, 8 * u], fill=(120, 80, 40, 255), width=int(5 * u))
        d.line([58 * u, 8 * u, 64 * u, 40 * u], fill=(230, 230, 230, 255), width=int(1.5 * u))
        d.ellipse(r(60, 40, 70, 50), fill=(220, 50, 40, 255), outline=rand)
        d.ellipse(r(14, 50, 26, 62), fill=(90, 94, 100, 255), outline=rand)
    elif art == 'kiste':
        d.rectangle(r(8, 18, 64, 62), fill=(160, 112, 60, 255), outline=rand, width=int(3 * u))
        d.rectangle(r(8, 18, 64, 30), fill=(190, 140, 80, 255), outline=rand, width=int(3 * u))
        for x in (20, 36, 52):
            d.line([x * u, 30 * u, x * u, 62 * u], fill=(120, 80, 40, 255), width=int(2 * u))
        d.rectangle(r(30, 34, 42, 42), fill=(200, 200, 205, 255), outline=rand, width=int(2 * u))
    elif art == 'holzwand':
        for i in range(4):
            d.rectangle(r(8 + i * 14, 8, 20 + i * 14, 64), fill=(150 + i * 8, 104, 56, 255), outline=rand, width=int(2.5 * u))
        d.rectangle(r(6, 22, 66, 30), fill=(110, 76, 40, 255), outline=rand, width=int(2 * u))
        d.rectangle(r(6, 44, 66, 52), fill=(110, 76, 40, 255), outline=rand, width=int(2 * u))
    elif art == 'holzboden':
        for i in range(4):
            d.rectangle(r(6, 8 + i * 15, 66, 21 + i * 15), fill=(170 - i * 6, 124, 70, 255), outline=rand, width=int(2 * u))
            d.line([(16 + i * 12) * u, (8 + i * 15) * u, (16 + i * 12) * u, (21 + i * 15) * u], fill=rand, width=int(1.5 * u))
    else:
        raise ValueError(f'Unbekanntes prozedurales Icon: {art}')
    return bild.resize((groesse, groesse), Image.LANCZOS)


def faerbe(bild, faktoren):
    """Einfärben: jeden Farbkanal mit einem Faktor multiplizieren (z. B. Stein → rostiges Eisenerz)."""
    daten = np.asarray(bild).astype(np.float32)
    daten[..., :3] = np.clip(daten[..., :3] * np.array(faktoren, dtype=np.float32), 0, 255)
    return Image.fromarray(daten.astype(np.uint8), 'RGBA')


def baue_items():
    icons = {}
    for def_id, (quelle, relativ, welt, *rest) in ITEMS.items():
        if quelle == 'prozedural':
            icons[def_id] = (zeichne_prozedural(relativ, ITEM_ICON_GROESSE), welt)
            continue
        pfad = finde(lade(quelle), relativ)
        bild = rendere_svg(pfad, ITEM_ICON_GROESSE) if pfad.suffix == '.svg' else Image.open(pfad).convert('RGBA')
        if rest:
            bild = faerbe(bild, rest[0])
        bild = bild.crop(bild.getchannel('A').getbbox())
        bild.thumbnail((ITEM_ICON_GROESSE, ITEM_ICON_GROESSE), Image.LANCZOS)
        icons[def_id] = (bild, welt)
    spalten = 8
    zeilen = math.ceil(len(icons) / spalten)
    blatt = Image.new('RGBA', (spalten * ITEM_ICON_GROESSE, zeilen * ITEM_ICON_GROESSE), (0, 0, 0, 0))
    atlas = {}
    for i, (def_id, (bild, welt)) in enumerate(icons.items()):
        x = (i % spalten) * ITEM_ICON_GROESSE + (ITEM_ICON_GROESSE - bild.width) // 2
        y = (i // spalten) * ITEM_ICON_GROESSE + (ITEM_ICON_GROESSE - bild.height) // 2
        blatt.paste(bild, (x, y))
        atlas[def_id] = {'x': x, 'y': y, 'b': bild.width, 'h': bild.height, 'weltGroesse': welt}
    blatt.save(ZIEL / 'items.webp', 'WEBP', quality=92, method=6)
    print(f'    {len(icons)} Item-Icons')
    return {'bild': 'items.webp', 'icons': atlas}


def baue_umgebung():
    basis = lade('kenney_tds')
    blatt_quelle = Image.open(finde(basis, 'Tilesheet/tilesheet_complete.png')).convert('RGBA')
    k = KENNEY_KACHEL

    def ausschnitt(sp, ze, b=1, h=1):
        return blatt_quelle.crop((sp * k, ze * k, (sp + b) * k, (ze + h) * k))

    teile = []  # (name, bild)
    for name, varianten in BODEN.items():
        for i, (sp, ze) in enumerate(varianten):
            teile.append((f'boden_{name}_{i}', ausschnitt(sp, ze)))
    for name, (sp, ze, b, h) in OBJEKTE.items():
        bild = ausschnitt(sp, ze, b, h)
        if name in BLUT_OBJEKTE:
            a = np.asarray(bild).astype(np.float32)
            hell = a[..., :3].mean(axis=2, keepdims=True) / 255
            rot = np.concatenate([110 + 60 * hell, 10 + 10 * hell, 12 + 10 * hell], axis=2)
            bild = Image.fromarray(np.concatenate([rot, a[..., 3:4] * 0.85], axis=2).astype(np.uint8), 'RGBA')
        teile.append((name, bild))
    for name, (quelle, relativ) in EINZEL_OBJEKTE.items():
        teile.append((name, Image.open(finde(lade(quelle), relativ)).convert('RGBA')))

    # Einfaches Zeilen-Packen (Regale), 2 px Abstand gegen Farbbluten
    breite_max, abstand = 1024, 2
    x = y = zeilen_hoehe = 0
    positionen = []
    for name, bild in sorted(teile, key=lambda t: -t[1].height):
        if x + bild.width > breite_max:
            x, y, zeilen_hoehe = 0, y + zeilen_hoehe + abstand, 0
        positionen.append((name, bild, x, y))
        x += bild.width + abstand
        zeilen_hoehe = max(zeilen_hoehe, bild.height)
    blatt = Image.new('RGBA', (breite_max, y + zeilen_hoehe), (0, 0, 0, 0))
    atlas = {'boden': {}, 'objekte': {}}
    for name, bild, px, py in positionen:
        blatt.paste(bild, (px, py))
        rahmen = {'x': px, 'y': py, 'b': bild.width, 'h': bild.height}
        if name.startswith('boden_'):
            _, art, _ = name.split('_')
            atlas['boden'].setdefault(art, []).append(rahmen)
        else:
            atlas['objekte'][name] = rahmen
    blatt.save(ZIEL / 'umgebung.webp', 'WEBP', quality=92, method=6)
    print(f'    {len(atlas["boden"])} Bodenarten, {len(atlas["objekte"])} Objekte')
    return {'bild': 'umgebung.webp', 'kachelGroesse': k, **atlas}


def baue_3d_figuren():
    """3D-Figurenmodell (FBX) + Hauttexturen kopieren. Die Animationen extrahiert baue_3d.mjs."""
    basis = lade('kenney_ac3')
    ziel = ZIEL / '3d'
    (ziel / 'skins').mkdir(parents=True, exist_ok=True)
    shutil.copy(finde(basis, 'Model/characterMedium.fbx'), ziel / 'figur.fbx')
    for skin in ['humanMaleA', 'humanFemaleA', 'zombieMaleA', 'zombieFemaleA']:
        Image.open(finde(basis, f'Skins/{skin}.png')).convert('RGB').save(ziel / 'skins' / f'{skin}.webp', 'WEBP', quality=90)
    print('    3D-Figur + 4 Skins')
    return {'modell': '3d/figur.fbx', 'skins': {n: f'3d/skins/{n}.webp' for n in ['humanMaleA', 'humanFemaleA', 'zombieMaleA', 'zombieFemaleA']},
            'animationen': '3d/animationen.json'}


def schreibe_lizenzen():
    zeilen = ['# Grafik-Lizenzen', '', 'Alle Grafiken stammen aus frei nutzbaren Paketen. '
              'Bei **CC-BY** ist die Namensnennung Pflicht (steht auch im Spiel unter "Credits").', '',
              '| Paket | Urheber | Lizenz | Verwendet für |', '|---|---|---|---|']
    for paket, urheber, lizenz, url, zweck in LIZENZEN:
        zeilen.append(f'| [{paket}]({url}) | {urheber} | {lizenz} | {zweck} |')
    (ZIEL / 'LIZENZEN.md').write_text('\n'.join(zeilen) + '\n', encoding='utf-8')
    return [{'paket': p, 'urheber': u, 'lizenz': l, 'url': url} for p, u, l, url, _ in LIZENZEN]


def main():
    if ZIEL.exists():
        shutil.rmtree(ZIEL)
    ZIEL.mkdir(parents=True)
    print('Gegenstände …')
    items = baue_items()
    print('Umgebung …')
    umgebung = baue_umgebung()
    print('3D-Figuren …')
    figuren3d = baue_3d_figuren()
    atlas = {'version': 2, 'items': items, 'umgebung': umgebung, 'figuren3d': figuren3d,
             'lizenzen': schreibe_lizenzen()}
    (ZIEL / 'atlas.json').write_text(json.dumps(atlas, ensure_ascii=False, indent=1), encoding='utf-8')
    gesamt = sum(p.stat().st_size for p in ZIEL.rglob('*') if p.is_file())
    print(f'Fertig: {ZIEL.relative_to(WURZEL)} ({gesamt / 1024 / 1024:.1f} MB)')


if __name__ == '__main__':
    main()

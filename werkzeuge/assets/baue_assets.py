"""
Asset-Pipeline: lädt freie Grafikpakete herunter, schneidet zu, verkleinert, packt Spritesheets (WebP)
und schreibt client/assets/atlas.json + client/assets/LIZENZEN.md.

Nur nötig, wenn Grafiken hinzukommen oder sich ändern – die fertigen Dateien liegen im Repo.

Einmalig einrichten:
    python3 -m venv .venv
    .venv/bin/pip install -r werkzeuge/assets/anforderungen.txt
Ausführen:
    .venv/bin/python werkzeuge/assets/baue_assets.py

Downloads werden in werkzeuge/assets/.cache zwischengespeichert (gitignored).
"""
import glob
import io
import json
import math
import re
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
    'survivor': OGA + 'Top_Down_Survivor_2.zip',
    'zombie': OGA + 'tds_zombie.zip',
    'kenney_tds': 'https://kenney.nl/media/pages/assets/top-down-shooter/230204340a-1677694684/kenney_top-down-shooter.zip',
    'kenney_items': OGA + 'kenney_genericItems_updatedCross.zip',
    'kenney_racing': 'https://kenney.nl/media/pages/assets/racing-pack/c4cd68480a-1677662443/kenney_racing-pack.zip',
    'props': OGA + 'survival_props_pack_free.zip',
    'guns': OGA + 'guns_gameassets.zip',
    'glitch_food': OGA + 'food_0.7z',
    'glitch_drink': OGA + 'drink.7z',
}

LIZENZEN = [
    ('Animated Top Down Survivor Player', 'rileygombart', 'CC-BY 3.0',
     'https://opengameart.org/content/animated-top-down-survivor-player', 'Spielerfigur (alle Animationen)'),
    ('Animated Top Down Zombie', 'rileygombart', 'CC0', 'https://opengameart.org/content/animated-top-down-zombie', 'Zombie'),
    ('Top-down Shooter', 'Kenney (kenney.nl)', 'CC0', 'https://kenney.nl/assets/top-down-shooter', 'Böden, Möbel, Pflanzen'),
    ('Racing Pack', 'Kenney (kenney.nl)', 'CC0', 'https://kenney.nl/assets/racing-pack', 'Autos, Pylonen, Ölflecken'),
    ('Generic Items', 'Kenney (kenney.nl)', 'CC0', 'https://opengameart.org/content/generic-items', 'Erste-Hilfe-Kasten, Messer, Beil'),
    ('Free Survival Props Pack', 'Olga Bikmullina (http://ahninniah.graphics)', 'CC-BY 3.0',
     'https://opengameart.org/content/free-survival-props-pack', 'Verband, Pillen, Hammer, Machete, Schrotpatronen'),
    ('2D Guns', 'opengameart.org/content/2d-guns', 'CC0', 'https://opengameart.org/content/2d-guns', 'Pistole, Schrotflinte, Munitionsbox'),
    ('Glitch Food & Drink Items', 'Tiny Speck (Glitch)', 'CC0',
     'https://opengameart.org/content/glitch-food-drink-items-svg', 'Essen & Getränke'),
]

# ---------------------------------------------------------------------------
# Figuren

SURVIVOR_ROH = 'Top_Down_Survivor'
# Ausrüstung → Aktion → Ordner im Survivor-Paket
SURVIVOR_ANIMATIONEN = {
    'taschenlampe': {'idle': 'flashlight/idle', 'laufen': 'flashlight/move', 'nahkampf': 'flashlight/meleeattack'},
    'pistole': {'idle': 'handgun/idle', 'laufen': 'handgun/move', 'schiessen': 'handgun/shoot',
                'nachladen': 'handgun/reload', 'nahkampf': 'handgun/meleeattack'},
    'schrotflinte': {'idle': 'shotgun/idle', 'laufen': 'shotgun/move', 'schiessen': 'shotgun/shoot',
                     'nachladen': 'shotgun/reload', 'nahkampf': 'shotgun/meleeattack'},
    'messer': {'idle': 'knife/idle', 'laufen': 'knife/move', 'nahkampf': 'knife/meleeattack'},
}
SURVIVOR_FUESSE = {'stehen': 'feet/idle', 'gehen': 'feet/walk', 'rennen': 'feet/run',
                   'seitlich_links': 'feet/strafe_left', 'seitlich_rechts': 'feet/strafe_right'}
# Kopfmitte im Referenzbild (handgun/idle, Frame 0) – von Hand vermessen
SURVIVOR_REFERENZ = ('handgun/idle', (100, 121))
ZOMBIE_REFERENZ = ('idle', (97, 121))

FPS = {'idle': 15, 'laufen': 24, 'schiessen': 20, 'nachladen': 20, 'nahkampf': 30, 'angriff': 18,
       'stehen': 1, 'gehen': 24, 'rennen': 30, 'seitlich_links': 24, 'seitlich_rechts': 24}
SCHLEIFE = {'schiessen': False, 'nachladen': False, 'nahkampf': False, 'angriff': False}

SPEICHER_MASSSTAB = 0.4          # Quellpixel → Spritesheet-Pixel
SURVIVOR_WELT_MASSSTAB = 0.21    # Quellpixel → Weltpixel (Schulterbreite ≈ 32 px)
ZOMBIE_WELT_MASSSTAB = 0.2

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


def frames_in(ordner, praefix=''):
    dateien = [p for p in ordner.glob(f'{praefix}*.png')]
    return sorted(dateien, key=lambda p: int(re.findall(r'(\d+)\.png$', p.name)[0]))


def als_grau_array(bild):
    a = np.asarray(bild.convert('RGBA')).astype(np.float32) / 255
    return a[..., :3] * a[..., 3:4] + 0.5 * (1 - a[..., 3:4])


def finde_kopf(referenz, ref_punkt, ziel, radius=26, suche=70):
    """Template-Matching: wo liegt der Kopf (Referenz-Ausschnitt) im Zielbild? Grob (Schritt 3), dann fein."""
    rx, ry = ref_punkt
    vorlage = referenz[ry - radius:ry + radius, rx - radius:rx + radius]
    h, w, _ = ziel.shape
    cx, cy = int(rx / referenz.shape[1] * w), int(ry / referenz.shape[0] * h)

    def fehler(x, y):
        return float(((ziel[y - radius:y + radius, x - radius:x + radius] - vorlage) ** 2).sum())

    def bester(kandidaten):
        return min(kandidaten, key=lambda p: fehler(*p))

    grob = bester([(x, y) for y in range(max(radius, cy - suche), min(h - radius, cy + suche), 3)
                   for x in range(max(radius, cx - suche), min(w - radius, cx + suche), 3)])
    return bester([(x, y) for y in range(max(radius, grob[1] - 3), min(h - radius, grob[1] + 4))
                   for x in range(max(radius, grob[0] - 3), min(w - radius, grob[0] + 4))])


def packe_animation(bilder, pivot, name, unterordner, welt_massstab):
    """Schneidet alle Frames auf gemeinsamen Rahmen zu, verkleinert und packt sie in ein Raster-Sheet."""
    groesse = bilder[0].size
    bilder = [b.convert('RGBA') if b.size == groesse else b.convert('RGBA').crop((0, 0) + groesse) for b in bilder]
    rahmen = None
    for b in bilder:
        box = b.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox()
        if box:
            rahmen = box if rahmen is None else (min(rahmen[0], box[0]), min(rahmen[1], box[1]),
                                                 max(rahmen[2], box[2]), max(rahmen[3], box[3]))
    links, oben, rechts, unten = rahmen
    fb = max(1, round((rechts - links) * SPEICHER_MASSSTAB))
    fh = max(1, round((unten - oben) * SPEICHER_MASSSTAB))
    spalten = min(len(bilder), max(1, math.ceil(math.sqrt(len(bilder) * fh / fb))))
    zeilen = math.ceil(len(bilder) / spalten)
    blatt = Image.new('RGBA', (spalten * fb, zeilen * fh), (0, 0, 0, 0))
    for i, b in enumerate(bilder):
        frame = b.crop(rahmen).resize((fb, fh), Image.LANCZOS)
        blatt.paste(frame, ((i % spalten) * fb, (i // spalten) * fh))
    datei = f'{unterordner}/{name}.webp'
    (ZIEL / unterordner).mkdir(parents=True, exist_ok=True)
    blatt.save(ZIEL / datei, 'WEBP', quality=WEBP_QUALITAET, method=6)
    return {
        'bild': datei, 'frames': len(bilder), 'spalten': spalten, 'frameBreite': fb, 'frameHoehe': fh,
        'pivotX': round((pivot[0] - links) * SPEICHER_MASSSTAB, 1),
        'pivotY': round((pivot[1] - oben) * SPEICHER_MASSSTAB, 1),
        'massstab': round(welt_massstab / SPEICHER_MASSSTAB, 4),
    }


def baue_survivor():
    basis = finde(lade('survivor'), SURVIVOR_ROH)
    ref_ordner, ref_punkt = SURVIVOR_REFERENZ
    referenz = als_grau_array(Image.open(frames_in(basis / ref_ordner)[0]))
    animationen = {}
    for ausruestung, aktionen in SURVIVOR_ANIMATIONEN.items():
        for aktion, ordner in aktionen.items():
            dateien = frames_in(basis / ordner)
            pivot = finde_kopf(referenz, ref_punkt, als_grau_array(Image.open(dateien[0])))
            eintrag = packe_animation([Image.open(d) for d in dateien], pivot, f'{ausruestung}_{aktion}',
                                      'figuren/survivor', SURVIVOR_WELT_MASSSTAB)
            eintrag.update(fps=FPS[aktion], schleife=SCHLEIFE.get(aktion, True))
            animationen[f'{ausruestung}_{aktion}'] = eintrag
            print(f'    survivor {ausruestung}_{aktion}: {eintrag["frames"]} Frames, Kopf {pivot}')
    fuesse = {}
    for aktion, ordner in SURVIVOR_FUESSE.items():
        dateien = frames_in(basis / ordner)
        bilder = [Image.open(d) for d in dateien]
        w, h = bilder[0].size
        eintrag = packe_animation(bilder, (w / 2, h / 2), f'fuesse_{aktion}', 'figuren/survivor', SURVIVOR_WELT_MASSSTAB)
        eintrag.update(fps=FPS[aktion], schleife=True)
        fuesse[aktion] = eintrag
    return {'animationen': animationen, 'fuesse': fuesse}


# Zombie-Varianten (siehe konfiguration.zombie.varianten) als umgefärbte Kopien
ZOMBIE_FARBEN = {
    'zombie': None,
    'zombie_laeufer': {'saettigung': 0.35, 'helligkeit': 1.1, 'toenung': (0.9, 0.98, 1.1)},  # blass, bläulich
    'zombie_brocken': {'saettigung': 0.9, 'helligkeit': 0.7, 'toenung': (1.15, 0.9, 0.8)},  # dunkel, rötlich
}


def faerbe(bild, saettigung, helligkeit, toenung):
    a = np.asarray(bild.convert('RGBA')).astype(np.float32)
    rgb = a[..., :3]
    grau = rgb.mean(axis=2, keepdims=True)
    rgb = (grau + (rgb - grau) * saettigung) * helligkeit * np.array(toenung, dtype=np.float32)
    return Image.fromarray(np.concatenate([np.clip(rgb, 0, 255), a[..., 3:4]], axis=2).astype(np.uint8), 'RGBA')


def baue_zombie():
    basis = finde(lade('zombie'), 'export')
    def dateien(aktion):
        return frames_in(basis, f'skeleton-{aktion}_')
    referenz = als_grau_array(Image.open(dateien('idle')[0]))
    figuren = {name: {'animationen': {}} for name in ZOMBIE_FARBEN}
    for aktion, quelle in [('idle', 'idle'), ('laufen', 'move'), ('angriff', 'attack')]:
        liste = dateien(quelle)
        if aktion == 'laufen':
            # Zombie schwankt beim Laufen → Drehpunkt = Mittelwert der Kopfpositionen
            punkte = [finde_kopf(referenz, ZOMBIE_REFERENZ[1], als_grau_array(Image.open(d))) for d in liste[::2]]
            pivot = (sum(p[0] for p in punkte) / len(punkte), sum(p[1] for p in punkte) / len(punkte))
        else:
            pivot = finde_kopf(referenz, ZOMBIE_REFERENZ[1], als_grau_array(Image.open(liste[0])))
        bilder = [Image.open(d).convert('RGBA') for d in liste]
        for name, farbe in ZOMBIE_FARBEN.items():
            varianten_bilder = bilder if farbe is None else [faerbe(b, **farbe) for b in bilder]
            eintrag = packe_animation(varianten_bilder, pivot, aktion, f'figuren/{name}', ZOMBIE_WELT_MASSSTAB)
            eintrag.update(fps=FPS[aktion], schleife=SCHLEIFE.get(aktion, True))
            figuren[name]['animationen'][aktion] = eintrag
        print(f'    zombie {aktion}: {len(liste)} Frames × {len(ZOMBIE_FARBEN)} Varianten, Drehpunkt {tuple(round(v) for v in pivot)}')
    return figuren


def rendere_svg(pfad, groesse):
    import cairosvg
    png = cairosvg.svg2png(url=str(pfad), output_width=groesse * 3)
    return Image.open(io.BytesIO(png)).convert('RGBA')


def baue_items():
    icons = {}
    for def_id, (quelle, relativ, welt) in ITEMS.items():
        pfad = finde(lade(quelle), relativ)
        bild = rendere_svg(pfad, ITEM_ICON_GROESSE) if pfad.suffix == '.svg' else Image.open(pfad).convert('RGBA')
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
    print('Figuren …')
    figuren = {'survivor': baue_survivor(), **baue_zombie()}
    print('Gegenstände …')
    items = baue_items()
    print('Umgebung …')
    umgebung = baue_umgebung()
    atlas = {'version': 1, 'figuren': figuren, 'items': items, 'umgebung': umgebung, 'lizenzen': schreibe_lizenzen()}
    (ZIEL / 'atlas.json').write_text(json.dumps(atlas, ensure_ascii=False, indent=1), encoding='utf-8')
    gesamt = sum(p.stat().st_size for p in ZIEL.rglob('*') if p.is_file())
    print(f'Fertig: {ZIEL.relative_to(WURZEL)} ({gesamt / 1024 / 1024:.1f} MB)')


if __name__ == '__main__':
    main()

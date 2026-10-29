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
import base64
import io
import json
import re
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
    ('Impact Sounds / RPG Audio', 'Kenney (kenney.nl)', 'CC0', 'https://kenney.nl/assets/impact-sounds', 'Geräusche: Hacken, Treffer, Türen (client/audio/samples)'),
    ('Zombie-Sounds & Gunshot Sounds', 'artisticdude, ianzazz, Tabasco (opengameart.org)', 'CC0', 'https://opengameart.org/content/zombies-sound-pack', 'Geräusche: Zombies, Pistole, Schrotflinte'),
    ('Glitch Food & Drink Items', 'Tiny Speck (Glitch)', 'CC0',
     'https://opengameart.org/content/glitch-food-drink-items-svg', 'Essen & Getränke, Holz'),
    # Nutzer-Upload (werkzeuge/assets/quellen/natur/*.glb): Quelle laut Projektinhaber: Stylized Nature MegaKit von Quaternius (CC0)
    ('Stylized Nature MegaKit (Gras)', 'Quaternius (quaternius.com)', 'CC0',
     'https://quaternius.com/packs/stylizednaturemegakit.html', '3D-Gras auf der Karte (client/assets/3d/natur)'),
]

# ---------------------------------------------------------------------------
# Grafik-Anträge aus dem Map-Editor (editor/, „Eigene → Neue Grafik“): werkzeuge/assets/editor_grafiken/*.grafik.json
# { format: 'browser-survival-grafik', id, name, art: 'objekt'|'item', lizenz, urheber, quelle (URL), zweck?, bild: 'data:image/png;base64,…',
#   b?, h? (Kacheln, nur Objekte), weltGroesse? (px, nur Items) }  → Bild landet im Atlas, Lizenz in LIZENZEN/Credits.
EDITOR_GRAFIKEN = WURZEL / 'werkzeuge' / 'assets' / 'editor_grafiken'


def lizenz_erlaubt(lizenz):
    """Nur CC0 und CC-BY (ohne SA/NC/ND) – Projektregel 6."""
    l = str(lizenz or '').strip().upper()
    return l == 'CC0' or (l.startswith('CC-BY') and not any(z in l for z in ('SA', 'NC', 'ND')))


def lies_editor_grafiken(ordner=EDITOR_GRAFIKEN):
    """Alle Grafik-Anträge prüfen und laden. Fehler (Lizenz, Pflichtfelder, Bild) brechen den Lauf mit klarer Meldung ab."""
    ergebnis = []
    if not ordner.exists():
        return ergebnis
    for datei in sorted(ordner.glob('*.grafik.json')):
        j = json.loads(datei.read_text(encoding='utf-8'))
        if j.get('format') != 'browser-survival-grafik':
            raise SystemExit(f'{datei.name}: kein Grafik-Antrag (format fehlt)')
        for feld in ('id', 'name', 'art', 'lizenz', 'urheber', 'quelle', 'bild'):
            if not j.get(feld):
                raise SystemExit(f'{datei.name}: Pflichtfeld "{feld}" fehlt')
        if not re.fullmatch(r'[a-z0-9_]{1,40}', j['id']):
            raise SystemExit(f'{datei.name}: id "{j["id"]}" ungültig (a–z, 0–9, _)')
        if not lizenz_erlaubt(j['lizenz']):
            raise SystemExit(f'{datei.name}: Lizenz "{j["lizenz"]}" nicht erlaubt – nur CC0 oder CC-BY')
        if j['art'] not in ('objekt', 'item'):
            raise SystemExit(f'{datei.name}: art muss "objekt" oder "item" sein')
        kopf, _, daten = str(j['bild']).partition(',')
        if not kopf.startswith('data:image/') or ';base64' not in kopf:
            raise SystemExit(f'{datei.name}: bild muss eine data:image/…;base64-URL sein')
        bild = Image.open(io.BytesIO(base64.b64decode(daten))).convert('RGBA')
        ergebnis.append({**j, 'pil': bild})
    return ergebnis


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
    'axt': ('prozedural', 'axt', 28),  # selbst gezeichnet: Holzstiel + Stahlblatt (das Kenney-Icon sah nicht nach Axt aus)
    'hacke': ('prozedural', 'hacke', 28),  # Gartenhacke fürs Feld
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
    'stoff': ('prozedural', 'stoff', 22),
    'falle': ('prozedural', 'falle', 26),
    'lagerfeuer': ('prozedural', 'lagerfeuer', 28),
    'werkbank': ('prozedural', 'werkbank', 30),
    'eisenbarren': ('prozedural', 'eisenbarren', 24),
    'verkohlt': ('prozedural', 'verkohlt', 22),
    'muell': ('prozedural', 'muell', 22),
    'schrott': ('prozedural', 'schrott', 24),
    'schmelzofen': ('prozedural', 'schmelzofen', 30),
    'bretter': ('kenney_items', 'PNG/Colored/genericItem_color_133.png', 26),
    'rucksack': ('props', 'PNG/256px/backpack.png', 28),
    # Runde 23: Kleidung – selbst gezeichnet (Form:Farbe, Farbe = gegenstaende.js `farbe`)
    'muetze': ('prozedural', 'kleidung:muetze:#8a2f2f', 18),
    'kapuzenpulli': ('prozedural', 'kleidung:pulli:#4f5f70', 24),
    'winterjacke': ('prozedural', 'kleidung:jacke:#2e4a6e', 26),
    'arbeitsweste': ('prozedural', 'kleidung:weste:#c8782a', 24),
    'handschuhe': ('prozedural', 'kleidung:handschuhe:#33302c', 18),
    'jeans': ('prozedural', 'kleidung:hose:#3d4f78', 24),
    'thermohose': ('prozedural', 'kleidung:hose:#26272c', 24),
    'stiefel': ('prozedural', 'kleidung:stiefel:#5a3c22', 20),
    'turnschuhe': ('prozedural', 'kleidung:schuhe:#d8d8d8', 20),
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
    elif art == 'axt':
        # schräger Holzstiel, Stahlblatt mit Schneide oben rechts
        d.line([14 * u, 64 * u, 48 * u, 18 * u], fill=(122, 82, 42, 255), width=int(7 * u))
        d.line([16 * u, 62 * u, 48 * u, 20 * u], fill=(160, 112, 62, 255), width=int(2.5 * u))
        d.polygon([(38 * u, 12 * u), (62 * u, 8 * u), (66 * u, 34 * u), (50 * u, 30 * u), (44 * u, 24 * u)], fill=(176, 184, 194, 255), outline=rand)
        d.polygon([(62 * u, 8 * u), (66 * u, 34 * u), (60 * u, 30 * u), (58 * u, 12 * u)], fill=(226, 232, 240, 255))
        d.rectangle(r(40, 14, 46, 28), fill=(96, 100, 108, 255), outline=rand)
    elif art == 'hacke':
        # langer Stiel mit abgewinkeltem Hackenblatt
        d.line([12 * u, 66 * u, 52 * u, 14 * u], fill=(122, 82, 42, 255), width=int(6 * u))
        d.line([14 * u, 64 * u, 52 * u, 16 * u], fill=(160, 112, 62, 255), width=int(2 * u))
        d.polygon([(44 * u, 10 * u), (68 * u, 18 * u), (66 * u, 28 * u), (52 * u, 24 * u), (46 * u, 22 * u)], fill=(150, 156, 164, 255), outline=rand)
        d.line([52 * u, 24 * u, 66 * u, 27 * u], fill=(226, 232, 240, 255), width=int(2 * u))
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
    elif art == 'stoff':
        # zwei übereinandergelegte, gefaltete Stoffbahnen
        d.polygon([(8 * u, 40 * u), (50 * u, 28 * u), (66 * u, 44 * u), (24 * u, 58 * u)], fill=(120, 150, 205, 255), outline=rand)
        d.polygon([(8 * u, 40 * u), (24 * u, 58 * u), (24 * u, 64 * u), (8 * u, 46 * u)], fill=(86, 112, 164, 255), outline=rand)
        d.polygon([(24 * u, 58 * u), (66 * u, 44 * u), (66 * u, 50 * u), (24 * u, 64 * u)], fill=(98, 126, 182, 255), outline=rand)
        d.polygon([(12 * u, 30 * u), (52 * u, 16 * u), (64 * u, 30 * u), (24 * u, 44 * u)], fill=(232, 224, 200, 255), outline=rand)
        d.line([30 * u, 36 * u, 52 * u, 26 * u], fill=(190, 178, 150, 255), width=int(2 * u))
        d.line([22 * u, 32 * u, 44 * u, 24 * u], fill=(190, 178, 150, 255), width=int(2 * u))
    elif art == 'eisenbarren':
        # trapezförmiger Metallbarren mit Glanzkante
        d.polygon([(10 * u, 56 * u), (62 * u, 56 * u), (54 * u, 30 * u), (20 * u, 30 * u)], fill=(150, 158, 170, 255), outline=rand)
        d.polygon([(20 * u, 30 * u), (54 * u, 30 * u), (52 * u, 22 * u), (24 * u, 22 * u)], fill=(206, 214, 224, 255), outline=rand)
        d.polygon([(10 * u, 56 * u), (62 * u, 56 * u), (60 * u, 62 * u), (12 * u, 62 * u)], fill=(100, 106, 116, 255), outline=rand)
        d.line([26 * u, 34 * u, 46 * u, 34 * u], fill=(236, 240, 246, 200), width=int(2 * u))
    elif art == 'verkohlt':
        # schwarz verkohlter Klumpen mit Glutpunkten
        d.ellipse(r(10, 22, 62, 58), fill=(34, 30, 28, 255), outline=rand, width=int(2.5 * u))
        d.ellipse(r(22, 28, 44, 42), fill=(58, 52, 48, 255))
        for x, y in ((26, 44), (40, 36), (48, 48)):
            d.ellipse(r(x, y, x + 4, y + 4), fill=(210, 90, 30, 255))
    elif art == 'muell':
        # zerknüllte Dose und Tüte
        d.polygon([(10 * u, 50 * u), (22 * u, 24 * u), (46 * u, 28 * u), (52 * u, 56 * u), (30 * u, 62 * u)], fill=(150, 150, 120, 255), outline=rand)
        d.polygon([(30 * u, 30 * u), (60 * u, 24 * u), (64 * u, 48 * u), (40 * u, 52 * u)], fill=(120, 150, 120, 255), outline=rand)
        d.line([16 * u, 46 * u, 26 * u, 32 * u], fill=(210, 210, 190, 220), width=int(2 * u))
    elif art == 'schrott':
        # verbogene rostige Metallteile
        d.polygon([(8 * u, 54 * u), (40 * u, 20 * u), (50 * u, 30 * u), (20 * u, 62 * u)], fill=(140, 96, 64, 255), outline=rand)
        d.polygon([(30 * u, 58 * u), (56 * u, 36 * u), (66 * u, 48 * u), (44 * u, 66 * u)], fill=(120, 124, 130, 255), outline=rand)
        d.ellipse(r(16, 44, 24, 52), fill=(60, 40, 28, 255))
        d.line([40 * u, 22 * u, 48 * u, 30 * u], fill=(190, 140, 100, 255), width=int(2 * u))
    elif art == 'schmelzofen':
        # Steinofen mit glühender Öffnung und Schornstein
        d.rectangle(r(40, 4, 54, 24), fill=(110, 112, 118, 255), outline=rand, width=int(2.5 * u))
        d.rounded_rectangle(r(8, 18, 64, 66), radius=8 * u, fill=(138, 140, 146, 255), outline=rand, width=int(3 * u))
        d.rounded_rectangle(r(22, 36, 50, 62), radius=10 * u, fill=(40, 28, 24, 255), outline=rand, width=int(2.5 * u))
        d.polygon([(28 * u, 60 * u), (36 * u, 40 * u), (44 * u, 60 * u)], fill=(240, 120, 40, 255))
        d.polygon([(32 * u, 60 * u), (36 * u, 48 * u), (40 * u, 60 * u)], fill=(255, 214, 90, 255))
        for x, y in ((14, 26), (30, 22), (50, 28), (16, 52)):
            d.line([x * u, y * u, (x + 8) * u, y * u], fill=(100, 102, 108, 255), width=int(2 * u))
    elif art.startswith('kleidung:'):
        _, form, farbe = art.split(':')
        hell = tuple(min(255, int(farbe[i:i + 2], 16) + 40) for i in (1, 3, 5)) + (255,)
        dick = int(2.5 * u)
        if form == 'muetze':
            d.chord(r(12, 14, 60, 66), 180, 360, fill=farbe, outline=rand, width=dick)
            d.rounded_rectangle(r(10, 38, 62, 52), radius=4 * u, fill=hell, outline=rand, width=dick)
            d.ellipse(r(29, 4, 43, 18), fill=hell, outline=rand, width=dick)
        elif form in ('pulli', 'jacke', 'weste'):
            koerper = [(22, 12), (50, 12), (60, 22), (58, 66), (14, 66), (12, 22)]
            if form != 'weste':
                d.polygon([(p * u, q * u) for p, q in [(22, 12), (6, 22), (2, 52), (12, 54), (16, 30)]], fill=farbe, outline=rand)
                d.polygon([(p * u, q * u) for p, q in [(50, 12), (66, 22), (70, 52), (60, 54), (56, 30)]], fill=farbe, outline=rand)
            d.polygon([(p * u, q * u) for p, q in koerper], fill=farbe, outline=rand)
            if form == 'pulli':
                d.chord(r(24, 4, 48, 26), 0, 180, fill=hell, outline=rand, width=dick)
                d.rectangle(r(24, 46, 48, 56), fill=hell, outline=rand, width=int(1.5 * u))
            elif form == 'jacke':
                d.polygon([(p * u, q * u) for p, q in [(22, 12), (36, 24), (50, 12), (44, 8), (28, 8)]], fill=(220, 220, 214, 255), outline=rand)
                d.line([36 * u, 24 * u, 36 * u, 66 * u], fill=rand, width=int(2 * u))
            else:
                d.line([36 * u, 14 * u, 36 * u, 66 * u], fill=rand, width=int(2 * u))
                for y in (34, 46):
                    d.line([14 * u, y * u, 58 * u, y * u], fill=(235, 235, 120, 255), width=int(3 * u))
        elif form == 'hose':
            d.polygon([(p * u, q * u) for p, q in [(16, 6), (56, 6), (60, 68), (40, 68), (36, 26), (32, 68), (12, 68)]], fill=farbe, outline=rand)
            d.rectangle(r(16, 6, 56, 14), fill=hell, outline=rand, width=int(2 * u))
        elif form == 'handschuhe':
            for dx in (0, 30):
                d.rounded_rectangle(r(8 + dx, 18, 32 + dx, 60), radius=8 * u, fill=farbe, outline=rand, width=dick)
                d.rounded_rectangle(r(2 + dx, 30, 14 + dx, 44), radius=5 * u, fill=farbe, outline=rand, width=dick)
                d.rectangle(r(8 + dx, 52, 32 + dx, 62), fill=hell, outline=rand, width=int(2 * u))
        elif form in ('stiefel', 'schuhe'):
            oben = 10 if form == 'stiefel' else 34
            d.polygon([(p * u, q * u) for p, q in [(14, oben), (36, oben), (38, 44), (64, 50), (66, 62), (10, 62)]], fill=farbe, outline=rand)
            d.rectangle(r(10, 58, 66, 66), fill=(40, 34, 30, 255) if form == 'stiefel' else (250, 250, 250, 255), outline=rand, width=int(2 * u))
            if form == 'schuhe':
                for x in (30, 38, 46):
                    d.line([x * u, 42 * u, (x + 4) * u, 48 * u], fill=(200, 60, 60, 255), width=int(2 * u))
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
    for g in lies_editor_grafiken():
        if g['art'] != 'item':
            continue
        bild = g['pil'].copy()
        if bild.getchannel('A').getbbox():
            bild = bild.crop(bild.getchannel('A').getbbox())
        bild.thumbnail((ITEM_ICON_GROESSE, ITEM_ICON_GROESSE), Image.LANCZOS)
        icons[g['id']] = (bild, int(g.get('weltGroesse') or 22))
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
    for g in lies_editor_grafiken():
        if g['art'] == 'objekt':  # Draufsicht, auf b×h Kacheln skaliert
            groesse = (max(1, round(float(g.get('b') or 1) * k)), max(1, round(float(g.get('h') or 1) * k)))
            teile.append((g['id'], g['pil'].resize(groesse, Image.LANCZOS)))

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


GESICHT_URSPRUNG = (30, 20)  # linke obere Ecke des Gesichtsbereichs im 256er-Skin
GESICHT_GROESSE = (100, 60)


def zeichne_zombie_gesicht(basis, nr):
    """Legt auf einen Zombie-Skin eines von 4 abstoßenden Gesichtern (selbst gezeichnet, 8-fach überzeichnet)."""
    from PIL import ImageDraw, ImageFilter
    k = 8
    ox, oy = GESICHT_URSPRUNG
    ebene = Image.new('RGBA', (GESICHT_GROESSE[0] * k, GESICHT_GROESSE[1] * k), (0, 0, 0, 0))
    d = ImageDraw.Draw(ebene)

    def p(x, y):
        return ((x - ox) * k, (y - oy) * k)

    def ellipse(x, y, rx, ry, fill, outline=None):
        d.ellipse([*p(x - rx, y - ry), *p(x + rx, y + ry)], fill=fill, outline=outline, width=int(0.6 * k) if outline else 0)

    def linie(punkte, fill, breite):
        d.line([p(*q) for q in punkte], fill=fill, width=int(breite * k), joint='curve')

    def polygon(punkte, fill):
        d.polygon([p(*q) for q in punkte], fill=fill)

    dunkel = (14, 8, 8, 255)
    blut = (120, 8, 10, 235)
    blut_hell = (176, 20, 20, 240)
    zahn = (226, 214, 160, 255)
    eiter = (190, 200, 70, 230)
    fleisch = (150, 58, 66, 255)
    if nr == 0:  # Hohle Augen, fehlende Nase, schiefes Zahngrinsen
        for ex in (71, 87):
            ellipse(ex, 55, 5.2, 4.2, dunkel)
            ellipse(ex + 0.4, 55.4, 1.2, 1.2, (210, 40, 30, 255))
        ellipse(79, 62.5, 2.2, 2.8, dunkel)
        polygon([(69, 66), (73, 65), (79, 66.5), (85, 65), (90, 67), (88, 71), (79, 70), (71, 71)], dunkel)
        for i in range(8):
            x = 70.5 + i * 2.5
            polygon([(x, 66.6), (x + 1.1, 66.4), (x + 0.6, 69.2 + (i % 2) * 1.2)], zahn)
        for x, y, r in ((64, 50, 2.2), (95, 60, 2.6), (66, 64, 1.8), (92, 47, 1.6)):
            ellipse(x, y, r, r, eiter)
        linie([(75, 41), (76.5, 47)], blut, 0.9)
    elif nr == 1:  # Milchauge, leere Höhle, klaffende Wunde
        ellipse(71, 55, 5, 4.2, (226, 228, 214, 255), dunkel)
        linie([(68, 54), (71, 56), (74, 55)], (150, 130, 130, 200), 0.35)
        ellipse(87, 55, 5.4, 4.6, dunkel)
        linie([(87, 59), (87.6, 66), (87, 72)], blut, 1.1)
        polygon([(61, 46), (64, 45), (80, 62), (78, 65)], fleisch)
        linie([(62, 46), (79, 64)], blut, 1.5)
        for t in range(6):
            x = 63.5 + t * 2.9
            linie([(x - 1.2, 47.5 + t * 3.1), (x + 1.4, 45.8 + t * 3.1)], dunkel, 0.45)
        polygon([(72, 66), (76, 65.5), (86, 66), (84, 69), (74, 69)], dunkel)
        polygon([(70, 61), (74, 62), (73, 64)], zahn)  # Kiefer blitzt durch die Wunde
    elif nr == 2:  # Blutunterlaufene Augen, weit aufgerissenes Maul voll Blut
        for ex in (71, 87):
            ellipse(ex, 55, 5, 4, (232, 222, 214, 255), dunkel)
            for a in range(8):
                w = a * 0.785
                linie([(ex + 1.6 * math.cos(w), 55 + 1.4 * math.sin(w)), (ex + 4.6 * math.cos(w), 55 + 3.7 * math.sin(w))], (170, 20, 20, 230), 0.3)
            ellipse(ex, 55, 1.3, 1.3, dunkel)
        ellipse(79.5, 67.5, 8.2, 5.6, dunkel)
        for i in range(5):
            x = 73.5 + i * 3
            polygon([(x, 62.6), (x + 1.4, 62.8), (x + 0.7, 65.8)], zahn)
            polygon([(x + 0.4, 72.4), (x + 1.8, 72.4), (x + 1.1, 69.8)], zahn)
        ellipse(79.5, 69, 5, 2.6, blut)
        for x, w in ((74, 1.3), (79, 1.9), (84.5, 1.2)):
            linie([(x, 70), (x + 0.3, 74.5), (x, 78)], blut_hell, w)
        for x, y, r in ((68, 44, 1.5), (74, 42, 1.0), (92, 45, 1.8), (96, 52, 0.9)):
            ellipse(x, y, r, r, blut_hell)
    else:  # Zugenähter Mund, Maden in der Augenhöhle, verfaulte Wange mit Knochen
        ellipse(71, 55, 5.6, 4.6, dunkel)
        for x, y in ((69.5, 54.5), (71.5, 56), (72.5, 54), (70.2, 57)):
            ellipse(x, y, 0.9, 0.55, (236, 232, 200, 255))
        ellipse(87, 55, 4.4, 4.8, (230, 226, 210, 255), dunkel)
        ellipse(87.4, 55.4, 1.0, 1.0, dunkel)
        polygon([(92, 58), (98, 58), (98, 66), (93, 67), (90, 63)], (92, 40, 76, 230))  # verfaulte Wange
        polygon([(93, 60), (97, 60), (97, 65), (94, 65)], (214, 204, 176, 255))  # Wangenknochen
        for i in range(4):
            polygon([(93.2 + i * 1.0, 64.8), (93.9 + i * 1.0, 64.8), (93.5 + i * 1.0, 66.2)], zahn)
        linie([(69, 67), (90, 67)], dunkel, 0.9)
        for i in range(8):
            x = 70.5 + i * 2.6
            linie([(x, 64.6), (x + 0.4, 69.6)], dunkel, 0.45)
        ellipse(66, 47, 4, 2.4, (70, 40, 66, 200))
        ellipse(80, 43, 3.4, 1.8, (64, 44, 40, 190))
        linie([(60, 56), (66, 62)], blut, 0.8)
    ebene = ebene.resize(GESICHT_GROESSE, Image.LANCZOS)
    ergebnis = basis.convert('RGBA')
    ergebnis.alpha_composite(ebene, GESICHT_URSPRUNG)
    return ergebnis.convert('RGB')


def baue_3d_figuren():
    """3D-Figurenmodell (FBX) + Hauttexturen kopieren. Die Animationen extrahiert baue_3d.mjs."""
    basis = lade('kenney_ac3')
    ziel = ZIEL / '3d'
    (ziel / 'skins').mkdir(parents=True, exist_ok=True)
    shutil.copy(finde(basis, 'Model/characterMedium.fbx'), ziel / 'figur.fbx')
    for skin in ['humanMaleA', 'humanFemaleA', 'zombieMaleA', 'zombieFemaleA']:
        Image.open(finde(basis, f'Skins/{skin}.png')).convert('RGB').save(ziel / 'skins' / f'{skin}.webp', 'WEBP', quality=90)
    # Zombie-Gesichter: 4 abstoßende Varianten (je zwei auf dem männlichen und weiblichen Körper)
    basen = {n: Image.open(finde(basis, f'Skins/{n}.png')).convert('RGB') for n in ('zombieMaleA', 'zombieFemaleA')}
    for nr in range(4):
        zeichne_zombie_gesicht(basen['zombieMaleA' if nr % 2 == 0 else 'zombieFemaleA'], nr).save(ziel / 'skins' / f'zombieGesicht{nr}.webp', 'WEBP', quality=92)
    print('    3D-Figur + 4 Skins + 4 Zombie-Gesichter')
    return {'modell': '3d/figur.fbx', 'skins': {n: f'3d/skins/{n}.webp' for n in ['humanMaleA', 'humanFemaleA', 'zombieMaleA', 'zombieFemaleA', 'zombieGesicht0', 'zombieGesicht1', 'zombieGesicht2', 'zombieGesicht3']},
            'animationen': '3d/animationen.json'}


def schreibe_lizenzen():
    zeilen = ['# Grafik-Lizenzen', '', 'Alle Grafiken stammen aus frei nutzbaren Paketen. '
              'Bei **CC-BY** ist die Namensnennung Pflicht (steht auch im Spiel unter "Credits").', '',
              '| Paket | Urheber | Lizenz | Verwendet für |', '|---|---|---|---|']
    # Credits fortschreiben: Grafik-Anträge aus dem Map-Editor kommen dazu
    alle = LIZENZEN + [(g['name'], g['urheber'], g['lizenz'], g['quelle'], g.get('zweck') or f'Map-Editor: {g["id"]}') for g in lies_editor_grafiken()]
    for paket, urheber, lizenz, url, zweck in alle:
        zeilen.append(f'| [{paket}]({url}) | {urheber} | {lizenz} | {zweck} |')
    (ZIEL / 'LIZENZEN.md').write_text('\n'.join(zeilen) + '\n', encoding='utf-8')
    return [{'paket': p, 'urheber': u, 'lizenz': l, 'url': url} for p, u, l, url, _ in alle]


def nur_items():
    """`python3 baue_assets.py --nur-items`: nur items.webp + atlas.items neu (lässt eigene/ und 3d/ in Ruhe)."""
    pfad = ZIEL / 'atlas.json'
    atlas = json.loads(pfad.read_text(encoding='utf-8'))
    atlas['items'] = baue_items()
    pfad.write_text(json.dumps(atlas, ensure_ascii=False, indent=1), encoding='utf-8')


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
    import sys
    nur_items() if '--nur-items' in sys.argv else main()

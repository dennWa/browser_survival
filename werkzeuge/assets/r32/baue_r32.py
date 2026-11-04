"""Runde 32: Nutzer-Modellpakete (`verteilen bitte/_entpackt/*`, `verteilen bitte/_sketchfab/*.glb`) → Spiel-Assets.

Aufruf (aus dem Projektordner):  python -I werkzeuge/assets/r32/baue_r32.py [abschnitt …]
Abschnitte: baeume steine gras essen steak waffen tiere deko   (ohne Angabe: alle)

Quellen liegen NICHT im Repo (gitignored `verteilen bitte/`): ZIPs entpacken nach `_entpackt/<Paket>/`, Sketchfab-Sammlung per
API nach `_sketchfab/<uid>.glb` laden (siehe ki/runde32.md). Ausgaben:
  client/assets/3d/baeume/<name>.glb  (+ baeume.json)   Bäume/Büsche im Spielformat: Mesh „rinde“ (Vertexfarben) + „laub“ (Alpha-Textur)
  client/assets/3d/natur/*.glb (+ natur.json)            Gras/Blumen (Karten-Büschel mit gemeinsamer Atlas-Textur)
  client/assets/eigene/r32_*.glb                         Items, Steine/Erz, Tiere, Waffen, Deko (Vertexfarben bzw. Textur)
Mehrfach-Modelle (Steak-Reihe, Waffen-Sammelmesh, Baumreihe) werden in Einzelobjekte zerlegt.
"""
import sys, os, json, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from PIL import Image
import modellwerk as mw

WURZEL = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
E = os.path.join(WURZEL, 'verteilen bitte', '_entpackt')
S = os.path.join(WURZEL, 'verteilen bitte', '_sketchfab')
BAEUME = os.path.join(WURZEL, 'client', 'assets', '3d', 'baeume')
NATUR = os.path.join(WURZEL, 'client', 'assets', '3d', 'natur')
EIGENE = os.path.join(WURZEL, 'client', 'assets', 'eigene')
SF = {
    'wald': '5ff5a51e74324845a4e4905f182dfb2b', 'felsen': '9823ec262054408dbe26f6ddb9c0406e', 'erz': 'dea7557c1db14b5fad3dd3911063f146',
    'figuren': 'f2b0b976ecdd47b49254b512c7f152b3', 'essen': '969b4e6ef7444650ba8a22a46d57ff43', 'faesser': '99483dc2d26548e1955898b063ad87cb',
    'zelt': 'f3f5283fa07a47e798017bc3c055fe88', 'eichenstamm': 'c9145fe203b54ebe85422b01fe539575', 'staemme': '767715600a334e76940c7e09f3f4cb7f',
}
protokoll = []


def sf(name):
    return os.path.join(S, SF[name] + '.glb')


def z_hoch(v):
    """Z-up → Y-up (x, y, z) → (x, z, -y)"""
    return np.stack([v[:, 0], v[:, 2], -v[:, 1]], 1)


def normiere(v, ziel_hoehe=None, ziel_groesse=None, boden=True):
    """Mitte auf x/z = 0, Unterkante y = 0, Maßstab auf Höhe (y) oder größte Ausdehnung."""
    mn, mx = v.min(0), v.max(0)
    v = v - np.array([(mn[0] + mx[0]) / 2, mn[1] if boden else (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2])
    if ziel_hoehe:
        v = v * (ziel_hoehe / max(np.ptp(v[:, 1]), 1e-9))
    elif ziel_groesse:
        v = v * (ziel_groesse / max(np.ptp(v, axis=0).max(), 1e-9))
    return v


def schreibe(pfad, meshes, **k):
    groesse = mw.schreibe_glb(pfad, meshes, **k)
    tris = sum(len(m['f']) for m in meshes)
    protokoll.append(f'{os.path.relpath(pfad, WURZEL)}  {tris} Dreiecke  {groesse // 1024} KB')
    return groesse


def mesh(name, v, f, fc=None, uv=None, bild=None, mat=None, alpha=False):
    return {'name': name, 'v': v, 'f': f, 'fc': fc, 'uv': uv, 'bild': bild, 'mat': mat, 'alpha': alpha}


def nach_label(teil, lab):
    """Teil (v, f, fuv, fc) → Liste je Label von (v, f, fuv|None, fc)."""
    fc = mw.farben_backen(teil)
    aus = []
    for i in range(int(lab.max()) + 1):
        m = lab == i
        v, f = mw.teilmesh(teil['v'], teil['f'], m)
        aus.append((v, f, None if teil.get('fuv') is None else teil['fuv'][m], fc[m]))
    return aus


def rgba(farbe_pfad, alpha_pfad, groesse=256):
    b = Image.open(farbe_pfad).convert('RGB')
    a = Image.open(alpha_pfad).convert('L').resize(b.size)
    b.putalpha(a)
    return b.resize((groesse, groesse), Image.LANCZOS)


# ---------------------------------------------------------------------------------------------------------------- Bäume
def baeume():
    index = {}

    def baum(name, rinde, laub, hoehe, quelle):
        """rinde/laub: Liste (v, f, fuv, fc) in gemeinsamen Koordinaten (y oben). Stammfuß → Ursprung, Höhe in m."""
        alle = np.vstack([t[0] for t in rinde + laub])
        r_pts = np.vstack([t[0] for t in rinde]) if rinde else alle
        fuss = np.array([np.median(r_pts[:, 0]), alle[:, 1].min(), np.median(r_pts[:, 2])])
        s = hoehe / np.ptp(alle[:, 1])
        meshes = []
        if rinde:
            v = np.vstack([(t[0] - fuss) * s for t in rinde]); f = []; fc = []; o = 0
            for t in rinde:
                f.append(t[1] + o); fc.append(t[3]); o += len(t[0])
            meshes.append(mesh('rinde', v, np.vstack(f), np.vstack(fc), mat='rinde'))
        if laub:
            v = np.vstack([(t[0] - fuss) * s for t in laub]); f = []; uv = []; o = 0
            for t in laub:
                f.append(t[1] + o); uv.append(t[2]); o += len(t[0])
            f = np.vstack(f)
            meshes.append(mesh('laub', v, f, np.ones((len(f), 3)), np.vstack(uv), laub_bild[0], mat='laub', alpha=True))
        groesse = schreibe(os.path.join(BAEUME, name + '.glb'), meshes)
        pts = np.vstack([m['v'] for m in meshes])
        index[name] = {'datei': name + '.glb', 'quelle': quelle, 'hoehe': round(float(np.ptp(pts[:, 1])), 3),
                       'breite': round(float(max(np.ptp(pts[:, 0]), np.ptp(pts[:, 2]))), 3),
                       'dreiecke': int(sum(len(m['f']) for m in meshes)), 'laub': bool(laub), 'bytes': groesse}

    # 1) Trees Low Poly (luxe3dworld): 17 Laubbäume in einer Reihe (Z-up, cm), Rinde model_0, Laub model_1 (2..17 = Dubletten)
    q = os.path.join(E, 'Trees Low Poly')
    laub_bild = [rgba(os.path.join(q, 'Trees_Low_Poly_Leaf_Texture.png'), os.path.join(q, 'Trees_Low_Poly_Leaf_Texture_Alpha.png'))]
    rinde = mw.lade_obj(os.path.join(q, 'model_0.obj'), Image.open(os.path.join(q, 'Trees_Low_Poly_Bark.png')))[0]
    laub = mw.lade_obj(os.path.join(q, 'model_1.obj'))[0]
    for t in (rinde, laub):
        t['v'] = z_hoch(t['v'])
    rinde = mw.ohne_splitter(rinde, 100, 0.05)
    laub = mw.ohne_splitter(laub, 100, 0.05)
    # Stämme: Lücken > 80 cm zwischen den Rinden-Punkten (x) trennen die Bäume
    x = np.sort(rinde['v'][np.unique(rinde['f']), 0])
    schnitte = [(x[i] + x[i + 1]) / 2 for i in np.nonzero(np.diff(x) > 80)[0]]
    r_bin = np.digitize(rinde['v'][rinde['f']].mean(1)[:, 0], schnitte)
    r_teile = nach_label(rinde, r_bin)
    gruppen = [[i] for i in range(len(r_teile))]
    mitten = np.array([t[0][:, 0].mean() for t in r_teile])
    l_lab = mw.komponenten(mw.verschweisse(laub['v'], laub['f']))
    l_teile = nach_label({**laub, 'farbe': [1, 1, 1]}, l_lab)
    laub_je = [[] for _ in gruppen]
    for i, t in enumerate(l_teile):
        # Blattkarten um ihre Mitte vergrößern → dichtere Krone (Original wirkt von oben sehr licht)
        m = t[0].mean(0)
        l_teile[i] = t = ((t[0] - m) * 1.7 + m, t[1], t[2], t[3])
        laub_je[int(np.argmin(np.abs(mitten - t[0][:, 0].mean())))].append(t)
    for n, g in enumerate(gruppen):
        baum(f'laubbaum_{n:02d}', [r_teile[i] for i in g], laub_je[n], 7.2 + (n % 4) * 0.6, 'Trees Low Poly (luxe3dworld) #%d' % n)

    # 2) Low Poly Forest Tree Pack (99.Miles): Kiefern = Tree_Trunk_01* + Tree_Branches_01* (Alpha-Karten), Trunk_02 + Branches_02 = Herbstkiefer
    wald = mw.lade_glb(sf('wald'))
    staemme = [t for t in wald if t['name'].startswith('Tree_Trunk')]
    aeste = [t for t in wald if t['name'].startswith('Tree_Branches')]
    for i, st in enumerate(sorted(staemme, key=lambda t: t['name'])):
        mitte = st['v'][:, [0, 2]].mean(0)
        ast = min(aeste, key=lambda a: np.linalg.norm(a['v'][:, [0, 2]].mean(0) - mitte))
        bild = ast['bild'].convert('RGBA').resize((256, 256), Image.LANCZOS)
        laub_bild[0] = bild
        r = (st['v'], st['f'], st['fuv'], mw.farben_backen(st))
        l = (ast['v'], ast['f'], ast['fuv'], None)
        name = 'kiefer_herbst' if 'Branches_02' in ast['name'] else f'kiefer_n{i}'
        baum(name, [r], [l], (10.5 + i * 0.7) if 'herbst' not in name else 8.5, f'Low Poly Forest Tree Pack (99.Miles) {st["name"]}')
    # 3) Hintergrund-Bäume desselben Packs: hohe = Nadelbäume (nur Rinde/Vertexfarben), kleine = Büsche
    atlas = [t for t in wald if t['name'].startswith('Background_Tree_Atlas')]
    nadel = busch = 0
    for t in sorted(atlas, key=lambda t: t['name']):
        sz = np.ptp(t['v'], axis=0)
        fc = mw.farben_backen(t)
        if sz[1] > 15:
            baum(f'nadel_{nadel}', [(t['v'], t['f'], None, fc)], [], 11 + nadel % 3, f'Low Poly Forest Tree Pack (99.Miles) {t["name"]}')
            nadel += 1
        elif sz[1] > 1.5 and sz[0] / sz[1] < 2:
            baum(f'busch_{busch}', [(t['v'], t['f'], None, fc)], [], 1.2 + 0.25 * (busch % 3), f'Low Poly Forest Tree Pack (99.Miles) {t["name"]}')
            busch += 1
    with open(os.path.join(BAEUME, 'baeume.json'), 'w', encoding='utf-8') as d:
        json.dump(index, d, indent=1, ensure_ascii=False)
        d.write('\n')


# --------------------------------------------------------------------------------------------------------- Steine & Erz
def steine():
    felsen = [t for t in mw.lade_glb(sf('wald')) if t['name'].startswith('Rocks')]
    erz = {t['name']: t for t in mw.lade_glb(sf('erz'))}
    aus = []
    # Steine: 5 Felsen des Wald-Packs (Fels-Textur → Vertexfarben), Breite 1 → im Spiel skaliert
    for i, t in enumerate(sorted(felsen, key=lambda t: t['name'])[:6]):
        aus.append(mesh(f'stein_{i}', normiere(t['v'], ziel_groesse=1.0), t['f'], mw.farben_backen(t)))
    schreibe(os.path.join(EIGENE, 'r32_steine.glb'), aus)
    # Eisenerz (rotes Erz): grauer Fels (Object_9) + rote Erzbrocken (Object_16) außen herum
    fels = erz['Object_9']; rot = erz['Object_17']  # Object_17 = rote Brocken („metall“), Object_16 = pink
    fv = normiere(fels['v'], ziel_groesse=1.0)
    rv = normiere(rot['v'], ziel_groesse=1.25)
    rv[:, 1] -= 0.02
    v = np.vstack([fv, rv]); f = np.vstack([fels['f'], rot['f'] + len(fv)])
    fc = np.vstack([mw.farben_backen(fels) * 0.85, mw.farben_backen(rot)])
    schreibe(os.path.join(EIGENE, 'r32_eisenerz.glb'), [mesh('eisenerz', normiere(v, ziel_groesse=1.0), f, fc)], metall=0.3, rauheit=0.6)
    # Items: Stein (kleiner Fels), Eisenerz (rote Brocken)
    t = erz['Object_7']
    items = [mesh('stein', normiere(t['v'], ziel_groesse=1.0), t['f'], mw.farben_backen(t)),
             mesh('eisenerz', normiere(erz['Object_17']['v'], ziel_groesse=1.0), erz['Object_17']['f'], mw.farben_backen(erz['Object_17']))]
    schreibe(os.path.join(EIGENE, 'r32_rohstoffe.glb'), items)
    # Kristalle/übrige Erze als Deko
    deko = []
    for n in ['Object_15', 'Object_2', 'Object_3', 'Object_4', 'Object_5', 'Object_6', 'Object_8', 'Object_10', 'Object_11', 'Object_12', 'Object_13']:
        if n in erz:
            t = erz[n]
            schreibe(os.path.join(EIGENE, f'r32_erzpack_{n.lower()}.glb'), [mesh(n, normiere(t['v'], ziel_groesse=1.0), t['f'], mw.farben_backen(t))])
    # Felsen-Pack (michaelhooper): ein Mesh mit mehreren Felsen → zerlegen
    t = mw.lade_glb(sf('felsen'))[0]
    lab = mw.gruppiere_nah(t['v'], t['f'], mw.komponenten(mw.verschweisse(t['v'], t['f'])), 0.01)
    for i, (v, f, _, fc) in enumerate(nach_label(t, lab)):
        if len(f) < 20:
            continue
        schreibe(os.path.join(EIGENE, f'r32_fels_{i}.glb'), [mesh(f'fels_{i}', normiere(v, ziel_groesse=1.0), f, fc)])


# ---------------------------------------------------------------------------------------------------------------- Gras
def gras():
    """Neuer Rasen: Büschel aus gekreuzten Karten mit dem Gras-Atlas (Gras, Blumen, Steine und Pilze – VIS-All), grau → grün eingefärbt."""
    q = os.path.join(E, 'Gras, Blumen, Steine und Pilze - Demo')
    farbe = Image.open(os.path.join(q, 'Gras_Col.png')).convert('L').resize((512, 512), Image.LANCZOS)
    maske = Image.open(os.path.join(q, 'Gras_Col_Maske.png')).convert('L').resize((512, 512), Image.LANCZOS)
    g = np.asarray(farbe, float) / 255.0
    tint = np.zeros((512, 512, 3))
    # Grundton Grün; Blüten-Bereiche (rechts oben/Mitte, unten links) weiß/gelb/lila
    tint[:] = [0.36, 0.62, 0.2]
    def bereich(x0, y0, x1, y1, rgb):
        tint[int(y0 * 512):int(y1 * 512), int(x0 * 512):int(x1 * 512)] = rgb
    bereich(0.64, 0.0, 1.0, 0.25, [1.0, 0.95, 0.9])    # weiße Blüten oben rechts
    bereich(0.55, 0.25, 0.78, 0.62, [1.0, 0.85, 0.25])  # gelbe/weiße Blüten Mitte
    bereich(0.0, 0.66, 0.34, 1.0, [1.0, 0.8, 0.2])      # Sonnenblume unten links
    bereich(0.34, 0.66, 0.55, 0.78, [0.4, 0.62, 0.22])
    bereich(0.34, 0.78, 0.55, 1.0, [0.7, 0.45, 0.85])   # lila Blüte
    rgb = np.clip(tint * (0.45 + 0.7 * g[..., None]), 0, 1)
    bild = Image.fromarray((rgb * 255).astype(np.uint8), 'RGB')
    bild.putalpha(maske)

    def karten(uvbox, breite, hoehe, n=3, neigung=0.55):
        u0, v0, u1, v1 = uvbox  # Bild-Koordinaten (0 oben) → glTF-UV später gespiegelt
        vs, fs, uvs = [], [], []
        for k in range(n):
            w = np.pi * k / n
            dx, dz = np.cos(w) * breite / 2, np.sin(w) * breite / 2
            # Karten fächern nach außen (abwechselnd vor/zurück geneigt) – sonst sieht man sie von oben nur als Strich
            nx, nz = -np.sin(w) * neigung * hoehe * (1 if k % 2 else -1), np.cos(w) * neigung * hoehe * (1 if k % 2 else -1)
            o = len(vs)
            vs += [[-dx, 0, -dz], [dx, 0, dz], [dx + nx, hoehe, dz + nz], [-dx + nx, hoehe, -dz + nz]]
            fs += [[o, o + 1, o + 2], [o, o + 2, o + 3]]
            ecken = [[u0, 1 - v1], [u1, 1 - v1], [u1, 1 - v0], [u0, 1 - v0]]  # v nach oben (OBJ-Konvention)
            uvs += [[ecken[0], ecken[1], ecken[2]], [ecken[0], ecken[2], ecken[3]]]
        f = np.array(fs)
        return mesh('gras', np.array(vs, float), f, np.ones((len(f), 3)), np.array(uvs, float), bild, mat='gras', alpha=True)

    arten = {
        'gras': ((0.21, 0.0, 0.42, 0.25), 0.9, 0.75, 4),       # Büschel oben Mitte
        'gras_hoch': ((0.0, 0.36, 0.40, 0.66), 1.3, 1.05, 3),  # hohes Gras links
        'gras_wispy_a': ((0.42, 0.0, 0.62, 0.25), 0.8, 0.7, 2),
        'gras_wispy_b': ((0.44, 0.48, 0.58, 0.66), 0.6, 0.55, 2),
        'blumen': ((0.64, 0.0, 0.82, 0.12), 0.35, 0.45, 2),
    }
    index = {}
    for name, (box, b, h, n) in arten.items():
        m = karten(box, b, h, n)
        pfad = os.path.join(NATUR, name + '.glb')
        schreibe(pfad, [m])
        index[name] = {'datei': name + '.glb', 'hoehe': h, 'radius': round(b / 2, 3), 'dreiecke': len(m['f'])}
    with open(os.path.join(NATUR, 'natur.json'), 'w', encoding='utf-8') as d:
        json.dump({'arten': index}, d, indent=1)
        d.write('\n')


# ---------------------------------------------------------------------------------------------------------------- Essen
ESSEN = {  # Item-ID → Knoten in „Food Collection - Game Ready“ (Melonpolygons)
    'konservendose': 'SM_Canned_Food_07', 'marmelade': 'SM_Protein_Jar_01', 'muesliriegel': 'SM_Chocolate_Bar_01',
    'energydrink': 'SM_Beer_Can_02', 'wasserflasche': 'SM_Bottle_01', 'milch': 'SM_Milk_Bottle_01', 'kaffee': 'SM_Coffee_Box_01',
    'alkohol': 'SM_Wine_Bottle_01', 'leere_flasche': 'SM_Beer_Bottle_01', 'schmerzmittel': 'SM_Pills_Box_01', 'antibiotika': 'SM_Salt_02',
    'mehl': 'SM_Pasta_01', 'doerrfleisch': 'SM_Sausages_01', 'raeucherfisch': 'SM_Canned_Food_05', 'eingelegte_gurken': 'SM_Canned_Food_10',
    'eintopf': 'SM_Canned_Food_12', 'fischsuppe': 'SM_Canned_Food_11', 'kuerbissuppe': 'SM_Canned_Food_13', 'trockenobst': 'SM_Snack_01',
    'honig': 'SM_Sause_01', 'wasser_dreckig': 'SM_Juice_Carton_01',
}


def essen():
    teile = {t['name']: t for t in mw.lade_glb(sf('essen'))}
    aus = []
    for item, knoten in ESSEN.items():
        t = next(v for k, v in teile.items() if k.startswith(knoten + '_'))
        v = normiere(t['v'], ziel_groesse=1.0)
        aus.append(mesh(item, v, t['f'], None, t['fuv'], t['bild'], mat=t.get('material') or 'essen'))
    schreibe(os.path.join(EIGENE, 'r32_essen.glb'), aus, rauheit=0.6, max_textur=512)
    # restliche Packungen als Deko/Müll
    rest = [k for k in teile if k.startswith('SM_') and not any(k.startswith(n + '_') for n in ESSEN.values())]
    aus = []
    for k in rest:
        t = teile[k]
        aus.append(mesh(re.sub(r'_Asset.*', '', k)[3:].lower(), normiere(t['v'], ziel_groesse=1.0), t['f'], None, t['fuv'], t['bild'], mat=t.get('material')))
    schreibe(os.path.join(EIGENE, 'r32_vorrat.glb'), aus, rauheit=0.6, max_textur=1024)


# ---------------------------------------------------------------------------------------------------------------- Steak
def steak():
    """Steak-Pack (vorher als 2 Reihen-GLBs eingebaut) → einzelne Steaks (Komponenten, nach Abstand gruppiert)."""
    aus = {}
    for datei, roh in (('steak-1.glb', True), ('steak-2.glb', False)):
        pfad = os.path.join(EIGENE, datei)
        if not os.path.exists(pfad):
            continue
        t = mw.lade_glb(pfad)[0]
        lab = mw.gruppiere_nah(t['v'], t['f'], mw.komponenten(mw.verschweisse(t['v'], t['f'])), 0.002)
        stuecke, gesehen = [], set()
        for st in nach_label(t, lab):
            schl = (len(st[1]), tuple(np.round(np.ptp(st[0], axis=0) / np.ptp(st[0], axis=0).max(), 2)))
            if len(st[1]) > 30 and schl not in gesehen:  # Rip enthält jedes Steak doppelt
                gesehen.add(schl)
                stuecke.append(st)
        aus['roh' if roh else 'gebraten'] = [mesh(f'{"roh" if roh else "gebraten"}_{i}', normiere(s[0], ziel_groesse=1.0), s[1], s[3]) for i, s in enumerate(stuecke)]
    alle = aus.get('roh', []) + aus.get('gebraten', [])
    if alle:
        schreibe(os.path.join(EIGENE, 'r32_steaks.glb'), alle, rauheit=0.55)


# ---------------------------------------------------------------------------------------------------------------- Waffen
# Rechtecke (x0, x1, y0, y1) im XY-Layout von „Low poly Weapons Pack 001“ model_0.obj (siehe Kontaktbogen)
WAFFEN = {
    'bogen': (-3.25, -2.0, 0.5, 5.25), 'vorschlaghammer': (-1.15, -0.35, 0.45, 2.95), 'katana': (0.95, 1.45, 1.9, 5.25),
    'speer': (1.95, 2.45, 0.45, 5.65), 'sturmgewehr': (2.95, 3.85, 3.6, 5.75), 'pistole': (2.95, 3.45, 1.85, 2.5),
    'granate': (3.05, 3.35, 1.3, 1.55), 'hammer': (1.5, 1.98, 0.65, 1.5), 'taschenlampe': (2.5, 2.8, 0.5, 1.85),
    'axt_doppel': (-0.05, 0.85, 1.85, 2.95), 'dynamit': (3.25, 3.75, 0.7, 1.05), 'raketenwerfer': (3.85, 4.45, 0.45, 4.7),
    'schild': (-1.35, -0.55, 5.9, 7.3), 'rundschild': (0.2, 1.6, 5.9, 7.4),
}


NUR_DEKO = {'schild', 'rundschild', 'axt_doppel', 'dynamit', 'raketenwerfer'}


def waffen():
    q = os.path.join(E, 'Low poly Weapons Pack 001')
    t = mw.ohne_splitter(mw.lade_obj(os.path.join(q, 'model_0.obj'), Image.open(os.path.join(q, 'Diffuse_palette.png')))[0], 0.15)
    lab = mw.komponenten(mw.verschweisse(t['v'], t['f']))
    stuecke = nach_label(t, lab)
    aus = []
    for name, (x0, x1, y0, y1) in WAFFEN.items():
        sel = [s for s in stuecke if x0 <= s[0][:, 0].mean() <= x1 and y0 <= s[0][:, 1].mean() <= y1]
        if not sel:
            print('Waffe ohne Teile:', name)
            continue
        v = np.vstack([s[0] for s in sel]); f = []; fc = []; o = 0
        for s in sel:
            f.append(s[1] + o); fc.append(s[3]); o += len(s[0])
        # Länge (y im Layout) → +z (Spitze/Mündung nach vorn), dünne Achse z → x
        v = np.stack([v[:, 2], v[:, 0], v[:, 1]], 1)
        v = v - np.array([(v[:, 0].min() + v[:, 0].max()) / 2, (v[:, 1].min() + v[:, 1].max()) / 2, v[:, 2].min()])
        v = v / max(np.ptp(v[:, 2]), 1e-9)  # Länge 1 (z von 0 = Griffende bis 1 = Spitze)
        m = mesh(name, v, np.vstack(f), np.vstack(fc))
        if name in NUR_DEKO:
            schreibe(os.path.join(EIGENE, f'r32_waffe_{name}.glb'), [m], metall=0.3, rauheit=0.55)  # nur Editor/Deko
        else:
            aus.append(m)
    schreibe(os.path.join(EIGENE, 'r32_waffen.glb'), aus, metall=0.3, rauheit=0.55)


# ---------------------------------------------------------------------------------------------------------------- Tiere
TIERE = ['baer', 'wildschwein', 'katze', 'reh', 'hund', 'fuchs', 'ziege', 'hase', 'ratte', 'wolf']
TIER_TEX = ['Bear', 'Boar', 'Cat', 'Deer', 'Dog', 'Fox', 'Goat', 'Rabbit', 'Rat', 'Wolf']


def tiere():
    q = os.path.join(E, 'Retro PS1 Animal Pack Low Poly Bundle')
    for i, (name, tex) in enumerate(zip(TIERE, TIER_TEX)):
        bild = Image.open(os.path.join(q, f'T_PS1_A_{tex}_D.png')).convert('RGB')
        t = mw.ohne_splitter(mw.lade_obj(os.path.join(q, f'model_{i}.obj'), bild)[0], 15, 0.05)
        v = t['v']
        # Quelle: y oben, Länge entlang z (Kopf bei +z? → Kopf = Seite mit höherem Schwerpunkt im vorderen Drittel)
        laenge = np.ptp(v[:, 2])
        vorn = v[v[:, 2] > v[:, 2].max() - laenge * 0.25, 1].mean()
        hinten = v[v[:, 2] < v[:, 2].min() + laenge * 0.25, 1].mean()
        if hinten > vorn:
            v = v * np.array([-1, 1, -1])
        v = normiere(v, ziel_hoehe=1.0)
        schreibe(os.path.join(EIGENE, f'r32_tier_{name}.glb'), [mesh(name, v, t['f'], None, t['fuv'], bild, mat=name)], max_textur=256)


# ---------------------------------------------------------------------------------------------------------------- Deko
def deko():
    # Zelt (simonaskLDE, 172 Dreiecke) – Bauwerk „zelt“
    t = mw.lade_glb(sf('zelt'))
    v = np.vstack([x['v'] for x in t]); f = []; fc = []; o = 0
    for x in t:
        f.append(x['f'] + o); fc.append(mw.farben_backen(x)); o += len(x['v'])
    schreibe(os.path.join(EIGENE, 'r32_zelt.glb'), [mesh('zelt', normiere(v, ziel_groesse=1.0), np.vstack(f), np.vstack(fc))])
    # Fässer
    for i, x in enumerate(mw.lade_glb(sf('faesser'))):
        schreibe(os.path.join(EIGENE, f'r32_fass_{i}.glb'), [mesh('fass', normiere(x['v'], ziel_hoehe=1.0), x['f'], mw.farben_backen(x))])
    # Baumstämme
    x = mw.lade_glb(sf('eichenstamm'))[0]
    schreibe(os.path.join(EIGENE, 'r32_eichenstamm.glb'), [mesh('stamm', normiere(x['v'], ziel_groesse=1.0), x['f'], mw.farben_backen(x))])
    # Baumstümpfe: jede Datei-Variante = 4 Stümpfe nebeneinander → einzeln (2 Farbvarianten)
    k = 0
    for x in mw.lade_glb(sf('staemme'))[:2]:
        lab = mw.gruppiere_nah(x['v'], x['f'], mw.komponenten(mw.verschweisse(x['v'], x['f'])), 0.05)
        for v, f, _, fc in nach_label(x, lab):
            if len(f) < 50:
                continue
            schreibe(os.path.join(EIGENE, f'r32_stumpf_{k}.glb'), [mesh('stumpf', normiere(v, ziel_hoehe=1.0), f, fc)])
            k += 1
    # Survival Wood Crafting Kit (triix3d): Teile mit Holz-Texturen (Zuordnung je Datei geraten → Holzfarbe aus der passenden Textur)
    q = os.path.join(E, 'Survival Wood Crafting Kit')
    tex = {0: 'pillar1', 1: 'pillar1', 2: 'pillar1', 3: 'stair', 4: 'WoodDoor', 5: 'bars', 6: 'Window', 7: 'pillar1', 8: 'DoorWay1', 9: 'pillar1', 10: 'WoodDoor', 11: 'stair'}
    for i in range(12):
        t = mw.lade_obj(os.path.join(q, f'model_{i}.obj'), Image.open(os.path.join(q, tex[i] + '.png')))[0]
        if len(t['f']) > 6000 or i == 5:
            continue  # 5 = zerfallen
        schreibe(os.path.join(EIGENE, f'r32_holzbau_{i}.glb'), [mesh('holz', normiere(t['v'], ziel_groesse=1.0), t['f'], mw.farben_backen(t))])
    # Hazmat Suit (tikoavp): ohne Textur → Anzugfarbe gelb, kleine Teile dunkel
    q = os.path.join(E, 'Hazmat Suit - Low Poly Style')
    for i in range(14):
        t = mw.lade_obj(os.path.join(q, f'model_{i}.obj'))[0]
        if i not in (0, 6):
            continue  # übrige Teile im Rip zerfallen (Splitter) – nur die zwei ganzen Anzüge
        gross = np.ptp(t['v'][:, 1]) > 90
        fc = np.tile([0.85, 0.72, 0.12] if gross else [0.18, 0.18, 0.2], (len(t['f']), 1))
        schreibe(os.path.join(EIGENE, f'r32_hazmat_{i}.glb'), [mesh('hazmat', normiere(t['v'], ziel_groesse=1.0), t['f'], fc)])
    # Military Tents (aaanimators): nur die leichten (< 12k Dreiecke), olivgrün
    q = os.path.join(E, 'Low Poly Military Tents Pack')
    for i in range(9):
        t = mw.lade_obj(os.path.join(q, f'model_{i}.obj'))[0]
        if True:
            continue  # Rip ohne brauchbare Form (flach/zerfallen) – gesichtet, nicht verwendet
        t = mw.ohne_splitter(t, 300)
        fc = np.tile([0.36, 0.4, 0.24], (len(t['f']), 1))
        schreibe(os.path.join(EIGENE, f'r32_militaerzelt_{i}.glb'), [mesh('zelt', normiere(z_hoch(t['v']) if np.ptp(t['v'][:, 1]) > np.ptp(t['v'][:, 2]) * 3 else t['v'], ziel_groesse=1.0), t['f'], fc)])
    # PS1-Tiere, die keine Spielrolle haben, sind über tiere() schon als r32_tier_*.glb im Editor-Katalog


ABSCHNITTE = {'baeume': baeume, 'steine': steine, 'gras': gras, 'essen': essen, 'steak': steak, 'waffen': waffen, 'tiere': tiere, 'deko': deko}
if __name__ == '__main__':
    for name in sys.argv[1:] or ABSCHNITTE:
        print('==', name)
        ABSCHNITTE[name]()
    print('\n'.join(protokoll))

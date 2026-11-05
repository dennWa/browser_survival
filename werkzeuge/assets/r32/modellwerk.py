"""Runde 32: Werkzeuge zum Aufbereiten der Nutzer-Modellpakete (OBJ-Rips + Sketchfab-GLBs).

- lade_obj / lade_glb  -> Liste von Teilen {name, v (N×3), f (M×3), fuv (M×3×2|None), bild (PIL|None), farbe (rgb|None)}
- farben_backen        -> Flächenfarben aus Textur (UV-Mittelpunkt) bzw. Materialfarbe -> je Fläche RGB 0..1 (sRGB)
- verschweisse/komponenten/gruppiere -> Zusammenhangskomponenten, danach räumlich gruppiert (Mehrfach-Modelle aufteilen)
- render / kontaktbogen -> einfacher Software-Renderer (Maler-Algorithmus) zum Sichten
- schreibe_glb         -> GLB mit Vertexfarben (Flächen entindiziert, flach), mehrere benannte Meshes
Nur numpy + PIL (+ trimesh zum GLB-Lesen).
"""
import json, math, struct, os
import numpy as np
from PIL import Image, ImageDraw


def lade_obj(pfad, bild=None, farbe=None):
    v, vt, f, ft = [], [], [], []
    for line in open(pfad, errors='ignore'):
        if line.startswith('v '):
            v.append([float(x) for x in line.split()[1:4]])
        elif line.startswith('vt '):
            vt.append([float(x) for x in line.split()[1:3]])
        elif line.startswith('f '):
            idx = [p.split('/') for p in line.split()[1:]]
            vi = [int(p[0]) for p in idx]
            ti = [int(p[1]) if len(p) > 1 and p[1] else 0 for p in idx]
            for k in range(1, len(vi) - 1):
                f.append([vi[0], vi[k], vi[k + 1]])
                ft.append([ti[0], ti[k], ti[k + 1]])
    v = np.array(v, float)
    f = np.array(f, int).reshape(-1, 3)
    f = np.where(f > 0, f - 1, len(v) + f)
    fuv = None
    if vt and len(ft):
        vt = np.array(vt, float)
        ft = np.array(ft, int) - 1
        fuv = vt[ft]
    return [{'name': os.path.basename(pfad), 'v': v, 'f': f, 'fuv': fuv, 'bild': bild, 'farbe': farbe}]


def lade_glb(pfad):
    import trimesh
    szene = trimesh.load(pfad, force='scene', process=False)
    teile = []
    for knoten in szene.graph.nodes_geometry:
        trafo, gname = szene.graph[knoten]
        g = szene.geometry[gname]
        if not hasattr(g, 'faces'):
            continue
        v = trimesh.transform_points(np.asarray(g.vertices, float), trafo)
        f = np.asarray(g.faces, int)
        bild, farbe, fuv = None, None, None
        vis = g.visual
        if getattr(vis, 'kind', None) == 'vertex':
            vc = np.asarray(vis.vertex_colors, float)[:, :3] / 255.0
            teile.append({'name': knoten, 'v': v, 'f': f, 'fuv': None, 'bild': None, 'farbe': None, 'fc': vc[f].mean(axis=1)})
            continue
        mat = getattr(vis, 'material', None)
        if mat is not None:
            bild = getattr(mat, 'baseColorTexture', None)
            if bild is None:
                bild = getattr(mat, 'image', None)
            bc = getattr(mat, 'baseColorFactor', None)
            if bc is not None:
                bc = np.array(bc, float)
                farbe = (bc[:3] / (255.0 if bc.max() > 1.0 else 1.0)).tolist()
            elif getattr(mat, 'diffuse', None) is not None:
                farbe = (np.array(mat.diffuse[:3], float) / 255.0).tolist()
        if getattr(vis, 'uv', None) is not None and len(vis.uv) == len(v):
            fuv = np.asarray(vis.uv, float)[f]
        teile.append({'name': knoten, 'v': v, 'f': f, 'fuv': fuv, 'bild': bild, 'farbe': farbe, 'material': getattr(mat, 'name', None)})
    return teile


def _lin(c):
    c = np.asarray(c, float)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


_bildcache = {}


def farben_backen(teil, stichproben=4):
    """Flächenfarben (sRGB 0..1). Textur an UV-Mittelpunkt (+ Richtung Ecken), Wiederholung per Modulo, mal Materialfarbe."""
    if 'fc' in teil:
        return teil['fc']
    n = len(teil['f'])
    basis = np.array(teil.get('farbe') or [1, 1, 1], float)
    if teil.get('bild') is not None and teil.get('fuv') is not None:
        schl = id(teil['bild'])
        if schl not in _bildcache:
            _bildcache[schl] = np.asarray(teil['bild'].convert('RGB'), float) / 255.0
        arr = _bildcache[schl]
        h, w = arr.shape[:2]
        uvm = teil['fuv'].mean(axis=1)
        proben = [uvm] + ([uvm * 0.5 + teil['fuv'][:, k] * 0.5 for k in range(3)] if stichproben > 1 else [])
        acc = np.zeros((n, 3))
        for p in proben:
            u = np.mod(p[:, 0], 1.0)
            vv = np.mod(p[:, 1], 1.0)
            x = np.clip((u * w).astype(int), 0, w - 1)
            y = np.clip(((1 - vv) * h).astype(int), 0, h - 1)
            acc += arr[y, x]
        return (acc / len(proben)) * basis
    return np.tile(basis, (n, 1))


def ohne_splitter(teil, max_kante, verhaeltnis=0.02):
    """Entfernt Rip-Artefakte: lange, fast flächenlose Dreiecke (Kante > max_kante und Fläche/Kante² < verhaeltnis)."""
    tri = teil['v'][teil['f']]
    k = np.stack([np.linalg.norm(tri[:, i] - tri[:, (i + 1) % 3], axis=1) for i in range(3)], 1).max(1)
    a = 0.5 * np.linalg.norm(np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0]), axis=1)
    weg = (k > max_kante) & (a / (k * k + 1e-12) < verhaeltnis)
    neu = dict(teil)
    neu['f'] = teil['f'][~weg]
    if teil.get('fuv') is not None:
        neu['fuv'] = teil['fuv'][~weg]
    if 'fc' in teil:
        neu['fc'] = teil['fc'][~weg]
    return neu


def verschweisse(v, f, eps=1e-4):
    schl = np.round(v / eps).astype(np.int64)
    _, inv = np.unique(schl, axis=0, return_inverse=True)
    return inv.reshape(-1)[f]


def komponenten(f_w):
    """Union-Find über verschweißte Flächenindizes -> Label (0..k-1) je Fläche."""
    n = int(f_w.max()) + 1
    eltern = np.arange(n)

    def finde(a):
        while eltern[a] != a:
            eltern[a] = eltern[eltern[a]]
            a = eltern[a]
        return a
    for a, b, c in f_w:
        ra = finde(a)
        eltern[finde(b)] = ra
        eltern[finde(c)] = ra
    wurzel = np.array([finde(i) for i in range(n)])
    _, lab = np.unique(wurzel[f_w[:, 0]], return_inverse=True)
    return lab.reshape(-1)


def gruppiere(v, f, lab, abstand):
    """Komponenten, deren (um `abstand` vergrößerte) Bounding-Boxen sich schneiden, vereinen. -> Label je Fläche."""
    k = int(lab.max()) + 1
    mn = np.zeros((k, 3)); mx = np.zeros((k, 3))
    for i in range(k):
        pts = v[f[lab == i].reshape(-1)]
        mn[i] = pts.min(0) - abstand
        mx[i] = pts.max(0) + abstand
    eltern = list(range(k))

    def finde(a):
        while eltern[a] != a:
            eltern[a] = eltern[eltern[a]]
            a = eltern[a]
        return a
    geaendert = True
    while geaendert:
        geaendert = False
        for i in range(k):
            ueber = np.all((mn[i] <= mx) & (mx[i] >= mn), axis=1)
            for j in np.nonzero(ueber)[0]:
                a, b = finde(i), finde(int(j))
                if a != b:
                    eltern[b] = a
                    geaendert = True
        # Boxen der Gruppen zusammenfassen
        wurzel = np.array([finde(i) for i in range(k)])
        for r in set(wurzel.tolist()):
            m = wurzel == r
            mn[m] = mn[m].min(0); mx[m] = mx[m].max(0)
    wurzel = np.array([finde(i) for i in range(k)])
    _, neu = np.unique(wurzel, return_inverse=True)
    return neu.reshape(-1)[lab]


def weiche_normalen(v, f, winkel=50.0):
    """Normalen je Flächenecke (M×3×3): über Positions-verschweißte Ecken gemittelt, aber nur Flächen innerhalb `winkel`° (harte Kanten bleiben)."""
    tri = v[f]
    n = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
    n /= np.linalg.norm(n, axis=1, keepdims=True) + 1e-12
    w = verschweisse(v, f)
    schwelle = math.cos(math.radians(winkel))
    aus = np.zeros((len(f), 3, 3))
    summe = {}
    for fi in range(len(f)):
        for e in range(3):
            summe.setdefault(w[fi, e], []).append(fi)
    for punkt, flaechen in summe.items():
        fl = np.array(flaechen)
        for fi in fl:
            gleich = fl[(n[fl] @ n[fi]) >= schwelle]
            nn = n[gleich].sum(0)
            nn /= np.linalg.norm(nn) + 1e-12
            e = int(np.nonzero(w[fi] == punkt)[0][0])
            aus[fi, e] = nn
    return aus


def teilmesh(v, f, maske):
    ff = f[maske]
    benutzt, inv = np.unique(ff.reshape(-1), return_inverse=True)
    return v[benutzt], inv.reshape(-1, 3)


def render(v, f, fc, groesse=256, blick=(0.6, 0.5, 1.0), hoch=(0, 1, 0), hinter=(40, 40, 46)):
    """Orthografisch, Lambert, Maler-Algorithmus. fc = Flächenfarben sRGB 0..1."""
    blick = np.array(blick, float); blick /= np.linalg.norm(blick)
    hoch = np.array(hoch, float)
    rechts = np.cross(hoch, blick); rechts /= np.linalg.norm(rechts)
    oben = np.cross(blick, rechts)
    p = v - (v.min(0) + v.max(0)) / 2
    x = p @ rechts; y = p @ oben; z = p @ blick
    s = (groesse * 0.9) / max(np.ptp(x), np.ptp(y), 1e-9)
    X = groesse / 2 + x * s; Y = groesse / 2 - y * s
    tri = v[f]
    n = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
    n /= np.linalg.norm(n, axis=1, keepdims=True) + 1e-12
    licht = np.array([0.4, 0.8, 0.5]); licht /= np.linalg.norm(licht)
    hell = 0.45 + 0.55 * np.abs(n @ licht)
    tiefe = z[f].mean(1)
    img = Image.new('RGB', (groesse, groesse), hinter)
    d = ImageDraw.Draw(img)
    for i in np.argsort(tiefe):
        c = tuple(int(255 * min(1, max(0, q))) for q in fc[i] * hell[i])
        d.polygon([(X[j], Y[j]) for j in f[i]], fill=c)
    return img


def kontaktbogen(bilder, beschriftungen, spalten=6, ziel=None):
    g = bilder[0].size[0]
    zeilen = math.ceil(len(bilder) / spalten)
    bogen = Image.new('RGB', (spalten * g, zeilen * (g + 16)), (20, 20, 20))
    d = ImageDraw.Draw(bogen)
    for i, (b, t) in enumerate(zip(bilder, beschriftungen)):
        x = (i % spalten) * g; y = (i // spalten) * (g + 16)
        bogen.paste(b, (x, y + 16))
        d.text((x + 3, y + 2), str(t)[:40], fill=(255, 255, 0))
    if ziel:
        bogen.save(ziel)
    return bogen


def _pad4(b, fuell=b'\x00'):
    return b + fuell * ((4 - len(b) % 4) % 4)


def bild_bytes(bild, max_seite=512, format_='PNG'):
    import io
    b = bild
    if max(b.size) > max_seite:
        f = max_seite / max(b.size)
        b = b.resize((max(1, int(b.size[0] * f)), max(1, int(b.size[1] * f))), Image.LANCZOS)
    puf = io.BytesIO()
    if format_ == 'JPEG':
        b.convert('RGB').save(puf, 'JPEG', quality=85)
    else:
        if b.mode == 'RGBA':
            b = b.quantize(colors=96, method=Image.Quantize.FASTOCTREE)  # Palette + Alpha: ~4× kleiner
        b.save(puf, 'PNG', optimize=True)
    return puf.getvalue(), ('image/jpeg' if format_ == 'JPEG' else 'image/png')


def schreibe_glb(pfad, meshes, metall=0.0, rauheit=0.8, max_textur=512):
    """meshes = [{name, v (N×3), f (M×3), fc (M×3 sRGB 0..1)|None, uv (M×3×2)|None, bild (PIL)|None, mat (Name), alpha (bool)}]
    -> GLB, flach (entindiziert). COLOR_0 linear (falls fc), TEXCOORD_0 (falls uv). Gleiche (bild, mat) teilen ein Material."""
    nodes, gmeshes, accs, views = [], [], [], []
    materialien, mat_index, bilder, bild_index = [], {}, [], {}
    puffer = bytearray()

    def ansicht(daten, ziel=34962):
        start = len(puffer)
        puffer.extend(_pad4(daten))
        v = {'buffer': 0, 'byteOffset': start, 'byteLength': len(daten)}
        if ziel:
            v['target'] = ziel
        views.append(v)
        return len(views) - 1

    def material(m):
        bild = m.get('bild')
        name = m.get('mat') or ('textur' if bild is not None else 'vertexfarbe')
        schl = (id(bild) if bild is not None else None, name, bool(m.get('alpha')), m.get('fc') is not None)
        if schl in mat_index:
            return mat_index[schl]
        pbr = {'baseColorFactor': [1, 1, 1, 1], 'metallicFactor': metall, 'roughnessFactor': rauheit}
        mat = {'name': name, 'pbrMetallicRoughness': pbr}
        if bild is not None:
            if id(bild) not in bild_index:
                fmt = 'PNG' if (m.get('alpha') or bild.mode == 'RGBA') else 'JPEG'
                daten, mime = bild_bytes(bild, max_textur, fmt)
                bilder.append({'bufferView': ansicht(daten, None), 'mimeType': mime})
                bild_index[id(bild)] = len(bilder) - 1
            pbr['baseColorTexture'] = {'index': bild_index[id(bild)]}
        if m.get('alpha'):
            mat['alphaMode'] = 'MASK'
            mat['alphaCutoff'] = 0.5
            mat['doubleSided'] = True
        materialien.append(mat)
        mat_index[schl] = len(materialien) - 1
        return mat_index[schl]

    for m in meshes:
        tri = np.asarray(m['v'], np.float32)[np.asarray(m['f'])].reshape(-1, 3)
        n = np.cross(tri[1::3] - tri[0::3], tri[2::3] - tri[0::3])
        n /= np.linalg.norm(n, axis=1, keepdims=True) + 1e-12
        nor = np.repeat(n, 3, axis=0).astype(np.float32)
        if m.get('nor') is not None:  # optionale weiche Normalen (M×3×3), sonst flach
            nor = np.asarray(m['nor'], np.float32).reshape(-1, 3)
        attr = {}
        attr['POSITION'] = len(accs)
        accs.append({'bufferView': ansicht(tri.tobytes()), 'componentType': 5126, 'count': len(tri), 'type': 'VEC3',
                     'min': tri.min(0).tolist(), 'max': tri.max(0).tolist()})
        # NORMAL nötig: three.js' GLTFLoader berechnet fehlende Normalen NICHT (sonst schwarz)
        attr['NORMAL'] = len(accs)
        accs.append({'bufferView': ansicht(nor.tobytes()), 'componentType': 5126, 'count': len(nor), 'type': 'VEC3'})
        if m.get('fc') is not None:
            lin = _lin(np.clip(m['fc'], 0, 1))
            col = np.repeat(np.concatenate([lin, np.ones((len(lin), 1))], 1), 3, axis=0)
            col = np.round(col * 255).astype(np.uint8)
            attr['COLOR_0'] = len(accs)
            accs.append({'bufferView': ansicht(col.tobytes()), 'componentType': 5121, 'normalized': True, 'count': len(col), 'type': 'VEC4'})
        if m.get('uv') is not None:
            uv = np.asarray(m['uv'], np.float32).reshape(-1, 2).copy()
            uv[:, 1] = 1.0 - uv[:, 1]  # OBJ/trimesh (v nach oben) -> glTF (v nach unten)
            attr['TEXCOORD_0'] = len(accs)
            accs.append({'bufferView': ansicht(uv.tobytes()), 'componentType': 5126, 'count': len(uv), 'type': 'VEC2'})
        gmeshes.append({'name': m['name'], 'primitives': [{'attributes': attr, 'material': material(m)}]})
        nodes.append({'name': m['name'], 'mesh': len(gmeshes) - 1})
    gltf = {'asset': {'version': '2.0', 'generator': 'browser_survival r32 modellwerk'},
            'scene': 0, 'scenes': [{'nodes': list(range(len(nodes)))}], 'nodes': nodes, 'meshes': gmeshes,
            'materials': materialien, 'accessors': accs, 'bufferViews': views, 'buffers': [{'byteLength': len(puffer)}]}
    if bilder:
        gltf['images'] = bilder
        gltf['samplers'] = [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 10497, 'wrapT': 10497}]
        gltf['textures'] = [{'sampler': 0, 'source': i} for i in range(len(bilder))]
    js = _pad4(json.dumps(gltf, separators=(',', ':')).encode(), b' ')
    bin_ = bytes(puffer)
    gesamt = 12 + 8 + len(js) + 8 + len(bin_)
    with open(pfad, 'wb') as d:
        d.write(struct.pack('<4sII', b'glTF', 2, gesamt))
        d.write(struct.pack('<I4s', len(js), b'JSON')); d.write(js)
        d.write(struct.pack('<I4s', len(bin_), b'BIN'+bytes(1))); d.write(bin_)
    return os.path.getsize(pfad)


def gruppiere_nah(v, f, lab, abstand):
    """Wie gruppiere, aber echter Punktabstand (KD-Baum) statt Box-Überlappung – für eng liegende Mehrfach-Modelle."""
    from scipy.spatial import cKDTree
    k = int(lab.max()) + 1
    punkte = [np.unique(v[f[lab == i].reshape(-1)], axis=0) for i in range(k)]
    baeume = [cKDTree(p) for p in punkte]
    mn = np.array([p.min(0) for p in punkte]) - abstand
    mx = np.array([p.max(0) for p in punkte]) + abstand
    eltern = list(range(k))

    def finde(a):
        while eltern[a] != a:
            eltern[a] = eltern[eltern[a]]
            a = eltern[a]
        return a
    for i in range(k):
        ueber = np.nonzero(np.all((mn[i] <= mx) & (mx[i] >= mn), axis=1))[0]
        for j in ueber:
            j = int(j)
            if j <= i or finde(i) == finde(j):
                continue
            a, b = (i, j) if len(punkte[i]) < len(punkte[j]) else (j, i)
            d, _ = baeume[b].query(punkte[a], k=1, distance_upper_bound=abstand)
            if np.isfinite(d).any():
                eltern[finde(j)] = finde(i)
    wurzel = np.array([finde(i) for i in range(k)])
    _, neu = np.unique(wurzel, return_inverse=True)
    return neu.reshape(-1)[lab]

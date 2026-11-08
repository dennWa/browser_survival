"""Runde 44: Lagerplatz-Modelle prozedural (numpy → GLB) mit echten Texturen (Poly Haven, CC0):
  lg-palisade.glb      3,6 m breites Palisaden-Segment (16 angespitzte Rundhölzer, 2 Querbalken innen), ~2,7 m hoch
  lg-palisadentor.glb  geschlossenes Doppeltor (Planken + Z-Streben) zwischen zwei dicken Torpfosten mit Querbalken, 3,6 m
  lg-zelt.glb / lg-zelt-gruen.glb  Firstzelt (Leinwand mit Durchhang, offene Eingangsklappen, Stangen, Spannseile, Heringe)

Texturen (je 512 px, Normalmap 512 px, JPEG): bark_brown_02 (Rinde), brown_planks_07 (Planken), hessian_230 (Leinwand),
geladen von https://polyhaven.com (CC0) nach QUELLEN (Ordner mit <id>_diff.jpg / <id>_nor_gl.jpg).
Vertexfarben (COLOR_0) dunkeln Fuß/Kanten ab (billige Umgebungsverdeckung, kein Extra-Licht).

Aufruf: python werkzeuge/assets/r44/baue_lager_modelle_r44.py <ordner_mit_texturen>
"""
import sys, os, io, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from PIL import Image, ImageEnhance
import glbwerk as gw

WURZEL = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
ZIEL = os.path.join(WURZEL, 'client', 'assets', 'eigene')
QUELLEN = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.environ.get('TEMP', '.'), 'ph_dl')
TEX = 512


class Netz:
    """Sammelt Dreiecke je Material: v, n, uv, farbe."""

    def __init__(self):
        self.teile = {}

    def tri(self, mat, ps, uvs, farben=None, n=None):
        t = self.teile.setdefault(mat, {'v': [], 'n': [], 'uv': [], 'c': []})
        ps = [np.asarray(p, float) for p in ps]
        nn = n if n is not None else np.cross(ps[1] - ps[0], ps[2] - ps[0])
        nn = np.asarray(nn, float)
        nn = nn / np.maximum(np.linalg.norm(nn, axis=-1, keepdims=True), 1e-9)
        for i in range(3):
            t['v'].append(ps[i]); t['n'].append(nn if np.ndim(nn) == 1 else nn[i]); t['uv'].append(uvs[i])
            t['c'].append(farben[i] if farben is not None else (1, 1, 1))

    def quad(self, mat, a, b, c, d, uva, uvb, uvc, uvd, fa=None, fb=None, fc=None, fd=None, zweiseitig=False):
        f = [x if x is not None else (1, 1, 1) for x in (fa, fb, fc, fd)]
        self.tri(mat, [a, b, c], [uva, uvb, uvc], [f[0], f[1], f[2]])
        self.tri(mat, [a, c, d], [uva, uvc, uvd], [f[0], f[2], f[3]])
        if zweiseitig:
            self.tri(mat, [a, c, b], [uva, uvc, uvb], [f[0], f[2], f[1]])
            self.tri(mat, [a, d, c], [uva, uvd, uvc], [f[0], f[3], f[2]])


def ao(y, voll=0.9, boden=0.45):
    """Helligkeit nach Höhe: unten dunkler (Erde/Schatten)."""
    k = min(1.0, max(0.0, y / voll))
    h = boden + (1 - boden) * (k ** 0.6)
    return (h, h, h)


def rundholz(netz, mat, unten, oben, r, seiten=8, spitze=0.0, u0=0.0, glatt=True):
    """Zylinder unten→oben (Mittelpunkte), optional angespitzt (spitze = Kegelhöhe)."""
    unten, oben = np.asarray(unten, float), np.asarray(oben, float)
    achse = oben - unten; laenge = np.linalg.norm(achse); a = achse / laenge
    hilf = np.array([1.0, 0, 0]) if abs(a[0]) < 0.9 else np.array([0, 0, 1.0])
    e1 = np.cross(a, hilf); e1 /= np.linalg.norm(e1); e2 = np.cross(a, e1)
    ring = lambda m, rr: [m + (math.cos(2 * math.pi * k / seiten) * e1 + math.sin(2 * math.pi * k / seiten) * e2) * rr for k in range(seiten + 1)]
    nrm = [math.cos(2 * math.pi * k / seiten) * e1 + math.sin(2 * math.pi * k / seiten) * e2 for k in range(seiten + 1)]
    oben_mantel = oben - a * spitze if spitze else oben
    R0, R1 = ring(unten, r), ring(oben_mantel, r)
    umfang = 2 * math.pi * r
    for k in range(seiten):
        u_a, u_b = u0 + k / seiten * umfang / 0.6, u0 + (k + 1) / seiten * umfang / 0.6
        v_a, v_b = 0, np.linalg.norm(oben_mantel - unten) / 1.2
        fa, fb = ao(R0[k][1]), ao(R1[k][1])
        for tri, uvs, fs, ns in (((R0[k], R0[k + 1], R1[k + 1]), ((u_a, v_a), (u_b, v_a), (u_b, v_b)), (fa, fa, fb), (nrm[k], nrm[k + 1], nrm[k + 1])),
                                 ((R0[k], R1[k + 1], R1[k]), ((u_a, v_a), (u_b, v_b), (u_a, v_b)), (fa, fb, fb), (nrm[k], nrm[k + 1], nrm[k]))):
            netz.tri(mat, tri, uvs, fs, np.array(ns) if glatt else None)
    if spitze:
        for k in range(seiten):
            netz.tri(mat, [R1[k], R1[k + 1], oben], [(k / seiten, 0), ((k + 1) / seiten, 0), ((k + 0.5) / seiten, spitze / 1.2)])
    else:
        for k in range(seiten):
            netz.tri(mat, [oben, R1[k + 1], R1[k]], [(0.5, 0.5), (0.5 + 0.4 * math.cos(2 * math.pi * (k + 1) / seiten), 0.5), (0.5, 0.6)])


def kiste(netz, mat, mitte, gr, uv_skala=1.0, drehung=None, tausch=False):
    """Quader (Mitte, Größe) – für Planken/Streben; drehung = 3×3."""
    m = np.asarray(mitte, float); h = np.asarray(gr, float) / 2
    D = drehung if drehung is not None else np.eye(3)
    ecken = lambda sx, sy, sz: m + D @ (np.array([sx, sy, sz]) * h)
    flaechen = [((1, -1, -1), (1, 1, -1), (1, 1, 1), (1, -1, 1)), ((-1, -1, 1), (-1, 1, 1), (-1, 1, -1), (-1, -1, -1)),
                ((-1, 1, -1), (-1, 1, 1), (1, 1, 1), (1, 1, -1)), ((-1, -1, 1), (-1, -1, -1), (1, -1, -1), (1, -1, 1)),
                ((-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1)), ((1, -1, -1), (-1, -1, -1), (-1, 1, -1), (1, 1, -1))]
    for f in flaechen:
        p = [ecken(*e) for e in f]
        laenge_u = np.linalg.norm(p[1] - p[0]) / uv_skala; laenge_v = np.linalg.norm(p[3] - p[0]) / uv_skala
        uvs = [(0, 0), (laenge_u, 0), (laenge_u, laenge_v), (0, laenge_v)]
        if tausch:  # Maserung längs der langen Kante (senkrechte Bretter)
            uvs = [(b, a) for a, b in uvs]
        netz.quad(mat, *p, *uvs, *[ao(x[1]) for x in p])


# ------------------------------------------------------------------------------------------------ Modelle
def palisade(seed=1):
    z = random.Random(seed); n = Netz()
    BREITE, N = 3.6, 16
    r = BREITE / N / 2 * 0.98
    for i in range(N):
        x = -BREITE / 2 + (i + 0.5) * BREITE / N + z.uniform(-0.01, 0.01)
        hoehe = z.uniform(2.45, 2.75)
        rr = r * z.uniform(0.9, 1.05)
        neig = np.array([z.uniform(-0.03, 0.03), 0, z.uniform(-0.02, 0.02)])
        rundholz(n, 'rinde', (x, -0.05, 0), np.array([x, hoehe, 0]) + neig, rr, seiten=7, spitze=0.28, u0=z.random())
    for y in (0.55, 1.85):  # Querbalken innen (Seite -z = Lager-Innenseite, Generator dreht passend)
        rundholz(n, 'rinde', (-BREITE / 2, y, -r - 0.07), (BREITE / 2, y + z.uniform(-0.04, 0.04), -r - 0.07), 0.075, seiten=6, u0=z.random())
    return n


def palisadentor():
    z = random.Random(7); n = Netz()
    BREITE = 3.6
    for x in (-BREITE / 2 + 0.2, BREITE / 2 - 0.2):
        rundholz(n, 'rinde', (x, -0.05, 0), (x, 3.25, 0), 0.2, seiten=9, spitze=0.3, u0=z.random())
    rundholz(n, 'rinde', (-BREITE / 2, 2.95, 0.05), (BREITE / 2, 2.98, 0.05), 0.13, seiten=8)  # Querbalken oben
    fl = (BREITE - 0.8) / 2
    for seite in (-1, 1):
        mitte_x = seite * (fl / 2 + 0.01)
        planken = 6
        for k in range(planken):
            px = mitte_x - fl / 2 + (k + 0.5) * fl / planken
            hoch = 2.5 + (0.12 if k % 2 else 0)
            kiste(n, 'planken', (px, 0.08 + hoch / 2, 0), (fl / planken - 0.012, hoch, 0.07), uv_skala=1.4, tausch=True)
        for y in (0.45, 1.95):
            kiste(n, 'planken', (mitte_x, y, -0.06), (fl - 0.02, 0.16, 0.05), uv_skala=1.4)
        winkel = math.atan2(1.5, fl - 0.15)
        D = np.array([[math.cos(winkel), -math.sin(winkel) * seite, 0], [math.sin(winkel) * seite, math.cos(winkel), 0], [0, 0, 1]])
        kiste(n, 'planken', (mitte_x, 1.2, -0.06), (math.hypot(1.5, fl - 0.15), 0.14, 0.045), uv_skala=1.4, drehung=D)
        # Ring/Beschlag als kleine dunkle Klötze
        kiste(n, 'planken', (seite * 0.12, 1.25, 0.06), (0.05, 0.22, 0.05), uv_skala=3)
    return n


def zelt(seed=3):
    z = random.Random(seed); n = Netz()
    L, B, H = 3.0, 2.5, 1.85          # Länge (z), Breite (x), Firsthöhe
    NU, NV = 10, 6                    # Unterteilung Länge × Hang
    def punkt(s, t, seite):
        """s 0..1 entlang Länge, t 0..1 vom Boden zum First, seite ±1."""
        zz = -L / 2 + s * L
        x = seite * (B / 2) * (1 - t)
        y = H * t
        durchhang = 0.09 * math.sin(math.pi * t) * (1 - 0.6 * abs(math.cos(math.pi * s))) * (0.7 + 0.3 * math.sin(s * 9))
        x -= seite * durchhang * 0.7; y -= durchhang * 0.7
        return np.array([x, y, zz])
    hang = math.hypot(B / 2, H)
    for seite in (-1, 1):
        for i in range(NU):
            for j in range(NV):
                a, b = punkt(i / NU, j / NV, seite), punkt((i + 1) / NU, j / NV, seite)
                c, d = punkt((i + 1) / NU, (j + 1) / NV, seite), punkt(i / NU, (j + 1) / NV, seite)
                uv = lambda s, t: (s * L / 1.2, t * hang / 1.2)
                f = lambda p: ao(p[1], voll=0.7, boden=0.55)
                q = (a, b, c, d) if seite > 0 else (b, a, d, c)
                uq = (uv(i / NU, j / NV), uv((i + 1) / NU, j / NV), uv((i + 1) / NU, (j + 1) / NV), uv(i / NU, (j + 1) / NV))
                uq = uq if seite > 0 else (uq[1], uq[0], uq[3], uq[2])
                n.quad('leinwand', *q, *uq, *[f(p) for p in q], zweiseitig=True)
    # Rückwand (geschlossen) und Front (zwei zurückgeschlagene Klappen → dreieckige Öffnung)
    def dreieck_wand(zz, offen):
        links, rechts, spitze = np.array([-B / 2, 0, zz]), np.array([B / 2, 0, zz]), np.array([0, H, zz])
        uv = lambda p: ((p[0] + B / 2) / 1.2, p[1] / 1.2)
        if not offen:
            n.tri('leinwand', [links, rechts, spitze], [uv(links), uv(rechts), uv(spitze)], [ao(0, 0.7, 0.55), ao(0, 0.7, 0.55), (1, 1, 1)])
            n.tri('leinwand', [links, spitze, rechts], [uv(links), uv(spitze), uv(rechts)], [ao(0, 0.7, 0.55), (1, 1, 1), ao(0, 0.7, 0.55)])
            return
        for seite in (-1, 1):  # Klappe: vom First schräg nach außen geschlagen, unten zur Seite gebunden
            unten_innen = np.array([seite * 0.15, 0.0, zz + 0.05])
            aussen = np.array([seite * (B / 2 + 0.25), 0.05, zz + 0.35])
            mitte = np.array([seite * 0.55, H * 0.55, zz + 0.12])
            for tri in ((spitze, aussen, mitte), (mitte, aussen, unten_innen)):
                n.tri('leinwand', list(tri), [uv(p) for p in tri], [ao(p[1], 0.7, 0.55) for p in tri])
                n.tri('leinwand', [tri[0], tri[2], tri[1]], [uv(tri[0]), uv(tri[2]), uv(tri[1])], [ao(p[1], 0.7, 0.55) for p in (tri[0], tri[2], tri[1])])
            # Seitenteile der Front (vom Rand bis zur Klappe) bleiben zu
            rand = np.array([seite * B / 2, 0, zz]); fuss = np.array([seite * 0.62, 0, zz]); hoch = np.array([seite * 0.35, H * 0.62, zz])
            for tri in ((rand, fuss, hoch), (rand, hoch, spitze if False else np.array([seite * 0.05, H * 0.97, zz]))):
                n.tri('leinwand', list(tri), [uv(p) for p in tri], [ao(p[1], 0.7, 0.55) for p in tri])
                n.tri('leinwand', [tri[0], tri[2], tri[1]], [uv(tri[0]), uv(tri[2]), uv(tri[1])], [ao(p[1], 0.7, 0.55) for p in (tri[0], tri[2], tri[1])])
    dreieck_wand(-L / 2, False)
    dreieck_wand(L / 2, True)
    # Bodenplane (dunkel) im Eingang sichtbar
    n.quad('leinwand', np.array([-B / 2 + 0.05, 0.015, L / 2]), np.array([B / 2 - 0.05, 0.015, L / 2]), np.array([B / 2 - 0.05, 0.015, -L / 2]),
           np.array([-B / 2 + 0.05, 0.015, -L / 2]), (0, 0), (2, 0), (2, 2.5), (0, 2.5), *([(0.35, 0.32, 0.28)] * 4))
    # Stangen + First
    for zz in (-L / 2 - 0.02, L / 2 + 0.02):
        rundholz(n, 'holz', (0, 0, zz), (0, H + 0.18, zz), 0.03, seiten=6)
    rundholz(n, 'holz', (0, H + 0.02, -L / 2 - 0.15), (0, H + 0.02, L / 2 + 0.15), 0.028, seiten=6)
    # Spannseile + Heringe
    for zz, dz in ((-L / 2, -1), (L / 2, 1)):
        oben = np.array([0, H + 0.12, zz]); fuss = np.array([0, 0, zz + dz * 1.0])
        rundholz(n, 'seil', oben, fuss, 0.008, seiten=4)
        rundholz(n, 'holz', fuss + np.array([0, -0.05, 0]), fuss + np.array([0, 0.12, 0]), 0.02, seiten=4)
    for seite in (-1, 1):
        for s in (0.2, 0.8):
            zz = -L / 2 + s * L
            oben = punkt(s, 0.62, seite); fuss = np.array([seite * (B / 2 + 0.75), 0, zz])
            rundholz(n, 'seil', oben, fuss, 0.007, seiten=4)
            rundholz(n, 'holz', fuss + np.array([0, -0.05, 0]), fuss + np.array([0, 0.1, 0]), 0.018, seiten=4)
    return n


# ------------------------------------------------------------------------------------------------ Texturen + GLB
def tex_bytes(name, art, ton=None):
    pfad = os.path.join(QUELLEN, f'{name}_{art}.jpg')
    im = Image.open(pfad).convert('RGB').resize((TEX, TEX), Image.LANCZOS)
    if ton is not None:
        a = np.asarray(im, np.float32)
        grau = a.mean(2, keepdims=True)
        a = grau * np.array(ton, np.float32)[None, None, :] * 1.0 + (a - grau) * 0.25
        im = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    aus = io.BytesIO(); im.save(aus, 'JPEG', quality=88 if art == 'diff' else 90)
    return aus.getvalue()


MATERIALIEN = {
    'rinde': {'quelle': 'bark_brown_02', 'rauheit': 0.95},
    'planken': {'quelle': 'brown_planks_07', 'rauheit': 0.9},
    'holz': {'quelle': 'brown_planks_07', 'rauheit': 0.9},
    'leinwand': {'quelle': 'hessian_230', 'rauheit': 1.0, 'doppelseitig': True},
    'seil': {'farbe': [0.55, 0.47, 0.36, 1], 'rauheit': 1.0},
}


def schreibe(name, netz, leinwand_ton=None):
    pu = gw.Puffer()
    gl = {'asset': {'version': '2.0', 'generator': 'browser_survival r44 lager'}, 'scene': 0, 'scenes': [{'nodes': [0]}],
          'nodes': [{'name': name, 'mesh': 0}], 'meshes': [{'name': name, 'primitives': []}], 'materials': [], 'images': [], 'textures': [],
          'samplers': [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 10497, 'wrapT': 10497}]}
    tex_cache = {}

    def tex(quelle, art, ton):
        k = (quelle, art, tuple(ton) if ton else None)
        if k not in tex_cache:
            gl['images'].append({'bufferView': pu.roh(tex_bytes(quelle, art, ton)), 'mimeType': 'image/jpeg'})
            gl['textures'].append({'source': len(gl['images']) - 1, 'sampler': 0})
            tex_cache[k] = len(gl['textures']) - 1
        return tex_cache[k]
    dreiecke = 0
    for mat, t in netz.teile.items():
        d = MATERIALIEN[mat]
        m = {'name': mat, 'pbrMetallicRoughness': {'metallicFactor': 0, 'roughnessFactor': d['rauheit']}}
        if 'quelle' in d:
            ton = leinwand_ton if mat == 'leinwand' else None
            m['pbrMetallicRoughness']['baseColorTexture'] = {'index': tex(d['quelle'], 'diff', ton)}
            m['normalTexture'] = {'index': tex(d['quelle'], 'nor_gl', None), 'scale': 0.8}
        else:
            m['pbrMetallicRoughness']['baseColorFactor'] = d['farbe']
        if d.get('doppelseitig'):
            m['doubleSided'] = True
        gl['materials'].append(m)
        v = np.array(t['v'], np.float32); nn = np.array(t['n'], np.float32); uv = np.array(t['uv'], np.float32); c = np.array(t['c'], np.float32)
        attr = {'POSITION': pu.add(v, 5126, 'VEC3', mm=True), 'NORMAL': pu.add(nn, 5126, 'VEC3'), 'TEXCOORD_0': pu.add(uv, 5126, 'VEC2'),
                'COLOR_0': pu.add(c, 5126, 'VEC3')}
        gl['meshes'][0]['primitives'].append({'attributes': attr, 'material': len(gl['materials']) - 1})
        dreiecke += len(v) // 3
    pfad = os.path.join(ZIEL, name + '.glb')
    gw.schreibe_glb(pfad, gl, pu)
    print(f'{name:20s} {dreiecke:5d} Dreiecke {os.path.getsize(pfad) // 1024:4d} KB')


if __name__ == '__main__':
    schreibe('lg-palisade', palisade())
    schreibe('lg-palisadentor', palisadentor())
    schreibe('lg-zelt', zelt(3), leinwand_ton=(0.95, 0.86, 0.68))
    schreibe('lg-zelt-gruen', zelt(5), leinwand_ton=(0.62, 0.66, 0.46))

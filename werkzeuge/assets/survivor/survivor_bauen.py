"""Survivor-Figur in Blender bauen (Low-Poly, Skelett, Animationen) und als GLB exportieren.

Aufruf (headless):
    blender -b -P werkzeuge/assets/survivor/survivor_bauen.py -- [--vorschau ORDNER] [--ohne-export] [--pose klip:bild,...]
Normalerweise über `npm run assets:survivor` (werkzeuge/assets/baue_survivor.mjs).

Ergebnis: client/assets/3d/survivor.glb  (Meshes: Survivor_Koerper, Haar_Mann, Haar_Frau; Skelett mit den Knochennamen
der bisherigen Figur, damit client/darstellung/figurHaltung.js weiter funktioniert; Clips: stehen, joggen, rennen,
hacken, sterben). Texturen kommen aus survivor_textur.py (Atlas je Variante, im Spiel per Material getauscht).
"""
import math
import os
import sys

import bmesh
import bpy
from mathutils import Vector

HIER = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HIER)
import survivor_konstanten as K  # noqa: E402

WURZEL = os.path.abspath(os.path.join(HIER, '..', '..', '..'))
ATLAS_MANN = os.path.join(WURZEL, 'werkzeuge', 'assets', 'quellen', 'survivor', 'atlas_mann.png')
AUSGABE_GLB = os.path.join(WURZEL, 'client', 'assets', '3d', 'survivor.glb')

ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def argument(name, standard=None):
    return ARGV[ARGV.index(name) + 1] if name in ARGV else standard

KOPF_KEY = 1000  # Kopf-Flächen: Gesicht per Frontprojektion
V = Vector


def clamp(x, a=0.0, b=1.0):
    return max(a, min(b, x))


def glatt(t):
    t = clamp(t)
    return t * t * (3 - 2 * t)


# ---------------------------------------------------------------------------
# Skelett (Namen wie die bisherige Figur; links = +X, die Figur schaut nach -Y)

KOPF_SKALA = 1.15  # Stilisierung: größerer Kopf (wird nach dem Zuordnen der UVs angewendet)
KOPF_OBEN = 1.556 + 0.28 * KOPF_SKALA
A_WINKEL = math.radians(22)  # A-Pose: Arme leicht vom Körper weg
ARM_D = V((math.sin(A_WINKEL), 0, -math.cos(A_WINKEL)))  # Richtung des linken Arms (rechts: x gespiegelt)
SCHULTER = V((0.2, 0.0, 1.42))
OBERARM, UNTERARM = 0.27, 0.235
ELLBOGEN = SCHULTER + ARM_D * OBERARM
HANDGELENK = ELLBOGEN + ARM_D * UNTERARM
FINGER = HANDGELENK + ARM_D * 0.09
FINGER_ENDE = FINGER + ARM_D * 0.08

BEIN_X = 0.098
KNIE = V((BEIN_X, -0.006, 0.50))
KNOECHEL = V((BEIN_X, 0.0, 0.095))
BALLEN = V((BEIN_X, -0.125, 0.035))
ZEHE = V((BEIN_X, -0.215, 0.03))


def seite(v, sx):
    return V((v.x * sx, v.y, v.z))


def knochenliste():
    """[(name, kopf, schwanz, eltern)]"""
    b = [
        ('Hips', V((0, 0, 0.93)), V((0, 0, 1.04)), None),
        ('Spine', V((0, 0, 1.04)), V((0, 0, 1.18)), 'Hips'),
        ('Chest', V((0, 0, 1.18)), V((0, 0, 1.32)), 'Spine'),
        ('UpperChest', V((0, 0, 1.32)), V((0, 0, 1.46)), 'Chest'),
        ('Neck', V((0, 0, 1.46)), V((0, 0, 1.56)), 'UpperChest'),
        ('Head', V((0, 0, 1.56)), V((0, 0, KOPF_OBEN)), 'Neck'),
        ('Head_end', V((0, 0, KOPF_OBEN)), V((0, 0, KOPF_OBEN + 0.08)), 'Head'),
    ]
    for name, sx in (('Left', 1), ('Right', -1)):
        b += [
            (f'{name}Shoulder', seite(V((0.06, 0, 1.43)), sx), seite(SCHULTER, sx), 'UpperChest'),
            (f'{name}Arm', seite(SCHULTER, sx), seite(ELLBOGEN, sx), f'{name}Shoulder'),
            (f'{name}ForeArm', seite(ELLBOGEN, sx), seite(HANDGELENK, sx), f'{name}Arm'),
            (f'{name}Hand', seite(HANDGELENK, sx), seite(FINGER, sx), f'{name}ForeArm'),
            (f'{name}HandIndex1', seite(FINGER, sx), seite(FINGER_ENDE, sx), f'{name}Hand'),
            (f'{name}UpLeg', seite(V((BEIN_X, 0, 0.93)), sx), seite(KNIE, sx), 'Hips'),
            (f'{name}Leg', seite(KNIE, sx), seite(KNOECHEL, sx), f'{name}UpLeg'),
            (f'{name}Foot', seite(KNOECHEL, sx), seite(BALLEN, sx), f'{name}Leg'),
            (f'{name}Toes', seite(BALLEN, sx), seite(ZEHE, sx), f'{name}Foot'),
            (f'{name}Toes_end', seite(ZEHE, sx), seite(ZEHE + V((0, -0.06, 0)), sx), f'{name}Toes'),
        ]
    return b


KNOCHEN = knochenliste()
KNOCHEN_NAMEN = [k[0] for k in KNOCHEN]


# ---------------------------------------------------------------------------
# Geometrie-Helfer (bmesh)

class Baum:
    """Sammelt Geometrie + Gewichte für ein Mesh."""

    def __init__(self):
        self.bm = bmesh.new()
        self.dl = self.bm.verts.layers.deform.verify()
        self.uv = self.bm.loops.layers.uv.verify()

    def gewichte(self, verts, fn):
        for v in verts:
            for name, w in fn(v.co).items():
                if w > 1e-4:
                    v[self.dl][KNOCHEN_NAMEN.index(name)] = w

    def loft(self, ringe, n, key, kappen=(True, True), start=0.0, schlitz=None):
        """Ringe = [(mitte, achse_a, achse_b)] → geschlossene Röhre; key = Palettenfarbe (Name/Index) oder Liste je Ringabstand."""
        reihen = []
        for mitte, a, b in ringe:
            reihen.append([self.bm.verts.new(mitte + a * math.cos(start + 2 * math.pi * k / n) + b * math.sin(start + 2 * math.pi * k / n)) for k in range(n)])
        flaechen = []
        for r in range(len(reihen) - 1):
            kr = key[r] if isinstance(key, (list, tuple)) else key
            for k in range(n):
                f = self.bm.faces.new((reihen[r][k], reihen[r][(k + 1) % n], reihen[r + 1][(k + 1) % n], reihen[r + 1][k]))
                f.material_index = schluessel(kr)
                flaechen.append(f)
        extra = []
        for reihe, aktiv, kr in ((reihen[0], kappen[0], key[0] if isinstance(key, (list, tuple)) else key),
                                 (reihen[-1], kappen[1], key[-1] if isinstance(key, (list, tuple)) else key)):
            if not aktiv:
                continue
            c = self.bm.verts.new(sum((v.co for v in reihe), V()) / n)
            extra.append(c)
            for k in range(n):
                f = self.bm.faces.new((reihe[k], reihe[(k + 1) % n], c))
                f.material_index = schluessel(kr)
                flaechen.append(f)
        bmesh.ops.recalc_face_normals(self.bm, faces=flaechen)
        return [v for r in reihen for v in r] + extra

    def quader(self, mitte, groesse, key, drehung=None):
        res = bmesh.ops.create_cube(self.bm, size=1.0)
        verts = res['verts']
        for v in verts:
            v.co = V((v.co.x * groesse[0], v.co.y * groesse[1], v.co.z * groesse[2]))
            if drehung is not None:
                v.co = drehung @ v.co
            v.co += mitte
        faces = {f for v in verts for f in v.link_faces}
        for f in faces:
            f.material_index = schluessel(key)
        bmesh.ops.recalc_face_normals(self.bm, faces=list(faces))
        return verts

    def kopf_skalieren(self, faktor, pivot_z=1.556):
        kopf = KNOCHEN_NAMEN.index('Head')
        for v in self.bm.verts:
            if v[self.dl].get(kopf, 0.0) >= 0.6:
                v.co.z = pivot_z + (v.co.z - pivot_z) * faktor
                v.co.x *= faktor
                v.co.y *= faktor

    def uvs_setzen(self):
        for f in self.bm.faces:
            key = f.material_index
            if key == KOPF_KEY and f.normal.y < -0.15:
                for l in f.loops:
                    l[self.uv].uv = K.kopf_uv(l.vert.co.x, l.vert.co.z)
            else:
                u, v = K.zelle_uv('haut' if key == KOPF_KEY else K.PALETTE[key])
                for l in f.loops:
                    l[self.uv].uv = (u, v)
            f.material_index = 0
            f.smooth = True


def schluessel(k):
    if isinstance(k, str):
        return KOPF_KEY if k == 'kopf' else K.IDX[k]
    return k


def ering(z, rx, ry, cx=0.0, cy=0.0):
    return (V((cx, cy, z)), V((rx, 0, 0)), V((0, ry, 0)))


def achsring(mitte, richtung, r1, r2):
    """Ring senkrecht zu `richtung`; r1 = Halbmesser in der Körperebene (x/z), r2 = in Y."""
    d = richtung.normalized()
    a = V((0, 1, 0)).cross(d).normalized()  # liegt in der XZ-Ebene, senkrecht zu d
    return (mitte, a * r1, V((0, 1, 0)) * r2)


def lerp(a, b, t):
    return a + (b - a) * t


# ---------------------------------------------------------------------------
# Gewichte (steife Segmente, weiche Übergänge an den Gelenken)

def kette(wert, gelenke, halb, knochen):
    """`wert` wächst entlang der Kette; Gelenk i trennt knochen[i] von knochen[i+1] (Übergang ± halb[i])."""
    anteile = [glatt((wert - (g - h)) / (2 * h)) for g, h in zip(gelenke, halb)]
    out = {}
    vorher = 1.0
    for i, name in enumerate(knochen):
        nach = anteile[i] if i < len(anteile) else 0.0
        out[name] = vorher - nach
        vorher = nach
    return out


def gew_rumpf(co):
    w = kette(co.z, [1.04, 1.18, 1.32], [0.07, 0.06, 0.06], ['Hips', 'Spine', 'Chest', 'UpperChest'])
    oben = glatt((co.z - 1.44) / 0.08)
    if oben > 0:
        w = {k: v * (1 - oben) for k, v in w.items()}
        w['Neck'] = oben
    return w


def gew_hals(co):
    s = glatt((co.z - 1.49) / 0.07)
    u = glatt((1.5 - co.z) / 0.08)
    return {'UpperChest': u * 0.5, 'Neck': 1 - s - u * 0.5 if s < 1 else 0.0, 'Head': s}


def gew_kopf(co):
    s = glatt((1.585 - co.z) / 0.06)  # Kinn/Kiefer folgt etwas dem Hals
    return {'Head': 1 - s * 0.35, 'Neck': s * 0.35}


def gew_arm(sx):
    name = 'Left' if sx > 0 else 'Right'
    s0 = seite(SCHULTER, sx)
    d = seite(ARM_D, sx)

    def fn(co):
        t = (co - s0).dot(d)
        w = kette(t, [OBERARM, OBERARM + UNTERARM, OBERARM + UNTERARM + 0.09], [0.055, 0.04, 0.03], [f'{name}Arm', f'{name}ForeArm', f'{name}Hand', f'{name}HandIndex1'])
        sch = (1 - glatt(t / 0.10)) * 0.55  # Schulter: oberster Ärmel folgt dem Schlüsselbein
        if sch > 0:
            w = {k: v * (1 - sch) for k, v in w.items()}
            w[f'{name}Shoulder'] = sch
        return w
    return fn


def gew_bein(sx):
    name = 'Left' if sx > 0 else 'Right'

    def fn(co):
        a = glatt((0.50 + 0.07 - co.z) / 0.14)   # 0 = Oberschenkel, 1 = Unterschenkel (Knie bei z 0.50)
        b = glatt((0.115 + 0.06 - co.z) / 0.12)  # 0 = Unterschenkel, 1 = Fuß (Knöchel bei z ≈ 0.115)
        hueft = glatt((co.z - 0.90) / 0.08) * 0.5
        out = {f'{name}UpLeg': (1 - a) * (1 - hueft), 'Hips': (1 - a) * hueft, f'{name}Leg': a * (1 - b), f'{name}Foot': a * b}
        return out
    return fn


def gew_fuss(sx):
    name = 'Left' if sx > 0 else 'Right'

    def fn(co):
        zehe = glatt((-0.10 - co.y) / 0.07)
        bein = glatt((co.z - 0.17) / 0.12)
        return {f'{name}Leg': bein, f'{name}Foot': (1 - bein) * (1 - zehe), f'{name}Toes': (1 - bein) * zehe}
    return fn


# ---------------------------------------------------------------------------
# Körperteile

def baue_koerper():
    b = Baum()

    # --- Rumpf (Jacke; unten Hosenbund, Saum) ---------------------------------
    ringe = [
        ering(0.88, 0.150, 0.108), ering(0.94, 0.172, 0.118), ering(1.00, 0.174, 0.118), ering(1.06, 0.160, 0.112),
        ering(1.14, 0.170, 0.118), ering(1.24, 0.192, 0.130), ering(1.34, 0.206, 0.134), ering(1.41, 0.200, 0.126),
        ering(1.45, 0.150, 0.098), ering(1.48, 0.075, 0.075),
    ]
    keys = ['hose', 'jacke_dunkel', 'jacke', 'jacke', 'jacke', 'jacke', 'jacke', 'jacke', 'jacke_dunkel']
    v = b.loft(ringe, 12, keys, kappen=(True, True), start=0.0)
    b.gewichte(v, gew_rumpf)

    # Reißverschluss, Brusttaschen, Gürtel, Schnalle, Taschen
    v = b.quader(V((0, -0.131, 1.25)), (0.012, 0.012, 0.36), 'metall')
    b.gewichte(v, gew_rumpf)
    for sx in (-1, 1):
        v = b.quader(V((0.088 * sx, -0.128, 1.30)), (0.075, 0.016, 0.06), 'jacke_dunkel')
        b.gewichte(v, gew_rumpf)
        v = b.quader(V((0.176 * sx, -0.045, 1.01)), (0.05, 0.075, 0.06), 'guertel')  # Tasche an der Hüfte
        b.gewichte(v, gew_rumpf)
    belt = [ering(0.965, 0.181, 0.126), ering(0.995, 0.181, 0.126)]
    v = b.loft(belt, 12, 'guertel', kappen=(False, False))
    b.gewichte(v, gew_rumpf)
    v = b.quader(V((0, -0.127, 0.98)), (0.045, 0.014, 0.034), 'metall')
    b.gewichte(v, gew_rumpf)
    # Kragen (stehend) + Halstuch
    v = b.loft([ering(1.43, 0.112, 0.092), ering(1.47, 0.1, 0.082), ering(1.505, 0.094, 0.078)], 12, 'jacke_dunkel', kappen=(False, False))
    b.gewichte(v, gew_rumpf)

    # --- Hals ---------------------------------------------------------------------
    v = b.loft([ering(1.45, 0.054, 0.056), ering(1.5, 0.05, 0.052), ering(1.57, 0.048, 0.05)], 8, 'haut', kappen=(False, True))
    b.gewichte(v, gew_hals)
    v = b.loft([ering(1.495, 0.08, 0.08), ering(1.52, 0.072, 0.072), ering(1.552, 0.062, 0.062)], 10, 'tuch', kappen=(False, False))
    b.gewichte(v, gew_hals)
    v = b.quader(V((0, 0.088, 1.51)), (0.05, 0.03, 0.055), 'tuch', drehung=None)  # Knoten im Nacken
    b.gewichte(v, gew_hals)

    # --- Kopf -------------------------------------------------------------------------
    kopf = [
        (1.556, 0.040, 0.055, -0.045), (1.578, 0.072, 0.088, -0.032), (1.615, 0.094, 0.110, -0.015),
        (1.665, 0.104, 0.120, 0.0), (1.715, 0.106, 0.124, 0.0), (1.765, 0.101, 0.120, 0.004),
        (1.806, 0.082, 0.100, 0.010), (1.832, 0.044, 0.062, 0.012),
    ]
    ringe = [ering(z, rx, ry, 0.0, cy) for z, rx, ry, cy in kopf]
    v = b.loft(ringe, 12, 'kopf', kappen=(True, True), start=math.pi / 12 * 0 + 0.0)
    b.gewichte(v, gew_kopf)
    # Nase
    nase = [ering(1.704, 0.011, 0.012, 0.0, -0.108), ering(1.678, 0.016, 0.018, 0.0, -0.115), ering(1.656, 0.02, 0.016, 0.0, -0.119)]
    v = b.loft(nase, 6, 'kopf', kappen=(True, True), start=math.pi / 6)
    b.gewichte(v, gew_kopf)
    # Augenbrauenwulst, Ohren
    for sx in (-1, 1):
        v = b.quader(V((0.108 * sx, 0.006, 1.676)), (0.014, 0.028, 0.052), 'haut')
        b.gewichte(v, gew_kopf)

    # --- Arme + Hände ----------------------------------------------------------------------
    for sx in (-1, 1):
        s0, e0, h0, f0, f1 = (seite(p, sx) for p in (SCHULTER, ELLBOGEN, HANDGELENK, FINGER, FINGER_ENDE))
        d = seite(ARM_D, sx)
        R = 1.16  # Armstärke
        arm = [
            achsring(s0 - d * 0.02, d, 0.062 * R, 0.066 * R), achsring(lerp(s0, e0, 0.35), d, 0.056 * R, 0.058 * R),
            achsring(e0, d, 0.047 * R, 0.050 * R),
        ]
        v = b.loft(arm, 8, 'jacke', kappen=(True, False))
        b.gewichte(v, gew_arm(sx))
        unter = [achsring(e0, d, 0.048 * R, 0.050 * R), achsring(lerp(e0, h0, 0.55), d, 0.042 * R, 0.044 * R), achsring(lerp(e0, h0, 0.88), d, 0.038 * R, 0.040 * R),
                 achsring(h0 - d * 0.005, d, 0.040 * R, 0.042 * R), achsring(h0 + d * 0.03, d, 0.038 * R, 0.040 * R)]
        v = b.loft(unter, 8, ['jacke', 'jacke', 'jacke_dunkel', 'handschuh'], kappen=(False, False))
        b.gewichte(v, gew_arm(sx))
        # Hand: Handteller + Finger (Fäustling mit angedeutetem Daumen)
        hand = [achsring(h0 + d * 0.015, d, 0.034, 0.045), achsring(lerp(h0, f0, 0.55), d, 0.03, 0.05), achsring(f0, d, 0.03, 0.05)]
        v = b.loft(hand, 8, 'handschuh', kappen=(False, False))
        b.gewichte(v, gew_arm(sx))
        finger = [achsring(f0, d, 0.029, 0.049), achsring(lerp(f0, f1, 0.5), d, 0.027, 0.046), achsring(f1, d, 0.02, 0.036)]
        v = b.loft(finger, 8, 'handschuh', kappen=(False, True))
        b.gewichte(v, gew_arm(sx))
        daumen = [achsring(lerp(h0, f0, 0.3) + V((0, -0.04, 0)), d, 0.016, 0.019), achsring(lerp(h0, f0, 0.9) + V((0, -0.058, -0.012)), d, 0.012, 0.015)]
        v = b.loft(daumen, 6, 'handschuh', kappen=(True, True))
        b.gewichte(v, gew_arm(sx))
        # Ellbogenschützer
        v = b.quader(e0 + V((0.0, 0.052, 0.0)), (0.085, 0.03, 0.085), 'jacke_dunkel')
        b.gewichte(v, gew_arm(sx))

    # --- Beine + Stiefel ---------------------------------------------------------------------
    for sx in (-1, 1):
        c = BEIN_X * sx
        T = 1.1
        schenkel = [
            ering(0.97, 0.094 * T, 0.098 * T, c * 1.02, 0.0), ering(0.86, 0.09 * T, 0.094 * T, c * 1.03, -0.002), ering(0.72, 0.079 * T, 0.083 * T, c * 1.03, -0.004),
            ering(0.58, 0.067 * T, 0.069 * T, c * 1.01, -0.006), ering(0.51, 0.061 * T, 0.064 * T, c, -0.006),
        ]
        v = b.loft(schenkel, 8, 'hose', kappen=(True, False))
        b.gewichte(v, gew_bein(sx))
        schiene = [ering(0.51, 0.062 * T, 0.065 * T, c, -0.006), ering(0.40, 0.056 * T, 0.059 * T, c, -0.003), ering(0.29, 0.051 * T, 0.054 * T, c, 0.0), ering(0.19, 0.049 * T, 0.052 * T, c, 0.0)]
        v = b.loft(schiene, 8, 'hose', kappen=(False, False))
        b.gewichte(v, gew_bein(sx))
        # Cargo-Tasche außen am Oberschenkel, Knieschoner, Hosenband
        v = b.quader(V(((BEIN_X + 0.098) * sx, -0.008, 0.70)), (0.034, 0.08, 0.115), 'hose_dunkel')
        b.gewichte(v, gew_bein(sx))
        v = b.quader(V((c, -0.075, 0.505)), (0.1, 0.034, 0.1), 'jacke_dunkel')
        b.gewichte(v, gew_bein(sx))
        # Stiefelschaft
        schaft = [ering(0.285, 0.062, 0.064, c, 0.0), ering(0.21, 0.06, 0.063, c, 0.0), ering(0.12, 0.058, 0.06, c, 0.0)]
        v = b.loft(schaft, 8, 'stiefel', kappen=(False, False))
        b.gewichte(v, gew_fuss(sx))
        # Stiefelfuß: Ringe quer zur Länge (Ebene x/z), von der Ferse (+y) zur Spitze (-y)
        fuss = [
            (V((c, 0.075, 0.075)), V((0.050, 0, 0)), V((0, 0, 0.060))), (V((c, 0.01, 0.062)), V((0.054, 0, 0)), V((0, 0, 0.060))),
            (V((c, -0.075, 0.048)), V((0.058, 0, 0)), V((0, 0, 0.046))), (V((c, -0.155, 0.040)), V((0.056, 0, 0)), V((0, 0, 0.037))),
            (V((c, -0.225, 0.033)), V((0.042, 0, 0)), V((0, 0, 0.028))),
        ]
        v = b.loft(fuss, 8, 'stiefel', kappen=(True, True))
        b.gewichte(v, gew_fuss(sx))
        v = b.quader(V((c, -0.075, 0.014)), (0.122, 0.30, 0.028), 'sohle')
        b.gewichte(v, gew_fuss(sx))
    return b


def baue_haare(variante):
    b = Baum()

    def haarlinie(a):  # Winkel a (0 = links, 270° = vorn) → unterste Höhe der Haare
        s = math.sin(a)
        if variante == 'mann':
            return 1.705 + (-s) * 0.052 if s < 0 else 1.705 - s * 0.085
        return 1.70 + (-s) * 0.062 if s < 0 else 1.70 - s * 0.10

    kopf = [(1.6, 0.098, 0.113, -0.012), (1.665, 0.104, 0.120, 0.0), (1.715, 0.106, 0.124, 0.0), (1.765, 0.101, 0.120, 0.004),
            (1.806, 0.082, 0.100, 0.010), (1.835, 0.050, 0.070, 0.012), (1.85, 0.015, 0.03, 0.012)]
    n = 14
    reihen = []
    for z, rx, ry, cy in kopf:
        reihe = []
        for k in range(n):
            a = 2 * math.pi * k / n
            zz = max(z, haarlinie(a) + (0.011 if k % 2 else -0.004) * clamp(-math.sin(a) + 0.4))
            reihe.append(b.bm.verts.new(V(((rx + 0.014) * math.cos(a), cy + (ry + 0.014) * math.sin(a), zz))))
        reihen.append(reihe)
    flaechen = []
    for r in range(len(reihen) - 1):
        for k in range(n):
            vs = (reihen[r][k], reihen[r][(k + 1) % n], reihen[r + 1][(k + 1) % n], reihen[r + 1][k])
            if len({id(x) for x in vs}) < 4:
                continue
            try:
                f = b.bm.faces.new(vs)
            except ValueError:
                continue
            f.material_index = K.IDX['haar_hell'] if (k * 7 + r * 3) % 11 == 0 and r >= 2 else K.IDX['haar']
            flaechen.append(f)
    c = b.bm.verts.new(V((0, 0.012, 1.858)))
    for k in range(n):
        f = b.bm.faces.new((reihen[-1][k], reihen[-1][(k + 1) % n], c))
        f.material_index = K.IDX['haar']
        flaechen.append(f)
    bmesh.ops.recalc_face_normals(b.bm, faces=flaechen)
    verts = [v for r in reihen for v in r] + [c]
    if variante == 'mann':
        pass
    else:
        # Pferdeschwanz + Haargummi
        zopf = [(V((0, 0.105, 1.73)), 0.040), (V((0, 0.152, 1.66)), 0.046), (V((0, 0.168, 1.54)), 0.044), (V((0, 0.158, 1.42)), 0.036), (V((0, 0.14, 1.32)), 0.02)]
        ringe = [(c0, V((r, 0, 0)), V((0, r * 0.9, 0))) for c0, r in zopf]
        # leicht geneigte Ringe: Achsen in der Ebene senkrecht zum Verlauf
        ringe = []
        for i, (c0, r) in enumerate(zopf):
            nxt = zopf[min(i + 1, len(zopf) - 1)][0]
            prv = zopf[max(i - 1, 0)][0]
            ringe.append(achsring(c0, (nxt - prv), r, r * 0.9))
        verts += b.loft(ringe, 8, ['haar', 'haar_hell', 'haar', 'haar'], kappen=(True, True))
        verts += b.loft([achsring(V((0, 0.118, 1.715)), V((0, 0.5, -0.5)), 0.047, 0.05), achsring(V((0, 0.126, 1.7)), V((0, 0.5, -0.5)), 0.047, 0.05)], 8, 'tuch', kappen=(False, False))
        for sx in (-1, 1):  # Strähnen an den Seiten
            verts += b.quader(V((0.1 * sx, -0.02, 1.62)), (0.022, 0.05, 0.1), 'haar')
    b.gewichte(verts, lambda co: {'Head': 1.0 - 0.7 * glatt((1.55 - co.z) / 0.25), 'Neck': 0.7 * glatt((1.55 - co.z) / 0.25)} if co.z < 1.55 else {'Head': 1.0})
    return b


# ---------------------------------------------------------------------------
# Szene

def leere_szene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    return bpy.context.scene


def mesh_objekt(name, baum, armatur):
    baum.uvs_setzen()
    baum.kopf_skalieren(KOPF_SKALA)
    mesh = bpy.data.meshes.new(name)
    baum.bm.to_mesh(mesh)
    baum.bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    for n in KNOCHEN_NAMEN:
        obj.vertex_groups.new(name=n)
    mesh.update()
    # Kanten nach Winkel teilen (Low-Poly-Look an den Kanten, glatt an runden Flächen)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    mod = obj.modifiers.new('es', 'EDGE_SPLIT')
    mod.split_angle = math.radians(38)
    bpy.ops.object.modifier_apply(modifier='es')
    obj.select_set(False)
    obj.parent = armatur
    am = obj.modifiers.new('Armature', 'ARMATURE')
    am.object = armatur
    mat = material()
    obj.data.materials.append(mat)
    return obj


def material():
    if 'Survivor' in bpy.data.materials:
        return bpy.data.materials['Survivor']
    mat = bpy.data.materials.new('Survivor')
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    bsdf = nodes.get('Principled BSDF')
    tex = nodes.new('ShaderNodeTexImage')
    tex.image = bpy.data.images.load(ATLAS_MANN)
    tex.interpolation = 'Linear'
    mat.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.8
    return mat


def baue_armatur():
    data = bpy.data.armatures.new('SurvivorRig')
    obj = bpy.data.objects.new('Armature', data)
    bpy.context.scene.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    knochen = {}
    for name, kopf, schwanz, eltern in KNOCHEN:
        eb = data.edit_bones.new(name)
        eb.head, eb.tail = kopf, schwanz
        knochen[name] = eb
    for name, kopf, schwanz, eltern in KNOCHEN:
        if eltern:
            knochen[name].parent = knochen[eltern]
    bpy.ops.object.mode_set(mode='OBJECT')
    obj.select_set(False)
    return obj


def baue_alles():
    leere_szene()
    arm = baue_armatur()
    koerper = mesh_objekt('Survivor_Koerper', baue_koerper(), arm)
    mann = mesh_objekt('Haar_Mann', baue_haare('mann'), arm)
    frau = mesh_objekt('Haar_Frau', baue_haare('frau'), arm)
    return arm, [koerper, mann, frau]


# ---------------------------------------------------------------------------
# Vorschau-Bilder (Workbench)

def vorschau_rendern(ordner, ansichten, praefix='vorschau', frame=None):
    os.makedirs(ordner, exist_ok=True)
    sz = bpy.context.scene
    sz.render.engine = 'BLENDER_WORKBENCH'
    sh = sz.display.shading
    sh.light, sh.color_type, sh.show_shadows, sh.show_cavity = 'STUDIO', 'TEXTURE', False, False
    sz.render.film_transparent = False
    sz.world = bpy.data.worlds.new('w')
    sz.world.color = (0.55, 0.62, 0.7)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    sz.collection.objects.link(cam)
    sz.camera = cam
    for name, ort, ziel, orth in ansichten:
        cam.location = V(ort)
        cam.data.type = 'ORTHO'
        cam.data.ortho_scale = orth
        cam.rotation_euler = (V(ziel) - V(ort)).to_track_quat('-Z', 'Y').to_euler()
        sz.render.resolution_x, sz.render.resolution_y = (640, 800) if orth > 1.0 else (640, 640)
        sz.render.filepath = os.path.join(ordner, f'{praefix}_{name}.png')
        bpy.ops.render.render(write_still=True)


POSEN_ANSICHTEN = [
    ('seite', (6, 0, 0.95), (0, 0, 0.95), 2.4),
    ('dreiviertel', (3.6, -4.2, 1.7), (0, 0, 0.85), 2.4),
]
RIG = None
ANSICHTEN = [
    ('vorn', (0, -6, 0.95), (0, 0, 0.95), 2.2),
    ('seite', (6, 0, 0.95), (0, 0, 0.95), 2.2),
    ('hinten', (0, 6, 0.95), (0, 0, 0.95), 2.2),
    ('dreiviertel', (3.2, -4.2, 1.9), (0, 0, 0.9), 2.2),
    ('kopf', (0.9, -1.8, 1.8), (0, 0, 1.69), 0.6),
]


def hauptprogramm():
    arm, objekte = baue_alles()
    global RIG
    import survivor_animation as anim  # noqa: E402
    RIG = anim.baue_animationen(arm)
    ordner = argument('--vorschau')
    posen = argument('--posen')
    if posen and anim:
        os.makedirs(ordner, exist_ok=True)
        for o in objekte:
            o.hide_render = o.name == 'Haar_Frau'
        for eintrag in posen.split(';'):
            klip, bilder = eintrag.split(':')
            for bild in bilder.split(','):
                anim.setze_pose(RIG, klip, int(bild))
                vorschau_rendern(ordner, [a for a in POSEN_ANSICHTEN], praefix=f'{klip}_{int(bild):02d}')
        return
    if ordner:
        for o in objekte:
            if o.name == 'Haar_Frau':
                o.hide_render = True
        vorschau_rendern(ordner, ANSICHTEN)
    if '--ohne-export' not in ARGV:
        os.makedirs(os.path.dirname(AUSGABE_GLB), exist_ok=True)
        bpy.ops.export_scene.gltf(
            filepath=AUSGABE_GLB, export_format='GLB', export_image_format='NONE', export_materials='EXPORT',
            export_animations=True, export_skins=True, export_cameras=False, export_lights=False, export_yup=True,
        )
        print('GLB geschrieben:', AUSGABE_GLB, os.path.getsize(AUSGABE_GLB), 'Bytes')


hauptprogramm()

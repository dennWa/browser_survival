"""Animationen des Survivors (werden in survivor_bauen.py nach dem Skelett erzeugt).

Clips: stehen (Idle), joggen, rennen (Sprint), hacken (beidhändiger Axtschlag, Arme per Zwei-Knochen-IK), sterben (einmalig).
Alle Bewegungen sind in Weltachsen formuliert und werden in Knochen-Basis umgerechnet:
    Basis B = R⁻¹ · d · R   (R = Ruhe-Ausrichtung des Knochens im Skelett-Raum, d = Drehung relativ zum Elternknochen in Weltachsen)
Vorzeichen (Figur schaut nach -Y, Z oben):  Drehung um +X → hängende Gliedmaßen schwingen nach HINTEN, Rumpf kippt nach VORN.
"""
import math

import bpy
from mathutils import Matrix, Quaternion, Vector

FPS = 30
V = Vector
X, Y, Z = V((1, 0, 0)), V((0, 1, 0)), V((0, 0, 1))


def rx(a):
    return Quaternion(X, a)


def ry(a):
    return Quaternion(Y, a)


def rz(a):
    return Quaternion(Z, a)


def vor(a):
    """Hängendes Glied (Bein/Arm) nach vorn schwingen."""
    return rx(-a)


def kippe_vor(a):
    """Rumpf/Kopf nach vorn neigen."""
    return rx(a)


# ---------------------------------------------------------------------------
# Kurven

def kurve(tabelle, t, periode=None):
    """Kubische Hermite-Interpolation durch [(zeit, wert)] (Catmull-Rom-Tangenten); `periode` = nahtlose Schleife."""
    punkte = list(tabelle)
    if periode:
        punkte = [(z - periode, w) for z, w in tabelle[:-1]] + punkte[:-1] + [(z + periode, w) for z, w in tabelle[:-1]] + [(tabelle[-1][0] + periode, tabelle[0][1])]
        punkte.sort()
        # (letzter Punkt der Schleife ist gleich dem ersten und wurde oben nur einmal gebraucht)
    if t <= punkte[0][0]:
        return punkte[0][1]
    if t >= punkte[-1][0]:
        return punkte[-1][1]
    for i in range(len(punkte) - 1):
        t0, v0 = punkte[i]
        t1, v1 = punkte[i + 1]
        if t0 <= t <= t1:
            vorher = punkte[i - 1] if i > 0 else (t0, v0)
            nachher = punkte[i + 2] if i + 2 < len(punkte) else (t1, v1)
            m0 = (v1 - vorher[1]) / max(1e-6, t1 - vorher[0]) if i > 0 else 0.0
            m1 = (nachher[1] - v0) / max(1e-6, nachher[0] - t0) if i + 2 < len(punkte) else 0.0
            h = t1 - t0
            s = (t - t0) / h
            return ((2 * s ** 3 - 3 * s ** 2 + 1) * v0 + (s ** 3 - 2 * s ** 2 + s) * h * m0 + (-2 * s ** 3 + 3 * s ** 2) * v1 + (s ** 3 - s ** 2) * h * m1)
    return punkte[-1][1]


# ---------------------------------------------------------------------------
# Pose setzen

class Rig:
    def __init__(self, arm):
        self.arm = arm
        self.pb = arm.pose.bones
        self.R = {b.name: b.bone.matrix_local.to_3x3() for b in self.pb}
        self.qR = {n: m.to_quaternion() for n, m in self.R.items()}
        for b in self.pb:
            b.rotation_mode = 'QUATERNION'
        ad = arm.animation_data_create()
        self.ad = ad
        self.puffer = []

    def zuruecksetzen(self):
        for b in self.pb:
            b.rotation_quaternion = Quaternion((1, 0, 0, 0))
            b.location = V((0, 0, 0))

    def drehe(self, name, d):
        """d = Drehung relativ zum Elternknochen in Weltachsen (Quaternion)."""
        q = self.qR[name]
        self.pb[name].rotation_quaternion = q.inverted() @ d @ q

    def verschiebe(self, name, offset):
        self.pb[name].location = self.R[name].inverted() @ offset

    def aktualisiere(self):
        bpy.context.view_layer.update()

    def schluessel(self, bild):
        """Pose merken (Keyframes entstehen erst in abschliessen(): solange eine Aktion zugewiesen ist, würde jedes view_layer.update() die Pose überschreiben)."""
        self.puffer.append((bild, {b.name: (b.rotation_quaternion.copy(), b.location.copy()) for b in self.pb}))

    # --- Zwei-Knochen-IK für Arme ------------------------------------------------------
    def ziele_arm(self, seite, ziel, pol):
        """Arm `seite` ('Left'/'Right') so beugen, dass die Hand (Gelenkposition RightHand/LeftHand) bei `ziel` landet; `pol` = Richtung, in die der Ellbogen zeigt."""
        arm, fore, hand = self.pb[f'{seite}Arm'], self.pb[f'{seite}ForeArm'], self.pb[f'{seite}Hand']
        s = arm.head.copy()
        l1 = (fore.bone.head_local - arm.bone.head_local).length
        l2 = (hand.bone.head_local - fore.bone.head_local).length
        zu = ziel - s
        d = min(zu.length, (l1 + l2) * 0.999)
        u = zu.normalized()
        a = (l1 * l1 - l2 * l2 + d * d) / (2 * d)
        hoehe = math.sqrt(max(l1 * l1 - a * a, 0.0))
        p = (pol - u * pol.dot(u)).normalized()
        ellbogen = s + u * a + p * hoehe
        self._ziele(arm, ellbogen - s)
        self.aktualisiere()
        e = fore.head.copy()
        self._ziele(fore, (s + u * d) - e)
        self.aktualisiere()

    def _ziele(self, pb, richtung):
        """Knochen so drehen, dass seine Y-Achse in `richtung` zeigt (Kopfposition bleibt)."""
        m = pb.matrix.copy()
        aktuell = (m.to_3x3() @ Y).normalized()
        diff = aktuell.rotation_difference(richtung.normalized())
        neu = diff.to_matrix().to_4x4() @ m
        neu.translation = m.translation
        pb.matrix = neu


# ---------------------------------------------------------------------------
# Laufzyklen (FK)

def zyklus_pose(r, ph, p):
    """Eine Laufpose bei Phase ph (rad). p = Parameter-Dict."""
    r.zuruecksetzen()
    lean = p['lean']
    hueft_gier = -p['dreh'] * math.sin(ph)
    # Becken
    r.drehe('Hips', rz(hueft_gier) @ ry(0.04 * math.sin(ph)))
    r.verschiebe('Hips', V((0.012 * math.sin(ph), 0, -p['bob'] * math.cos(2 * ph) - p['tief'])))
    # Rumpf: Neigung + Gegendrehung
    gier = p['dreh'] * 1.6 * math.sin(ph)
    for n, anteil in (('Spine', 0.35), ('Chest', 0.35), ('UpperChest', 0.30)):
        r.drehe(n, kippe_vor(lean * anteil) @ rz(gier * anteil))
    r.drehe('Neck', kippe_vor(-lean * 0.35) @ rz(-gier * 0.35))
    r.drehe('Head', kippe_vor(-lean * 0.6 - 0.02) @ rz(-gier * 0.3))
    for seite, ph_b, sx in (('Left', ph, 1), ('Right', ph + math.pi, -1)):
        hip = p['hueft'] * math.sin(ph_b)
        knie = p['knie0'] + p['knie_schwung'] * max(0.0, math.cos(ph_b - 0.3)) ** 1.3 + p['knie_stand'] * max(0.0, -math.cos(ph_b))
        fuss = 0.4 * max(0.0, -math.sin(ph_b + 0.6)) - 0.08
        r.drehe(f'{seite}UpLeg', vor(hip) @ ry(sx * -0.03))
        r.drehe(f'{seite}Leg', vor(-knie))
        r.drehe(f'{seite}Foot', rx(fuss + hip - knie))
        # Arme gegenläufig zum gleichseitigen Bein
        arm = -p['arm'] * math.sin(ph_b)
        r.drehe(f'{seite}Shoulder', rz(-sx * 0.0))
        r.drehe(f'{seite}Arm', vor(arm) @ ry(sx * p['arm_innen']))
        r.drehe(f'{seite}ForeArm', vor(p['ellbogen'] + 0.12 * math.sin(ph_b + 1.0)))
        r.drehe(f'{seite}Hand', rx(0.0))
    r.aktualisiere()


JOGGEN = dict(frames=24, lean=0.14, dreh=0.10, bob=0.022, tief=0.025, hueft=0.52, knie0=0.26, knie_schwung=1.1, knie_stand=0.18, arm=0.50, arm_innen=0.35, ellbogen=1.25)
RENNEN = dict(frames=18, lean=0.30, dreh=0.14, bob=0.035, tief=0.05, hueft=0.84, knie0=0.36, knie_schwung=1.6, knie_stand=0.22, arm=0.85, arm_innen=0.42, ellbogen=1.6)


def klip_laufen(r, name, p):
    neue_aktion(r, name)
    n = p['frames']
    for f in range(n + 1):
        zyklus_pose(r, 2 * math.pi * f / n, p)
        r.schluessel(f + 1)
    return abschliessen(r, name)


def klip_stehen(r):
    neue_aktion(r, 'stehen')
    n = 90
    for f in range(n + 1):
        t = 2 * math.pi * f / n
        r.zuruecksetzen()
        atem = math.sin(t)
        r.verschiebe('Hips', V((0.003 * math.sin(t), 0, -0.004 * (1 - math.cos(t)) * 0.5)))
        r.drehe('Hips', rz(0.015 * math.sin(t)))
        r.drehe('Spine', kippe_vor(0.012 * atem))
        r.drehe('Chest', kippe_vor(0.018 * atem))
        r.drehe('UpperChest', kippe_vor(0.012 * atem))
        r.drehe('Neck', kippe_vor(-0.02 * atem))
        r.drehe('Head', rz(0.07 * math.sin(t)) @ kippe_vor(0.01 * math.sin(2 * t)))
        for seite, sx in (('Left', 1), ('Right', -1)):
            r.drehe(f'{seite}Shoulder', rz(0.0))
            r.drehe(f'{seite}Arm', vor(0.025 * math.sin(t + 0.6 * sx)) @ ry(-sx * 0.015 * atem))
            r.drehe(f'{seite}ForeArm', vor(0.2 + 0.03 * atem))
            r.drehe(f'{seite}UpLeg', ry(sx * 0.02))
        r.aktualisiere()
        r.schluessel(f + 1)
    return abschliessen(r, 'stehen')


# ---------------------------------------------------------------------------
# Hacken (Arme per IK)

# Schlüsselbilder: (Bild, Wert). Länge 26 Bilder = 0,87 s, nahtlos.
HACK_N = 26
HACK = dict(
    neigung=[(0, 0.18), (9, -0.16), (12, 0.30), (14, 0.52), (17, 0.46), (26, 0.18)],
    vor=[(0, 0.0), (9, -0.05), (12, 0.06), (14, 0.10), (17, 0.09), (26, 0.0)],        # Becken nach vorn (m)
    knie=[(0, 0.30), (9, 0.18), (13, 0.62), (17, 0.66), (26, 0.30)],
    kopf=[(0, -0.08), (9, 0.12), (13, -0.28), (17, -0.26), (26, -0.08)],
    # obere Hand (rechts, Meter: rechts / vorn / oben) und Neigung des Stiels (Grad über Waagerechter, 0 = nach vorn)
    hand_r=[(0, 0.10), (9, 0.14), (12, 0.12), (14, 0.10), (17, 0.10), (26, 0.10)],
    hand_f=[(0, 0.40), (9, -0.08), (11, 0.22), (14, 0.50), (17, 0.50), (26, 0.40)],
    hand_u=[(0, 1.20), (9, 1.90), (11, 1.74), (14, 1.04), (17, 1.04), (26, 1.20)],
    stiel=[(0, 55), (9, 135), (11, 70), (14, -38), (17, -38), (26, 55)],
)
GRIFF = 0.18  # Abstand der Hände am Stiel (m)


def hack_pose(r, f):
    r.zuruecksetzen()
    k = lambda name: kurve(HACK[name], f, HACK_N)
    neigung = k('neigung')
    kniebeuge = k('knie')
    # Stand: links vorn, rechts hinten
    r.drehe('Hips', rz(-0.1 - 0.15 * math.sin(math.pi * min(1.0, f / 14.0))))
    r.verschiebe('Hips', V((0.0, -k('vor'), -0.14 * (1 - math.cos(kniebeuge)) * 1.4)))
    for n, a in (('Spine', 0.35), ('Chest', 0.35), ('UpperChest', 0.30)):
        r.drehe(n, kippe_vor(neigung * a))
    r.drehe('Neck', kippe_vor(-neigung * 0.2))
    r.drehe('Head', kippe_vor(k('kopf') - neigung * 0.3))
    for seite, sx, hip in (('Left', 1, 0.42), ('Right', -1, -0.30)):
        knie = kniebeuge * (1.0 if sx > 0 else 0.8) + 0.1
        r.drehe(f'{seite}UpLeg', vor(hip + 0.18 * kniebeuge) @ ry(sx * -0.18))
        r.drehe(f'{seite}Leg', vor(-knie))
        r.drehe(f'{seite}Foot', vor(-(hip + 0.18 * kniebeuge - knie)) @ ry(sx * 0.12))
        r.drehe(f'{seite}Shoulder', rz(0.0))
    r.aktualisiere()
    # Hände: obere (rechte) Hand am Stielende, untere (linke) um GRIFF zum Körper hin
    alpha = math.radians(k('stiel'))
    h = V((0.0, -math.cos(alpha), math.sin(alpha)))  # Richtung vom Körper weg/oben = Axtkopf-Richtung (Welt: vorn = -Y)
    hips_vor = k('vor')
    p_oben = V((-k('hand_r'), -(k('hand_f')) - 0.0, k('hand_u')))
    p_unten = p_oben - h * GRIFF + V((0.07, 0.0, 0.0))
    r.ziele_arm('Right', p_oben, V((-0.5, 0.35, -0.9)))
    r.ziele_arm('Left', p_unten, V((0.7, 0.2, -0.9)))
    r.aktualisiere()


def klip_hacken(r):
    neue_aktion(r, 'hacken')
    for f in range(HACK_N + 1):
        hack_pose(r, f)
        r.schluessel(f + 1)
    return abschliessen(r, 'hacken')


# ---------------------------------------------------------------------------
# Sterben

STERBEN_N = 44
STERBEN = dict(
    hueft_dreh=[(0, 0.0), (5, 0.13), (12, 0.32), (22, 1.0), (30, 1.60), (34, 1.50), (40, 1.57), (44, 1.57)],  # Kippen nach hinten
    hueft_hinten=[(0, 0.0), (12, 0.12), (22, 0.18), (44, 0.2)],
    hueft_runter=[(0, 0.0), (5, 0.015), (12, 0.20), (22, 0.58), (30, 0.80), (34, 0.78), (44, 0.80)],
    rumpf=[(0, 0.0), (5, -0.38), (12, 0.12), (22, -0.25), (30, -0.12), (44, 0.0)],
    kopf=[(0, 0.0), (5, -0.35), (12, 0.25), (22, 0.40), (30, -0.15), (36, 0.1), (44, 0.1)],
    knie_l=[(0, 0.05), (5, 0.2), (12, 1.25), (22, 1.0), (30, 0.3), (44, 0.28)],
    knie_r=[(0, 0.05), (5, 0.2), (12, 1.3), (22, 1.1), (30, 0.8), (44, 0.95)],
    hueft_l=[(0, 0.0), (12, 0.6), (22, 0.4), (30, 0.1), (44, 0.1)],
    hueft_r=[(0, 0.0), (12, 0.7), (22, 0.5), (30, 0.5), (44, 0.65)],
    arm_vor=[(0, 0.0), (5, -0.5), (12, 0.6), (22, 1.5), (30, -0.2), (44, -0.15)],
    arm_aus=[(0, 0.0), (5, 0.9), (12, 0.5), (22, 0.8), (30, 1.35), (44, 1.3)],
    ellbogen=[(0, 0.2), (5, 0.3), (12, 0.8), (22, 0.5), (30, 0.4), (44, 0.35)],
)


def sterben_pose(r, f):
    r.zuruecksetzen()
    k = lambda name: kurve(STERBEN[name], f)
    r.drehe('Hips', rx(-k('hueft_dreh')) @ rz(0.0))
    r.verschiebe('Hips', V((0.0, k('hueft_hinten'), -k('hueft_runter'))))
    rump = k('rumpf')
    for n, a in (('Spine', 0.35), ('Chest', 0.35), ('UpperChest', 0.30)):
        r.drehe(n, kippe_vor(rump * a))
    r.drehe('Neck', kippe_vor(k('kopf') * 0.4) @ rz(0.1))
    r.drehe('Head', kippe_vor(k('kopf') * 0.6) @ rz(0.2 if f > 28 else 0.0))
    for seite, sx in (('Left', 1), ('Right', -1)):
        knie = k('knie_l') if sx > 0 else k('knie_r')
        hip = k('hueft_l') if sx > 0 else k('hueft_r')
        r.drehe(f'{seite}UpLeg', vor(hip) @ ry(sx * -0.12))
        r.drehe(f'{seite}Leg', vor(-knie))
        r.drehe(f'{seite}Arm', vor(k('arm_vor') * (1 if sx > 0 else 0.8)) @ ry(-sx * k('arm_aus') * (1 if sx > 0 else 1.1)))
        r.drehe(f'{seite}ForeArm', vor(k('ellbogen')))
    r.aktualisiere()


def klip_sterben(r):
    neue_aktion(r, 'sterben')
    for f in range(STERBEN_N + 1):
        sterben_pose(r, f)
        r.schluessel(f + 1)
    return abschliessen(r, 'sterben')


# ---------------------------------------------------------------------------

def neue_aktion(r, name):
    r.puffer = []
    r.ad.action = None
    return name


def abschliessen(r, name):
    """Gemerkte Posen als Aktion mit Keyframes ablegen."""
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    r.ad.action = act
    for bild, pose in r.puffer:
        for b in r.pb:
            q, loc = pose[b.name]
            b.rotation_quaternion = q
            b.keyframe_insert('rotation_quaternion', frame=bild)
            if b.name == 'Hips':
                b.location = loc
                b.keyframe_insert('location', frame=bild)
    r.ad.action = None
    r.puffer = []
    return act


def baue_animationen(arm):
    r = Rig(arm)
    aktionen = {}
    aktionen['stehen'] = klip_stehen(r)
    aktionen['joggen'] = klip_laufen(r, 'joggen', JOGGEN)
    aktionen['rennen'] = klip_laufen(r, 'rennen', RENNEN)
    aktionen['hacken'] = klip_hacken(r)
    aktionen['sterben'] = klip_sterben(r)
    r.zuruecksetzen()
    # Aktionen in NLA-Spuren legen (so exportiert der glTF-Exporter jede als eigenen Clip)
    r.ad.action = None
    for name, act in aktionen.items():
        spur = r.ad.nla_tracks.new()
        spur.name = name
        streifen = spur.strips.new(name, 1, act)
        streifen.name = name
    r.aktionen = aktionen
    r.zuruecksetzen()
    return r


def zeige(r, name, bild):
    """Vorschau: Pose `name` bei Bild (1-basiert) einstellen."""
    r.zuruecksetzen()
    for spur in r.ad.nla_tracks:
        spur.mute = spur.name != name
    bpy.context.scene.frame_set(bild)
    r.aktualisiere()


def setze_pose(r, klip, bild):
    """Vorschau: Pose `klip` bei Bild einstellen (ohne Keyframes)."""
    for spur in r.ad.nla_tracks:
        spur.mute = True
    r.ad.action = None
    if klip in ('joggen', 'rennen'):
        p = JOGGEN if klip == 'joggen' else RENNEN
        zyklus_pose(r, 2 * math.pi * bild / p['frames'], p)
    elif klip == 'hacken':
        hack_pose(r, bild)
    elif klip == 'sterben':
        sterben_pose(r, bild)
    else:
        r.zuruecksetzen()
        r.aktualisiere()
